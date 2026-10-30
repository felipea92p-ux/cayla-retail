import { estadoDeCaja, type CajaProxima } from "./caja-proxima-reglas";
import { disponibleReal } from "./cuenta-claure-reglas";
import type { CuentaDinero } from "./cuentas-dinero-reglas";
import { soles } from "./flujo-caja-reglas";
import { debesPronto, type ResumenFinanzas } from "./resumen-finanzas-reglas";
import { diasHasta } from "./por-pagar-consolidado-reglas";
import type { RespuestaResumen } from "./resumen-telar-reglas";

// Las tres respuestas de arriba del Resumen (Felipe 2026-10-26, spike «Resumen y campañas», opción A): ¿cuánto tienes?, ¿cuánto debes pagar pronto?
// y ¿cuánto te deja este mes? Una persona sin formación de finanzas las contesta de un vistazo, antes de leer nada más.
//
// Contrato. PROMETE: tres respuestas, siempre en el mismo orden, cada una con su cifra (o el motivo por el que no hay) y el contexto que la
// vuelve legible. NO CALCULA plata: cada cifra sale de donde ya vive (la caja, `debesPronto`, la respuesta del mes), así que el Resumen no
// puede decir en la tarjeta de arriba algo distinto de lo que dice abajo. Lo único que agrupa son los saldos que la base ya calculó, por tipo
// de cuenta (`desgloseDeTienes`), y solo si suman la cifra de arriba. ASUME: que `caja` ya viene armada con `cajaProxima`.
// Sin dato dice por qué (principio 9): nunca un cero que parezca un dato.

export type Tono = "verde" | "ambar" | "rojo" | "pizarra";
export type Chip = { texto: string; tono: Tono };
/** Una deuda de «¿Cuánto debes pronto?»: quién, cuánto y cuándo vence (la planilla entra como una más). */
type FilaDeuda = { texto: string; monto: number; cuando: string; tono: "rojo" | "ambar" };
/** De quién es lo que tienes: la plata de CAYLA y la de CLAURE (Claudia), que sumada es la cifra de arriba. */
type PartePlata = { clave: "cayla" | "claure"; nombre: string; monto: number };
export type Respuesta = {
  clave: "tienes" | "debes" | "deja";
  pregunta: string;
  /** `null`: no hay dato; entonces `motivo` dice por qué. */
  valor: number | null;
  motivo?: string;
  /** `true` si falló la lectura (no es que falte el dato). */
  noSePudoLeer?: boolean;
  /** La línea que da contexto a la cifra. */
  detalle?: string;
  chips: Chip[];
  /** Adónde lleva tocar la cifra, si lleva. */
  href?: string;
  /** «¿Cuánto tienes?» con plata de CLAURE: cuánto es de CAYLA y cuánto de CLAURE. */
  reparto?: PartePlata[];
  /** «¿Cuánto debes pronto?»: cada deuda en su línea, de la que vence antes a la que vence después (`masFilas`: las que no caben). */
  filas?: FilaDeuda[];
  masFilas?: number;
};

type Entrada = {
  r: ResumenFinanzas;
  caja: CajaProxima;
  /** La respuesta del mes (`respuestaResumen`), con el chip «de cada S/ 100» ya sumado si lo hay. */
  deja: RespuestaResumen;
  hrefDinero: string | null;
  hrefPorPagar: string | null;
  /** De qué está hecho «lo que tienes» (`desgloseDeTienes`); sin él, la tarjeta conserva su texto de siempre. */
  desglose?: DesgloseTienes | null;
  /** Lo que se le debe a CLAURE (ADR-0560): «lo que tienes» incluye plata de Claudia, y la tarjeta dice cuánto es suya y cuánto queda disponible. */
  claure?: { saldo: number } | null;
  /** La lectura de CLAURE se cayó: la tarjeta lo dice (un chip) en vez de callarlo o inventar un reparto. */
  claureFalla?: boolean;
  /** Lo vendido y lo que salió del mes: la frase bajo «¿Cuánto te deja?» («Vendiste S/ 99,950 y salió S/ 130,215»). */
  plata?: { vendido: number; salio: number } | null;
};

