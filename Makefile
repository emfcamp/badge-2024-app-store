PROJECT = $(shell basename $(shell pwd))
ID = emfcamp/${PROJECT}

build:
	podman build \
		--file Containerfile \
		--build-arg PROJECT=${PROJECT} \
		--tag ${ID} .

run:
	podman run \
		--name ${PROJECT} \
		--hostname ${PROJECT} \
		--volume $(shell pwd):/opt/${PROJECT} \
		--volume ${HOME}/.config:/root/.config \
		--interactive \
		--tty \
		--rm \
		--publish 3000:3000 \
		--publish 4321:4321 \
		${ID} \
		bash

exec:
	podman exec \
		--interactive \
		--tty \
		${PROJECT} \
		bash

install:
	bun install

serve-all:
	. /root/.config/emf/tildagon && \
	GITHUB_TOKEN=${GITHUB_TOKEN} bun --filter='*' run dev --host="0.0.0.0"

serve-api:
	. /root/.config/emf/tildagon && \
	GITHUB_TOKEN=${GITHUB_TOKEN} bun --filter='tildagon-app-directory-api' run dev --host="0.0.0.0"

mock-serve-all:
	APP_STORE_MOCK=true bun --filter='*' run dev --host="0.0.0.0"

mock-serve-api:
	APP_STORE_MOCK=true bun --filter='tildagon-app-directory-api' run dev --host="0.0.0.0"
