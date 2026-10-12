# ADR-0387 · Compras: el módulo es la llave (sin «solo el líder»)

- **Fecha:** 2026-10-12 · **Estado:** ACEPTADO (Felipe). Actividades 1 y 2 hechas (sin pegar en producción: va con el cierre de la
  fase 2).
- **Rama:** `claude/purchase-order-phase2-9b0c82` (fase 2 de ADR-0362, actividades 1 y 2 de 11).
- **Cambia:** el «módulo y líder» del Plan de campaña (ADR-0372); el «solo el líder confirma un costo atípico» al recibir
  (`20260930122000`, `20260930124000`); la tienda gestora «solo del líder» (ADR-0184). Con la actividad 2, también «Compras por tienda»
  (ADR-0184), «Por pagar: parte de mi tienda» (ADR-0187), «Proveedores sin montos» (ADR-0161 P3) y la deuda por tienda de Finanzas
  (ADR-0195: Por pagar mirando una tienda y Balance por tienda).

## El problema

En Compras, aunque una persona tenga el módulo en su rol, hay cosas que solo hace un líder: crear, editar, quitar y restaurar una
campaña del Plan y fijar su tope; cambiar la tienda que gestiona un comprobante; confirmar un costo fuera de lo normal al recibir;
decidir qué pasa con lo que faltó en una recepción. Y quien no es líder ve y paga solo lo de sus tiendas. Felipe, al aprobar la fase 2
de órdenes de compra (2026-10-12): **«quitar las validaciones de líder: solo tienes el módulo puede hacer todo en él, seas líder o
no»**, y lo extendió a **todo Compras**.

## Lo que decidió Felipe (2026-10-12)

1. En todo Compras (Plan de campaña, Proveedores, Órdenes de compra, Facturas de proveedor, Recibir mercadería, Por pagar, Notas de
   crédito), quien tiene el módulo hace todo lo que hay dentro, sea líder o no.
2. Quien tiene el módulo ve **todas las tiendas** y paga a nombre de la empresa (hoy 13 personas que no son líder tienen algún módulo
   de Compras). Va en la actividad 2.
3. Registrar el comprobante de una orden y pagarlo al contado piden solo el módulo Órdenes de compra (actividades 4 y 6 de la fase 2).
4. Si el papel del proveedor trae más de lo pedido, se acepta y se avisa (actividad 8).
5. Quien tiene el módulo Proveedores ve, dentro de Proveedores, lo que la empresa le compra y le debe a cada proveedor y su saldo a
   favor: «Sí, que los vea» (decisión 44 de ADR-0362).
6. **La deuda de una factura es 100 % de la tienda que hizo el pedido** (la gestora, la que guarda el papel): «Trujillo y Lima, si no
   hicieron el pedido, no tienen nada que pagar, sino quien realizó el pedido»; si otra tienda recibió parte, se compensan entre
   ellas. El pago de la empresa baja la deuda de esa factura, y Finanzas se alinea «ahora, en la fase 2» (decisión 45 de ADR-0362).

## Lo que se hizo (actividad 1)

- **Base** (`20261012202000_compras_el_modulo_es_la_llave.sql`, reemplazos anclados sobre la definición viva; las nueve funciones
  tenían la misma huella en el banco y en producción el 2026-10-12):
  - Las cinco funciones del Plan (`crear_plan_compra`, `editar_plan_compra`, `quitar_plan_compra`, `restaurar_plan_compra`,
    `guardar_plan_compra_tope`) ya no piden además ser líder; el módulo `plan_compra` se sigue pidiendo.
  - `cambiar_tienda_gestora_compra` pide el módulo Facturas de proveedor (`fn_puede_registrar_facturas_compra`).
  - `fn_ve_costos_al_recibir()` (nueva): quien ve la plata de Compras o tiene Recibir. Es la decisión 18 de ADR-0362 («todo el que
    recibe ve los precios») dentro de Recibir, y nada más.
  - `recibir_envio` y `recibir_lote`: el costo atípico lo confirma quien ve los costos al recibir (con `"confirma_costo": true`, como
    antes el líder). Quien no los ve sigue recibiendo `costo_atipico_sin_lider` sin cifras (el código del error no cambia, para la web
    ya publicada), y la nota que queda dice «Costo atípico confirmado (…)», sin «por un líder».
