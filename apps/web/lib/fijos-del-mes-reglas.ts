// Fijos del mes como cola de cierre (tarea #3 de /pantalla, Felipe 2026-10-22). La pestaña «Fijos del mes» era dos tarjetas: «Para confirmar»
// (casi siempre vacía) primero y «Faltan» segunda, sin la fecha ni los días de atraso, sin la suma de lo que falta y con lo ya registrado
// en otra columna. Ahora es una sola lista que se lee de arriba abajo: lo que ya pasó su fecha (el más atrasado primero), lo que llega este
// mes y, plegado, lo que ya está registrado.
//
// PROMETE: ordenar y describir lo que `fn_gastos_fijos_mes` ya devuelve (estado y fecha esperada vienen de la base, ADR-0440); no decide
// qué falta ni cuándo. Lógica pura: sin fecha de hoy propia (se la pasan) y sin red.

import { fechaCorta, solesRedondo, textoCuandoLlega, textoMes, type GastoFijoMes } from "./gastos-reglas";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Días de calendario de `desde` a `hasta` («YYYY-MM-DD»); negativo si `hasta` es anterior. `NaN` si alguna fecha no se lee. */
function diasEntre(desde: string, hasta: string): number {
  const ms = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return Math.round((ms(hasta) - ms(desde)) / 86_400_000);
}

type ColaDeFijos = {
  /** Ya pasaron su fecha y no están registrados: el más atrasado primero, y a igual fecha el de más monto. */
  faltan: GastoFijoMes[];
  /** Todavía no llegan: el más próximo primero. */
  vienen: GastoFijoMes[];
  /** Ya tienen su gasto: por fecha esperada. */
  registrados: GastoFijoMes[];
  /** Lo que queda por confirmar (los que faltan y los que vienen). */
  pendientes: number;
  /** Lo que suman con el monto de siempre; es una referencia si alguno es de monto variable (`aproximado`). */
  montoPendiente: number;
  aproximado: boolean;
  total: number;
};

const porFecha = (a: GastoFijoMes, b: GastoFijoMes) => a.fechaEsperada.localeCompare(b.fechaEsperada);
const porMontoLuegoNombre = (a: GastoFijoMes, b: GastoFijoMes) => b.monto - a.monto || a.descripcion.localeCompare(b.descripcion, "es");

export function colaDeFijos(fijos: readonly GastoFijoMes[]): ColaDeFijos {
  const faltan = fijos.filter((f) => f.estado === "falta").sort((a, b) => porFecha(a, b) || porMontoLuegoNombre(a, b));
  const vienen = fijos.filter((f) => f.estado === "por_llegar").sort((a, b) => porFecha(a, b) || porMontoLuegoNombre(a, b));
  const registrados = fijos.filter((f) => f.estado === "registrado").sort((a, b) => porFecha(a, b) || a.descripcion.localeCompare(b.descripcion, "es"));
  const pendientes = [...faltan, ...vienen];
  return {
    faltan,
    vienen,
    registrados,
    pendientes: pendientes.length,
    montoPendiente: r2(pendientes.reduce((s, f) => s + f.monto, 0)),
    aproximado: pendientes.some((f) => f.montoVariable),
    total: fijos.length,
  };
}

/** El título de la lista: «Fijos de octubre 2026». */
export function tituloDeLaCola(mes: string): string {
  return `Fijos de ${textoMes(mes)}`;
}

/** Bajo el título: lo que falta confirmar y cuánto suma, o que ya está todo. */
export function bajadaDeLaCola(c: ColaDeFijos, mes: string): string {
  if (c.total === 0) return "";
  if (c.pendientes === 0) return c.total === 1 ? `El fijo de ${textoMes(mes)} ya está registrado.` : `Los ${c.total} fijos de ${textoMes(mes)} ya están registrados.`;
  return `${c.pendientes} por confirmar (${c.aproximado ? "~" : ""}${solesRedondo(c.montoPendiente)}) · ${c.registrados.length} de ${c.total} ya registrados.`;
}

/**
 * La línea de cada fijo: cuándo se esperaba y cuántos días lleva de atraso, o cuándo llega.
 * «se esperaba el 15 oct · hace 7 días» · «se espera mañana» · «se espera el 31 oct · en 9 días». Un fijo ya registrado dice cuándo llega
 * cada mes, como siempre («la quincena»).
 */
export function textoFechaDeFijo(f: Pick<GastoFijoMes, "estado" | "fechaEsperada" | "momento" | "diaDelMes">, hoy: string): string {
  if (f.estado === "registrado") return textoCuandoLlega(f.momento, f.diaDelMes);
  const dias = f.estado === "falta" ? diasEntre(f.fechaEsperada, hoy) : diasEntre(hoy, f.fechaEsperada);
  if (Number.isNaN(dias)) return textoCuandoLlega(f.momento, f.diaDelMes);
  const fecha = fechaCorta(f.fechaEsperada);
  if (f.estado === "falta") return `se esperaba el ${fecha} · hace ${dias} ${dias === 1 ? "día" : "días"}`;
  if (dias <= 0) return "se espera hoy";
  if (dias === 1) return "se espera mañana";
  return `se espera el ${fecha} · en ${dias} días`;
}
