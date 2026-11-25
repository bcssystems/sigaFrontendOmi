const Maker = (() => {
  const configKeys = ['COSTO_KWH', 'CONSUMO_KW', 'MERMA_MONOCOLOR', 'MERMA_MULTICOLOR', 'PURGA_POR_CAMBIO', 'MARGEN_PUBLICO', 'MARGEN_MAYOREO', 'MARGEN_DISTRIBUIDOR'];
  const state = {
    filaments: [], materials: [], settings: {}, quotes: [], users: [], projects: [], tasks: [], notifications: [],
    quotesPage: 0, quoteProjectId: null, boundTabs: false, boundNotifications: false
  };

  const can = permission => Utils.hasPermiso(permission);
  const canQuoteCreate = () => can('MAKER_COTIZACION_CREAR');
  const canQuoteEdit = () => can('MAKER_COTIZACION_EDITAR');
  const canQuoteDelete = () => can('MAKER_COTIZACION_ELIMINAR');
  const canCatalogCreate = () => can('MAKER_CATALOGO_CREAR');
  const canCatalogEdit = () => can('MAKER_CATALOGO_EDITAR');
  const canCatalogDelete = () => can('MAKER_CATALOGO_ELIMINAR');
  const canConfigEdit = () => can('MAKER_CONFIGURACION_EDITAR');
  const canStockMove = () => can('MAKER_STOCK_MOVIMIENTO');
  const money = value => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(value || 0));
  const num = value => Number(value || 0).toLocaleString('es-MX', { maximumFractionDigits: 3 });
  const esc = value => Utils.esc(value == null ? '' : String(value));
  const setting = key => Number(state.settings[String(key).toUpperCase()] ?? 0);
  const configApiKey = key => 'maker.' + String(key).toLowerCase();
  const today = () => new Date().toISOString().slice(0, 10);

  async function init() {
    bindTabs();
    try {
      await Promise.all([loadCatalog(), loadSettings()]);
      renderCalculator();
      renderQuotes();
      renderFilaments();
      renderMaterials();
      renderSettings();
      renderNotifications();
      bindCalculator();
      await loadWorkspace();
      await loadNotifications();
    } catch (error) {
      Utils.showToast('No se pudo cargar Maker: ' + error.message, 'error');
      renderCalculator();
      bindCalculator();
    }
  }

  async function loadCatalog() {
    const [filaments, materials] = await Promise.all([
      API.get('/maker/filamentos'), API.get('/maker/materiales')
    ]);
    state.filaments = filaments || [];
    state.materials = materials || [];
    if (canCatalogEdit()) {
      [state.filaments, state.materials] = await Promise.all([
        API.get('/maker/filamentos?todos=true'), API.get('/maker/materiales?todos=true')
      ]);
    }
  }

  async function loadSettings() {
    const configs = await API.get('/maker/configuracion/publica');
    state.settings = {};
    (configs || []).forEach(config => {
      const key = String(config.clave || '').replace(/^maker\./i, '').toUpperCase();
      state.settings[key] = Number(config.valor || 0);
    });
  }

  function bindTabs() {
    if (state.boundTabs) return;
    state.boundTabs = true;
    document.querySelectorAll('[data-maker-tab]').forEach(tab => tab.addEventListener('click', () => {
      document.querySelectorAll('[data-maker-tab]').forEach(item => item.classList.remove('active'));
      document.querySelectorAll('.maker-tab-panel').forEach(panel => panel.classList.add('d-none'));
      tab.classList.add('active');
      document.getElementById('maker-' + tab.dataset.makerTab)?.classList.remove('d-none');
      if (tab.dataset.makerTab === 'quotes') loadQuotes();
      if (tab.dataset.makerTab === 'projects') loadProjects();
      if (tab.dataset.makerTab === 'tasks') loadTasks();
      if (tab.dataset.makerTab === 'notifications') loadNotifications();
    }));
  }

  function renderCalculator() {
    const panel = document.getElementById('maker-calculator');
    if (!panel) return;
    panel.innerHTML = `<div class="maker-grid">
      <div class="panel-card maker-form-card">
        <div class="maker-section-heading"><div><span class="maker-step">01</span><h5>Datos de la cama</h5><small>Captura el estimado de tu slicer</small></div><i class="fas fa-print"></i></div>
        <div class="row g-3">
          <div class="col-12"><label class="form-label">Descripción</label><input id="mkDescripcion" class="form-control" placeholder="Ej. Llavero personalizado"></div>
          <div class="col-md-4"><label class="form-label">Tipo de impresión</label><select id="mkModo" class="form-select"><option value="MONOCOLOR">Monocolor</option><option value="MULTICOLOR">Multicolor</option></select></div>
          <div class="col-md-4"><label class="form-label">Gramos netos <span class="text-danger">*</span></label><input id="mkGramos" type="number" min="0.001" step="0.001" class="form-control"></div>
          <div class="col-md-4"><label class="form-label">Horas de impresión <span class="text-danger">*</span></label><input id="mkHoras" type="number" min="0.01" step="0.01" class="form-control"></div>
          <div class="col-md-4"><label class="form-label">Piezas por cama <span class="text-danger">*</span></label><input id="mkPiezas" type="number" min="1" step="1" class="form-control" value="1"></div>
          <div class="col-md-4"><label class="form-label">Precio a visualizar</label><select id="mkPriceType" class="form-select"><option value="PUBLICO">Público · ${(setting('MARGEN_PUBLICO') * 100).toFixed(0)}%</option><option value="MAYOREO">Mayoreo · ${(setting('MARGEN_MAYOREO') * 100).toFixed(0)}%</option><option value="DISTRIBUIDOR">Distribuidor · ${(setting('MARGEN_DISTRIBUIDOR') * 100).toFixed(0)}%</option></select></div>
          <div class="col-12" id="mkColorFields"><label class="form-label">Cambios de color</label><input id="mkCambios" type="number" min="0" step="1" class="form-control" value="0"><div class="form-text">Se aplica la purga configurable por cambio en modo multicolor.</div></div>
        </div>
        <div class="maker-section-heading mt-4"><div><span class="maker-step">02</span><h5>Filamentos</h5><small>Distribuye los gramos de la cama por color</small></div><button class="btn btn-sm btn-outline-primary" id="mkAddFilament"><i class="fas fa-plus me-1"></i>Agregar color</button></div>
        <div id="mkFilamentRows"></div>
        <div class="maker-section-heading mt-4"><div><span class="maker-step">03</span><h5>Productos extra</h5><small>Accesorios manuales por cama</small></div><button class="btn btn-sm btn-outline-primary" id="mkAddExtra"><i class="fas fa-plus me-1"></i>Agregar extra</button></div>
        <div id="mkExtraRows" class="maker-extra-list"></div>
        <div class="maker-form-actions"><button class="btn btn-primary px-4" id="mkCalculate"><i class="fas fa-wand-magic-sparkles me-2"></i>Calcular y guardar</button><button class="btn btn-light" id="mkClear">Limpiar</button></div>
      </div>
      <div class="maker-result-card" id="mkResult"><div class="maker-result-empty"><i class="fas fa-chart-line"></i><h5>Tu resumen aparecerá aquí</h5><p>Completa los datos para obtener el costo por pieza y el precio de venta.</p></div></div>
    </div>`;
    if (!canQuoteCreate()) {
      const actions = panel.querySelector('.maker-form-actions');
      actions?.querySelector('#mkCalculate')?.remove();
      actions?.insertAdjacentHTML('beforeend', '<small class="text-muted align-self-center">No tienes permiso para guardar cotizaciones.</small>');
    }
    addFilamentRow();
    addExtraRow(false);
    document.getElementById('mkModo')?.addEventListener('change', event => {
      document.getElementById('mkColorFields').style.display = event.target.value === 'MULTICOLOR' ? '' : 'none';
    });
    document.getElementById('mkModo')?.dispatchEvent(new Event('change'));
  }

  function filamentOptions(selected = '') {
    return '<option value="">Selecciona un filamento</option>' + state.filaments
      .filter(f => f.activo !== false)
      .map(f => `<option value="${f.id}" ${String(f.id) === String(selected) ? 'selected' : ''}>${esc(f.nombre)} · ${esc(f.color || 'Sin color')} · ${money(f.precioKilo)}/kg · ${num(f.stockKg)} kg</option>`).join('');
  }

  function addFilamentRow(container = document.getElementById('mkFilamentRows'), line = null) {
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'maker-line-row maker-filament-row';
    row.innerHTML = `<div class="maker-line-index">${container.children.length + 1}</div><select class="form-select mk-filament">${filamentOptions(line?.filamentoId)}</select><input class="form-control mk-filament-grams" type="number" min="0.001" step="0.001" placeholder="Gramos" value="${line?.gramos ?? ''}"><button class="btn btn-icon maker-remove-line" type="button" title="Quitar"><i class="fas fa-xmark"></i></button>`;
    row.querySelector('.maker-remove-line').addEventListener('click', () => {
      if (container.children.length <= 1) return Utils.showToast('Debe existir al menos un filamento', 'warning');
      row.remove();
      [...container.children].forEach((item, index) => { const label = item.querySelector('.maker-line-index'); if (label) label.textContent = index + 1; });
    });
    container.appendChild(row);
  }

  function addExtraRow(initial = true, container = document.getElementById('mkExtraRows'), extra = null) {
    if (!container || (!initial && container.children.length)) return;
    const row = document.createElement('div');
    row.className = 'maker-line-row maker-extra-row';
    row.innerHTML = `<input class="form-control mk-extra-name" placeholder="Ej. Argolla" value="${esc(extra?.nombre || '')}"><input class="form-control mk-extra-qty" type="number" min="0.01" step="0.01" value="${extra?.cantidad ?? 1}"><input class="form-control mk-extra-price" type="number" min="0" step="0.01" placeholder="Precio unitario" value="${extra?.precioUnitario ?? ''}"><span class="maker-extra-total">$0.00</span><button class="btn btn-icon maker-remove-line" type="button" title="Quitar"><i class="fas fa-xmark"></i></button>`;
    const update = () => { row.querySelector('.maker-extra-total').textContent = money(Number(row.querySelector('.mk-extra-qty').value) * Number(row.querySelector('.mk-extra-price').value)); };
    row.querySelectorAll('input').forEach(input => input.addEventListener('input', update));
    row.querySelector('.maker-remove-line').addEventListener('click', () => row.remove());
    container.appendChild(row);
    update();
  }

  function bindCalculator() {
    document.getElementById('mkAddFilament')?.addEventListener('click', () => addFilamentRow());
    document.getElementById('mkAddExtra')?.addEventListener('click', () => addExtraRow(true));
    document.getElementById('mkClear')?.addEventListener('click', () => { renderCalculator(); bindCalculator(); });
    document.getElementById('mkCalculate')?.addEventListener('click', saveQuoteFromCalculator);
  }

  function collectQuote() {
    const filamentos = [...document.querySelectorAll('#mkFilamentRows .maker-filament-row')]
      .map(row => ({ filamentoId: Number(row.querySelector('.mk-filament').value), gramos: Number(row.querySelector('.mk-filament-grams').value) }))
      .filter(item => item.filamentoId && item.gramos > 0);
    const extras = [...document.querySelectorAll('#mkExtraRows .maker-extra-row')]
      .map(row => ({ nombre: row.querySelector('.mk-extra-name').value.trim(), cantidad: Number(row.querySelector('.mk-extra-qty').value), precioUnitario: Number(row.querySelector('.mk-extra-price').value) }))
      .filter(item => item.nombre && item.cantidad > 0);
    return {
      descripcion: document.getElementById('mkDescripcion')?.value.trim(),
      modo: document.getElementById('mkModo')?.value,
      gramosNetos: Number(document.getElementById('mkGramos')?.value),
      horasImpresion: Number(document.getElementById('mkHoras')?.value),
      piezasPorCama: Number(document.getElementById('mkPiezas')?.value),
      cambiosColor: Number(document.getElementById('mkCambios')?.value || 0),
      tipoPrecio: document.getElementById('mkPriceType')?.value || 'PUBLICO',
      proyectoId: state.quoteProjectId,
      filamentos,
      extras
    };
  }

  async function saveQuoteFromCalculator() {
    const data = collectQuote();
    const total = data.filamentos.reduce((sum, item) => sum + item.gramos, 0);
    if (!data.gramosNetos || !data.horasImpresion || !data.piezasPorCama || !data.filamentos.length) {
      return Utils.showToast('Completa gramos, horas, piezas y al menos un filamento', 'warning');
    }
    if (Math.abs(total - data.gramosNetos) > 0.01) {
      return Utils.showToast(`Los gramos (${num(total)}) deben coincidir con los gramos netos (${num(data.gramosNetos)})`, 'warning');
    }
    if (data.modo === 'MULTICOLOR' && new Set(data.filamentos.map(item => item.filamentoId)).size !== data.filamentos.length) {
      return Utils.showToast('En modo multicolor no puedes repetir el mismo filamento', 'warning');
    }
    const button = document.getElementById('mkCalculate');
    button.disabled = true;
    try {
      const quote = await API.post('/maker/cotizaciones', data);
      renderResult(quote);
      state.quoteProjectId = null;
      Utils.showToast('Cotización guardada correctamente', 'success');
    } catch (error) {
      Utils.showToast('No se pudo guardar: ' + error.message, 'error');
    } finally { button.disabled = false; }
  }

  function renderResult(quote) {
    const panel = document.getElementById('mkResult');
    if (!panel) return;
    const finalPrice = quote.precioPiezaFinal ?? quote.precioPieza;
    panel.innerHTML = `<div class="maker-result-top"><div><span class="maker-result-label">COTIZACIÓN ${esc(quote.folio)}</span><h4>${esc(quote.descripcion || 'Impresión 3D')}</h4></div><span class="maker-price-pill">${esc(quote.tipoPrecio)}</span></div><div class="maker-sale-card maker-commercial-card"><span>Precio final comercial</span><strong>${money(finalPrice)} <small>/ pieza</small></strong><div>${quote.piezasPorCama} pieza(s) por cama · ${money(quote.precioCamaFinal ?? quote.precioCama)} por cama</div><div class="maker-final-price-group mt-3"><input id="mkFinalPrice" class="form-control" type="number" min="0" step="0.01" value="${finalPrice}"><button class="btn btn-outline-primary" id="mkSaveFinalPrice" data-quote-id="${quote.id}"><i class="fas fa-check"></i></button></div><small class="maker-final-price-help">Ajusta el precio final sin modificar el costo calculado.</small></div>`;
    if (!canQuoteEdit()) panel.querySelector('.maker-final-price-group')?.remove();
  }

  async function loadQuotes() {
    try {
      const data = await API.get('/maker/cotizaciones?page=' + state.quotesPage + '&size=20');
      state.quotes = data?.content || [];
      renderQuotes(data);
    } catch (error) { document.getElementById('maker-quotes').innerHTML = `<div class="empty-state"><p>${esc(error.message)}</p></div>`; }
  }

  function renderQuotes(data = { content: [] }) {
    const list = data.content || [];
    const box = document.getElementById('maker-quotes');
    if (!box) return;
    box.innerHTML = `<div class="maker-toolbar"><div><h5>Historial de cotizaciones</h5><small>Consulta y administra tus cálculos guardados</small></div><button class="btn btn-primary" data-mk-new="quote"><i class="fas fa-plus me-1"></i>Nueva cotización</button></div><div class="panel-card overflow-hidden"><div class="table-responsive"><table class="table table-custom maker-table"><thead><tr><th>Folio</th><th>Descripción</th><th>Fecha</th><th>Piezas</th><th>Tipo</th><th>Precio/pieza</th><th></th></tr></thead><tbody>${list.length ? list.map(quote => `<tr><td><strong>${esc(quote.folio)}</strong></td><td>${esc(quote.descripcion || 'Sin descripción')}</td><td>${Utils.formatDateTime(quote.fecha)}</td><td>${quote.piezasPorCama}</td><td><span class="maker-type-badge">${esc(quote.tipoPrecio)}</span></td><td class="maker-money">${money(quote.precioPiezaFinal ?? quote.precioPieza)}</td><td class="maker-table-actions"><button class="btn btn-sm btn-outline-primary" data-mk-quote-view="${quote.id}" title="Ver"><i class="fas fa-eye"></i></button></td></tr>`).join('') : '<tr><td colspan="7"><div class="empty-state"><i class="fas fa-receipt"></i><p>Aún no hay cotizaciones guardadas</p></div></td></tr>'}</tbody></table></div>${pagination(data, 'quotes')}</div>`;
    if (!canQuoteCreate()) box.querySelector('[data-mk-new="quote"]')?.remove();
    box.querySelector('[data-mk-new="quote"]')?.addEventListener('click', () => document.querySelector('[data-maker-tab="calculator"]')?.click());
    box.querySelectorAll('[data-mk-quote-view]').forEach(button => button.addEventListener('click', () => showQuoteDetail(Number(button.dataset.mkQuoteView))));
    bindPagination(box, 'quotes');
  }

  function pagination(data) {
    if (!data || data.totalPages <= 1) return '';
    return `<div class="maker-pagination"><small>Página ${data.number + 1} de ${data.totalPages} · ${data.totalElements} registros</small><div><button class="btn btn-sm btn-light" data-mk-page="prev" ${data.first ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button><button class="btn btn-sm btn-light" data-mk-page="next" ${data.last ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button></div></div>`;
  }

  function bindPagination(box, type) {
    box.querySelectorAll('[data-mk-page]').forEach(button => button.addEventListener('click', () => {
      if (button.disabled) return;
      state.quotesPage += button.dataset.mkPage === 'next' ? 1 : -1;
      if (type === 'quotes') loadQuotes();
    }));
  }

  async function showQuoteDetail(id) {
    try {
      const quote = await API.get('/maker/cotizaciones/' + id);
      const body = document.getElementById('makerDetailBody');
      body.innerHTML = `<div class="maker-quote-detail-hero"><div><span class="maker-result-label">COTIZACIÓN ${esc(quote.folio)}</span><h3>${esc(quote.descripcion || 'Impresión 3D')}</h3><small>${Utils.formatDateTime(quote.fecha)}</small></div><div class="maker-quote-final"><small>Precio final</small><strong>${money(quote.precioPiezaFinal ?? quote.precioPieza)}</strong><span>por pieza</span></div></div><div class="maker-detail-grid"><div><small>Modo</small><strong>${esc(quote.modo)}</strong></div><div><small>Tipo</small><strong>${esc(quote.tipoPrecio)}</strong></div><div><small>Piezas por cama</small><strong>${quote.piezasPorCama}</strong></div><div><small>Material total</small><strong>${num(quote.gramosTotales)} g</strong></div></div><div class="maker-detail-actions"><button class="btn btn-primary" data-mk-edit-quote="${quote.id}"><i class="fas fa-pen me-1"></i>Editar</button><button class="btn btn-outline-primary" data-mk-pdf-quote="${quote.id}"><i class="fas fa-file-pdf me-1"></i>Descargar PDF</button><button class="btn btn-outline-danger" data-mk-delete-quote="${quote.id}"><i class="fas fa-trash me-1"></i>Eliminar</button></div><hr><h6>Filamentos utilizados</h6><ul class="maker-detail-list">${(quote.filamentos || []).map(line => `<li><span>${esc(line.nombre)} · ${esc(line.color || 'Sin color')}</span><b>${num(line.gramos)} g</b></li>`).join('')}</ul>`;
       if (!canQuoteEdit()) body.querySelector('[data-mk-edit-quote]')?.remove();
       if (!canQuoteDelete()) body.querySelector('[data-mk-delete-quote]')?.remove();
       const modal = new bootstrap.Modal(document.getElementById('makerDetailModal')); modal.show();
      body.querySelector('[data-mk-edit-quote]')?.addEventListener('click', () => { modal.hide(); editQuoteModal(quote); });
      body.querySelector('[data-mk-pdf-quote]')?.addEventListener('click', () => downloadPdf(quote.id));
      body.querySelector('[data-mk-delete-quote]')?.addEventListener('click', async () => { if (!await Utils.confirmAction('¿Eliminar esta cotización?', 'Confirmar', 'Eliminar')) return; await API.del('/maker/cotizaciones/' + quote.id); modal.hide(); Utils.showToast('Cotización eliminada', 'success'); loadQuotes(); });
    } catch (error) { Utils.showToast(error.message, 'error'); }
  }

  async function downloadPdf(id) {
    try { const blob = await API.download('/maker/cotizaciones/' + id + '/pdf'); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'cotizacion-maker-' + id + '.pdf'; link.click(); URL.revokeObjectURL(link.href); }
    catch (error) { Utils.showToast(error.message, 'error'); }
  }

  function editQuoteModal(quote) {
    const body = document.getElementById('makerCatalogBody');
    document.getElementById('makerCatalogTitle').textContent = 'Editar cotización';
    body.innerHTML = `<div class="row g-3"><div class="col-12"><label class="form-label">Descripción</label><input id="mkEditDescription" class="form-control" value="${esc(quote.descripcion || '')}"></div><div class="col-md-6"><label class="form-label">Modo</label><select id="mkEditMode" class="form-select"><option value="MONOCOLOR" ${quote.modo === 'MONOCOLOR' ? 'selected' : ''}>Monocolor</option><option value="MULTICOLOR" ${quote.modo === 'MULTICOLOR' ? 'selected' : ''}>Multicolor</option></select></div><div class="col-md-6"><label class="form-label">Tipo de precio</label><select id="mkEditPrice" class="form-select"><option value="PUBLICO" ${quote.tipoPrecio === 'PUBLICO' ? 'selected' : ''}>Público</option><option value="MAYOREO" ${quote.tipoPrecio === 'MAYOREO' ? 'selected' : ''}>Mayoreo</option><option value="DISTRIBUIDOR" ${quote.tipoPrecio === 'DISTRIBUIDOR' ? 'selected' : ''}>Distribuidor</option></select></div><div class="col-md-4"><label class="form-label">Gramos netos</label><input id="mkEditGrams" class="form-control" type="number" min="0.001" step="0.001" value="${quote.gramosNetos}"></div><div class="col-md-4"><label class="form-label">Horas</label><input id="mkEditHours" class="form-control" type="number" min="0.01" step="0.01" value="${quote.horasImpresion}"></div><div class="col-md-4"><label class="form-label">Piezas por cama</label><input id="mkEditPieces" class="form-control" type="number" min="1" step="1" value="${quote.piezasPorCama}"></div><div class="col-12"><label class="form-label">Filamentos</label><div id="mkEditFilaments"></div><button type="button" class="btn btn-sm btn-outline-primary mt-2" id="mkAddEditFilament"><i class="fas fa-plus"></i> Agregar filamento</button></div><div class="col-md-6"><label class="form-label">Precio final por pieza</label><input id="mkEditFinal" class="form-control" type="number" min="0" step="0.01" value="${quote.precioPiezaFinal ?? quote.precioPieza}"></div><div class="col-md-6"><label class="form-label">Cambios de color</label><input id="mkEditChanges" class="form-control" type="number" min="0" step="1" value="0"></div></div>`;
    const rows = body.querySelector('#mkEditFilaments');
    (quote.filamentos || []).forEach(line => addEditFilamentRow(rows, line));
    body.querySelector('#mkAddEditFilament').addEventListener('click', () => addEditFilamentRow(rows));
    body.querySelector('#makerCatalogSave').onclick = async () => {
      const filamentos = [...rows.children].map(row => ({ filamentoId: Number(row.querySelector('select').value), gramos: Number(row.querySelector('input').value) })).filter(line => line.filamentoId && line.gramos > 0);
       const payload = { descripcion: body.querySelector('#mkEditDescription').value.trim(), modo: body.querySelector('#mkEditMode').value, gramosNetos: Number(body.querySelector('#mkEditGrams').value), horasImpresion: Number(body.querySelector('#mkEditHours').value), piezasPorCama: Number(body.querySelector('#mkEditPieces').value), cambiosColor: Number(body.querySelector('#mkEditChanges').value || 0), tipoPrecio: body.querySelector('#mkEditPrice').value, proyectoId: quote.proyectoId || null, filamentos, extras: (quote.extras || []).map(extra => ({ nombre: extra.nombre, cantidad: Number(extra.cantidad), precioUnitario: Number(extra.precioUnitario) })) };
       try { await API.put('/maker/cotizaciones/' + quote.id, payload); const saved = await API.patch('/maker/cotizaciones/' + quote.id + '/precio-final', { precioPiezaFinal: Number(body.querySelector('#mkEditFinal').value) }); hideCatalogModal(); Utils.showToast('Cotización actualizada', 'success'); renderResult(saved); loadQuotes(); }
      catch (error) { Utils.showToast(error.message, 'error'); }
    };
    showCatalogModal();
  }

  function addEditFilamentRow(container, line = null) {
    const row = document.createElement('div'); row.className = 'maker-line-row maker-filament-row'; row.innerHTML = `<select class="form-select">${filamentOptions(line?.filamentoId)}</select><input class="form-control" type="number" min="0.001" step="0.001" value="${line?.gramos ?? ''}"><button type="button" class="btn btn-icon maker-remove-line"><i class="fas fa-xmark"></i></button>`;
    row.querySelector('button').addEventListener('click', () => { if (container.children.length > 1) row.remove(); }); container.appendChild(row);
  }

  function renderFilaments() {
    const box = document.getElementById('maker-filaments'); if (!box) return;
    const actions = canCatalogCreate() || canCatalogEdit() || canCatalogDelete() || canStockMove() || can('MAKER_STOCK_VER');
    box.innerHTML = `<div class="maker-toolbar"><div><h5>Catálogo de filamentos</h5><small>Precios, colores y stock propio en kilogramos</small></div>${canCatalogCreate() ? '<button class="btn btn-primary" data-mk-new="filament"><i class="fas fa-plus me-1"></i>Nuevo filamento</button>' : ''}</div><div class="panel-card overflow-hidden"><div class="table-responsive"><table class="table table-custom maker-table"><thead><tr><th>Filamento</th><th>Material</th><th>Marca</th><th>Color</th><th>Precio/kg</th><th>Stock</th><th>Estado</th>${actions ? '<th></th>' : ''}</tr></thead><tbody>${state.filaments.length ? state.filaments.map(f => `<tr><td><strong>${esc(f.nombre)}</strong></td><td>${esc(f.material)}</td><td>${esc(f.marca || '-')}</td><td>${esc(f.color || '-')}</td><td class="maker-money">${money(f.precioKilo)}</td><td class="maker-stock">${num(f.stockKg)} kg</td><td>${status(f.activo)}</td>${actions ? `<td class="maker-table-actions">${canStockMove() ? `<button class="btn btn-sm btn-outline-success me-1" data-mk-stock="${f.id}" title="Movimiento de stock"><i class="fas fa-scale-balanced"></i></button>` : ''}${canCatalogEdit() ? `<button class="btn btn-sm btn-outline-primary" data-mk-edit-filament="${f.id}" title="Editar"><i class="fas fa-pen"></i></button>` : ''}</td>` : ''}</tr>`).join('') : `<tr><td colspan="${actions ? 8 : 7}"><div class="empty-state"><i class="fas fa-box-open"></i><p>No hay filamentos</p></div></td></tr>`}</tbody></table></div></div>`;
      appendCatalogDeleteButton(box, state.filaments, 'mkDeleteFilament', 'filamentos');
      appendCatalogStockButton(box, state.filaments);
     box.querySelector('[data-mk-new="filament"]')?.addEventListener('click', () => filamentModal());
    box.querySelectorAll('[data-mk-edit-filament]').forEach(button => button.addEventListener('click', () => filamentModal(Number(button.dataset.mkEditFilament))));
    box.querySelectorAll('[data-mk-stock]').forEach(button => button.addEventListener('click', () => stockModal(Number(button.dataset.mkStock))));
  }

  function renderMaterials() {
    const box = document.getElementById('maker-materials'); if (!box) return;
    box.innerHTML = `<div class="maker-toolbar"><div><h5>Catálogo de materiales</h5><small>Materiales base para tus filamentos</small></div>${canCatalogCreate() ? '<button class="btn btn-primary" data-mk-new="material"><i class="fas fa-plus me-1"></i>Nuevo material</button>' : ''}</div><div class="panel-card overflow-hidden"><div class="table-responsive"><table class="table table-custom maker-table"><thead><tr><th>Nombre</th><th>Estado</th><th>Filamentos</th><th></th></tr></thead><tbody>${state.materials.length ? state.materials.map(material => `<tr><td><strong>${esc(material.nombre)}</strong></td><td>${status(material.activo)}</td><td>${state.filaments.filter(f => f.materialId === material.id).length}</td><td class="maker-table-actions">${canCatalogEdit() ? `<button class="btn btn-sm btn-outline-primary" data-mk-edit-material="${material.id}"><i class="fas fa-pen"></i></button>` : ''}</td></tr>`).join('') : '<tr><td colspan="4"><div class="empty-state"><p>No hay materiales</p></div></td></tr>'}</tbody></table></div></div>`;
     appendCatalogDeleteButton(box, state.materials, 'mkDeleteMaterial', 'materiales');
     box.querySelector('[data-mk-new="material"]')?.addEventListener('click', () => materialModal());
    box.querySelectorAll('[data-mk-edit-material]').forEach(button => button.addEventListener('click', () => materialModal(Number(button.dataset.mkEditMaterial))));
  }

  const status = active => `<span class="badge-status ${active ? 'badge-active' : 'badge-inactive'}">${active ? 'Activo' : 'Inactivo'}</span>`;

  async function refreshCatalogs() { await loadCatalog(); renderFilaments(); renderMaterials(); renderCalculator(); bindCalculator(); }

  function appendCatalogDeleteButton(box, items, attribute, path) {
    if (!canCatalogDelete()) return;
    box.querySelectorAll('tbody .maker-table-actions').forEach((cell, index) => {
      const item = items[index];
      if (!item) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-sm btn-outline-danger ms-1';
      button.title = 'Desactivar';
      button.innerHTML = '<i class="fas fa-trash"></i>';
      button.dataset[attribute] = item.id;
      button.addEventListener('click', () => deleteWorkspace(path, item.id, refreshCatalogs));
      cell.appendChild(button);
    });
  }

  function appendCatalogStockButton(box, items) {
    if (!can('MAKER_STOCK_VER')) return;
    box.querySelectorAll('tbody .maker-table-actions').forEach((cell, index) => {
      if (cell.querySelector('[data-mk-stock]')) return;
      const item = items[index];
      if (!item) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-sm btn-outline-secondary me-1';
      button.title = 'Ver movimientos de stock';
      button.innerHTML = '<i class="fas fa-clock-rotate-left"></i>';
      button.dataset.mkStock = item.id;
      cell.prepend(button);
    });
  }

  function materialModal(id) {
    const item = id ? state.materials.find(material => material.id === id) : null;
    document.getElementById('makerCatalogTitle').textContent = item ? 'Editar material' : 'Nuevo material';
    document.getElementById('makerCatalogBody').innerHTML = `<label class="form-label">Nombre <span class="text-danger">*</span></label><input id="mkModalName" class="form-control" maxlength="100" value="${esc(item?.nombre || '')}"><div class="form-check mt-3"><input id="mkModalActive" class="form-check-input" type="checkbox" ${item?.activo !== false ? 'checked' : ''}><label class="form-check-label">Activo</label></div>`;
    document.getElementById('makerCatalogSave').onclick = async () => {
      const nombre = document.getElementById('mkModalName').value.trim(); if (!nombre) return Utils.showToast('El nombre es obligatorio', 'warning');
      try { await (id ? API.put('/maker/materiales/' + id, { nombre, activo: document.getElementById('mkModalActive').checked }) : API.post('/maker/materiales', { nombre, activo: true })); hideCatalogModal(); await refreshCatalogs(); Utils.showToast('Material guardado', 'success'); }
      catch (error) { Utils.showToast(error.message, 'error'); }
    };
    showCatalogModal();
  }

  function filamentModal(id) {
    const item = id ? state.filaments.find(filament => filament.id === id) : null;
    document.getElementById('makerCatalogTitle').textContent = item ? 'Editar filamento' : 'Nuevo filamento';
    document.getElementById('makerCatalogBody').innerHTML = `<div class="row g-3"><div class="col-12"><label class="form-label">Nombre *</label><input id="mkModalName" class="form-control" value="${esc(item?.nombre || '')}"></div><div class="col-md-6"><label class="form-label">Material *</label><select id="mkModalMaterial" class="form-select">${state.materials.filter(material => material.activo || material.id === item?.materialId).map(material => `<option value="${material.id}" ${material.id === item?.materialId ? 'selected' : ''}>${esc(material.nombre)}</option>`).join('')}</select></div><div class="col-md-6"><label class="form-label">Precio por kilo *</label><input id="mkModalPrice" type="number" min="0" step="0.01" class="form-control" value="${item?.precioKilo ?? ''}"></div><div class="col-md-6"><label class="form-label">Stock (kg)</label><input id="mkModalStock" type="number" min="0" step="0.001" class="form-control" value="${item?.stockKg ?? 0}"><div class="form-text">Las diferencias quedan registradas como movimiento.</div></div><div class="col-md-6"><label class="form-label">Marca</label><input id="mkModalBrand" class="form-control" value="${esc(item?.marca || '')}"></div><div class="col-md-6"><label class="form-label">Color</label><input id="mkModalColor" class="form-control" value="${esc(item?.color || '')}"></div><div class="col-12 form-check ms-2"><input id="mkModalActive" class="form-check-input" type="checkbox" ${item?.activo !== false ? 'checked' : ''}><label class="form-check-label">Activo</label></div></div>`;
    document.getElementById('makerCatalogSave').onclick = async () => {
       const payload = { nombre: document.getElementById('mkModalName').value.trim(), materialId: Number(document.getElementById('mkModalMaterial').value), precioKilo: Number(document.getElementById('mkModalPrice').value), stockKg: canStockMove() ? Number(document.getElementById('mkModalStock').value) : null, marca: document.getElementById('mkModalBrand').value.trim(), color: document.getElementById('mkModalColor').value.trim(), activo: document.getElementById('mkModalActive').checked };
      if (!payload.nombre || !payload.materialId || !Number.isFinite(payload.precioKilo)) return Utils.showToast('Completa los campos obligatorios', 'warning');
      try { await (id ? API.put('/maker/filamentos/' + id, payload) : API.post('/maker/filamentos', payload)); hideCatalogModal(); await refreshCatalogs(); Utils.showToast('Filamento guardado', 'success'); }
      catch (error) { Utils.showToast(error.message, 'error'); }
    };
     if (!canStockMove()) document.getElementById('mkModalStock')?.closest('.col-md-6')?.remove();
     showCatalogModal();
   }

   function stockModal(id) {
    const filament = state.filaments.find(item => item.id === id); if (!filament) return;
    document.getElementById('makerCatalogTitle').textContent = 'Movimiento de stock';
    document.getElementById('makerCatalogBody').innerHTML = `<p class="mb-3"><strong>${esc(filament.nombre)}</strong> · Stock actual: <strong>${num(filament.stockKg)} kg</strong></p><div class="row g-3"><div class="col-md-6"><label class="form-label">Tipo</label><select id="mkStockType" class="form-select"><option>ENTRADA</option><option>SALIDA</option><option>CONSUMO</option><option>AJUSTE</option></select></div><div class="col-md-6" id="mkStockAmountWrap"><label class="form-label">Cantidad (kg)</label><input id="mkStockAmount" type="number" min="0.001" step="0.001" class="form-control"></div><div class="col-md-6 d-none" id="mkStockTargetWrap"><label class="form-label">Stock objetivo (kg)</label><input id="mkStockTarget" type="number" min="0" step="0.001" class="form-control" value="${filament.stockKg}"></div><div class="col-12"><label class="form-label">Referencia</label><input id="mkStockReference" class="form-control" placeholder="Compra, merma, orden..."></div><div class="col-12"><label class="form-label">Observación</label><textarea id="mkStockObservation" class="form-control" rows="2"></textarea></div></div><div id="mkStockHistory" class="mt-3"></div>`;
    const type = document.getElementById('mkStockType');
    type.addEventListener('change', () => { const adjustment = type.value === 'AJUSTE'; document.getElementById('mkStockAmountWrap').classList.toggle('d-none', adjustment); document.getElementById('mkStockTargetWrap').classList.toggle('d-none', !adjustment); });
    document.getElementById('makerCatalogSave').onclick = async () => {
      const adjustment = type.value === 'AJUSTE';
      const payload = { filamentoId: id, tipo: type.value, cantidad: adjustment ? null : Number(document.getElementById('mkStockAmount').value), stockObjetivo: adjustment ? Number(document.getElementById('mkStockTarget').value) : null, referencia: document.getElementById('mkStockReference').value.trim(), observacion: document.getElementById('mkStockObservation').value.trim() };
      try { await API.post('/maker/stock/movimientos', payload); hideCatalogModal(); await refreshCatalogs(); Utils.showToast('Movimiento registrado', 'success'); }
      catch (error) { Utils.showToast(error.message, 'error'); }
    };
    showCatalogModal();
     API.get('/maker/filamentos/' + id + '/movimientos?page=0&size=10').then(data => { const history = document.getElementById('mkStockHistory'); if (history) history.innerHTML = `<small class="text-muted">Últimos movimientos</small><div class="small mt-2">${(data?.content || []).map(move => `<div class="d-flex justify-content-between border-bottom py-1"><span>${esc(move.tipo)} · ${Utils.formatDateTime(move.fechaMovimiento)}</span><strong>${num(move.stockNuevo)} kg</strong></div>`).join('') || 'Sin movimientos'}</div>`; }).catch(() => {});
     if (!canStockMove()) document.getElementById('makerCatalogSave').style.display = 'none';
   }

  function renderSettings() {
    const box = document.getElementById('maker-settings'); if (!box) return;
    box.innerHTML = `<div class="maker-toolbar"><div><h5>Configuración de costos</h5><small>Valores usados por la calculadora Maker</small></div></div><div class="maker-settings-grid">${configKeys.map(key => `<div class="panel-card maker-setting-card"><div class="maker-setting-info"><span>${settingName(key)}</span><small>${settingLabel(key)}</small></div><div class="input-group maker-setting-input"><input class="form-control mk-setting" data-key="${key}" type="number" min="0" step="0.01" value="${displaySetting(key)}" ${canConfigEdit() ? '' : 'disabled'}>${canConfigEdit() ? `<button class="btn btn-outline-primary mk-save-setting" data-key="${key}"><i class="fas fa-check"></i></button>` : ''}</div></div>`).join('')}</div>`;
    box.querySelectorAll('.mk-save-setting').forEach(button => button.addEventListener('click', async () => {
      const entered = Number(box.querySelector(`.mk-setting[data-key="${button.dataset.key}"]`).value); if (!Number.isFinite(entered) || entered < 0) return Utils.showToast('Captura un valor válido', 'warning');
      try { const value = isPercentSetting(button.dataset.key) ? entered / 100 : entered; await API.put('/maker/configuracion/' + configApiKey(button.dataset.key), { valor: value }); state.settings[button.dataset.key] = value; Utils.showToast('Configuración actualizada', 'success'); }
      catch (error) { Utils.showToast(error.message, 'error'); }
    }));
  }

  const isPercentSetting = key => String(key).startsWith('MERMA_') || String(key).startsWith('MARGEN_');
  const displaySetting = key => isPercentSetting(key) ? (setting(key) * 100).toFixed(2) : setting(key);
  const settingName = key => ({ COSTO_KWH: 'Costo por kWh', CONSUMO_KW: 'Consumo promedio Bambu Lab A1', MERMA_MONOCOLOR: 'Merma monocolor', MERMA_MULTICOLOR: 'Merma multicolor', PURGA_POR_CAMBIO: 'Purga por cambio de color', MARGEN_PUBLICO: 'Margen público', MARGEN_MAYOREO: 'Margen mayoreo', MARGEN_DISTRIBUIDOR: 'Margen distribuidor' }[key] || key);
  const settingLabel = key => ({ COSTO_KWH: 'Costo de electricidad MXN/kWh', CONSUMO_KW: 'Consumo promedio durante impresión PLA (95 W)', MERMA_MONOCOLOR: 'Porcentaje de merma monocolor', MERMA_MULTICOLOR: 'Porcentaje de merma multicolor', PURGA_POR_CAMBIO: 'Gramos de purga por cambio', MARGEN_PUBLICO: 'Margen para precio público', MARGEN_MAYOREO: 'Margen para precio mayoreo', MARGEN_DISTRIBUIDOR: 'Margen para precio distribuidor' }[key] || '');

  async function loadWorkspace() {
    const [users, projects, tasks, quotes] = await Promise.all([API.get('/maker/usuarios'), API.get('/maker/proyectos?page=0&size=200'), API.get('/maker/tareas?page=0&size=200'), API.get('/maker/cotizaciones?page=0&size=200')]);
    state.users = users || []; state.projects = projects?.content || []; state.tasks = tasks?.content || []; state.quotes = quotes?.content || [];
    renderProjects(); renderTasks();
  }
  async function loadProjects() { const data = await API.get('/maker/proyectos?page=0&size=200'); state.projects = data?.content || []; renderProjects(); }
  async function loadTasks() { const data = await API.get('/maker/tareas?page=0&size=200'); state.tasks = data?.content || []; renderTasks(); }

  const stateLabel = value => ({ SIN_COMENZAR: 'Sin comenzar', EN_PROGRESO: 'En progreso', HECHO: 'Hecho', COTIZACION: 'Cotización', MUESTREO: 'Muestreo', PRODUCCION: 'Producción', ENTREGA: 'Entrega' }[value] || value);
  const priorityLabel = value => ({ BAJA: 'Baja', MEDIA: 'Media', ALTA: 'Alta', URGENTE: 'Urgente' }[value] || value);
  const priorities = () => [['BAJA', 'Baja'], ['MEDIA', 'Media'], ['ALTA', 'Alta'], ['URGENTE', 'Urgente']];
  const avatarStack = users => (users || []).slice(0, 3).map(user => `<span class="maker-avatar" title="${esc(user.username)}">${esc((user.username || 'U').charAt(0).toUpperCase())}</span>`).join('');

  function renderProjects() {
    const box = document.getElementById('maker-projects'); if (!box) return;
    const statuses = ['COTIZACION', 'MUESTREO', 'PRODUCCION', 'ENTREGA'];
    box.innerHTML = `<div class="maker-toolbar"><div><h5>Proyectos de impresión</h5><small>Organiza tus trabajos por etapa</small></div>${can('MAKER_PROYECTO_CREAR') ? '<button class="btn btn-primary" data-mk-new="project"><i class="fas fa-plus me-1"></i>Nuevo proyecto</button>' : ''}</div><div class="maker-kanban maker-kanban-projects">${statuses.map(statusValue => `<div class="maker-column"><div class="maker-column-head"><div><span class="maker-column-dot ${statusValue.toLowerCase()}"></span><strong>${stateLabel(statusValue)}</strong></div><span class="maker-column-count">${state.projects.filter(project => project.estado === statusValue).length}</span></div><div class="maker-column-body">${state.projects.filter(project => project.estado === statusValue).map(projectCard).join('')}</div></div>`).join('')}</div>`;
    box.querySelector('[data-mk-new="project"]')?.addEventListener('click', () => projectModal());
    box.querySelectorAll('[data-mk-project]').forEach(button => button.addEventListener('click', () => projectDetail(Number(button.dataset.mkProject))));
    box.querySelectorAll('[data-mk-edit-project]').forEach(button => button.addEventListener('click', () => projectModal(Number(button.dataset.mkEditProject))));
    box.querySelectorAll('[data-mk-delete-project]').forEach(button => button.addEventListener('click', () => deleteWorkspace('proyectos', Number(button.dataset.mkDeleteProject), loadProjects)));
  }
  function projectCard(project) { const progress = project.tareasTotal ? Math.round(project.tareasHechas / project.tareasTotal * 100) : 0; return `<article class="maker-board-card maker-project-card" style="--card-color:${esc(project.color || '#64748b')}"><div class="maker-card-top"><span class="maker-priority">${priorityLabel(project.prioridad)}</span>${can('MAKER_PROYECTO_EDITAR') ? `<button class="btn btn-icon" data-mk-edit-project="${project.id}"><i class="fas fa-pen"></i></button>` : ''}</div><button class="maker-card-title" data-mk-project="${project.id}">${esc(project.nombre)}</button><p class="maker-card-description">${esc(project.descripcion || 'Sin descripción')}</p><div class="maker-project-card-footer"><span class="maker-card-chip"><i class="far fa-calendar"></i> ${project.fechaFin ? Utils.formatDate(project.fechaFin) : 'Sin fecha'}</span><span class="maker-task-progress">${project.tareasHechas}/${project.tareasTotal}</span></div><div class="maker-project-card-bottom"><div class="maker-avatar-stack">${avatarStack(project.asignados)}</div><div class="maker-card-progress"><div class="maker-progress-track"><span style="width:${progress}%"></span></div><small>${progress}%</small></div></div>${can('MAKER_PROYECTO_ELIMINAR') ? `<button class="btn btn-sm btn-link text-danger mt-2" data-mk-delete-project="${project.id}"><i class="fas fa-trash me-1"></i>Eliminar</button>` : ''}</article>`; }

  function renderTasks() {
    const box = document.getElementById('maker-tasks'); if (!box) return;
    const statuses = ['SIN_COMENZAR', 'EN_PROGRESO', 'HECHO'];
    box.innerHTML = `<div class="maker-toolbar"><div><h5>Tareas Maker</h5><small>Seguimiento de tareas y responsables</small></div>${can('MAKER_TAREA_CREAR') ? '<button class="btn btn-primary" data-mk-new="task"><i class="fas fa-plus me-1"></i>Nueva tarea</button>' : ''}</div><div class="maker-kanban maker-kanban-tasks">${statuses.map(statusValue => `<div class="maker-column"><div class="maker-column-head"><div><span class="maker-column-dot ${statusValue.toLowerCase()}"></span><strong>${stateLabel(statusValue)}</strong></div><span class="maker-column-count">${state.tasks.filter(task => task.estado === statusValue).length}</span></div><div class="maker-column-body">${state.tasks.filter(task => task.estado === statusValue).map(taskCard).join('')}</div></div>`).join('')}</div>`;
    box.querySelector('[data-mk-new="task"]')?.addEventListener('click', () => taskModal());
    box.querySelectorAll('[data-mk-task]').forEach(button => button.addEventListener('click', () => taskDetail(Number(button.dataset.mkTask))));
    box.querySelectorAll('[data-mk-edit-task]').forEach(button => button.addEventListener('click', () => taskModal(Number(button.dataset.mkEditTask))));
    box.querySelectorAll('[data-mk-delete-task]').forEach(button => button.addEventListener('click', () => deleteWorkspace('tareas', Number(button.dataset.mkDeleteTask), loadTasks)));
  }
  function taskCard(task) { return `<article class="maker-board-card" style="--card-color:${esc(task.color || '#00ff41')}"><div class="maker-card-top"><span class="maker-priority">${priorityLabel(task.prioridad)}</span>${can('MAKER_TAREA_EDITAR') ? `<button class="btn btn-icon" data-mk-edit-task="${task.id}"><i class="fas fa-pen"></i></button>` : ''}</div><button class="maker-card-title" data-mk-task="${task.id}">${esc(task.nombre)}</button><p>${esc(task.descripcion || 'Sin descripción')}</p><div class="maker-card-meta">${task.proyectoNombre ? `<span><i class="fas fa-diagram-project me-1"></i>${esc(task.proyectoNombre)}</span>` : '<span>Tarea general</span>'}</div><div class="maker-card-bottom"><div class="maker-avatar-stack">${avatarStack(task.asignados)}</div>${can('MAKER_TAREA_ELIMINAR') ? `<button class="btn btn-sm btn-link text-danger" data-mk-delete-task="${task.id}"><i class="fas fa-trash"></i></button>` : ''}</div></article>`; }

  async function deleteWorkspace(path, id, reload) { if (!await Utils.confirmAction('¿Eliminar este registro?', 'Confirmar', 'Eliminar')) return; try { await API.del('/maker/' + path + '/' + id); Utils.showToast('Registro eliminado', 'success'); await reload(); } catch (error) { Utils.showToast(error.message, 'error'); } }
  const userChecks = selected => `<div class="maker-user-checks">${state.users.length ? state.users.map(user => `<label class="maker-user-check"><input type="checkbox" class="mk-user-check" value="${user.id}" ${selected.includes(user.id) ? 'checked' : ''}><span>${esc(user.username)}</span></label>`).join('') : '<small class="text-muted">No hay usuarios activos.</small>'}</div>`;
  const checkedUsers = () => [...document.querySelectorAll('#makerCatalogBody .mk-user-check:checked')].map(input => Number(input.value));
  const projectOptions = selected => '<option value="">Sin proyecto</option>' + state.projects.map(project => `<option value="${project.id}" ${project.id === selected ? 'selected' : ''}>${esc(project.nombre)}</option>`).join('');
  const colorInput = value => `<input id="mkWorkColor" type="color" class="form-control form-control-color" value="${esc(value || '#00ff41')}">`;
  const priorityOptions = selected => priorities().map(item => `<option value="${item[0]}" ${item[0] === (selected || 'MEDIA') ? 'selected' : ''}>${item[1]}</option>`).join('');

  function projectModal(id) {
    const project = id ? state.projects.find(item => item.id === id) : null;
    document.getElementById('makerCatalogTitle').textContent = project ? 'Editar proyecto' : 'Nuevo proyecto';
    document.getElementById('makerCatalogBody').innerHTML = `<div class="row g-3"><div class="col-12"><label class="form-label">Nombre *</label><input id="mkWorkName" class="form-control" value="${esc(project?.nombre || '')}"></div><div class="col-12"><label class="form-label">Descripción</label><textarea id="mkWorkDescription" class="form-control" rows="3">${esc(project?.descripcion || '')}</textarea></div><div class="col-md-6"><label class="form-label">Estado</label><select id="mkWorkStatus" class="form-select">${['COTIZACION', 'MUESTREO', 'PRODUCCION', 'ENTREGA'].map(value => `<option value="${value}" ${value === (project?.estado || 'COTIZACION') ? 'selected' : ''}>${stateLabel(value)}</option>`).join('')}</select></div><div class="col-md-6"><label class="form-label">Prioridad</label><select id="mkWorkPriority" class="form-select">${priorityOptions(project?.prioridad)}</select></div><div class="col-md-6"><label class="form-label">Fecha límite</label><input id="mkWorkDate" type="date" min="${today()}" class="form-control" value="${project?.fechaFin || ''}"></div><div class="col-md-6"><label class="form-label">Color</label>${colorInput(project?.color)}</div><div class="col-12"><label class="form-label">Usuarios asignados</label>${userChecks((project?.asignados || []).map(user => user.id))}</div><div class="col-12"><label class="form-label">Cotización vinculada</label><select id="mkWorkQuote" class="form-select"><option value="">Sin cotización asociada</option>${state.quotes.map(quote => `<option value="${quote.id}" ${quote.id === project?.cotizacionId ? 'selected' : ''}>${esc(quote.folio)} · ${esc(quote.descripcion || 'Sin descripción')}</option>`).join('')}</select></div></div>`;
    document.getElementById('makerCatalogSave').onclick = async () => {
      const payload = { nombre: document.getElementById('mkWorkName').value.trim(), descripcion: document.getElementById('mkWorkDescription').value.trim(), estado: document.getElementById('mkWorkStatus').value, prioridad: document.getElementById('mkWorkPriority').value, color: document.getElementById('mkWorkColor').value, fechaFin: document.getElementById('mkWorkDate').value || null, cotizacionId: Number(document.getElementById('mkWorkQuote').value) || null, usuarioIds: checkedUsers() };
      if (!payload.nombre) return Utils.showToast('El nombre es obligatorio', 'warning');
      try { await (id ? API.put('/maker/proyectos/' + id, payload) : API.post('/maker/proyectos', payload)); hideCatalogModal(); await loadWorkspace(); Utils.showToast('Proyecto guardado', 'success'); }
      catch (error) { Utils.showToast(error.message, 'error'); }
    };
    showCatalogModal();
  }

  function taskModal(id, projectId = null) {
    const task = id ? state.tasks.find(item => item.id === id) : null;
    document.getElementById('makerCatalogTitle').textContent = task ? 'Editar tarea' : 'Nueva tarea';
    document.getElementById('makerCatalogBody').innerHTML = `<div class="row g-3"><div class="col-12"><label class="form-label">Nombre *</label><input id="mkWorkName" class="form-control" value="${esc(task?.nombre || '')}"></div><div class="col-12"><label class="form-label">Descripción</label><textarea id="mkWorkDescription" class="form-control" rows="3">${esc(task?.descripcion || '')}</textarea></div><div class="col-12"><label class="form-label">Subtareas</label><textarea id="mkTaskChecklist" class="form-control" rows="4">${esc(String(task?.checklist || '').split('\n').map(line => line.replace(/^\s*\[[ xX]\]\s*/, '')).join('\n'))}</textarea></div><div class="col-md-6"><label class="form-label">Estado</label><select id="mkWorkStatus" class="form-select">${['SIN_COMENZAR', 'EN_PROGRESO', 'HECHO'].map(value => `<option value="${value}" ${value === (task?.estado || 'SIN_COMENZAR') ? 'selected' : ''}>${stateLabel(value)}</option>`).join('')}</select></div><div class="col-md-6"><label class="form-label">Prioridad</label><select id="mkWorkPriority" class="form-select">${priorityOptions(task?.prioridad)}</select></div><div class="col-md-6"><label class="form-label">Fecha límite</label><input id="mkWorkDate" type="date" class="form-control" value="${task?.fechaFin || ''}"></div><div class="col-md-6"><label class="form-label">Color</label>${colorInput(task?.color)}</div><div class="col-12"><label class="form-label">Proyecto</label><select id="mkWorkProject" class="form-select">${projectOptions(task?.proyectoId ?? projectId)}</select></div><div class="col-12"><label class="form-label">Usuarios asignados</label>${userChecks((task?.asignados || []).map(user => user.id))}</div></div>`;
    document.getElementById('makerCatalogSave').onclick = async () => {
      const payload = { nombre: document.getElementById('mkWorkName').value.trim(), descripcion: document.getElementById('mkWorkDescription').value.trim(), checklist: document.getElementById('mkTaskChecklist').value, estado: document.getElementById('mkWorkStatus').value, prioridad: document.getElementById('mkWorkPriority').value, color: document.getElementById('mkWorkColor').value, fechaFin: document.getElementById('mkWorkDate').value || null, proyectoId: Number(document.getElementById('mkWorkProject').value) || null, usuarioIds: checkedUsers(), tareasMencionadasIds: task?.tareasMencionadas?.map(item => item.id) || [], usuariosMencionadosIds: [] };
      if (!payload.nombre) return Utils.showToast('El nombre es obligatorio', 'warning');
      try { await (id ? API.put('/maker/tareas/' + id, payload) : API.post('/maker/tareas', payload)); hideCatalogModal(); await loadWorkspace(); Utils.showToast('Tarea guardada', 'success'); }
      catch (error) { Utils.showToast(error.message, 'error'); }
    };
    showCatalogModal();
  }

  async function projectDetail(id) {
    try { const project = await API.get('/maker/proyectos/' + id); const tasks = await API.get('/maker/proyectos/' + id + '/tareas'); const body = document.getElementById('makerDetailBody'); body.innerHTML = `<div class="maker-project-detail-head"><h3>${esc(project.nombre)}</h3><p>${esc(project.descripcion || 'Sin descripción')}</p></div><div class="maker-detail-grid"><div><small>Estado</small><strong>${stateLabel(project.estado)}</strong></div><div><small>Fecha límite</small><strong>${project.fechaFin ? Utils.formatDate(project.fechaFin) : 'Sin fecha'}</strong></div><div><small>Progreso</small><strong>${project.tareasHechas}/${project.tareasTotal} tareas</strong></div><div><small>Filamento</small><strong>${project.filamentoDescontado ? 'Descontado' : 'Pendiente'}</strong></div></div><div class="maker-detail-actions">${can('MAKER_TAREA_CREAR') ? `<button class="btn btn-primary" data-mk-project-task="${project.id}"><i class="fas fa-plus me-1"></i>Nueva tarea</button>` : ''}${can('MAKER_PROYECTO_EDITAR') ? `<button class="btn btn-outline-primary" data-mk-edit-project-detail="${project.id}"><i class="fas fa-pen me-1"></i>Editar</button>` : ''}</div><hr><h6>Tareas del proyecto</h6><div class="maker-project-task-list">${tasks.length ? tasks.map(task => `<button class="maker-detail-task" data-mk-task-detail="${task.id}"><span>${esc(task.nombre)}</span><small>${stateLabel(task.estado)}</small></button>`).join('') : '<span class="text-muted">Aún no hay tareas.</span>'}</div>`; const modal = new bootstrap.Modal(document.getElementById('makerDetailModal')); modal.show(); body.querySelector('[data-mk-project-task]')?.addEventListener('click', () => { modal.hide(); taskModal(null, id); }); body.querySelector('[data-mk-edit-project-detail]')?.addEventListener('click', () => { modal.hide(); projectModal(id); }); body.querySelectorAll('[data-mk-task-detail]').forEach(button => button.addEventListener('click', () => taskDetail(Number(button.dataset.mkTaskDetail)))); }
    catch (error) { Utils.showToast(error.message, 'error'); }
  }

  async function taskDetail(id) {
    try { const task = await API.get('/maker/tareas/' + id); const checklist = String(task.checklist || '').split('\n').filter(Boolean).map(line => `<div class="maker-check-item">${esc(line.replace(/^\s*\[[ xX]\]\s*/, ''))}</div>`).join(''); Utils.showDialog('Detalle de tarea', `<div class="maker-detail-grid"><div><small>Nombre</small><strong>${esc(task.nombre)}</strong></div><div><small>Estado</small><strong>${stateLabel(task.estado)}</strong></div><div><small>Proyecto</small><strong>${esc(task.proyectoNombre || 'General')}</strong></div></div><p class="mt-3">${esc(task.descripcion || 'Sin descripción')}</p><hr><h6>Checklist</h6>${checklist || '<span class="text-muted">Sin subtareas</span>'}`); }
    catch (error) { Utils.showToast(error.message, 'error'); }
  }

  async function loadNotifications() {
    if (!can('MAKER_NOTIFICACIONES_VER')) return;
    try { const data = await API.get('/maker/notificaciones?page=0&size=50'); state.notifications = data?.content || []; renderNotifications(); updateNotificationBadge(); }
    catch (error) { const box = document.getElementById('maker-notifications'); if (box) box.innerHTML = `<div class="empty-state"><p>${esc(error.message)}</p></div>`; }
  }
  function renderNotifications() {
    const box = document.getElementById('maker-notifications'); if (!box) return;
    box.innerHTML = `<div class="maker-toolbar"><div><h5>Notificaciones Maker</h5><small>Asignaciones y menciones de tu espacio de trabajo</small></div>${state.notifications.some(item => !item.leida) && can('MAKER_NOTIFICACIONES_EDITAR') ? '<button class="btn btn-outline-primary" id="mkReadAll"><i class="fas fa-check-double me-1"></i>Marcar todas como leídas</button>' : ''}</div><div class="panel-card overflow-hidden">${state.notifications.length ? state.notifications.map(item => `<div class="maker-notification-item ${item.leida ? '' : 'unread'}"><div><strong>${esc(item.titulo)}</strong><p class="mb-1">${esc(item.mensaje)}</p><small class="text-muted">${Utils.formatDateTime(item.fecha)}</small></div>${!item.leida && can('MAKER_NOTIFICACIONES_EDITAR') ? `<button class="btn btn-sm btn-light" data-mk-read="${item.id}" title="Marcar como leída"><i class="fas fa-check"></i></button>` : ''}</div>`).join('') : '<div class="empty-state"><i class="fas fa-bell-slash"></i><p>No tienes notificaciones nuevas.</p></div>'}</div>`;
    box.querySelector('#mkReadAll')?.addEventListener('click', async () => { try { await API.patch('/maker/notificaciones/leer-todas'); await loadNotifications(); } catch (error) { Utils.showToast(error.message, 'error'); } });
    box.querySelectorAll('[data-mk-read]').forEach(button => button.addEventListener('click', async () => { try { await API.patch('/maker/notificaciones/' + button.dataset.mkRead + '/leida'); await loadNotifications(); } catch (error) { Utils.showToast(error.message, 'error'); } }));
  }
  async function updateNotificationBadge() { const badge = document.getElementById('maker-notification-count'); if (!badge || !can('MAKER_NOTIFICACIONES_VER')) return; try { const count = Number(await API.get('/maker/notificaciones/no-leidas')) || 0; badge.textContent = count > 99 ? '99+' : count; badge.classList.toggle('d-none', count === 0); } catch (_) {} }

  function showCatalogModal() { const save = document.getElementById('makerCatalogSave'); if (save) save.style.display = ''; new bootstrap.Modal(document.getElementById('makerCatalogModal')).show(); }
  function hideCatalogModal() { bootstrap.Modal.getInstance(document.getElementById('makerCatalogModal'))?.hide(); }

  document.addEventListener('click', event => {
    const button = event.target.closest('#mkSaveFinalPrice'); if (!button) return;
    const value = Number(document.getElementById('mkFinalPrice')?.value); if (!Number.isFinite(value) || value < 0) return Utils.showToast('Captura un precio válido', 'warning');
    API.patch('/maker/cotizaciones/' + button.dataset.quoteId + '/precio-final', { precioPiezaFinal: value }).then(quote => { renderResult(quote); Utils.showToast('Precio final actualizado', 'success'); }).catch(error => Utils.showToast(error.message, 'error'));
  });

  return { init };
})();

export function init() { return Maker.init(); }
