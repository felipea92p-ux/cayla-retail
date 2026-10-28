# Contrato · «Nos debe»: lo que el proveedor le debe a CAYLA (ADR-0362, fase 5)

Felipe pidió la noche del 2026-10-12 «desarrollar de corrido». La fase 5 se apoya en la fase 4 (la recepción guarda los faltantes en
`retail.despacho_diferencias`) y en ADR-0362, decisiones 14, 24 y 27. El mapa de lo que ya existe (saldo a favor, notas de crédito,
reembolsos, la ficha del proveedor, dañadas) lo hizo un agente el 2026-10-12; lo esencial está abajo. Lo que el ADR no decide lo decido
aquí por defecto, marcado **[provisional]**. **Lo que mueve plata o toca la contabilidad espera a Felipe (y al contador)**: queda
escrito como pregunta, sin construir.

## Lo que decidió Felipe

- **14:** cada faltante es UNA deuda del proveedor («2 polos · S/ 50») en estado «por reponer», que se cierra con un toque: «Llegó la
  reposición» (se cuenta en la próxima recepción de ese proveedor) o «Pasar a saldo a favor» (se descuenta del próximo pago). Sin
  plazos automáticos. Se ve en la ficha del proveedor y al crear su próxima orden de compra.
- **24:** se salda con la prenda en el próximo envío o con dinero: el proveedor deposita (reembolso) o se descuenta del próximo pago
  (saldo a favor).
- **27:** una dañada también se puede devolver al proveedor.

## Lo que ya existe (no se reescribe)

- **Saldo a favor** = libro `retail.proveedor_creditos` (solo se agregan filas): `nota_credito` suma; `aplicacion` (pagar con saldo a
  favor) y `reembolso` (el proveedor devolvió la plata) restan. **Hoy el saldo a favor solo nace de una nota de crédito**
  (`fn_insertar_nota_credito_compra`), que primero baja la deuda de su comprobante, deja el resto a favor, prorratea el IGV, asienta
  421/201/4011 y respeta el mes cerrado. El reembolso (`fn_insertar_reembolso_proveedor`, con la cuenta sellada y el cajón) ya existe
  con su hoja en la ficha del proveedor. Cinco RPC de pago ya aceptan `saldo_a_favor` como medio.
- **No se agrega un tipo nuevo de saldo a favor sin nota**: rompería el signo de `fn_saldo_favor_proveedor`, el Balance
  (`fn_bal_saldo_a_favor`, el 421 por dos caminos) y las lecturas de la web.
- **Dañadas:** `resolver_prenda_danada(…, 'devuelta_proveedor', …, p_proveedor_id)` existe (solo líder) y baja el stock de la cuarentena,
  pero no crea deuda ni nota, y la pantalla (`ResolverDanadosModal`) no la ofrece.
  Desde la fase 5b, la pantalla devuelve con `devolver_danada_al_proveedor`, que sí deja la deuda.

## Fase 5a — se construye esta noche (no mueve plata)

Una migración, reservada por la rama `claude/purchase-order-phase5-9b0c82`: `20261013015000_nos_debe.sql` (una parte, sin políticas,
`lock_timeout` de 3 s, re-ejecutable, bloque final que comprueba). Lo que deja la fase 4 y se usa tal cual: `retail.despacho_diferencias`
(`id`, `despacho_id`, `despacho_item_id` —nulo en lo que no estaba en la guía—, `extra_posicion`, `proveedor_id`, `categoria_id`,
`marca_id`, `tipo`, `causa`, `cantidad`, `costo_unitario`, `nota`, `creado_por`, `creado_en`; candado `despacho_diferencias_causa` con
las causas de faltante `no_vino`/`se_perdio`/`otra_sede` y de sobrante `regalo`/`cobra_aparte`/`proxima_compra`), `recibir_despacho`
(20261013002000) y `fn_envio_detalle`.

