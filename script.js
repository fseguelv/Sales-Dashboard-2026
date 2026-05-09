/* ============================================================
   SALES DASHBOARD 2026 · SCRIPT PRINCIPAL (v3 con Mercado)
   ============================================================ */
const CFG = window.DASHBOARD_CONFIG || {};
const log = (...args) => { if (CFG.enableLogging) console.log('[Dashboard]', ...args); };

const VENDOR_INFO = {
  RC: { name: 'Ricardo Cepeda',  initials: 'RC' },
  MC: { name: 'Mónica Castillo', initials: 'MC' },
  FF: { name: 'Franco Fernández', initials: 'FF' }
};
const STAGE_COLORS = {
  'Contacto':              '#f59e0b',
  'Reunión':               '#8b5cf6',
  'Propuesta enviada':     '#3b82f6',
  'Seguimiento propuesta': '#6366f1',
  'Finalizada':            '#10b981'
};
const VENDOR_COLORS = { RC: '#1e88e5', MC: '#06b6d4', FF: '#8b5cf6' };
const MARKET_COLORS = {
  'Acería':           '#ef4444',
  'Retail':           '#f59e0b',
  'Cobre':            '#d97706',
  'Instalador':       '#10b981',
  'Distribuidor':     '#06b6d4',
  'Fundición':        '#8b5cf6',
  'Energía':          '#3b82f6',
  'Cemento y Cal':    '#64748b',
  'Otros Minerales':  '#a16207',
  'Otros':            '#94a3b8',
  'Sin clasificar':   '#cbd5e1'
};
const STAGES  = (CFG.ETAPAS || []).map(s => s.label);
const MARKET_LIST = CFG.MARKETS || [];
const CLIENT_MARKET_MAP = CFG.CLIENT_TO_MARKET || {};
const RESULTADOS_LIST = CFG.RESULTADOS || ['Ganada','Perdida'];
const RESULTADO_COLORS = { 'Ganada': '#10b981', 'Perdida': '#ef4444' };

const state = {
  data:          { RC: [], MC: [], FF: [] },
  filterVendor:  'ALL',
  filterStage:   'ALL',
  filterMarket:  'ALL',
  filterClient:  '',
  charts:        {},
  vendorCharts:  { RC: {}, MC: {}, FF: {} },
  lastUpdate:    null,
  isDemo:        false,
  execSort:      null,
  vendorSort:    { RC: null, MC: null, FF: null },
  editing:       null
};

/* ===== UTILS ===== */
const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

function fmtUSD(n) {
  if (n === null || n === undefined || n === '' || isNaN(n)) return '–';
  return '$' + Math.round(Number(n)).toLocaleString('en-US');
}
function fmtPct(n, decimals = 0) {
  if (n === null || n === undefined || n === '' || isNaN(n)) return '–';
  return (Number(n) * 100).toFixed(decimals) + '%';
}
function fmtDate(v) {
  if (!v) return '–';
  if (typeof v === 'string' && v.match(/^\d{4}-\d{2}-\d{2}/)) {
    const d = new Date(v);
    if (!isNaN(d)) return d.toLocaleDateString('es-CL', {day:'2-digit', month:'2-digit', year:'numeric'});
  }
  if (v instanceof Date) return v.toLocaleDateString('es-CL', {day:'2-digit', month:'2-digit', year:'numeric'});
  return String(v);
}
function safeNum(v) { const n = Number(v); return isNaN(n) ? 0 : n; }
function stageClass(stage) {
  if (!stage) return '';
  const s = stage.toLowerCase();
  if (s.includes('contacto'))           return 'contacto';
  if (s.includes('reuni'))              return 'reunion';
  if (s.includes('propuesta enviada'))  return 'propuesta';
  if (s.includes('seguimiento'))        return 'seguimiento';
  if (s.includes('finalizada'))         return 'finalizada';
  return '';
}
function escapeHtml(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function showToast(title, msg, type = 'info') {
  const c = $('#toastContainer');
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.innerHTML = '<strong>' + escapeHtml(title) + '</strong><div class="toast-msg">' + escapeHtml(msg) + '</div>';
  c.appendChild(t);
  setTimeout(() => { t.style.opacity='0'; t.style.transform='translateX(20px)'; }, 3500);
  setTimeout(() => t.remove(), 4000);
}
function setStatus(stateName, text) {
  $('#statusDot').className = 'dot-status ' + (stateName || '');
  $('#statusText').textContent = text;
}
function formatDateForInput(v) {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d)) return '';
  return d.toISOString().slice(0, 10);
}

function toggleResultadoField(form, etapa) {
  // Funcion deshabilitada: ya no se usa el campo Resultado
  const fld = form.querySelector('.result-field');
  if (fld) fld.style.display = 'none';
}

function lookupMarket(client) {
  if (!client) return null;
  const norm = String(client).trim().toLowerCase();
  if (CLIENT_MARKET_MAP[norm]) return CLIENT_MARKET_MAP[norm];
  for (const key of Object.keys(CLIENT_MARKET_MAP)) {
    if (norm.startsWith(key + ' ') || norm.startsWith(key + '-')) return CLIENT_MARKET_MAP[key];
  }
  return null;
}
function marketTag(m) {
  const label = m || 'Sin clasificar';
  const color = MARKET_COLORS[label] || MARKET_COLORS['Sin clasificar'];
  return '<span class="tag" style="background:'+color+'22;color:'+color+';font-weight:600">'+escapeHtml(label)+'</span>';
}

