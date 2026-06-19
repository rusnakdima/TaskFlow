import { PaginationState } from "@entities/storage.model";

export const DEFAULT_PAGINATION: PaginationState = { skip: 0, limit: 20, hasMore: true };

export function updatePagination(
  pagination: Record<string, PaginationState>,
  type: string,
  skip: number,
  limit: number,
  receivedCount: number
): Record<string, PaginationState> {
  return {
    ...pagination,
    [type]: { skip: skip + receivedCount, limit, hasMore: receivedCount >= limit },
  };
}
