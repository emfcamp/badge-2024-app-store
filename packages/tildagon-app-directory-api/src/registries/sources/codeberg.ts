import { forgejoApi } from "forgejo-js";
import type {
  RegistrySource,
  RegistrySourceGetParams,
  RegistrySourceGetResult,
  RegistrySourceListResult,
} from "../RegistrySource";
import { Result } from "../../models";
import type { TildagonAppReleaseIdentifier } from "tildagon-app";

const API_BASE_URL = "https://codeberg.org/";

async function getTildagonApps(): RegistrySourceListResult {
  const api = forgejoApi(API_BASE_URL);
  const results = await api.repos.repoSearch({
    q: "tildagon-app",
    topic: true,
  });

  return await Promise.all(
    results.data?.data?.map(async (repo) => {
      const latestRelease = await api.repos.repoGetLatestRelease(
        repo.owner?.login_name!,
        repo.name!,
      );
      const id: TildagonAppReleaseIdentifier = {
        service: "codeberg",
        owner: repo.owner?.login_name!,
        title: repo.name!,
        releaseHash: latestRelease.data.target_commitish!,
      };
      return Result.Ok({ id });
    }) ?? [],
  );
}

async function getTildagonApp(
  ...args: RegistrySourceGetParams
): RegistrySourceGetResult {
  const [key, requisites] = args;
  const appRelease: TildagonAppRelease: {
    code: key,
    id: requisites.id
  }
}

export const CodebergRegistry: RegistrySource<{}> = {
  list: getTildagonApps,
  get: getTildagonApp,
};
