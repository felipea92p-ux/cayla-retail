> Anexo de diseño de ADR-0362 (sesión «Flujo de órdenes de compra», 2026-10-07/08). Salida de un workflow de agentes: **las
> decisiones de Felipe en `docs/adr/0362-ordenes-de-compra-y-despacho-a-sedes.md` mandan sobre este texto** donde choquen.
> Casos de faltantes y sobrantes al cerrar una guía, y dos críticas (dinero/SUNAT y tienda). Felipe decidió después: la sede elige la causa y el motivo; el faltante se salda con reposición, depósito o descuento.

# Casuística: cerrar la recepción de una guía en una sede (ADR-0362)

## Principio

**La sede dice qué pasó con las prendas y Compras decide qué pasa con la plata.** Al cerrar, la sede reparte la diferencia de cada línea entre sus causas. Esa diferencia no se guarda en ningún lado, porque se calcula como lo esperado de su fardo menos lo contado. Más tarde, Compras resuelve cada causa con un desenlace.

Para esto hacen falta **dos tablas nuevas que solo aceptan filas nuevas** (nunca se editan ni se borran). Las dos firman con `fn_actor_persona_id(true)`:

- **`retail.recepcion_diferencias`**: la escribe la sede al cerrar.
  - Liga: `fardo_id`, `fardo_linea_id` (va vacía si la prenda no se pidió), `categoria_id`, `marca_id` y `ubicacion_id`.
  - Guarda: `tipo` (`faltante` o `sobrante`), `causa`, `cantidad > 0` y una nota.
  - Candado de la RPC `cerrar_recepcion`, en la misma transacción: por cada línea, lo repartido entre causas suma exactamente lo esperado menos lo contado. Si no cuadra, la recepción no se cierra.
- **`retail.diferencia_resoluciones`**: la escribe Compras.
  - Liga: `diferencia_id`. Guarda: `resolucion`, `cantidad` y una referencia, que puede ser a `compra_notas_credito`, a un comprobante, a una línea de la próxima OC o a un `movimiento`.
  - Lo que falta resolver se calcula: diferencia menos lo resuelto.

**Por qué no reutilizo `compra_item_cierres`:** va por `compra_item_id`, o sea por la variante de un comprobante. La OC nueva va por categoría y marca, y el cierre lo hace la sede antes de que exista una variante. Producción tiene 0 compras, así que el flujo viejo no se migra: queda para lo histórico. Para la nota por faltante, `fn_insertar_nota_credito_compra` pasa a calcular su tope con `recepcion_diferencias` + `diferencia_resoluciones`.

**El monto nunca se guarda.** Se calcula como cantidad × costo neto de la línea de la OC:
- Costo neto = precio × (1 − descuento %).
- En factura con «precios incluyen IGV», ese resultado se divide entre 1.18.
- Mientras no exista el comprobante, el monto es «estimado según la OC».

## Tabla de casos

