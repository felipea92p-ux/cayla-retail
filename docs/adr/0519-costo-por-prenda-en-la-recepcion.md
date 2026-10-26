# ADR-0519 · Costo de compra por prenda al cerrar un envío

- **Fecha:** 2026-10-26 · **Estado:** aceptado (Felipe, 2026-10-26: «mostrar el precio que costó cada prenda y permitir modificarlo»).
  **Migración `20261026164000` aplicada en la base local; pendiente de pegar en producción con su OK.**
- **Pedido:** Felipe, 2026-10-26, mirando «Precio de venta» en el cierre de un envío: la compra sí guarda lo que costó cada prenda, pero la
  recepción solo muestra un «Precio de compra» único por categoría; quería ver el de cada prenda y poder corregirlo (por si hubo un fallo al
  comprar). Pidió también el título «Precio de venta» sobre cada campo.
- **Sigue de:** ADR-0393 (recibir contando primero: el costo de una línea se fija al cerrar y lo que se detalle después entra con él),
  ADR-0362 (decisión 18: quien recibe ve y corrige el costo), ADR-0480 (Compras simple: cada prenda comprada es una línea con su costo),
  ADR-0517 (la pantalla de la fila por prenda).

## El problema primero

Al cerrar un conteo, el costo de compra es **uno por línea** (una categoría y una marca de una orden). Todo lo que entra de esa línea, y
lo que se detalle después, entra con él. Pero quien cuenta **separa** esa línea en prendas distintas (12 vestidos → Sofía 6, Antonella 4, otra
por crear), y cada una puede haber costado distinto. Con una compra hecha desde «Compré ropa» cada prenda ya es su propia línea con su costo,
pero una orden por categoría («Vestido midi», 12 a S/ 58) llega como una sola línea. Hoy un error al comprar solo se corrige para toda la
línea, o prenda por prenda después, desde Catálogo.

## Lo que se midió antes de decidir

- **El costo vive en el conteo, no en la prenda:** `despacho_conteos.costo_unitario` (decisión 6 de ADR-0393), que `cerrar_conteo_envio`
  escribe y `resolver_pendiente_envio` («Hacer ahora») lee. La fila de lo recibido (`despacho_recibidos`) y el promedio de la variante
  (`fn_recalcular_costo_variante`) ya trabajan **por variante**: el costo por prenda cabe sin cambiar su forma.
- **La puerta al stock es una sola** (`fn_recepcion_entrar`, ADR-0393): ahí se pone el costo de cada variante y se revisa el costo
  atípico. Cambiarla en un punto cubre el cierre y «Hacer ahora».

## Decisión

1. **Cada prenda separada puede tener su propio costo de compra.** Si no lo tiene, cuesta lo de su línea (lo de siempre). El campo
   «Precio de compra» va junto al de venta, en la fila de la prenda; arranca con el costo de su línea y, si se cambia, dice «Antes S/ …».
2. **Se guarda en el conteo** (`despacho_conteos.costos_prendas`, `{producto_id: costo}`), no en la prenda: es un dato de esta recepción.
   Lo que se detalle después entra con él. Solo guarda lo que cuesta distinto de la línea; poner el costo de la línea lo quita.
3. **Mismas reglas que el costo de la línea:** de 0 a 99 999.99, dos decimales, quien recibe lo ve y lo corrige (decisión 18), y en un envío
   sin aviso lo de fuera de la guía solo lo escribe quien ve el dinero de Compras. Una prenda que ya no está separada en esa línea se ignora.
4. **El costo atípico se revisa por variante:** un costo propio fuera de lo normal pide confirmar aunque el de la línea esté bien.
5. **La confirmación del cierre lista cada cambio** («Precio de compra · Vestido Sofía · Vestidos · S/ 58.00 → S/ 55.50»), como el de la línea.
6. **Sin costos propios todo queda idéntico** (la línea manda): ninguna línea cambia de costo por esta migración.
7. **La pantalla (Felipe, 2026-10-26, mismo día):** el campo de la prenda se titula «Costo» (la columna de la línea sigue «Precio de compra»), y
   «¿Dónde vale?» pone primero la sede que recibe, ya marcada, y segunda «Todas las sedes». **Es un cambio de valor inicial:** antes un precio
   de venta cambiado valía para todas las sedes salvo que se eligiera lo contrario; ahora vale solo para la sede que recibe salvo que se elija
   «Todas las sedes». No cambia nada si no se toca el precio de venta, y la confirmación del cierre dice «solo Tienda …» o «todas las sedes».
