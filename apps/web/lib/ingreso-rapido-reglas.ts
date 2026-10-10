// Caja ▸ Registrar ingreso (Felipe 2026-10-10): la hermana del gasto rápido (ADR-0368), para la plata que ENTRA al cajón a mitad
// del turno y no es una venta. Sin React ni red.
//
// El problema: «Depósito o retiro» mezclaba entradas y salidas en un formulario de tipo + motivo + referencia, y para una entrada
// solo ofrecía «Otro». Lo que de verdad entra al cajón —el sencillo de la caja fuerte, la plata que trae el líder, lo que presta
// otra sede, lo que vuelve de un retiro— quedaba sin nombre, y al cerrar nadie sabía de dónde salió.
//
// CONTRATO
//   PROMETE: (1) a cada concepto, un motivo que `registrar_movimiento_caja` acepta (20261010160000; la prueba lee la migración);
//            (2) pedir lo que la base exige: «quién la trajo» y «qué sede» se guardan en la nota, que la base pide para esos dos
//            motivos y para «Otro»; (3) la guía de foco sale de lo mismo que `validarIngreso` bloquea (la prueba exige que coincidan).
//   ASUME:   entra en efectivo al cajón abierto, hoy. El sobrante es un ajuste: solo el líder lo ve (la base lo exige igual).
//   NO HACE: no registra un abono de apartado, una venta ni el reembolso de un proveedor: tienen su pantalla y su marca, y aquí se
//            contarían dos veces. La pantalla manda a su lugar.

import { parsearMonto } from "./gastos-reglas";
import type { CampoDeGuia } from "./guia-campos";

export type ClaveIngreso = "caja_fuerte" | "lider" | "otra_sede" | "vuelve_retiro" | "sobrante" | "otro";

/** Qué más pide el concepto para que el ingreso se pueda rastrear después. */
export type DetalleIngreso = "ninguno" | "quien" | "sede" | "que";

export type ConceptoIngreso = {
  clave: ClaveIngreso;
  /** Como lo dice la tienda, en la baldosa. */
  nombre: string;
  /** El motivo que se guarda en `caja_movimientos.motivo` (vocabulario cerrado de la base). */
  motivo: string;
  /** La línea bajo el mosaico al elegirlo: de dónde viene la plata. */
  deDonde: string;
  detalle: DetalleIngreso;
  /** Un ajuste de caja: solo el líder (`registrar_movimiento_caja` lo rechaza a los demás). */
  soloLider: boolean;
};

export const CONCEPTOS_INGRESO: readonly ConceptoIngreso[] = [
  {
    clave: "caja_fuerte",
    nombre: "Caja fuerte",
    motivo: "Sencillo de la caja fuerte",
    deDonde: "Viene de la caja fuerte de esta sede.",
    detalle: "ninguno",
    soloLider: false,
  },
  { clave: "lider", nombre: "Lo trae el líder", motivo: "Entrega del líder", deDonde: "La trae el líder de equipo: di quién.", detalle: "quien", soloLider: false },
  { clave: "otra_sede", nombre: "Otra sede", motivo: "Préstamo de otra sede", deDonde: "La presta otra tienda: di cuál.", detalle: "sede", soloLider: false },
  {
    clave: "vuelve_retiro",
    nombre: "Vuelve de un retiro",
    motivo: "Devolución de un retiro",
    deDonde: "Regresa plata que se sacó antes en este turno.",
    detalle: "ninguno",
    soloLider: false,
  },
  {
    clave: "sobrante",
    nombre: "Sobrante",
    motivo: "Ajuste de caja (sobrante)",
    deDonde: "Hay más plata de la que dice la caja: es un ajuste.",
    detalle: "ninguno",
    soloLider: true,
  },
  { clave: "otro", nombre: "Otro", motivo: "Otro", deDonde: "Di qué fue: así se entiende al cerrar.", detalle: "que", soloLider: false },
];

export const conceptoIngresoPorClave = (clave: string): ConceptoIngreso | null => CONCEPTOS_INGRESO.find((c) => c.clave === clave) ?? null;

/** Los conceptos que ve la cuenta: sin «Sobrante» si no es líder (la base lo rechazaría recién al guardar). */
export function conceptosIngresoVisibles(esLider: boolean): ConceptoIngreso[] {
  return CONCEPTOS_INGRESO.filter((c) => esLider || !c.soloLider);
}

export type SedeIngreso = { id: string; nombre: string };

export type EstadoIngresoRapido = {
  concepto: ClaveIngreso | "";
  monto: string;
  /** «Lo trae el líder»: quién la trajo. */
  quien: string;
  /** «Préstamo de otra sede»: cuál. */
  sedeId: string;
  /** «Otro»: qué fue. */
  otroTexto: string;
  nota: string;
};

