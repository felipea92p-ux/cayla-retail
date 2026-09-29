// La guía de foco para CUALQUIER conjunto de campos —un modal, una hoja, un formulario corto— (CLAUDE.md «Guía de foco», ADR-0284).
// Sin React ni red.
//
// CONTRATO
//   PROMETE: dada la lista de campos de un modal (cada uno con su «hecho» ya calculado), decir cuál está hecho, cuál es el que sigue
//            («ahora»), cuáles faltan y cuáles son opcionales; y qué le falta al modal para poder confirmar.
//   ASUME:   `hecho` y `requerido` salen de la validación REAL del modal (la misma regla que apaga su botón principal): este archivo
//            no inventa reglas de negocio. Lo «sugerido» avisa pero nunca bloquea.
//   NO HACE: no conoce pasos (para un formulario por pasos está `lib/alta-producto-guia.ts`, que usa los mismos estados) ni toca la
//            pantalla: lo dibuja `components/guia-de-foco/`.
//
// Un GRUPO («al menos un dato: DNI, nombre o WhatsApp») se modela como UN campo virtual —`identificacion`, hecho si alguno de los tres
// tiene algo— que envuelve a los controles del grupo: se ilumina el bloque entero, no un control a la suerte.

/** Cómo se ve un campo en la guía: la marca de su título y la luz sobre su control. */
export type EstadoCampo = "hecho" | "ahora" | "falta" | "opcional";

export type CampoDeGuia = {
  id: string;
  /** Como lo llama la persona: «Nombre». */
  nombre: string;
  /** Sin él no se puede confirmar (lo mismo que apaga el botón principal). */
  requerido: boolean;
  /** No bloquea, pero casi siempre se llena. */
  sugerido?: boolean;
  hecho: boolean;
  /** Lo que hay que hacer con él, en una frase: «Escribe el monto.». */
  pendiente: string;
};

/** Lo que falta hacer de un campo: requerido o sugerido, y sin hacer. */
const porHacer = (c: CampoDeGuia) => !c.hecho && (c.requerido || Boolean(c.sugerido));

/** El primer campo por hacer: es el que «sigue» (se ilumina). null si no queda nada. */
export function siguienteDe(campos: readonly CampoDeGuia[]): CampoDeGuia | null {
  return campos.find(porHacer) ?? null;
}

/** El estado de cada campo: hecho, el que sigue, los que faltan más adelante, y los opcionales. */
export function estadosDe(campos: readonly CampoDeGuia[]): Record<string, EstadoCampo> {
  const ahora = siguienteDe(campos)?.id;
  const out: Record<string, EstadoCampo> = {};
  for (const c of campos) out[c.id] = c.hecho ? "hecho" : c.id === ahora ? "ahora" : c.requerido || c.sugerido ? "falta" : "opcional";
  return out;
}

/** Lo que falta, en el orden de pantalla (incluye lo sugerido: quien mira el pie debe verlo). */
export function faltanDe(campos: readonly CampoDeGuia[]): CampoDeGuia[] {
  return campos.filter(porHacer);
}

/** ¿Se puede confirmar? Solo lo REQUERIDO cuenta; lo sugerido no bloquea. */
export function sePuedeConfirmar(campos: readonly CampoDeGuia[]): boolean {
  return !campos.some((c) => c.requerido && !c.hecho);
}

/** La frase para el botón principal apagado (`title`) o el lector de pantalla: «Falta: nombre y motivo». null si nada bloquea. */
export function fraseDeLoQueFalta(campos: readonly CampoDeGuia[]): string | null {
  const faltan = campos.filter((c) => c.requerido && !c.hecho);
  if (faltan.length === 0) return null;
  const lista = new Intl.ListFormat("es", { type: "conjunction" }).format(faltan.map((c) => c.nombre.toLocaleLowerCase("es")));
  return `${faltan.length === 1 ? "Falta" : "Faltan"}: ${lista}`;
}
