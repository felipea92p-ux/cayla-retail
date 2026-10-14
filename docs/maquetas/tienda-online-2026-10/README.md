# Tienda online CAYLA: maqueta navegable (2026-10-14)

**Qué es:** un prototipo tocable, sin código real ni base de datos, de la tienda online para clientes y de las pantallas
nuevas que necesita el ERP para atenderla. Se abre `index.html` (todo va en un solo archivo, con el isotipo incrustado).
**Una maqueta NO cambia el ERP:** nada de esto existe todavía en `apps/web` ni en la base.

**Todo dato es inventado**: prendas, precios, clientes, teléfonos, direcciones y números de operación. Lo real son las
tres sedes y las decisiones de Felipe.

## Cómo se usa

- **Recorrido en vivo:** a la izquierda está la web del cliente en un celular y a la derecha el ERP de la sede. Las dos
  leen el mismo estado: lo que hace el cliente aparece en el ERP, y al revés. Arriba, un guion de 4 pasos y atajos
  («Saltar al pago», «Saltar a revisar el pago», «Saltar a entregar», «Simular: se acabó el tiempo», «Empezar de nuevo»).
- **Saltos:** cada lado tiene una fila de botones para ir directo a cualquier pantalla.
- **Enlaces directos** (`index.html#pagar`, `#confirmar`, `#listo`, `#whatsapp`, `#bolsa`, `#datos`, `#producto`,
  `#vitrina`, `#vitrina-lista`, `#separar`, `#existencias`, `#config`, `#como`).
- **Cómo funciona:** las decisiones, las propuestas que esperan OK, la vida de una prenda online, qué cambia en el ERP,
  cómo se arma por dentro y lo que falta decidir.

## Pantallas

**Web del cliente (celular primero):** catálogo con buscador y categorías · ficha de prenda (color, talla, «Avísame»,
disponibilidad por sede) · bolsa con las tres formas de entrega · entrar con Google o con correo (sin contraseña) · tus
datos (DNI con nombre automático y club, celular, dirección, privacidad) · pagar con QR de Yape (Plin también) y reloj de
20 minutos · WhatsApp con el mensaje armado y la foto · estado del pedido (código de recojo de 4 cifras) · mi cuenta
(pedidos, avisos, datos) · envíos y recojo · cambios (borrador).

**ERP de la sede:** Ventas ▸ Pedidos web (cifras, pestañas por estado, revisar pago con n.º de operación y responsable,
preparar, entregar con código, enviar por agencia o reparto, mensajes de WhatsApp ya escritos) · Catálogo ▸ Vitrina web
(interruptor por modelo, precio web, margen, fotos que faltan, libres por sede, cambio de precio en lote) · Inventario ▸
Existencias ▸ Separar para la web (y devolver al piso) · Configuración ▸ Tienda web.

## Decisiones de Felipe (2026-10-14)

| Pregunta | Decisión |
|---|---|
| De dónde sale la prenda | Estante web por sede: lo separado no se vende en caja, el piso no se toca |
| Cómo la recibe | Recojo en tienda y envío a domicilio |
| Envío | Tarifa fija dentro de Trujillo, Arequipa y Lima; a otra ciudad, por agencia con pago en destino |
| Cuánto paga al apartar | El 100 % |
| Cómo avisa que pagó | WhatsApp con mensaje armado + foto del Yape (su idea), pulida con el código de pedido |
| Quién confirma | Cada sede, lo suyo |
| Cuenta del cliente | Catálogo abierto; cuenta solo al apartar (Google o correo con enlace) |
| Qué se ve | Interruptor por modelo; lo que no está en un estante web dice «Avísame» |
| Precio web | Propio, por modelo, al encenderlo; el ERP muestra diferencia y margen |
| Qué precio ve el cliente | Solo el precio web |
| Campañas | También se aplican sobre el precio web |
| No recoge en 7 días | Se le recuerda y decide la sede; nada se libera solo |
| Entrega de este trabajo | Maqueta navegable primero; el repositorio aparte cuando la apruebe |

## Propuestas de la maqueta que esperan OK

a. La sede escribe el n.º de operación de su app Yape Empresa al confirmar (el ERP avisa si ese número ya confirmó otro
pedido). b. 20 min para pagar, 7 días para recoger, aviso a las 2 h sin revisar. c. Un color sin foto no se muestra.
d. A otra ciudad envía la sede más cercana que tenga todo el pedido. e. La boleta sale al confirmar el pago (toca SUNAT
y Lucode: OK de Felipe al construir). f. «Agregar a la bolsa» no guarda; se guarda al «Apartar y pagar».

## Falta decidir

1. ¿Un Yape Empresa (QR) por sede o uno compartido? 2. Cambios y devoluciones de una compra web. 3. Quién reparte en la
ciudad y quién paga si la dirección estaba mal. 4. Apartar fuera de horario. 5. Nombre y dirección de la web.
