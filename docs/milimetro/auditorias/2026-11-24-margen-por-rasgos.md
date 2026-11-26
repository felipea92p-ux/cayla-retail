# Auditoría al milímetro — Configuración ▸ Precios y «¿Qué tiene esta prenda?» (ADR-0700) · 2026-11-24 · `claude/margen-ganancia-atributos-2fe4df`

Medido en local (`:3010`, base local, cuenta de Felipe) con los medidores de las skills hermanas cargados por `fetch` desde
`apps/web/public/__medir` (borrados después): `/configuracion?tab=precios` a 1440 × 900 claro, 1440 × 900 oscuro (asentado) y 375 × 812
claro, con movimiento vivo y quieto; y la pieza `QueTieneLaPrenda` en `/productos/[id]/editar` (Blusa Emma, «Variantes y precios»
abierta) a 1440 × 900, claro y oscuro, con `raiz = [data-guia="editar.que-tiene"]`. La misma pieza vive en «Compré ropa» (vista a 375 px al
construirla, actividad 3) y en Nuevo producto (paso 4, vista a 1035 px el mismo día).

Resumen: **0 graves · 0 medias · 1 leve** · 3 heredados (del kit de Configuración y de la tabla de tallas, anotados abajo, no de este cambio).

## Configuración ▸ Precios

| Medidor | 1440 claro | 1440 oscuro | 375 claro |
|---|---|---|---|
| Estados (`milimetro`) | hover suelto 2 (reglas globales `.barra-t`, `.parecidas-punto`, no de esta pestaña); apagados 0; cargando que se pulsa 0; errores 0; etiquetas 0; en bucle sin señal 0 | — | igual, 0 en todo |
| Foco (`{ foco: true }`, con Tab real) | 33 medidos: 0 sin anillo, 0 flojos, 0 tapados; 6 «no toman el foco» = las 6 filas escondidas bajo «Ver 6 más» (alto 0): correcto | — | — |
| Color | 71 textos, **0 fallan**; 7 controles, 0 fallan; 0 rojos | **0 fallan** (asentado); 24 «APCA débil» (segunda mirada, no puerta): las bajadas en taupe de 14 px del kit | — |
| Espacio | blancos < 24 px: 0 | — | blancos < 44 con el dedo: 0; nada se desborda |
| Tipografía | lectura < 14 px: 0; montos partibles 0; cifras tabulares en todo monto | — | 0 en todo |
| Movimiento | 5 animaciones (4 marcadas), 0 en bucle, todo quieto a 1,4 s; quieto: 0 | — | — |
| Textos | lo único que marca es el nombre de una marca de prueba de 300 «A» que dejó un `/chaos` en la base local (dato, no código) | — | — |

**Leve:** una medición de color en oscuro hecha justo después de cambiar el tema dio 40 textos con 1,16 (el medidor compuso la capa
translúcida `cv-tope` sobre blanco, en plena transición). Repetida con el tema asentado: 0. Para la próxima: esperar ~2,5 s tras cambiar
`data-tema` antes de medir (ya se hizo así en la segunda pasada).

**Heredados (no son de este cambio):** los valores fuera de la escala de 4 px (14 px de `cv-fila`, 11 de `fin-control`, 22 de
`vs-liquido`, 18 de `vs-raiz`) y el interlineado de 1,25 de `vs-rotulo` son del kit que comparten todas las pestañas de Configuración
(`app/estilos/vidrio/config-vistas.css`, `vitrinas-sedes.css`).

## La pieza «¿Qué tiene esta prenda?» (`components/QueTieneLaPrenda.tsx`)

| Estado | Qué se ve | Qué se anuncia | Cómo se midió |
|---|---|---|---|
| default | la placa (`vd-placa`) con la casilla, su nombre en `text-tinta` 16 px y «+3 %» en `text-secundario` 14 px, cifras tabulares | grupo «¿Qué tiene esta prenda?»; cada casilla con su nombre | color: 0 textos bajo 4.5:1 en claro y en oscuro |
| hover | el de la pieza `<Casilla>` (borde a tinta), dentro de `@media (hover: hover)` | — | `campos-y-casillas.css:359` |
| focus-visible | el anillo global: 2 px de tinta, separado 2 px | — | `globals.css:492`; probado con Tab real en la sección |
| active | la casilla se encoge (`scale: 0.92`) | — | `campos-y-casillas.css:361` |
| selected | el fondo crece y el ✓ se dibuja; la marca que sale sola de la lista va con un ✓ verde y sin casilla (no se toca) | `checked` del `input` | a ojo, marcando y desmarcando |
| disabled | toda la pieza a 60 % mientras guarda (Editar producto) o mientras crea (Nuevo producto); el motivo es el guardado en curso | `disabled` | código (`disabled={guardando}`) |
| loading | Editar producto guarda al marcar: las tres casillas esperan; el aviso de éxito sale después del loader | — | probado: dos toques seguidos no se cruzan |
| error | si la base dice que no, la casilla vuelve a como estaba y un aviso de error dice por qué | — | código (`onEleccion(antes)` + `avisar.error`) |
| read-only | no aplica: quien ve la pieza puede marcarla (sin costo a la vista, Editar producto no la dibuja) | — | — |
| vacío | no aplica: siempre hay tres casillas; la pieza es opcional y lo dice su título («· opcional» en Nuevo producto) | — | — |
| quieto | sin movimiento la casilla igual cambia de fondo y dibuja el ✓; 0 animaciones en bucle | — | `milimetro` con `data-movimiento=quieto` |

Área de toque: cada fila mide **44 px** de alto y toda la fila es la etiqueta (el `input` dibuja 20 × 20): pasa el 24 px con mouse y el
44 px con el dedo. Espacio: 0 blancos bajo 24 px, 0 grupos con la proximidad rota.

**Heredado:** el medidor de color marca 5 cajas de stock de la tabla de tallas (`span.caja-cayla` en `editar.stock-talla`) con borde de
1,06:1. Están así desde antes y no son de este cambio: queda para quien toque esa tabla.

## Lo que no se midió

- El foco de la pieza con el medidor (`{ foco: true }` no encuentra el `input` de la casilla); se comprobó por la regla CSS y con Tab real.
- Nuevo producto y «Compré ropa» con los medidores: la pieza es la misma; se miraron en el navegador al construirlas.
- `/chaos` de la pestaña Precios y de las casillas de Editar producto: no se corrió (la base de la regla y las casillas tienen sus pruebas
  de concurrencia y permisos en `pruebas:reglas-de-precio` y `pruebas:rasgos-en-catalogo`).
