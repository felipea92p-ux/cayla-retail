// Reglas puras del comprobante IMPRESO de una venta (ticket de 80 mm de la térmica).
// Sin DOM, sin React, sin `createClient`: lo que la pantalla y la impresora dibujan sale de
// acá, así se prueba sin navegador ni impresora.
//
// De dónde salen los números: de la MISMA venta que la cajera acaba de cobrar (ítems, descuentos
// y pagos del ticket) más lo que la base asignó (serie, número, fecha). No se recalcula nada
// aparte: `subtotal + IGV = total` al centavo con la misma cuenta que emite el comprobante
// (`desgloseIgv`), y la suma de los importes de las líneas ES el total.

import type { MetodoPago } from "@cayla-retail/shared";
import { desgloseIgv, vueltoDe, type PagoAplicado } from "./vender-reglas";

/** Solo lo que Vender emite hoy. Una nota de venta (sin valor tributario) no existe todavía
 *  como opción en la pantalla — ver ADR-0114. */
// Lo que se imprime al cobrar. La nota de venta (ADR-0164) no es un comprobante de pago: mismo papel, pero sin
// IGV desglosado, sin QR de SUNAT y con la leyenda «Documento sin valor tributario» (`desglosaIgv`).
export type TipoReciboFiscal = "boleta" | "factura" | "nota_venta";

/** Si el papel separa el IGV y lleva lo que SUNAT pide (QR, «representación impresa»). La nota de venta no. */
export const desglosaIgv = (tipo: TipoReciboFiscal): boolean => tipo !== "nota_venta";
export type TipoDocCliente = "dni" | "ruc" | "sin_documento";

export type LineaRecibo = {
  cantidad: number;
  descripcion: string;
  codigo: string | null;
  /** «M · Negro»: talla y color, solo para el A4 (el ticket no lo imprime). Ausente si no se sabe. */
  detalle?: string;
  precioUnitario: number;
  descuentoUnitario: number;
  /** cantidad × (precio − descuento), a 2 decimales. */
  importe: number;
};

export type PagoRecibo = { metodo: MetodoPago; monto: number; recibido: number | null; vuelto: number };

export type ReciboVenta = {
  tipo: TipoReciboFiscal;
  serie: string;
  numero: number;
  /** ISO de `comprobantes.created_at`. */
  emitidoEn: string;
  /** La tienda donde se vendió («Tienda Lima»). */
  sede: string;
  cliente: { tipoDoc: TipoDocCliente; numDoc: string | null; nombre: string | null };
  lineas: LineaRecibo[];
  subtotal: number;
  igv: number;
  total: number;
  pagos: PagoRecibo[];
  vueltoTotal: number;
  /** Quién atendió a la clienta (nombre corto), si la caja lo sabe. Ausente/`null` en las ventas anteriores o sin elección. */
  atendio?: string | null;
};

const redondear2 = (n: number) => Math.round(n * 100) / 100;

/** Cómo se llama cada medio de pago frente a la clienta (en pantalla y en el papel). */
export const NOMBRE_METODO: Record<MetodoPago, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  yape: "Yape",
  plin: "Plin",
  transferencia: "Transferencia",
};

/** `B001-000002`: el mismo formato de 6 dígitos que ya muestra el resto de la app. */
export function textoNumeroRecibo(r: { serie: string; numero: number }): string {
  return `${r.serie}-${String(r.numero).padStart(6, "0")}`;
}

export const TITULO_DOCUMENTO: Record<TipoReciboFiscal, string> = {
  boleta: "BOLETA DE VENTA ELECTRÓNICA",
  factura: "FACTURA ELECTRÓNICA",
  nota_venta: "NOTA DE VENTA",
};

export function armarRecibo(entrada: {
  comprobante: { tipo: TipoReciboFiscal; serie: string; numero: number; created_at: string };
  sede: string;
  cliente: ReciboVenta["cliente"];
  lineas: { cantidad: number; referencia: string; codigo: string | null; precioUnitario: number; descuentoUnitario: number; detalle?: string }[];
  pagos: readonly PagoAplicado[];
  tasaIgv: number;
  /** Nombre corto de quien atendió; ver `atendioCorto` en `vender-reglas.ts`. */
  atendio?: string | null;
}): ReciboVenta {
  const lineas: LineaRecibo[] = entrada.lineas.map((l) => ({
    cantidad: l.cantidad,
    descripcion: l.referencia,
    codigo: l.codigo,
    ...(l.detalle ? { detalle: l.detalle } : {}),
    precioUnitario: l.precioUnitario,
    descuentoUnitario: l.descuentoUnitario,
    importe: redondear2(l.cantidad * (l.precioUnitario - l.descuentoUnitario)),
  }));
  const total = redondear2(lineas.reduce((acc, l) => acc + l.importe, 0));
  // 1A (Felipe, 2026-09-22): la clienta paga lo mismo; la nota de venta solo no separa el IGV.
  const { subtotal, igv } = desglosaIgv(entrada.comprobante.tipo) ? desgloseIgv(total, entrada.tasaIgv) : { subtotal: total, igv: 0 };
  // Solo los medios que cubrieron algo: una fila en 0 no se cobró por ahí.
  const pagos: PagoRecibo[] = entrada.pagos
    .filter((p) => p.monto > 0)
    .map((p) => ({ metodo: p.metodo, monto: p.monto, recibido: p.recibido ?? null, vuelto: vueltoDe(p) }));
  return {
    tipo: entrada.comprobante.tipo,
    serie: entrada.comprobante.serie,
    numero: entrada.comprobante.numero,
    emitidoEn: entrada.comprobante.created_at,
    sede: entrada.sede,
    cliente: entrada.cliente,
    lineas,
    subtotal,
    igv,
    total,
    pagos,
    vueltoTotal: redondear2(pagos.reduce((acc, p) => acc + p.vuelto, 0)),
    atendio: entrada.atendio ?? null,
  };
}

