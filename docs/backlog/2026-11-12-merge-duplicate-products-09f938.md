# Fusionar productos duplicados (2026-11-12)

Felipe (2026-11-12): «hay productos duplicados ya creados; en vez de borrar el stock, que se puedan fusionar en uno
solo sin perder los datos de venta, las fotos ni el stock ya ingresado». Es la «Fase 5» que dejaron pendiente
ADR-0294 y `docs/investigacion/2026-09-29-duplicados-de-producto.md` («con el molde de `unir_clientas`»).

**Estado:** las 8 actividades construidas y probadas en una base local aislada (ADR-0650). **Las migraciones `20261112204000`, `205000`,
`210000`, `211000` y `212000` NO están en producción**: esperan el OK de Felipe, en ese orden.

## Las 15 decisiones de Felipe

| # | Pregunta | Decisión |
|---|---|---|
| 1 | Cuál queda | Lo elige la persona, viendo de cada uno **sus ventas y la fecha en que se creó** |
| 2 | Desde dónde | Desde los dos lugares: «Fusionar con…» en el producto y una lista de **posibles duplicados** en Catálogo ▸ Productos |
| 3 | Detectar | El sistema sugiere los que parecen duplicados; **nunca fusiona solo** |
| 4 | Quién | **Quien ve Productos** (`fn_puede_editar_catalogo`, como desactivar o editar), no solo el líder |
| 5 | Misma talla y color en los dos | Se juntan y **se suma el stock** en cada sede |
| 6 | Precio distinto | Lo elige la persona (por defecto, el del que queda) |
| 7 | Costo distinto | **Lo elige la persona** |
| 8 | Nombre, descripción, marca, proveedor, tejido | **Campo por campo**: solo lo que difiere, lado a lado |
| 9 | Fotos | **La persona elige cuáles** pasan; las demás quedan guardadas en el duplicado archivado |
| 10 | Etiquetas impresas | **Siguen sirviendo**: escanear el código viejo encuentra la prenda fusionada |
| 11 | Categorías distintas | **Sí se puede.** Caso real: una capa de dos piezas se registró como blusa; es la misma prenda en otra categoría. Se elige la categoría final |
| 12 | Dueño en Lima (CAYLA / CLAURE) | Cada unidad **conserva su dueño** |
| 13 | Algo en curso (apartado, traslado, pedido web, producción) | **Se mueve junto**; solo se frena si una talla y color repetida tiene un apartado o un traslado en camino, y dice cuál cerrar |
| 14 | Deshacer | **No se deshace**: resumen antes de confirmar y rastro completo (quién, cuándo, qué se movió); el duplicado se archiva, nunca se borra |
| 15 | Cuántos a la vez | **Varios**: uno que queda y uno o más duplicados |

## Cómo se hace sin romper la base (decisiones técnicas)

- **Las variantes se mudan, no se copian.** `variantes.producto_id` pasa al producto que queda (lo permite solo una función
  `security definer`, por el candado `variantes_identidad_solo_por_funcion`). Así stock, movimientos, ventas, apartados,
  traslados y códigos de barras siguen apuntando a la misma variante: nada de eso se reescribe.
- **Talla y color repetidos:** `movimientos` no se edita (`movimientos_inmutables`), así que las unidades se pasan con
  movimientos nuevos (salida de la variante duplicada, entrada en la que queda, por sede, por piso/almacén y con su
  `empresa_id`, para que `stock_dueno` siga cuadrando). Los códigos de barras de la duplicada pasan a la que queda. La
  duplicada se apaga con `variantes.fusionada_en_id` y también se muda al producto final, para que su historial de
  ventas cuente en él; el índice `variantes_identidad_unica` deja de mirar las fusionadas.
- **El producto duplicado** queda `descontinuado` con `productos.fusionado_en_id`; el índice de «nombre único por marca»
  deja de mirarlo, para que el que queda pueda tomar su nombre.
- **Tablas que se escriben una sola vez** (`frescura_decisiones`, `trafico_web`, `pedidos_campana_lineas`,
  `costo_correcciones`) siguen apuntando al duplicado; quien las lea sigue el `fusionado_en_id`. Las demás se repuntan.
  Las de una fila por producto (vitrina, taller, consumos, procesos, origen) conservan la del que queda y toman la del
  duplicado solo si el que queda no tiene.
- **Rastro:** tabla `producto_fusiones` con la foto completa de cada duplicado (`to_jsonb`), conteos y quién; y
  `fn_actividad_anotar`. Es el molde de `unir_clientas` (`for update` en las filas, versión esperada, PT409).
- **No queda atrás:** la prueba de deriva de `eliminar_producto_con_historia` se reusa para que una tabla nueva que
  apunte a productos o variantes tenga que decir qué le pasa al fusionar.

## Actividades (aprobadas por Felipe el 2026-11-12, hechas)

1. Migración base: `fusionado_en_id` en productos y variantes, los dos índices únicos, tabla `producto_fusiones`.
2. Lectura `previsualizar_fusion_productos`: qué pasará, choques de talla y color, bloqueos, campos que difieren, fotos.
3. `fusionar_productos` con su suite de Postgres (stock contra movimientos, dueño en Lima, ventas, códigos de barras, deriva).
4. Lecturas que siguen al fusionado (historial, buscar por código viejo, Análisis por producto).
5. Web: la hoja «Fusionar productos» desde la vista rápida y la tabla de Productos.
6. Web: «Posibles duplicados» en Catálogo ▸ Productos (misma marca y nombre igual o parecido, sin exigir la misma categoría).
7. Guía de foco, guía interactiva, sugerencias, modo oscuro, 375 px, `/chaos` y `/formidable`.
8. ADR, bitácora, ARQUITECTURA y PR con `/abrir-pr`. **Pegar en producción solo con el OK de Felipe.**

## Pendiente

- [ ] Pegar las cinco migraciones en producción, en orden (OK de Felipe) y `pnpm datos:generar:produccion`.
- [ ] Probar «Fusionar» con un par real: la capa registrada como blusa.
- [ ] «Esta no es repetida» para sacar un par de la lista de sugeridas (si las falsas molestan).
- [ ] Que Eliminar diga «se fusionó con otra ficha» en vez del error de la llave (`fn_producto_historia`).
- [ ] `/formidable` y la prueba ciega de la hoja con una colaboradora real (hecha la revisión en el navegador: claro, oscuro, 375 px).
