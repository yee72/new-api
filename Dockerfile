FROM oven/bun:1.4.0 AS builder
WORKDIR /build/web

COPY web/package.json web/bun.lock ./
RUN bun install --frozen-lockfile

COPY ./web ./
COPY ./VERSION /build/web/VERSION
RUN DISABLE_ESLINT_PLUGIN='true' VITE_REACT_APP_VERSION=$(cat /build/web/VERSION) bun run build

FROM golang:1.26.1-alpine AS builder2
ENV GO111MODULE=on
ENV GOPROXY=https://goproxy.cn,https://goproxy.io,https://proxy.golang.org,direct
ENV GOSUMDB=off

WORKDIR /build
ADD go.mod go.sum ./
ADD relaykit/go.mod ./relaykit/go.mod
RUN go mod download

COPY . .
COPY --from=builder /build/web/dist ./web/dist
# 重点：删掉 ./cmd/new-api，和你最初原版保持一致
RUN go build -ldflags "-s -w -X 'github.com/QuantumNous/new-api/common.Version=$(cat VERSION)'" -o new-api

FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates tzdata wget \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder2 /build/new-api /
COPY LICENSE NOTICE THIRD-PARTY-LICENSES.md /licenses/

EXPOSE 3000
WORKDIR /data
ENTRYPOINT ["/new-api"]