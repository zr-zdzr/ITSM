import React, { useRef } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Download, Printer } from "lucide-react";
import Modal from "./Modal";

const B_PATH = `M3.37747 26.8172C1.15743 26.8074 0.0120598 25.7003 0.00829301 23.5468C-0.00246924 16.9682 -0.00275658 10.3892 0.00743168 3.81006C0.00958413 1.64593 1.08839 0.532474 3.33835 0.492737C6.27736 0.442154 9.21992 0.436418 12.1589 0.496023C15.5134 0.563815 18.0758 2.04069 19.6095 4.92205C21.1553 7.82532 20.7954 10.6544 18.8491 13.3058C18.7748 13.4091 18.72 13.5253 18.6364 13.6716C20.5759 16.1993 21.2042 18.9714 19.8525 21.9057C18.4025 25.0565 15.8059 26.7461 12.1993 26.8097C10.9613 26.8319 9.72273 26.8392 8.48459 26.8392C6.78194 26.8391 5.0799 26.8251 3.37747 26.8172Z M6.03607 16.6309V21.0107C8.31713 21.0107 10.4474 21.0756 12.5716 20.9861C13.7228 20.9366 14.4104 20.19 14.5288 19.0554C14.6533 17.8507 14.0125 16.75 12.8187 16.6727C11.8971 16.6129 10.9725 16.5953 10.0432 16.5953C8.71926 16.5952 7.38565 16.6309 6.03607 16.6309Z M6.04355 6.34526V10.7125C8.33628 10.7125 10.505 10.7729 12.6682 10.689C13.8039 10.6449 14.525 9.69168 14.5396 8.55137C14.553 7.40501 13.8629 6.4227 12.7309 6.37316C11.8182 6.33363 10.9039 6.32206 9.98501 6.32206C8.68417 6.32206 7.37382 6.34526 6.04355 6.34526Z`;

const LOGO_SVG = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21.5 27.3" width="38" height="38"><rect width="21.5" height="27.3" fill="white" rx="3"/><path fill="#00AA2F" fill-rule="evenodd" d="${B_PATH}"/></svg>`,
);
const LOGO_SRC = `data:image/svg+xml,${LOGO_SVG}`;

function buildComposite(qrCanvas, label) {
  const pad = 12;
  const textH = label ? 22 : 0;
  const c = document.createElement("canvas");
  c.width = qrCanvas.width + pad * 2;
  c.height = qrCanvas.height + pad * 2 + textH;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(qrCanvas, pad, pad);
  if (label) {
    const fontSize = Math.max(12, Math.floor(c.width * 0.075));
    ctx.fillStyle = "#000000";
    ctx.font = `bold ${fontSize}px Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, c.width / 2, qrCanvas.height + pad + textH / 2);
  }
  return c;
}

export default function QRModal({ open, onClose, value, label, details = [] }) {
  const wrapRef = useRef(null);

  function getQRCanvas() {
    return wrapRef.current?.querySelector("canvas") || null;
  }

  function download() {
    const qr = getQRCanvas();
    if (!qr) return;
    const composite = buildComposite(qr, label);
    const link = document.createElement("a");
    link.href = composite.toDataURL("image/png");
    link.download = `${label || "qr-code"}.png`;
    link.click();
  }

  function print() {
    const qr = getQRCanvas();
    if (!qr) return;
    const composite = buildComposite(qr, label);
    const img = composite.toDataURL("image/png");
    const w = window.open("", "_blank", "width=400,height=500");
    w.document.write(`<!DOCTYPE html>
<html><head><title>${label || "QR Code"}</title>
<style>
  @page { size: 2.2cm 2.8cm; margin: 1mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; text-align: center; margin: 0; padding: 1mm; }
  img { width: 1cm; height: auto; display: block; margin: 0 auto 0.8mm; }
  .detail { font-size: 4.5pt; color: #444; margin: 0.3mm 0; line-height: 1.2; }
</style></head>
<body>
  <img src="${img}" />
  ${details.map((d) => `<div class="detail">${d}</div>`).join("")}
  <script>window.onload = () => { window.print(); window.close() }<\/script>
</body></html>`);
    w.document.close();
  }

  return (
    <Modal open={open} onClose={onClose} title="QR Code" size="sm">
      <div className="d-flex flex-column align-items-center gap-4 py-2">
        <div
          ref={wrapRef}
          className="p-3 rounded-3 bg-white shadow d-flex flex-column align-items-center"
        >
          <QRCodeCanvas
            value={value || " "}
            size={180}
            level="H"
            includeMargin={false}
            bgColor="#ffffff"
            fgColor="#000000"
            imageSettings={{
              src: LOGO_SRC,
              height: 38,
              width: 32,
              excavate: true,
            }}
          />
          {label && (
            <p
              className="mt-2 mb-0 fw-bold text-black text-center lh-sm"
              style={{ fontSize: "12px", letterSpacing: "0.05em" }}
            >
              {label}
            </p>
          )}
        </div>

        <div className="text-center">
          {details.map((d, i) => (
            <p key={i} className="small text-secondary mb-1">
              {d}
            </p>
          ))}
        </div>

        <div className="d-flex gap-2">
          <button
            className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
            onClick={download}
          >
            <Download size={13} /> Download PNG
          </button>
          <button
            className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
            onClick={print}
          >
            <Printer size={13} /> Print
          </button>
        </div>
      </div>

      <div className="d-flex justify-content-end mt-3 pt-3 border-top">
        <button className="btn btn-secondary btn-sm" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