/* ===== CARGA ===== */
async function loadData(showSpinner = true) {
  if (showSpinner) $('#loadingOverlay').classList.add('show');
  const apiUrl = CFG.API_URL || '';
  const useDemo = CFG.DEMO_MODE === true || !apiUrl || apiUrl.includes('PEGA_AQUI');
  try {
    if (useDemo) {
      state.isDemo = true;
      // Cargar de localStorage si existe (cambios persistidos localmente)
      try {
        const stored = localStorage.getItem('dashboardData_v3');
        state.data = stored ? JSON.parse(stored) : (window.DEMO_DATA || { RC: [], MC: [], FF: [] });
      } catch(e) { state.data = window.DEMO_DATA || { RC: [], MC: [], FF: [] }; }
      state.lastUpdate = new Date();
      setStatus('demo', 'Modo LOCAL · cambios se guardan en este navegador');
    } else {
      log('GET', apiUrl);
      const res = await fetch(apiUrl, { method: 'GET' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      log('Respuesta GET:', j);
      if (j.status !== 'ok') throw new Error(j.message || 'Respuesta no OK');
      state.isDemo = false;
      state.data = j.data || { RC: [], MC: [], FF: [] };
      state.lastUpdate = new Date();
      setStatus('', 'Conectado · ' + state.lastUpdate.toLocaleTimeString('es-CL'));
    }
    renderConfigBanner();
    renderAll();
  } catch (err) {
    console.error(err);
    setStatus('error', 'Error de conexión');
    showToast('Error', 'No se pudo cargar el Google Sheet: ' + err.message, 'error');
  } finally {
    $('#loadingOverlay').classList.remove('show');
  }
}
function renderConfigBanner() {
  const el = $('#configBanner');
  el.innerHTML = state.isDemo
    ? '<div class="config-banner"><span>⚠️</span><div><strong>Modo DEMO activo</strong>Editá <code>config.js</code> con la URL del Web App de Apps Script.</div></div>'
    : '';
}


function saveLocalData() {
  try {
    localStorage.setItem('dashboardData_v3', JSON.stringify(state.data));
    log('Datos guardados en localStorage');
  } catch(e) { console.error('No se pudo guardar en localStorage:', e); }
}

/* ===== AGREGADOS ===== */
function getAllRows() {
  return ['RC','MC','FF'].flatMap(v => (state.data[v] || []).map(r => ({ ...r, _vendor: v })));
}
function getFilteredExecRows() {
  let rows = getAllRows();
  if (state.filterVendor !== 'ALL') rows = rows.filter(r => r._vendor === state.filterVendor);
  if (state.filterStage  !== 'ALL') rows = rows.filter(r => (r.etapa || '') === state.filterStage);
  if (state.filterMarket !== 'ALL') {
    if (state.filterMarket === '__UNCLASSIFIED__')
      rows = rows.filter(r => !r.mercado);
    else
      rows = rows.filter(r => r.mercado === state.filterMarket);
  }
  const q = state.filterClient.trim().toLowerCase();
  if (q) rows = rows.filter(r =>
    String(r.cliente || '').toLowerCase().includes(q) ||
    String(r.objetivo || '').toLowerCase().includes(q));
  return rows;
}

/* ===== ORDENAMIENTO ===== */
function applySort(rows, sortCfg) {
  if (!sortCfg) return rows;
  const { col, dir } = sortCfg;
  const mult = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    let va = a[col], vb = b[col];
    if (va === null || va === undefined) va = '';
    if (vb === null || vb === undefined) vb = '';
    if (col === 'estimacion' || col === 'avance' || col === 'precio') return (Number(va) - Number(vb)) * mult;
    if (col === 'fecha') {
      const da = new Date(va).getTime() || 0;
      const db = new Date(vb).getTime() || 0;
      return (da - db) * mult;
    }
    return String(va).localeCompare(String(vb), 'es', { sensitivity: 'base' }) * mult;
  });
}
function applySortIndicators(table, sortCfg) {
  table.querySelectorAll('th.sortable').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (sortCfg && th.dataset.sort === sortCfg.col) th.classList.add(sortCfg.dir === 'asc' ? 'sort-asc' : 'sort-desc');
  });
}
function handleSortHeader(table, col) {
  if (table.id === 'execTable') {
    let s = state.execSort;
    s = (s && s.col === col) ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' };
    state.execSort = s;
    renderExecutiveView();
  } else {
    const view = table.closest('.view');
    const vendor = view.id.replace('view-', '');
    let s = state.vendorSort[vendor];
    s = (s && s.col === col) ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' };
    state.vendorSort[vendor] = s;
    renderVendorView(vendor);
  }
}

