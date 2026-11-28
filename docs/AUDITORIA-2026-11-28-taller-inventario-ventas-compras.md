# Auditoría de Taller, Inventario, Ventas y Compras

Fecha: 2026-11-28. Cada módulo se auditó con cuatro lentes: lógica, datos, responsive y flujos. Todo corrió en local, contra la base desechable de la auditoría (`supabase_db_cayla-auditoria`) y la web en `localhost:3010`. Producción no se tocó.

Cada hallazgo pasó por dos o tres escépticos: uno lo reprodujo por su cuenta, otro buscó si era una decisión a propósito y otro midió el impacto real. **La severidad de este informe es la de los escépticos (la mediana de sus votos), no la del auditor**, y varias bajaron de alta a media. Los duplicados (el mismo defecto visto desde dos lentes o en dos rutas) quedaron en uno solo.

La evidencia de los escépticos está en `/private/tmp/claude-501/-Users-mastercayla-cayla-retail--claude-worktrees-audit-workshop-inventory-sales-purchases-c19a93/62ddf875-841e-4dd2-ae74-b41468e6615c/scratchpad/auditoria/verificar/`, con una carpeta por hallazgo (por ejemplo `ventas-flujos-1-reproducir/`). Varias carpetas de los auditores originales ya no existen, y donde faltaban, los escépticos rehicieron la reproducción.

---

## Resumen

### Hallazgos por módulo y severidad

| Módulo | Alta | Media | Baja | Total |
|---|---|---|---|---|
| Taller | 3 | 13 | 11 | 27 |
| Inventario | 0 | 12 | 11 | 23 |
| Ventas | 3 | 12 | 14 | 29 |
| Compras | 0 | 9 | 8 | 17 |
| Transversal (más de un módulo) | 0 | 3 | 4 | 7 |
| **Total** | **6** | **49** | **48** | **103** |

Estado: 97 CONFIRMADOS y 6 PLAUSIBLES (los números 38, 50, 65, 66, 100 y 102). Aparte, seis hallazgos se refutaron (ver el final).

### Los 5 que arreglaría primero

1. **N.º 1: anular una venta con la prenda dañada la borra del inventario.** Cualquier integrante lo hace desde /devoluciones, en el uso normal. La prenda sigue en la tienda sin figurar en el stock ni en Dañado. El arreglo es copiar la rama de cuarentena que ya tiene `aprobar_devolucion`.
2. **N.º 2 junto con el 45: «Liberar» en Existencias suelta la prenda de un apartado con adelanto.** Con un clic la prenda queda libre para venderse a otro, el adelanto no se puede devolver sin SQL a mano y, además, se traba el vencimiento diario de las tres sedes. Son dos candados chicos en la base.
3. **N.º 3: el pago a un servicio tapa la deuda con el que hizo de verdad el trabajo.** Es plata real que nadie ve: Por pagar no muestra la deuda y la base ni deja pagarle.
4. **N.º 4: «Ajustar lo que queda» de un lote falla en cerca de la mitad de los lotes con cortes en decimales.** Es la única forma de regularizar la tela del Taller y se arregla con un redondeo en una línea.
5. **N.º 9 junto con el 10: Compras puede anular una compra que ya está en el stock y registrar dos veces el mismo comprobante.** La deuda con el proveedor desaparece o se duplica, y la vigía (INV-14) no lo detecta. Conviene arreglarlos en la misma pasada.

Arreglos baratos que conviene sumar en la misma tanda: N.º 19 (agregar `for update` en dos lecturas de caja), N.º 12 (token en la Vuelta), N.º 43 (corregir `redondear2`), N.º 7 (`left join` en sobrantes del Taller) y N.º 83 (mover un bloque de CSS al final).

Según CLAUDE.md, todo lo que toca dinero, stock o SUNAT espera el OK de Felipe. Las migraciones para producción se pegan siguiendo «Cómo aplicar SQL a producción».

---

## 1. Estados imposibles, dinero y stock

### 1. Anular una venta con la prenda dañada la borra del inventario
**Severidad: Alta · Estado: CONFIRMADO · Módulo: Ventas**
**Dónde:** /devoluciones › Anular venta. `retail.anular_venta` (solo el bloque `vendible` escribe movimiento) y `components/AnularVentaForm.tsx:15-20` y `:128`.
- **Qué pasa:** Con las condiciones `danada_reparacion`, `danada_donar` o `devolver_proveedor` no se hace la entrada a cuarentena ni se crea la fila en `prendas_danadas`. La venta queda anulada, pero la salida por venta sigue contando. La pantalla dice que «el stock ya se actualizó». `anular_venta` se quedó con la regla de `aprobar_devolucion` de antes de ADR-0071.
- **Cómo reproducirlo:** Anular una venta de hoy con «Dañada para donar». El resultado: `venta_anulacion_items.movimiento_id` queda NULL, no hay ningún movimiento a cuarentena y no aparece fila nueva en `prendas_danadas`.
- **Impacto:** La pieza física sigue en la tienda pero no figura en el stock ni en la cola de Dañado. El conteo sale con sobrante y nadie decide si se repara, se dona o se devuelve. La pérdida sí se registra como merma, pero una prenda que se podía reparar queda dada de baja.
- **Arreglo:** En `anular_venta`, para esas tres condiciones, hacer lo mismo que `aprobar_devolucion`: una entrada a la sububicación cuarentena y una fila en `prendas_danadas` que apunte a la anulación. Agregar una prueba con `danada_donar`.

### 2. «Liberar» en Existencias suelta la prenda de un apartado con adelanto y lo deja trabado
**Severidad: Alta · Estado: CONFIRMADO · Módulo: Ventas**
**Dónde:** /inventario › Apartados (`components/ApartadosModal.tsx:57` llama a `liberar_apartado`). Además `retail.liberar_apartado`, `retail.listar_apartados` (campo `puede_liberar`) y `lib/apartados.ts`, donde `puedeLiberar` solo excluye los pedidos web.
- **Qué pasa:** `liberar_apartado` no mira `separacion_id`, y por eso la prenda de un APT le aparece con «Liberar» a quien la apartó. Al liberarla, el stock queda libre pero la separación sigue abierta con su adelanto. Después, entregar, liberar y vencer el apartado fallan con «el apartado de la clienta quedó inconsistente». ADR-0166 ya avisaba de este riesgo.
- **Cómo reproducirlo:** Una integrante crea un APT con S/ 30 de adelanto, va a Existencias › Apartados y toca «Liberar» en esa prenda. Luego intenta entregar o liberar el APT.
- **Impacto:** La prenda reservada se puede vender a otro cliente. El adelanto no se puede devolver ni el apartado se puede entregar sin SQL a mano. Además traba el vencimiento diario (ver el N.º 45).
- **Arreglo:** Que `liberar_apartado` rechace cuando `separacion_id` o `venta_id` no son null, con el mensaje «se libera desde Apartados». Que `listar_apartados` devuelva `puede_liberar=false` en esos casos. Agregar una prueba en `separaciones.mjs`.

### 3. Si se cambia de servicio tras anular su salida y vuelta, el pago al primero tapa la deuda con el segundo
**Severidad: Alta · Estado: CONFIRMADO · Módulo: Taller**
**Dónde:** En la orden: «Editar vuelta», anular la salida y «Cambiar quién». En la base: `retail.fn_servicios_por_pagar` (cuenta lo documentado sin mirar el proveedor) y `retail.cambiar_quien_fase`.
- **Qué pasa:** Se le paga a la maquila A. Después se anulan su vuelta y su salida («mandé al taller equivocado»), la fase pasa a B y B devuelve las prendas. Lo que se le pagó a A sigue contando para esa fase, así que Por pagar no muestra deuda con B y `pagar_servicio_de_orden` rechaza el pago («se le debe S/ 0»). El pago a A tampoco se puede anular, porque ya tiene pagos.
- **Cómo reproducirlo:** Dentro de BEGIN…ROLLBACK: un bordado de S/ 3 con A, salida de 4, vuelta de 4 y pago de 12. Luego `anular_vuelta`, `anular_salida`, `cambiar_quien_fase` a B, salida de 4 y vuelta de 4. Resultado: `fn_servicios_por_pagar` no tiene fila para la fase.
- **Impacto:** La maquila que sí hizo el trabajo no figura en Por pagar ni se le puede pagar desde la orden. La otra se quedó con plata de un trabajo anulado y no aparece ningún saldo a favor.
- **Arreglo:** En `fn_servicios_por_pagar`, contar como documentado solo lo pagado al proveedor actual de la fase. En `cambiar_quien_fase` y `anular_vuelta`, rechazar con `servicio_ya_pagado` si hay comprobantes vigentes de otro proveedor. Agregar una prueba en `produccion_pagar_servicio.mjs`.

### 4. «Ajustar lo que queda» de un lote siempre falla si hubo cortes con decimales
**Severidad: Alta · Estado: CONFIRMADO · Módulo: Taller**
**Dónde:** /produccion/insumos › lote › «Ajustar lo que queda». `components/insumos-taller/AjustarLoteModal.tsx:39`, `lib/insumos-reglas.ts:214-222` (`saldoDeLote`) y `retail.ajustar_lote_usado`, que compara de forma exacta.
- **Qué pasa:** `saldoDeLote` resta con decimales de JavaScript (100 − 33.3 − 33.3 da 33.400000000000006) y manda ese número tal cual. La base lo compara contra su número exacto y responde «Este lote cambió mientras lo revisabas». Actualizar la pantalla no sirve, porque vuelve a salir el mismo resultado.
- **Cómo reproducirlo:** Un lote de 100 m con dos mermas de 33.3 m. Abrir «Ajustar lo que queda» y guardar cualquier cifra.
- **Impacto:** En una simulación con cortes realistas, el 48 % de los lotes no se pudo regularizar desde la única pantalla que lo hace. El saldo equivocado sigue alimentando el orden de salida de los lotes (PEPS), el costo y los avisos de «se acabó».
- **Arreglo:** Redondear a 3 decimales el resultado de `saldoDeLote` y de `saldoDeInsumo`, que es la escala de la columna. Agregar la prueba 100 − 33.3 − 33.3 = 33.4.

### 5. Una factura de tela por kilo o por rollo en volumen: la base rechaza el total del papel
**Severidad: Alta · Estado: CONFIRMADO · Módulo: Taller**
**Dónde:** /produccion/insumos › «Llegó una compra». `lib/insumo-compra-reglas.ts:74` y `:151`, `LlegoUnaCompraModal.tsx:129` y `retail.registrar_comprobante_produccion`, que tolera 0.01 por cada línea más una.
- **Qué pasa:** Al pasar kilos o rollos a metros, el costo por metro se redondea a 4 decimales, y el error crece con la cantidad de metros. Con factura, la web manda el total del papel y la base solo acepta una diferencia de 2 céntimos con una línea.
- **Cómo reproducirlo:** 500 kg a S/ 18 con 3.47 m/kg, con factura: «El total del documento (S/ 10620.00) no cuadra con sus líneas (S/ 10619.96)». 20 rollos a S/ 457.30 también fallan.
- **Impacto:** Esa factura no se puede registrar, ni al contado ni a crédito. Con 150 kg o más por color falla en más de la mitad de los casos; con 40 a 60 kg casi nunca. La base no guarda nada a medias.
- **Arreglo:** Que `registrar_compra_de_insumos` reciba el subtotal del papel por línea y lo use en lugar de `round(cantidad × costo, 2)`. Agregar casos de prueba de 500 kg en Vitest y en Postgres.

### 6. Corregir un conteo cerrado y después cancelarlo deja un conteo «cancelado» con su ajuste vigente
**Severidad: Media · Estado: CONFIRMADO · Módulo: Inventario**
**Dónde:** /inventario/conteo/[id] («Corregir conteo») y /inventario/conteo («Cancelar conteo»). `retail.anular_conteo` (solo mira `estado='abierto'`), `CanceladoConteo.tsx:30` y `CancelarConteoModal.tsx:73`.
- **Qué pasa:** `reabrir_conteo` vuelve a abrir un conteo que ya ajustó el stock, y `anular_conteo` lo marca anulado sin mirar sus movimientos. El ajuste sigue en el stock y en Movimientos, pero la ficha dice «no cambió ninguna existencia». Además, el faltante deja de aparecer donde se enlazan los hallazgos (`fn_faltantes_de_conteo`).
- **Cómo reproducirlo:** Cerrar un conteo con una diferencia de −1, tocar «Corregir conteo» y después «Cancelar conteo». El conteo queda anulado y su movimiento −1 sigue vigente.
- **Impacto:** La encargada cree que deshizo el ajuste. La merma queda sin el conteo que la explica, y si la prenda aparece después ya no se puede enlazar. Para reabrir hace falta tener la capacidad de conteos; volver a cerrar sin cambios ya funciona bien.
- **Arreglo:** Que `anular_conteo` rechace con `conteo_con_ajustes`, o que devuelva el conteo a cerrado con sus datos originales, cuando ya tiene ajustes. En la pantalla, para un conteo reabierto, cambiar el botón a «Descartar la corrección» con un texto que diga lo que de verdad pasa.

### 7. «Salió del origen» no funciona cuando el traslado viene del Taller
**Severidad: Media · Estado: CONFIRMADO · Módulo: Inventario**
**Dónde:** /inventario/traslados/[id] (revisar las prendas de más). `retail.resolver_sobrante_traslado`, en `supabase/migrations/20261014180000_traslado_sobrantes_parte2_funciones.sql:228`.
- **Qué pasa:** El stock del Taller no tiene sububicación (es NULL, a propósito: ADR-0282). La búsqueda usa un `join` interno, no lo encuentra y responde «Taller no tiene esa prenda libre», aunque tenga 14. La única salida que queda es «No sé de dónde salió», que suma la prenda en la tienda sin restarla al Taller.
- **Cómo reproducirlo:** Un traslado del Taller a Trujillo de 1 prenda, contar 2, cerrar con diferencia y resolver el sobrante con «Salió del origen».
- **Impacto:** La misma unidad queda contada en el Taller y en la tienda, y en el siguiente conteo del Taller aparece como una merma falsa.
- **Arreglo:** Cambiar a `left join` con `coalesce(sb.tipo,'') <> 'cuarentena'`, y comprobar si existe la fila con `exists`/`found`, no con `v_sub_origen is null`. Se probó que el `left join` solo no alcanza. Agregar el caso del Taller en `traslado_sobrantes.mjs`.

### 8. `registrar_movimiento` deja meter y sacar prendas de la Cuarentena, y anotar entradas con motivos falsos
**Severidad: Media · Estado: CONFIRMADO · Módulo: Inventario**
**Dónde:** `retail.registrar_movimiento` (tiene EXECUTE para `authenticated`) y `fn_movimiento_no_ajusta_cuarentena`, que solo frena el tipo `ajuste`.
- **Qué pasa:** Las entradas y salidas sueltas aceptan la Cuarentena y casi cualquier motivo, como `recepcion` o `devolucion`. Ninguna pantalla las usa. ADR-0328 ya decidió quitarle ese permiso a `authenticated`, y nunca se hizo.
- **Cómo reproducirlo:** Con la sesión de una integrante que tiene Existencias: una `entrada` de 2 a la Cuarentena, una salida `merma` de una prenda con dañada viva, o una `entrada` de 100 000 con motivo `recepcion`.
- **Impacto:** La Cuarentena y la lista de Dañadas dejan de coincidir sin que la vigía lo detecte, y aparecen recepciones o devoluciones que nunca existieron. Solo se llega por la API.
- **Arreglo:** Quitarle EXECUTE a `authenticated` (las tres funciones que la llaman son security definer y siguen funcionando) y limitar `p_tipo` a `ajuste`. Agregar la invariante «stock de Cuarentena = dañadas vivas».

