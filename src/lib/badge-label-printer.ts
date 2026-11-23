// Druk na Niimbot B1 przez Web Bluetooth (Chrome/Edge, HTTPS). Sterownik ustawia window.Niimbot
// i trzyma połączenie, więc okno wyboru drukarki pojawia się tylko przy pierwszym wydruku.
import { B1_LABEL_SIZE, B1_PRINTER_MODEL } from "@/lib/badge-label-core";

type NiimbotDriver = {
  printImage: (url: string, opts: { model: typeof B1_PRINTER_MODEL; size: typeof B1_LABEL_SIZE; copies: number }) => Promise<void>;
};

export const isBluetoothPrintingSupported = () => typeof navigator !== "undefined" && "bluetooth" in navigator;

export async function loadPrinterDriver(): Promise<NiimbotDriver> {
  await import("niimbot-web-bluetooth");
  return (window as unknown as { Niimbot: NiimbotDriver }).Niimbot;
}

export async function printBadgeLabel(canvas: HTMLCanvasElement): Promise<void> {
  const driver = await loadPrinterDriver();
  await driver.printImage(canvas.toDataURL("image/png"), { model: B1_PRINTER_MODEL, size: B1_LABEL_SIZE, copies: 1 });
}
