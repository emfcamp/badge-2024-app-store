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

Then you can run the site locally with:

```bash
# First export a GITHUB_TOKEN environment variable with a GitHub personal access token
export GITHUB_TOKEN=your_github_token_here
# Then run the site
bun --filter='*' run dev
```

#### API

The API is a bun server that uses zod to specify the domain models for the
store, and implements upstream app "registries" - where the app store retrieves
apps from.

#### Site

The site is an Astro site that uses the API to fetch apps and display them.
