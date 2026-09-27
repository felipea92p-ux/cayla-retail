# ADR-0195 — Finanzas: un solo comprobante de proveedor para mercadería, gasto y activo, y cinco módulos

**Fecha:** 2026-09-24 (nació como ADR-0194; renumerado al subir porque `main` ya tenía el 0194 de la prueba de carga)
**Estado:** **APROBADO por Felipe el 2026-09-24** (decisiones A y B). Sin código ni migración: fija el modelo del plan
`docs/PLAN-FINANZAS.md`, que se construye por fases después del spike visual.
**Afecta (cuando se construya):** `compras` (columna `naturaleza`, tipo `recibo_por_honorarios`), `gastos` (ADR-0117,
gana `compra_id`), `activos_fijos` (gana `compra_id`), `modulos` (5 filas nuevas), `lib/modulos.ts`, `lib/menu.ts`.
**Relacionado:** ADR-0198, ADR-0117 y ADR-0120 (PR #170, aprobados, sin fusionar), ADR-0133 (Producción con sus propios
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

## Construcción — F2a (2026-09-24): Gastos, con o sin factura de proveedor

Felipe pidió seguir con el plan después de F1. F2 se partió en dos PR verificables. **F2a (este): gastos.**
**F2b (el siguiente): activos fijos y gastos fijos del mes.** Construido y probado en local:

- **Migración `20260924235000`:** plan de cuentas (30, provisional hasta el contador), tasa de IGV con vigencia
  (`fn_tasa_igv`) y **10 categorías de gasto cerradas**, cada una con su cuenta (`fn_categorias_gasto`). Respecto del
  PR #170: se quitó «Personal y planilla», porque la planilla se lee de Dynamic y registrarla aquí la contaría dos veces.
  Se sumaron asesoría y honorarios, gastos bancarios y tributos y licencias.
- **Migración `20260924235100`** (seis partes, cada una se pega por separado):
  - **`compras.naturaleza`** (mercadería, gasto, activo): la decisión A. Los checks que la acompañan:
    - una factura de gasto no tiene unidades;
    - el recibo por honorarios solo puede ser gasto;
    - la tienda gestora es obligatoria solo en mercadería (un gasto «de la empresa» no tiene tienda);
    - la naturaleza no cambia después de registrada.

    Un disparador impide anular la factura de un gasto desde Compras: se anula desde Gastos, junto con el gasto.
  - **`compra_parte_por_tienda` suma una rama:** la factura de un gasto es entera de su tienda. Con eso funcionan para
    gastos, sin reescribir ninguna función de pago:
    - la visibilidad por tienda (ADR-0184);
    - Por pagar por tienda (ADR-0187);
    - el tope de pago por tienda.
  - **`compra_pagos` acepta `tarjeta`**: la tarjeta de crédito de CAYLA paga facturas.
  - **Compras solo cuenta mercadería donde habla de mercadería**:
    - `listar_compras` gana `p_naturaleza`; Por pagar pide `'todas'`;
    - las compras e IGV del mes;
    - las métricas de proveedores;
    - el buscador de facturas para notas de crédito.

    Son parches por texto sobre la definición viva, con el ancla verificada. El candado de dinero (ADR-0126) se
    reaplica y se comprueba.
  - **`gastos` y `egresos_no_gasto`**, con los tres caminos de ADR-0117:
    - A: pagado sin cajón;
    - B: efectivo del cajón abierto, que crea el egreso con la regla de caja de siempre;
    - C: clasificar un egreso que la tienda ya registró.

    Con comprobante: la cabecera en `compras` y su pago en `compra_pagos`, o a crédito en Por pagar. Nada se edita ni se
    borra: se anula. **Un gasto cuya factura ya tiene pagos no se anula** (como en Compras).
  - **Decisión B:** `fn_gastos_ubicaciones`. El líder ve todas las ubicaciones y lo «de la empresa»; con el módulo
    `gastos`, cada cuenta ve solo su tienda.
  - Todo firma con el responsable. `registrar_proveedor_de_gasto` deja sumar al proveedor del gasto con nombre y RUC,
    sin el módulo Proveedores y sin crear fichas repetidas.
  - La tabla `gastos` que había en producción (sin migración, 0 filas) y su `registrar_gasto` se renombran como
    legado, no se borran.
- **Web:** Finanzas ▸ Gastos (`/finanzas/gastos`), en el menú lateral: el grupo Finanzas, con una sola hija por ahora.
  - Filtro «Ver» y selector de mes.
  - Cuatro cifras: gastado, IGV descontable, por pagar y egresos por clasificar.
  - Pestañas: Gastos, Egresos de caja por clasificar (con «no es gasto» y su reversión) y Por categoría.
  - Un solo modal para registrar: con o sin comprobante, al contado o a crédito, efectivo del cajón o clasificar un
    egreso.

  En Compras:
  - Por pagar marca las facturas de gasto con «Gasto» y qué fueron;
  - el detalle de una factura de gasto no muestra «Recepción» ni deja anularla;
  - Producción ▸ Eficiencia lee los gastos del Taller por la función nueva.

  Módulo `gastos` en el grupo «Finanzas» de Roles y accesos. Delegable: nace sin rol.
- **Verificación:**
  - `pnpm pruebas:gastos`: 53 casos con ROLLBACK, también en el CI.
  - Las 11 pruebas de Compras, Por pagar, reparto, dinero y roles: iguales.
  - Las nueve lecturas de Compras dan la misma huella antes y después de migrar.
  - `lib/gastos-reglas.test.ts` (20) y 45.902 pruebas web.
  - Cada parte de la migración, medida: toma en exclusiva una sola tabla o vista y nunca `auth` ni `storage`.
  - Con clics en local: la pantalla, el filtro, el modal con el IGV calculado y el alta rápida de proveedor.
- **Pendiente para Felipe:**
  - el contador confirma las cuentas y las categorías;
  - decidir si hace falta **anular un pago** (hoy ni Compras ni Gastos lo permiten; un gasto al contado mal registrado
    se corrige con una nota de crédito).

## Construcción — F2b (2026-09-24): activos fijos y gastos fijos del mes

F2a quedó en producción el mismo día (las siete ejecuciones, verificadas en la base; web #393 desplegada). F2b, construido y
probado en local:

- **Migración `20260925000000`** (tres partes, cada una se pega por separado):
  - **Activos fijos.** La tabla de 2026-09-12 (vacía, sin pantalla) gana su comprobante (`compras.naturaleza = 'activo'`), su
    pago y sus estados: `baja` con fecha y motivo, y `anulado`. Se agregan 6 **tipos de activo** cerrados, con su cuenta y
    una vida útil sugerida, y las cuentas 332–334, 391 y 681.
    - El costo es sin el IGV de la factura (ese IGV se descuenta).
    - Se deprecia en línea recta desde el mes siguiente a la compra. La depreciación de un mes es lo acumulado a fin de mes
      menos lo acumulado a fin del mes anterior, así los meses suman exactamente el costo.
    - No se edita ni se borra; con factura ya pagada no se anula, se da de baja.
    - Las dos políticas viejas de la tabla no se tocan (tocarlas bloquea `auth` y `storage`): se le quitan los permisos
      directos y todo se lee por funciones.
  - **Gastos fijos del mes.** Cada uno tiene día del 1 al 28, monto (que puede variar), proveedor y tipo de comprobante; se
    archiva, no se borra. `gastos.gasto_fijo_id` permite un solo gasto vigente por fijo y por mes. Cada mes, un fijo está
    «registrado», «viene» o «falta registrar». El sistema propone como fijo lo que se repite (misma tienda, categoría y
    proveedor en al menos dos de los últimos tres meses).
  - **Una sola regla de pago.** `fn_comprobante_y_pago` es el paso compartido de gasto y activo, y `registrar_gasto` se
    reescribe sobre él (gana `p_gasto_fijo_id`). Un egreso de caja respalda UNA sola cosa: un gasto, un activo o «no es
    gasto» (`fn_egreso_ya_usado` en los tres candados y en las lecturas). La factura de un activo tampoco se anula desde
    Compras.
- **Web:** Finanzas ▸ Gastos suma dos pestañas.
  - «Fijos del mes»: registrado, viene o falta; «Registrar» abre el gasto ya lleno; editar y archivar; los sugeridos.
  - «Activos fijos»: costo, vida útil, lo que se deprecia al mes y lo que vale hoy, con su detalle para dar de baja o anular.

  El modal de registrar sirve para gasto y activo, y clasificar un egreso ofrece «Un activo fijo». En Por pagar y en el
  detalle de Compras, la factura de un activo se muestra como tal.
- **Verificación:**
  - `pnpm pruebas:activos-y-fijos`: 46 casos, en el CI.
  - `pnpm pruebas:gastos`: 53.
  - Reglas: 29.
  - Web: 45.914.
  - Cada parte medida: solo toma en exclusiva sus propias tablas, nunca `auth` ni `storage`.
  - Con clics en local: registrar un activo, crear un fijo y registrarlo desde su botón, y anular el activo desde su
    detalle.
- **Pendiente para Felipe:**
  - el contador confirma tipos, vidas útiles y cuentas;
  - la venta de un activo (el estado `vendido` existe, sin pantalla) queda para F7.


## Ajuste de diseño al spike (2026-09-24)

Felipe, al ver F1 y F2 funcionando: «los diseños no se parecen a los propuestos, hay que ajustarlos antes de continuar». La
estructura estaba bien; el aspecto no. Se comparó cada pantalla con el spike (`docs/maquetas/finanzas-2026-09/`), captura
contra captura y al mismo ancho, y se rehicieron:

- **Piezas propias de Finanzas.** Lo que el spike dibuja y el ERP no tenía vive en un solo lugar, y las fases que vienen
  (Cuentas y dinero, Reportes, Impuestos, Cierre) lo usan igual:
  - `app/estilos/finanzas.css`, con clases `fin-*` y solo tokens;
  - `components/finanzas/kit.tsx`: pestañas en tinta con el conteo en píldora, la tarjeta con filtros, tabla y pie, la tabla
    que envuelve el texto en vez de cortarlo, campos en caja hundida, opciones en tarjeta, lista de datos y estado vacío.

  Dos piezas del sistema ganan una opción, sin cambiar a nadie más: `<Modal variante="hoja">` (la hoja del spike: papel,
  título serif grande, bajada en taupe) y `CabeceraPantalla accionesAbajo` («Ver» y el botón principal al pie de la
  cabecera, a la derecha).
- **Finanzas ▸ Gastos.** «Ver» junto al botón principal. Cuatro cifras sin punto de color y sin céntimos. Pestañas del
  spike: «Por categoría» sale y se mudará a Reportes. El buscador, la categoría y el mes van dentro de la tarjeta de la
  tabla. Fechas «23 sep». «Cómo se pagó» dice el medio real: «Cajón · Tienda TRU», «Transferencia» o «vence 28 sep».
  - Para eso, `fn_gastos_lista` devuelve el medio del pago cuando el gasto tiene comprobante. Antes decía solo «Pagado».
    Va en la PARTE 3 de F2b, que no está en producción; tiene prueba nueva.
  - Fijos del mes va en dos columnas: «Para confirmar» y «Faltan» | «Se repiten, ¿los marco?» y «Ya registrados». Activos,
    con las columnas del spike.
  - Los modales usan campos en caja y opciones en tarjeta. Clasificar un egreso guarda el gasto chico ahí mismo con su
    categoría; con factura, o si es un activo, sigue al registro completo.
  - El de activo sigue el orden del spike: qué es, dónde está, y la vida útil en un solo campo («10 años · muebles»): la
    vida útil es la del tipo de bien. Se quitó el N.° de serie del formulario; la columna queda para después. Conserva el
    comprobante, porque un activo también sale del cajón sin factura.
- **Configuración.** Una sola pantalla «Configuración» con pestañas por URL; solo las que existen: Tiendas y caja, y Gastos
  fijos, donde se mudó el editor de fijos.
  - Las tablas son las del spike: fechas, descuento, «TRU: meta · fondo», y «pasó» atenuado, no tachado.
  - **Cada casilla se guarda sola al salir** de ella si cambió, sin botones «Guardar», firmada con el responsable. El combo
    Responsable se queda, aunque el spike no lo muestra: es regla (ADR-0161).
- **Caja.** La «Meta de hoy» es la tarjeta del spike: título serif con el monto, la frase «Lo normal de un jueves en…
  Hoy no rige ninguna campaña.», la barra en tinta, y Llevas, Te faltan y Avance.
  - Al lado va **«Al cerrar»**: lo que debería haber en el cajón, lo que se deja y adónde va el resto.
  - Solo lo ve quien puede cerrar. El monto lo da la base (`fn_esperado_caja`); la pantalla no lo recalcula (ADR-0186: un
    solo dueño).

**Lo que queda distinto del spike, a propósito:**
- El título de la pantalla mide 30 px y no 36, y las cifras en serif van en 600: es la guía del ERP (ADR-0169) para todas
  las pantallas.
- El combo Responsable, por regla.
- «Al ritmo de hoy cierras en…» no se puede calcular: la base no tiene la hora de cierre de cada tienda. En su lugar va el
  avance en %.
- «Cobrado hoy y a dónde entró» depende de las cuentas de dinero (F3).
- «No es fijo» en los sugeridos no tiene dónde guardarse todavía.
- El modal de cierre de caja es el de ADR-0186 (aprobado el 2026-09-23). Solo se tocó su renglón del fondo, que ya decía
  «Deja S/ … para el próximo turno».

## Construcción — F3 a F10 (2026-09-24/25): el resto del plan, en paralelo

Felipe pidió implementar todo lo que faltaba, en paralelo si hacía falta. Se armó una **base común**:
- los 4 módulos que faltaban (`20260925100000`), dados de alta juntos para que las fases no se pisaran el `orden`;
- las 6 entradas del menú de Finanzas del spike, con sus permisos e íconos;
- las cabeceras compartidas de Cuentas y dinero y de Reportes, con una ruta por pestaña.

Sobre esa base, un agente por fase construyó en su copia del repo y un orquestador integró, revisó las capturas contra el spike y corrió todas las pruebas juntas. El detalle, las reglas contables y las decisiones de cada fase están en **`docs/finanzas/fases/<fase>.md`**.

| Fase | Qué quedó | Migración (partes) |
|---|---|---|
| Base | Módulos Cuentas y dinero y Reportes financieros (delegables), Impuestos y Cierre de mes (del líder). | `100000` (1) |
| Pendientes del spike | Hora de cierre por tienda y «al ritmo de hoy cierras en…» en Caja; «No es fijo»; Configuración ▸ Empresa (solo lectura) y ▸ Caja y avisos. | `101000` (2), `102000` (1), `103000` (1) |
| F3 · Cuentas y dinero | Cuentas de CAYLA, medios de cobro con vigencia, movimientos entre cuentas y plata del dueño (append-only), conciliación. Los saldos se suman, nunca se guardan. | `110000` (3) |
| F3b · La cuenta sellada | Cada cobro guarda su cuenta solo (Vender no cambia) y cada pago la elige con la cuenta propuesta. El pago en efectivo del cajón resta del cierre. Lo viejo se completa desde «Decir de qué cuenta fue». | `150000` (10) |
| F4 · Por pagar consolidado | Mercadería, gastos, activos e insumos del Taller por vencimiento; «Pagar» abre el pago que ya existe. | `120000` (1) |
| F5 · Diario y resultados | `fn_asientos` (16 reglas, cuadrado), Estado de resultados por unidad y consolidado, Reportes ▸ Campañas. | `130000` (1) |
| F6 · Flujo de caja | Flujo real, proyección a 4–8 semanas, días de caja, mínimo de caja y Escenarios. | `160000` (1) |
| F7 · Balance | Saldos de arranque (se corrigen con fila nueva), Balance a una fecha que no se dibuja si no cuadra, «lo que es de la tienda». | `170000` (2) |
| F8 · Impuestos | IGV del mes con saldo a favor, límite de 300 UIT, registros para el contador, Configuración ▸ Impuestos. | `140000` (2) |
| F9 · Cierre de mes | Por unidad y consolidado, chequeos, diario congelado con hash, bloqueo por fecha en la base, reabrir con motivo. | `180000` (10) |
| Presupuesto | Topes por unidad y categoría; la meta de ventas es la suma de las metas diarias; presupuesto contra real y proyección. | `190000` (1) |
| F10 · Resumen | El tablero para decidir. | `200000` |

**Aprendido al integrar (regla nueva en CLAUDE.md):** en Supabase, `drop trigger` toma en exclusiva las 21 tablas de `auth` y `storage` igual que `drop policy`, aunque el disparador no exista. Se midió el 2026-09-24. F3 tenía 6 y se cambiaron por `create or replace trigger`. `drop function`, `drop index`, `drop view`, `create trigger` y `alter` no las toman.

**Pendiente de Felipe (datos):**
- los bancos, el POS, la Visa y a qué cuenta entra cada medio en cada tienda (sin eso los cobros quedan «sin cuenta»);
- los saldos de arranque;
- las metas diarias de cada tienda (sin ellas, el flujo proyecta con el promedio de 8 semanas);
- las horas de cierre.

**Decisiones abiertas de Felipe:**
- la tela del Taller en Por pagar;
- el flujo y los saldos solo del líder;
- la planilla visible solo a quien la ve en Dynamic;
- los umbrales del presupuesto;
- qué chequeos bloquean el cierre;
- el presupuesto de un mes cerrado;
- «Empresa» editable.

**Pendiente del contador:**
- las cuentas nuevas: 122, 451, 47, 52, 655 y 6599;
- las 16 reglas del diario;
- régimen, UIT y pago a cuenta;
- el formato de los registros;
- la retención de honorarios.

**Sin construir:** las situaciones 15 (pago de planilla), 16 (pago a SUNAT) y 22 (efectivo entre tiendas); la subida del extracto del banco; pagar varias facturas de varios proveedores en un solo pago.

## Actualización 2026-09-25 — editar y eliminar las cuentas de CAYLA

**Contexto.** Con F3 en producción, Felipe cargó su primera cuenta (BCP) y pidió poder editar y eliminar cuentas: hasta hoy solo se
agregaban y se archivaban, y un error de tipeo en el nombre, el tipo o el saldo inicial obligaba a archivar y crear otra.

**Decisión** (migración `20260925210100`, UNA ejecución, solo funciones):
- **Editar** (`editar_cuenta_dinero`). Estas reglas las exige la base; la ventana solo las refleja:
  - el nombre y el número cambian siempre;
  - el cajón, la caja fuerte y el efectivo por rendir solo cambian de nombre;
  - el **tipo** cambia solo mientras nadie la usó: cada cobro o pago sellado (F3b) se validó contra el tipo de su cuenta;
  - el **saldo inicial** y su fecha cambian mientras no haya una conciliación vigente (el banco certificó un saldo que sale de ese punto de partida) y mientras los meses que toca estén abiertos (ADR-0198). Una conciliación se anula con motivo y luego se corrige.
- **Eliminar = borrar de verdad**, pero solo una cuenta que **nada apunta** (`eliminar_cuenta_dinero`):
  - Qué la apunta se lee de las llaves foráneas que llegan a `cuentas_dinero` (`fn_usos_cuenta_dinero`), no de una lista escrita a mano. Así, una tabla nueva también cuenta.
  - El `delete` lo vuelve a garantizar la base.
  - La fila completa queda en `configuracion_historial`.
  - Esto no contradice «nunca se borra historia»: la cuenta no tiene historia, y borrarla deshace un error de tipeo.
  - Una cuenta usada se **archiva**, como hasta hoy. También cuenta como usada la que alguna vez recibió un medio de cobro.
- **La puerta.** El candado de la tabla (`fn_cuentas_dinero_inmutable`) sigue cerrando el tipo, el saldo y el borrado para todos. Solo estas dos funciones lo abren (`retail.editando_cuenta`, local a la transacción), y lo hacen después de validar. Es el mismo patrón que `retail.movimiento_de_sistema`.
- **La ventana.** El vínculo «Editar» reemplaza a «Archivar» en la tabla de Configuración ▸ Cuentas y cobros y sirve para todas las cuentas. La ventana:
  - pide el detalle a la base (`fn_cuenta_dinero_detalle`);
  - dice en palabras quién usa la cuenta («214 cobros de ventas, 9 movimientos…»);
  - ofrece **Eliminar** (con confirmación dentro de la misma hoja), **Archivar** o **Reactivar** según el caso;
  - desactiva «Archivar» mientras la cuenta recibe cobros hoy, y dice cuáles.

  Se aparta del spike, que no dibujaba acciones por cuenta: la tabla ya tenía el vínculo «Archivar» y ahora dice «Editar».

**Ganas:** corregir sin crear cuentas duplicadas; quitar lo creado por error sin dejar basura; reglas que no dependen de acordarse.
**Pagas:** una cuenta usada con el tipo equivocado sigue sin corregirse: se archiva y se crea otra. Pasa a propósito: cambiarle el
tipo reescribiría el sentido de cada cobro que ya se selló contra ella.
**SE ROMPE SI:** la web nueva se publica antes que la migración, porque llamaría a funciones que no existen. Pruebas: `pnpm pruebas:editar-cuentas`
(39 casos en la base) y `lib/cuenta-editar-reglas.test.ts`.

## Actualización 2026-09-26 — el combo de Finanzas es el del sistema (ADR-0209)

Felipe eligió que Finanzas no quede como excepción de la regla de combos. `SelectFin` (kit) ya no es un `<select>` del
navegador: es el `Desplegable` del sistema con `forma="fin"`. **Cerrado, sigue siendo el control del spike** —su caja
hueso, su flecha, su relleno y el ancho de su opción más larga, comparados número contra número con la versión anterior
a 1280 y 375 px—. **Abierto, se aparta del spike a propósito:** la lista ya no la dibuja el sistema operativo sino el
ERP (la misma de todas las pantallas), con buscador pasadas 8 opciones, grupos (las cuentas) y opciones bloqueadas (un
cajón con la caja cerrada). El spike no podía definir esa lista: en él la pintaba el navegador. Flujo de caja usa
`SelectEnLineaFin` (el combo dentro del sobretítulo). Las reglas de ancho de `finanzas.css` que apuntaban a
`select.fin-control` ahora apuntan a `.fin-desplegable-caja` (la caja que ocupa lugar en la fila) y `.fin-desplegable`
(el botón); `className` ubica el combo (`w-fit`, `fin-mes-chico`, `fin-compacto`), no lo pinta.
