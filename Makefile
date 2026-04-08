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

serve:
	APP_STORE_MOCK=true bun --filter='*' run dev --host="0.0.0.0"
