"""Bakes IFClite's mutation overlay (property/attribute edits) into a real IFC file.

Used because the JS-side IFC ecosystem this app depends on (@ifc-lite/*) doesn't yet
ship a STEP writer - ifcopenshell does, and is the de facto standard tool for this.

Invoked as:
    python export_ifc.py <request.json>

request.json shape (mirrors this app's MutationPatch[] type directly, no separate
schema to keep in sync):
{
  "sourcePath": "C:\\...\\model.ifc",
  "outputPath": "C:\\...\\model-edited.ifc",
  "mutations": [
    {"expressId": 64, "kind": "property", "pset": "Qto_Manual", "name": "ManualFormworkGrossArea", "value": "12.345"},
    {"expressId": 64, "kind": "attribute", "name": "Description", "value": "Updated"}
  ]
}

Prints exactly one JSON line to stdout: {"ok": true, "outputPath": "..."} or
{"ok": false, "error": "..."}. Everything else (ifcopenshell's own diagnostic
prints, tracebacks) goes to stderr so stdout stays parseable.
"""

import contextlib
import json
import sys
import traceback


def numeric_or_text(value: str):
    """IFC property value typing: a plain number becomes IfcReal, otherwise IfcText."""
    try:
        return float(value)
    except (TypeError, ValueError):
        return value


def group_property_mutations(mutations):
    """{(expressId, pset): {name: value}} - one edit_pset call per element+pset."""
    groups: dict[tuple[int, str], dict[str, object]] = {}
    for mutation in mutations:
        if mutation.get("kind") != "property":
            continue
        pset = mutation.get("pset")
        if not pset:
            continue
        key = (mutation["expressId"], pset)
        groups.setdefault(key, {})[mutation["name"]] = numeric_or_text(mutation["value"])
    return groups


def apply_attribute_mutations(file, mutations):
    for mutation in mutations:
        if mutation.get("kind") != "attribute":
            continue
        element = file.by_id(mutation["expressId"])
        if element is None:
            continue
        # Root attributes (Name, Description, ObjectType, Tag, ...) are plain
        # Python attributes on the wrapped entity - no API call needed.
        setattr(element, mutation["name"], mutation["value"])


def find_pset(element, name):
    for rel in element.IsDefinedBy or ():
        definition = getattr(rel, "RelatingPropertyDefinition", None)
        if definition is not None and definition.is_a("IfcPropertySet") and definition.Name == name:
            return definition
    return None


def apply_property_mutations(file, mutations):
    import ifcopenshell.api

    for (express_id, pset_name), properties in group_property_mutations(mutations).items():
        element = file.by_id(express_id)
        if element is None:
            continue
        pset = find_pset(element, pset_name)
        if pset is None:
            pset = ifcopenshell.api.run("pset.add_pset", file, product=element, name=pset_name)
        ifcopenshell.api.run("pset.edit_pset", file, pset=pset, properties=properties)


def main():
    if len(sys.argv) != 2:
        print(json.dumps({"ok": False, "error": "usage: export_ifc.py <request.json>"}))
        return 1

    with open(sys.argv[1], "r", encoding="utf-8") as handle:
        request = json.load(handle)

    # ifcopenshell.api prints its own diagnostic notes (e.g. Blender-only sub-APIs
    # being unavailable) to stdout at import time - redirect anything IFC-related
    # writes there to stderr so stdout stays exactly one JSON line for the caller.
    with contextlib.redirect_stdout(sys.stderr):
        import ifcopenshell

        file = ifcopenshell.open(request["sourcePath"])
        apply_property_mutations(file, request.get("mutations", []))
        apply_attribute_mutations(file, request.get("mutations", []))
        file.write(request["outputPath"])

    print(json.dumps({"ok": True, "outputPath": request["outputPath"]}))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # noqa: BLE001 - report every failure back to the caller
        traceback.print_exc(file=sys.stderr)
        print(json.dumps({"ok": False, "error": str(exc)}))
        sys.exit(1)
