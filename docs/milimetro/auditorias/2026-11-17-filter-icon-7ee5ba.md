# Auditoría al milímetro — Historial: «Filtros» solo ícono en el celular · 2026-11-17 · `claude/filter-icon-7ee5ba`

Pieza: `<BotonFiltros soloIcono>` (`components/ui/FiltrosPildora.tsx`), la pieza decidida de «Abrir los filtros» (ADR-0358, `accion.filtrar`), en
`components/FiltrosHistorialVentas.tsx`. El cambio es una sola prop: bajo 640 px la píldora «Filtros» pasa a su ícono con un punto si hay
filtros puestos; desde 640 px sigue entera. Alcance: esa pieza y su fila (períodos y atajos), no toda la pantalla.

Medido: `/vender/historial` a 375×812 táctil claro (estados sobre la fila, foco con teclado sobre la pieza, espacio sobre la pantalla), 375 oscuro
(captura y colores calculados) y 1280×800 claro (que no cambie). ERP local (`next dev`, `localhost:3111`) con la base local, sede Lima.
Animaciones apagadas, como arranca el ERP: 0 bucles. Segunda pasada, tras dibujar el ícono de 44 px: `/vender/historial`, `/productos`,
`/inventario`, `/productos/categorias` y `/tienda-web/vitrina` a 375×812 táctil, y `/vender/historial` a 700×900 táctil.

Resumen: **0 graves · 0 medias · 0 leves abiertas** · 1 leve heredada de la pieza, corregida con el OK de Felipe (el ícono se dibuja de 44 px con el dedo).

## Lo que se midió

| Qué | Medida | Regla | Resultado |
|---|---|---|---|
| Dibujo de la pieza a 375 px táctil | antes 38 × 38 px; **después de la corrección, 44 × 44**, redonda, borde `borde-control` | los íconos se dibujan de 44 con el dedo (ADR-0611, act. 2026-11-17) | Cumple: mismo alto y mismo borde superior que «30 días» (44 px) |
| Área de toque con el dedo | 44 × 44 px | 44 px con `pointer: coarse` (ADR-0611, mejora 5) | Cumple; `espacio/medir.js`: 0 blancos bajo 44 y 0 bajo 24 |
| Fila de períodos | «30 días» entero (153–252) y asoma «90 días»; el ícono va de 315 a 359 | que lo elegido se lea entero | Cumple; sin scroll lateral de la página |
| Con un filtro puesto (`?estado=anulada`) | punto de 6 × 6 px dentro del círculo; nombre para el lector «Filtros · 1 puesto»; el globito con el número, oculto | `soloIcono`: «el ícono con su punto» | Cumple |
| Las otras pantallas con la pieza, a 375 px táctil | Productos («Ordenar» y «Filtros»), Existencias, Categorías y la Vitrina: 44 × 44, alineados con su buscador (44 px), sin scroll lateral | la misma pieza se ve igual en todas | Cumple |
| 700 × 900 táctil | píldora entera «Filtros» de 109,8 × 44 px | desde `sm` el `min-` no cambia nada | No cambió |
| Abrir y cerrar | `aria-expanded` pasa de `true` a `false` y vuelve; el panel sale y entra | WCAG 4.1.2 | Cumple |
| Foco con teclado | anillo sólido de 3 px en tinta al 82 %, sin nada que lo tape | WCAG 2.4.7 | Cumple (`milimetro/medir.js { foco: true }`: 1 medido, 0 sin anillo) |
| Estados de la fila | 0 apagados, 0 ocupados, 0 errores, 0 campos sin etiqueta | tabla de estados de `/milimetro` | Sin hallazgos |
| 1280 × 800 | píldora entera «Filtros» de 110 × 34 px, con su nombre y su flecha | desde `sm`, la píldora entera | No cambió |
| Oscuro a 375 px | borde y relleno de las demás píldoras (tinta al 30 % y al 9 %); ícono en tinta al 82 % | regla común de `vidrio/campos-y-botones.css` | Se ve; captura mirada |

No aplican: selected (un botón que abre no queda elegido; dice `aria-expanded`), loading, error, read-only y vacío (no guarda ni lleva dato).

## Graves
Ninguno.

## Medias
Ninguna.

## Leves
1. **Corregida, heredada de la pieza: con el dedo el ícono se dibujaba de 38 px junto a píldoras de 44.** Su área de toque ya era de 44, pero el
   círculo se veía más chico que «Hoy», «7 días» y «30 días». La regla del 2026-11-16 pide que los íconos se DIBUJEN de 44 px con el dedo y la
   píldora solo ícono no estaba en esa lista. Felipe dio el OK: `pildora-filtro-icono-celular` entró a la regla de 44 px de
   `app/estilos/tacto.css` (ADR-0611, act. 2026-11-17). Cambia a la vez Historial, Productos, Existencias, los vocabularios de Catálogo y la Vitrina;
   medido en las cinco.

## Heredado, anotado
- Cada ícono de 44 le quita 6 px a su buscador. En la Vitrina el buscador queda en 151 px y «Busca un modelo» se corta; ya se cortaba antes
  (pide 127,5 px de texto y tenía 109). En Existencias «Prenda, talla o código…» pide 167,6 y tiene 159 (antes 165). No se tocó.

## Sin medir
- `color/medir.js` midió 2 controles (0 fallan) y ningún texto en esta pasada: el contraste del borde no quedó calculado contra el fondo real
  (vidrio sobre la Aurora). El borde es el token `borde-control`, que `lib/tema-tokens.test.ts` mide.
- `tipografia`, `textos` y `movimiento`: la pieza no tiene texto a la vista a 375 px ni movimiento propio; no se corrieron.
- La guía interactiva de Historial no se volvió a recorrer: sus pasos van por ancla (`historial.filtros`) y la huella de controles no cambió
  (`lib/guias.test.ts` pasa).
