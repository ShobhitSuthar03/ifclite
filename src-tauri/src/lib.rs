mod cache;
mod commands;
mod geometry;
mod packed;
mod projects;
mod types;

use cache::{default_cache_dir, GeometryCache};
use commands::{
    get_geometry, get_geometry_from_path, get_geometry_streaming, get_geometry_streaming_from_path,
    get_native_geometry_cache_manifest, get_native_geometry_cache_packed_shard,
    get_native_geometry_cache_stream_status, hash_ifc_path, read_ifc_bytes,
};
use projects::{
    close_project, create_project, current_project, get_project_quantities,
    get_project_warehouse, get_projects_root, import_ifc_bytes, import_ifc_path, last_project,
    list_projects, open_project, save_project_quantities, save_project_session,
    save_project_warehouse, write_ifc_file, ProjectBook,
};
use std::sync::Arc;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let cache = Arc::new(GeometryCache::new(default_cache_dir()));

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(cache)
        .manage(ProjectBook::default())
        .invoke_handler(tauri::generate_handler![
            get_geometry,
            get_geometry_from_path,
            get_geometry_streaming,
            get_geometry_streaming_from_path,
            get_native_geometry_cache_manifest,
            get_native_geometry_cache_packed_shard,
            get_native_geometry_cache_stream_status,
            hash_ifc_path,
            read_ifc_bytes,
            get_projects_root,
            list_projects,
            last_project,
            create_project,
            open_project,
            close_project,
            current_project,
            import_ifc_path,
            import_ifc_bytes,
            save_project_session,
            save_project_warehouse,
            get_project_warehouse,
            save_project_quantities,
            get_project_quantities,
            write_ifc_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running IFClite desktop");
}

/// Helpers used by integration tests without launching the WebView.
pub mod test_support {
    pub use crate::geometry::process_buffer as process_sample;
    pub use crate::packed::{encode_packed_shard, pack_meshes, PACKED_MAGIC};
}

