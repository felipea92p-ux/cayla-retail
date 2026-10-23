# ADR-0480 — Compras simple: la compra nace en el celular de quien compra

- **Fecha:** 2026-10-22 · **Estado:** en construcción en la rama `claude/modulo-compras-66e94a`, actividad por actividad
  (`/construir`). Actividad 1 (menú y módulos): migración `20261022225000_compras_simple_modulos.sql`. Actividad 2 (anotar y confirmar
  la plata): `20261022235000_compras_simple_plata_anotada.sql`. Actividad 3 (registrar una compra): `20261023005000_compras_simple_compra_rapida.sql`. Actividad 5 (otro gasto,
  mandar a la tienda y terminar el día): `20261023114000_compras_simple_gasto_envio_y_cierre.sql`. Actividad 6 (recibir
  mirando la foto): `20261023121000_compras_simple_recibir_con_la_foto.sql`. Actividad 7 (revisar compras):
  `20261023143000_compras_simple_revisar.sql`.
  **Ninguna pegada en producción** (se pegan después de publicar la web,
  en orden y con el OK de Felipe).
- **Maqueta aprobada:** `docs/maquetas/compras-simple-2026-10/` (index.html tocable + README con cada decisión).
- **Relacionados:** ADR-0362 (Órdenes de compra y Fondos por rendir, fases 1–6: lo que se reemplaza), ADR-0111 y ADR-0362 fase 5b
  (notas de crédito y documento interno), ADR-0161 y ADR-0306 (módulos y roles; un módulo es una entrada del menú), ADR-0387 («el
  módulo es la llave»).

## El problema

Reunión del 2026-10-22: «prioridad máxima a Compras y Recibir». Consultado en producción ese día, en solo lectura: **0 órdenes de
compra, 0 fondos por rendir, 0 notas de crédito**; las 9 «compras» eran gastos. 3 065 unidades habían entrado por carga inicial con el
costo escrito a mano en Catálogo, contra 37 por Recibir. Compras estaba construido y nadie lo usaba: pedía a quien compra en la calle
o al proveedor (sin formación técnica, con el celular en la mano) que llenara una orden, una factura y una recepción en un computador.

## Lo que decidió Felipe (2026-10-22, mirando la maqueta)

1. **Paso 1 — la plata.** La misma compradora anota en el celular la plata que recibió (cuánto, cómo le llegó, foto del voucher; «ya
   tenía» solo la primera vez). Quien tiene Compras la confirma. Lo que sobra queda para la próxima.
2. **Paso 2 — «Compré ropa».** Busca al proveedor (por nombre o categoría) o lo registra (con aviso de duplicado); elige de sus
   habituales o «Algo nuevo»; cantidad, costo y precio de venta («igual que la vez pasada»); a qué tienda va; la foto de la boleta con
   el monto. Aparte: «Otro gasto», «Mandar a la tienda» (un envío por tienda) y «Terminé de comprar hoy».
3. **Paso 3 — la tienda recibe** mirando la foto: cuenta, pone el costo (stock y costo entran juntos) y ve como sugerido el precio que
   puso la compradora, que puede cambiar; una prenda nueva se crea ahí con ficha completa, sin ir a Catálogo.
4. **Paso 4 — «Revisar compras»** (quien tenga el módulo, no necesariamente el líder): confirma la plata, copia serie y número del
   comprobante y decide qué pasa con lo que no cuadró.
5. **El menú de Compras queda en 6 opciones:** Plan de campaña (sin tocar), Mi plata para compras, Revisar compras, Proveedores,
   Facturas de proveedor y Por pagar. **Órdenes de compra y Notas de crédito se quitan**: «por ahora no manejaremos notas de crédito».

## Decisiones técnicas (actividad 1)

- **`ordenes_compra` se reusa como «Mi plata para compras»; `fondos` se llama «Revisar compras».** Unas 40 funciones de la base usan
  `ordenes_compra` como llave de permiso (recibir, gastos del viaje, datos bancarios del proveedor, registrar un proveedor nuevo, «Nos
  debe»). Retirarla cambiaría en silencio quién puede qué; reusarla deja todo igual y quien hoy compra sigue pudiendo. Cambian el
  nombre y el «incluye» en `retail.modulos`, el nodo del menú y la ruta (`/compras/mi-plata`). Las pantallas de órdenes siguen en el
  código sin entrada en el menú hasta que una actividad posterior las retire.
