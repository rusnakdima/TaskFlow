export interface ItemUpdateEvent {
  id: string;
  changes: Partial<any>;
  field?: string;
}
