import { describe, it, expect } from "vitest";
import {
  DEFAULT_CACHE_TTL_MS,
  REQUEST_TTL_MS,
  SELECTION_TTL_MS,
  CONFLICT_TTL_MS,
  TimestampHelper,
} from "./timestamp.helper";

describe("timestamp.helper", () => {
  describe("constants", () => {
    it("should have correct DEFAULT_CACHE_TTL_MS", () => {
      expect(DEFAULT_CACHE_TTL_MS).toBe(5 * 60 * 1000); // 5 minutes
    });

    it("should have correct REQUEST_TTL_MS", () => {
      expect(REQUEST_TTL_MS).toBe(30 * 1000); // 30 seconds
    });

    it("should have correct SELECTION_TTL_MS", () => {
      expect(SELECTION_TTL_MS).toBe(10 * 60 * 1000); // 10 minutes
    });

    it("should have correct CONFLICT_TTL_MS", () => {
      expect(CONFLICT_TTL_MS).toBe(10 * 60 * 1000); // 10 minutes
    });
  });

  describe("TimestampHelper", () => {
    it("should create a valid ISO timestamp", () => {
      const timestamp = TimestampHelper.createTimestamp();
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
    });

    it("should create timestamp close to current time", () => {
      const before = Date.now();
      const timestamp = TimestampHelper.createTimestamp();
      const after = Date.now();
      const parsed = new Date(timestamp).getTime();
      expect(parsed).toBeGreaterThanOrEqual(before);
      expect(parsed).toBeLessThanOrEqual(after);
    });

    it("should return different timestamps on subsequent calls", async () => {
      const first = TimestampHelper.createTimestamp();
      await new Promise((resolve) => setTimeout(resolve, 10));
      const second = TimestampHelper.createTimestamp();
      expect(first).not.toBe(second);
    });
  });
});
