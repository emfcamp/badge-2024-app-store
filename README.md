# Tildagon App Store

Here's the implementation of the [app store](https://apps.badge.emfcamp.org/) for
[Tildagon](https://tildagon.badge.emfcamp.org/), the EMFcamp badge.

> [!WARNING] This repo is undergoing work in preparation for EMFCamp 2026.
> Work includes containerization, adding new features, and more - so
> check back here for updates to the instructions on running and working on the
> app store.

## Submitting an app

To find out how to write and publish an app for the Tildagon, check out [our
documentation](https://tildagon.badge.emfcamp.org/tildagon-apps/publish/).

## Hacking the App Store

The app store is a little typescript monorepo containing some packages:

- _tildagon-app-directory-api_: _a backend that fetches apps from implemented app
  sources and exposes them to the web frontend and to the badges_
- _tildagon-app-directory-site_: _a web frontend showing apps and installation
  instructions_
- tildagon-app: a library that is the core location to specify data structures
  related to the functioning of the app store

You could add additional app sources, modify the website, or add new features.

### Development

The repo is set up as a monorepo with separate packages for the API and the
site.

First, clone this repository.

We use [mise](https://mise.jdx.dev/) to manage tools and our development tasks.
Install it using the instructions [here](https://mise.jdx.dev/)

We use node to run code, with tsx for typescript. To get started, install node
and our node dependencies.

```bash
mise install
npm install
```

To run the website run:

```bash
# This automatically also builds the library
mise run dev
```

By default, in development, we mock the app store data to avoid accidentally
getting our access tokens blocked. If you need to use real data, create a file
called `mise.local.toml` in the root directory of the repository. This is how
mise allows for environmental variables to be used safely, without getting
committed to the repository. The file should have the following contents:

```toml
[env]
APP_STORE_MOCK = false
GITHUB_TOKEN = "github_pat_[redacted]"
```

You will need to create a [GitHub access
token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
in order to call the GitHub API.

In case it's interesting, the mock data is currently just the data pulled from
the production app store on 2025-10-07.

#### Running from a container

Presuming you have [Podman](https://podman.io/) installed,

```
make build
make run
```

and then from the container:

```
make install  # you only need do this once
```

and then try one of these:

```
make serve-api
make serve-all
make mock-serve-api
make mock-serve-all
```

##### Credentials

The first two targets there require an API token, as described above. They
expect to find an `env` file at `${HOME}/.config/emf/tildagon`
(`${HOME}/.config/` gets mounted into the container at `/root/.config`) with an
entry like

```
export GITHUB_TOKEN=ghp_token_here
```

Depending on which targets you ran, you should have the [API](http://localhost:3000/v1/apps) and [frontend](http://localhost:4321/) working.

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

The API is a node server that uses zod to specify the domain models for the
store, and implements upstream app "registries". The API is not currently used,
but the code in this repository that interfaces with upstream registries is
called directly by the website (rather than via the API).

#### Site

The site is an Astro site that uses the registry library to fetch apps and
display them.
