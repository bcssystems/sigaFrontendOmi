const API = (() => {
  const baseUrl = window.location.hostname === 'siga.omisoltec.mx'
    ? `${window.location.origin}/api/v1`
    : 'http://localhost:8021/api/v1';
  let csrfToken = null;
  let csrfPromise = null;
  let refreshPromise = null;
  let session = null;
  let expirationNotified = false;

  const authEndpoint = (endpoint) => /\/auth\/(login|refresh-token|logout|csrf)$/.test(endpoint);
  const mutation = (method) => !['GET', 'HEAD', 'OPTIONS'].includes(method);

  function cookie(name) {
    const prefix = `${name}=`;
    const value = document.cookie.split('; ').find(item => item.startsWith(prefix));
    return value ? decodeURIComponent(value.substring(prefix.length)) : null;
  }

  async function loadCsrf() {
    const existingToken = cookie('XSRF-TOKEN');
    if (existingToken) {
      csrfToken = existingToken;
      return csrfToken;
    }
    if (csrfPromise) return csrfPromise;
    csrfPromise = fetch(`${baseUrl}/auth/csrf`, { credentials: 'include', cache: 'no-store' })
      .then(response => {
        if (!response.ok) throw new Error('No se pudo inicializar la protección CSRF');
        return response.json();
      })
      .then(data => {
        csrfToken = cookie('XSRF-TOKEN') || data.token;
        return csrfToken;
      })
      .finally(() => { csrfPromise = null; });
    return csrfPromise;
  }

  async function csrf() {
    if (!cookie('XSRF-TOKEN')) await loadCsrf();
    csrfToken = cookie('XSRF-TOKEN') || csrfToken;
    return csrfToken;
  }

  function clearAuthState(notify = false) {
    session = null;
    ['authToken', 'refreshToken', 'username', 'userNombre', 'userRol'].forEach(key => localStorage.removeItem(key));
    if (notify && !expirationNotified) {
      expirationNotified = true;
      window.dispatchEvent(new CustomEvent('siga:session-expired'));
    }
  }

  function setSession(data) { session = data || null; expirationNotified = false; }

  async function refresh() {
    if (!refreshPromise) {
      refreshPromise = (async () => {
        await csrf();
        const response = await fetch(`${baseUrl}/auth/refresh-token`, {
          method: 'POST', credentials: 'include',
          headers: { 'X-XSRF-TOKEN': cookie('XSRF-TOKEN') || csrfToken }
        });
        if (!response.ok) throw new Error(response.status === 403 ? 'La sesión no pudo renovarse' : 'Sesión expirada');
        const data = await response.json();
        setSession(data);
        return data;
      })().finally(() => { refreshPromise = null; });
    }
    return refreshPromise;
  }

  async function logout() {
    try {
      await csrf();
      await fetch(`${baseUrl}/auth/logout`, {
        method: 'POST', credentials: 'include',
        headers: { 'X-XSRF-TOKEN': cookie('XSRF-TOKEN') || csrfToken }
      });
    } finally {
      clearAuthState();
    }
  }

  async function request(endpoint, options = {}, retry = true, csrfRetry = true) {
    const method = options.method || 'GET';
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (mutation(method) && !endpoint.endsWith('/auth/csrf')) {
      await csrf();
      headers['X-XSRF-TOKEN'] = cookie('XSRF-TOKEN') || csrfToken;
    }
    const response = await fetch(`${baseUrl}${endpoint}`, {
      ...options, method, credentials: 'include', headers
    });
    const hasKnownSession = Boolean(session || localStorage.getItem('refreshToken'));
    if (response.status === 401 && retry && !authEndpoint(endpoint) && (endpoint !== '/auth/me' || hasKnownSession)) {
      try {
        await refresh();
        return request(endpoint, options, false, csrfRetry);
      } catch (_) {
        clearAuthState(true);
        throw new Error('Sesión expirada');
      }
    }
    if (response.status === 403 && csrfRetry && mutation(method) && !authEndpoint(endpoint)) {
      try {
        csrfToken = null;
        await loadCsrf();
        return request(endpoint, options, retry, false);
      } catch (_) { /* Puede ser un 403 real de permisos. */ }
    }
    if (!response.ok) {
      let message = `Error ${response.status}`;
      try { const error = await response.json(); message = error.message || error.error || message; } catch (_) {}
      throw new Error(message);
    }
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  async function upload(endpoint, formData, retry = true) {
    await csrf();
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST', credentials: 'include', body: formData,
      headers: { 'X-XSRF-TOKEN': cookie('XSRF-TOKEN') || csrfToken }
    });
    if (response.status === 401 && retry) {
      try { await refresh(); return upload(endpoint, formData, false); }
      catch (_) { clearAuthState(true); throw new Error('Sesión expirada'); }
    }
    if (!response.ok) throw new Error('Error al subir archivo');
    return response.status === 204 ? null : response.json();
  }

  async function downloadPost(endpoint, body, retry = true) {
    await csrf();
    const response = await fetch(`${baseUrl}${endpoint}`, { method: 'POST', credentials: 'include', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': cookie('XSRF-TOKEN') || csrfToken } });
    if (response.status === 401 && retry) {
      try { await refresh(); return downloadPost(endpoint, body, false); }
      catch (_) { clearAuthState(true); throw new Error('Sesión expirada'); }
    }
    if (response.status === 403) throw new Error('No tienes permisos para descargar este archivo');
    if (!response.ok) throw new Error('No se pudo descargar el archivo');
    return response.blob();
  }

  async function download(endpoint, retry = true) {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: 'GET', credentials: 'include', headers: { Accept: 'application/pdf,application/octet-stream' }
    });
    if (response.status === 401 && retry) {
      try { await refresh(); return download(endpoint, false); }
      catch (_) { clearAuthState(true); throw new Error('Sesión expirada'); }
    }
    if (response.status === 403) throw new Error('No tienes permisos para descargar este archivo');
    if (!response.ok) {
      let message = 'No se pudo descargar el archivo';
      try { const error = await response.json(); message = error.message || error.error || message; } catch (_) {}
      throw new Error(message);
    }
    return response.blob();
  }

  const entrada = formData => upload('/checador/entrada', formData);
  const salida = formData => upload('/checador/salida', formData);
  const miTablero = () => request('/checador/mi-tablero');
  const miHorario = () => request('/checador/mi-horario');
  const horarios = () => request('/horarios');
  const horarioEmpleado = id => request('/personas/' + encodeURIComponent(id) + '/horario');
  const guardarHorarioEmpleado = (id, body) => request('/personas/' + encodeURIComponent(id) + '/horario', { method: 'POST', body: JSON.stringify(body) });
  const evidencias = () => request('/asistencias/evidencias');
  const aprobarEvidencia = id => request('/asistencias/evidencias/' + encodeURIComponent(id) + '/aprobar', { method: 'POST' });
  const rechazarEvidencia = id => request('/asistencias/evidencias/' + encodeURIComponent(id) + '/rechazar', { method: 'POST' });

  return {
    baseUrl,
    mediaBaseUrl: baseUrl.replace(/\/api\/v1\/?$/, ''),
    getSession: () => session,
    setSession,
    cargarCsrf: loadCsrf,
    cerrarSesion: logout,
    get: endpoint => request(endpoint),
    post: (endpoint, body) => request(endpoint, { method: 'POST', body: JSON.stringify(body) }),
    put: (endpoint, body) => request(endpoint, { method: 'PUT', body: JSON.stringify(body) }),
    patch: (endpoint, body) => request(endpoint, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
    del: endpoint => request(endpoint, { method: 'DELETE' }),
    upload, downloadPost, download,
    requestUpload: upload,
    request,
    entrada, salida, miTablero, miHorario, horarios, horarioEmpleado, guardarHorarioEmpleado,
    evidencias, aprobarEvidencia, rechazarEvidencia,
  };
})();
