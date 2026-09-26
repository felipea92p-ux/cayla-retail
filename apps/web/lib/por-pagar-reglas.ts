import { diasEntreFechas, diasHastaLima, hoyLima } from "./fechas-lima";

// Reglas puras de Por pagar (ADR-0111): a qué tramo de urgencia pertenece una deuda, cómo se
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

// ---------------------------------------------------------------------------
// La pantalla responde (spike 2026-09-19, mismo modelo que ADR-0128)
// Todo lo de abajo es puro: decide qué filas encienden una barra, cuánto de un plazo se consumió, hasta
// dónde alcanza la caja y qué conviene hacer con un comprobante. La pantalla solo lo dibuja.
// ---------------------------------------------------------------------------

type ConVence = { fechaVencimiento: string | null };

export type ClaveTramoVencimiento = "vencida" | "0_7" | "8_30" | "mas_30";

/**
 * Tramo de «Deuda por vencimiento» al que pertenece un comprobante. Es la MISMA regla que la función
 * `deuda_por_vencimiento()` de Postgres (vencida < hoy · 0–7 · 8–30 · más de 30; sin fecha cuenta como
 * «vence hoy»), para que apuntar a un tramo encienda exactamente las filas que suman esa cifra.
 */
export function tramoVencimientoDe(c: ConVence, ahora: Date = new Date()): ClaveTramoVencimiento {
  const d = c.fechaVencimiento ? diasHastaLima(c.fechaVencimiento, ahora) : 0;
  if (d < 0) return "vencida";
  if (d <= 7) return "0_7";
  return d <= 30 ? "8_30" : "mas_30";
}

/** Una cubeta de «Salidas de caja»: los bordes inclusivos que entrega `salidas_caja_30d()` (null = sin borde). */
export type CubetaCaja = { desde: string | null; hasta: string | null };

/**
 * ¿Cae este comprobante en esa semana de la caja? Igual que el `join` de `salidas_caja_30d()`:
 * un comprobante sin fecha de vencimiento cuenta como «vence hoy» (el caso más prudente para la caja).
 */
export function enCubetaCaja(c: ConVence, cubeta: CubetaCaja, ahora: Date = new Date()): boolean {
  const vence = c.fechaVencimiento ?? hoyLima(ahora);
  return (cubeta.desde === null || vence >= cubeta.desde) && (cubeta.hasta === null || vence <= cubeta.hasta);
}

/** Cuánto del plazo de crédito (emisión → vencimiento) ya se consumió hoy. `null` si no tiene vencimiento. */
export function plazoConsumido(
  c: { fechaEmision: string; fechaVencimiento: string | null },
  ahora: Date = new Date(),
): { usados: number; total: number; fraccion: number } | null {
  if (!c.fechaVencimiento) return null;
  const total = Math.max(0, diasEntreFechas(c.fechaEmision, c.fechaVencimiento));
  const usados = Math.max(0, diasEntreFechas(c.fechaEmision, hoyLima(ahora)));
  return { usados, total, fraccion: total > 0 ? Math.min(1, usados / total) : 1 };
}

/**
 * «¿Alcanza la caja?»: recorre las semanas en orden de urgencia y reparte lo que hay. `fracciones[i]` es
 * cuánto de la semana i queda cubierto (0–1). `ultimaCubierta` es la última semana con monto cubierta por
 * completo, `primeraFaltante` la primera que no (con `falta` en soles), `sobra` lo que queda si todo se cubre.
 * Las semanas en cero se saltan: no cuentan como cubiertas ni como faltantes.
 */
export function cubrirCaja(caja: number, montos: number[]): {
  fracciones: number[];
  ultimaCubierta: number | null;
  primeraFaltante: { indice: number; falta: number } | null;
  sobra: number;
} {
  let resto = Math.round(caja * 100);
  const fracciones: number[] = [];
  let ultimaCubierta: number | null = null;
  let primeraFaltante: { indice: number; falta: number } | null = null;
  for (let i = 0; i < montos.length; i++) {
    const c = Math.round(montos[i] * 100);
    if (c <= 0) {
      fracciones.push(0);
      continue;
    }
    if (resto >= c) {
      fracciones.push(1);
      resto -= c;
      if (primeraFaltante === null) ultimaCubierta = i;
    } else {
      fracciones.push(resto / c);
      if (primeraFaltante === null) primeraFaltante = { indice: i, falta: (c - resto) / 100 };
      resto = 0;
    }
  }
  return { fracciones, ultimaCubierta, primeraFaltante, sobra: primeraFaltante ? 0 : resto / 100 };
}

export type PasoDeComprobante = { tono: "rojo" | "ambar" | "verde" | "neutro"; fuerte: string; resto: string };

