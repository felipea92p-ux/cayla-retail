> Anexo de diseño de ADR-0362 (sesión «Flujo de órdenes de compra», 2026-10-07/08). Salida de un workflow de agentes: **las
> decisiones de Felipe en `docs/adr/0362-ordenes-de-compra-y-despacho-a-sedes.md` mandan sobre este texto** donde choquen.
> Mapa de módulos de punta a punta (final) y los dos mapas que compitieron, con sus juicios. Corrección verificada: el módulo existente se llama «Facturas de compra», no «Facturas de proveedor».

**Mapa final de módulos: compras, de la orden a la rendición**

Se agregan solo **2 entradas nuevas al menú**: Compras ▸ Órdenes de compra y Finanzas ▸ Fondos por rendir. Además se suma **una pantalla nueva dentro de Producción**, Órdenes de insumos. No se retira ningún módulo. Envíos, «Nos debe», «Tu fondo», gastos del viaje y dañadas son acciones dentro de pantallas que ya existen (ADR-0306).

## (A) Entradas del menú

| Grupo ▸ nombre en pantalla | Clave | Estado | Quién la usa | Qué se hace ahí |
|---|---|---|---|---|
| Compras ▸ **Órdenes de compra** | `ordenes_compra` | **Nueva**, al principio solo la ve el líder | Encargada de tienda (ve las de su sede), encargada general (ve todas) | Crear la orden (`OC-000001`). Pasarla a factura, boleta, nota de venta o «sin comprobante», con el precio sugerido. Pagar desde el fondo. Pestaña **«Por enviar»**, que solo aparece si hay compras hechas en Lima. Arriba de la lista, la tarjeta **«Tu fondo: te quedan S/ X»** con «+ Gasto del viaje» y «Rendir» |
| Compras ▸ Facturas de proveedor | `facturas_compra` | Existe, **sin cambios** (el nombre «Comprobantes» es solo de Ventas, PL-50) | Encargadas, líder, contador | Ver todos los comprobantes. Un filtro «Sin comprobante» para el contador. Un comprobante nuevo se registra desde la orden de compra, no desde aquí |
| Compras ▸ Proveedores | `proveedores` | Existe, gana una sección | Encargadas, líder | Sección **«Nos debe»**: faltantes por reponer, saldo a favor y prendas devueltas. Se cierra con «Llegó la reposición», «Depositó» o «Descontar del próximo pago» |
| Compras ▸ Por pagar | `por_pagar` | Existe, cambia | Administración, líder | Solo compras a crédito. El saldo a favor se descuenta solo. Se retira «la parte de mi tienda» |
| Compras ▸ Notas de crédito / Plan de campaña | sin cambio | Existen | Líder | Sin cambios |
| Inventario ▸ **Recibir mercadería** | `recibir` | Existe, **una sola puerta** (ADR-0361) | La sede que recibe | Contar todo junto por guía. Ver y corregir el costo. Elegir la causa de cada faltante y el motivo de cada sobrante. Marcar las dañadas. **Contador «guías por recibir»** en el menú y en Inicio |
| Inventario ▸ Existencias (cola Dañadas) | `existencias` | Existe | La sede | Arreglar, liquidar, regalar, desechar o **devolver al proveedor** |
| Producción ▸ Abastecimiento ▸ **Órdenes de insumos** | `produccion` | **Pantalla nueva** dentro del módulo que ya existe | Quien compra para el Taller | Orden `OI-000001` con insumo y unidad. Solo proveedores del Taller. Misma tarjeta «Tu fondo» |
| Producción ▸ Abastecimiento ▸ Facturas de insumos / Recibir / Por pagar | `produccion` | Existen | Taller | Lo mismo que en tienda: quien creó la orden no la recibe |
| Finanzas ▸ **Fondos por rendir** | `fondos` | **Nueva**, al principio solo la ve el líder | Líder (o a quien él se lo dé) | Entregar plata, aprobar rendiciones, tablero de control |
| Finanzas ▸ Gastos / Cuentas y dinero | sin cambio | Existen | Líder, contador | Solo se leen: los gastos del viaje aparecen atados a su rendición, y cada fondo aparece como una cuenta «por rendir» con nombre |

Compras queda con 6 entradas cuando Recibir pasa a Inventario. Ese es el tope de `menu.test.ts`, así que **la orden de compra entra después de ADR-0361**.

## (B) El proceso de punta a punta

**Antes de comprar (vale para todos)**
1. **Líder**, en Finanzas ▸ Fondos: «Entregar plata». Elige persona, monto, de dónde sale (banco o caja fuerte) y para qué es (tienda o Taller). Con eso se abre su rendición.
2. **Compradora**, en su tarjeta «Tu fondo»: toca «Lo recibí». **No la traba**: si se olvida, igual puede pagar, y al líder le aparece «sin confirmar».

**Compra de tienda por la encargada de tienda (llega directo a su sede)**
3. **Encargada**, en Compras ▸ Órdenes de compra: elige proveedor, y en cada línea categoría + marca, cantidad y precio. El destino ya viene puesto: su sede. Si el proveedor nos debe algo, se ve al elegirlo: «Te debe 2 polos · S/ 50».
4. **Encargada**, en la misma orden: «Registrar comprobante» con los datos de la orden ya puestos. Ajusta al papel, pone el precio sugerido y elige «Pagar desde mi fondo»: el saldo baja en el mismo paso. Si no hay papel, queda «Sin comprobante», y eso no bloquea nada.
5. La guía hacia su sede **se crea sola**.
6. **Otra persona de la sede**, en Inventario ▸ Recibir mercadería: cuenta, corrige el costo y cierra. Quien creó la orden nunca puede recibirla.
7. **La misma sede**: si hubo dañadas, al cerrar sale «Quedaron 3 dañadas → Ver qué hacer», que lleva a Existencias ▸ Dañadas.
8. Lo que falta o se devuelve al proveedor queda solo en Proveedores ▸ «Nos debe».

**Compra de tienda por la encargada general (compra en Lima y envía)**
9. **Encargada general**, en Órdenes de compra: hace lo mismo que en los pasos 3 y 4, indicando cuánto va a cada sede.
10. **Encargada general**, en la pestaña «Por enviar»: separa el fardo (que puede traer varias órdenes y varios proveedores) y toca «Enviar a TRU». Se crea **una guía por sede**, y el número de guía es opcional. Lo que está en Lima nunca cuenta como stock.
11. **Encargada general**, en «+ Gasto del viaje»: anota flete, carretilla y comida con foto o «sin recibo». Sale de su fondo. Se ata a la rendición y, si quiere, a una guía, porque un flete puede servir a varias órdenes. **Nunca entra al costo de la prenda.**
12. **Cada sede** recibe su guía como en los pasos 6 y 7. Si una línea es una reposición, se ve marcada: «el proveedor nos la debía».

**Compra del Taller**
13. **Quien compra para el Taller**, en Producción ▸ Órdenes de insumos: orden `OI-`, insumo con unidad. El destino es siempre el Taller. Comprobante y pago desde su fondo, igual que en el paso 4.
14. **Otra persona del Taller**, en Producción ▸ Recibir.

