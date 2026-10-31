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
import type { ClaveEstado, FormaEstado, PatrimonioCambios } from "./estados-financieros-reglas";

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

// ---- Ver en pantalla (Felipe 2026-10-31: «un menú para ver las seis en pantalla») ---------------------------------------------

export type GrupoSaldos = { tipo: string; nombre: string; filas: SaldoCuenta[]; saldoInicial: number; debe: number; haber: number; saldoFinal: number };

const ORDEN_TIPO = ["activo", "pasivo", "patrimonio", "ingreso", "gasto"] as const;
const PLURAL_TIPO: Readonly<Record<string, string>> = { activo: "Lo que tiene (activo)", pasivo: "Lo que debe (pasivo)", patrimonio: "Lo tuyo (patrimonio)", ingreso: "Ingresos", gasto: "Gastos" };

/** Los saldos por cuenta en la pantalla: por tipo (en el orden del plan de cuentas), cada grupo con su total. Lo que no tiene tipo va al final. */
export function gruposDeSaldos(saldos: readonly SaldoCuenta[]): GrupoSaldos[] {
  const tipos = [...ORDEN_TIPO, ...new Set(saldos.map((s) => s.tipo).filter((t) => !(ORDEN_TIPO as readonly string[]).includes(t)))];
  return tipos
    .map((tipo) => {
      const filas = saldos.filter((s) => s.tipo === tipo);
      const suma = (k: "saldoInicial" | "debe" | "haber" | "saldoFinal") => r2(filas.reduce((a, s) => a + s[k], 0));
      return { tipo, nombre: PLURAL_TIPO[tipo] ?? (tipo || "Sin tipo"), filas, saldoInicial: suma("saldoInicial"), debe: suma("debe"), haber: suma("haber"), saldoFinal: suma("saldoFinal") };
    })
    .filter((g) => g.filas.length);
}

/** ¿Cuadra la balanza? La suma de los saldos al cerrar es 0 y el debe del mes es igual al haber (al céntimo). */
export function balanzaCuadra(saldos: readonly SaldoCuenta[]): boolean {
  const final = r2(saldos.reduce((a, s) => a + s.saldoFinal, 0));
  const debe = r2(saldos.reduce((a, s) => a + s.debe, 0));
  const haber = r2(saldos.reduce((a, s) => a + s.haber, 0));
  return final === 0 && debe === haber;
}

const sinTildes = (t: string) => t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** El libro diario filtrado por lo que se escribe en el buscador: la cuenta (número o nombre), el asiento o la glosa. Sin tildes ni mayúsculas. */
export function filtrarDiario(lineas: readonly LineaDiario[], buscado: string, cuentas: ReadonlyMap<string, string>): LineaDiario[] {
  const q = sinTildes(buscado.trim());
  if (!q) return [...lineas];
  return lineas.filter((l) => [l.cuenta, cuentas.get(l.cuenta) ?? "", l.asiento, l.glosa].some((c) => sinTildes(c).includes(q)));
}

// ---- El menú «Ver» de la cabecera (Felipe 2026-10-31: «la 2, el menú Ver») -----------------------------------------------------

/** Lo que se puede mirar: las respuestas, o uno de los seis cuadros del contador (los mismos seis del menú de descarga). */
export type VistaVer = "respuestas" | ArchivoContador;

/** La pantalla de los saldos por cuenta y el libro diario (`?cuadro=saldos|diario`: `?ver=` ya es la sede en el telar). */
export const RUTA_CUENTAS = "/finanzas/reportes/cuentas";
export type VerCuentas = "saldos" | "diario";
export const leerVerCuentas = (v: string | undefined): VerCuentas => (v === "diario" ? "diario" : "saldos");

/** Qué estado es cada cuadro formal (los otros dos viven en la pantalla de las cuentas). */
const ESTADO_DEL_CUADRO = { resultados: "ganamos", flujo: "plata", balance: "vale", patrimonio: "tuyo" } as const satisfies Partial<Record<ArchivoContador, ClaveEstado>>;
type CuadroDeEstado = keyof typeof ESTADO_DEL_CUADRO;
const esCuadroDeEstado = (v: ArchivoContador): v is CuadroDeEstado => v in ESTADO_DEL_CUADRO;

/** Lo que el menú dice que se está viendo: en un estado, sus respuestas o su cuadro formal; en la pantalla de las cuentas, saldos o diario. */
export function vistaActiva(pantalla: ClaveEstado | VerCuentas, forma: FormaEstado): VistaVer {
  if (pantalla === "saldos" || pantalla === "diario") return pantalla;
  if (forma === "respuesta") return "respuestas";
  return (Object.keys(ESTADO_DEL_CUADRO) as CuadroDeEstado[]).find((k) => ESTADO_DEL_CUADRO[k] === pantalla)!;
}

/**
 * Las siete opciones del menú, en orden, con a dónde lleva cada una. «Las respuestas» vuelve al estado que se mira (desde las cuentas, a
 * ¿Ganamos?); un cuadro formal lleva a su estado con `?forma=formal`; saldos y diario, a la pantalla de las cuentas. Lo que es de CAYLA
 * entera se ve con su motivo y no se elige en una terminal (la misma regla que la descarga).
 */
export function opcionesVer({
  pantalla,
  hrefEstado,
  hrefCuentas,
  veTodo,
}: {
  pantalla: ClaveEstado | VerCuentas;
  hrefEstado: (clave: ClaveEstado, forma: FormaEstado) => string;
  hrefCuentas: (ver: VerCuentas) => string;
  veTodo: boolean;
}): { clave: VistaVer; etiqueta: string; href: string; motivo?: string }[] {
  const estado: ClaveEstado = pantalla === "saldos" || pantalla === "diario" ? "ganamos" : pantalla;
  return [
    { clave: "respuestas" as const, etiqueta: "Las respuestas", href: hrefEstado(estado, "respuesta") },
    ...ARCHIVOS_CONTADOR.map((a) => {
      const motivo = motivoArchivoContador(a.clave, veTodo);
      return {
        clave: a.clave,
        etiqueta: a.etiqueta,
        href: esCuadroDeEstado(a.clave) ? hrefEstado(ESTADO_DEL_CUADRO[a.clave], "formal") : hrefCuentas(a.clave as VerCuentas),
        ...(motivo ? { motivo } : {}),
      };
    }),
  ];
}
