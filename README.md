# Tildagon App Store

Here's the implementation of the app store for Tildagon, the EMFcamp 2024 badge.

## Submitting an app

To make an app available in the badge app store, first follow the (tbd) app dev
instructions and put the app in a repository on GitHub. Currently only GitHub is
supported - if you'd like to contribute support for another platform, see
"Hacking the App Store" below

Once your app is in a repository, add the `tildagon-app` topic to your repo.

## Hacking the App Store

The app store is a little typescript monorepo containing two packages:

- _tildagon-app-directory-api_: _a backend that fetches apps from implemented app
  sources and exposes them to the web frontend and to the badges_
- _tildagon-app-directory-site_: _a web frontend showing apps and installation
  instructions_

You could add additional app sources, modify the website, or add new features.
