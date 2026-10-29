/**
 * «Salió a arreglar» (ADR-0564, actividad 4): reglas puras de la salida de una prenda dañada a arreglarse, sin React ni supabase.
 *
 * EL PROBLEMA. Una dañada pasaba de «en cuarentena» directo a «se arregló»: el tiempo que la prenda está FUERA de la tienda no existía en
 * el sistema. `sacar_danada_a_arreglar` (`20261029032000_danadas_salio_a_arreglar.sql`) marca la salida, con la ruta (cerca o el Taller
 * de CAYLA), y la lista dice «En arreglo · Taller · hace 3 días». La prenda no se mueve en el inventario: sigue en la cuarentena de la sede.
 *
 * CONTRATO.
 *   PROMETE: la lista de rutas (los valores del CHECK de la base), los argumentos de la RPC (sus nombres viven aquí y la prueba los fija
 *            contra la migración), la lectura segura de lo que trae la base y la frase «En arreglo · Taller · hace 3 días».
 *   ASUME:   quien la usa ve Existencias en la sede de la prenda (la base lo exige).
 *   NO HACE: no decide a dónde vuelve ni si se pudo arreglar (eso es de «Se arregló», actividad 5) ni toca stock.
 */

import type { CampoDeGuia } from "./guia-campos";

export const RPC_SACAR_A_ARREGLAR = "sacar_danada_a_arreglar";
/** @internal Lo lee solo su prueba, que lo cruza con la firma de la migración y con los argumentos que arma la pantalla. */
export const PARAMETROS_RPC_SACAR = ["p_id", "p_ruta", "p_nota"] as const;

export const MIN_NOTA_ARREGLO = 3;
export const MAX_NOTA_ARREGLO = 200;

/** Quién la arregla: depende del daño (Felipe, 2026-10-28). Los valores son los del CHECK `prendas_danadas_ruta_arreglo_valida`. */
export const RUTAS_ARREGLO = [
  { valor: "cerca", etiqueta: "Cerca de la tienda", corta: "Cerca" },
  { valor: "taller", etiqueta: "Taller de CAYLA", corta: "Taller" },
] as const;
export type RutaArreglo = (typeof RUTAS_ARREGLO)[number]["valor"];

/** @internal Lo lee solo su prueba, que lo cruza con la lista de la migración. */
export const VALORES_RUTA_ARREGLO: readonly RutaArreglo[] = RUTAS_ARREGLO.map((r) => r.valor);

/** Solo una ruta de la lista; lo raro (una fila de antes, una web más vieja que la base) es null. */
export function leerRutaArreglo(valor: unknown): RutaArreglo | null {
  return VALORES_RUTA_ARREGLO.find((v) => v === valor) ?? null;
}

/** Dónde está una prenda que salió a arreglarse (null: sigue en la tienda). */
export type EnArreglo = { desde: string; ruta: RutaArreglo };

/** Lo que trae la lectura de la salida: las dos columnas juntas o ninguna (la base lo garantiza con un CHECK). */
export function leerEnArreglo(desde: unknown, ruta: unknown): EnArreglo | null {
  const r = leerRutaArreglo(ruta);
  if (!r || typeof desde !== "string" || Number.isNaN(Date.parse(desde))) return null;
  return { desde, ruta: r };
}

/** Qué impide guardar la salida, o null. La nota es opcional; si se escribe vale lo mismo que en la base. */
export function problemaDeSalida(ruta: RutaArreglo | "", nota: string): string | null {
  if (!ruta) return "Elige quién la arregla.";
  const largo = nota.trim().length;
  if (largo > 0 && largo < MIN_NOTA_ARREGLO) return "Escribe al menos 3 letras, o déjalo vacío.";
  if (largo > MAX_NOTA_ARREGLO) return `Admite hasta ${MAX_NOTA_ARREGLO} caracteres.`;
  return null;
}

export function camposGuiaSalida(ruta: RutaArreglo | "", nota: string, responsableListo: boolean): CampoDeGuia[] {
  return [
    { id: "ruta", nombre: "Quién la arregla", requerido: true, hecho: ruta !== "", pendiente: "Elige quién la arregla." },
    {
      id: "nota",
      nombre: "Con quién va",
      requerido: false,
      hecho: nota.trim().length >= MIN_NOTA_ARREGLO,
      pendiente: problemaDeSalida(ruta, nota) && ruta ? (problemaDeSalida(ruta, nota) ?? "") : "",
    },
    { id: "responsable", nombre: "Quién lo hace", requerido: true, hecho: responsableListo, pendiente: "Elige quién decide." },
  ];
}

export type ArgumentosDeSalida = { p_id: string; p_ruta: RutaArreglo; p_nota?: string };

export function argumentosDeSalida(id: string, ruta: RutaArreglo, nota: string): ArgumentosDeSalida {
  const n = nota.trim();
  return n ? { p_id: id, p_ruta: ruta, p_nota: n } : { p_id: id, p_ruta: ruta };
}

export type RespuestaSalida = { ya_registrada: boolean; id: string; ruta: RutaArreglo };

/** Valida la forma del jsonb que devuelve la RPC; null si no calza. */
export function leerRespuestaSalida(data: unknown): RespuestaSalida | null {
  if (typeof data !== "object" || data === null) return null;
  const { ya_registrada, id, ruta } = data as Record<string, unknown>;
  const r = leerRutaArreglo(ruta);
  if (typeof ya_registrada !== "boolean" || typeof id !== "string" || !id || !r) return null;
  return { ya_registrada, id, ruta: r };
}

const DIA_MS = 86_400_000;

/** Cuántos días lleva fuera (0 si salió hoy; nunca negativo aunque el reloj del aparato esté atrasado). */
export function diasEnArreglo(desde: string, ahora: Date = new Date()): number {
  return Math.max(0, Math.floor((ahora.getTime() - Date.parse(desde)) / DIA_MS));
}

/** «En arreglo · Taller · hoy» / «… · hace 3 días»: lo que dice la fila de la lista. */
export function textoEnArreglo(e: EnArreglo, ahora: Date = new Date()): string {
  const dias = diasEnArreglo(e.desde, ahora);
  const hace = dias === 0 ? "salió hoy" : dias === 1 ? "hace 1 día" : `hace ${dias} días`;
  const ruta = RUTAS_ARREGLO.find((r) => r.valor === e.ruta)?.corta ?? e.ruta;
  return `En arreglo · ${ruta} · ${hace}`;
}

export function tituloExitoSalida(ruta: RutaArreglo): string {
  return ruta === "taller" ? "Anotado: salió al Taller de CAYLA" : "Anotado: salió a arreglarse";
}

/** Tras un corte de red no se sabe si se anotó: repetir es seguro (la misma ruta devuelve «ya estaba»). */
export const TEXTO_RED_SALIDA = "Se cortó la conexión y no sabemos si se anotó. Lo que escribiste sigue aquí: vuelve a tocar «Anotar la salida». Si ya se había guardado, no se repite.";

export const TEXTO_SALIDA_YA_ESTABA = "Esta prenda ya estaba marcada como «En arreglo». No se repitió.";

/** Lo que pasa al marcarla: el sistema no la mueve, solo anota que salió (la persona sí se la lleva). */
export const QUE_PASA_AL_SACAR = "Anota que la prenda sale de la tienda. Sigue sin venderse; cuando vuelva, marcas «Se arregló».";
