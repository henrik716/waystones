# Waystones

**Design, model, and deploy geospatial data services — no backend expertise required.**

[![React](https://img.shields.io/badge/React-19-61dafb?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-6-646cff?logo=vite)](https://vitejs.dev)

</div>

---

Waystones is a browser-based tool for designing geospatial data models and generating production-ready [pygeoapi](https://pygeoapi.io) deployments. Go from a raw GeoPackage file or a blank canvas to a standards-compliant OGC API in minutes.

## Features

### Model Editor
Build data models with layers, fields, and constraints through a visual editor:
- Define geometry types (Point, LineString, Polygon, etc.) and field types (string, number, date, codelist, JSON, relations, arrays, and more)
- Set validation rules — required fields, uniqueness, min/max, regex patterns, and cross-field comparisons
- Define relationships between layers (foreign keys, spatial relations: intersects, contains, within, etc.)
- Create shared types for reusable field definitions across layers

### Quick Publish
The fastest path from data to a live service:
1. Drop a GeoPackage file — Waystones auto-infers the data structure
2. Select which tables to publish and configure symbology (colors, icons, line styles)
3. Fill in dataset metadata (title, description, contact, license, spatial/temporal extent)
4. Publish directly to GitHub — deployment is automatic

### Data Mapper
Migrate and transform existing GIS data:
- Upload GeoPackage, GeoJSON, GML, or Shapefile sources
- Map source fields to model fields with value-mapping support (code translations)
- Generate ready-to-run `ogr2ogr` scripts for GDAL/OGR transformations

### Deploy Panel
Configure and export production deployments:
- Connect to PostGIS, Supabase, Databricks, or local GeoPackage data sources
- Map model layers to source tables
- Export deployment kits with Docker Compose, Fly.io, Railway, or GitHub Container Registry configurations
- Auto-generate complete pygeoapi configuration with OGC API – Features, WMS, and WFS support
- Push to GitHub with pull request support for collaborative review workflows

### AI Assistant
Optionally connect a Claude or Gemini API key to get:
- Auto-generated field descriptions based on name and context
- Field type suggestions from existing data
- Constraint inference from sample values
- Model abstract generation from your layer definitions

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite 6 |
| Geospatial | GDAL3.js, jszip |
| Icons | Lucide React |
| Backend (generated) | pygeoapi, QGIS Server |
| Deployment targets | Docker, Fly.io, Railway, GitHub Actions |

## Getting Started

**Prerequisites:** Node.js 22+

```bash
# Install dependencies
npm install

# Start the development server
npm run dev
```

The app runs at `http://localhost:3000` by default.

```bash
# Production build
npx vite build

# Type check
npx tsc --noEmit
```

## GitHub Integration

Waystones can read and write model definitions directly to GitHub repositories for version-controlled collaboration. Authenticate with a Personal Access Token (PAT) or via OAuth from the app's settings panel.

## Deployment Output

A completed Waystones model generates:

- **pygeoapi config** — OGC API – Features (REST) endpoints
- **QGIS Server config** — WMS endpoints for styled map rendering
- **Docker Compose** — self-hosted deployment with pygeoapi + QGIS Server
- **Cloud configs** — Fly.io and Railway manifests
- **GHCR image push** — GitHub Container Registry CI/CD setup

## Supported Standards

- OGC API – Features (via pygeoapi)
- WMS — Web Map Service (via QGIS Server)
- GeoPackage, GeoJSON, GML, Shapefile (import)

## Language Support

The UI is available in **English** and **Norwegian**.

## License

Waystones is dual-licensed:

- **Open Source — AGPL v3**: Free to use, modify, and distribute under the terms of the [GNU Affero General Public License v3](LICENSE). If you use Waystones as part of a network service, you must make your modifications available under the same license.

- **Commercial License**: If you want to use Waystones in a proprietary product or service without the AGPL's copyleft requirements, a commercial license is available. [Open an issue](../../issues) to start the conversation.
