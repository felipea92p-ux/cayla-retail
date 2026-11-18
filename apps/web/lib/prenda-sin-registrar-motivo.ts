// Por qué la caja anota una prenda a mano (migración 20261106233000; Felipe, 2026-11-06). Sin React ni red.
//
// EL PROBLEMA PRIMERO. Con todo etiquetado, 1 de cada 3 prendas vendidas en AQP y 1 de cada 7 en TRU seguían entrando como «Prenda sin
// registrar», y la base no sabía por qué: si la pistola no lee, si faltó la etiqueta, si el sistema dice que no hay o si fue el apuro.
// Cada causa tiene otro arreglo; sin el motivo, no se sabe cuál toca.
//
// CONTRATO
//   PROMETE: los cinco motivos que eligió Felipe, en su orden; qué falta para poder agregar la línea (el motivo, y con «otro» el texto);
//            lo que viaja a `registrar_venta` (las mismas claves que lee la base); y cómo se lee un motivo guardado.
//   ASUME:   los `valor` son exactamente los del candado `prendas_por_regularizar_motivo_valido` (la prueba lo cruza con la migración).
//   NO HACE: no decide nada del dinero ni del stock: el motivo es un dato para entender, no una regla de cobro.

export const MOTIVOS_SIN_REGISTRAR = [
  { valor: "pistola_no_lee", texto: "La pistola no la lee", detalle: "Tiene etiqueta, pero no la reconoce" },
  { valor: "sin_etiqueta", texto: "No tiene etiqueta", detalle: "Llegó al mostrador sin etiqueta" },
  { valor: "sistema_sin_stock", texto: "El sistema dice que no hay", detalle: "Sale agotada o en el almacén" },
  { valor: "cola", texto: "Había cola, fue más rápido", detalle: "Se anotó a mano por el apuro" },
  { valor: "otro", texto: "Otro motivo", detalle: "Escríbelo con tus palabras" },
] as const;

export type MotivoSinRegistrar = (typeof MOTIVOS_SIN_REGISTRAR)[number]["valor"];

/** Lo más largo que guarda la base del texto de «otro» (`left(…, 120)` en la migración). */
export const MAX_DETALLE_MOTIVO = 120;

export const FALTA_MOTIVO = "Elige por qué la anotas a mano";
export const FALTA_DETALLE_MOTIVO = "Escribe el motivo";

const VALORES = new Set<string>(MOTIVOS_SIN_REGISTRAR.map((m) => m.valor));
export const esMotivo = (v: string | null | undefined): v is MotivoSinRegistrar => Boolean(v && VALORES.has(v));

/** Lo que falta del motivo para poder agregar la línea; `null` si ya está. Con «otro», también el texto (sin blancos no cuenta). */
export function faltaEnMotivo(motivo: string | null | undefined, detalle: string | null | undefined): string | null {
  if (!esMotivo(motivo)) return FALTA_MOTIVO;
  if (motivo === "otro" && !(detalle ?? "").trim()) return FALTA_DETALLE_MOTIVO;
  return null;
}

/** Lo que viaja en la línea de `registrar_venta`: el texto solo con «otro», recortado como lo recorta la base. Sin motivo, nada. */
export function motivoParaRegistrar(motivo: string | null | undefined, detalle: string | null | undefined): { motivo_sin_registrar?: MotivoSinRegistrar; motivo_sin_registrar_detalle?: string } {
  if (!esMotivo(motivo)) return {};
  if (motivo !== "otro") return { motivo_sin_registrar: motivo };
  const texto = (detalle ?? "").trim().slice(0, MAX_DETALLE_MOTIVO).trim();
  return texto ? { motivo_sin_registrar: motivo, motivo_sin_registrar_detalle: texto } : { motivo_sin_registrar: motivo };
}

/** Cómo se lee un motivo guardado («La pistola no la lee», «Otro: …»); `null` si la venta no lo tiene (las de antes del 2026-11-06). */
export function textoDeMotivo(motivo: string | null | undefined, detalle: string | null | undefined): string | null {
  if (!esMotivo(motivo)) return null;
  if (motivo === "otro") return (detalle ?? "").trim() ? `Otro: ${(detalle ?? "").trim()}` : "Otro motivo";
  return MOTIVOS_SIN_REGISTRAR.find((m) => m.valor === motivo)!.texto;
}
