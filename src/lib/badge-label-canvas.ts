// Rysowanie etykiety identyfikatora w przeglądarce. Wynik jest już czarno-biały (1 bit), więc
// podgląd pokazuje dokładnie to, co wydrukuje termiczna drukarka.
import QRCode from "qrcode";
import { B1_LABEL_SIZE, fitText, type BadgeLabelData } from "@/lib/badge-label-core";

const MARGIN = 12;
const QR_BOX = 136;
const QR_GAP = 10;
const FONT = "Arial, Helvetica, sans-serif";

export function drawBadgeLabel(canvas: HTMLCanvasElement, label: BadgeLabelData) {
  const { w_px: w, h_px: h } = B1_LABEL_SIZE;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#000";
  ctx.textBaseline = "top";

  // QR: całkowita wielokrotność modułu — bez wygładzania, czytelny po wydruku.
  const qr = QRCode.create(label.qrUrl, { errorCorrectionLevel: "M" });
  const count = qr.modules.size;
  const scale = Math.floor(QR_BOX / count);
  const qrSize = count * scale;
  const qrX = w - MARGIN - qrSize;
  const qrY = Math.round((h - qrSize) / 2);
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.modules.get(row, col)) ctx.fillRect(qrX + col * scale, qrY + row * scale, scale, scale);
    }
  }

  const maxWidth = qrX - QR_GAP - MARGIN;
  const measure = (weight: string) => (text: string, size: number) => {
    ctx.font = `${weight} ${size}px ${FONT}`;
    return ctx.measureText(text).width;
  };
  const write = (weight: string, size: number, lines: string[], top: number) => {
    ctx.font = `${weight} ${size}px ${FONT}`;
    const lineHeight = Math.round(size * 1.15);
    lines.forEach((line, i) => ctx.fillText(line, MARGIN, top + i * lineHeight));
    return top + lines.length * lineHeight;
  };

  const event = fitText(label.eventName, { maxWidth, maxLines: 1, sizes: [18, 16] }, measure("normal"));
  const eventTop = h - MARGIN - Math.round(event.size * 1.15);
  write("normal", event.size, event.lines, eventTop);

  const name = fitText(label.name, { maxWidth, maxLines: 3, sizes: [38, 34, 30, 26, 22, 20, 18] }, measure("bold"));
  let y = write("bold", name.size, name.lines, MARGIN);
  if (label.company) {
    const company = fitText(label.company, { maxWidth, maxLines: 2, sizes: [20, 18] }, measure("normal"));
    const lines = company.lines.slice(0, Math.max(1, Math.floor((eventTop - y - 6) / Math.round(company.size * 1.15))));
    y += 6;
    if (y + Math.round(company.size * 1.15) <= eventTop) write("normal", company.size, lines, y);
  }

  // Ten sam próg, którego używa sterownik drukarki.
  const image = ctx.getImageData(0, 0, w, h);
  const px = image.data;
  for (let i = 0; i < px.length; i += 4) {
    const value = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2] < 128 ? 0 : 255;
    px[i] = px[i + 1] = px[i + 2] = value;
    px[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
}