- **`notas_credito` se retira del catálogo** como en ADR-0306: se borran sus asignaciones de rol y su fila; nunca historia (la
  migración se detiene si `actividad` o `roles.pantalla_principal` la nombran). Nadie pierde ver el dinero de Compras: las reglas
  piden **cualquiera** de `facturas_compra`, `por_pagar` y `notas_credito`, y los dos roles que tenían notas tienen también las otras.
  Registrar una nota (y adjuntar la del proveedor a un documento interno) queda solo del líder, sin pantalla. `adjuntar_nota_proveedor`
  anotaba su Actividad bajo `notas_credito`: esa anotación ya no puede escribirse y la función sigue sin ella (deja un warning). Si las
  notas vuelven, vuelven con su módulo (`pruebas:nos-debe` lo marca: «0 en Actividad»). **Las tablas y funciones de notas no se tocan**: la historia y el saldo a favor
  (documento interno) siguen leyéndose donde ya se leían.
- **La web deja de dibujar notas**: se borran la pantalla, sus modales, sus avisos del Inicio y del Observatorio, y las reglas que solo
  ellas usaban (Knip). `/compras/notas-credito` redirige a `/compras`. En Recibir, «lo que no llegó» se reclama en «Nos debe» del
  proveedor.

## Actividad 2: la compradora anota su plata y Compras la confirma (2026-10-22)

**Lo que decidió Felipe al construirla:** al confirmar se dice de qué cuenta salió, con el **BCP sugerido** (se puede cambiar); la plata
que «ya tenía» entra como **saldo de apertura**.

- **`fondo_plata_anotada`**: cada plata anotada (cómo llegó, cuánto, la foto del voucher). Nace «por confirmar» y pasa una sola vez a
  «confirmada», con el monto que confirmó Compras; nunca se borra ni se edita después. RLS sin políticas: solo la tocan sus funciones.
- **Anotar no mueve plata** (`anotar_plata_compras`, módulo `ordenes_compra`): un voucher falso no le resta al banco. «Tienes para
  comprar» suma el fondo más lo por confirmar, porque Felipe quiso que la plata se pueda usar de una vez. Si se gasta antes de que se
  confirme, el fondo queda en negativo («CAYLA te debe», decisión 32) y la confirmación lo compensa.
- **Confirmar** (`confirmar_plata_compras`, módulo `fondos`, nunca la propia): la plata que le llegó pasa por `entregar_fondo` desde la
  cuenta elegida, así todo lo de los fondos (rendición, Diario, Balance) la ve como cualquier entrega. «Ya tenía» es el **saldo inicial del
  fondo**, con su fecha: es lo que la base ya llama «una cuenta que empieza con su saldo después del arranque», y el Balance lo explica
  solo. Para eso se afloja `cuentas_dinero_fondo_sin_saldo` (un fondo puede empezar con saldo, solo con su fecha) y `fn_fondos` suma ese
  saldo inicial al saldo y a «le entregaste». Se descartó un tipo de movimiento nuevo (Debe 1413 / Haber 591): obligaba a parchar ocho
  funciones que distinguen tipos.
- **La foto** va al depósito de los gastos del viaje (carpeta `plata/`), que ya leen quien compra y quien revisa: sin políticas nuevas.
- **Reintentos:** la marca de cada envío sigue a su contenido (`fn_intento_con_huella`) y «Revisar si se guardó» conoce la operación
  (`fn_resolver_intento`, reemplazo anclado; las anclas se comprobaron en producción, en solo lectura). Confirmar es idempotente por su id.
- **Pantallas:** «Mi plata para compras» (celular primero) con «Tienes para comprar», «Me dieron plata» (`FichasMedio`, la pieza de
  «¿cómo se pagó?», y la casilla «Ya tenía plata de antes» solo la primera vez) y «Lo que anotaste». En «Revisar compras», arriba, «Plata
  que anotaron las compradoras»: el voucher, la cuenta sugerida, «Confirmar» de un toque y «Cambiar» para corregir el monto o la cuenta.

## Actividad 3: «Compré ropa» desde el celular (2026-10-22)

**Lo que decidió Felipe al construirla:** cuando la compradora guarda una compra, **la plata baja en su celular al instante y en los libros
recién al completar el papel** (paso 4): nada que Compras no revisó toca las cuentas.

