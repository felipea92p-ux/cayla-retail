# ADR-0421 · Compras después de /chaos: anular espera a la recepción, el token sigue al contenido y la factura tiene reglas

- **Fecha:** 2026-10-15 · **Estado:** construido y verificado en local (suite de base con controles, suites vecinas, vitest, la pantalla en un
  Chrome sin cabeza). **Las dos migraciones NO están en producción:** esperan el OK de Felipe. Rama `claude/chaos-compras-5c56e1`.
- **Pedido:** Felipe, 2026-10-15: «continúa con Compras actualizando main antes». La reconstrucción del módulo (#1040, #1088, #1056, #1032,
  #1099) ya está toda en main; esta corrida se hizo sobre ese código.
- **Extiende:** ADR-0398 (el token sigue al contenido; montos finitos), ADR-0409 (IGV de 0 a 18 % en Producción), ADR-0405 y ADR-0412
  (montos finitos y textos con tope). **Complementa:** ADR-0356 (`/chaos`), INV-14 de `scripts/chaos/invariantes.mjs`.

## Lo que estaba abierto (corrida del 2026-10-13, semilla `20261013`, repetida el 2026-10-15 sobre main)

1. **Gravedad 1 · recibir y anular la MISMA factura a la vez** terminaban bien las dos: factura anulada con sus prendas en el stock (INV-14,
   3 de 3). `recibir_compras` bloquea la LÍNEA y `anular_compra` la FACTURA: cada una miraba a la otra antes de que confirmara.
2. **Gravedad 1 · el mismo token con otro contenido** devolvía lo del primer envío en `registrar_compra` (una factura de 3 × S/ 30 devuelta
   para un pedido de 9 × S/ 99) y en los tres pagos (S/ 100 guardados, S/ 200 anunciados). `recibir_envio` ya respondía «Este envío ya
   estaba registrado. No se sumó nada de nuevo.»: resiste.
3. **Gravedad 1, solo por la API · `NaN`** en el costo o el IGV de una factura (total `NaN`), y en las demás tablas de Compras.
4. **Gravedad 2, solo por la API:** IGV de 1000 %, emisión en 2030, factura sin serie, vencimiento antes de la emisión, proveedor de 5000 letras.
5. **Gravedad 3:** `/compras/proveedores/abc` daba la pantalla de error; `/compras/por-pagar?desde=2026-02-31&prov=abc` se caía.

## La decisión

- **Base, parte 1** (`20261015170000`, solo `alter table`): `<tabla>_montos_finitos` en las diez tablas de Compras que no lo tenían (los pagos
  ya lo tenían); `compras_vence_despues_de_emitir`; `proveedores_textos_con_tope` (nombre hasta 120; en producción, 43). Sin tope de monto: una
  compra grande de mercadería es real.
- **Base, parte 2** (`20261015171000`, reemplazos anclados):
  - `anular_compra` bloquea las líneas de la factura **antes** de la factura, en el orden de `fn_bloquear_en_orden`: el mismo orden que toda
    recepción (bloquea la línea y después actualiza la factura), y que `cerrar_linea_compra` y `reasignar_reparto_compra`. Una recepción en
    curso termina primero y anular la ve («ya tiene mercadería recibida»); o anular termina primero y la recepción ve la factura anulada.
    Con el orden al revés (primero la factura), Postgres cortaba a una de las dos por bloqueo mutuo, y podía ser la recepción.
  - `fn_intento_con_huella` en `registrar_compra` y en los tres pagos.
  - En `registrar_compra`: IGV de 0 % a 18 % (como en Producción), emisión no futura, y una factura o una boleta con su serie (una nota de
    venta o «sin comprobante» pueden no traerla).
- **Web:** Nueva factura dice lo mismo antes de mandar (`problemaDeFechasEIgv`, y el campo del IGV con máximo 18); la ficha de un proveedor
  con un id que no es uuid da «no existe»; las fechas de los filtros de Compras tienen que existir (`esFechaQueExiste`, en `fechas-lima.ts`,
  la misma pieza que ahora usa Movimientos). La razón social del proveedor sigue saliendo de `ConsultaDocumento` (la pieza de Vender): el nombre
  de 5000 letras era solo por la API y lo frena la base.

## Cómo se pega en producción

Dos partes, cada una en su llamada y en este orden: `20261015170000` (solo `alter table`) y `20261015171000` (cinco reemplazos anclados que
se detienen sin tocar nada si un ancla cambió). Ninguna lleva políticas. Antes (verificado el 2026-10-15): todavía no hay facturas de compra en
producción; `anular_compra` y `registrar_compra` idénticas a las de local, y los tres pagos iguales salvo comentarios (md5 normalizado igual).
