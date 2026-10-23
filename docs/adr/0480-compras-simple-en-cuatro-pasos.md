# ADR-0480 — Compras simple: la compra nace en el celular de quien compra

- **Fecha:** 2026-10-22 · **Estado:** en construcción en la rama `claude/modulo-compras-66e94a`, actividad por actividad
  (`/construir`). Actividad 1 (menú y módulos): migración `20261022225000_compras_simple_modulos.sql`. Actividad 2 (anotar y confirmar
  la plata): `20261022235000_compras_simple_plata_anotada.sql`. Actividad 3 (registrar una compra): `20261023005000_compras_simple_compra_rapida.sql`.
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

## Cómo se ve mal hecho

- Retirar `ordenes_compra` y crear una clave nueva: el rol «Compras» perdería en silencio recibir, gastos y proveedores.
- Borrar las tablas de notas: se perdería el saldo a favor ya registrado y el documento interno de lo que no llegó.
- Dejar «Notas de crédito» en Roles y accesos sin pantalla detrás: un interruptor que no abre nada.

## Qué queda

Actividades 5 a 8 de la construcción (otro gasto y
cierre del día, recibir con costo y precio, revisar compras, cierre con guías y pruebas). Cada una agrega su sección a este ADR.
