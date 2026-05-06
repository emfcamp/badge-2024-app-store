PROJECT = $(shell basename $(shell pwd))
ID = emfcamp/${PROJECT}
SHELL := /bin/bash

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

