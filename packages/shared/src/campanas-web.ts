// El catálogo CERRADO de ambientes de las campañas de la tienda online (Tienda web ▸ Campañas, maqueta
// docs/maquetas/campanas-tienda-2026-10/). Una sola lista para las dos apps: el ERP la muestra para elegir y la tienda la usa para
// vestir la portada. El líder ELIGE y ajusta; nunca escribe CSS, y un ambiente nuevo lo agrega el equipo (aquí, en el CHECK de
// `retail.campana_disenos.plantilla` y en la hoja de estilos de la tienda, los tres a la vez).
//
// La CLAVE es lo que guarda la base y no cambia («cyber» es «Black Week» aunque el nombre se renombre); el nombre es lo que lee la
// persona.

export const AMBIENTES_CAMPANA = [
  { clave: "sobrio", nombre: "Sobrio", para: "Liquidaciones y campañas cortas" },
  { clave: "aniversario", nombre: "Aniversario", para: "El cumpleaños de CAYLA" },
  { clave: "patrias", nombre: "Fiestas Patrias", para: "Julio" },
  { clave: "madre", nombre: "Día de la Madre", para: "Mayo" },
  { clave: "cyber", nombre: "Black Week", para: "Noviembre, descuentos grandes" },
  { clave: "gato", nombre: "Día del Gato", para: "Para los amantes de los gatos" },
  { clave: "navidad", nombre: "Navidad", para: "Diciembre" },
] as const;

export type AmbienteCampana = (typeof AMBIENTES_CAMPANA)[number]["clave"];

/** El nombre de un ambiente, o `null` si la clave no es del catálogo (la lista nunca inventa un nombre). */
export const nombreDeAmbiente = (clave: string | null | undefined): string | null =>
  AMBIENTES_CAMPANA.find((a) => a.clave === clave)?.nombre ?? null;
