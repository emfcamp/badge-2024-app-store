import { Octokit } from "octokit";
import type { GraphQlQueryResponseData } from "@octokit/graphql";
import type { Result } from "../../models";
import {
  TildagonAppManifestSchema,
  TildagonAppReleaseIdentifier,
  type TildagonAppRelease,
} from "tildagon-app";
import { z } from "zod";
import { TOML } from "bun";
import type { RegistrySource, RegistrySourceFailure } from "../RegistrySource";

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

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
 {
  search(query: "topic:tildagon-app fork:true", type: REPOSITORY, first: 100) {
    repositoryCount
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

type ListResult = { id: TildagonAppReleaseIdentifier } & Pick<
  TildagonAppRelease,
  "releaseTime" | "tarballUrl"
>;

async function getTildagonApps(): Promise<
  Result<ListResult, RegistrySourceFailure>[]
> {
  const response: GraphQlQueryResponseData = await octokit.graphql(LIST_QUERY);

  const apps: Result<ListResult, RegistrySourceFailure>[] = await Promise.all(
    response.search.nodes
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
                  releaseHash: value.value.releases.nodes[0].tagCommit.oid,
                },
                releaseTime: value.value.releases.nodes[0].createdAt,
                tarballUrl: value.value.releases.nodes[0].tagCommit.tarballUrl,
              },
            };
          } catch (e) {
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

  return apps;
}

async function getTildagonApp(
  code: string,
  found: Omit<TildagonAppRelease, "manifest">,
): Promise<Result<TildagonAppRelease, RegistrySourceFailure>> {
  try {
    const response = await octokit.rest.repos.getContent({
      ref: found.id.releaseHash,
      owner: found.id.owner,
      repo: found.id.title,
      path: "tildagon.toml",
    });

    if (
      response.status === 200 &&
      !Array.isArray(response.data) &&
      response.data.type === "file"
    ) {
      try {
        const content = Buffer.from(response.data.content, "base64").toString();

        const app = TildagonAppManifestSchema.safeParse(TOML.parse(content));

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
      } catch (e) {
        return {
          type: "failure",
          failure: {
            id: found.id,
            reason: "Failed to parse contents of tildagon.toml",
          },
        };
      }
    }

    return {
      type: "failure",
      failure: { id: found.id, reason: "No tildagon.toml file found" },
    };
  } catch (e) {
    return {
      type: "failure",
      failure: {
        id: found.id,
        reason: "GitHub says there's no repository content",
      },
    };
  }
}

export const GitHubRegistry: RegistrySource<{
  releaseTime: string;
  tarballUrl: string;
}> = {
  list: getTildagonApps,
  get: getTildagonApp,
};
