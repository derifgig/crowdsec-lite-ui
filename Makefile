IMAGE ?= crowdsec-lite-ui
TAG   ?= latest

.PHONY: build push run dev clean

## Build the Docker image
build:
	docker build -t $(IMAGE):$(TAG) .

## Build and push
push: build
	docker push $(IMAGE):$(TAG)

## Run locally via docker-compose
run:
	docker compose up --build

## Local dev: run Go server + Vite dev server in parallel
dev:
	@echo "Starting Vite dev server on :5173 ..."
	cd web && npm run dev &
	@echo "Starting Go server on :3000 ..."
	LAPI_URL=$${LAPI_URL} LAPI_USERNAME=$${LAPI_USERNAME} LAPI_PASSWORD=$${LAPI_PASSWORD} \
	go run ./cmd/server

## Remove built artifacts
clean:
	rm -rf web/dist webui/dist/*
	touch webui/dist/.gitkeep
