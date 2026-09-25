# Stage 1: Build frontend
FROM node:22-alpine AS web-builder
WORKDIR /app/web
COPY web/package.json web/package-lock.json* ./
RUN npm ci
COPY web/ ./
RUN npm run build

# Stage 2: Build Go binary
FROM golang:1.24-alpine AS go-builder
WORKDIR /app
COPY go.mod ./
RUN go mod download
COPY . .
COPY --from=web-builder /app/web/dist ./webui/dist
ARG VERSION=dev
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w -X main.Version=${VERSION}" -o server ./cmd/server

# Stage 3: Minimal runtime
FROM gcr.io/distroless/static-debian12
COPY --from=go-builder /app/server /server
EXPOSE 3000
CMD ["/server"]