- **Una compra = un papel rápido + una orden de compra por tienda.** `compra_papeles` guarda de quién, qué papel (factura, boleta, nota de
  venta o ninguno), la foto (carpeta `papeles/` del mismo depósito) y el monto; nace «por completar». Las prendas son órdenes de compra, una
  por tienda de destino (`ordenes_compra.papel_id`): el envío a cada tienda, Recibir y todo lo que ya entiende una orden siguen igual. Se
  descartó una columna de tienda por línea, que obligaba a tocar todo lo que trabaja por orden.
- **`registrar_compra_rapida`** guarda todo en una transacción y valida cada línea con `fn_orden_compra_validar`, la misma regla de las
  órdenes del escritorio. Una prenda elegida del catálogo trae su categoría y su marca de ahí (`orden_compra_items.producto_id`, para que
  la tienda la cuente sin buscarla al recibir). El identificador nace al abrir la pantalla: repetir el envío devuelve lo mismo.
- **Los habituales** (`fn_habituales_proveedor`) salen de lo que ya se le compró aquí (con lo de la vez pasada) y, después, de las prendas
  del catálogo que tienen ese proveedor: en producción, 323 de 438 el 2026-10-22, así que sirve desde el primer día (con 0 órdenes, solo las
  órdenes darían una lista vacía). Sin una tabla de «productos por proveedor» que se desincronice.
- **La pantalla** (`/compras/mi-plata/compra`) es una pregunta a la vez, como la maqueta: el proveedor (por nombre o por lo que vende) →
  sus habituales → cuántas, el costo y la venta («Igual que la vez pasada» o «Igual que en el catálogo» de un toque) → a qué tienda →
  revisar → el papel (qué te dieron, la foto, cuánto: viene con el total).

## Actividad 4: «Algo nuevo» y «Nuevo proveedor» (2026-10-22)

Sin migración: la base ya aceptaba una prenda sin catálogo (categoría, marca y nombre, sin `producto_id`) y la próxima vez la devuelve entre
los habituales del proveedor por su nombre; y `registrar_proveedor_de_orden` (en producción desde el 2026-10-21) ya registraba un proveedor
con lo básico sin duplicarlo.

- **Algo nuevo, tres preguntas:** qué es (primero las categorías que ya se le compran; se busca por el nombre y por la prenda de su ficha:
  «polera» encuentra Poleras) → cómo se llama (el ejemplo sigue a la categoría, ADR-0290; si se llama igual o casi igual que una que ya se
  le compró, pregunta «¿Es …?» con «Usar esa» y «No, es otra», con la misma regla de parecidos de marcas y proveedores) → la marca (si el
  proveedor trae una sola, se pone sola; si trae varias, se elige o se busca entre todas con «Otra marca»). Después sigue igual que las de
  siempre: cantidad, costo, venta y tienda. Un proveedor sin ninguna prenda salta directo a «dinos qué es».
- **Lo que no entró de la maqueta, a propósito:** «Sin marca» (toda línea de una orden lleva marca: la base la exige) y el color y las tallas
  (no hay dónde guardarlos en la línea; la tienda los cuenta al recibir, como ya dice el paso de la cantidad). Crear una marca nueva tampoco:
  se busca entre las que hay (105 en producción) y, si falta, la crea Compras en Catálogo ▸ Marcas.
- **Nuevo proveedor** es la misma hoja de Nueva orden de compra (con el padrón del RUC y la pregunta «¿no será…?»), no una pantalla nueva:
  una función, una pieza (ADR-0358). Sus textos dejaron de nombrar «la orden». Al registrarlo sigue directo a su primera compra.
- **Las barras de abajo** («Nuevo proveedor», «Algo nuevo de este proveedor», «Revisar la compra») quedan pegadas al pie de la columna, no
  fijas a la ventana: fijas, en escritorio el menú lateral las tapaba.

## Actividad 5: otro gasto, mandar a la tienda y terminar el día (2026-10-23)

- **«Gasté en otra cosa»** (`compra_gastos`, `registrar_gasto_rapido`): taxi, cargador, comida, envío, bolsas u otro (con «Otro», escrito),
  el monto y la foto si le dieron papel (carpeta `gastos/`, opcional). Sigue la regla de la compra: en su celular baja al instante, los libros
  lo ven cuando Compras lo revisa (actividad 7). Los conceptos caben en los de un gasto del viaje (taxi y comida → viaje; cargador, envío y
  bolsas → traer la mercadería), así Compras lo pasa sin preguntar. Se descartó `registrar_gasto_viaje` al toque: mueve plata y exige una orden.
