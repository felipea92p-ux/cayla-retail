# Auditoría al milímetro — Compré ropa: «¿Qué le compraste?» con solo «Anotar una prenda» · 2026-11-21 · `claude/compras-algo-nuevo-option-dae26c`

Medido: el paso 2 de `/compras/mi-plata/compra`, con `window.__milimetro = { raiz: <la sección del paso> }`. Servidor de la rama (`localhost:3047`)
contra la base local compartida, cuenta Líder en Tienda Lima, marca CAYLA. Se anotó una prenda inventada en la pantalla (3 × S/ 40, Lima); no se
guardó nada en la base. Ancho del panel: 800 px y 436 px; además, recorrido a 375 × 812 en claro y en oscuro (capturas).
Alcance: lo que cambió. El botón «Anotar una prenda / Anotar otra prenda» y la lista de lo anotado (`ListaDeLaCompra`). La hoja es la de antes
(solo cambia su título) y la barra de abajo no cambió.

Resumen: **0 graves · 0 medias · 0 leves** · el paso queda con un solo botón de 72 px y la lista de lo anotado; foco visible con teclado, sin textos bajo su contraste.

## Lo que se midió

| Medidor | Resultado |
|---|---|
| `milimetro` (estados) | 0 apagados, 0 cargando escritos a mano, 0 errores, 0 etiquetas; 2 hover globales de otras pantallas (`.barra-t`, `.parecidas-punto`), ya cubiertos por `hover-con-mouse` |
| `milimetro` con foco (teclado, Tab real) | «Anotar otra prenda» toma el foco: contorno sólido de 2 px en tinta, separado 2 px (ADR-0351) |
| `espacio` | controles de 40 px; 0 blancos bajo 24 px, 0 valores fuera de escala, 0 proximidad rota. El botón mide 72 px de alto |
| `color` claro | 26 textos y 4 controles medidos, 0 bajo su mínimo, 0 rojos |
| `tipografia` | 0 líneas de más de 80, 0 cifras sin tabulares; 1 texto de 12,5 px del marco, fuera de este paso |
| `textos` | sin fallas medibles |

## Lo que no se midió

- **Oscuro con el medidor de color:** el medidor marcó los textos como «tapados» al cambiar el tema en vivo y no midió ninguno. Se miró en captura a 375 × 812 (botón crema sobre papel oscuro, fila con su chip verde, barra clara): se lee bien.
- **44 px con el dedo** (`tacto:medir`): no se corrió; el botón mide 72 px de alto a lo ancho de la columna.
- Movimiento: el paso no agrega ninguna animación.
