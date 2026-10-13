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
   causa de sobrante `reposicion` (en una línea con más de lo enviado o en «algo que no estaba en la guía»). `recibir_despacho` la
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

## Fase 5b — espera a Felipe y al contador (preguntas, sin construir)

1. **«Pasar a saldo a favor»** con factura: ¿hace falta la nota de crédito tipo 07 del proveedor para tomarlo (crédito fiscal), o se
   registra un documento interno y el contador lo regulariza? Con boleta, nota de venta o «sin comprobante» no hay nota ante SUNAT:
   ¿documento interno sin IGV? Hoy la regla de la nota por faltante («una por comprobante, cuando está resuelto al 100 %») traba los
   comprobantes de orden repartidos entre varias guías.
2. **«Depositó»**: nota (o documento interno) + reembolso en una transacción, como `registrar_nota_credito_compra(p_destino =
   'reembolso')`. ¿Basta el módulo Proveedores (decisión 40) o pide Por pagar (hoy el reembolso lo pide)?
3. **Devolver una dañada al proveedor** (decisión 27): ¿quién lo hace (hoy solo el líder) y queda como deuda «por reponer» igual que un
   faltante (con sus mismas tres salidas)?
4. **Mientras una deuda con factura siga abierta**, CAYLA tiene el IGV de prendas que no llegaron en su crédito fiscal (ADR-0362,
   «Consecuencias ya vistas»): ¿un aviso que no se oculta en Inicio para quien ve la plata de Compras?

## Pruebas

`scripts/pruebas/nos_debe.mjs` (en `PRUEBAS` del CI): la deuda nace de un faltante `no_vino` (no de `se_perdio` ni `otra_sede`);
resolver a mano con nota; no pasa de lo debido (dos sesiones a la vez); la reposición en la recepción cierra la más antigua primero y no
pasa de lo debido; permisos (Proveedores o Recibir sí; sin módulos, 42501); 5b responde «todavía no»; la forma (security definer, anon
no, RLS sin políticas).

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
