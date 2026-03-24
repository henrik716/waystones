# Hospitals — Deploy Kit

Autogenerert fra Waystones · Deployment target: **Railway**

## Tjenester

| Tjeneste | Beskrivelse | URL |
|----------|-------------|-----|
| pygeoapi | OGC API – Features | https://\<app\>.up.railway.app |
| QGIS Server | WMS/WFS kartlag | https://<qgis-service>.up.railway.app/ows/?SERVICE=WMS&REQUEST=GetCapabilities |

## Kom i gang med Railway

### Steg

1. Gå til [railway.app](https://railway.app) og opprett en konto
2. Klikk **"New Project"** → **"Deploy from GitHub Repo"**
3. Velg dette repoet
4. Railway oppdager `Dockerfile` automatisk og starter deploy

### Miljøvariabler

Sett disse under **Variables** i Railway dashboard:

| Variabel | Verdi |
|----------|-------|
| `PYGEOAPI_SERVER_URL` | `https://<din-app>.up.railway.app` (kopier fra Railway dashboard) |
| `QGIS_SERVER_PUBLIC_URL` | `https://<qgis-service>.up.railway.app/ows/` |

> **Merk:** Railway setter `PORT` automatisk — ikke overstyr denne.

### QGIS Server (WMS/WFS)

Railway deployer én tjeneste per repo som standard. For å kjøre QGIS Server i tillegg:

1. Klikk **"+ New"** → **"GitHub Repo"** i samme prosjekt
2. Velg dette repoet igjen
3. Under **Settings → Build**, sett Dockerfile path til `Dockerfile.qgis`
4. Under **Settings → Deploy**, sett health check path til `/ows/?SERVICE=WMS&REQUEST=GetCapabilities` og timeout til **300s**
5. Bekreft at porten vises som **80** under **Settings → Networking**

### Data

GeoPackage-filen er bakt inn i Docker-imaget under build.
For å oppdatere data: legg ny fil i `data/`-mappen og push til GitHub.

### Automatisk deploy

Railway deployer automatisk ved push til main. Ingen GitHub Actions nødvendig.

## Filer

| Fil | Beskrivelse |
|-----|-------------|
| `model.json` | Datamodell (Waystones) |
| `Dockerfile` | pygeoapi container |
| `pygeoapi-config.yml` | OGC API-konfigurasjon |
| `Dockerfile.qgis` | QGIS Server container |
| `project.qgs` | QGIS-prosjekt med lag og stil |
| `railway.json` | Railway-konfigurasjon (pygeoapi) |
| `railway.qgis.json` | Railway-konfigurasjon (QGIS Server) |
| `.env.template` | Mal for miljøvariabler |
