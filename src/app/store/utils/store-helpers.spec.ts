import { describe, it, expect, vi } from "vitest";

// Single mock for @tauri-front/shared to avoid conflicts
vi.mock("@tauri-front/shared", () => ({
  findById: () => undefined,
  isValidEmail: () => true,
}));

// Use dynamic imports because vi.mock only intercepts dynamic imports in bun test
const getHelpers = () => import("./store-helpers");
const getValidators = () => import("../../shared/auth.validators");

describe("store-helpers", () => {
  describe("deduplicateById", () => {
    it("should keep the newer entity when duplicates have different updated_at", async () => {
      const { deduplicateById } = await getHelpers();
      const entities = [
        { id: "1", updated_at: "2024-01-01T00:00:00Z" },
        { id: "1", updated_at: "2024-01-02T00:00:00Z" },
      ];
      const result = deduplicateById(entities);
      expect(result).toHaveLength(1);
      expect(result[0].updated_at).toBe("2024-01-02T00:00:00Z");
    });

    it("should keep the first entity when updated_at is equal", async () => {
      const { deduplicateById } = await getHelpers();
      const entities = [
        { id: "1", updated_at: "2024-01-01T00:00:00Z" },
        { id: "1", updated_at: "2024-01-01T00:00:00Z" },
      ];
      const result = deduplicateById(entities);
      expect(result).toHaveLength(1);
    });

    it("should filter deleted entities when filterDeleted is true", async () => {
      const { deduplicateById } = await getHelpers();
      const entities = [
        { id: "1", deleted_at: null, updated_at: "2024-01-01T00:00:00Z" },
        { id: "2", deleted_at: "2024-01-01T00:00:00Z", updated_at: "2024-01-02T00:00:00Z" },
      ];
      const result = deduplicateById(entities, { filterDeleted: true });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("1");
    });
  });

  describe("addEntityToArray", () => {
    it("should add entity to the beginning if not duplicate", async () => {
      const { addEntityToArray } = await getHelpers();
      const entities = [{ id: "1" }, { id: "2" }];
      const result = addEntityToArray(entities, { id: "3" });
      expect(result[0].id).toBe("3");
      expect(result).toHaveLength(3);
    });

    it("should not add entity if duplicate id exists", async () => {
      const { addEntityToArray } = await getHelpers();
      const entities = [{ id: "1" }, { id: "2" }];
      const result = addEntityToArray(entities, { id: "1" });
      expect(result).toHaveLength(2);
    });
  });

  describe("removeEntityFromArray", () => {
    it("should remove entity by id", async () => {
      const { removeEntityFromArray } = await getHelpers();
      const entities = [{ id: "1" }, { id: "2" }, { id: "3" }];
      const result = removeEntityFromArray(entities, "2");
      expect(result).toHaveLength(2);
      expect(result.find((e) => e.id === "2")).toBeUndefined();
    });
  });

  describe("updateEntityInArray", () => {
    it("should update entity fields by id", async () => {
      const { updateEntityInArray } = await getHelpers();
      const entities = [{ id: "1", name: "old" }, { id: "2", name: "also old" }];
      const result = updateEntityInArray(entities, "1", { name: "new" });
      expect(result[0].name).toBe("new");
      expect(result[1].name).toBe("also old");
    });
  });

  describe("findByParentId", () => {
    it("should find entities by parent_id", async () => {
      const { findByParentId } = await getHelpers();
      const entities = [
        { id: "1", parent_id: "a" },
        { id: "2", parent_id: "b" },
        { id: "3", parent_id: "a" },
      ];
      const result = findByParentId(entities, "a");
      expect(result).toHaveLength(2);
    });
  });

  describe("existsById", () => {
    it("should return true for existing id", async () => {
      const { existsById } = await getHelpers();
      const entities = [{ id: "1" }, { id: "2" }];
      expect(existsById(entities, "1")).toBe(true);
    });

    it("should return false for non-existing id", async () => {
      const { existsById } = await getHelpers();
      const entities = [{ id: "1" }];
      expect(existsById(entities, "99")).toBe(false);
    });
  });

  describe("upsertEntity", () => {
    it("should add entity to beginning if not existing", async () => {
      const { upsertEntity } = await getHelpers();
      const entities = [{ id: "1" }];
      const result = upsertEntity(entities, { id: "2" });
      expect(result[0].id).toBe("2");
    });

    it("should update existing entity when updateExisting is true", async () => {
      const { upsertEntity } = await getHelpers();
      const entities = [{ id: "1", name: "old" }];
      const result = upsertEntity(entities, { id: "1", name: "new" });
      expect(result[0].name).toBe("new");
    });

    it("should not update existing entity when updateExisting is false", async () => {
      const { upsertEntity } = await getHelpers();
      const entities = [{ id: "1", name: "old" }];
      const result = upsertEntity(entities, { id: "1", name: "new" }, false);
      expect(result[0].name).toBe("old");
    });
  });

  describe("mergeAndDeduplicate", () => {
    it("should merge arrays and deduplicate by id", async () => {
      const { mergeAndDeduplicate } = await getHelpers();
      const a = [{ id: "1" }];
      const b = [{ id: "1" }, { id: "2" }];
      const result = mergeAndDeduplicate(a, b);
      expect(result).toHaveLength(2);
    });
  });

  describe("groupByKey", () => {
    it("should group entities by key function", async () => {
      const { groupByKey } = await getHelpers();
      const entities = [{ id: "1", type: "a" }, { id: "2", type: "b" }, { id: "3", type: "a" }];
      const result = groupByKey(entities, (e: any) => e.type);
      expect(result.get("a")).toHaveLength(2);
      expect(result.get("b")).toHaveLength(1);
    });
  });

  describe("createEntityLookupMap", () => {
    it("should create a map keyed by id", async () => {
      const { createEntityLookupMap } = await getHelpers();
      const entities = [{ id: "1" }, { id: "2" }];
      const result = createEntityLookupMap(entities);
      expect(result.get("1")).toEqual({ id: "1" });
      expect(result.get("2")).toEqual({ id: "2" });
    });
  });

  describe("applyUpdate", () => {
    it("should apply updates to entity", async () => {
      const { applyUpdate } = await getHelpers();
      const entity = { id: "1", name: "old", extra: "kept" };
      const result = applyUpdate(entity, { name: "new" });
      expect(result).toEqual({ id: "1", name: "new", extra: "kept" });
    });
  });

  describe("batchUpdateEntities", () => {
    it("should apply batch updates to matching entities", async () => {
      const { batchUpdateEntities } = await getHelpers();
      const entities = [{ id: "1", name: "a" }, { id: "2", name: "b" }];
      const updates = new Map([["1", { name: "updated" }]]);
      const result = batchUpdateEntities(entities, updates);
      expect(result[0].name).toBe("updated");
      expect(result[1].name).toBe("b");
    });
  });

  describe("entitiesEqual", () => {
    it("should return false if ids differ", async () => {
      const { entitiesEqual } = await getHelpers();
      expect(entitiesEqual({ id: "1" }, { id: "2" })).toBe(false);
    });

    it("should return true if same id and no fields specified", async () => {
      const { entitiesEqual } = await getHelpers();
      expect(entitiesEqual({ id: "1", name: "a" }, { id: "1", name: "b" })).toBe(true);
    });

    it("should compare only specified fields", async () => {
      const { entitiesEqual } = await getHelpers();
      expect(
        entitiesEqual({ id: "1", name: "a", extra: "x" }, { id: "1", name: "b", extra: "y" }, ["name"])
      ).toBe(false);
    });
  });

  describe("deduplicateAndFilterDeleted", () => {
    it("should deduplicate and filter deleted entities", async () => {
      const { deduplicateAndFilterDeleted } = await getHelpers();
      const entities = [
        { id: "1", deleted_at: null, updated_at: "2024-01-01T00:00:00Z" },
        { id: "1", deleted_at: "2024-01-01T00:00:00Z", updated_at: "2024-01-02T00:00:00Z" },
        { id: "2", deleted_at: null, updated_at: "2024-01-01T00:00:00Z" },
      ];
      const result = deduplicateAndFilterDeleted(entities);
      expect(result).toHaveLength(2);
      expect(result.find((e: any) => e.id === "1")?.deleted_at).toBeNull();
    });
  });
});

