// ===========================================================================
// El REVERSO del pase de un traslado (ADR-0355, opción D): lo que se hace con la caja al darle vuelta al pase.
//
// Qué modo toca según quién mira y en qué va la caja, qué dice su cabecera, qué sello le cae al confirmar y cómo se nombra
// lo que no cuadró («Faltó 1 Falda Renata S beige»). Puro y probado: el reverso solo dibuja. Quién puede qué sigue en las
// RPC (`confirmar_traslado`, `cerrar_traslado_con_diferencia`, `anular_traslado`); aquí solo se decide qué se ve.
//
// Conteo a ciegas (ADR-0239 D-130): en «contar», nada dice cuántas prendas venían. Lo enviado aparece recién en
// «comparar», después de «Terminé de contar».
// ===========================================================================

import type { CampoDeGuia } from "./guia-campos";
import { nombrePrenda, textoObligatorioValido, valorContado, type Conteos, type LecturaConteo, type LineaRecepcion } from "./traslados-recepcion-reglas";
import type { TonoPase } from "./traslados-pases-reglas";

/**
 * - `contar`: la caja te llega y está en camino; cuentas a ciegas.
 * - `comparar`: terminaste de contar; ves lo que venía al lado de lo que contaste, eliges dónde dejarlo y confirmas.
 * - `revisar`: se confirmó con diferencia; lo que coincidió ya entró y lo que no cuadra espera (al líder de la sede destino).
 * - `envio`: miras una caja que va en camino y no te toca contarla (la enviaste tú, o es entre otras sedes).
 * - `llegada`: la caja ya se cerró: lo que llegó, con su nota si la hubo.
 * - `anulada`: se anuló; el motivo y quién.
 */
export type ModoReverso = "contar" | "comparar" | "revisar" | "envio" | "llegada" | "anulada";

export function modoDelReverso(p: { estado: string; esDestino: boolean; terminoDeContar: boolean }): ModoReverso {
  if (p.estado === "anulada") return "anulada";
  if (p.estado === "en_transito") return p.esDestino ? (p.terminoDeContar ? "comparar" : "contar") : "envio";
  if (p.estado === "recibido_con_diferencia") return "revisar";
  return "llegada";
}

/** Una prenda de la caja con lo que venía y lo que se contó (en pantalla o ya guardado). */
type LineaComparable = Pick<LineaRecepcion, "varianteId" | "referencia" | "talla" | "color" | "cantidadEnviada" | "cantidadRecibida">;

/** Lo que no cuadró, nombrado: «Faltó 1 Falda Renata S beige», «Sobraron 2 Blusa Aurora M» y, si hay más, «… y 2 más».
 *  Vacío si todo coincide. La prueba ciega lo pidió así: «faltó algo» no le dice a nadie qué buscar en la caja. */
export function faltaQue(lineas: readonly LineaComparable[], conteos: Conteos = {}): string {
  const distintas = lineas.filter((l) => (valorContado(l, conteos) ?? 0) !== (l.cantidadEnviada ?? 0));
  if (distintas.length === 0) return "";
  const l = distintas[0];
  const d = (valorContado(l, conteos) ?? 0) - (l.cantidadEnviada ?? 0);
  const n = Math.abs(d);
  const verbo = d < 0 ? (n === 1 ? "Faltó" : "Faltaron") : n === 1 ? "Sobró" : "Sobraron";
  const base = `${verbo} ${n} ${nombrePrenda(l)}`;
  return distintas.length > 1 ? `${base} y ${distintas.length - 1} más` : base;
}

/** La cabecera del reverso. */
export function tituloDelReverso(modo: ModoReverso, p: { numero: number; faltaQue: string }): string {
  switch (modo) {
    case "contar":
      return `Contando la caja Nº ${p.numero}`;
    case "comparar":
      return p.faltaQue || "Todo coincide";
    case "revisar":
      return p.faltaQue || "Falta revisar";
    case "envio":
      return "Lo que va en la caja";
    case "llegada":
      return "Lo que llegó";
    case "anulada":
      return "Se anuló";
  }
}

/** El color del reverso: el de lo que está pasando en él (en «comparar», ámbar si algo no cuadra). */
export function tonoDelReverso(modo: ModoReverso, p: { tonoDelPase: TonoPase; hayDiferencia: boolean }): TonoPase {
  if (modo === "contar") return "contando";
  if (modo === "comparar") return p.hayDiferencia ? "revisar" : "cerrado";
  return p.tonoDelPase;
}

/** El botón de terminar mientras se cuenta: dice qué falta en vez de quedarse gris sin explicar (ADR-0350, ley 9). */
export function textoTerminar(lectura: Pick<LecturaConteo, "porContar">, terminar: { habilitado: boolean; motivo: string | null }): string {
  if (terminar.habilitado) return "Terminé de contar";
  if (lectura.porContar > 0) return lectura.porContar === 1 ? "Falta 1 por contar" : `Faltan ${lectura.porContar} por contar`;
  return terminar.motivo ?? "Terminé de contar";
}

/** Lo que el sello dice al confirmar: RECIBIDA si todo coincidió; FALTÓ ALGO si algo espera revisión. */
export function selloAlConfirmar(lectura: Pick<LecturaConteo, "conDiferencia">): { texto: string; tono: TonoPase } {
  return lectura.conDiferencia.length === 0 ? { texto: "RECIBIDA", tono: "cerrado" } : { texto: "FALTÓ ALGO", tono: "revisar" };
}

// ---------------------------------------------------------------------------------------------------------------
// La guía de foco del reverso (ADR-0284): sale de lo que la base ya exige, sin reglas nuevas.
// ---------------------------------------------------------------------------------------------------------------

/** Cerrar con diferencia: la base pide la nota (`textoObligatorioValido`, lo mismo que apaga el botón). */
export function camposCerrar(nota: string): CampoDeGuia[] {
  return [{ id: "nota-cierre", nombre: "Qué pasó con lo que falta", requerido: true, hecho: textoObligatorioValido(nota), pendiente: "Escribe qué pasó con lo que falta." }];
}

/** Anular un envío: el motivo (la base lo exige) y quién lo hace (ADR-0161, el combo Responsable). */
export function camposAnular(motivo: string, responsableListo: boolean): CampoDeGuia[] {
  return [
    { id: "motivo-anular", nombre: "Por qué la anulas", requerido: true, hecho: textoObligatorioValido(motivo), pendiente: "Escribe por qué la anulas." },
    { id: "responsable-anular", nombre: "Quién la anula", requerido: true, hecho: responsableListo, pendiente: "Elige quién la anula." },
  ];
}

/** Contar a ciegas: cada prenda enviada que todavía no entró al stock es un campo; «hecho» = ya tiene un número (0 incluido). Es la
 *  misma regla que apaga «Terminé de contar» (`puedeTerminar`: nada por contar); la prueba exige que coincidan. */
export function camposDelConteo(lineas: readonly LineaRecepcion[], conteos: Conteos): CampoDeGuia[] {
  return lineas
    .filter((l) => l.cantidadEnviada !== null && !l.ingresado)
    .map((l) => ({
      id: idCampoPrenda(l.varianteId),
      nombre: nombrePrenda(l),
      requerido: true,
      hecho: valorContado(l, conteos) !== null,
      pendiente: "Cuéntala: si no vino ninguna, pon 0.",
    }));
}

export const idCampoPrenda = (varianteId: string) => `prenda-${varianteId}`;
