import type { Comprobante } from "./comprobantes-reglas";
import { anulacionEnTramite } from "./facturacion-actividad";

// Lo que dibujan las tarjetas de Comprobantes (spike 2026-09-26, `docs/maquetas/comprobantes-conectado-2026-09/`).
// Pura y con prueba: el componente solo pinta. Un anulado o un liberado (`no_emitido`) no cuenta en ningún
// dibujo, igual que en las cifras de la tarjeta (`montosDelMes`).

const HORA_LIMA_MS = 5 * 3_600_000;

/** Qué se emitió, por tipo: la barra apilada de «Emitidos». */
export function cuantosPorTipo(comprobantes: Pick<Comprobante, "tipo" | "estado">[]): { boletas: number; facturas: number; notas: number } {
  const vivos = comprobantes.filter((c) => c.estado !== "no_emitido" && c.estado !== "anulado");
  return {
    boletas: vivos.filter((c) => c.tipo === "boleta").length,
    facturas: vivos.filter((c) => c.tipo === "factura").length,
    notas: vivos.filter((c) => c.tipo === "nota_credito").length,
  };
}

export type Tramo = { etiqueta: string; facturado: number; resto: number };

/** Cuánto se emitió en cada tramo (hora del día o día del mes, en hora de Lima), partido en dos: lo
 *  **facturado** (aceptado por SUNAT real, sin baja en trámite: lo mismo que suma «Monto facturado») y el
 *  **resto** (de prueba, sin enviar o por confirmar). Así la barra y la cifra de la tarjeta dicen lo mismo:
 *  la parte en tinta suma exactamente el monto facturado. La nota de crédito resta en su tramo. */
export function montosPorTramo(
  comprobantes: Pick<Comprobante, "tipo" | "estado" | "total" | "created_at" | "entorno_transmision" | "anulacion_solicitada_at">[],
  modo: "hora" | "dia",
  opciones: { desdeHora?: number; hastaHora?: number; diasDelMes?: number } = {}
): Tramo[] {
  const desde = opciones.desdeHora ?? 9;
  const hasta = opciones.hastaHora ?? 21;
  const tramos: Tramo[] =
    modo === "hora"
      ? Array.from({ length: hasta - desde + 1 }, (_, i) => ({ etiqueta: `${desde + i} h`, facturado: 0, resto: 0 }))
      : Array.from({ length: opciones.diasDelMes ?? 31 }, (_, i) => ({ etiqueta: String(i + 1), facturado: 0, resto: 0 }));
  for (const c of comprobantes) {
    if (c.estado === "no_emitido" || c.estado === "anulado") continue;
    const lima = new Date(Date.parse(c.created_at) - HORA_LIMA_MS);
    let i = modo === "hora" ? lima.getUTCHours() - desde : lima.getUTCDate() - 1;
    i = Math.min(Math.max(i, 0), tramos.length - 1);
    const monto = c.tipo === "nota_credito" ? -Number(c.total) : Number(c.total);
    const real = c.estado === "aceptado" && c.entorno_transmision === "produccion" && !anulacionEnTramite(c as Comprobante);
    if (real) tramos[i].facturado += monto;
    else tramos[i].resto += monto;
  }
  return tramos.map((t) => ({ ...t, facturado: Math.round(t.facturado * 100) / 100, resto: Math.round(t.resto * 100) / 100 }));
}

/** Días del mes (para el eje de «Este mes»). */
export function diasDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}