- **Web:** Plan de campaña entra al menú y a Compras con su solo módulo (sin `verDineroCompras`) y muestra sus botones (nueva
  campaña, editar, quitar, restaurar, tope) a quien lo tiene; en Recibir, las decisiones sobre lo que faltó son de quien recibe (la
  base ya solo pedía poder operar la sede), el aviso de la nota por reclamar es de quien tiene Notas de crédito y el enlace a los
  comprobantes con faltante, de quien tiene Facturas de proveedor.
- **Pruebas:** `pnpm pruebas:compras-llave` (nueva; con `--sin-migracion` falla, así se ve que vigila algo) y, pasadas a la regla
  nueva, `plan_compra.mjs` (E3, T3, C4), `lote_costo_atipico.mjs`, `envio_costo_atipico.mjs` y `compras_por_tienda.mjs`; en la web,
  la línea base del menú (la integrante ve, en la fotografía sin módulos, Plan de campaña junto a Órdenes de compra), `modulos.test.ts`
  y `produccion-menu.test.ts`.

## Lo que se hizo (actividad 2)

- **Base** (`20261012204000_compras_todas_las_tiendas.sql`, reemplazos anclados sobre la definición viva; cada ancla se contó en
  producción el 2026-10-12 y aparece una vez, igual que en el banco). Se pega en DOS partes: funciones, y después las políticas solas
  (ADR-0195).
  - **Proveedores** (decisión 44): `fn_ve_plata_de_proveedores()` (nueva: la plata de Compras o el módulo Proveedores) en las seis
    funciones de Proveedores, que además cuentan las compras de todas las tiendas. El saldo de cada proveedor es lo que le debe la
    empresa, calculado aparte (no pasa por `fn_deuda_visible`).
  - **«Mis tiendas» deja de existir en Compras:** `fn_compra_es_de_mis_tiendas` es `fn_puede_ver_dinero_de_compras()` (la usan
    anular, adjuntar, reasignar, notas de crédito, faltantes sin nota e indicadores); `fn_puede_comprar_en` acepta cualquier tienda
    activa; `fn_deuda_visible` da la factura entera; `fn_mis_partes_de_compras` queda vacía.
  - **Pagar a nombre de la empresa:** las tres funciones de pago piden primero Por pagar y ya no exigen una tienda; si la pantalla
    nombra una, se valida como siempre (activa, con parte, sin pasar de lo que le queda; aviso nuevo «Esa tienda no existe o no está
    activa»). Al registrar, la gestora puede ser cualquier tienda activa y el contado va sin tienda, sea líder o no.
  - **Recibir:** la regla no cambia (cada sede recibe lo suyo, también el líder); los avisos ya no mandan a pedírselo «a un líder», sino
    a quien tiene Facturas de proveedor.
  - **Finanzas** (decisión 45): `fn_por_pagar_consolidado` mirando una tienda devuelve las facturas que ella gestiona, enteras (`parte`
    siempre falso), y `fn_bal_facturas_de_tienda` suma el saldo por gestora. Medido antes en el banco con una boleta de S/ 1,000 (Lima
    600, Trujillo 400) y un pago de la empresa de S/ 500: decía Lima 500 + Trujillo 400 = 900; ahora, Lima 500 y Trujillo nada.
  - **Políticas** (parte 2): las lecturas de facturas, líneas, pagos, notas, adjuntos (y sus escaneos en el almacenamiento), destinos,
    cierres y reasignaciones preguntan `(select fn_puede_ver_dinero_de_compras())`, más la sede propia donde ya estaba (Recibir).
- **Web:** en Compras, el camino del líder es el de todos: sin «Pagas desde» ni «Elige con qué tienda pagas» al pagar, sin «Tu parte…»
  en Compras ni en Por pagar, y al registrar la gestora se elige entre todas las tiendas (sin «Tu tienda tiene que quedar en el
  reparto»). Proveedores muestra sus montos con su módulo; los comprobantes de la ficha se abren solo con la plata de Compras.
  Finanzas ▸ Por pagar se paga igual que Compras.
- **Pruebas:** `pruebas:compras-llave` suma P1–P4, T1–T14 y F4–F5 (37 casos; sin la migración fallan los de la actividad 2) y entra
  a la lista del CI (`scripts/ci/pruebas-postgres.mjs`; faltaba desde la actividad 1 y `ci-paridad` lo marcaba). Las pruebas que
  afirmaban «cada tienda ve y paga lo suyo» pasan a la regla nueva caso por caso (se invierten, no se borran).

