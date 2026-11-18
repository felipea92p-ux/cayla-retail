# ADR-0591 · Nueva orden: agregar tallas y colores a un modelo sin salir a Catálogo

- **Fecha:** 2026-10-31 · **Estado:** construido y probado en local (base compartida: 17/17 casos de Postgres, 10 de las reglas de pantalla, y la pantalla
  recorrida en el navegador a 375 px y en oscuro). **La migración `20261031172000` NO está en producción**: se pega con el OK de Felipe.
- **Decide:** Felipe, 2026-10-31 («debería poder agregar una talla y color desde aquí nada más, porque ir a Catálogo para agregarlo es un paso largo
  innecesario»). Eligió la hoja chica con una función nueva en la base, entre tres caminos (hoja chica, reutilizar los modales de Editar producto, o solo un atajo).
- **Toca:** ADR-0509 (Nueva orden vive en la página; su pie decía «no desde la orden»), ADR-0263 (color y talla de una variante se corrigen desde su ficha),
  ADR-0494 (el stock de partida solo se escribe desde Editar), principios 1 (núcleo estable) y 2 (cero estados inconsistentes).

## El problema primero

La matriz «Cuántas por talla y color» de un modelo que ya existe se arma con las variantes que el modelo tiene. Si le faltaba una talla o un color, la
persona salía a Catálogo ▸ Editar producto, lo agregaba con todo su ritual (códigos, precios, stock de partida), guardaba, y volvía a abrir la orden: un paso
largo para algo que, en la mesa de corte, se decide en el momento. Y el pie de la matriz lo decía a propósito: «Se agrega en Editar producto, no desde la orden».

## Decisión

**Una función de la base, dos hojas chicas.**

1. `retail.agregar_variantes_a_modelo(taller, modelo, tallas uuid[], colores text[])` agrega UNA O VARIAS tallas (cada una con cada color que el modelo ya
   vende) o UNO O VARIOS colores (cada uno en cada talla que ya vende) y devuelve cuántas variantes creó. Exactamente una de las dos listas. **Todo o nada.**
   - **Quién:** opera ese Taller (`fn_produccion_exigir_operar`) Y edita el catálogo (`fn_puede_editar_catalogo`, la misma regla de la RLS de `variantes`).
     Sin módulo de Producción, sin Taller o sin catálogo: rechaza (`42501`). El responsable queda firmado (`fn_actor_persona_id(true)`, ADR-0162).
   - **Qué nace:** variantes activas con el precio y el costo de su variante hermana (la del mismo color o la de la misma talla y, a igualdad, la de mayor precio:
     la regla que ya usa `censo_crear_variante`) y **sin stock**: ningún movimiento, ninguna fila de `stock`. El código lo asigna el trigger de siempre.
   - **Qué no hace:** no duplica lo que existe; no reclama una variante **desactivada** (avisa y manda a Editar producto: reactivar es una decisión de catálogo);
     no mezcla «Sin color» con color ni «Única» con tallas (anticipa con un mensaje claro lo que el trigger de la tabla ya frenaba); no cambia precios ni costos.
   - **Concurrencia:** un candado por modelo (`pg_advisory_xact_lock`, ADR-0190). Y sube la versión del producto (un update vacío que `productos_version_bu`
     convierte en versión + 1, ADR-0193): quien tenga el producto abierto en Editar producto recibe «Otra persona cambió esta prenda» en vez de guardar sin ver lo nuevo.
   - **Auditoría:** una línea en la actividad (`produccion` / `variantes_modelo`) con las tallas o colores y cuántas variantes nacieron; si la anotación falla, la función sigue.
2. `NuevaOrdenProduccionForm` ofrece «+ Talla» y «+ Color» pegados a la tabla de un modelo que existe (Felipe, 2026-10-31: «al final de cada talla y al final de cada color, con un más»): «+ Talla» en una columna a la derecha de la última talla y «+ Color» en una fila debajo del último color. Son dos huecos opcionales de `MatrizCantidades` (`alFinalDeTallas`, `alFinalDeColores`), sin efecto en las demás pantallas que la usan. Cada una abre una hoja (`<Modal variante="hoja">`) que dice en una
   frase qué se va a crear («Se crean las tallas XS y XL en Beige, Gris perla, Negro y Nude: 8 prendas nuevas, con el precio y el costo del modelo y sin stock»),
   pide el responsable y llama a la función. Al volver, `router.refresh()` trae el modelo con sus variantes nuevas: la tabla dibuja la fila o la columna nueva
   **sin perder lo que ya se escribió** (probado: un «5» tecleado antes sigue ahí).
   - Las tallas que se ofrecen son las de la categoría del modelo que éste aún no vende, **sin «Única» ni «Estándar»** (no son una talla más). Los colores son los del
     vocabulario que el modelo no vende, comparados por código (el nombre visible se renombra). «+ Color» reutiliza `ElegirColores`, con la opción de crear un color nuevo.
   - Quien no puede (sin catálogo, modelo en talla única o «Sin color», todas las tallas ya puestas) ve el botón apagado y **con el motivo escrito al lado**.
   - Las hojas van **sin `<form>`**: abiertas desde dentro del formulario de la orden, un `submit` subiría por el árbol de React (ADR-0128) y abriría la orden entera.
   - En el celular el foco automático del buscador de colores se apaga: abría el teclado y la lista tapaba los botones del pie.

## Qué descarté

- **Reutilizar los modales de Editar producto.** Las variantes nuevas de la ficha se guardan junto con todo el producto (`catalogo_actualizar_producto`, con códigos,
  precios y stock de partida): sacarlo a una pieza compartida toca el formulario del catálogo, que hoy funciona.
- **Solo un atajo a Editar producto.** Sigue siendo el paso largo que se quería evitar.
- **Una función por talla y otra por color, de a una.** Agregar tres colores eran tres hojas y tres llamadas sin «todo o nada» entre ellas; las listas lo dan gratis.
- **Reactivar una variante desactivada.** Reaparece en ventas, stock y la tienda web: es de catálogo, no de una orden.

## Cómo se vigila

- `pnpm pruebas:produccion-agregar-variantes` (17 casos, en una tanda del CI): talla y color, varias a la vez, todo o nada, hermana, sin stock, duplicados, desactivada,
  talla única y sin color, categoría, color apagado, solo Taller, sin módulo, sin permiso de catálogo, versión que sube y que se vuelve a cargar encima.
- `lib/agregar-variantes-orden-reglas.test.ts` (qué se ofrece, qué se dice). `lib/guias.test.ts` (la guía de «Órdenes» tiene su paso y la huella de controles al día).

## Lo que queda

- **Producción:** pegar `20261031172000` (sola, sin partes: no toca políticas ni altera tablas en uso), luego refrescar el volcado del diccionario.
- Las hojas no tienen guía de foco propia (`no-aplica`: un control y el responsable). Si Felipe quiere el halo del campo que sigue, es un cambio de la hoja.
