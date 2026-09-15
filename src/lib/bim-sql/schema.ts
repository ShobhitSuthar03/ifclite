/** SQLite DDL for the BIM reporting warehouse. */

export const SCHEMA_SQL = `
PRAGMA journal_mode = MEMORY;
PRAGMA synchronous = OFF;
PRAGMA temp_store = MEMORY;

CREATE TABLE models (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  version_id TEXT,
  loaded_at TEXT NOT NULL
);

CREATE TABLE spatial_locations (
  id INTEGER PRIMARY KEY,
  model_id INTEGER NOT NULL,
  express_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  elevation REAL,
  parent_express_id INTEGER
);

CREATE TABLE elements (
  id INTEGER PRIMARY KEY,
  model_id INTEGER NOT NULL,
  express_id INTEGER NOT NULL UNIQUE,
  global_id TEXT,
  ifc_type TEXT NOT NULL,
  category TEXT NOT NULL,
  name TEXT,
  description TEXT,
  object_type TEXT,
  tag TEXT,
  storey_id INTEGER,
  storey_name TEXT,
  zone_name TEXT,
  material TEXT,
  cost_code TEXT,
  boq_item TEXT,
  phase TEXT,
  status TEXT,
  volume REAL DEFAULT 0,
  area REAL DEFAULT 0,
  length REAL DEFAULT 0,
  width REAL DEFAULT 0,
  height REAL DEFAULT 0,
  weight REAL DEFAULT 0,
  count INTEGER DEFAULT 1,
  unit_cost REAL DEFAULT 0,
  total_cost REAL DEFAULT 0,
  target_cost REAL DEFAULT 0,
  fire_rating TEXT
);

CREATE TABLE element_properties (
  id INTEGER PRIMARY KEY,
  element_id INTEGER NOT NULL,
  express_id INTEGER NOT NULL,
  pset TEXT NOT NULL,
  name TEXT NOT NULL,
  value TEXT,
  numeric_value REAL
);

CREATE TABLE quantities (
  id INTEGER PRIMARY KEY,
  element_id INTEGER NOT NULL,
  express_id INTEGER NOT NULL,
  qset TEXT NOT NULL,
  name TEXT NOT NULL,
  value REAL,
  unit TEXT
);

CREATE INDEX idx_elements_storey ON elements(storey_name);
CREATE INDEX idx_elements_category ON elements(category);
CREATE INDEX idx_elements_cost ON elements(cost_code);
CREATE INDEX idx_elements_phase ON elements(phase);
CREATE INDEX idx_elements_status ON elements(status);
CREATE INDEX idx_elements_material ON elements(material);
CREATE INDEX idx_props_express ON element_properties(express_id, name);
CREATE INDEX idx_qty_express ON quantities(express_id, name);

CREATE VIEW cost_items AS
SELECT
  cost_code AS code,
  COUNT(*) AS element_count,
  SUM(volume) AS volume,
  SUM(total_cost) AS estimated_cost,
  SUM(target_cost) AS target_cost
FROM elements
GROUP BY cost_code;

CREATE VIEW v_qto_by_category AS
SELECT
  category,
  COUNT(*) AS element_count,
  SUM(volume) AS volume,
  SUM(area) AS area,
  SUM(weight) AS weight,
  SUM(count) AS qty_count
FROM elements
GROUP BY category;
`

export const CATEGORY_UNIT_RATES: Record<string, number> = {
  IfcWall: 180,
  IfcWallStandardCase: 180,
  IfcSlab: 165,
  IfcSlabStandardCase: 165,
  IfcColumn: 220,
  IfcColumnStandardCase: 220,
  IfcBeam: 205,
  IfcBeamStandardCase: 205,
  IfcDoor: 450,
  IfcWindow: 380,
  IfcStair: 190,
  IfcCovering: 95,
  IfcRoof: 175,
  IfcMember: 160,
  IfcPlate: 140,
  IfcFooting: 150,
}

export const TARGET_COST_FACTOR = 0.92
export const CONCRETE_DENSITY_KG_M3 = 2400
