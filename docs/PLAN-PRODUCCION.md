# Plan · Producción como módulo propio, conectado con Compras (2026-09-19)

> **Estado:** F1 y F2 aplicadas; F3 en adelante propuesto. Pendiente del ok de Felipe en **D-E, D-F, D-G e D-I** (sección 3).
> ADR asociado: `docs/adr/0133-produccion-modulo-propio-conectado-con-compras.md`.
> Diseño de referencia: `docs/maquetas/produccion-modulo-2026-09/` (README con el guion de prueba).

> ## Cambio de rumbo — 2026-09-19 (decisión de Felipe, mismo día)
> **Producción y Compras son dos módulos distintos: no se fusionan.** Cada uno tiene su grupo en el menú, **sus propios proveedores** y
> **sus propias pantallas** (Comprobantes, Por pagar, Recibir). Lo que el spike agrupaba en «Abastecer» pasa a ser el abastecimiento
> **propio de Producción** (tela, avíos y maquila); Compras conserva lo suyo (prenda terminada para las tiendas) y no se toca.
>
> Felipe eligió esto **contra mi recomendación** (que era una sola lista de proveedores vista por rubro, y una sola factura registrada en
> Compras). La decisión es suya y este plan la adopta. Lo que cuesta, para que no sorprenda después:
> 1. **Un proveedor real que vende a los dos módulos existe dos veces** (RUC, cuenta, contacto): dos fichas que mantener.
> 2. **La deuda con proveedores vive en dos lugares.** Nadie ve «lo que debe CAYLA» sumado sin una vista consolidada (**D-I**, abierta).
> 3. **El IGV crédito fiscal sale de dos libros.** El registro de compras del contador tiene que unir los dos (**D-I**).
> 4. Se duplica lógica financiera ya resuelta en Compras (contado ⇒ pago en la misma transacción, vencimiento, faltantes, pagos).
> A favor: Producción avanza **sin depender de ADR-0139** (no toca `compras`, `compra_items` ni sus funciones) y sin riesgo de romper Compras.
> Como `insumos`/`insumo_lotes` tienen **0 filas** en producción, repuntar sus llaves al nuevo directorio hoy es barato; con datos sería otra historia.

## 1. Objetivo

Que **comprar, recibir, fabricar y medir** sean un solo recorrido conectado: la factura de tela abre un lote, la orden
consume ese lote, el costo de la prenda sale de lo consumido, la prenda cerrada entra al inventario, y el Resumen le dice a
Felipe qué decidir hoy con datos de todos esos módulos. Cada módulo deja de ser una isla.

Principios que gobiernan el plan: **4** (todo es movimiento; el saldo se deriva), **2** (los estados imposibles se
cierran en la base, no en la pantalla), **7** (cada paso se prueba en el navegador), **3** (piezas chicas: una fase = un PR).

## 2. Punto de partida (verificado el 2026-09-19 contra el repo)

| Hecho | Dónde | Consecuencia para el plan |
|---|---|---|
| La rama está **2 commits atrás** de `main`; `main` ya usa el **ADR-0129** (Recibir) | `git log HEAD..origin/main` | F0: fusionar `main`. El ADR de esto nació como 0130 y se **renumeró a 0133** el 2026-09-19: el 0130 lo tomaron el menú plegable (ya en `main`) y otra rama, y el 0131/0132 también están ocupados |
| Producción (órdenes) **ya existe y funciona**: `abrir/cerrar/anular/revertir_produccion`, `set_etapa_produccion` | `20260915130000_produccion_del_taller.sql`, `lib/produccion.ts`, `OrdenesProduccionV2.tsx` | F2 rediseña la pantalla; **no toca la base** |
| `cerrar_produccion` recibe `p_buenas` **por variante** y acepta costos `null` (conserva los de la orden) | mismo archivo, líneas 267-345 | El cierre por talla×color es obligatorio; el costo puede venir del consumo |
| Insumos: tablas y `recibir_insumo` en producción; `registrar_consumo_insumo` **pegada el 2026-09-17**; **0 filas y 0 pantallas** | ADR-0090; `grep` en `apps/web` sin llamadas | F3 solo es pantalla |
| Compras es un grupo del lateral, solo líder; sus URLs (`/compras/*`, `/recibir`) tienen enlaces por todos lados | `AppShell.tsx:544-548, 640-660` | F1 cambia **el agrupamiento del menú, no las URLs** |
| `registrar_compra` y el reparto por tienda (ADR-0139, en curso en otra rama) son de **Compras** | `CompraFormV2.tsx`, ADR-0139 | **No condicionan a Producción** (D-H): tiene su propio abastecimiento y no toca `compras` |
| Otras ramas tocan Compras (ADR-0131 Por pagar, ADR-0139 reparto entre tiendas) | `git log origin/main..rama` | Ninguna fase de Producción modifica Compras; solo se coordina el orden de los ADR y de las migraciones |
| `compra_items.producto_id` es **NOT NULL**: una factura de tela no cabe | `DICCIONARIO-RETAIL.md:1686` | F4 (único cambio de esquema grande) |
| `fn_puede_operar_ubicacion` = líder **o** mi ubicación: **el líder ya puede operar el Taller desde cualquier sede** | `0006_colaboradores.sql:51` | La regla «Producción solo parado en el Taller» (2026-09-17, vigente otra vez desde 2026-09-20) es de menú y de página, no de base |
| El motor de reposición ya existe: `fn_resumen_variantes` (ventas, disponible, en camino, días observables, `en_red`) | `20260919141804_resumen_inventario_v2.sql` | «¿Qué producir?» **lo reutiliza**, no recalcula ventas por su cuenta |
| El dinero de Compras es solo del líder y lo hace cumplir la base (`fn_puede_ver_dinero_de_compras`) | ADR-0126 | Todo monto nuevo nace bajo ese candado |
| `insumo_lotes`/`movimientos_insumo` se leen con `fn_puede_operar_ubicacion`: **un colaborador del Taller ve costos** | `DICCIONARIO-RETAIL.md:2088` | F4c cierra ese hueco (D-G) |
| `useFlip`, `useContar`, `useEnVista`, `Sparkline`, `CifraAnimada`, `PasoSugerido`, `TarjetaSenal`, `Avisos` (con «Deshacer»), `SegmentoDeslizante`, `Tabla`, `Chip` **ya existen** | `apps/web/lib`, `components/ui` | El spike se **porta con estas piezas**, no se copia su CSS |
| Otras sesiones rediseñaron Proveedores (ADR-0128, en `main`) y Recibir (ADR-0129, en `main`); Por pagar se rediseña en otra rama (ADR-0131) | `SESIONES-ACTIVAS.md`, ramas | **«Abastecer» es navegación y conexión, no rediseño** de esas pantallas |

