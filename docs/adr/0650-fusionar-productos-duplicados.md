# ADR-0650 — Fusionar productos duplicados sin perder ventas, fotos ni stock

- **Fecha:** 2026-11-12 · **Estado:** construido en la rama `claude/merge-duplicate-products-09f938`. Cuatro migraciones (`20261112204000`, `205000`,
  `210000`, `211000`) y una más de lectura (`212000`), **ninguna en producción**: esperan el OK de Felipe.
- **Nace de:** Felipe (2026-11-12): «hay productos duplicados ya creados; en vez de borrar el stock, que se puedan fusionar en uno solo para ahorrar
  trabajo y no perder los datos de venta ni las fotos, ni el stock ya ingresado». Caso real: una capa de dos piezas se registró como blusa.
- **Relacionados:** ADR-0294 y `docs/investigacion/2026-09-29-duplicados-de-producto.md` (dejaron la fusión como «Fase 5», con el molde de
  `unir_clientas`, ADR-0249), ADR-0263 (D-138, una variante por prenda, talla y color), ADR-0252 (eliminar con historia), ADR-0542 (stock por dueño),
  ADR-0328 (qué es pérdida), ADR-0284 (guía de foco), ADR-0389 (guías interactivas).

## Las 15 decisiones de Felipe

Felipe pidió 15 preguntas para decidir los conflictos antes de construir. Lo que eligió:

| # | Pregunta | Decisión |
|---|---|---|
| 1 | Cuál queda | Lo elige la persona, viendo de cada ficha **sus ventas y la fecha en que se creó** |
| 2 | Desde dónde | Desde la ficha («Fusionar» en la vista rápida; en la Tabla, con dos o más marcadas) **y** una lista de posibles repetidas en Productos |
| 3 | Detectar | El sistema sugiere; **nunca fusiona solo** |
| 4 | Quién | **Quien ve Productos** (`fn_puede_editar_catalogo`, el mismo permiso que editar o desactivar) |
| 5 | Misma talla y color | Se juntan y **el stock se suma** en cada sede |
| 6 | Precio distinto | Lo elige la persona; por defecto, el del que queda |
| 7 | Costo distinto | Lo elige la persona |
| 8 | Nombre, descripción, marca, proveedor, tejido… | **Campo por campo**, solo lo que difiere |
| 9 | Fotos | **La persona elige cuáles**; las demás se guardan en la ficha repetida |
| 10 | Etiquetas impresas | **Siguen sirviendo** al escanearlas |
| 11 | Categorías distintas | **Sí** (la capa registrada como blusa); se elige la categoría final |
| 12 | Dueño en Lima | Cada unidad **conserva su dueño** (CAYLA o CLAURE) |
| 13 | Algo en curso | **Se mueve junto**; solo frena lo que no tiene a dónde ir (ver abajo) |
| 14 | Deshacer | **No**: resumen antes de confirmar y rastro completo; la repetida queda archivada, nunca borrada |
| 15 | Cuántas a la vez | **Varias** |

## Decisiones técnicas

DECIDÍ:

1. **Las variantes se MUDAN, no se copian.** `variantes.producto_id` pasa al producto que queda (solo desde una función `security definer`, por el candado
   `variantes_identidad_solo_por_funcion`). Todo lo que apunta a la variante (stock, movimientos, ventas, apartados, traslados, códigos de barras, precios
   por talla) la sigue sin reescribirse. Por eso lo que está en curso sobre una variante que se muda viaja con ella (decisión 13).
2. **La misma talla y color se JUNTA con movimientos nuevos.** `movimientos` no se edita (`movimientos_inmutables`): las unidades pasan con una salida de la
   repetida y una entrada en la que queda, por sede y lugar (piso, almacén), motivo `fusion_producto` (`fn_fusion_pasar_unidades`). En una sede de dos
   empresas se pasan por dueño, cada uno con su `empresa_id`, y `stock_dueno` sigue cuadrando (decisión 12). La repetida se apaga con
   `variantes.fusionada_en_id` y también se muda al producto que queda, para que su historial de ventas cuente en él; el índice
   `variantes_identidad_unica` deja de mirar las fusionadas (D-138 sigue valiendo para todo lo demás).
3. **La salida por fusión no es pérdida.** Un motivo de salida que la base no conoce cuenta como «pérdida a mano» en Pérdidas y en el diario
   (`fn_perdida_razon`). `fusion_producto` se suma a los que no lo son, y la puerta suelta de Ajustar (`registrar_movimiento`) lo sigue rechazando: nadie
   puede escribirlo a mano para esconder una pérdida (`pruebas:perdidas`, PU1).
