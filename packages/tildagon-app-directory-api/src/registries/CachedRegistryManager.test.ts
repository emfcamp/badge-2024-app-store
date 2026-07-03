import { describe, test, expect, jest, beforeEach } from "@jest/globals";
import { createCachedRegistryManager } from "./CachedRegistryManager.js";
import type {
  RegistrySource,
  RegistrySourceFailure,
} from "./RegistrySource.js";
import { Result } from "../models/index.js";
import {
  TildagonAppReleaseIdentifier,
  type TildagonAppRelease,
  type TildagonAppReleaseIdentifier as AppId,
  type TildagonAppCategory,
} from "tildagon-app";

// ── Test helpers ─────────────────────────────────────────────

type ListingExtra = { releaseTime: string; tarballUrl: string };

function makeId(overrides: Partial<AppId> = {}): AppId {
  return {
    service: "github",
    owner: "test-owner",
    title: "test-repo",
    ...overrides,
  } as AppId;
}

/** Build a minimal valid app for testing. */
function makeApp(
  opts: {
    id?: Partial<AppId>;
    name?: string;
    version?: string;
    category?: TildagonAppCategory[];
  } = {},
): TildagonAppRelease {
  const id = makeId(opts.id);
  return {
    code: TildagonAppReleaseIdentifier.toAppCode(id),
    id,
    releaseTime: "2024-01-01T00:00:00Z",
    tarballUrl: "https://example.com/tarball.tar.gz",
    manifest: {
      app: {
        name: opts.name ?? "Test App",
        category: opts.category ?? ["Badge"],
      },
      metadata: {
        author: "tester",
        license: "MIT",
        url: "https://example.com",
        description: "A test app",
        version: opts.version ?? "1.0.0",
      },
    },
  };
}

type ListResult = Result<{ id: AppId } & ListingExtra, RegistrySourceFailure>;
type GetResult = Result<TildagonAppRelease, RegistrySourceFailure>;

/**
 * Creates a mock RegistrySource that returns controlled listing and get results.
 * Returns mutable mocks so tests can reconfigure behaviour between calls.
 */
function mockSource(opts: {
  listResults?: ListResult[];
  getResults?: Record<string, GetResult>;
}) {
  const listMock = jest.fn<() => Promise<ListResult[]>>();
  listMock.mockResolvedValue(opts.listResults ?? []);

  const getMock =
    jest.fn<
      (...args: [string, { id: AppId } & ListingExtra]) => Promise<GetResult>
    >();
  getMock.mockImplementation(async (_code, req) => {
    const key = `${req.id.owner}/${req.id.title}`;
    return (
      opts.getResults?.[key] ?? {
        type: "failure",
        failure: { id: req.id, reason: "no mock get result" },
      }
    );
  });

  return {
    list: listMock,
    get: getMock,
  } satisfies RegistrySource<ListingExtra>;
}

let clock: { now: number };

beforeEach(() => {
  clock = { now: 0 };
});

function createManager(sources: RegistrySource<any>[]) {
  return createCachedRegistryManager(sources, { clock: () => clock.now });
}

// ── Tests ────────────────────────────────────────────────────