**Pagos y cierre (todos)**
15. **Administración**, en Por pagar: paga el crédito desde la cuenta de la empresa, y el saldo a favor se descuenta solo.
16. **Proveedores ▸ Nos debe**: cada deuda se cierra con reposición, depósito o descuento.
17. **Compradora**, en «Tu fondo» ▸ «Rendir»: ve entregado − pagado a proveedores − gastos del viaje = **debería tener S/ 420**. Escribe cuánto tiene en la mano y devuelve el sobrante a la caja fuerte de su sede o al banco. Quien recibe esa plata la confirma. Si la cuenta no da, escribe el motivo.
18. **Líder**, en Fondos: aprueba. Nunca aprueba la dueña del fondo.

## (C) El módulo de fondos

- **Dónde vive:** Finanzas ▸ Fondos por rendir (`fondos`). Se arma con el kit de Finanzas (ADR-0195) y se compara contra su spike.
  - La compradora **no necesita ese módulo ni Finanzas**: ve su fondo como tarjeta donde compra (Órdenes de compra o de insumos) y en Inicio.
- **Cómo se guarda:**
  - Cada persona tiene su propio fondo: la cuenta «por rendir» pasa a llevar el nombre de su dueña, y la de hoy queda como el fondo del líder.
  - Dos movimientos nuevos: «entrega de fondo» (banco o caja fuerte → fondo) y «devolución de fondo» (al revés).
  - Cada entrega abre una rendición, y hay **una sola rendición abierta por persona**.
  - El saldo nunca se guarda: se calcula.
  - Un error no se borra: se anula con motivo.
- **Quién entrega:** el líder, o a quien él se lo dé con el módulo. Siempre desde una cuenta de la empresa. **Nadie se entrega plata a sí mismo.**
- **Quién gasta:** solo la dueña.
  - Al pagar, se comparan dos cosas: **la cuenta con la que entró** y **el nombre elegido en el combo Responsable**. Las dos tienen que ser de ella.
  - Una terminal (sin persona) nunca gasta de un fondo.
  - La misma doble comparación vale para «quien crea la orden ≠ quien la recibe»: así nadie esquiva la regla cambiando el combo.
- **Cómo rinde y devuelve:** paso 17. Cerrada, la rendición no se edita.
- **Lo que controla el líder** (cifras arriba y una fila por persona; cada alerta tiene su «¿Por qué?» que abre la lista que la explica):
  - Tiene en mano, entregado, gastado.
  - Días con la rendición abierta: `Chip` ámbar a los 7 días, rojo a los 15.
  - Gastos sin recibo, en soles y en %.
  - Órdenes «sin comprobante» pagadas con el fondo.
  - Diferencias de rendiciones pasadas, sumadas.
  - **Por cada orden: pagado / recibido valorizado / nos debe / sin explicar.** Esta es la pregunta central contra el fraude. Junto, el precio del comprobante al lado del que puso la sede.
  - Gasto del viaje por cada sol comprado.
  - Pagos al mismo proveedor el mismo día (una compra partida).
  - El mismo proveedor con faltantes repetidos para la misma compradora.
  - Una cifra con el **total que nos deben los proveedores**, que lleva a la lista.
  - Fondos «sin confirmar».

## (D) Qué cambia o se retira

- **Recibir:** pasan a una sola puerta en Inventario y se quita la entrada de Compras (`menu.ts:360`, `modulos.ts:80`, ADR-0361). **Todo el que recibe ve los precios** (decisión 18): hay que soltar el candado de `recibir/page.tsx:41-47`, que hoy pide `verDineroCompras`.
- **Por pagar:** se retira «la parte de mi tienda» (ADR-0184 → decisión 16).
- **El fondo:** deja de alcanzar solo al líder (`fn_cuenta_sellada:138`), y la cuenta única «Efectivo entregado al líder» pasa a ser el fondo de la persona líder.
- **Gastos:** la dueña de un fondo registra sus gastos del viaje **sin el módulo Gastos**. Su permiso es ser la dueña del fondo.
- **Facturas de proveedor y Facturas de insumos:** se quedan con su nombre y su clave. Ningún rol pierde acceso.
- **Recordatorio para el desarrollo:** por las reglas vigentes, Órdenes de compra se usará en Gamarra y entra a la **prueba obligatoria a 375 px** (PL-105). También necesita guía de foco, `/formidable` y `/chaos` en cada pantalla que guarda.

## (E) Dudas para Felipe

1. **Si a la compradora no le alcanza el fondo frente al proveedor.**
   - (a) Se bloquea el pago.
   - (b) Paga de su bolsillo y queda «CAYLA te debe S/ X», que se le devuelve al rendir **solo con comprobante o foto**, con un tope por rendición.
   - **Recomiendo la (b) con tope.** Con la (a), la compradora se queda trabada en el puesto, y sin recibo nadie le devuelve nada.
2. **Quién aprueba la rendición del fondo del propio líder.**
   - (a) El Admin (ADR-0178).
   - (b) Se cierra sola y queda registrada.
   - **Recomiendo la (a).** La regla «nadie aprueba lo suyo» no tendría excepción.
3. **Precios en el Taller.** Hoy el dinero del Taller (`verDinero`) es solo del líder y no se puede dar a otro rol.
   - (a) Quien crea una orden de insumos ve los precios de **sus** órdenes, sin ver el dinero del resto del Taller.
   - (b) Solo compra el líder.
   - **Recomiendo la (a).** Si no, la compra del Taller con fondo asignado no funciona.
4. **Quién puede entregar fondos.**
   - (a) Solo el líder.
   - (b) El módulo `fondos`, que el líder puede dar a administración, siempre con «nadie se entrega a sí mismo» y «quien entrega no aprueba esa rendición».
   - **Recomiendo la (b)**, aunque nazca solo para el líder.
   - Lo que **no** es duda de negocio sino del contador: si el fondo va a la cuenta contable 101 o a la 1413. No bloquea programar.

Archivos de referencia:
- `/Users/claudiapereyra/Proyectos /cayla-retail/.claude/worktrees/determined-thompson-f7b8d8/docs/adr/0362-ordenes-de-compra-y-despacho-a-sedes.md`
- `/Users/claudiapereyra/Proyectos /cayla-retail/.claude/worktrees/determined-thompson-f7b8d8/apps/web/lib/menu.ts`
- `/Users/claudiapereyra/Proyectos /cayla-retail/.claude/worktrees/determined-thompson-f7b8d8/apps/web/lib/modulos.ts`
- `/Users/claudiapereyra/Proyectos /cayla-retail/.claude/worktrees/determined-thompson-f7b8d8/supabase/migrations/20260925150000_finanzas_cuenta_sellada.sql`

---

# Mapas que compitieron

## por-modulo
# Mapa A: el proceso de compras sobre los módulos que ya existen

**En una frase:** se agregan 2 entradas al menú, Compras ▸ Órdenes de compra y Finanzas ▸ Fondos por rendir. La OC del Taller entra en Producción, que ya es un solo módulo. Todo lo demás (envíos, deudas del proveedor, gastos del viaje, rendición, dañadas) son acciones dentro de pantallas que ya existen (ADR-0306).

