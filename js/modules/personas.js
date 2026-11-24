let state = { data: [], currentPage: 0, totalPages: 0, pageSize: 10, editingId: null, verInactivas: false, detallePersonaId: null };
let roles = [];
let permisosPorModulo = {};

export function init() {
  bindEvents();
  cargarPersonas(0);
  cargarRolesYPermisos();
}

function bindEvents() {
  if (!Utils.hasPermiso('PERSONAS_CREAR')) {
    const btn = document.getElementById('btnNuevaPersona');
    if (btn) btn.style.display = 'none';
  }
  document.getElementById('btnNuevaPersona')?.addEventListener('click', () => abrirModal(null));
  document.getElementById('btnGuardarPersona')?.addEventListener('click', guardarPersona);
  ['personaNombre', 'personaApellido'].forEach(id => document.getElementById(id)?.addEventListener('input', actualizarUsuarioAutomatico));
  document.getElementById('tablePersonasBody')?.addEventListener('click', handleTableClick);
  document.getElementById('buscarPersonas')?.addEventListener('input', Utils.debounce(() => cargarPersonas(0), 300));
  document.getElementById('personaPermisosAdicionales')?.addEventListener('change', e => {
    if (e.target.classList.contains('permiso-modulo-check')) seleccionarModuloPermiso(e.target);
  });
  document.getElementById('btnTogglePersonasInactivas')?.addEventListener('click', () => {
    state.verInactivas = !state.verInactivas;
    const btn = document.getElementById('btnTogglePersonasInactivas');
    if (btn) btn.innerHTML = state.verInactivas ? '<i class="fas fa-eye-slash me-1"></i> Mostrar activos' : '<i class="fas fa-eye me-1"></i> Mostrar inactivos';
    cargarPersonas(0);
  });
  document.getElementById('btnDetalleEditarPersona')?.addEventListener('click', () => {
    if (state.detallePersonaId) {
      new bootstrap.Modal(document.getElementById('personaDetalleModal'))?.hide();
      abrirModal(state.detallePersonaId);
    }
  });
  document.querySelectorAll('.horario-persona-dia .hp-activo').forEach(check => check.addEventListener('change', () => {
    const row = check.closest('.horario-persona-dia');
    row.querySelectorAll('input[type="time"]').forEach(input => { input.disabled = !check.checked; if (!check.checked) input.value = ''; });
  }));
}

async function cargarRolesYPermisos() {
  try {
    const [rolesResp, permisosResp] = await Promise.all([
      API.get('/roles'),
      API.get('/roles/permisos'),
    ]);
    roles = rolesResp || [];
    permisosPorModulo = permisosResp || {};
    cargarSelectRoles();
  } catch (err) {
    console.warn('No se pudieron cargar roles/permisos', err);
  }
}

function cargarSelectRoles() {
  const sel = document.getElementById('personaRol');
  if (!sel) return;
  sel.innerHTML = (roles || [])
    .map(r => `<option value="${r.idRol}" ${r.activo === false ? 'disabled' : ''}>${Utils.esc(r.nombre)}${r.activo === false ? ' (Inactivo)' : ''}</option>`)
    .join('');
  Utils.makeSearchableSelect('personaRol');
}

function permisosDelRol(idRol) {
  const rol = (roles || []).find(r => r.idRol === Number(idRol));
  return rol && rol.permisos ? rol.permisos : [];
}

