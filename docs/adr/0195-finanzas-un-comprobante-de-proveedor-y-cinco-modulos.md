# ADR-0195 — Finanzas: un solo comprobante de proveedor para mercadería, gasto y activo, y cinco módulos

**Fecha:** 2026-09-24 (nació como ADR-0194; renumerado al subir porque `main` ya tenía el 0194 de la prueba de carga)
**Estado:** **APROBADO por Felipe el 2026-09-24** (decisiones A y B). Sin código ni migración: fija el modelo del plan
`docs/PLAN-FINANZAS.md`, que se construye por fases después del spike visual.
**Afecta (cuando se construya):** `compras` (columna `naturaleza`, tipo `recibo_por_honorarios`), `gastos` (ADR-0117,
gana `compra_id`), `activos_fijos` (gana `compra_id`), `modulos` (5 filas nuevas), `lib/modulos.ts`, `lib/menu.ts`.
**Relacionado:** ADR-0109, ADR-0117 y ADR-0120 (PR #170, aprobados, sin fusionar), ADR-0133 (Producción con sus propios
comprobantes), ADR-0161 (roles «ve / no ve»), ADR-0184 y ADR-0187 (Compras por tienda).

## El problema

Un gasto con factura (luz, alquiler, el contador) y un activo (un mostrador, la Zebra) tienen la misma forma que una
compra de mercadería: un proveedor, un comprobante con serie y número, IGV que se puede descontar, contado o crédito, un
vencimiento, pagos parciales y un saldo. Si cada uno vive en su propia tabla:
- «¿Cuánto debe CAYLA?» sale de tres lugares, y alguien tiene que sumarlos a mano.
- El IGV descontable sale de tres lugares, y el registro de compras del contador une tres fuentes.
- La misma factura puede entrar dos veces: una como mercadería y otra como gasto.

Además, si Finanzas fuera un solo módulo en Roles y accesos, darle a una encargada «registrar gastos» también le
mostraría la utilidad de todas las tiendas.

## Decisión

**A. Un solo comprobante de proveedor.** La cabecera de `compras` pasa a ser la de todo comprobante de proveedor, con
`naturaleza` = `mercaderia` (lo de hoy, valor por defecto) | `gasto` | `activo`. El detalle cambia:
`compra_items` (mercadería) · `gastos` de ADR-0117 con `compra_id` (gasto) · `activos_fijos` con `compra_id` (activo).
El gasto **sin** comprobante de proveedor (Yape de movilidad, mototaxi del cajón) sigue siendo solo una fila de `gastos`,
con los caminos A, B y C de ADR-0117. La pantalla de registro vive en Finanzas; Compras no cambia de cara.

**B. Cinco módulos:** `gastos`, `cuentas_dinero`, `reportes_financieros`, `impuestos` y `cierre_mes`. Todos nacen solo
para el líder; `cierre_mes` no es delegable. Con `gastos`, `cuentas_dinero` o `reportes_financieros`, una cuenta ve
**solo su tienda** (el mismo criterio que Compras, ADR-0184); el líder ve todas y lo «de la empresa».

**Cambia de ADR-0117:**
- «Solo el líder registra gastos» → el que tenga el módulo, en su tienda (ADR-0161 llegó después y manda).
- «No hay gastos por pagar» → un gasto con factura a crédito queda en Por pagar.
- Firma con `fn_actor_persona_id(true)` y combo Responsable.

**DESCARTÉ:**
- **Tablas separadas por naturaleza** (`gastos` con su propio comprobante y pagos, como proponía ADR-0117). Duplica la
  lógica de pagos, vencimiento y saldo que Compras ya resolvió con candados, y parte la deuda y el IGV en tres.
- **Registrar el gasto desde Compras.** Quien anota la luz no tiene por qué entrar a Compras; la cabecera se comparte,
  la pantalla no.
- **Un solo módulo «Finanzas».** Obliga a dar todo o nada.
- **Juntar también los comprobantes del Taller** en esta cabecera. Felipe decidió en ADR-0133 que Producción tiene los
  suyos; se respeta, y Por pagar los suma con una vista consolidada (D-I de ADR-0133).

## Ganas / Pagas

