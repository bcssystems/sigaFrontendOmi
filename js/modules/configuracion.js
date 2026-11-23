const CAMPOS = {
  fondoCajaChica: 'cfg-fondoCajaChica',
  tasaInteresMoraPagare: 'cfg-tasaInteresMoraPagare',
  diasListaNegra: 'cfg-diasListaNegra',
  titularPagare: 'cfg-titularPagare',
  descripcionEmpresa: 'cfg-descripcionEmpresa',
  direccionEmpresa: 'cfg-direccionEmpresa',
  asistenciaToleranciaEntrada: 'cfg-asistenciaToleranciaEntrada',
  asistenciaToleranciaSalida: 'cfg-asistenciaToleranciaSalida',
  asistenciaRadioMaximo: 'cfg-asistenciaRadioMaximo',
  asistenciaFechaInicioOperaciones: 'cfg-asistenciaFechaInicioOperaciones'
};

let configs = [];

export function init() {
  bindEvents();
  cargar();
}

function bindEvents() {
  if (!Utils.hasPermiso('CONFIGURACION_EDITAR')) {
    const btn = document.getElementById('btnGuardarConfig');
    if (btn) btn.style.display = 'none';
  }
  document.getElementById('btnGuardarConfig')?.addEventListener('click', guardarTodo);
  document.querySelectorAll('.form-control').forEach(i => {
    i.addEventListener('keydown', e => { if (e.key === 'Enter') guardarTodo(); });
  });
  cargarComisionesVenta();
}

async function cargarComisionesVenta() {
  try {
    const data = await API.get('/configuraciones/comisiones-venta');
    const porcentaje = document.getElementById('cfg-comisionVentaPorcentaje');
    if (porcentaje) porcentaje.value = data.porcentaje ?? 0;
    const container = document.getElementById('cfg-comisionVentaRoles');
    if (container) container.innerHTML = (data.roles || []).map(r => '<div class="col-md-3"><label class="form-check"><input class="form-check-input cfg-comision-rol" type="checkbox" value="' + r.idRol + '" ' + (r.seleccionado ? 'checked' : '') + '> <span class="form-check-label">' + Utils.esc(r.nombre) + '</span></label></div>').join('') || '<small class="text-muted">No hay roles activos.</small>';
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

async function cargar() {
  try {
    configs = await API.get('/configuraciones');
    configs.forEach(c => {
      const id = CAMPOS[c.clave];
      if (!id) return;
      const el = document.getElementById(id);
      if (el) el.type === 'checkbox' ? (el.checked = c.valor === 'true') : (el.value = c.valor);
      const desc = document.getElementById('desc-' + c.clave);
      if (desc) desc.textContent = c.descripcion || '';
    });
  } catch (err) {
    Utils.showToast(err.message, 'error');
  }
}

async function guardarTodo() {
  let ok = true;
  for (const c of configs) {
    const id = CAMPOS[c.clave];
    if (!id) continue;
    const el = document.getElementById(id);
    const valor = el?.type === 'checkbox' ? String(el.checked) : (el?.value ?? c.valor);
    if (valor === '') { Utils.showToast('El campo ' + c.clave + ' no puede estar vac&iacute;o', 'warning'); ok = false; break; }
    try {
      await API.put('/configuraciones/' + encodeURIComponent(c.clave), { clave: c.clave, valor: String(valor).trim() });
    } catch (err) {
      Utils.showToast(err.message, 'error');
      ok = false;
      break;
    }
  }
  if (ok) {
    try {
      const porcentaje = Number(document.getElementById('cfg-comisionVentaPorcentaje')?.value);
      const rolIds = [...document.querySelectorAll('.cfg-comision-rol:checked')].map(x => Number(x.value));
      if (!Number.isFinite(porcentaje) || porcentaje < 0 || porcentaje > 100) throw new Error('El porcentaje de comisión debe estar entre 0 y 100');
      await API.put('/configuraciones/comisiones-venta', { porcentaje, rolIds });
      Utils.showToast('Configuraci&oacute;n guardada', 'success');
    } catch (err) { Utils.showToast(err.message, 'error'); }
  }
}
