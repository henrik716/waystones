FROM qgis/qgis-server:3.44.12

# Ensure spawn-fcgi is available (some image variants omit it)
RUN apt-get update && \
    apt-get install -y --no-install-recommends spawn-fcgi && \
    rm -rf /var/lib/apt/lists/*

# Replace the image's nginx config with one that listens on 8080 (internal port).
# The Python proxy (waystones_qgis_proxy.py) owns :80; nginx must use a different port.
# We own the full nginx.conf so we never rely on runtime sed-based port rebinding.
COPY nginx-qgis.conf /etc/nginx/nginx.conf

COPY qgis-entrypoint.sh /entrypoint.sh
COPY waystones_qgis_proxy.py /waystones_qgis_proxy.py
RUN chmod +x /entrypoint.sh

# Create QGIS data dir and spawn-fcgi working dir with correct ownership
RUN mkdir -p /data /var/lib/qgis && \
    chown www-data:www-data /var/lib/qgis /data

ENTRYPOINT ["/entrypoint.sh"]