- **Ganas:** un solo Por pagar y un solo IGV descontable; imposible registrar la misma factura dos veces
  (`unique (proveedor_id, serie, numero)` ya existe); un cuarto tipo de detalle mañana es otra tabla hija, no otro sistema.
- **Pagas:** tocar `compras`, que está en producción y se usa a diario. Recibir, Reparto por tienda (ADR-0139), Por
  pagar por tienda (ADR-0187), `compras_resumen` y el candado de dinero (ADR-0126) tienen que filtrar o respetar
  `naturaleza`, y eso se prueba en la fase F2.

## SE ROMPE SI

- Una pantalla o función de Compras que lee `compras` no filtra `naturaleza = mercaderia`: un recibo de luz aparecería
  «por recibir». Por eso la columna nace con valor por defecto `mercaderia` y un trigger impide `compra_items` en una
  cabecera de gasto o activo.
- Se registra un gasto sin comprobante que después aparece con factura: queda el gasto suelto y además la factura. Se
  resuelve en la pantalla ofreciendo **vincular** la factura al gasto existente, no crear otro.
- La retención del recibo por honorarios (8 %) no se modela: el pago al proveedor sería menor que el total. Pendiente
  del contador, anotado en el plan.

## Actualización 2026-09-24 (b) — filtro de tienda, plata del dueño, Configuración y la capa para decidir

Aprobado por Felipe el mismo día, después de ver el spike v1 (pidió que sea «completo, intuitivo y que ayude a decidir»).

**C. Filtro de tienda: la cabecera dice DÓNDE trabajas; «Ver» dentro de la pantalla dice QUÉ miras.** El selector de
la cabecera sigue siendo una sola sede: de ella salen el combo Responsable y el permiso de cada guardado
(`x-ubicacion`, ADR-0161/0162). Cada pantalla de Finanzas arranca mostrando esa sede y tiene su filtro «Ver» con
«Todas las tiendas», igual que Historial de ventas, Compras y Facturación. **Una tienda a la vez:** con «Todas», las
tablas ponen cada tienda en su columna. *Descarté:* «Todas» en la cabecera (¿quién firma un gasto en «todas»?) y la
selección múltiple (el total de «TRU + AQP» es ambiguo y compararlas ya lo hace la vista «Todas»).

**D. Plata del dueño.** Al poner plata se elige **aporte** (se queda en CAYLA, patrimonio) o **préstamo** (CAYLA te lo
devuelve, pasivo, «CAYLA te debe S/ X»). Al sacarla, **retiro de utilidades** o **devolución de préstamo**. Ninguna de
las cuatro es venta ni gasto: no mueven la utilidad. Las cuentas contables (capital adicional, cuenta 47) las confirma
el contador.

**E. Configuración es un módulo general del ERP** (`configuracion`, grupo Gestión, solo líder, no delegable), no una
pestaña de Finanzas. Hoy trae: Empresa · Cuentas y cobros · Caja y avisos (mínimo de caja, umbral de «fuera de lo
normal», días de aviso de vencimientos) · Gastos fijos · Presupuesto · Impuestos (IGV y UIT con vigencia). Mañana, otras
secciones del ERP. *Descarté:* pestaña dentro de Finanzas (habría que moverla el día que otro módulo necesite ajustes).
Toca más de un módulo: por eso se anotó aquí con el OK de Felipe.

**F. La capa para decidir son reglas y cálculos, no inteligencia artificial.** Salud en frases (días de caja, día del
mes en que se cubren los costos), punto de equilibrio por tienda (gastos ÷ margen %), presupuesto contra real con
proyección al cierre, escenarios («¿y si…?»), avisos de lo raro (contra el promedio de 6 meses), gastos fijos que el
sistema propone y detecta, y conciliación que propone la pareja de cada línea del banco. Cada número dice de qué dato
sale. Un resumen escrito con IA puede sumarse encima después, nunca en lugar del cálculo.

## Actualización 2026-09-24 (c) — la cuenta en cada movimiento, y meta y fondo de caja unidos a las campañas