describe("auth.validators", () => {
  const mockControl = (value: unknown) => ({ value } as any);

  describe("minLengthValidator", () => {
    it("should return null for value meeting minimum length", async () => {
      const { minLengthValidator } = await getValidators();
      const validator = minLengthValidator(3);
      const result = validator(mockControl("abc"));
      expect(result).toBeNull();
    });

    it("should return null for empty value", async () => {
      const { minLengthValidator } = await getValidators();
      const validator = minLengthValidator(3);
      const result = validator(mockControl(""));
      expect(result).toBeNull();
    });

    it("should return null for null value", async () => {
      const { minLengthValidator } = await getValidators();
      const validator = minLengthValidator(3);
      const result = validator(mockControl(null));
      expect(result).toBeNull();
    });

    it("should return minLength error for value below minimum", async () => {
      const { minLengthValidator } = await getValidators();
      const validator = minLengthValidator(5);
      const result = validator(mockControl("ab"));
      expect(result).toEqual({ minLength: { requiredLength: 5, actualLength: 2 } });
    });

    it("should return minLength error for string shorter than minLength", async () => {
      const { minLengthValidator } = await getValidators();
      const validator = minLengthValidator(8);
      const result = validator(mockControl("1234567"));
      expect(result?.minLength.actualLength).toBe(7);
    });
  });

  describe("patternValidator", () => {
    it("should return null for value matching pattern", async () => {
      const { patternValidator } = await getValidators();
      const validator = patternValidator(/^[a-z]+$/);
      const result = validator(mockControl("abc"));
      expect(result).toBeNull();
    });

    it("should return pattern error for value not matching pattern", async () => {
      const { patternValidator } = await getValidators();
      const validator = patternValidator(/^[a-z]+$/);
      const result = validator(mockControl("ABC"));
      expect(result).toEqual({ pattern: true });
    });

    it("should return null for empty value", async () => {
      const { patternValidator } = await getValidators();
      const validator = patternValidator(/^[a-z]+$/);
      const result = validator(mockControl(""));
      expect(result).toBeNull();
    });

    it("should return null for null value", async () => {
      const { patternValidator } = await getValidators();
      const validator = patternValidator(/^[a-z]+$/);
      const result = validator(mockControl(null));
      expect(result).toBeNull();
    });

    it("should use custom error key", async () => {
      const { patternValidator } = await getValidators();
      const validator = patternValidator(/^[0-9]+$/, "numbersOnly");
      const result = validator(mockControl("abc"));
      expect(result).toEqual({ numbersOnly: true });
    });
  });
});
