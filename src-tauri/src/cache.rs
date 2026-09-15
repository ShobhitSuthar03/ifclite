use crate::types::{NativeGeometryCacheManifest, NativeGeometryCacheStreamStatus};
use parking_lot::Mutex;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct StreamRecord {
    pub status: NativeGeometryCacheStreamStatus,
}

pub struct GeometryCache {
    dir: Mutex<PathBuf>,
    streams: Mutex<HashMap<String, StreamRecord>>,
}

impl GeometryCache {
    pub fn new(dir: PathBuf) -> Self {
        let _ = fs::create_dir_all(&dir);
        Self {
            dir: Mutex::new(dir),
            streams: Mutex::new(HashMap::new()),
        }
    }

    pub fn set_dir(&self, dir: PathBuf) {
        let _ = fs::create_dir_all(&dir);
        *self.dir.lock() = dir;
        self.streams.lock().clear();
    }

    pub fn key_dir(&self, cache_key: &str) -> PathBuf {
        self.dir.lock().join(sanitize_key(cache_key))
    }

    pub fn manifest_path(&self, cache_key: &str) -> PathBuf {
        self.key_dir(cache_key).join("manifest.json")
    }

    pub fn shard_path(&self, cache_key: &str, shard_index: usize) -> PathBuf {
        self.key_dir(cache_key).join(format!("shard-{shard_index}.bin"))
    }

    pub fn read_manifest(&self, cache_key: &str) -> Option<NativeGeometryCacheManifest> {
        let path = self.manifest_path(cache_key);
        let bytes = fs::read(path).ok()?;
        serde_json::from_slice(&bytes).ok()
    }

    pub fn write_manifest(
        &self,
        cache_key: &str,
        manifest: &NativeGeometryCacheManifest,
    ) -> Result<(), String> {
        let dir = self.key_dir(cache_key);
        fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
        let path = self.manifest_path(cache_key);
        let json = serde_json::to_vec_pretty(manifest).map_err(|err| err.to_string())?;
        fs::write(path, json).map_err(|err| err.to_string())
    }

    pub fn write_shard(
        &self,
        cache_key: &str,
        shard_index: usize,
        bytes: &[u8],
    ) -> Result<(), String> {
        let dir = self.key_dir(cache_key);
        fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
        fs::write(self.shard_path(cache_key, shard_index), bytes).map_err(|err| err.to_string())
    }

    pub fn read_shard(&self, cache_key: &str, shard_index: usize) -> Result<Vec<u8>, String> {
        fs::read(self.shard_path(cache_key, shard_index)).map_err(|err| {
            format!("packed shard {shard_index} missing for {cache_key}: {err}")
        })
    }

    pub fn begin_stream(&self, cache_key: &str) {
        let status = NativeGeometryCacheStreamStatus {
            cache_key: cache_key.to_string(),
            total_meshes: 0,
            ready_shard_count: 0,
            ready_meshes: 0,
            done: false,
            failed: false,
            error_message: None,
        };
        self.streams
            .lock()
            .insert(cache_key.to_string(), StreamRecord { status });
    }

    pub fn update_stream<F>(&self, cache_key: &str, mutate: F)
    where
        F: FnOnce(&mut NativeGeometryCacheStreamStatus),
    {
        let mut streams = self.streams.lock();
        let record = streams.entry(cache_key.to_string()).or_insert_with(|| {
            StreamRecord {
                status: NativeGeometryCacheStreamStatus {
                    cache_key: cache_key.to_string(),
                    total_meshes: 0,
                    ready_shard_count: 0,
                    ready_meshes: 0,
                    done: false,
                    failed: false,
                    error_message: None,
                },
            }
        });
        mutate(&mut record.status);
    }

    pub fn stream_status(&self, cache_key: &str) -> Option<NativeGeometryCacheStreamStatus> {
        self.streams
            .lock()
            .get(cache_key)
            .map(|record| record.status.clone())
            .or_else(|| {
                self.read_manifest(cache_key).map(|manifest| NativeGeometryCacheStreamStatus {
                    cache_key: cache_key.to_string(),
                    total_meshes: manifest.total_meshes,
                    ready_shard_count: manifest.shard_count,
                    ready_meshes: manifest.total_meshes,
                    done: true,
                    failed: false,
                    error_message: None,
                })
            })
    }
}

fn sanitize_key(cache_key: &str) -> String {
    cache_key
        .chars()
        .map(|ch| if ch.is_ascii_hexdigit() { ch } else { '_' })
        .collect()
}

pub fn default_cache_dir() -> PathBuf {
    std::env::temp_dir().join("ifclite-desktop-cache")
}
