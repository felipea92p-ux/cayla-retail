# ADR-0408 · Tienda online: una app aparte en este repo, los clientes con su propio inicio de sesión y pedidos web sobre el motor de Apartados

- **Fecha:** 2026-10-14 · **Estado:** arquitectura, lista de actividades y las dos decisiones de inventario y boleta aprobadas por Felipe
  el 2026-10-14; construcción en curso, actividad por actividad.
  Rama `claude/customer-catalog-reservation-system-409dbc`.
- **Pedido:** Felipe, 2026-10-14: una tienda online donde el cliente ve el catálogo y separa prendas sin afectar el piso. Diez rondas de
  preguntas y cuatro versiones de la maqueta (`docs/maquetas/tienda-online-2026-10/`, su README tiene todas las decisiones de negocio).
  Sobre la arquitectura: «Analiza, investiga y dime qué debo hacer, siempre pensando en la escalabilidad, que en un futuro se puede
  implementar pasarelas de pago y CAYLA ser una empresa grande». Aprobó la recomendación de este documento. Alcance: «todo de una vez,
  como la maqueta».
- **Complementa:** ADR-0141 (apartar stock), ADR-0166 y ADR-0399 (separaciones; comprobante una sola vez al entregar), ADR-0233 (pedir a
  otra sede y apartar al llegar), ADR-0288 (Club y su página pública), ADR-0008 (nombre por DNI), ADR-0005/0009 (Lucode), ADR-0403 (el
  descuento en % deja el precio sin céntimos), ADR-0161/0178 (módulos y roles), ADR-0398 (el envío sigue a su contenido), ADR-0381
  (reservas de números).

## El problema primero

Una clienta en Lima quiere saber si la blusa que vio en Instagram está en Trujillo, separarla y pagarla por WhatsApp. Hoy eso lo resuelve
una colaboradora a mano, mirando Existencias. La tienda online lo deja en manos del cliente, pero abre tres riesgos que el ERP nunca tuvo:
**gente de afuera con cuenta**, **prendas comprometidas desde afuera** y, más adelante, **dinero que entra sin pasar por una caja**.

**Analogía CAYLA:** la tienda online es una vitrina con su propia puerta a la calle. El cliente ve la vitrina y deja su pedido en la puerta;
nunca entra al almacén ni a la oficina. Lo que pide lo atiende la sede con las mismas manos y el mismo cuaderno que usa para un apartado.

## Decisiones

**DECIDÍ 1 — Una app aparte en este mismo repositorio: `apps/tienda`, publicada sola.**
El repo ya es un monorepo (pnpm y turbo, con `apps/web` y `packages/database` y `packages/shared`). La tienda vive en `apps/tienda`, con su
propio proyecto de Vercel, su dominio y sus variables de entorno, y se publica solo cuando cambia lo suyo. Comparte con el ERP la base, los
tipos y las pruebas de la base: una actividad sube su migración, su pantalla del ERP y su página de la tienda en un mismo PR.
**DESCARTÉ** un repositorio aparte: hay que montar de nuevo las pruebas, los tipos y la publicación, y cada función nueva de la base se
coordina en dos repos. Los contratos se desalinean sin que nadie avise; aquí ya pasó con `registrar_gasto` y `recibir_lote`, rotos en
producción. Si mañana otro equipo se queda con la tienda, se separa con su historia.

**DECIDÍ 2 — Los clientes tienen su propio inicio de sesión, aparte del del equipo.**
Medido en la foto de producción (`docs/datos/generado/retail_policies.json`, 2026-10-12): **34 de las 137 políticas de `retail` solo piden
tener sesión** (30 de lectura: productos, variantes, ubicaciones, proveedores, `configuracion_empresa`, códigos de descuento…), y
`0005_grants.sql:18-24` da a `authenticated` permiso sobre todas las tablas y EXECUTE sobre todas las funciones. Un cliente con sesión en el
mismo proyecto del equipo pasaría esas reglas. Por eso las cuentas de los clientes viven en un proyecto de Supabase propio, que solo guarda
identidades (correo y contraseña, recuperación por correo). El proyecto del ERP no conoce a los clientes como usuarios.
**DESCARTÉ** el mismo proyecto con un rol aparte para clientes (un *hook* que cambie el rol del token): obliga a revisar cada permiso, cada
función con EXECUTE público y las 34 políticas, y cualquier migración futura que se olvide de eso expone datos del ERP a un cliente.

