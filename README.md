# Tildagon App Store

Here's the implementation of the [app store](https://apps.badge.emfcamp.org/) for
[Tildagon](https://tildagon.badge.emfcamp.org/), the EMFcamp 2024 badge.

## Submitting an app

To make an app available in the badge app store, first follow the [app dev
instructions](https://tildagon.badge.emfcamp.org/tildagon-apps/) and put the app in
a repository on GitHub. Currently only GitHub is supported - if you'd like to contribute
support for another platform, see "Hacking the App Store" below

Once your app is in a repository, add the `tildagon-app` topic to your repo.

## Hacking the App Store

The app store is a little typescript monorepo containing two packages:

- _tildagon-app-directory-api_: _a backend that fetches apps from implemented app
  sources and exposes them to the web frontend and to the badges_
- _tildagon-app-directory-site_: _a web frontend showing apps and installation
  instructions_

You could add additional app sources, modify the website, or add new features.

### Development

The repo is set up as a monorepo with separate packages for the API and the
site.

We use bun to run code as it supports TypeScript natively. To get started,
install the correct version of bun. This is specified in mise.toml. You can
install manually, or with mise.

```bash
mise install
bun install
```

Some packages within the monorepo are libraries that have a build step. To build
those, run:

```bash
bun --filter='*' run build
```

Then you can run the site locally with:

```bash
# First export a GITHUB_TOKEN environment variable with a GitHub personal access token
export GITHUB_TOKEN=your_github_token_here
# Then run the site
bun --filter='*' run dev
```

If you would like to avoid having to provide a GitHub token, for example you
intend to work only on the frontend, you can set the following environment
variable, which will have the backend provide a dataset pulled from the
production app store on 2025-10-07.

```bash
export APP_STORE_MOCK=true
```

##### Implementing a Registry Source

`RegistrySource` is the name for a common interface we implement to let the app
store fetch apps from elsewhere. Because we have a `RegistrySource`
implementation for GitHub, attendees (and other Tildagon users) can publish
their Tildagon apps to GitHub.

If you want to add support for publishing apps to another service - for example
another code forge, separate website, node package, or anything else you can
imagine, you would need to implement a `RegistrySource` for your service so that
the app store can read apps from the service.

To implement a registry source, you would create a file in
`./packages/tildagon-app-directory-api/src/registries/sources/`, in that file
export an object that implements the `RegistrySource` interface, and add your
object to the `SOURCES` variable at the top of `CachedRegistryManager`, and to
the `TildagonDirectoryBackendServiceSchema` in `TildagonAppRelease`.

App fetching is managed in two stages.

- Listing - the `RegistrySource` must provide a list of all of the apps that the
  source provides, but it does not _necessarily_ have to fetch all the details
  of every app at this stage
- Individual app fetching - the `RegistrySource` must provide all the required
  details for each app

At the listing stage, a `RegistrySource` is only _required_ to return a list of
identifiers of the apps - according to the `TildagonAppReleaseIdentifier` type.
At the listing stage, the `RegistrySource` _may_ provide additional metadata.
The additional metadata can then be passed along with the ID to the individual
app fetching hook `get` exposed by the `RegistrySource`. This is to allow
implementations of `RegistrySource` to avoid duplicate data fetching.

A `TildagonAppReleaseIdentifier` is the minimum set of information about an App
Release that is required to uniquely identify it. It consists of the name of the
service that provides the app, the owner (ideally this should map to a user
system with uniqueness guarantees in the upstream service), the name of the app
(ideally also unique per user account within the upstream service), and the
`releaseHash` (you could use a version number for this as long as it is unique).

With some (but not all) code forge APIs, it's possible to get unique App
Identifiers from the result of an (optionally paginated) search endpoint.
Therefore the listing stage would only have to enumerate apps through a
paginated search endpoint, and not have to make an individual request for every
app.

However, some code forge APIs (or other upstream registries or app sources) may
not provide the `releaseHash` (or other metadata that's part of the
`TildagonAppReleaseIdentifier`) in their search/listing API. In this case, it
may be necessary to make an additional API call per individual app in the
listing stage. While this slows down the app store listing, this _may be_ ok if
justified by significant demand for publication of apps on the given upstream
source. In this case, any additional information procured by the API call to get
the individual app in the listing stage should be passed from the listing stage
to the individual app fetching stage. This is facilitated by the generic type
parameter on the `RegistrySource` interface.

```ts
const MyRegistrySource: RegistrySource<{createdAt: Date}> = {
  list: async () => {
    const id: TildagonAppReleaseIdentifier = {...}
    const createdAt = getMyAppCreationDate(id);
    // The `list` method on the `RegistrySource` must return an object with an
    // id as well as a `createdAt` value as specified in the additional data
    // type parameter on the `RegistrySource<..>` type
    return {id, createdAt}
  },
  get: async (args: RegistrySourceGetParams<{createdAt: Date}>) => {
    // We can now reference the `createdAt` value that we returned from the
    listing stage.
    args.createdAt
  }
}
```

After the listing stage, the `get` method is called for each app that the list
method returned. This is to fill in all the required metadata - the parts of a
`TildagonAppRelease` other than the identifier. This includes the `releaseTime`,
`tarballUrl`, and release manifest. If all this information is already available
from the listing stage, this becomes an identity function - if however you need
to read the `manifest.toml` from the release, you would do so in the `get`
function.

Both the `list` and `get` functions in the `RegistrySource` interface are
asynchronous, and return a Result type. It is _encouraged_ to return actionable
errors with the app identifier where possible. The App Store website collects
and presents these errors to app authors who are attempting to publish their
apps. The GitHub registry source has plenty of examples of actionable and
attributed errors that are suitable for this use case.

If you're interested in enabling app publication on an additional code forge,
website, or other service, we encourage you to get in touch in IRC/Matrix or by
opening an issue on GitHub to discuss the proposal, and to get technical
support.

#### API

The API is a bun server that uses zod to specify the domain models for the
store, and implements upstream app "registries" - where the app store retrieves
apps from.

#### Site

The site is an Astro site that uses the API to fetch apps and display them.
