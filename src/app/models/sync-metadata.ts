export interface SyncMetadata {
  is_owner: boolean;
  is_private: boolean;
  visibility?: "private" | "team";
  has_conflict?: boolean;
}
