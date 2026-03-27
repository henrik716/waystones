import { DataModel } from '../../../types';

export function generateCollectionHtml(_model: DataModel): string {
  return `{% extends "_base.html" %}
{% block title %}{{ super() }} - {{ data.title | default(data.id) }}{% endblock %}
{% block crumbs %}
  {{ super() }} / 
  <a href="{{ config.server.url }}/collections">Collections</a> / 
  <span>{{ data.title | default(data.id) }}</span>
{% endblock %}
{% block body %}
<style>
  .coll-hero { display:flex; gap:1.75rem; align-items:flex-start; margin-bottom:2rem; }
  #coll-map { width:200px; height:170px; flex-shrink:0; border-radius:calc(var(--radius) * 0.75); border:1px solid #e2e8f0; box-shadow:var(--shadow-sm); }
  .coll-hero-body { flex:1; min-width:0; }
  .coll-hero-title { font-size:2rem; font-weight:800; letter-spacing:-0.03em; margin-bottom:0.25rem; color:var(--brand); }
  .coll-hero-desc { color:#475569; font-size:0.95rem; margin-bottom:0.85rem; line-height:1.6; }
  .coll-hero-tags { display:flex; flex-wrap:wrap; gap:0.35rem; }
  .coll-hero-tag { font-size:0.72rem; background:#f1f5f9; color:#475569; border:1px solid #e2e8f0; border-radius:999px; padding:0.15rem 0.65rem; }
  .browse-btn { display:inline-flex; align-items:center; gap:0.6rem; padding:0.85rem 1.5rem; background:#f8fafc; border:1px solid #e2e8f0; border-radius:var(--radius); font-weight:700; font-size:0.95rem; color:var(--brand); text-decoration:none; transition:all 0.2s; margin-bottom:1.5rem; }
  .browse-btn:hover { background:#f1f5f9; border-color:#cbd5e1; color:var(--brand); text-decoration:none; box-shadow:var(--shadow-sm); }
  .url-block { background:#f8fafc; border:1px solid #e2e8f0; border-radius:var(--radius); padding:1.25rem 1.5rem; margin-bottom:1.5rem; }
  .url-row { display:flex; align-items:center; gap:1rem; padding:0.6rem 0; border-bottom:1px solid #f1f5f9; }
  .url-row:last-child { border-bottom:none; }
  .url-label { font-size:0.8rem; font-weight:600; color:#475569; min-width:110px; flex-shrink:0; }
  .url-code { flex:1; font-family:monospace; font-size:0.78rem; color:#334155; background:#fff; border:1px solid #e2e8f0; border-radius:0.375rem; padding:0.35rem 0.65rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .url-copy { flex-shrink:0; background:none; border:none; color:#94a3b8; cursor:pointer; padding:0.25rem; border-radius:0.25rem; transition:color 0.15s; line-height:1; }
  .url-copy:hover { color:var(--brand); }
  .sidebar-card { background:#fff; border:1px solid #e2e8f0; border-radius:var(--radius); box-shadow:var(--shadow-sm); padding:1.25rem 1.5rem; }
  .sidebar-card-title { font-size:0.8rem; font-weight:700; color:#475569; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:1rem; display:flex; align-items:center; gap:0.5rem; }
  .sidebar-row { display:flex; justify-content:space-between; align-items:baseline; padding:0.5rem 0; border-bottom:1px solid #f8fafc; font-size:0.875rem; gap:1rem; }
  .sidebar-row:last-child { border-bottom:none; }
  .sidebar-key { color:#94a3b8; font-weight:500; flex-shrink:0; }
  .sidebar-val { color:#0f172a; font-weight:600; text-align:right; word-break:break-all; }
</style>

<div class="row g-4">
  <div class="col-lg-8">

    <!-- Hero -->
    <div class="coll-hero">
      <div id="coll-map"></div>
      <div class="coll-hero-body">
        <div class="coll-hero-title">{{ data.title | default(data.id) }}</div>
        <div class="coll-hero-desc">{{ data.description }}</div>
        <div class="coll-hero-tags">
          {% for kw in data.keywords %}<span class="coll-hero-tag">{{ kw }}</span>{% endfor %}
        </div>
      </div>
    </div>

    <!-- Browse CTA -->
    <a class="browse-btn" href="{{ config.server.url }}/collections/{{ data.id }}/items">
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0f172a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
      Browse collections
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
    </a>

    <!-- URL examples -->
    <div class="url-block">
      <div style="font-size:0.85rem;font-weight:700;color:#475569;margin-bottom:0.85rem;display:flex;align-items:center;gap:0.4rem;">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
        Usage examples
      </div>
      <div class="url-row">
        <span class="url-label">QGIS</span>
        <span class="url-code" id="url-qgis">{{ config.server.url }}/collections/{{ data.id }}/items?f=json</span>
        <button class="url-copy" onclick="copyUrl('url-qgis')" title="Copy">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
        </button>
      </div>
      <div class="url-row">
        <span class="url-label">ArcGIS Online</span>
        <span class="url-code" id="url-arcgis">{{ config.server.url }}/collections/{{ data.id }}/items</span>
        <button class="url-copy" onclick="copyUrl('url-arcgis')" title="Copy">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
        </button>
      </div>
      <div class="url-row">
        <span class="url-label">JSON</span>
        <span class="url-code" id="url-json">{{ config.server.url }}/collections/{{ data.id }}?f=json</span>
        <button class="url-copy" onclick="copyUrl('url-json')" title="Copy">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
        </button>
      </div>
    </div>

  </div>

  <!-- Sidebar -->
  <div class="col-lg-4">
    <div class="sidebar-card">
      <div class="sidebar-card-title">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        About this collection
      </div>
      <div class="sidebar-row">
        <span class="sidebar-key">Type</span>
        <span class="sidebar-val">{{ data.itemType | default('feature') | capitalize }}</span>
      </div>
      {% if data.extent and data.extent.spatial and data.extent.spatial.bbox %}
      <div class="sidebar-row">
        <span class="sidebar-key">Extent</span>
        <span class="sidebar-val" style="font-size:0.75rem;font-family:monospace;">{{ data.extent.spatial.bbox[0] | join(', ') }}</span>
      </div>
      {% endif %}
      {% if data.crs %}
      <div class="sidebar-row" style="align-items:flex-start;">
        <span class="sidebar-key">CRS</span>
        <span class="sidebar-val" style="display:flex;flex-direction:column;gap:0.2rem;align-items:flex-end;">
          {% for crs_uri in data.crs %}
            <span style="font-size:0.78rem;font-family:monospace;">{{ crs_uri | replace('http://www.opengis.net/def/crs/EPSG/0/', 'EPSG:') | replace('http://www.opengis.net/def/crs/OGC/1.3/CRS84', 'CRS84') }}</span>
          {% endfor %}
        </span>
      </div>
      {% endif %}
      <div class="sidebar-row" style="margin-top:0.5rem;padding-top:0.9rem;border-top:1px solid #e2e8f0;flex-wrap:wrap;gap:0.5rem;">
        <a href="{{ config.server.url }}/collections/{{ data.id }}/queryables" style="font-size:0.83rem;color:var(--brand);font-weight:600;">Queryables &rarr;</a>
        <a href="{{ config.server.url }}/collections/{{ data.id }}/schema" style="font-size:0.83rem;color:var(--brand);font-weight:600;">Schema &rarr;</a>
      </div>
    </div>
  </div>
</div>
{% endblock %}

{% block extrafoot %}
<script>
  function copyUrl(id) {
    var el = document.getElementById(id);
    if (!el) return;
    navigator.clipboard.writeText(el.textContent).then(function() {
      el.style.background = '#dcfce7';
      setTimeout(function() { el.style.background = ''; }, 1200);
    });
  }
  document.addEventListener('DOMContentLoaded', function() {
    var map = L.map('coll-map', { zoomControl: false, attributionControl: false }).setView([0, 0], 1);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 18 }).addTo(map);
    {% if data.extent and data.extent.spatial and data.extent.spatial.bbox %}
      var bbox = {{ data.extent.spatial.bbox[0] | tojson }};
      var sw = [bbox[1], bbox[0]], ne = [bbox[3], bbox[2]];
      var brandColor = getComputedStyle(document.documentElement).getPropertyValue('--brand').trim();
      L.rectangle([sw, ne], { color: brandColor, weight: 2, fillOpacity: 0.15 }).addTo(map);
      map.fitBounds([sw, ne], { padding: [8, 8] });
    {% endif %}
  });
</script>
{% endblock %}`;
}