1. **La deuda, leída** (sin tabla nueva de deudas: la deuda ES la fila de `despacho_diferencias` con `tipo = 'faltante'` y
   `causa = 'no_vino'`):
   - Tabla nueva `retail.proveedor_deuda_resoluciones` (solo se agregan filas; RLS sin políticas): `id`, `diferencia_id` (FK a
     `despacho_diferencias`), `forma` (`repuesta` | `saldo_a_favor` | `deposito` — las dos últimas sin uso hasta la fase 5b),
     `cantidad` (entero > 0), `despacho_id` (la recepción donde llegó la reposición, si fue así), `nota`, `creado_por`, `creado_en`.
     Candado: lo resuelto de una deuda nunca pasa de su cantidad (disparador con `for update` sobre la diferencia).
   - `retail.fn_proveedor_nos_debe(p_proveedor_id uuid) returns jsonb`: las deudas abiertas y las cerradas de los últimos 90 días, con
     `diferencia_id`, envío (`ENV-…`), sede, fecha, categoría · marca · descripción, cantidad, resuelto, pendiente, costo por unidad,
     **monto pendiente** (pendiente × costo de la línea **[provisional: sin IGV; si el papel era factura con IGV, el monto real de lo
     pagado lleva su 18 %, lo dice al lado]**), y las resoluciones. Pide `fn_ve_plata_de_proveedores()` (Proveedores o la plata de
     Compras, decisión 44) o Órdenes de compra.
   - `retail.fn_nos_debe_resumen()`: por proveedor, unidades y monto pendientes (para la lista de proveedores, el aviso de la orden
     nueva y, si se quiere, el Inicio).
2. **«Llegó la reposición» en la recepción** (decisión 14: «se cuenta en la próxima recepción de ese proveedor»): la fase 4 suma la
   causa de sobrante `reposicion_faltante` (en una línea con más de lo enviado o en «algo que no estaba en la guía»). `recibir_despacho` la
   acepta solo si ese proveedor tiene deudas abiertas de esa categoría y marca, y escribe una resolución `repuesta` por lo que alcanza
   (las más antiguas primero, con el `despacho_id` de esta recepción). Lo que pase de lo debido se rechaza con un mensaje claro (es un
   sobrante con otra causa). La prenda entra a stock como todo lo recibido.
3. **«Llegó la reposición» a mano** (cuando la reposición llegó pero se recibió sin marcarla, o el proveedor la entregó de otra forma):
   `retail.resolver_deuda_proveedor(p_diferencia_id uuid, p_forma text, p_cantidad integer, p_nota text, p_token uuid)` con
   `p_forma = 'repuesta'`, nota obligatoria **[provisional]**; con el módulo Proveedores o Recibir. `saldo_a_favor` y `deposito`
   responden «Todavía no: lo decide Felipe con el contador» hasta la fase 5b.
4. **Pantalla:**
   - Ficha del proveedor (`/compras/proveedores/[id]`): sección «Nos debe» donde hoy está el saldo a favor (lo envuelve): las deudas
     abiertas («2 polos · S/ 50 · ENV-000061 · Tienda Trujillo · hace 3 días») con «Llegó la reposición» (hoja con cantidad y nota), y
     abajo las cerradas. Guía de foco en la hoja; `<Vacio>` si no debe nada.
   - Nueva orden de compra: al elegir un proveedor que debe algo, un `<Aviso tono="info">` entre «Proveedor y destino» y «Lo que pides»:
     «Textiles Andina te debe 2 polos (S/ 50) por reponer: pídeselo en esta orden o márcalo cuando llegue».
   - Recepción (fase 4): en la tarjeta de una línea con de más, y en «algo que no estaba en la guía», la causa «Es la reposición de lo que
     faltó» SOLO si ese proveedor debe algo de esa categoría y marca (`fn_envio_detalle` suma `deudas_del_proveedor`).
   - Lista de proveedores: una columna o un chip «Te debe S/ 50» **[provisional]**.

## Fase 5b — lo que decidió Felipe y lo construido (2026-10-15)

Rama `claude/purchase-order-phase5b-9b0c82`. Dos migraciones, en este orden: `20261015145000_nos_debe_saldo_a_favor_esquema.sql` (el
esquema) y `20261015150000_nos_debe_saldo_a_favor.sql` (las funciones). Las dos son de una parte, sin políticas ni `drop trigger`,
re-ejecutables y con un bloque final que comprueba.

**Las preguntas, respondidas:**