## Por qué así, y lo que se descartó

- **Abrir la regla general de la plata de Compras a todos los módulos de Compras: descartado.** Fue el primer intento: con Recibir
  solo se habrían visto los tableros de Facturas y Por pagar (resumen de compras, deuda por vencer, salidas de caja) y los costos de
  Catálogo, que no son de Recibir. «El módulo es la llave» abre lo de ADENTRO de cada módulo, no lo de los otros. Por eso la regla de
  Recibir es aparte y chica.
- **Nadie ve plata nueva hoy.** En producción (2026-10-12), todos los roles con Recibir o Proveedores ya tienen además Facturas de
  proveedor: integrante (12 cuentas), terminal administrativa (3), terminal de ventas (3) y Producción (1).
- **El responsable obligatorio no cambia, y es el mismo para líderes y no líderes:** quien guarda en el Plan elige quién hace la
  operación, o firma si marcó su entrada en la sede.

- **Las políticas preguntan «¿tiene el módulo?» una vez por consulta, no «¿está esta factura en mi lista?».** Ampliar
  `fn_compras_visibles` a todas las facturas habría hecho que cada fila se compare contra la lista entera, que crece con cada
  comprobante. Es volver a la regla de ADR-0161, antes de ADR-0184.
- **Proveedores no pasa por `fn_deuda_visible`.** Si se le abría, quien tiene solo Proveedores leería los tableros de Facturas y Por
  pagar (deuda por vencer, salidas de caja) llamando a esas funciones. «El módulo es la llave» abre lo de adentro de cada módulo.
- **La tienda al pagar queda opcional, no prohibida:** quien tiene el módulo puede lo mismo que el líder, que podía nombrar una. La web
  publicada sigue mandando la de quien paga y la base la acepta validada; la web nueva no la manda.
- **Decisión 45 y el Diario:** el Diario ya asentaba la compra y su pago en la gestora; Finanzas por tienda ahora dice lo mismo. El
  reparto por tienda sigue sirviendo para la mercadería (quién recibe qué), no para la deuda.
- **No se borra lo que quedó sin uso** (`compradores_de_tienda`, `fn_compras_ubicaciones`, `fn_compras_visibles`, `fn_mi_parte_de_compra`,
  `fn_mis_partes_de_compras`; en la web, `MisPartesDeCompras`, `lib/compras-mi-parte*.ts` y `/compras/parte/[compraId]`): la web
  publicada los llama hasta el despliegue. Se retiran en una tarea aparte.
- **Recibir no cambia:** «ver todas las tiendas» no es «recibir en todas». Recibir en una sede algo asignado a otra va con la fase 4.

## Lo que queda

- **Orden de despliegue:** la base antes que la web (o juntas). La web nueva paga sin tienda, y la base de hoy se lo rechaza a quien no
  es líder; la web de hoy sí funciona con la base nueva.
- **Recibir muestra sus montos con su propio módulo:** hoy los pide a seis lecturas que también son de Facturas y Por pagar. Va con el
  rediseño de la recepción (fase 4 de ADR-0362, decisión 18), no a medias ahora.
- **Retirar lo que quedó sin uso** (lista de arriba), después del despliegue.
- **El Plan de campaña que trae `main`:** `guardar_plan_compra_recupero` (PR #977) todavía pide ser líder y algunos textos dicen «un
  líder» (comentarios del Plan y el texto visible de Resultados); entran a «el módulo es la llave» al traer `main`. La limpieza de
  `esLider` en `PlanCampana` la hizo otra sesión (commit `6f7ac936b`) y entra a esta rama.
- **Terminales:** en producción, los roles «terminal de ventas» (3 cuentas) y «terminal administrativa» (3) tienen Facturas de
  proveedor; con esta regla ven las facturas, pagos y deudas de todas las tiendas. Si no se quiere, se les quita el módulo en Roles y
  accesos (lo decide Felipe; no es código).
- **Efectivo con «ve todas las cuentas»** (quien no es líder pero tiene Configuración o Cierre de mes): la cuenta propuesta puede ser el
  cajón de otra tienda y la base la rechaza al guardar, sin escribir nada. Arreglo sugerido: que `fn_cuentas_para_elegir` liste el
  efectivo con la misma regla que `fn_cuenta_sellada`.
