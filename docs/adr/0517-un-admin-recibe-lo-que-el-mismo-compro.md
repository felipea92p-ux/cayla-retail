# ADR-0517 · Un Admin recibe lo que él mismo compró (y queda a la vista)

- **Fecha:** 2026-10-26 · **Estado:** aceptado (Felipe, 2026-10-26: «solo Admin»). **Migración `20261026161000` aplicada en la base local;
  pendiente de pegar en producción con su OK.**
- **Pedido:** Felipe, 2026-10-26, al registrar una compra en «Mis compras» y no poder recibirla: «Quiero poder recibir mis propias compras
  siendo líder». Pidió antes el análisis y la consecuencia de negocio; decidió «solo Admin, deja el rastro visible y no toques el Taller
  todavía».
- **Cambia:** la decisión 17 de ADR-0362 («quien crea la orden de compra no puede recibirla, sin excepción, ni el líder»). **Sigue de:**
  ADR-0362 (órdenes de compra y despacho a sedes), ADR-0393 (recibir contando primero), ADR-0480 (Compras simple), ADR-0178 (el escalón
  Admin), ADR-0161 («los permisos se preguntan a la cuenta»).

## El problema primero

Quien compra en «Mis compras» manda su compra a la tienda y la tienda la recibe contando. La regla de ADR-0362 impedía que la recibiera
quien la compró: contar es certificar lo que llegó, y nadie debe certificar lo que él mismo pidió. Funciona cuando compra una persona y
recibe otra, pero Felipe compra y recibe en la misma tienda y su cuenta se quedaba con «La recibe otra persona: tú hiciste la orden» sobre
su propio envío. Probando el flujo de punta a punta con una sola cuenta nunca se llegaba a contar.

## Lo que se midió antes de decidir

- **La regla vive en la base**, no solo en pantalla: un candado interno (`fn_recepcion_exigir`) que llaman más de una docena de funciones (abrir, guardar y
  cerrar el conteo, reabrir, el precio de venta y las observaciones del envío), más la comprobación propia de «Llegó esta orden»
  (`recibir_orden_sin_envio`). Las tres lecturas de Recibir marcan `creado_por_mi` con una sola función (`fn_recepcion_quien_mira`).
- **Levantarla para todo líder dejaba sin control justo donde compra la encargada de tienda** (decisión 19 de ADR-0362): el 2026-10-10 había
  14 líderes activos y 6 Admin (decisión 33). Por eso la excepción es del escalón de arriba.
- **Lo que no se mide aquí:** cuántas personas con Recibir hay en cada tienda de producción. No se consultó.

## Decisión

1. **La excepción es de la cuenta de un Admin** (`fn_es_admin()`: Admin en Dynamic y Líder activo aquí), no del responsable que se elige en
   el combo. Una terminal nunca la tiene, aunque en el combo se elija a un Admin; si Dynamic no responde, `fn_es_admin()` da `false` sin
   error y la regla vuelve a ser la de siempre. Vive en **un solo lugar**: `fn_recepcion_puede_recibir_lo_propio()`.
2. **Todo lo demás sigue igual:** el líder que no es Admin, la persona común y las terminales siguen frenados con el mismo error
   (`recibir_quien_compro`). La excepción solo quita el freno cuando la persona que firma es la misma que hizo la orden; no abre otra sede
   ni da el módulo Recibir a nadie.
3. **El rastro, sin dato nuevo que pueda discrepar** (principio 4): todo sale de lo que ya dicen `ordenes_compra.creada_por` y
   `despachos.cerrado_por`.
   - **Antes de contar**, la pantalla del envío le avisa a ese Admin: «Compraste esto tú: lo puedes recibir porque eres Admin».
   - **Ya cerrado**, cualquiera que mire el envío ve «Lo recibió quien hizo la compra» (`fn_envio_detalle` trae `recibio_quien_compro`).
   - **Quien revisa las compras** lo ve en la ficha del papel (`fn_revisar_compras` marca cada envío): el que completa el papel nunca es quien
     compró, así que es la persona a la que hay que decírselo.
   - **En Actividad**, un disparador anota «ENV-…: lo recibió quien hizo la compra» cada vez que un envío pasa a «cerrado» por quien hizo
     alguna de sus órdenes. Sirve igual si cerró `cerrar_conteo_envio` o `recibir_despacho`, sin reescribir ninguna de las dos; si anotar
     falla, el cierre sigue.
