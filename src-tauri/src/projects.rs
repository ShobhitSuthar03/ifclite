use crate::cache::GeometryCache;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, Manager, State};

const ROOT_FOLDER: &str = "IFCLite";
const PROJECT_FILE: &str = "project.json";
const SESSION_FILE: &str = "session.json";
const WAREHOUSE_FILE: &str = "warehouse.sqlite";
const QUANTITIES_FILE: &str = "quantities.json";
const MODEL_FILE: &str = "model.ifc";
const CATALOG_FILE: &str = "catalog.json";
const GEOMETRY_FOLDER: &str = "geometry";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRecord {
    pub id: String,
    pub name: String,
    pub folder_path: String,
    pub created_at_ms: u64,
    pub updated_at_ms: u64,
    pub model_file: Option<String>,
    pub original_path: Option<String>,
    pub file_name: Option<String>,
    pub cache_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSnapshot {
    #[serde(flatten)]
    pub project: ProjectRecord,
    pub model_path: Option<String>,
    pub geometry_dir: String,
    pub session_json: Option<String>,
    /// Whether `warehouse.sqlite` exists for this project. The bytes themselves are
    /// fetched separately via `get_project_warehouse`, as a raw IPC response, so this
    /// (often large) file isn't read from disk and JSON-encoded on every project open
    /// whether or not the caller ends up needing it.
    pub has_warehouse: bool,
    /// Whether a full (geometry included) quantity takeoff was saved for this project.
    /// Fetched separately via `get_project_quantities`, same reasoning as `has_warehouse`.
    pub has_quantities: bool,
    pub has_geometry_cache: bool,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Catalog {
    version: u32,
    last_project_id: Option<String>,
}

#[derive(Default)]
pub struct ProjectBook {
    current: Mutex<Option<ProjectRecord>>,
}

impl ProjectBook {
    pub fn current(&self) -> Option<ProjectRecord> {
        self.current.lock().clone()
    }

    fn set_current(&self, project: ProjectRecord) {
        *self.current.lock() = Some(project);
    }

    pub fn clear(&self) {
        *self.current.lock() = None;
    }
}

pub fn documents_ifclite(documents: &Path) -> PathBuf {
    documents.join(ROOT_FOLDER)
}

pub fn slug_project_name(name: &str) -> String {
    let trimmed = name.trim();
    let mut out = String::new();
    for ch in trimmed.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch);
        } else if ch == ' ' || ch == '-' || ch == '_' {
            if !out.ends_with('-') {
                out.push('-');
            }
        }
    }
    let out = out.trim_matches('-').to_string();
    if out.is_empty() {
        "project".to_string()
    } else {
        out.chars().take(48).collect()
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn hash_bytes(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

fn read_json<T: for<'de> Deserialize<'de>>(path: &Path) -> Result<T, String> {
    let bytes = fs::read(path).map_err(|err| format!("failed to read {}: {err}", path.display()))?;
    serde_json::from_slice(&bytes).map_err(|err| format!("invalid json {}: {err}", path.display()))
}

fn write_json(path: &Path, value: &impl Serialize) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let json = serde_json::to_vec_pretty(value).map_err(|err| err.to_string())?;
    fs::write(path, json).map_err(|err| err.to_string())
}

fn unique_folder(root: &Path, slug: &str) -> PathBuf {
    let candidate = root.join(slug);
    if !candidate.exists() {
        return candidate;
    }
    for index in 2..1000 {
        let next = root.join(format!("{slug}-{index}"));
        if !next.exists() {
            return next;
        }
    }
    root.join(format!("{slug}-{}", now_ms()))
}

pub fn create_project_at(root: &Path, name: &str) -> Result<ProjectRecord, String> {
    fs::create_dir_all(root).map_err(|err| format!("could not create {}: {err}", root.display()))?;
    let folder = unique_folder(root, &slug_project_name(name));
    fs::create_dir_all(folder.join(GEOMETRY_FOLDER)).map_err(|err| err.to_string())?;
    let stamp = now_ms();
    let project = ProjectRecord {
        id: folder
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| format!("project-{stamp}")),
        name: name.trim().to_string(),
        folder_path: folder.to_string_lossy().to_string(),
        created_at_ms: stamp,
        updated_at_ms: stamp,
        model_file: None,
        original_path: None,
        file_name: None,
        cache_key: None,
    };
    write_json(&folder.join(PROJECT_FILE), &project)?;
    Ok(project)
}

