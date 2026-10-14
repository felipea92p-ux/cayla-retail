# Tienda online CAYLA: maqueta navegable (2026-10-14, versión 3)

**Qué es:** un prototipo tocable, sin código real ni base de datos, de la tienda online para clientes y de las pantallas
nuevas que necesita el ERP para atenderla. Todo va en `index.html`, que se publica como enlace privado con sus fotos al lado.
**Una maqueta no cambia el ERP:** nada de esto existe todavía en `apps/web` ni en la base.

## Versión 3, mismo día: separar sin pagar

Felipe cambió la lógica: **en la web no se paga nada**. El cliente elige sus prendas, toca «Separar» y el sistema crea un
pedido por confirmar con su número; después lo manda por WhatsApp con el mensaje armado. **El stock baja recién cuando la
tienda confirma el pedido.** Además, la ficha de cada prenda muestra el stock de cada tienda y hay un filtro por sede.

- **Se fue el pago en la web:** el QR de Yape, el reloj de 20 minutos, «Ya pagué» y la foto del pago.
- **Se fue el estante web:** el cliente ve lo de cada tienda (piso y almacén). En Existencias ya no hay «Separar para la web».
- **Pedidos web confirma, cobra y entrega:** confirmar baja el stock; los pagos (uno o varios) se anotan dentro del pedido y,
  al completarlo, sale la boleta. Va aparte de los Apartados de tienda.
- **Si dos piden la última,** los dos quedan registrados y decide la tienda: trae la prenda de otra sede, la consigue para una
  fecha (comprarla o hacerla en el taller) o la quita del pedido.

La versión 2 (fotos reales, Lo nuevo, Ofertas, Más vendidos, Arma tu look, Club, «La tienda en grande») se mantiene.

## Qué es real y qué es inventado

- **Real** (leído de producción el 2026-10-14, solo lectura): 48 prendas con su nombre, categoría, colores, tallas y sus
  116 fotos; las 4 campañas con descuento vigentes (nombre, porcentaje y fechas); las tres sedes.
- **Inventado:** precios, costos, stock de cada tienda, días desde que llegó cada prenda, el ranking de más vendidos, qué prenda
  entra a qué campaña (salvo 3 que sí están etiquetadas en el ERP), clientes, pedidos, teléfonos y direcciones.

**Las fotos no están en este repositorio** (es público): `fotos/` está en `.gitignore` y las fotos viajan solo en el enlace
privado. Abierto desde el repo, cada prenda se dibuja con el ícono de su categoría sobre su color. Las fotos son las del
bucket público `retail-productos-fotos`; sus nombres están en el catálogo de `index.html`.

## Cómo se usa

- **Recorrido en vivo:** la web del cliente en un celular y el ERP de la sede, conectados: lo que hace el cliente aparece
  en el ERP y al revés. Arriba hay una guía de 4 pasos y atajos (separado, confirmar, cobrar, «Dos piden la última»,
  «pasaron 24 horas»).
- **La tienda en grande:** la misma tienda en una computadora.
- **Cómo funciona:** qué cambió, las decisiones, el catálogo de hoy frente a la web, propuestas que esperan OK, la vida de un
  pedido web, qué cambia en el ERP, cómo se arma por dentro y lo que falta decidir.
- **Enlaces directos** (`index.html#…`): `grande`, `grande--producto`, `grande--stock`, `grande--trujillo`, `grande--ofertas`,
  `grande--nuevo`, `grande--look`, `grande--cuenta`, `grande--bolsa`, `grande--separado`, `producto`, `stock`, `trujillo`,
  `ofertas`, `nuevo`, `look`, `bolsa`, `datos`, `cuenta`, `menu`, `buscar`, `separado`, `whatsapp`, `pedido`, `confirmar`,
  `cobrar`, `entregar`, `ultima`, `sinpagar`, `vitrina`, `vitrina-lista`, `looks-erp`, `config`, `como`.

## Decisiones de Felipe (2026-10-14, siete rondas)

| Pregunta | Decisión |
|---|---|
| Qué hace el cliente | Separa; no paga en la web. «Separar» crea un pedido por confirmar con su número |
| Qué stock ve | Todo lo de cada tienda (piso y almacén). Separar no descuenta nada |
| Cómo lo ve | El número solo si quedan pocas: «Hay» (4 o más), 3, 2, «Última», «—»; con filtro por tienda |
| Mensaje de WhatsApp | Su idea: prenda, talla y color, con el número de pedido y el total, y «¿Me confirman la separación?» |
| Si nadie lo confirma | Se cierra solo a las 24 horas corridas (también de noche) |
| Al confirmar | Baja el stock; los pedidos web van aparte de los apartados de tienda |
| Si dos separan la última | Los dos quedan registrados y decide la tienda: si el primero no se completa, se confirma el segundo; a los demás, otra sede o conseguirla para una fecha |
| Confirmado y sin pagar | Aviso a las 48 horas; decide la sede (si lo anula, el stock vuelve) |
| Pagos | Dentro del pedido web: Yape, Plin o transferencia con su n.º de operación, o efectivo al recoger (entra a la caja de la sede); boleta al quedar pagado |
| Prendas en dos tiendas | El cliente elige una tienda para todo; lo que falta se trae con un traslado |
| Recojo o envío | Se coordina por WhatsApp; la tienda lo anota. Tarifa fija en Trujillo, Arequipa y Lima; a otra ciudad, agencia con pago en destino |
| Cuenta | Para separar; al crearla (Google o correo, sin contraseña) ya es miembro del Club CAYLA |
| Novedades | Se ven en la web; ya no se hace publicidad por WhatsApp |
| Fotos y secciones | Las reales; Lo nuevo, Ofertas (todas las campañas vigentes), Más vendidos y Arma tu look |
| Lo nuevo | Llegó a una tienda hace 30 días o menos; fijar o quitar desde la Vitrina |
| Qué se ve | Interruptor por modelo; lo que no hay en ninguna tienda dice «Avísame» |
| Precio | Precio web propio por modelo, nace al encenderlo; el cliente ve solo ese; las campañas también se aplican sobre él |
| No recoge en 7 días | Se le recuerda y decide la sede |

## Propuestas que esperan OK

a. Al anotar un pago digital, la sede escribe el n.º de operación de su app y el ERP avisa si ya se usó. c. Un color sin foto
propia se muestra con la foto principal y la nota «Foto en otro color». f. Agregar a la bolsa no separa nada. g. Más vendidos
muestra el puesto, no cuántas se vendieron. h. Un look se agrega completo eligiendo cada talla en una hoja. i. «Novedades para
ti» en la cuenta. j. Al confirmar, el stock baja primero del almacén; si solo queda en el piso, la sede la retira del colgador.
k. Si dos piden la última, el ERP dice cuál la separó antes, y la ficha le avisa al cliente que igual puede separarla.
m. Código de 4 cifras para recoger en caja. (b, d, e y l ya no están: se fueron con el pago en la web o las decidió Felipe.)

## Falta decidir

1. Una prenda que se consigue para una fecha: ¿se cobra antes de que llegue, una parte o al recogerla? 2. ¿Un Yape por sede o
uno compartido? 3. Los avisos del club por WhatsApp (cumpleaños, vale): ¿también se dejan? 4. Cambios y devoluciones web,
quién reparte en la ciudad y el nombre de la web.
