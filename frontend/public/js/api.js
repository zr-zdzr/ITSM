/* api.js — Fetch wrapper for ITMS backend */
const API = (() => {
  async function request(method, path, body, isFormData = false) {
    const opts = {
      method,
      credentials: 'include',
      headers: isFormData ? {} : { 'Content-Type': 'application/json' },
    };
    if (body) opts.body = isFormData ? body : JSON.stringify(body);

    const res = await fetch(path, opts);
    if (res.status === 401) { location.replace('/login.html'); throw new Error('Unauthorized'); }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) return res.json();
    if (ct.includes('text/csv')) {
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = (res.headers.get('content-disposition') || '').match(/filename="?([^"]+)"?/)?.[1] || 'export.csv';
      a.click();
      URL.revokeObjectURL(url);
      return null;
    }
    return res.json();
  }

  const get    = (path)        => request('GET',    path);
  const post   = (path, body)  => request('POST',   path, body);
  const put    = (path, body)  => request('PUT',    path, body);
  const patch  = (path, body)  => request('PATCH',  path, body);
  const del    = (path, body)  => request('DELETE', path, body);
  const upload = (path, file)  => {
    const fd = new FormData();
    fd.append('file', file);
    return request('POST', path, fd, true);
  };

  return { get, post, put, patch, del, upload };
})();