pub fn list_projects_at(root: &Path) -> Result<Vec<ProjectRecord>, String> {
    if !root.exists() {
        return Ok(Vec::new());
    }
    let mut projects = Vec::new();
    let entries = fs::read_dir(root).map_err(|err| err.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let file = path.join(PROJECT_FILE);
        if !file.exists() {
            continue;
        }
        match read_json::<ProjectRecord>(&file) {
            Ok(mut project) => {
                project.folder_path = path.to_string_lossy().to_string();
                projects.push(project);
            }
            Err(_) => continue,
        }
    }
    projects.sort_by(|a, b| b.updated_at_ms.cmp(&a.updated_at_ms));
    Ok(projects)
}

fn catalog_path(root: &Path) -> PathBuf {
    root.join(CATALOG_FILE)
}

fn read_catalog(root: &Path) -> Catalog {
    read_json(&catalog_path(root)).unwrap_or_default()
}

fn write_catalog(root: &Path, catalog: &Catalog) -> Result<(), String> {
    write_json(&catalog_path(root), catalog)
}

fn remember(root: &Path, id: &str) -> Result<(), String> {
    let mut catalog = read_catalog(root);
    catalog.version = 1;
    catalog.last_project_id = Some(id.to_string());
    write_catalog(root, &catalog)
}

fn find_project(root: &Path, id: &str) -> Result<ProjectRecord, String> {
    list_projects_at(root)?
        .into_iter()
        .find(|project| project.id == id)
        .ok_or_else(|| format!("project '{id}' was not found in {}", root.display()))
}

fn save_project(project: &ProjectRecord) -> Result<(), String> {
    let folder = PathBuf::from(&project.folder_path);
    write_json(&folder.join(PROJECT_FILE), project)
}

fn snapshot_of(project: &ProjectRecord) -> ProjectSnapshot {
    let folder = PathBuf::from(&project.folder_path);
    let model_path = project.model_file.as_ref().map(|name| folder.join(name));
    let geometry_dir = folder.join(GEOMETRY_FOLDER);
    let session_path = folder.join(SESSION_FILE);
    let warehouse_path = folder.join(WAREHOUSE_FILE);
    let quantities_path = folder.join(QUANTITIES_FILE);
    let cache_key = project.cache_key.clone().unwrap_or_default();
    let has_geometry_cache = if cache_key.is_empty() {
        false
    } else {
        geometry_dir
            .join(
                cache_key
                    .chars()
                    .map(|ch| if ch.is_ascii_hexdigit() { ch } else { '_' })
                    .collect::<String>(),
            )
            .join("manifest.json")
            .exists()
    };
    ProjectSnapshot {
        project: project.clone(),
        model_path: model_path
            .filter(|path| path.exists())
            .map(|path| path.to_string_lossy().to_string()),
        geometry_dir: geometry_dir.to_string_lossy().to_string(),
        session_json: fs::read_to_string(session_path).ok(),
        has_warehouse: warehouse_path.exists(),
        has_quantities: quantities_path.exists(),
        has_geometry_cache,
    }
}

fn activate(
    cache: &GeometryCache,
    book: &ProjectBook,
    root: &Path,
    mut project: ProjectRecord,
) -> Result<ProjectSnapshot, String> {
    let folder = PathBuf::from(&project.folder_path);
    let geometry = folder.join(GEOMETRY_FOLDER);
    fs::create_dir_all(&geometry).map_err(|err| err.to_string())?;
    cache.set_dir(geometry);
    project.updated_at_ms = now_ms();
    save_project(&project)?;
    remember(root, &project.id)?;
    book.set_current(project.clone());
    Ok(snapshot_of(&project))
}

