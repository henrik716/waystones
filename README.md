<div align="center">
<h1>Waystones</h1>

**Design, publish, and scale your spatial data infrastructure. Your stack, your rules.**

[![React](https://img.shields.io/badge/React-19-61dafb?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-6-646cff?logo=vite)](https://vitejs.dev)
[![Supabase](https://img.shields.io/badge/Supabase-3ecf8e?logo=supabase&logoColor=white)](https://supabase.com)

[**⚡ Live Demos (Public & Private Endpoints)**](#-live-demos)
</div>

---

Waystones converts geospatial data models into production-ready OGC API and WMS services. The tool generates deployment kits that use a snapshot architecture: source data (GeoPackage, PostGIS) is converted once to static GeoParquet and FlatGeobuf files, which are then served by oapif-go and QGIS Server respectively.

## ✨ Key Features

### 🚀 Visual Data Modeler
**Build geospatial schemas with an interactive editor.**
- **Inheritance & Reusability**: Link layers via inheritance to share field definitions and constraints.
- **Shared Types**: Define custom field types once and reuse them across your entire project.
- **Real-time Validation**: Interactive feedback ensures your model is always standards-compliant.
- **Dynamic Styling**: Built-in Layer Style Editor for consistent cartography across WMS and OGC API services.

### 🍱 Deployment Kit Generation
**Generate production-ready OGC API, WMS, and Vector Tile services.**
- **Automated Configuration**: Generates `oapif-go` (REST) and **QGIS Server** (WMS) configurations.
- **Cloud-Optimized Streaming**: Kits serve static GeoParquet/FlatGeobuf from local disk or stream directly from S3/R2 via HTTP Range Requests. No heavy database connections.
- **STAC Generation**: Automated **STAC** (SpatioTemporal Asset Catalog) generation for searchable metadata catalogs.
- **High-Performance Tiles**: Built-in **tippecanoe** integration for generating optimized **PMTiles** (vector tiles).
- **Self-Contained Kits**: Deployment kits include all necessary Dockerfiles and boot scripts.
- **Multiple Targets**: Deploy to Docker Compose, Railway, Render, Fly.io, or Waystones Cloud.

### 🔍 GitHub Integration
**Version control and collaborative workflows.**
- **Interactive Review**: Compare changes visually with integrated Git diffs before pushing.
- **OAuth Integration**: Securely browse and manage your repositories directly from the UI.
- **PR Workflows**: Push directly to branches or create Pull Requests for collaborative review.

### 🤖 AI-Powered Assistant
**Automate metadata and schema generation.**
Connect Claude or Gemini to auto-generate metadata, field descriptions, and infer constraints from your sample data.

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, TypeScript, Vite 6 |
| **Geospatial** | GDAL3.js, DuckDB, tippecanoe, PMTiles, STAC |
| **Mapping** | MapLibre GL, Leaflet |
| **Icons** | Lucide React |
| **Sources** | PostGIS (pg), Supabase, GeoPackage |
| **Engines** | oapif-go, QGIS Server |
| **Deployment** | Docker, Railway, GitHub Actions |

## 🚀 Getting Started

Waystones is designed for Node.js 22+.

```bash
# Install dependencies
npm install

# Start the development server
npm run dev
```

Visit `http://localhost:3000` and start modeling.

### ⚙️ Environment Variables

For full functionality, copy `.env.example` to `.env` (if it exists) or manually configure:

```env
# GitHub OAuth (required for GitHub integration)
GITHUB_CLIENT_ID=your_github_oauth_app_id
GITHUB_CLIENT_SECRET=your_github_oauth_app_secret
VITE_GITHUB_REDIRECT_URI=http://localhost:3000/auth/callback

# Optional: AI trial feature (server-side only — never exposed to browser)
DEFAULT_AI_KEY=your_api_key_here
DEFAULT_AI_PROVIDER=claude  # or 'gemini'
VITE_HAS_TRIAL=true         # set to 'true' to enable the trial UI
```

The app includes a small Express server (`server.js`) that proxies GitHub OAuth and handles PostGIS schema imports. In development, `npm run dev` starts both Vite and the server automatically.

---

## 🌐 Live Demos

Experience live deployments of Waystones services showcasing both public open-access data and secured, private API integrations.

### 🔓 Open / Public Demo
An open dataset showing high performance on-demand tile and catalog services:

| Service | Demo Link / Integration URL | Description |
| :--- | :--- | :--- |
| 🌍 **OGC API Features (OAPIF)** | <a href="https://demo.waystones.cloud" target="_blank" rel="noopener noreferrer">demo.waystones.cloud</a> | Interactive landing page & REST API features |
| 🗺️ **Tiles Viewer** | <a href="https://demo.waystones.cloud/tiles" target="_blank" rel="noopener noreferrer">demo.waystones.cloud/tiles</a> | Interactive map viewer in the browser |
| 🎨 **QGIS Vector Tiles** | <a href="https://demo.waystones.cloud/tiles/demo.styles.json" target="_blank" rel="noopener noreferrer">demo.waystones.cloud/tiles/demo.styles.json</a> | Direct Vector Tile Style URL for QGIS connection |
| 🪟 **STAC Browser** | <a href="https://demo.waystones.cloud/stac" target="_blank" rel="noopener noreferrer">demo.waystones.cloud/stac</a> | Visual SpatioTemporal Asset Catalog |
| 📂 **STAC API Catalog** | <a href="https://demo.waystones.cloud/stac/catalog.json" target="_blank" rel="noopener noreferrer">demo.waystones.cloud/stac/catalog.json</a> | Queryable STAC API catalog endpoint |

---

### 🔒 Secured / Private Demo
A protected dataset requiring authentication via API Key:

> [!IMPORTANT]
> **Authentication Required**  
> Access to these endpoints requires passing the API key in the request headers:  
> `X-API-Key: c810b717c8c59f0d22524ca8453ca28c7b9572db5ba88afa3ad17950a9fe80dd`

| Service | Demo Link / Integration URL | Description |
| :--- | :--- | :--- |
| 🌍 **OGC API Features (OAPIF)** | <a href="https://demo-private.waystones.cloud" target="_blank" rel="noopener noreferrer">demo-private.waystones.cloud</a> | Secured landing page & REST API features |
| 🗺️ **Tiles Viewer** | <a href="https://demo-private.waystones.cloud/tiles" target="_blank" rel="noopener noreferrer">demo-private.waystones.cloud/tiles</a> | Secured interactive map viewer in the browser |
| 🎨 **QGIS Vector Tiles** | <a href="https://demo-private.waystones.cloud/tiles/demo-private.styles.json" target="_blank" rel="noopener noreferrer">demo-private.waystones.cloud/tiles/demo-private.styles.json</a> | Secured Vector Tile Style URL for QGIS connection |
| 🪟 **STAC Browser** | <a href="https://demo-private.waystones.cloud/stac" target="_blank" rel="noopener noreferrer">demo-private.waystones.cloud/stac</a> | Secured SpatioTemporal Asset Catalog browser |
| 📂 **STAC API Catalog** | <a href="https://demo-private.waystones.cloud/stac/catalog.json" target="_blank" rel="noopener noreferrer">demo-private.waystones.cloud/stac/catalog.json</a> | Secured STAC API catalog endpoint |

---

## 🏗 Architecture

Waystones uses a **Snapshot Architecture**. Source data is converted to cloud-native formats (`GeoParquet`, `FlatGeobuf`) during deployment. These static files are then served by specialized, high-performance engines without a live database connection.

```text
[ 1. CONVERSION ]
Snapshot Worker ──┬──> [ Snapshot ] ──> GeoParquet & FlatGeobuf (REST/WMS)
(DuckDB/GDAL)     ├──> [ Tiles    ] ──> PMTiles (Vector Tiles)
                  └──> [ STAC     ] ──> STAC Catalog (Metadata)

[ 2. SERVING ]
oapif-go (DuckDB) ───> [ GeoParquet ] ───> OGC API Features
QGIS Server       ───> [ FlatGeobuf ] ───> WMS (Fast CGI)
Static Tiles      ───> [ .pmtiles   ] ───> Vector Tiles (MapLibre GL)
```

The conversion worker runs once on first boot or during a CI/CD build, writing Parquet and FlatGeobuf to object storage. oapif-go and QGIS Server read those static files at serve time — no live database connection required.

### 🚀 Key Components

- **oapif-go**: High-performance Go OGC API Features server backed by DuckDB. Sub-300ms cold starts, reads GeoParquet directly from S3/R2 via HTTP Range Requests. Includes a Caddy sidecar for TLS, optional API key authentication, and WMS proxy routing.
- **Snapshot Worker**: Automated conversion pipeline (GDAL/DuckDB) that transforms live databases or GeoPackages into optimized GeoParquet and FlatGeobuf, enabling the snapshot architecture.
- **QGIS Server**: High-fidelity map rendering serving FlatGeobuf natively from cloud storage or local disk.
- **CI/CD Driven**: Built-in GitHub Actions workflows automate data conversion and kit packaging.

### 🐳 Docker Configuration
The oapif-go gateway image supports configuration via environment variables:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `5000` | The public port for the service. |
| `SERVER_URL` | `http://localhost:5000` | Public HTTPS URL used in OGC API self-links. |
| `S3_BUCKET` | — | Bucket containing the GeoParquet files. |
| `S3_ENDPOINT` | — | Custom S3 endpoint (required for R2/MinIO). |
| `IS_PRIVATE` | `0` | Set to `1` to require an `X-API-Key` header. |
| `DEPLOY_QGIS` | `0` | Set to `1` to enable `/ows/` proxy routing to QGIS Server. |

## 🌍 Deployment

**Local / self-host**: Docker Compose — fully documented in `docker-compose.yml`.

**Any container host**: Railway, Render, Fly.io — community supported. Point at the image and set the required environment variables.

## 🌍 Supported Standards
- **OGC API – Features** (Full Part 1 & 2 support)
- **WMS** — Web Map Service
- **GeoPackage, GeoJSON, GML, Shapefile**
- **STAC** — SpatioTemporal Asset Catalog
- **PMTiles** — Cloud-native Vector Tiles


## 📁 Project Structure

```
waystones/
├── components/        # React UI components (dialogs, editor, deploy panels, etc.)
├── hooks/             # Custom React hooks (useLayerActions, useHistory, etc.)
├── utils/             # Services and utilities
│   ├── deploy/        # Deployment generators (oapif-go, QGIS, Docker, GitHub Actions)
│   ├── gdalService    # GeoPackage and raster processing
│   ├── aiService      # AI assistant integration (Claude & Gemini)
│   ├── githubService  # GitHub API integration
│   └── ...
├── api/               # Backend endpoints
│   └── github-oauth.js  # GitHub OAuth proxy
├── server.js          # Express backend server
├── App.tsx            # Root React component
└── types.ts           # TypeScript type definitions
```

## 🌐 Language Support
UI is in **English**. The AI assistant supports 29 languages for metadata and schema generation.

## 🤝 Contributing

Contributions are welcome! To ensure clear ownership, all contributors must agree to our **Contributor License Agreement (CLA)**.

1. **Sign the CLA**: Please read our [CLA](CLA.md) before submitting a pull request.
2. [Open an issue](../../issues) to discuss significant changes first.
2. Follow the existing code style and patterns.
3. Test your changes locally with `npm run dev` and `npm run lint`.

---

## ⚖️ License
Waystones is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**. 

Contributions are subject to our [Contributor License Agreement (CLA)](CLA.md).