## 3. Decisiones (mi recomendación; Felipe decide)

| # | Decisión | Recomiendo | Por qué | Gate |
|---|---|---|---|---|
| **D-A** | Menú: ¿quién ve Producción? | ✅ **Decidida y REVERTIDA el 2026-09-20.** Hoy rige: Producción se ve **solo parado en un Taller, líder incluido** (por el tipo de la ubicación activa); **Compras sigue siendo un grupo aparte** y no cambió. Entre el 2026-09-19 y el 2026-09-20 rigió lo contrario (el líder la veía desde cualquier ubicación) | Es solo de menú y de página: la base sigue dejando al líder operar el Taller desde cualquier sede. Vuelve a la regla del 2026-09-17 | Felipe (2026-09-20, al verla en una tienda) |
| **D-B** | Destino Taller/Tiendas de un comprobante | ⛔ **Sin objeto.** Producción registra **sus** comprobantes (D-H); ya no comparte `compras` ni el reparto de ADR-0139 | — | — |
| **D-C** | Cómo entra la tela a una factura | ⛔ **Reemplazada por D-H.** Ya no se toca `compra_items` | — | — |
| **D-D** | Rendimiento (m/prenda) | **Medido**: consumo real ÷ buenas de las órdenes cerradas del modelo. Sin receta ni tablas. Modelo sin historial: se escribe el rendimiento en la orden y solo alimenta la vista previa | `bom_items` murió; una receta manual envejece. Lo medido no miente | — |
| **D-E** | Cotización de maquila externa (D-31) | Tabla `maquila_referencias` (append-only: modelo, precio por prenda, fecha, proveedor opcional). Solo líder | Es la mitad de D-31 sin dónde vivir (hueco 3) | esquema: ok |
| **D-F** | Gastos del Taller (denominador de D-31) | Tabla mínima `gastos_taller` (mes, concepto, monto). Solo líder | Finanzas se borró en el corte V1→V2; esperar su reconstrucción bloquea Eficiencia. Se migra cuando exista | esquema: ok |
| **D-G** | Costos de insumos | Cerrar `insumo_lotes`/`movimientos_insumo` a `fn_puede_ver_dinero_de_compras`; el colaborador lee cantidades por una función **operativa** (mismo patrón que ADR-0126) y `v_insumo_saldos` pasa a `security_invoker` | El colaborador no debe ver lo que cuesta la tela; hoy puede | esquema: ok |
| **D-H** | Abastecimiento de Producción | ✅ **Decidida por Felipe (2026-09-19), contra mi recomendación.** Producción tiene **su propio directorio de proveedores** y **sus propios Comprobantes, Por pagar y Recibir**. Forma que propongo: tabla `proveedores_produccion` (mismas columnas útiles que `proveedores`), y `comprobantes_produccion` (+ `_items`, `_pagos`) con las reglas de ADR-0035 | Separa los módulos de raíz y desbloquea Producción sin tocar Compras. Cuesta duplicados y deuda en dos sitios (ver el recuadro de arriba) | esquema: ok al pegar |
| **D-I** | Vista consolidada de deuda e IGV | ✅ **Decidida por Felipe (2026-09-21): se procede con la recomendación.** Consolidado de **solo lectura** para el líder, dentro de «Por pagar» de Producción: deuda por proveedor de Compras y de Producción juntas (con lo vencido y el próximo vencimiento) y el IGV crédito fiscal del mes de los dos libros menos las notas de crédito de Compras. `fn_deuda_consolidada()` y `fn_igv_credito_fiscal(mes)` leen `compras` y `compra_notas_credito` sin modificarlas | Sin él, «cuánto debe CAYLA» exigía sumar a mano dos pantallas y el registro de compras de SUNAT quedaba partido | construido en F4c |