| # | Caso | Qué ve y hace la sede (un toque) | Registro | Aviso a | Cómo se salda | Monto e IGV |
|---|---|---|---|---|---|---|
| 1 | Faltante del proveedor | «Polos: esperabas 10, contaste 8». Toca **«No vino del proveedor»** | `faltante / proveedor`. No hay movimiento: al stock solo entra lo contado | Compras: «Confecciones X te debe 2 polos (S/ 50)». La sede ve solo las unidades | Compras elige **nota de crédito** (dinero) o **reponer en la próxima entrega** (prendas). Si la nota supera la deuda, el excedente pasa a `proveedor_creditos` y se usa en el próximo pago | Neto sin IGV × 2. En factura, la nota de crédito electrónica del proveedor (tipo 07) baja el crédito fiscal. En boleta o nota de venta solo cambia la plata |
| 2 | Lima separó mal: a TRU le faltan 2 y a AQP le sobran 2 | TRU toca **«Lima lo mandó a otra sede»** y AQP toca **«Era de otra sede»** | TRU: `faltante / separacion`. AQP: `sobrante / separacion`. Lo de AQP entra a su stock donde está, sin traslado | Al responsable de despacho en Lima, solo si una de las dos queda sin pareja | Se cruzan solas por línea de OC y categoría (resolución `compensa_sede`), y la deuda del proveedor queda en cero. Si AQP no lo reporta, se resuelve como el caso 3 | Nada: es un movimiento interno de CAYLA |
| 3 | Pérdida o robo en el transporte | **«Se perdió en el camino»** y una nota | `faltante / transporte` | Compras y el líder | Resolución `asume_cayla` o `reclama_transportista`. Al proveedor se le paga completo | El costo se queda en la factura y la pérdida va a Finanzas como merma. Sobre el IGV, a confirmar con el contador: sin denuncia policial podría haber que devolver ese crédito fiscal (reintegro, art. 22 de la ley del IGV) |
| 4 | Prenda dañada | La cuenta y toca **«Llegó dañada»** | `faltante / danada` (no suma como buena). Entra con un movimiento a cuarentena (`prendas_danadas`), no a lo vendible: lo físico cuadra con el sistema | Compras | **Devolver** (salida en `movimientos` + nota de crédito con motivo `devolucion`), **aceptar con descuento** (nota de crédito parcial) o **asumir** (liquidar) | Igual que el caso 1, a costo neto |
| 5 | Sobrante: regalo | **«Vino de más»**. Si la guía dice regalo, lo marca | `sobrante / proveedor`, resolución `regalo`. Entra con costo 0, sin recalcular el promedio (como `envio_extras.es_regalo`) | Solo a Compras, como dato | No se salda nada | S/ 0. El proveedor debería emitir su comprobante como transferencia gratuita; CAYLA no toma crédito fiscal |
| 6 | Sobrante que el proveedor cobra aparte | **«Vino de más»** | `sobrante / proveedor`, resolución `cobra_aparte`. Entra al stock a costo de la línea | Compras: «Le debes 3 blusas a X (S/ 75), falta su comprobante» | Llega una factura complementaria y se liga a la resolución; entra a Por pagar como siempre | Neto × 3. El crédito fiscal se toma cuando llega esa factura |
| 7 | Sobrante que se cobra o descuenta en la próxima compra | Igual que el 6 | Resolución `cobra_en_proxima`, con referencia a la línea de la próxima OC | Al crear la próxima OC de ese proveedor, sale «Pendiente con X: +3 blusas por pagar / −2 polos por reponer» | Compras la agrega como línea (a precio, o a costo 0 si es reposición). Al recibirse esa OC, la pendiente se salda | Va dentro del comprobante siguiente, con su IGV normal |
| 8 | Sobrante que se devuelve | **«Vino de más»** | Entra a cuarentena y no se vende. Resolución `devolver` + `movimiento` de salida con motivo `devolucion_proveedor` cuando se va | Compras y Lima, para el recojo | Si nunca se facturó, no hay plata de por medio. Si ya se facturó, nota de crédito `devolucion` | Si estaba facturada, la nota de crédito baja el crédito fiscal |
| 9 | Prenda de otra categoría o marca que no se pidió | **«Llegó algo que no se pidió»** y elige su categoría y marca | `sobrante / no_pedida` con `fardo_linea_id` vacío. Si vino en reemplazo de algo, junto con un `faltante / proveedor` de lo pedido | Compras | Se resuelve como 5, 6, 7 u 8. Si es un cambio («mandó blusas en vez de polos»), resolución `sustitucion`, que salda las dos filas y deja la diferencia de precio | Lo pone Compras, porque esa línea no tiene precio en la OC |
| 10 | Llegó, pero la OC o el comprobante no existe o se anuló | La sede recibe igual, sin aviso de bloqueo | Candado: una OC con fardos despachados **no se puede anular** (la RPC lo impide). Sin comprobante, el costo es provisional, el de la OC | Compras: «Recibiste mercadería sin comprobante» | Cuando llega el comprobante, la diferencia de costo se registra como ajuste de costo (lo hace Compras). Si el proveedor anula su factura, se reemplaza por otro comprobante, no se anula la OC | Sin comprobante no hay crédito fiscal todavía |
| 11 | Diferencia mixta en la misma guía | Una pantalla por guía, una fila por línea, y cada diferencia con su causa | Una fila por causa y línea | El aviso agrupa por proveedor: «−2 polos · +1 blusa (regalo)» | Cada fila se salda por su lado. **No se netea automáticamente** un faltante de una categoría contra un sobrante de otra; Compras puede juntarlas en una sola nota o factura | Cada una a su costo neto |

**Cómo queda a la vista la recepción cerrada:** un chip «Cuadró» o «Cerrada con diferencias», seguido de la lista de esas diferencias. Por ejemplo: «−2 polos: no vino del proveedor → por reponer», «+1 blusa: regalo». Todo se lee de las dos tablas.

## Quién decide qué

- **La sede:** cuántas prendas contó, la causa física (no vino, se perdió, dañada, era de otra sede, no se pidió, vino de más) y la nota. **Nunca ve soles.**
- **Compras** (quien tiene el módulo, ADR-0126; cada tienda paga lo suyo, ADR-0184): el desenlace (`nota_credito`, `reponer`, `regalo`, `cobra_aparte`, `cobra_en_proxima`, `devolver`, `sustitucion`, `asume_cayla`), el costo de lo no pedido y la nota de crédito.
- **Avisos:** van calculados desde las dos tablas, no se guardan.
  - Clave nueva en `lib/inicio-avisos.ts`, `diferenciasProveedor`, en el grupo «Compras», con `ocultable: false`.
  - En el Observatorio, como `{tipo: "lista"}`.
  - La RPC de lectura se suma al prefijo de lectura de `espera-reglas.ts`.

## Decisiones de Felipe

1. **¿Quién marca regalo, cobro o devolución de un sobrante?**
   - a) La sede, al cerrar.
   - b) La sede marca solo «vino de más» y Compras decide.
   - c) La sede puede proponer y Compras confirma.
   - **Recomiendo b:** la sede no conoce el trato con el proveedor, y la prenda entra a la venta igual.
2. **Faltante del proveedor: ¿qué es lo predeterminado?**
   - a) Siempre nota de crédito.
   - b) Siempre reponer en la próxima entrega.
   - c) Compras elige en cada caso.
   - **Recomiendo c**, sugiriendo «reponer» si el proveedor tiene una OC abierta.
