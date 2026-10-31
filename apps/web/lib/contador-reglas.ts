// Estados financieros ▸ «Descargar para el contador» (ADR-0585, actividad 8).
//
// PROMETE: la lista de archivos que se bajan uno por uno (Felipe 2026-10-30: «que al presionar el botón despliegue opciones para no
// descargar cosas que no sean necesarias»), el nombre de cada archivo y cómo se arma cada CSV que no existía: el flujo de efectivo y el
// estado de cambios en el patrimonio en su formato formal, los saldos por cuenta (la balanza de comprobación) y el libro diario del mes.
// Las cuentas, que ya no se muestran en pantalla, van aquí: cada archivo lleva su columna «Cuenta» donde la tiene.
// ASUME: toda cifra viene de la base; aquí solo se ordena y se escribe. El formato es el de los demás CSV de Finanzas: separado por «;»
// (Excel en español), montos exactos con punto, con BOM (`csvDe`).

import { csvDe, mesTitulo, nombreCorto, type FilaER, type LineaDiario } from "./resultados-reglas";
import { partesDelFlujo } from "./plata-reglas";
import { cuadroFormalPatrimonio, tieneExtremos } from "./patrimonio-reglas";
import { etiquetaSemana, type FlujoReal } from "./flujo-caja-reglas";
import type { PatrimonioCambios } from "./estados-financieros-reglas";

export type ArchivoContador = "resultados" | "flujo" | "balance" | "patrimonio" | "saldos" | "diario";

/**
 * Los archivos, en el orden del menú: los cuatro estados (en el orden de sus pestañas) y después lo que el contador usa para cuadrar.
 * `deTodo`: es de CAYLA entera y lo baja solo quien ve los Estados financieros de todo (una terminal, no; la base lo exige igual).
 */
export const ARCHIVOS_CONTADOR: readonly { clave: ArchivoContador; etiqueta: string; archivo: string; deTodo: boolean }[] = [
  { clave: "resultados", etiqueta: "Estado de resultados", archivo: "estado-de-resultados", deTodo: false },
  { clave: "flujo", etiqueta: "Flujo de efectivo", archivo: "flujo-de-efectivo", deTodo: true },
  { clave: "balance", etiqueta: "Balance general", archivo: "balance-general", deTodo: true },
  { clave: "patrimonio", etiqueta: "Cambios en el patrimonio", archivo: "cambios-en-el-patrimonio", deTodo: true },
  { clave: "saldos", etiqueta: "Saldos por cuenta", archivo: "saldos-por-cuenta", deTodo: true },
  { clave: "diario", etiqueta: "Libro diario del mes", archivo: "libro-diario", deTodo: true },
];

/** `?archivo=` → cuál; cualquier otra cosa, `null`. */
export const leerArchivoContador = (v: string | null | undefined): ArchivoContador | null => ARCHIVOS_CONTADOR.find((a) => a.clave === v)?.clave ?? null;

/** «estado-de-resultados-2026-10.csv». */
export const nombreArchivoContador = (clave: ArchivoContador, mes: string) => `${ARCHIVOS_CONTADOR.find((a) => a.clave === clave)!.archivo}-${mes}.csv`;

/** Por qué una opción no se baja (`null`: se baja): lo de CAYLA entera no lo baja una terminal. */
export const motivoArchivoContador = (clave: ArchivoContador, veTodo: boolean): string | null =>
  !veTodo && ARCHIVOS_CONTADOR.find((a) => a.clave === clave)!.deTodo ? "Es de CAYLA entera: se baja desde una cuenta personal con el módulo." : null;

const r2 = (n: number) => Math.round(n * 100) / 100;

/** El estado de flujos de efectivo por el método directo: cada partida bajo su actividad, el total de cada una y el efectivo al inicio y al
 *  final; debajo, lo que entró y salió semana a semana (lo mismo que su pantalla, plegado). */
export function csvFlujoContador(real: FlujoReal, mes: string): string {
  const filas: (string | number)[][] = [[`Estado de flujos de efectivo · ${mesTitulo(mes)}`], [`Del ${real.desde} al ${real.hasta}`], [], ["Actividad", "Partida", "S/"]];
  for (const p of partesDelFlujo(real)) {
    for (const l of p.lineas) filas.push([p.formal, l.nombre, r2(l.monto)]);
    filas.push([p.formal, "Total", p.total]);
  }
  filas.push([], ["", "Efectivo al inicio", r2(real.saldoInicial)], ["", "Aumento (o disminución) del efectivo", r2(real.saldoFinal - real.saldoInicial)], ["", "Efectivo al final", r2(real.saldoFinal)]);
  if (real.semanas.length) {
    filas.push([], ["Semana a semana"], ["Semana", "Entró", "Salió", "Ajustes", "Quedó"]);
    for (const w of real.semanas) filas.push([etiquetaSemana(w.desde, w.hasta), w.entro, w.salio, w.ajustes, w.saldo]);
  }
  return csvDe(filas);
}

