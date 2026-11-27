# Hojas lentas en Safari: cómo se midió (2026-11-27, ADR-0715)

Felipe: «Llegó una compra» demoraba en abrir y al cerrar «se vuelve lento». La decisión y las cifras están en
`docs/adr/0715-el-velo-de-las-hojas-sin-congelar-safari.md`; aquí, cómo repetir la medición.

## Qué se midió

Cuánto queda congelada la pantalla desde el clic hasta que puede pintar, al abrir la hoja (botón «Llegó una compra») y al cerrarla
(«Cancelar»). Dentro de la página: `performance.now()` antes de `boton.click()`, dos microtareas (React arma y monta la hoja), un
`getBoundingClientRect()` del `<html>` (fuerza estilo y diseño) y el siguiente `requestAnimationFrame`. Cinco vueltas por corrida, la primera
aparte (el motor todavía no conoce el código de la hoja), y la mediana de las demás.

## Con qué

- **WebKit de Playwright** (`require('playwright').webkit`, el motor de Safari; ya viene instalado con Playwright) y Chrome, sobre un
  **build de producción** (`next build` + `next start`), nunca el servidor de desarrollo.
- Un banco Supabase propio con la cuenta del seed, en el Taller, a 1920 × 1080.
- Los registros de producción (`edge_logs`) para saber el navegador de Felipe (`Version/27.2 Safari`) y cuánto tardan las lecturas de la hoja
  en el servidor (10 a 80 ms).

## Cómo se encontró la causa

1. Registrar qué le pasa a los estilos de la página al abrir y cerrar (un `MutationObserver` sobre `<head>`, `<html>` y `<body>`): entra
   una `<style>` de react-remove-scroll (`.with-scroll-bars-hidden`, `body[data-scroll-locked]`) y sale al cerrar, y el `<body>` recibe
   `data-scroll-locked` y `pointer-events: none`.
2. Medir cada cosa sola sobre la página sin hoja: quitar una `<style>` vacía cuesta ~95 ms en WebKit y 1 ms en Chrome; una variable nueva en
   `<html>`, ~62 ms; `pointer-events` en el `<body>`, ~27 ms. Con el doble de elementos, todo crece (~155, ~106 y ~61 ms).
3. Borrar familias de reglas una por una (`deleteRule`) y volver a medir: el costo de rehacer los estilos es casi todo volumen (6.316 reglas);
   los 100 `@property` (92 son de Tailwind) pesan un tercio; `:has()`, `@container` y `@keyframes` casi nada.
4. Simular el arreglo dentro de la página antes de escribirlo (que la `<style>` nunca entre y bloquear con `overflow` en `<html>`), y recién
   ahí escribirlo y medirlo de verdad.

**Ojo:** WebKit sin pantalla no dibuja `backdrop-filter` en las capturas (una prueba de una línea lo muestra); para comparar cómo se ve el
velo se mira su estilo calculado, no la captura. Las capturas de esta carpeta son de Chrome a 375 y 1280 px, ya con el arreglo.