3. **Lima separó mal (caso 2):**
   - a) La prenda se queda donde llegó y se cruza en el papel.
   - b) Traslado obligatorio a la sede que debía recibirla.
   - **Recomiendo a**: cero viajes, y si una sede la necesita, que la pida con un traslado normal.
4. **Pérdida en el transporte:**
   - a) La asume CAYLA como merma.
   - b) Se le reclama al transportista.
   - c) Según el caso, con nota y una denuncia adjunta.
   - **Recomiendo c**, y confirmar con el contador la regla del IGV.
5. **Dañada y sobrante por devolver:**
   - a) Entran a cuarentena (no se venden).
   - b) Entran a lo vendible y se retiran después.
   - **Recomiendo a**, porque evita vender lo que se va a devolver.
6. **Costo cuando no hay comprobante:**
   - a) Provisional de la OC, ajustado al llegar el comprobante.
   - b) Entra a costo 0 y se corrige después.
   - **Recomiendo a**: así el margen no se dispara mientras tanto.
7. **¿Se netea un faltante contra un sobrante de otra categoría?**
   - a) Nunca automático.
   - b) Automático por proveedor.
   - **Recomiendo a**, con la opción `sustitucion` explícita para cuando sí es un cambio.

---

# Crítica: dinero y SUNAT

**Ataque de dinero y SUNAT al diseño ADR-0362 (casuística de cierre)**

**1. La factura con faltante sí exige nota de crédito electrónica, salvo que el proveedor reponga.**
- **Faltante con factura.** Si el proveedor facturó 10 y entregó 8, CAYLA no puede quedarse con el crédito fiscal de las 2 que no llegaron. Para esas 2 unidades la operación no es real, así que el proveedor tiene que emitir la nota de crédito (tipo 07, motivo 07 «devolución por ítem» o 09 «disminución en el valor»). El ERP ya resta su IGV en `fn_igv_credito_fiscal` (`20260921110000:153-162`). Mientras la nota no llegue, el IGV de la factura entra entero al crédito fiscal del mes. Hace falta un aviso «crédito fiscal en riesgo» que dure hasta que la resolución quede cerrada.
- **Reponer es la única salida sin nota, y el diseño la rompe.** La factura ya cubre las 2 prendas. Pero el caso 7 las hace entrar en la próxima OC «a costo 0». Con eso se pierden los S/ 50 ya facturados y se baja el costo promedio. La reposición tiene que entrar al **costo neto de la línea original**, ligada a ella, y no en el comprobante nuevo.
- **Boleta.** Admite nota de crédito tipo 07. El tope ya da IGV 0, porque `v_tasa = igv/subtotal` (`20260918215000:283`).
- **Nota de venta.** No es comprobante de pago para SUNAT y no tiene nota de crédito electrónica. `fn_insertar_nota_credito_compra` exige `serie_numero` (:229), así que hace falta un documento interno o una resolución `descuento_acordado` sin serie SUNAT.

**2. El tope y los contadores de la nota por faltante no sirven con fardos por sede.**
- La nota por faltante se valida con `compras.cerrado_cantidad`, `recibido_cantidad` y `facturado_cantidad` (:268-279), y con un JOIN a `compra_item_cierres` (:281). Si el cierre pasa a `recepcion_diferencias`, esos contadores no se mueven y la nota se rechaza siempre («cierra primero lo que no llegó»).
- Hay que reescribir el tope para que sume **solo** las causas que paga el proveedor (`proveedor`, `danada`). Si entra `transporte` (caso 3) o `separacion` (caso 2), el proveedor terminaría acreditando una pérdida de CAYLA.
- La regla «una nota por faltante por comprobante y con el comprobante resuelto al 100 %» (:268-279) traba si un comprobante cubre fardos de varias sedes: una sede que tarda en abrir bloquea la nota de las demás.
- Si una OC se parte en varios comprobantes, falta la regla que diga a qué comprobante le toca cada diferencia, porque la diferencia va por línea de OC y no por `compra_item`.
- El tope suma `+1` sol de tolerancia (:284). Con una nota por comprobante está bien; con varias, el error se acumula.

**3. El saldo a favor puede duplicarse.**
- `proveedor_creditos` nace solo del excedente de una nota (:262). Si Compras resuelve el faltante como `reponer` y después registra igual la nota por faltante, el proveedor queda debiendo dos veces: en prendas y en plata.
- Candado necesario en la base: la suma de lo resuelto por diferencia no supera la cantidad, y cada fila de `diferencia_resoluciones` ligada a una nota tiene la nota como **única** (índice único sobre la referencia).
- La sede no escribe dinero, así que por ese lado no se duplica. El riesgo está entre resoluciones.