/** Lo que suma «¿Cuánto tienes?», agrupado por lo que una persona entiende: lo que está a mano, lo que las máquinas deben depositar y el resto. */
export type DesgloseTienes = { enMano: number; porAbonar: number; otros: number };

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * «¿Cuánto tienes?» es la suma de TODAS las cuentas menos la tarjeta de crédito (`fn_flujo_disponible`), pero su texto decía «en cajones, cajas
 * fuertes y bancos»: el 27-oct-2026 el 56 % del titular (S/ 56,146 de S/ 99,570) era tarjeta y QR que las máquinas todavía no depositaban, más un
 * fondo y plata por rendir. Aquí se reparte esa suma por tipo con los saldos que la base ya calculó, y solo se devuelve si las partes suman la cifra
 * de arriba (S/ 0.50 de tolerancia): si una cuenta no se ve (saldo nulo) o las lecturas se desfasaron, `null` y la tarjeta queda como estaba.
 */
export function desgloseDeTienes(cuentas: readonly CuentaDinero[] | null, saldoHoy: number): DesgloseTienes | null {
  if (!cuentas) return null;
  const suman = cuentas.filter((c) => c.tipo !== "tarjeta_credito");
  if (suman.some((c) => c.saldo === null)) return null;
  let enMano = 0;
  let porAbonar = 0;
  let otros = 0;
  for (const c of suman) {
    const saldo = c.saldo ?? 0;
    if (c.tipo === "banco" || c.tipo === "caja_fuerte" || c.tipo === "cajon") enMano += saldo;
    else if (c.tipo === "por_abonar") porAbonar += saldo;
    else otros += saldo;
  }
  const d = { enMano: r2(enMano), porAbonar: r2(porAbonar), otros: r2(otros) };
  return Math.abs(d.enMano + d.porAbonar + d.otros - saldoHoy) < 0.5 ? d : null;
}

/** La línea de la tarjeta: lo que está a mano y, aparte, lo que no lo está todavía. Sin nada aparte, el texto de siempre, que ya era exacto. */
function detalleDeTienes(d: DesgloseTienes | null | undefined): string {
  const siempre = "Bancos, cajas y cajones.";
  if (!d) return siempre;
  const aparte: string[] = [];
  if (Math.abs(d.porAbonar) > 0.005) aparte.push(`por llegar ${soles(d.porAbonar)}`);
  if (Math.abs(d.otros) > 0.005) aparte.push(`en fondos ${soles(d.otros)}`);
  if (!aparte.length) return siempre;
  return `A mano ${soles(d.enMano)} · ${aparte.join(" · ")}`;
}

