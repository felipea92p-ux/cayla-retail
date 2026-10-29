import { estadoDeCaja, type CajaProxima } from "./caja-proxima-reglas";
import { chipsDisponible, respuestaClaure } from "./cuenta-claure-reglas";
import type { CuentaDinero } from "./cuentas-dinero-reglas";
import { soles } from "./flujo-caja-reglas";
import { debesPronto, type ResumenFinanzas } from "./resumen-finanzas-reglas";
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
export type Respuesta = {
  clave: "tienes" | "debes" | "deja" | "claure";
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

/** La línea de la tarjeta: lo que está a mano y, aparte, lo que no lo está todavía. Si no hay nada aparte, el texto de siempre, que ya era exacto. */
function detalleDeTienes(d: DesgloseTienes | null | undefined): string {
  const siempre = "En cajones, cajas fuertes y bancos de toda la empresa.";
  if (!d) return siempre;
  const aparte: string[] = [];
  if (Math.abs(d.porAbonar) > 0.005) aparte.push(`${soles(d.porAbonar)} de tarjeta y QR que las máquinas todavía no depositan`);
  if (Math.abs(d.otros) > 0.005) aparte.push(`${soles(d.otros)} en fondos y plata por rendir`);
  if (!aparte.length) return siempre;
  return `En bancos, cajas fuertes y cajones: ${soles(d.enMano)}. Más ${aparte.join(" y ")}.`;
}

function tienes(caja: CajaProxima, href: string | null, desglose?: DesgloseTienes | null, claure?: { saldo: number } | null): Respuesta {
  const base = { clave: "tienes" as const, chips: [] as Chip[], ...(href ? { href } : {}) };
  if (caja.tipo === "cayla") {
    const estado = estadoDeCaja(caja);
    const chips: Chip[] = [];
    if (caja.provisional) chips.push({ texto: "Provisional", tono: "pizarra" });
    if (estado) chips.push({ texto: estado.texto, tono: estado.tono });
    // Solo CAYLA entera: una sede no lleva los bancos ni las máquinas, donde cae lo que se le debe a Claudia.
    if (claure) chips.push(...chipsDisponible(caja.saldoHoy, claure.saldo));
    return { ...base, pregunta: "¿Cuánto tienes?", valor: caja.saldoHoy, detalle: detalleDeTienes(desglose), chips };
  }
  if (caja.tipo === "sede") {
    const pregunta = caja.vende ? `¿Cuánto efectivo tienes en ${caja.nombre}?` : "¿Cuánto efectivo tienes?";
    if (caja.efectivo === null) return { ...base, pregunta, valor: null, motivo: "Tu cuenta no ve el efectivo de este lugar." };
    return { ...base, pregunta, valor: caja.efectivo, detalle: "En el cajón y la caja fuerte. Los bancos son de la empresa entera: se ven en «Todas las sedes».", chips: [] };
  }
  if (caja.tipo === "falla") return { ...base, pregunta: "¿Cuánto tienes?", valor: null, noSePudoLeer: true, motivo: "No se pudo leer la caja. Vuelve a cargar la página en un rato." };
  return { ...base, pregunta: "¿Cuánto tienes?", valor: null, motivo: "Tu cuenta no ve el saldo de la caja." };
}

function debes(r: ResumenFinanzas, href: string | null): Respuesta {
  const base = { clave: "debes" as const, pregunta: "¿Cuánto debes pagar pronto?", ...(href ? { href } : {}) };
  const d = debesPronto(r);
  if (!d) return { ...base, valor: null, chips: [], noSePudoLeer: r.porPagar.estado === "falla", motivo: r.porPagar.estado === "falla" ? "No se pudo leer lo que debes. Vuelve a cargar la página en un rato." : "Tu cuenta no ve lo que debes." };
  const dias = r.porPagar.estado === "ok" ? r.porPagar.datos.dias : 7;
  const vencido = d.vencidas.reduce((a, f) => a + f.saldo, 0);
  const partes: string[] = [];
  if (d.proximas.length) partes.push(`${d.proximas.length} ${d.proximas.length === 1 ? "deuda vence" : "deudas vencen"} en ${dias} días`);
  if (d.vencidas.length) partes.push(`${d.vencidas.length} ${d.vencidas.length === 1 ? "vencida" : "vencidas"} (${soles(vencido)})`);
  if (d.planilla) partes.push(`planilla ${soles(d.planilla.monto)}`);
  const chip: Chip = d.vencidas.length
    ? { texto: "Hay deudas vencidas", tono: "ambar" }
    : d.proximas.length || d.planilla
      ? { texto: "Vence pronto", tono: "pizarra" }
      : { texto: "Nada por vencer", tono: "verde" };
  return { ...base, valor: d.monto, detalle: partes.length ? `${partes.join("; ")}.` : `No vence nada en los próximos ${dias} días.`, chips: [chip] };
}

function deja(resp: RespuestaResumen): Respuesta {
  return { clave: "deja", pregunta: resp.pregunta, valor: resp.valor, ...(resp.motivo ? { motivo: resp.motivo } : {}), chips: resp.chips };
}

/** Las tres, en el orden en que una persona se las hace: lo que tiene, lo que debe, lo que gana. */
export function tresRespuestas({ r, caja, deja: resp, hrefDinero, hrefPorPagar, desglose, claure }: Entrada): [Respuesta, Respuesta, Respuesta] {
  return [tienes(caja, hrefDinero, desglose, claure), debes(r, hrefPorPagar), deja(resp)];
}

/**
 * La tarjeta de saldo con CLAURE (ADR-0560, actividad 4): debajo de las tres, lo que se le debe a Claudia (o, si se le pagó de más, lo que ella le debe a CAYLA).
 * No es una cuarta pregunta de las tres: solo aparece si hay algo de CLAURE y la cuenta lo ve. `null` en `saldo` = se cayó la lectura: lo dice, nunca un cero.
 */
export function respuestaDeClaure(saldo: number | null, href: string | null): Respuesta {
  const base = { clave: "claure" as const, chips: [] as Chip[], ...(href ? { href } : {}) };
  if (saldo === null) return { ...base, pregunta: "¿Cuánto le debes a CLAURE?", valor: null, noSePudoLeer: true, motivo: "No se pudo leer lo que se le debe a CLAURE. Vuelve a cargar la página en un rato." };
  const r = respuestaClaure(saldo);
  return { ...base, pregunta: r.pregunta, valor: r.valor, detalle: "Lo que CLAURE cobró en tus cuentas, menos lo devuelto, el IGV, la comisión del POS y lo que ya se le pagó." };
}