Mientras D-E y D-F no se decidan, **Eficiencia se construye con estados vacíos honestos** («Sin gastos registrados»), nunca con cifras de ejemplo.

## 4. Cómo se conecta todo (la matriz que no se rompe)

| Origen → destino | Qué viaja | Cómo se materializa | Fase |
|---|---|---|---|
| Comprobante de **Producción** → Insumos | metros/unidades + costo + proveedor + documento | al recibir, cada línea abre **un lote** (`recibir_comprobante_produccion`, propio; no toca `recibir_compras`) | F4d |
| Insumos → Orden | consumo real por lote (el más antiguo con saldo) | `registrar_consumo_insumo` → recalcula `costo_tela`/`costo_avios` | F3 |
| Orden → Inventario | prendas buenas por variante + costo real | `cerrar_produccion` → `movimientos` (`produccion`) + costo promedio ponderado a `variantes.costo` | ya existe |
| Inventario/Ventas → «¿Qué producir?» | ventas, disponible y en camino por variante | `fn_resumen_variantes` (ADR-0121) | F5, F6 |
| Comprobantes de Producción → Resumen | vencido, por vencer, por recibir | funciones propias de Producción (bajo el mismo candado que ADR-0126) | F6 |
| Compras + Producción → consolidado | deuda por proveedor e IGV crédito fiscal, de los dos módulos | vista de solo lectura (**D-I**) | por decidir |
| Insumos + comprobantes de Producción → Resumen | tela que falta, tela en camino | saldo por insumo + líneas sin recibir | F6 |
| Orden cerrada → Traslados | «Siguiente paso: llevarlas a las tiendas» | enlace a `/inventario/mover` prellenado desde el Taller | F8 |
| Orden → Movimientos | referencia «Orden N» | ADR-0127 ya muestra el proceso de origen | verificar en F8 |
| Proveedores de Producción | gasto en insumos, puntualidad, precio por metro | `fn_proveedor_metricas_insumos` (hoy sobre `retail.proveedores`, en ceros) se repunta al directorio propio | F4a |
| Productos | el modelo y sus variantes **deben existir** antes de abrir una orden | «Nueva orden» enlaza a Productos cuando falta una talla/color | F5 |

## 5. Contrato de diseño: portar el spike, cambiar solo lo que CAYLA exige

**Se porta tal cual** (estructura, jerarquía, textos y movimiento): tablero de 4 etapas con FLIP entre columnas, panel de
la orden (etapas con check que se traza, matriz talla×color, costo con barra apilada y medidor de margen), vista previa
antes de confirmar un consumo, «Nueva orden» con curva sugerida y análisis previo, lista de insumos con saldo contra mínimo
y lotes que se despliegan, libro de movimientos, tarjetas de decisión del Resumen, cascada y línea de Eficiencia, cifras
que cuentan, barras que crecen, destello de «acaba de pasar» y avisos con «Deshacer».

**Se construye con lo que ya existe, no con el CSS del spike:** `useFlip`, `useContar`/`CifraAnimada`, `useEnVista`,
`Sparkline`, `PasoSugerido`, `TarjetaSenal`, `SegmentoDeslizante`, `Tabla`, `Chip`, `EncabezadoPagina`, `Avisos`. Clases
`card-cayla`/`label-cayla`/`font-display` y tokens de `@theme`. Paneles laterales con el patrón de `ProveedorVistaRapida`
(Radix, ADR-0003), no un `<aside>` propio.

**Cambios obligatorios (el spike incumple una regla de CAYLA):**