function tienes(caja: CajaProxima, href: string | null, desglose?: DesgloseTienes | null, claure?: { saldo: number } | null, claureFalla = false): Respuesta {
  const base = { clave: "tienes" as const, chips: [] as Chip[], ...(href ? { href } : {}) };
  if (caja.tipo === "cayla") {
    const estado = estadoDeCaja(caja);
    const chips: Chip[] = [];
    if (caja.provisional) chips.push({ texto: "Provisional", tono: "pizarra" });
    if (estado) chips.push({ texto: estado.texto, tono: estado.tono });
    // Solo CAYLA entera: una sede no lleva los bancos ni las máquinas, donde cae lo que se le debe a Claudia.
    if (claureFalla) chips.push({ texto: "No se pudo leer lo de CLAURE", tono: "pizarra" });
    // Si a CLAURE se le pagó de más, no hay plata suya que repartir: lo que ella le debe a CAYLA se dice aparte.
    if (claure && claure.saldo < 0) chips.push({ texto: `CLAURE te debe ${soles(-claure.saldo)}`, tono: "pizarra" });
    const d = claure ? disponibleReal(caja.saldoHoy, claure.saldo) : null;
    const reparto: PartePlata[] | undefined = d
      ? [
          { clave: "cayla", nombre: "De CAYLA", monto: d.disponible },
          { clave: "claure", nombre: "De CLAURE", monto: d.deClaudia },
        ]
      : undefined;
    return { ...base, pregunta: "¿Cuánto tienes?", valor: caja.saldoHoy, detalle: detalleDeTienes(desglose), chips, ...(reparto ? { reparto } : {}) };
  }
  if (caja.tipo === "sede") {
    const pregunta = caja.vende ? `¿Cuánto efectivo tienes en ${caja.nombre}?` : "¿Cuánto efectivo tienes?";
    if (caja.efectivo === null) return { ...base, pregunta, valor: null, motivo: "Tu cuenta no ve el efectivo de este lugar." };
    return { ...base, pregunta, valor: caja.efectivo, detalle: "En el cajón y la caja fuerte. Los bancos, en «Todas las sedes».", chips: [] };
  }
  if (caja.tipo === "falla") return { ...base, pregunta: "¿Cuánto tienes?", valor: null, noSePudoLeer: true, motivo: "No se pudo leer la caja. Vuelve a cargar la página en un rato." };
  return { ...base, pregunta: "¿Cuánto tienes?", valor: null, motivo: "Tu cuenta no ve el saldo de la caja." };
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const diaYMes = (iso: string) => `${Number(iso.slice(8, 10))} ${MESES_CORTOS[Number(iso.slice(5, 7)) - 1]}`;
/** «Vencida hace 5 d» · «Vence hoy» · «Vence mañana» · «Vence 30 oct»: lo que dice la línea a la derecha de cada deuda. */
function cuandoVence(fecha: string, hoy: string): string {
  const d = diasHasta(fecha, hoy);
  if (d < 0) return `Vencida hace ${-d} d`;
  if (d === 0) return "Vence hoy";
  if (d === 1) return "Vence mañana";
  return `Vence ${diaYMes(fecha)}`;
}
const MAX_DEUDAS = 4;

function debes(r: ResumenFinanzas, href: string | null): Respuesta {
  const base = { clave: "debes" as const, pregunta: "¿Cuánto debes pagar pronto?", ...(href ? { href } : {}) };
  const d = debesPronto(r);
  if (!d) return { ...base, valor: null, chips: [], noSePudoLeer: r.porPagar.estado === "falla", motivo: r.porPagar.estado === "falla" ? "No se pudo leer lo que debes. Vuelve a cargar la página en un rato." : "Tu cuenta no ve lo que debes." };
  const dias = r.porPagar.estado === "ok" ? r.porPagar.datos.dias : 7;
  const chip: Chip = d.vencidas.length
    ? { texto: d.vencidas.length === 1 ? "1 vencida" : `${d.vencidas.length} vencidas`, tono: "ambar" }
    : d.proximas.length || d.planilla
      ? { texto: "Vence pronto", tono: "pizarra" }
      : { texto: "Nada por vencer", tono: "verde" };
  // Cada deuda con su fecha, de la que vence antes a la que vence después: así se ve QUÉ hay que pagar, no solo cuánto.
  const todas = [
    ...[...d.vencidas, ...d.proximas].map((f) => ({ fecha: f.vence, fila: { texto: f.proveedor, monto: f.saldo, cuando: cuandoVence(f.vence, r.hoy), tono: diasHasta(f.vence, r.hoy) < 0 ? ("rojo" as const) : ("ambar" as const) } })),
    ...(d.planilla ? [{ fecha: d.planilla.fecha, fila: { texto: "Planilla", monto: d.planilla.monto, cuando: cuandoVence(d.planilla.fecha, r.hoy), tono: diasHasta(d.planilla.fecha, r.hoy) < 0 ? ("rojo" as const) : ("ambar" as const) } }] : []),
  ].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const filas = todas.slice(0, MAX_DEUDAS).map((x) => x.fila);
  const masFilas = todas.length - filas.length;
  return {
    ...base,
    valor: d.monto,
    detalle: filas.length ? undefined : `No vence nada en los próximos ${dias} días.`,
    chips: [chip],
    ...(filas.length ? { filas, ...(masFilas > 0 ? { masFilas } : {}) } : {}),
  };
}

function deja(resp: RespuestaResumen, plata?: { vendido: number; salio: number } | null): Respuesta {
  const detalle = plata && resp.valor !== null ? `Vendiste ${soles(plata.vendido)} y salió ${soles(plata.salio)}.` : undefined;
  return { clave: "deja", pregunta: resp.pregunta, valor: resp.valor, ...(resp.motivo ? { motivo: resp.motivo } : {}), ...(detalle ? { detalle } : {}), chips: resp.chips };
}

/** Las tres, en el orden en que una persona se las hace: lo que tiene, lo que debe, lo que gana. */
export function tresRespuestas({ r, caja, deja: resp, hrefDinero, hrefPorPagar, desglose, claure, claureFalla, plata }: Entrada): [Respuesta, Respuesta, Respuesta] {
  return [tienes(caja, hrefDinero, desglose, claure, claureFalla), debes(r, hrefPorPagar), deja(resp, plata)];
}
