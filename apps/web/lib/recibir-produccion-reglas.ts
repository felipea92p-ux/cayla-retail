// Recibir insumos contra un comprobante de Producción (ADR-0133, F4d). Puro: sin Supabase ni React.
//
// Quien recibe es quien trabaja en el Taller y NO ve dinero: todo lo de acá son cantidades. Refleja las reglas de
// `recibir_comprobante_produccion` (20260921140000) para avisar ANTES de guardar; la base sigue siendo el candado.

import { cantidadTexto, type UnidadInsumo } from "./insumos-reglas";

export type LineaPorRecibir = {
  comprobanteId: string;
  proveedor: string;
  tipo: string;
  serie: string;
  numero: string;
  fechaEmision: string;
  itemId: string;
  insumoId: string;
  insumo: string;
  unidad: UnidadInsumo;
  facturado: number;
  recibido: number;
  cerrado: number;
  pendiente: number;
};

export type EstadoRecepcion = "pendiente" | "parcial" | "completa";

export type ComprobantePorRecibir = {
  comprobanteId: string;
  proveedor: string;
  tipo: string;
  documento: string;
  fechaEmision: string;
  lineas: LineaPorRecibir[];
  estado: EstadoRecepcion;
  /** Líneas con algo pendiente. */
  pendientes: LineaPorRecibir[];
};

/** Nada llegó → pendiente; algo llegó o se cerró pero falta → parcial; ya no falta nada → completa. */
export function estadoRecepcion(lineas: Pick<LineaPorRecibir, "recibido" | "cerrado" | "pendiente">[]): EstadoRecepcion {
  if (lineas.every((l) => l.pendiente <= 0)) return "completa";
  return lineas.some((l) => l.recibido > 0 || l.cerrado > 0) ? "parcial" : "pendiente";
}

/** Agrupa las líneas por comprobante, del más antiguo al más nuevo (lo que lleva más tiempo esperando primero). */
export function agruparPorComprobante(lineas: LineaPorRecibir[]): ComprobantePorRecibir[] {
  const mapa = new Map<string, LineaPorRecibir[]>();
  for (const l of lineas) mapa.set(l.comprobanteId, [...(mapa.get(l.comprobanteId) ?? []), l]);
  return [...mapa.values()]
    .map((ls) => ({
      comprobanteId: ls[0].comprobanteId,
      proveedor: ls[0].proveedor,
      tipo: ls[0].tipo,
      documento: `${ls[0].serie}-${ls[0].numero}`,
      fechaEmision: ls[0].fechaEmision,
      lineas: ls,
      estado: estadoRecepcion(ls),
      pendientes: ls.filter((l) => l.pendiente > 0),
    }))
    .sort((a, b) => a.fechaEmision.localeCompare(b.fechaEmision) || a.documento.localeCompare(b.documento));
}

export type MotivoCierre = "faltante" | "devolucion" | "otro";

export const MOTIVOS_CIERRE: { valor: MotivoCierre; etiqueta: string }[] = [
  { valor: "faltante", etiqueta: "Faltó mercadería" },
  { valor: "devolucion", etiqueta: "Se devolvió al proveedor" },
  { valor: "otro", etiqueta: "Otro motivo" },
];

/** Lo que se escribe por cada línea pendiente. `llego` vacío = todo lo pendiente (lo más común). */
export type EntradaLinea = { itemId: string; llego: string; noLlegara: boolean; motivo: MotivoCierre; codigoLote: string };

export function entradaInicial(l: Pick<LineaPorRecibir, "itemId">): EntradaLinea {
  return { itemId: l.itemId, llego: "", noLlegara: false, motivo: "faltante", codigoLote: "" };
}

const num = (s: string) => Number(s.replace(",", "."));

/** Cuánto llegó de verdad: lo escrito, o todo lo pendiente si no se escribió nada. */
export function cantidadLlegada(l: Pick<LineaPorRecibir, "pendiente">, e: EntradaLinea): number {
  return e.llego.trim() === "" ? l.pendiente : num(e.llego);
}

export type Armado = {
  lineas: { item_id: string; cantidad: number; codigo_lote?: string }[];
  cierres: { item_id: string; cantidad: number; motivo: MotivoCierre }[];
  /** Lotes que se van a abrir (uno por línea que llegó). */
  lotes: number;
  /** El primer problema, dicho en claro; `null` si se puede guardar. */
  error: string | null;
};

/** Convierte lo escrito en lo que recibe la base. «No llegará» cierra lo que falta después de lo que llegó. */
export function armarRecepcion(lineas: LineaPorRecibir[], entradas: EntradaLinea[]): Armado {
  const out: Armado = { lineas: [], cierres: [], lotes: 0, error: null };
  for (const l of lineas) {
    const e = entradas.find((x) => x.itemId === l.itemId) ?? entradaInicial(l);
    const q = cantidadLlegada(l, e);
    if (!(q >= 0) || Number.isNaN(q)) {
      out.error ??= `${l.insumo}: la cantidad no es un número válido.`;
      continue;
    }
    if (Math.abs(q * 1000 - Math.round(q * 1000)) > 1e-6) out.error ??= `${l.insumo}: la cantidad admite como máximo 3 decimales.`;
    if (q > l.pendiente + 1e-9) {
      out.error ??= `${l.insumo}: solo faltan ${cantidadTexto(l.pendiente, l.unidad)} por recibir y escribiste ${cantidadTexto(q, l.unidad)}.`;
      continue;
    }
    if (q > 0) {
      out.lineas.push({ item_id: l.itemId, cantidad: q, ...(e.codigoLote.trim() ? { codigo_lote: e.codigoLote.trim() } : {}) });
      out.lotes++;
    }
    const resto = Math.round((l.pendiente - q) * 1000) / 1000;
    if (e.noLlegara && resto > 0) out.cierres.push({ item_id: l.itemId, cantidad: resto, motivo: e.motivo });
  }
  if (!out.error && out.lineas.length === 0 && out.cierres.length === 0) out.error = "Indica qué llegó o marca lo que no va a llegar.";
  return out;
}

export type ResumenRecepcion = { porRecibir: number; lineasPendientes: number; parciales: number };

export function resumenRecepcion(comprobantes: ComprobantePorRecibir[]): ResumenRecepcion {
  const abiertos = comprobantes.filter((c) => c.estado !== "completa");
  return { porRecibir: abiertos.length, lineasPendientes: abiertos.reduce((s, c) => s + c.pendientes.length, 0), parciales: abiertos.filter((c) => c.estado === "parcial").length };
}