4. **El Taller no se toca todavía** (Felipe): `recibir_orden_insumo` y lo que no llegó de una orden de insumos conservan su bloqueo íntegro.
   Una prueba lo vigila.

## Lo que se pierde (y se acepta)

- **Se pierde el segundo testigo de la mercadería física** cuando quien compra es un Admin y recibe lo suyo: la foto del papel y su conteo son
  de la misma persona. El descuadre solo aparecería después, en un conteo de Existencias. Por eso el rastro es visible a quien revisa.
- **La plata sigue con otro control:** `completar_papel_compra` y `confirmar_plata_compras` piden el módulo `fondos` y «nunca la propia». Quien
  compra y recibe su compra sigue necesitando a otra persona para pasarla a los libros.

## Descarté

- **Levantar la regla para todo líder:** quita el control a las encargadas que compran.
- **Excepción solo en tiendas con una persona:** la regla cambiaría al contratar y habría casos borde (vacaciones, turnos).
- **Una columna «recibida por quien compró» en `despachos`:** duplica `creada_por` y `cerrado_por`, puede discrepar de ellos y obligaba a
  reescribir `cerrar_conteo_envio` y `recibir_despacho`, que ya llevan varios parches.
- **Reescribir las tres lecturas de Recibir:** con que `fn_recepcion_quien_mira()` salga `null` para el Admin, las tres dicen lo correcto.
  Su nombre ya no es literal («la persona que mira»); el comentario de la función lo explica.
- **Preguntar al responsable del combo si es Admin:** contradice «los permisos se preguntan a la cuenta» y abriría la excepción a una terminal
  compartida.

## Cómo se pega en producción

Con el OK de Felipe, después de `20261024235000`. **Una parte**, solo funciones y un disparador (`create or replace trigger`, nunca `drop
trigger`: ADR-0195), sin tablas ni políticas, con `lock_timeout`. Es idempotente: tres reemplazos anclados (`recibir_orden_sin_envio`,
`fn_envio_detalle`, `fn_revisar_compras`) que se detienen sin cambiar nada si la definición viva no es la esperada. Las anclas se verificaron
en la base local, que tiene todas las migraciones; **falta comprobarlas contra producción** (en solo lectura) antes de pegar.

## Cómo se verifica

- `pnpm pruebas:recibir-lo-propio` (10 casos, en el CI): el Admin abre y cierra su envío y recibe «sin guía» su orden; el líder que no es
  Admin y quien compra sin ser líder siguen frenados; la marca en el detalle, en Revisar compras y en Actividad; la excepción se pregunta a la
  cuenta; las piezas internas cerradas; el Taller intacto. Se comprobó con dos mutaciones (la excepción que nunca vale y la que vale para
  todos) que la prueba se pone en rojo.
- Las suites viejas de recepción cargan sus propias migraciones y siguen verdes. Tres casos que usaban a Felipe (Admin) como «quien hizo la
  orden» pasaron a un líder que no es Admin (`precio_desde_recepcion` P2b, `reabrir_envio` A5, `pendientes_de_envio` R6).
- En el navegador local, como Felipe (Admin): el envío de su propia compra ya no sale bloqueado, la fila de la lista dice «Detalle» y la
  pantalla muestra el aviso. **No se vio renderizado** el aviso de un envío ya cerrado por su comprador (la base local no tiene uno y no se
  creó): lo cubren la prueba de base y la de lectura.
