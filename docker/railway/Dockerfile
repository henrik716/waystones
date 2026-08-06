FROM ghcr.io/waystones-nexus/oapif-go:27ac4e67094bd694d902c0df8e8a813c4ed65a71

# Configuration — oapif-go reads this at startup via CONFIG_PATH.
COPY oapif-go-config.json /config.json

ENV PORT=80
ENV CONFIG_PATH=/config.json
