import type {
  RegistrySource,
  RegistrySourceGetParams,
  RegistrySourceGetResult,
  RegistrySourceListResult,
} from "../RegistrySource";

async function getTildagonApps(): RegistrySourceListResult {}

async function getTildagonApp(
  ...[key, requisites]: RegistrySourceGetParams
): RegistrySourceGetResult {}

export const TemplateRegistrySource: RegistrySource<{}> = {
  list: getTildagonApps,
  get: getTildagonApp,
};
