/**
 * Core CSS styles for the pygeoapi theme.
 * Expects --brand and --brand-dark variables to be defined in :root.
 */
export const CORE_STYLES = `
    :root {
      --radius: 0.75rem; /* Match app border radius */
      --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
      --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.08), 0 2px 4px -1px rgba(0, 0, 0, 0.04);
      --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
    }
    body { font-family: 'DM Sans', system-ui, -apple-system, sans-serif; color: #0f172a; background: #f8fafc; -webkit-font-smoothing: antialiased; }
    h1, h2, h3 { color: var(--brand); font-weight: 700; letter-spacing: -0.02em; }
    h1 { font-size: 1.75rem; }
    h2 { font-size: 1.375rem; }
    h3 { font-size: 1.125rem; }

    /* Sleek Navbar */
    .navbar { 
      background: rgba(255, 255, 255, 0.85) !important;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-bottom: 1px solid rgba(226, 232, 240, 0.6);
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.03); 
      padding: 1rem 1.5rem;
      position: sticky;
      top: 0;
      z-index: 1030;
    }
    .navbar-brand { 
      font-weight: 800; 
      font-size: 1.25rem; 
      letter-spacing: -0.02em; 
      color: var(--brand) !important;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .nav-link { 
      color: #4338ca !important; 
      font-weight: 600;
      padding: 0.5rem 1rem !important;
      border-radius: 9999px;
      transition: all 0.2s ease;
    }
    .nav-link:hover, .nav-link.active {
      background: #eef2ff;
    }
    
    /* Cards */
    .card { 
      border: 1px solid rgba(226, 232, 240, 0.8); 
      border-radius: var(--radius);
      box-shadow: var(--shadow-sm); 
      background: #ffffff;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); 
    }
    .card:hover { 
      transform: translateY(-4px);
      box-shadow: var(--shadow-lg); 
      border-color: #cbd5e1;
    }
    .card-header {
      background: #eef2ff;
      border-bottom: 1px solid #c7d2fe;
      font-weight: 700;
      padding: 1.25rem 1.5rem;
      font-size: 1.1rem;
      color: #4338ca;
    }
    .card-body { padding: 1.5rem; }
    
    /* Map Container Polish */
    #map { 
      height: 500px; /* Essential for Leaflet to render */
      border-radius: 0.75rem; 
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.08); 
      border: 1px solid #c7d2fe; 
      z-index: 1; 
    }
    
    /* Tables */
    .table { font-size: 0.875rem; color: #334155; margin-bottom: 0; }
    .table thead th {
      background: #f8fafc;
      border-bottom: 2px solid #e2e8f0;
      border-top: none;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--brand);
      opacity: 0.75;
      font-weight: 700;
      padding: 0.75rem 1rem;
    }
    .table td { padding: 0.875rem 1rem; vertical-align: middle; border-color: #f1f5f9; }
    .table-hover tbody tr { transition: background-color 0.15s ease; }
    .table-hover tbody tr:hover { background-color: #eef2ff; }
    
    /* Buttons */
    .btn { font-weight: 600; border-radius: 0.5rem; padding: 0.5rem 1.25rem; transition: all 0.2s; }
    .btn-primary { background: var(--brand); border-color: var(--brand); box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .btn-primary:hover, .btn-primary:focus { 
      background: var(--brand-dark); 
      border-color: var(--brand-dark); 
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.15);
      transform: translateY(-1px);
    }
    
    /* Miscellaneous */
    .breadcrumb { 
      background: transparent; 
      padding: 0.75rem 0; 
      font-size: 0.875rem; 
      font-weight: 500;
      margin-bottom: 1rem;
      color: #94a3b8;
    }
    .breadcrumb a { color: var(--brand); text-decoration: none; transition: color 0.15s; }
    .breadcrumb a:hover { color: var(--brand); }
    
    a { color: var(--brand); transition: color 0.15s ease; text-decoration: none; }
    a:hover { color: var(--brand-dark); text-decoration: underline; }
    
    /* Footer */
    footer.gf-footer { 
      border-top: 1px solid #e2e8f0; 
      color: #64748b;
      font-size: 0.875rem; 
      padding: 2rem 0; 
      margin-top: 4rem; 
      background: #ffffff;
    }
    main.container { padding-top: 1rem; padding-bottom: 3rem; min-height: 50vh; }
`;
