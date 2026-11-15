import type { EmpresasAqui } from "./empresas-de-sede-reglas";
import { soles } from "./flujo-caja-reglas";
import type { PagoMes } from "./reportes-ventas-reglas";

// Ventas ▸ Reportes ▸ el filtro «Empresa» (CAYLA / CLAURE), solo donde conviven dos (hoy, Tienda Lima). Lógica pura, sin React ni Supabase; la lectura de
// las empresas de una tienda vive en `lib/empresas-de-sede.ts` y el filtro en la base, en `p_empresa` de las cuatro lecturas (20261114215000, ADR-0665).
//
// PROMETE: (1) el filtro solo se ofrece donde operan dos empresas; con una sola, o sin saber cuáles (la base no respondió), no se dibuja y el reporte sale
// como siempre; (2) la URL nunca elige una empresa que no se ofrece: `?emp=claure` en Trujillo, o con «todas las tiendas», se ignora y se lee todo, así que
// una URL pegada no estrecha lo que se ve ni hace que la base rechace la lectura (22023); (3) la clave que viaja por la URL es la de la empresa
// (`cayla`, `claure`), no un uuid: se puede leer y compartir.
// ASUME: que la base reparte cada línea de venta entre las empresas con la regla de Caja e Historial (ADR-0542), y cada pago por lo cobrado de cada una
// (`fn_reporte_ventas_pagos`, 20261115013000); aquí no se calcula nada de dinero: solo se lee y se dice.

/** Una empresa que se puede elegir en un reporte: su id (lo que recibe la base), su clave (lo que va en la URL) y su nombre (lo que se lee). */
export type EmpresaDeReporte = { id: string; clave: string; nombre: string };

const CLAVE = /^[a-z0-9_-]{1,24}$/;

/** Las empresas entre las que se puede elegir: solo si en esa tienda operan dos o más; si no, `null` (el filtro no se dibuja). */
export function empresasParaElegir(empresas: EmpresasAqui): EmpresaDeReporte[] | null {
  return empresas && empresas.length > 1 ? empresas.map((e) => ({ id: e.id, clave: e.clave, nombre: e.nombre })) : null;
}

/** La forma del `?emp=` de la URL: una clave corta en minúsculas; cualquier otra cosa (vacío, una lista rara, un texto largo) es «ninguna». Aún no dice si se ofrece. */
export function claveDeEmpresaEnUrl(v: string | string[] | undefined | null): string | null {
  const t = (Array.isArray(v) ? v[0] : v)?.trim().toLowerCase();
  return t && CLAVE.test(t) ? t : null;
}

/** El `?emp=` de la URL: solo vale si es una de las que se ofrecen. Cualquier otra cosa (una clave que no existe, una lista, vacío) es «todas». */
export function empresaDeUrl(v: string | string[] | undefined | null, ofrecidas: readonly EmpresaDeReporte[] | null): EmpresaDeReporte | null {
  const clave = claveDeEmpresaEnUrl(v);
  if (!ofrecidas || !clave) return null;
  return ofrecidas.find((e) => e.clave === clave) ?? null;
}

/** De qué se habla en un archivo o en un rótulo: «Tienda Lima · CLAURE». Sin empresa, la tienda sola. */
export const alcanceConEmpresa = (sede: string, e: Pick<EmpresaDeReporte, "nombre"> | null | undefined): string => (e ? `${sede} · ${e.nombre}` : sede);

/* ====================================================================
   «Cómo se pagó» con una empresa elegida (`fn_reporte_ventas_pagos`, ADR-0665 act. 2026-11-15). La base reparte cada pago entre las empresas de las
   líneas de su venta, por lo cobrado de cada una: es exacto en la venta de una sola empresa y en la mixta pagada con un solo medio; en la mixta pagada
   con dos medios o más es un reparto, y la base dice cuánto (`repartido`).
   PROMETE: un dato roto no entra (un medio sin nombre se descarta; un número que no es número vale 0); sin `repartido`, nada repartido.
   ==================================================================== */

/** Lo repartido: cuántas ventas mixtas pagadas con dos medios o más tocan a esta empresa, y cuánto de lo suyo sale de ellas. */
export type RepartidoDeEmpresa = { ventas: number; monto: number };
export type PagosDeEmpresa = { pagos: PagoMes[]; repartido: RepartidoDeEmpresa };

const numero = (v: unknown): number => {
  const x = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(x) ? x : 0;
};
const objeto = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** Lo que devuelve `fn_reporte_ventas_pagos`, ya validado. `null` si la forma no es la esperada (sin `pagos`). */
export function leerPagosDeEmpresa(v: unknown): PagosDeEmpresa | null {
  const o = objeto(v);
  if (!o || !Array.isArray(o.pagos)) return null;
  const pagos = o.pagos.flatMap((x): PagoMes[] => {
    const p = objeto(x);
    return p && typeof p.metodo === "string" && p.metodo ? [{ metodo: p.metodo, monto: numero(p.monto) }] : [];
  });
  const r = objeto(o.repartido);
  return { pagos, repartido: { ventas: Math.max(0, Math.trunc(numero(r?.ventas))), monto: numero(r?.monto) } };
}

/** La línea bajo «Cómo se pagó» cuando parte de lo de la empresa es un reparto: «Incluye S/ 40 repartidos de 1 venta mixta». Sin reparto, `null`. */
export function lineaDelReparto(r: RepartidoDeEmpresa): string | null {
  if (r.ventas <= 0 || r.monto === 0) return null;
  return `Incluye ${soles(r.monto)} repartidos de ${r.ventas} ${r.ventas === 1 ? "venta mixta" : "ventas mixtas"}`;
}

/** Lo que explica el «?» de esa línea: qué es una venta mixta y cómo se reparte. */
export const AYUDA_DEL_REPARTO =
  "Una venta mixta lleva prendas de CAYLA y de CLAURE y se pagó con más de un medio. Cada medio se reparte según lo cobrado de cada empresa. El resto de lo que ves es exacto.";

/** Lo que dice «Cómo se pagó» con una empresa elegida si su lectura no llegó: el resto del reporte sigue. */
export const NOTA_PAGOS_SIN_LEER = "No se pudo leer cómo se pagó lo de esta empresa. Vuelve a intentarlo en un momento.";
