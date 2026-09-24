# Plan · Finanzas: el módulo que reemplaza a Alegra (2026-09-24)

> **Estado:** PLAN, sin código ni migraciones. Aprobado por Felipe en lo conceptual (decisiones A y B, 2026-09-24).
> **F0 hecha (2026-09-24):** spike visual completo en `docs/maquetas/finanzas-2026-09/` (README con el guion de prueba).
> **v2 del spike (mismo día):** filtro «Ver», capa para decidir, plata del dueño y módulo Configuración (ADR-0194, actualización b).
> Siguiente paso: que Felipe lo recorra y apruebe las pantallas antes de construir F1.
> ADR asociado: `docs/adr/0194-finanzas-un-comprobante-de-proveedor-y-cinco-modulos.md`.
> Se apoya en tres ADR que Felipe ya aprobó y que viven en el PR #170 (sin fusionar, sin pegar en producción):
> **ADR-0109** (los estados salen de un diario derivado que se congela al cerrar el mes), **ADR-0117** (gastos) y
> **ADR-0120** (las reglas de posteo en `fn_asientos`). Este plan **no los reemplaza**: los retoma y dice qué cambia.

---

## 1. Qué es Finanzas (y qué no)

**Alegra hoy hace tres trabajos. El ERP los cubre así:**

| Trabajo de Alegra | Quién lo cubre en el ERP | Estado |
|---|---|---|
| Emitir boletas y facturas a SUNAT | **Facturación** (Lucode) | Ya existe, en producción |
| Gestión: gastos, ingresos, ¿gané?, ¿hay plata? | **Finanzas — piso de arriba** (lo que Felipe mira y decide) | Este plan |
| Contabilidad: cuentas, asientos, libros | **Finanzas — piso de abajo** (automático, invisible) | Este plan |

- **Finanzas** responde *¿gané?, ¿cuánta plata tengo?, ¿me alcanza para pagar el viernes?, ¿qué tienda sostiene a cuál?*
- **La contabilidad** responde *¿está todo registrado como exige la ley?* Vive debajo: nadie en CAYLA escribe un asiento
  contable (si alguien tiene que hacerlo, el diseño falló — manual contable §7).
- **El contador sigue presentando los libros electrónicos a SUNAT (PLE)** con el reporte que le da el sistema (D-36).
  CAYLA no carga con un formato legal que cambia.

## 2. Punto de partida (verificado contra producción el 2026-09-24)

**Casi todo lo que Finanzas necesita ya se registra en otro módulo.** Finanzas junta; lo nuevo es poco.