**DECIDÍ 3 — La puerta angosta: la tienda entra a la base solo por funciones `retail.tienda_*`, con un rol propio.**
Un rol de base `tienda_web` sin permiso sobre ninguna tabla, con EXECUTE solo sobre las funciones `tienda_*` (`security definer`), usado
únicamente desde el servidor de la tienda. La tienda nunca usa la llave de servicio del ERP. El servidor de la tienda verifica la sesión del
cliente en su proyecto y le pasa a la función el identificador de la cuenta; la función valida todo por dentro (como `registrarse_en_el_club`
hoy). Es el mismo patrón de la página pública del Club, pero con un rol más estrecho que `service_role`.

**DECIDÍ 4 — Pedidos web: módulo y tabla propios, sobre el motor de Apartados.**
Felipe quiere los pedidos web separados de los apartados (su lista, sus estados y sus pagos dentro del pedido). Por debajo se reutiliza lo
que ya funciona en producción: reservar una prenda (`apartar_stock`), pedirla a otra sede y apartarla al llegar (`pedir_prenda_para_apartar`
y `fn_apartar_pedidos_que_llegaron`), el efectivo a la caja abierta, la venta y el comprobante con su cola de Lucode. No se inventa un
segundo motor de reservas.
**Decidió Felipe (2026-10-14):** confirmar un pedido **reserva** la prenda: deja de estar disponible al instante en la web y en Vender,
igual que un apartado, y **sale del stock al entregarla**. La prenda sigue físicamente en la tienda hasta que el cliente la recoge; una
salida anticipada haría fallar los conteos. **DESCARTÉ** sacarla del stock al confirmar por esa misma razón.

**DECIDÍ 5 — El precio web en una tabla de la vitrina, no en `productos`.**
`vitrina_productos(producto_id, publicado, precio_web, fijo_en_nuevo, …)`: el núcleo del catálogo no se toca (principio 1). El precio de
tienda sigue en `variantes.precio` y en `precios_sede_prenda`. La campaña se aplica sobre el precio web con la misma función y el mismo
redondeo que la tienda física (ADR-0403: al S/ 0.10 de abajo). **Reemplazado en su parte de precio el 2026-10-14: no hay precio
web; el cliente ve el precio de tienda de la sede que elige (ver «Actualización 2026-10-14 (c)»).**

**DECIDÍ 6 — El stock que ve el cliente es un nivel, nunca la cifra.**
La función devuelve «Hay» (4 o más), 3, 2, «Última» o «—». El número exacto de 4 o más nunca sale de la base hacia la web.

**DECIDÍ 7 — «Lo nuevo» sale del primer ingreso a una tienda**, con el mismo cálculo que ya usan Análisis y Frescura (`fn_analisis_sede`,
`fn_es_llegada`), más el fijar o quitar de la Vitrina.

**DECIDÍ 8 — Los plazos se calculan al leer y se cierran con una ruta cron de Vercel.** Un pedido sin confirmar a las 24 horas se cierra
con una ruta cron protegida por `CRON_SECRET`, como las cuatro que ya existen (no `pg_cron`, descartado por escrito en ADR-0166 y ADR-0352).
Las 48 horas sin pagar y los 7 días sin recoger se calculan al leer.

