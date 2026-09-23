# Prendas sin registrar: vender en hora punta sin descuadrar el stock

**Fecha:** 2026-09-23 · **Decidido con:** Felipe (4 rondas de preguntas, esta sesión) · **Estado:** diseño aprobado, sin implementar

## El problema

En hora punta llegan a piso prendas que todavía no pasaron por almacén (etiqueta + alta en el
sistema): producción del taller, mercadería de proveedores y accesorios comprados por internet
(AliExpress/Shein/Temu). La clienta la quiere ya y la colaboradora la vende a un precio estimado.

En el sistema, esa venta tiene una sola salida hoy: **«Monto manual»** del punto de venta
(`apps/web/components/PuntoDeVenta.tsx:558`), que vende la variante centinela «Cargo especial»
(`supabase/migrations/20260912234726_cargo_especial_pos.sql`) por cualquier monto, **sin
descripción, sin talla y contra un stock ficticio de 999 999**. Consecuencias:

1. Nadie sabe qué prenda se vendió.
2. El stock real de esa prenda nunca baja (o nunca se registra su entrada).
3. La diferencia contra el precio real, a favor o en contra, no se ve.
4. Los reportes por producto y de margen no la cuentan (la venta queda a costo 0).

## Cómo opera CAYLA hoy (respuestas de Felipe)

| Tema | Realidad |
|---|---|
| Origen | Taller (llega con lista), proveedor (con factura), internet (solo el pedido en la app) |
| Por qué se salta almacén | Urgencia de venta |
| Almacén | Uno por sede; cada sede etiqueta lo suyo |
| Cuentas | Dos por tienda, **caja** y **almacén**; en cada una se elige qué colaboradora hace el movimiento |
| Conteo al registrar un lote | **Lo físico** (si ya se vendió una, se cuentan una menos) |
| Precio de venta | A veces ya está decidido; si no, **lo fija almacén** al registrar |
| Encargada en hora punta | Casi siempre |
| Comprobante | Casi siempre nota de venta; boleta o factura solo si la piden |

## Decisiones

| # | Decisión | Por qué |
|---|---|---|
| D1 | Caja **vende sin pedir aprobación** y anota lo mínimo; **almacén regulariza** después (opción 2, no la 4 «crear el producto en caja») | El precio oficial lo fija almacén, no caja en hora punta; crear productos desde caja llena el catálogo de duplicados |
| D2 | «Prenda sin registrar» **reemplaza** a «Monto manual» | Una sola puerta y siempre con rastro. Felipe confirmó que Monto manual solo se usa para prendas |
| D3 | La diferencia de precio se guarda **con signo**: negativa = descuento no planificado; positiva = **sobreprecio** | El ingreso es lo que pagó la clienta; no hay «otro sector»: la diferencia se muestra en el mismo reporte |
| D4 | Para frenarlo: **visible en reportes** + **alerta al líder a los 2 días** sin regularizar. Sin tope ni aprobación en caja | Elección de Felipe |
| D5 | Accesorios de internet: **productos agrupados por tipo y precio** («Aretes S/ 15») en el catálogo normal | Elección de Felipe. No requiere código nuevo |
| D6 | Se reutiliza el patrón «pendiente de revisión» del censo (`20260918020000_censo_alta_al_vuelo.sql`) para dar de alta desde almacén | Un problema, una solución en todo el sistema |

## Flujo de inicio a fin

### 1. En caja: vender una «Prenda sin registrar»

El botón «Monto manual» pasa a llamarse **«Prenda sin registrar»**. Abre el modal (`<Modal>`, ADR-0136) con:

- **Descripción corta** (texto, obligatorio): «Blusa lino beige».
- **Categoría**, **talla** y **color**, elegidos de las listas que ya existen (`retail.categorias`, `retail.tallas`, `retail.colores`).
- **Precio cobrado** (obligatorio, > 0).

La línea entra al carrito y la venta se cobra como cualquier otra. La nota de venta, boleta o factura
imprime la descripción. Al registrar la venta nace una fila **pendiente** en la cola de
regularización de esa sede, con quién la vendió (el responsable del combo, ADR-0162).

Toma unos 15 segundos y no pide aprobación.

### 2. En almacén: regularizar

Una pestaña nueva en `/recibir`, **«Por regularizar»**, para la cuenta de almacén de la sede. Lista las prendas
pendientes, primero las más antiguas; las que pasan de 2 días llevan el chip «Vencida». Por cada una:

1. **¿Qué prenda es?** Se busca la variante real en el catálogo o, si no existe, se da de alta ahí
   mismo con su **precio oficial**. El alta queda `estado_alta = 'pendiente'` si no la hace un líder (D6).
2. **Una sola pregunta para que el stock cuadre** (porque se cuenta lo físico):
   - **«Ya estaba registrada, solo perdió la etiqueta»** → se descuenta 1 de su stock.
   - **«Llegó nueva y no se contó al registrar el lote»** → se anotan su entrada y su salida juntas; el stock no cambia.

   Sin esta pregunta, una prenda de un lote de 10 contado como 9 se descontaría dos veces.
3. El sistema calcula la **diferencia** = precio cobrado − precio oficial, y la guarda (D3).

La firma es el responsable del combo de la cuenta de almacén (`retail.fn_actor_persona_id(true)`).

