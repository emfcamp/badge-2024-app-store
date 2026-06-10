FROM debian:bookworm-slim as base

WORKDIR /usr/src/app

RUN apt-get update  \
  && apt-get -y --no-install-recommends install  \
  # install any other dependencies you might need
  sudo curl git ca-certificates build-essential \
  && rm -rf /var/lib/apt/lists/*

SHELL ["/bin/bash", "-o", "pipefail", "-c"]
ENV MISE_DATA_DIR="/mise"
ENV MISE_CONFIG_DIR="/mise"
ENV MISE_CACHE_DIR="/mise/cache"
ENV MISE_INSTALL_PATH="/usr/local/bin/mise"
ENV PATH="/mise/shims:$PATH"
# ENV MISE_VERSION="..."

RUN curl https://mise.run | sh

COPY ./ /usr/src/app

RUN mise trust

RUN mise install
RUN npm install

RUN mise build-website

ENV HOST=0.0.0.0
ENV PORT=3000
EXPOSE 3000
CMD ["node", "/usr/src/app/packages/tildagon-app-directory-site/dist/server/entry.mjs"]

# ---
#
# FROM debian:13-slim as deployable
#
# COPY --from=base