describe("refreshAllSources", () => {
  test("populates cache from sources", async () => {
    const app1 = makeApp({
      id: { owner: "a", title: "alpha" },
      name: "Alpha",
    });
    const app2 = makeApp({
      id: { owner: "b", title: "beta" },
      name: "Beta",
      category: ["Games"],
    });

    const source = mockSource({
      listResults: [app1, app2].map((a) =>
        Result.Ok({
          id: a.id,
          releaseTime: a.releaseTime,
          tarballUrl: a.tarballUrl,
        }),
      ),
      getResults: {
        "a/alpha": Result.Ok(app1),
        "b/beta": Result.Ok(app2),
      },
    });

    const mgr = createManager([source]);
    await mgr.refreshAllSources();

    const apps = await mgr.listApps();
    expect(apps).toHaveLength(2);
    // sorted by name
    expect(apps[0].manifest.app.name).toBe("Alpha");
    expect(apps[1].manifest.app.name).toBe("Beta");
  });

  test("skip get for already-cached apps with same releaseHash", async () => {
    const app = makeApp({ id: { owner: "a", title: "alpha" } });

    const source = mockSource({
      listResults: [
        Result.Ok({
          id: app.id,
          releaseTime: app.releaseTime,
          tarballUrl: app.tarballUrl,
        }),
      ],
      getResults: { "a/alpha": Result.Ok(app) },
    });

    const mgr = createManager([source]);

    // first refresh
    await mgr.refreshAllSources();
    expect(source.get).toHaveBeenCalledTimes(1);

    // second refresh — same releaseHash, should skip get
    await mgr.refreshAllSources();
    expect(source.get).toHaveBeenCalledTimes(1); // still 1
  });

  test("refetch app when releaseHash changes", async () => {
    const appV1 = makeApp({
      id: { owner: "a", title: "alpha", releaseHash: "v1" },
    });
    const appV2 = makeApp({
      id: { owner: "a", title: "alpha", releaseHash: "v2" },
      version: "2.0.0",
    });

    const source = mockSource({});

    // first refresh with v1
    source.list.mockResolvedValue([
      Result.Ok({
        id: appV1.id,
        releaseTime: appV1.releaseTime,
        tarballUrl: appV1.tarballUrl,
      }),
    ]);
    source.get.mockResolvedValueOnce(Result.Ok(appV1));

    const mgr = createManager([source]);
    await mgr.refreshAllSources();
    expect(await mgr.listApps()).toHaveLength(1);

    // second refresh with v2
    source.list.mockResolvedValue([
      Result.Ok({
        id: appV2.id,
        releaseTime: appV2.releaseTime,
        tarballUrl: appV2.tarballUrl,
      }),
    ]);
    source.get.mockResolvedValueOnce(Result.Ok(appV2));

    await mgr.refreshAllSources();
    const apps = await mgr.listApps();
    expect(apps[0].manifest.metadata.version).toBe("2.0.0");
  });

  test("does nothing if refresh already in progress", async () => {
    const app = makeApp({ id: { owner: "a", title: "alpha" } });

    // a source that takes a while
    let resolveList!: () => void;
    const source = mockSource({
      getResults: { "a/alpha": Result.Ok(app) },
    });
    source.list.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveList = () =>
            resolve([
              Result.Ok({
                id: app.id,
                releaseTime: app.releaseTime,
                tarballUrl: app.tarballUrl,
              }),
            ]);
        }),
    );

    const mgr = createManager([source]);

    // start first refresh (doesn't complete)
    const firstRefresh = mgr.refreshAllSources();

    // try second refresh while first is in progress
    await mgr.refreshAllSources(); // should return immediately

    // complete first refresh
    resolveList!();
    await firstRefresh;

    // source.list should only be called once (from first refresh)
    expect(source.list).toHaveBeenCalledTimes(1);
  });
});

describe("getStatus", () => {
  test("returns metadata about cache state", async () => {
    const source = mockSource({});
    const mgr = createManager([source]);

    const statusBefore = mgr.getStatus();
    expect(statusBefore.cacheSize).toBe(0);
    expect(statusBefore.errorCount).toBe(0);
    expect(statusBefore.lastRefresh).toBeNull();
    expect(statusBefore.refreshInProgress).toBe(false);

    const app = makeApp({ id: { owner: "a", title: "alpha" } });
    source.list.mockResolvedValue([
      Result.Ok({
        id: app.id,
        releaseTime: app.releaseTime,
        tarballUrl: app.tarballUrl,
      }),
    ]);
    source.get.mockResolvedValueOnce(Result.Ok(app));

    clock.now = 1000;
    await mgr.refreshAllSources();

    const statusAfter = mgr.getStatus();
    expect(statusAfter.cacheSize).toBe(1);
    expect(statusAfter.errorCount).toBe(0);
    expect(statusAfter.lastRefresh).toBe("1970-01-01T00:00:01.000Z");
    expect(statusAfter.refreshInProgress).toBe(false);
  });
});

describe("getApp", () => {
  test("returns cached app", async () => {
    const app = makeApp({ id: { owner: "a", title: "alpha" } });
    const source = mockSource({
      listResults: [
        Result.Ok({
          id: app.id,
          releaseTime: app.releaseTime,
          tarballUrl: app.tarballUrl,
        }),
      ],
      getResults: { "a/alpha": Result.Ok(app) },
    });

    const mgr = createManager([source]);
    await mgr.refreshAllSources();

    const result = await mgr.getApp(app.code);
    expect(result.type).toBe("success");
    if (result.type === "success") {
      expect(result.value.manifest.app.name).toBe("Test App");
    }
  });

  test("returns failure for unknown app", async () => {
    const mgr = createManager([]);
    const result = await mgr.getApp("nonexistent");
    expect(result.type).toBe("failure");
    if (result.type === "failure") {
      expect(result.failure.reason).toBe("Not found");
    }
  });
});

describe("listErrors", () => {
  test("returns apps that failed to fetch", async () => {
    const badId = makeId({ owner: "bad", title: "app" });
    const source = mockSource({
      listResults: [
        Result.Ok({
          id: badId,
          releaseTime: "2024-01-01T00:00:00Z",
          tarballUrl: "",
        }),
      ],
      getResults: {
        "bad/app": {
          type: "failure",
          failure: { id: badId, reason: "tildagon.toml parse error" },
        },
      },
    });

    const mgr = createManager([source]);
    await mgr.refreshAllSources();

    const errors = await mgr.listErrors();
    expect(errors).toHaveLength(1);
    expect(errors[0].reason).toBe("tildagon.toml parse error");
  });
});
