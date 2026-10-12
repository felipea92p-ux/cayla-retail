# ADR-0387 · Compras: el módulo es la llave (sin «solo el líder»)

- **Fecha:** 2026-10-12 · **Estado:** ACEPTADO (Felipe). Actividad 1 hecha; la 2 (qué tiendas se ven y a nombre de quién se paga) sigue
  en la misma fase.
- **Rama:** `claude/purchase-order-phase2-9b0c82` (fase 2 de ADR-0362, actividades 1 y 2 de 11).
- **Cambia:** el «módulo y líder» del Plan de campaña (ADR-0372); el «solo el líder confirma un costo atípico» al recibir
  (`20260930122000`, `20260930124000`); la tienda gestora «solo del líder» (ADR-0184). Con la actividad 2, también «Compras por tienda»
  (ADR-0184) y «Por pagar: parte de mi tienda» (ADR-0187).

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

## Por qué así, y lo que se descartó

- **Abrir la regla general de la plata de Compras a todos los módulos de Compras: descartado.** Fue el primer intento: con Recibir
  solo se habrían visto los tableros de Facturas y Por pagar (resumen de compras, deuda por vencer, salidas de caja) y los costos de
  Catálogo, que no son de Recibir. «El módulo es la llave» abre lo de ADENTRO de cada módulo, no lo de los otros. Por eso la regla de
  Recibir es aparte y chica.
- **Nadie ve plata nueva hoy.** En producción (2026-10-12), todos los roles con Recibir o Proveedores ya tienen además Facturas de
  proveedor: integrante (12 cuentas), terminal administrativa (3), terminal de ventas (3) y Producción (1).
- **El responsable obligatorio no cambia, y es el mismo para líderes y no líderes:** quien guarda en el Plan elige quién hace la
  operación, o firma si marcó su entrada en la sede.

## Lo que queda

- **Actividad 2:** qué tiendas se ven y a nombre de quién se paga (deshace en Compras ADR-0184 y ADR-0187), recibir en una tienda una
  línea asignada a otra, y qué pasa con `compradores_de_tienda`.
- **Recibir muestra sus montos con su propio módulo:** hoy los pide a seis lecturas que también son de Facturas y Por pagar. Va con el
  rediseño de la recepción (fase 4 de ADR-0362, decisión 18), no a medias ahora.
- **Proveedores con sus montos por su propio módulo:** revertiría ADR-0161 P3 (Felipe, 2026-09-23: Proveedores sin montos); se le
  pregunta a Felipe.
- **`PlanCampana`:** la prop `esLider` ahora significa «puede gestionar campañas» y sus textos de «cuando un líder…» ya no se ven; se
  renombra y se limpia cuando se fusione el PR #977, que toca el mismo archivo.