fn require_current(book: &ProjectBook) -> Result<ProjectRecord, String> {
    book.current()
        .ok_or_else(|| "open or create a project first".to_string())
}

fn documents_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .document_dir()
        .or_else(|_| app.path().home_dir().map(|home| home.join("Documents")))
        .map_err(|err| format!("could not resolve Documents folder: {err}"))
}

fn root_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let root = documents_ifclite(&documents_dir(app)?);
    fs::create_dir_all(&root).map_err(|err| format!("could not create {}: {err}", root.display()))?;
    Ok(root)
}

#[tauri::command]
pub fn get_projects_root(app: AppHandle) -> Result<String, String> {
    Ok(root_dir(&app)?.to_string_lossy().to_string())
}

#[tauri::command]
pub fn list_projects(app: AppHandle) -> Result<Vec<ProjectRecord>, String> {
    list_projects_at(&root_dir(&app)?)
}

#[tauri::command]
pub fn last_project(app: AppHandle) -> Result<Option<ProjectRecord>, String> {
    let root = root_dir(&app)?;
    let id = match read_catalog(&root).last_project_id {
        Some(id) => id,
        None => return Ok(list_projects_at(&root)?.into_iter().next()),
    };
    Ok(list_projects_at(&root)?.into_iter().find(|project| project.id == id))
}

#[tauri::command]
pub fn create_project(
    app: AppHandle,
    cache: State<'_, std::sync::Arc<GeometryCache>>,
    book: State<'_, ProjectBook>,
    name: String,
) -> Result<ProjectSnapshot, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("project name is required".into());
    }
    let root = root_dir(&app)?;
    let project = create_project_at(&root, trimmed)?;
    activate(&**cache, &*book, &root, project)
}

#[tauri::command]
pub fn open_project(
    app: AppHandle,
    cache: State<'_, std::sync::Arc<GeometryCache>>,
    book: State<'_, ProjectBook>,
    id: String,
) -> Result<ProjectSnapshot, String> {
    let root = root_dir(&app)?;
    let project = find_project(&root, &id)?;
    activate(&**cache, &*book, &root, project)
}

#[tauri::command]
pub fn current_project(book: State<'_, ProjectBook>) -> Result<Option<ProjectRecord>, String> {
    Ok(book.current())
}

#[tauri::command]
pub fn close_project(book: State<'_, ProjectBook>) -> Result<(), String> {
    book.clear();
    Ok(())
}

#[tauri::command]
pub fn import_ifc_path(
    book: State<'_, ProjectBook>,
    path: String,
    file_name: Option<String>,
) -> Result<ProjectSnapshot, String> {
    let mut project = require_current(&book)?;
    let folder = PathBuf::from(&project.folder_path);
    let dest = folder.join(MODEL_FILE);
    fs::copy(&path, &dest).map_err(|err| format!("failed to copy IFC into the project: {err}"))?;
    let _ = fs::remove_file(folder.join(SESSION_FILE));
    let _ = fs::remove_file(folder.join(WAREHOUSE_FILE));
    let _ = fs::remove_file(folder.join(QUANTITIES_FILE));
    let bytes = fs::read(&dest).map_err(|err| err.to_string())?;
    project.model_file = Some(MODEL_FILE.to_string());
    project.file_name = Some(file_name.unwrap_or_else(|| {
        Path::new(&path)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| MODEL_FILE.to_string())
    }));
    project.original_path = Some(path);
    project.cache_key = Some(hash_bytes(&bytes));
    project.updated_at_ms = now_ms();
    save_project(&project)?;
    book.set_current(project.clone());
    Ok(snapshot_of(&project))
}

