use crate::packed::{native_mesh_from_processing, pack_meshes};
use crate::types::{
    GeometryResultDto, GeometryStatsDto, NativeBounds, NativeCoordinateInfo, NativePoint3,
};
use ifc_lite_processing::{process_geometry, process_geometry_streaming, MeshData, ProcessingStats};
use std::time::Instant;

const STREAM_BATCH_SIZE: usize = 48;
const LARGE_COORD_THRESHOLD: f64 = 10_000.0;

pub fn process_buffer(bytes: &[u8]) -> Result<GeometryResultDto, String> {
    let result = process_geometry(bytes);
    let meshes: Vec<_> = result
        .meshes
        .iter()
        .map(native_mesh_from_processing)
        .collect();
    let total_vertices = meshes.iter().map(|mesh| mesh.positions.len() / 3).sum();
    let total_triangles = meshes.iter().map(|mesh| mesh.indices.len() / 3).sum();
    Ok(GeometryResultDto {
        coordinate_info: coordinate_info_from_meshes(&result.meshes),
        meshes,
        total_vertices,
        total_triangles,
    })
}

pub fn stream_buffer<F>(bytes: &[u8], mut on_batch: F) -> Result<GeometryStatsDto, String>
where
    F: FnMut(&[MeshData], usize, usize, u32, u64),
{
    let started = Instant::now();
    let mut sequence = 0u32;
    let result = process_geometry_streaming(bytes, STREAM_BATCH_SIZE, |meshes, processed, total| {
        if meshes.is_empty() {
            return;
        }
        sequence += 1;
        on_batch(meshes, processed, total, sequence, started.elapsed().as_millis() as u64);
    });
    Ok(stats_from_processing(&result.stats, started.elapsed().as_millis() as u64, sequence))
}

pub fn pack_batch(
    meshes: &[MeshData],
    processed: usize,
    total: usize,
    sequence: u32,
    elapsed_ms: u64,
    kind: &str,
) -> crate::types::NativePackedGeometryBatch {
    pack_meshes(meshes, processed, total, sequence, elapsed_ms, kind)
}

pub fn stats_from_processing(
    stats: &ProcessingStats,
    elapsed_ms: u64,
    first_sequence: u32,
) -> GeometryStatsDto {
    GeometryStatsDto {
        total_meshes: stats.total_meshes,
        total_vertices: stats.total_vertices,
        total_triangles: stats.total_triangles,
        parse_time_ms: stats.parse_time_ms,
        entity_scan_time_ms: Some(stats.entity_scan_time_ms),
        lookup_time_ms: Some(stats.lookup_time_ms),
        preprocess_time_ms: Some(stats.preprocess_time_ms),
        geometry_time_ms: stats.geometry_time_ms,
        total_time_ms: Some(if stats.total_time_ms == 0 {
            elapsed_ms
        } else {
            stats.total_time_ms
        }),
        first_chunk_ready_time_ms: if first_sequence == 0 { None } else { Some(0) },
        first_chunk_pack_time_ms: if first_sequence == 0 { None } else { Some(0) },
        first_chunk_emitted_time_ms: if first_sequence == 0 { None } else { Some(0) },
        first_chunk_emit_time_ms: if first_sequence == 0 { None } else { Some(0) },
        geometry_diagnostics: stats
            .geometry_diagnostics
            .as_ref()
            .and_then(|value| serde_json::to_value(value).ok()),
    }
}

fn coordinate_info_from_meshes(meshes: &[MeshData]) -> NativeCoordinateInfo {
    let mut min = [f64::MAX; 3];
    let mut max = [f64::MIN; 3];
    let mut any = false;
    for mesh in meshes {
        let origin = mesh.origin;
        for chunk in mesh.positions.chunks(3) {
            if chunk.len() < 3 {
                continue;
            }
            any = true;
            let x = origin[0] + f64::from(chunk[0]);
            let y = origin[1] + f64::from(chunk[1]);
            let z = origin[2] + f64::from(chunk[2]);
            min[0] = min[0].min(x);
            min[1] = min[1].min(y);
            min[2] = min[2].min(z);
            max[0] = max[0].max(x);
            max[1] = max[1].max(y);
            max[2] = max[2].max(z);
        }
    }
    if !any {
        return NativeCoordinateInfo::default();
    }
    let extent = max
        .iter()
        .zip(min.iter())
        .map(|(hi, lo)| (*hi).abs().max(lo.abs()))
        .fold(0.0_f64, f64::max);
    let has_large_coordinates = extent > LARGE_COORD_THRESHOLD;
    let origin_shift = if has_large_coordinates {
        NativePoint3 {
            x: min[0],
            y: min[1],
            z: min[2],
        }
    } else {
        NativePoint3 {
            x: 0.0,
            y: 0.0,
            z: 0.0,
        }
    };
    let original = NativeBounds {
        min: NativePoint3 {
            x: min[0],
            y: min[1],
            z: min[2],
        },
        max: NativePoint3 {
            x: max[0],
            y: max[1],
            z: max[2],
        },
    };
    NativeCoordinateInfo {
        shifted_bounds: NativeBounds {
            min: NativePoint3 {
                x: original.min.x - origin_shift.x,
                y: original.min.y - origin_shift.y,
                z: original.min.z - origin_shift.z,
            },
            max: NativePoint3 {
                x: original.max.x - origin_shift.x,
                y: original.max.y - origin_shift.y,
                z: original.max.z - origin_shift.z,
            },
        },
        origin_shift,
        original_bounds: original,
        has_large_coordinates,
    }
}