const plural = (n: number, s: string, p: string) => `${n.toLocaleString("es-PE")} ${n === 1 ? s : p}`;

/**
 * «¿Y ahora qué?» de un comprobante, para la vista rápida: la sugerencia de urgencia primero y, si aplica,
 * lo que conviene saber antes de pagar (nota de crédito que falta, saldo a favor). `otros` son los demás
 * comprobantes con saldo del mismo proveedor: la sugerencia de fondo es pagarlos juntos, una sola transferencia.
 */
export function pasosDeComprobante(
  c: { vencida: boolean; fechaVencimiento: string | null },
  otros: { saldo: number }[],
  ctx: { proveedor: string; saldoFavor: number; notaPendiente: number | null; formato: (n: number) => string },
  ahora: Date = new Date(),
): PasoDeComprobante[] {
  const pasos: PasoDeComprobante[] = [];
  const tramo = tramoDe(c, ahora);
  const d = c.fechaVencimiento ? diasHastaLima(c.fechaVencimiento, ahora) : null;
  const sumaOtros = Math.round(otros.reduce((a, o) => a + o.saldo, 0) * 100) / 100;
  const juntos = otros.length > 0 ? ` con ${ctx.proveedor} tienes ${plural(otros.length, "comprobante más", "comprobantes más")} (${ctx.formato(sumaOtros)})` : "";
  if (tramo === "vencidas") {
    const atras = d === null ? 0 : -d;
    pasos.push({
      tono: "rojo",
      fuerte: "Págalo primero:",
      resto: ` ${atras > 0 ? `venció hace ${plural(atras, "día", "días")}.` : "ya venció."}${juntos ? ` Y${juntos}: pagados juntos salen en una sola transferencia.` : ""}`,
    });
  } else if (tramo === "semana") {
    pasos.push({
      tono: "ambar",
      fuerte: `Vence ${d === 0 ? "hoy" : d === 1 ? "mañana" : `en ${d} días`}.`,
      resto: ` Prográmalo esta semana${otros.length > 0 ? `, junto con los otros ${plural(otros.length, "comprobante", "comprobantes")} de ${ctx.proveedor}` : ""}.`,
    });
  } else {
    pasos.push({ tono: "neutro", fuerte: "Sin apuro:", resto: " todavía le queda plazo. Puede esperar a la semana de su fecha." });
  }
  if (ctx.notaPendiente && ctx.notaPendiente > 0) {
    pasos.push({ tono: "ambar", fuerte: `Espera una nota de crédito de ${ctx.formato(ctx.notaPendiente)}`, resto: " del proveedor: no pagues ese monto de más." });
  }
  if (ctx.saldoFavor > 0) {
    pasos.push({ tono: "verde", fuerte: `Tienes ${ctx.formato(ctx.saldoFavor)} a favor`, resto: ` con ${ctx.proveedor}: se descuenta al pagar.` });
  }
  return pasos;
}

/** Un segmento de la barra de concentración: un proveedor (o «Otros», con `id: null`) y su parte de la deuda. */
export type SegmentoConcentracion = { id: string | null; nombre: string; monto: number; pct: number };

/** Los `n` proveedores que más se les debe (con saldo) y el resto junto en «Otros». Suma siempre 100 % de la deuda que se le pasa. */
export function concentracionPorProveedor(proveedores: { id: string; nombre: string; saldo: number }[], n = 3): SegmentoConcentracion[] {
  const con = proveedores.filter((p) => p.saldo > 0).sort((a, b) => b.saldo - a.saldo);
  const total = con.reduce((a, p) => a + p.saldo, 0);
  if (total <= 0) return [];
  const segs: SegmentoConcentracion[] = con.slice(0, n).map((p) => ({ id: p.id, nombre: p.nombre, monto: p.saldo, pct: (p.saldo / total) * 100 }));
  const resto = con.slice(n).reduce((a, p) => a + p.saldo, 0);
  if (resto > 0) segs.push({ id: null, nombre: "Otros", monto: resto, pct: (resto / total) * 100 });
  return segs;
}

const sinTildes = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * Dónde cae la búsqueda dentro de un texto, sin distinguir mayúsculas ni tildes («rimac» encuentra «Rímac»):
 * devuelve las tres partes para resaltar la del medio, o `null` si no coincide. Solo funciona bien con texto en
 * forma compuesta (NFC), que es como llegan los nombres de la base: cada letra con tilde cuenta una posición.
 */
export function partirCoincidencia(texto: string, q: string): [string, string, string] | null {
  const buscado = sinTildes(q.trim());
  if (!buscado) return null;
  const i = sinTildes(texto).indexOf(buscado);
  if (i < 0) return null;
  return [texto.slice(0, i), texto.slice(i, i + buscado.length), texto.slice(i + buscado.length)];
}
