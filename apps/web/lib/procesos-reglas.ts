import { FASES, type FaseClave, type FaseDelCatalogo, type Quien } from "./orden-fases-reglas";

// El catálogo de procesos del Taller (ADR-0570, actividad 5): las reglas puras de darlo de alta, renombrarlo y apagarlo. Sin React ni Supabase.
//
// LA BASE MANDA: `guardar_proceso_produccion` (migración 20261029210000) valida todo otra vez y rechaza con su `hint`. Aquí se adelanta en la pantalla lo mismo que va a
// rechazar —el nombre vacío o largo, el repetido sin tildes ni mayúsculas, apagar uno de la espina—, sin agregar reglas: `lib/procesos-reglas.test.ts` lee la migración y exige
// que cada `hint` exista allá.
//
// CONTRATO
//   PROMETE: que si `problemaDeNombreDeProceso` no dice nada, la base no rechaza el nombre; que la clave de «Otro proceso…» no choca con ninguna clave real.
//   NO HACE: no decide el lugar de un proceso en la ruta (lo calcula la base entre sus vecinos) ni quién puede darlo de alta (la base: `proceso_solo_lider`).

export const RPC_GUARDAR_PROCESO = "guardar_proceso_produccion";
/** La opción «Otro proceso…» del combo: no tiene forma de clave (`^[a-z][a-z0-9_]+$`), así nunca choca con un proceso del catálogo. */
export const OTRO_PROCESO = "__otro__";
/** El tope de la base: `length(nombre) <= 40`. */
export const NOMBRE_MAXIMO = 40;
/** El tope de la base: `length(ayuda) <= 160`. */
export const AYUDA_MAXIMA = 160;

/** El nombre como lo compara la base para decir «repetido»: sin tildes, mayúsculas ni signos («CONTROL FINAL!» es «Control final»). */
export function nombreComparable(nombre: string): string {
  return nombre
    .toLowerCase()
    .replace(/[áéíóúüñ]/g, (c) => ({ á: "a", é: "e", í: "i", ó: "o", ú: "u", ü: "u", ñ: "n" })[c] ?? c)
    .replace(/[^a-z0-9]+/g, "");
}

/** Lo que la base rechazaría del nombre (`proceso_nombre_invalido`, `proceso_repetido`), o `null`. `clave` es el proceso que se renombra (no choca consigo mismo). */
export function problemaDeNombreDeProceso(nombre: string, catalogo: ReadonlyArray<Pick<FaseDelCatalogo, "clave" | "nombre">>, clave: FaseClave | null = null): string | null {
  const limpio = nombre.trim().replace(/\s+/g, " ");
  if (limpio === "") return "Escribe el nombre del proceso.";
  if (limpio.length > NOMBRE_MAXIMO) return `El nombre va en hasta ${NOMBRE_MAXIMO} letras.`;
  const repetido = catalogo.find((p) => p.clave !== clave && nombreComparable(p.nombre) === nombreComparable(limpio));
  return repetido ? `Ya hay un proceso que se llama «${repetido.nombre}».` : null;
}

/** «Va después de», de fábrica: Costura si la orden la tiene (un proceso nuevo casi siempre va sobre la prenda armada); si no, el penúltimo paso de la ruta. */
export function despuesDeEnLaRuta(fases: ReadonlyArray<{ clave: FaseClave; secuencia: number }>): FaseClave {
  const ruta = [...fases].sort((a, b) => a.secuencia - b.secuencia);
  if (ruta.some((f) => f.clave === "costura")) return "costura";
  return ruta.at(-2)?.clave ?? ruta.at(-1)?.clave ?? "costura";
}

/** ¿Se puede apagar? Lo de la espina va en toda orden de su ruta (`proceso_espina`). */
export function sePuedeApagar(p: Pick<FaseDelCatalogo, "siempre" | "activo">): boolean {
  return p.activo && !p.siempre;
}

export type EntradaDeProceso = { clave: FaseClave | null; nombre: string; ayuda: string; quien: Quien; despuesDe: FaseClave };

/** Lo que la base rechazaría de lo escrito, en el orden en que la base lo mira. Vacío = la base lo aceptaría. */
export function problemasDeProceso(e: EntradaDeProceso, catalogo: ReadonlyArray<FaseDelCatalogo> = FASES): { campo: "nombre" | "ayuda" | "despues"; texto: string }[] {
  const problemas: { campo: "nombre" | "ayuda" | "despues"; texto: string }[] = [];
  const nombre = problemaDeNombreDeProceso(e.nombre, catalogo, e.clave);
  if (nombre) problemas.push({ campo: "nombre", texto: nombre });
  if (e.ayuda.trim().length > AYUDA_MAXIMA) problemas.push({ campo: "ayuda", texto: `La explicación va en una línea, de hasta ${AYUDA_MAXIMA} letras.` });
  if (e.clave === null && !catalogo.some((p) => p.clave === e.despuesDe)) problemas.push({ campo: "despues", texto: "Elige después de qué proceso va." });
  return problemas;
}

/** Los argumentos de `guardar_proceso_produccion`. Al editar no se manda el lugar (no cambia nunca); al crear no se manda la clave (la base la saca del nombre). */
export function argumentosDeProceso(e: EntradaDeProceso, activo: boolean | null = null) {
  return {
    p_nombre: e.nombre.trim().replace(/\s+/g, " "),
    p_clave: e.clave,
    p_despues_de: e.clave === null ? e.despuesDe : null,
    p_ayuda: e.ayuda.trim() === "" ? null : e.ayuda.trim(),
    p_quien_sugerido: e.quien,
    p_activo: activo,
  };
}
