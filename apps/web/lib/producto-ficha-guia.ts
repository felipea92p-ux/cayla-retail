// «Qué le falta a esta ficha» en Editar producto (ADR-0284, actualización c) — sin React ni red.
//
// CONTRATO
//   PROMETE: dado lo que la ficha muestra ahora, listar lo que le falta para estar COMPLETA —fotos, y tejido y patrón en una prenda
//            de tela—, en palabras de tienda y en el orden en que se ve en pantalla.
//   ASUME:   completar la ficha es RECOMENDADO, nunca obligatorio: nada de aquí bloquea guardar (eso lo deciden `revisar()` en
//            ProductoForm y la base). Es el equivalente de «Sigue aquí» del alta, pero para una prenda que ya existe.
//   NO HACE: no cuenta lo opcional de verdad (descripción, stock mínimo, temporada): una lista que regaña por todo deja de leerse.
//            Y una prenda descontinuada no se regaña: nadie completa lo que ya no se vende.
//
// Las fotos se cuentan con `vistaDeFotos` (la misma cuenta de «3 de 4 colores con foto»): un color sin foto propia que usa la de
// «Todos los colores» NO falta.

import { vistaDeFotos, type FotoLocal } from "./fotos-por-color-reglas";

export type IdPendiente = "tejido" | "patron" | "fotos";

export type PendienteFicha = {
  id: IdPendiente;
  /** Cómo se llama el campo: «Tejido». */
  nombre: string;
  /** Lo que dice el botón: «Foto de Beige», «Fotos de 3 colores». */
  etiqueta: string;
  /** La frase completa, para el `title` del botón y para el lector de pantalla. */
  detalle: string;
};

export type EntradaFicha = {
  /** `false` = descontinuada: no hay nada que completar. */
  activa: boolean;
  /** La familia de la categoría lleva tejido y patrón (Indumentaria). */
  pideTejidoPatron: boolean;
  hayTejidos: boolean;
  hayPatrones: boolean;
  tejidoId: string;
  patronId: string;
  /** Los colores que la prenda vende hoy (variantes activas). */
  colores: readonly (string | null)[];
  fotos: readonly Pick<FotoLocal, "colorCodigo" | "clientKey" | "esPrincipal">[];
  nombreColor: (codigo: string) => string;
};

/** Lista con «y» antes del último: «Azul denim, Beige y Mostaza». */
function lista(nombres: readonly string[]): string {
  return new Intl.ListFormat("es", { type: "conjunction" }).format(nombres);
}

/** Lo que le falta a la ficha, en el orden de pantalla (tejido y patrón arriba, fotos después). Vacío = completa. */
export function pendientesDeFicha(e: EntradaFicha): PendienteFicha[] {
  if (!e.activa) return [];
  const out: PendienteFicha[] = [];

  if (e.pideTejidoPatron && e.hayTejidos && !e.tejidoId) {
    out.push({ id: "tejido", nombre: "Tejido", etiqueta: "Tejido", detalle: "Le falta el tejido: una prenda de tela lo lleva." });
  }
  if (e.pideTejidoPatron && e.hayPatrones && !e.patronId) {
    out.push({ id: "patron", nombre: "Patrón", etiqueta: "Patrón", detalle: "Le falta el patrón (si no tiene diseño, elige Liso)." });
  }

  const vista = vistaDeFotos(e.colores, e.fotos);
  if (vista.total === 0) {
    // Sin colores la prenda tiene una sola tarjeta, la general.
    if (e.fotos.length === 0) out.push({ id: "fotos", nombre: "Fotos", etiqueta: "Foto", detalle: "La prenda todavía no tiene foto." });
  } else {
    const sinFoto = vista.tarjetas.filter((t) => t.estado === "sin-foto").map((t) => e.nombreColor(t.codigo));
    if (sinFoto.length === 1) {
      out.push({ id: "fotos", nombre: "Fotos", etiqueta: `Foto de ${sinFoto[0]}`, detalle: `${sinFoto[0]} todavía no tiene foto.` });
    } else if (sinFoto.length > 1) {
      out.push({ id: "fotos", nombre: "Fotos", etiqueta: `Fotos de ${sinFoto.length} colores`, detalle: `Todavía sin foto: ${lista(sinFoto)}.` });
    }
  }
  return out;
}
