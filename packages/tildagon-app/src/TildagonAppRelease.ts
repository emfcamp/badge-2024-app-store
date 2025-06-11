import { z } from "zod";
import { TildagonAppManifestSchema } from ".";

/**
 * This union should contain the identifiers of each registry backend service.
 */
const TildagonDirectoryBackendServiceSchema = z.literal("github");

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

const hasher = new Bun.CryptoHasher("md5");

export const TildagonAppReleaseIdentifier = {
  toAppCode: (identifier: TildagonAppReleaseIdentifier) => {
    hasher.update(identifier.service);
    hasher.update(identifier.owner);
    hasher.update(identifier.title);
    hasher.update(identifier.releaseHash || "");
    const hash = new Uint8Array(128);
    hasher.digest(hash);
    const code = new Array(8)
      .fill("")
      .map((_, i) => {
        return String.fromCharCode("0".charCodeAt(0) + (hash[i] % 5));
      })
      .join("");
    return code;
  },
};

const TildagonAppReleaseSchema = z.object({
  code: z.string(),
  id: TildagonAppReleaseIdentifierSchema,
  releaseTime: z.string(),
  tarballUrl: z.string(),
  manifest: TildagonAppManifestSchema,
});

export type TildagonAppRelease = z.infer<typeof TildagonAppReleaseSchema>;
