/**
 * Lo que la píldora «Hoy» de la cabecera del Punto de venta dice (spike 2026-09-26, hallazgo 2): cuántas ventas,
 * cuánto y cuánto de la meta del día de la sede (`ubicaciones.meta_venta_diaria`). Antes solo se veía bajando hasta
 * el final del catálogo.
 */
export type ResumenHoy = { ventas: number; total: number; pctMeta: number | null };

export function resumenDeHoy(ventas: readonly { total: number | string }[], meta: number | null): ResumenHoy {
  const total = Math.round(ventas.reduce((acc, v) => acc + Number(v.total), 0) * 100) / 100;
  // Sin meta (o una meta en 0) no hay porcentaje que mostrar: se omite, no se inventa un 100 %.
  const pctMeta = meta !== null && meta > 0 ? Math.floor((total / meta) * 100) : null;
  return { ventas: ventas.length, total, pctMeta };
}

/**
 * De qué lectura salen las ventas que la píldora «Hoy» suma, y de QUÉ sede son (hallazgo 2026-10-10: con la cabecera en
 * «Tienda AQP», «Hoy» decía S/ 5830.08, el total de TRU). El selector de sede solo hace `router.refresh()`: `PuntoDeVenta` no se
 * monta de nuevo y las ventas de la sede nueva le llegan como props nuevas a un componente que ya tenía las de la otra. La regla:
 * manda la lectura más nueva de la sede que se mira. Una del servidor reemplaza todo lo anterior apenas llega (otra sede, o la
 * misma releída al abrir o cerrar caja); una del navegador (tras vender, `useVentasDeHoy`) solo cuenta si es de esa misma sede.
 */
export type LecturaDeHoy<V> = {
  ubicacionId: string;
  /** La lista que mandó el servidor: su identidad dice si llegó otra lectura (cada `router.refresh()` trae una nueva). */
  delServidor: readonly V[];
  ventas: readonly V[];
  fallo: string | null;
};

export function lecturaDelServidor<V>(ubicacionId: string, ventas: readonly V[], fallo: string | null): LecturaDeHoy<V> {
  return { ubicacionId, delServidor: ventas, ventas, fallo };
}

/** La lectura vigente ante lo que manda el servidor ahora: la MISMA (por identidad) si no llegó nada nuevo; si llegó, la del servidor. */
export function alDiaConElServidor<V>(actual: LecturaDeHoy<V>, ubicacionId: string, delServidor: readonly V[], fallo: string | null): LecturaDeHoy<V> {
  if (actual.ubicacionId === ubicacionId && actual.delServidor === delServidor) return actual;
  return lecturaDelServidor(ubicacionId, delServidor, fallo);
}

/** Lo que respondió una relectura del navegador para `ubicacionId`. De otra sede (se cambió mientras volaba) no toca nada; si
 *  falló, se conserva la lista con el aviso: la venta ya quedó bien en la base. */
export function conRelectura<V>(
  actual: LecturaDeHoy<V>,
  ubicacionId: string,
  respuesta: { ventas: readonly V[] } | { fallo: string },
): LecturaDeHoy<V> {
  if (ubicacionId !== actual.ubicacionId) return actual;
  return "fallo" in respuesta ? { ...actual, fallo: respuesta.fallo } : { ...actual, ventas: respuesta.ventas, fallo: null };
}

/** El ancho de la barrita, de 0 a 100: pasada la meta se queda llena. */
export function anchoBarraMeta(pct: number | null): number {
  if (pct === null) return 0;
  return Math.max(0, Math.min(100, pct));
}

/**
 * Nombre que se ve de un ticket en espera (spike, hallazgo 6): el que puso la colaboradora («Probador 2») o, si no
 * puso ninguno, su lugar en la fila («Ticket 1»). Con dos clientas en probador, «En espera · 2» no decía cuál era cuál.
 */
export function nombreDeEspera(nombre: string | undefined | null, indice: number): string {
  const limpio = (nombre ?? "").trim();
  return limpio || `Ticket ${indice + 1}`;
}

/** Tope del nombre de un ticket en espera: es una etiqueta, no una nota (la nota del ticket ya existe). */
export const NOMBRE_ESPERA_MAX = 30;

/** Hace cuánto se dejó un ticket en espera, legible (spike «el ticket a lo alto»): la tira decía «3216 min» de un
 *  ticket de hace dos días. Menos de una hora en minutos, menos de un día en horas, y después en días. */
export function haceCuanto(desdeIso: string, ahora: number): string {
  const min = Math.max(0, Math.floor((ahora - new Date(desdeIso).getTime()) / 60_000));
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "hace 1 día" : `hace ${d} días`;
}
