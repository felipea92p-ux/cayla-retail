// La barra de filtros de /productos guarda TODO en la URL (ADR-0254): la URL es la única fuente de verdad y la pantalla
// solo la lee. Aquí vive lo que se hace con esa URL, sin React, para que se pueda probar y para que la pantalla no tenga
// dos verdades (el estado local de las cajas y la URL) que se separan. Análisis: docs/pantallas/productos-filtros.md #1.

/** Lo que nunca es un filtro: cambiar de página o de vista no se «limpia» ni cuenta. */
const NO_SE_LIMPIA = ["vista"] as const;

/** Aplica `cambios` a la consulta `actual` (sin «?»). Un valor vacío borra la clave. Siempre vuelve a la página 1: un
 *  filtro nuevo sobre «página 7» cae casi siempre en vacío. */
export function consultaConCambios(actual: string, cambios: Record<string, string>): string {
  const p = new URLSearchParams(actual);
  for (const [k, v] of Object.entries(cambios)) {
    if (v) p.set(k, v);
    else p.delete(k);
  }
  p.delete("pagina");
  return p.toString();
}

export function hrefDeConsulta(pathname: string, consulta: string): string {
  return consulta ? `${pathname}?${consulta}` : pathname;
}

/** «Limpiar todo» quita los filtros, la búsqueda y el orden, pero deja a la persona en la vista donde estaba (Grilla o
 *  Tabla): antes la sacaba de la Tabla. */
export function consultaSinFiltros(actual: string): string {
  const antes = new URLSearchParams(actual);
  const p = new URLSearchParams();
  for (const k of NO_SE_LIMPIA) {
    const v = antes.get(k);
    if (v) p.set(k, v);
  }
  return p.toString();
}

/** Dos consultas son la misma URL aunque el orden de sus claves cambie (`a=1&b=2` = `b=2&a=1`). */
export function mismaConsulta(a: string, b: string): boolean {
  const norma = (s: string) =>
    [...new URLSearchParams(s).entries()]
      .map(([k, v]) => `${k}=${v}`)
      .sort()
      .join("&");
  return norma(a) === norma(b);
}

/** Las cajas que se escriben (buscador y precio): mientras alguien teclea, lo suyo vive aquí y recién después pasa a la URL. */
export type CajaTipeada = "q" | "precioMin" | "precioMax";
/** Solo las cajas que se están escribiendo AHORA, con lo escrito. Una caja que no está aquí muestra lo que dice la URL,
 *  venga de donde venga («A quién pedirle», el botón Atrás, un enlace compartido). Antes las cajas se llenaban una sola vez
 *  al montar y seguían mostrando, y volvían a mandar, un precio que la URL ya no tenía. */
export type Tipeado = Partial<Record<CajaTipeada, string>>;

export function valorDeCaja(tipeado: Tipeado, caja: CajaTipeada, consulta: string): string {
  return tipeado[caja] ?? new URLSearchParams(consulta).get(caja) ?? "";
}

/** Lo escrito que todavía no está en la URL, listo para `consultaConCambios`. Vacío = nada que mandar. */
export function cambiosTipeados(consulta: string, tipeado: Tipeado): Record<string, string> {
  const p = new URLSearchParams(consulta);
  const cambios: Record<string, string> = {};
  for (const [k, v] of Object.entries(tipeado) as [CajaTipeada, string][]) {
    const limpio = v.trim();
    if ((p.get(k) ?? "") !== limpio) cambios[k] = limpio;
  }
  return cambios;
}

/** Cuando la URL ya dice lo escrito, la caja deja de «estar escribiéndose» y vuelve a mostrar la URL. Devuelve el mismo
 *  objeto si nada cambió (para no volver a pintar de gusto). */
export function tipeadoPendiente(consulta: string, tipeado: Tipeado): Tipeado {
  const pendientes = cambiosTipeados(consulta, tipeado);
  const quedan = (Object.keys(tipeado) as CajaTipeada[]).filter((k) => k in pendientes);
  if (quedan.length === Object.keys(tipeado).length) return tipeado;
  return Object.fromEntries(quedan.map((k) => [k, tipeado[k] as string])) as Tipeado;
}

/** Saca cajas de lo que se está escribiendo (al quitar su chip o con «Limpiar todo»): si no, el temporizador las volvería a
 *  mandar a la URL. */
export function sinCajas(tipeado: Tipeado, cajas: readonly CajaTipeada[]): Tipeado {
  if (!cajas.some((k) => k in tipeado)) return tipeado;
  const copia = { ...tipeado };
  for (const k of cajas) delete copia[k];
  return copia;
}
