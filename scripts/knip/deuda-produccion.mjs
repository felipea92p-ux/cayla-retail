// La deuda de `knip --production` (`scripts/knip/produccion.mjs`, ADR-0406 actualización del 2026-10-14): lo que el 2026-10-14
// ya usaban solo sus pruebas. Cada línea es una pieza de la web que ninguna pantalla importa, con la fecha en que perdió su
// último uso en `main` (y el PR) o «nunca» si no tuvo pantalla. Qué hacer con cada una y por qué está aquí:
// `docs/investigacion/2026-10-14-codigo-que-solo-usan-las-pruebas.md`.
//
// SOLO BAJA. Se sale de la lista conectando la pieza a su pantalla o borrándola con su prueba (y con las que solo ella usaba en
// su archivo: Knip las muestra en la corrida siguiente). Nunca se agrega una línea: una pieza nueva sin pantalla se conecta, se
// borra o, si existe para su prueba, se declara con `@internal` y su motivo.
export const DEUDA = [
  // Nunca tuvo pantalla en main. Es accesibilidad pendiente de conectar: Felipe decide si se conecta o se borra.
  "apps/web/lib/plan-piso-familias.ts: textoDeRepartoParaLector", // nunca · nació 2026-10-12 · 3b1fafcc3
  // Aparte, cada una con su decisión: la hoja de prueba de etiquetas (codigo128 y qr), el retiro de «Mis partes de compras» y
  // `resolverTienda`, que usa scripts/terminales/crear.mjs (la re-exporta scripts/terminales/reglas.mjs).
  "apps/web/lib/codigo128.ts", // 2026-10-06 · #858 (solo scripts/etiquetas/hoja-de-prueba.mjs)
  "apps/web/lib/compras-mi-parte-reglas.ts: partesPorPagar", // 2026-10-13 · #1034 (con «Mis partes», ADR-0387)
  "apps/web/lib/qr.ts: puntosPorModuloQR", // nunca (solo scripts/etiquetas/hoja-de-prueba.mjs)
  "apps/web/lib/terminales-reglas.ts: resolverTienda", // nunca en la web (solo scripts/terminales: `pnpm terminales:crear`)
];
