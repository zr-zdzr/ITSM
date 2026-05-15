import React, { useRef } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { Download, Printer } from 'lucide-react'
import Modal from './Modal'

export default function QRModal({ open, onClose, value, label, details = [] }) {
  const wrapRef = useRef(null)

  function download() {
    const canvas = wrapRef.current?.querySelector('canvas')
    if (!canvas) return
    const link = document.createElement('a')
    link.href = canvas.toDataURL('image/png')
    link.download = `${label || 'qr-code'}.png`
    link.click()
  }

  function print() {
    const canvas = wrapRef.current?.querySelector('canvas')
    if (!canvas) return
    const img = canvas.toDataURL('image/png')
    const w = window.open('', '_blank', 'width=400,height=500')
    w.document.write(`<!DOCTYPE html>
<html><head><title>${label || 'QR Code'}</title>
<style>
  body { font-family: monospace; text-align: center; padding: 24px; }
  img { width: 180px; height: 180px; display: block; margin: 0 auto 12px; }
  .label { font-size: 15px; font-weight: bold; margin-bottom: 6px; }
  .detail { font-size: 11px; color: #555; margin: 2px 0; }
</style></head>
<body>
  <img src="${img}" />
  <div class="label">${label || ''}</div>
  ${details.map(d => `<div class="detail">${d}</div>`).join('')}
  <script>window.onload = () => { window.print(); window.close() }<\/script>
</body></html>`)
    w.document.close()
  }

  return (
    <Modal open={open} onClose={onClose} title="QR Code" size="sm">
      <div className="flex flex-col items-center gap-5 py-2">
        {/* QR code on white background */}
        <div ref={wrapRef} className="p-4 rounded-xl bg-white shadow-lg">
          <QRCodeCanvas
            value={value || ' '}
            size={220}
            level="M"
            includeMargin={false}
            bgColor="#ffffff"
            fgColor="#000000"
          />
        </div>

        {/* Human-readable info */}
        <div className="text-center">
          <p className="text-sm font-semibold text-zinc-100 mb-1">{label}</p>
          {details.map((d, i) => (
            <p key={i} className="text-xs text-zinc-500">{d}</p>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button className="btn-secondary text-xs" onClick={download}>
            <Download size={13} /> Download PNG
          </button>
          <button className="btn-secondary text-xs" onClick={print}>
            <Printer size={13} /> Print
          </button>
        </div>
      </div>

      <div className="flex justify-end mt-4 pt-4 border-t border-zinc-800">
        <button className="btn-secondary" onClick={onClose}>Close</button>
      </div>
    </Modal>
  )
}
