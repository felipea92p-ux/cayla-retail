# ADR-0365 — Rótulos de anaquel en la Brother

- **Fecha:** 2026-10-09
- **Estado:** aceptada (Felipe: «quiero que el sistema, aparte de etiquetas, me genere con la Brother rótulos para poner por
  fuera a las prendas o a los anaqueles, para ubicar dónde está cada cosa»; foto del anaquel con «CHALECO VALERIA MIA» a plumón)

## Contexto

En el almacén cada anaquel o pila de bolsas se marca con un papel escrito a mano. Se borronea, no siempre está y cada
quien lo escribe distinto. La Brother QL-1110NWB y su rollo DK-22205 de 62 mm continuo ya imprimen las etiquetas de precio
(ADR-0180, y en Mac, el ayudante de ADR-0304). Nada en el sistema sabe en qué anaquel está un modelo: dentro de una sede solo
existen «Piso de venta», «Almacén de tienda» y «Cuarentena» (`sububicaciones`).

## Decisión (Felipe eligió entre tres alcances, 2026-10-09)

1. **Solo imprimir.** El rótulo sale del catálogo y no se guarda nada: ni anaqueles, ni posiciones, ni stock por anaquel.
   Hacer de los anaqueles un lugar del sistema cambia el modelo de stock (principio 1) y queda para cuando el rótulo
   impreso esté probado en el almacén.
2. **62 × 100 mm, en el mismo rollo.** El rótulo se diseña acostado (100 × 62, se lee a lo largo de la tira) y viaja en
   una hoja de 62 × 100 —el ancho del rollo por el largo del corte— girado adentro, igual que la forma A de la etiqueta.
   El nombre va en el tamaño más grande que entra (13 mm para una palabra corta, se lee a 2–3 m). En Windows sirve el papel
   «62 mm» de la Brother tal cual, que ya corta cada 100 mm.
3. **Qué dice:** la categoría arriba («CHALECOS»), el nombre del modelo sin repetir la categoría («VALERIA»), sus colores y
   tallas ACTIVOS (los del modelo, no los del stock de la sede: el anaquel guarda el modelo, y una talla que hoy no hay va al
   mismo lugar cuando llegue) y los códigos al pie. Uno por modelo, o **todos en un rótulo** (hasta 4, como el «CHALECO
   VALERIA MIA» de la foto); con categorías distintas, sin título.
4. **Sin QR.** El escáner y Buscar leen el código de una talla, no el de un modelo: un QR que no lleva a nada enseña a
   escanear algo que no sirve.
5. **Desde tres lugares:** la barra de lo marcado en Catálogo ▸ Productos y en Existencias («Rótulo») y un acceso
   «Rótulos» en Inicio de Almacén (sin modelos: se buscan en la misma pantalla). La ruta `/rotulos` no es un módulo
   (ADR-0306): es la salida de pantallas que ya tienen el suyo, como `/etiquetas-de-precio`.
6. **Un solo camino a la Brother.** La lógica de imprimir (diálogo en Windows, ayudante en Mac) sale de
   `ImprimirEtiquetasPrecio` a `components/impresion/useImpresionBrother.tsx`, y la usan las dos pantallas.
7. **El ayudante de Mac pasa a la versión 2:** `POST /imprimir?medida=62x100mm`, con una lista cerrada de medidas en
   `servidor.sh` (nunca llega a `lp` un texto de la petición). La pantalla de rótulos pide la versión 2; con la 1 avisa
   «es de una versión anterior» y ofrece la misma línea de Terminal para reinstalarlo. Las etiquetas de precio siguen
   funcionando con la 1.

## Consecuencias

- Sin migración, sin RPC: `getRotulos` solo lee `productos`, `categorias`, `variantes`, `tallas` y `colores`.
- Inicio de Almacén pasa a siete accesos; Escanear, solo en la última fila, ocupa la fila entera.
- Las Mac con el ayudante ya instalado tienen que reinstalarlo una vez para imprimir rótulos (la pantalla lo dice).

## Actualización 2026-10-09 (tarde) — Formidable

`/formidable` (informe en `docs/formidable/rotulos.md`) pidió tres cambios y Felipe los aprobó:
1. **El rótulo primero:** desde 1024 px, dos columnas (a la izquierda qué prendas y cómo salen; a la derecha los rótulos, pegados arriba); en
   angosto, la vista previa se achica para caber (`VistaQueCabe`, `zoom` medido con `ResizeObserver`). La hoja de impresión no cambia.
2. **El buscador sin la «Prenda sin registrar»** (`ID_PRODUCTO_CARGO_ESPECIAL`) ni productos `es_prueba`, como las demás lecturas.
3. **El aviso del ayudante de Mac en una línea** («Puedes imprimir igual…» + «Ver cómo»): `avisoDelAyudante` suma `resumen`, y
   `AvisoAyudanteMac` esconde el detalle técnico bajo un toque. **Cambia también en Etiquetas de precio**, que comparte el aviso.

## Verificación

- `lib/rotulos-reglas.test.ts` (13), `lib/mac-etiquetas.test.ts` (versión y medida), `scripts/mac-etiquetas/servidor.prueba.mjs`
  con Chrome real: 2 rótulos con `?medida=62x100mm` → PDF de 62,1 × 99,8 mm y `-o media=Custom.62x100mm`; medida fuera de la
  lista → 400.
- En el navegador local: buscador, uno por modelo / todos juntos, vista previa a tamaño real; la hoja de impresión pasada a
  PDF con Chrome sale en páginas de 62 × 100 mm con el rótulo girado.
- **Falta:** imprimir uno de verdad en la Brother de la tienda (Windows y Mac) y pegarlo en el anaquel.

## Lo que quedó fuera

- Anaqueles como lugar del sistema (código A-01, «está en A-03» en Buscar): decisión de Felipe para después.
- Un texto libre en el rótulo («Anaquel 3»): sin esa línea, el rótulo dice qué hay, no dónde está.
