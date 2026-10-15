# Tienda online CAYLA: maqueta navegable (2026-10-14, versión 4)

**Qué es:** un prototipo tocable, sin código real ni base de datos, de la tienda online para clientes y de las pantallas
nuevas que necesita el ERP para atenderla. Todo va en `index.html`, que se publica como enlace privado con sus fotos al lado.
**Una maqueta no cambia el ERP:** nada de esto existe todavía en `apps/web` ni en la base.

## Cómo funciona hoy (versión 4)

- **Se entra con cuenta.** Sin cuenta solo se ve la portada: la campaña, cómo se separa, el club y las tiendas. Ninguna
  prenda, precio ni stock.
- **La cuenta se crea en la web, sin Google:** correo y contraseña, DNI (el nombre sale solo), celular y cumpleaños (día y
  mes; el año es opcional, como guarda hoy el Club). El correo y el DNI no se repiten, la web avisa si el correo parece mal
  escrito («¿Quisiste decir gmail.com?») y hay «Olvidé mi contraseña» con un enlace al correo. Al crearla ya es miembro del
  Club CAYLA; si ya lo era en tienda, su cuenta se une a su ficha.
- **En la web no se paga nada.** El cliente elige sus prendas y su tienda, toca «Separar» y el sistema crea un pedido por
  confirmar con su número; lo manda por WhatsApp con el mensaje armado. **El stock baja recién cuando la tienda confirma.**
- **Cada prenda muestra su stock por tienda** («Hay», 3, 2, «Última», «—») y hay un filtro por sede.
- **Pedidos web en el ERP** confirma, cobra (pagos dentro del pedido, coordinados por WhatsApp) y entrega con un código de 4
  cifras. **Por ahora todo se recoge en tienda:** no hay envíos.

Historia del mismo día: la v1 cobraba con Yape en la web; la v2 sumó fotos reales y secciones; la v3 cambió a «separar sin
pagar»; la v4 exige cuenta, quita los envíos y aplica las propuestas aprobadas.

## Qué es real y qué es inventado

- **Real** (leído de producción el 2026-10-14, solo lectura): 48 prendas con su nombre, categoría, colores, tallas y sus
  116 fotos; las 4 campañas con descuento vigentes (nombre, porcentaje y fechas); las tres sedes; cómo guarda el Club el
  cumpleaños (`clientas.cumple_dia`, `cumple_mes`, `cumple_anio` opcional).
- **Inventado:** precios, costos, stock de cada tienda, días desde que llegó cada prenda, el ranking de más vendidos, qué prenda
  entra a qué campaña (salvo 3 que sí están etiquetadas en el ERP), clientes, cuentas, pedidos, teléfonos y direcciones.

**Las fotos no están en este repositorio** (es público): `fotos/` está en `.gitignore` y las fotos viajan solo en el enlace
privado. Abierto desde el repo, cada prenda se dibuja con el ícono de su categoría sobre su color.

## Cómo se usa

- **Recorrido en vivo:** la web del cliente en un celular y el ERP de la sede, conectados. Arriba hay una guía de 4 pasos y
  atajos (separado, confirmar, cobrar, «Dos piden la última», «pasaron 24 horas»).
- **Cuenta de ejemplo:** `lucia.ramos@gmail.com` con cualquier contraseña de 8 caracteres o más. También se puede crear una
  cuenta nueva (el DNI 45871236 ya es del club en tienda).
- **La tienda en grande:** la misma tienda en una computadora. **Cómo funciona:** qué cambió, decisiones, propuestas
  aprobadas, la vida de un pedido, qué cambia en el ERP y cómo se arma por dentro.
- **Enlaces directos** (`index.html#…`): `grande` (portada), `grande--registro`, `grande--entrar`, `grande--inicio`,
  `grande--producto`, `grande--stock`, `grande--trujillo`, `grande--ofertas`, `grande--nuevo`, `grande--look`,
  `grande--cuenta`, `grande--bolsa`, `grande--separado`, `registro`, `entrar`, `olvide`, `inicio`, `producto`, `stock`,
  `trujillo`, `ofertas`, `nuevo`, `look`, `bolsa`, `cuenta`, `menu`, `buscar`, `separado`, `whatsapp`, `pedido`,
  `confirmar`, `cobrar`, `entregar`, `ultima`, `sinpagar`, `vitrina`, `vitrina-lista`, `looks-erp`, `config`, `como`.

## Decisiones de Felipe (2026-10-14, diez rondas)

