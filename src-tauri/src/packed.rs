use crate::types::{
    NativeBatchTelemetryPayload, NativeMeshData, NativePackedGeometryBatch, NativePackedMeshRange,
    NativeStreamingProgress,
};
use ifc_lite_processing::MeshData;

pub const PACKED_MAGIC: u32 = 0x4946_4342;
pub const PACKED_VERSION: u32 = 1;
const MESH_RECORD_WORDS: usize = 11;

pub fn native_mesh_from_processing(mesh: &MeshData) -> NativeMeshData {
    NativeMeshData {
        express_id: mesh.express_id,
        ifc_type: if mesh.ifc_type.is_empty() {
            None
        } else {
            Some(mesh.ifc_type.clone())
        },
        positions: mesh.positions.clone(),
        normals: mesh.normals.clone(),
        indices: mesh.indices.clone(),
        color: mesh.color,
    }
}

pub fn pack_meshes(
    meshes: &[MeshData],
    processed: usize,
    total: usize,
    batch_sequence: u32,
    elapsed_ms: u64,
    payload_kind: &str,
) -> NativePackedGeometryBatch {
    let mut positions = Vec::new();
    let mut normals = Vec::new();
    let mut indices = Vec::new();
    let mut ranges = Vec::with_capacity(meshes.len());

    for mesh in meshes {
        let native = native_mesh_from_processing(mesh);
        ranges.push(NativePackedMeshRange {
            express_id: native.express_id,
            ifc_type: native.ifc_type.clone(),
            positions_offset: positions.len(),
            positions_len: native.positions.len(),
            normals_offset: normals.len(),
            normals_len: native.normals.len(),
            indices_offset: indices.len(),
            indices_len: native.indices.len(),
            color: native.color,
        });
        positions.extend_from_slice(&native.positions);
        normals.extend_from_slice(&native.normals);
        indices.extend_from_slice(&native.indices);
    }

    NativePackedGeometryBatch {
        telemetry: Some(NativeBatchTelemetryPayload {
            batch_sequence,
            payload_kind: payload_kind.to_string(),
            mesh_count: meshes.len(),
            positions_len: positions.len(),
            normals_len: normals.len(),
            indices_len: indices.len(),
            chunk_ready_time_ms: elapsed_ms,
            pack_time_ms: 0,
            emit_time_ms: elapsed_ms,
            emitted_time_ms: elapsed_ms,
        }),
        meshes: ranges,
        positions,
        normals,
        indices,
        progress: NativeStreamingProgress {
            processed,
            total,
            current_type: payload_kind.to_string(),
        },
    }
}

pub fn encode_packed_shard(batch: &NativePackedGeometryBatch) -> Vec<u8> {
    let header_words = 8;
    let table_words = batch.meshes.len() * MESH_RECORD_WORDS;
    let data_bytes = (batch.positions.len() + batch.normals.len()) * 4 + batch.indices.len() * 4;
    let mut bytes = vec![0u8; (header_words + table_words) * 4 + data_bytes];
    let mut offset = 0;

    write_u32(&mut bytes, &mut offset, PACKED_MAGIC);
    write_u32(&mut bytes, &mut offset, PACKED_VERSION);
    write_u32(&mut bytes, &mut offset, batch.meshes.len() as u32);
    write_u32(&mut bytes, &mut offset, batch.positions.len() as u32);
    write_u32(&mut bytes, &mut offset, batch.normals.len() as u32);
    write_u32(&mut bytes, &mut offset, batch.indices.len() as u32);
    write_u32(&mut bytes, &mut offset, batch.progress.processed as u32);
    write_u32(&mut bytes, &mut offset, batch.progress.total as u32);

    for mesh in &batch.meshes {
        write_u32(&mut bytes, &mut offset, mesh.express_id);
        write_u32(&mut bytes, &mut offset, mesh.positions_offset as u32);
        write_u32(&mut bytes, &mut offset, mesh.positions_len as u32);
        write_u32(&mut bytes, &mut offset, mesh.normals_offset as u32);
        write_u32(&mut bytes, &mut offset, mesh.normals_len as u32);
        write_u32(&mut bytes, &mut offset, mesh.indices_offset as u32);
        write_u32(&mut bytes, &mut offset, mesh.indices_len as u32);
        write_f32(&mut bytes, &mut offset, mesh.color[0]);
        write_f32(&mut bytes, &mut offset, mesh.color[1]);
        write_f32(&mut bytes, &mut offset, mesh.color[2]);
        write_f32(&mut bytes, &mut offset, mesh.color[3]);
    }

    for value in &batch.positions {
        write_f32(&mut bytes, &mut offset, *value);
    }
    for value in &batch.normals {
        write_f32(&mut bytes, &mut offset, *value);
    }
    for value in &batch.indices {
        write_u32(&mut bytes, &mut offset, *value);
    }

    bytes
}

fn write_u32(bytes: &mut [u8], offset: &mut usize, value: u32) {
    bytes[*offset..*offset + 4].copy_from_slice(&value.to_le_bytes());
    *offset += 4;
}

fn write_f32(bytes: &mut [u8], offset: &mut usize, value: f32) {
    bytes[*offset..*offset + 4].copy_from_slice(&value.to_le_bytes());
    *offset += 4;
}

#[cfg(test)]
mod tests {
    use super::*;
    use ifc_lite_processing::MeshData;

    #[test]
    fn packed_shard_roundtrip_header() {
        let mesh = MeshData::new(
            42,
            "IfcWall".into(),
            vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0],
            vec![0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0],
            vec![0, 1, 2],
            [1.0, 0.0, 0.0, 1.0],
        );
        let batch = pack_meshes(&[mesh], 1, 1, 1, 12, "test");
        let encoded = encode_packed_shard(&batch);
        assert!(encoded.len() >= 32);
        let magic = u32::from_le_bytes(encoded[0..4].try_into().unwrap());
        assert_eq!(magic, PACKED_MAGIC);
        let version = u32::from_le_bytes(encoded[4..8].try_into().unwrap());
        assert_eq!(version, PACKED_VERSION);
        let mesh_count = u32::from_le_bytes(encoded[8..12].try_into().unwrap());
        assert_eq!(mesh_count, 1);
    }
}