### 9. `anular_compra` anula una compra de «Mis compras» cuya mercadería ya está en la tienda
**Severidad: Media · Estado: CONFIRMADO · Módulo: Compras**
**Dónde:** `retail.anular_compra` (solo mira `movimientos.compra_item_id`), `retail.compra_item_recibido_antes`, INV-14 en `scripts/chaos/invariantes.mjs` y `apps/web/lib/compras-reglas.ts:451-468`.
- **Qué pasa:** Cuando la tienda recibe antes del comprobante, la mercadería queda en `compra_item_recibido_antes` y los movimientos quedan con `compra_item_id` NULL. Si la compra es a crédito (pagué 0), la base la anula igual: la deuda sale de Por pagar, las prendas siguen en el stock y el papel queda «completado». La pantalla esconde el botón, pero la base no lo impide.
- **Cómo reproducirlo:** Sandra anota una compra con `p_pagado` 0. Micaela la recibe y se une el papel. Felipe llama `anular_compra`: queda ANULADA, el stock sigue en 8 e INV-14 sigue en verde.
- **Impacto:** Quedan prendas en el stock sin deuda ni comprobante que las respalden. El libro de compras y el crédito fiscal pierden el documento sin aviso. Hoy solo pasa por la API; está anotado como «g1» en el backlog del 2026-11-15.
- **Arreglo:** Que `anular_compra` rechace si `recibido_cantidad > 0` o si hay filas en `compra_item_recibido_antes` o `compra_papel_llegadas`. Extender INV-14 a esa tabla. Toca dinero: espera el OK de Felipe.

### 10. El mismo comprobante entra dos veces si el número se escribe con o sin ceros a la izquierda
**Severidad: Media · Estado: CONFIRMADO · Módulo: Compras**
**Dónde:** /compras/mi-plata/compra, paso «Papel y pago». `retail.registrar_compra_rapida` (control `papel_repetido`), `retail.completar_papel_compra`, el índice `compras_papel_vigente_unico` y `lib/compra-rapida-reglas.ts:1081`.
- **Qué pasa:** «123» y «000123» se toman como papeles distintos en el control, al completar y en el índice único. Las dos compras llegan al libro como facturas vigentes del mismo proveedor, cada una con su deuda y su IGV. El resto del ERP (SIRE y Gastos) ya los trata como el mismo comprobante.
- **Cómo reproducirlo:** Registrar dos compras al mismo proveedor con las facturas F777-123 y F777-000123, y recibirlas. Quedan dos compras vigentes de S/ 40.
- **Impacto:** Dos deudas por una sola factura, con riesgo de pagarle dos veces al proveedor. El cruce con SIRE avisaría antes de declarar, pero Por pagar no avisa.
- **Arreglo:** Una función única, `retail.fn_numero_comprobante_clave`, que quite los ceros a la izquierda, usada en los tres controles y en el índice. El índice se rehace aparte, después de revisar si producción ya tiene pares repetidos. Arreglarlo junto con el N.º 31.

### 11. Anular una orden borra de Por pagar lo que se le debe a un servicio que ya devolvió las prendas
**Severidad: Media · Estado: CONFIRMADO · Módulo: Taller**
**Dónde:** /produccion/ordenes/[numero] › «Anular orden». `retail.anular_produccion`, `retail.fn_servicios_por_pagar` (que excluye las órdenes anuladas, en `20261105221000_servicios_del_taller_por_pagar.sql:68`) y `retail.pagar_servicio_de_orden`.
- **Qué pasa:** Anular solo se frena si quedan prendas afuera. Si hay trabajo devuelto sin pagar, la deuda sale de Por pagar y de Finanzas, y el pago se rechaza con «La orden está anulada». Lo devengado sigue figurando en las fases de la orden.
- **Cómo reproducirlo:** Una orden con un servicio ya devuelto (S/ 15 devengados) y nada afuera. Correr `anular_produccion`: `fn_servicios_por_pagar` devuelve 0 filas.
- **Impacto:** CAYLA le sigue debiendo al servicio y nadie lo ve. Solo se puede pagar con un comprobante suelto en Facturas de insumos, si alguien se acuerda.
- **Arreglo (lo decide Felipe):** O anular rechaza con `servicio_por_pagar`, o Por pagar incluye las órdenes anuladas con algo devengado sin documentar y el pago las acepta.

### 12. La Vuelta de un servicio no lleva token y un reintento la duplica
**Severidad: Media · Estado: CONFIRMADO · Módulo: Taller**
**Dónde:** `components/orden-pagina/AnotarVueltaModal.tsx:118-136`, `retail.registrar_vuelta` y `lib/error-escritura.ts` (`fraseDelError` no usa `esRespuestaIncierta`).
- **Qué pasa:** Si la base guarda y la respuesta se pierde (un error 5xx sin código), la hoja dice «Vuelve a intentar» y el segundo toque anota otra vuelta igual. El tope solo compara con lo que salió, así que una vuelta parcial entra dos veces. La Salida y el «Terminé» ya llevan token, y marcar la fase se protege sola.
- **Cómo reproducirlo:** Hacer que la llamada a `registrar_vuelta` llegue a la base pero el navegador reciba un 503. Anotar 1 prenda buena y reintentar: quedan dos filas iguales.
- **Impacto:** Se registran prendas que no volvieron, sube lo que se le debe al servicio y avanzan prendas fantasma hacia el stock. Se puede deshacer con `anular_vuelta`, si alguien lo ve.
- **Arreglo:** Agregar `p_token` a `registrar_vuelta` con `fn_produccion_envio_repetido` y mandarlo desde la hoja. Que un error sin código diga «no sabemos si se guardó, revisa la línea de tiempo».

### 13. Anular una vuelta ya pagada deja un pago sin trabajo y sin aviso
**Severidad: Media · Estado: CONFIRMADO · Módulo: Taller**
**Dónde:** `AnularSalidaOVueltaModal.tsx`, `retail.anular_vuelta` y `fn_produccion_vuelta_anulable` (no miran comprobantes), y `fn_servicios_por_pagar` (solo lista lo que falta pagar, si es mayor que 0).
- **Qué pasa:** Se pagan S/ 5 por una vuelta y después se anula esa vuelta; la hoja no menciona el pago. Lo devengado baja a 0 y lo pagado queda en 5, así que la fase sale de Por pagar sin mostrar ningún saldo a favor.
- **Cómo reproducirlo:** Anotar una vuelta de 2 prendas buenas, pagar S/ 5, anular la vuelta y anotar las 2 como faltantes.
- **Impacto:** Queda un pago de más a un servicio sin rastro. El sobrepago solo se descuenta en silencio si después vuelve algo.
- **Arreglo:** Que `anular_vuelta` pida confirmación, o rechace con `vuelta_ya_pagada`, cuando lo pagado supera lo devengado. Que la hoja diga «Ya le pagaste S/ X» y que Por pagar muestre el saldo a favor.

### 14. El tope de 1.000 filas de PostgREST corta lecturas del Taller sin avisar
**Severidad: Media · Estado: CONFIRMADO · Módulo: Taller**
**Dónde:** `lib/insumos.ts:229` (`movimientos_insumo`), `:223` (`insumo_lotes`) y `:234` (`fn_costos_insumos_taller`). También `lib/produccion.ts:267` (historial de moldes con `.limit(5000)`) y `:86-89` (`fn_costos_producciones`).
- **Qué pasa:** Estas lecturas no usan `leerTodas()`. Pasado el tope de 1.000 filas se pierden los movimientos más viejos, que son los ingresos. En pantalla se reprodujo «Quedan -996» para un avío que en realidad tiene 950. En Eficiencia, las órdenes que la RPC no devuelve cuentan con costo 0.
- **Cómo reproducirlo:** Con 1.051 movimientos de insumo en el Taller, abrir /produccion/insumos.
- **Impacto:** Todavía no pasa (hoy hay pocas filas) y ya está anotado en `docs/backlog/2026-10-23-cayla-promo-scan-issue-4e46aa.md:6`. Cuando pase, Insumos dirá «se acabó» de telas que están en el estante y «¿Alcanza la tela?» decidirá mal. Las escrituras siguen protegidas por la base.
- **Arreglo:** Usar `leerTodas()` con un orden total (`created_at desc, id`) en las cinco lecturas. Mejor aún, que la base entregue el saldo por insumo y por lote. Sumar `movimientos_insumo` a la tabla de ADR-0192.

### 15. Ventas y apartados aceptan montos con más de dos decimales y quedan descuadrados
**Severidad: Media · Estado: CONFIRMADO · Módulo: Ventas**
**Dónde:** `retail.registrar_venta` (líneas ~356, 527-553 y 730), `separar_prendas`, `abonar_separacion` y `entregar_separacion`.
- **Qué pasa:** Las funciones suman y comparan los montos tal como llegan, y la columna redondea cada fila por separado al guardar. Con pagos de 79.895 + 0.005, los pagos quedan en 79.91 y los ítems en 79.90. Un apartado con dos abonos de 20.005 termina cobrando S/ 79.92 por una prenda de S/ 79.90. La boleta guarda un precio unitario con 4 decimales. `corregir_pagos_venta`, en cambio, sí exige dos decimales.
- **Cómo reproducirlo:** `registrar_venta` con precio 79.8951 × 40 y boleta: los ítems dan 3196.00 y los pagos 3195.80.
- **Impacto:** Ventas, comprobantes y apartados descuadrados por céntimos. La vigía INV-02 tolera 0.011 y no lo ve. Hoy solo pasa por la API, porque la caja ya lee en céntimos.
- **Arreglo:** Un helper `fn_exigir_centimos(numeric)` en las cuatro funciones, para precios, descuentos y pagos. Que el candado del precio no redondee lo que llega. Bajar la tolerancia de INV-02 a 0.

### 16. Cantidades sin tope en la base: un código escaneado en la casilla de cantidad crea millones de prendas
**Severidad: Media · Estado: CONFIRMADO · Módulo: Inventario**
**Dónde:** `retail.conteo_contar`, `conteo_completar_tarjeta` y `registrar_recepcion_traslado`, que solo rechazan negativos. `retail.iniciar_traslado`, que no mira si el destino está activo ni pone techo a la fecha. `lib/conteo-reglas.ts:878`, donde el máximo es el del tipo de dato, y `lib/traslados-recepcion-reglas.ts:52-58`, sin tope.
- **Qué pasa:** En un conteo, 123.456.789 se guarda y, al cerrar, entra al stock. En una recepción, lo de más queda como sobrante (no entra solo). Con 11 dígitos la recepción falla (22003) y la casilla queda con el ✓ y «No se guardó · reintentar», y reintentar nunca funciona. `iniciar_traslado` acepta un destino inactivo y una llegada en 2099.
- **Cómo reproducirlo:** En un conteo abierto, escribir 123456789, confirmar la diferencia y cerrar: el stock queda en 123456789. En una recepción, escribir 99999999999: la base responde 400.
- **Impacto:** Un EAN escaneado por error en la casilla, más un cierre hecho de prisa, infla el stock y el valor del inventario. El líder ve «Hay N de más» antes de cerrar, pero puede pasarlo por alto.
- **Arreglo:** Un tope de 99 999 en las tres funciones, con su hint, y que las casillas rechacen más de 5 dígitos con «¿Escaneaste un código en la cantidad?». Que `iniciar_traslado` exija un destino activo y una llegada como máximo 60 días después de hoy.

### 17. El reembolso de saldo a favor no lleva token y un reintento lo registra dos veces
**Severidad: Media · Estado: CONFIRMADO · Módulo: Compras**
**Dónde:** /compras/proveedores/[id] (saldo a favor). `components/SaldoFavorAcciones.tsx:60`, `retail.registrar_reembolso_proveedor` y `fn_insertar_reembolso_proveedor`.
- **Qué pasa:** Es la única escritura de dinero de Compras sin marca de intento. Tras un corte de red, el segundo «Registrar» guarda otro reembolso igual, siempre que quepa en el saldo.
- **Cómo reproducirlo:** Dos llamadas idénticas (S/ 40, referencia OP-123) sobre S/ 100 a favor: quedan dos reembolsos y el saldo baja a 20. Si «Entra a» es efectivo, quedan además dos ingresos de caja.
- **Impacto:** El saldo con el proveedor queda más bajo que el real y aparece un ingreso de caja o de banco que no ocurrió. Se puede corregir con `anular_reembolso_proveedor`.
- **Arreglo:** Un `p_token` con índice único que, si se repite, devuelva lo ya registrado, y un token estable en la hoja (`useRef`), como en `PagoJuntosModal.tsx:117`. Agregar la prueba «mismo token, un solo reembolso».

### 18. «Compré ropa»: volver desde el paso del papel reemplaza el monto escrito por el total de las prendas
**Severidad: Media · Estado: CONFIRMADO · Módulo: Compras**
**Dónde:** /compras/mi-plata/compra. `components/mi-plata/RegistrarCompra.tsx:554-557` (`alPapel`).
- **Qué pasa:** `alPapel` pone el total de las prendas cada vez que se entra al paso. Si la compradora escribió lo que dice el papel (S/ 210), vuelve con la flecha y regresa, el monto queda en S/ 200 sin aviso. El aviso ámbar pasa a verde («Cuadra») y lo pagado también se vuelve S/ 200.
- **Cómo reproducirlo:** Anotar 10 prendas a S/ 20, ir a «Sigue: el papel», elegir Boleta y escribir 210, volver y regresar: el monto dice 200.00.
- **Impacto:** La compra se guarda por un monto distinto al del comprobante, y desaparece justo la alerta que servía para revisarlo. A la plata de la compradora le quedan S/ 10 de más.
- **Arreglo:** Poner el total solo si el monto está vacío o si sigue igual al último total que se puso (guardado en un `ref`). Agregar una prueba de la regla.

---

## 2. Permisos y concurrencia

### 19. Se puede anular una venta o devolver el adelanto de un apartado en una caja que ya se cerró
**Severidad: Media · Estado: CONFIRMADO · Módulo: Ventas**
**Dónde:** `retail.anular_venta`, línea 67, y `retail.registrar_devolucion_separacion`, línea 46: las dos leen la caja sin candado.
- **Qué pasa:** `cerrar_caja` toma la caja con `for update`, pero estas dos funciones no la bloquean. Si coinciden con un cierre en curso, la operación se confirma después del cierre y la caja queda cerrada «cuadrada» con un esperado que ya no es cierto. El disparador de efectivo no actúa sobre una caja cerrada, y la vigía solo compara las columnas guardadas.
- **Cómo reproducirlo:** Tres sesiones con COMMIT: `anular_venta` queda esperando, `cerrar_caja` confirma y la anulación confirma después. La caja queda cerrada con 179.90 guardado, cuando el recálculo da 100.00. Se reprodujo también sin pausas artificiales, con 0 a 10 ms de diferencia.
- **Impacto:** El arqueo cerrado no cuadra con su recálculo y nadie se entera. La ventana es de milisegundos, así que es raro, pero es silencioso y es dinero.
- **Arreglo:** Agregar `for update` (o `for share`) a esas dos lecturas, como ya hacen `corregir_pagos_venta` y las siete funciones de ADR-0188. Sumar la invariante «el esperado guardado de una caja cerrada coincide con su recálculo» y una prueba con dos conexiones.