1. **Saldo a favor con factura (58):** documento interno al toque, marcado «falta su nota de crédito» hasta que llegue la del proveedor.
   Su IGV no baja el crédito fiscal mientras tanto: espera en la **cuenta puente 4019** «IGV por regularizar» (Felipe 2026-10-15)
   **[provisional: código y nombre hasta el contador]**. Con boleta, nota de venta o sin comprobante: documento interno sin IGV.
2. **«Depositó» (59):** con el módulo Proveedores, el documento interno y el reembolso en una transacción. **[provisional]** El depósito
   tiene que ser exactamente lo que quedó a favor; si todavía se le debe el comprobante, no hay nada que depositar.
3. **Devolver una dañada (60):** la hace quien tiene **Existencias** (Felipe 2026-10-15; este README decía Recibir), solo con **lo que
   llegó dañado en una recepción** y con **el grupo entero**. Queda como deuda «por reponer» con las mismas tres salidas.
4. **Aviso del IGV (61):** en Inicio, sin poder ocultarse, y en el Observatorio del Admin.

**Esquema (145000):**
- `compra_notas_credito.interna`: el documento interno es una nota más del comprobante. Su serie es siempre `DI-…`, numerada por
  `compra_notas_internas_seq`, y la de una nota del proveedor nunca lo es.
- `proveedor_deuda_resoluciones.nota_credito_id`: qué documento saldó con plata cada resolución.
- La cuenta 4019 en `cuentas`.
- `compra_notas_proveedor` y `compra_notas_proveedor_documentos`: la nota 07 que respalda documentos internos de una factura. Se escriben
  solo por funciones y no se editan.
- `despacho_diferencias` acepta la causa `devuelta`, con `prenda_danada_id`:
  - una deuda por prenda;
  - la vista de lo vigente se vuelve a crear para verla;
  - el único «una diferencia vigente por línea» deja fuera lo devuelto.

**Funciones (150000):**
- **El papel y el valor.**
  - `fn_deuda_papel` toma las líneas de comprobante con cupo, con la regla de la recepción. Lo devuelto toma la línea donde se recibió.
  - `fn_deuda_valor_de` / `fn_deuda_valor` dicen cuánto vale, con su IGV si es una factura.
  - `fn_nos_debe_deuda` (reescrita) da el monto pendiente desde el papel, más la causa y la prenda.
- **Escritura.**
  - `fn_pasar_deuda_a_saldo_a_favor` (interna): cierres «no llegó» y el documento interno. Lo devuelto no se cierra y su documento es
    por devolución.
  - `resolver_deuda_proveedor` (reescrita): las formas `saldo_a_favor` y `deposito`, con Proveedores. El depósito le llega en el ajuste
    de la transacción `retail.deposito_de_deuda`, que pone `registrar_deposito_deuda`; así su firma de 5 argumentos no cambia.
  - `adjuntar_nota_proveedor` adjunta la nota del proveedor, con el módulo Notas de crédito.
  - `devolver_danada_al_proveedor` (Existencias, responsable, token): sale de la cuarentena sin `compra_item_id` y nace la deuda `devuelta`.
- **Lecturas.**
  - `fn_notas_proveedor_tablero`: el tablero de Notas de crédito.
  - `fn_igv_en_espera`: el aviso del IGV.
  - `fn_saldo_favor_visible`: el saldo a favor de la ficha, con el permiso de quien ve la plata de los proveedores.
  - `fn_danadas_devolvibles`: qué se puede devolver de la cuarentena.
- **Reemplazos anclados.**
  - Impuestos (`fn_impuestos_compras`, `fn_impuestos_registro_compras`, `fn_igv_credito_fiscal`, `resumen_compras_extra`): no cuentan el
    documento interno; sí la nota del proveedor, desde su fecha.
  - El Diario (`fn_asientos`): el documento interno y su IGV a la 4019; la nota del proveedor saca el IGV de la 4019 y baja la 4011, en
    `fn_asientos_nota_proveedor`.
  - `fn_insertar_nota_credito_compra`: la serie `DI-` es de CAYLA.
  - «Causa `devuelta` también es deuda», en:
    - `fn_nos_debe_del_envio`, `fn_nos_debe_pendiente`, `fn_nos_debe_resumen` y `fn_proveedor_nos_debe`;
    - `fn_plan_compra_pedido` y `fn_recepcion_cerrar`;
    - `fn_proveedor_deuda_resoluciones_candado`.
  - El candado de lo recibido (`fn_recepcion_despacho_fija`) deja nacer la deuda `devuelta` con el envío cerrado, solo desde su función.
  - `reabrir_envio` no la apaga.

