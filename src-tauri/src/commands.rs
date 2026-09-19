use crate::cache::GeometryCache;
use crate::geometry::{pack_batch, process_buffer, stream_buffer};
use crate::packed::encode_packed_shard;
use crate::types::{
    GeometryResultDto, GeometryStatsDto, NativeColorUpdate, NativeColorUpdatePayload,
    NativeGeometryCacheManifest, NativeGeometryCacheStreamStatus, NativeShardReadyPayload,
};
use sha2::{Digest, Sha256};
use std::fs;
use std::sync::Arc;
use tauri::ipc::Response;
use tauri::{AppHandle, Emitter, State};

#[tauri::command]
pub fn get_geometry(buffer: Vec<u8>) -> Result<GeometryResultDto, String> {
    process_buffer(&buffer)
}

#[tauri::command]
pub fn get_geometry_from_path(path: String) -> Result<GeometryResultDto, String> {
    let bytes = fs::read(&path).map_err(|err| format!("failed to read {path}: {err}"))?;
    process_buffer(&bytes)
}

#[tauri::command]
pub fn get_geometry_streaming(app: AppHandle, buffer: Vec<u8>) -> Result<GeometryStatsDto, String> {
    stream_and_emit(&app, &buffer, None)
}

#[tauri::command]
pub fn get_geometry_streaming_from_path(
    app: AppHandle,
    cache: State<'_, Arc<GeometryCache>>,
    path: String,
    cache_key: String,
    prefer_packed_shards: bool,
) -> Result<GeometryStatsDto, String> {
    let bytes = fs::read(&path).map_err(|err| format!("failed to read {path}: {err}"))?;
    stream_path_into_cache(
        &app,
        cache.inner().clone(),
        &bytes,
        &cache_key,
        prefer_packed_shards,
    )
}

#[tauri::command]
pub fn get_native_geometry_cache_manifest(
    cache: State<'_, Arc<GeometryCache>>,
    cache_key: String,
) -> Result<Option<NativeGeometryCacheManifest>, String> {
    Ok(cache.read_manifest(&cache_key))
}

#[tauri::command]
pub fn get_native_geometry_cache_packed_shard(
    cache: State<'_, Arc<GeometryCache>>,
    cache_key: String,
    shard_index: usize,
) -> Result<Vec<u8>, String> {
    cache.read_shard(&cache_key, shard_index)
}

#[tauri::command]
pub fn get_native_geometry_cache_stream_status(
    cache: State<'_, Arc<GeometryCache>>,
    cache_key: String,
) -> Result<Option<NativeGeometryCacheStreamStatus>, String> {
    Ok(cache.stream_status(&cache_key))
}

#[tauri::command]
pub fn hash_ifc_path(path: String) -> Result<String, String> {
    let bytes = fs::read(&path).map_err(|err| format!("failed to read {path}: {err}"))?;
    Ok(hash_bytes(&bytes))
}

/// Returns the file as a raw IPC response instead of a `Vec<u8>` (which Tauri would
/// otherwise serialize as a JSON array of numbers - prohibitively slow/large for
/// a multi-hundred-MB IFC file).
#[tauri::command]
pub fn read_ifc_bytes(path: String) -> Result<Response, String> {
    let bytes = fs::read(&path).map_err(|err| format!("failed to read {path}: {err}"))?;
    Ok(Response::new(bytes))
}

/// Counts top-level `IFCBUILDING(` entity declarations in a STEP file, read
/// straight from disk as raw bytes (no UTF-8 decode, no parsing) so this stays
/// cheap even for a multi-hundred-MB file. Used to decide whether to route a
/// load through the native pipeline at all - see the caller in ifc-loader.ts
/// for why a count above 1 forces a WASM fallback instead.
#[tauri::command]
pub fn count_ifc_buildings(path: String) -> Result<usize, String> {
    let bytes = fs::read(&path).map_err(|err| format!("failed to read {path}: {err}"))?;
    const NEEDLE: &[u8] = b"IFCBUILDING(";
    if bytes.len() < NEEDLE.len() {
        return Ok(0);
    }
    Ok(bytes.windows(NEEDLE.len()).filter(|window| *window == NEEDLE).count())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalFileStat {
    pub exists: bool,
    pub size: u64,
    pub modified_ms: u64,
}

#[tauri::command]
pub fn stat_local_file(path: String) -> Result<LocalFileStat, String> {
    match fs::metadata(&path) {
        Ok(meta) => {
            let modified_ms = meta
                .modified()
                .ok()
                .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|duration| duration.as_millis() as u64)
                .unwrap_or(0);
            Ok(LocalFileStat {
                exists: true,
                size: meta.len(),
                modified_ms,
            })
        }
        Err(_) => Ok(LocalFileStat {
            exists: false,
            size: 0,
            modified_ms: 0,
        }),
    }
}

fn hash_bytes(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    hex::encode(digest)
}

fn stream_and_emit(
    app: &AppHandle,
    bytes: &[u8],
    cache_write: Option<(&GeometryCache, &str)>,
) -> Result<GeometryStatsDto, String> {
    stream_buffer(bytes, |meshes, processed, total, sequence, elapsed_ms| {
        let packed = pack_batch(meshes, processed, total, sequence, elapsed_ms, "packed");
        let _ = app.emit("geometry-packed-batch", &packed);

        let updates: Vec<NativeColorUpdate> = meshes
            .iter()
            .map(|mesh| NativeColorUpdate {
                express_id: mesh.express_id,
                color: mesh.color,
            })
            .collect();
        if !updates.is_empty() {
            let _ = app.emit(
                "geometry-color-update",
                NativeColorUpdatePayload { updates },
            );
        }

        if let Some((cache, cache_key)) = cache_write {
            let shard_index = (sequence as usize).saturating_sub(1);
            let encoded = encode_packed_shard(&packed);
            if cache.write_shard(cache_key, shard_index, &encoded).is_ok() {
                cache.update_stream(cache_key, |status| {
                    status.ready_shard_count = shard_index + 1;
                    status.ready_meshes = processed;
                    status.total_meshes = total;
                });
                let _ = app.emit(
                    "native-shard-ready",
                    NativeShardReadyPayload { shard_index },
                );
            }
        }
    })
}

fn stream_path_into_cache(
    app: &AppHandle,
    cache: Arc<GeometryCache>,
    bytes: &[u8],
    cache_key: &str,
    prefer_packed_shards: bool,
) -> Result<GeometryStatsDto, String> {
    cache.begin_stream(cache_key);
    let write = if prefer_packed_shards {
        Some((cache.as_ref(), cache_key))
    } else {
        None
    };

    let stats = match stream_and_emit(app, bytes, write) {
        Ok(stats) => stats,
        Err(err) => {
            cache.update_stream(cache_key, |status| {
                status.failed = true;
                status.done = true;
                status.error_message = Some(err.clone());
            });
            return Err(err);
        }
    };

    if prefer_packed_shards {
        let shard_count = cache
            .stream_status(cache_key)
            .map(|status| status.ready_shard_count)
            .unwrap_or(0);
        let manifest = NativeGeometryCacheManifest {
            version: 1,
            total_meshes: stats.total_meshes,
            total_vertices: stats.total_vertices,
            total_triangles: stats.total_triangles,
            shard_count,
            metadata_snapshot_size: 0,
        };
        cache.write_manifest(cache_key, &manifest)?;
        cache.update_stream(cache_key, |status| {
            status.done = true;
            status.failed = false;
            status.total_meshes = stats.total_meshes;
            status.ready_meshes = stats.total_meshes;
            status.ready_shard_count = shard_count;
        });
    }

    Ok(stats)
}