## 1. Entradas del menú

| Grupo ▸ nombre en pantalla | Clave | ¿Nueva? | Quién la usa | Qué se hace ahí |
|---|---|---|---|---|
| Compras ▸ **Órdenes de compra** | `ordenes_compra` | **Nueva** (nace solo para el líder) | Encargada de tienda (ve las de su sede), encargada general (ve todas), líder | Crear la OC (`OC-000001`). Pasarla a comprobante. Pestaña **Envíos**: repartir lo que llegó a Lima en guías, una por sede. Tarjeta **Mi fondo** con «+ Gasto del viaje» y «Rendir» |
| Compras ▸ Comprobantes de proveedor (hoy «Facturas de proveedor») | `facturas_compra` | Existe, cambia de nombre | Encargadas, líder | Lista de factura, boleta y nota de venta. Pestaña «Sin comprobante» para el contador |
| Compras ▸ Proveedores | `proveedores` | Existe | Encargadas, líder | Ficha con **deudas del proveedor** (faltantes por reponer, saldo a favor) y dañadas devueltas |
| Compras ▸ Por pagar | `por_pagar` | Existe, pierde la «parte por tienda» | Encargadas, líder | Solo compras a crédito. Al pagar se descuenta el saldo a favor |
| Compras ▸ Notas de crédito / Plan de campaña | sin cambio | Existen | Líder | Sin cambios |
| Inventario ▸ **Recibir mercadería** | `recibir` | Existe, **una sola puerta** (ADR-0361) | Sede que recibe | Contar por guía, corregir el costo, marcar faltantes, sobrantes y dañadas |
| Inventario ▸ Existencias | `existencias` | Existe | Sede | Lista de dañadas (`?danados=1`) con sus salidas: liquidar, regalar, desechar o **devolver al proveedor** |
| Producción ▸ Abastecimiento ▸ **Órdenes de compra** | `produccion` | Entrada nueva, **el mismo módulo** | Quien compra para el Taller, líder | OC de insumos con su unidad (`OCT-000001`), con su Mi fondo |
| Producción ▸ Abastecimiento ▸ Recibir / Comprobantes de insumos / Por pagar | `produccion` | Existen («Facturas de insumos» cambia de nombre) | Taller | Recibir lo de su OC |
| Finanzas ▸ **Fondos por rendir** | `fondos` | **Nueva** (nace solo para el líder) | Líder, o quien él delegue | Entregar plata, aprobar rendiciones, tablero antifraude |
| Finanzas ▸ Cuentas y dinero / Gastos | sin cambio | Existen | Líder | Se ven ahí los movimientos de fondo. Los gastos del viaje aparecen marcados con su OC |

## 2. Recorrido de punta a punta

**Antes de comprar**
1. **Entregar el fondo.** El líder entra a Finanzas ▸ Fondos por rendir y usa «Entregar plata»: S/ 3 000 a María, desde el banco o la caja fuerte, con un ámbito (tienda o Taller). Esto abre su **rendición**.

**OC de una encargada de tienda (llega directo a su sede)**

2. **Crear la OC.** En Compras ▸ Órdenes de compra elige proveedor, y para cada línea categoría + marca, cantidad, precio y descuento. La sede de destino es la suya, fija. Al elegir el proveedor, la pantalla avisa si ese proveedor nos debe algo («Te debe 2 polos · S/ 50»).
3. **Pasar a comprobante.** «Registrar comprobante» (factura, boleta o nota de venta) precarga la OC. Se ajustan cantidad y precio al papel y se pone el **precio sugerido**. Si es al contado, se elige «Pagar desde mi fondo» y el saldo baja en el mismo paso. Si no hay papel, queda «Sin comprobante», y eso no bloquea.
4. **Envío.** Como compra para su propia sede, la guía se crea sola al guardar, sin pasar por Lima.
5. **Recepción.** Va al paso 9.

**OC de la encargada general (compra en Lima)**

6. Hace lo mismo que en los pasos 2 y 3. La OC dice cuánto va a cada sede.
7. **Reparto.** En la pestaña Envíos, «Llegó a Lima» abre el fardo para separar. Un fardo puede traer varias OC y varios proveedores. Lima no es stock.
8. **Despacho.** «Enviar a TRU» crea una guía por sede (número opcional). Flete y carretilla se registran con «+ Gasto del viaje», que sale de su fondo.

**Recepción en la sede (Inventario ▸ Recibir, de ADR-0361)**

9. La sede cuenta todo junto por guía, ve y corrige el costo, y cierra. Quien creó la OC no puede recibirla.
   - **Faltante:** la sede elige la causa y nace una deuda del proveedor «por reponer».
   - **Sobrante:** la sede marca el motivo (regalo, se cobra aparte, se descuenta o cobra en la próxima compra).
   - **Dañada:** «con solución pendiente» la manda a cuarentena y no suma stock. «Sin solución» lleva a Existencias ▸ Dañadas.
10. **Dañadas.** En Existencias ▸ Dañadas se elige: liquidar, regalar, desechar o **devolver al proveedor**. Si se devuelve al proveedor, nace una deuda en su ficha.

**Deudas del proveedor (Compras ▸ Proveedores)**

11. Cada deuda se cierra con un toque, de una de tres formas:
    - «Llegó la reposición»: se cuenta en la próxima recepción.
    - «Depositó»: entra al banco.
    - «Pasar a saldo a favor»: Por pagar la descuenta del próximo pago.

**Pagos y gastos**

12. **Crédito.** Se paga desde Compras ▸ Por pagar, con el fondo o con la cuenta de la empresa.
13. **Gastos del viaje.** Comida y movilidad se registran en la tarjeta Mi fondo de la OC, con foto del recibo o «sin recibo». Van aparte y nunca al costo de la prenda.

**Rendición**

14. María toca «Rendir» y ve la cuenta: entregado − pagos a proveedores − gastos = **debería quedar S/ 420**. Declara cuánto tiene en mano. El sobrante lo devuelve a la caja fuerte de su sede o al banco. Si hay diferencia, escribe el motivo.
15. **Aprobación.** El líder la aprueba en Fondos por rendir. Nunca la aprueba la dueña del fondo.

**OC del Taller**

16. Es el mismo recorrido de los pasos 1 a 3 en Producción ▸ Abastecimiento ▸ Órdenes de compra: correlativo `OCT-`, solo proveedores del Taller, insumo con su unidad, destino siempre el Taller.
17. Se recibe en Producción ▸ Recibir y se rinde igual que en los pasos 14 y 15, con el fondo de ámbito «Taller».

## 3. Módulo de fondos

**Dónde vive.** Finanzas ▸ Fondos por rendir, clave `fondos`.
- **Base de datos:**
  - `cuentas_dinero.persona_id` crea una cuenta `por_rendir` por persona. Se quita el índice único `:99`, y la fila «Efectivo entregado al líder» pasa a ser el fondo del líder.
  - Dos tipos nuevos de `movimientos_dinero`: `entrega_fondo` (banco o caja fuerte → fondo) y `devolucion_fondo` (al revés).
  - Una tabla `rendiciones_fondo` que solo agrega filas: abierta → rendida → aprobada.
  - `gastos` y `compra_pagos` llevan `rendicion_id` y `orden_compra_id`.
