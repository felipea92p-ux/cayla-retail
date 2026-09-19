import type { CodigoDescuento } from "./codigos-descuento";
import { vigenciaDe } from "./etiqueta-vigencia";
import { diasEntreFechas } from "./fechas-lima";
import { fechaCorta } from "./compras-reglas";

// Reglas de la vista Códigos de descuento (spec §6 y §9, ADR-0124): en qué estado está cada código,
// en qué orden van, con qué chip, qué línea de detalle y qué vigencia dice. Puras y sin servidor:
// «hoy» entra por parámetro (la fecha de Lima, `hoyLima`, la misma con la que `registrar_venta`
// valida el código al cobrar, `fn_hoy_lima()`), así el estado que se ve es el que se aplica.

/** Un código vence «pronto» si le quedan hasta este número de días. */
export const DIAS_CODIGO_POR_VENCER = 7;

/** El estado que ve la persona. `apagado` manda sobre todo: un código apagado no funciona sin
 *  importar sus fechas. Los otros salen de la vigencia contra «hoy». */
export type EstadoDelCodigo = "vigente" | "porVencer" | "programado" | "vencido" | "apagado";

type CodigoParaEstado = Pick<CodigoDescuento, "activo" | "vigenteDesde" | "vigenteHasta">;

export function estadoDelCodigo(c: CodigoParaEstado, hoy: string): EstadoDelCodigo {
  if (!c.activo) return "apagado";
  const vigencia = vigenciaDe(c.vigenteDesde, c.vigenteHasta, hoy);
  if (vigencia?.estado === "proxima") return "programado";
  if (vigencia?.estado === "terminada") return "vencido";
  return c.vigenteHasta && diasEntreFechas(hoy, c.vigenteHasta) <= DIAS_CODIGO_POR_VENCER ? "porVencer" : "vigente";
}

export type ResumenDeCodigos = { vigentes: number; porVencer: number; programados: number; vencidos: number; apagados: number };

/** Las cuentas de las tarjetas. `vigentes` son los que funcionan hoy, incluidos los que vencen
 *  pronto (`porVencer` es un subconjunto de ellos); `programados` empiezan más adelante. */
export function resumenDeCodigos(codigos: CodigoParaEstado[], hoy: string): ResumenDeCodigos {
  const cuenta: Record<EstadoDelCodigo, number> = { vigente: 0, porVencer: 0, programado: 0, vencido: 0, apagado: 0 };
  for (const c of codigos) cuenta[estadoDelCodigo(c, hoy)] += 1;
  return { vigentes: cuenta.vigente + cuenta.porVencer, porVencer: cuenta.porVencer, programados: cuenta.programado, vencidos: cuenta.vencido, apagados: cuenta.apagado };
}

/** Compara dos textos que pueden faltar: el que falta va al final, sea cual sea el sentido. */
function comparar(a: string | null, b: string | null, sentido: 1 | -1): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return sentido * (a < b ? -1 : 1);
}

const GRUPO: Record<EstadoDelCodigo, number> = { porVencer: 0, vigente: 1, programado: 2, vencido: 3, apagado: 4 };

/** El orden de la lista: «excepciones primero», sin filtro que haya que recordar aplicar. Primero los
 *  que vencen pronto (el que vence antes, primero), luego los vigentes, los programados (el que
 *  empieza antes, primero), los vencidos (el que venció más recién, primero) y al final los apagados.
 *  El desempate siempre es el más nuevo. Las fechas son `aaaa-mm-dd`, así que comparan como texto.
 *  No modifica el arreglo que recibe. */
export function ordenarCodigos(codigos: CodigoDescuento[], hoy: string): CodigoDescuento[] {
  return [...codigos].sort((a, b) => {
    const ga = GRUPO[estadoDelCodigo(a, hoy)];
    const gb = GRUPO[estadoDelCodigo(b, hoy)];
    if (ga !== gb) return ga - gb;
    const porFecha =
      ga === 0 ? comparar(a.vigenteHasta, b.vigenteHasta, 1) : ga === 2 ? comparar(a.vigenteDesde, b.vigenteDesde, 1) : ga === 3 ? comparar(a.vigenteHasta, b.vigenteHasta, -1) : 0;
    return porFecha || comparar(a.createdAt, b.createdAt, -1);
  });
}

export type ChipDeCodigo = { tono: "verde" | "ambar" | "neutro" | "apagado"; texto: string };

// Ningún rojo: `MAX_ROJO_POR_PANTALLA` es 2 y un código vencido no es una falla, es orden por hacer.
const CHIP: Record<EstadoDelCodigo, ChipDeCodigo> = {
  vigente: { tono: "verde", texto: "Vigente" },
  porVencer: { tono: "ambar", texto: "Por vencer" },
  programado: { tono: "neutro", texto: "Programado" },
  vencido: { tono: "apagado", texto: "Vencido" },
  apagado: { tono: "apagado", texto: "Apagado" },
};

export function chipDelCodigo(c: CodigoParaEstado, hoy: string): ChipDeCodigo {
  return CHIP[estadoDelCodigo(c, hoy)];
}

/** La línea de abajo del chip: cuándo vence, cuándo empieza o hace cuánto venció. Un código apagado
 *  o vigente sin fecha límite no dice nada. `urgente` la pide en ámbar (vence pronto). */
export function detalleDelCodigo(c: CodigoParaEstado, hoy: string): { texto: string; urgente: boolean } | null {
  switch (estadoDelCodigo(c, hoy)) {
    case "porVencer":
    case "vigente": {
      if (!c.vigenteHasta) return null;
      const dias = diasEntreFechas(hoy, c.vigenteHasta);
      const texto = dias === 0 ? "Vence hoy" : dias === 1 ? "Vence mañana" : `Vence en ${dias} d`;
      return { texto, urgente: estadoDelCodigo(c, hoy) === "porVencer" };
    }
    case "programado": {
      const dias = diasEntreFechas(hoy, c.vigenteDesde as string);
      return { texto: dias === 1 ? "Empieza mañana" : `Empieza en ${dias} d`, urgente: false };
    }
    case "vencido": {
      const dias = diasEntreFechas(c.vigenteHasta as string, hoy);
      return { texto: dias === 1 ? "Venció ayer" : `Venció hace ${dias} d`, urgente: false };
    }
    default:
      return null;
  }
}

/** La vigencia tal como se lee en la columna: «Sin fecha límite», «Hasta 31/12/2026», «Desde 01/10/2026»
 *  o «01/10/2026 — 31/12/2026». Las fechas son `aaaa-mm-dd` y se leen tal cual, sin pasar por un `Date`
 *  (que a medianoche UTC caería en el día anterior de Lima). */
export function textoDeVigencia(c: Pick<CodigoDescuento, "vigenteDesde" | "vigenteHasta">): string {
  if (!c.vigenteDesde && !c.vigenteHasta) return "Sin fecha límite";
  if (c.vigenteDesde && c.vigenteHasta) return `${fechaCorta(c.vigenteDesde)} — ${fechaCorta(c.vigenteHasta)}`;
  return c.vigenteHasta ? `Hasta ${fechaCorta(c.vigenteHasta)}` : `Desde ${fechaCorta(c.vigenteDesde)}`;
}
