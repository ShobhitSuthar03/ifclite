export { SCHEMA_SQL } from '@/lib/bim-sql/schema'
export {
  openBimDatabase,
  openBimDatabaseFromBytes,
  exportBimDatabase,
  closeBimDatabase,
  type BimDatabase,
} from '@/lib/bim-sql/database'
export { ingestWarehouse, insertElementRecords, applyGeometryQuantities, collectElementRecords, collectElementRecordsRange, listWarehouseElementIds, startWarehouseIngest, WAREHOUSE_INGEST_CHUNK } from '@/lib/bim-sql/ingest'
export { applyMutationPatchToWarehouse, applyMutationPatchesToWarehouse } from '@/lib/bim-sql/mutate'
export {
  spatialTreeFromWarehouse,
  entityDataFromWarehouse,
  elementLookupFromWarehouse,
  expressIdsByGlobalIds,
  globalIdsByExpressIds,
} from '@/lib/bim-sql/restore'
export { propertyCatalogFromWarehouse, queryWarehouse, groupingCatalog } from '@/lib/bim-sql/catalog'
export type { PropertyCatalogSet, WarehouseQueryRow } from '@/lib/bim-sql/catalog'
export { buildWarehousePropertyTree, warehouseScopeIds, loadValueLabels, sumNumericValues } from '@/lib/bim-sql/property-tree'
export {
  REPORT_TEMPLATES,
  GROUP_BY_OPTIONS,
  METRIC_OPTIONS,
  applyScope,
  loadFilterOptions,
  queryElementIds,
  queryQaIds,
  runReport,
} from '@/lib/bim-sql/queries'
export { reportToCsv, reportToJson, reportToSpreadsheetXml, downloadTextFile } from '@/lib/bim-sql/export'
export { EMPTY_REPORT_FILTER } from '@/lib/bim-sql/types'
export type {
  ReportTemplate,
  GroupByField,
  MetricField,
  ReportFilter,
  ReportResult,
  ReportRow,
  FilterOptions,
  ElementRecord,
} from '@/lib/bim-sql/types'
