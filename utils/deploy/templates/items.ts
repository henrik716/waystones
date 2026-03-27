import { DataModel } from '../../../types';

export function generateItemsHtml(_model: DataModel): string {
  return `{% extends "_base.html" %}
{% block title %}{{ super() }} - Items{% endblock %}
{% block crumbs %}
  {{ super() }} / 
  <a href="{{ config.server.url }}/collections">Collections</a> / 
  <a href="{{ data.dataset_path | default(config.server.url + '/collections') }}">{{ data.title | default('Collection') }}</a> / 
  <span>Items</span>
{% endblock %}
{% block body %}
<style>
  #items-map { height: 420px; border-radius: var(--radius); box-shadow: var(--shadow-md); }
  .items-header { font-size:1.5rem; font-weight:800; letter-spacing:-0.02em; margin-bottom:0.25rem; color: var(--brand); }
  .items-desc { color: #475569; font-size:0.95rem; margin-bottom:1.25rem; }
  .feature-table th { font-size:0.72rem; text-transform:uppercase; letter-spacing:0.05em; color:#94a3b8; font-weight:700; padding:0.65rem 1rem; background:#f8fafc; border-bottom:2px solid #e2e8f0; }
  .feature-table td { padding:0.7rem 1rem; font-size:0.875rem; color:#334155; border-color:#f1f5f9; vertical-align:middle; }
  .feature-table tbody tr { transition:background 0.12s; }
  .feature-table tbody tr:hover { background:#f8fafc; }
  .id-link { font-weight:700; font-family:monospace; font-size:0.95rem; color:var(--brand); display:inline-flex; align-items:center; gap:0.4rem; text-decoration:underline; text-decoration-color:var(--brand-border); text-underline-offset:4px; text-decoration-thickness:2px; transition:all 0.2s; }
  .id-link:hover { color:var(--brand-dark); text-decoration-color:var(--brand); }
  .chip { display:inline-block; font-size:0.72rem; padding:0.15rem 0.6rem; border-radius:999px; background:var(--brand-light); color:var(--brand); font-weight:600; }
  .items-meta-bar { display:flex; gap:1.5rem; flex-wrap:wrap; align-items:center; margin-bottom:0.75rem; padding:0.85rem 1.1rem; background:#fff; border:1px solid #e2e8f0; border-radius: var(--radius); box-shadow:var(--shadow-sm); }
  .items-meta-bar .meta-item { display:flex; flex-direction:column; }
  .items-meta-bar .meta-label { font-size:0.68rem; text-transform:uppercase; letter-spacing:0.06em; color:#94a3b8; font-weight:700; }
  .items-meta-bar .meta-value { font-size:0.9rem; font-weight:600; color:#0f172a; }

  #filter-panel { background:#fff; border:1px solid #e2e8f0; border-radius:var(--radius); box-shadow:var(--shadow-sm); padding:1.5rem; margin-bottom:1rem; display:none; }
  #filter-panel.open { display:block; }
  .filter-row { display:flex; gap:0.75rem; align-items:flex-end; margin-bottom:0.75rem; animation: fadeIn 0.2s ease-out; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
  .filter-row-field { flex: 1; min-width: 0; }
  .filter-row-op { width: 80px; flex-shrink: 0; }
  .filter-row-val { flex: 2; min-width: 0; }
  .filter-row label { display:block; font-size:0.65rem; text-transform:uppercase; letter-spacing:0.06em; color:#94a3b8; font-weight:700; margin-bottom:0.3rem; }
  .filter-row select, .filter-row input { width:100%; font-size:0.85rem; padding:0.455rem 0.65rem; border:1px solid #cbd5e1; border-radius:0.4rem; color:#334155; background:#f8fafc; transition:all 0.15s; outline:none; }
  .filter-row select:focus, .filter-row input:focus { border-color:var(--brand); background:#fff; box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.1); }
  .btn-remove-row { background:none; border:none; color:#cbd5e1; padding:0.45rem; cursor:pointer; transition:all 0.15s; display:flex; align-items:center; justify-content:center; }
  .btn-remove-row:hover { color:#ef4444; background:#fef2f2; border-radius:0.35rem; }
  .btn-add-filter { display:inline-flex; align-items:center; gap:0.45rem; background:#fff; border:1px solid #e2e8f0; color:#64748b; font-size:0.8rem; font-weight:700; padding:0.55rem 1.1rem; border-radius:0.5rem; cursor:pointer; transition:all 0.15s; width: 100%; justify-content: center; margin-bottom: 1.5rem; box-shadow:var(--shadow-sm); }
  .btn-add-filter:hover { border-color:var(--brand); color:var(--brand); background:#f8fafc; box-shadow:var(--shadow-md); }
  .filter-section-title { font-size:0.72rem; text-transform:uppercase; letter-spacing:0.08em; color:#94a3b8; font-weight:800; margin-bottom:1rem; display:flex; align-items:center; gap:0.5rem; }
  .filter-section-title::after { content:""; flex:1; height:1px; background:#f1f5f9; }
  .filter-actions { display:flex; gap:0.75rem; align-items:center; }
  .btn-filter-apply { background:var(--brand); color:#fff; border:none; border-radius:0.5rem; font-size:0.82rem; font-weight:700; padding:0.55rem 1.4rem; cursor:pointer; transition:all 0.2s; box-shadow: 0 4px 6px -1px rgba(99, 102, 241, 0.2); }
  .btn-filter-apply:hover { background:var(--brand-dark); transform:translateY(-1px); box-shadow: 0 6px 12px -2px rgba(99, 102, 241, 0.3); }
  .btn-filter-apply:active { transform:translateY(0); }
  .btn-filter-clear { background:#fff; border:1px solid #e2e8f0; border-radius:0.5rem; font-size:0.82rem; font-weight:700; padding:0.55rem 1.4rem; color:#64748b; cursor:pointer; transition:all 0.2s; }
  .btn-filter-clear:hover { border-color:#94a3b8; color:#334155; background:#f8fafc; }

  /* Active filter chips */
  #active-filters { display:flex; flex-wrap:wrap; gap:0.4rem; margin-bottom:1rem; }
  .active-chip { display:inline-flex; align-items:center; gap:0.3rem; font-size:0.75rem; background:var(--brand-light); color:var(--brand); border:1px solid var(--brand-border); border-radius:999px; padding:0.2rem 0.5rem 0.2rem 0.7rem; font-weight:600; }
  .active-chip button { background:none; border:none; cursor:pointer; color:var(--brand); padding:0; line-height:1; font-size:0.9rem; display:flex; align-items:center; opacity:0.6; transition:opacity 0.15s; }
  .active-chip button:hover { opacity:1; }
  .btn-filter-toggle { display:inline-flex; align-items:center; gap:0.45rem; font-size:0.82rem; font-weight:700; padding:0.38rem 0.85rem; border-radius:0.45rem; cursor:pointer; background:#f1f5f9; border:1px solid #e2e8f0; color:#475569; transition:all 0.15s; white-space:nowrap; }
  .btn-filter-toggle:hover, .btn-filter-toggle.active { background:var(--brand-light); border-color:var(--brand-border); color:var(--brand); }
</style>

<div class="items-header">{{ data.title | default('Collection') }}</div>
<div class="items-desc">{{ data.description }}</div>

<div class="items-meta-bar mb-3">
  <div class="meta-item">
    <span class="meta-label">Collection</span>
    <span class="meta-value">{{ data.title | default('Collection') }}</span>
  </div>
  {% if data.numberMatched is defined %}
  <div class="meta-item">
    <span class="meta-label">Total features</span>
    <span class="meta-value">{{ data.numberMatched }}</span>
  </div>
  {% endif %}
  {% if data.numberReturned is defined %}
  <div class="meta-item">
    <span class="meta-label">Returned</span>
    <span class="meta-value">{{ data.numberReturned }}</span>
  </div>
  {% endif %}
  <div class="meta-item">
    <span class="meta-label">Limit</span>
    <select id="items-limit" class="form-select form-select-sm" style="font-size:0.85rem; padding:0.15rem 1.5rem 0.15rem 0.5rem; border-color:#cbd5e1; border-radius:0.375rem; color:#334155; font-weight:600; cursor:pointer;">
      <option value="{{ config.server.limits.default_items }}">{{ config.server.limits.default_items }} (Default)</option>
      <option value="10">10</option>
      <option value="50">50</option>
      <option value="100">100</option>
    </select>
  </div>
  <div class="ms-auto d-flex gap-2">
    <button id="btn-filter-toggle" class="btn-filter-toggle" onclick="GF.toggleFilterPanel()">
      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
      Filter
    </button>
    <a href="?f=json" class="btn btn-json">JSON</a>
  </div>
</div>

<div id="active-filters"></div>

<div id="filter-panel">
  <div class="filter-section-title">Attribute Filters</div>
  <div id="filter-list" class="mb-2">
    <!-- Rows added dynamically -->
    <div class="filter-loading">Loading queryable properties…</div>
  </div>
  <button id="btn-add-filter" class="btn-add-filter" style="display:none" onclick="GF.addRow()">
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    Add filter
  </button>

  <div class="filter-section-title">Spatial Filter</div>
  <div class="filter-row mb-4">
    <div class="filter-row-field" style="flex:1">
      <label>Bounding box (xmin, vmin, xmax, ymax)</label>
      <input type="text" id="qf-bbox" placeholder="e.g. 10.0, 59.0, 11.0, 60.0">
    </div>
  </div>

  <div class="filter-actions" id="filter-actions" style="display:none; border-top:1px solid #f1f5f9; padding-top:1.25rem;">
    <button class="btn-filter-apply" onclick="GF.applyFilters()">Apply filters</button>
    <button class="btn-filter-clear" onclick="GF.clearFilters()">Clear all</button>
    <span id="filter-count" style="font-size:0.78rem;color:#94a3b8;margin-left:auto;"></span>
  </div>
</div>

<div class="row g-4 mb-4">
  <div class="col-md-12">
    <div id="items-map"></div>
  </div>
</div>

<div class="card" style="overflow:hidden;">
  <div class="card-header d-flex align-items-center justify-content-between">
    <div class="d-flex align-items-center gap-3">
      <span>Features</span>
      {% if data.features %}<span class="chip">{{ data.features | length }} shown</span>{% endif %}
    </div>
    
    <div class="d-flex gap-2">
      {% for link in data.links %}
        {% if link.rel == 'prev' %}
          <a href="{{ link.href }}" class="nav-btn" style="font-size:0.75rem;padding:0.25rem 0.6rem;">&larr; Prev</a>
        {% elif link.rel == 'next' %}
          <a href="{{ link.href }}" class="nav-btn" style="font-size:0.75rem;padding:0.25rem 0.6rem;">Next &rarr;</a>
        {% endif %}
      {% endfor %}
    </div>
  </div>
  <div class="card-body p-0">
    <div class="table-responsive">
      <table class="table feature-table mb-0">
        <thead>
          <tr>
            <th>ID</th>
            {% if data.features and data.features|length > 0 %}
              {% for key in data.features[0].properties.keys() %}
                <th>{{ key }}</th>
              {% endfor %}
            {% endif %}
          </tr>
        </thead>
        <tbody>
          {% for feature in data.features %}
          <tr>
            <td><a class="id-link" href="{{ data.items_path | default(config.server.url + '/collections/items') }}/{{ feature.id }}">{{ feature.id }} <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.7;"><polyline points="9 18 15 12 9 6"/></svg></a></td>
            {% for key, value in feature.properties.items() %}
              <td>{{ value }}</td>
            {% endfor %}
          </tr>
          {% endfor %}
        </tbody>
      </table>
    </div>
  </div>
</div>
{% endblock %}

{% block extrafoot %}
<script>
  document.addEventListener('DOMContentLoaded', function() {
    var map = L.map('items-map').setView([0, 0], 1);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      maxZoom: 19
    }).addTo(map);
    var featuresData = {{ data | to_json | safe }};
    if (featuresData && featuresData.features && featuresData.features.length > 0) {
      var brandColor = getComputedStyle(document.documentElement).getPropertyValue('--brand').trim();
      var layer = L.geoJSON(featuresData, {
        style: function() { return { color: brandColor, weight: 2, fillOpacity: 0.18 }; },
        pointToLayer: function(feature, latlng) {
          return L.circleMarker(latlng, {
            radius: 6, fillColor: brandColor,
            color: '#fff', weight: 1.5, opacity: 1, fillOpacity: 0.85
          });
        },
        onEachFeature: function(feature, layer) {
          var detailsUrl = '{{ data.items_path | default(config.server.url + "/collections/items") }}/' + feature.id;
          var html = "<div style=\\"min-width:240px; font-family:'DM Sans',sans-serif;\\">";

          // Header
          html += '<div style="padding:10px 0; border-bottom:1px solid #f1f5f9; display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">';
          html += '<span style="font-size:0.7rem; text-transform:uppercase; letter-spacing:0.05em; color:#94a3b8; font-weight:700;">Feature</span>';
          html += '<span style="font-family:monospace; font-size:0.85rem; font-weight:700; color:' + brandColor + ';">#' + feature.id + '</span>';
          html += '</div>';

          // Properties Scroll Area
          html += '<div style="max-height:180px; overflow-y:auto; padding-right:4px;">';
          if (feature.properties) {
            for (var p in feature.properties) {
              if (p === 'extent') continue;
              html += '<div style="margin-bottom:6px; padding-bottom:6px; border-bottom:1px solid #f8fafc;">';
              html += '<div style="font-size:0.65rem; color:#94a3b8; text-transform:uppercase; font-weight:600; margin-bottom:1px;">' + p + '</div>';
              html += '<div style="font-size:0.82rem; color:#334155; font-weight:500; word-break:break-all;">' + feature.properties[p] + '</div>';
              html += '</div>';
            }
          }
          html += '</div>';

          // Action Button
          html += '<a href="' + detailsUrl + '" style="display:block; text-align:center; background:' + brandColor + '; color:#fff; text-decoration:none; padding:8px; border-radius:6px; font-size:0.8rem; font-weight:700; margin-top:12px;">';
          html += 'View full details &rarr;';
          html += '</a>';
          
          html += '</div>';
          layer.bindPopup(html);
        }
      }).addTo(map);
      try { map.fitBounds(layer.getBounds(), { padding: [24, 24] }); } catch(e) {}
    }

    var params = (new URL(document.location)).searchParams;
    
    var select = document.getElementById('items-limit');
    if (select) {
      if (params.has('limit')) {
        select.value = params.get('limit');
      }
      select.addEventListener('change', function(ev) {
        var url = new URL(document.location);
        url.searchParams.set('limit', ev.target.value);
        url.searchParams.delete('offset'); // reset to page 1
        document.location = url.toString();
      });
    }

    // --- Queryables filter panel ---
    // Use plain object maps instead of Set to avoid any Jinja2/browser issues
    var QUERYABLES_SKIP = { geometry: true, id: true };
    var RESERVED_PARAMS = { f: true, limit: true, offset: true, bbox: true, datetime: true, lang: true };
    var collectionId = '{{ data.id }}';
    if (!collectionId || collectionId === 'None' || collectionId === '') {
      var pathParts = window.location.pathname.split('/');
      var collectionsIdx = pathParts.indexOf('collections');
      if (collectionsIdx !== -1 && pathParts.length > collectionsIdx + 1) {
        collectionId = pathParts[collectionsIdx + 1];
      }
    }
    var queryablesUrl = '{{ config.server.url }}/collections/' + collectionId + '/queryables?f=json';
    var queryables = {}; // exposed on window.GF so onclick handlers can reach it

    // Expose all filter functions globally so inline onclick="..." can call them
    window.GF = window.GF || {};
    window.GF.queryables = queryables;

    window.GF.toggleFilterPanel = function() {
      var panel = document.getElementById('filter-panel');
      var btn = document.getElementById('btn-filter-toggle');
      var isOpen = panel.classList.toggle('open');
      btn.classList.toggle('active', isOpen);
      if (isOpen && Object.keys(window.GF.queryables).length === 0) {
        window.GF.loadQueryables();
      }
    };

    window.GF.loadQueryables = function() {
      fetch(queryablesUrl)
        .then(function(r) { return r.json(); })
        .catch(function(err) { console.error('GF Debug - Fetch error:', err); return null; })
        .then(function(resp) {
          var list = document.getElementById('filter-list');
          var actions = document.getElementById('filter-actions');
          var addBtn = document.getElementById('btn-add-filter');
          if (!resp || !resp.properties) {
            list.innerHTML = '<div class="filter-loading">No queryable properties available for this collection.</div>';
            return;
          }
          window.GF.queryables = {};
          var props = resp.properties;
          Object.keys(props).forEach(function(key) {
            if (QUERYABLES_SKIP[key]) return;
            window.GF.queryables[key] = props[key];
          });
          if (Object.keys(window.GF.queryables).length === 0) {
            list.innerHTML = '<div class="filter-loading">No filterable properties found.</div>';
            return;
          }
          
          list.innerHTML = ''; // Clear loading
          addBtn.style.display = 'inline-flex';
          actions.style.display = 'flex';
          
          // Pre-fill from URL
          var bboxVal = params.get('bbox') || '';
          var bboxEl = document.getElementById('qf-bbox');
          if (bboxEl) bboxEl.value = bboxVal;

          var rowsRestored = false;
          // 1. Try simple params first (prop=val)
          params.forEach(function(val, key) {
            if (window.GF.queryables[key]) {
              window.GF.addRow({ attr: key, op: '=', val: val });
              rowsRestored = true;
            }
          });
          
          // 2. Try OGC Filter (CQL2)
          var filterVal = params.get('filter');
          if (filterVal) {
            // Simple regex for 'prop op val'
            var re = /([a-zA-Z0-9_]+)\\s*(=|>|<|>=|<=|<>)\\s*(['"]?)(.*?)\\3/g;
            var match;
            while ((match = re.exec(filterVal)) !== null) {
              var attr = match[1];
              var op = match[2];
              var val = match[4];
              if (window.GF.queryables[attr]) {
                window.GF.addRow({ attr: attr, op: op, val: val });
                rowsRestored = true;
              }
            }
          }

          if (!rowsRestored) {
            window.GF.addRow(); // Start with one empty row
          }
          window.GF.updateFilterCount();
        });
    };

    window.GF.addRow = function(data) {
      data = data || { attr: '', op: '=', val: '' };
      var list = document.getElementById('filter-list');
      var row = document.createElement('div');
      row.className = 'filter-row';
      
      var attrOptions = Object.keys(window.GF.queryables).map(function(key) {
        var q = window.GF.queryables[key];
        return '<option value="' + key + '"' + (data.attr === key ? ' selected' : '') + '>' + (q.title || key) + '</option>';
      }).join('');

      var ops = ['=', '<>', '>', '<', '>=', '<='];
      var opOptions = ops.map(function(o) {
        return '<option value="' + o + '"' + (data.op === o ? ' selected' : '') + '>' + o + '</option>';
      }).join('');

      row.innerHTML = 
        '<div class="filter-row-field"><label>Attribute</label><select class="qf-attr">' + attrOptions + '</select></div>' +
        '<div class="filter-row-op"><label>Op</label><select class="qf-op">' + opOptions + '</select></div>' +
        '<div class="filter-row-val"><label>Value</label><input type="text" class="qf-val" value="' + (data.val || '') + '" placeholder="Value..."></div>' +
        '<button class="btn-remove-row" title="Remove" onclick="this.parentElement.remove(); GF.updateFilterCount();">' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>';
      
      list.appendChild(row);
      window.GF.updateFilterCount();
    };

    window.GF.applyFilters = function() {
      var url = new URL(document.location);
      // Clear existing
      Object.keys(window.GF.queryables).forEach(function(key) { url.searchParams.delete(key); });
      url.searchParams.delete('filter');
      url.searchParams.delete('bbox');
      url.searchParams.delete('offset');

      var rows = document.querySelectorAll('.filter-row');
      var simpleFilters = [];
      var cqlFilters = [];

      rows.forEach(function(row) {
        var attr = row.querySelector('.qf-attr')?.value;
        var op = row.querySelector('.qf-op')?.value;
        var val = row.querySelector('.qf-val')?.value.trim();
        if (!attr || !val) return;

        if (op === '=') {
          simpleFilters.push({ key: attr, val: val });
        } else {
          // FIX 2: Check exact type from queryables to prevent pygeofilter 400 Bad Request crashes
          var qType = window.GF.queryables[attr]?.type;
          var isNumericType = (qType === 'number' || qType === 'integer');
          var formattedVal = isNumericType ? val : "'" + val + "'";
          cqlFilters.push(attr + " " + op + " " + formattedVal);
        }
      });

      // Prefer simple params if ONLY equality is used for one or more DIFFERENT keys
      // But if operators are used, or multiple filters for same key, CQL is better
      if (cqlFilters.length > 0) {
        // Build CQL2 filter string
        var allConditions = simpleFilters.map(function(f) { 
          var qType = window.GF.queryables[f.key]?.type;
          var isNumericType = (qType === 'number' || qType === 'integer');
          return f.key + " = " + (isNumericType ? f.val : "'" + f.val + "'");
        }).concat(cqlFilters);
        url.searchParams.set('filter', allConditions.join(' AND '));
      } else {
        simpleFilters.forEach(function(f) {
          url.searchParams.set(f.key, f.val);
        });
      }

      var bboxEl = document.getElementById('qf-bbox');
      if (bboxEl && bboxEl.value.trim()) url.searchParams.set('bbox', bboxEl.value.trim());
      
      document.location = url.toString();
    };

    window.GF.clearFilters = function() {
      var url = new URL(document.location);
      Object.keys(window.GF.queryables).forEach(function(key) { url.searchParams.delete(key); });
      url.searchParams.delete('filter');
      url.searchParams.delete('bbox');
      url.searchParams.delete('offset');
      document.location = url.toString();
    };

    window.GF.updateFilterCount = function() {
      var list = document.getElementById('filter-list');
      var rows = list ? list.querySelectorAll('.filter-row') : [];
      var count = 0;
      rows.forEach(function(row) {
        var v = row.querySelector('.qf-val')?.value.trim();
        if (v) count++;
      });
      var bboxEl = document.getElementById('qf-bbox');
      if (bboxEl && bboxEl.value.trim()) count++;
      var span = document.getElementById('filter-count');
      if (span) span.textContent = count > 0 ? count + ' filter' + (count > 1 ? 's' : '') + ' active' : '';
    };

    window.GF.removeFilter = function(key) {
      var url = new URL(document.location);
      url.searchParams.delete(key);
      url.searchParams.delete('filter'); 
      url.searchParams.delete('bbox'); 
      url.searchParams.delete('offset');
      document.location = url.toString();
    };

    // Render active filter chips from URL params
    (function() {
      var container = document.getElementById('active-filters');
      if (!container) return;
      var chips = [];
      var seenKeys = {};
      params.forEach(function(value, key) {
        if (RESERVED_PARAMS[key]) return;
        var uid = key + '=' + value;
        if (!seenKeys[uid]) { seenKeys[uid] = true; chips.push({ key: key, value: value }); }
      });
      if (params.has('bbox')) {
        var bv = params.get('bbox');
        chips.push({ key: 'bbox', value: bv });
      }
      if (chips.length === 0) return;
      container.innerHTML = chips.map(function(c) {
        return '<span class="active-chip"><span>' + c.key + ': ' + c.value + '</span>'
          + '<button class="chip-remove" data-key="' + c.key + '" title="Remove filter">&times;</button></span>';
      }).join('');
      container.addEventListener('click', function(e) { var t = e.target.closest ? e.target.closest('.chip-remove') : null; if (t && t.dataset && t.dataset.key) window.GF.removeFilter(t.dataset.key); });
      var btn = document.getElementById('btn-filter-toggle');
      if (btn) btn.classList.add('active');
    })();

    // --- Navigation Context Tracking ---
    try {
      var itemIds = [];
      var idLinks = document.querySelectorAll('.id-link');
      idLinks.forEach(function(link) {
        var parts = link.href.split('/');
        itemIds.push(parts[parts.length - 1]);
      });
      if (itemIds.length > 0) {
        sessionStorage.setItem('gf_items_context', JSON.stringify({
          ids: itemIds,
          collection: '{{ data.id }}',
          timestamp: Date.now()
        }));
      }
    } catch (e) {
      console.warn('Failed to save navigation context', e);
    }
  });
</script>
{% endblock %}`;
}
