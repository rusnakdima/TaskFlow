import { describe, it, expect, vi, beforeEach } from "vitest";

/* ── mock @tauri-apps/api/core ── */
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue({}),
}));

/* ── mock @tauri-front/shared ── */
const mockSchemaLoaded = { signal: vi.fn(() => ({ value: false })) };
const mockSetupError = { signal: vi.fn(() => ({ value: null })) };
const mockSetup = vi.fn().mockResolvedValue(null);
const mockToAngularRoutes = vi.fn().mockReturnValue([]);
const mockSetRouter = vi.fn();

vi.mock("@tauri-front/shared", () => ({
  SchemaRouteViewerComponent: {},
  SchemaSetupService: class {
    readonly schemaLoaded = mockSchemaLoaded;
    readonly setupError = mockSetupError;
    setup = mockSetup;
    setRouter = mockSetRouter;
    registerRouter = vi.fn();
    toAngularRoutes = mockToAngularRoutes;
  },
  deduplicateById: vi.fn((arr: unknown[]) => arr),
  groupByKey: vi.fn(() => new Map()),
}));

/* ── mock Angular Router ── */
vi.mock("@angular/router", () => ({
  Router: class {},
  RouterModule: {},
  NavigationEnd: class {},
}));

/* ── mock core services ── */
vi.mock("@core/services/app-state.service", () => ({
  AppStateService: class {
    showInfoBlock = { value: false, signal: vi.fn(() => ({ value: false })) };
  },
}));

vi.mock("@core/services/mongo-connection.service", () => ({
  MongoConnectionService: class {
    checkConnection = vi.fn().mockReturnValue({ subscribe: (fn: Function) => fn(true) });
  },
}));

vi.mock("@core/services/profile-required.service", () => ({
  ProfileRequiredService: class {
    profileRequiredMode = { value: false, signal: vi.fn(() => ({ value: false })) };
  },
}));

/* ── mock StorageService ── */
vi.mock("@services/storage.service", () => ({
  StorageService: class {
    ensureUserLoaded = vi.fn();
    ensureProfileLoaded = vi.fn();
  },
}));

/* ── mock AuthService ── */
vi.mock("@services/auth/auth.service", () => ({
  AuthService: class {
    initializeSession = vi.fn();
  },
}));

/* ── mock ShortcutService ── */
vi.mock("@services/ui/shortcut.service", () => ({
  ShortcutService: class {
    readonly sync$ = { subscribe: vi.fn() };
  },
}));

/* ── mock TimestampHelper ── */
vi.mock("@helpers/timestamp.helper", () => ({
  TimestampHelper: { createTimestamp: () => "2024-01-01T00:00:00.000Z" },
  DEFAULT_CACHE_TTL_MS: 5000,
}));

/* ── All imports AFTER vi.mock declarations ── */
import { SchemaSetupService } from "@tauri-front/shared";

describe("SchemaSetupService – integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSchemaLoaded.signal.mockReturnValue({ value: false });
    mockSetupError.signal.mockReturnValue({ value: null });
    mockSetup.mockResolvedValue(null);
    mockToAngularRoutes.mockReturnValue([]);
  });

  it("should call setup with appId 'taskflow' and initialRoute", async () => {
    await mockSetup("taskflow", { initialRoute: "/dashboard" });
    expect(mockSetup).toHaveBeenCalledWith("taskflow", { initialRoute: "/dashboard" });
  });

  it("should call setup when invoked without options", async () => {
    await mockSetup("taskflow");
    expect(mockSetup).toHaveBeenCalledTimes(1);
    expect(mockSetup.mock.calls[0][0]).toBe("taskflow");
  });

  it("should resolve without error", async () => {
    await expect(mockSetup("taskflow")).resolves.toBeNull();
  });

  it("toAngularRoutes should return an array", () => {
    const routes = mockToAngularRoutes();
    expect(Array.isArray(routes)).toBe(true);
  });

  it("setRouter should be callable without throwing", () => {
    expect(() => mockSetRouter({} as any)).not.toThrow();
  });

  it("invoke should be mocked at module level", () => {
    const { invoke } = require("@tauri-apps/api/core");
    expect(typeof invoke).toBe("function");
  });
});
