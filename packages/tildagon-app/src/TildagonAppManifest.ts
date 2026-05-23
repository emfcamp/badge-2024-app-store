import { z } from "zod";

export const TildagonAppCategory = z.union([
  z.literal("Badge"),
  z.literal("Music"),
  z.literal("Media"),
  z.literal("Apps"),
  z.literal("Games"),
  z.literal("Background"),
  z.literal("Pattern"),
]);

export type TildagonAppCategory = z.infer<typeof TildagonAppCategory>;

export const TildagonAppManifestSchema = z.object({
  app: z.object({
    name: z.string(),
    category: TildagonAppCategory,
  }),
  metadata: z.object({
    author: z.string(),
    license: z.string(),
    url: z.string(),
    description: z.string(),
    version: z.string(),
  }),
});

export type TildagonAppManifest = z.infer<typeof TildagonAppManifestSchema>;