export const INGRESO_RAPIDO_VACIO: EstadoIngresoRapido = { concepto: "", monto: "", quien: "", sedeId: "", otroTexto: "", nota: "" };

/** «Otro» y «quién la trajo» necesitan al menos esto para decir algo. */
export const MIN_TEXTO = 3;
/** Lo que guarda la nota como máximo (la nota del movimiento se lee en el cierre y en Actividad). */
export const MAX_NOTA_INGRESO = 200;

const lleno = (s: string) => s.trim().length >= MIN_TEXTO;

/** Lo que se teclea en el monto: dígitos y UN punto, dos decimales; la coma es decimal («0,50» son cincuenta céntimos). */
export function limpiarMontoIngreso(texto: string): string {
  const s = texto.replace(/,/g, ".").replace(/[^\d.]/g, "");
  const [entero, ...resto] = s.split(".");
  return resto.length ? `${entero}.${resto.join("").slice(0, 2)}` : entero;
}

/**
 * La nota que se guarda: primero lo que pide el concepto («Trajo: Sandra», «De Tienda Lima», lo que escribió en «Otro») y después
 * la nota libre, si la hay. `null` si no hay nada que guardar.
 */
export function notaDeIngreso(e: EstadoIngresoRapido, sedes: readonly SedeIngreso[]): string | null {
  const c = conceptoIngresoPorClave(e.concepto);
  const libre = e.nota.trim();
  let base = "";
  if (c?.detalle === "quien") base = e.quien.trim() ? `Trajo: ${e.quien.trim()}` : "";
  if (c?.detalle === "sede") {
    const sede = sedes.find((s) => s.id === e.sedeId);
    base = sede ? `De ${sede.nombre}` : "";
  }
  if (c?.detalle === "que") base = e.otroTexto.trim();
  const nota = [base, libre].filter(Boolean).join(" — ");
  return nota ? nota.slice(0, MAX_NOTA_INGRESO) : null;
}

/**
 * Los campos de la guía de foco (ADR-0284), sacados de lo mismo que `validarIngreso` bloquea; la prueba exige que coincidan.
 * El responsable lo suma la pantalla (lo sabe `useResponsable`).
 */
export function camposDeIngresoRapido(e: EstadoIngresoRapido): CampoDeGuia[] {
  const c = conceptoIngresoPorClave(e.concepto);
  const campos: CampoDeGuia[] = [
    { id: "concepto", nombre: "De dónde viene", requerido: true, hecho: c !== null, pendiente: "Toca de dónde viene la plata." },
  ];
  if (c?.detalle === "quien") campos.push({ id: "quien", nombre: "Quién la trajo", requerido: true, hecho: lleno(e.quien), pendiente: "Escribe quién la trajo." });
  if (c?.detalle === "sede") campos.push({ id: "sede", nombre: "Qué sede", requerido: true, hecho: e.sedeId !== "", pendiente: "Elige qué sede la presta." });
  if (c?.detalle === "que") campos.push({ id: "otro-texto", nombre: "Qué fue", requerido: true, hecho: lleno(e.otroTexto), pendiente: "Escribe qué fue." });
  campos.push({ id: "monto", nombre: "Cuánto", requerido: true, hecho: parsearMonto(e.monto).ok, pendiente: "Escribe cuánto entra." });
  campos.push({ id: "nota", nombre: "Nota", requerido: false, hecho: e.nota.trim() !== "", pendiente: "" });
  return campos;
}

export type ArgumentosIngreso = { p_tipo: "ingreso"; p_monto: number; p_motivo: string; p_nota: string | null };

/** La misma regla que la base, antes de enviar. El token y la caja los pone la pantalla. */
export function validarIngreso(
  e: EstadoIngresoRapido,
  sedes: readonly SedeIngreso[],
  esLider: boolean,
): { ok: true; valor: ArgumentosIngreso } | { ok: false; error: string } {
  const c = conceptoIngresoPorClave(e.concepto);
  if (!c) return { ok: false, error: "Toca de dónde viene la plata." };
  if (c.soloLider && !esLider) return { ok: false, error: "Un sobrante es un ajuste: lo registra un líder de equipo." };
  if (c.detalle === "quien" && !lleno(e.quien)) return { ok: false, error: "Escribe quién la trajo." };
  if (c.detalle === "sede" && !sedes.some((s) => s.id === e.sedeId)) return { ok: false, error: "Elige qué sede la presta." };
  if (c.detalle === "que" && !lleno(e.otroTexto)) return { ok: false, error: "Escribe qué fue." };
  const monto = parsearMonto(e.monto);
  if (!monto.ok) return { ok: false, error: monto.error };
  return { ok: true, valor: { p_tipo: "ingreso", p_monto: monto.valor, p_motivo: c.motivo, p_nota: notaDeIngreso(e, sedes) } };
}
