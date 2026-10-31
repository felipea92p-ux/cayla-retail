// La guía de foco de las hojas de Insumos del Taller: «Ficha de la tela» e «Ingresar insumo» (CLAUDE.md «Guía de foco», ADR-0284; ADR-0400, actividad 8e). Sin React ni red.
//
// CONTRATO
//   PROMETE: dado lo escrito en la hoja, la lista de campos con su «hecho» para que `useGuiaCampos` diga cuál está hecho, cuál sigue y qué falta antes del botón, sin agregar ninguna regla de negocio propia.
//            (El alta de una tela vive en `tela-nueva-reglas.ts` y la de un avío en `avio-nuevo-reglas.ts` desde ADR-0580: «Nuevo insumo», la hoja que se validaba aquí, se retiró.)
//   ASUME:   nada de negocio nuevo: el código y el nombre son obligatorios, la merma va de 0 a menos de 50 % y el mínimo es un número desde cero (lo mismo que ya pedía la hoja y la base);
//            `fn_actor_persona_id(true)` exige a alguien que firme.
//   NO HACE: no pinta ni toca la base. El tejido y el color son SUGERIDOS en una tela (de ellos vive la sugerencia de «Nueva orden») y nunca un candado; un avío no pide tejido.

import type { CampoDeGuia } from "./guia-campos";
import { CANTIDAD_ILEGIBLE, leerCantidad, type TipoInsumo } from "./insumos-reglas";
import { COSTO_UNITARIO_ILEGIBLE, numeroDeCostoUnitario } from "./monto-plata-reglas";

export type EntradaFichaDeLaTela = { tipo: TipoInsumo; tejidoId: string; colorCodigo: string; responsableListo: boolean };

/** La ficha de una tela que ya existe: tejido y color (sugeridos, nunca un candado) y quién lo anota. */
export function camposDeFichaDeLaTela(e: EntradaFichaDeLaTela): CampoDeGuia[] {
  return [
    ...(e.tipo === "tela" ? [{ id: "tejido", nombre: "De qué tejido es", requerido: false, sugerido: true, hecho: e.tejidoId !== "", pendiente: "Elige el tejido: «Nueva orden» lo usa para proponer la tela." }] : []),
    { id: "color", nombre: "De qué color es", requerido: false, sugerido: true, hecho: e.colorCodigo !== "", pendiente: "Elige el color: «Nueva orden» propone la tela del color de la prenda." },
    { id: "quien", nombre: "Quién lo anota", requerido: true, hecho: e.responsableListo, pendiente: "Elige quién anota este cambio." },
  ];
}

export type EntradaIngresoDeInsumo = { tieneInsumo: boolean; cantidad: string; costo: string; responsableListo: boolean };

/** «Ingresar insumo» abre un lote: qué llegó, cuánta cantidad (mayor que cero) y a qué costo (desde cero; se escribe, aunque sea 0). La hoja no guarda con menos.
 *  La cantidad se lee con `leerCantidad` y el costo por unidad con `numeroDeCostoUnitario` (hasta 4 decimales: un botón a S/ 0.045): ambos aceptan la coma decimal, y lo que NO se entiende no es 0 sino «falta»
 *  (antes un costo de «2,5» se leía como 0 y el lote se abría gratis). */
export function ingresoListo(e: Pick<EntradaIngresoDeInsumo, "tieneInsumo" | "cantidad" | "costo">): boolean {
  const cantidad = leerCantidad(e.cantidad);
  const costo = numeroDeCostoUnitario(e.costo);
  return e.tieneInsumo && cantidad !== null && cantidad > 0 && e.costo.trim() !== "" && Number.isFinite(costo) && costo >= 0;
}

export function camposDeIngresoDeInsumo(e: EntradaIngresoDeInsumo): CampoDeGuia[] {
  const cantidad = leerCantidad(e.cantidad);
  const costo = numeroDeCostoUnitario(e.costo);
  const costoLegible = Number.isFinite(costo);
  return [
    { id: "insumo", nombre: "Qué llegó", requerido: true, hecho: e.tieneInsumo, pendiente: "Elige qué insumo llegó." },
    {
      id: "cantidad",
      nombre: "Cantidad",
      requerido: true,
      hecho: cantidad !== null && cantidad > 0,
      pendiente: e.cantidad.trim() !== "" && cantidad === null ? CANTIDAD_ILEGIBLE : "Escribe cuánto llegó (más de cero).",
    },
    {
      id: "costo",
      nombre: "Costo",
      requerido: true,
      hecho: e.costo.trim() !== "" && costoLegible && costo >= 0,
      pendiente: e.costo.trim() !== "" && !costoLegible ? COSTO_UNITARIO_ILEGIBLE : "Escribe el costo por unidad, sin IGV (0 si fue un regalo).",
    },
    { id: "quien", nombre: "Quién lo anota", requerido: true, hecho: e.responsableListo, pendiente: "Elige quién ingresa este lote." },
  ];
}
