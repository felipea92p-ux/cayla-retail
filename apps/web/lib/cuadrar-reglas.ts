// Finanzas ▸ Cuentas y dinero ▸ Cuadrar con el banco, en «El telar» (Felipe 2026-10-23). Cada línea que anotó CAYLA en la cuenta
// se dibuja junto a la pregunta «¿está en el extracto?», unidas por un hilo que se vuelve verde al marcarla revisada. Es la
// opción (a) de la decisión D5: la base no guarda el estado de cuenta del banco, solo el saldo anotado (`conciliaciones`) y las
// líneas revisadas (`dinero_revisados`); subir el extracto queda para otra obra. Lógica pura: no decide qué cuadra (eso lo suma la
// base), solo en qué estado está cada par y qué banco mirar.

import { cuadra, type Conciliacion, type ConciliacionCuenta, type LineaConciliacion } from "./cuentas-dinero-reglas";
import { soles } from "./compras-reglas";
import { fechaCorta } from "./gastos-reglas";

export type EstadoPar = "revisada" | "cambio" | "pendiente";

/** Revisada (el hilo verde); cambió desde que se revisó (hay que mirarla otra vez); o pendiente. */
export function estadoPar(l: Pick<LineaConciliacion, "revisado" | "montoRevisado">): EstadoPar {
  if (l.revisado) return "revisada";
  return l.montoRevisado !== null ? "cambio" : "pendiente";
}

/** Lo que dice el lado del banco de cada par, en palabras. */
export function textoLadoBanco(l: Pick<LineaConciliacion, "revisado" | "montoRevisado" | "revisadoPor">): string {
  switch (estadoPar(l)) {
    case "revisada":
      return l.revisadoPor ? `Está en el extracto · la revisó ${l.revisadoPor}` : "Está en el extracto";
    case "cambio":
      return `Cambió desde que se revisó (era ${soles(l.montoRevisado ?? 0)}): mírala otra vez`;
    default:
      return "¿Está en el extracto del banco?";
  }
}

/** Las cuentas que se pueden cuadrar, para elegir arriba: los bancos primero, con lo que falta revisar de cada uno. */
export function bancosParaCuadrar(cuentas: readonly ConciliacionCuenta[], elegidaId: string | null): { id: string; nombre: string; pendientes: number; elegida: boolean }[] {
  return [...cuentas]
    .sort((a, b) => Number(b.tipo === "banco") - Number(a.tipo === "banco") || a.nombre.localeCompare(b.nombre, "es"))
    .map((c) => ({ id: c.id, nombre: c.nombre, pendientes: c.pendientes, elegida: c.id === elegidaId }));
}

/** La respuesta de la cara: ¿cuadra esta cuenta con el banco? Con su tono, para el chip. */
export function respuestaCuadre(actual: Pick<Conciliacion, "cuenta" | "hasta" | "conciliacion" | "lineas">): { texto: string; tono: "verde" | "ambar" | "pizarra" } {
  const k = actual.conciliacion;
  const faltan = actual.lineas.filter((l) => estadoPar(l) !== "revisada").length;
  const enFecha = `al ${fechaCorta(actual.hasta)}`;
  if (k && cuadra(k.diferencia)) {
    return faltan === 0
      ? { texto: `${actual.cuenta.nombre} cuadra con el banco ${enFecha}.`, tono: "verde" }
      : { texto: `El saldo coincide ${enFecha}; faltan revisar ${faltan} ${faltan === 1 ? "línea" : "líneas"}.`, tono: "ambar" };
  }
  if (k) return { texto: `No cuadra ${enFecha}: hay ${soles(Math.abs(k.diferencia))} de diferencia con el banco.`, tono: "ambar" };
  return faltan === 0
    ? { texto: `Todo revisado ${enFecha}: anota el saldo del banco para saber si cuadra.`, tono: "pizarra" }
    : { texto: `Faltan revisar ${faltan} ${faltan === 1 ? "línea" : "líneas"} y anotar el saldo del banco.`, tono: "pizarra" };
}