- **«Mandar a la tienda»** (`mandar_compras_a_tienda`): una tarjeta por tienda con lo que compró para ella y no salió, «¿Cuántos fardos?» y
  «Mandar a …». La base arma las líneas (todo lo pendiente de esa tienda, con la misma cuenta que `crear_envio` usa para no mandar de más) y
  llama a `crear_envio`: el envío que Recibir ya entiende, en camino, con su marca para que un reintento no arme otro. Los fardos van en
  `despachos.bultos` (nulo en los envíos de antes), para que la tienda sepa cuántos paquetes abrir.
- **«Terminé de comprar hoy»** (`compra_cierres`, `terminar_dia_compras`): la cuenta del día como un cuaderno y una sola pregunta, qué hace con lo
  que le queda: se lo queda para la próxima compra o lo devuelve en caja; si pagó de su bolsillo, no elige: CAYLA le debe. Lo que tenía lo calcula
  la base (`fn_mi_plata_tiene`, la única cuenta de «tienes para comprar»). Uno por persona y día; volver a cerrar el mismo día lo reemplaza
  hasta que Compras lo recibe (actividad 7). Si falta mandar algo, lo recuerda sin frenar. Se descartó `rendir_fondo`: rinde con los números
  de los libros, que todavía no ven las compras por completar.

## Actividad 6: la tienda recibe mirando la foto (2026-10-23)

**Una sola recepción** (ADR-0393): lo comprado desde el celular sale como un envío y se recibe con la de siempre, que ya tiene «¿Qué llegó? →
Contar → Cerrar». Esa recepción ya cumplía casi todo el paso 3: el costo sale de la línea y entra junto con el stock al cerrar, y al crear la
prenda nueva viene el precio que sugirió la compradora («Lo sugirió quien hizo la compra. Corrígelo si hace falta», decisión 21 de ADR-0362).
Se le sumó lo que faltaba:

- **El papel con su foto** («Lo que anotó Marisol al comprar»): de quién es, qué papel y quién compró, y la foto, que se abre en grande. Sin
  montos: la tienda no ve el dinero de Compras por tener Recibir. `fn_envio_detalle` trae `papeles`, y la regla del depósito
  (`fn_puede_ver_foto_gasto_viaje`) deja leer la carpeta `papeles/` a quien tiene Recibir; los vouchers y los gastos siguen siendo de Compras.
- **La prenda que eligió la compradora** (`orden_compra_items.producto_id`): cada línea la trae, y al contar «¿Qué … son?» la ofrece de un
  toque («La compradora anotó Blusa Emma. ¿Son estas? · Son estas (6)»), también en «Hacer ahora». No se separa sola: lo que llegó lo
  certifica quien cuenta (decisión 17 de ADR-0362).
- **El nombre que anotó** pasa a la hoja de la prenda nueva («En la orden dice «Polera capucha oversize». Usar ese nombre») también cuando lo
  nuevo no se describió al contar.

Se descartó dibujar otra recepción con los tres pasos de la maqueta (ADR-0393 decidió una sola) y una política nueva en `storage.objects`
(toma en exclusiva `auth` y `storage`, ADR-0195): la regla vive en la función que la política ya llama.

## Actividad 7: Revisar compras (2026-10-23)

**Lo que decidió Felipe al construirla:** cuando la plata no cuadra (el papel dice S/ 320 y las prendas anotadas suman S/ 330), **manda el
papel**: si el monto se anotó mal, Compras lo cambia por el del papel; si el papel de verdad dice otro total, el comprobante y el pago quedan
por lo que dice el papel y el costo de cada línea del comprobante se ajusta en proporción. El costo con que las prendas entraron a la tienda no
se toca. Lo que faltó lo decide la tienda al recibir («No vino» → «Nos debe»; «Se perdió» → lo asume CAYLA): Compras solo lo ve.

- **Completar el papel** (`completar_papel_compra`, módulo `fondos`, nunca la propia): cuando todo lo comprado salió y la tienda cerró el
  conteo, Compras copia de la foto la serie y el número (factura y boleta; la nota de venta, si lo tiene; sin papel, número interno SC-…) y
  puede corregir el proveedor o el monto. Nace **un comprobante por papel** (`compras`, al contado, con una línea por prenda a la tienda de su
  orden y la tienda gestora donde llega más), pagado desde el fondo de quien compró, el día que compró (`compra_pagos` con la cuenta del fondo,
  «en efectivo» por ahora). Desde ahí lo ven los libros: el fondo baja, el libro de compras lo tiene, Facturas de proveedor lo lista. En
  factura, el monto del papel lleva el IGV: las líneas van sin IGV y suman exacto (el céntimo de redondeo va en una unidad aparte). El papel
  queda «completado» y la compradora deja de verlo como «por completar» (su «tienes» no cambia: lo que bajó en su celular ahora baja en su fondo).
