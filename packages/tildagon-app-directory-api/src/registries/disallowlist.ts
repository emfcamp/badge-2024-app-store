import type { TildagonAppReleaseIdentifier } from "../models";

// Here's where we ban apps. Use an owner and title to ban a specifc app
// (in GitHub this corresponds to owner and repo name). To ban an owner, omit
// the 'title'. TLDR: It bans any partial matches to the identifier objects.

export const disallowedApps: Partial<TildagonAppReleaseIdentifier>[] = [{
  owner: "hughrawlinson",
  title: "tildagon-demo"
}]