**4. Costo o deuda inconsistente (principio 2).**
- **Caso 5, regalo:** `recibir_envio` no recalcula el promedio del regalo (`20260930124000:251-253`). Las unidades suben, pero `variantes.costo` no baja, y el inventario queda valorizado en N × promedio que nunca se pagó. Lo correcto es promediar con costo 0.
- **Casos 6 y 7, sobrante cobrado:** la prenda entra con costo y no existe la deuda. El inventario sube sin una cuenta por pagar hasta que llegue el comprobante, y si nunca llega, el costo queda inflado. O la «deuda provisional» se calcula en Por pagar, o el sobrante entra con costo provisional marcado para ajustarse después.
- **Caso 4, «aceptar con descuento»:** la nota baja lo que se debe, pero la prenda sigue en stock a su costo completo. Falta un ajuste de costo que vaya con la nota.
- **Caso 10:** «ajuste de costo» no existe como pieza. `costo_historial` hoy solo nace de `fn_recalcular_costo_variante`, y cuando la prenda ya se vendió el ajuste no tiene sobre qué caer.

**5. ADR-0184: rompe el reparto por tienda.**
- `compra_parte_por_tienda` reparte la factura según `compra_item_destinos`, es decir, lo repartido, no lo recibido (`20260923180100:12-35`).
- **Caso 2 (`compensa_sede`):** TRU paga las 2 prendas que vende AQP. `reasignar_reparto_compra` solo mueve lo pendiente, así que después de recibir no hay arreglo posible. Hace falta que la compensación entre sedes también reasigne la parte de dinero.
- **La nota de crédito no baja la parte de nadie.** `fn_saldo_de_tienda` es «su parte − lo que pagó ella», con tope en el saldo de la factura (`20260923180300:64-68`). Si la nota es por el faltante de TRU, TRU sigue debiendo su parte entera y el descuento se lo lleva la última tienda que paga. La nota tiene que ir atribuida a la sede (`ubicacion_id`) y descontarse de su parte.

**6. ADR-0126 (candado de dinero).**
- La sede no debe poder leer montos. Si `recepcion_diferencias` lleva el costo o tiene una vista que lo junta con la OC, se filtra.
- El monto se calcula solo en una RPC con `fn_puede_registrar_compras()`, a la que se le aplica `fn_aplicar_candado_de_dinero()`. Las dos tablas nuevas no deben tener ninguna columna de dinero.
- La RPC de lectura del aviso de Inicio no puede devolver soles a quien no tenga el módulo.

**7. Casos 3 y 5 ante SUNAT.**
- **Caso 3:** la referencia al art. 22 de la Ley del IGV (reintegro del crédito fiscal por pérdida) está bien planteada. Hay que guardar el sustento (denuncia o informe), no solo la nota, porque sin sustento el reintegro es obligatorio.
- **Caso 5:** la transferencia gratuita va con un comprobante «operación gratuita» del proveedor, y CAYLA no toma crédito fiscal. El costo es 0, como dice el diseño.

**Qué falta antes del ADR:**
- Que la nota de crédito y la reposición se excluyan entre sí (índice único y suma de resueltos ≤ diferencia).
- Que la reposición entre al costo original de la línea.
- Que la nota y la compensación entre sedes se atribuyan a la sede.
- Que el regalo se promedie con costo 0.
- Que la deuda provisional del sobrante se vea en Por pagar.
- Que el tope de la nota cuente solo las causas que paga el proveedor.

---

# Crítica: operación en tienda

# Crítica operativa del diseño de cierre de recepción (ADR-0362)

## Veredicto

El principio está bien: «la sede dice qué pasó con las prendas y Compras decide qué pasa con la plata». La pantalla que propone el diseño no lo cumple. Le pide a la sede elegir entre 7 causas físicas por línea, y 3 de ellas son cosas que la sede no puede saber.

## 1. Lo que la sede no sabe y el diseño le pide

- **«Lima lo mandó a otra sede» y «Era de otra sede» (caso 2).** TRU no sabe adónde fue lo que le falta, y AQP no sabe que lo que le sobra era de TRU. Las dos cosas se deducen cruzando las sedes de la misma guía y la misma línea de la OC. Que la sede lo declare abre otro problema: si una de las dos no lo marca, el caso queda «sin pareja».
- **«Se perdió en el camino» frente a «No vino del proveedor».** La sede solo ve que llegó menos. Si el fardo salió completo de Lima o no, lo sabe Lima, que es quien separó.
- **«Si la guía dice regalo, lo marca» (caso 5).** Contradice la recomendación 1b del propio diseño. Además, hoy ya se le pregunta: `components/RecepcionEnvio.tsx:1455` tiene la casilla «Es un regalo» en la recepción de sede, y deshabilita el costo al marcarla (:1466). El ADR debería decir que esa casilla sale de la sede y pasa a Compras. Si no, quedan dos verdades distintas.

## 2. Costo en toques: guía con 2 faltantes y 1 sobrante

**Como está diseñado:**
- 3 filas, y en cada una se abre el selector de causa y se elige: 6 toques.
- «Llegó algo que no se pidió» suma elegir categoría y marca: 2 a 4 toques más.
- El candado «lo repartido entre causas suma exactamente la diferencia» obliga a escribir cantidades por causa cuando hay más de una en la misma línea.
- Más el botón «Cerrar».
- Total: unos 10 a 14 toques. El riesgo es que la recepción no se cierre si la suma no cuadra, y eso va contra la ley 7 de Formidable (perdonar antes que preguntar).

