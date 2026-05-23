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
  }),
});

export type TildagonAppManifest = z.infer<typeof TildagonAppManifestSchema>;
