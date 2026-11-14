import type { EmpresasAqui } from "./empresas-de-sede-reglas";

// Ventas ▸ Reportes ▸ el filtro «Empresa» (CAYLA / CLAURE), solo donde conviven dos (hoy, Tienda Lima). Lógica pura, sin React ni Supabase; la lectura de
// las empresas de una tienda vive en `lib/empresas-de-sede.ts` y el filtro en la base, en `p_empresa` de las cuatro lecturas (20261114215000, ADR-0665).
//
// PROMETE: (1) el filtro solo se ofrece donde operan dos empresas; con una sola, o sin saber cuáles (la base no respondió), no se dibuja y el reporte sale
// como siempre; (2) la URL nunca elige una empresa que no se ofrece: `?emp=claure` en Trujillo, o con «todas las tiendas», se ignora y se lee todo, así que
// una URL pegada no estrecha lo que se ve ni hace que la base rechace la lectura (22023); (3) la clave que viaja por la URL es la de la empresa
// (`cayla`, `claure`), no un uuid: se puede leer y compartir.
// ASUME: que la base reparte cada línea de venta entre las empresas con la regla de Caja e Historial (ADR-0542); aquí no se calcula nada de dinero.

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

/** Lo que dice «Cómo se pagó» con una empresa elegida: los pagos no se parten (una caja y una boleta son una sola; ADR-0532, ADR-0665). */
export const NOTA_PAGOS_SIN_PARTIR = "Los pagos no se parten por empresa: la caja y la boleta son una sola.";