4. **Las etiquetas viejas suenan** (decisión 10): los códigos de barras de la juntada pasan a la que queda, y también su `codigo` y su `sku` (lo que va
   impreso en la etiqueta), como códigos propios.
5. **Lo que no tiene a dónde ir FRENA**, con su frase: una talla y color que se junta con apartadas, en un traslado en camino, en un pedido web sin
   entregar, en una orden de producción abierta, en un conteo abierto o en Cuarentena; un pendiente de un envío por recibir; «Sin color» que quedaría
   mezclado con colores; una talla, un tejido o un patrón que la categoría final no tiene; la empresa del que queda que no opera donde está el stock que
   llega. Lo calcula UNA función (`fn_fusion_productos_plan`) que leen la previsualización y la fusión: lo que se ve es lo que pasa.
6. **El costo de compras no se toca.** El costo elegido (decisión 7) va solo en las tallas cuyo costo todavía no sale de sus compras (el promedio
   ponderado no se cambia a mano en ningún lado, `variantes_costo_hasta_la_primera_compra`), y solo si la cuenta ve el dinero de compras.
7. **El producto repetido queda `descontinuado` con `productos.fusionado_en_id`** y suelta su nombre (el índice del nombre único por marca deja de mirarlo).
   Abrir su ficha o su historial por un enlace viejo lleva al que quedó; la alerta de parecidos ya no lo ofrece.
8. **Una fila por producto (vitrina, ficha del Taller, origen, consumos, procesos…): manda la del que queda;** la del repetido pasa solo si el que queda no
   tiene. Lo que se escribe una sola vez (decisiones de Frescura, tráfico web, correcciones de costo, el plan de compra, precios por tienda de la prenda,
   pendientes ya resueltos) se queda en el repetido, que apunta al que quedó. La prueba de deriva (`pruebas:fusionar-productos`, caso 21) falla si nace
   una tabla con llave a productos o variantes sin decir qué le pasa al fusionar.
9. **Rastro:** `producto_fusiones` guarda la ficha completa de cada repetido antes de tocarlo (producto, variantes, códigos, fotos, stock por dueño), lo
   elegido y lo movido; y una línea en Actividad. Es la evidencia para reconstruir a mano: no hay «deshacer» (decisión 14).
10. **Concurrencia:** `for update` sobre todas las fichas en orden de id y la versión que vio la pantalla (PT409). Dos personas fusionando lo mismo (o al
    revés) a la vez: la segunda espera y se detiene con «ya se fusionó en otro producto», sin trabarse (probado en la base aislada).
11. **Las sugerencias** (`fn_productos_posibles_duplicados`, decisión 3): mismo nombre en otra marca, una letra de diferencia o muy parecido en la misma marca
    y categoría. **No** sugiere fichas de categorías distintas con otro nombre («Capa Emma» / «Blusa Emma»): los modelos se llaman como personas y se repiten
    a propósito entre categorías («Blusa Sofía», «Vestido Sofía»). Esas se fusionan a mano con «Fusionar».

## DESCARTÉ

- **Repuntar `variante_id` en `movimientos` y `venta_items`:** el libro es inmutable por diseño (principio 4) y reescribirlo borraría de dónde vino cada
  unidad. Mudar la variante entera da lo mismo sin tocar la historia.
- **Que la juntada quedara en el producto archivado:** sus ventas dejarían de contar en el que quedó, y cada lectura por producto (Análisis, Historial,
  Frescura) tendría que seguir `fusionado_en_id`. Mudarla también, apagada, lo resuelve sin tocar ninguna lectura.
- **Un «deshacer»:** Felipe eligió no tenerlo; además, con ventas nuevas en la ficha final después de fusionar, separar de nuevo es ambiguo.

## Pendiente

- **Producción:** pegar `20261112204000` → `205000` → `210000` → `211000` → `212000`, en ese orden (solo funciones, columnas e índices; sin políticas), con
  el OK de Felipe; después `pnpm datos:generar:produccion`.
- «Esta no es repetida»: hoy un par sugerido que no es la misma prenda sigue en la lista. Si molesta, una tabla de pares descartados.
- Que Eliminar diga «se fusionó con otra ficha» en vez del error de la llave (`fn_producto_historia`), como los otros pendientes de su prueba.
