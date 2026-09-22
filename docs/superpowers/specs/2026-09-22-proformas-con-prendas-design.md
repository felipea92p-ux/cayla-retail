# Proformas con prendas del catálogo y hoja A4 con fotos — diseño (2026-09-22)

Aprobado por Felipe en el chat del 2026-09-22, sección por sección. Maqueta elegida: **C · con foto de cada
prenda** (tres direcciones A/B/C en el acompañante visual; se descartaron la «Clásica» y la «Atelier»).

## El problema

Hoy una proforma es un total suelto: una sola línea «Venta» con un monto escrito a mano. No dice qué prendas
se cotizaron, no sirve para que la clienta vuelva a comprarlas y no hay documento que entregarle. Además:

- **Convertir no mueve stock.** `convertir_proforma_a_comprobante` (0010) crea el comprobante sin `ventas`
  ni `movimientos`: con prendas reales, la clienta se llevaría ropa sin que el inventario baje (principio 2).
- **Error de IGV (hallazgo 2026-09-22).** La proforma guarda el total CON IGV en `items[].precio_unitario`,
  y para una línea sin `variante_id` ese campo se lee SIN IGV (`itemsParaLucode`, `emitir_comprobante`):
  al convertir, el comprobante declararía un 18 % de más. «Duplicar» (hecho hoy) copió el mismo error.
- En producción hay **una** proforma (vigente, S/ 7,000, de prueba). No hay historia que migrar.

## Decisiones de Felipe

1. **Se cobra en el Punto de Venta.** «Cobrar» abre Vender con las prendas en el carrito; se cobra como
   cualquier venta (stock, caja, comprobante automático D-60). La proforma queda «convertida» y enlazada.
2. **No se reserva stock.** La proforma congela el precio, no la prenda.
3. **Documento: hoja A4 para imprimir o guardar en PDF** desde el navegador. Sin librería de PDF ni
   archivos en el servidor.
4. **Líneas: prenda + cantidad + descuento por línea**, y una **nota** libre que sale impresa. Sin líneas
   libres (servicios).
5. **Si una prenda subió de precio mientras la proforma está vigente, se cobra el precio de la proforma.**
6. **Hoja A4: maqueta C**, con la foto de cada prenda.

## Datos (migración nueva — en producción, con OK de Felipe)

`proformas` suma:

| Columna | Para qué |
|---|---|
| `numero bigint` (identidad, único) | «PRO-000123» en el papel y en la búsqueda |
| `nota text` (≤ 500) | lo que sale impreso al pie |
| `venta_id uuid → ventas` | con qué venta se cobró |

`items` (jsonb, ya existe) pasa a guardar **copias** de cada línea, con la convención de `registrar_venta`
(precio de etiqueta CON IGV), para que el papel no cambie si mañana cambia el catálogo:

```json
{ "variante_id": "…", "cantidad": 2, "precio_unitario": 79.90, "descuento_unitario": 0,
  "motivo_descuento": null, "motivo_descuento_detalle": null,
  "descripcion": "Blusa Emma · S · Negro", "codigo": "CMS-0001-NEG-S" }
```

**`crear_proforma` se reemplaza** (se borra la firma vieja en la misma migración: dos sobrecargas ya tumbaron
una pantalla, ver memoria del 2026-09-21). Nueva firma: `(p_ubicacion_id, p_items, p_cliente_nombre,
p_cliente_num_doc, p_vence_at, p_nota)`. La base:

- exige ≥ 1 línea; cada `variante_id` existe y está activa; `cantidad` entera > 0; `precio_unitario` =
  precio de catálogo de hoy (mismo candado `venta_precio_cambiado` que `registrar_venta`);
- `0 ≤ descuento_unitario ≤ precio_unitario`, con motivo de la lista de `registrar_venta` si hay descuento
  («otro» exige detalle);
- **copia ella** `descripcion` y `codigo` desde el catálogo (no se cree lo que manda la pantalla);
- **calcula ella** subtotal, IGV y total: `total = Σ (precio − descuento) × cantidad`,
  `igv = round(total − total/1.18, 2)`, `subtotal = total − igv`. Ya no los manda la pantalla.

Los topes de descuento por rol (20 % / 35 % con argumento / nunca bajo costo) **no** se duplican en la
proforma: el candado real es `registrar_venta` al cobrar. La pantalla de la proforma aplica los mismos topes
para no prometer algo que después no se pueda cobrar.

**`marcar_proforma_cobrada(p_proforma_id, p_venta_id)`** (nueva): exige proforma `vigente`, venta existente
no anulada de la misma tienda; deja `estado = 'convertida'`, `venta_id`. Idempotente si ya está convertida
con esa misma venta.

- Límite conocido: son dos llamadas (venta, luego marcar). Si se corta la red entre las dos, la venta y el
  stock quedan bien y la proforma sigue «vigente»; el Punto de Venta reintenta el marcado y, si no puede,
  avisa. No se mete en `registrar_venta` (la función más delicada del sistema, también la usa la cola sin
  conexión) por algo que se corrige con un clic.

**`convertir_proforma_a_comprobante`**: se quita de la pantalla. Arrastra el error de IGV y no mueve stock.
La función se deja en la base sin `grant` a `authenticated` (no se borra: principio de no borrar historia).

