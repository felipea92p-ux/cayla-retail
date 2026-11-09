// Un estampado es un valor del eje color (ADR-0634, Felipe 2026-11-09).
//
// PROMETE: lógica pura de «Nuevo color» en su forma Estampado: qué patrones y qué colores se ofrecen, cómo se arma el nombre
//   («Floral» + «Azul marino» → «Floral azul marino»), de dónde sale su familia y su tono, y qué falta para crearlo.
// ASUME: `colores` es la lista que ya tiene la pantalla. El candado del nombre y del código sigue en la base.
// NO HACE: el patrón no se guarda en el color: solo ayuda a nombrarlo. El tono y la familia del estampado son los de su color
//   dominante, y por eso los filtros de color, la demanda y el plan del piso lo cuentan en esa familia sin saber que es un estampado.

import { nombreDeColor } from "./color-alta-reglas";
import { esHexValido } from "./color-parecido";
import { FAMILIAS_COLOR } from "./colores-familias";
import type { CampoDeGuia } from "./guia-campos";
import { fotoPrincipal } from "./inventario-reglas";
import { fotoDeVariante, type FotoCruda } from "./producto-fotos-reglas";

type ColorParaEstampado = { codigo: string; nombre: string; hex: string | null; familiaColor: string | null; tipo?: string | null };

export function esEstampado(color: { tipo?: string | null }): boolean {
  return color.tipo === "estampado";
}

/** El nombre del grupo de los estampados en la carta: `agruparPorFamilia` lo pone después de las familias y antes de «Varios colores». */
export const GRUPO_ESTAMPADOS = "estampados";

/**
 * En qué grupo de la carta va un color. Un estampado va con los estampados: un punto de su tono dominante no dice cuál es,
 * así que no puede mezclarse con los lisos. Solo es para dibujar la carta: lo que agrupa por familia sigue usando la del color dominante.
 */
export function familiaEnCarta(color: { tipo?: string | null; familiaColor?: string | null }): string | null {
  return esEstampado(color) ? GRUPO_ESTAMPADOS : (color.familiaColor ?? null);
}

/**
 * Los colores que pueden ser el dominante de un estampado: los que tienen tono y familia, y no son a su vez estampados.
 * «Multicolor» no tiene ni tono ni familia, así que no entra: justamente no dice qué color manda.
 */
export function coloresDominantes<C extends ColorParaEstampado>(colores: readonly C[]): C[] {
  return colores.filter((c) => !esEstampado(c) && esHexValido(c.hex) && FAMILIAS_COLOR.some((f) => f.valor === c.familiaColor));
}

/** «Liso» es un patrón del vocabulario, pero un estampado liso no existe. Se compara sin mayúsculas ni tildes: el vocabulario lo edita la gente. */
export function patronesDeEstampado<P extends { nombre: string }>(patrones: readonly P[]): P[] {
  return patrones.filter((p) => p.nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase() !== "liso");
}

/**
 * La foto que de verdad reconoce a un estampado entre los colores de su prenda. Un color sin foto propia hereda la General del modelo
 * (`fotoDeVariante`), y dos estampados con la misma foto no se distinguen por ella: en ese caso no se dibuja, y queda el punto y su nombre.
 */
export function fotoQueDistingue(fotoUrl: string | null | undefined, todas: readonly (string | null | undefined)[]): string | null {
  if (!fotoUrl) return null;
  return todas.filter((u) => u === fotoUrl).length === 1 ? fotoUrl : null;
}

/**
 * La foto de una fila de Existencias: los colores lisos siguen con la principal del modelo y un estampado lleva la suya (o la General),
 * nunca la de otro color: es lo único que lo reconoce.
 */
export function fotoDeLaFila(color: { codigo?: string | null; tipo?: string | null } | null | undefined, fotos: FotoCruda[] | null | undefined): string | null {
  return color && esEstampado(color) ? fotoDeVariante(fotos ?? [], color.codigo ?? null) : fotoPrincipal(fotos);
}

/** El nombre que se propone: el patrón y el color dominante, o vacío mientras falte uno de los dos. */
export function nombreDeEstampado(patron: string | null | undefined, colorDominante: string | null | undefined): string {
  if (!patron?.trim() || !colorDominante?.trim()) return "";
  return nombreDeColor(`${patron.trim()} ${colorDominante.trim().toLocaleLowerCase("es")}`);
}

/** El ejemplo de la caja del nombre: dice de qué sale el nombre según lo que ya se eligió (ADR-0290). */
export function ejemploDeEstampado(patron: string | null | undefined, colorDominante: string | null | undefined): string {
  if (patron?.trim() && !colorDominante?.trim()) return `${nombreDeColor(patron)} y su color`;
  if (!patron?.trim() && colorDominante?.trim()) return `Patrón y ${colorDominante.trim().toLocaleLowerCase("es")}`;
  return "Se arma con el patrón y el color";
}

/** Lo primero que le falta a un estampado, antes de las reglas de cualquier color; `null` si ya tiene lo suyo. */
export function faltaParaEstampado({ nombre, colorDominante }: { nombre: string; colorDominante: unknown }): string | null {
  if (!nombreDeColor(nombre)) return "Elige el patrón y el color, o escribe el nombre.";
  if (!colorDominante) return "Elige el color que más se ve.";
  return null;
}

/**
 * La guía de foco de la hoja «Nuevo color» (ADR-0284): sale de lo que `faltaParaEstampado` y `faltaParaCrear` ya piden. El patrón es sugerido:
 * solo ayuda a armar el nombre, y deja de pedirse si el nombre ya se escribió a mano o si los patrones no se pudieron leer.
 */
export function camposDeNuevoColor(c: { estampado: boolean; nombre: string; hexListo: boolean; patron: boolean; hayPatrones: boolean; dominante: boolean }): CampoDeGuia[] {
  const nombreHecho = nombreDeColor(c.nombre) !== "";
  if (!c.estampado) {
    return [
      { id: "nombre", nombre: "Nombre", requerido: true, hecho: nombreHecho, pendiente: "Escribe el nombre del color." },
      { id: "tono", nombre: "Tono", requerido: true, hecho: c.hexListo, pendiente: "Toca la muestra y elige el tono." },
    ];
  }
  return [
    ...(c.hayPatrones ? [{ id: "patron", nombre: "Patrón", requerido: false, sugerido: true, hecho: c.patron || nombreHecho, pendiente: "Elige el patrón: arma el nombre." }] : []),
    { id: "dominante", nombre: "El color que más se ve", requerido: true, hecho: c.dominante, pendiente: "Elige el color que más se ve." },
    { id: "nombre", nombre: "Nombre", requerido: true, hecho: nombreHecho, pendiente: "Elige el patrón y el color, o escribe el nombre." },
  ];
}