- **El saldo se calcula desde el libro, nunca se guarda.**

**Quién entrega el monto.** El líder, o quien él delegue con el módulo, siempre desde una cuenta de la empresa. Quien entrega no puede entregarse a sí misma.

**Cómo lo ve la persona.** **No necesita el módulo.** Ve su tarjeta **Mi fondo** dentro de su OC y en Inicio. La tarjeta muestra cuánto le dieron, en qué se fue (prendas / viaje) y cuánto le queda. Su fondo solo lo mueve ella y el líder (`fn_cuenta_sellada:138`, comparando con `fn_actor_persona_id(false)`).

**Cómo rinde y devuelve.** Paso 14: cuenta lo que tiene en mano, devuelve el sobrante y escribe el motivo si hay diferencia. La rendición se cierra con la aprobación del líder.
- Decido que el fondo **no baja de cero**: lo que pague de su bolsillo queda como «te debemos» y se le reembolsa al rendir.

**Qué ve el líder** (cifras con `TarjetaCifra`, tabla por persona):
- Saldo en mano de cada persona.
- **Días con la rendición abierta**: a los 15 días se pone en ámbar.
- **Gastos sin recibo**: monto y % del fondo.
- **Compras sin comprobante** pagadas con el fondo.
- **Diferencias** de cada rendición y su total acumulado por persona.
- Gasto del viaje sobre el valor comprado («S/ 0.18 por cada sol»).
- Proveedores con faltantes repetidos comprados por la misma persona.
- Un «¿Por qué?» en cada alerta, con la lista que la explica.

## 4. Qué cambia en los módulos actuales

- **Cambian de nombre** (las claves no se tocan): «Facturas de proveedor» pasa a «Comprobantes de proveedor» y «Facturas de insumos» pasa a «Comprobantes de insumos».
- **Se fusionan:** las dos puertas de Recibir de tienda (`menu.ts:320` y `:360`) quedan en una sola en Inventario, y `modulos.ts:80` pasa a grupo Inventario (ADR-0361).
- **Se retira:**
  - La «parte de mi tienda» de Por pagar (ADR-0184, reemplazado por la decisión 16).
  - `fn_gestora_con_parte` para las compras que vienen de una OC.
- **Se conserva:** Por pagar, solo para compras a crédito.
- **Se reinterpreta:** la cuenta única `por_rendir` pasa a ser el fondo del líder. El cierre de caja con destino `lider` puede apuntar al fondo de una persona con nombre (opcional).

## Decisiones de plata que espero de Felipe

1. **Tipos nuevos de movimiento de dinero.** Crear `entrega_fondo` y `devolucion_fondo`, y que la dueña del fondo pueda pagar con él (hoy solo el líder mueve el `por_rendir`).
2. **El fondo no baja de cero.** Lo que la compradora pague de su bolsillo queda como «te debemos» y se reembolsa al rendir.
3. **Gastos del viaje sin el módulo Gastos.** Hoy `registrarGastos` exige el módulo Gastos; propongo que la dueña del fondo registre sus gastos del viaje sin él.
4. **Precios de la OC del Taller.** `verDinero` no se puede delegar. Propongo que quien crea la OC del Taller vea los precios de su propia OC sin recibir `verDinero` completo.

**Para revisar:**
- `/Users/claudiapereyra/Proyectos /cayla-retail/.claude/worktrees/determined-thompson-f7b8d8/docs/adr/0362-ordenes-de-compra-y-despacho-a-sedes.md`
- `/Users/claudiapereyra/Proyectos /cayla-retail/.claude/worktrees/determined-thompson-f7b8d8/apps/web/lib/menu.ts`
- `/Users/claudiapereyra/Proyectos /cayla-retail/.claude/worktrees/determined-thompson-f7b8d8/apps/web/lib/modulos.ts`

## por-persona
# Mapa B: los módulos ordenados por quién trabaja en cada uno

Cada persona tiene una sola casa en el menú: la encargada que compra en Compras, la sede que recibe en Inventario, el Taller en Producción y el líder en Finanzas. Lo demás son acciones dentro de esas pantallas, así que no se dan de alta como módulos (ADR-0306).

## 1. Entradas del menú

| Grupo ▸ nombre en pantalla | Clave | ¿Nueva o existe? | Quién la usa | Qué se hace ahí |
|---|---|---|---|---|
| Compras ▸ **Órdenes de compra** | `ordenes_compra` | Nueva, nace solo para el líder | Encargada de tienda (ve las de su sede) y encargada general (ve todas) | Crear la orden con número `OC-000001`, pasarla a comprobante, poner el precio sugerido y registrar los gastos del viaje. La pestaña «Por enviar» arma una guía por sede (solo aparece si hay compras de Lima). Arriba se ve la tarjeta **«Tu fondo: te quedan S/ X»** con el botón «Rendir» |
| Compras ▸ Proveedores | `proveedores` | Existe | Encargadas y líder | En la ficha, la sección nueva **«Nos debe»**: faltantes por reponer, saldo a favor y prendas devueltas. Se cierra con «Llegó la reposición», «Depositó» o «Descontar del próximo pago» |
| Compras ▸ Por pagar | `por_pagar` | Existe; absorbe Notas de crédito | Administración o líder | Pagar el crédito desde la cuenta de la empresa. El saldo a favor se descuenta solo. Las notas de crédito pasan a ser una pestaña de esta pantalla |
| Compras ▸ Plan de campaña | `plan_compra` | Existe | Líder | Sin cambios |
| Inventario ▸ **Recibir mercadería** | `recibir` | Existe, se mueve a Inventario (ADR-0361) | La sede | Contar todo junto por guía, corregir el costo, elegir la causa de cada faltante y el motivo de cada sobrante, y marcar las dañadas |
| Inventario ▸ Existencias (cola «Dañadas») | `existencias` | Existe | La sede | Prenda en cuarentena: arreglar, liquidar, regalar, desechar o devolver al proveedor |
| Producción ▸ Abastecimiento ▸ **Órdenes de insumos** | `produccion` | Pantalla nueva dentro del módulo que ya existe | Quien compra para el Taller | Orden con su propio correlativo `OI-000001`, insumo con su unidad y comprobante. Arriba, la misma tarjeta «Tu fondo». Reemplaza a «Facturas de insumos» |
| Producción ▸ Abastecimiento ▸ Recibir / Por pagar / Proveedores | `produccion` | Existen | Taller | Las mismas reglas que en tienda. Quien creó la orden no la recibe |
| Finanzas ▸ **Fondos por rendir** | `fondos` | Nueva, nace solo para el líder | Líder o administración | Entregar plata, revisar los fondos abiertos y aprobar las rendiciones |
| Finanzas ▸ Gastos | `gastos` | Existe | Contador y líder | Ver los gastos del viaje, ya atados a su orden y a su rendición |
| Finanzas ▸ Cuentas y dinero | `cuentas_dinero` | Existe | Líder | Los fondos aparecen como cuentas «por rendir» de cada persona. Aquí solo se leen; se mueven desde Fondos |

