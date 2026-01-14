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
import { TOML } from "bun";

const API_BASE_URL = "https://codeberg.org";
const api = forgejoApi(API_BASE_URL);

async function getTildagonApps(): RegistrySourceListResult<MetadataFromListing> {
  const results = await api.repos.repoSearch({
    q: "tildagon-app",
    topic: true,
  });

  return await Promise.all(
    results.data?.data?.map(async (repo) => {
      try {
        const latestRelease = await api.repos.repoGetLatestRelease(
          repo.owner?.login!,
          repo.name!,
        );
        const id: TildagonAppReleaseIdentifier = {
          service: "codeberg",
          owner: repo.owner?.login!,
          title: repo.name!,
          releaseHash: latestRelease.data.target_commitish!,
        };
        return Result.Ok({
          id,
          releaseTime: latestRelease.data.created_at!,
          tarballUrl: latestRelease.data.tarball_url!,
          releaseTag: latestRelease.data.tag_name!,
        });
      } catch (e) {
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
    }) ?? [],
  );
}

async function getTildagonApp(
  ...args: RegistrySourceGetParams<MetadataFromListing>
): RegistrySourceGetResult {
  const [key, requisites] = args;
  const { id, releaseTime, tarballUrl, releaseTag } = requisites;

  let manifestResponse:
    | Awaited<ReturnType<typeof api.repos.repoGetContents>>
    | undefined;
  try {
    manifestResponse = await api.repos.repoGetContents(
      id.owner,
      id.title,
      "tildagon.toml",
      {
        ref: releaseTag,
      },
    );
  } catch (e) {
    return {
      type: "failure",
      failure: {
        id,
        reason:
          e instanceof Error
            ? e.message
            : "Failed to retrieve manifest from release",
      },
    };
  }

  if (manifestResponse.data.encoding != "base64") {
    return {
      type: "failure",
      failure: {
        id,
        reason: `tildagon.toml returned in unexpected format ${manifestResponse.data.encoding}`,
      },
    };
  }

  if (!manifestResponse.data.content) {
    return {
      type: "failure",
      failure: {
        id,
        reason: "tildagon.toml was empty",
      },
    };
  }

  const manifest = TildagonAppManifestSchema.safeParse(
    TOML.parse(Buffer.from(manifestResponse.data.content, "base64").toString()),
  );

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
}

type MetadataFromListing = {
  releaseTime: string;
  tarballUrl: string;
  releaseTag: string;
};

export const CodebergRegistry: RegistrySource<MetadataFromListing> = {
  list: getTildagonApps,
  get: getTildagonApp,
};
