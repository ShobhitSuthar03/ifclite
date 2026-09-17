export type EstimatorToolName =
  | 'assembly_search'
  | 'assembly_get'
  | 'assembly_classify'
  | 'estimation_get'
  | 'qto_for_ids'
  | 'skip_classify'
  | 'estimation_assign_assembly'
  | 'estimation_set_qty_binding'
  | 'estimation_set_included'
  | 'estimation_build_boq'
  | 'estimation_seed_sample'
  | 'desktop_select'
  | 'desktop_isolate'
  | 'desktop_show_all'
  | 'property_search'

export type EstimatorToolDef = {
  name: EstimatorToolName
  description: string
  mutate: boolean
  parameters: Record<string, unknown>
}

const PROPERTY_REF = {
  type: 'object',
  properties: {
    set: { type: 'string' },
    name: { type: 'string' },
    kind: { type: 'string', enum: ['property', 'quantity', 'attribute'] },
  },
  required: ['name', 'kind'],
}

export const ESTIMATOR_TOOL_DEFINITIONS: EstimatorToolDef[] = [
  {
    name: 'assembly_search',
    description:
      'Search the Cost Assembly Store (Bausteinkatalog XML), not IFC cost_data. Tokenized + synonyms (wall/wand/muur, concrete/beton). Empty query lists items.',
    mutate: false,
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Free-text query (code, description, path, component names).' },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 15 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'assembly_get',
    description: 'Load one Cost Assembly Store item with flattened L/M/P build-up rows (qty, factor, rate).',
    mutate: false,
    parameters: {
      type: 'object',
      properties: {
        assembly_id: { type: 'string' },
        code: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'assembly_classify',
    description:
      'Suggest Cost Assembly Store items for IFC elements using class/name synonyms. Prefer this over a single English phrase like "Concrete Wall".',
    mutate: false,
    parameters: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'integer' } },
        ifc_type: { type: 'string', description: 'e.g. IfcWall' },
        name: { type: 'string' },
        query: { type: 'string', description: 'Optional extra terms (material, thickness).' },
        limit: { type: 'integer', minimum: 1, maximum: 20, default: 8 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'estimation_get',
    description: 'Read the live BOQs: list of sheets, the active sheet forest, element ids, assigned assembly, qty, and amount. Grouping is per BOQ.',
    mutate: false,
    parameters: {
      type: 'object',
      properties: {
        node_id: { type: 'string', description: 'Optional BOQ node id. Omit to return the forest.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'qto_for_ids',
    description:
      'Sum takeoff fields (VOLUME, LATERALAREA, GROSSAREA, …) for express ids. If not already stored, asks the desktop app to compute mesh takeoff for those ids (not whole-model).',
    mutate: false,
    parameters: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'integer' } },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Takeoff metric keys. Default: VOLUME, LATERALAREA, GROSSAREA, LENGTH, COUNT.',
        },
      },
      required: ['ids'],
      additionalProperties: false,
    },
  },
  {
    name: 'skip_classify',
    description:
      'Classify express ids as skip vs calculate: openings, spaces, zones, zero-volume, and temporary/aux names.',
    mutate: false,
    parameters: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'integer' } },
      },
      required: ['ids'],
      additionalProperties: false,
    },
  },
  {
    name: 'estimation_assign_assembly',
    description: 'Assign (or clear) a Cost Assembly Store item on a BOQ node.',
    mutate: true,
    parameters: {
      type: 'object',
      properties: {
        node_id: { type: 'string' },
        assembly_id: { type: ['string', 'null'], description: 'Catalog assembly id, or null to clear.' },
      },
      required: ['node_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'estimation_set_qty_binding',
    description:
      'Set how a build-up line gets quantity: catalog, assembly, takeoff field (e.g. LATERALAREA), or an IFC property.',
    mutate: true,
    parameters: {
      type: 'object',
      properties: {
        assembly_id: { type: 'string' },
        row_id: { type: 'string' },
        mode: { type: 'string', enum: ['catalog', 'assembly', 'takeoff', 'ifc'] },
        field: { type: 'string', description: 'Required when mode=takeoff (VOLUME, LATERALAREA, …).' },
        property: PROPERTY_REF,
      },
      required: ['assembly_id', 'row_id', 'mode'],
      additionalProperties: false,
    },
  },
  {
    name: 'estimation_set_included',
    description: 'Tick / untick a cost build-up line so it is included in or excluded from the estimate.',
    mutate: true,
    parameters: {
      type: 'object',
      properties: {
        assembly_id: { type: 'string' },
        row_id: { type: 'string' },
        included: { type: 'boolean' },
      },
      required: ['assembly_id', 'row_id', 'included'],
      additionalProperties: false,
    },
  },
  {
    name: 'estimation_build_boq',
    description: 'Rebuild the BOQ grouping using property refs (IFC Type, Storey, …). Max 3 levels.',
    mutate: true,
    parameters: {
      type: 'object',
      properties: {
        group_by: { type: 'array', items: PROPERTY_REF },
      },
      required: ['group_by'],
      additionalProperties: false,
    },
  },
  {
    name: 'estimation_seed_sample',
    description:
      'Build a sample BOQ from the current selection (or property-tree preview): skip openings/spaces, classify each IFC type onto a Cost Assembly Store recipe, assign it, and queue mesh takeoff. Prefer this for “create a sample BOQ”. Do not run whole-model.',
    mutate: true,
    parameters: {
      type: 'object',
      properties: {
        limit_types: { type: 'integer', minimum: 1, maximum: 30, default: 12 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'desktop_select',
    description:
      'Select IFC elements in the 3D viewer by express id. Use after property_search or query_entities so the user can see the set.',
    mutate: false,
    parameters: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'integer' } },
        additive: { type: 'boolean', description: 'If true, add to the current selection instead of replacing it.' },
      },
      required: ['ids'],
      additionalProperties: false,
    },
  },
  {
    name: 'desktop_isolate',
    description:
      'Isolate (or ghost) express ids in the 3D viewer and fit the camera. Omit ids to isolate the current selection.',
    mutate: false,
    parameters: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'integer' } },
        mode: { type: 'string', enum: ['isolate', 'ghost'], description: 'isolate hides the rest; ghost keeps context faded.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'desktop_show_all',
    description: 'Clear isolation/filters and show the whole model in the 3D viewer.',
    mutate: false,
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'property_search',
    description:
      'Find elements by IFC type, name, storey, or property/quantity clause (the Filters panel). Optionally select and isolate matches in the viewer.',
    mutate: false,
    parameters: {
      type: 'object',
      properties: {
        ifc_type: { type: 'string', description: 'e.g. IfcWall, IfcSlab, IfcColumn' },
        name_contains: { type: 'string' },
        storey: { type: 'string', description: 'Storey / level name contains' },
        set: { type: 'string', description: 'Property or quantity set, e.g. Pset_WallCommon' },
        name: { type: 'string', description: 'Property or quantity name, e.g. IsExternal, LoadBearing' },
        op: { type: 'string', enum: ['=', '!=', '>', '>=', '<', '<=', 'contains', 'startsWith'] },
        value: { type: 'string' },
        select: { type: 'boolean', default: true },
        isolate: { type: 'boolean', default: false, description: 'If true, isolate matches in the viewer.' },
        limit: { type: 'integer', minimum: 1, maximum: 200, default: 80 },
      },
      additionalProperties: false,
    },
  },
]