| Dato | Dónde vive | En producción hoy |
|---|---|---|
| Cobros de ventas por medio | `venta_pagos` | 7.414 cobros ≈ S/ 943 mil: efectivo 48 %, Yape 24 %, Plin 14 %, tarjeta 10 %, transferencia 4 % |
| Cajón de cada tienda | `cajas`, `caja_movimientos`, `caja_traslados` | 285 cajas; 4 egresos/ingresos manuales |
| Facturas de proveedor de mercadería | `compras`, `compra_items`, `compra_pagos`, `compras_resumen` | 164 facturas, 173 pagos ≈ S/ 424 mil (90 % transferencia) |
| Notas de crédito de proveedor | `compra_notas_credito`, `proveedor_creditos` | 2 / 1 |
| Facturas de insumos del Taller | `comprobantes_produccion` (+ pagos) | 0 (módulo propio de Producción, ADR-0133) |
| IGV de ventas | `comprobantes` | 6.671 |
| Costo de la prenda al vender | `venta_items.costo_unitario` (sellado), `costo_historial` | Sí |
| Mermas | `prendas_danadas`, `movimientos` | Sí |
| Planilla por sede | vista `planilla_por_sede` (lee Dynamic) | Existe |
| Gastos | `gastos` (versión temprana, **no** la de ADR-0117) | **0 filas**, sin pantalla |
| Activos fijos | `activos_fijos` (ya trae depreciación y `cuenta_codigo`) | **0 filas**, sin pantalla |
| Cuentas contables | — (en PR #170: `cuentas`, `parametros_tributarios`) | No existe |
| Cuentas bancarias / billeteras de CAYLA | — | **No existe** |

Hoy **nadie ve** los gastos, el banco, la utilidad por tienda ni el IGV neto. Eso es lo que el módulo agrega.

## 3. Las 11 piezas

**Lo que se registra a mano** (tres cosas nuevas)
1. **Gastos** — alquiler, luz, contador, publicidad, bolsas… con su tienda (o «de la empresa»), categoría y comprobante.
2. **Cuentas y dinero** — las cuentas bancarias y billeteras de CAYLA, los movimientos entre ellas (depósitos del
   cajón, abono de la tarjeta, comisiones) y la conciliación semanal contra el banco.
3. **Activos fijos** — muebles, equipos, remodelación, máquinas del Taller, con su depreciación.

**Lo que sale solo** (se calcula, nadie lo tipea)

4. **Resumen** — los números que Felipe mira primero (D-52) + utilidad del mes, plata disponible, deuda, IGV.
5. **Efectivo por tienda** — cuánto debería haber en cada cajón ahora, consolidado.
6. **Por pagar** — todo lo que CAYLA debe (mercadería, insumos, gastos, activos), en un calendario de vencimientos.
7. **Estado de resultados** — por tienda, Taller y consolidado (D-30), con planilla (D-33).
8. **Flujo de caja** — lo que pasó (cobros − pagos) y lo que viene (vencimientos + gastos fijos).
9. **Balance** — lo que CAYLA tiene menos lo que debe; solo se dibuja si cuadra (ADR-0109, conciliación).
10. **Impuestos** — IGV de ventas contra IGV descontable, alerta del umbral de 300 UIT, reporte para el contador.
11. **Cierre de mes** — la rutina de 3 días y el congelado del mes, por unidad y consolidado (ADR-0109).

## 4. Decisiones que gobiernan el plan

### Ya aprobadas antes (se mantienen)
- **ADR-0109 — opción C:** los estados salen de un diario que `fn_asientos` **genera** leyendo las operaciones; al cerrar
  el mes se materializa inmutable con un hash. Ninguna operación de dinero (venta, compra, caja) cambia su transacción.
- **ADR-0109 — Felipe:** Yape, Plin y transferencia llegan **al banco al instante** (cuenta 104); solo la tarjeta espera
  en 105 hasta el abono. El cierre es **por unidad** (cada tienda y el Taller) **y consolidado**; el consolidado exige
  todas las unidades cerradas.
- **ADR-0117:** un egreso de caja es un **medio de pago**, no un gasto; solo es gasto si un gasto lo señala (imposible
  contarlo dos veces). Depósitos, retiros y ajustes se marcan «no es gasto». Categorías **cerradas, con su cuenta
  contable**, sin «Otros». Nada se borra: se anula con motivo.
- **Plan de cuentas:** ~26 cuentas del manual contable, **una por concepto, no por sede** (la sede es etiqueta del asiento).
- **D-32 / ADR-0117:** los gastos que no son de ninguna tienda son «de la empresa» y aparecen solo en el consolidado.

### Nuevas de hoy (ADR-0194)
- **A · Un solo «comprobante de proveedor» para mercadería, gasto y activo.** La cabecera de `compras` (proveedor, serie,
  número, IGV, contado/crédito, vencimiento, pagos, saldo) es la misma para los tres; cambia el detalle. La pantalla de
  gastos vive en Finanzas. Ver §5.
- **B · Finanzas se parte en 5 módulos** para Roles y accesos, y **con Gastos una cuenta ve solo su tienda** (como
  Compras, ADR-0184). Ver §6.

### Lo que A y B cambian de ADR-0117 (dicho en voz alta)
| ADR-0117 decía | Queda así | Por qué |
|---|---|---|
| Solo el líder registra gastos | Quien tenga el módulo **Gastos**, en su tienda; el líder, en todas | ADR-0161 (roles «ve / no ve») llegó después y manda |
| Se registra al pagar; no hay «gastos por pagar» | Un gasto con factura **a crédito** queda en Por pagar hasta pagarse | Decisión A: comparte la cabecera y el saldo de `compras` |
| El gasto guarda su propio comprobante y proveedor | Si hay comprobante de proveedor, cuelga de la cabecera `compras`; el gasto sin comprobante sigue solo | Un solo IGV descontable y un solo candado contra la factura doble |
| Firma con el usuario | Firma con `fn_actor_persona_id(true)` y combo Responsable | Regla de CLAUDE.md, ADR-0161 act. c |

## 5. Cómo se registra cada salida de plata (decisión A)

```
                    ┌────────────── comprobante de proveedor (cabecera `compras`) ──────────────┐
                    │ proveedor · serie-número · IGV · contado/crédito · vencimiento · pagos · saldo │
                    └───────┬───────────────────────┬─────────────────────────┬─────────────────┘
                   naturaleza=mercaderia     naturaleza=gasto          naturaleza=activo
                            │                       │                         │
                     compra_items            gastos (ADR-0117)          activos_fijos
                  (prendas → Recibir →      categoría → cuenta,        bien, tienda, costo,
                     inventario)            tienda o «empresa»        vida útil → depreciación
```

| Situación | Cómo entra | Ejemplo |
|---|---|---|
| Factura o boleta de un proveedor (contado o crédito) | Cabecera `compras` con `naturaleza = gasto` o `activo` + su detalle | Recibo de luz, alquiler con factura, la Zebra |
| Recibo por honorarios | Igual, con tipo `recibo_por_honorarios` (sin IGV) | El contador |
| Gasto sin comprobante pagado por banco/Yape | Solo una fila en `gastos` (camino A de ADR-0117) | Movilidad pagada por Yape |
| Gasto chico en efectivo del cajón | Egreso de caja + gasto que lo señala (caminos B y C de ADR-0117) | Mototaxi, útiles |
| Depósito del cajón al banco | Egreso de caja señalado por un movimiento de dinero (§7) — «no es gasto» | Depósito BCP de TRU |
| Planilla | **No se registra**: se lee de Dynamic (D-33) | Sueldos del mes |
| Insumos del Taller | Siguen en `comprobantes_produccion` (ADR-0133, decisión de Felipe) | Tela, avíos |

**Candados que lo hacen imposible de romper:**
- La misma factura no entra dos veces, ni como mercadería y gasto a la vez: `unique (proveedor_id, serie, numero)` ya existe.
- Una cabecera `naturaleza = gasto | activo` no tiene `compra_items` ni cantidades por recibir; una de mercadería no tiene
  filas de gasto. Se impone en la base (trigger), no en la pantalla.
- La suma del detalle cuadra con el total de la cabecera.
- Recibir, reparto por tienda (ADR-0139) y las pantallas de Compras **filtran `naturaleza = mercaderia`**: no ven gastos.

## 6. Módulos para Roles y accesos (decisión B)

Todos nacen **solo para el líder** (regla de CLAUDE.md, ADR-0161): migración propia con `insert into retail.modulos`, sin
`rol_modulos`; `CLAVES_MODULO`/`MODULOS` en `lib/modulos.ts`; nodo en `lib/menu.ts`; `exigirModulo` en cada `layout.tsx`.

| Clave | Nombre | Incluye (palabras del negocio) | Alcance con el módulo |
|---|---|---|---|
| `gastos` | Gastos | Registrar y anular gastos y activos fijos; clasificar egresos de caja | Solo su tienda (líder: todas + «de la empresa») |
| `cuentas_dinero` | Cuentas y dinero | Cuentas bancarias y billeteras, depósitos, abonos de tarjeta, efectivo por tienda, por pagar y pagos, conciliación | Solo su tienda (líder: todas; conciliación solo líder) |
| `reportes_financieros` | Reportes financieros | Resumen, estado de resultados, flujo de caja, balance | Solo su tienda (líder: consolidado) |
| `impuestos` | Impuestos | IGV, alerta de 300 UIT, reporte para el contador | Empresa entera |
| `cierre_mes` | Cierre de mes | Cerrar y reabrir el mes | **Siempre solo del líder** (`delegable = false`) |
| `configuracion` | Configuración (grupo **Gestión**, módulo general del ERP) | Empresa, cuentas y cobros, mínimo de caja y avisos, gastos fijos, presupuesto, IGV y UIT | **Solo del líder** (`delegable = false`) |

«Quién lo registró» queda guardado solo (responsable del combo); es auditoría, no permiso.

**Menú (6 hijas, el tope de `lib/menu.ts`):** Resumen · Gastos (Gastos, Activos fijos, Egresos de caja por clasificar) ·
Cuentas y dinero (Cuentas, Efectivo por tienda, Por pagar, Conciliación) · Reportes (Resultados, Flujo, Balance) · Impuestos ·
Cierre de mes. Las 11 piezas son pestañas dentro de esas 6 entradas (ajuste del spike, 2026-09-24).

## 6 bis. Filtro de tienda y capa para decidir (ADR-0194, actualización b)

- **Cabecera = dónde trabajas** (una sede). **«Ver» dentro de la pantalla = qué miras**, con «Todas las tiendas».
  Flujo, Balance, Impuestos, Cierre y Conciliación son de CAYLA entera y lo dicen.
- **Capa para decidir** (todo con reglas y cálculos, cada número con su origen):

| Capacidad | Pantalla | Se calcula de | Fase |
|---|---|---|---|
| Días de caja | Resumen | saldo de cuentas ÷ salidas diarias promedio | F6 |
| Punto de equilibrio por tienda y día del mes en que se cubre | Resumen | gastos ÷ margen % (estado de resultados) | F5 |
| Presupuesto contra real, proyección al cierre | Reportes ▸ Presupuesto | `presupuestos` (nuevo) + estado de resultados | F5 |
| Escenarios «¿y si…?» | Reportes ▸ Escenarios | el mismo cálculo del estado de resultados y del flujo, sin guardar | F6 |
| Avisos de lo raro | Resumen, Gastos | gasto contra el promedio de 6 meses del mismo proveedor y tienda; mermas ÷ ventas; `costo_historial` | F10 |
| Gastos fijos: proponer, avisar faltantes, detectar | Gastos ▸ Fijos del mes | `gastos_fijos` (nuevo) + gastos por proveedor, día y monto | F2 |
| Conciliación con parejas | Cuentas y dinero ▸ Conciliación | extracto subido + movimientos por monto, fecha y referencia | F3 |
| Plata del dueño (aporte, préstamo, retiro, devolución) | Cuentas y dinero | `movimientos_dinero` | F3 |
| Configuración | Gestión ▸ Configuración | `configuracion_empresa` + tablas de Finanzas | F1 |

## 7. Cuentas y dinero (lo nuevo que más pesa)

- **`cuentas_dinero`**: cada lugar donde CAYLA tiene plata — cuenta bancaria, billetera Yape/Plin, POS de tarjeta, y
  cada cajón de tienda (ya existe como caja). Con su cuenta contable (101/104/105).
- **`medios_de_cobro`**: «en TRU, Yape entra a la cuenta X». Así **Vender no cambia**: el cobro sigue guardando el medio y
  Finanzas deduce a qué cuenta llegó. Lo mismo al pagar a un proveedor (se propone la cuenta, se puede cambiar).
- **`movimientos_dinero`** (solo agrega filas, se anula con motivo): depósito del cajón al banco, abono de tarjeta
  (105 → 104, con la comisión del POS como gasto), transferencia entre cuentas, aporte y retiro del dueño.
- **Saldo de una cuenta = se suma, nunca se guarda** (ADR-0109: guardar un saldo haría que las tiendas se bloqueen entre sí).
- **Conciliación semanal:** se anota el saldo que dice el banco; el sistema muestra la diferencia y los movimientos sin
  pareja. Importar el extracto (CSV) queda para después.

## 8. De qué dato sale cada pantalla

| Pieza | Lee | Escribe |
|---|---|---|
| 1 Gastos | `categorias_gasto`, `compras` (gasto), `gastos`, `caja_movimientos` | `registrar_gasto`, `registrar_comprobante_proveedor`, `anular_gasto`, `marcar_egreso_no_gasto` |
| 2 Cuentas y dinero | `cuentas_dinero`, `movimientos_dinero`, `venta_pagos`, `compra_pagos`, pagos de producción | `registrar_movimiento_dinero`, `registrar_conciliacion` |
| 3 Activos fijos | `activos_fijos`, `compras` (activo) | `registrar_activo`, `dar_de_baja_activo` |
| 4 Resumen | todas las lecturas de abajo | — |
| 5 Efectivo por tienda | `fn_resumen_caja` (ADR-0191), `caja_traslados` | — |
| 6 Por pagar | `compras_resumen` (las 3 naturalezas) + `comprobantes_produccion` (vista consolidada, D-I de ADR-0133) | pagos (ya existen) |
| 7 Estado de resultados | `fn_estado_resultados` sobre `fn_asientos` + `planilla_por_sede` | — |
| 8 Flujo de caja | `fn_asientos` (101/104/105) + vencimientos + gastos recurrentes | — |
| 9 Balance | `fn_balance_general`, `fn_conciliacion_contable`, `saldos_iniciales` | `registrar_saldo_inicial` (una vez) |
| 10 Impuestos | `comprobantes` (débito), `compras` factura (crédito), `parametros_tributarios` | — (exporta archivo) |
| 11 Cierre de mes | `periodos`, `fn_conciliacion_contable` | `cerrar_periodo`, `reabrir_periodo` |

## 9. Fases (cada una, un PR verificable en el navegador)

| Fase | Qué | Cómo lo verificas tú |
|---|---|---|
| **F0 · Spike visual** ✅ 2026-09-24 | Las 11 piezas en HTML navegable con la paleta oficial y datos de muestra; `docs/maquetas/finanzas-2026-09/` | Abres el spike y recorres cada pantalla |
| **F1 · Cimientos** | Rescatar del PR #170 `cuentas`, `parametros_tributarios`, `categorias_gasto`; los 5 módulos; grupo «Finanzas» en el menú | Roles y accesos muestra los 5 módulos «solo líder» |
| **F2 · Gastos y activos** | ADR-0117 adaptado + `naturaleza` en `compras` + recibo por honorarios + alta de activo | Registras la luz a crédito y aparece en Por pagar; un mototaxi del cajón |
| **F3 · Cuentas y dinero** | `cuentas_dinero`, `medios_de_cobro`, `movimientos_dinero`, conciliación | Depósito de TRU baja el cajón y sube el BCP; el saldo coincide con el banco |
| **F4 · Por pagar consolidado** | Una vista con mercadería, gastos, activos e insumos; calendario | Ves lo que debe CAYLA esta semana, sumado |
| **F5 · Diario y resultados** | `fn_asientos` (ADR-0120) + reglas nuevas + Estado de resultados por unidad y consolidado con planilla | El resultado de TRU de agosto cuadra con tus números |
| **F6 · Flujo de caja** | Real y proyectado a 4–8 semanas | Ves si alcanza para los pagos del mes |
| **F7 · Balance** | Saldos iniciales, depreciación, conciliación contable; el Balance no se dibuja si no cuadra | Activo = Pasivo + Patrimonio con capital como entrada |
| **F8 · Impuestos** | IGV neto, alerta 300 UIT, registro de ventas/compras para el contador | El contador acepta el archivo |
| **F9 · Cierre de mes** | `periodos`, cierre por unidad y consolidado, bloqueo por fecha, reapertura con motivo | Cierras agosto de TRU y no puedes registrar un gasto con fecha de agosto |
| **F10 · Resumen** | El tablero con todo lo anterior | Lo abres el lunes y te dice qué decidir |

**El PR #170 no se descarta:** en F1/F2/F5 se rebasa sobre `main` y se reusa (tablas, pruebas, pantalla de egresos,
`fn_asientos`, `fn_estado_resultados`), adaptado a las decisiones A y B, a los roles (ADR-0161) y al menú de datos (ADR-0144).

