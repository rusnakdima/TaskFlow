export interface RelationLoadingStats {
  totalRelations?: number;
  loadedRelations?: number;
  failedRelations?: number;
  duration?: number;
  totalQueries?: number;
  loadTimeMs?: number;
}