export const BIM_PROXY_TOOL_DEFINITIONS: Array<{
  name: string
  description: string
  parameters: Record<string, unknown>
}> = [
  {
    name: 'query_entities',
    description: 'Filter IFC entities by type, property, or storey. Returns matching express ids.',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string' },
        types: { type: 'array', items: { type: 'string' } },
        limit: { type: 'integer' },
        offset: { type: 'integer' },
      },
      additionalProperties: true,
    },
  },
  {
    name: 'geometry_volume',
    description: 'Read IfcElementQuantity volume for express ids or GlobalIds.',
    parameters: {
      type: 'object',
      properties: {
        express_id: { type: 'integer' },
        express_ids: { type: 'array', items: { type: 'integer' } },
        global_id: { type: 'string' },
        global_ids: { type: 'array', items: { type: 'string' } },
      },
      additionalProperties: true,
    },
  },
  {
    name: 'geometry_area',
    description: 'Read IfcElementQuantity area for express ids or GlobalIds.',
    parameters: {
      type: 'object',
      properties: {
        express_id: { type: 'integer' },
        express_ids: { type: 'array', items: { type: 'integer' } },
        global_id: { type: 'string' },
        global_ids: { type: 'array', items: { type: 'string' } },
      },
      additionalProperties: true,
    },
  },
]
