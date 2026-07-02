import type {
  RegistrySource,
  RegistrySourceGetParams,
  RegistrySourceGetResult,
  RegistrySourceListResult,
} from "../RegistrySource";

async function getTildagonApps(): RegistrySourceListResult {
  throw new Error("not implemented");
}

async function getTildagonApp(
  ...[key, requisites]: RegistrySourceGetParams
): RegistrySourceGetResult {
  throw new Error("not implemented");
}

export const TemplateRegistrySource: RegistrySource<{}> = {
  list: getTildagonApps,
  get: getTildagonApp,
};