### 20. Carrera entre cerrar, anular o cambiar el plan y la Salida, la Vuelta o el Terminé: órdenes cerradas con prendas afuera
**Severidad: Media · Estado: CONFIRMADO · Módulo: Taller**
**Dónde:** `retail.fn_produccion_operar_fase` lee el estado antes del candado. `registrar_salida` y `registrar_avance` usan el candado consultivo. `cerrar_produccion`, `anular_produccion` y `cambiar_plan_de_orden` usan solo `FOR UPDATE` y nunca el consultivo.
- **Qué pasa:** Los dos candados no se cruzan y una Salida no espera a un cierre en curso. Así quedan dos estados imposibles: una orden «terminada» con 10 prendas en Costura, cuya Vuelta luego se rechaza por orden cerrada, y un plan de 5 con 20 prendas cortadas.
- **Cómo reproducirlo:** Dos sesiones con COMMIT: `cerrar_produccion_con_motivo` y, al mismo tiempo, `registrar_salida` de lo que quedaba. Resultado: terminada con 10 afuera. Sin pausas artificiales salió 10 de 10 veces con 0 a 20 ms de diferencia.
- **Impacto:** Prendas en el taller externo que ya no pueden volver ni entrar al stock, con el servicio ya devengado. Hacen falta dos personas en la misma orden dentro de unos 20 ms. Se recupera con `revertir_produccion`, salvo cuando el costo ya se mezcló con otra orden.
- **Arreglo:** Un solo candado por orden, tomado en el mismo orden por todas las funciones: primero el consultivo `'produccion:'||id` y después la lectura del estado. Agregar una prueba con dos conexiones y las invariantes «orden no en proceso con salidas sin vuelta» y «corte mayor que plan + 3».

### 21. La función vieja `abrir_produccion` crea órdenes sin fases que se cierran sin ningún avance
**Severidad: Media · Estado: CONFIRMADO · Módulo: Taller**
**Dónde:** `retail.abrir_produccion` y `abrir_produccion_con_modelo_nuevo`, que tienen EXECUTE para `authenticated`. En `retail.cerrar_produccion`, el tope de prendas buenas solo se aplica si la orden tiene fases.
- **Qué pasa:** Las dos solo preguntan por la sede, no por el módulo Producción. Una orden abierta por ahí no tiene fases, y al cerrarla el único freno es no pasar del doble del plan, plan que pone la misma persona.
- **Cómo reproducirlo:** Un integrante del Taller sin el módulo Producción llama `abrir_produccion` con plan 100 y cierra con 200 buenas: el stock sube 200 sin ningún avance. `anon` también tiene EXECUTE, pero lo frena el chequeo de sede.
- **Impacto:** Stock que aparece de la nada, por la API. El costo sí queda frenado para quien no es líder por la banda de costo atípico.
- **Arreglo:** Quitar EXECUTE de las dos para `authenticated` y `anon`; la envoltura `abrir_orden_produccion` las sigue llamando como dueña. Que `cerrar_produccion` exija el módulo y rechace órdenes nuevas sin fases. Antes, revisar las pruebas que llaman directo a `abrir_produccion`.

### 22. Cerrar, anular, revertir y marcar etapa no piden el módulo, y sin él se apagan los candados de la orden
**Severidad: Media · Estado: CONFIRMADO · Módulo: Taller**
**Dónde:** `cerrar_produccion`, `anular_produccion`, `revertir_produccion`, `set_etapa_produccion`, `registrar_consumo_insumo`, `devolver_insumo_de_produccion` y `recibir_insumo`. También `fn_fases_de_orden`, que devuelve NULL a quien no puede leer la orden.
- **Qué pasa:** Estas funciones solo piden la sede. Sin el módulo, `fn_fases_de_orden` devuelve NULL, y los candados de prendas afuera, de tela cortada y de costo de servicios no ven nada. Así se puede cerrar con 20 prendas en Costura, anular con prendas afuera, o meter el costo sin los servicios.
- **Cómo reproducirlo:** Micaela, en el Taller con un rol sin Producción, llama `cerrar_produccion` con 20 prendas afuera: pasa. Con el rol Integrante, el mismo cierre se rechaza.
- **Impacto:** Un estado imposible de stock, solo por la API, desde una cuenta del Taller con un rol armado sin Producción.
- **Arreglo:** Llamar a `fn_produccion_exigir_operar` en esas funciones. Que los candados usen una función interna de fases que no verifique permisos de lectura y no tenga EXECUTE para `authenticated`.

### 23. Traslados, conteos, ventas, apartados, cambios y devoluciones no preguntan el módulo en la base
**Severidad: Media · Estado: CONFIRMADO · Módulos: Inventario y Ventas**
**Dónde:** `iniciar_traslado`, `registrar_recepcion_traslado`, `confirmar_traslado`, `anular_traslado`, `abrir_conteo`, `conteo_contar`, `conteo_confirmar_diferencia`, `anular_conteo`, `regularizar_prenda`, `registrar_venta`, `separar_prendas`, `entregar_separacion`, `registrar_cambio` y `registrar_cambio_varias`, y `crear_devolucion`.
- **Qué pasa:** Solo exigen que la cuenta opere la sede. Sus funciones vecinas (`enviar_pedido_a_otra_sede`, `abonar_separacion`, `liberar_separacion`, `anular_venta`, `ajustar_inventario`) sí piden el módulo. El caso de Ventas y Apartados ya está anotado (ADR-0196, `docs/BACKLOG.md:1589`); el de traslados, conteos, cambios y devoluciones no.
- **Cómo reproducirlo:** El rol Terminal de ventas, que no tiene Traslados ni Conteos, inicia un traslado y abre un conteo. Una integrante sin Vender ni Cambios vende y hace cambios en su sede.
- **Impacto:** Lo que el líder decide en «Roles y accesos» solo vale en la pantalla. Todo queda firmado en Movimientos.
- **Arreglo:** Agregar el chequeo de módulo en cada función sin cerrar los caminos legítimos: `abrir_conteo` debe aceptar Existencias o Conteos, `conteo_contar` también lo usa Recibir, `regularizar_prenda` lo usa Vender y `enviar_pedido_web_desde` llama a `iniciar_traslado`. Cubrirlo con `pnpm pruebas:roles`.

### 24. Quien edita el catálogo puede borrar de una vez todos los códigos de barras
**Severidad: Media · Estado: CONFIRMADO · Módulo: Inventario**
**Dónde:** La tabla `retail.codigos_barras`: `authenticated` tiene DELETE y la política `codigos_barras_write_lider` usa `fn_puede_editar_catalogo()`.
- **Qué pasa:** El rol Integrante, que tiene Productos o Atributos, puede hacer un DELETE por la API y borrar las 262 filas, incluidos los códigos de fábrica. No hay disparador ni historial. La web solo lee esta tabla.
- **Cómo reproducirlo:** Con la sesión de Micaela, un DELETE sobre `codigos_barras` con cualquier filtro: borra 262 (probado dentro de un rollback).
- **Impacto:** Los códigos de fábrica dejan de reconocerse en Vender, Conteos y Recibir en las tres sedes, y no se vuelven a generar. Para que pase hay que llamar a la API a propósito.
- **Arreglo:** Quitar DELETE a `authenticated` y separar la política en select, insert y update. Si hace falta quitar un código, que sea con una función que lo archive y deje firma. Revisar los demás catálogos que tienen DELETE abierto.

### 25. Un líder con otra sede activa cuenta un conteo ajeno y firma alguien de su sede activa
**Severidad: Media · Estado: CONFIRMADO · Módulo: Inventario**
**Dónde:** `app/(app)/inventario/conteo/[id]/page.tsx:40`, `:43` y `:81`. `components/conteo/ContarConteo.tsx:124` y `ConfirmarConteo.tsx:108`, donde `useResponsable` toma la sede activa.
- **Qué pasa:** La página no compara la sede del conteo con la sede activa: muestra la activa y deja contar, y el responsable y la sede que se envían (`x-ubicacion`) también son los de la activa. Un líder no admin con Trujillo activa cierra un conteo de Lima con la firma de una integrante de turno en Trujillo.
- **Cómo reproducirlo:** Felipe, con la cookie de Trujillo, abre un conteo abierto de Lima: la cabecera dice «TIENDA TRUJILLO» y «Contar» está habilitado. En SQL, con un líder no admin, el ajuste de Lima queda firmado por Micaela.
- **Impacto:** El stock queda bien, pero el registro de quién contó queda equivocado y la persona cree que está contando su sede. Se llega a estos conteos desde enlaces en Movimientos y Pérdidas.
- **Arreglo:** Si la sede del conteo no es la activa, mostrarlo solo para leer, con un botón «Cambiar a <sede>». O pasarle a `useResponsable` la sede del conteo.

### 26. Una integrante puede dejar en Actividad que el líder autorizó un descuento que nunca autorizó
**Severidad: Media · Estado: CONFIRMADO · Módulo: Ventas**
**Dónde:** `retail.registrar_venta` (`p_descuento_pct`, `p_autorizado_por`) y `fn_actividad_venta_registrada`.
- **Qué pasa:** Basta con pasar el id de cualquier líder en `p_autorizado_por` para superar el tope de descuento; no se prueba que ese líder estuvo ahí. El porcentaje no cambia lo que se cobra, pero Actividad publica «autorizó 50 %» a nombre del líder.
- **Cómo reproducirlo:** Micaela, por la API, llama `registrar_venta` con `p_descuento_pct` 50 y el id de Felipe: la venta se guarda y Actividad muestra la autorización falsa.
- **Impacto:** El registro de auditoría deja de ser confiable. La caja web no manda estos parámetros, así que solo pasa por la API. ADR-0153 dejó pendiente cómo se presta la autorización.
- **Arreglo:** Si la caja ya no usa el descuento global, rechazar `p_descuento_pct > 0` y `p_autorizado_por`. Si se mantiene, exigir que quien autoriza sea la persona que firma la operación.

### 27. Liberar un comprobante como «no emitido» no revisa de qué tienda es
**Severidad: Media · Estado: CONFIRMADO · Módulo: Ventas**
**Dónde:** /vender/comprobantes › «Liberar sin espera». `retail.marcar_comprobante_no_emitido`.
- **Qué pasa:** Solo pide el módulo Facturación. `anular_comprobante`, en cambio, sí exige la sede (ADR-0673). Una cuenta de Trujillo con Facturación puede liberar una boleta pendiente de Lima. El rol Terminal de ventas ya trae Facturación de fábrica.
- **Cómo reproducirlo:** Con un rol con Facturación en Trujillo, llamar `marcar_comprobante_no_emitido` sobre la B001-1 de Lima: queda «no emitido», firmado por Micaela.
- **Impacto:** Una venta de otra sede se queda sin su boleta ante SUNAT, y no tiene vuelta atrás. Por los permisos de lectura, esa cuenta no ve el comprobante, así que tendría que conocer su id.
- **Arreglo:** Exigir `fn_puede_operar_ubicacion(v_comp.ubicacion_id)` con errcode 42501. Agregar el caso en `anular_comprobante_permisos.mjs`.

### 28. Un integrante del Taller puede fijar por la API el costo de la corrida
**Severidad: Media · Estado: CONFIRMADO · Módulo: Taller**
**Dónde:** `retail.cerrar_produccion` (`coalesce` de `p_costo_tela`, `p_costo_avios` y `p_costo_maquila`). `PasarAlStockModal.tsx:183-188`, donde la web manda null.
- **Qué pasa:** La función acepta montos de cualquiera que opere el Taller, sea líder o no. Con un costo vigente de 0, la banda de costo atípico casi no frena. El monto entra al costo promedio y al historial de costos, y deja de cuadrar con lo devengado. ADR-0298 dice que el integrante cierra sin montos.
- **Cómo reproducirlo:** Micaela (rol Integrante) cierra con `p_costo_maquila` 900 sobre S/ 100 devengados: el costo de la variante pasa de 0 a 18.
- **Impacto:** El margen de la prenda en las tiendas se calcula sobre un número que alguien tecleó. Solo pasa por la API.
- **Arreglo:** Si quien cierra no es líder y llega algún `p_costo_*` no nulo, rechazar con 42501 y el hint `costo_solo_lider`. Lo mismo en `cerrar_produccion_con_motivo`.

### 29. «Lo que ya tenías» y «Encontré tela» se pueden anotar por la API en una tienda, y sin ser líder
**Severidad: Media · Estado: CONFIRMADO · Módulo: Taller**
**Dónde:** `retail.recibir_insumo` (solo mira la sede) y `retail.encontre_tela` (no exige que la sede sea un Taller). En pantalla, `InsumosPanel.tsx:467/483`.
- **Qué pasa:** `recibir_insumo` no exige ser líder (ni para el saldo inicial ni para una compra), ni el módulo, ni que la sede sea un Taller. `encontre_tela` tampoco exige Taller. La función vecina, `fn_material_agregar_colores`, sí exige todo eso. La migración `20261028203000` dejó `recibir_insumo` para después y nunca se volvió a tocar.
- **Cómo reproducirlo:** Micaela, en Trujillo, registra con `recibir_insumo` un saldo inicial de 1.000 m por S/ 50.000 y con `encontre_tela` 500 m a S/ 99. En la tienda quedan S/ 99.500 de tela.
- **Impacto:** Valor de materia prima inventado y un precio puesto por quien no debe. Ese lote falso puede quedar como el «último precio» de la siguiente «Encontré tela» real.
- **Arreglo:** En `recibir_insumo`, llamar a `fn_material_exigir_taller` y a `fn_produccion_exigir_operar`, y exigir `fn_es_lider()` para saldo inicial y para compra. En `encontre_tela`, llamar a `fn_material_exigir_taller`.

### 30. Bloqueo mutuo entre corregir una compra y cerrar el conteo de su envío
**Severidad: Media · Estado: CONFIRMADO · Módulo: Compras**
**Dónde:** `retail.corregir_compra_rapida` (`20261116215000_corregir_compra_con_envio_abierto.sql:266-272`) contra `retail.cerrar_conteo_envio`.
- **Qué pasa:** Corregir bloquea el papel, las líneas, los ítems del envío y al final el envío. El cierre bloquea primero el envío y después las líneas. Como toman los mismos registros en orden contrario, Postgres detecta el bloqueo mutuo y cancela una de las dos (40P01).
- **Cómo reproducirlo:** Correr `corregir_compra_rapida` bajando una cantidad mientras otra sesión cierra el conteo del mismo envío. Sin pausas artificiales, salió el bloqueo en 10 de 60 intentos.
- **Impacto:** No se pierde nada, pero quien está cerrando la recepción o corrigiendo ve «No se pudo… Código: deadlock detected» y tiene que repetir.
- **Arreglo:** Que `corregir_compra_rapida` bloquee primero los envíos vivos de la compra, en orden de id, antes del papel y las líneas, como ya hace `unir_recepcion_con_compra`. Agregar una prueba con dos sesiones.

### 31. Dos compradoras pueden anotar a la vez el mismo comprobante del mismo proveedor
**Severidad: Baja · Estado: CONFIRMADO · Módulo: Compras**
**Dónde:** `retail.registrar_compra_rapida` (el control de repetido no toma candado). `retail.compra_papeles` no tiene índice único.
- **Qué pasa:** El control de repetido mira si ya existe, pero sin candado, y los candados que sí toma son por persona y por id. Si dos personas registran a la vez, pasan las dos. El índice del libro frena la segunda al pasarla al libro, y queda «por completar» con su motivo. La misma persona en dos pestañas sí queda en fila.
- **Cómo reproducirlo:** Dos sesiones de personas distintas registran la misma factura F991-1: quedan dos papeles. Al recibir, uno se completa y el otro queda con error.
- **Impacto:** La ventana es de milisegundos. Compras lo resuelve en Revisar compras, pero la prenda ya entró al stock y la plata ya se contó.
- **Arreglo:** Un índice único parcial en `compra_papeles` por proveedor, tipo, serie y número normalizado, o un candado por comprobante. Usar la misma clave del N.º 10.

