// La guía de foco de las hojas de Insumos del Taller: «Nuevo insumo» y «Ficha de la tela» (CLAUDE.md «Guía de foco», ADR-0284; ADR-0400, actividad 8e). Sin React ni red.
//
// CONTRATO
//   PROMETE: dado lo escrito en la hoja, la lista de campos con su «hecho» para que `useGuiaCampos` diga cuál está hecho, cuál sigue y qué falta antes del botón; y que `problemasDeInsumoNuevo` sea la ÚNICA
//            regla con la que la hoja decide si guarda (la guía y el botón no pueden contradecirla).
//   ASUME:   nada de negocio nuevo: el código y el nombre son obligatorios, la merma va de 0 a menos de 50 % y el mínimo es un número desde cero (lo mismo que ya pedía la hoja y la base);
//            `fn_actor_persona_id(true)` exige a alguien que firme.
//   NO HACE: no pinta ni toca la base. El tejido y el color son SUGERIDOS en una tela (de ellos vive la sugerencia de «Nueva orden») y nunca un candado; un avío no pide tejido.

import type { CampoDeGuia } from "./guia-campos";
import { CANTIDAD_ILEGIBLE, leerCantidad, unidadesPermitidas, type TipoInsumo, type UnidadInsumo } from "./insumos-reglas";
import { COSTO_UNITARIO_ILEGIBLE, numeroDeCostoUnitario } from "./monto-plata-reglas";

export type EntradaInsumoNuevo = {
  tipo: TipoInsumo;
  /** La unidad elegida; si falta no se revisa (la hoja siempre la trae). */
  unidad?: UnidadInsumo;
  codigo: string;
  nombre: string;
  /** En porcentaje, como se escribe («5»). Vacío = 0. */
  merma: string;
  minimo: string;
  tejidoId: string;
  colorCodigo: string;
  responsableListo: boolean;
};

const MENSAJE_FALTA = "Ponle un código y un nombre al insumo.";
const MENSAJE_MERMA = "La merma va de 0 % a menos de 50 %.";
const MENSAJE_MINIMO = "El mínimo es un número desde 0 (o déjalo vacío si no hay).";
const MENSAJE_UNIDAD = "Una tela se lleva siempre en metros.";

/** Lo que la hoja rechaza de lo escrito, en el orden en que lo dice. Vacío = se puede guardar. `tipo` y `unidad` son opcionales: el combo de la hoja ya no ofrece lo que la base rechazaría. */
export function problemasDeInsumoNuevo(e: Pick<EntradaInsumoNuevo, "codigo" | "nombre" | "merma" | "minimo"> & Partial<Pick<EntradaInsumoNuevo, "tipo" | "unidad">>): string[] {
  const problemas: string[] = [];
  if (!e.codigo.trim() || !e.nombre.trim()) problemas.push(MENSAJE_FALTA);
  // Se lee con `leerCantidad` (acepta «2,5»); lo que no se entiende es `null` y se rechaza, nunca se lee como 0.
  const mermaPct = e.merma.trim() === "" ? 0 : leerCantidad(e.merma);
  if (mermaPct === null || !(mermaPct >= 0 && mermaPct / 100 < 0.5)) problemas.push(MENSAJE_MERMA);
  if (e.minimo.trim() !== "" && leerCantidad(e.minimo) === null) problemas.push(MENSAJE_MINIMO);
  if (e.tipo && e.unidad && !unidadesPermitidas(e.tipo).includes(e.unidad)) problemas.push(MENSAJE_UNIDAD);
  return problemas;
}

export function camposDeInsumoNuevo(e: EntradaInsumoNuevo): CampoDeGuia[] {
  const malaMerma = problemasDeInsumoNuevo({ codigo: "x", nombre: "x", merma: e.merma, minimo: "" }).length > 0;
  const malMinimo = problemasDeInsumoNuevo({ codigo: "x", nombre: "x", merma: "", minimo: e.minimo }).length > 0;
  const mermaEscrita = e.merma.trim() !== "";
  const minimoEscrito = e.minimo.trim() !== "";
  const esTela = e.tipo === "tela";
  return [
    { id: "codigo", nombre: "Código", requerido: true, hecho: e.codigo.trim() !== "", pendiente: "Ponle un código al insumo." },
    { id: "nombre", nombre: "Nombre", requerido: true, hecho: e.nombre.trim() !== "", pendiente: "Ponle un nombre al insumo." },
    // Lo recomendado que no bloquea: de él vive la sugerencia de «Nueva orden» (la tela del color de la prenda).
    ...(esTela ? [{ id: "tejido", nombre: "De qué tejido es", requerido: false, sugerido: true, hecho: e.tejidoId !== "", pendiente: "Elige el tejido: «Nueva orden» lo usa para proponer la tela." }] : []),
    { id: "color", nombre: "De qué color es", requerido: false, sugerido: true, hecho: e.colorCodigo !== "", pendiente: "Elige el color: «Nueva orden» propone la tela del color de la prenda." },
    // Lo opcional solo exige algo cuando se escribió: un número roto se rechaza igual que en la hoja.
    { id: "minimo", nombre: "Mínimo", requerido: minimoEscrito, hecho: minimoEscrito && !malMinimo, pendiente: MENSAJE_MINIMO },
    { id: "merma", nombre: "Merma al cortar", requerido: mermaEscrita, hecho: mermaEscrita && !malaMerma, pendiente: MENSAJE_MERMA },
    { id: "quien", nombre: "Quién lo anota", requerido: true, hecho: e.responsableListo, pendiente: "Elige quién agrega este insumo." },
  ];
}

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
