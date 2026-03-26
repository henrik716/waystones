import { WAYSTONES_FAVICON_DATA_URL, WAYSTONES_LOGO_SVG } from './brandAssets';
import { CORE_STYLES } from './baseStyles';

export function generateBaseHtml(brand: string, brandDark: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="{{ locale | default('en') }}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{% block title %}${title}{% endblock %} - OGC API</title>
  
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
  <link rel="icon" type="image/svg+xml" href="${WAYSTONES_FAVICON_DATA_URL}">
  
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin=""/>
  
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;0,9..40,800&display=swap" rel="stylesheet">
  
  <style>
    :root {
      --brand: ${brand};
      --brand-dark: ${brandDark};
    }
    ${CORE_STYLES}
  </style>
  {% block extrahead %}{% endblock %}
</head>
<body>
  <nav class="navbar navbar-expand-md navbar-light">
    <div class="container">
      <a class="navbar-brand" href="{{ config.server.url }}">
        <span style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:8px;flex-shrink:0" class="me-2">
          ${WAYSTONES_LOGO_SVG}
        </span>
        {{ config.metadata.identification.title }}
      </a>
      <button class="navbar-toggler border-0" type="button" data-bs-toggle="collapse" data-bs-target="#navMenu">
        <span class="navbar-toggler-icon"></span>
      </button>
      <div class="collapse navbar-collapse" id="navMenu">
        <ul class="navbar-nav ms-auto gap-2">
          <li class="nav-item">
            <a class="nav-link" href="{{ config.server.url }}/collections">Collections</a>
          </li>
          <li class="nav-item">
            <a class="nav-link" href="{{ config.server.url }}/openapi">API</a>
          </li>
          <li class="nav-item">
            <a class="nav-link" href="{{ config.server.url }}/conformance">Conformance</a>
          </li>
          {% if config.server.languages | length > 1 %}
          <li class="nav-item dropdown">
            <a class="nav-link dropdown-toggle" href="#" data-bs-toggle="dropdown">
              {{ locale | default('en') }}
            </a>
            <div class="dropdown-menu dropdown-menu-end shadow-sm border-0 mt-2" style="border-radius: var(--radius);">
              {% for lang in config.server.languages %}
              <a class="dropdown-item py-2" href="?lang={{ lang }}">{{ lang }}</a>
              {% endfor %}
            </div>
          </li>
          {% endif %}
        </ul>
      </div>
    </div>
  </nav>

  <div class="container mt-4">
    <div class="breadcrumb">
      {% block crumbs %}
      <a href="{{ config.server.url }}">Home</a>
      {% endblock %}
    </div>
  </div>

  <main class="container">
    {% block body %}{% endblock %}
  </main>

  <footer class="gf-footer">
    <div class="container d-flex justify-content-between align-items-center flex-wrap gap-3">
      <span>Powered by <a href="https://pygeoapi.io" class="fw-bold">pygeoapi</a> {{ version }}</span>
      <a href="https://github.com/henrik716/waystones" style="color:inherit;text-decoration:none;display:inline-flex;align-items:center;gap:0.4rem;font-weight:500;transition:opacity 0.2s;" onmouseover="this.style.opacity=0.8" onmouseout="this.style.opacity=1">
        <span style="display:inline-flex;width:24px;height:24px;">
          ${WAYSTONES_LOGO_SVG}
        </span>
        Made with Waystones
      </a>
    </div>
  </footer>

  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
  
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
  
  {% block extrabody %}{% endblock %}
  {% block extrafoot %}{% endblock %}
</body>
</html>`;
}
