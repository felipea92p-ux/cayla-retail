// La guía de foco de las hojas de Insumos del Taller: «Nuevo insumo» y «Ficha de la tela» (CLAUDE.md «Guía de foco», ADR-0284; ADR-0400, actividad 8e). Sin React ni red.
//
// CONTRATO
//   PROMETE: dado lo escrito en la hoja, la lista de campos con su «hecho» para que `useGuiaCampos` diga cuál está hecho, cuál sigue y qué falta antes del botón; y que `problemasDeInsumoNuevo` sea la ÚNICA
//            regla con la que la hoja decide si guarda (la guía y el botón no pueden contradecirla).
//   ASUME:   nada de negocio nuevo: el código y el nombre son obligatorios, la merma va de 0 a menos de 50 % y el mínimo es un número desde cero (lo mismo que ya pedía la hoja y la base);
//            `fn_actor_persona_id(true)` exige a alguien que firme.
//   NO HACE: no pinta ni toca la base. El tejido y el color son SUGERIDOS en una tela (de ellos vive la sugerencia de «Nueva orden») y nunca un candado; un avío no pide tejido.

import type { CampoDeGuia } from "./guia-campos";
import type { TipoInsumo } from "./insumos-reglas";

export type EntradaInsumoNuevo = {
  tipo: TipoInsumo;
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

/** Lo que la hoja rechaza de lo escrito, en el orden en que lo dice. Vacío = se puede guardar. */
export function problemasDeInsumoNuevo(e: Pick<EntradaInsumoNuevo, "codigo" | "nombre" | "merma" | "minimo">): string[] {
  const problemas: string[] = [];
  if (!e.codigo.trim() || !e.nombre.trim()) problemas.push(MENSAJE_FALTA);
  const mermaPct = e.merma.trim() === "" ? 0 : Number(e.merma) / 100;
  if (!(mermaPct >= 0 && mermaPct < 0.5)) problemas.push(MENSAJE_MERMA);
  if (e.minimo.trim() !== "" && !(Number(e.minimo) >= 0)) problemas.push(MENSAJE_MINIMO);
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