/** El estado de cambios en el patrimonio por columna, con la cuenta de cada columna en su encabezado. Sin arranque, lo dice. */
export function csvPatrimonioContador(p: PatrimonioCambios, mes: string): string {
  const titulo = [`Estado de cambios en el patrimonio · ${mesTitulo(mes)}`];
  if (!tieneExtremos(p)) return csvDe([titulo, ["Faltan los saldos de arranque: el líder los registra en ¿Cuánto vale CAYLA?."]]);
  return csvDe([
    titulo,
    [],
    ["Partida", "Capital (50)", "Aportes (52)", "Resultados acumulados (59 y resultado del mes)", "Total"],
    ...cuadroFormalPatrimonio(p).map((f) => [f.nombre, f.capital, f.aportes, f.utilidades, f.total]),
  ]);
}

/** Una cuenta de `fn_saldos_por_cuenta`, en el signo del debe (un pasivo, el patrimonio y un ingreso salen negativos). */
export type SaldoCuenta = { cuenta: string; nombre: string; tipo: string; saldoInicial: number; debe: number; haber: number; saldoFinal: number };

export function leerSaldoCuenta(r: Record<string, unknown>): SaldoCuenta {
  const n = (v: unknown) => (v == null ? 0 : Number(v));
  return {
    cuenta: String(r.cuenta ?? ""),
    nombre: String(r.nombre ?? ""),
    tipo: String(r.tipo ?? ""),
    saldoInicial: n(r.saldo_inicial),
    debe: n(r.debe),
    haber: n(r.haber),
    saldoFinal: n(r.saldo_final),
  };
}

const TIPO: Readonly<Record<string, string>> = { activo: "Activo", pasivo: "Pasivo", patrimonio: "Patrimonio", ingreso: "Ingreso", gasto: "Gasto" };

/** La balanza de comprobación: cada cuenta con su saldo al empezar, el debe y el haber del mes y su saldo al cerrar; al pie, los totales. */
export function csvSaldosContador(saldos: readonly SaldoCuenta[], mes: string): string {
  const suma = (k: "saldoInicial" | "debe" | "haber" | "saldoFinal") => r2(saldos.reduce((a, s) => a + s[k], 0));
  return csvDe([
    [`Saldos por cuenta (balanza de comprobación) · ${mesTitulo(mes)}`],
    ["Saldos en el signo del debe: un pasivo, el patrimonio y un ingreso salen negativos. Si el diario cuadra, el total de cada saldo es 0."],
    [],
    ["Cuenta", "Nombre", "Tipo", "Saldo al empezar", "Debe del mes", "Haber del mes", "Saldo al cerrar"],
    ...saldos.map((s) => [s.cuenta, s.nombre, TIPO[s.tipo] ?? s.tipo, s.saldoInicial, s.debe, s.haber, s.saldoFinal]),
    ["Total", "", "", suma("saldoInicial"), suma("debe"), suma("haber"), suma("saldoFinal")],
  ]);
}

/** De dónde sale el nombre de una sede en el diario: las columnas del estado de resultados («Trujillo»), que ya trae la base. */
export const sedesDelDiario = (filas: readonly FilaER[]) => new Map(filas.filter((f) => f.ubicacionId).map((f) => [f.ubicacionId!, nombreCorto(f)]));

/** El libro diario del mes: cada línea de cada asiento, con la cuenta, su nombre y la sede; al pie, el debe y el haber (que deben ser iguales). */
export function csvDiarioContador(lineas: readonly LineaDiario[], cuentas: ReadonlyMap<string, string>, sedes: ReadonlyMap<string, string>, mes: string): string {
  const debe = r2(lineas.reduce((a, l) => a + l.debe, 0));
  const haber = r2(lineas.reduce((a, l) => a + l.haber, 0));
  return csvDe([
    [`Libro diario · ${mesTitulo(mes)}`],
    [],
    ["Fecha", "Asiento", "Cuenta", "Nombre de la cuenta", "Debe", "Haber", "Glosa", "Sede"],
    ...lineas.map((l) => [l.fecha, l.asiento, l.cuenta, cuentas.get(l.cuenta) ?? "", l.debe, l.haber, l.glosa, l.ubicacionId ? (sedes.get(l.ubicacionId) ?? "") : "De la empresa"]),
    ["Total", "", "", "", debe, haber, "", ""],
  ]);
}
