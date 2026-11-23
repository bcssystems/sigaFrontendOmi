export function init() { cargar(); }

async function cargar() {
  const tablero = document.getElementById('tableroAsistencia');
  try {
    const data = await API.miTablero();
    const records = Array.isArray(data) ? data : (data.asistencias || []);
    const schedule = data.horario?.horario || data.horario;
    tablero.innerHTML = '<div class="row g-2 mb-3"><div class="col-md-6"><div class="border rounded p-2"><small class="text-muted">Horas semanales</small><strong class="d-block">' + esc(data.horasLaboralesSemanales ?? '-') + '</strong></div></div><div class="col-md-6"><div class="border rounded p-2"><small class="text-muted">Registros</small><strong class="d-block">' + records.length + '</strong></div></div></div>' + (records.length ? '<div class="table-responsive"><table class="table table-custom"><thead><tr><th>Fecha</th><th>Entrada</th><th>Salida</th><th>Retardo</th><th>Salida temprana</th><th>Estado</th></tr></thead><tbody>' + records.map(item => '<tr><td>' + Utils.formatDate(item.fecha) + '</td><td>' + Utils.formatDateTime(item.entrada) + '</td><td>' + Utils.formatDateTime(item.salida) + '</td><td>' + (item.minutosRetardo || 0) + ' min</td><td>' + (item.minutosSalidaTemprana || 0) + ' min</td><td>' + esc(item.estado || '-') + '</td></tr>').join('') + '</tbody></table></div>' : '<p class="text-muted mb-0">Aún no hay registros de asistencia.</p>');
    renderCalendar(schedule);
  } catch (error) {
    tablero.innerHTML = '<span class="text-danger">No se pudo cargar tu tablero: ' + esc(error.message) + '</span>';
    renderCalendar(null);
  }
}

function renderCalendar(schedule) {
  const target = document.getElementById('calendarioEmpleado');
  const days = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'];
  const configured = new Map((schedule?.dias || []).map(day => [day.dia, day]));
  target.innerHTML = '<div class="labor-calendar-grid">' + days.map(day => { const item = configured.get(day); const breaks = (item?.breaks || []).map(b => esc((b.inicio || '') + ' - ' + (b.fin || ''))).join('<br>'); return '<div class="labor-calendar-day ' + (item ? 'is-active' : '') + '"><h6>' + day + '</h6>' + (item ? '<div class="labor-calendar-time">' + esc(item.entrada) + ' - ' + esc(item.salida) + '</div><div class="labor-calendar-break">' + (breaks ? 'Break programado:<br>' + breaks : 'Sin break') + '</div>' : '<span class="text-muted small">Descanso</span>') + '</div>'; }).join('') + '</div>';
}

function esc(value) { return Utils.esc(String(value ?? '')); }
