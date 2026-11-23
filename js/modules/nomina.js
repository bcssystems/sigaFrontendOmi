let lote = [];
let detalles = [];
let personas = [];
let nominas = [];

export function init() {
  setFechas();
  bindEvents();
  cargarPersonas();
  cargarDeducciones();
  cargarFijas();
  cargarComisiones();
  cargarNominas();
}

function bindEvents() {
  document.querySelectorAll('.nomina-tab').forEach(button => button.addEventListener('click', () => activarTab(button.dataset.tab)));
  document.getElementById('btnPrepararNomina')?.addEventListener('click', prepararLote);
  document.getElementById('btnConfirmarNomina')?.addEventListener('click', confirmarRevision);
  document.getElementById('btnGenerarNomina')?.addEventListener('click', generarLote);
  document.getElementById('btnDeduccionesManuales')?.addEventListener('click', () => mostrarDeducciones('manuales'));
  document.getElementById('btnDeduccionesFijas')?.addEventListener('click', () => mostrarDeducciones('fijas'));
  document.getElementById('btnCrearDeduccion')?.addEventListener('click', crearDeduccion);
  document.getElementById('btnNuevaDeduccionFija')?.addEventListener('click', limpiarFija);
  document.getElementById('btnGuardarDeduccionFija')?.addEventListener('click', crearFija);
  document.getElementById('btnCrearComision')?.addEventListener('click', crearComision);
  document.getElementById('nominaEstado')?.addEventListener('change', renderNominas);
  document.getElementById('dedBody')?.addEventListener('click', gestionarDeduccion);
}

function setFechas() {
  const today = new Date(); const payment = new Date(today); payment.setDate(payment.getDate() + ((5 - payment.getDay() + 7) % 7));
  const end = new Date(payment); end.setDate(end.getDate() - 1); const start = new Date(end); start.setDate(start.getDate() - 6);
  document.getElementById('nominaInicio').value = dateValue(start); document.getElementById('nominaFin').value = dateValue(end); document.getElementById('nominaPago').value = dateValue(payment);
  document.getElementById('dedFecha').value = dateValue(today); document.getElementById('fijaInicio').value = dateValue(today);
}
function dateValue(value) { return value.toISOString().slice(0, 10); }
function activarTab(tab) { document.querySelectorAll('.nomina-tab').forEach(x => x.classList.toggle('active', x.dataset.tab === tab)); document.querySelectorAll('.nomina-panel').forEach(x => x.classList.add('d-none')); document.getElementById('nominaTab' + tab.charAt(0).toUpperCase() + tab.slice(1))?.classList.remove('d-none'); }
function mostrarDeducciones(tipo) { const manual = tipo === 'manuales'; document.getElementById('deduccionesManualesPanel').classList.toggle('d-none', !manual); document.getElementById('deduccionesFijasPanel').classList.toggle('d-none', manual); document.getElementById('btnDeduccionesManuales').className = manual ? 'btn btn-primary' : 'btn btn-outline-primary'; document.getElementById('btnDeduccionesFijas').className = manual ? 'btn btn-outline-primary' : 'btn btn-primary'; }

async function cargarPersonas() {
  try { const response = await API.get('/personas?activa=true&size=500'); personas = Array.isArray(response) ? response : (response.content || []); ['dedPersona', 'comPersona', 'fijaPersonas'].forEach(id => { const select = document.getElementById(id); if (!select) return; select.innerHTML = personas.map(p => '<option value="' + p.idPersona + '">' + Utils.esc((p.nombre || '') + ' ' + (p.apellido || '')) + '</option>').join(''); }); } catch (error) { Utils.showToast('No se pudieron cargar los empleados: ' + error.message, 'error'); }
}

async function prepararLote() {
  const inicio = document.getElementById('nominaInicio').value, fin = document.getElementById('nominaFin').value, pago = document.getElementById('nominaPago').value;
  if (!inicio || !fin || inicio > fin) return Utils.showToast('Indica un periodo válido', 'warning');
  const button = document.getElementById('btnPrepararNomina'); button.disabled = true;
  try { const response = await API.post('/nomina/preparar-lote', { fechaInicio: inicio, fechaFin: fin, fechaPago: pago }); lote = response.nominas || []; detalles = await Promise.all(lote.map(async n => ({ n, d: await API.get('/nomina/desglose/' + n.personaId + '?inicio=' + encodeURIComponent(inicio) + '&fin=' + encodeURIComponent(fin)) }))); renderRevision(); document.getElementById('nominaRevision').classList.remove('d-none'); Utils.showToast('Lote preparado para revisión', 'success'); } catch (error) { Utils.showToast(error.message, 'error'); } finally { button.disabled = false; }
}

