# Flujos largos del ERP: 5 para acortar (2026-11-28)

Solo análisis: no se cambió código ni datos. Rutas relativas a `apps/web/`.

## Cómo se midió y qué falta

- Cuatro revisores de solo lectura contaron pasos en el código (mostrador, inventario, catálogo y compras, finanzas y producción).
- En local, sin guardar nada: Existencias (paso 1 de «Colgar»), Nuevo traslado y el cobro con boleta. La anulación y la devolución
  **no** se recorrieron en pantalla (no había ventas en la base local).
- `/pantalla`, `/formidable` y `/decide` se usaron como lente. **No** se corrieron completas: no hay puntajes, prueba ciega ni medidores.
- Las frecuencias y los conteos de clics son **estimados**. No se consultó producción.

## Los cinco

| # | Flujo | Quién y cada cuánto (estimado) | Esfuerzo | Migración | Decisión previa |
|---|---|---|---|---|---|
| 1 | Armar un traslado y repartir un lote del Taller | almacén, taller; varias veces por semana | M | no | aprobado (ADR-0242 D-2), sin construir |
| 2 | Anular una venta del día | encargada; pocas por semana | M | no | toca SUNAT: pide OK |
| 3 | DNI en el cobro que llegue a la ficha | caja; varias al día | S | no | respeta ADR-0288 |
| 4 | Devolución: registrar y aprobar de una | tienda; algunas por semana | M | no | mueve dinero: pide OK |
| 5 | Colgar, subir, pedir y dañada sin paso «Quién» | piso; muchas al día | S/M | no | diseño elegido: pide OK |

### 1. Traslados: escanear en vez de elegir línea por línea

**Hoy.** «Hacia» en un combo; «Llega aproximadamente» pide fecha **y hora**, obligatoria y sin valor puesto
(`components/MoverMercaderiaFormV2.tsx:250`, `:420`); por cada talla y color: «+ Agregar otra prenda», combo, escribir, elegir y cantidad
(`:437-520`). No usa pistola ni cámara. Con 20 variantes son unos 80 gestos. Recibir esa misma caja sí se escanea.

**Taller.** Al pasar un lote al stock, «Llevarlas a las tiendas» vive en un aviso de 9 s (`components/orden-pagina/PasarAlStockModal.tsx:210-214`);
el enlace trae todo el lote hacia un solo destino y las siguientes tiendas se arman a mano.

**Después.** Buscador con foco donde cada lectura suma 1; destino en botones; llegada por día con «Mañana» puesto. Segunda parte:
«Repartir lote», una grilla talla/color × tienda que crea un traslado por tienda y queda en la orden mientras sobren prendas.

**No se quita:** tope por stock, Responsable, marca contra el doble envío, conteo a ciegas al recibir.

**Se rompe si:** «Repartir» crea tres traslados y el segundo falla. Debe decir cuáles salieron, o ser todo o nada (eso sí pide migración).

### 2. Anular una venta del día

**Hoy.** Historial ▸ «Anular venta» lleva a `/devoluciones?item=…` (`lib/historial-acciones-reglas.ts:107-110,161`); con una sola prenda se
abre la **devolución**, no la anulación (`components/DevolucionesPanel.tsx:101-111`); al salir se pierde la venta (`:198-200`). «Anular» se
ofrece a toda venta de hoy sin mirar su comprobante (`components/DevolucionesVentas.tsx:49-50`). La boleta se envía sola a SUNAT al cobrar
(`components/PuntoDeVenta.tsx:2388-2391`) y la base rechaza anular una enviada o aceptada (cabecera de `20261014165000_*.sql`): la persona
se entera después de llenar la hoja (inferido, no probado). El camino que sirve es Comprobantes ▸ Anular.

**Después.** Un solo «Anular» desde la venta que elige la hoja según el comprobante y dice antes si no se puede.

**No se quita:** mismo día y caja abierta, motivo, Responsable, permisos para la baja, elegir la condición de la prenda (la baja de hoy la
devuelve como vendible, `app/api/lucode/anular/route.ts:253`).

