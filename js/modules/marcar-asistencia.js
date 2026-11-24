let cameraStream = null;
let selfieBlob = null;
let selectedRoute = '/checador/entrada';
let submitting = false;
let canEnterToday = false;
let canExitToday = false;

export function init() {
  document.getElementById('btnActivarCamara')?.addEventListener('click', activateCamera);
  document.getElementById('btnTomarSelfie')?.addEventListener('click', () => chooseAndCapture(canEnterToday ? '/checador/entrada' : '/checador/salida'));
  loadBoard();
}

async function activateCamera() {
  if (!navigator.mediaDevices?.getUserMedia) return show('Este navegador no permite usar la cámara en vivo.', 'danger');
  try {
    cameraStream?.getTracks().forEach(track => track.stop());
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    const video = document.getElementById('cameraPreview');
    video.srcObject = cameraStream;
    document.querySelector('.camera-box')?.classList.add('active');
    video.classList.remove('d-none');
    document.getElementById('selfiePreview')?.classList.add('d-none');
    document.getElementById('selfieStatus').textContent = 'Cámara activa. Toma la selfie para registrar tu movimiento.';
    setActionButtons(false);
  } catch (error) { show('No se pudo activar la cámara: ' + error.message, 'danger'); }
}

function chooseAndCapture(route) {
  selectedRoute = route;
  if (route.endsWith('entrada') && !canEnterToday) return show('Hoy no tienes jornada asignada o ya registraste entrada.', 'warning');
  if (route.endsWith('salida') && !canExitToday) return show('No puedes registrar salida sin una entrada vigente.', 'warning');
  if (!cameraStream) return show('Activa la cámara antes de registrar.', 'warning');
  takeSelfie();
}

function takeSelfie() {
  const video = document.getElementById('cameraPreview');
  if (!cameraStream || !video.videoWidth) return show('Activa la cámara antes de tomar la selfie.', 'warning');
  const canvas = document.getElementById('cameraCanvas');
  canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  canvas.toBlob(async blob => {
    if (!blob) return show('No se pudo generar la selfie.', 'danger');
    selfieBlob = blob;
    const preview = document.getElementById('selfiePreview');
    preview.src = URL.createObjectURL(blob); preview.classList.remove('d-none'); video.classList.add('d-none');
    document.getElementById('selfieStatus').textContent = 'Selfie capturada. Obteniendo ubicación para registrar...';
    setUploadAnimation(true); await register(selectedRoute);
  }, 'image/jpeg', .92);
}

function getPosition() { if (!navigator.geolocation) return Promise.reject(new Error('Este navegador no permite obtener ubicación.')); return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, () => reject(new Error('No se pudo obtener la ubicación.')), { enableHighAccuracy: true, timeout: 15000 })); }

async function register(route) {
  if (!selfieBlob || submitting) return;
  submitting = true; setActionButtons(true);
  try {
    const geo = await getPosition(); const form = new FormData();
    form.append('selfie', new File([selfieBlob], 'selfie-' + Date.now() + '.jpg', { type: 'image/jpeg' }));
    form.append('latitud', geo.coords.latitude); form.append('longitud', geo.coords.longitude); form.append('precisionMetros', geo.coords.accuracy);
    const response = route.endsWith('entrada') ? await API.entrada(form) : await API.salida(form);
    document.getElementById('selfieStatus').textContent = (route.endsWith('entrada') ? 'Entrada' : 'Salida') + ' registrada con selfie.';
    show('Registro enviado correctamente.', 'success');
    setTimeout(() => window.location.reload(), 800);
  } catch (error) { document.getElementById('selfieStatus').textContent = 'Selfie lista. El registro no se completó.'; show(error.message || 'No se pudo registrar la asistencia.', 'danger'); }
  finally { submitting = false; setUploadAnimation(false); setActionButtons(false); loadBoard(); }
}

function setUploadAnimation(active) { document.getElementById('selfieUploadAnimation')?.classList.toggle('active', active); }
function setActionButtons(disabled) { const selfie = document.getElementById('btnTomarSelfie'); if (!selfie) return; const entering = canEnterToday; const exiting = canExitToday; const action = entering ? 'entrada' : exiting ? 'salida' : 'movimiento'; selfie.disabled = disabled || !cameraStream || (!entering && !exiting); selfie.innerHTML = '<i class="fas ' + (entering ? 'fa-sign-in-alt' : exiting ? 'fa-sign-out-alt' : 'fa-ban') + ' me-1"></i>' + (action === 'movimiento' ? 'Sin movimiento disponible' : 'Tomar selfie y registrar ' + action); selfie.classList.toggle('btn-primary', entering); selfie.classList.toggle('btn-outline-primary', !entering); }

async function loadBoard() {
  try {
    const data = await API.miTablero(); const records = Array.isArray(data) ? data : (data.asistencias || []); let schedule = data.horario?.horario || data.horario;
    if (!schedule?.dias) { try { const assignment = await API.miHorario(); schedule = assignment?.horario || assignment; } catch (_) {} }
    const weekday = ['DOMINGO','LUNES','MARTES','MIERCOLES','JUEVES','VIERNES','SABADO'][new Date().getDay()]; const scheduledToday = Boolean(schedule?.dias?.some(day => String(day.dia).toUpperCase() === weekday));
    const now = new Date(); const todayKey = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0'); const today = records.find(item => String(item.fecha || '').slice(0, 10) === todayKey);
    canEnterToday = data.puedeRegistrarEntrada !== undefined ? Boolean(data.puedeRegistrarEntrada) : (!today?.entrada && scheduledToday); canExitToday = data.puedeRegistrarSalida !== undefined ? Boolean(data.puedeRegistrarSalida) : Boolean(today?.entrada && !today?.salida); setActionButtons(false);
    if (!scheduledToday && !today?.entrada) show('Hoy no tienes horario asignado. No puedes registrar entrada.', 'info');
  } catch (error) { canEnterToday = false; canExitToday = false; setActionButtons(false); show(error.message, 'danger'); }
}

function show(message, type) { const el = document.getElementById('asistenciaMensaje'); if (!el) return; el.className = 'alert alert-' + type; el.textContent = message; }
