/**
 * Que SOLO UNA pestaña del navegador suba una cola sin conexión a la vez (ADR-0063 / ADR-0210).
 *
 * EL PROBLEMA. La cola vive en `localStorage`, que comparten todas las pestañas del mismo navegador. Con Vender abierto
 * en dos pestañas (o en una y el sincronizador del layout en otra), las dos leen la MISMA cola y mandan las MISMAS
 * ventas a la vez. La base no duplica (el token es único: la segunda recibe la venta ya guardada), pero cada pestaña
 * que recibe «ok» vuelve a mandar el comprobante a SUNAT y a descontar el stock de su pantalla; y si la respuesta de la
 * que "pierde" llega torcida (un 504 justo ahí), el mismo caso del fallo pasajero de la cola de ventas la rechaza.
 * El mutex que ya existía (`subidaEnCursoRef`, `pasadasEnCurso`) solo cubre UNA pestaña: es una variable de memoria.
 *
 * LA REGLA. Antes de subir, se pide el candado `cayla:subida:<cola>` con `ifAvailable`: si otra pestaña lo tiene, esta
 * NO espera ni sube — esa pasada ya está en marcha y sube todo; lo que ocurra se entera por el evento `storage` (la
 * pantalla relee la cola). Si el navegador no tiene `navigator.locks` (Safari < 15.4, contexto no seguro), se sube como
 * antes: la base sigue siendo la última red. El candado lo suelta el navegador solo si la pestaña se cierra.
 *
 * Puro: el `LockManager` entra por parámetro, así se prueba sin navegador.
 */

export type Candados = { request: (nombre: string, opciones: { ifAvailable: true }, trabajo: (candado: unknown) => Promise<void>) => Promise<unknown> };

/** El `navigator.locks` de esta pestaña, o `undefined` si no existe (servidor, navegador viejo). */
export function candadosDelNavegador(): Candados | undefined {
  return typeof navigator !== "undefined" && navigator.locks ? (navigator.locks as unknown as Candados) : undefined;
}

/**
 * Corre `trabajo` solo si ninguna otra pestaña está subiendo esta cola. Devuelve `true` si lo corrió, `false` si otra
 * pestaña tenía el candado (no se hizo nada). Si `trabajo` lanza, el error sube y el candado se suelta igual.
 */
export async function conCandadoDeSubida(cola: string, trabajo: () => Promise<void>, candados: Candados | undefined = candadosDelNavegador()): Promise<boolean> {
  if (!candados) {
    await trabajo();
    return true;
  }
  let corrio = false;
  try {
    await candados.request(`cayla:subida:${cola}`, { ifAvailable: true }, async (candado) => {
      if (!candado) return; // otra pestaña tiene la subida: esta no hace nada
      corrio = true;
      await trabajo();
    });
  } catch (e) {
    // Si el que falló fue `trabajo`, el error es suyo. Si falló el candado mismo (SecurityError, p. ej. un iframe sin
    // permiso), se sube sin él: el candado es una mejora, no un requisito para guardar la venta.
    if (corrio) throw e;
    await trabajo();
    return true;
  }
  return corrio;
}