function renderRevision() {
  const body = document.getElementById('nominaRevisionBody');
  body.innerHTML = detalles.map(({ n, d }) => { const commissions = (d.comisiones || []).map(x => '<label class="d-block small"><input class="lote-concepto me-1" data-nomina="' + n.id + '" data-type="c" value="' + x.id + '" data-amount="' + x.monto + '" type="checkbox" checked> ' + Utils.esc(x.concepto || 'Comisión') + ' ' + Utils.formatCurrency(x.monto) + '</label>').join('') || '<span class="text-muted small">Sin comisiones</span>'; const deductions = (d.deducciones || []).map(x => '<label class="d-block small"><input class="lote-concepto me-1" data-nomina="' + n.id + '" data-type="d" value="' + x.id + '" data-amount="' + x.monto + '" type="checkbox" checked> ' + Utils.esc(x.concepto || 'Deducción') + ' ' + Utils.formatCurrency(x.monto) + '</label>').join('') || '<span class="text-muted small">Sin deducciones</span>'; return '<tr><td>' + Utils.esc(n.personaNombre || '-') + '</td><td>' + Utils.formatCurrency(n.sueldoBase) + '</td><td>' + commissions + '</td><td>' + deductions + '</td><td class="neto-revision" data-base="' + n.sueldoBase + '">' + Utils.formatCurrency(n.sueldo) + '</td><td>' + n.estado + '</td></tr>'; }).join('');
  body.querySelectorAll('.lote-concepto').forEach(input => input.addEventListener('change', actualizarTotales)); actualizarTotales();
}
function actualizarTotales() { let base = 0, commissions = 0, deductions = 0; lote.forEach(n => base += Number(n.sueldoBase || 0)); document.querySelectorAll('.lote-concepto:checked').forEach(x => x.dataset.type === 'c' ? commissions += Number(x.dataset.amount) : deductions += Number(x.dataset.amount)); document.getElementById('revisionBase').textContent = Utils.formatCurrency(base); document.getElementById('revisionComisiones').textContent = Utils.formatCurrency(commissions); document.getElementById('revisionDeducciones').textContent = Utils.formatCurrency(deductions); document.getElementById('revisionNeto').textContent = Utils.formatCurrency(base + commissions - deductions); document.querySelectorAll('.neto-revision').forEach(cell => { let c = 0, d = 0; cell.closest('tr').querySelectorAll('.lote-concepto:checked').forEach(x => x.dataset.type === 'c' ? c += Number(x.dataset.amount) : d += Number(x.dataset.amount)); cell.textContent = Utils.formatCurrency(Number(cell.dataset.base) + c - d); }); }
async function confirmarRevision() { try { for (const n of lote) { const selected = [...document.querySelectorAll('.lote-concepto[data-nomina="' + n.id + '"]:checked')]; await API.post('/nomina/' + n.id + '/revisar', { comisionIds: selected.filter(x => x.dataset.type === 'c').map(x => Number(x.value)), deduccionIds: selected.filter(x => x.dataset.type === 'd').map(x => Number(x.value)) }); n.estado = 'REVISADA'; } Utils.showToast('Revisión aplicada correctamente', 'success'); renderRevision(); } catch (error) { Utils.showToast(error.message, 'error'); } }
async function generarLote() { const ids = lote.filter(n => n.estado === 'REVISADA').map(n => n.id); if (!ids.length) return Utils.showToast('Aplica la revisión antes de generar', 'warning'); try { await API.post('/nomina/generar-lote', ids); Utils.showToast('Nóminas generadas correctamente', 'success'); cargarNominas(); } catch (error) { Utils.showToast(error.message, 'error'); } }

async function cargarDeducciones() { try { const rows = await API.get('/deduccion'); const body = document.getElementById('dedBody'); body.innerHTML = rows.length ? rows.map(d => '<tr><td>' + d.id + '</td><td>' + Utils.esc(d.personaNombre || '-') + '</td><td>' + Utils.esc(d.concepto || '-') + '</td><td>' + Utils.formatCurrency(d.monto) + '</td><td>' + (d.fecha || '-') + '</td><td>' + (d.origen || '-') + '</td><td>' + (d.estado || '-') + '</td><td>' + (d.estado === 'PENDIENTE' ? '<button class="btn btn-sm btn-outline-success aprobar-ded" data-id="' + d.id + '">Aprobar</button>' : '') + '</td></tr>').join('') : '<tr><td colspan="8" class="text-center text-muted">No hay deducciones registradas</td></tr>'; } catch (error) { Utils.showToast(error.message, 'error'); } }
async function crearDeduccion() { const personaId = Number(document.getElementById('dedPersona').value), concepto = document.getElementById('dedConcepto').value.trim(), monto = Number(document.getElementById('dedMonto').value), fecha = document.getElementById('dedFecha').value; if (!personaId || !concepto || monto <= 0) return Utils.showToast('Completa empleado, concepto y monto', 'warning'); try { await API.post('/deduccion', { personaId, concepto, monto, fecha }); Utils.showToast('Deducción manual registrada', 'success'); document.getElementById('dedConcepto').value = ''; document.getElementById('dedMonto').value = ''; cargarDeducciones(); } catch (error) { Utils.showToast(error.message, 'error'); } }
async function gestionarDeduccion(event) { const button = event.target.closest('.aprobar-ded'); if (!button) return; try { await API.post('/deduccion/' + button.dataset.id + '/aprobar', {}); Utils.showToast('Deducción aprobada', 'success'); cargarDeducciones(); } catch (error) { Utils.showToast(error.message, 'error'); } }

