FROM ghcr.io/waystones-nexus/oapif-go:latest

# Configuration — oapif-go reads this at startup via CONFIG_PATH.
COPY oapif-go-config.json /config.json

ENV PORT=80
ENV CONFIG_PATH=/config.json