## 2. El recorrido de punta a punta

**Compra de una encargada de tienda (llega directo a su sede)**
1. En Finanzas ▸ Fondos, el líder le entrega S/ 1 500. Ella confirma «Lo recibí» en su tarjeta de fondo.
2. En Compras ▸ Órdenes de compra, la encargada crea la OC: proveedor, y en cada línea categoría + marca, cantidad y precio. El destino ya viene puesto: su sede.
3. La encargada paga en el mismo paso, desde su fondo, y pasa la orden a factura, boleta, nota de venta o «sin comprobante». Ahí pone el precio sugerido.
4. La encargada registra en la misma orden los gastos del viaje: flete, carretilla, comida. Salen del fondo y no se suman al costo de la prenda.
5. La mercadería llega a la sede. En Inventario ▸ Recibir mercadería la recibe **otra persona** de la sede, nunca quien creó la orden. Cuenta, corrige el costo, marca los faltantes con su causa, los sobrantes con su motivo y las dañadas.

**Compra de la encargada general (compra en Lima y envía)**
1. La encargada general crea la orden con destino «Lima ▸ repartir». Los pasos 3 y 4 son iguales.
2. En la pestaña «Por enviar» separa por sede y genera **una guía por sede**, con número de guía opcional. En Lima nada cuenta como stock.
3. Cada sede recibe su guía en Recibir mercadería, igual que en el paso 5 de arriba.

**Lo que sale de la recepción**
1. **Faltante**: queda como deuda en Proveedores ▸ «Nos debe». Se cierra con la reposición (se cuenta en la próxima recepción de ese proveedor), con un depósito o con el descuento automático en el próximo pago de Por pagar. Además aparece un aviso cuando se crea la siguiente orden a ese proveedor.
2. **Dañada con arreglo pendiente**: va a la cuarentena de Existencias y no suma stock. **Sin arreglo**: se liquida, se regala, se desecha o se devuelve al proveedor. Devolverla crea su deuda en «Nos debe».
3. **Compra con crédito**: se paga desde Por pagar con la cuenta de la empresa.

**Rendición**
1. La encargada toca «Rendir» en su tarjeta. Ve cuánto le entregaron, cuánto pagó a proveedores, cuánto gastó en el viaje y cuánto debería tener. Escribe cuánto tiene en la mano y lo devuelve a la caja fuerte o al banco.
2. Quien recibe el dinero confirma. Si la cuenta no da cero, se pide un motivo y el líder la aprueba en Fondos.

**Taller**: es el mismo recorrido, en Producción ▸ Órdenes de insumos con su correlativo `OI-`. El destino es siempre el Taller, se recibe en Producción ▸ Recibir y se rinde con la misma tarjeta de fondo.

## 3. El módulo de fondos

- **Dónde vive:** Finanzas ▸ Fondos por rendir, que es solo para el líder. La persona que compra no entra a ese módulo: ve su fondo como una tarjeta en la pantalla donde compra (Órdenes de compra o de insumos). Así no hay que dar acceso a Finanzas para comprar.
- **El modelo:** cada persona tiene un fondo (una cuenta `por_rendir` con su `persona_id`), y cada entrega abre una rendición con su monto, para tienda o para el Taller. Solo puede haber una rendición abierta por persona.
- **Movimientos nuevos:** `entrega_fondo`, del banco o la caja fuerte al fondo, y `devolucion_fondo`, del fondo de vuelta. El libro solo agrega filas y el saldo nunca se guarda: se calcula.
- **Entregar:** el líder elige persona, monto, cuenta de origen y para qué es. El dinero no está disponible hasta que la persona confirma que lo recibió, y la confirmación queda firmada.
- **Gastar:** la dueña del fondo paga comprobantes y gastos desde la orden. Un gasto sin comprobante pide foto o una línea de planilla de movilidad.
- **Rendir y devolver:** la rendición usa la fórmula entregado − pagado − gastado − devuelto = diferencia, siempre calculada desde el libro. Cerrada ya no se edita; un error se anula con su motivo.
- **Lo que ve el líder para controlar** (una fila por persona):
  - entregado, gastado y lo que le queda;
  - **días abierto**, con insignia ámbar a los 7 días y roja a los 15;
  - **gastos sin comprobante** en soles y como porcentaje del total;
  - órdenes que siguen «sin comprobante»;
  - diferencias de rendiciones pasadas, sumadas;
  - pagos al mismo proveedor el mismo día.
- **Candados:**
  - Nadie se entrega plata a sí mismo.
  - Quien entrega no aprueba su propia rendición.
  - Un fondo con saldo no se archiva.

## 4. Lo que cambia en los módulos actuales

- **Facturas de proveedor (`facturas_compra`):** se retira. Su lista pasa a ser la pestaña «Comprobantes» dentro de Órdenes de compra, y `verDineroCompras` pasa a salir de `ordenes_compra`.
- **Notas de crédito (`notas_credito`):** se fusiona con Por pagar como pestaña.
- **Recibir mercadería:** pasa a Inventario con una sola puerta. Se quita la entrada duplicada de Compras (`menu.ts:360`) y cambia el grupo en `modulos.ts:80`, como dice ADR-0361.
- **Facturas de insumos:** cambia de nombre a «Órdenes de insumos».
- **ADR-0184** («cada tienda paga su parte»): se retira; lo reemplaza la decisión 16.
- **La cuenta única de efectivo «por rendir» del líder:** queda como el fondo de la persona líder. Deja de ser una bolsa sin dueño.

## Decisiones que son de Felipe (dinero y permisos)

1. Los movimientos nuevos `entrega_fondo` y `devolucion_fondo`, y si el fondo es la cuenta contable 101 o la 1413.
2. Que la dueña del fondo pueda pagar desde él. Hoy solo el líder mueve el `por_rendir` (`fn_cuenta_sellada`).
3. Si alguien gasta más de lo que tiene en el fondo: o se bloquea, o queda como «CAYLA te debe S/ X» y se le reembolsa al rendir.
4. Que quien compra para el Taller vea los precios de **sus** órdenes. Hoy `verDinero` es solo del líder y no se puede delegar.
5. Retirar los módulos `facturas_compra` y `notas_credito`, y pasarles su acceso a `ordenes_compra` y `por_pagar`.

Para revisarlo: decisiones de Felipe en `/Users/claudiapereyra/Proyectos /cayla-retail/.claude/worktrees/determined-thompson-f7b8d8/docs/adr/0362-ordenes-de-compra-y-despacho-a-sedes.md`; catálogo de módulos y menú en `apps/web/lib/modulos.ts` y `apps/web/lib/menu.ts`.

---

# Juicios

## Juez compradora
**Veredicto:** el Mapa B gana con 8/10 y el Mapa A queda en 6/10. En el B la encargada hace todo desde una sola entrada del menú. En el A hay dos puertas que compiten y el flete queda atado a la orden equivocada.

**Mapa A: 6/10**

