FROM geopython/pygeoapi:latest as base

# Install system dependencies
USER root
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*
# Bake runtime paths at build time while the base image's ENV/PATH is active.
# /etc/pygeoapi-venv-bin  → directory containing gunicorn (for PATH)
# /etc/pygeoapi-site-packages → site-packages dir containing pygeoapi (for PYTHONPATH)
RUN gunicorn_bin=$(which gunicorn 2>/dev/null || find /usr /opt /pygeoapi /venv /home -maxdepth 6 -name gunicorn -type f 2>/dev/null | head -1) && dirname "$gunicorn_bin" > /etc/pygeoapi-venv-bin

RUN for py in python3 /venv/bin/python3 /usr/bin/python3 /usr/local/bin/python3; do \
      site=$($py -c "import pygeoapi,os; print(os.path.dirname(os.path.dirname(pygeoapi.__file__)))" 2>/dev/null) && \
      [ -n "$site" ] && echo "$site" > /etc/pygeoapi-site-packages && break; \
    done || echo "" > /etc/pygeoapi-site-packages

# Install DuckDB and pre-fetch extensions at build time.
# Prevents runtime internet access; extensions available to any user.
RUN pip install --no-cache-dir --break-system-packages duckdb boto3

ENV DUCKDB_EXTENSION_DIRECTORY=/duckdb-extensions
RUN mkdir -p /duckdb-extensions && chmod 777 /duckdb-extensions
RUN python3 -c "\
import duckdb; \
con = duckdb.connect(); \
con.execute(\"SET extension_directory='/duckdb-extensions'\"); \
con.execute('INSTALL httpfs'); \
con.execute('INSTALL spatial'); \
print('DuckDB extensions OK')"

# Copy the Waystones provider package so pygeoapi can import it.
# PYTHONPATH=/opt makes `waystones.providers.geoparquet` importable.
COPY waystones/ /opt/waystones/
ENV PYTHONPATH=/opt

# Community boot script — activates venv, reads config, starts gunicorn.
# Overwritten at machine creation time by the SaaS via the Fly files API.
COPY boot.sh /boot.sh
COPY warmup.py /warmup.py
COPY cache_openapi.py /cache_openapi.py
COPY waystones_wsgi.py /waystones_wsgi.py
RUN chmod +x /boot.sh

# Copy Caddy configuration. Caddyfile.tls wraps the base Caddyfile and adds a
# :443 TLS site; boot.sh picks it when TLS_CERT_FILE is set (SaaS path).
COPY Caddyfile /etc/caddy/Caddyfile
COPY Caddyfile.tls /etc/caddy/Caddyfile.tls

# Bake in the Waystones branded Jinja2 HTML templates
COPY html-templates/ /pygeoapi/local-templates/

# Stub OpenAPI file so gunicorn starts immediately on cold boot
RUN printf 'openapi: "3.0.2"\ninfo:\n  title: API\n  description: booting\n  version: "0.0.0"\npaths: {}\n' \
    > /pygeoapi/local.openapi.yml

# Remove the base-image demo config. Without this, boot.sh sets the tenant flag
# because the file exists, a CF health probe then loads the demo app before the
# real config header arrives, and _CONFIG_LOADED gets permanently locked on demo.
RUN rm -f /pygeoapi/local.config.yml

# Make the pygeoapi directory writable for the nobody user
RUN chown -R nobody:nogroup /pygeoapi && \
    chmod -R 755 /pygeoapi

ENV PORT=5000
ENV CONTAINER_PORT=5000
ENV CONTAINER_HOST=0.0.0.0

EXPOSE 5000

# ---------------------------------------------------------
# Target: minimal (No Caddy sidecar included)
# ---------------------------------------------------------
FROM base as minimal
USER nobody
ENTRYPOINT ["/boot.sh"]

# ---------------------------------------------------------
# Target: gateway (Includes Caddy for bundled gateway/TLS)
# ---------------------------------------------------------
FROM base as gateway
USER root
COPY --from=caddy:latest /usr/bin/caddy /usr/bin/caddy
USER nobody
ENTRYPOINT ["/boot.sh"]