**Pedido de Felipe:** meta del día por tienda visible en Caja; fondo de caja que cambia por temporada y que la caja vea
al cerrar, con una confirmación que no bloquee si deja menos; las cuentas de CAYLA en Compras, Ventas y en todo lugar
donde se mueva plata, pensando cada situación. Todo pendiente de su OK (es una propuesta; toca Caja, Ventas, Compras,
Producción, Devoluciones y Separaciones).

**G. Todo movimiento de plata guarda medio Y cuenta, y la cuenta se sella al guardar.** Las 22 situaciones están en
`docs/PLAN-FINANZAS.md` §7 bis. Al cobrar (Vender, Cambios, Apartados) la cuenta sale sola de «A qué cuenta entra cada
cobro»: el mostrador no elige nada. Donde una persona decide de dónde sale la plata (pagar a un proveedor, devolver a una
clienta, un gasto, el destino «banco» del cierre) aparece el combo «Sale de» con una cuenta ya propuesta. Se sella para
que cambiar la configuración mañana no reescriba el pasado.
*Por qué no calcularla al leer* (lo que decía la primera versión de este plan): si el Yape de LIM pasa del BCP a
Interbank, todo el historial de LIM se movería de banco sin que nada hubiera pasado.

**H. Nuevos tipos de cuenta:** caja fuerte por sede y «efectivo entregado al líder» (el cierre ya manda plata ahí, así
que son lugares con plata), y tarjeta de crédito de CAYLA (deuda; `gastos` ya acepta «tarjeta»).

**I. Un pago en efectivo a un proveedor dice de dónde salió.** Si sale de un cajón, crea su salida de caja en la misma
operación y resta del cierre. Hoy `fn_calcular_esperado_caja` no los cuenta: hay 12 pagos por S/ 15,661 sin origen.

**J. Una sola lista de medios de pago** en `packages/shared` y en un dominio de la base, en lugar de los 5 `check`
distintos de hoy.

**K. Meta del día y fondo de caja, unidos a las campañas** (corregido el mismo día a pedido de Felipe: la primera
versión inventaba «temporadas» aparte y él pidió unirlas a las campañas). Lo normal por tienda: una meta por día de la
semana (con IGV, lo que ve la caja) y un fondo. Cada **campaña** (etiqueta de estilo «campaña» de Catálogo ▸ Etiquetas,
dueña única de las fechas) puede decir, por tienda, cuánto sube la meta y qué fondo dejar (`campana_efecto_caja`). Las
campañas se cruzan (el Día del Gato cae dentro de Fiestas Patrias): **gana la mayor**, la misma regla del descuento de una
prenda. Una sola función decide qué rige cada día (`fn_parametros_caja`). La meta del mes del Presupuesto es la suma de las
del día. Se apoya en `ubicaciones.meta_venta_diaria`, que ya existe y en producción está vacía.
*Descarté:* temporadas propias con fechas que no se cruzan (dos listas de fechas que se desalinean), y sumar los
porcentajes de dos campañas cruzadas (Fiestas Patrias + Gato daría +30 % por una campaña de peluches).

**K2. Reportes ▸ Campañas:** margen extra de cada campaña pasada contra días normales (`venta_items.descuento_etiqueta_id`)
y, para las que vienen, cuánto más hay que vender para compensar el descuento contra cuánto sube su meta.

**L. Al cerrar la caja, «Deja S/ X para el próximo turno».** El fondo es el de lo normal o el de la campaña que rige. El traslado viene propuesto (contado − fondo). Si queda
menos, sale una confirmación que no bloquea; si se cierra igual, queda anotado y el líder lo ve en Historial de cierres.
**Cambia el punto 3 del ADR-0186** («sin fondo sugerido»): ahora el fondo lo fija el líder (normal y por campaña), y el sistema
solo avisa cuando falta, nunca cuando sobra. Y el destino «banco» del cierre pide **a qué banco**.

## Construcción — F1 (2026-09-24): Configuración, meta y fondo de caja

Aprobado el paquete (c) y el Balance «lo que es de la tienda» (Felipe, 2026-09-24). Construido y probado en local:

