# Tildagon App Store

The [app store](https://apps.badge.emfcamp.org/) for
[Tildagon](https://tildagon.badge.emfcamp.org/), the EMFcamp badge. Fetches apps
from code forges (GitHub, Codeberg) and serves them via a REST API and Astro-powered
website.

## Submitting an app

To find out how to write and publish an app for the Tildagon, check out the
[Tildagon Apps documentation](https://tildagon.badge.emfcamp.org/tildagon-apps/publish/).

## Architecture

The app store is a TypeScript monorepo with the following packages:

| Package                       | Description                                                                |
| ----------------------------- | -------------------------------------------------------------------------- |
| `tildagon-app`                | Shared types and Zod schemas for app manifests, releases, and identifiers  |
| `tildagon-app-directory-api`  | Backend: fetches apps from registries, serves the HTTP API, runs Astro SSR |
| `tildagon-app-directory-site` | Astro frontend (pages, components, layouts)                                |
| `openapi-spec`                | Generates the OpenAPI 3.1 spec and TypeScript types from it                |

The API and Astro SSR run in a **single Node.js process**. An in-memory
`CachedRegistryManager` periodically refreshes app data from upstream sources
(GitHub, Codeberg) and serves it from cache. Tarballs are cached to disk and served
through a proxy. HTTP responses are cached with a TTL matching the refresh interval.

### API Routes

| Route                         | Description                                 |
| ----------------------------- | ------------------------------------------- |
| `GET /v1/apps`                | List all apps (supports filtering)          |
| `GET /v1/apps/:code`          | Get a single app by its 8-digit code        |
| `GET /v1/apps/:code/download` | Count download + redirect to cached tarball |
| `GET /v1/failures`            | List all errors/failures                    |
| `GET /v1/health`              | Health check                                |
| `GET /v1/status`              | Cache status and refresh info               |
| `GET /v1/tarballs/:filename`  | Serve cached tarball (fetches on miss)      |
| `GET /metrics`                | Prometheus metrics                          |

## Hacking the App Store

### Development

#### Getting Started

Clone the repository. We use [mise](https://mise.jdx.dev/) to manage tools and
development tasks — install it following the instructions [here](https://mise.jdx.dev/).

```bash
mise install       # Install Node 24 and other tools
npm install        # Install dependencies
mise run dev       # Build library + start dev server
```

By default, `APP_STORE_MOCK=true` is set, which uses static mock data so you
don't need API tokens. To use real data from GitHub and Codeberg, create a
`mise.local.toml` file (gitignored):

```toml
[env]
APP_STORE_MOCK = false
GITHUB_TOKEN = "github_pat_[redacted]"
```

You'll need a [GitHub personal access token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens).

#### Useful Commands

| Command             | Description                            |
| ------------------- | -------------------------------------- |
| `mise run dev`      | Start the dev server (with HMR)        |
| `mise run test`     | Run all tests                          |
| `mise run check`    | Run all checks (types, prettier, lint) |
| `mise run prettier` | Format all files with Prettier         |
| `mise run eslint`   | Lint and auto-fix with ESLint          |

### Implementing a Registry Source

`RegistrySource` is the interface for fetching apps from an upstream service.
Existing implementations include GitHub and Codeberg. To add a new source:

1. Create a file in `packages/tildagon-app-directory-api/src/registries/sources/`
2. Export an object implementing the `RegistrySource<T>` interface
3. Add it to the `DEFAULT_SOURCES` array in `CachedRegistryManager.ts`
4. Add the service name to `TildagonDirectoryBackendServiceSchema` in `packages/tildagon-app/src/TildagonAppRelease.ts`

App fetching happens in two stages:

- **`list()`** — Returns app identifiers, optionally with extra metadata (like
  `releaseTime`, `tarballUrl`). The extra metadata type is the generic parameter `T`.
- **`get(code, { id, ...extraFromList })`** — Fetches the full `TildagonAppRelease`
  for one app. Receives metadata from `list()` to avoid duplicate API calls.

Both methods are async and return a `Result<Success, Failure>` type — never throw.
Actionable error messages are encouraged, as they're shown to app authors on the website.

```ts
const MyRegistrySource: RegistrySource<{ createdAt: Date }> = {
  list: async () => {
    // Return app IDs + optional metadata
    return Result.Ok({ id: { ... }, createdAt: new Date() });
  },
  get: async (args) => {
    // args.createdAt is available from the listing stage
    // Fetch manifest, tarball URL, etc.
    return Result.Ok(fullRelease);
  }
};
```

If you're interested in enabling app publication on an additional service, get in
touch via IRC/Matrix or open an issue on GitHub.

### Environment Variables

| Variable              | Default        | Purpose                                           |
| --------------------- | -------------- | ------------------------------------------------- |
| `GITHUB_TOKEN`        | (empty)        | GitHub API access token (not needed in mock mode) |
| `APP_STORE_MOCK`      | `"true"`       | Use dummy data instead of real APIs               |
| `PORT`                | `"3000"`       | Server port                                       |
| `APP_STORE_STATIC`    | unset          | Build Astro as static (for GitHub Pages)          |
| `REFRESH_INTERVAL_MS` | `"600000"`     | Refresh interval in ms (10 min default)           |
| `CACHE_DIR`           | `"/app/cache"` | Disk cache directory                              |

## Deployment

The app store is deployed as a Docker container. The workflow
(`.github/workflows/build-container.yml`) builds and pushes to
`ghcr.io/emfcamp/app-store` on pushes to `main`, PRs, and tags.

```bash
docker compose up -d
```

The container runs the Hono API server and Astro SSR together. It mounts a volume
at `/app/cache` for persistent disk cache across restarts.

A legacy static GitHub Pages deployment also exists, built when
`APP_STORE_STATIC=true`.
