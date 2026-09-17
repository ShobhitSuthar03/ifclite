use hex::encode;
use parking_lot::Mutex;
use rand::RngCore;
use serde::Serialize;
use std::collections::BTreeSet;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::thread;
use std::time::Duration;

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

/// A per-session bearer token gating the sidecar's HTTP surface (both the MCP
/// protocol port and the app's own sync port - see mcp-host.ts). Drawn from the
/// OS CSPRNG rather than derived from process start time + pid, which - despite
/// the SHA-256 wrapper - has too little real entropy for a local attacker who
/// can observe roughly when the sidecar process started.
fn make_token() -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    encode(bytes)
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

/// Best-effort read of a process's command line, used only to avoid killing an
/// unrelated process that happens to be listening on our port (see `free_port`).
/// `None` (can't determine) is treated as "don't kill" by every caller.
fn process_command_line(pid: u32) -> Option<String> {
    #[cfg(windows)]
    {
        let mut cmd = Command::new("wmic");
        cmd.args([
            "process",
            "where",
            &format!("ProcessId={pid}"),
            "get",
            "CommandLine",
            "/VALUE",
        ]);
        hide_window(&mut cmd);
        let output = cmd.output().ok()?;
        let text = String::from_utf8_lossy(&output.stdout);
        text.lines()
            .find_map(|line| line.strip_prefix("CommandLine="))
            .map(|value| value.trim().to_string())
    }
    #[cfg(not(windows))]
    {
        let output = Command::new("ps").args(["-p", &pid.to_string(), "-o", "command="]).output().ok()?;
        let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if text.is_empty() {
            None
        } else {
            Some(text)
        }
    }
}

/// Only a prior `ifclite` MCP sidecar of our own (a `node`/`tsx` process running
/// `mcp-host.ts`) is a safe thing to kill on a port conflict - anything else
/// listening there is some unrelated program the port collision should be
/// reported as an error, not silently evicted.
fn is_our_sidecar_process(pid: u32) -> bool {
    process_command_line(pid)
        .map(|line| {
            let lower = line.to_ascii_lowercase();
            lower.contains("mcp-host.ts") || lower.contains("mcp-host.mjs")
        })
        .unwrap_or(false)
}

fn free_port(port: u16) -> Result<(), String> {
    let mut blocked_by_other = Vec::new();
    for pid in pids_listening_on(port) {
        if is_our_sidecar_process(pid) {
            eprintln!("[mcp-host] freeing port {port} (pid {pid}, prior ifclite-mcp instance)");
            kill_process_tree(pid);
        } else {
            blocked_by_other.push(pid);
        }
    }
    if blocked_by_other.is_empty() {
        Ok(())
    } else {
        Err(format!(
            "port {port} is in use by another program (pid {}), not a prior IFClite MCP sidecar - refusing to stop it",
            blocked_by_other
                .iter()
                .map(u32::to_string)
                .collect::<Vec<_>>()
                .join(", ")
        ))
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
    free_port(port)?;
    free_port(sync_port)?;
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
