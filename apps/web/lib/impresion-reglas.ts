/**
 * Cómo se llama el archivo cuando un comprobante se guarda como PDF (2026-09-29, Felipe).
 *
 * El navegador nombra el PDF con el `<title>` de la página, y el de todo el ERP es «Retail — CAYLA»:
 * la boleta B004-000004 se guardaba como «Retail - CAYLA.pdf», igual que todas las demás. Mientras
 * un comprobante está a la vista, el título del documento pasa a ser su número (`useTituloDeImpresion`),
 * y el archivo sale como «B004-000004.pdf». Esta función solo limpia el nombre; el hook lo aplica.
 */

/** Lo que ningún sistema de archivos admite en un nombre (Windows es el más estricto). */
const NO_VALIDOS_EN_NOMBRE = /[\\/:*?"<>|\u0000-\u001f]+/g;

/**
 * El nombre limpio para el archivo, o `null` si no hay nada que usar (el título de siempre se queda).
 * Un número de comprobante («B004-000004», «NV01-000007») pasa idéntico.
 */
export function nombreDeImpresion(nombre: string | null | undefined): string | null {
  if (!nombre) return null;
  const limpio = nombre.replace(NO_VALIDOS_EN_NOMBRE, "-").replace(/\s+/g, " ").trim().slice(0, 100);
  return limpio === "" ? null : limpio;
}
