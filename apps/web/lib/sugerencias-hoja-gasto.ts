// Lo que la hoja «Registrar gasto» sugiere en «Qué fue» sigue la categoría elegida (skill `/sugerir`, ADR-0290): con «Servicios
// básicos» dice «Ej. Luz», con «Transporte» dice «Ej. Mototaxi». Sale de los ejemplos que la propia categoría ya trae en la base
// (`categorias_gasto.ejemplos`, los mismos que ve el contador en Configuración), no de una tabla escrita aquí: una categoría que un
// Líder cree mañana trae sus ejemplos y la hoja los usa sin deploy. Sin categoría, un texto que no promete nada.

/** Lo más largo que cabe en la caja de «Qué fue» a 375 px sin cortarse a media palabra. */
const MAX_QUE_FUE = 34;

export const SUGERENCIA_NEUTRA_QUE_FUE = "Lo que dice el comprobante o lo que se pagó";

/** El primer ejemplo de la categoría («Luz, agua, teléfono» → «Ej. Luz»), con mayúscula y sin pasarse del ancho. */
export function sugerirQueFue(categoria: { ejemplos: string } | null): string {
  const primero = categoria?.ejemplos.split(/[,;]/)[0]?.trim() ?? "";
  if (!primero) return SUGERENCIA_NEUTRA_QUE_FUE;
  const texto = `Ej. ${primero.charAt(0).toUpperCase()}${primero.slice(1)}`;
  return texto.length <= MAX_QUE_FUE ? texto : SUGERENCIA_NEUTRA_QUE_FUE;
}

/** La serie de ejemplo sigue el comprobante elegido: la de una boleta empieza con B, la de un recibo por honorarios con E. */
export function sugerirSerie(comprobante: string): string {
  if (comprobante === "boleta") return "B001-123";
  if (comprobante === "recibo_por_honorarios") return "E001-45";
  return "F001-2231";
}
