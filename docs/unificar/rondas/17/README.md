# Ronda 17 de `/unificar`: el mes, el cajón, la cantidad y el paso a paso (fuentes)

Armada el 2026-10-17 (rama `claude/unificar-control`) con las cuatro familias que el [censo de control del 16](../../control/2026-10-16.md)
encontró sin decidir. **Esperando la elección de Felipe.** La página vive en `apps/web/unificar/.salida/elegir-ronda17/` (fuera de git),
también en un solo archivo (`empaquetar.mjs`); estas son sus fuentes.

| # | Familia | La pregunta | Opciones |
|---|---|---|---|
| 1 | `mes` | ¿Cómo se elige el mes en todo el ERP? | P1 (recomendada: «‹ Octubre 2026 ›» del Historial de cierres, con los doce meses) · P2 (los vecinos con su nombre) · A (hoy: dos formas). Finanzas queda aparte (ADR-0195) |
| 2 | `cajon` | ¿Qué cara tiene el cajón lateral? | P1 (recomendada: la banda de Compras con avatar, versalitas y título, y el pie con flechas) · P2 (la cara de las hojas, de costado) · A (hoy: tres caras en 7 cajones) |
| 3 | `cantidad` | ¿Cómo es el paso de cantidad («− 1 +»)? | P1 (recomendada: la caja del campo con − y + adentro; celda 26 px y fila 36 px que crece a 44 en pantalla táctil) · P2 (botones sueltos) · A (hoy: 23 controles, 7 caras). Las teclas grandes de contar quedan aparte |
| 4 | `accion.anterior` | ¿Cómo pasa de paso la guía de impresión? | P1 (recomendada: la flecha de `<Volver>` y «Siguiente» con su flecha, como todo paso a paso) · P2 (dos botones con palabra) · A (hoy) |

## Archivos

| Archivo | Qué hace |
|---|---|
| `fotos.mjs` | lo de hoy y cada propuesta aplicada EN VIVO sobre la pantalla real (solo el dibujo; no guarda nada). Agrega una prenda al ticket o a la lista con el buscador, sin guardar. Pide `PRODUCTO` (para Etiquetas de precio) y `MOVIMIENTO` (el cajón de Movimientos se abre por su URL) |
| `piezas.mjs`, `demo17.css` | las demos con el HTML exacto de `SelectorMes`, `Volver`, `Boton`, `BotonVer` y `AvatarPersona`, y las dos propuestas del paso de cantidad y del cajón; usan `demo9.css` (ronda 9), `demo15.css` y `svg.mjs` (ronda 15) |
| `bajar-css.mjs`, `construir.mjs`, `ver-demos.mjs`, `empaquetar.mjs` | bajan el CSS real, arman la página, fotografían cada tarjeta (claro y oscuro) y la dejan en un solo archivo |

Los de la página se corren desde `apps/web/unificar/.salida/elegir-ronda17/`; los demás, desde `apps/web`.

**Lo que no se pudo fotografiar en local:** la matriz de Editar producto (a la base local le falta la migración de `familias.entra_a_motores`,
que ya está en `main`, y la pantalla se cae) y el cajón de una orden de Producción (la base local no tiene órdenes). Van como demo y como
texto.