**En la versión simple:**
- Las 3 diferencias ya están calculadas por el conteo, así que no se pregunta nada.
- Se toca «Cerrar» y sale el resumen «−2 polos · −1 blusa · +1 casaca».
- Se confirma.
- Total: 2 toques. Las excepciones («Llegó dañada», «Llegó algo que no se pidió») son opcionales.

## 3. Lo que se infiere sin preguntar

| Señal | Inferencia | Quién la confirma |
|---|---|---|
| Lo contado < lo esperado del fardo | `faltante` sin causa (la causa queda «por aclarar») | Compras o Lima |
| En la misma línea de OC, sobra en AQP y falta en TRU (por categoría y marca, dentro de la misma guía u OC) | Error de separación: se compensa solo y la deuda del proveedor queda en 0 | Nadie, salvo que las cantidades no calcen |
| La suma de todas las sedes de la línea < lo pedido en la OC | Faltante del proveedor | Compras elige nota de crédito o reponer |
| Suma de todas las sedes = lo pedido, pero una sede recibió menos | Pérdida en el traslado de Lima (transporte) | Lima |
| Prenda contada sin línea en la OC | `no_pedida` (la sede solo dice la categoría, que de todos modos necesita para darla de alta) | Compras |

La causa del faltante se deduce comparando la OC, el fardo y lo contado en todas las sedes. Solo cuando se cierra la última sede de esa línea se sabe si el total cuadra con lo pedido. Antes de eso, la diferencia es «por aclarar», y esa etiqueta no es una pregunta para la sede.

## 4. La versión más simple que no pierde información

1. **La sede solo hace dos cosas: contar y, si quiere, marcar una excepción física.** Hay una sola excepción visible en la tarjeta de la prenda: «Llegó dañada», porque cambia dónde entra la prenda (cuarentena y no lo vendible). El sobrante no lleva causa: entra a lo vendible y punto. Lo «no pedido» se registra solo, porque el alta ya obliga a elegir la categoría. Una nota libre, opcional, por guía.
2. **`recepcion_diferencias` sigue sin guardarse.** La diferencia por línea y sede ya se calcula (esperado − contado), así que la sede no escribe filas de diferencia. Lo único que escribe es lo que no se puede calcular: las excepciones (dañadas, con su cantidad) y la nota. Así se cae el candado de «suma exacta», porque no hay nada que repartir a mano.
3. **`diferencia_resoluciones` es lo único con causa y desenlace.** La causa (proveedor, separación, transporte) la propone el sistema según la tabla de arriba, y Compras o Lima la confirman junto con el desenlace. La compensación entre sedes (`compensa_sede`) se escribe sola cuando calza.
4. **La recepción cerrada se ve igual que en el diseño** («Cerrada con diferencias: −2 polos, por aclarar»). Cuando Compras resuelve, el renglón cambia a «→ por reponer». La sede nunca ve soles.
5. **Dañada y devolución** no deberían ir por `prendas_danadas` tal cual. Esa tabla nació de la devolución de un cliente, y el cuarto mecanismo de lo que ya existe dice que su RPC es solo del líder y firma con el patrón viejo. Hace falta un `motivo` de movimiento propio (`recepcion_danada`) y su salida `devolucion_proveedor` firmada con `fn_actor_persona_id(true)`.

## 5. Cambios concretos al ADR

- **Decisión 1:** pasa a ser «b, y además se quita la casilla "Es un regalo" de la sede» (`RecepcionEnvio.tsx:1455`).
- **Decisión 3:** queda en «a», pero inferida. La sede no declara «Lima lo mandó a otra sede».
- **Caso 3 (transporte):** no lo declara la sede. Lo deduce el sistema (suma de todas las sedes = lo pedido) y lo confirma Lima.
- **Candado de suma exacta:** se elimina. El único candado de la sede es contado ≥ 0, más las dañadas ≤ lo contado de esa línea.
- **Aviso nuevo:** a Lima, «Fardos con diferencias por aclarar», en el mismo grupo de avisos que Compras, con `ocultable: false`.

## Lo que verifiqué en el repo

- **Casilla «Es un regalo» en la recepción de sede:** `apps/web/components/RecepcionEnvio.tsx:1455-1467`.
- **Columna `envio_extras.es_regalo`:** `supabase/migrations/20260919120000_*.sql:75`.
- **Motivos de cierre actuales** (`no_llego | danada | error_proveedor`): `apps/web/lib/compras-reglas.ts:256-262`.
- **Estado `devuelta_proveedor` de `prendas_danadas`** (nació de la devolución de un cliente, cuarentena): `supabase/migrations/20260918070000_devolver_proveedor_entra_a_cuarentena.sql:68-80`.
- **Permiso de recepción `fn_puede_operar_ubicacion`:** `supabase/migrations/20260930124000_recibir_envio_costo_atipico.sql:89`.

---

# Lo que ya existe (lectura del repo)

### dinero
## Mecanismos que ya existen para cerrar una recepción (solo lectura, rama actual)

