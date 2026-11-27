import type { EstadoCampo } from "./guia-campos";

// Los tres pasos de «Nueva orden» (Producción más clara, Felipe 2026-11-26). Puro: sin React.
//
// EL PROBLEMA. El formulario era una sola columna de campos: quien entraba por primera vez no veía por dónde empezar ni cuánto faltaba. Ahora lo mismo de siempre va bajo tres títulos
// con número («Qué se fabrica», «Cuántas, por talla y color», «Fases, tela y entrega»), y cada título dice cómo va su paso.
//
// CONTRATO
//   PROMETE: que el estado de un paso sale SOLO de lo que la guía de foco ya sabe de sus campos (`estadosDe` de `guia-campos.ts`): un paso «sigue» si tiene el campo que la guía
//            señala, está «hecho» si no le falta nada y tiene algo hecho, y si no, queda «pendiente». Que todo campo de la guía de la orden pertenece a un paso (lo exige la prueba).
//   NO HACE: no agrega reglas. Qué se puede confirmar lo sigue decidiendo `camposDeGuiaOrden`; aquí solo se agrupa y se nombra.

export type EstadoDelPaso = "hecho" | "sigue" | "pendiente";

export type ClaveDePaso = "modelo" | "cantidades" | "resto";

export const PASOS_DE_LA_ORDEN: Record<ClaveDePaso, { numero: number; titulo: string }> = {
  modelo: { numero: 1, titulo: "Qué se fabrica" },
  cantidades: { numero: 2, titulo: "Cuántas, por talla y color" },
  resto: { numero: 3, titulo: "Fases, tela y entrega" },
};

/** Los campos de la guía de foco que viven en cada paso. Con un modelo que ya existe el paso 1 es solo elegirlo; con uno nuevo, sus cinco datos. */
export function camposDelPaso(paso: ClaveDePaso, esNuevo: boolean): readonly string[] {
  if (paso === "modelo") return esNuevo ? ["tipo", "nombre", "categoria", "tallas", "precio"] : ["modelo"];
  if (paso === "cantidades") return ["cantidades"];
  return ["fases", "tela"];
}

/**
 * Cómo va un paso, con los estados que la guía ya calculó para sus campos. `visto`: un paso que viene armado de fábrica (el 3: las fases de siempre, sin tela) solo lleva su visto
 * si la persona lo abrió; mientras no, conserva su número (regla 4 de la guía de foco: «solo lleva ✓ si la persona la visitó»).
 */
export function estadoDelPaso(estados: readonly EstadoCampo[], visto = true): EstadoDelPaso {
  if (estados.includes("ahora")) return "sigue";
  if (estados.includes("falta")) return "pendiente";
  return visto && estados.includes("hecho") ? "hecho" : "pendiente";
}

/** Lo que un lector de pantalla oye junto al título del paso (quien ve lo lee en el círculo y en la insignia). */
export const VOZ_DEL_PASO: Record<EstadoDelPaso, string> = { hecho: "Hecho", sigue: "Sigue", pendiente: "Pendiente" };

/** Lo que explica el «?» del paso 2. La raya solo se explica si la tabla tiene alguna; el número gris, solo si las ventas sugieren algo. */
export function ayudaDeCantidades(o: { hayRayas: boolean; conSugerencia: boolean }): string {
  return [
    "Escribe cuántas prendas van de cada talla y de cada color.",
    o.conSugerencia ? "El número gris de cada casilla es lo que piden las ventas." : null,
    o.hayRayas ? "Una raya (—) es una combinación que este modelo no tiene." : null,
  ]
    .filter((frase): frase is string => frase !== null)
    .join(" ");
}

/** Lo que explica el «?» del paso 3: por qué viene plegado y cuándo abrirlo. */
export const AYUDA_DEL_RESTO =
  "La orden ya trae las fases de siempre. Ábrelo si una fase sale a un servicio, para elegir la tela o para prometer una fecha. La tienda a la que va y «Es urgente» solo se anotan: el traslado se decide después y nada cambia de orden.";