**Pantallas:**
- Ficha del proveedor: «Pasar a saldo a favor», «Depositó» y «Llegó la reposición» en cada deuda, y el saldo a favor visible.
- Notas de crédito: «Llegó su nota de crédito» y el estado «Falta su nota de crédito».
- Existencias ▸ Dañadas: «Devolver al proveedor».
- Inicio y Observatorio: los dos avisos del IGV.

**Cambios al construir la 5b, por defecto [provisional]:**
- **La nota del proveedor (07):**
  - El monto se escribe como dice el papel y tiene que coincidir con los documentos que respalda.
  - Una nota puede respaldar varios documentos internos del mismo comprobante.
  - La fecha viene con la de hoy, sugerida.
- **Lo devuelto por llegar dañado:**
  - Lo que llegó de más (fuera de la guía), lo que devolvió un cliente o lo que reportó la tienda no se devuelve con deuda.
  - Lo recibido sin comprobante no tiene plata que pasar.
- **«Depositó»:**
  - La cuenta donde entró es opcional, como en la base y en el reembolso.
  - Propone la de la sede donde faltaron las prendas.

## Pruebas

`scripts/pruebas/nos_debe.mjs` (en `PRUEBAS` del CI): la deuda nace de un faltante `no_vino` (no de `se_perdio` ni `otra_sede`);
resolver a mano con nota; no pasa de lo debido (dos sesiones a la vez); la reposición en la recepción cierra la más antigua primero y no
pasa de lo debido; permisos (Proveedores o Recibir sí; sin módulos, 42501); la forma (security definer, anon no, RLS sin políticas).
Fase 5b (41 casos en total):
- A: saldo a favor con boleta y con factura.
- V: la nota del proveedor.
- D: «Depositó».
- I: el aviso del IGV.
- E: devolver lo dañado y su plata.

## Cambios al construir la 5a (2026-10-12, noche)

- `proveedor_deuda_resoluciones` suma `sobrante_id` (qué sobrante trajo la reposición) y `token_cliente` (único) + `huella`, para que
  un reintento no duplique. Un disparador diferido exige que lo que llegó como reposición quede repartido ENTERO entre las deudas.
- La reposición salda deudas de envíos ANTERIORES, nunca una de la misma recepción (lo que falta en una línea y sobra en otra del
  mismo envío es un cruce, no una reposición). «La más antigua» = la que se anotó primero; a igual fecha, el envío de menor número.
- Una causa por línea: lo de más de una línea lleva una sola; si viene reposición mezclada con otra cosa, va como «algo que no estaba
  en la guía».
- `deudas_del_proveedor` trae también `costo_unitario` (el de la deuda más antigua, para precargar el costo) y no cuenta las del propio
  envío; `fn_nos_debe_resumen` detalla por categoría y marca (el aviso de la orden dice «2 chompas»).
- Leer también se permite con Recibir. El monto con IGV usa `fn_tasa_igv` a la fecha del papel; sin tasa, queda nulo y nada se cae.
- La Actividad de «Llegó la reposición» marcada a mano va en el módulo Proveedores (o Recibir para quien solo tiene Recibir), sin montos.
- Pantalla: «Prendas por reponer» va ENCIMA del saldo a favor (al lado se partía en 4 renglones); la cantidad viene sugerida con todo
  lo pendiente; la hoja usa `pie-hoja-fijo`. No se construyó el chip «Te debe S/ X» en la lista de proveedores.
- **El valor de la causa es `reposicion_faltante`, no `reposicion`:** esa palabra ya es el motivo de movimiento «Encontré prendas», y la
  prueba que vigila esa puerta (`pruebas:cierre-carga-inicial`) las confundía (CI de la fase 5a, 2026-10-12).