async function cargarPersonas(page) {
  state.currentPage = page;
  try {
    const activaParam = state.verInactivas ? '' : '&activa=true';
    const texto = document.getElementById('buscarPersonas')?.value.trim() || '';
    const busquedaParam = texto ? '&search=' + encodeURIComponent(texto) : '';
    const result = await API.get('/personas?page=' + page + '&size=' + state.pageSize + '&sort=idPersona,DESC' + activaParam + busquedaParam);
    state.data = result.content;
    state.totalPages = result.totalPages;
    renderTable();
    renderPagination();
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

function renderTable() {
  const tbody = document.getElementById('tablePersonasBody');
  if (!tbody) return;

  if (!state.data || state.data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><i class="fas fa-users"></i><p>No hay usuarios</p></div></td></tr>';
    return;
  }

  tbody.innerHTML = state.data.map(p => `<tr class="${p.activa ? '' : 'inactive-row'}">
    <td>${Utils.esc(p.nombre)} ${Utils.esc(p.apellido)}</td>
    <td>${Utils.esc(p.usuario)}</td>
    <td><span class="badge bg-primary-light text-primary">${p.rol && p.rol.nombre ? Utils.esc(p.rol.nombre) : '-'}</span></td>
    <td>${Utils.formatDate(p.fechaRegistro)}</td>
    <td><span class="badge-status ${p.activa ? 'badge-active' : 'badge-inactive'}">${p.activa ? 'Activo' : 'Inactivo'}</span></td>
    <td class="acciones-cell">
      <button type="button" class="btn-kebab-toggle kebab-trigger" data-id="${p.idPersona}" title="Acciones"><i class="fas fa-ellipsis-v"></i></button>
    </td>
  </tr>`).join('');
}

function renderPagination() {
  const container = document.getElementById('paginationPersonas');
  if (!container) return;
  if (state.totalPages <= 1) { container.innerHTML = ''; return; }

  let html = '<nav><ul class="pagination pagination-sm justify-content-center mb-0">';
  html += `<li class="page-item ${state.currentPage === 0 ? 'disabled' : ''}"><a class="page-link" href="#" data-page="${state.currentPage - 1}"><i class="fas fa-chevron-left"></i></a></li>`;
  for (let i = 0; i < state.totalPages; i++) {
    if (i === 0 || i === state.totalPages - 1 || (i >= state.currentPage - 2 && i <= state.currentPage + 2)) {
      html += `<li class="page-item ${i === state.currentPage ? 'active' : ''}"><a class="page-link" href="#" data-page="${i}">${i + 1}</a></li>`;
    } else if (i === state.currentPage - 3 || i === state.currentPage + 3) {
      html += `<li class="page-item disabled"><a class="page-link" href="#">...</a></li>`;
    }
  }
  html += `<li class="page-item ${state.currentPage === state.totalPages - 1 ? 'disabled' : ''}"><a class="page-link" href="#" data-page="${state.currentPage + 1}"><i class="fas fa-chevron-right"></i></a></li>`;
  html += '</ul></nav>';
  container.innerHTML = html;

  container.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      const page = parseInt(el.dataset.page);
      if (page >= 0 && page < state.totalPages) cargarPersonas(page);
    });
  });
}

function handleTableClick(e) {
  const kebab = e.target.closest('.kebab-trigger');
  if (kebab) {
    e.preventDefault();
    abrirAccionesPersona(kebab, parseInt(kebab.dataset.id));
    return;
  }
  const btn = e.target.closest('.btn-action');
  if (!btn) return;
  const id = parseInt(btn.dataset.id);
  if (btn.dataset.action === 'edit') abrirModal(id);
  else if (btn.dataset.action === 'delete') confirmarEliminar(id);
}

function abrirAccionesPersona(anchor, id) {
  const p = (state.data || []).find(x => x.idPersona === id);
  const activa = !p || p.activa !== false;
  const items = [
    { icon: 'fa-eye', text: 'Ver', color: 'var(--info)', onClick: () => abrirDetallePersona(id) },
  ];
  if (Utils.hasPermiso('PERSONAS_EDITAR')) {
    items.push({ icon: 'fa-edit', text: 'Editar', color: 'var(--primary)', onClick: () => abrirModal(id) });
  }
  if (Utils.hasPermiso('PERSONAS_ELIMINAR')) {
    items.push(activa
      ? { danger: true, icon: 'fa-user-slash', text: 'Desactivar', onClick: () => confirmarEliminar(id) }
      : { icon: 'fa-user-check', text: 'Reactivar', color: 'var(--success)', onClick: () => reactivarPersona(id) });
  }
  Utils.abrirMenuKebab(anchor, items);
}