/** Fecha y hora en Lima, sin importar la zona del equipo ni la del servidor. */
export function fechaHoraLima(iso: string): { fecha: string; hora: string; fechaIso: string } {
  const d = new Date(iso);
  const zona = "America/Lima";
  return {
    fecha: d.toLocaleDateString("es-PE", { timeZone: zona, day: "2-digit", month: "2-digit", year: "numeric" }),
    hora: d.toLocaleTimeString("es-PE", { timeZone: zona, hour: "2-digit", minute: "2-digit", hour12: false }),
    fechaIso: d.toLocaleDateString("en-CA", { timeZone: zona }),
  };
}

/**
 * Texto del QR del comprobante, en el orden que SUNAT pide para su representación impresa:
 * RUC emisor | tipo (01 factura, 03 boleta) | serie | correlativo | IGV | total | fecha |
 * tipo de documento del cliente (6 RUC, 1 DNI, «-» sin documento) | número | (cierra con «|»).
 * Con esto quien escanee puede cotejar el documento aunque nuestro sistema no responda.
 */
export function textoQrSunat(r: ReciboVenta, rucEmisor: string): string {
  const cli = r.cliente;
  const tieneDoc = cli.tipoDoc !== "sin_documento" && !!cli.numDoc;
  return [
    rucEmisor,
    r.tipo === "factura" ? "01" : "03",
    r.serie,
    String(r.numero).padStart(8, "0"),
    r.igv.toFixed(2),
    r.total.toFixed(2),
    fechaHoraLima(r.emitidoEn).fechaIso,
    tieneDoc ? (cli.tipoDoc === "ruc" ? "6" : "1") : "-",
    tieneDoc ? cli.numDoc : "-",
    "",
  ].join("|");
}

// ---- «SON: … CON 81/100 SOLES» ------------------------------------------------------------

const UNIDADES = [
  "", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE", "DIEZ", "ONCE", "DOCE", "TRECE",
  "CATORCE", "QUINCE", "DIECISEIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE", "VEINTE", "VEINTIUNO", "VEINTIDOS",
  "VEINTITRES", "VEINTICUATRO", "VEINTICINCO", "VEINTISEIS", "VEINTISIETE", "VEINTIOCHO", "VEINTINUEVE",
];
const DECENAS = ["", "", "", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
const CENTENAS = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"];

/** 1..999 */
function menorDeMil(n: number): string {
  if (n === 100) return "CIEN";
  const c = Math.floor(n / 100);
  const r = n % 100;
  const partes = [CENTENAS[c]];
  if (r > 0) {
    if (r < 30) partes.push(UNIDADES[r]);
    else {
      const d = Math.floor(r / 10);
      const u = r % 10;
      partes.push(u ? `${DECENAS[d]} Y ${UNIDADES[u]}` : DECENAS[d]);
    }
  }
  return partes.filter(Boolean).join(" ");
}

/** 0..999 999 */
function enLetras(n: number): string {
  if (n === 0) return "CERO";
  const miles = Math.floor(n / 1000);
  const resto = n % 1000;
  const partes: string[] = [];
  if (miles > 0) partes.push(miles === 1 ? "MIL" : `${menorDeMil(miles).replace(/UNO$/, "UN")} MIL`);
  if (resto > 0) partes.push(menorDeMil(resto));
  return partes.join(" ");
}

/** «DOSCIENTOS TREINTA Y NUEVE CON 81/100 SOLES». Sobre un millón imprime las cifras en
 *  número: una venta de tienda de ropa no llega ahí y no vale la pena más tabla. */
export function montoEnLetras(monto: number): string {
  const centavos = Math.round(monto * 100);
  const soles = Math.floor(centavos / 100);
  const resto = String(centavos % 100).padStart(2, "0");
  return `${soles < 1_000_000 ? enLetras(soles) : String(soles)} CON ${resto}/100 SOLES`;
}
