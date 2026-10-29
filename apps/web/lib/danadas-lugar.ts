/**
 * El lugar físico de las prendas dañadas de una tienda (ADR-0564, actividad 2): reglas puras de «Dónde se dejan», sin React ni supabase.
 *
 * EL PROBLEMA. La cuarentena del sistema es un lugar lógico: no dice dónde está la prenda en la tienda. Cada sede marca el suyo
 * («perchero detrás de caja») con `definir_lugar_danadas` (`20261029031000_danadas_lugar_de_la_sede.sql`) y la pantalla lo repite
 * donde la colaboradora tiene la prenda en la mano.
 *
 * CONTRATO.
 *   PROMETE: decir qué falta para guardar el lugar (las MISMAS reglas que la base: 3 a 80 letras, o vacío para borrarlo); armar los
 *            argumentos de la RPC (sus nombres viven aquí y la prueba los fija contra la migración); y la frase «Déjala en: …».
 *   ASUME:   quien lo guarda ve Existencias y opera la sede (la base lo exige; la pantalla solo ofrece el botón a quien puede).
 *   NO HACE: no decide a quién se le muestra ni toca stock: es un texto de la sububicación cuarentena.
 */

import type { CampoDeGuia } from "./guia-campos";

export const RPC_DEFINIR_LUGAR_DANADAS = "definir_lugar_danadas";
/** @internal Lo lee solo su prueba, que lo cruza con la firma de la migración y con los argumentos que arma la pantalla. */
export const PARAMETROS_RPC_LUGAR = ["p_ubicacion_id", "p_lugar"] as const;

/** Entre 3 y 80 letras: la base exige lo mismo (`sububicaciones_lugar_valido`). */
export const MIN_LUGAR_DANADAS = 3;
export const MAX_LUGAR_DANADAS = 80;

/** Qué impide guardar el lugar, o null. Vacío NO es un problema: borra el lugar. */
export function problemaDeLugar(texto: string): string | null {
  const largo = texto.trim().length;
  if (largo === 0) return null;
  if (largo < MIN_LUGAR_DANADAS) return "Escribe al menos 3 letras, o déjalo vacío para quitarlo.";
  if (largo > MAX_LUGAR_DANADAS) return `Admite hasta ${MAX_LUGAR_DANADAS} caracteres.`;
  return null;
}

/** La guía del editor: el lugar (opcional, pero si se escribe debe ser válido) y quién lo hace. */
export function camposGuiaLugar(texto: string, responsableListo: boolean): CampoDeGuia[] {
  return [
    {
      id: "lugar",
      nombre: "Dónde se dejan",
      requerido: true,
      hecho: texto.trim().length >= MIN_LUGAR_DANADAS && problemaDeLugar(texto) === null,
      pendiente: problemaDeLugar(texto) ?? "Escribe dónde dejan las prendas dañadas.",
    },
    { id: "responsable", nombre: "Quién lo hace", requerido: true, hecho: responsableListo, pendiente: "Elige quién decide." },
  ];
}

export type ArgumentosDeLugar = { p_ubicacion_id: string; p_lugar: string };

export function argumentosDeLugar(ubicacionId: string, texto: string): ArgumentosDeLugar {
  return { p_ubicacion_id: ubicacionId, p_lugar: texto.trim() };
}

/** La frase que sigue a la prenda en la mano: «Déjala en: perchero detrás de caja.» Sin lugar marcado, null (no se inventa uno). */
export function fraseDejarEn(lugar: string | null | undefined): string | null {
  const l = lugar?.trim();
  return l ? `Déjala en: ${l}.` : null;
}