function abrirDetallePersona(id) {
  const p = (state.data || []).find(x => x.idPersona === id);
  if (!p) { Utils.showToast('Usuario no encontrado', 'warning'); return; }
  state.detallePersonaId = id;

  const info = '<div class="mb-1"><span class="text-muted">Nombre:</span> <strong>' + Utils.esc(p.nombre + ' ' + p.apellido) + '</strong></div>' +
    '<div class="mb-1"><span class="text-muted">Usuario:</span> ' + Utils.esc(p.usuario) + '</div>' +
    '<div class="mb-1"><span class="text-muted">Rol base:</span> ' + Utils.esc(p.rol && p.rol.nombre ? p.rol.nombre : '-') + '</div>' +
    '<div class="mb-1"><span class="text-muted">Registro:</span> ' + (p.fechaRegistro ? Utils.formatDateTime(p.fechaRegistro) : '-') + '</div>' +
    '<div class="mb-0"><span class="text-muted">Estado:</span> ' + (p.activa === false ? '<span class="text-danger">Inactivo</span>' : '<span class="text-success">Activo</span>') + '</div>';
  document.getElementById('personaDetalleInfo').innerHTML = info;

  const basePermisos = permisosDelRol(p.rol ? p.rol.idRol : null);
  const permisosMap = {};
  Object.values(permisosPorModulo || {}).forEach(list => {
    (list || []).forEach(perm => { permisosMap[perm.idPermiso] = perm; });
  });
  const listaPermisos = basePermisos.map(clave => {
    const perm = Object.values(permisosMap).find(x => x.clave === clave);
    return { nombre: perm ? perm.nombre : clave, adicional: false };
  });
  (p.permisosAdicionales || []).forEach(idp => {
    const perm = permisosMap[Number(idp)];
    if (perm && !listaPermisos.some(l => l.nombre === perm.nombre)) {
      listaPermisos.push({ nombre: perm.nombre, adicional: true });
    }
  });
  if (listaPermisos.length === 0) {
    document.getElementById('personaDetallePermisos').innerHTML = '<span class="text-muted">Sin permisos adicionales</span>';
    return;
  }
  document.getElementById('personaDetallePermisos').innerHTML = listaPermisos.map(l =>
    '<div class="mb-1 d-flex align-items-center gap-2">' +
    (l.adicional ? '<span class="badge bg-success" style="font-size:0.65rem">adicional</span>' : '<span class="badge bg-secondary" style="font-size:0.65rem">rol</span>') +
    '<span>' + Utils.esc(l.nombre) + '</span></div>').join('');

  new bootstrap.Modal(document.getElementById('personaDetalleModal')).show();
}

