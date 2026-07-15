import { describe, it, expect } from "vitest";
import { 
  findByParentId, 
  updateEntityInArray, 
  addEntityToArray, 
  upsertEntityBulk, 
  deduplicateAndFilterDeleted 
} from "./store-helpers";
import { deduplicateById } from "@tauri-front/shared";

describe("store-helpers", () => {
  describe("findByParentId", () => {
    it("should find entities by parent_id", () => {
      const entities = [
        { id: "1", parent_id: "a", name: "Item 1" },
        { id: "2", parent_id: "b", name: "Item 2" },
        { id: "3", parent_id: "a", name: "Item 3" },
      ];
      const result = findByParentId(entities, "a");
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("Item 1");
    });
  });

  describe("updateEntityInArray", () => {
    it("should update entity by id", () => {
      const entities = [
        { id: "1", name: "Item 1" },
        { id: "2", name: "Item 2" },
      ];
      const result = updateEntityInArray(entities, "1", { name: "Updated" });
      expect(result[0].name).toBe("Updated");
      expect(result[1].name).toBe("Item 2");
    });
  });

  describe("addEntityToArray", () => {
    it("should add entity if not exists", () => {
      const entities = [{ id: "1", name: "Item 1" }];
      const newEntity = { id: "2", name: "Item 2" };
      const result = addEntityToArray(entities, newEntity);
      expect(result).toHaveLength(2);
    });

    it("should not add duplicate", () => {
      const entities = [{ id: "1", name: "Item 1" }];
      const result = addEntityToArray(entities, { id: "1", name: "Item 1" });
      expect(result).toHaveLength(1);
    });
  });

  describe("upsertEntityBulk", () => {
    it("should add new entities", () => {
      const existing = [{ id: "1", name: "Item 1" }];
      const newEntities = [{ id: "2", name: "Item 2" }];
      const result = upsertEntityBulk(existing, newEntities);
      expect(result).toHaveLength(2);
    });

    it("should update existing entities", () => {
      const existing = [{ id: "1", name: "Item 1" }];
      const newEntities = [{ id: "1", name: "Updated" }];
      const result = upsertEntityBulk(existing, newEntities, true);
      expect(result[0].name).toBe("Updated");
    });
  });

  describe("deduplicateById", () => {
    it("should deduplicate by id", () => {
      const dupes = [{ id: "1", name: "A" }, { id: "1", name: "B" }, { id: "2", name: "C" }];
      const result = deduplicateById(dupes);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("1");
    });

    it("should filter deleted when filterDeleted=true", () => {
      const entities = [
        { id: "1", name: "A", deleted_at: "2024-01-01" },
        { id: "2", name: "B", deleted_at: null },
        { id: "3", name: "C", deleted_at: undefined },
      ];
      const result = deduplicateById(entities, { filterDeleted: true });
      expect(result).toHaveLength(2);
      expect(result.find((e: any) => e.id === "1")).toBeUndefined();
    });
  });

  describe("deduplicateAndFilterDeleted", () => {
    it("should deduplicate and filter deleted", () => {
      const entities = [
        { id: "1", name: "A", deleted_at: "2024-01-01", updated_at: "2024-01-01" },
        { id: "1", name: "B", deleted_at: null, updated_at: "2024-01-02" },
        { id: "2", name: "C", deleted_at: undefined, updated_at: "2024-01-03" },
      ];
      const result = deduplicateAndFilterDeleted(entities);
      expect(result).toHaveLength(2);
      expect(result.find((e) => e.id === "1")).toBeDefined();
    });
  });
});
