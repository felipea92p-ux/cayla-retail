import { contadasDe, type LineaParaContar } from "./recepcion-conteo-reglas";

// Recibir mirando el papel de la compra (rediseño de Compras simple, maqueta docs/maquetas/compras-formidable-2026-10/, Felipe 2026-10-23).
// Lo que la compradora anotó al comprar viene en las líneas del envío: la tienda las ve al lado de la foto
// del papel, con su estado, y la pregunta principal es «La compradora anotó Blusa × 12. ¿Son estas?». Contestar «Son estas» pone ese
// número en la línea, igual que escribirlo; nada de esto cambia qué se guarda ni cómo se cierra el envío.

export type EstadoAnotada = "contada" | "a-medias" | "pendiente";

/**
 * Lo que anotó la compradora: las líneas de la guía del envío. Un envío con papeles lo arma «Mandar a la tienda» (`mandar_compras_a_tienda`)
 * solo con lo comprado desde el celular, así que toda su guía es lo anotado; lo que la tienda agrega «fuera de la guía» no lo es. Quien la
 * llama lo hace solo cuando el envío trae papeles.
 */
export function lineasAnotadas(lineas: readonly LineaParaContar[]): LineaParaContar[] {
  return lineas.filter((l) => l.linea !== null && l.dijeron != null);
}

/** Cómo va una línea anotada: contada (llegó lo que dijeron), a medias (se contó otra cosa) o por contar. */
export function estadoAnotada(l: LineaParaContar): EstadoAnotada {
  if (l.conteo === null) return "pendiente";
  return contadasDe(l) >= (l.dijeron ?? 0) ? "contada" : "a-medias";
}

/** Cómo la llamó la compradora: la prenda que eligió, lo que escribió o, al menos, su categoría. */
export function nombreAnotado(l: LineaParaContar): string {
  return l.linea?.prendaElegida?.nombre ?? l.linea?.descripcion ?? l.categoria?.nombre ?? "Prenda";
}

/** La que sigue: la primera por contar que no se dejó para después con «Es otra prenda». */
export function siguienteAnotada(lineas: readonly LineaParaContar[], saltadas: ReadonlySet<string>): LineaParaContar | null {
  return lineasAnotadas(lineas).find((l) => estadoAnotada(l) === "pendiente" && !saltadas.has(l.clave)) ?? null;
}

/** «Llevas contadas 12 de 35»: lo contado de lo anotado contra lo que dijeron. */
export function avanceAnotado(lineas: readonly LineaParaContar[]): { contadas: number; total: number } {
  const anotadas = lineasAnotadas(lineas);
  return { contadas: anotadas.reduce((s, l) => s + contadasDe(l), 0), total: anotadas.reduce((s, l) => s + (l.dijeron ?? 0), 0) };
}