### 32. Pagar un servicio dos veces a la vez con el mismo token: la segunda llamada falla aunque el pago se guardó
**Severidad: Baja · Estado: CONFIRMADO · Módulo: Taller**
**Dónde:** `retail.pagar_servicio_de_orden`, que busca el token antes del `FOR UPDATE`.
- **Qué pasa:** Si llegan dos llamadas a la vez, la que espera el candado no ve el comprobante de la primera. Recalcula lo que falta, le da 0 y lanza «monto de más»; sin papel, lanza «token reusado» porque el número S/P cambió. No hay doble pago.
- **Cómo reproducirlo:** Tres psql en paralelo con el mismo token: queda 1 comprobante y salen 2 errores.
- **Impacto:** El líder ve un error de algo que sí se guardó. La pantalla ya frena el doble clic, así que solo pasa con un reenvío de la red.
- **Arreglo:** Buscar el token después del candado, como hace `registrar_pago_comprobante_produccion` desde `20261012214000`.

### 33. El rol sin sesión (`anon`) puede ejecutar funciones que guardan en los cuatro módulos
**Severidad: Baja · Estado: CONFIRMADO · Módulo: Transversal**
**Dónde:** 71 de las 1.774 funciones security definer de `retail` tienen EXECUTE para PUBLIC. Entre ellas: `abrir_produccion`, `revertir_produccion`, `set_etapa_produccion`, `fn_proveedor_metricas_insumos`, `abrir_conteo`, `archivar_conteo_prueba`, `liquidar_prenda_danada`, `resolver_prenda_danada`, `registrar_movimiento_caja`, `anular_compra`, `registrar_pago_compra`, `recibir_compras`, `recibir_lote`, `desactivar_proveedor`, `reactivar_proveedor` y `archivar_adjunto_compra`. La causa: `0005_grants.sql` da permisos a `authenticated` pero nunca se los quita a PUBLIC.
- **Qué pasa:** Hoy todas rechazan por dentro, pero la convención del repo es que el candado vaya en los permisos (ADR-0078, `20260922231700`). Además, `resolver_prenda_danada` le dice a alguien sin sesión si un id existe o no.
- **Cómo reproducirlo:** `has_function_privilege('anon', …)` da verdadero. Una llamada sin sesión por REST devuelve un error de módulo, no «permission denied».
- **Impacto:** Ninguno hoy. Si algún parche afloja un chequeo interno, la función queda abierta a la llave pública. Es posible que en producción ya se haya revocado a mano; no se verificó.
- **Arreglo:** Revocar de PUBLIC y de `anon` a la vez (se comprobó que revocar solo de `anon` no basta), y agregar una prueba de catálogo en el CI que falle si aparece una nueva. `concurrencia_orden_y_doble_clic.mjs:108-111` hoy espera `anon` = verdadero para `recibir_lote`: actualizarla en el mismo PR.

### 34. Confirmar o cerrar un traslado dos veces da error aunque lo primero sí se guardó
**Severidad: Baja · Estado: CONFIRMADO · Módulo: Inventario**
**Dónde:** `retail.confirmar_traslado` y `cerrar_traslado_con_diferencia` (el mensaje es «Este traslado ya está %» con el nombre interno del estado). `iniciar_traslado` acepta `p_token` null.
- **Qué pasa:** Los datos quedan bien, porque la fila se bloquea. Pero la segunda llamada, desde otra pestaña o después de perder la respuesta, muestra en rojo «Este traslado ya está cerrada» o «ya está recibido_con_diferencia». Que el token de `iniciar_traslado` sea opcional es una decisión documentada (ADR-0190).
- **Cómo reproducirlo:** Pulsar «Confirmar» a la vez en dos pestañas con la misma caja.
- **Impacto:** Quien recibe cree que falló una caja que sí entró, y puede llamar a la otra sede por nada.
- **Arreglo:** Devolver lo ya guardado con `ya_registrado=true`, como hace `recibir_envio`, o al menos traducir el estado a palabras. No volver obligatorio el token de `iniciar_traslado` sin revisar antes sus tres funciones que la llaman.

### 35. Abrir el mismo conteo desde dos pestañas muestra el error crudo de Postgres
**Severidad: Baja · Estado: CONFIRMADO · Módulo: Inventario**
**Dónde:** `retail.abrir_conteo` (mira si ya hay uno abierto sin candado y choca con `conteos_un_abierto_por_ubicacion`). `components/AbrirConteo.tsx:194-204`.
- **Qué pasa:** Las dos pestañas pasan el chequeo y la segunda choca con el índice. La pantalla solo reconoce el texto «Ya hay un conteo abierto», así que muestra «duplicate key… Key (ubicacion_id)=(uuid)». Si se vuelve a intentar, ya sale el mensaje correcto.
- **Cómo reproducirlo:** Pulsar «Empezar conteo» a la vez en dos pestañas.
- **Impacto:** Un error técnico que no se entiende. La base queda bien.
- **Arreglo:** Un candado consultivo por sede antes del chequeo, o capturar el error de duplicado y lanzar el mensaje propio con el hint `ya_hay_abierto`.

### 36. La cotización de maquila no guarda quién la cargó y una ráfaga de clics crea dos
**Severidad: Baja · Estado: CONFIRMADO · Módulo: Taller**
**Dónde:** /produccion/cotizaciones-maquila. `components/CotizacionesMaquilaPanel.tsx:133-175`.
- **Qué pasa:** Se inserta directo en la tabla sin llenar `creado_por` (la columna existe y nadie la llena) y sin ninguna marca contra el doble envío. Dos clics en el mismo instante crean dos filas; un doble clic normal, no. El precio 0 está permitido por decisión de ADR-0156, no es un error.
- **Cómo reproducirlo:** Abrir «Nueva cotización» y hacer dos `click()` en el mismo instante: quedan 2 filas sin autor.
- **Impacto:** No se sabe quién cargó el precio de referencia. Solo lo usa el líder, y en producción la tabla está vacía.
- **Arreglo:** Una RPC `registrar_cotizacion_maquila` que firme con `fn_actor_persona_id(true)` y use token. En el modal, `ComboResponsable` y un `useRef` que bloquee mientras se envía.

### 37. `extender_separacion` no aguanta reintentos: repetir la llamada aplaza dos veces
**Severidad: Baja · Estado: CONFIRMADO · Módulo: Ventas**
**Dónde:** `retail.extender_separacion`.
- **Qué pasa:** Suma 7 días a la fecha guardada. Si se reintenta después de confirmar, aplaza otros 7 y gasta la segunda extensión. La web usa `aplazar_separacion`, que sí aguanta reintentos; esta función quedó para pestañas viejas del 2026-10-15.
- **Cómo reproducirlo:** Dos llamadas seguidas: +14 días y 2 extensiones gastadas.
- **Impacto:** Hoy solo por la API.
- **Arreglo:** Retirarla (quitarle el EXECUTE o borrarla), después de confirmar con knip y grep que nadie la usa.

### 38. `registrar_venta` guarda ventas sin comprobante si se manipula la llamada
**Severidad: Baja · Estado: PLAUSIBLE · Módulo: Ventas**
**Dónde:** `retail.registrar_venta`: con `p_tipo_comprobante` null o con `p_emisor` 'alegra' no emite comprobante.
- **Qué pasa:** Una integrante, por la API, registra una venta completa sin comprobante. Lo de Alegra está decidido en ADR-0153 y hoy nadie lo usa. La venta no queda sin rastro: `ventas.emisor` guarda 'alegra', y Finanzas › Impuestos marca en ámbar las ventas sin boleta.
- **Cómo reproducirlo:** Llamar `registrar_venta` con `p_tipo_comprobante` null.
- **Impacto:** Bajo. Un escéptico lo considera una decisión a propósito.
- **Arreglo (opcional):** Retirar el valor 'alegra' y exigir el tipo, ajustando las pruebas que llaman sin tipo.

---

## 3. Lógica y errores silenciosos

### 39. Una proforma con descuento entre 15 % y 20 % no se puede cobrar
**Severidad: Media · Estado: CONFIRMADO · Módulo: Ventas**
**Dónde:** /vender?proforma=<id>. `lib/proformas-reglas.ts:85-87` (tope de 20 %), `NuevaProformaModal.tsx:37`, `lib/proforma-al-carrito.ts:121-136`, `retail.crear_proforma` (tope de 20 %) y `registrar_venta` (pide argumento por encima del 15 %).
- **Qué pasa:** La proforma acepta hasta 20 % sin argumento. Desde el 2026-09-25 la caja pide un argumento escrito por encima del 15 %, y la línea llega desde la proforma sin él. La pantalla no avisa antes de cobrar.
- **Cómo reproducirlo:** Proforma de Blusa Emma con 20 % y motivo «Cerrar la venta». Cobrar y confirmar: sale «pasa el 15 %: escribe el argumento».
- **Impacto:** La caja rechaza un precio ya cotizado con el cliente esperando en el mostrador. También pasa cuando la etiqueta subió y el descuento crece para mantener el precio prometido.
- **Arreglo (lo decide Felipe):** Bajar el tope de la proforma a 15 % en la web y en `crear_proforma`, que es lo que calza con ADR-0167. Guardar el argumento en la proforma ya lo descartó ese ADR. En cualquiera de los dos casos, que la pantalla avise antes de confirmar.

### 40. Reembolso de una venta pagada con QR: la pantalla propone QR y la base lo rechaza
**Severidad: Media · Estado: CONFIRMADO · Módulo: Ventas**
**Dónde:** /devoluciones › Por aprobar. `DevolucionesPendientes.tsx:198-199` y `:331` (usa una lista de medios que incluye QR), `lib/devoluciones-reglas.ts:331-334`, `retail.aprobar_devolucion` y el CHECK de `devoluciones.reembolso_metodo`.
- **Qué pasa:** La opción que viene elegida es el medio con que se pagó (QR), y la base solo acepta efectivo, tarjeta, Yape, Plin y transferencia.
- **Cómo reproducirlo:** Venta pagada con QR, crear la devolución y aprobarla por el total: sale `reembolso_metodo_invalido`.
- **Impacto:** Falla en todas las ventas con QR. La encargada termina eligiendo otro medio y la conciliación de la máquina de cobro queda mal.
- **Arreglo:** Una lista de medios de reembolso sin QR (o el mismo filtro que ya usa Cambios), que proponga tarjeta cuando se pagó con QR. Si Felipe lo pide, en cambio, aceptar QR en la base.

### 41. Vender deja confirmar un cobro en efectivo aunque lo recibido no alcance
**Severidad: Media · Estado: CONFIRMADO · Módulo: Ventas**
**Dónde:** /vender, hoja de cobro. `lib/vender-reglas.ts:310-356` (`motivoBloqueoCobro`) y `:260` (`pagosParaRpc`, que descarta lo recibido).
- **Qué pasa:** Si en «¿Con cuánto paga?» se escribe 10 para una venta de 100, la hoja muestra «FALTAN S/ 90.00» en rojo pero «Confirmar» sigue activo, y se registra efectivo por 100. En Apartados › Entregar sí se frena. Que lo recibido sea solo un dato de pantalla está decidido (ADR-0044 y ADR-0307); lo que nadie decidió es dejar confirmar cuando ya se escribió un monto menor.
- **Cómo reproducirlo:** Venta de 100, Efectivo, otro monto 10, Boleta, Confirmar: se emite la boleta y `venta_pagos` guarda efectivo 100.
- **Impacto:** La caja muestra un faltante en rojo y aun así deja cobrar, y Vender y Apartados siguen reglas distintas.
- **Arreglo (lo decide Felipe, porque es dinero):** Si se paga en efectivo y lo recibido está escrito y es menor que lo que se cobra, bloquear con «Lo recibido no alcanza: faltan S/ X». Si el campo está vacío, sigue siendo opcional.

### 42. Vender emite boletas de más de S/ 700 sin documento, y Cambios y Apartados sí lo piden
**Severidad: Media · Estado: CONFIRMADO · Módulo: Ventas**
**Dónde:** `retail.registrar_venta` y `fn_problema_documento_comprobante`, que no recibe el total. Comparar con `lib/cambios-documentos-reglas.ts:207` y con `separar_prendas`.
- **Qué pasa:** La regla del Reglamento de Comprobantes (art. 8) que el ERP ya aplica en otras dos pantallas no corre en Vender. Está anotada como «por confirmar con Felipe» en `docs/backlog/2026-09-30-flujo-de-negocio-skill.md:24-29`.
- **Cómo reproducirlo:** Una boleta de 5 prendas por S/ 799.50 sin documento: se acepta.
- **Impacto:** Riesgo de cumplimiento ante SUNAT, y la misma compra pasa o no según la pantalla donde se cobre.
- **Arreglo (lo decide Felipe):** Una sola regla con el total dentro de `fn_problema_documento_comprobante`, y que la guía de foco pida el DNI al pasar de S/ 700.

### 43. `redondear2` no redondea igual que la base y traba por un céntimo pagos al contado del Taller
**Severidad: Media · Estado: CONFIRMADO · Módulo: Taller**
**Dónde:** `lib/comprobantes-produccion-reglas.ts:39`. La usan `lib/insumo-compra-reglas.ts:62-66`, `lib/pagar-servicio-reglas.ts:25` y `lib/medios-pago-reglas.ts:43`. Además `InsumoModales.tsx:75`.
- **Qué pasa:** `Math.round((n+EPSILON)*100)/100` no corrige el error de los decimales binarios: 10.1 × 6.95 da 70.19, y la base da 70.20. La web exige su total y la base exige el suyo, así que al contado ningún monto pasa los dos chequeos.
- **Cómo reproducirlo:** En «Llegó una compra», boleta de 10.1 m × S/ 6.95 al contado. O en «Pagar a un servicio», una factura de S/ 98.25.
- **Impacto:** Hay que registrar a crédito y pagar después. Falla en ~1 % de las líneas, y en ~6 % cuando los metros van de medio en medio.
- **Arreglo:** Usar `Math.round(Number((n*100).toPrecision(12)))/100`, que dio 0 diferencias en 1,6 millones de casos, también en `InsumoModales`. Ojo: `medios-pago-reglas` la comparte con Compras.

### 44. Órdenes trae solo las 60 más nuevas y el consejo de producción sugiere fabricar de más
**Severidad: Media · Estado: CONFIRMADO · Módulo: Taller**
**Dónde:** `lib/produccion.ts:77-105` (límite de 60, aunque el comentario dice que siempre trae las en proceso), `app/(app)/produccion/ordenes/page.tsx:66` y `lib/observatorio.ts:392`.
- **Qué pasa:** Una orden en proceso que sea más vieja que las 60 últimas no entra al cálculo de lo que hay en producción, así que el consejo resta menos de lo que corresponde. El Resumen usa un límite de 400 y por eso muestra otra cifra. Está anotado en `docs/backlog/2026-10-13-product-complete-data-237f18.md:9`.
- **Cómo reproducirlo:** 61 órdenes con la más vieja en proceso. En una prueba dentro de un rollback, de 7 órdenes en proceso reales la pantalla vio 0.
- **Impacto:** Cuando el Taller pase de 60 órdenes: sobreproducción y tela comprometida dos veces.
- **Arreglo:** Traer siempre todas las órdenes en proceso y aplicar el límite solo a las terminadas y anuladas. Agregar una prueba con 61 órdenes.

