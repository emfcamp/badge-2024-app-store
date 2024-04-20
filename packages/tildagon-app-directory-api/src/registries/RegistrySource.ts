import type {
  PartialBy,
  Result,
  TildagonAppRelease,
  TildagonAppReleaseIdentifier,
} from "../models";

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
 * An interface to let the registry pull apps from different sources. To make
 * apps available from an additional source, implement this interface and add
 * your implementation to the sources array.
 *
 * @typeParam T - Data additional to the identifier fetched during the list call
 */
export interface RegistrySource<T = {}> {
  /**
   * List all apps from the source
   */
  list(): Promise<
    Result<{ id: TildagonAppReleaseIdentifier } & T, RegistrySourceFailure>[]
  >;
  /**
   * Get a specific app from the source based on its ID. Sources can specify
   * additional requisite data to fetch the app - they must provide this data
   * in their list method. This is useful to avoid refetching data that was
   * already fetched in the list method. We'll never try to `get` an app that we
   * haven't seen in the response to the `list` method.
   * @param key
   * @param requisites
   */
  get(
    key: string,
    requisites: { id: TildagonAppReleaseIdentifier } & T
  ): Promise<Result<TildagonAppRelease, RegistrySourceFailure>>;
}