| # | Qué cambia | Regla | Cómo queda |
|---|---|---|---|
| 1 | El spike usa rojo en varias tarjetas del Resumen a la vez | `MAX_ROJO_POR_PANTALLA = 2` (`globals.css`, `TarjetaCifra`) | Urgencia alta = ámbar profundo + punto vivo; el **rojo se reserva** para «vencido» y «entrega pasada», máx. 2 por pantalla. Auditar cada pantalla |
| 2 | Textos de ayuda a 45–55 % de tinta | piso de contraste (ADR-0012) | mínimo 65 % |
| 3 | La vista de colaborador solo **oculta** los soles | ADR-0126: la base lo hace cumplir | el colaborador llama a funciones **operativas** sin costo; la pantalla no recibe el dato (F4c) |
| 4 | Cifras de ejemplo (eficiencia 57 %, fijos S/ 3,800) | «nada inventado» (D-31) | estados vacíos diseñados; la cifra aparece solo con datos reales |
| 5 | Gráfico de línea y «barras que crecen» | gramática de movimiento acotada (ADR-0128) | se **piden en el ADR-0133** como ampliación; sin aprobación, entran sin animar |
| 6 | Drawer propio, `<aside>` propio, lateral propio | AppShell real + Radix | mismo aspecto, piezas reales |
| 7 | Cálculos en el navegador con datos de ejemplo | principio 6 (lo esencial sobrevive al framework) | reglas puras en `lib/produccion-*.ts` con tests; la página lee y pinta |
| 9 | Animaciones en bucle del spike: la barra de la etapa actual que barre, el anillo que late | `Chip` documenta que la **única** animación en bucle permitida por pantalla es su punto «vivo» | la etapa actual se distingue por color y por el trazo del check; nada parpadea (descubierto en F2) |
| 10 | «Días de trabajo por etapa» (3 / 8 / 2) para estimar si una orden llega tarde | «nada inventado»: eran supuestos míos, no datos de CAYLA | el aviso de entrega usa solo hechos: fecha pasada, o a ≤ 2 días (`DIAS_ENTREGA_PRONTO`). Un estimado real llegará con plazos medidos (F7) |
| 8 | Rótulos de sección en el lateral («Abastecer», «Fabricar») | el riel del AppShell se mueve por filas de **alto fijo** (`PASO_FILA`); una fila de otra altura lo desalinea (descubierto en F1) | sin rótulos; el **orden** de las filas cuenta el recorrido (proveedor → factura → recepción → pago → órdenes) |

Regla de decisión sobre el diseño: **si el resultado real se ve distinto al spike, la diferencia debe estar en esta tabla.** Si no
está aquí, es un bug de portado.

## 6. Fases (una fase = un PR; los abre Claude, los fusiona Felipe)

Tamaño: **S** ≈ media sesión · **M** ≈ una sesión · **L** ≈ dos o más.

### F0 · Preparación (S) — sin código de producto
- `git merge origin/main` en la rama; reservar el **ADR-0133** y los timestamps de migración `≥ 20260919170000`; fila en
  `SESIONES-ACTIVAS.md`; commitear el spike y este plan como `docs(produccion): …`.
- **Verificas:** `git log --oneline HEAD..origin/main` vacío; `pnpm typecheck` en verde.

### F1 · Navegación: Producción como grupo propio (M) — sin esquema · D-A dada
- `AppShell.tsx`: **dos grupos separados.** Producción (hoy una fila suelta hacia Órdenes; será grupo cuando tenga más de una pantalla) y
  Compras (sus 4 pantallas, **intactas**), en el orden que pidió Felipe el 2026-09-16: Inicio, Colaboradores, Catálogo, Producción, Compras,
  Ventas, Inventario. Regla en `lib/produccion-menu.ts` (`hijosMenuProduccion` / `hijosMenuCompras`, con pruebas).
- Rutas: **`/produccion/ordenes`** (el contenido de la antigua `/produccion`, movido) y `/produccion`, que redirige ahí hasta que exista el
  Resumen (F6; el Resumen de Inventario ya enlaza a `/produccion`). Las páginas nacen con su fase: **ni páginas vacías ni ítems de menú muertos**.
  Las URLs `/compras/*` y `/recibir` **no cambian**.
- **Historia:** la primera versión de F1 (2026-09-19) movió Compras adentro de Producción, como en el spike. Felipe lo corrigió ese mismo día:
  son módulos distintos. Se deshizo antes de fusionar.
- Diferido a propósito: las **insignias** del menú (piden una consulta por carga de página); entran con F6.
- **Verificado** en navegador como líder parado en Tienda Lima: Producción aparece como fila propia, Compras como grupo con sus 4 pantallas;
  `/produccion` redirige; sin errores de consola; tipos, lint y pruebas en verde. **Sin verificar en navegador:** colaborador del Taller y de
  tienda (exige cerrar la sesión de Felipe); la regla está cubierta por pruebas para los tres perfiles.

### F2 · Órdenes: tablero, panel, matriz y cierre por talla (L) — sin esquema
- **Aplicada el 2026-09-19.** `lib/produccion-reglas.ts` (puras, 31 pruebas): `etapaActual`, `estadoEntrega`, `matrizDeLineas`,
  `desgloseCosto`, `resumenTablero`. Componentes: `OrdenesTablero` (cifras + 4 columnas + muestras + terminadas/anuladas),
  `OrdenTarjeta`, `OrdenPanel` (cajón: etapas, matriz talla×color, costo, cierre), `OrdenCierre`, `MatrizOrden`, `OrdenModales`
  (Anular/Revertir, movidos sin cambios) y el hook `useFlipCajas` (las tarjetas viajan entre columnas). Retira `OrdenesProduccionV2.tsx`.
