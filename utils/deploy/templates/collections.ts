import { DataModel } from '../../../types';

export function generateCollectionsHtml(model: DataModel): string {
  const geomTypesStr = model.layers.map(l => {
    const id = l.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    return `'${id}': '${l.geometryType}'`;
  }).join(', ');

  return `{% extends "_base.html" %}
{% block title %}{{ super() }} - Collections{% endblock %}
{% block crumbs %}{{ super() }} / <a href="{{ config.server.url }}/collections">Collections</a>{% endblock %}
{% block body %}
<style>
  .col-row {
    display: flex;
    align-items: stretch;
    gap: 0;
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: var(--radius);
    margin-bottom: 1rem;
    box-shadow: var(--shadow-sm);
    transition: box-shadow 0.2s, border-color 0.2s;
    overflow: hidden;
  }
  .col-row:hover { box-shadow: var(--shadow-md); border-color: #cbd5e1; }
  .col-icon {
    display: flex; align-items: center; justify-content: center;
    width: 90px; flex-shrink: 0;
    background: #f1f5f9;
    color: var(--brand);
    font-size: 2rem;
  }
  .col-body { flex: 1; padding: 1.1rem 1.3rem; min-width: 0; }
  .col-title { font-size: 1.05rem; font-weight: 700; color: var(--brand); text-decoration: none; }
  .col-title:hover { text-decoration: underline; }
  .col-count { font-size: 0.78rem; background: var(--brand-light); color: var(--brand); border-radius: 999px; padding: 0.15rem 0.65rem; font-weight: 600; margin-left: 0.5rem; vertical-align: middle; }
  .col-desc { font-size: 0.875rem; color: #475569; margin: 0.3rem 0 0.6rem; }
  .col-tags { display: flex; flex-wrap: wrap; gap: 0.35rem; }
  .col-tag { font-size: 0.72rem; background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; border-radius: 999px; padding: 0.15rem 0.6rem; }
  .col-meta { padding: 1rem 1.3rem; min-width: 200px; border-left: 1px solid #f1f5f9; display: flex; flex-direction: column; justify-content: center; }
  .col-meta-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; font-weight: 700; }
  .col-meta-value { font-size: 0.85rem; color: #334155; font-weight: 500; margin-bottom: 0.6rem; }
  .col-cta { flex-shrink: 0; display: flex; align-items: center; padding: 0 1.3rem; }
  .col-cta a { font-size: 0.85rem; font-weight: 600; color: var(--brand); white-space: nowrap; text-decoration: none; }
  .col-cta a:hover { text-decoration: underline; }
  #collections-map { height: 380px; border-radius: var(--radius); box-shadow: var(--shadow-md); margin-bottom: 1.5rem; }
</style>

<div class="d-flex justify-content-between align-items-center mb-4">
  <h2 style="font-weight:800;font-size:1.5rem;letter-spacing:-0.02em;color:var(--brand);">Collections</h2>
  <a href="?f=json" class="btn btn-json">JSON</a>
</div>

<div id="collections-map"></div>

{% for col in data.collections %}
<div class="col-row">
  <div class="col-icon">
    {% set geomMap = { ${geomTypesStr} } %}
    {% set gtype = geomMap.get(col.id, 'Unknown') %}
    {% if gtype == 'Point' or gtype == 'MultiPoint' %}
      <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
    {% elif 'Line' in gtype %}
      <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
    {% elif col.itemType == 'record' %}
      <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
    {% else %}
      <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="3"/><circle cx="17" cy="7" r="3"/><circle cx="12" cy="17" r="3"/><line x1="7" y1="10" x2="12" y2="14"/><line x1="17" y1="10" x2="12" y2="14"/></svg>
    {% endif %}
  </div>
  <div class="col-body">
    <div>
      <a class="col-title" href="{{ config.server.url }}/collections/{{ col.id }}">{{ col.title }}</a>
    </div>
    <p class="col-desc">{{ col.description }}</p>
    <div class="col-tags">
      {% for kw in col.keywords %}<span class="col-tag">{{ kw }}</span>{% endfor %}
    </div>
  </div>
  {% if col.crs %}
  <div class="col-meta">
    <div class="col-meta-label">CRS</div>
    <div class="col-meta-value">{{ col.crs[0] | replace('http://www.opengis.net/def/crs/EPSG/0/', 'EPSG:') | replace('http://www.opengis.net/def/crs/OGC/1.3/CRS84', 'CRS84') }}</div>
  </div>
  {% endif %}
  <div class="col-cta">
    <a href="{{ config.server.url }}/collections/{{ col.id }}">View &rarr;</a>
  </div>
</div>
{% endfor %}
{% endblock %}

{% block extrafoot %}
<script>
  document.addEventListener('DOMContentLoaded', function() {
    var map = L.map('collections-map').setView([0, 0], 1);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      maxZoom: 18
    }).addTo(map);
    var brandColor = getComputedStyle(document.documentElement).getPropertyValue('--brand').trim();
    var bounds = L.latLngBounds();
    var hasBounds = false;
    {% for col in data.collections %}
      {% if col.extent and col.extent.spatial and col.extent.spatial.bbox %}
        (function() {
          var bbox = {{ col.extent.spatial.bbox[0] | to_json }};
          var sw = [bbox[1], bbox[0]], ne = [bbox[3], bbox[2]];
          L.rectangle([sw, ne], { color: brandColor, weight: 2, fillOpacity: 0.07 })
            .addTo(map)
            .bindPopup('<b>{{ col.title }}</b><br><a href="{{ config.server.url }}/collections/{{ col.id }}">View &rarr;</a>');
          bounds.extend([sw, ne]);
          hasBounds = true;
        })();
      {% endif %}
    {% endfor %}
    if (hasBounds) map.fitBounds(bounds, { padding: [24, 24] });
  });
</script>
{% endblock %}`;
}
