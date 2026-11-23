import localFont from "next/font/local";

// Las cifras del ERP (ADR-0691, mejora 2 de estética; Felipe la eligió mirando la lámina `docs/maquetas/ocho-mejoras-2026-11/`).
//
// DM Sans, la letra del sistema, no trae cifras de ancho fijo: «1111» mide 50 px y «0000», 109 px, también con `tabular-nums`. Por eso
// las columnas de dinero no cuadraban dígito por dígito y una cifra que cuenta bailaba de ancho, aunque 445 archivos lo pedían.
//
// Aquí se declara una letra que SOLO tiene los diez dígitos (`unicode-range`): sale de Inter, que sí trae cifras de ancho fijo. Va
// primera en `--font-sans` (`app/globals.css`), así que el navegador toma de ella los dígitos y de DM Sans todo lo demás. La serif no
// cambia: EB Garamond ya trae cifras de ancho fijo. `size-adjust` iguala el alto de los dígitos de Inter (0,727 del cuerpo) con el de
// los de DM Sans (0,70). El archivo viene del paquete `@fontsource-variable/inter` (licencia OFL-1.1), no de un archivo suelto en el repo.
//
// Se declara una vez, como `letra-estados.ts`: `next/font` no deja repetirla. La pone el `<html>` de `app/layout.tsx`.
export const letraCifras = localFont({
  src: "../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  variable: "--font-cifras",
  weight: "100 900",
  display: "swap",
  adjustFontFallback: false,
  declarations: [
    { prop: "unicode-range", value: "U+0030-0039" },
    { prop: "size-adjust", value: "96%" },
  ],
});
