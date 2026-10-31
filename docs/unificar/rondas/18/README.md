# Ronda 18 de `/unificar`: la cabecera sin su frase (fuentes)

Armada el 2026-10-30 (rama `claude/simplified-collapsible-design-b21103`). Felipe: las colaboradoras dicen que el texto es muy chico y que
nadie lo lee; se empieza por la frase bajo el título de cada cabecera (`<EncabezadoPagina subtitulo>`), que se esconde detrás de un «?».
**Vuelta 1 decidida el 2026-10-30, mirando: P2 (el globo) + D2 (los datos también detrás del «?»).** Felipe pidió además un «?» y un globo
más finos: la vuelta 2 trae tres materiales (V1 vidrio esmerilado, recomendado · V2 tinta translúcida · V3 papel con hilo rojo), **decidida el mismo día: V1**, construida (`<AyudaCabecera>`) y migrada en todo el ERP. Registro: [titulo-pagina.md](../../titulo-pagina.md), «Ronda 18». La página vive en `apps/web/unificar/.salida/elegir-ronda18/` (fuera de git); estas son sus fuentes.

| # | Pregunta | Opciones |
|---|---|---|
| 1 | ¿Cómo queda la frase que explica la pantalla? | P1 (recomendada: «?» de 32 px junto al título; la frase baja en su lugar, en 16 px y tinta, con el hilo taupe) · P2 (el mismo «?», la frase en un globo que tapa lo de abajo) · P3 (botón «? Qué es esto», baja en su lugar) · A (hoy: siempre a la vista, 15 px gris) |
| 2 | ¿Y la frase que dice un dato (turno de Caja, «42 categorías activas», Conteo 12, RUC del proveedor, el veredicto de Frescura)? | D1 (recomendada: se queda a la vista; la pieza separa «explica» de «dato») · D2 (también detrás del «?») |

## Lo que se contó (2026-10-30)

131 `<EncabezadoPagina>` en 112 archivos; 120 con frase: 71 con texto fijo (todas explican la pantalla), 49 armadas en el código (unas 14
explican; unas 35 dicen un dato) y 11 sin frase. La lista sale de recorrer cada `<EncabezadoPagina` con el `subtitulo` que recibe.

## Archivos

| Archivo | Qué hace |
|---|---|
| `piezas.mjs`, `demo18.css`, `guion.js` | el HTML de cada opción (demos vivas y aplicado en vivo), su CSS (solo tokens) y el abrir/cerrar del «?» |
| `fotos.mjs` | 9 pantallas reales con cada opción puesta en vivo, cerrada y abierta, a 1440 y 375 px, en claro y (con `oscuro`) en oscuro; no guarda nada |
| `demo18b.css` | la vuelta 2: las tres caras finas (V1, V2, V3) del «?» y su globo |
| `despues.mjs` | fotos de la pieza ya construida, con el globo abierto por un clic (las del registro) |
| `bajar-css.mjs`, `construir.mjs`, `construir2.mjs` | bajan el CSS real del ERP y arman la página de cada vuelta (`spec.json` / `spec-vuelta2.json` → `elegir.html`); las fotos de la vuelta 2 salen con `VUELTA=2` |

Se copian a `apps/web/unificar/.salida/elegir-ronda18/`; `fotos.mjs` y `bajar-css.mjs` se corren desde `apps/web` (con `B=http://localhost:<puerto>`),
`construir.mjs` desde esa carpeta.
