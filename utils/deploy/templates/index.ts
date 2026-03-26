import { DataModel } from '../../../types';

export function generateIndexHtml(_model: DataModel): string {
  return `{% extends "_base.html" %}
{% block title %}{{ super() }} - Home{% endblock %}
{% block body %}
<style>
  .hero-sec { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:2.5rem; gap:2rem; }
  .hero-text { flex:1; max-width:700px; }
  .hero-title { font-size:2.25rem; font-weight:800; letter-spacing:-0.03em; margin-bottom:1rem; color:#4338ca; }
  .hero-desc { font-size:1.05rem; color:#475569; line-height:1.6; margin-bottom:1.5rem; }
  
  .cta-card { background:#f1f5f9; border:1px solid #cbd5e1; border-radius:var(--radius); padding:1.5rem; margin-bottom:2rem; transition:all 0.2s; text-decoration:none; display:flex; align-items:center; gap:1.25rem; color:inherit; }
  .cta-card:hover { background:#e2e8f0; border-color:#94a3b8; box-shadow:0 4px 12px rgba(0,0,0,0.06); text-decoration:none; color:inherit; transform:translateY(-2px); }
  .cta-icon { width:52px; height:52px; flex-shrink:0; display:flex; align-items:center; justify-content:center; color:#0f172a; }
  .cta-body { flex:1; }
  .cta-title { font-weight:600; font-size:1.15rem; color:#4338ca; margin-bottom:0.15rem; }
  .cta-desc { font-size:0.95rem; color:#475569; }
  .cta-arrow { color:#4338ca; opacity:0.6; }
  .cta-card:hover .cta-arrow { opacity:1; }
  
  .api-block { border:1px solid #cbd5e1; border-radius:var(--radius); padding:0; margin-bottom:2rem; overflow:hidden; }
  .api-header { padding:1.25rem 1.5rem; display:flex; align-items:center; gap:0.6rem; font-weight:600; color:#0f172a; font-size:1.05rem; padding-bottom:0.5rem; border-bottom:none; }
  .api-content { padding:1.5rem; padding-top:0.5rem; }
  
  .api-url-box { display:flex; align-items:center; background:#e2e8f0; border-radius:0.5rem; margin-bottom:1.5rem; }
  .api-url-text { flex:1; padding:0.85rem 1rem; font-family:monospace; font-size:0.9rem; color:#334155; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .api-url-btn { background:none; border:none; padding:0 1.25rem; color:var(--brand); cursor:pointer; font-weight:600; transition:color 0.15s; height:100%; display:flex; align-items:center; justify-content:center; }
  .api-url-btn:hover { color:#000; }
  
  .api-links { list-style:none; padding:0; margin:0; }
  .api-links a { display:flex; justify-content:space-between; align-items:center; padding:0.85rem 0; color:var(--brand); font-weight:400; text-decoration:none; font-size:1.1rem; border-bottom:none; transition:opacity 0.15s; }
  .api-links a:hover { opacity:0.75; text-decoration:none; }
  
  .sidebar-card { background:#fff; border:1px solid #e2e8f0; border-radius:var(--radius); box-shadow:var(--shadow-sm); padding:1.5rem; margin-bottom:1.5rem; }
  .sidebar-title { font-size:0.95rem; font-weight:700; color:#0f172a; margin-bottom:1.25rem; display:flex; align-items:center; gap:0.5rem; border-bottom:2px solid #f1f5f9; padding-bottom:0.75rem; }
  .meta-grid { display:grid; grid-template-columns:100px 1fr; gap:0.75rem 0; font-size:0.85rem; margin-bottom:1.5rem; }
  .meta-lbl { color:#64748b; font-weight:500; }
  .meta-val { color:#0f172a; font-weight:600; }
  .tags-wrap { display:flex; flex-wrap:wrap; gap:0.35rem; margin-top:0.2rem; }
  .tag-pill { background:#e0e7ff; color:#4338ca; border-radius:999px; padding:0.15rem 0.6rem; font-size:0.75rem; font-weight:600; }
  
  .contact-box { background:#f8fafc; border:1px solid #e2e8f0; border-radius:0.5rem; padding:1rem; }
  .contact-hdr { font-weight:700; font-size:0.85rem; color:#475569; margin-bottom:0.85rem; display:flex; align-items:center; gap:0.5rem; cursor:pointer; }
  .contact-row { margin-bottom:0.65rem; }
  .contact-row:last-child { margin-bottom:0; }
  .contact-lbl { display:block; font-size:0.75rem; color:#64748b; font-weight:600; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:0.15rem; }
  .contact-val { font-size:0.85rem; color:var(--brand); word-break:break-all; }
</style>

<div class="row">
  <div class="col-lg-8 pe-lg-5">
    
    <div class="hero-sec">
      <div class="hero-text">
        <div class="hero-title">{{ config.metadata.identification.title }}</div>
        <div class="hero-desc">{{ config.metadata.identification.description }}</div>
      </div>
    </div>

    <a href="{{ config.server.url }}/collections" class="cta-card">
      <div class="cta-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
      </div>
      <div class="cta-body">
        <div class="cta-title">Browse collections</div>
        <div class="cta-desc">Browse through the default collections exposed by this API</div>
      </div>
      <div class="cta-arrow">
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
      </div>
    </a>

    <div class="api-block">
      <div class="api-header">
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
        Use the API
      </div>
      <div class="api-content">
        <div class="api-url-box">
          <div class="api-url-text" id="api-base-url">{{ config.server.url }}</div>
          <button class="api-url-btn" onclick="copyApiUrl()" title="Copy API URL">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
        </div>
        
        <ul class="api-links">
          <li>
            <a href="{{ config.server.url }}/openapi?f=html">
              <span>Swagger UI</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            </a>
          </li>
          <li>
            <a href="{{ config.server.url }}/openapi?f=json">
              <span>OpenAPI Document</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            </a>
          </li>
          <li>
            <a href="{{ config.server.url }}/conformance">
              <span>Conformance</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            </a>
          </li>
        </ul>
      </div>
    </div>

  </div>
  
  <div class="col-lg-4">
    <div class="sidebar-card">
      <div class="sidebar-title">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
        Info about dataset
      </div>
      
      <div class="meta-grid">
        <div class="meta-lbl">Provider</div>
        <div class="meta-val">{{ config.metadata.provider.organization | default('System') }}</div>
        
        <div class="meta-lbl">License</div>
        <div class="meta-val">
          {% if config.metadata.license.url %}
            <a href="{{ config.metadata.license.url }}" target="_blank" style="color:var(--brand)">{{ config.metadata.license.name | default('Unknown') }}</a>
          {% else %}
            {{ config.metadata.license.name | default('Unknown') }}
          {% endif %}
        </div>
        
        <div class="meta-lbl">Keywords</div>
        <div class="meta-val">
          <div class="tags-wrap">
            {% for kw in config.metadata.identification.keywords %}
              <span class="tag-pill">{{ kw }}</span>
            {% endfor %}
          </div>
        </div>
      </div>
      
      {% if config.metadata.contact.url or config.metadata.contact.email %}
      <div class="contact-box">
        <div class="contact-hdr">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          Contact Info
        </div>
        
        {% if config.metadata.contact.url %}
        <div class="contact-row">
          <span class="contact-lbl">URL</span>
          <a class="contact-val" href="{{ config.metadata.contact.url }}" target="_blank">{{ config.metadata.contact.url }}</a>
        </div>
        {% endif %}
        
        {% if config.metadata.contact.email %}
        <div class="contact-row">
          <span class="contact-lbl">E-mail</span>
          <a class="contact-val" href="mailto:{{ config.metadata.contact.email }}">{{ config.metadata.contact.email }}</a>
        </div>
        {% endif %}
        
        {% if config.metadata.provider.name %}
        <div class="contact-row">
          <span class="contact-lbl">Contact person</span>
          <span class="contact-val">{{ config.metadata.provider.name }}</span>
        </div>
        {% endif %}
      </div>
      {% endif %}
      
    </div>
  </div>
</div>
{% endblock %}

{% block extrafoot %}
<script>
  function copyApiUrl() {
    var el = document.getElementById('api-base-url');
    var btn = document.querySelector('.api-url-btn');
    if (!el || !btn) return;
    navigator.clipboard.writeText(el.textContent).then(function() {
      var origColor = btn.style.color;
      btn.style.color = '#10b981'; // green
      btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
      setTimeout(function() { 
        btn.style.color = origColor; 
        btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
      }, 1500);
    });
  }
</script>
{% endblock %}`;
}