/* ===== ESCRITURA ===== */
async function postRow(vendor, payload) {
  if (state.isDemo) {
    state.data[vendor] = state.data[vendor] || [];
    payload._row = (state.data[vendor].length ? Math.max(...state.data[vendor].map(r => r._row || 0)) + 1 : 100);
    state.data[vendor].push(payload);
    saveLocalData();
    return { status: 'ok', demo: true };
  }
  log('POST', vendor, payload);
  const res = await fetch(CFG.API_URL, { method: 'POST', body: JSON.stringify({ action: 'add', vendor, ...payload }) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return await res.json();
}

/* ===== RENDER GENERAL ===== */
function renderAll() {
  ['RC','MC','FF'].forEach(v => { $('#badge'+v).textContent = (state.data[v] || []).length; });
  buildStageChips();
  buildMarketChips();
  renderExecutiveView();
  ['RC','MC','FF'].forEach(renderVendorView);
}
function buildStageChips() {
  const container = $('#stageChips');
  container.querySelectorAll('.chip').forEach((c, i) => { if (i > 0) c.remove(); });
  const stages = new Set(getAllRows().map(r => r.etapa).filter(Boolean));
  STAGES.forEach(s => {
    if (!stages.has(s)) return;
    const chip = document.createElement('span');
    chip.className = 'chip' + (state.filterStage === s ? ' active' : '');
    chip.dataset.filter = 'stage';
    chip.dataset.value  = s;
    chip.textContent    = s;
    container.appendChild(chip);
  });
}
function buildMarketChips() {
  const container = $('#marketChips');
  container.querySelectorAll('.chip').forEach((c, i) => { if (i > 0) c.remove(); });
  const present = new Set(getAllRows().map(r => r.mercado).filter(Boolean));
  let unclassifiedCount = getAllRows().filter(r => !r.mercado).length;
  MARKET_LIST.forEach(m => {
    if (!present.has(m)) return;
    const chip = document.createElement('span');
    chip.className = 'chip' + (state.filterMarket === m ? ' active' : '');
    chip.dataset.filter = 'market';
    chip.dataset.value  = m;
    chip.textContent    = m;
    container.appendChild(chip);
  });
  if (unclassifiedCount > 0) {
    const chip = document.createElement('span');
    chip.className = 'chip' + (state.filterMarket === '__UNCLASSIFIED__' ? ' active' : '');
    chip.dataset.filter = 'market';
    chip.dataset.value  = '__UNCLASSIFIED__';
    chip.textContent    = 'Sin clasificar (' + unclassifiedCount + ')';
    container.appendChild(chip);
  }
}

/* ===== VISTA EJECUTIVA ===== */

// Helpers tolerantes a espacios/mayúsculas
function isFinalizada(r) {
  return String(r.etapa || '').trim().toLowerCase() === 'finalizada';
}
function getResultado(r) {
  return String(r.resultado || '').trim().toLowerCase();
}
// Cuenta etapas, pero en 'Finalizada' sólo cuenta resultado=Ganada
function countByStageWinOnly(rows) {
  // Cuenta normal: incluye TODAS las finalizadas (sin distinguir resultado)
  const counts = {};
  STAGES.forEach(s => counts[s] = 0);
  rows.forEach(r => {
    if (r.etapa && counts.hasOwnProperty(r.etapa)) counts[r.etapa]++;
    else if (r.etapa) counts[r.etapa] = (counts[r.etapa] || 0) + 1;
  });
  return counts;
}
function winLossOf(rows) {
  let g = 0, p = 0;
  rows.forEach(r => {
    if (!isFinalizada(r)) return;
    const v = getResultado(r);
    if (v === 'ganada')  g++;
    else if (v === 'perdida') p++;
  });
  log('winLossOf:', { ganadas: g, perdidas: p, total: rows.length });
  return { ganadas: g, perdidas: p };
}

function renderExecutiveView() {
  const filtered = getFilteredExecRows();
  const total      = filtered.length;
  const valEstim   = filtered.reduce((a,r) => a + safeNum(r.estimacion), 0);
  const valPond    = filtered.reduce((a,r) => a + safeNum(r.estimacion) * safeNum(r.avance), 0);
  const finished   = filtered.filter(r => safeNum(r.avance) >= 1).length;
  const avgAvance  = total ? filtered.reduce((a,r) => a + safeNum(r.avance), 0) / total : 0;

  $('#kpiGridExec').innerHTML =
    '<div class="kpi-card"><div class="kpi-label">Oportunidades <span class="kpi-icon">∑</span></div><div class="kpi-value">'+total+'</div><div class="kpi-sub">'+finished+' cerradas · '+(total-finished)+' abiertas</div></div>'+
    '<div class="kpi-card green"><div class="kpi-label">Valor estimado <span class="kpi-icon">$</span></div><div class="kpi-value">'+fmtUSD(valEstim)+'</div><div class="kpi-sub">Pipeline total filtrado</div></div>'+
    '<div class="kpi-card amber"><div class="kpi-label">Valor ponderado <span class="kpi-icon">⚖</span></div><div class="kpi-value">'+fmtUSD(valPond)+'</div><div class="kpi-sub">Estimación × % avance</div></div>'+
    '<div class="kpi-card purple"><div class="kpi-label">% Avance promedio <span class="kpi-icon">%</span></div><div class="kpi-value">'+fmtPct(avgAvance,1)+'</div><div class="kpi-sub">Sales funnel</div></div>';

  // Embudo (en 'Finalizada' sólo cuenta Ganadas)
  const stageCounts = countByStageWinOnly(filtered);
  const stageLabels = Object.keys(stageCounts).filter(s => stageCounts[s] > 0);
  drawBar('chartFunnel', stageLabels, stageLabels.map(s => stageCounts[s]), stageLabels.map(s => STAGE_COLORS[s] || '#94a3b8'), { horizontal: true });

  // Vendedor
  const byVendor = { RC: 0, MC: 0, FF: 0 };
  filtered.forEach(r => byVendor[r._vendor] = (byVendor[r._vendor] || 0) + safeNum(r.estimacion));
  drawDonut('chartByVendor',
    Object.keys(byVendor).map(v => v + ' · ' + VENDOR_INFO[v].name),
    Object.values(byVendor),
    Object.keys(byVendor).map(v => VENDOR_COLORS[v]));

  // Top clientes
  const byClient = {};
  filtered.forEach(r => {
    const k = (r.cliente || '').trim();
    if (!k) return;
    byClient[k] = (byClient[k] || 0) + safeNum(r.estimacion);
  });
  const topEntries = Object.entries(byClient).sort((a,b) => b[1] - a[1]).slice(0, 8);
  drawBar('chartTopClients', topEntries.map(e => e[0]), topEntries.map(e => e[1]), '#1e88e5', { horizontal: true, money: true });

  // ★ NUEVO: Mercado (reemplaza al timeline)
  const byMarket = {};
  filtered.forEach(r => {
    const m = r.mercado || 'Sin clasificar';
    byMarket[m] = (byMarket[m] || 0) + safeNum(r.estimacion);
  });
  const marketEntries = Object.entries(byMarket).sort((a,b) => b[1] - a[1]);
  drawBar('chartByMarket',
    marketEntries.map(e => e[0]),
    marketEntries.map(e => e[1]),
    marketEntries.map(e => MARKET_COLORS[e[0]] || '#94a3b8'),
    { horizontal: true, money: true });

  // Tabla
  const sortedRows = applySort(filtered, state.execSort);
  const tbody = $('#execTable tbody');
  tbody.innerHTML = '';
  sortedRows.forEach(r => {
    const tr = document.createElement('tr');
    const cls = stageClass(r.etapa);
    const av  = safeNum(r.avance);
    const fillClass = av >= 1 ? 'progress-fill full' : 'progress-fill';
    tr.dataset.vendor = r._vendor;
    tr.dataset.row    = r._row || '';
    tr.innerHTML =
      '<td><span class="tag" style="background:'+VENDOR_COLORS[r._vendor]+'22;color:'+VENDOR_COLORS[r._vendor]+'">'+r._vendor+'</span></td>'+
      '<td><strong>'+escapeHtml(r.cliente)+'</strong></td>'+
      '<td>'+marketTag(r.mercado)+'</td>'+
      '<td>'+escapeHtml(r.objetivo)+'</td>'+
      '<td><span class="tag '+cls+'">'+escapeHtml(r.etapa)+'</span></td>'+
      '<td>'+fmtUSD(r.estimacion)+'</td>'+
      '<td><div class="progress-cell"><div class="progress-bar"><div class="'+fillClass+'" style="width:'+(av*100).toFixed(0)+'%"></div></div><span>'+fmtPct(av)+'</span></div></td>'+
      '<td>'+fmtDate(r.fecha)+'</td>'+
      '<td class="col-actions"><div class="row-actions"><button class="btn-icon edit-row-btn" title="Editar oportunidad">✏</button></div></td>';
    tbody.appendChild(tr);
  });
  applySortIndicators($('#execTable'), state.execSort);
  $('#execTableCount').textContent = filtered.length + ' oportunidades';
}

/* ===== VISTA POR VENDEDOR ===== */
function ensureVendorViewBuilt(v) {
  const view = $('#view-' + v);
  if (view.dataset.built) return view;
  const tpl = $('#vendorViewTemplate').content.cloneNode(true);
  view.appendChild(tpl);
  view.querySelector('.vendor-name').textContent   = VENDOR_INFO[v].name;
  view.querySelector('.vendor-avatar').textContent = VENDOR_INFO[v].initials;
  // Cargar selects de etapa y mercado
  const selStage = view.querySelector('select[name=etapa]');
  STAGES.forEach(s => { const o = document.createElement('option'); o.value = s; o.textContent = s; selStage.appendChild(o); });
  const selMarket = view.querySelector('select[name=mercado]');
  MARKET_LIST.forEach(m => { const o = document.createElement('option'); o.value = m; o.textContent = m; selMarket.appendChild(o); });

  const form = view.querySelector('.vendor-form');
  form.addEventListener('submit', (e) => handleAddOpportunity(e, v, form));
  // Auto-completar avance al cambiar etapa
  selStage.addEventListener('change', () => {
    const stage = selStage.value;
    const meta = (CFG.ETAPAS || []).find(x => x.label === stage);
    const inp  = form.querySelector('input[name=avance]');
    if (meta && !inp.value) inp.value = Math.round(meta.avance * 100);
    toggleResultadoField(form, stage);
  });
  // Auto-completar mercado al escribir cliente conocido
  const inpCliente = form.querySelector('input[name=cliente]');
  inpCliente.addEventListener('blur', () => {
    const cli = inpCliente.value.trim();
    const hint = form.querySelector('.mercado-hint');
    if (!cli) { if (hint) hint.textContent = ''; return; }
    const m = lookupMarket(cli);
    if (m) {
      selMarket.value = m;
      if (hint) hint.textContent = '✓ Mercado autocompletado: ' + m;
    } else {
      if (!selMarket.value && hint) hint.textContent = '⚠ Cliente nuevo, selecciona el mercado correspondiente';
    }
  });
  view.dataset.built = '1';
  return view;
}

function renderVendorView(v) {
  const view = ensureVendorViewBuilt(v);
  const rows = state.data[v] || [];
  const total      = rows.length;
  const valEstim   = rows.reduce((a,r) => a + safeNum(r.estimacion), 0);
  const valPond    = rows.reduce((a,r) => a + safeNum(r.estimacion) * safeNum(r.avance), 0);
  const finished   = rows.filter(r => safeNum(r.avance) >= 1).length;
  const avgAvance  = total ? rows.reduce((a,r) => a + safeNum(r.avance), 0) / total : 0;

  view.querySelector('.kpi-vendor').innerHTML =
    '<div class="kpi-card"><div class="kpi-label">Oportunidades</div><div class="kpi-value">'+total+'</div><div class="kpi-sub">'+finished+' finalizadas · '+(total-finished)+' abiertas</div></div>'+
    '<div class="kpi-card green"><div class="kpi-label">Valor estimado</div><div class="kpi-value">'+fmtUSD(valEstim)+'</div><div class="kpi-sub">Pipeline del vendedor</div></div>'+
    '<div class="kpi-card amber"><div class="kpi-label">Valor ponderado</div><div class="kpi-value">'+fmtUSD(valPond)+'</div><div class="kpi-sub">Estimación × % avance</div></div>'+
    '<div class="kpi-card purple"><div class="kpi-label">% Avance promedio</div><div class="kpi-value">'+fmtPct(avgAvance,1)+'</div><div class="kpi-sub">Sales funnel</div></div>';

  // Embudo (Finalizada = solo Ganadas)
  const stageCounts = countByStageWinOnly(rows);
  const labels = Object.keys(stageCounts).filter(s => stageCounts[s] > 0);
  drawVendorChart(v, 'funnel', view.querySelector('.chart-vendor-funnel'),
    { type:'bar', labels, data: labels.map(s => stageCounts[s]), bg: labels.map(s => STAGE_COLORS[s] || '#94a3b8'), horizontal:true });

  // Distribución de avance
  const buckets = {'0-25%':0, '26-50%':0, '51-75%':0, '76-99%':0, '100%':0};
  rows.forEach(r => {
    const a = safeNum(r.avance) * 100;
    if (a >= 100) buckets['100%']++;
    else if (a >= 76) buckets['76-99%']++;
    else if (a >= 51) buckets['51-75%']++;
    else if (a >= 26) buckets['26-50%']++;
    else buckets['0-25%']++;
  });
  drawVendorChart(v, 'progress', view.querySelector('.chart-vendor-progress'),
    { type:'doughnut', labels: Object.keys(buckets), data: Object.values(buckets),
      bg: ['#fde68a','#fca5a5','#93c5fd','#a5b4fc','#86efac'] });

  // ★ NUEVO: Mercado (reemplaza al timeline)
  const byMarket = {};
  rows.forEach(r => {
    const m = r.mercado || 'Sin clasificar';
    byMarket[m] = (byMarket[m] || 0) + safeNum(r.estimacion);
  });
  const marketLabels = Object.keys(byMarket).sort((a,b) => byMarket[b] - byMarket[a]);
  drawVendorChart(v, 'market', view.querySelector('.chart-vendor-market'),
    { type:'doughnut',
      labels: marketLabels,
      data: marketLabels.map(m => byMarket[m]),
      bg: marketLabels.map(m => MARKET_COLORS[m] || '#94a3b8'),
      money: true });



  // Tabla
  const tbl = view.querySelector('.vendor-table');
  const sortedRows = applySort(rows, state.vendorSort[v]);
  const tbody = tbl.querySelector('tbody');
  tbody.innerHTML = '';
  sortedRows.forEach(r => {
    const cls = stageClass(r.etapa);
    const av  = safeNum(r.avance);
    const fillClass = av >= 1 ? 'progress-fill full' : 'progress-fill';
    const tr = document.createElement('tr');
    tr.dataset.vendor = v;
    tr.dataset.row    = r._row || '';
    tr.innerHTML =
      '<td><strong>'+escapeHtml(r.cliente)+'</strong></td>'+
      '<td>'+marketTag(r.mercado)+'</td>'+
      '<td>'+escapeHtml(r.objetivo)+'</td>'+
      '<td><span class="tag '+cls+'">'+escapeHtml(r.etapa)+'</span></td>'+
      '<td>'+fmtUSD(r.estimacion)+'</td>'+
      '<td><div class="progress-cell"><div class="progress-bar"><div class="'+fillClass+'" style="width:'+(av*100).toFixed(0)+'%"></div></div><span>'+fmtPct(av)+'</span></div></td>'+
      '<td>'+fmtDate(r.fecha)+'</td>'+
      '<td>'+escapeHtml(r.siguientes)+'</td>'+
      '<td class="col-actions"><div class="row-actions"><button class="btn-icon advance-row-btn" title="Avanzar etapa">→</button><button class="btn-icon edit-row-btn" title="Editar">✏</button></div></td>';
    tbody.appendChild(tr);
  });
  applySortIndicators(tbl, state.vendorSort[v]);
  view.querySelector('.vendor-table-count').textContent = rows.length + ' oportunidades';
}

/* ===== AGREGAR ===== */
async function handleAddOpportunity(e, vendor, form) {
  e.preventDefault();
  const fd = new FormData(form);

  // Validar mercado
  if (!fd.get('mercado')) {
    showToast('Falta mercado', 'Selecciona el mercado correspondiente', 'warn');
    form.querySelector('select[name=mercado]').focus();
    return;
  }

  const submitBtn = form.querySelector('button[type=submit]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Guardando...';
  const stage = fd.get('etapa');
  let avance = fd.get('avance');
  if (avance === '' || avance === null) {
    const meta = (CFG.ETAPAS || []).find(x => x.label === stage);
    avance = meta ? meta.avance * 100 : 0;
  }
  const payload = {
    cliente: fd.get('cliente'), objetivo: fd.get('objetivo'),
    contacto: fd.get('contacto'), etapa: stage,
    estimacion: fd.get('estimacion') ? Number(fd.get('estimacion')) : '',
    avance: Number(avance) / 100,
    precio: fd.get('precio') ? Number(fd.get('precio')) : '',
    cantidad: '', avanceParcial: '', cumplimiento: '',
    fecha: fd.get('fecha') || '',
    siguientes: fd.get('siguientes'),
    comentarios: fd.get('comentarios'),
    mercado: fd.get('mercado'),
  };
  try {
    const res = await postRow(vendor, payload);
    if (res.status !== 'ok') throw new Error(res.message || 'Error');
    showToast('Oportunidad agregada', payload.cliente + ' · ' + payload.objetivo + ' (' + payload.mercado + ')', 'success');
    form.reset();
    const hint = form.querySelector('.mercado-hint'); if (hint) hint.textContent = '';
    await loadData(false);
  } catch (err) {
    console.error(err);
    showToast('No se pudo guardar', err.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Agregar oportunidad';
  }
}

/* ===== EDITAR (MODAL) ===== */
function findRow(vendor, rowNum) {
  return (state.data[vendor] || []).find(r => Number(r._row) === Number(rowNum));
}
function openEditModal(vendor, rowNum) {
  const r = findRow(vendor, rowNum);
  if (!r) { showToast('No se encontró la fila', 'Refresca y vuelve a intentar', 'error'); return; }
  state.editing = { vendor, row: rowNum, expectedClient: r.cliente || '' };

  // Llenar selects (solo la primera vez)
  const selStage = $('#editForm select[name=etapa]');
  if (selStage.options.length <= 1) {
    STAGES.forEach(s => { const o = document.createElement('option'); o.value = s; o.textContent = s; selStage.appendChild(o); });
  }
  const selMarket = $('#editForm select[name=mercado]');
  if (selMarket.options.length <= 1) {
    MARKET_LIST.forEach(m => { const o = document.createElement('option'); o.value = m; o.textContent = m; selMarket.appendChild(o); });
  }
  // FIX: poblar opciones de resultado ANTES de asignar valor
  const selRes = $('#editForm select[name=resultado]');
  if (selRes && selRes.options.length <= 1) {
    RESULTADOS_LIST.forEach(r => { const o = document.createElement('option'); o.value = r; o.textContent = r; selRes.appendChild(o); });
  }

  // Stepper
  const stepper = $('#editStageStepper');
  stepper.innerHTML = '';
  STAGES.forEach(s => {
    const step = document.createElement('button');
    step.type = 'button';
    step.className = 'stage-step';
    step.dataset.stage = s;
    step.textContent = s;
    stepper.appendChild(step);
  });
  $('#editModalSubtitle').textContent = VENDOR_INFO[vendor].name + ' · ' + (r.cliente || '') + ' · ' + (r.objetivo || '');
  $('#editModalInfo').textContent = 'Fila ' + rowNum + ' en hoja ' + vendor;

  const form = $('#editForm');
  form.cliente.value     = r.cliente   || '';
  form.objetivo.value    = r.objetivo  || '';
  form.contacto.value    = r.contacto  || '';
  form.etapa.value       = r.etapa     || '';
  form.mercado.value     = r.mercado   || '';
  if (form.resultado) form.resultado.value = r.resultado || '';
  toggleResultadoField(form, r.etapa);
  form.estimacion.value  = r.estimacion != null ? r.estimacion : '';
  form.avance.value      = r.avance != null ? Math.round(safeNum(r.avance) * 100) : '';
  form.precio.value      = r.precio != null ? r.precio : '';
  form.fecha.value       = formatDateForInput(r.fecha);
  form.siguientes.value  = r.siguientes  || '';
  form.comentarios.value = r.comentarios || '';

  updateStageStepper(r.etapa);
  $('#editModal').classList.add('show');
  setTimeout(() => form.cliente.focus(), 50);
}
function closeEditModal() {
  $('#editModal').classList.remove('show');
  state.editing = null;
}
function updateStageStepper(currentStage) {
  const idxNow = STAGES.indexOf(currentStage);
  $$('#editStageStepper .stage-step').forEach((step, idx) => {
    step.classList.remove('active', 'passed');
    if (idx === idxNow) step.classList.add('active');
    else if (idxNow > -1 && idx < idxNow) step.classList.add('passed');
  });
}
async function handleSaveEdit() {
  if (!state.editing) return;
  const { vendor, row, expectedClient } = state.editing;
  const form = $('#editForm');
  const fd = new FormData(form);
  if (!fd.get('mercado')) {
    showToast('Falta mercado', 'Selecciona el mercado correspondiente', 'warn');
    form.querySelector('select[name=mercado]').focus();
    return;
  }
  const stage = fd.get('etapa');
  let avance = fd.get('avance');
  if (avance === '' || avance === null) {
    const meta = (CFG.ETAPAS || []).find(x => x.label === stage);
    avance = meta ? meta.avance * 100 : 0;
  }
  log('handleSaveEdit: campo resultado en form =', fd.get('resultado'));
  const payload = {
    action: 'update', vendor, _row: row, _expectedClient: expectedClient,
    cliente: fd.get('cliente'), objetivo: fd.get('objetivo'),
    contacto: fd.get('contacto'), etapa: stage,
    estimacion: fd.get('estimacion') ? Number(fd.get('estimacion')) : '',
    avance: Number(avance) / 100,
    precio: fd.get('precio') ? Number(fd.get('precio')) : '',
    fecha: fd.get('fecha') || '',
    siguientes: fd.get('siguientes'),
    comentarios: fd.get('comentarios'),
    mercado: fd.get('mercado'),
  };
  const btn = $('#editModalSave');
  btn.disabled = true;
  btn.textContent = 'Guardando...';
  try {
    if (state.isDemo) {
      const target = findRow(vendor, row);
      if (target) Object.assign(target, payload);
      saveLocalData();
      showToast('Cambios guardados (local)', payload.cliente + ' · ' + payload.objetivo, 'success');
    } else {
      log('POST update', payload);
      const res = await fetch(CFG.API_URL, { method: 'POST', body: JSON.stringify(payload) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      log('Respuesta update:', j);
      if (j.status !== 'ok') throw new Error(j.message || 'Error');
      showToast('Cambios guardados', payload.cliente + ' · ' + payload.objetivo, 'success');
    }
    closeEditModal();
    await loadData(false);
  } catch (err) {
    console.error(err);
    showToast('No se pudo guardar', err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Guardar cambios';
  }
}

async function handleAdvanceStage(vendor, rowNum) {
  const r = findRow(vendor, rowNum);
  if (!r) return;
  const idx = STAGES.indexOf(r.etapa);
  if (idx < 0 || idx >= STAGES.length - 1) {
    showToast('Sin avance posible', 'La oportunidad ya está en la etapa final', 'warn');
    return;
  }
  const next = STAGES[idx + 1];
  const meta = (CFG.ETAPAS || []).find(x => x.label === next);
  const newAvance = meta ? meta.avance : Math.min(safeNum(r.avance) + 0.2, 1);
  const payload = { action: 'update', vendor, _row: rowNum, _expectedClient: r.cliente, etapa: next, avance: newAvance };
  try {
    if (state.isDemo) { r.etapa = next; r.avance = newAvance; saveLocalData(); }
    else {
      log('POST advance', payload);
      const res = await fetch(CFG.API_URL, { method: 'POST', body: JSON.stringify(payload) });
      const j = await res.json();
      if (j.status !== 'ok') throw new Error(j.message || 'Error');
    }
    showToast('Etapa avanzada', r.cliente + ' → ' + next, 'success');
    await loadData(false);
  } catch (err) {
    console.error(err);
    showToast('No se pudo avanzar', err.message, 'error');
  }
}

/* ===== CHARTS ===== */
const CHART_DEFAULTS = {
  responsive: true, maintainAspectRatio: false,
  plugins: {
    legend: { labels: { font: { family: 'Segoe UI', size: 12 }, color: '#4a5b73' } },
    tooltip: { backgroundColor: '#0f1d2e', padding: 10, titleFont: { weight: '600' }, bodyFont: { size: 12 }, cornerRadius: 8 }
  }
};
function destroy(name) { if (state.charts[name]) { state.charts[name].destroy(); state.charts[name] = null; } }
function drawBar(canvasId, labels, data, bg, opts = {}) {
  destroy(canvasId);
  const ctx = document.getElementById(canvasId).getContext('2d');
  state.charts[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: bg, borderRadius: 6, borderSkipped: false, maxBarThickness: 38 }] },
    options: {
      ...CHART_DEFAULTS,
      indexAxis: opts.horizontal ? 'y' : 'x',
      plugins: { ...CHART_DEFAULTS.plugins, legend: { display: false },
        tooltip: { ...CHART_DEFAULTS.plugins.tooltip,
          callbacks: { label: (ctx) => { const v = ctx.parsed[opts.horizontal ? 'x' : 'y']; return opts.money ? fmtUSD(v) : v + ' oport.'; } } } },
      scales: {
        x: { grid: { color: '#eef2f7' }, ticks: { color: '#8194ad' } },
        y: { grid: { display: false }, ticks: { color: '#4a5b73', font: { size: 11 } } }
      }
    }
  });
}
function drawDonut(canvasId, labels, data, bg) {
  destroy(canvasId);
  const ctx = document.getElementById(canvasId).getContext('2d');
  state.charts[canvasId] = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: bg, borderWidth: 2, borderColor: '#fff' }] },
    options: { ...CHART_DEFAULTS, cutout: '62%',
      plugins: { ...CHART_DEFAULTS.plugins,
        legend: { ...CHART_DEFAULTS.plugins.legend, position: 'bottom' },
        tooltip: { ...CHART_DEFAULTS.plugins.tooltip, callbacks: { label: (ctx) => ctx.label + ': ' + fmtUSD(ctx.parsed) } } } }
  });
}
function drawVendorChart(vendor, key, canvas, cfg) {
  const ref = state.vendorCharts[vendor];
  if (ref[key]) { ref[key].destroy(); ref[key] = null; }
  const ctx = canvas.getContext('2d');
  if (cfg.type === 'bar') {
    ref[key] = new Chart(ctx, {
      type: 'bar',
      data: { labels: cfg.labels, datasets: [{ data: cfg.data, backgroundColor: cfg.bg, borderRadius: 6, maxBarThickness: 32 }] },
      options: { ...CHART_DEFAULTS, indexAxis: cfg.horizontal ? 'y' : 'x',
        plugins: { ...CHART_DEFAULTS.plugins, legend: { display: false } },
        scales: { x: { grid: { color: '#eef2f7' }, ticks: { color: '#8194ad' } },
                  y: { grid: { display: false }, ticks: { color: '#4a5b73' } } } }
    });
  } else if (cfg.type === 'doughnut') {
    const tipFmt = cfg.money ? ((c) => c.label + ': ' + fmtUSD(c.parsed)) : null;
    ref[key] = new Chart(ctx, {
      type: 'doughnut',
      data: { labels: cfg.labels, datasets: [{ data: cfg.data, backgroundColor: cfg.bg, borderWidth: 2, borderColor:'#fff' }] },
      options: { ...CHART_DEFAULTS, cutout:'62%',
        plugins: { ...CHART_DEFAULTS.plugins,
          legend: { ...CHART_DEFAULTS.plugins.legend, position:'bottom' },
          tooltip: { ...CHART_DEFAULTS.plugins.tooltip, callbacks: tipFmt ? { label: tipFmt } : {} } } }
    });
  }
}

