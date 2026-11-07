// Finanzas ▸ Cuentas y dinero ▸ Cuadrar con el banco, en «El telar» (Felipe 2026-10-23). Cada línea que anotó CAYLA en la cuenta
// se dibuja junto a la pregunta «¿está en el extracto?», unidas por un hilo que se vuelve verde al marcarla revisada. Es la
// opción (a) de la decisión D5: la base no guarda el estado de cuenta del banco, solo el saldo anotado (`conciliaciones`) y las
// líneas revisadas (`dinero_revisados`); subir el extracto queda para otra obra. Lógica pura: no decide qué cuadra (eso lo suma la
// base), solo en qué estado está cada par y qué banco mirar.

import { cuadra, type Conciliacion, type ConciliacionCuenta, type LineaConciliacion } from "./cuentas-dinero-reglas";
import { diaLima } from "./fechas-lima";
import { soles } from "./compras-reglas";
import { fechaCorta } from "./gastos-reglas";
import { leerMontoPlata } from "./monto-plata-reglas";
import type { CampoDeGuia } from "./guia-campos";

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

/** Las cuentas que se pueden cuadrar, en el orden de la lista: los bancos primero, y por nombre dentro de cada grupo. */
export function bancosParaCuadrar(cuentas: readonly ConciliacionCuenta[]): ConciliacionCuenta[] {
  return [...cuentas].sort((a, b) => Number(b.tipo === "banco") - Number(a.tipo === "banco") || a.nombre.localeCompare(b.nombre, "es"));
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

// ---- La guía de foco de «¿Qué saldo dice el banco?» (ADR-0284) ---------------------------------------------------------------

/**
 * Los campos del formulario de anotar el saldo, en el orden en que se llenan, para la guía de foco. No agrega reglas: «falta» es
 * lo mismo que hoy bloquea `anotar()` (`CuentasDinero.tsx`): quién lo hace, un saldo que se pueda leer y una fecha que no sea futura.
 */
export function camposDeAnotarSaldo(d: { responsableListo: boolean; saldo: string; fecha: string; hoy: string }): CampoDeGuia[] {
  const saldoLegible = d.saldo.trim() !== "" && leerMontoPlata(d.saldo) !== null;
  return [
    { id: "responsable", nombre: "Quién lo hace", requerido: true, hecho: d.responsableListo, pendiente: "Elige quién está anotando el saldo." },
    { id: "saldo", nombre: "Saldo del banco", requerido: true, hecho: saldoLegible, pendiente: "Escribe el saldo que muestra la banca por internet." },
    { id: "fecha", nombre: "Fecha", requerido: true, hecho: d.fecha !== "" && d.fecha <= d.hoy, pendiente: "Elige el día del saldo (hoy o antes)." },
  ];
}

// ---- Qué corte mirar: `?hasta=` -----------------------------------------------------------------------------------------------

/**
 * El corte que pide la URL (`?hasta=`), o nulo para el de hoy. Se ignora lo que no es una fecha, lo futuro y lo anterior al piso: el
 * inicio de la cuenta (`saldoDesde`) o, si no lo tiene, el inicio de Finanzas (`inicio_finanzas`). Antes de eso no hay movimientos, y
 * el período quedaba al revés («del 16 oct al 1 ene», /chaos 2026-10-23).
 */
export function hastaDeLaUrl(pedido: string | undefined, hoy: string, piso: string | null): string | null {
  if (!pedido || !/^\d{4}-\d{2}-\d{2}$/.test(pedido) || pedido > hoy) return null;
  if (piso && pedido < piso.slice(0, 10)) return null;
  return pedido;
}

/** «del 16 oct al 23 oct»; con el año si el período no es del año de hoy («del 2 dic 1899 al 1 ene 1900»), para que no se lea como
 *  de este año. */
export function textoPeriodo(desde: string, hasta: string, hoy: string): string {
  const conAnio = desde.slice(0, 4) !== hoy.slice(0, 4) || hasta.slice(0, 4) !== hoy.slice(0, 4);
  return `del ${fechaCorta(desde, conAnio)} al ${fechaCorta(hasta, conAnio)}`;
}

// ---- Lista de bancos y filtro de líneas (rediseño Felipe 2026-10-31, «B · Lista y detalle») ------------------------------------
// A la izquierda, cada banco con su estado de un vistazo; a la derecha, el detalle del elegido. Solo presentación: lo que cuadra lo
// sigue decidiendo la base; aquí se traduce lo que ya llega (`ConciliacionCuenta`) a una frase y un tono.

export type EstadoBanco = { texto: string; tono: "verde" | "ambar" | "pizarra" };

/** El estado de un banco en la lista: lo que falta revisar manda; si no, cómo cerró la última vez que se anotó su saldo. */
export function estadoDeBanco(c: Pick<ConciliacionCuenta, "pendientes" | "ultimaFecha" | "ultimaDiferencia">): EstadoBanco {
  if (c.pendientes > 0) return { texto: `${c.pendientes} por revisar`, tono: "ambar" };
  if (c.ultimaFecha === null) return { texto: "Falta el saldo", tono: "pizarra" };
  return cuadra(c.ultimaDiferencia) ? { texto: "Cuadra", tono: "verde" } : { texto: "No cuadra", tono: "ambar" };
}

/** «Última vez: 23 oct», o «Nunca se cuadró» si no se anotó nunca un saldo. */
export function textoUltimaVez(ultimaFecha: string | null): string {
  const dia = ultimaFecha ? diaLima(ultimaFecha) ?? ultimaFecha.slice(0, 10) : null;
  return dia ? `Última vez: ${fechaCorta(dia)}` : "Nunca se cuadró";
}

/** Las dos letras del círculo de un banco: «BCP Soles» → «BS», «BBVA» → «BB». */
export function inicialesDeBanco(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean);
  const letras = palabras.length > 1 ? palabras.slice(0, 2).map((p) => p[0]).join("") : (palabras[0] ?? "").slice(0, 2);
  return letras.toUpperCase();
}

export type FiltroLineas = "pendientes" | "revisadas" | "todas";

/** Cuántas líneas están revisadas y cuántas faltan, para la barra de avance y las pestañas del filtro. */
export function avanceDeLineas(lineas: readonly Pick<LineaConciliacion, "revisado" | "montoRevisado">[]): { total: number; revisadas: number; faltan: number; pct: number } {
  const revisadas = lineas.filter((l) => estadoPar(l) === "revisada").length;
  return { total: lineas.length, revisadas, faltan: lineas.length - revisadas, pct: lineas.length ? Math.round((revisadas / lineas.length) * 100) : 0 };
}

/** Las líneas que muestra el filtro: «por revisar» incluye las que cambiaron desde que se revisaron. */
export function filtrarLineas<L extends Pick<LineaConciliacion, "revisado" | "montoRevisado">>(lineas: readonly L[], filtro: FiltroLineas): L[] {
  if (filtro === "todas") return [...lineas];
  return lineas.filter((l) => (estadoPar(l) === "revisada") === (filtro === "revisadas"));
}