- **Migración `20260924210000_configuracion_meta_y_fondo_por_campana.sql`** (por pegar en producción ANTES de publicar la web):
  módulo `configuracion` («solo líder por ahora»), `ubicacion_metas_dia`, `ubicaciones.fondo_caja`, `campana_efecto_caja`,
  `configuracion_historial`, `fn_parametros_caja`, `fn_meta_mes`, `fn_configuracion_tiendas`, `guardar_metas_tienda`,
  `guardar_efecto_campana`, y el disparador que anota `cajas.fondo_requerido` al cerrar. **`cerrar_caja` no se toca**: la web
  de hoy sigue funcionando si la migración se pega antes.
- **Dónde vive Configuración:** en el **perfil del líder**, junto a Colaboradores, no en el menú lateral (Felipe, 2026-09-22:
  «Colaboradores va en el perfil»; Configuración es del mismo tipo). Ruta `/configuracion` con `exigirModulo`.
- **Caja:** la barra «Meta del día» dice cuánto falta y de dónde sale la meta (lo normal o la campaña que la sube); el cierre
  dice «Deja S/ X para el próximo turno», propone el traslado y, si queda menos, pide confirmar dentro del mismo paso
  («Volver y dejar S/ X» / «Cerrar igual»). El Historial de cierres muestra «Dejó menos del fondo». **Inicio** usa la misma
  regla (`fn_parametros_caja`).
- **Verificación:** `pnpm pruebas:configuracion-caja` (20 casos con ROLLBACK, también en el CI); `lib/configuracion-reglas.test.ts`
  (11); 24.375 pruebas web; typecheck y lint. Con sesión de líder en local: guardar metas de Trujillo → meta del mes S/ 54,300,
  Caja «te faltan S/ 1,700, lo normal de un jueves», Inicio igual; el cierre con fondo de Fiestas Patrias propone S/ 630 y pide
  confirmar al dejar S/ 230. La base local quedó como estaba.

### Corrección al pegar F1 (2026-09-24): sin políticas y en tres partes

Al pegar la migración entera en el SQL Editor de producción salió `40P01 deadlock detected`, y **no se aplicó nada**:
el editor corre todo lo pegado en una sola transacción, y todo o nada. Según los registros de Postgres, la otra punta del
ciclo era el **Asesor de seguridad del panel de Supabase**. Leía `storage.buckets` y esperaba para leer `retail.ubicaciones`.
La migración tenía `ubicaciones` en exclusiva (por el `alter table`) y esperaba `storage.buckets`.

¿Por qué una migración de retail pedía `storage`? Medido en local: **en Supabase, cada `create policy`, y también
`drop policy if exists` aunque la política no exista, toma en exclusiva las 21 tablas de `auth` y `storage`** hasta el
final de la transacción. `enable row level security`, `grant`, `revoke`, `create table` con FK y los disparadores no lo hacen.

Qué cambió:
- **Sin políticas.** Las tres tablas nuevas quedan con RLS encendido y sin políticas, más `revoke`. Nadie las lee
  directamente, ni el líder. Todo pasa por las funciones `security definer`, que ya piden lo que corresponde. Es más
  estricto que antes y la web no lee esas tablas. El Asesor lo mostrará como «RLS sin políticas», un aviso informativo.
- **Tres partes que se ejecutan por separado:**
  1. `ubicaciones`, sola.
  2. `cajas`, sola: columna y disparador.
  3. Todo lo demás, que sobre tablas en uso solo toma candados compartidos.

  Cada parte tiene `lock_timeout = 3s`: si la tienda está usando esa tabla, falla limpio y se repite. Todo es idempotente.
  En local y en el CI el archivo corre entero, igual que antes.
- **El disparador del cierre nunca bloquea una caja.** Si `fn_parametros_caja` falla, `fondo_requerido` queda vacío y el
  cierre sigue.
- Pruebas: 23 casos. Se sumaron «con la regla rota la caja se cierra igual» y «ni el líder lee las tablas directo».

Se pegó así el mismo 2026-09-24, sin errores, y quedó verificado en la base.

**Regla para las fases que siguen:** una migración de producción **no mezcla** un `alter` de una tabla que la tienda usa
con `create policy`/`drop policy`, y cuando necesita políticas, las pega en una ejecución aparte, sola y al final.
