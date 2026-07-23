import type {
  RegistrySource,
  RegistrySourceGetParams,
  RegistrySourceGetResult,
  RegistrySourceListResult,
} from "../RegistrySource.js";

async function getTildagonApps(): RegistrySourceListResult {
  throw new Error("not implemented");
}

async function getTildagonApp(
  ...[_key, _requisites]: RegistrySourceGetParams
): RegistrySourceGetResult {
  throw new Error("not implemented");
}

export const TemplateRegistrySource: RegistrySource<{}> = {
  serviceName: "template",
  list: getTildagonApps,
  get: getTildagonApp,
};