- **Lo que se conservó a propósito** (el spike no lo tenía): muestras (con sus 3 etapas, en su franja), órdenes terminadas y anuladas,
  «Revertir cierre», y los tres costos reales en el cierre.
- **Cambió respecto al plan original:** `NuevaOrdenProduccionForm.tsx` **sigue pidiendo tela y avíos** hasta F3. Quitarlos antes
  dejaría el costo de la orden en «solo maquila» sin que el consumo de insumos (F3) exista para reemplazarlos: un margen falso.
  El cierre manda `null` (conservar) a quien no es líder.
- **Verificado en el navegador** (líder, base local): abrir orden → marcar etapa (con «Deshacer») → la tarjeta pasa de columna → cerrar
  por talla y color → terminada → revertir → anular; una muestra con sus etapas propias; 390 px sin desborde; sin errores de consola.
- **Pendiente / a decidir:** (1) colaborador del Taller sin probar en navegador; (2) `producciones.costo_*` se leen con
  `fn_puede_operar_ubicacion`: un colaborador ve costos **por la API** aunque la pantalla se los oculte — se suma a D-G (F4e);
  (3) el menú del celular no tiene entrada a Producción (ya era así).

### F3 · Insumos: pantalla y consumo (M) — sin esquema (el candado de montos queda para F4e)
- **Aplicada el 2026-09-20.** `lib/insumos-reglas.ts` (24 pruebas): saldo como suma del ledger, lote más antiguo con saldo, previsión de consumo (misma regla de
  `registrar_consumo_insumo`: no se parte entre lotes), cobertura medida, capital. `lib/insumos.ts`: lectura **desde el ledger, no desde `v_insumo_saldos`**
  (esa vista se salta la RLS: hallazgo de ADR-0090), y **los costos se recortan en el servidor** para quien no es líder. Pantalla `/produccion/insumos`
  (`InsumosPanel`: cifras, telas y avíos con riel de saldo y mínimo, lotes con «1º», libro de movimientos), `NuevoInsumoModal` (INSERT del líder: la política RLS
  ya lo permite) e `IngresarInsumoModal` (`recibir_insumo`). En la orden: `OrdenInsumos` (lo descontado + formulario con vista previa que refleja lo que la
  base hace: **el primer consumo de un tipo reemplaza el costo tecleado por lo real**).
- **Decisiones al implementar:** (1) el ingreso de insumo **no pide proveedor**: hoy `insumo_lotes.proveedor_id` apunta a `retail.proveedores` y F4a lo repunta al
  directorio propio de Producción; se agrega entonces. (2) `NuevaOrdenProduccionForm` **sigue pidiendo tela y avíos** hasta que el Taller cargue sus insumos: con
  el catálogo en 0 filas, quitarlos dejaría el costo en «solo maquila». Se revisa cuando haya uso real.
- **Hallazgo importante (cambia el plan):** **ninguna función devuelve insumos.** `anular_produccion` y `revertir_produccion` no tocan `movimientos_insumo`, y nadie
  escribe movimientos `devolucion`. Consecuencias: un consumo **no se puede deshacer** y anular una orden **no devuelve** la tela a su lote. El spike mostraba un
  «Deshacer» y decía que anular devolvía los lotes: **era falso**. La pantalla lo decía tal cual y se abrió la fase **F3b** (ya construida: ver abajo).
- **Verificado en el navegador** (líder, base local): crear insumo → ingresar dos lotes (120 m a S/ 18.50 y 80 m a S/ 19.80) → descontar 30 m desde una orden
  (rechaza 130 m con el saldo exacto del lote; la vista previa coincide con lo que la base guardó: tela S/ 420 → S/ 555, costo por prenda 21.67 → 25.42) → el saldo
  baja a 170 m y el libro lo registra; anular avisa; 390 px sin desborde; sin errores de consola. **Sin verificar:** colaborador del Taller.
- **Conocido:** quien no es líder no ve montos en pantalla, pero `insumo_lotes.costo_unitario` sigue legible por la API (F4e).

### F3b · Devolver insumos (S) — esquema · **✅ aplicada en producción y validada (2026-09-20)**
Migración `20260920100000_devolver_insumos_de_produccion.sql` (todo sobre tablas que ya existen; producción tiene 0 insumos y 0 órdenes, así que no hay datos que migrar):
- `devolver_insumo_de_produccion(p_produccion_id, p_insumo_id, p_cantidad, p_nota)`: escribe el movimiento `devolucion` que la tabla ya admitía. La cantidad vuelve al
  **último lote del que esa orden sacó ese insumo** (PEPS al revés) y al costo con que salió; no parte entre lotes; nunca más de lo descontado (neto); solo con la orden en proceso.
- `fn_recalcular_costo_insumos_produccion(uuid)` (interna, sin `execute` para `authenticated`): costo de tela/avíos de la orden = consumos − devoluciones, cada uno a su lote.
  **Corrige `registrar_consumo_insumo`**, que sumaba consumos sin restar devoluciones (misma firma, `create or replace`, sin sobrecargas).