### 3. DNI del cobro y ficha del cliente

**Hoy.** Hay dos entradas para el mismo dato: «Agregar cliente» arriba del ticket y «DNI del cliente» en el paso Comprobante. Solo la primera
manda `p_cliente_id` (`components/PuntoDeVenta.tsx:2206-2210`); la segunda consulta el padrón, no la libreta (`components/ConsultaDocumento.tsx`).
Si el DNI se teclea al cobrar, la venta no entra en la ficha ni suma puntos.

**Después.** Con 8 dígitos y sin cliente elegido, buscar la ficha: si coincide, se adjunta sola, visible y con «Quitar»; si no, un toque
«Guardarlo como cliente».

**No se quita:** cliente opcional; no se crea ficha ni se inscribe al club sin que alguien lo pida; si la búsqueda falla, se cobra igual.

### 4. Devolución en un solo viaje

**Hoy.** Registrar → «Revisar y aprobar» (`components/DevolucionesFlujo.tsx:569`) → pestaña de pendientes → buscar la tarjeta → «Aprobar»
(`components/DevolucionesPendientes.tsx:165`) → monto, medio y **Responsable otra vez** (`:376`) → confirmar.

**Después.** En el último paso, «Registrar y aprobar» con el reembolso ahí mismo y una firma; «Dejar pendiente» como segunda opción.

**No se quita:** el estado pendiente, la espera cuando SUNAT aún no aceptó la boleta, caja abierta para efectivo, nota de crédito.

**Se rompe si:** se registra y la aprobación falla: debe quedar pendiente, como hoy, y decirlo.

### 5. Acciones de la talla en Existencias

**Hoy.** `lib/existencias-flujos.ts:104-121`: colgar = cantidad → quién; subir = cantidad → destino → quién; pedir y dañada = 4 pasos.
Con sesión personal el Responsable ya viene puesto, así que ese paso solo confirma.

**Después.** Cuando ya viene puesto, el Responsable y «Así va a quedar» van en la pantalla de la cantidad. En terminal compartida no cambia.

## Lo más grave que apareció (no es largo, es peligroso)

**Nuevo producto no avisa que esa mercadería ya viene en camino.** Recibir «sin aviso» sí lo hace
(`components/recepcion-conteo/LlegoSinAviso.tsx`, `lib/compras-pagadas-reglas.ts`); Nuevo producto no usa esa consulta y deja cargar las
unidades. Ya pasó: ENV-002 de Trujillo entró por Nuevo producto y ajustes, y al cerrarlo contando habrían entrado 154 prendas dos veces
(cabecera de `supabase/migrations/20261111181000_*.sql`). Arreglo chico: el mismo aviso con un botón «Recíbelo ahí». Falta confirmar que
la función admite a quien crea productos.

## Quedaron cerca

- Completar fotos: sin «guardar y siguiente»; unos 6 clics por prenda.
- Cuadrar con el banco: un clic por cada depósito que ya cuadra, aunque el sistema los cuenta.
- Plan de campaña → Mis compras: los pedidos no llegan a quien compra; se vuelven a escribir.
- Frescura «Retirar del piso»: navega a Existencias sin la acción puesta y sin vuelta.
- Gasto con factura: el RUC reconocido no propone la categoría del último gasto.

## Fallas chicas vistas de paso

- Conteo ▸ Revisar: tras «Confirmar», el foco cae en «Volver a contar» de la misma fila (`components/conteo/RevisarConteo.tsx:171-176`).
- Cierre de mes ▸ «Resolver» puede abrir la sede de la sesión y no la que se está cerrando (inferido, `lib/cierre-reglas.ts:477-504`).
- «Pagar lo que falta» es texto sin enlace (`components/compras/DetalleComprador.tsx:117-122`).

## Revisado y no tocar

Vender (armar y cobrar), Cambios, abrir y cerrar caja, Bajar al piso, recibir un traslado, abrir y contar un conteo, Mis compras (anotar),
Vitrina, nuevo descuento, gasto rápido de caja, Inicio de tienda.
