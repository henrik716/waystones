FROM geopython/pygeoapi:latest

# Copy configuration
COPY pygeoapi-config.yml /pygeoapi/local.config.yml
COPY data/ /data/
# Copy custom templates to the path defined in pygeoapi-config.yml
COPY templates/ /pygeoapi/local-templates/

# FIX: Default env vars so the container starts correctly when no .env is present.
# PORT is overridden automatically by Railway. PYGEOAPI_SERVER_URL must be set
# manually to the public HTTPS URL after first deploy.
ENV PORT=80
ENV PYGEOAPI_SERVER_URL=http://localhost:5000

EXPOSE 80

# Create AsyncAPI document placeholder (required by pygeoapi startup check)
RUN echo "asyncapi: 2.6.0" > /pygeoapi/local.asyncapi.yml &&     echo "info:" >> /pygeoapi/local.asyncapi.yml &&     echo "  title: pygeoapi" >> /pygeoapi/local.asyncapi.yml &&     echo "  version: 1.0.0" >> /pygeoapi/local.asyncapi.yml &&     echo "channels: {}" >> /pygeoapi/local.asyncapi.yml