### 45. Un solo apartado trabado hace fallar el vencimiento diario de todas las sedes
**Severidad: Media · Estado: CONFIRMADO · Módulo: Ventas**
**Dónde:** `retail.fn_vencer_apartados_de_todas` y `fn_vencer_separaciones_de`, que no manejan errores. `app/api/apartados/vencer/route.ts` y `lib/separaciones.ts:48-51`.
- **Qué pasa:** Si un APT vencido tiene su apartado ya cerrado (el caso del N.º 2), se deshace toda la corrida: no vence ningún APT ni ningún apartado simple de ninguna sede. El error llega a Sentry como un 500. La pantalla de Apartados de cada sede libera lo suyo al abrirse, menos la sede trabada; los apartados simples no tienen ese respaldo.
- **Cómo reproducirlo:** Un APT con su apartado liberado y otro sano, los dos vencidos. Correr `fn_vencer_apartados_de_todas`: da error y los dos siguen abiertos.
- **Impacto:** Cada día quedan prendas vencidas retenidas como apartadas en las tres tiendas, hasta que alguien arregle el APT a mano.
- **Arreglo:** Aislar cada separación con `begin … exception … raise warning`, marcado como `relleno-a-proposito` y anotado para que se vea. Y cerrar la causa con el N.º 2.

### 46. Los CSV de Existencias, de Ajuste y del registro de compras dejan pasar fórmulas de Excel
**Severidad: Media · Estado: CONFIRMADO · Módulo: Transversal (Inventario y Compras)**
**Dónde:** `apps/web/lib/exportar-csv.ts:9-16` (`textoCsv`), que usan `InventarioPanel.tsx:774-799` y `AjustarInventarioModal.tsx:333-349`. Y `apps/web/lib/comprobantes-lista-reglas.ts:67-70` (`celdaCsv`), en /compras/exportar.
- **Qué pasa:** No le ponen el apóstrofo a un texto que empieza con =, +, - o @, como sí hacen Movimientos, Historial, Ingresos y Reportes (ADR-0230). La base acepta nombres de prenda y de proveedor que empiezan así.
- **Cómo reproducirlo:** Dar de alta en un conteo una prenda llamada `=HYPERLINK("…";"Ver foto")` y exportar Existencias. O un proveedor con ese nombre y «Descargar el mes».
- **Impacto:** Cuando el líder o el contador abren el archivo en Excel, se ejecuta una fórmula o un enlace armado a propósito. Hace falta alguien de adentro.
- **Arreglo:** Mover `sinFormula` a `lib/exportar-csv.ts` y aplicarla en `textoCsv` y `celdaCsv` a todo texto; los números siguen siendo números. Ojo: el reporte de Ajuste manda el cambio como texto «+3», hay que mandarlo como número.

### 47. Nuevo traslado: escribir 0 o más que el stock y pulsar Enviar manda 1 o todo el stock sin mostrarlo
**Severidad: Media · Estado: CONFIRMADO · Módulo: Inventario**
**Dónde:** /inventario/traslados/nuevo. `components/MoverMercaderiaFormV2.tsx:232-287` y `lib/traslado-lineas-reglas.ts:18-21`.
- **Qué pasa:** El clic en «Enviar» hace que la casilla pierda el foco, eso recorta la cifra a un valor entre 1 y el tope, y el envío sale con lo recortado. Con Enter la casilla no pierde el foco y el envío no aplica el tope; la base lo rechaza con «Stock insuficiente: hay 6 y se pide sacar 999». El comentario del código promete aplicar el tope «otra vez al enviar», y eso nunca existió.
- **Cómo reproducirlo:** Escribir 0 (o 99999) y pulsar «Enviar a Tienda Lima» sin salir de la casilla: se envía 1 (o 14).
- **Impacto:** Salen prendas hacia otra sede que nadie quiso mandar. Se puede anular, y la pantalla de éxito sí muestra la cantidad real.
- **Arreglo:** Al enviar, si lo recortado es distinto de lo escrito, no enviar y marcar la línea («Escribe 1 o más», «Solo hay N»). Agregar el caso en `traslado-lineas-reglas.test.ts`.

### 48. «Dejar pasar sin tela» se graba una vez más en cada intento
**Severidad: Baja · Estado: CONFIRMADO · Módulo: Taller**
**Dónde:** `components/orden-pagina/PasarAlStockModal.tsx:105-106`, `:161-170`, `:199-202` y `:410`, y `retail.permitir_pasar_sin_tela`.
- **Qué pasa:** Grabar el permiso antes del cierre es a propósito, pero la hoja no recuerda que ya lo pidió. Si el cierre vuelve con «costo atípico», que es un camino normal, y se confirma, la hoja vuelve a pedir el permiso. La función lo inserta sin mirar si ya existe. Tras un corte de red no pasa, porque el refresco lo resuelve.
- **Cómo reproducirlo:** Una orden sin tela con costo atípico: «Pasar al stock», escribir el motivo, «Sí, es correcto». Quedan dos filas de permiso y dos anotaciones en Actividad.
- **Impacto:** La historia y Actividad se repiten. No toca stock ni dinero.
- **Arreglo:** Un `useRef` que recuerde que el permiso ya se dio, o que `permitir_pasar_sin_tela` devuelva el que ya existe.

### 49. «Recordar en la ficha del modelo» se calla cualquier error
**Severidad: Baja · Estado: CONFIRMADO · Módulo: Taller**
**Dónde:** `NuevaOrdenProduccionForm.tsx:875-886` y `orden-pagina/AgregarPasoModal.tsx:229-235`.
- **Qué pasa:** supabase-js no lanza excepciones: devuelve el error en `{ error }`, y aquí nadie lo lee. El `catch` solo atraparía una excepción que nunca llega, incluido el corte de red que su comentario dice cubrir.
- **Cómo reproducirlo:** Llamar `guardar_proceso_modelo` con un proceso que no existe, o sin red: la pantalla no avisa nada.
- **Impacto:** La siguiente orden del modelo vuelve a sugerir las fases de antes y nadie sabe por qué. La orden sí se abrió.
- **Arreglo:** Leer `{ error }` y avisar con «La orden se abrió, pero no se pudo recordar en la ficha».

### 50. Eficiencia muestra cualquier error al leer la planilla como si faltara la vista
**Severidad: Baja · Estado: PLAUSIBLE · Módulo: Taller**
**Dónde:** `lib/eficiencia.ts:28`.
- **Qué pasa:** Cualquier error se convierte en el estado `sin_vista` y no queda registro. Que la pantalla tolere el error es a propósito (lo dice el comentario de ADR-0133) y el texto que se ve es neutro; un escéptico lo refutó por eso. Lo que sí queda en pie es que el error real se pierde.
- **Arreglo:** Distinguir los códigos de vista inexistente (PGRST205 y 42P01) del resto, y registrar los demás con `capturarError`.

### 51. Revertir el cierre de una orden saca del piso de venta lo que el cierre metió al almacén
**Severidad: Baja · Estado: CONFIRMADO · Módulo: Taller**
**Dónde:** `retail.revertir_produccion` usa la sububicación de venta y `cerrar_produccion` la de entrada.
- **Qué pasa:** Hoy no se ve: el Taller solo tiene racks, y para los dos casos la sububicación es NULL. Si un líder le crea al Taller un piso y un almacén por SQL, revertir falla con «Stock insuficiente» o saca del piso prendas que no eran de la orden.
- **Arreglo:** Que revertir saque las prendas de la misma sububicación donde entraron con esa orden y variante.

### 52. La vigía no ve los estados imposibles del Taller y el libro de insumos se puede editar
**Severidad: Baja · Estado: CONFIRMADO · Módulo: Taller**
**Dónde:** `scripts/chaos/invariantes.mjs` (30 invariantes, ninguna sobre órdenes ni fases) y `retail.movimientos_insumo`, que no tiene disparador que impida editar ni borrar.
- **Qué pasa:** Con una orden terminada con prendas afuera y otra con más corte que el plan más 3 ya guardadas, las 30 invariantes salen limpias. A `movimientos_insumo` solo lo protege que no haya políticas de escritura, el mismo esquema que la decisión D-22 consideró insuficiente para `movimientos`.
- **Arreglo:** Agregar las invariantes «orden no en proceso con salidas sin vuelta», «corte mayor que plan + 3» y «costo de maquila distinto de lo devengado», cada una con su autoprueba. Y un disparador BEFORE UPDATE OR DELETE en `movimientos_insumo`; hoy ninguna función lo edita.

### 53. Un plazo de crédito gigante hace caer la pantalla de Insumos
**Severidad: Baja · Estado: CONFIRMADO · Módulo: Taller**
**Dónde:** `retail.guardar_proveedor_produccion` y `ProveedorProduccionModal.tsx:107` (solo exigen mayor que 0), `lib/insumo-compra-reglas.ts:85` y `LlegoUnaCompraModal.tsx:116`.
- **Qué pasa:** Con un plazo de 8 cifras (99.979.216 días o más) la fecha queda inválida, y la pantalla cae con `RangeError` al elegir ese proveedor en «Llegó una compra». Un cero de más (3000) no la tumba: deja una fecha absurda que se puede corregir.
- **Arreglo:** Un CHECK entre 1 y 730 días en la base y en el modal, y validar la fecha antes de convertirla.

### 54. Un saldo inicial enorme al crear una tela muestra el error crudo de Postgres
**Severidad: Baja · Estado: CONFIRMADO · Módulo: Taller**
**Dónde:** /produccion/insumos › Nueva tela. `lib/tela-nueva-reglas.ts:120-130` (sin tope) y `lib/error-escritura.ts` (sin traducción para el código 22003).
- **Qué pasa:** Con 99999999999 m en «Ya tengo» sale «Código: numeric field overflow · A field with precision 12, scale 3…». No se guarda nada. Con 900.000.000 m la base sí lo acepta; el tope de negocio ya figura como pendiente en `docs/chaos/README.md:81`.
- **Arreglo:** Un tope en pantalla (por ejemplo, 100.000 m) y una frase para el código 22003.

### 55. La guía del proveedor dice «Todo listo» con el RUC y el plazo en error
**Severidad: Baja · Estado: CONFIRMADO · Módulo: Taller**
**Dónde:** /produccion/proveedores › Nuevo proveedor. `lib/proveedor-produccion-guia.ts:30` y `:33`.
- **Qué pasa:** Un campo cuenta como hecho solo con estar lleno. Con un RUC de 5 dígitos y plazo -5, los campos muestran su error y el pie dice «Todo listo para guardar.». Al guardar se rechaza con un aviso en la esquina. Contradice `.claude/rules/guia-de-foco.md`, puntos 1, 5 y 6.
- **Arreglo:** Que un campo cuente como hecho solo si está lleno y sin error, y que el rechazo use `guia.marcarError`.

### 56. El nombre del CSV de Existencias y del reporte de Ajuste usa la fecha UTC
**Severidad: Baja · Estado: CONFIRMADO · Módulo: Inventario**
**Dónde:** `InventarioPanel.tsx:799` y `AjustarInventarioModal.tsx:335-337`.
- **Qué pasa:** Desde las 19:00 de Lima, el archivo sale con la fecha del día siguiente. El 31-12 a las 21:00 sale con el año siguiente.
- **Arreglo:** Usar `hoyLima()` en las dos líneas.

### 57. Existencias calcula «en camino» y nadie lo usa desde ADR-0709
**Severidad: Baja · Estado: CONFIRMADO · Módulo: Inventario**
**Dónde:** `InventarioPanel.tsx:19`, `:231` y `:602`, y `app/(app)/inventario/page.tsx:164-167` y `:265-276`.
- **Qué pasa:** La prop `enCamino`, la función `mostrarTablaFiltrada` y la importación de `Modal` quedaron sin uso. La página sigue consultando `getTrasladosEnCurso` en cada carga solo para armar ese dato.
- **Arreglo:** Quitar la prop, la función, la importación, el cálculo y la consulta.

### 58. Un precio de 0.004 pasa el candado de precio cero y se guarda como S/ 0.00
**Severidad: Baja · Estado: CONFIRMADO · Módulo: Inventario**
**Dónde:** `retail.catalogo_actualizar_producto`, que compara sin redondear, y `crear_producto_con_variantes`, que compara con = 0.
- **Qué pasa:** 0.004 no es menor o igual que 0, pero la columna lo guarda como 0.00, en una variante activa de una categoría que no admite precio cero. Solo pasa por la API, y la venta igual lo rechaza.
- **Arreglo:** Comparar con `round(precio, 2)` en las dos funciones. Un disparador en `variantes` ya se descartó en ADR-0384.

### 59. Al reimprimir la venta de un apartado entregado, el adelanto sale sin nombre
**Severidad: Baja · Estado: CONFIRMADO · Módulo: Ventas**
**Dónde:** `lib/venta-detalle-reglas.ts:105` y `:125`, `ReciboTermico.tsx:153-156`, `BoletaA4.tsx:141-143` y `DetalleVentaModal.tsx:251-254` y `:351`.
- **Qué pasa:** El pago de tipo 'anticipo' llega al papel sin nombre, y la reimpresión no pone «CANCELADO» como el papel que se dio al entregar. Va contra ADR-0399.
- **Arreglo:** Tratar 'anticipo' igual que el redondeo al armar el detalle (fuera de los pagos reales y con el recibo sin pagos), y darle nombre en el detalle.

### 60. Si el reembolso es mayor que lo pagado, la web solo avisa y la base lo rechaza
**Severidad: Baja · Estado: CONFIRMADO · Módulo: Ventas**
**Dónde:** `lib/devoluciones-reglas.ts:347-354` y `DevolucionesPendientes.tsx:226` y `:381`.
- **Qué pasa:** El aviso ámbar viene de cuando el tope vivía solo en la pantalla. ADR-0177 lo convirtió en candado de la base y la web nunca se puso al día; su prueba todavía fija el comportamiento viejo.
- **Arreglo:** Que ese caso bloquee el botón, y actualizar `devoluciones-reglas.test.ts:247`.

### 61. Al volver a Cobrar después de cambiar el ticket, el pago sigue con el total viejo
**Severidad: Baja · Estado: CONFIRMADO · Módulo: Ventas**
**Dónde:** `components/PuntoDeVenta.tsx:2638-2642` (botón Cobrar) frente a `:2066-2072` (atajos F1 a F6).
- **Qué pasa:** Efectivo en 100, volver al ticket, agregar otra prenda y Cobrar: el efectivo sigue en 100 con un total de 200 y aparece «Falta S/ 100.00». Con F1, en cambio, el pago se rehace. Conservar el medio elegido es a propósito (ADR-0044); conservar el monto viejo, no.
- **Arreglo:** Al volver a Cobrar, si hay un solo medio sin monto fijo, ponerle el total actual. Hacerlo como regla aparte, con su prueba.

### 62. Ventas › Historial muestra el redondeo con su nombre interno
**Severidad: Baja · Estado: CONFIRMADO · Módulo: Ventas**
**Dónde:** `lib/ventas-historial-reglas.ts:294-296` y `HistorialVentasLista.tsx:225`.
- **Qué pasa:** Sale «Efectivo + redondeo», y ADR-0311 §8 pide que la lista diga solo «efectivo».
- **Arreglo:** No listar el redondeo en esa fila, o usar el nombre que ya usa el Pulso.

### 63. Entregar un apartado que se liberó porque el cliente desistió dice que «venció»
**Severidad: Baja · Estado: CONFIRMADO · Módulo: Ventas**
**Dónde:** `retail.entregar_separacion`, que usa un solo mensaje para «liberada» y «devuelta».
- **Qué pasa:** No mira el motivo de la liberación (venció, el cliente desistió o hubo un error al cargar), y el texto además dice «la clienta».
- **Arreglo:** Un mensaje según el motivo, y otro para «devuelta», hablándole a cualquier cliente.

### 64. `registrar_venta` responde con mensajes crudos o equivocados ante montos inválidos
**Severidad: Baja · Estado: CONFIRMADO · Módulo: Ventas**
**Dónde:** `retail.registrar_venta`, `fn_exigir_ofertas_de_grupo` y `lib/error-escritura.ts:296-299`.
- **Qué pasa:** Un descuento negativo responde con un texto sobre ofertas de grupo. NaN responde «cannot convert NaN to bigint». El texto del 35 % dice «nadie puede aplicarlo», cuando desde la decisión del 2026-10-01 ese tope aplica solo al líder. Los dos primeros casos solo llegan por la API.
- **Arreglo:** Validar al principio que el precio y el descuento sean números válidos y no negativos, con un mensaje propio. Corregir la frase del 35 % («solo un líder tiene ese tope») y su prueba.

