<div align="center">
# Waystones

**The fastest way to design, model, and deploy world-class geospatial services.**

[![React](https://img.shields.io/badge/React-19-61dafb?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-6-646cff?logo=vite)](https://vitejs.dev)
[![Supabase](https://img.shields.io/badge/Supabase-3ecf8e?logo=supabase&logoColor=white)](https://supabase.com)
</div>

---

Waystones is a modern, web-native platform that bridges the gap between raw spatial data and production-ready geospatial infrastructure. With a focus on developer experience and standards-compliance, it allows you to build OGC API – Features and WMS services in minutes, not days.

## ⚡ The "Wow" Factor

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
- **Live Data Sync**: Integrated **Delta Sync Engine** for keeping live PostGIS, Supabase, and Databricks sources in sync.
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
| **Geospatial** | GDAL3.js, jszip, STAC |
| **Icons** | Lucide React |
| **Sources** | PostGIS (pg), Supabase, Databricks, GeoPackage |
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

## 🇳🇴 Language Support
Full UI translations for **English** and **Norwegian**.

## ⚖️ License
Waystones is dual-licensed:
- **Open Source (AGPL v3)**: For community and open projects.
- **Commercial License**: For proprietary and enterprise use. [Inquire here](../../issues).
