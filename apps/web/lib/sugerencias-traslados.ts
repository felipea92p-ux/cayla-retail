import { nombrePrenda, valorContado, type Conteos, type LineaRecepcion } from "./traslados-recepcion-reglas";

// Sugerencias del reverso del pase de Traslados (skill `/sugerir`, CLAUDE.md «Sugerencias coherentes»).
//
// El ejemplo de la nota al cerrar con diferencia nombra LA prenda que no cuadró y la sede que la mandó: es lo que la persona tiene
// delante («La Falda Ariana M rosado no vino en la caja; Taller la busca»). Uno genérico («La falda no vino») hablaría de una prenda
// que quizá ni está en la caja. Sin diferencia (no debería pasar al cerrar), un texto que no promete nada. Puro y estable.

type LineaNota = Pick<LineaRecepcion, "varianteId" | "referencia" | "talla" | "color" | "cantidadEnviada" | "cantidadRecibida">;

/** Lo que cabe en la caja de la nota de un celular sin cortarse a media palabra. */
export const MAX_EJEMPLO_NOTA = 80;

export function ejemploNotaCierre(lineas: readonly LineaNota[], conteos: Conteos, origen: string): string {
  const l = lineas.find((x) => (valorContado(x, conteos) ?? 0) !== (x.cantidadEnviada ?? 0));
  if (!l) return "Ej. Qué se buscó y qué pasó con lo que no llegó";
  const sobra = (valorContado(l, conteos) ?? 0) > (l.cantidadEnviada ?? 0);
  const completo = sobra ? `Ej. Llegó de más ${nombrePrenda(l)}; se avisó a ${origen}` : `Ej. ${nombrePrenda(l)} no vino en la caja; ${origen} la busca`;
  if (completo.length <= MAX_EJEMPLO_NOTA) return completo;
  return sobra ? `Ej. Llegó de más ${l.referencia}; se avisó a ${origen}` : `Ej. ${l.referencia} no vino en la caja; ${origen} la busca`;
}