async function cargarFijas() { try { const rows = await API.get('/deduccion-fija'); document.getElementById('fijaBody').innerHTML = rows.length ? rows.map(d => '<tr><td>' + d.idDeduccionFija + '</td><td>' + Utils.esc(d.concepto) + '</td><td>' + Utils.formatCurrency(d.monto) + '</td><td>' + (d.personas?.length || 0) + '</td><td>' + (d.fechaInicio || 'Sin inicio') + (d.fechaFin ? ' - ' + d.fechaFin : ' - Sin fin') + '</td><td>' + (d.activo ? 'Activa' : 'Inactiva') + '</td></tr>').join('') : '<tr><td colspan="6" class="text-center text-muted">No hay deducciones fijas</td></tr>'; } catch (error) { Utils.showToast(error.message, 'error'); } }
function limpiarFija() { document.getElementById('fijaConcepto').value = ''; document.getElementById('fijaMonto').value = ''; document.getElementById('fijaInicio').value = ''; document.getElementById('fijaFin').value = ''; [...document.getElementById('fijaPersonas').options].forEach(option => option.selected = false); }
async function crearFija() { const concepto = document.getElementById('fijaConcepto').value.trim(), monto = Number(document.getElementById('fijaMonto').value), fechaInicio = document.getElementById('fijaInicio').value || null, fechaFin = document.getElementById('fijaFin').value || null, personaIds = [...document.getElementById('fijaPersonas').selectedOptions].map(x => Number(x.value)); if (!concepto || monto <= 0 || !personaIds.length) return Utils.showToast('Completa concepto, monto y selecciona uno o más empleados', 'warning'); if (fechaInicio && fechaFin && fechaFin < fechaInicio) return Utils.showToast('La fecha final no puede ser anterior al inicio', 'warning'); try { await API.post('/deduccion-fija', { concepto, monto, activo: true, fechaInicio, fechaFin, personaIds }); Utils.showToast('Deducción fija creada para los empleados seleccionados', 'success'); limpiarFija(); cargarFijas(); } catch (error) { Utils.showToast(error.message, 'error'); } }

async function cargarComisiones() { try { const rows = await API.get('/comision'); document.getElementById('comBody').innerHTML = rows.length ? rows.map(c => '<tr><td>' + c.id + '</td><td>' + Utils.esc(c.personaNombre || '-') + '</td><td>' + Utils.esc(c.concepto || '-') + '</td><td>' + (c.tipo || c.origen || '-') + '</td><td>' + Utils.formatCurrency(c.monto) + '</td><td>' + (c.fecha || '-') + '</td><td>' + (c.estado || '-') + '</td></tr>').join('') : '<tr><td colspan="7" class="text-center text-muted">No hay comisiones registradas</td></tr>'; } catch (error) { Utils.showToast(error.message, 'error'); } }
async function crearComision() { const personaId = Number(document.getElementById('comPersona').value), tipo = document.getElementById('comTipo').value, concepto = document.getElementById('comConcepto').value.trim(), monto = Number(document.getElementById('comMonto').value); if (!personaId || !concepto || monto <= 0) return Utils.showToast('Completa empleado, concepto y monto', 'warning'); try { await API.post('/comision', { personaId, concepto, monto, montoBase: monto, porcentaje: 0, tipo, fecha: dateValue(new Date()) }); Utils.showToast('Comisión manual registrada', 'success'); document.getElementById('comConcepto').value = ''; document.getElementById('comMonto').value = ''; cargarComisiones(); } catch (error) { Utils.showToast(error.message, 'error'); } }

async function cargarNominas() { try { nominas = await API.get('/nomina') || []; renderNominas(); } catch (error) { Utils.showToast(error.message, 'error'); } }
function renderNominas() { const estado = document.getElementById('nominaEstado')?.value || ''; const rows = nominas.filter(n => !estado || n.estado === estado); document.getElementById('nominaBody').innerHTML = rows.length ? rows.map(n => '<tr><td>' + Utils.esc(n.personaNombre || '-') + '</td><td>' + n.fechaInicio + ' - ' + n.fechaFin + '</td><td>' + Utils.formatCurrency(n.sueldoBase) + '</td><td>' + Utils.formatCurrency(n.totalComisiones) + '</td><td>' + Utils.formatCurrency(n.totalDeducciones) + '</td><td><strong>' + Utils.formatCurrency(n.sueldo) + '</strong></td><td>' + n.estado + '</td></tr>').join('') : '<tr><td colspan="7" class="text-center text-muted">No hay nóminas realizadas</td></tr>'; }