**Proformas de formato anterior** (`items` sin `variante_id`): se ven en la lista con el chip «formato
anterior», sin Cobrar, Duplicar ni Ver/imprimir. Hoy es una sola, de prueba.

## Pantalla

**Nueva proforma** (`NuevaProformaModal`, más ancha):

- buscador del Punto de Venta (`filtrarPrendasV2` / `resolverCodigoV2`: referencia, SKU o escáner) y
  elección de talla (`ElegirTallaModal`);
- una fila por prenda: foto, descripción, cantidad (+/−), precio de etiqueta, descuento opcional (motivo de
  `RAZONES_DESCUENTO`, mismos topes del Punto de Venta), importe, quitar;
- clienta (nombre y DNI/RUC con `ConsultaDocumento`), validez en días (7 por defecto), nota;
- subtotal, IGV y total que se suman solos (`lib/proformas-reglas.ts`, puro y probado).
- El catálogo sale de la misma lectura de Vender (`getCatalogo`); la tienda es la de la persona (el líder
  puede elegir).

**Lista de proformas:** número PRO-000123, cuántas prendas, total, estado. Al tocar la fila se despliega el
detalle. Botones: **Ver / imprimir**, **Cobrar**, **WhatsApp** (el texto ya dice el número), **Duplicar /
Renovar** (ahora copia las prendas, por la RPC nueva — corrige el error de IGV de hoy).

**Cobrar:** `/vender?proforma=<id>`. La página lee la proforma y el Punto de Venta arranca con el carrito
armado y una franja «Cobrando la proforma PRO-000123 de Ana Torres». Se puede quitar una prenda o cambiar la
cantidad; si falta stock, el aviso de siempre. Al cobrar bien, `marcar_proforma_cobrada`.

**Precio de cada línea al cobrar** (regla pura `precioAlCobrarDeLaProforma`, con prueba):

- `final_proforma = precio_proforma − descuento_proforma`; `precio_hoy` = etiqueta actual.
- Se cobra `min(final_proforma, precio_hoy)`: si la prenda subió, se respeta la proforma; si bajó, paga lo
  menor.
- El carrito lleva `precio_unitario = precio_hoy` (lo exige `registrar_venta`) y
  `descuento_unitario = precio_hoy − cobrado`.
- Motivo: el de la proforma si el precio no cambió; si subió, «otro» con detalle «Precio de la proforma
  PRO-000123».
- Si una campaña vigente da un precio aún menor, gana la campaña (regla actual: un solo descuento, el
  mayor).
- Todo pasa por los candados de `registrar_venta`: nunca bajo costo; > 20 % lo cobra un líder con argumento.

## Hoja A4 (maqueta C)

`components/ProformaA4.tsx`, hermano de `BoletaA4.tsx`: mismo mecanismo de impresión (`window.print()` sobre
un nodo en `<body>`, `@page a4`, `print-color-adjust: exact`), mismo emisor (`lib/emisor.ts`).

- Cabecera: CAYLA, razón social y RUC; a la derecha «PROFORMA PRO-000123», emitida y **válida hasta** (en
  rojo).
- Clienta (nombre, documento) y tienda (quién atendió).
- Una fila por prenda: **foto** (la del catálogo para ese color, `producto_fotos`; sin foto, un recuadro con
  el `hex` del color), descripción, talla y color como etiquetas, código, `cant × precio`, descuento e
  importe.
- Nota en un recuadro; a la derecha: prendas y descuentos, op. gravada, IGV 18 %, **total**.
- Pie: dirección y contacto; «Precios con IGV, válidos hasta la fecha indicada. Las prendas no quedan
  reservadas. **Este documento no es un comprobante de pago.**»
- Antes de `print()` se espera a que carguen las fotos (una `<img>` sin decodificar sale en blanco).
- Se abre desde «Ver / imprimir» en un `<Modal>` (regla ADR-0136) con la vista previa y el botón Imprimir;
  «Guardar como PDF» es la opción del diálogo del navegador.

## Errores

- Pantalla sin catálogo (lectura fallida): «Nueva proforma» avisa y no se abre (como hoy sin tiendas).
- La base rechaza (precio cambiado entre abrir y guardar, prenda desactivada): mensaje con
  `traducirError` y la fila marcada; nada se guarda a medias (una sola RPC).
- Cobrar una proforma ya convertida o vencida: la página de Vender lo dice y no carga el carrito (vencida:
  misma confirmación consciente de hoy, `confirmacionDeConversion`).

## Pruebas

- Puras (vitest): suma de la proforma, `precioAlCobrarDeLaProforma` (igual, subió, bajó, campaña, con y
  sin descuento), número «PRO-000123», texto de WhatsApp, detección de formato anterior.
- Base (local, transacción con rollback): `crear_proforma` rechaza precio falso, cantidad 0, descuento >
  precio, motivo inválido, variante inactiva; calcula el total ella; sin sobrecarga vieja.
  `marcar_proforma_cobrada`: idempotente, rechaza otra tienda o venta anulada.
- Navegador: armar una proforma de 3 prendas, imprimirla (PDF real con `page.pdf()`, ver memoria
  «verificar impresión»), cobrarla en Vender y ver stock, caja y proforma «convertida».

## Fuera de alcance (a propósito)

Apartar stock desde la proforma; líneas libres (servicios); enlace público para la clienta; enviar el PDF
por WhatsApp como archivo (el navegador lo guarda y se adjunta a mano).