### 65. El seed local pone la misma serie B001/F001 en todas las tiendas y la segunda no puede emitir boletas
**Severidad: Baja · Estado: PLAUSIBLE · Módulo: Ventas**
**Dónde:** `supabase/seed.sql:119-123` y `retail.series_comprobantes`, sin índice único por tipo y serie.
- **Qué pasa:** En local y en una base recién creada, vender con boleta en la segunda tienda choca con el índice único de comprobantes. Que no haya índice en las series es a propósito (`20260922234100`, por bases viejas con series repetidas). Qué serie siembra el seed está «sin decidir» por Felipe. Producción ya tiene series distintas y la pantalla traduce este error. Un escéptico lo refutó.
- **Arreglo:** Series distintas por tienda en el seed, cuando Felipe lo decida.

### 66. Recargar a mitad del cobro muestra «venta guardada sin conexión» aunque ya se guardó
**Severidad: Baja · Estado: PLAUSIBLE · Módulo: Ventas**
**Dónde:** `components/PuntoDeVenta.tsx:2229-2264`.
- **Qué pasa:** La recarga corta la petición, eso se interpreta como falta de red y la venta pasa a la cola. No se duplica, porque usa el mismo token. En local la cola tarda unos 30 s en vaciarse por cómo `next dev` monta dos veces los componentes; en producción se limpia con el primer reenvío. Un escéptico lo refutó como decisión documentada (ADR-0398).
- **Arreglo (opcional):** Al recuperar después de una recarga, preguntar primero si ese token ya se guardó.

### 67. Compras lee los montos con lectores propios en vez de la regla única
**Severidad: Baja · Estado: CONFIRMADO · Módulo: Compras**
**Dónde:** `recepcion-envio/HojaPrenda.tsx:364`, `:457-458` y `:836` (costo de la prenda en Recibir), y `lib/nos-debe-reglas.ts:861-870` (`leerMontoDeposito`), que usa `nos-debe/HojaDeposito.tsx:130`.
- **Qué pasa:** Cambian la coma por punto a mano en lugar de usar `leerMontoPlata` (ADR-0419). En Recibir, «1,299» llega al cierre como «1.299», que se rechaza, y a la propuesta de precio como S/ 1.30. «1,299.50» se descarta en silencio y queda el costo de la línea. En Nos debe, «1,299» se rechaza con «hasta 2 decimales» y «1,299.00» con «solo números».
- **Impacto:** Los costos de más de S/ 999 escritos con separador de miles no pasan o se pierden. No se guarda nada equivocado.
- **Arreglo:** Usar `leerMontoPlata` en los dos lugares y mostrar el problema en el mismo campo. Sumar `leerMontoDeposito` a la tabla de `lib/monto-lectores.test.ts`; `nos-debe-reglas.test.ts:758` todavía fija el rechazo viejo.

### 68. Al completar el papel, el aviso dice «pagada del fondo» aunque al subir el monto quede un saldo
**Severidad: Baja · Estado: CONFIRMADO · Módulo: Compras**
**Dónde:** `components/mi-plata/PapelesPorCompletar.tsx:352-356`, y el bloque «Pago», que calcula con el monto anterior.
- **Qué pasa:** El aviso compara contra el monto viejo, mientras la base deja la compra a crédito con la diferencia por pagar en 7 días. Si se baja el monto, pasa lo contrario.
- **Arreglo:** Comparar contra el monto que se manda, o leer el total que devuelve la función.

### 69. Abrir `/compras/factura/<id>` con un id mal formado tumba la pantalla en vez de decir «no existe»
**Severidad: Baja · Estado: CONFIRMADO · Módulo: Compras**
**Dónde:** `app/(app)/compras/factura/[compraId]/page.tsx:26` y su ventana interceptada (`:35`). En /compras/ordenes/ver/[id], que está deprecada, solo deja ruido en el registro del servidor.
- **Qué pasa:** No se valida el id. Postgres responde «invalid input syntax for type uuid» y eso aparece como «Pantalla caída». Es el mismo caso que ADR-0421 arregló solo en la ficha del proveedor.
- **Arreglo:** `if (!esUuid(compraId)) notFound()` en la página y «Factura no encontrada» en la ventana.

### 70. Compradores consulta la base antes de comprobar el módulo
**Severidad: Baja · Estado: CONFIRMADO · Módulo: Compras**
**Dónde:** `app/(app)/compras/compradores/page.tsx:19` y `[personaId]/page.tsx:27`.
- **Qué pasa:** El layout pide el módulo, pero Next dibuja el layout y la página al mismo tiempo. Una cuenta sin el módulo «fondos» dispara 8 llamadas que la base rechaza (403) y deja 4 `console.error` por visita antes de ir al Inicio. No se filtra ningún dato.
- **Arreglo:** `await exigirModulo("fondos")` antes del `Promise.all`, como hace `por-pagar/page.tsx:46`.

### 71. Proveedores acepta contacto, teléfono, banco y cuenta de cualquier largo
**Severidad: Baja · Estado: CONFIRMADO · Módulo: Compras**
**Dónde:** `retail.registrar_proveedor` y `actualizar_proveedor`, y `ProveedorModal.tsx:420`, `421`, `510` y `517`, sin `maxLength`.
- **Qué pasa:** Se guardan textos de 5.000 caracteres. Un nombre de más de 120 sí se rechaza y la web lo muestra como un aviso genérico, aunque el campo deja escribir hasta 200. Los datos de pago que de verdad se usan (CCI, billetera y titular) sí tienen candado.
- **Arreglo:** Topes en las dos funciones (contacto 120, teléfono 20, banco 60, cuenta 30) y `maxLength` en el modal. Alinear el nombre a 120.

### 72. «Me dieron plata»: con un monto imposible, el botón repite la cifra
**Severidad: Baja · Estado: CONFIRMADO · Módulo: Compras**
**Dónde:** `lib/mi-plata-reglas.ts:548-550` (`fraseAnotar` no mira el tope) y `AnotarPlata.tsx:344`.
- **Qué pasa:** Con 99999999999, la guía dice «no puede pasar de S/ 1,000,000.00» y el botón dice «Anotar S/ 99,999,999,999.00». Que el botón no se desactive es a propósito (ADR-0611, mejora 4): al tocarlo no se envía nada y el foco vuelve al monto.
- **Arreglo:** Que `fraseAnotar` devuelva «Anotar la plata» cuando el monto pasa el tope.

---

## 4. Responsive

### 4a. Pantallas obligatorias a 375 px (Vender, Apartados, Cambios, Devoluciones)

### 73. /vender/apartados, Historial, a 375 px: la página se corre 4 px de lado
**Severidad: Media · Estado: CONFIRMADO · Módulo: Ventas**
**Dónde:** `components/apartados/TodosVista.tsx:385`. Las píldoras usan `-mx-5 px-5`, pero el contenedor tiene `px-4`.
- **Qué pasa:** Las píldoras de período se salen 20 px hacia los lados y el contenedor solo deja 16, porque el vidrio Serena le quitó el relleno a `.ap-cuerpo`. El ancho real queda en 379 px en una pantalla de 375. En el teléfono, la página se agranda y se mueve de lado.
- **Cómo reproducirlo:** Abrir /vender/apartados a 375 px y entrar a Historial.
- **Arreglo:** Cambiar a `-mx-4 px-4` y sumar la pestaña Historial al barrido a 375 px.

### 74. Hoja de cobro a 375 px: el campo del monto en el pago mixto mide 25 px y un toque fuera de él quita ese medio de pago
**Severidad: Baja · Estado: CONFIRMADO · Módulo: Ventas**
**Dónde:** `components/punto-de-venta/HojaDeCobro.tsx:242-252` y `:280-290`. La clase `.hoja-cobro-monto` no está en `tacto.css`.
- **Qué pasa:** Con dos medios, el campo del monto mide 92×25 px. Tocar el recuadro del medio fuera del campo quita ese medio. Chrome corrige los toques que caen cerca, y el monto pasa al otro medio (no se pierde). Aun así, el cobro puede quedar registrado con un medio distinto al real.
- **Arreglo:** Que `.hoja-cobro-monto` mida 44 px cuando se usa con el dedo (`pointer: coarse`).

### 75. /vender/apartados a 375 px: controles del cliente y del adelanto de 24 a 36 px
**Severidad: Baja · Estado: CONFIRMADO · Módulo: Ventas**
**Dónde:** `ApartarVista.tsx`:
- `:1161`: boleta y factura, 82×32
- `:1119`: «Cambiar», 72×27
- `:1218` y `:1247`: montos, 80×32
- `:1289-1291`: medios de «Le devolvemos por», 79×32
- casilla de condiciones: 187×24
- Tienda y TikTok: 84×36
- **Qué pasa:** Todos quedan por debajo de los 44 px que pide la regla para el dedo. Los medios del adelanto (96×50) sí cumplen. Los que tocan dinero son los campos de monto.
- **Arreglo:** Agregar `area-dedo`, o `h-11` con `pointer: coarse`, a esas piezas.

### 4b. Resto

### 76. /vender entre 1024 y unos 1250 px: el ticket aplasta el nombre de la prenda
**Severidad: Alta · Estado: CONFIRMADO · Módulo: Ventas**
**Dónde:** `components/punto-de-venta/LineaDelTicket.tsx:78-110` y `PuntoDeVenta.tsx:2706`, que fija la columna del ticket en `clamp(320px, 40%, 420px)`.
- **Qué pasa:** En escritorio cada línea del ticket va en una sola fila: el nombre junto a la cantidad, el importe y la papelera, que tienen ancho fijo. Con el ticket de 320 a 339 px, al nombre le quedan 18 a 39 px («Blu / Em»). El detalle se monta sobre el «−» de la cantidad y cada línea mide unos 177 px de alto. La fila en dos renglones solo se activa cuando la pantalla mide menos de 640 px. No viene del cambio del 2026-11-25: la fila ya era así antes.
- **Cómo reproducirlo:** Abrir /vender a 1024×768 con 3 prendas. Plegar el menú lateral ayuda (el nombre llega a 52 px), pero no lo arregla.
- **Impacto:** En una laptop de caja de 1024 a 1280 px, o en una de 1366 px con zoom al 125 %, no se lee qué prenda ni qué talla se está cobrando.
- **Arreglo:** Decidir la fila en dos renglones según el ancho del ticket y no el de la pantalla: `@container` en el ticket y `@max-[26rem]` en lugar de `max-sm:`. Agregar una prueba de navegador a 1024×768 que exija al menos 80 px para el nombre.

### 77. Existencias: el aviso «Se acabó: …» de una tarjeta hace correr la página de lado
**Severidad: Media · Estado: CONFIRMADO · Módulo: Inventario**
**Dónde:** `components/existencias/PieTarjeta.tsx:101`, cuya raíz no tiene `min-w-0`, y la envoltura en rejilla de `ExistenciasTarjetas.tsx:454`.
- **Qué pasa:** Con muchas tallas agotadas, el aviso crece hasta su ancho natural y no se corta. A 375 px la página mide 718 px de ancho y el selector de sede queda fuera de la pantalla. En escritorio el pie se monta sobre la tarjeta de al lado y le tapa el «Más». La causa está en el pie: la tarjeta ya tiene `min-w-0`, al contrario de lo que decía el hallazgo original.
- **Cómo reproducirlo:** Un modelo con 7 o más tallas agotadas, por ejemplo calzado del 34 al 42. El caso medido fue una falda de prueba con 20 tallas.
- **Arreglo:** Agregar `min-w-0` a la raíz de `PieTarjeta`; se probó y la página vuelve a 375 px. Otra opción es `grid-cols-[minmax(0,1fr)]` en la envoltura. Mejor aún, resumir el aviso: «Se acabó en N tallas».

### 78. Por pagar del Taller: el nombre largo del proveedor no se corta y la hoja de pago sale cortada a 375 px
**Severidad: Media · Estado: CONFIRMADO · Módulo: Taller**
**Dónde:** `components/PorPagarProduccionPanel.tsx:242-244` (un `truncate` aplicado a un span en línea), `PagarComprobanteProduccionModal.tsx` y `components/ui/Modal.tsx:279-291`.
- **Qué pasa:** Un `truncate` sobre un span en línea no corta nada, así que el texto se sale de la tarjeta. Una razón social S.A.C. normal ya tapa el monto a 375 px. Con 59 caracteres, la página corre 135 px de lado a 375 px y 18 px a 768 px. A 375 px la página se agranda y la hoja «Pagar comprobante» se dibuja con 510 px de ancho: el saldo y el monto quedan fuera de la pantalla. Abierta desde /produccion/comprobantes, la misma hoja se ve bien. En escritorio solo falla con nombres de más de 100 caracteres.
- **Impacto:** La pantalla de pagos del líder no se lee en el teléfono. El Taller se usa sobre todo en escritorio.
- **Arreglo:** Poner el nombre en `block truncate` (o en una fila `flex` con `min-w-0`) y el chip aparte. Como defensa, limitar la hoja de `<Modal>` a `max-width: 100dvw`.

### 79. Detalle de factura: el botón «Cerrar con faltante» queda escondido dentro de una celda que corta el texto
**Severidad: Media · Estado: CONFIRMADO · Módulo: Compras**
**Dónde:** `components/CompraDetalle.tsx:297` y `:313`, y `components/ui/Tabla.tsx:158`, donde `celda("izq")` aplica `truncate`.
- **Qué pasa:** El botón va en la misma línea, dentro de la celda del producto. Como la celda oculta lo que sobra con «…», el navegador cambia el botón por los puntos suspensivos y no se ve, aunque sigue recibiendo el clic. Pasa en la ventana que se abre desde Por pagar en todos los anchos, y en la página a 1024 y 375 px. En la página a 1280 px o más sí se ve.
- **Impacto:** La acción que cierra el faltante de una línea, que toca dinero y stock, no se puede descubrir.
- **Arreglo:** Una celda sin `truncate` para esa columna, con el nombre en su propio `span` con `block truncate` y el botón en su propia línea.

### 80. /vender a 1024×768 y 1280×720: el pie del ticket ocupa más de la mitad y se ve menos de una prenda
**Severidad: Media · Estado: CONFIRMADO · Módulo: Ventas**
**Dónde:** `PuntoDeVentaTicket.tsx:453` (lista con `min-h-40`) y `:601` (pie). En `vidrio/vender.css:62-90` el pie solo se compacta en la hoja del celular.
- **Qué pasa:** Con 3 prendas, la lista visible mide de 165 a 174 px y el pie de 337 a 377 px, así que solo se ve parte de la primera línea. A 1440×900 entran las tres.
- **Impacto:** En las laptops más comunes, la caja no ve de un vistazo qué está cobrando. Mejora también al arreglar el N.º 76.
- **Arreglo:** Compactar el pie según el alto disponible también en escritorio: subtotal e IGV en una línea, y «Mandar a la caja» junto a «Cobrar».

### 81. /vender/apartados entre 1024 y unos 1049 px: «Opciones» queda debajo del ticket
**Severidad: Media · Estado: CONFIRMADO · Módulo: Ventas**
**Dónde:** `components/apartados/ApartadosPanel.tsx:111`, una fila sin `flex-wrap` ni `min-w-0`.
- **Qué pasa:** La fila de pestañas mide 388 px dentro de una cabecera de 332 px, y el ícono de «Opciones» queda debajo del ticket, así que el clic no llega. Es la única forma de abrir las opciones de Apartados. Con el menú lateral plegado sí funciona.
- **Impacto:** El líder no puede abrir la configuración de Apartados en una laptop o tablet de 1024 px.
- **Arreglo:** `flex-wrap` y `min-w-0` en la fila, o sacar «Opciones» de esa fila cuando el ancho está entre `lg` y `xl`.