**1. Cerrar una línea a la que le faltó mercadería: `compra_item_cierres` y `cerrar_linea_compra`**
- Tabla: `supabase/migrations/20260918201000_compras_libro_cierres_y_notas_credito.sql:63`. Guarda `compra_item_id`, `cantidad > 0`, `motivo in ('no_llego','danada','error_proveedor')` (:67), nota y usuario. Más adelante se le sumó `ubicacion_id`: el cierre es por sede (ADR-0139). Solo se le agregan filas. La foto de cuánto se cerró queda en `compras.cerrado_cantidad` (:55).
- RPC vigente: `20260919172000_reparto_compra_por_tienda.sql:518`. Valida que la cantidad no pase de lo pendiente de esa sede (lo repartido − lo recibido − lo cerrado) e inserta en :586. La sede es obligatoria si la línea está repartida entre varias.
- Quién puede: `fn_puede_operar_ubicacion(v_ub)`, el permiso del módulo de recepción, no el de dinero (20260923140000:49). No escribe dinero. La nota por faltante se separó en 20260918215000 (ADR-0111 D2, «segunda corrección»).
- ¿Sirve para «el proveedor me debe 2 polos = S/ 50»? Sirve a medias. Registra los **2 polos** con su motivo y su sede. El **monto no se guarda**: «nota pendiente» lo calcula como cantidad cerrada × `costo_unitario` × (1+IGV) (`compras_nota_pendiente` y `notas_credito_tablero`; la regla única está en `20260928200100_nota_pendiente_por_cierre_o_faltante.sql`). Ese cálculo es justo el registro de «me debe». Hoy depende de `compra_items.costo_unitario`, o sea de que la línea esté en un comprobante. Falta: un motivo para «lo repone en la próxima compra» (reponer en prendas en vez de dinero), y que el cierre sea por categoría y no por variante si la orden nueva va por categoría.

**2. Nota de crédito del proveedor: `compra_notas_credito`**
- Tabla: `20260918201000:78`. Campos `serie_numero`, `subtotal`, `igv`, `monto` (check `monto = subtotal + igv`, :95) y `motivo in ('faltante','devolucion','descuento','otro')` (:89). Tiene `cierre_id` opcional y `aplicado` (lo que bajó la deuda).
- Lógica central: `fn_insertar_nota_credito_compra` (`20260918215000:194`). La nota por faltante es **una por comprobante** (índice único parcial en :58), exige el comprobante resuelto al 100 % (recibido + cerrado = facturado) y su tope es lo cerrado a costo + IGV (:268-290). Ninguna suma de notas puede pasar del total. El IGV de la nota se prorratea y resta del crédito fiscal. `aplicado = min(monto, saldo)` y el excedente pasa a `proveedor_creditos`.
- RPC pública: `registrar_nota_credito_compra` (`20260919211000:321`), con `p_destino a_favor|reembolso` en la misma transacción.
- Quién puede: `fn_puede_registrar_notas_credito()` (líder o el módulo Notas de crédito, `20260923140000:170`), más `fn_compra_es_de_mis_tiendas` (ADR-0184, `20260923180200:~320`). Una sede que solo recibe no la ve.
- ¿Sirve? Sí, cuando el proveedor **emite el documento**. «Me debe S/ 50» antes de que llegue la nota es el pendiente calculado del punto 1, no una fila.

**3. Saldo a favor con el proveedor: `proveedor_creditos`**
- Tabla: `20260918215000:96`. Libro append-only con `tipo in ('nota_credito','aplicacion','reembolso')`. Un trigger impide editar o borrar (:139). La RLS de lectura es `fn_puede_registrar_compras()` (:123) y no se puede insertar directo (:126).
- Cómo nace: solo del excedente de una nota (`tipo='nota_credito'`, `nota_credito_id` obligatorio por el check de :110).
- Cómo se aplica: `fn_consumir_saldo_favor` (:166), interna, la llaman las RPC de pago como medio de pago (`tipo='aplicacion'` con `compra_pago_id`). El dinero devuelto entra por `registrar_reembolso_proveedor` (`20260919211000:281`, que pide `fn_puede_pagar_compras()`).
- Saldo: `fn_saldo_favor_proveedor` (:146), calculado y nunca guardado.
- ¿Sirve? Para «se lo descuento en la próxima compra» sí, pero **solo si antes hay una nota de crédito**: el check de origen exige `nota_credito_id`. No existe un `tipo` para «crédito sin documento», es decir, una deuda en prendas o en dinero reconocida sin nota de por medio.

**4. Devolver mercadería al proveedor**
- `20260918070000_devolver_proveedor_entra_a_cuarentena.sql`: `prendas_danadas.estado='devuelta_proveedor'` con `proveedor_id` (:68-78). `resolver_prenda_danada(p_id, p_estado, p_nota, p_proveedor_id)` (:237) escribe un `movimiento` de salida con motivo `cuarentena_devuelta_proveedor` (:271). Solo líder (`fn_es_lider()`, :260). Firma con `personas where auth_user_id`, el patrón viejo, no con `fn_actor_persona_id(true)`.
- Está ligado a la **devolución de un cliente**, no a una compra. La cabecera dice explícitamente que **no** ajusta la deuda contra ninguna factura (:28-40).
- ¿Sirve para «sobraron 3, se las devuelvo»? No tal cual. Sí sirve el patrón: salida en `movimientos` y luego una nota con `motivo='devolucion'` para el dinero.

