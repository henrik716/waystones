import { DataModel } from '../../../types';

export function generateItemHtml(_model: DataModel): string {
  return `{% extends "_base.html" %}
{% set ptitle = data['properties'][data['title_field']] or data['id'] | string %}
{% block title %}{{ super() }} - {{ ptitle }}{% endblock %}
{% block crumbs %}
  {{ super() }} /
  <a href="{{ data['collections_path'] }}">Collections</a>
  {% for link in data['links'] %}
    {% if link.rel == 'collection' %}
       / <a href="{{ link['href'] }}">{{ link['title'] | truncate(25) }}</a>
    {% endif %}
  {% endfor %}
  / <a href="../items">Items</a>
  / <span>{{ ptitle | truncate(25) }}</span>
{% endblock %}
{% block body %}
<style>
  .item-card { background:#fff; border:1px solid #e2e8f0; border-radius:var(--radius); box-shadow:var(--shadow-sm); overflow:hidden; }
  .item-header { padding:1.25rem 1.5rem; border-bottom:1px solid #f1f5f9; background:#f8fafc; }
  .item-title { font-size:1.15rem; font-weight:800; color:#0f172a; margin:0; }
  .item-map { height:350px; border-bottom:1px solid #f1f5f9; }
  .item-prop-table { width:100%; border-collapse:collapse; }
  .item-prop-table th { width:200px; background:#f8fafc; color:#64748b; font-size:0.72rem; text-transform:uppercase; letter-spacing:0.05em; font-weight:700; padding:0.75rem 1.25rem; text-align:left; border-bottom:1px solid #f1f5f9; }
  .item-prop-table td { padding:0.75rem 1.25rem; font-size:0.875rem; color:#334155; border-bottom:1px solid #f1f5f9; word-break:break-word; }
  .item-prop-table tbody tr:hover { background:#f8fafc; }
  .nav-btn { display:inline-flex; align-items:center; gap:0.35rem; padding:0.4rem 0.85rem; background:#fff; color:var(--brand); border:1px solid var(--brand-border); border-radius:0.5rem; font-size:0.82rem; font-weight:600; text-decoration:none; transition:all 0.15s; }
  .nav-btn:hover { background:var(--brand-light); text-decoration:none; }
  .sidebar-card { background:#fff; border:1px solid #e2e8f0; border-radius:var(--radius); box-shadow:var(--shadow-sm); padding:1.25rem 1.5rem; }
  .sidebar-card-title { font-size:0.8rem; font-weight:700; color:#475569; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:1rem; display:flex; align-items:center; gap:0.5rem; }
  .sidebar-row { display:flex; justify-content:space-between; align-items:baseline; padding:0.5rem 0; border-bottom:1px solid #f8fafc; font-size:0.875rem; gap:1rem; }
  .sidebar-row:last-child { border-bottom:none; }
  .sidebar-key { color:#94a3b8; font-weight:500; flex-shrink:0; }
  .sidebar-val { color:#0f172a; font-weight:600; text-align:right; word-break:break-all; }

  @media (max-width: 767px) {
    .item-map { height: 220px; }
    .item-prop-table th {
      width: auto;
      min-width: 100px;
      max-width: 140px;
    }
  }
</style>

<div class="row g-4">
  <div class="col-lg-8">
    <div class="item-card">
      <div class="item-header d-flex align-items-center justify-content-between flex-wrap gap-2">
        <h2 class="item-title">{{ ptitle }}</h2>
        <div class="d-flex gap-2" id="item-nav-top">
          <a href="#" class="nav-btn d-none" id="btn-prev-top">&larr; Prev</a>
          <a href="#" class="nav-btn d-none" id="btn-next-top">Next &rarr;</a>
          {% if data['prev'] %}
            <a href="./{{ data['prev'] }}" class="nav-btn">&larr; Prev (Data)</a>
          {% endif %}
          {% if data['next'] %}
            <a href="./{{ data['next'] }}" class="nav-btn">Next (Data) &rarr;</a>
          {% endif %}
        </div>
      </div>

      <div id="item-map" class="item-map"></div>

      <div class="table-responsive">
        <table class="item-prop-table">
          <thead>
            <tr>
              <th>Property</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>id</td>
              <td style="font-family:monospace; font-weight:600;">{{ data.id }}</td>
            </tr>
            {% for key, value in data['properties'].items() %}
            <tr>
              <td>{{ key }}</td>
              <td>{{ value }}</td>
            </tr>
            {% endfor %}
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <div class="col-lg-4">
    <div class="sidebar-card">
      <div class="sidebar-card-title">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
        About this feature
      </div>

      <div class="sidebar-row">
        <span class="sidebar-key">Feature ID</span>
        <span class="sidebar-val" style="font-family:monospace;">{{ data.id }}</span>
      </div>

      {% for link in data['links'] %}
        {% if link.rel == 'collection' %}
        <div class="sidebar-row">
          <span class="sidebar-key">Collection</span>
          <span class="sidebar-val"><a href="{{ link['href'] }}" style="color:var(--brand)">{{ link['title'] }}</a></span>
        </div>
        {% endif %}
      {% endfor %}

      <div class="sidebar-row" style="margin-top:0.5rem; padding-top:0.75rem; border-top:1px solid #e2e8f0; flex-wrap:wrap; gap:0.5rem;">
        <a href="?f=json" style="font-size:0.83rem; color:var(--brand); font-weight:600;">GeoJSON &rarr;</a>
        <a href="../items" style="font-size:0.83rem; color:var(--brand); font-weight:600;">All Items &rarr;</a>
      </div>
    </div>

    <div class="sidebar-card" style="margin-top:1rem;" id="sidebar-nav">
      <div class="sidebar-card-title">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        Navigation
      </div>
      <div class="d-flex flex-column gap-2 pt-1">
        <a href="#" class="nav-btn w-100 justify-content-center d-none" id="btn-prev-side">&larr; Previous feature</a>
        <a href="#" class="nav-btn w-100 justify-content-center d-none" id="btn-next-side">Next feature &rarr;</a>
        {% if data['prev'] %}
          <a href="./{{ data['prev'] }}" class="nav-btn w-100 justify-content-center">&larr; Previous (Data)</a>
        {% endif %}
        {% if data['next'] %}
          <a href="./{{ data['next'] }}" class="nav-btn w-100 justify-content-center">Next (Data) &rarr;</a>
        {% endif %}
        <a href="../items" class="nav-btn w-100 justify-content-center mt-1" style="border-style:dashed; opacity:0.8;">Back to list</a>
      </div>
    </div>
  </div>
</div>
{% endblock %}

{% block extrafoot %}
<script>
  document.addEventListener('DOMContentLoaded', function() {
    var map = L.map('item-map').setView([0, 0], 1);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      maxZoom: 19
    }).addTo(map);

    var itemData = {{ data | to_json | safe }};
    if (itemData && itemData.geometry) {
      var brandColor = getComputedStyle(document.documentElement).getPropertyValue('--brand').trim();
      var layer = L.geoJSON(itemData, {
        style: function() { return { color: brandColor, weight: 3, fillOpacity: 0.2 }; },
        pointToLayer: function(feature, latlng) {
          return L.circleMarker(latlng, {
            radius: 8, fillColor: brandColor,
            color: '#fff', weight: 2, opacity: 1, fillOpacity: 0.9
          });
        }
      }).addTo(map);
      try { map.fitBounds(layer.getBounds(), { padding: [40, 40] }); } catch(e) {}
    }

    // --- Navigation Logic ---
    try {
      var currentId = "{{ data.id }}";
      var context = JSON.parse(sessionStorage.getItem('gf_items_context') || 'null');
      
      if (context && context.ids) {
        var ids = context.ids;
        var idx = ids.indexOf(currentId);
        
        if (idx !== -1) {
          if (idx > 0) {
            setupBtn('btn-prev-top', ids[idx-1]);
            setupBtn('btn-prev-side', ids[idx-1]);
          }
          if (idx < ids.length - 1) {
            setupBtn('btn-next-top', ids[idx+1]);
            setupBtn('btn-next-side', ids[idx+1]);
          }
        }
      }
    } catch (e) {
      console.warn('Navigation setup failed', e);
    }

    function setupBtn(id, targetId) {
      var el = document.getElementById(id);
      if (el) {
        el.href = './' + targetId;
        el.classList.remove('d-none');
      }
    }
  });
</script>
{% endblock %}`;
}