### 82. Hojas largas con los botones debajo del pliegue (sin `pie-hoja-fijo`)
**Severidad: Media · Estado: CONFIRMADO · Módulo: Transversal (Taller e Inventario)**
**Dónde:**
- `components/ProveedorProduccionModal.tsx:308-328`: el pie está dentro de un `div.space-y-5`, y ahí `sticky` no funciona.
- `components/PagarComprobanteProduccionModal.tsx:66-101`: no tiene pie fijo.
- `components/existencias/FlujoTalla.tsx:1081-1142` («Colgar en el piso»): el cuerpo nunca se desplaza porque la hoja no recibe `altoFijo` (`PanelTalla.tsx:260` y `:759`).
- **Qué pasa:** «Guardar cambios», «Agregar al directorio», «Pagar S/ … y saldar» y «Continuar» quedan fuera de la vista a 1024×768, 1280×720, 1366×768 y 375 px. En «Colgar en el piso» se ve a 1440 px. Va contra la regla «Botones a la vista en una hoja larga» (`.claude/rules/modales.md:58-63`).
- **Impacto:** El líder o la encargada no ven cómo seguir y pueden cerrar la hoja creyendo que ya guardaron. No se pierden datos.
- **Arreglo:** `pie-hoja-fijo` como hijo directo del `form` en las tres. En `FlujoTalla` también sirve pasar `altoFijo` cuando hay un flujo abierto. Agregar una prueba que exija que todo `.pie-hoja-fijo` sea hijo directo del `form` o de la hoja.

### 83. Recibir un envío: con el dedo, el check «Llegaron» y los tachos se quedan en 28 a 32 px por el orden del CSS
**Severidad: Media · Estado: CONFIRMADO · Módulo: Compras**
**Dónde:** `app/estilos/vidrio/recibir-mesa.css:118-123`, el bloque de `pointer: coarse`, va antes de las reglas de `:124`, `:139`, `:140` y `:146`.
- **Qué pasa:** Las reglas base vienen después del bloque táctil y tienen la misma especificidad, así que le ganan. Solo crecen `.rc-cat-mas` y `.rc-cat-hueco-mas`. En tablet, el check que marca un modelo entero como recibido mide 28×28 px. `lib/tacto.test.ts` no lo detecta.
- **Impacto:** Un toque errado marca un modelo o lo quita. Se puede deshacer y se revisa antes de cerrar.
- **Arreglo:** Mover el bloque táctil al final del archivo y agregar a `lib/tacto.test.ts` un chequeo del orden del CSS.

### 84. Compradores a 768 px: la página corre 66 px de lado y el nombre del comprador desaparece
**Severidad: Media · Estado: CONFIRMADO · Módulo: Compras**
**Dónde:** /compras/compradores (y /compras/fondos), en `components/compras/ListaCompradores.tsx:109-110`.
- **Qué pasa:** Desde `sm`, los chips y el monto no se encogen (`shrink-0`), y la columna del nombre queda en 0 a 2 px apenas la fila tiene un chip. El monto se sale de la tarjeta. A 900 y 1024 px se ve bien.
- **Arreglo:** Poner los chips al costado solo desde `lg` (debajo del nombre antes de ese ancho) y usar `lg:w-44` en el monto.

### 85. Plan de campaña a 375 px: el panel «Avisos» empieza 38 px fuera de la pantalla
**Severidad: Media · Estado: CONFIRMADO · Módulo: Compras**
**Dónde:** /compras/plan, en `components/plan-compra/CentroDeAvisos.tsx:160-162`.
- **Qué pasa:** El panel se ancla solo por la derecha, con un ancho de `min(460px, 92vw)` y sin tope por la izquierda. En /compras/plan el botón no está pegado al borde, así que el panel se sale por la izquierda y el título se lee «…SOS · 2 POR ATENDER». En calendario y presupuesto el panel entra, pero sus botones se cortan por la derecha. Contradice `docs/pantallas/compras-plan.md:17`.
- **Arreglo:** Calcular `left = clamp(MARGEN, botón.right − ancho, innerWidth − ancho − MARGEN)`, o en el celular usar `left` y `right` de 12 px. Y que `.ca-btn` mida 44 px con el dedo.

### 86. Lista de Órdenes a 375 px: «Lista para pasar al stock» se monta sobre la fecha de entrega
**Severidad: Media · Estado: CONFIRMADO · Módulo: Taller**
**Dónde:** `components/ordenes-lista/FilaDeOrden.tsx:21` y `:70-71`, y `components/ui/Chip.tsx:78`, que impide partir el texto.
- **Qué pasa:** Por debajo de 60rem la fila tiene dos columnas de unos 137 px, y la insignia mide unos 175 px. Se sale de su columna y tapa «Sin fecha» o la fecha (25 px de cruce a 375 px; también pasa de 360 a 414 px).
- **Impacto:** Justo la orden lista para entrar al stock es la que no se lee en el teléfono.
- **Arreglo:** Que la celda «Dónde está» ocupe las dos columnas en la vista apilada (`col-span-2`), o usar un texto más corto: «Lista para el stock».

### 87. Conteo: la columna «Estado» se corta sin «…»
**Severidad: Media · Estado: CONFIRMADO · Módulo: Inventario**
**Dónde:** /inventario/conteo/[id], en `components/conteo/ListaConteo.tsx:147` (con `overflow-hidden`) y `:174-178` (columnas fijas desde `@[26rem]`).
- **Qué pasa:** A la columna «Estado» le quedan entre 70 y 88 px, y el chip («Pendiente», «Hay 2 de más», «Confirmado») se corta. Pasa a 320 y 480 px, a 768 px con el menú lateral, y también a 1280 px, porque las tarjetas miden 466 px en la rejilla de dos columnas.
- **Impacto:** Mientras cuenta, la colaboradora no puede leer si la talla está correcta o le falta algo.
- **Arreglo:** Subir el corte de las columnas anchas a unos `@[34rem]`, o darle a «Estado» un mínimo de unos 6.5rem. Que la nota baje debajo del chip.

### 88. Movimientos: en el trayecto «origen → destino» el destino se corta sin «…»
**Severidad: Media · Estado: CONFIRMADO · Módulo: Inventario**
**Dónde:** /inventario/movimientos y /movimientos. `app/estilos/movimientos-sellos.css:86-87` (`overflow: hidden` y `flex-shrink: 0`) y `FilaMovimiento.tsx:134`.
- **Qué pasa:** Entre unos 640 y 1279 px, con el menú lateral, el destino de un traslado queda entero fuera de su caja: se lee «Tienda Lima →» y no aparece «Taller». A 320 px se cortan los íconos. Contradice ADR-0353:81.
- **Impacto:** El dato clave del traslado, adónde fue, no se ve en la lista; sí está en el detalle.
- **Arreglo:** Que el último punto pueda encogerse (`min-width: 0`) y termine en «…». O mostrar solo íconos, según el ancho del contenedor, cuando la caja mida menos de unos 240 px.

### 89. Productos entre 640 y unos 1024 px: «Copiar enlace», «Ordenar por» y «Tamaño» se pisan
**Severidad: Media · Estado: CONFIRMADO · Módulo: Inventario**
**Dónde:** /productos (vista Grilla). `components/FiltrosProductos.tsx:350-358`, una fila sin `wrap`, y `SelectorTamanoGrilla.tsx:42`, de 368 px fijos.
- **Qué pasa:** De 640 a 700 px la página corre 18 px de lado. A 768 px, «Ordenar por:» queda encima de «TAMAÑO». A 1024 px se lee «Ordenar por: M…». Contradice la medición registrada en ADR-0308:91.
- **Arreglo:** `max-lg:flex-wrap` en la fila y «Copiar enlace» solo como ícono hasta `lg`. Otra opción: el selector de tamaño en su propia fila por debajo de unos 1024 px.

### 90. El calendario de «Otra fecha» se sale por la derecha a 375 px
**Severidad: Media · Estado: CONFIRMADO · Módulo: Inventario (la pieza la comparten varios módulos)**
**Dónde:** `components/ui/CampoFecha.tsx:214` y `:391`.
- **Qué pasa:** Si el calendario no cabe ni a la izquierda ni a la derecha, se queda anclado a la izquierda sin tope. A 375 px termina en x=392 y se cortan 2 a 4 px de la flecha y de la columna del domingo; todavía se pueden tocar. La pieza la usan unas 40 pantallas, entre ellas `DetalleApartado` y `TodosVista` de /vender/apartados.
- **Arreglo:** `left = clamp(MARGEN, preferido, innerWidth − 272 − MARGEN)`, y agregar el caso a la prueba del componente.

### 91. Toques de menos de 44 px con el dedo en piezas compartidas y hojas de los cuatro módulos
**Severidad: Baja · Estado: CONFIRMADO · Módulo: Transversal**
**Dónde:**
- **Piezas compartidas:**
  - `Segmentado` (`components/ui/campos.tsx:414`, con `min-h-9`) y `segmento-campo__op` (`SegmentoDeslizante.tsx:194`).
  - Botones de `PasoCantidad`: 36×36 en la fila (la caja sí llega a 44) y 26 en la matriz.
  - `MediosDePago`, «Quitar el medio»: 36×36.
  - Opciones de `MenuAcciones`: 40.
  - `Volver`: 42×42, porque el borde de 1 px le resta.
  - `SelectorMes`: `h-10`.
  - `casilla-input`: 20×20 con etiqueta de 32.
  - `.ca-boton`: 40.
  - `.vacio-chico-accion`: 26.
  - A 768 px: `marco-plegar`, 28×28, y `marco-buscador`, 40×40.
- **Taller:** rubro y billeteras del proveedor, Taller/Afuera, celdas de cantidad y «Anular este comprobante» (189×24).
- **Inventario:** «Ver como» del panel de filtros (`h-7`, 28 px), las franjas `.mv-codigo` de Movimientos (22×12), y «Corregir la talla» y «Ver Beige en el panel» del editor.
- **Ventas:** la fila del color (313×24), DNI/RUC de «Nueva proforma» y el motivo de anular (40 px).
- **Compras:** los chips de medio de la hoja Pagar (30 px), «Todo» (34), «Comparar», la hoja de la prenda de «Mis compras» y las órdenes deprecadas.
- **Con mouse:** algunos quedan por debajo de 24 px (el interruptor de 38×22, `btn-enlace` de 21), pero cumplen la excepción por espaciado de WCAG 2.5.8. El tramo angosto de la barra de Por pagar es a propósito (ADR-0611:112).
- **Qué pasa:** Ninguna de estas piezas está en `app/estilos/tacto.css` ni tiene una excepción escrita a la regla «con el dedo, 44 px» (ADR-0611, mejora 5). `tacto/medir.mjs` solo mide la página a 375 px; no mide las hojas abiertas ni 768 px.
- **Impacto:** Toques errados en el piso de venta o en una tablet, por ejemplo un + de más al colgar prendas o un medio de pago mal elegido en la hoja Pagar.
- **Arreglo:** Sumar esas clases al bloque táctil de `tacto.css`; con las piezas compartidas se arregla casi todo de una vez. Extender `tacto:medir` a las hojas abiertas y a 768 px.

### 92. La invitación «Primera vez aquí» de la guía tapa la última acción a 375 px
**Severidad: Baja · Estado: CONFIRMADO · Módulo: Transversal**
**Dónde:** `app/estilos/guias.css:102-115` (fija, `z-45`, unos 246 px de alto) y `components/guias/MotorGuias.tsx:212-243`. El `main` solo deja 40 px abajo.
- **Qué pasa:** Al llegar al final de la página tapa botones como «Cerrar mi ronda», «Seguir recibiendo», «Paga lo vencido», «Escanear prenda» y «Siguiente página», hasta que se toca «Ahora no». Sale una sola vez por persona y por pantalla.
- **Arreglo:** Mientras se ve en el celular, reservar su alto al pie del `main`, o mostrarla como una hoja desde abajo.

### 93. Bajar al piso, entre unos 640 y 735 px: «Confirmar bajada» se sale de su tarjeta
**Severidad: Baja · Estado: CONFIRMADO · Módulo: Inventario**
**Dónde:** `components/BajarAlPisoForm.tsx:1289`, una fila `sm:flex-row` de 418 px fijos.
- **Qué pasa:** Con el menú lateral abierto la fila no cabe y la página corre hasta 91 px de lado. Es el mismo error que ADR-0124, punto 6: usar `sm:` cuando el menú lateral está desplegado.
- **Arreglo:** Decidirlo según el ancho de la tarjeta (`@container`), o usar `flex-wrap` y `min-w-0`.

### 94. Vista rápida de 375 a 414 px: el selector «Todo · Piso · Almacén» se sale de su píldora
**Severidad: Baja · Estado: CONFIRMADO · Módulo: Inventario**
**Dónde:** `components/vista-rapida/MatrizUnidades.tsx:210-231`, sin la opción `soloIcono`.
- **Qué pasa:** La píldora no se desplaza de lado (`overflow: visible`), aunque el comentario del componente dice que sí. «Almacén» queda fuera, pegado al borde.
- **Arreglo:** Usar `soloIcono` por debajo de `sm`, o una etiqueta corta.

### 95. Tarjeta de Existencias con muchas tallas: la tira de tallas no se lee
**Severidad: Baja · Estado: CONFIRMADO · Módulo: Inventario**
**Dónde:** `app/estilos/existencias-vitrina.css:151-160` (`minmax(0,1fr)` sin mínimo).
- **Qué pasa:** Con 20 tallas cada celda mide de 7 a 13 px. Con las tallas reales (el máximo es 9, en calzado) solo se tocan dos nombres a 375 y 1024 px, y la línea «acabó» se corta. ADR-0331 §6 prometía que la tira se deslizara de lado.
- **Arreglo:** Un ancho mínimo por celda con desplazamiento lateral, o mostrar las primeras N tallas y «+N».

### 96. Productos en el celular: un lugar de nombre largo no se parte y corre la página
**Severidad: Baja · Estado: CONFIRMADO · Módulo: Inventario**
**Dónde:** `app/estilos/vidrio/pantalla.css:681-684` (`.prod-lugar` sin tope y sin partir) y `lib/productos-stock.ts:120` y `:212-215`.
- **Qué pasa:** Con «ZZ Auditoría Ventas Datos 100», que es un dato de prueba, la página corre de 40 a 90 px a 320–414 px, en los tamaños Pequeño y Mediano. Los nombres de las sedes reales se acortan a la ciudad, así que solo lo provocaría una sede nueva con nombre largo. A 320 px hay otro culpable: `.prod-nombre`.
- **Arreglo:** `max-width: 100%`, `overflow: hidden` y «…» en `.prod-lugar`.

### 97. Historial de la prenda a 1920 px: una columna de 768 px centrada
**Severidad: Baja · Estado: CONFIRMADO · Módulo: Inventario**
**Dónde:** `app/(app)/productos/[id]/historial/page.tsx:32` (`mx-auto max-w-3xl`), con la cabecera armada a mano sin `EncabezadoPagina` y con `text-taupe`.
- **Qué pasa:** A 1920 px usa el 47 % del ancho. Va contra ADR-0462 y contra `unificar.md:62`. Es la página que se abre cuando falla la ventana.
- **Arreglo:** Quitar el tope de toda la pantalla, aprovechar el ancho con un resumen o los filtros al costado desde `xl`, y usar `EncabezadoPagina`.

