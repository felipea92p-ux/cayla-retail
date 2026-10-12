// «Modelo nuevo» desde una orden de producción (ADR-0361): el camino de ida y vuelta entre Nueva orden y Nuevo producto.
//
// El problema. Una orden solo puede producir un modelo que YA existe en el catálogo con sus tallas y colores (`abrir_produccion`
// recibe variantes, no las inventa: decisión del 2026-09-15, en V1 dejaba colores duplicados y prendas sin precio). Para producir un
// modelo nuevo había que salir de Producción, adivinar que se crea en Productos, crearlo y volver a abrir la orden a mano.
//
// La salida. Nuevo producto sigue siendo la ÚNICA puerta del catálogo —tejido y patrón, nombre único por marca, tallas habilitadas
// por categoría, la firma del responsable, el alta sin conexión—, pero ahora sabe de dónde viene la persona y, al guardar, la
// devuelve a la orden con el modelo ya elegido y su matriz de tallas y colores lista. No se copia ninguna regla del catálogo a
// Producción: lo que cambia es el recorrido, no lo que el sistema acepta.
//
// Todo lo que viaja es la URL (nada de estado escondido): `desde=produccion` marca el origen y `tipo` conserva lo que la persona
// ya había elegido (producción o muestra). Un parámetro roto cae al valor de siempre, nunca rompe la pantalla.

export type TipoOrden = "produccion" | "muestra";

/** La pantalla a la que se vuelve cuando el alta empezó en una orden. */
export const RUTA_ORDENES = "/produccion/ordenes";

const VALOR_DESDE = "produccion";

/** `tipo` viene de la URL: cualquier cosa que no sea exactamente «muestra» (vacío, repetido, otro texto) es una producción. */
export function tipoDeParametro(crudo: string | string[] | undefined | null): TipoOrden {
  const valor = Array.isArray(crudo) ? crudo[0] : crudo;
  return valor === "muestra" ? "muestra" : "produccion";
}

/** ¿El alta empezó en una orden de producción? Solo el valor exacto cuenta. */
export function vieneDeProduccion(crudo: string | string[] | undefined | null): boolean {
  const valor = Array.isArray(crudo) ? crudo[0] : crudo;
  return valor === VALOR_DESDE;
}

/** Nueva orden → Nuevo producto. Conserva el tipo elegido para que el retorno abra la misma orden que se empezó. */
export function hrefAltaDesdeProduccion(tipo: TipoOrden): string {
  return `/productos/nuevo?desde=${VALOR_DESDE}&tipo=${tipo}`;
}

/** Nuevo producto → Nueva orden con el modelo recién creado ya elegido (`?nueva=<id>` lo abre Órdenes; ver `OrdenesTablero`). */
export function hrefOrdenDesdeAlta(productoId: string, tipo: TipoOrden): string {
  return `${RUTA_ORDENES}?nueva=${encodeURIComponent(productoId)}&tipo=${tipo}`;
}

/** Qué dice el botón de la pantalla de éxito: una muestra desarrolla el modelo; una producción fabrica el lote. */
export function textoAbrirOrden(tipo: TipoOrden): { boton: string; titulo: string } {
  return tipo === "muestra"
    ? { boton: "Abrir la orden de muestra", titulo: "Seguir con la muestra" }
    : { boton: "Abrir la orden de producción", titulo: "Seguir con la producción" };
}
