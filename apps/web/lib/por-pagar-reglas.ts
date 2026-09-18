import { diasHastaLima } from "./fechas-lima";

// Reglas puras de Por pagar (ADR-0106): a qué tramo de urgencia pertenece una deuda, cómo se
// rotula su vencimiento y cómo se reparte UN pago entre varios comprobantes. Sin I/O: se
// prueba sin base ni navegador. Las fechas son de Lima (`fechas-lima`), nunca el reloj del
// servidor: entre las 19:00 y la medianoche de Lima el servidor ya está en «mañana».

export type ClaveTramo = "vencidas" | "semana" | "despues";

export const TITULO_TRAMO: Record<ClaveTramo, string> = {
  vencidas: "Vencidas",
  semana: "Vencen esta semana",
  despues: "Más adelante",
};

/**
 * Tramo de urgencia de un comprobante con saldo. `vencida` es lo que dice la base (también con
 * el día de Lima) y manda; la fecha decide el resto: hasta 7 días desde hoy = «esta semana».
 */
export function tramoDe(c: { vencida: boolean; fechaVencimiento: string | null }, ahora: Date = new Date()): ClaveTramo {
  if (c.vencida) return "vencidas";
  if (!c.fechaVencimiento) return "despues";
  const d = diasHastaLima(c.fechaVencimiento, ahora);
  if (d < 0) return "vencidas";
  return d <= 7 ? "semana" : "despues";
}

/** «Venció hace 14 días» / «Vence hoy» / «Vence mañana» / «Vence en 21 días»: lo relativo se lee de un vistazo. */
export function etiquetaVence(iso: string, ahora: Date = new Date()): string {
  const d = diasHastaLima(iso, ahora);
  if (d < 0) {
    const atras = -d;
    if (atras === 1) return "Venció ayer";
    if (atras < 30) return `Venció hace ${atras} días`;
    const meses = Math.round(atras / 30);
    return `Venció hace ${meses} ${meses === 1 ? "mes" : "meses"}`;
  }
  if (d === 0) return "Vence hoy";
  if (d === 1) return "Vence mañana";
  return `Vence en ${d} días`;
}

// ---------------------------------------------------------------------------
// Pago por lote (D3)
// ---------------------------------------------------------------------------

/** Texto de un input de monto → soles con 2 decimales; `NaN` si no es un número válido o es negativo. */
export function parseMonto(texto: string): number {
  const limpio = texto.trim().replace(",", ".");
  if (limpio === "") return 0;
  const n = Number(limpio);
  if (!Number.isFinite(n) || n < 0) return Number.NaN;
  return Math.round(n * 100) / 100;
}

type Deuda = { id: string; saldo: number; fechaVencimiento: string | null; fechaEmision: string };

/**
 * Reparte UN pago entre comprobantes: primero la más vencida (empate: la más antigua por
 * emisión), sin pasar del saldo de ninguna. Trabaja en céntimos enteros para que la suma cuadre
 * exactamente con el total. Si el total supera la deuda, cada comprobante queda en su saldo.
 */
export function repartirPago(total: number, deudas: Deuda[]): Record<string, number> {
  let resto = Math.round(total * 100);
  const orden = [...deudas].sort((a, b) => {
    const va = a.fechaVencimiento ?? "9999-12-31";
    const vb = b.fechaVencimiento ?? "9999-12-31";
    return va.localeCompare(vb) || a.fechaEmision.localeCompare(b.fechaEmision) || a.id.localeCompare(b.id);
  });
  const reparto: Record<string, number> = {};
  for (const d of orden) {
    const aplicado = Math.max(0, Math.min(Math.round(d.saldo * 100), resto));
    reparto[d.id] = aplicado / 100;
    resto -= aplicado;
  }
  return reparto;
}

/** «Vencido S/ 4,720.00 + vence esta semana S/ 3,186.00»: de dónde sale el total de lo seleccionado. */
export function detalleSeleccion(
  filas: { vencida: boolean; fechaVencimiento: string | null; saldo: number }[],
  formato: (n: number) => string,
  ahora: Date = new Date(),
): string {
  const suma: Record<ClaveTramo, number> = { vencidas: 0, semana: 0, despues: 0 };
  for (const f of filas) suma[tramoDe(f, ahora)] += f.saldo;
  const partes: string[] = [];
  if (suma.vencidas > 0) partes.push(`vencido ${formato(suma.vencidas)}`);
  if (suma.semana > 0) partes.push(`vence esta semana ${formato(suma.semana)}`);
  if (suma.despues > 0) partes.push(`más adelante ${formato(suma.despues)}`);
  const texto = partes.join(" + ");
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
