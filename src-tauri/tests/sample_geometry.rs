use ifclite_desktop_lib::test_support::process_sample;

#[test]
fn sample_ifc_produces_meshes() {
    let bytes = include_bytes!("fixtures/sample.ifc");
    let result = process_sample(bytes).expect("sample geometry");
    assert!(
        result.total_vertices > 0,
        "expected vertices from the two-wall sample"
    );
    assert!(
        !result.meshes.is_empty(),
        "expected at least one mesh from the two-wall sample"
    );
}
