/**
 * El color de una prenda como fondo de su mosaico (buscador y grilla de Vender, Felipe 2026-10-03): el ícono de la
 * categoría va sobre el color de la variante (`colores.hex`) en vez de un tono por familia.
 *
 * CONTRATO. Promete: dado el `#rrggbb` de un color, el fondo tal cual y el trazo (tinta o crema) que se lee sobre él; si
 * el color es claro (beige, celeste…) pide además un filo para que no se pierda contra el papel. Nunca lanza: un hex
 * ausente o mal escrito devuelve `null` y quien dibuja cae al tono de la familia, como antes.
 *
 * El hex es DATO de la prenda, no color de la interfaz: la regla de «solo tokens» (ADR-0169) habla de la paleta del ERP.
 * El trazo, en cambio, sí es de la paleta, pero de los tokens FIJOS (`--color-tinta-fija` / `--color-crema-fija`, ADR-0336): el color
 * de la prenda no cambia con el tema, así que el texto que se lee sobre él tampoco puede intercambiarse. Con `--color-tinta` y
 * `--color-crema` (que en oscuro se invierten) una prenda negra mostraba su nombre en el mismo negro.
 */
export type EstiloMosaicoColor = { fondo: string; trazo: string; filo: boolean };

const HEX = /^#([0-9a-f]{6})$/i;

/** Luminancia relativa WCAG de un `#rrggbb`. */
function luminancia(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

/** Sobre qué luminancia se pasa de trazo crema a trazo tinta: el cruce donde ambos contrastan igual (~0,18) queda corto
 *  para íconos finos, así que se corre a 0,32 para que un color medio (azul, verde oliva) mantenga el trazo claro. */
const CORTE_LUMINANCIA = 0.32;
/** Desde aquí el fondo es lo bastante claro (celeste, beige) como para fundirse con el papel (#fbf8f2, luminancia ~0,94): se le pone filo. */
const CORTE_FILO = 0.4;

export function estiloMosaicoColor(hex: string | null | undefined): EstiloMosaicoColor | null {
  if (!hex || !HEX.test(hex.trim())) return null;
  const fondo = hex.trim().toLowerCase();
  const l = luminancia(fondo);
  return { fondo, trazo: l > CORTE_LUMINANCIA ? "var(--color-tinta-fija)" : "var(--color-crema-fija)", filo: l > CORTE_FILO };
}