**5. Reasignar entre sedes: `compra_reasignaciones`**
- Tabla: `20260919172000:93`, con `motivo in ('llego_de_mas','error_de_tienda','otro')` (:104) y sedes distintas (:105). Es inmutable.
- RPC: `reasignar_reparto_compra` (:628). Mueve **solo lo pendiente** de `compra_item_destinos` de una sede a otra (:85-98).
- Quién puede: `fn_puede_registrar_facturas_compra()` + `fn_compra_es_de_mis_tiendas` (`20260923140000:454`, `20260923180200:313`).
- ¿Sirve para «sobraron 3»? No. A pesar del nombre, `llego_de_mas` no admite más de lo facturado: solo cambia de sede lo esperado que aún no se recibió. Sí sirve para «sobraron 3 en TRU porque eran de AQP» **antes** de recibir.

**6. Regalos y mercadería fuera de comprobante (ADR-0076, ADR-0113)**
- `envios` (`20260919120000:45`) y `envio_extras` (:71): `movimiento_id` PK, `envio_id`, `proveedor_id`, `es_regalo`, nota.
- Se escriben en `recibir_envio` (vigente: `20260930124000_recibir_envio_costo_atipico.sql:38`, bucle de extras en :217-260). Proveedor obligatorio. Un regalo con costo distinto de 0 se rechaza (:233). La prenda entra a `movimientos` (motivo `recepcion`) en el lote de ese proveedor, que se abre si no existe. Si no es regalo y trae costo, recalcula el costo promedio; el regalo no lo toca.
- Quién puede: el permiso de recepción (`fn_puede_operar_ubicacion`). No toca dinero.
- ¿Sirve para «sobraron 3»? Sí para dos de los tres desenlaces:
  - **Regalo:** ya existe (`es_regalo=true`).
  - **Se lo cobrará en la próxima compra:** el extra entra con costo, pero **no genera ninguna deuda con el proveedor**. No hay tabla de «por pagar sin comprobante», y `envio_extras` no tiene un motivo distinto de regalo.
  - **Lo devuelvo:** no hay mecanismo (ver el punto 4).

## Resumen para ADR-0362

| Caso | Ya existe | Hueco |
|---|---|---|
| Faltaron 2 (me debe S/ 50) | cierre + pendiente calculado + nota por faltante + saldo a favor | cierre por categoría; motivo «lo repone en mercadería»; crédito sin nota |
| Sobraron, regalo | `envio_extras.es_regalo` | ligarlo a la recepción por guía |
| Sobraron, me lo cobrará | extra con costo | no queda registrada la deuda hacia el proveedor (falta un motivo en extras y su lectura en Por pagar) |
| Sobraron, lo devuelvo | patrón: `movimientos` de salida + nota `devolucion` | no hay RPC «devolver a proveedor desde la compra» |
| Sobraron, eran de otra sede | `reasignar_reparto_compra` (solo lo pendiente) | — |

Para los tres huecos de «sobraron»: lo calculable (el monto del faltante) ya no se guarda y no hay que cambiarlo. Lo que falta guardar es **la decisión** (motivo) por línea o extra. Encaja como columna `motivo` en `envio_extras` (`regalo|cobrara|devolver`) y como un motivo nuevo en `compra_item_cierres` (`repone`). El dinero se escribe solo con la nota, en el módulo Notas de crédito (candado de ADR-0126 / ADR-0161).

### avisos
Encontré lo que pediste. El repo ya tiene casi toda la mitad de dinero de «el proveedor nos debe». Lo que falta es la deuda en prendas y el sobrante, y que eso se aplique en la próxima OC.

## Qué existe hoy (ADR-0111 D2, ya en el esquema)

- **Cierre de faltante por línea:** tabla `retail.compra_item_cierres`, append-only (`supabase/migrations/20260918201000_compras_libro_cierres_y_notas_credito.sql:63`). Los motivos están en `apps/web/lib/compras-reglas.ts:256-262` (`no_llego | danada | error_proveedor`) y se escriben con la RPC `cerrar_linea_compra`. Se leen con `getCierresCompra` (`lib/compras-faltantes.ts:47`).
- **«Esperando nota de crédito»:** la RPC `compras_nota_pendiente` calcula lo cerrado a su costo más IGV (`lib/compras-indicadores.ts:138-151`). El chip ámbar que se ve en Comprobantes y Por pagar lo redacta `lib/nota-pendiente-reglas.ts:1-40`. Ese monto ya es «el proveedor nos debe S/50», pero va **atado a un comprobante** y solo cuenta unidades, no cuenta «2 polos» por categoría.
- **Saldo a favor:** el libro es `proveedor_creditos`, append-only, con tipos `nota_credito | aplicacion | reembolso` (`20260918215000_…saldo_a_favor.sql:96-121`). El saldo se calcula con `fn_saldo_favor_proveedor` y no se guarda. Solo lo lee quien puede registrar compras (RLS `fn_puede_registrar_compras`, en línea con ADR-0126). Se aplica como medio de pago (`saldo_a_favor`) al pagar.
- **Dónde se ve:**
  - En Por pagar, la sección `<SaldosAFavor>` (`app/(app)/compras/por-pagar/page.tsx:193-199`) y el `BotonPagar` con `saldoFavor` (`components/PorPagarLista.tsx:388, 700-704`).
  - En los pasos de un comprobante: «Espera una nota de crédito de …» y «Tienes … a favor» (`lib/por-pagar-reglas.ts:211-215`).
  - En la ficha del proveedor: `<SaldoFavorProveedor>` con su historial (`app/(app)/compras/proveedores/[id]/page.tsx:185`), la cifra «Entregado completo» (`:150`) y la sugerencia «¿Y ahora qué?» (`:65-75`).