**DECIDÍ 9 — Los pagos del pedido quedan listos para una pasarela, sin construirla.** Cada pago guarda su origen (`tienda` o `pasarela`),
su medio, su n.º de operación (único entre los pagos digitales), el proveedor y la referencia externa (única) y su estado. Cuando llegue Izipay
(Interbank) o Culqi (BCP), su aviso de pago se registra con una función que no duplica si el aviso llega dos veces. Un pedido se marca
pagado solo con el aviso firmado de la pasarela, nunca por la vuelta del navegador, y la tarjeta no pasa por servidores de CAYLA.
**Decidió Felipe (2026-10-14):** la boleta sale **al quedar pagado completo**: si paga todo antes de recoger, en ese momento; si paga al
recoger, al recoger. Los adelantos parciales no llevan comprobante, como en los apartados (ADR-0399). Así se cumple la regla de SUNAT de
emitir al cobrar o al entregar, lo que pase primero. Consecuencia de diseño: la venta queda **«pagada, por entregar»** hasta el recojo; la
prenda sigue reservada en la tienda y sale del stock al entregarla. Cómo se modela sin romper la regla de que toda venta entregada tiene su
salida se decide en la actividad 10, con `/rigor`. **DESCARTÉ** la boleta al entregar por el total: con el pago completo por adelantado,
SUNAT pide el comprobante al cobrar.

**DECIDÍ 10 — La calidad no se rebaja.** Las pantallas nuevas del ERP (Pedidos web, Vitrina web, Configuración ▸ Tienda web) cumplen todas las
reglas del repo: módulo que nace solo para el líder, combo «Responsable», guía de foco, guía interactiva, `/chaos` en lo que guarda, modo
oscuro, piezas únicas de `/unificar`. La tienda tiene sus propias pruebas y un candado que le prohíbe importar código de `apps/web` o leer la
llave de servicio del ERP.

## Cómo se ve mal hecho

- Clientes en el mismo inicio de sesión del equipo: un cliente curioso lee la lista de proveedores con la llave pública.
- Un pedido confirmado que saca la prenda del stock mientras sigue colgada en la tienda: el conteo del sábado «encuentra» una prenda de más.
- Un pago marcado como hecho porque el navegador volvió a la web: alguien cierra la pestaña de la pasarela y el pedido figura pagado.
- La tienda con la llave de servicio del ERP: una falla en la tienda deja expuesta toda la base.

## Riesgos y cómo se cubren

- **El rol `tienda_web` por el *pooler* de Supabase:** se prueba en local en la actividad 1 y en producción al publicar (actividad 13,
  con el OK de Felipe para crear el rol). Si no funciona, la alternativa es una Edge Function del proyecto del ERP como única puerta, con su
  propio secreto.
- **Correo de recuperación de contraseña:** el correo que trae Supabase tiene un tope bajo de envíos; producción necesita un proveedor de correo
  (una cuenta que crea Felipe).
- **El CI y los ganchos solo conocen `apps/web`:** `scripts/ci/alcance.mjs:37`, `next typegen`, el `ignoreCommand` de Vercel, los escáneres,
  `datos:comparar`, `.githooks/pre-commit` y `scripts/abrir-pr/choques.mjs`. La actividad 1 los extiende.
- **Los tipos de `packages/database` están atrasados** (no traen `precios_sede_prenda`): la tienda describe las respuestas de `tienda_*` con
  sus propios esquemas zod.
- **Registro abusivo:** topes por IP, documento y celular, con el mismo `club_intento` de la página del Club.
- **Producción:** cada migración se pega por partes y con el OK de Felipe; la boleta por Lucode no se transmite a SUNAT real sin su OK.

## Plan

La lista de 13 actividades, cada una un corte vertical demostrable, está en el backlog de la rama. Felipe la aprobó en ese orden el
2026-10-14.

## Actualización 2026-10-14 (b): lo que se decidió al construir las actividades 2 y 6

Felipe pidió acelerar con agentes en paralelo: las actividades 2 (cuentas), 3 (Vitrina), 6 (Configuración ▸ Tienda web) y el motor del
pedido web se construyen a la vez, cada una en su rama, y se integran en la rama de la tienda. Al integrar la 2 y la 6 decidió:

- **El correo se verifica con un código** de 6 cifras al crear la cuenta (actividad 2b): sin el código no hay usuario ni cuenta, y el correo
  no queda tomado por alguien que nunca confirmó. Así nadie crea una cuenta con el correo de otra persona, y «olvidé mi contraseña» llega
  siempre a su dueño.