## 10. Lo que queda abierto

**Decisiones de Felipe (negocio):**
1. **Balance por tienda:** ¿basta con lo atribuible a la tienda (su caja, su inventario, sus activos), o esperas uno completo
   repartiendo banco y capital? (ADR-0109, sin confirmar.)
2. **Aportes y retiros del dueño:** ¿Felipe saca o pone plata del negocio? Define si hacen falta en F3.
3. **Gastos fijos:** ¿quieres que el sistema proponga cada mes los recurrentes (alquiler, internet) para confirmarlos?

**Datos que faltan (Felipe los junta):**
4. Cuántas cuentas bancarias y billeteras tiene CAYLA, y a cuál entra el Yape, el Plin y el POS de cada tienda.
5. Saldos al día de arranque: banco, deuda, capital (para F7).

**Del contador:**
6. Confirmar las ~26 cuentas y la cuenta de cada categoría; régimen, UIT y umbral; formato del registro de compras y
   ventas; tratamiento de la retención del recibo por honorarios.

**Riesgo registrado:** la decisión A toca `compras`, que está en producción y se usa a diario. Por eso F2 lleva prueba de que
Recibir, Reparto por tienda (ADR-0139), Por pagar por tienda (ADR-0187) y el candado de dinero (ADR-0126) siguen igual.