Lugares que visita para comprar, pagar, anotar el flete y rendir: entre 1 y 3.
- **Dos puertas para lo mismo.** La OC tiene «Registrar comprobante», pero «Comprobantes de proveedor» sigue en el menú como entrada aparte. En Gamarra, con la boleta en la mano, no sabrá cuál tocar. Si entra por la segunda, la compra queda sin su orden y sin el fondo.
- **El flete va dentro de una OC.** Pero un fardo o una carretilla sirven a 3 órdenes de 3 proveedores. ¿En cuál lo anota? Ahí se pierde, o lo anota dos veces.
- **El crédito la saca a Por pagar**, que es una segunda casa.
- **El menú se pasa del tope.** Hoy Compras tiene 6 hijas (`menu.ts:356-366`) y `TOPE_HIJAS = 6` (`menu.test.ts:256`). Sumar «Órdenes de compra» da 7, salvo que Recibir salga primero (ADR-0361, que no está en `main`).
- **Lo bueno:**
  - El fondo no baja de cero. Lo que ella pone de su bolsillo queda como «te debemos», y eso calza con la realidad de Gamarra.
  - Mi fondo también se ve en Inicio.
  - La guía se crea sola cuando compra para su propia sede.
  - La dueña registra sus gastos del viaje sin el módulo Gastos. Hoy `registrarGastos` exige ese módulo (`modulos.ts:242`).

**Mapa B: 8/10**

Lugares que visita: 1, Compras ▸ Órdenes de compra.
- **Todo en una entrada.** Los comprobantes pasan a ser una pestaña dentro de Órdenes de compra, y la tarjeta «Tu fondo» con «Rendir» queda arriba de la lista. Como el fondo está a nivel de la lista y no de cada orden, el flete compartido tiene dónde ir.
- **La encargada no toca Por pagar.** El crédito lo paga administración.
- **El menú queda corto.** Compras baja a 4 hijas (Plan, Proveedores, Órdenes, Por pagar) y Notas de crédito pasa a ser pestaña de Por pagar.
- **El Taller se entiende mejor.** «Órdenes de insumos» con `OI-` se lee más claro que «OCT-».
- **Hay una alarma escalonada:** ámbar a los 7 días con la rendición abierta y rojo a los 15.
- **Pierde 2 puntos por tres cosas:**
  1. **Un candado peligroso.** «El dinero no está disponible hasta que la persona confirma que lo recibió.» Si olvidó tocar «Lo recibí» y ya está frente al proveedor, no puede pagar: queda trabada a pie de puesto. Mejor que la confirmación no bloquee y que al líder le aparezca «sin confirmar».
  2. **Se contradice.** El paso 4 dice «gastos en la misma orden» y la sección 3 pone la tarjeta arriba de la lista. Hay que dejar una sola versión: la de arriba de la lista.
  3. **El sobregasto queda abierto.** Con «bloquear o reembolsar» sin decidir, la pantalla no puede decir qué pasa cuando no le alcanza.

**Lo que se conserva**
- **Del A:**
  - El fondo no baja de cero.
  - Mi fondo en Inicio.
  - La guía automática cuando compra para su propia sede.
  - El aviso «te debe 2 polos» al elegir el proveedor.
  - Que la dueña registre sus gastos sin el módulo Gastos.
- **Del B:**
  - Una sola puerta, con los comprobantes como pestaña.
  - La tarjeta de fondo a nivel de lista.
  - Por pagar fuera del camino de la encargada.
  - Notas de crédito dentro de Por pagar.
  - Una sola rendición abierta por persona.
  - El nombre «Órdenes de insumos».
  - El semáforo de 7 y 15 días.
  - Los candados: nadie se entrega plata a sí mismo y quien entrega no aprueba.

**Lo que ninguno de los dos resuelve**
- **El celular.** La pantalla de Órdenes de compra se usará a 375 px en Gamarra. Hoy la regla de celular obligatorio (PL-105) solo cubre Vender, Cambios y Devoluciones, así que habría que sumarla.
- **El permiso para pagar desde el fondo.** Hoy `fn_cuenta_sellada` en `supabase/migrations/20260925150000_finanzas_cuenta_sellada.sql:138` rechaza a quien no es líder con «Lo que tiene el líder solo lo mueve el líder». Mientras eso no cambie, ninguno de los dos mapas funciona. Es plata, así que la decide Felipe.

Archivos revisados:
- `/Users/claudiapereyra/Proyectos /cayla-retail/.claude/worktrees/determined-thompson-f7b8d8/apps/web/lib/menu.ts`
- `/Users/claudiapereyra/Proyectos /cayla-retail/.claude/worktrees/determined-thompson-f7b8d8/apps/web/lib/menu.test.ts`
- `/Users/claudiapereyra/Proyectos /cayla-retail/.claude/worktrees/determined-thompson-f7b8d8/apps/web/lib/modulos.ts`
- `/Users/claudiapereyra/Proyectos /cayla-retail/.claude/worktrees/determined-thompson-f7b8d8/supabase/migrations/20260925150000_finanzas_cuenta_sellada.sql`

## Juez sede
**Juicio desde la colaboradora de sede que recibe**

**Mapa A (por módulo): 6/10**
- **A favor:** de los dos, es el que mejor detalla qué pasa al recibir (paso 9). Pide la causa de cada faltante y enumera los motivos de sobrante (regalo, se cobra aparte, se descuenta o cobra en la próxima compra). También deja claro que una prenda dañada «con solución pendiente» no suma stock, y pone un «¿Por qué?» en cada alerta.
- **En contra, encontrarla:** dice «Inventario ▸ Recibir» con una sola puerta, pero no dice cómo se entera la colaboradora de que tiene una guía por recibir. Hoy el único contador que existe en el menú es `trasladosPorAtender` (`apps/web/lib/menu.ts:122` y `:310`), y Recibir no tiene ninguno.
- **En contra, lo dañado:** lo reparte en dos lugares. La prenda «con solución pendiente» va a cuarentena y la «sin solución» va a «Existencias ▸ Dañadas». Pero las dos viven en la misma cola de `prendas_danadas` (ADR-0362 decisiones 23 y 27). Además «Existencias ▸ Dañadas» no es una entrada del menú: la cola solo se abre con `?danados=1`, y hoy solo se llega desde el aviso de Devoluciones (`app/(app)/inventario/page.tsx:46`). Sin un enlace que salga del cierre de la recepción, la colaboradora no la va a encontrar.
- **Ruido:** le explica a la sede la pestaña Envíos y la tarjeta Mi fondo dentro de la OC, que no son suyas.

**Mapa B (por persona): 7/10**
- **A favor:** cada persona tiene una sola casa, y la sede vive en Inventario. Dice en palabras de tienda que recibe «**otra persona** de la sede, nunca quien creó la orden». La pestaña «Por enviar» solo aparece si hubo compras en Lima, así que hay menos ruido. Y en la cola de dañadas pone «arreglar» como salida explícita, que corresponde a `se_arreglo`, al lado de liquidar, regalar, desechar y devolver al proveedor. Eso responde «¿qué hago con esto?» sin tener que traducir nada.
- **En contra:** tiene el mismo hueco que A para encontrar la guía sin buscar. El aviso que propone es para quien crea la siguiente OC al proveedor, no para la sede. Tampoco dice cómo llega la colaboradora a la cola de dañadas después de recibir. Y no cuenta qué ve la sede cuando la guía trae una reposición de un faltante anterior (por ejemplo, «incluye 2 polos que el proveedor nos debía»).

