/** La cookie con la tienda que la persona eligió la última vez (la escribe el selector de la cabecera; la lee `lib/sede-servidor.ts`). */
export const COOKIE_SEDE = "tienda-sede";

/** Recuerda la tienda elegida en este aparato (un año, en todo el sitio): una preferencia, no un dato de la persona. Solo en el navegador. */
export function recordarSede(clave: string): void {
  document.cookie = `${COOKIE_SEDE}=${encodeURIComponent(clave)}; path=/; max-age=31536000; samesite=lax`;
}