| Pregunta | Decisión |
|---|---|
| Sin cuenta | Solo la portada con la campaña y «Entrar» |
| Cuenta | Se crea en la web, sin Google: correo y contraseña, DNI, celular y cumpleaños; correo y DNI únicos; «Olvidé mi contraseña»; al crearla ya es miembro del Club |
| Quién crea cuenta | Cualquiera |
| Qué hace el cliente | Separa; no paga en la web. «Separar» crea un pedido por confirmar con su número |
| Qué stock ve | Todo lo de cada tienda (piso y almacén). Separar no descuenta nada |
| Cómo lo ve | El número solo si quedan pocas: «Hay» (4 o más), 3, 2, «Última», «—»; con filtro por tienda |
| Mensaje de WhatsApp | Su idea: prenda, talla y color, con el número de pedido y el total, y «¿Me confirman la separación?» |
| Si nadie lo confirma | Se cierra solo a las 24 horas corridas |
| Al confirmar | Baja el stock; los pedidos web van aparte de los apartados de tienda |
| Si dos separan la última | Los dos quedan registrados y decide la tienda: otra sede o conseguirla para una fecha |
| Prenda por conseguir | Adelanto al confirmar (cuánto, lo decide la tienda) y el resto al recoger |
| Confirmado y sin pagar | Aviso a las 48 horas; decide la sede (si lo anula, el stock vuelve) |
| Pagos | Se coordinan con la tienda por WhatsApp y la tienda los anota dentro del pedido; boleta al quedar pagado |
| Prendas en dos tiendas | El cliente elige una tienda para todo; lo que falta se trae con un traslado |
| Entrega | Por ahora, siempre recojo en tienda (los envíos quedan para más adelante) |
| Novedades y club | Novedades en la web, sin publicidad por WhatsApp; los avisos del club (cumpleaños, vale) siguen por WhatsApp y también en la cuenta |
| Fotos y secciones | Las reales; Lo nuevo, Ofertas (todas las campañas vigentes), Más vendidos y Arma tu look |
| Lo nuevo | Llegó a una tienda hace 30 días o menos; fijar o quitar desde la Vitrina |
| Precio | ~~Precio web propio por modelo~~ → **el de la tienda elegida** (el precio de tienda de esa sede); con «Todas», el MAYOR de las sedes, para que al elegir la sede baje y nunca suba; las campañas se aplican encima (Felipe, 2026-10-14, al construir) |
| No recoge en 7 días | Se le recuerda y decide la sede |
| Cambios y devoluciones | Como en tienda: 7 días, en cualquier sede, con boleta y etiqueta |
| Alcance de la construcción | Todo de una vez, como la maqueta |

**Propuestas aprobadas (14 de octubre):** a. n.º de operación al anotar un pago digital, sin repetirse. c. Un color sin foto
propia se muestra con la foto principal. f. Agregar a la bolsa no separa nada. g. Más vendidos sin cifras. h. Un look se
agrega completo eligiendo cada talla. i. «Novedades para ti» en la cuenta. j. Al confirmar, el stock baja primero del almacén.
k. El ERP dice qué pedido separó antes la última y la ficha se lo avisa al cliente. m. Código de 4 cifras para recoger.

## Arquitectura (aprobada por Felipe el 14 de octubre; detalle en ADR-0408)

- **El código, en este mismo repositorio, como app aparte** (`apps/tienda`): el repo ya es un monorepo (pnpm y turbo con
  `apps/web` y `packages/`), y Vercel publica varias apps de un mismo repo, cada una con su dominio. La base, los tipos, las
  pruebas y los chequeos contra producción se comparten, y un mismo cambio sube base, ERP y tienda juntos.
- **Las cuentas de los clientes, separadas de las del equipo:** en producción 34 de las 137 políticas de `retail` solo piden sesión (30 de lectura: productos, variantes, ubicaciones, proveedores, configuración, códigos de descuento…) y `authenticated` tiene permiso sobre todas las tablas y funciones (`0005_grants.sql`). Un cliente con sesión en el mismo inicio de
  sesión del equipo pasaría esas reglas. Recomendado: un proyecto de inicio de sesión propio para los clientes, y la tienda entra a
  la base solo por funciones `tienda_*` con un rol que no puede leer tablas.
- **Listo para una pasarela de pago:** los pagos del pedido web guardan origen, proveedor y referencia externa única, con
  estados; una notificación de la pasarela (webhook o IPN) puede repetirse sin duplicar el pago, y la tarjeta nunca pasa por
  servidores de CAYLA (Culqi tokeniza; Izipay usa formulario incrustado). Izipay si el dinero va a Interbank, Culqi si va al
  BCP (`docs/investigacion/2026-09-23-tarjeta-pos-y-canal-online.md`).

## Falta decidir

1. La dirección de la web (sigue «tienda.cayla.pe» de ejemplo). 2. Los envíos, cuando se retomen: quién reparte y quién paga
el segundo envío si la dirección estaba mal.

Decidido al aprobar el plan (ADR-0408): confirmar un pedido **reserva** la prenda y sale del stock al entregarla; la boleta sale **al
quedar pagado completo** (los adelantos parciales no llevan comprobante).