- **Dos casillas al crear la cuenta:** «Soy mayor de 18 años», obligatoria y exigida por la base, como en el cartel del Club; y «Avisos del
  Club por WhatsApp», opcional, que queda como permiso del Club con origen web (sin ella, la regla del Club trata esos avisos como publicidad).
- **Configuración ▸ Tienda web la cambia quien ya cambia Configuración** (el líder o a quien le dio ese módulo, `fn_puede_configurar`), no
  solo el líder como decía la maqueta.
- **Las tiendas se muestran en orden alfabético** por su nombre web: no hay un campo de orden que mantener.

Y quedó así, por decisión técnica (cada una en su migración o su prueba):
- Los datos de cada sede para la web viven en `ubicacion_datos_web` y los plazos (24 h, 48 h, 7 días, «quedan pocas» desde 3) en
  `configuracion_tienda_web`, tablas propias: no se tocan `ubicaciones` ni `configuracion_empresa`, que lee cada venta. El WhatsApp es
  `ubicaciones.whatsapp_numero`, el mismo del QR del Club: una sola fuente. Las actividades 4, 7, 9 y 10 leen los plazos de ahí.
- El nombre por DNI (ADR-0008) pasó a `packages/shared`, para que la tienda y el ERP usen la misma consulta.
- La sesión del cliente se valida contra el proyecto de clientes (`getUser()`), no solo con la cookie; la cookie se llama `tienda-sesion`
  para no pisar la del ERP.

## Actualización 2026-10-14 (c): sin precio web, y lo que se decidió con la Vitrina y el motor del pedido

- **No hay precio web (reemplaza el DECIDÍ 5 en su parte de precio).** El cliente ve el precio de la tienda que eligió: el precio de
  tienda de esa sede (`fn_precio_en_sede`, el de la prenda en esa tienda o, si no tiene, el de la grilla; por modelo, el mayor de sus
  variantes activas). Con «Todas las sedes» ve el MAYOR entre las sedes que se muestran en la web: así, al elegir su sede el precio
  baja o se queda igual, nunca sube (Felipe). Las campañas se aplican encima con la regla de la caja (ADR-0403). `vitrina_productos`
  queda para mostrar u ocultar y fijar en Lo nuevo; el pedido web guarda el precio de la sede donde se recoge (la actividad 7 lo valida
  contra `fn_precio_en_sede` de esa sede).
- **Quien tiene el módulo «Pedidos web» ve lo necesario del cliente** para coordinar por WhatsApp (nombre, celular, el DNI a medias y si
  es del Club), tenga o no el módulo Clientes (`fn_pedido_web` y `fn_pedidos_web_sede`, con el candado de su módulo).
- **El efectivo de un pago anulado sale de la caja abierta del día en que se devuelve**, que es cuando sale la plata; si esa caja no la
  tiene, no se puede anular (el candado de caja que ya existe).
- **El aviso de «confirmado y sin pagar» (48 h) no aplica a lo que espera una prenda por conseguir con su adelanto pagado:** lo decide la
  regla que Felipe ya había aprobado («adelanto al confirmar y el resto al recoger»). Hoy el motor lo avisa igual; se ajusta en la
  actividad 8, con la lista del ERP.
- **El motor del pedido web** (base de las actividades 7 a 9) quedó así: `pedidos_web`, `pedido_web_lineas` (una unidad por línea) y
  `pedido_web_pagos`, solo por funciones; estados `por_confirmar → confirmado | anulado | vencido`, `confirmado → pagado | anulado`,
  `pagado → entregado`, con un disparador que rechaza toda otra transición; lo pagado nunca pasa el total (CHECK en la fila del pedido);
  una reserva por línea sobre el motor de Apartados (primero el almacén); el n.º de operación único entre pagos vivos; el aviso de una
  pasarela, idempotente por proveedor y referencia (lo que ya no cabe queda «por revisar» y se devuelve). Un pedido pagado completo no
  se anula: eso es una nota de crédito (actividad 10). **Reemplazado por la actualización (d):** sí se anula, con su boleta.

