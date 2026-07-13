import { Octokit } from "octokit";
import { throttling } from "@octokit/plugin-throttling";
import type { GraphQlQueryResponseData } from "@octokit/graphql";
import type { Result } from "../../models";
import type { TildagonAppReleaseIdentifier } from "tildagon-app";
import {
  TildagonAppManifestSchema,
  type TildagonAppRelease,
} from "tildagon-app";
import { z } from "zod";
import TOML from "@ltd/j-toml";
import type { RegistrySource, RegistrySourceFailure } from "../RegistrySource";

// Lazy-created Octokit instance — not initialized at module load time
// to avoid slowing down startup when not using real APIs or when
// the server is serving from disk cache.
let _octokit: Octokit | null = null;
function getOctokit(): Octokit {
  if (!_octokit) {
    const maybeGitHubTokenSchema = z.union([
      z.string().startsWith("ghp_"),
      z.string().startsWith("github_pat_"),
    ]);
    const githubTokenParseResult = maybeGitHubTokenSchema.safeParse(
      process.env.GITHUB_TOKEN,
    );
    if (githubTokenParseResult.error) {
      console.warn(githubTokenParseResult.error);
    }
    const MyOctokit = Octokit.plugin(throttling);
    _octokit = new MyOctokit({
      auth: process.env.GITHUB_TOKEN,
      throttle: {
        onRateLimit: (retryAfter: number, _options: unknown) => {
          console.warn(`GitHub rate limit hit, retrying after ${retryAfter}s`);
          return true;
        },
        onSecondaryRateLimit: (retryAfter: number, _options: unknown) => {
          console.warn(
            `GitHub secondary rate limit hit, retrying after ${retryAfter}s`,
          );
          return true;
        },
      },
    });
  }
  return _octokit;
}

const GitHubRegistryListQueryResultSchema = z.object({
  nameWithOwner: z.string(),
  name: z.string(),
  owner: z.object({
    login: z.string(),
  }),
  releases: z.object({
    nodes: z.array(
      z.object({
        name: z.string(),
        createdAt: z.string(),
        tagCommit: z.object({
          oid: z.string(),
          tarballUrl: z.string(),
        }),
      }),
    ),
  }),
});

export type GitHubRegistryListQueryResult = z.infer<
  typeof GitHubRegistryListQueryResultSchema
>;

const LIST_QUERY = `
 query ListTildagonAppsQuery($after: String){
  search(query: "topic:tildagon-app fork:true archived:false", type: REPOSITORY, first: 100, after: $after) {
    repositoryCount
    pageInfo {
      endCursor,
      hasNextPage
    }
    nodes {
      ... on Repository {
        nameWithOwner
        name,
        owner {
          ... on Actor {
            login
          }
        },
        releases(first: 1, orderBy: {field:CREATED_AT,direction:DESC}) {
          nodes {
            name,
            createdAt
            tagCommit {
              oid
              tarballUrl
            }
          }
        }
      }
    }
  }
}`;

async function* pageThroughResource<T>(
  getter: (after?: string) => Promise<T>,
  getAfter: (result: T) => string | null,
): AsyncIterableIterator<T> {
  async function* recurse(after?: string): AsyncIterableIterator<T> {
    const result = await getter(after);
    const newAfter = getAfter(result);
    yield result;
    if (newAfter) {
      yield* recurse(newAfter);
    }
  }
  yield* recurse();
}

type ListResult = { id: TildagonAppReleaseIdentifier } & Pick<
  TildagonAppRelease,
  "releaseTime"
> &
  Pick<TildagonAppRelease, "tarballUrl">;

async function getTildagonApps(): Promise<
  Result<ListResult, RegistrySourceFailure>[]
