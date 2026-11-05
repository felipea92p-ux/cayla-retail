// Los ejemplos de las cajas de texto del editor de Campañas (Tienda web ▸ Campañas, ADR-0290: la sugerencia sigue lo que la persona ya eligió).
// Con «Black Week» elegido, el titular sugiere «Black Week» y no «Aniversario CAYLA». Lógica pura: el componente solo llama
// `sugerirTextos(ambiente)`; la prueba recorre TODOS los ambientes del catálogo (totalidad, sin azar, cambia con el control y vuelve).
//
// FUENTE: el ambiente (por su CLAVE, `campana_web_disenos.plantilla`, nunca por su nombre visible, que se renombra). Sin ambiente, un texto que no
// promete nada. Un ambiente que el catálogo suma después y que aquí falta cae al neutro, nunca al ejemplo de otro.

import { AMBIENTES_CAMPANA, TOPE_BAJADA_CAMPANA, TOPE_BOTON_CAMPANA, TOPE_TITULAR_CAMPANA, type AmbienteCampana } from "@cayla-retail/shared";

export type TextosSugeridos = { titular: string; bajada: string; boton: string };

/** Lo que sugiere cada ambiente: un ejemplo curado (no un dato real, que invita a copiarlo) en el tono de su campaña. */
const POR_AMBIENTE: Record<AmbienteCampana, TextosSugeridos> = {
  sobrio: { titular: "Liquidación de verano", bajada: "Lo que queda, a mejor precio", boton: "Ver la liquidación" },
  aniversario: { titular: "Aniversario CAYLA", bajada: "Celebramos contigo", boton: "Ver la campaña" },
  patrias: { titular: "Fiestas Patrias", bajada: "Viste los colores del Perú", boton: "Ver lo que hay" },
  madre: { titular: "Para mamá", bajada: "Un regalo que se usa", boton: "Elegir su regalo" },
  cyber: { titular: "Black Week", bajada: "Una semana, una sola vez al año", boton: "Ver las ofertas" },
  gato: { titular: "Día del Gato", bajada: "Para los que mandan en casa", boton: "Ver la campaña" },
  navidad: { titular: "Navidad CAYLA", bajada: "Regala algo que se queda", boton: "Ver los regalos" },
};

/** Sin ambiente elegido no se promete nada: un ejemplo que sirve a cualquier campaña. */
export const TEXTOS_NEUTROS: TextosSugeridos = { titular: "El nombre de tu campaña", bajada: "Una frase corta que invite a mirar", boton: "Ver la campaña" };

/** Los ejemplos para el ambiente elegido (o los neutros si no hay uno, o si la clave no es del catálogo). */
export function sugerirTextos(ambiente: string | null | undefined): TextosSugeridos {
  return POR_AMBIENTE[ambiente as AmbienteCampana] ?? TEXTOS_NEUTROS;
}

/** @internal Existe PARA la prueba: el tope de cada caja de texto, que un ejemplo no puede pasar (un placeholder que no cabe se corta a media palabra). */
export const TOPES_DE_TEXTO = { titular: TOPE_TITULAR_CAMPANA, bajada: TOPE_BAJADA_CAMPANA, boton: TOPE_BOTON_CAMPANA } as const;

/** @internal Existe PARA la prueba: la lista de todos los ambientes del catálogo, para exigir que cada uno tenga sus ejemplos. */
export const AMBIENTES_CON_EJEMPLOS = AMBIENTES_CAMPANA.map((a) => a.clave);
