# ADR-0194 — Finanzas: un solo comprobante de proveedor para mercadería, gasto y activo, y cinco módulos

**Fecha:** 2026-09-24
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