> {
  const apps: Result<ListResult, RegistrySourceFailure>[] = [];

  for await (const page of pageThroughResource<GraphQlQueryResponseData>(
    async (after?: string) => {
      console.log(`Making GitHub List Page Query`);
      return await getOctokit().graphql(LIST_QUERY, { after });
    },
    (result: Record<string, unknown>): string | null => {
      if (!result || !result.search) {
        console.error(
          "Unexpected GitHub API response:",
          JSON.stringify(result, null, 2),
        );
        throw new Error(
          "GitHub API returned unexpected response structure - missing 'search' property",
        );
      }
      const search = result.search as Record<string, unknown>;
      const pageInfo = search.pageInfo as Record<string, unknown>;
      if (pageInfo.hasNextPage) {
        return pageInfo.endCursor as string;
      }
      return null;
    },
  )) {
    console.log(
      `Reading GitHub Search Result Page ${page.search.pageInfo.endCursor} with ${page.search.nodes.length} matching repositories`,
    );
    const pageApps = await Promise.all(
      page.search.nodes
        .map(
          (
            node: unknown,
          ): Result<GitHubRegistryListQueryResult, RegistrySourceFailure> => {
            // TODO: throw specific error if the repo exists but there is no release
            const parseResult =
              GitHubRegistryListQueryResultSchema.safeParse(node);
            if (!parseResult.success) {
              return {
                type: "failure",
                failure: {
                  id: {
                    service: "github",
                    owner: "Badge Team",
                    title: "GitHub Response Parsing",
                  },
                  reason: parseResult.error.message,
                },
              };
            }
            return { type: "success", value: parseResult.data };
          },
        )
        .map(
          (
            value: Result<GitHubRegistryListQueryResult, RegistrySourceFailure>,
          ): Result<ListResult, RegistrySourceFailure> => {
            if (value.type === "failure") {
              return value;
            }
            if (!value.value.releases.nodes.length) {
              return {
                type: "failure",
                failure: {
                  id: {
                    service: "github",
                    owner: value.value.owner.login,
                    title: value.value.name,
                  },
                  reason: "No releases found",
                },
              };
            }

            try {
              return {
                type: "success",
                value: {
                  id: {
                    service: "github",
                    owner: value.value.owner.login,
                    title: value.value.name,
                    releaseHash: value.value.releases.nodes[0]!.tagCommit.oid,
                  },
                  releaseTime: value.value.releases.nodes[0]!.createdAt,
                  tarballUrl:
                    value.value.releases.nodes[0]!.tagCommit.tarballUrl,
                },
              };
            } catch (_e) {
              return {
                type: "failure",
                failure: {
                  id: {
                    service: "github",
                    owner: "Badge Team",
                    title: "GitHub Response Parsing",
                  },
                  reason: `Failed to parse github repository: ${value.value.nameWithOwner}`,
                },
              };
            }
          },
        ),
    );
    apps.push(...pageApps);
  }

  return apps;
}

async function getTildagonApp(
  code: string,
  found: Omit<TildagonAppRelease, "manifest">,
): Promise<Result<TildagonAppRelease, RegistrySourceFailure>> {
  console.log(`Making GitHub Single App Query ${code}`);

  // Fetch both manifest files to detect the ambiguous case (both exist)
  const opts = {
    ...(found.id.releaseHash ? { ref: found.id.releaseHash } : {}),
    owner: found.id.owner,
    repo: found.id.title,
  };

  let jsonContent: string | null = null;
  let tomlContent: string | null = null;

  try {
    const jsonResp = await getOctokit().rest.repos.getContent({
      ...opts,
      path: "tildagon.json",
    });
    if (
      jsonResp.status === 200 &&
      !Array.isArray(jsonResp.data) &&
      jsonResp.data.type === "file"
    ) {
      jsonContent = Buffer.from(jsonResp.data.content, "base64").toString();
    }
  } catch {
    // tildagon.json not found — fine
  }

  try {
    const tomlResp = await getOctokit().rest.repos.getContent({
      ...opts,
      path: "tildagon.toml",
    });
    if (
      tomlResp.status === 200 &&
      !Array.isArray(tomlResp.data) &&
      tomlResp.data.type === "file"
    ) {
      tomlContent = Buffer.from(tomlResp.data.content, "base64").toString();
    }
  } catch {
    // tildagon.toml not found — fine
  }

  // Ambiguous: both files present
  if (jsonContent !== null && tomlContent !== null) {
    return {
      type: "failure",
      failure: {
        id: found.id,
        reason:
          "Both tildagon.json and tildagon.toml found — only one manifest file is allowed",
      },
    };
  }

  // Neither file found
  if (jsonContent === null && tomlContent === null) {
    return {
      type: "failure",
      failure: {
        id: found.id,
        reason: "No tildagon.json or tildagon.toml file found",
      },
    };
  }

  // Prefer JSON, fall back to TOML
  const content = jsonContent ?? tomlContent!;
  const format = jsonContent !== null ? "json" : "toml";

  try {
    const parsed =
      format === "json" ? JSON.parse(content) : TOML.parse(content);
    const app = TildagonAppManifestSchema.safeParse(parsed);

    if (!app.success) {
      return {
        type: "failure",
        failure: { id: found.id, reason: app.error.message },
      };
    }

    return {
      type: "success",
      value: {
        code,
        id: found.id,
        releaseTime: found.releaseTime,
        tarballUrl: found.tarballUrl,
        manifest: app.data,
      },
    };
  } catch (_e) {
    return {
      type: "failure",
      failure: {
        id: found.id,
        reason: `Failed to parse contents of tildagon.${format}`,
      },
    };
  }
}

export const GitHubRegistry: RegistrySource<{
  releaseTime: string;
  tarballUrl: string;
}> = {
  serviceName: "github",
  list: getTildagonApps,
  get: getTildagonApp,
};