8. **Sin la columna «Precio de compra» en la lista (Felipe, 2026-10-26):** cada prenda ya muestra su costo, así que la columna sobraba. El costo
   de la línea sigue existiendo (es el de las prendas sin costo propio y el de lo que aún no es una prenda), pero **sale en el detalle de la
   fila solo cuando hace falta**: hay unidades sin identificar («Sin identificar · 14 unidades · Costo»), la línea no estaba en la guía (su
   costo es obligatorio; esa fila se ve abierta) o el costo está mal escrito. Una línea con todas sus unidades en prendas no lo muestra. La fila
   cerrada avisa «Costo cambiado», «Precio de venta cambiado» o «Costo y precio cambiados», porque el costo ya no está a la vista.
9. **Solo se costea lo que tiene nombre (Felipe, 2026-10-26, mirando «Vestidos»):** al abrir una fila se listan las prendas **identificadas**
   (Vestido Sofía) y las **nuevas ya descritas** (holaa, «por crear»), cada una con su costo; las que todavía no son una prenda NO tienen fila,
   porque dejarían cambiar un costo sin saber de qué es. Al final se avisa «Hay 2 prendas sin identificar: cuestan lo que dice la orden (S/ 58.00)».
   Reemplaza al decidido en el punto 8: la fila «Sin identificar» con su campo de costo ya no existe. Es UN solo mensaje: con prendas con nombre sale como nota al final; sin ninguna, ese mismo mensaje hace de vacío («… Su costo y su precio de venta se cambian cuando las identifiques o las describas.»); sin unidades sin identificar no sale nada. **Una línea de fuera de la guía sigue
   llevando su campo** (su costo es obligatorio y no viene de ninguna orden). Como una prenda nueva descrita todavía no existe, su costo se
   guarda por su descripción (`nueva:<descripción>`, tal cual quedó en el conteo) y entra a su prenda cuando se crea y se resuelve su
   pendiente (`resolver_pendiente_envio`; probado en la prueba de base H2).

## Lo que no cambia

- **El comprobante y el pago** (`completar_papel_compra`) siguen con el costo de cada línea de la orden: Compras ve el papel; la tienda, la
  mercadería (ADR-0480). Si la tienda corrige el costo de una prenda, el papel y el stock pueden quedar a distinto costo: es lo que ya pasa con
  el costo de la línea.
- **`recibir_despacho`** (el formulario de la fase 4) no manda costos por variante y entra con el de la línea.
- **Quién puede corregir el costo:** el mismo que hoy corrige el de la línea.

## Descarté

- **Partir la línea en una por prenda al cerrar:** cambia los números de la guía («dijeron 12»), las diferencias y el papel del proveedor.
- **Guardar el costo dentro de `separado`** (lo contado): lo reescribe cada guardado del conteo, que no conoce el costo, y se perdería.
- **Una tabla por (línea, prenda):** es un dato que solo se lee junto con el conteo; una columna jsonb lo deja con su dueño.
- **Un campo que no hace nada hasta otra pantalla:** el costo editable que no llegara al cierre sería peor que no tenerlo.

## Cómo se pega en producción

Con el OK de Felipe, **después de `20261026161000`** (ADR-0517). Una parte, sin políticas ni `drop trigger` (ADR-0195): un `alter table …
add column` con valor por defecto (Postgres no reescribe la tabla), dos funciones nuevas y reemplazos anclados de cuatro (`fn_recepcion_entrar`,
`cerrar_conteo_envio`, `resolver_pendiente_envio`, `fn_envio_conteo_json`), con `lock_timeout` y idempotente: si la definición viva no es
la esperada, se detiene sin cambiar nada. Las anclas se verificaron en la base local, que tiene todas las migraciones; **falta
comprobarlas contra producción** (solo lectura) antes de pegar. **La web puede publicarse antes que la base:** sin la migración el campo se
dibuja pero la base ignora `costos_prendas` en silencio, así que conviene pegar la migración antes de publicar la pantalla.

## Cómo se verifica

- `pnpm pruebas:costo-por-prenda` (9 casos, en el CI): la prenda con costo propio entra con él y las demás con el de la línea (fila de lo
  recibido y costo de la variante); sin costos propios, igual que antes; el costo de la línea solo mueve a las prendas sin costo propio; la
  lectura del conteo lo trae; «Hacer ahora» entra con el costo de su prenda; la validación y lo que se ignora; el costo atípico por
  variante; las piezas internas cerradas. Se comprobó con cinco mutaciones (sin costo por variante, sin guardarlo, sin leerlo al detallar,
  sin pasarlo al cierre y la revisión atípica solo por línea) que la prueba se pone en rojo donde debe.
- Las suites de recepción existentes siguen verdes (`pendientes_de_envio` L1 falla en la base local por datos reales, no por este cambio).
- En el navegador local: el campo, el «Antes S/ 58.00» al cambiarlo, y la fila a 1600, 1280 y 375 px sin desbordes. **No se cerró un envío
  de verdad desde la pantalla** (habría movido datos de pruebas de la base local): el camino pantalla → base lo cubren las pruebas de
  `lineasParaCerrar` (lo que se manda) y las de la base (lo que se hace con ello).