- **Lo recibido antes del comprobante** (`compra_item_recibido_antes`): la tienda recibió antes de que existiera el comprobante, así que sus
  entradas no apuntan a ninguna línea, y `movimientos` no se edita. Esta tabla (solo se agregan filas) dice qué parte de lo recibido es de qué
  línea: el comprobante nace «recibido» por lo que ya entró, y lo que todavía está por crear en la tienda se le carga cuando entre (el cupo de
  siempre). Lo suman el cupo de la recepción, el de las deudas del proveedor, `recalcular_compras` y la explicación de la mercadería del Balance.
- **Pagar desde el fondo de otra persona**: desde un fondo paga solo su dueña (`fn_fondo_para_pagar`), salvo el pago que arma
  `completar_papel_compra` para ese fondo dentro de su transacción. Es plata que ella ya gastó: Compras solo la pasa a los libros.
- **Un envío cuya compra se completó ya no se reabre** (`reabrir_papel_completado`), igual que uno cuya deuda Compras ya resolvió (ADR-0393).
- **Los cierres del día** (`recibir_cierre_compras`): «Lo devuelvo» vuelve al banco o a la caja fuerte que elige Compras (`devolver_fondo`);
  «CAYLA me debe» sale de la cuenta que elige (`entregar_fondo`). Con el cierre como marca, un reintento no mueve dos veces; con plata suya
  por confirmar, primero se confirma (todavía no está en su fondo). Esa plata no se anula aparte (el cierre quedaría recibido sin su plata).
  Da igual el orden: devolver antes o después de completar sus papeles deja el fondo en el mismo número.
- **Los gastos que no son ropa** (`revisar_gasto_compra`): «Gasté en otra cosa» pasa a los gastos del viaje con la función de siempre
  (`registrar_gasto_viaje`, para no tener dos formas de guardar lo mismo): taxi y comida, del viaje; cargador, envío (flete) y bolsas
  (embalaje), para traer la mercadería; «otro», del viaje con lo que escribió. Compras dice qué papel le dieron; sin papel solo pasan el taxi
  y el cargador, en la planilla de movilidad (decisión 55 de ADR-0362). Se paga desde su fondo, va a sus compras de ese día (decisión 75: un
  gasto del viaje va siempre a una compra; si ese día no compró, a la más cercana) y queda en la sede de quien gastó (decisión 46), no en la
  de quien revisa. Para eso `registrar_gasto_viaje` lleva dos reemplazos anclados que valen solo para el gasto que se está revisando. La
  foto del papel queda en el gasto de la compradora (las fotos de un gasto del viaje viven en la carpeta del gasto).
- **La pantalla:** en Revisar compras, debajo de «Plata que anotaron», «Compras por completar» (una tarjeta por papel: foto, proveedor, prendas
  por tienda, lo que faltó y por qué, si llegó y si cuadra; «Completar» abre la hoja) y «Cierres del día por recibir». Anular un comprobante así
  no se puede (tiene su pago, como todo comprobante pagado). Después, «Gastos por revisar» (cada gasto con su foto; «Revisar» pide el papel)
  y «Cierres del día por recibir».

Se descartó `registrar_comprobante_orden` (un comprobante por orden, con la llave de la compradora y el IGV aparte; el papel es UN documento),
escribir `recibido_cantidad` a mano (`recalcular_compras` lo borraría) y repartir el ajuste en el costo de las prendas (Felipe eligió que el
catálogo quede con lo anotado).

## Cómo se ve mal hecho

- Retirar `ordenes_compra` y crear una clave nueva: el rol «Compras» perdería en silencio recibir, gastos y proveedores.
- Borrar las tablas de notas: se perdería el saldo a favor ya registrado y el documento interno de lo que no llegó.
- Dejar «Notas de crédito» en Roles y accesos sin pantalla detrás: un interruptor que no abre nada.

## Qué queda

La actividad 8 (el cierre con guías y pruebas), que agrega su sección a este ADR.
