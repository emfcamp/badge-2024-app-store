import type { PartialBy, Result } from "../models";
import type {
  TildagonAppRelease,
  TildagonAppReleaseIdentifier,
} from "tildagon-app";

/**
 * Describes failures to fetch apps from a registry source.
 *
 * To report failures fetching apps in a registry source, return a Result failure
 * containing the ID of the app that failed to fetch and a reason for the failure.
 */
export interface RegistrySourceFailure {
  id: PartialBy<TildagonAppReleaseIdentifier, "releaseHash">;
  reason: string;
}

/**
 * The result type for the registry listing function that makes up part of the
 * registry source interface
 *
 * @typeParam T - Data additional to the identifier fetched during the list call
 *
 * @returns A list of all the apps in the source. Must at least provide an
 * identifier, which the corresponding `get` function will use to retrieve the
 * details of the app, but may return additional data that the get function may
 * use. The apps are wrapped in a Result type - some apps may be returned but be
 * invalidated for installation at this stage. We preserve any known app as an
 * error if possible so that app developers can get as much detail as possible
 * out what went wrong when attempting to publish their app.
 */
export type RegistrySourceListResult<T = {}> = Promise<
  Result<
    {
      id: TildagonAppReleaseIdentifier;
    } & T,
    RegistrySourceFailure
  >[]
>;

/**
 * The parameter type for the registry get function that makes up part of the
 * registry source interface
 *
 * @typeParam T - Data additional to the identifier that was fetched during the
 * listing stage and is passed through to the get stage.
 */
export type RegistrySourceGetParams<T = {}> = [
  string,
  { id: TildagonAppReleaseIdentifier } & T,
];

export type RegistrySourceGetResult = Promise<
  Result<TildagonAppRelease, RegistrySourceFailure>
>;

/**
 * An interface to let the registry pull apps from different sources. To make
 * apps available from an additional source, implement this interface and add
 * your implementation to the sources array.
 *
 * The idea is that the list method is called first to get a complete set of all
 * of the apps in the registry source.
 *
 * The get method is then called to get the details for each app given the
 * identifier fetched in the list stage.
 *
 * @typeParam T - Data additional to the identifier fetched during the list call
 */
export interface RegistrySource<T = {}> {
  /**
   * List all apps from the source
   */
  list(): RegistrySourceListResult<T>;
  /**
   * Get a specific app from the source based on its ID. Sources can specify
   * additional requisite data to fetch the app - they must provide this data
   * in their list method. This is useful to avoid refetching data that was
   * already fetched in the list method. We'll never try to `get` an app that we
   * haven't seen in the response to the `list` method.
   * @param key
   * @param requisites
   */
  get(...args: RegistrySourceGetParams<T>): RegistrySourceGetResult;
}
