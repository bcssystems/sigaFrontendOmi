let state = { data: [], editingId: null };
let map = null;
let marker = null;
const defaultCenter = { lat: 19.4326, lng: -99.1332 };

export function init() { bindEvents(); cargarSucursales(); }
function bindEvents() {
  document.getElementById('btnGuardarSucursal')?.addEventListener('click', guardarSucursal);
  document.getElementById('tableSucursalesBody')?.addEventListener('click', handleTableClick);
  ['sucursalLatitud', 'sucursalLongitud'].forEach(id => document.getElementById(id)?.addEventListener('input', syncMarker));
}
async function cargarSucursales() { try { state.data = await API.get('/sucursales'); renderTable(); } catch (err) { Utils.showToast(err.message, 'error'); } }
function renderTable() {
  const tbody = document.getElementById('tableSucursalesBody'); if (!tbody) return;
  if (!state.data?.length) { tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><i class="fas fa-store"></i><p>No hay sucursales</p></div></td></tr>'; return; }
  tbody.innerHTML = state.data.map(s => `<tr class="${s.activa ? '' : 'inactive-row'}"><td>${Utils.esc(s.nombre)}</td><td>${Utils.esc(s.direccion) || '-'}</td><td>${Utils.esc(s.telefono) || '-'}</td><td>${s.latitud != null && s.longitud != null ? '<i class="fas fa-check-circle text-success" title="Ubicación configurada"></i>' : '<span class="text-warning">Sin ubicación</span>'}</td><td><span class="badge-status ${s.activa ? 'badge-active' : 'badge-inactive'}">${s.activa ? 'Activa' : 'Inactiva'}</span></td><td class="acciones-cell"><button type="button" class="btn-kebab-toggle kebab-trigger" data-id="${s.idSucursal}"><i class="fas fa-ellipsis-v"></i></button></td></tr>`).join('');
}
function handleTableClick(e) { const button=e.target.closest('.kebab-trigger'); if (!button) return; const id=Number(button.dataset.id); const items=[]; if(Utils.hasPermiso('SUCURSALES_EDITAR')) items.push({icon:'fa-edit',text:'Editar',onClick:()=>abrirModal(id)}); if(Utils.hasPermiso('SUCURSALES_ELIMINAR')) items.push({danger:true,icon:'fa-trash',text:'Desactivar',onClick:()=>confirmarEliminar(id)}); Utils.abrirMenuKebab(button,items); }
async function abrirModal(id) {
  state.editingId=id; document.getElementById('sucursalModalTitle').textContent=id?'Editar Sucursal':'Nueva Sucursal'; document.getElementById('formSucursal').reset();
  const s=id?state.data.find(x=>x.idSucursal===id):null;
  if(s){document.getElementById('sucursalId').value=s.idSucursal;document.getElementById('sucursalNombre').value=s.nombre||'';document.getElementById('sucursalDireccion').value=s.direccion||'';document.getElementById('sucursalTelefono').value=s.telefono||'';document.getElementById('sucursalLatitud').value=s.latitud??'';document.getElementById('sucursalLongitud').value=s.longitud??'';document.getElementById('sucursalActiva').checked=s.activa!==false;}else document.getElementById('sucursalActiva').checked=true;
  await loadGoogleMaps(); new bootstrap.Modal(document.getElementById('sucursalModal')).show(); setTimeout(syncMarker,100);
}
async function loadGoogleMaps(){try{await window.GoogleMapsLoader.load();const target=document.getElementById('sucursalMap');if(!target)return;if(!map)map=new google.maps.Map(target,{center:defaultCenter,zoom:12,mapTypeControl:false,streetViewControl:false});map.addListener('click',e=>setCoordinates(e.latLng.lat(),e.latLng.lng()));document.getElementById('sucursalMapStatus')?.remove();}catch(e){const status=document.getElementById('sucursalMapStatus');if(status)status.innerHTML='<i class="fas fa-triangle-exclamation me-2"></i>'+Utils.esc(e.message);}}
function setCoordinates(lat,lng){document.getElementById('sucursalLatitud').value=Number(lat).toFixed(7);document.getElementById('sucursalLongitud').value=Number(lng).toFixed(7);syncMarker();}
function syncMarker(){if(!map||!window.google?.maps)return;const lat=Number(document.getElementById('sucursalLatitud').value),lng=Number(document.getElementById('sucursalLongitud').value);if(!Number.isFinite(lat)||!Number.isFinite(lng))return;const position={lat,lng};if(!marker){marker=new google.maps.Marker({map,position,draggable:true});marker.addListener('dragend',e=>setCoordinates(e.latLng.lat(),e.latLng.lng()));}else marker.setPosition(position);map.panTo(position);}
async function guardarSucursal(){const data={nombre:document.getElementById('sucursalNombre').value.trim(),direccion:document.getElementById('sucursalDireccion').value.trim(),telefono:document.getElementById('sucursalTelefono').value.trim(),activa:document.getElementById('sucursalActiva').checked,latitud:Number(document.getElementById('sucursalLatitud').value),longitud:Number(document.getElementById('sucursalLongitud').value)};if(!data.nombre||!Number.isFinite(data.latitud)||!Number.isFinite(data.longitud)){Utils.showToast('Nombre y ubicación son obligatorios','warning');return;}try{if(state.editingId)await API.put('/sucursales/'+state.editingId,data);else await API.post('/sucursales',data);Utils.showToast(state.editingId?'Sucursal actualizada':'Sucursal creada','success');bootstrap.Modal.getInstance(document.getElementById('sucursalModal'))?.hide();cargarSucursales();}catch(err){Utils.showToast(err.message,'error');}}
async function confirmarEliminar(id){if(!await Utils.confirmAction('¿Desactivar esta sucursal?','Confirmar','Desactivar'))return;try{await API.del('/sucursales/'+id);Utils.showToast('Sucursal desactivada','success');cargarSucursales();}catch(err){Utils.showToast(err.message,'error');}}
