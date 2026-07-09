import { forgejoApi } from "forgejo-js";
import type {
  RegistrySource,
  RegistrySourceGetParams,
  RegistrySourceGetResult,
  RegistrySourceListResult,
} from "../RegistrySource";
import { Result } from "../../models";
import {
  TildagonAppManifestSchema,
  type TildagonAppRelease,
  type TildagonAppReleaseIdentifier,
} from "tildagon-app";
import TOML from "@ltd/j-toml";

const API_BASE_URL = "https://codeberg.org";
const api = forgejoApi(API_BASE_URL);

type Repo = NonNullable<
  Awaited<ReturnType<typeof api.repos.repoSearch>>["data"]["data"]
>[number];

async function getTildagonApps(): RegistrySourceListResult<MetadataFromListing> {
  const repos: Repo[] = [];
  let page = 1;
  while (true) {
    const results = await api.repos.repoSearch({
      q: "tildagon-app",
      topic: true,
      archived: false,
      page,
    });
    const pageData = results.data?.data ?? [];
    if (pageData.length === 0) break;
    repos.push(...pageData);
    page++;
  }

  return await Promise.all(
    repos.map(async (repo) => {
      try {
        const latestRelease = await api.repos.repoGetLatestRelease(
          repo.owner!.login!,
          repo.name!,
        );
        const id: TildagonAppReleaseIdentifier = {
          service: "codeberg",
          owner: repo.owner!.login!,
          title: repo.name!,
          releaseHash: latestRelease.data.target_commitish!,
        };
        return Result.Ok({
          id,
          releaseTime: latestRelease.data.created_at!,
          tarballUrl: latestRelease.data.tarball_url!,
          releaseTag: latestRelease.data.tag_name!,
        });
      } catch {
        return {
          type: "failure",
          failure: {
            id: {
              service: "codeberg",
              owner: repo.owner?.login_name,
              title: repo.name,
            },
            reason: "No releases found for repository",
          },
        };
      }
    }),
  );
}

async function getTildagonApp(
  ...args: RegistrySourceGetParams<MetadataFromListing>
): RegistrySourceGetResult {
  const [key, requisites] = args;
  const { id, releaseTime, tarballUrl, releaseTag } = requisites;

  // Fetch both manifest files to detect the ambiguous case (both exist)
  let jsonContent: string | null = null;
  let tomlContent: string | null = null;

  try {
    const jsonResp = await api.repos.repoGetContents(
      id.owner,
      id.title,
      "tildagon.json",
      { ref: releaseTag },
    );
    if (jsonResp.data.encoding === "base64" && jsonResp.data.content) {
      jsonContent = Buffer.from(jsonResp.data.content, "base64").toString();
    }
  } catch {
    // tildagon.json not found — fine
  }

  try {
    const tomlResp = await api.repos.repoGetContents(
      id.owner,
      id.title,
      "tildagon.toml",
      { ref: releaseTag },
    );
    if (tomlResp.data.encoding === "base64" && tomlResp.data.content) {
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
        id,
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
        id,
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
    const manifest = TildagonAppManifestSchema.safeParse(parsed);

    if (manifest.error) {
      return { type: "failure", failure: { id, reason: manifest.error.message } };
    }

    const appRelease: TildagonAppRelease = {
      code: key,
      id: id,
      releaseTime,
      tarballUrl,
      manifest: manifest.data!,
    };
    return Result.Ok(appRelease);
  } catch {
    return {
      type: "failure",
      failure: {
        id,
        reason: `Failed to parse contents of tildagon.${format}`,
      },
    };
  }
}

type MetadataFromListing = {
  releaseTime: string;
  tarballUrl: string;
  releaseTag: string;
};

export const CodebergRegistry: RegistrySource<MetadataFromListing> = {
  serviceName: "codeberg",
  list: getTildagonApps,
  get: getTildagonApp,
};