async function reactivarPersona(id) {
  const p = (state.data || []).find(x => x.idPersona === id);
  if (!p) return;
  const confirmed = await Utils.confirmAction('Reactivar este usuario?', 'Confirmar', 'Reactivar');
  if (!confirmed) return;
  try {
    await API.put('/personas/' + id, {
      nombre: p.nombre || '',
      apellido: p.apellido || '',
      usuario: p.usuario || '',
      password: '',
      idRol: p.rol ? p.rol.idRol : null,
      permisosAdicionales: p.permisosAdicionales || [],
      activa: true,
    });
    Utils.showToast('Usuario reactivado', 'success');
    cargarPersonas(state.currentPage);
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

function renderPermisosAdicionales(idRol, seleccionados) {
  const container = document.getElementById('personaPermisosAdicionales');
  if (!container) return;

  if (!permisosPorModulo || Object.keys(permisosPorModulo).length === 0) {
    container.innerHTML = '<div class="text-muted small">No hay permisos disponibles</div>';
    return;
  }

  const permisosRol = permisosDelRol(idRol);
  const baseClaves = new Set(permisosRol || []);

  let html = '';
  for (const [modulo, permisos] of Object.entries(permisosPorModulo)) {
    const hayBase = permisos.some(p => baseClaves.has(p.clave));
    const hayAdicional = permisos.some(p => !baseClaves.has(p.clave));
    if (!hayBase && !hayAdicional) continue;

    html += `<div class="permiso-grupo mb-2" data-modulo="${Utils.esc(modulo)}">
      <div class="permiso-grupo-header d-flex align-items-center gap-2 mb-1">
        <input type="checkbox" class="form-check-input permiso-modulo-check" data-modulo="${Utils.esc(modulo)}">
        <span>${Utils.esc(modulo)}</span>
        ${hayBase ? '<small class="text-muted fw-normal">(incluye permisos del rol base)</small>' : ''}
      </div>
      <div class="permiso-grupo-items">`;
    permisos.forEach(p => {
      const esBase = baseClaves.has(p.clave);
      let checked = '';
      let disabledAttr = '';
      let extraClass = '';
      let title = '';
      if (esBase) {
        checked = 'checked';
        disabledAttr = 'disabled';
        extraClass = ' permiso-item-base';
        title = 'Ya incluido en el rol base';
      } else if ((seleccionados || []).includes(p.idPermiso)) {
        checked = 'checked';
      }
      html += `<label class="permiso-item${extraClass}" title="${title}">
        <input type="checkbox" class="form-check-input permiso-check" data-modulo="${Utils.esc(modulo)}" data-id="${p.idPermiso}" ${checked} ${disabledAttr}>
        <span>${Utils.esc(p.nombre)}</span>
        ${esBase ? '<small class="text-muted"><i class="fas fa-lock ms-1"></i></small>' : ''}
      </label>`;
    });
    html += `</div></div>`;
  }

  container.innerHTML = html || '<div class="text-muted small">No hay permisos disponibles</div>';
  sincronizarChecksModulosPermiso(container);
}

function sincronizarChecksModulosPermiso(container) {
  if (!container) return;
  container.querySelectorAll('.permiso-grupo').forEach(grupo => {
    const checks = grupo.querySelectorAll('.permiso-check:not(:disabled)');
    const moduloCheck = grupo.querySelector('.permiso-modulo-check');
    if (!moduloCheck) return;
    const total = checks.length;
    const marcados = Array.from(checks).filter(c => c.checked).length;
    moduloCheck.checked = total > 0 && marcados === total;
    moduloCheck.indeterminate = marcados > 0 && marcados < total;
  });
}

function seleccionarModuloPermiso(moduloCheck) {
  const grupo = moduloCheck.closest('.permiso-grupo');
  if (!grupo) return;
  const checked = moduloCheck.checked;
  grupo.querySelectorAll('.permiso-check:not(:disabled)').forEach(cb => cb.checked = checked);
  sincronizarChecksModulosPermiso(grupo.closest('#personaPermisosAdicionales'));
}

async function abrirModal(id) {
  if (!roles || roles.length === 0) await cargarRolesYPermisos();
  state.editingId = id;
  const modal = new bootstrap.Modal(document.getElementById('personaModal'));
  document.getElementById('personaModalTitle').textContent = id ? 'Editar Usuario' : 'Nuevo Usuario';
  document.getElementById('formPersona').reset();
  document.getElementById('personaId').value = '';
  document.getElementById('personaUsuario').readOnly = !id;
  cargarSelectRoles();

  if (id) {
    const p = state.data.find(p => p.idPersona === id);
    if (p) {
      document.getElementById('personaId').value = p.idPersona;
      document.getElementById('personaNombre').value = p.nombre || '';
      document.getElementById('personaApellido').value = p.apellido || '';
      document.getElementById('personaUsuario').value = p.usuario || '';
       const rolSelect = document.getElementById('personaRol');
       const rolId = p.rol && p.rol.idRol != null ? String(p.rol.idRol) : '';
       rolSelect.value = rolId;
       const rolInput = rolSelect.parentElement?.querySelector('.searchable-input');
       const rolOption = Array.from(rolSelect.options).find(option => option.value === rolId);
       if (rolInput) rolInput.value = rolOption ? rolOption.textContent : '';
      document.getElementById('personaPassword').required = false;
       document.getElementById('personaActiva').checked = p.activa !== false;
       document.getElementById('personaSueldoBase').value = p.sueldoBase ?? '';
       document.getElementById('personaSueldoSemanal').value = p.sueldoSemanal ?? '';
       document.getElementById('personaSueldoHora').value = p.sueldoHora ?? '';
        limpiarEditorHorario();
        try { const assignment = await API.horarioEmpleado(id); cargarEditorHorario(assignment?.horario); } catch (_) {}
      renderPermisosAdicionales(p.rol ? p.rol.idRol : null, p.permisosAdicionales || []);
    }
  } else {
    document.getElementById('personaPassword').required = true;
    document.getElementById('personaActiva').checked = true;
    document.getElementById('personaSueldoBase').value = '';
    document.getElementById('personaSueldoSemanal').value = '';
    document.getElementById('personaSueldoHora').value = '';
    limpiarEditorHorario();
    const primerRol = (roles || [])[0];
    renderPermisosAdicionales(primerRol ? primerRol.idRol : null, []);
  }

  const sel = document.getElementById('personaRol');
  sel.onchange = () => {
    const seleccionados = Array.from(document.querySelectorAll('#personaPermisosAdicionales .permiso-check:checked:not(:disabled)'))
      .map(cb => Number(cb.dataset.id));
    renderPermisosAdicionales(sel.value, seleccionados);
  };

  modal.show();
}

async function guardarPersona() {
  const data = {
    nombre: document.getElementById('personaNombre').value.trim(),
    apellido: document.getElementById('personaApellido').value.trim(),
    usuario: document.getElementById('personaUsuario').value.trim(),
    password: document.getElementById('personaPassword').value,
    idRol: Number(document.getElementById('personaRol').value),
    permisosAdicionales: Array.from(document.querySelectorAll('.permiso-check:checked:not(:disabled)'))
      .map(cb => Number(cb.dataset.id)),
    activa: document.getElementById('personaActiva').checked,
    sueldoBase: Number(document.getElementById('personaSueldoBase').value) || 0,
    sueldoSemanal: Number(document.getElementById('personaSueldoSemanal').value) || 0,
    sueldoHora: Number(document.getElementById('personaSueldoHora').value) || 0,
  };

  if (!data.nombre || !data.apellido || !data.usuario) {
    Utils.showToast('Nombre, apellido y usuario son obligatorios', 'warning');
    return;
  }
  if (!data.idRol) {
    Utils.showToast('Selecciona un rol base', 'warning');
    return;
  }
  if (!state.editingId && !data.password) {
    Utils.showToast('La contraseña es obligatoria', 'warning');
    return;
  }

  try {
    const horario = obtenerHorarioUsuario(data.usuario);
    if (state.editingId) {
      await API.put('/personas/' + state.editingId, data);
      await guardarHorarioUsuario(state.editingId, horario);
      Utils.showToast('Usuario actualizado', 'success');
    } else {
      const created = await API.post('/personas', data);
      const newId = created?.idPersona;
      if (newId) await guardarHorarioUsuario(newId, horario);
      Utils.showToast('Usuario creado', 'success');
    }
    bootstrap.Modal.getInstance(document.getElementById('personaModal'))?.hide();
    cargarPersonas(state.currentPage);
  } catch (err) { Utils.showToast(err.message, 'error'); }
}

function actualizarUsuarioAutomatico() {
  if (state.editingId) return;
  const nombre = document.getElementById('personaNombre')?.value.trim() || '';
  const apellido = document.getElementById('personaApellido')?.value.trim() || '';
  const primerNombre = normalizarUsuario(nombre.split(/\s+/)[0] || '');
  const primerApellido = normalizarUsuario(apellido.split(/\s+/)[0] || '');
  if (!primerNombre || !primerApellido) {
    document.getElementById('personaUsuario').value = '';
    return;
  }
  const base = primerNombre.charAt(0) + primerApellido;
  const existentes = new Set((state.data || []).map(p => String(p.usuario || '').toLowerCase()));
  let usuario = base;
  let consecutivo = 2;
  while (existentes.has(usuario.toLowerCase())) usuario = base + consecutivo++;
  document.getElementById('personaUsuario').value = usuario;
}

function normalizarUsuario(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

function limpiarEditorHorario() {
  document.querySelectorAll('.horario-persona-dia').forEach(row => {
    const check = row.querySelector('.hp-activo');
    check.checked = false;
    row.querySelectorAll('input[type="time"]').forEach(input => { input.value = ''; input.disabled = true; });
  });
}

function cargarEditorHorario(horario) {
  limpiarEditorHorario();
  (horario?.dias || []).forEach(dia => {
    const row = document.querySelector(`.horario-persona-dia[data-dia="${dia.dia}"]`);
    if (!row) return;
    row.querySelector('.hp-activo').checked = true;
    row.querySelector('.hp-entrada').value = (dia.entrada || '').substring(0, 5);
    row.querySelector('.hp-salida').value = (dia.salida || '').substring(0, 5);
    row.querySelector('.hp-break-in').value = (dia.breaks?.[0]?.inicio || '').substring(0, 5);
    row.querySelector('.hp-break-out').value = (dia.breaks?.[0]?.fin || '').substring(0, 5);
    row.querySelectorAll('input[type="time"]').forEach(input => input.disabled = false);
  });
}

function obtenerHorarioUsuario(nombreUsuario) {
  const dias = [];
  document.querySelectorAll('.horario-persona-dia').forEach(row => {
    const activo = row.querySelector('.hp-activo').checked;
    if (!activo) return;
    const entrada = row.querySelector('.hp-entrada').value;
    const salida = row.querySelector('.hp-salida').value;
    const breakInicio = row.querySelector('.hp-break-in').value;
    const breakFin = row.querySelector('.hp-break-out').value;
    if (!entrada || !salida || entrada >= salida) throw new Error('Completa correctamente la entrada y salida de ' + row.dataset.dia);
    if ((breakInicio && !breakFin) || (!breakInicio && breakFin) || (breakInicio && breakInicio >= breakFin)) throw new Error('El descanso de ' + row.dataset.dia + ' es inválido');
    dias.push({ dia: row.dataset.dia, entrada, salida, breaks: breakInicio ? [{ inicio: breakInicio, fin: breakFin }] : [] });
  });
  if (!dias.length) throw new Error('Selecciona al menos un día para el horario del usuario');
  return { nombre: 'Horario - ' + nombreUsuario, dias };
}

async function guardarHorarioUsuario(personaId, horarioData) {
  const horario = await API.post('/horarios', horarioData);
  await API.guardarHorarioEmpleado(personaId, { horarioId: horario.idHorario });
}

async function confirmarEliminar(id) {
  const confirmed = await Utils.confirmAction('¿Desactivar este usuario?', 'Confirmar', 'Desactivar');
  if (!confirmed) return;
  try {
    await API.del('/personas/' + id);
    Utils.showToast('Usuario desactivado', 'success');
    cargarPersonas(state.currentPage);
  } catch (err) { Utils.showToast(err.message, 'error'); }
}
