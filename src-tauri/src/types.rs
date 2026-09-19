use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeMeshData {
    pub express_id: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ifc_type: Option<String>,
    pub positions: Vec<f32>,
    pub normals: Vec<f32>,
    pub indices: Vec<u32>,
    pub color: [f32; 4],
    /// Per-mesh local origin (world frame, f64); `positions` are stored
    /// relative to this. `[0, 0, 0]` when the engine didn't shift this mesh.
    /// Mirrors `ifc_lite_processing::MeshData.origin` — dropping it here was
    /// the desktop-only element-misplacement bug (elements with a non-zero
    /// engine-assigned origin rendered at `positions` alone, i.e. shifted by
    /// the discarded origin vector).
    pub origin: [f64; 3],
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativePoint3 {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeBounds {
    pub min: NativePoint3,
    pub max: NativePoint3,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeCoordinateInfo {
    pub origin_shift: NativePoint3,
    pub original_bounds: NativeBounds,
    pub shifted_bounds: NativeBounds,
    pub has_large_coordinates: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeometryResultDto {
    pub meshes: Vec<NativeMeshData>,
    pub total_vertices: usize,
    pub total_triangles: usize,
    pub coordinate_info: NativeCoordinateInfo,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeometryStatsDto {
    pub total_meshes: usize,
    pub total_vertices: usize,
    pub total_triangles: usize,
    pub parse_time_ms: u64,
    pub entity_scan_time_ms: Option<u64>,
    pub lookup_time_ms: Option<u64>,
    pub preprocess_time_ms: Option<u64>,
    pub geometry_time_ms: u64,
    pub total_time_ms: Option<u64>,
    pub first_chunk_ready_time_ms: Option<u64>,
    pub first_chunk_pack_time_ms: Option<u64>,
    pub first_chunk_emitted_time_ms: Option<u64>,
    pub first_chunk_emit_time_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub geometry_diagnostics: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeStreamingProgress {
    pub processed: usize,
    pub total: usize,
    pub current_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativePackedMeshRange {
    pub express_id: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ifc_type: Option<String>,
    pub positions_offset: usize,
    pub positions_len: usize,
    pub normals_offset: usize,
    pub normals_len: usize,
    pub indices_offset: usize,
    pub indices_len: usize,
    pub color: [f32; 4],
    /// See `NativeMeshData::origin`.
    pub origin: [f64; 3],
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeBatchTelemetryPayload {
    pub batch_sequence: u32,
    pub payload_kind: String,
    pub mesh_count: usize,
    pub positions_len: usize,
    pub normals_len: usize,
    pub indices_len: usize,
    pub chunk_ready_time_ms: u64,
    pub pack_time_ms: u64,
    pub emit_time_ms: u64,
    pub emitted_time_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativePackedGeometryBatch {
    pub meshes: Vec<NativePackedMeshRange>,
    pub positions: Vec<f32>,
    pub normals: Vec<f32>,
    pub indices: Vec<u32>,
    pub progress: NativeStreamingProgress,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub telemetry: Option<NativeBatchTelemetryPayload>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeColorUpdate {
    pub express_id: u32,
    pub color: [f32; 4],
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeColorUpdatePayload {
    pub updates: Vec<NativeColorUpdate>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeGeometryCacheManifest {
    pub version: u32,
    pub total_meshes: usize,
    pub total_vertices: usize,
    pub total_triangles: usize,
    pub shard_count: usize,
    pub metadata_snapshot_size: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeGeometryCacheStreamStatus {
    pub cache_key: String,
    pub total_meshes: usize,
    pub ready_shard_count: usize,
    pub ready_meshes: usize,
    pub done: bool,
    pub failed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeShardReadyPayload {
    pub shard_index: usize,
}

impl Default for NativeCoordinateInfo {
    fn default() -> Self {
        let zero = NativePoint3 {
            x: 0.0,
            y: 0.0,
            z: 0.0,
        };
        Self {
            origin_shift: zero.clone(),
            original_bounds: NativeBounds {
                min: zero.clone(),
                max: zero.clone(),
            },
            shifted_bounds: NativeBounds {
                min: zero.clone(),
                max: zero,
            },
            has_large_coordinates: false,
        }
    }
}