**Hueco que ninguno de los dos ve**
La decisión de ADR-0362 es que «la sede corrige el costo (ve precios)». Pero hoy Recibir deja contar a cualquier colaborador y solo muestra los montos a quien cumple `fn_puede_ver_dinero_de_compras` (`app/(app)/recibir/page.tsx:41-47`). Si la colaboradora no tiene `verDineroCompras`, no puede corregir el costo.
- Mapa B empeora esto: propone que `verDineroCompras` salga de `ordenes_compra`, y la sede no tendría ese módulo.
- Antes de construir, Felipe tiene que decidir quién de la sede corrige el costo: cualquiera, o solo la encargada.

**Qué conservaría**
- **De A:** el detalle del paso 9 (causa de cada faltante, motivo de cada sobrante, cuarentena sin stock) y el «¿Por qué?» en cada alerta.
- **De B:**
  - el orden por persona;
  - «otra persona de la sede recibe»;
  - «arreglar» como salida de la cola;
  - la pestaña que solo aparece cuando hace falta;
  - dejar a la compradora sin acceso a Finanzas.

**Lo que sumaría a los dos, sin dar de alta módulos nuevos (ADR-0306)**
1. Un contador nuevo, por ejemplo `guiasPorRecibir`, en la entrada Inventario ▸ Recibir y en Inicio, igual que el de Traslados.
2. Al cerrar una recepción con prendas dañadas: «Quedaron 3 dañadas → Ver qué hacer», que lleve a `/inventario?danados=1`. Además, un aviso fijo en Existencias mientras quede algo en cuarentena.
3. En la guía, cada línea de reposición marcada como tal.
4. La regla de quién ve y corrige el costo al recibir, decidida por Felipe.

Archivos que revisé:
- `/Users/claudiapereyra/Proyectos /cayla-retail/.claude/worktrees/determined-thompson-f7b8d8/apps/web/lib/menu.ts`
- `/Users/claudiapereyra/Proyectos /cayla-retail/.claude/worktrees/determined-thompson-f7b8d8/apps/web/app/(app)/recibir/page.tsx`
- `/Users/claudiapereyra/Proyectos /cayla-retail/.claude/worktrees/determined-thompson-f7b8d8/apps/web/app/(app)/inventario/page.tsx`
- `/Users/claudiapereyra/Proyectos /cayla-retail/.claude/worktrees/determined-thompson-f7b8d8/docs/adr/0362-ordenes-de-compra-y-despacho-a-sedes.md`

## Juez lider
**Juicio desde el líder: Mapa A 7/10, Mapa B 6/10**

**Mapa A: 7/10**
- **Lo que ve el líder.** Tiene el tablero antifraude más completo. Muestra lo que tiene cada persona, los días con la rendición abierta, los gastos sin recibo (en soles y en %), las compras sin comprobante pagadas con el fondo, las diferencias acumuladas y lo que costó el viaje por cada sol comprado. Agrega dos cruces que B no tiene: «proveedor con faltantes repetidos comprados por la misma persona» y un «¿Por qué?» en cada alerta.
- **Fraude.** Repite la regla 17 en el paso 9: quien crea la orden no la recibe. La dueña del fondo nunca aprueba su propia rendición.
- **Lo que le falta:**
  1. Aceptar que el fondo quede bajo cero («te debemos») es en sí un hueco para el fraude: se reembolsa un gasto de bolsillo que nadie verificó. Si se acepta, tiene que llevar tope y recibo.
  2. Lo que debe cada proveedor vive solo en la ficha de cada uno. No hay una lista de todo lo que nos deben los proveedores.

**Mapa B: 6/10**
- **Tres candados mejores que A:**
  - La persona confirma «Lo recibí» al recibir el fondo y quien recibe la devolución también la confirma. La plata cambia de manos con dos firmas.
  - Una sola rendición abierta por persona.
  - La alerta de «pagos al mismo proveedor el mismo día» detecta una compra partida en varios pagos.
- **Dos problemas:**
  1. «Quien entrega no aprueba su propia rendición» bloquea a Felipe. Hoy el líder entrega y aprueba (`fn_es_lider`, la única cuenta `por_rendir` de `20260925110000…:99,114`), así que con un solo líder ninguna rendición se cerraría. La regla correcta: no aprueba la dueña del fondo, y si el líder rinde su propio fondo, aprueba el Admin (`fn_es_admin`, ADR-0178).
  2. Retira `facturas_compra` y `notas_credito`, lo que cambia permisos en varios módulos a la vez sin ganarle nada al líder en control.

**Hueco de fraude que ninguno cierra: con qué identidad se compara**
La regla 17 dice «sin excepción». Pero toda función que guarda firma con `fn_actor_persona_id(true)`, que es el responsable elegido en el combo (`comment` en su migración, línea 127). Si «quien creó ≠ quien recibe» se compara solo con esa firma, la misma cuenta crea la orden con un nombre y la recibe eligiendo otro en el combo. Hay que exigir las dos cosas:
- que la firma sea distinta;
- que la cuenta (`fn_actor_persona_id(false)` / `auth.uid()`) también sea distinta.

Pasa lo mismo con el fondo. Hoy `fn_cuenta_sellada` (`20260925150000…:138`) solo deja mover el `por_rendir` al líder. Al abrirlo a la dueña del fondo, deben coincidir su cuenta y quien firma. Una terminal no tiene persona (ADR-0162), así que nunca podría gastar de un fondo.

**Lo que tampoco está en ninguno**
Ningún mapa cuadra por cada orden lo pagado contra lo recibido: «pagado desde el fondo S/ 1 000 · recibido valorizado S/ 820 · nos debe S/ 180 · diferencia sin explicar S/ 0». Esa es la pregunta antifraude central del líder, y debería ser la columna principal de la rendición. La sede corrige el costo (decisión 18), así que el líder necesita ver lado a lado el precio del comprobante y el que puso la sede.

**Qué conservaría**
- **De A:**
  - La estructura de módulos: solo 2 entradas nuevas, «Órdenes de compra» y «Fondos por rendir», y la orden del Taller dentro de `produccion` (ADR-0306).
  - El tablero de control completo, con su «¿Por qué?».
  - El cruce de faltantes por compradora y proveedor.
  - El «ámbito» tienda/Taller en cada entrega.
  - Conservar `facturas_compra` cambiándole solo el nombre.
- **De B:**
  - La confirmación con firma al recibir el fondo y al devolverlo.
  - Una rendición abierta por persona.
  - Las insignias a 7 días (ámbar) y 15 días (rojo).
  - La alerta de pagos partidos.
  - La sección «Nos debe» con ese nombre en la ficha del proveedor.
  - Que la persona no necesite el módulo Finanzas: ve su fondo como tarjeta donde compra. Esto lo comparten los dos mapas.