/// Percent-decodes a header value (mirrors `encodeURIComponent` on the JS side).
/// Header values are restricted to visible ASCII, so a project/file name with
/// non-ASCII or reserved characters must be escaped by the caller before being
/// sent as a header.
fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(hex) = std::str::from_utf8(&bytes[i + 1..i + 3]) {
                if let Ok(value) = u8::from_str_radix(hex, 16) {
                    out.push(value);
                    i += 3;
                    continue;
                }
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn raw_body<'a>(request: &'a Request<'a>) -> Result<&'a [u8], String> {
    match request.body() {
        InvokeBody::Raw(bytes) => Ok(bytes.as_slice()),
        InvokeBody::Json(_) => Err("expected a raw bytes body".to_string()),
    }
}

#[tauri::command]
pub fn import_ifc_bytes(
    book: State<'_, ProjectBook>,
    request: Request<'_>,
) -> Result<ProjectSnapshot, String> {
    let file_name = request
        .headers()
        .get("x-file-name")
        .and_then(|value| value.to_str().ok())
        .map(percent_decode);
    let bytes = raw_body(&request)?;
    let mut project = require_current(&book)?;
    let folder = PathBuf::from(&project.folder_path);
    let dest = folder.join(MODEL_FILE);
    fs::write(&dest, bytes).map_err(|err| format!("failed to write IFC into the project: {err}"))?;
    let _ = fs::remove_file(folder.join(SESSION_FILE));
    let _ = fs::remove_file(folder.join(WAREHOUSE_FILE));
    let _ = fs::remove_file(folder.join(QUANTITIES_FILE));
    project.model_file = Some(MODEL_FILE.to_string());
    project.original_path = None;
    project.file_name = Some(file_name.unwrap_or_else(|| MODEL_FILE.to_string()));
    project.cache_key = Some(hash_bytes(bytes));
    project.updated_at_ms = now_ms();
    save_project(&project)?;
    book.set_current(project.clone());
    Ok(snapshot_of(&project))
}

#[tauri::command]
pub fn save_project_session(book: State<'_, ProjectBook>, json: String) -> Result<(), String> {
    let project = require_current(&book)?;
    let path = PathBuf::from(&project.folder_path).join(SESSION_FILE);
    fs::write(path, json).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn save_project_warehouse(book: State<'_, ProjectBook>, request: Request<'_>) -> Result<(), String> {
    let bytes = raw_body(&request)?;
    let project = require_current(&book)?;
    let path = PathBuf::from(&project.folder_path).join(WAREHOUSE_FILE);
    fs::write(path, bytes).map_err(|err| err.to_string())
}

/// Companion to `save_project_warehouse`: returns `warehouse.sqlite`'s bytes as a raw
/// IPC response (see `read_ifc_bytes` for why - avoids a JSON number-array roundtrip
/// for what can be a multi-hundred-MB file).
#[tauri::command]
pub fn get_project_warehouse(book: State<'_, ProjectBook>) -> Result<Response, String> {
    let project = require_current(&book)?;
    let path = PathBuf::from(&project.folder_path).join(WAREHOUSE_FILE);
    let bytes = fs::read(&path).map_err(|err| format!("failed to read {}: {err}", path.display()))?;
    Ok(Response::new(bytes))
}

/// Full (per-face geometry included) quantity takeoff, saved separately from
/// session.json so reopening a project doesn't have to recompute it - it's kept out
/// of session.json itself because it can be considerably larger than the rest of the
/// session state and doesn't need to be rewritten on every ordinary session save.
#[tauri::command]
pub fn save_project_quantities(book: State<'_, ProjectBook>, request: Request<'_>) -> Result<(), String> {
    let bytes = raw_body(&request)?;
    let project = require_current(&book)?;
    let path = PathBuf::from(&project.folder_path).join(QUANTITIES_FILE);
    fs::write(path, bytes).map_err(|err| err.to_string())
}

/// Companion to `save_project_quantities`, returned as a raw IPC response (see
/// `read_ifc_bytes`).
#[tauri::command]
pub fn get_project_quantities(book: State<'_, ProjectBook>) -> Result<Response, String> {
    let project = require_current(&book)?;
    let path = PathBuf::from(&project.folder_path).join(QUANTITIES_FILE);
    let bytes = fs::read(&path).map_err(|err| format!("failed to read {}: {err}", path.display()))?;
    Ok(Response::new(bytes))
}

/// One entry from the app's `MutationPatch[]` (property/attribute edit overlay) -
/// same shape, so the frontend can pass its mutation list straight through.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MutationPatchDto {
    pub express_id: i64,
    pub kind: String,
    pub name: String,
    pub value: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pset: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportRequest {
    source_path: String,
    output_path: String,
    mutations: Vec<MutationPatchDto>,
}

/// Bakes the mutation overlay (property/attribute edits, including anything
/// registered from the manual takeoff basket) into a real IFC file via a bundled
/// Python + ifcopenshell script - `@ifc-lite/*` doesn't ship a STEP writer yet, and
/// ifcopenshell is the standard tool for this rather than hand-rolling one.
#[tauri::command]
pub fn export_ifc(
    app: AppHandle,
    book: State<'_, ProjectBook>,
    mutations: Vec<MutationPatchDto>,
    output_path: String,
) -> Result<String, String> {
    let project = require_current(&book)?;
    let model_file = project
        .model_file
        .clone()
        .ok_or_else(|| "project has no model file to export".to_string())?;
    let source_path = PathBuf::from(&project.folder_path).join(model_file);

    let script_path = app
        .path()
        .resolve("scripts/export_ifc.py", tauri::path::BaseDirectory::Resource)
        .map_err(|err| format!("failed to locate export_ifc.py: {err}"))?;

    let request = ExportRequest {
        source_path: source_path.to_string_lossy().to_string(),
        output_path: output_path.clone(),
        mutations,
    };
    let request_json = serde_json::to_string(&request).map_err(|err| err.to_string())?;
    let request_path = std::env::temp_dir().join(format!("ifclite-export-{}.json", now_ms()));
    fs::write(&request_path, request_json).map_err(|err| err.to_string())?;

    let run = std::process::Command::new("python")
        .arg(&script_path)
        .arg(&request_path)
        .output();
    let _ = fs::remove_file(&request_path);
    let output = run.map_err(|err| format!("failed to run export_ifc.py (is Python installed?): {err}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let last_line = stdout.lines().last().unwrap_or("");
    let parsed: serde_json::Value = serde_json::from_str(last_line).map_err(|_| {
        format!(
            "export_ifc.py produced no usable output: {}",
            String::from_utf8_lossy(&output.stderr)
        )
    })?;

    if parsed.get("ok").and_then(|v| v.as_bool()) == Some(true) {
        Ok(parsed
            .get("outputPath")
            .and_then(|v| v.as_str())
            .unwrap_or(&output_path)
            .to_string())
    } else {
        Err(parsed
            .get("error")
            .and_then(|v| v.as_str())
            .unwrap_or("export failed")
            .to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn slug_strips_windows_illegal_characters() {
        assert_eq!(slug_project_name("  Tower / A:1*  "), "Tower-A-1");
        assert_eq!(slug_project_name("???"), "project");
    }

    #[test]
    fn create_and_list_round_trip() {
        let dir = tempdir().unwrap();
        let root = documents_ifclite(dir.path());
        let first = create_project_at(&root, "Site One").unwrap();
        assert!(Path::new(&first.folder_path).join(PROJECT_FILE).exists());
        assert!(Path::new(&first.folder_path).join(GEOMETRY_FOLDER).exists());
        let listed = list_projects_at(&root).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].name, "Site One");
    }

    #[test]
    fn duplicate_names_get_unique_folders() {
        let dir = tempdir().unwrap();
        let root = documents_ifclite(dir.path());
        let a = create_project_at(&root, "Tower").unwrap();
        let b = create_project_at(&root, "Tower").unwrap();
        assert_ne!(a.folder_path, b.folder_path);
        assert!(b.folder_path.ends_with("Tower-2") || b.id.contains("Tower"));
    }

    #[test]
    fn close_clears_the_open_project() {
        let book = ProjectBook::default();
        let dir = tempdir().unwrap();
        let project = create_project_at(&documents_ifclite(dir.path()), "Site").unwrap();
        book.set_current(project);
        assert!(book.current().is_some());
        book.clear();
        assert!(book.current().is_none());
    }
}
