/** La cookie con la tienda que la persona eligió la última vez (la escribe el selector de la cabecera; la lee `lib/sede-servidor.ts`). */
export const COOKIE_SEDE = "tienda-sede";

/** Recuerda la tienda elegida en este aparato (un año, en todo el sitio): una preferencia, no un dato de la persona. Solo en el navegador. */
export function recordarSede(clave: string): void {
  document.cookie = `${COOKIE_SEDE}=${encodeURIComponent(clave)}; path=/; max-age=31536000; samesite=lax`;
}

/** ¿La persona ya eligió una tienda en este aparato? (la cookie existe). Solo en el navegador. */
export function sedeYaRecordada(): boolean {
  return document.cookie.split("; ").some((c) => c.startsWith(`${COOKIE_SEDE}=`) && c.length > COOKIE_SEDE.length + 1);
}

// Que ya se le preguntó la ubicación en este aparato (la aceptó, dijo que no o falló): no se insiste en cada visita. Es una preferencia del
// aparato, no un dato de la persona. Sin almacenamiento (ventana privada, bloqueado) se comporta como «ya preguntada»: mejor no preguntar
// que preguntar en cada página.
const LLAVE_UBICACION = "tienda-ubicacion-preguntada";

export function ubicacionYaPreguntada(): boolean {
  try {
    return window.localStorage.getItem(LLAVE_UBICACION) !== null;
  } catch {
    return true;
  }
}

export function marcarUbicacionPreguntada(): void {
  try {
    window.localStorage.setItem(LLAVE_UBICACION, "1");
  } catch {
    // Sin almacenamiento: nada que recordar.
  }
}
