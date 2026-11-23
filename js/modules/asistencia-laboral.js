export function init() { cargar(); }

async function cargar() {
  try {
    const board = await API.miTablero();
    const rows = board.asistencias || [];
    document.getElementById('alBody').innerHTML = rows.map(a => `<tr><td>${Utils.formatDate(a.fecha)}</td><td>${Utils.formatDateTime(a.entrada)}</td><td>${Utils.formatDateTime(a.salida)}</td><td>${a.minutosRetardo || 0} min</td><td>${a.minutosSalidaTemprana || 0} min</td><td>${a.estado || '-'}</td></tr>`).join('') || '<tr><td colspan="6">Sin registros.</td></tr>';
  } catch (error) {
    document.getElementById('alBody').innerHTML = `<tr><td colspan="6">${Utils.esc(error.message)}</td></tr>`;
  }
}
