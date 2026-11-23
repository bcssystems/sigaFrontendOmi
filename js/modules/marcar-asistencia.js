let stream = null;
let photo = null;

export function init() {
  document.getElementById('maCamera')?.addEventListener('click', activarCamara);
  document.getElementById('maEntrada')?.addEventListener('click', () => marcar('/checador/entrada'));
  document.getElementById('maSalida')?.addEventListener('click', () => marcar('/checador/salida'));
}

async function activarCamara() {
  try {
    stream?.getTracks().forEach(track => track.stop());
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    const video = document.getElementById('maVideo');
    video.srcObject = stream;
    video.classList.remove('d-none');
    const button = document.createElement('button');
    button.className = 'btn btn-primary mt-2';
    button.textContent = 'Tomar selfie';
    button.onclick = () => tomarSelfie(video, button);
    document.getElementById('maCamera').after(button);
  } catch (error) {
    Utils.showToast('No se pudo activar la cámara: ' + error.message, 'error');
  }
}

function tomarSelfie(video, button) {
  const canvas = document.getElementById('maCanvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  canvas.toBlob(blob => {
    photo = blob;
    document.getElementById('maPreview').src = URL.createObjectURL(blob);
    document.getElementById('maPreview').classList.remove('d-none');
    video.classList.add('d-none');
    button.remove();
    document.getElementById('maEntrada').disabled = false;
    document.getElementById('maSalida').disabled = false;
  }, 'image/jpeg', 0.9);
}

async function marcar(route) {
  if (!photo) return Utils.showToast('Toma una selfie primero', 'warning');
  try {
    const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000 }));
    const form = new FormData();
    form.append('selfie', new File([photo], 'selfie.jpg', { type: 'image/jpeg' }));
    form.append('latitud', position.coords.latitude);
    form.append('longitud', position.coords.longitude);
    form.append('precisionMetros', position.coords.accuracy);
    await API.upload(route, form);
    Utils.showToast('Registro enviado', 'success');
    document.getElementById('maStatus').textContent = 'Asistencia registrada correctamente.';
  } catch (error) {
    Utils.showToast(error.message || 'No se pudo registrar la asistencia', 'error');
  }
}
