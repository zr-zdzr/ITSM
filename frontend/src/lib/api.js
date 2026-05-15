async function req(method, path, body) {
  const isForm = body instanceof FormData
  const res = await fetch(path, {
    method,
    credentials: 'include',
    headers: isForm ? {} : body ? { 'Content-Type': 'application/json' } : {},
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || err.message || `HTTP ${res.status}`)
  }
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('text/csv') || ct.includes('octet')) return res.blob()
  return res.json().catch(() => null)
}

export const api = {
  get:  (path)        => req('GET',    path),
  post: (path, body)  => req('POST',   path, body),
  put:  (path, body)  => req('PUT',    path, body),
  del:  (path, body)  => req('DELETE', path, body),
  download: (path, filename) =>
    req('GET', path).then(blob => {
      const url = URL.createObjectURL(blob)
      Object.assign(document.createElement('a'), { href: url, download: filename }).click()
      URL.revokeObjectURL(url)
    }),
}
