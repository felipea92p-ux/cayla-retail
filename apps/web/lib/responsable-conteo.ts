/**
 * El responsable de un conteo se elige UNA vez, al abrirlo (Felipe, 2026-09-30), y el resto de las pantallas del conteo
 * (Contar, Revisar, Cancelar, alta al vuelo) lo reutilizan sin volver a preguntar.
 *
 * Por qué se recuerda en el navegador y no en la base: la cuenta de una tienda es una terminal compartida, sin persona
 * propia, y la base exige saber quién firma cada escritura (ADR-0161/0162). Cada pantalla crea su propio combo, y al
 * navegar de Abrir a Contar el combo nuevo nacía vacío. Guardar aquí quién abrió ESTE conteo (clave por id de conteo) le
 * devuelve a las pantallas siguientes esa elección, y cada guardado sigue firmando con el encabezado de siempre: la base
 * no cambia ni se debilita el candado de asistencia. Si la persona ya no está de turno, `responsableVigente` la descarta y
 * el combo vuelve a aparecer —es lo único que lo trae de vuelta—.
 *
 * Sin almacenamiento (ventana privada, bloqueado) no pasa nada grave: cada pantalla vuelve a pedir el responsable, como antes.
 * Puro salvo `Storage`; recibe el almacén para poder probarse sin navegador.
 */

const PREFIJO = "cayla:responsable-conteo:";

export const claveResponsableConteo = (conteoId: string): string => `${PREFIJO}${conteoId}`;

/**
 * Lo mismo para la recepción de un traslado (ADR-0328: el nombre se pide una vez por operación): quien eligieron para recibir ESTE
 * traslado en este aparato firma los pasos siguientes (cada casilla, confirmar, cerrar con diferencia) y un guardado exitoso no vacía
 * el combo. Prefijo propio: un traslado y un conteo no comparten recuerdo.
 */
export const claveResponsableRecepcion = (transferenciaId: string): string => `cayla:responsable-recepcion:${transferenciaId}`;

type Almacen = Pick<Storage, "getItem" | "setItem" | "removeItem">;

// Quien mira el recuerdo (`useSyncExternalStore`) se entera de un cambio hecho en esta pestaña (guardar/olvidar) y en otra (`storage`).
const oyentes = new Set<() => void>();
const avisarCambio = () => oyentes.forEach((o) => o());

export function suscribirRecordado(oyente: () => void): () => void {
  oyentes.add(oyente);
  if (typeof window !== "undefined") window.addEventListener("storage", oyente);
  return () => {
    oyentes.delete(oyente);
    if (typeof window !== "undefined") window.removeEventListener("storage", oyente);
  };
}

function almacenDelNavegador(): Almacen | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Quién abrió este conteo (id de persona), o `null` si no se recuerda. */
export function recordarResponsableLeer(clave: string, almacen: Almacen | null = almacenDelNavegador()): string | null {
  try {
    const v = almacen?.getItem(clave)?.trim();
    return v ? v : null;
  } catch {
    return null;
  }
}

export function recordarResponsableGuardar(clave: string, personaId: string, almacen: Almacen | null = almacenDelNavegador()): void {
  try {
    almacen?.setItem(clave, personaId);
  } catch {
    // Sin almacenamiento: cada pantalla vuelve a pedirlo.
  }
  avisarCambio();
}

export function recordarResponsableOlvidar(clave: string, almacen: Almacen | null = almacenDelNavegador()): void {
  try {
    almacen?.removeItem(clave);
  } catch {
    // Sin almacenamiento: nada que olvidar.
  }
  avisarCambio();
}
