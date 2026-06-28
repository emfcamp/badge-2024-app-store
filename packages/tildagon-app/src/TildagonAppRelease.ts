import { createHash } from "node:crypto";
import { z } from "zod";
import { TildagonAppManifestSchema } from "./TildagonAppManifest.js";

/**
 * This union should contain the identifiers of each registry backend service.
 */
const TildagonDirectoryBackendServiceSchema = z.union([
  z.literal("github"),
  z.literal("codeberg"),
]);

export type TildagonDirectoryBackendService = z.infer<
  typeof TildagonDirectoryBackendServiceSchema
>;

export const TildagonAppReleaseIdentifierSchema = z.object({
  service: TildagonDirectoryBackendServiceSchema,
  owner: z.string(),
  title: z.string(),
  releaseHash: z.optional(z.string()),
});

export type TildagonAppReleaseIdentifier = z.infer<
  typeof TildagonAppReleaseIdentifierSchema
>;

export const TildagonAppReleaseIdentifier = {
  toAppCode: (identifier: TildagonAppReleaseIdentifier) => {
    const hash = createHash("md5");
    hash.update(identifier.service);
    hash.update(identifier.owner);
    hash.update(identifier.title);
    const digest = hash.digest();
    const code = new Array(8)
      .fill("")
      .map((_, i) => {
        return String.fromCharCode("0".charCodeAt(0) + (digest[i] % 5));
      })
      .join("");
    return code;
  },
};

export const TildagonAppReleaseSchema = z.object({
  code: z.string(),
  id: TildagonAppReleaseIdentifierSchema,
  releaseTime: z.string(),
  tarballUrl: z.string(),
  manifest: TildagonAppManifestSchema,
});

export type TildagonAppRelease = z.infer<typeof TildagonAppReleaseSchema>;
