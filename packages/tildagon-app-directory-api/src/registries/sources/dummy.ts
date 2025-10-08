import {
  TildagonAppReleaseIdentifier,
  TildagonAppReleaseIdentifierSchema,
  TildagonAppReleaseSchema,
} from "tildagon-app";
import type { RegistrySource } from "../RegistrySource";
import data from "./apps.json";
import { Result } from "../../models";

function appToIdMapper(app: (typeof data.items)[number]): {
  id: TildagonAppReleaseIdentifier;
} {
  return {
    id: TildagonAppReleaseIdentifierSchema.safeParse(app.id).data!,
  };
}

async function getTildagonApps() {
  return data.items.map(appToIdMapper).map(Result.Ok);
}

async function getTildagonApp(code: string) {
  const app = data.items.find((app) => app.code === code);
  return Result.Ok(TildagonAppReleaseSchema.safeParse(app).data!);
}

export const DummyRegistry: RegistrySource<{}> = {
  list: getTildagonApps,
  get: getTildagonApp,
};