- `anular_produccion` (misma firma) devuelve al lote todo lo que la orden tenía descontado (motivo `anulacion_orden`) y deja su costo de insumos en 0.
- UI: en el panel de la orden cada insumo descontado muestra su neto y «Devolver al estante» con vista previa (a qué lote vuelve, cómo queda el costo por prenda); el modal
  «Anular» avisa qué vuelve al estante. El ritmo de consumo (`consumoSemanal`) resta lo devuelto para no inflar la cobertura.
- Prueba: `scripts/pruebas/insumos_devolucion.mjs` (10 casos, `pnpm pruebas:insumos-devolucion`, paso en CI) + 6 pruebas nuevas de `insumos-reglas`.
- **Validado en producción (2026-09-20, solo lectura + bloque con rollback):** una sola versión de cada función, el helper cerrado a `authenticated`, y costo 800 → 500 → 0 con el saldo del lote volviendo a 75 y 100; 0 filas de rastro. **Sin verificar en el navegador** (panel oculto).

### F4 · Abastecimiento propio de Producción (L, **alto riesgo**) — esquema · requiere **D-H, D-G** (y **D-I** antes de F4c)
Ya **no depende de ADR-0139** ni toca `compras`, `compra_items`, `registrar_compra` ni `recibir_compras`. Cinco PR, cada uno con su prueba SQL:
- **F4a · Proveedores de Producción — construida en local 2026-09-20; migración `20260920110000` SIN pegar en producción.**
  Tabla `proveedores_produccion` (mismo molde y CHECK que `proveedores`; `rubro` obligatorio: tela | avios | maquila | otro), **solo-líder por RLS**
  (datos bancarios de terceros = dinero, D-G) y sin grants de escritura: se escribe por `guardar_proveedor_produccion` (id nulo = crear; normaliza y valida
  RUC/CCI/celular/billeteras con los mensajes de Compras) y `cambiar_estado_proveedor_produccion` (archivar/reactivar, nunca borrar). Lectura:
  `fn_proveedores_produccion()` y `fn_proveedor_produccion_metricas(uuid)` (lotes, total comprado, última entrega; cero filas para quien no es líder).
  `insumos.proveedor_id` e `insumo_lotes.proveedor_id` se **repuntan** (la migración se detiene si hay filas; hoy 0). **Decisión:** `fn_proveedor_metricas_insumos`
  de Compras NO se reescribe (Compras idéntico; devolverá ceros, que es lo correcto) — se cierra con el candado de F4e. Pantalla `/produccion/proveedores`
  (solo líder, menú «Proveedores»): lista con filtro por rubro y búsqueda, cifras, alta/edición en `<Modal>`, archivar. Saldo y cumplimiento del spike
  **no se dibujan** hasta F4b–F4d (no hay de dónde calcularlos). Prueba `pnpm pruebas:proveedores-produccion` (15 casos, en CI) + 8 de reglas. Sin ver en navegador.
- **F4b · Comprobantes de Producción — construida en local 2026-09-21; migración `20260921100000` SIN pegar en producción.**
  Tablas `comprobantes_produccion` (serie-número único por proveedor, contado/crédito, subtotal + IGV = total por CHECK, IGV solo en facturas, anulada con motivo),
  `comprobantes_produccion_items` (un insumo del catálogo **o** un concepto libre —maquila, flete—; costo unitario sin IGV; `subtotal` derivado) y
  `comprobantes_produccion_pagos` (uno o varios medios). **Solo-líder por RLS**, sin grants de escritura, y líneas/pagos **inmutables** (trigger). RPC:
  `registrar_comprobante_produccion` (mismas reglas de ADR-0035: contado ⇒ pago por el total exacto en la misma transacción; crédito ⇒ vencimiento; idempotente por token;
  el total del papel se cuadra con tolerancia 0,01 por línea + 0,01; pago no futuro ni anterior a la emisión), `anular_comprobante_produccion` (motivo obligatorio y **nunca con
  pagos**: dejaría dinero sin respaldo) y `fn_comprobantes_produccion` (lista con `pagado`, `saldo`, `estado_pago`, `vencido` **derivados**; la reusan F4c y F4d).
  Pantalla `/produccion/comprobantes` (solo líder, menú «Comprobantes»): cifras Por pagar / Vencido / Comprado este mes, filtros por estado y proveedor, alta con vista
  previa de subtotal-IGV-total, detalle con líneas, pagos y anulación. El rojo lo lleva solo la cifra «Vencido»; las filas vencidas van en ámbar con sus días.
  **No abre lotes** (eso es F4d). Prueba `pnpm pruebas:comprobantes-produccion` (26 casos, en CI) + 14 de reglas. Sin ver con clics (panel oculto).
  **F4d debe** agregar el vínculo lote↔línea y actualizar `anular_comprobante_produccion` para negar la anulación con mercadería recibida.