### 3. Reporte y alerta

La misma pantalla «Por regularizar» es el reporte (no hay pantalla aparte):

- **Cifras:** pendientes, vencidas (más de 2 días), y diferencia del mes separada en descuento no planificado y sobreprecio.
- **Tabla** filtrable por sede, colaboradora y estado (pendiente/regularizada), incluidas las ya regularizadas.
- **Alerta al líder:** el número de vencidas se ve en la pantalla de inicio del líder. Es un valor derivado (fecha + estado), sin trabajos programados.

## Modelo de datos

**Tabla nueva `retail.prendas_por_regularizar`** (una fila por línea de venta sin registrar):

| Columna | Qué guarda |
|---|---|
| `venta_item_id` (único, FK) | La línea de venta |
| `ubicacion_id` | Sede donde se vendió |
| `descripcion`, `categoria_id`, `talla_id`, `color_id` | Lo que anotó caja |
| `precio_cobrado` | Lo que se cobró (copia de la línea) |
| `vendido_por`, `vendido_en` | Quién y cuándo |
| `estado` | `pendiente` / `regularizada` / `anulada` |
| `variante_id` | La variante real (al regularizar) |
| `forma` | `ya_registrada` / `llego_nueva` |
| `precio_oficial`, `diferencia` | Al regularizar; `diferencia` con signo |
| `regularizado_por`, `regularizado_en` | Quién y cuándo |

**Al regularizar**, la línea de venta pasa de la variante centinela a la real (`venta_items.variante_id`
y `costo_unitario`). Es un cambio de «desconocido» a «conocido», se hace **una sola vez**, lo protege
un candado en la base y lo capturado originalmente queda en `prendas_por_regularizar`. Con eso, los
reportes por producto, rotación y margen la cuentan sin tocarlos.

**Movimientos (append-only):** los de la regularización llevan `venta_item_id` y motivos propios
(`venta_regularizada`; en el caso «llegó nueva» también `ingreso_regularizado`). El movimiento
original contra la centinela no se toca.

**RPC:**
- `registrar_venta`: **misma firma**, porque los datos nuevos viajan dentro de cada ítem del jsonb
  `p_items`. Para una línea centinela exige descripción, categoría, talla y color, y crea la fila
  pendiente. Sin sobrecarga nueva (ver la memoria sobre sobrecargas duplicadas que tumbaron `/productos`).
- `regularizar_prenda(p_id, p_variante_id, p_forma)`: nueva. Un `update` condicionado a
  `estado = 'pendiente'` evita que se regularice dos veces.

## Casos borde

| Caso | Comportamiento |
|---|---|
| Se anula una venta con la prenda **pendiente** | La fila pasa a `anulada`; sale de la cola |
| Se anula o devuelve una venta con la prenda **ya regularizada** | La prenda real vuelve al stock. `anular_venta` y devoluciones hoy buscan exactamente una salida con motivo `venta` por línea (`20260922151500_comprobantes_cola_de_reintento.sql:295`): hay que ajustarlos para reconocer `venta_regularizada` |
| Dos colaboradoras regularizan la misma a la vez | La segunda recibe «ya fue regularizada» |
| La variante elegida es de otra sede o está restringida | Se permite: la venta ya ocurrió en esta sede |
| Accesorio de internet | Se regulariza contra su producto agrupado («Aretes S/ 15»), igual que la ropa |

## Módulo y roles (ADR-0161)

- **Sin módulo nuevo:** «Por regularizar» es una **pestaña de `/recibir`**, la pantalla que ya es la
  entrada de almacén para todo lo que llega (ADR-0113). Quien ya ve Recibir la ve; no es una pantalla
  ni un grupo de pantallas nuevo, así que no aplica el alta en `retail.modulos`.
- Las cifras de vencidas en el inicio solo se muestran si `fn_es_lider()`.
- La venta sigue en el módulo de caja: no cambia quién puede vender.

## Fuera de alcance

- Tope diario o aprobación de la encargada en caja (Felipe eligió no ponerlo).
- Cobrarle la diferencia a la colaboradora.
- Notificaciones push o correo (la alerta es la cifra en el inicio del líder).
- Importar la lista del taller o la factura del proveedor para registrar lotes más rápido. Es la
  mejora que ataca la causa (almacén lento), pero es otro proyecto.

## Cómo se verifica

1. En caja: se vende una «Prenda sin registrar» sin completar la descripción → la base la rechaza; completa → se vende y aparece en «Por regularizar».
2. Se regulariza como «llegó nueva» → el stock de la variante real no cambia y hay entrada + salida en `movimientos`.
3. Se regulariza como «ya registrada» → el stock baja 1.
4. Cobrado S/ 50, oficial S/ 70 → diferencia −20 (descuento). Cobrado S/ 80 → +10 (sobreprecio).
5. Se anula una venta regularizada → la prenda real vuelve al stock.
6. Una pendiente de hace 3 días aparece como «Vencida» y cuenta en el inicio del líder.
7. Con la cuenta de almacén (que ya ve Recibir) se ve la pestaña; la cifra de vencidas del inicio solo la ve el líder.

Todo en la base **local**. Pegar en producción (con prefijo `retail.`) necesita el OK de Felipe.
