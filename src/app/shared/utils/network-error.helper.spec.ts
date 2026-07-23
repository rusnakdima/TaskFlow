import { describe, it, expect } from "vitest";
import { NetworkErrorHelper } from "./network-error.helper";

describe("NetworkErrorHelper", () => {
  describe("isNetworkError", () => {
    it("should return true for network error messages", () => {
      expect(NetworkErrorHelper.isNetworkError(new Error("NetworkError"))).toBe(true);
      expect(NetworkErrorHelper.isNetworkError(new Error("network"))).toBe(true);
      expect(NetworkErrorHelper.isNetworkError(new Error("offline"))).toBe(true);
      expect(NetworkErrorHelper.isNetworkError(new Error("Failed to fetch"))).toBe(true);
    });

    it("should return true for server selection timeout", () => {
      expect(NetworkErrorHelper.isNetworkError(new Error("Server selection timeout"))).toBe(true);
    });

    it("should return true for connection refused", () => {
      expect(NetworkErrorHelper.isNetworkError(new Error("Connection refused"))).toBe(true);
    });

    it("should return true for timeout errors", () => {
      const error = new Error("Request timed out");
      error.name = "TimeoutError";
      expect(NetworkErrorHelper.isNetworkError(error)).toBe(true);
    });

    it("should return true for NetworkError name", () => {
      const error = new Error("Something went wrong");
      error.name = "NetworkError";
      expect(NetworkErrorHelper.isNetworkError(error)).toBe(true);
    });

    it("should return false for non-network errors", () => {
      expect(NetworkErrorHelper.isNetworkError(new Error("Invalid input"))).toBe(false);
      expect(NetworkErrorHelper.isNetworkError(new Error("User not found"))).toBe(false);
    });
  });

  describe("isMongoConnectionError", () => {
    it("should return true for MongoDB connection errors", () => {
      expect(
        NetworkErrorHelper.isMongoConnectionError(new Error("MongoDB connection failed"))
      ).toBe(true);
      expect(NetworkErrorHelper.isMongoConnectionError(new Error("mongodb"))).toBe(true);
      expect(NetworkErrorHelper.isMongoConnectionError(new Error("Server selection timeout"))).toBe(
        true
      );
    });

    it("should return false for non-MongoDB errors", () => {
      expect(NetworkErrorHelper.isMongoConnectionError(new Error("Invalid password"))).toBe(false);
    });
  });

  describe("isAuthenticationError", () => {
    it("should return true for auth failure messages", () => {
      expect(NetworkErrorHelper.isAuthenticationError(new Error("Invalid password"))).toBe(true);
      expect(NetworkErrorHelper.isAuthenticationError(new Error("Wrong password"))).toBe(true);
      expect(NetworkErrorHelper.isAuthenticationError(new Error("Authentication failed"))).toBe(
        true
      );
      expect(NetworkErrorHelper.isAuthenticationError(new Error("Unauthorized"))).toBe(true);
    });

    it("should return false for non-auth errors", () => {
      expect(NetworkErrorHelper.isAuthenticationError(new Error("Network error"))).toBe(false);
    });
  });

  describe("getNetworkErrorMessage", () => {
    it("should return MongoDB-specific message for connection errors", () => {
      const msg = NetworkErrorHelper.getNetworkErrorMessage(new Error("MongoDB connection failed"));
      expect(msg).toContain("Cannot connect to database");
    });

    it("should return network-specific message for network errors", () => {
      const msg = NetworkErrorHelper.getNetworkErrorMessage(new Error("Network error"));
      expect(msg).toContain("Unable to connect to server");
    });

    it("should return original message for auth errors that have messages", () => {
      const msg = NetworkErrorHelper.getNetworkErrorMessage(new Error("Invalid password"));
      expect(msg).toBe("Invalid password");
    });

    it("should return original message for unknown errors", () => {
      const msg = NetworkErrorHelper.getNetworkErrorMessage(new Error("Something went wrong"));
      expect(msg).toBe("Something went wrong");
    });
  });

  describe("getTroubleshootingSteps", () => {
    it("should return MongoDB troubleshooting steps", () => {
      const steps = NetworkErrorHelper.getTroubleshootingSteps(
        new Error("MongoDB connection failed")
      );
      expect(steps).toContain("Check if MongoDB server is running");
    });

    it("should return network troubleshooting steps", () => {
      const steps = NetworkErrorHelper.getTroubleshootingSteps(new Error("Network error"));
      expect(steps).toContain("Check your internet connection");
    });

    it("should return empty array for non-network errors", () => {
      const steps = NetworkErrorHelper.getTroubleshootingSteps(new Error("Something went wrong"));
      expect(steps).toHaveLength(0);
    });
  });

  describe("formatErrorMessage", () => {
    it("should include troubleshooting steps when present", () => {
      const msg = NetworkErrorHelper.formatErrorMessage(new Error("MongoDB connection failed"));
      expect(msg).toContain("Please check:");
      expect(msg).toContain("1. Check if MongoDB server is running");
    });

    it("should return just the message when no troubleshooting steps", () => {
      const msg = NetworkErrorHelper.formatErrorMessage(new Error("Simple error"));
      expect(msg).toBe("Simple error");
    });
  });
});
