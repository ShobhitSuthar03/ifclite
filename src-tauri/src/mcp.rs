use hex::encode;
use parking_lot::Mutex;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::BTreeSet;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

pub struct McpHost {
    child: Mutex<Option<Child>>,
}

impl Default for McpHost {
    fn default() -> Self {
        Self {
            child: Mutex::new(None),
        }
    }
}

impl McpHost {
    pub fn kill(&self) {
        let mut slot = self.child.lock();
        if let Some(mut child) = slot.take() {
            kill_process_tree(child.id());
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

impl Drop for McpHost {
    fn drop(&mut self) {
        self.kill();
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpStartResult {
    pub port: u16,
    pub sync_port: u16,
    pub token: String,
    pub url: String,
    pub pid: u32,
}

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..")
}

fn make_token() -> String {
    let mut hasher = Sha256::new();
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    hasher.update(now.to_le_bytes());
    hasher.update(std::process::id().to_le_bytes());
    encode(&hasher.finalize()[..16])
}

fn push_opt(cmd: &mut Command, flag: &str, value: &Option<String>) {
    if let Some(path) = value {
        if !path.is_empty() {
            cmd.arg(flag).arg(path);
        }
    }
}

fn hide_window(cmd: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
}

fn kill_process_tree(pid: u32) {
    #[cfg(windows)]
    {
        let mut cmd = Command::new("taskkill");
        cmd.args(["/PID", &pid.to_string(), "/T", "/F"]);
        hide_window(&mut cmd);
        let _ = cmd.status();
    }
    #[cfg(not(windows))]
    {
        let _ = Command::new("kill")
            .args(["-TERM", &pid.to_string()])
            .status();
    }
}

#[cfg(windows)]
fn line_listens_on(line: &str, port: u16) -> bool {
    let needle = format!(":{port}");
    line.split_whitespace().any(|col| {
        col == needle
            || col
                .rsplit_once(':')
                .is_some_and(|(_, value)| value == port.to_string())
    })
}

fn pids_listening_on(port: u16) -> BTreeSet<u32> {
    let mut pids = BTreeSet::new();
    #[cfg(windows)]
    {
        let mut cmd = Command::new("netstat");
        cmd.args(["-ano"]);
        hide_window(&mut cmd);
        let Ok(output) = cmd.output() else {
            return pids;
        };
        let text = String::from_utf8_lossy(&output.stdout);
        for line in text.lines() {
            if !line.to_ascii_uppercase().contains("LISTENING") {
                continue;
            }
            if !line_listens_on(line, port) {
                continue;
            }
            if let Some(pid) = line.split_whitespace().last().and_then(|value| value.parse().ok()) {
                if pid > 0 {
                    pids.insert(pid);
                }
            }
        }
    }
    #[cfg(not(windows))]
    {
        if let Ok(output) = Command::new("lsof")
            .args(["-t", &format!("-iTCP:{port}"), "-sTCP:LISTEN"])
            .output()
        {
            let text = String::from_utf8_lossy(&output.stdout);
            for line in text.lines() {
                if let Ok(pid) = line.trim().parse::<u32>() {
                    if pid > 0 {
                        pids.insert(pid);
                    }
                }
            }
        }
    }
    pids
}

fn free_port(port: u16) {
    for pid in pids_listening_on(port) {
        eprintln!("[mcp-host] freeing port {port} (pid {pid})");
        kill_process_tree(pid);
    }
}

#[tauri::command]
pub fn start_mcp_host(
    host: tauri::State<McpHost>,
    ifc_path: String,
    catalog_path: Option<String>,
    session_path: Option<String>,
    quantities_path: Option<String>,
    port: Option<u16>,
) -> Result<McpStartResult, String> {
    host.kill();
    let root = repo_root()
        .canonicalize()
        .unwrap_or_else(|_| repo_root());
    let script = root.join("scripts").join("mcp-host.ts");
    if !script.exists() {
        return Err(format!("MCP host script missing: {}", script.display()));
    }
    let tsx = root.join("node_modules").join("tsx").join("dist").join("cli.mjs");
    if !tsx.exists() {
        return Err("tsx is not installed (npm install).".into());
    }
    let tsconfig = root.join("tsconfig.mcp.json");
    let port = port.unwrap_or(8765);
    let sync_port = port.saturating_add(1);
    free_port(port);
    free_port(sync_port);
    thread::sleep(Duration::from_millis(250));
    let token = make_token();

    let mut cmd = Command::new("node");
    cmd.arg(&tsx)
        .arg("--tsconfig")
        .arg(&tsconfig)
        .arg(&script)
        .arg("--ifc")
        .arg(&ifc_path)
        .arg("--port")
        .arg(port.to_string())
        .arg("--sync-port")
        .arg(sync_port.to_string())
        .arg("--token")
        .arg(&token)
        .current_dir(&root)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    push_opt(&mut cmd, "--catalog", &catalog_path);
    push_opt(&mut cmd, "--session", &session_path);
    push_opt(&mut cmd, "--quantities", &quantities_path);
    hide_window(&mut cmd);

    let mut child = cmd
        .spawn()
        .map_err(|err| format!("Could not start Node MCP sidecar: {err}"))?;
    let pid = child.id();
    if let Some(stderr) = child.stderr.take() {
        std::thread::spawn(move || {
            use std::io::{BufRead, BufReader};
            let reader = BufReader::new(stderr);
            for line in reader.lines().map_while(Result::ok) {
                eprintln!("[mcp-host] {line}");
            }
        });
    }
    if let Some(stdout) = child.stdout.take() {
        std::thread::spawn(move || {
            use std::io::{BufRead, BufReader};
            let reader = BufReader::new(stdout);
            for line in reader.lines().map_while(Result::ok) {
                eprintln!("[mcp-host] {line}");
            }
        });
    }
    thread::sleep(Duration::from_millis(400));
    if let Ok(Some(status)) = child.try_wait() {
        return Err(format!(
            "MCP sidecar exited immediately ({status}). Port {port}/{sync_port} may still be in use."
        ));
    }
    *host.child.lock() = Some(child);
    Ok(McpStartResult {
        port,
        sync_port,
        token,
        url: format!("http://127.0.0.1:{port}"),
        pid,
    })
}

#[tauri::command]
pub fn stop_mcp_host(host: tauri::State<McpHost>) -> Result<(), String> {
    host.kill();
    Ok(())
}
