<div align="center">
<h1>Waystones</h1>

**The fastest way to design, model, and deploy world-class geospatial services.**

[![React](https://img.shields.io/badge/React-19-61dafb?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-6-646cff?logo=vite)](https://vitejs.dev)
[![Supabase](https://img.shields.io/badge/Supabase-3ecf8e?logo=supabase&logoColor=white)](https://supabase.com)
</div>

---

Waystones is a modern, web-native platform that bridges the gap between raw spatial data and production-ready geospatial infrastructure. With a focus on developer experience and standards-compliance, it allows you to build OGC API – Features and WMS services in minutes, not days.

## ✨ Key Features

### 🚀 Quick Publish
**From data to live URL in under 60 seconds.**
Drop any GeoPackage into Waystones. We'll auto-infer your schema, generate a beautiful OGC API endpoint, and set up a complete CI/CD pipeline to GitHub. No configuration files, no CLI, just results.

### 🎨 Visual Data Modeler
**Professional-grade modeling without the complexity.**
Build complex geospatial schemas with ease:
- **Inheritance & Reusability**: Link layers via inheritance to share field definitions and constraints.
- **Shared Types**: Define custom field types once and reuse them across your entire project.
- **Real-time Validation**: Interactive feedback ensures your model is always standards-compliant before you deploy.
- **Dynamic Styling**: Built-in Layer Style Editor for consistent cartography across WMS and OGC API services.

### 🍱 One-Click Cloud Deployment
**Production-ready infrastructure as code.**
Deploy your services to your favorite cloud with pre-configured kits:
- **Cloud Native**: Support for **Railway**, **Fly.io**, and **GitHub Container Registry (GHCR)**.
- **Modern Standards**: Automatically generates `pygeoapi` (REST) and **QGIS Server** (WMS) configurations.
- **Live Data Sync**: Integrated **Delta Sync Engine** for keeping live PostGIS and Supabase sources in sync.
- **Advanced Metadata**: Built-in support for **STAC** (SpatioTemporal Asset Catalog) catalogs.

### 🔍 GitHub-First Workflow
**Version control is in our DNA.**
- **Interactive Review**: Compare changes visually with integrated Git diffs before pushing.
- **OAuth Integration**: Securely browse and manage your repositories directly from the UI.
- **PR Workflows**: Push directly to branches or create Pull Requests for collaborative review.

### 🤖 AI-Powered Assistant
**Let AI do the heavy lifting.**
Connect Claude or Gemini to auto-generate metadata, field descriptions, and even infer constraints from your sample data.

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, TypeScript, Vite 6 |
| **Geospatial** | GDAL3.js, jszip, js-yaml, STAC |
| **Icons** | Lucide React |
| **Sources** | PostGIS (pg), Supabase, GeoPackage |
| **Engines** | pygeoapi, QGIS Server |
| **Deployment** | Docker, Fly.io, Railway, GitHub Actions |

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

# Optional: AI Assistant (Claude or Gemini)
VITE_DEFAULT_AI_KEY=your_api_key_here
VITE_DEFAULT_AI_PROVIDER=claude  # or 'gemini'
```

The app includes a small Express server (`server.js`) that proxies GitHub OAuth and handles PostGIS schema imports. In development, `npm run dev` starts both Vite and the server automatically.

---

## 🏗 Deployment Architecture

A Waystones project generates a complete deployment ecosystem:
- **OGC API – Features**: RESTful access to your data via pygeoapi.
- **WMS**: Styled map rendering via QGIS Server.
- **CI/CD**: GitHub Actions workflows for automated builds and cloud pushes.
- **Sync Engine**: Python-based delta-transfer for high-performance live updates.

## 🌍 Supported Standards
- **OGC API – Features** (Full Part 1 & 2 support)
- **WMS** — Web Map Service
- **GeoPackage, GeoJSON, GML, Shapefile**
- **STAC** — SpatioTemporal Asset Catalog

## 📁 Project Structure

```
waystones/
├── components/        # React UI components (dialogs, editor, deploy panels, etc.)
├── hooks/             # Custom React hooks (useLayerActions, useHistory, etc.)
├── utils/             # Services and utilities
│   ├── deploy/        # Deployment generators (pygeoapi, QGIS, Docker, GitHub Actions)
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

## 🇳🇴 Language Support
Full UI translations for **English** and **Norwegian**.

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