## Actualización 2026-10-15 (d): lo que se decidió al juntar las actividades 4 a 12

Las actividades 4, 5, 7, 8, 9, 10, 11 y 12 se construyeron con agentes en paralelo y se juntaron en la rama de la tienda; después,
tres tandas de integración conectaron la ficha, la cabecera y el Club, y dejaron una sola regla para cada cosa. Felipe decidió, al
mirar lo que preguntaban:

**Pedidos web y cobro**
- **Enviar desde otra tienda una prenda colgada en el piso se hace en un solo paso** (la tienda que envía la descuelga y la manda; el
  sistema anota el paso por el almacén y el traslado juntos). El menú de Ventas queda con sus 7 entradas.
- **Un cliente tiene a lo sumo 3 separaciones «por confirmar» a la vez** (`tienda_separar`, la constante `c_tope_por_confirmar`; el
  número viaja a la tienda en el `detail` del error, no se escribe dos veces).
- **Cuando la tienda anula o no confirma un pedido, el cliente lee un texto escrito para él**, no el motivo de la tienda («No se
  registró tu pago a tiempo», no «El cliente no pagó»; `apps/tienda/lib/pedidos.ts`).
- **La boleta sale SOLA al quedar pagado completo**, en la misma transacción del pago que completa, y queda en la cola de Lucode: si la
  SUNAT no responde, el cobro no se frena. La prenda sale del stock al entregar, con el código de 4 cifras (actividad 10).
- **Anular o devolver un pago lo hace quien ve el módulo Pedidos web**, como en Apartados.
- **Un pedido pagado (con su boleta) que no se recoge o se cancela se puede anular, con su boleta, y lo hace cualquiera con el módulo**
  (Felipe 2026-10-15; reemplaza el «no se anula» de la actualización (c)). Se construye en la integración.

**El Club y las cuentas**
- **Sin «baja» del Club desde la tienda:** salió la sección «Baja del Club» de los términos y el «escribe BAJA» del registro. La política
  de privacidad conserva los derechos de acceso, rectificación, cancelación y oposición y el retiro de una autorización: los exige la Ley
  29733, y los atiende la tienda a pedido, no un botón.
- **Al entrar, la cuenta muestra los avisos del Club** (el cumpleaños, el vale, la talla que esperaba y llegó), le lleguen o no por
  WhatsApp: «si no le llegan los avisos por WhatsApp, cuando inicie sesión igual le debe salir algún mensaje». Sale para todos, se cierra
  con «Entendido» y no vuelve por ese mismo beneficio; en «Mi cuenta» sigue siempre.
- **Entrar a la web cuenta como actividad** para la regla de 3 años del Club: una ficha cuya cuenta web entró en los últimos 3 años no
  se anonimiza. Si aun así se anonimiza (3 años sin comprar ni entrar), su cuenta web se cierra: sin correo, sin favoritos ni esperas
  vivas, y el usuario del proyecto de clientes se borra al intentar entrar o en el barrido de madrugada.

**Clientes en el ERP**
- **Un DNI y un correo son de una sola persona, y por eso «Unir fichas» se va del ERP** («No debería dejar registrar 2 DNIs y correos
  iguales, debe ser único por cada usuario, entonces el unir fichas es innecesario»). En producción, el 2026-10-15: 42 fichas, 0 correos
  ni documentos repetidos y 0 fusiones en toda la historia. `unir_clientas` se borra; `clientas_fusiones` queda como historia. El mensaje
  de un correo repetido nunca dice de quién es en la web; en el ERP, el personal sí ve qué ficha lo tiene.
- **El correo se ve y se cambia en «Editar ficha» del ERP**, antes de abrir la tienda. Se construye en la integración.

**Catálogo, precios y tiendas**
- **En la web solo se publica ropa:** la Vitrina no publica un modelo de una familia fuera de los motores (bolsas, cajas; ADR-0377), que
  se sigue vendiendo desde el ticket.
- **Una talla que vale S/ 0 en la grilla (la de obsequio) sigue en S/ 0 en toda tienda**, aunque la tienda le ponga precio propio al
  modelo: en la caja y en la web.
