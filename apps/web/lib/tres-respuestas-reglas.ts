import { estadoDeCaja, type CajaProxima } from "./caja-proxima-reglas";
import { soles } from "./flujo-caja-reglas";
import { debesPronto, type ResumenFinanzas } from "./resumen-finanzas-reglas";
import type { RespuestaResumen } from "./resumen-telar-reglas";

// Las tres respuestas de arriba del Resumen (Felipe 2026-10-26, spike «Resumen y campañas», opción A): ¿cuánto tienes?, ¿cuánto debes pagar pronto?
// y ¿cuánto te deja este mes? Una persona sin formación de finanzas las contesta de un vistazo, antes de leer nada más.
//
// Contrato. PROMETE: tres respuestas, siempre en el mismo orden, cada una con su cifra (o el motivo por el que no hay) y el contexto que la
// vuelve legible. NO CALCULA plata: cada cifra sale de donde ya vive (la caja, `debesPronto`, la respuesta del mes), así que el Resumen no
// puede decir en la tarjeta de arriba algo distinto de lo que dice abajo. ASUME: que `caja` ya viene armada con `cajaProxima`.
// Sin dato dice por qué (principio 9): nunca un cero que parezca un dato.

export type Tono = "verde" | "ambar" | "rojo" | "pizarra";
export type Chip = { texto: string; tono: Tono };
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
};

type Entrada = {
  r: ResumenFinanzas;
  caja: CajaProxima;
  /** La respuesta del mes (`respuestaResumen`), con el chip «de cada S/ 100» ya sumado si lo hay. */
  deja: RespuestaResumen;
  hrefDinero: string | null;
  hrefPorPagar: string | null;
};

function tienes(caja: CajaProxima, href: string | null): Respuesta {
  const base = { clave: "tienes" as const, chips: [] as Chip[], ...(href ? { href } : {}) };
  if (caja.tipo === "cayla") {
    const estado = estadoDeCaja(caja);
    const chips: Chip[] = [];
    if (caja.provisional) chips.push({ texto: "Provisional", tono: "pizarra" });
    if (estado) chips.push({ texto: estado.texto, tono: estado.tono });
    return { ...base, pregunta: "¿Cuánto tienes?", valor: caja.saldoHoy, detalle: "En cajones, cajas fuertes y bancos de toda la empresa.", chips };
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
export function tresRespuestas({ r, caja, deja: resp, hrefDinero, hrefPorPagar }: Entrada): [Respuesta, Respuesta, Respuesta] {
  return [tienes(caja, hrefDinero), debes(r, hrefPorPagar), deja(resp)];
}