/* ===== EVENTOS ===== */
function activateTab(viewKey) {
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === viewKey));
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + viewKey));
}
function setupEvents() {
  $('#tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    activateTab(tab.dataset.view);
  });
  document.body.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (chip && chip.dataset.filter) {
      chip.parentElement.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      if (chip.dataset.filter === 'vendor') state.filterVendor = chip.dataset.value;
      if (chip.dataset.filter === 'stage')  state.filterStage  = chip.dataset.value;
      if (chip.dataset.filter === 'market') state.filterMarket = chip.dataset.value;
      renderExecutiveView();
      return;
    }
    const advanceBtn = e.target.closest('.advance-row-btn');
    if (advanceBtn) {
      e.stopPropagation();
      const tr = advanceBtn.closest('tr');
      handleAdvanceStage(tr.dataset.vendor, Number(tr.dataset.row));
      return;
    }
    const editBtn = e.target.closest('.edit-row-btn');
    if (editBtn) {
      e.stopPropagation();
      const tr = editBtn.closest('tr');
      openEditModal(tr.dataset.vendor, Number(tr.dataset.row));
      return;
    }
    const tr = e.target.closest('.data-table.editable tbody tr');
    if (tr && tr.dataset.row) {
      openEditModal(tr.dataset.vendor, Number(tr.dataset.row));
      return;
    }
    const th = e.target.closest('th.sortable');
    if (th) {
      const tbl = th.closest('table');
      if (tbl) handleSortHeader(tbl, th.dataset.sort);
    }
  });
  $('#clientSearch').addEventListener('input', (e) => {
    state.filterClient = e.target.value;
    renderExecutiveView();
  });
  $('#refreshBtn').addEventListener('click', () => loadData(true));
  $('#editModalClose').addEventListener('click', closeEditModal);
  $('#editModalCancel').addEventListener('click', closeEditModal);
  $('#editModal').addEventListener('click', (e) => { if (e.target.id === 'editModal') closeEditModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('#editModal').classList.contains('show')) closeEditModal();
  });
  $('#editModalSave').addEventListener('click', handleSaveEdit);
  $('#editStageStepper').addEventListener('click', (e) => {
    const step = e.target.closest('.stage-step');
    if (!step) return;
    const stage = step.dataset.stage;
    const sel = $('#editForm select[name=etapa]');
    sel.value = stage;
    sel.dispatchEvent(new Event('change'));
  });
  $('#editForm select[name=etapa]').addEventListener('change', (e) => {
    const stage = e.target.value;
    const meta = (CFG.ETAPAS || []).find(x => x.label === stage);
    if (meta) $('#editForm input[name=avance]').value = Math.round(meta.avance * 100);
    updateStageStepper(stage);
    toggleResultadoField($('#editForm'), stage);
  });
  // En el modal, autocompletar mercado al cambiar cliente
  $('#editForm input[name=cliente]').addEventListener('blur', (e) => {
    const cli = e.target.value.trim();
    if (!cli) return;
    const m = lookupMarket(cli);
    const sel = $('#editForm select[name=mercado]');
    if (m && !sel.value) sel.value = m;
  });
}

/* ===== INIT ===== */
document.addEventListener('DOMContentLoaded', () => {
  log('Init dashboard. Config:', CFG);
  setupEvents();
  const initial = ['executive','RC','MC','FF'].includes(CFG.defaultVendor) ? CFG.defaultVendor : 'executive';
  activateTab(initial);
  loadData(true);
  const sec = Number(CFG.refreshInterval) || 0;
  if (sec > 0) {
    log('Auto-refresh cada', sec, 's');
    setInterval(() => loadData(false), sec * 1000);
  }
});