- **Avisos:**
  - En Inicio, `lib/inicio-avisos.ts`. El tipo cerrado `ClaveAviso` está en `:21-38` y el aviso `porPagar` (grupo «Compras», solo vencimientos) en `:343-360`. El aviso `recibir` (`:363-380`) es el que hoy le dice a la sede «Mercadería por recibir».
  - En el Observatorio (ADR-0322), `lib/observatorio.ts:234-251`, el aviso `facturas`. El tipo `DetalleAviso` (`lib/observatorio-reglas.ts:340-345`) ya tiene `{ tipo: "lista", filas }`, que sirve para «Confecciones X · 2 polos · S/50».
  - No hay una tabla genérica de avisos: los avisos se **calculan** de las fuentes (`FuentesAvisos`, `:62-104`). Eso calza con «la diferencia se calcula, no se guarda».

## Dónde aparecería cada caso de forma natural

1. **«El proveedor X nos debe 2 polos (S/50)»**
   - En la ficha del proveedor, justo encima o dentro de `SaldoFavorProveedor` (`proveedores/[id]/page.tsx:185`), como una sección «Te debe en prendas».
   - En Por pagar, como un segundo bloque junto a `SaldosAFavor` (`por-pagar/page.tsx:193`).
   - En los pasos del comprobante (`por-pagar-reglas.ts:211`), con un texto paralelo a la nota pendiente.
   - En Inicio, una `ClaveAviso` nueva, por ejemplo `"debeProveedor"`, en el grupo «Compras». Va con `ocultable: false`, porque «es plata que no cuadra» (`:52`).
   - En el Observatorio, un `AvisoObs` con un detalle de tipo `lista`.
2. **«Sobrante por cobrar en la próxima compra»**
   - En los mismos tres lugares, pero con el signo contrario: CAYLA le debe al proveedor, o queda pendiente de descuento.
   - El sobrante marcado como «regalo» no genera deuda. Solo queda en el cierre de la recepción y en el costo (las prendas entran con costo 0 o prorrateado; eso lo decide Felipe).

## Qué falta para que sea visible y accionable

1. **Un libro de diferencias por proveedor**, append-only, ligado al fardo o guía, a la línea de la OC y a su `categoria_id`, con estos campos:
   - `tipo`: faltante o sobrante.
   - `resolucion`: para un faltante, `reponer_en_proxima` (debe prendas) o `nota_credito` (debe dinero). Para un sobrante, `regalo`, `cobrar_en_proxima` o `devolver`.
   - `cantidad` y `monto` (a costo de la línea, con el IGV según el tipo de comprobante).
   - Firma con `fn_actor_persona_id(true)`.

   Hay dos opciones:
   - **Recomendada:** reutilizar `compra_item_cierres` agregándole el sobrante. Así lo de dinero cae en `compra_notas_credito`, que hoy ya alimenta `proveedor_creditos`, y no hay un segundo libro de dinero.
   - **Alternativa:** una tabla nueva `proveedor_diferencias`, con un saldo por proveedor que se calcula como suma del libro, igual que `fn_saldo_favor_proveedor`.
2. **La deuda en prendas no existe hoy.** `proveedor_creditos` solo lleva soles. Hace falta un saldo en unidades por categoría (pedido − entregado − repuesto), calculado y no guardado.
3. **Aplicarla en la próxima OC:** al elegir el proveedor en la OC nueva, mostrar «Te debe 2 polos (S/50) / tienes S/30 por cobrar» con dos acciones:
   - «Agregar como línea a costo 0»: la reposición, que al recibirse salda el faltante.
   - «Agregar como descuento o cargo»: una línea negativa o positiva en el comprobante.
   - Al registrar el comprobante, la aplicación se escribe como `aplicacion` en el libro, igual que hoy pasa con el saldo a favor en el pago.
4. **El cierre de la recepción** (la pantalla de la otra sesión) tiene que escribir esa resolución, y la recepción debe mostrar «Cerrada con faltante de 2 polos → debe reponer», leyendo el libro.
5. **Permisos y alcance:** los montos solo con `fn_puede_registrar_compras` (ADR-0126). La parte por tienda tiene que respetar `fn_deuda_visible` (ADR-0184/0187). La sede ve las unidades pero no los soles.
6. **Avisos:**
   - Agregar el campo a `FuentesAvisos` y la clave a `ClaveAviso`.
   - Escribir su prueba en `inicio-avisos.test.ts`.
   - Sumar la RPC de lectura nueva al prefijo de lectura de `lib/espera-reglas.ts`.