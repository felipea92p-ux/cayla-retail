// Tienda web ▸ Recomendaciones · quién es el cliente (actividad 5 de la hoja nueva, Felipe 2026-10-17; decisión #5 A). Una línea bajo su
// nombre —del club o no, cuánto compra, en qué tienda y cuándo fue la última vez— para responderle como a alguien conocido. Solo la ve
// quien ve las fichas de clientes (regla B-03, Felipe 2026-09-26: lo de la ficha se le pregunta al módulo Clientes): la hoja ni la pide
// si no, y la base la negaría igual (la política de `clientas` y `fn_clienta_su_sede` exigen el módulo). Ningún monto.
// Sin red ni React: la hoja le pasa lo que leyó.

import { diaLima, diasEntreFechas } from "./fechas-lima";

/** Lo que se lee de la ficha: si es del club (`clientas.club_desde`) y su tienda y sus compras (`fn_clienta_su_sede`). */
export type QuienEs = {
  clubDesde: string | null;
  suSede: string | null;
  compras12m: number;
  esFrecuente: boolean;
  ultimaCompra: string | null;
};

const MES_ANIO = new Intl.DateTimeFormat("es-PE", { month: "long", year: "numeric", timeZone: "America/Lima" });

/** «hoy», «ayer», «hace 12 días», «hace 3 meses», «hace más de un año», contando días de Lima. */
function haceCuantoDias(instanteIso: string, hoy: string): string {
  const dia = diaLima(instanteIso);
  if (!dia) return "";
  const n = Math.max(0, diasEntreFechas(dia, hoy));
  if (n === 0) return "hoy";
  if (n === 1) return "ayer";
  if (n < 60) return `hace ${n} días`;
  if (n < 365) return `hace ${Math.round(n / 30)} meses`;
  return "hace más de un año";
}

/**
 * La línea, en palabras de tienda: «Del club desde marzo de 2026 · 4 compras en el último año, casi siempre en Tienda Trujillo · la
 * última, hace 12 días». Sin compras en el año, lo dice; sin tienda habitual, no la inventa. `hoy` es el día de Lima (aaaa-mm-dd).
 */
export function lineaDelCliente(q: QuienEs, hoy: string): string {
  const partes: string[] = [];
  partes.push(q.clubDesde ? `Del club desde ${MES_ANIO.format(new Date(q.clubDesde))}` : "No es del club");
  if (q.compras12m === 0) partes.push("sin compras en el último año");
  else {
    const compras = `${q.compras12m} ${q.compras12m === 1 ? "compra" : "compras"} en el último año${q.esFrecuente ? " (frecuente)" : ""}`;
    partes.push(q.suSede ? `${compras}, casi siempre en ${q.suSede}` : compras);
  }
  if (q.ultimaCompra) {
    const cuando = haceCuantoDias(q.ultimaCompra, hoy);
    if (cuando) partes.push(`la última, ${cuando}`);
  }
  return partes.join(" · ");
}

/** Lo que devuelven las dos lecturas, puesto en tipos. null si la forma no se entiende (la hoja muestra solo el enlace a la ficha). */
export function leerQuienEs(club: unknown, sede: unknown): QuienEs | null {
  const fichaClub = club && typeof club === "object" ? (club as Record<string, unknown>) : null;
  if (!fichaClub) return null;
  const fila = Array.isArray(sede) ? (sede[0] as Record<string, unknown> | undefined) : undefined;
  const numero = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : 0);
  const texto = (x: unknown) => (typeof x === "string" && x.trim() ? x : null);
  return {
    clubDesde: texto(fichaClub.club_desde),
    suSede: texto(fila?.su_sede),
    compras12m: numero(fila?.compras_12m),
    esFrecuente: fila?.es_frecuente === true,
    ultimaCompra: texto(fila?.ultima_compra),
  };
}