- **F4c · Por pagar de Producción + consolidado D-I — construida en local 2026-09-21; migración `20260921110000` SIN pegar en producción.**
  `registrar_pago_comprobante_produccion(comprobante, pagos, fecha, token)`: pago posterior con **uno o varios medios** (mismo `grupo_id` = un acto de pago), bloquea el comprobante,
  **nunca supera el saldo**, no admite comprobante pagado ni anulado, valida fechas y montos como el pago al contado de F4b, e **idempotente por token**. Columna nueva
  `comprobantes_produccion_pagos.grupo_id`. D-I: `fn_deuda_consolidada()` (por proveedor, de Compras y de Producción: saldo, vencido, próximo vencimiento) y
  `fn_igv_credito_fiscal(mes)` (IGV vigente del mes de los dos libros − IGV de notas de crédito de Compras); ambas solo líder y **solo lectura** (no modifican Compras).
  Pantalla `/produccion/por-pagar` (solo líder): cifras Por pagar / Vencido / Vence en 7 días, deuda por tramos (vencido, 7 días, 30 días, después) con «Pagar», y debajo la
  «Deuda total de CAYLA» con la barra Compras/Producción y el IGV del mes. **También:** el formulario de comprobantes al contado ahora admite varios medios (`MediosDePago`,
  reusable). **No hace:** pagar varios comprobantes de un golpe (el «pagar juntos» de ADR-0132) ni el registro de compras de SUNAT. Prueba `pnpm pruebas:por-pagar-produccion`
  (15 casos, en CI) + 12 de reglas. Sin ver con clics.
- **F4d · Recibir insumos — construida en local 2026-09-21; migración `20260921140000` SIN pegar en producción.**
  Tablas `comprobantes_produccion_recepciones` (una entrega física; token de idempotencia) y `comprobantes_produccion_cierres` (lo que NO llegará, con motivo: faltante | devolución | otro),
  ambas sin importes, sin escritura directa e inmutables; `insumo_lotes.comprobante_item_id` y `.recepcion_id` (el vínculo lote ↔ línea). `recibir_comprobante_produccion(comprobante,
  ubicación, líneas, cierres, nota, token)`: **un lote por línea recibida** (proveedor, documento «serie-número», **costo unitario SIN IGV de la línea**, `origen='compra'`) + su movimiento
  de compra en el ledger; lo llama **quien opera el Taller (líder o colaborador del Taller)**; lo recibido nunca supera lo facturado − recibido − cerrado; solo líneas con insumo (un flete no abre
  lote); una línea no aparece dos veces; código de lote repetido rechazado (sin código: el documento, y «/2», «/3»…); idempotente por token; bloquea el comprobante. `fn_lineas_comprobantes_produccion`:
  facturado / recibido / cerrado / pendiente **sin ningún importe** (lo que ve quien recibe). `anular_comprobante_produccion` ahora también se niega con mercadería recibida o líneas cerradas.
  Pantalla `/produccion/recibir` (Taller + líder; menú «Recibir» entre Comprobantes y Por pagar): cifras, comprobantes con lo pendiente, modal por entrega (llegó / no llegará + motivo / código de lote /
  nota). El detalle del comprobante (líder) muestra lo recibido por línea. Prueba `pnpm pruebas:recibir-comprobante-produccion` (24 casos, en CI) + 11 de reglas. Sin ver con clics.
  **Pendiente para F4e:** `insumo_lotes` y `movimientos_insumo` aún dejan leer el costo por la API directa.
- **F4e · Candado del dinero (D-G).** Las tablas nuevas nacen solo-líder; `insumo_lotes`, `movimientos_insumo` y `producciones.costo_*` pasan al mismo
  candado, con funciones **operativas** sin monto para el Taller; `v_insumo_saldos` con `security_invoker`.
- **Método:** migraciones idempotentes; prueba `scripts/pruebas/produccion_abastecimiento.mjs` + paso en `ci.yml`; timestamps **≥ `20260919210000`**;
  al pegar en producción, prefijo `retail.` (regla de CLAUDE.md). Solo se reescribe una función existente (`fn_proveedor_metricas_insumos`): partir de
  su `pg_get_functiondef` de producción.
- **Verificas:** registrar un comprobante de 100 m a crédito → aparece en Por pagar de Producción; recibirlo → lote nuevo y saldo sube; el
  comprobante muestra «de la factura a la prenda»; con sesión de colaborador **la API directa no devuelve montos**; `datos:generar:produccion` y
  `datos:comparar` sin rotos; **Compras sigue idéntico** (sus pruebas SQL pasan sin cambios).
- **Gate:** el SQL lo pega **Felipe**, con dry-run con rollback antes.

### F5 · Nueva orden con decisión (M) — sin esquema · depende de F3 (cobertura) y del motor de reposición
- Curva sugerida por talla desde `fn_resumen_variantes` (si no da la vista agregada de la red, una **función de solo lectura**
  nueva, con el ok de Felipe para pegarla). Análisis previo: tela y avíos (alcanza / alcanza si llega / faltan), costo por
  prenda, margen, entrega, capital inmovilizado. Rendimiento medido (D-D).