- **Una tienda solo tiene piso, almacén y Cuarentena** (lo dañado, que no se vende: ni la caja ni la web lo ofrecen). Así la web y la
  confirmación de un pedido cuentan lo mismo (`20261015060000`, `pnpm pruebas:tienda-lugares`). El Taller sigue con sus racks.

Y quedó así, por decisión técnica:
- **Una sola regla para cada cosa** (principio 4), vigilada cruzando las lecturas en las pruebas, con mutantes que rompen la pieza común
  y rompen a todas juntas:
  - «Hay» es `fn_tienda_disponible` sobre las tiendas de `fn_tienda_sedes_web` (sin la Cuarentena ni lo apartado, que incluye las
    reservas de pedidos web; sin el Taller ni las escondidas). La usan la ficha, el catálogo, la bolsa, «Separar», los looks, «Avísame»,
    «Mi cuenta», el aviso al entrar y «Esperan una talla» del ERP.
  - «Nuevo» es `fn_tienda_lo_nuevo` (la primera llegada a una tienda en 30 días o lo fijado en la Vitrina); «Novedades para ti» es lo de
    «Lo nuevo» que llegó desde la visita anterior.
  - El precio es `fn_tienda_precio_talla` (el de la tienda elegida o, con «Todas», el mayor, con la campaña encima): la ficha, el
    catálogo, la bolsa, «Separar» y los looks dan exactamente lo mismo. La prenda de un look vale lo de su color.
  - La tienda elegida es `fn_tienda_sede_elegida`: una espera anotada en una tienda que después se esconde se lee como «cualquier tienda».
- **La bolsa vive en una cookie `httpOnly`** (prendas, cantidades, tienda y la marca del próximo «Separar», nunca un precio): el
  servidor dibuja la bolsa con los precios de la base, y la marca hace que dos toques den el mismo pedido.
- **«Separar» cierra la espera de «Avísame»** de esa prenda en la misma transacción (`esperas_web.pedido_web_id`).
- **La venta del pedido nace «completada» con el pago que completa** y la prenda sale recién al entregar. INV-03 queda con una
  excepción para la línea web sin entregar, vigilada por INV-18; los pagos entran a la venta como anticipo y Finanzas los asienta contra
  «Adelantos de clientes» (cuenta 122), así el Balance (ADR-0198) sigue cuadrando. El pago que completa pide la caja abierta, aunque sea
  digital; el de una pasarela que completaría queda «por revisar».
- **El aviso al entrar** lee `tienda_mis_avisos_del_club`, que no escribe nada (a diferencia de `tienda_mi_club`, que anota la visita).
- **«Otra persona ya separó la última»** (la propuesta k de la maqueta) sale de `tienda_separadas_por_otros`: solo sí o no por talla,
  nunca una cifra ni quién.
- **Lo que la sesión eligió con la recomendación de cada agente, y Felipe puede cambiar:** el plazo para cambiar una prenda es el de la
  boleta (15 días; la maqueta decía 7 como borrador); una novedad agotada se muestra, como en Lo nuevo; una espera no se reabre si el
  pedido que la cerró no se confirma; una espera pedida con «Todas» cuenta en cada tienda; en «Tus favoritos», la tarjeta que se quita
  queda hasta recargar; la talla que llegó avisa hasta «Entendido»; un look lleva de 2 a 4 prendas sin repetir modelo y no se borra, se
  oculta.

**Por confirmar con el contador antes de abrir** (no lo decide el código): si un adelanto cobrado antes de entregar pide su propio
comprobante (hoy la boleta sale una vez, al quedar pagado completo, como en Apartados); los asientos de la cuenta 122 y la mercadería
vendida sin entregar; y la nota de crédito al anular un pedido pagado. **Antes de abrir la tienda:** configurar las cuentas de cobro
(Yape, Plin, transferencia) de cada tienda, y publicar los textos finales del Club (la regla de 3 años ahora dice «desde tu última compra
o tu última entrada a tu cuenta web») y de privacidad y términos, que siguen en borrador.