- **Agregar:**
  - La comparación doble de cuenta y firma en «crea ≠ recibe» y en «dueña del fondo».
  - La columna pagado / recibido / nos debe / sin explicar en la rendición.
  - Una cifra arriba en Fondos con el total de lo que nos deben los proveedores, que lleve a la lista.

Decide Felipe: si el fondo puede quedar bajo cero, y si cuando el líder rinde su propio fondo lo aprueba el Admin.

Archivos verificados:
- `/Users/claudiapereyra/Proyectos /cayla-retail/.claude/worktrees/determined-thompson-f7b8d8/docs/adr/0362-ordenes-de-compra-y-despacho-a-sedes.md`
- `/Users/claudiapereyra/Proyectos /cayla-retail/.claude/worktrees/determined-thompson-f7b8d8/supabase/migrations/20260925110000_finanzas_cuentas_y_dinero.sql`
- `/Users/claudiapereyra/Proyectos /cayla-retail/.claude/worktrees/determined-thompson-f7b8d8/supabase/migrations/20260925150000_finanzas_cuenta_sellada.sql`

## Juez reglas
**Veredicto: el Mapa A saca 7/10 y el Mapa B 5/10.** Recomiendo construir sobre el A, sin sus cambios de nombre, y tomar del B cinco ideas de fondos y proveedores. Lo verifiqué en el repo.

**Mapa A: 7/10**

- **Cumple ADR-0306.** Suma 3 entradas al menú y 2 claves nuevas (`ordenes_compra` y `fondos`). La orden de compra del Taller usa `modulo: "produccion"`, así que `modulos.test.ts:399` la acepta sin dar de alta otro módulo. Los envíos, las deudas del proveedor, «Mi fondo» y las dañadas quedan como funciones dentro de pantallas que ya existen. Es correcto.
- **No retira ninguna clave**, así que no toca permisos que ya están en producción. Las migraciones son pocas: dos `insert into retail.modulos` y el esquema del fondo (`cuentas_dinero.persona_id`, dos tipos de movimiento, `rendiciones_fondo`, y `rendicion_id` y `orden_compra_id` en `gastos` y `compra_pagos`).
- **Viola PL-50.** Cambia los nombres a «Comprobantes de proveedor» y «Comprobantes de insumos». Según `menu.ts:348-350`, «Comprobantes» se usa solo en Ventas, por decisión de Felipe del 2026-09-23. Hay que conservar «Facturas de proveedor» y «Facturas de insumos».
- **Dice «Decido que el fondo no baja de cero»**, pero esa decisión es de plata y le toca a Felipe. Lo corrige más abajo, porque la vuelve a listar entre sus decisiones, pero la redacción se contradice.
- **No menciona ADR-0195.** Fondos por rendir vive en Finanzas, así que va con `components/finanzas/kit.tsx` (su `PestanasFin` ya es `<Pestanas>`), con `<CabeceraPantalla>` y comparada contra el spike. La cifra con `TarjetaCifra` sí cumple ADR-0358.

**Mapa B: 5/10**

- **Retira `facturas_compra` y `notas_credito`, y eso choca con dos candados:**
  1. Para pasarle el acceso a `ordenes_compra` y `por_pagar` habría que escribir en `rol_modulos`, y `modulos.test.ts:350` lo prohíbe fuera de la siembra de roles. Además, un módulo nuevo nace solo para el líder. El día del despliegue, todo rol que hoy ve Facturas perdería Compras hasta que el líder lo reasigne a mano.
  2. Hay que reescribir `fn_capacidad_por_modulos(array['facturas_compra'…])` en tres migraciones (`20260923130000:198,203`, `20260923140000:158,172` y `20260923180000:74`), cambiar `modulos.ts:240`, que es de donde sale `verDineroCompras`, y revisar 10 archivos de la web. Es mucha superficie de permisos sobre plata para un rediseño que no lo pide.
- **También choca con PL-50:** propone una pestaña «Comprobantes» dentro de la orden de compra.
- **Cambiar «Facturas de insumos» por «Órdenes de insumos» deja sin lugar las facturas y boletas del Taller.** Faltaría decir que quedan como pestaña.
- **Tampoco menciona ADR-0195.**

**Lo que conservaría del Mapa A**

- La estructura completa: ninguna clave retirada, la orden de compra del Taller dentro de `produccion`, Recibir con una sola puerta en Inventario (ADR-0361) y la parte de ADR-0184 que se retira.
- «Mi fondo» como tarjeta dentro de la orden de compra. Así quien compra no necesita el módulo `fondos`, porque ya ve `ordenes_compra` y el permiso se pregunta a la cuenta, como pide ADR-0161.
- Las alertas antifraude que se tocan para ver «¿Por qué?» (Formidable, ley 6) y la proporción de gasto del viaje por cada sol comprado.
- Las cuatro decisiones de plata que deja abiertas para Felipe.

**Lo que conservaría del Mapa B**

- **«Lo recibí» firmado** por quien recibe el fondo. Es el mejor candado contra el fraude: la entrega no existe hasta que la dueña la confirma.
- **Una sola rendición abierta por persona**, y el candado «quien entrega no aprueba la rendición». Responde a «solo das lo que tienes» (ADR-0178) si `fondos` se delega a alguien que no es líder.
- **La sección «Nos debe»** en la ficha del proveedor, que es lenguaje de tienda, y el aviso cuando se crea la siguiente orden de compra a ese proveedor.
- **El prefijo `OI-`** para el Taller (decisión 28). Distingue mejor que `OCT-` para una colaboradora.
- **El gasto sin comprobante pide foto o línea de planilla de movilidad**, y la alerta de «pagos al mismo proveedor el mismo día».
- **Los días con rendición abierta mostrados con `<Chip>`**: ámbar a los 7 días y rojo a los 15.

**Falta en los dos**

- `verDinero` está en `PERMISOS_SIN_MODULO` (`modulos.ts:251`) y `modulos.test.ts:207` exige que ningún rol que no sea el líder lo reciba. Que quien compra para el Taller vea los precios de su propia orden necesita una regla nueva, preguntada a la orden y no a un módulo, y esa regla es de Felipe.
- Es de Felipe también que la dueña del fondo pueda pagar con él. Hoy `fn_cuenta_sellada:138` solo deja mover la cuenta «por rendir» al líder.

Archivos que verifiqué:
- `/Users/claudiapereyra/Proyectos /cayla-retail/.claude/worktrees/determined-thompson-f7b8d8/apps/web/lib/menu.ts`
- `/Users/claudiapereyra/Proyectos /cayla-retail/.claude/worktrees/determined-thompson-f7b8d8/apps/web/lib/modulos.ts`
- `/Users/claudiapereyra/Proyectos /cayla-retail/.claude/worktrees/determined-thompson-f7b8d8/apps/web/lib/modulos.test.ts`
- `/Users/claudiapereyra/Proyectos /cayla-retail/.claude/worktrees/determined-thompson-f7b8d8/apps/web/components/finanzas/kit.tsx`
- `/Users/claudiapereyra/Proyectos /cayla-retail/.claude/worktrees/determined-thompson-f7b8d8/docs/adr/0362-ordenes-de-compra-y-despacho-a-sedes.md`