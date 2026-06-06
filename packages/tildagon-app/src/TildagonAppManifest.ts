import { z } from "zod";

export const TildagonAppCategory = z.enum([
  "Badge",
  "Music",
  "Media",
  "Apps",
  "Games",
  "Background",
  "Pattern",
]);

export type TildagonAppCategory = z.infer<typeof TildagonAppCategory>;

export const HexpansionIdentifier = z.object({
  name: z.string().optional(),
  creator: z.string().optional(),
  url: z.url().optional(),
  vid: z.string(),
  pid: z.string(),
});

export const Capability = z.string();

export const HexpansionDefinition = z.object({
  identifier: HexpansionIdentifier,
  capabilities: z.array(Capability),
});

export const Frontboard2024 = z.object({
  name: z.literal("2024 Frontboard"),
  capabilities: z.tuple([]),
});

export const Frontboard2026 = z.object({
  name: z.literal("2026 Frontboard"),
  capabilities: z.tuple([]),
});

export const TildagonOSMinimumVersion = z.object({
  type: "TildagonOSMinimumVersion",
  version: z.string(),
});

export const ProvidedCapability = z.object({
  type: "ProvidedCapability",
  capability: Capability,
});

export const Frontboard = z.discriminatedUnion("name", [
  Frontboard2024,
  Frontboard2026,
]);

export const FrontboardIdentifier = z.object({
  name: z.union(Frontboard.options.map((option) => option.shape.name)),
});

export const TildagonAppCapabilityAssociations = z.array(
  z.object({
    required: z.boolean(),
    feature: z.union([FrontboardIdentifier, HexpansionIdentifier, Capability]),
  }),
);

export const TildagonAppManifestSchema = z.object({
  app: z.object({
    name: z.string(),
    category: z.preprocess((v: TildagonAppCategory | TildagonAppCategory[]) => {
      if (Array.isArray(v)) return v;
      return [v];
    }, z.array(TildagonAppCategory)),
  }),
  metadata: z.object({
    author: z.string(),
    license: z.string(),
    url: z.string(),
    description: z.string(),
    version: z.string(),
    capabilities: TildagonAppCapabilityAssociations.optional(),
  }),
});

export type TildagonAppManifest = z.infer<typeof TildagonAppManifestSchema>;