### 98. Nuevo traslado a 1920 px: la prenda y su cantidad quedan a 1.100 px una de otra
**Severidad: Baja · Estado: CONFIRMADO · Módulo: Inventario**
**Dónde:** `components/MoverMercaderiaFormV2.tsx:384` y `:456`.
- **Qué pasa:** El formulario no tiene tope de ancho y el combo de la prenda se estira a 1.458 px. ADR-0462 pide poner tope a los formularios cortos.
- **Arreglo:** Topar el bloque de líneas en unos 56rem, o pasarlo a dos columnas con un resumen.

### 99. Detalle de factura de insumos: el nombre del insumo se corta y no se puede leer entero
**Severidad: Baja · Estado: CONFIRMADO · Módulo: Taller**
**Dónde:** `components/ComprobanteProduccionDetalle.tsx:108` (`truncate` sin `title`, dentro de una hoja `max-w-xl`).
- **Qué pasa:** Con nombres de más de unos 55 caracteres se corta en cualquier ancho. Con los nombres reales, que tienen la forma «Tela · Color», solo se corta a 375 px, y lo que se pierde es justo el color.
- **Arreglo:** `line-clamp-2`, o un `title` con el nombre completo.

### 100. Hoja de cobro a 1024×768 con el menú lateral: la hoja mide 328 px y el botón de factura se corta
**Severidad: Baja · Estado: PLAUSIBLE · Módulo: Ventas**
**Dónde:** `PuntoDeVenta.tsx:2858` y `HojaDeCobro.tsx:481-484` (el rótulo del botón usa `truncate`).
- **Qué pasa:** El motivo largo del botón («La factura necesita el RUC de la empresa») se corta. La distribución 2×2 del documento y la hoja angosta son decisión de ADR-0307, y el ticket muestra el motivo completo al costado. Un escéptico lo refutó.
- **Arreglo (opcional):** Que el rótulo del botón pueda partirse en dos líneas, o un texto más corto.

### 101. Comprobantes: el buscador queda en 256 px y corta su texto de ayuda
**Severidad: Baja · Estado: CONFIRMADO · Módulo: Ventas**
**Dónde:** `components/FacturacionCabecera.tsx:20` y `:56` (`sm:w-64`).
- **Qué pasa:** «Buscar número, cliente, DNI o RUC…» se corta en todos los anchos de escritorio, no solo a 1920 px. El espacio entre las pestañas y el buscador sí es a propósito.
- **Arreglo:** Un texto de ayuda más corto, o un buscador que crezca hasta unos 28rem.

### 102. Proveedores a 375 px: «· todo vencido» se corta
**Severidad: Baja · Estado: PLAUSIBLE · Módulo: Compras**
**Dónde:** `components/ProveedoresRanking.tsx:253-262`.
- **Qué pasa:** Se lee «· todo v…». El corte con «…» está aceptado en la maqueta (`docs/maquetas/proveedores-vidrio-2026-11/README.md:34-35`), y el bloque «Qué hacer» repite el aviso. Un escéptico lo refutó.
- **Arreglo (opcional):** Dejar que la línea se parta en dos en el celular.

---

## 5. Menor

### 103. Pruebas de Postgres que fallan según lo que haya en la base compartida
**Severidad: Baja · Estado: CONFIRMADO · Módulo: Transversal**
**Dónde:**
- **Taller:** `produccion_fases.mjs` (N1), `produccion_ploteo.mjs` (E3), `produccion_catalogo_de_procesos.mjs` (K4) y `producto_taller.mjs` (C2).
- **Ventas:**
  - `ventas_online_canal.mjs` y el caso 18 de `cambio_con_comprobantes.mjs`: vuelven a pegar la migración (DDL) dentro de la transacción.
  - `venta_contrato_ampliado.mjs`: da por hecho que no existen las tablas de Dynamic.
  - `reporte_ventas_ranking.mjs`: elige un producto sin categoría.
  - `vigia_invariantes.mjs`: exige que INV-10 esté limpia.
  - `lecturas_rapidas_y_cambio.mjs`: necesita la base `cayla_carga`, y eso está documentado.
- **Compras:** las `compras_simple_*` eligen la primera prenda activa que encuentran.
- **Qué pasa:** Cuentan tablas enteras en vez de solo las filas que crean. En el CI pasan porque cada tanda arranca con una base nueva; en la base local compartida, no. Lo de la base sucia ya está reconocido (ADR-0202:154, ADR-0377, ADR-0574), y un escéptico lo refutó para el Taller. Queda como un tema de orden y limpieza.
- **Arreglo:** Que cada prueba filtre por los ids que ella misma crea. En las que vuelven a pegar DDL, usar `set local lock_timeout` y reintentar ante los códigos 40P01 y 55P03. Elegir productos que tengan categoría.

---

## Pruebas corridas

### Taller
- **Vitest:** 57 archivos del módulo, 1.555 de 1.555 en verde. Más las guardias transversales: 217 de 217 en verde. Y 10 archivos de responsive, con 112 pruebas en verde.
- **Postgres:** 65 scripts del módulo. En la primera pasada, 52 en verde y 13 en rojo, todos los rojos por bloqueos mutuos (deadlocks) con otros agentes. Repetidos en la base desechable `aud_taller`, los 65 quedaron en verde; `pago_produccion_concurrencia` dio 6 de 6. En la base compartida, la segunda pasada de flujos dejó 4 en rojo por datos (N1, E3, K4, C2) y 2 por deadlock (`ya_estaba`, `datos_y_plan`).
- **Vigía de invariantes:** las 30 quedan limpias aunque haya estados imposibles guardados (ver N.º 52).
- **Ataques propios:** SQL dentro de BEGIN…ROLLBACK, carreras con dos sesiones y COMMIT, y la web con Playwright. Más de 400 estados de responsive explorados y unas 200 mediciones de hojas.
- **eslint:** 0 errores, 4 avisos.

### Inventario
- **Vitest:** 78 archivos del módulo, 2.063 de 2.063 en verde. Además, guardias 92 de 92, por regularizar 104 de 104 y responsive 94 de 94, todo en verde.
- **Postgres:** unos 46 scripts, todos en verde al final. En la primera pasada hubo rojos por interferencia (`danadas_reportar_arreglar`, `claure_perdidas_y_danadas`, el vigía), que pasaron a verde al repetirlos. `traslados_recibir_sin_perder_nada` quedó en 55 de 58 por un traslado ajeno en la base. Las 4 pruebas de concurrencia con base desechable salieron en verde.
- **Invariantes:** 30 de 30 limpias. Autoprueba: 18 vivas, 12 sin datos y 0 ciegas.
- **Barridos de responsive:** 160 casos con la cuenta admin, 155 con la integrante y 24 de conteo. A eso se suman un barrido más fino en 11 anchos y una medición de ancho completo a 1440 y 1920 px.
- **eslint:** 0 errores y 3 avisos (variables sin usar, ver N.º 57).

### Ventas
- **Vitest:**
  - Módulo: 1.338 en verde.
  - Guardias: 212 en verde.
  - Relacionadas: 187 en verde.
  - Lógica de datos: 1.025 en verde.
  - Flujos: 1.434 en verde.
  - Responsive: 39 en verde.
- **Paridad del IGV entre la caja y la base:** 500.000 totales probados, 0 diferencias.
- **Postgres:** unos 57 scripts, casi todos en verde.
  - En rojo:
    - `ventas_online_canal`: por deadlocks y por datos de otros agentes.
    - `reporte_ventas_ranking`: no corrió por un dato.
    - `lecturas_rapidas_y_cambio`: falta la base `cayla_carga`.
    - `venta_contrato_ampliado`: 12 de 13, por un dato.
    - Vigía INV-10: por un dato.
    - `apartados_ofertas_de_grupo`: 8 de 18, porque esta base tiene el candado viejo de `separacion_items`. Lo revisa la lente de base.
  - `sunat_estado_no_retrocede_concurrencia`: 3 de 3 en verde, con base desechable.
- **Invariantes:** 28 de 30 limpias. INV-10 sale con colchones de prueba sin responsable e INV-12 con sospechas de traslados ajenos.
- **Barridos de responsive:** 78 casos con la cuenta admin y 78 con la integrante. Los escenarios de Vender, Apartados, Cambios y Devoluciones se recorrieron en 5 o 6 viewports.

### Compras
- **Vitest:**
  - Módulo: 2.822 en verde.
  - Guardias: 106 en verde.
  - Propias: 7 en verde.
  - Flujos: 1.558 en verde.
  - Responsive: 52 en verde.
- **eslint:** 0 errores y 9 avisos (imports sin usar).
- **Postgres:** 87 scripts, 81 en verde y 6 en rojo.
  - 4 fallan por prendas sin categoría de otros agentes; con un parche que las excluye pasan a verde.
  - `nos_debe` dio 45 de 45 al repetirse.
  - El vigía INV-10 falla por datos ajenos.
  - En los flujos: 16 y 13 en verde. Las otras 6 fallan por interferencia: al aislarlas, 3 pasan a verde y 3 siguen en rojo por datos propios del auditor. `pendientes_de_envio` falla 1 caso por un dato.
- **Carreras propias con COMMIT:**
  - Comprobante repetido: lo reproduce.
  - Bloqueo mutuo: lo reproduce.
  - Anular una compra ya recibida: lo reproduce.
  - Doble guardado de la compra, de la plata y del envío: en verde.
- **Barrido de responsive:** 137 casos con la cuenta admin.

---

## Lo que no se cubrió

- **Producción no se consultó**, por regla. No se sabe:
  - cuántas filas de `movimientos_insumo` u órdenes tiene hoy (N.º 14 y 44);
  - si el Taller real tiene piso o almacén (N.º 51);
  - si los permisos de `anon` ya se revocaron a mano (N.º 33);
  - si hay comprobantes repetidos por los ceros (N.º 10).
- **Taller:** quedaron sin abrir en el navegador estas hojas: Salida, Vuelta, Marcar fase, Quitar paso, Cambiar quién, Cambiar tipo, Revertir y Tela usada; tampoco las hojas de lote (ajustar, corregir y restaurar ingreso) ni Pagar servicio. «Llegó una compra» no se pudo completar desde la web, porque la hoja no tomaba las cantidades escritas por Playwright. Tampoco se probó con una integrante asignada al Taller: el seed no trae ninguna.
- **Inventario:** no se recorrieron de punta a punta en la web el barrido del piso, el cuadre del piso ni el alta de producto en 4 pasos; solo se probaron sus funciones. Por regularizar no tenía casos. No existen en esta base el Taller con stock ni las cuentas de terminal.
- **Ventas:** quedaron sin probar `aprobar_devolucion` con reembolso real, porque necesita la boleta aceptada por SUNAT y está prohibido transmitir. Tampoco se probaron Reportes y Comprobantes con ataques, las proformas por la API, el canje de cupones del club, la venta de la integrante (su caja de Trujillo estaba cerrada) ni la carrera del tope de 3 APT por persona.
- **Compras:**
  - **El servidor `next dev` de :3010 dejó de responder hacia las 14:46 y no volvió.** Desde ahí quedó sin probar en el navegador:
    - Recibir como Micaela (doble clic, dos pestañas);
    - Por pagar, Proveedores, Fondos, Plan, Notas de crédito y Compradores;
    - el barrido de responsive de la integrante;
    - la medición de ancho completo a 1920 px;
    - las hojas del conteo de Recibir.
  - Las rutas con id que no tenían enlace (parte, proveedor y órdenes) no se midieron.
  - Las capturas no se pudieron mirar, porque falló el hook de imágenes; los hallazgos salen de mediciones del DOM.
- **En general:**
  - no se probó en Safari de iOS real, solo en Chromium emulado;
  - no se revisó el modo oscuro;
  - no se probó con el teclado del celular abierto;
  - no hubo integraciones reales: SUNAT/Lucode, padrón de DNI y RUC, y fotos con IA estaban prohibidas.
- **Lo que la auditoría dejó en la base desechable**, para que nadie se confunda:
  - **Conteos:** el conteo `0d40cb5d-…` se reabrió y se volvió a cerrar con una nueva `cerrado_en` (sin movimientos). Quedaron conteos de prueba anulados.
  - **Datos sembrados:** datos AUDRESP, AUDFLU, AUDDOBLE, VERIF6 y AUDVERIF; la sede «ZZ Auditoría Ventas Datos», con dos cajas cerradas y una venta anulada después del cierre; y las prendas «Vestido Auditoria Vf».
  - **Traslados y envíos:** el traslado `777055b4-…` (6 prendas de Lima al Taller, en tránsito), el N.º 307 cerrado y los envíos ENV-000650, 685, 686, 810 y 812.
  - **Ventas y caja:** la boleta B001-000009 en Lima, `marcajes` y `jornadas` creados, las series B001 y F001 de Trujillo archivadas y reemplazadas por B002 y F002, y la ronda RC-000952 de Sandra con S/ 800 por confirmar.
  - **Taller:** las órdenes OP-002745 y OP-002746, y el proveedor «Costura Verif T9».
  - **Bases desechables:** `aud_taller` y `aud_compras` siguen en el contenedor, con los estados imposibles guardados como evidencia.

---

## Refutados (no volver a reportar)

| Título | Por qué se descartó |
|---|---|
| Taller: el resumen pegado abajo en Nueva orden ocupa 288 px a 375 px | La barra pegada abajo, con el responsable, la guía y «Crear otra orden», es una decisión de ADR-0396 (punto 92) y ADR-0509 §6. El campo nunca queda tapado, porque `scroll-padding-bottom` ya lo cuida. Producción es de escritorio y no es una ruta obligatoria a 375 px. |
| Taller: aviso de hidratación de React intermitente | Lo provocaba el propio script de la auditoría, que marcaba botones con `data-explorar` antes de hidratar. La hora ya lleva `suppressHydrationWarning`. En 9 cargas limpias no apareció nunca. |
| Inventario: avisos de hidratación en la consola durante el uso | No se reprodujo en unas 200 cargas. En una prueba de control salió el mismo aviso con solo tocar el HTML desde afuera, así que viene de la sonda, de `OndaBotones` al presionar o de alguna extensión. Además, solo aparece en desarrollo. |
| Ventas: en Reportes, la etiqueta del promedio se dibuja sobre la barra de hoy | El rótulo con fondo de papel encima de las barras es a propósito, según el comentario de `graficos-tiempo.css:105` y la maqueta del commit a4638bbd6. Se lee bien. Y cae sobre la última barra alta, no sobre la de hoy. |
| Ventas: en /devoluciones, «Ver venta», «Cambiar» y «Revisar en Inventario» miden 20 px | Cumplen la excepción por espaciado de WCAG 2.5.8. Con el dedo ya miden 44 px gracias al `::after` de `tacto.css`. Con mouse no hay ninguna regla que pida más. |
| Compras: error de hidratación al abrir Mis compras | En 32 cargas y en los mismos escenarios no apareció. Lo más probable es que `next dev` se estuviera reiniciando mientras corría la prueba. No hay ningún código que dibuje algo distinto en el servidor y en el navegador. |

También se descartaron partes de algunos hallazgos que siguen en pie:

- El precio 0 en cotizaciones de maquila es una decisión documentada (N.º 36).
- El token opcional de `iniciar_traslado` es una decisión documentada (N.º 34).
- El «?» de la hoja de la prenda ya mide 44 px con el dedo (N.º 91).
- Que el botón de confirmar no se apague es a propósito (N.º 72).
- La afirmación de que «la web muestra el error crudo» en Proveedores es falsa: ya se traduce (N.º 71).
- El tramo angosto de la barra de Por pagar es a propósito (N.º 91).
- La causa del N.º 77 no es la tarjeta sino el pie.
- El N.º 76 no es una regresión del 2026-11-25.