- **Verificas:** «Short Kuntur»-equivalente (modelo casi agotado) sugiere cantidad y curva coherentes con `/inventario/resumen`;
  abrir la orden crea las líneas por variante; un modelo sin talla en el catálogo enlaza a Productos.

### F6 · Resumen: «¿qué necesita mi decisión hoy?» (M) — sin esquema
- `lib/produccion-decisiones.ts` (puras, con tests, mismas reglas del spike) + página. Cada tarjeta lleva evidencia y una acción
  que abre la pantalla correcta con el contexto ya puesto. Solo líder; montos bajo el candado.
- **Verificas:** con la factura de tela sin recibir, aparece «faltan X m… pero ya llegó F00x»; al recibirla la tarjeta
  desaparece sin recargar; un colaborador que fuerza la URL recibe redirección y la base no le entrega montos.

### F7 · Eficiencia del Taller (L) — esquema · requiere **D-E, D-F**
- `maquila_referencias` y `gastos_taller` (RPC de escritura, solo líder, historial que se agrega y no se edita). Pantalla:
  gastado vs. absorbido, fabricar o maquilar por modelo, rendimiento real vs. estándar, costo por prenda mes a mes.
- **Verificas:** sin datos → estados vacíos claros; con una cotización y un gasto de prueba → el veredicto y la eficiencia
  cambian y coinciden con la cuenta a mano.

### F8 · Cierre y conexión con Inventario (S)
- «Siguiente paso: llevarlas a las tiendas» (cierre → `/inventario/mover` prellenado); verificar la referencia «Orden N» en
  Movimientos; refrescar `docs/datos/` (diccionario, RPCS, `modulos/10-produccion-del-taller.md`), `ARQUITECTURA.md`,
  BACKLOG, BITACORA.

## 7. Orden, dependencias y paralelismo

```
F0 ─ F1 ─ F2 ─ F3 ─┬─ F4a ─ F4b ─ F4c ─ F4d ─ F4e ─┬─ F6
                   └─ F5 ───────────────────────────┘
                              F7 (esquema, gate D-E/D-F) ─ F8
```
F1–F3 dan valor visible sin tocar la base. F4 es el mayor riesgo (esquema nuevo con lógica financiera): cada sub-fase va sola. F4 **ya no espera**
a ADR-0139: los dos módulos avanzan en paralelo sin tocar las mismas funciones. F5 y F6 pueden avanzar en paralelo una vez que existe F3.

## 8. Riesgos y cómo se acotan

| Riesgo | Mitigación |
|---|---|
| Duplicar lógica financiera de Compras (contado, vencimiento, pagos) y que **diverja** | copiar las reglas de ADR-0035 tal cual y probarlas con los mismos casos; ningún módulo llama al otro |
| **Deuda e IGV partidos** en dos módulos | **D-I** (consolidado de solo lectura) antes de F4c; hasta entonces cada módulo muestra solo lo suyo y lo dice |
| Repuntar `insumo_lotes.proveedor_id` con datos ya cargados | hoy 0 filas; verificar de nuevo el día de pegar, y si hubiera filas, migrarlas antes de repuntar |
| Choque con otras sesiones (ADR/timestamps). **Ya visible:** los ADR 0130-0132 estaban tomados por ramas sin fusionar | F0: fusionar `main`, reservar ADR-0133 y timestamps, fila en `SESIONES-ACTIVAS.md`; `git status` y ramas antes de cada fase; F4 solo tras ADR-0132 |
| Tocar Compras por accidente | Compras **no se modifica** en ninguna fase; su prueba SQL corre en cada PR de F4 |
| Regla de menú de Producción cambiada sin que nadie lo decida (pasó dos veces: 09-17 → 09-19 → 09-20) | La regla vive en **una sola función** (`puedeVerProduccion`, `lib/produccion-menu.ts`) que usan el menú y las páginas, con prueba de que no pueden discrepar; el cambio se anota en D-A y en el ADR-0133 |
| El colaborador ve costos por la API | F4c antes de exponer Insumos a colaboradores fuera del Taller; prueba `dinero_compras_solo_lider.mjs` extendida |
| Cifras de ejemplo que se cuelan a producción | regla 4 del contrato de diseño; revisión de cada PR contra el spike |
| El spike se ve distinto en Tailwind real | criterio único: lo que difiera debe estar en la tabla de la sección 5 |

## 9. Cierre de cada fase (definición de «terminado»)

`pnpm typecheck` · `pnpm lint` · tests de la fase · verificación en navegador (1440/1024/390) con sesión de líder **y** de
colaborador · sin errores de consola · si hubo esquema: prueba SQL en CI + `pnpm datos:generar:produccion` +
`pnpm datos:comparar` · BACKLOG y BITACORA actualizados · PR abierto (lo fusiona Felipe).
