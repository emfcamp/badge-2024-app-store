import type { TildagonAppReleaseIdentifier } from "tildagon-app";
import {
  TildagonAppReleaseIdentifierSchema,
  TildagonAppReleaseSchema,
} from "tildagon-app";
import type { RegistrySource } from "../RegistrySource.js";
import data from "./apps.json" with { type: "json" };
import { Result } from "../models/index.js";

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
  serviceName: "dummy",
  list: getTildagonApps,
  get: getTildagonApp,
};
