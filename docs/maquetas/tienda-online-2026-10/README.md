# Tienda online CAYLA: maqueta navegable (2026-10-14, versión 2)

**Qué es:** un prototipo tocable, sin código real ni base de datos, de la tienda online para clientes y de las pantallas
nuevas que necesita el ERP para atenderla. Todo va en `index.html`, que se publica como enlace privado con sus fotos al lado.
**Una maqueta no cambia el ERP:** nada de esto existe todavía en `apps/web` ni en la base.

**Versión 2, mismo día:** Felipe vio la primera y dijo «tiene que ser impresionante, lo veo muy simple; falta lo más nuevo,
descuentos u otra sección». La tienda se rediseñó entera con las fotos reales del catálogo:

- **Portada:** la campaña real «Aniversario CAYLA −12 %» con cuenta regresiva hasta el 21 de octubre y tres prendas reales
  en polaroid.
- **Secciones:** categorías como historias, Lo nuevo, Arma tu look (láminas con números), Ofertas por campaña, Más vendidos
  (ranking), Club CAYLA con su tarjeta y Nuestras tiendas.
- **Navegación:** ficha de prenda con galería por color, favoritos, buscador, menú, y una vista nueva, «La tienda en grande»
  (la misma tienda en una computadora, con menú desplegable y agregar rápido).

## Qué es real y qué es inventado

- **Real** (leído de producción el 2026-10-14, solo lectura): 48 prendas con su nombre, categoría, colores, tallas y sus
  116 fotos; las 4 campañas con descuento vigentes (nombre, porcentaje y fechas); las tres sedes.
- **Inventado:** precios, costos, stock, días en la web, el ranking de más vendidos, qué prenda entra a qué campaña (salvo 3
  que sí están etiquetadas en el ERP), clientes, pedidos, teléfonos y direcciones.

**Las fotos no están en este repositorio** (es público): `fotos/` está en `.gitignore` y las fotos viajan solo en el enlace
privado. Abierto desde el repo, cada prenda se dibuja con el ícono de su categoría sobre su color. Las fotos son las del
bucket público `retail-productos-fotos`; sus nombres están en el catálogo de `index.html`.

## Cómo se usa

- **Recorrido en vivo:** la web del cliente en un celular y el ERP de la sede, conectados: lo que hace el cliente aparece
  en el ERP y al revés. Arriba hay una guía de 4 pasos y atajos.
- **La tienda en grande:** la misma tienda en una computadora.
- **Cómo funciona:** decisiones, el catálogo de hoy frente a la web, propuestas que esperan OK, la vida de una prenda online,
  qué cambia en el ERP, cómo se arma por dentro y lo que falta decidir.
- **Enlaces directos** (`index.html#…`): `grande`, `grande--producto`, `grande--ofertas`, `grande--nuevo`, `grande--look`,
  `grande--cuenta`, `grande--bolsa`, `producto`, `ofertas`, `nuevo`, `look`, `bolsa`, `datos`, `cuenta`, `menu`, `buscar`,
  `pagar`, `whatsapp`, `confirmar`, `listo`, `vitrina`, `vitrina-lista`, `looks-erp`, `separar`, `existencias`, `config`, `como`.

## Decisiones de Felipe (2026-10-14, cuatro rondas)

| Pregunta | Decisión |
|---|---|
| De dónde sale la prenda | Estante web por sede: lo separado no se vende en caja, el piso no se toca |
| Cómo la recibe | Recojo en tienda y envío; tarifa fija dentro de Trujillo, Arequipa y Lima; a otra ciudad, agencia con pago en destino |
| Pago | El 100 % al apartar, con Yape o Plin; WhatsApp con mensaje armado (código de pedido incluido) y la foto; cada sede confirma lo suyo |
| Cuenta | Catálogo abierto; cuenta al apartar (Google o correo) y **al crearla ya es miembro del Club CAYLA** |
| Novedades | **Se ven en la web; ya no se hace publicidad por WhatsApp** |
| Fotos | Las reales del catálogo |
| Secciones | Lo nuevo, Ofertas, Más vendidos y Arma tu look (más categorías, Club y tiendas) |
| Lo nuevo | Llegó al estante web hace 30 días o menos; fijar o quitar desde la Vitrina |
| Ofertas | Todas las campañas vigentes, agrupadas y con su fecha de término |
| Qué se ve | Interruptor por modelo; lo que no está en un estante web dice «Avísame» |
| Precio | Precio web propio por modelo; el cliente ve solo ese; las campañas también se aplican sobre él |
| No recoge en 7 días | Se le recuerda y decide la sede |

## Propuestas que esperan OK

a. La sede escribe el n.º de operación de su app al confirmar. b. 20 min para pagar, 7 días para recoger, aviso a las 2 h.
c. Un color sin foto propia se muestra con la foto principal y la nota «Foto en otro color» (cambió en la versión 2: con
el catálogo real, esconderlo dejaba sin colores a la mayoría). d. A otra ciudad envía la sede más cercana con todo el pedido.
e. La boleta sale al confirmar el pago (SUNAT y Lucode: OK de Felipe al construir). f. Agregar a la bolsa no guarda.
g. Más vendidos muestra el puesto, no cuántas se vendieron. h. Un look se agrega completo eligiendo cada talla en una hoja.
i. «Novedades para ti» en la cuenta.

## Falta decidir

1. ¿Un Yape Empresa (QR) por sede o uno compartido? 2. Los avisos del club por WhatsApp (cumpleaños, vale): ¿también se
dejan? 3. Cambios y devoluciones web. 4. Quién reparte en la ciudad. 5. Fuera de horario y el nombre de la web.
