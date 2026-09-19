# Plan · Producción como módulo padre (2026-09-19)

> **Estado:** propuesto, pendiente del ok de Felipe en las **decisiones D-A…D-G** (sección 3). Las fases 1–3 no
> tocan esquema y pueden empezar de inmediato; **F4 espera a que ADR-0132 llegue a `main`** (ver sección 2). ADR asociado: `docs/adr/0133-produccion-modulo-padre-de-la-cadena-de-abastecimiento.md`.
> Diseño de referencia: `docs/maquetas/produccion-modulo-2026-09/` (README con el guion de prueba).

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
| `registrar_compra` ya recibe `p_ubicacion_destino_id` y el formulario ya pregunta «Mercadería destinada a». **ADR-0132 (en curso, rama `modulos-por-tienda-ca0f59`) elimina `compras.ubicacion_destino_id` y lo reemplaza por `compra_item_destinos`** (destino por línea) | `20260918219000…sql`, `CompraFormV2.tsx:395`, ADR-0132 §2 | **El destino Taller/Tiendas no necesita columna nueva** en ningún caso (D-B); el Taller es una ubicación más de ese reparto |
| **Dos ramas sin fusionar tocan Compras:** ADR-0131 «Por pagar responde» (`por-pagar-ui-animations-4ffe60`, 6 commits) y ADR-0132 (`modulos-por-tienda-ca0f59`: reescribe `registrar_compra`, `recibir_compras`, `compra_items` y sus políticas) | `git log origin/main..rama` | **F4 va después de ADR-0132** y se coordina con su sesión; F1 (menú) no toca sus archivos |
| `compra_items.producto_id` es **NOT NULL**: una factura de tela no cabe | `DICCIONARIO-RETAIL.md:1686` | F4 (único cambio de esquema grande) |
| `fn_puede_operar_ubicacion` = líder **o** mi ubicación: **el líder ya puede operar el Taller desde cualquier sede** | `0006_colaboradores.sql:51` | La regla «Producción solo parado en el Taller» (2026-09-17) es de menú, no de base |
| El motor de reposición ya existe: `fn_resumen_variantes` (ventas, disponible, en camino, días observables, `en_red`) | `20260919141804_resumen_inventario_v2.sql` | «¿Qué producir?» **lo reutiliza**, no recalcula ventas por su cuenta |
| El dinero de Compras es solo del líder y lo hace cumplir la base (`fn_puede_ver_dinero_de_compras`) | ADR-0126 | Todo monto nuevo nace bajo ese candado |
| `insumo_lotes`/`movimientos_insumo` se leen con `fn_puede_operar_ubicacion`: **un colaborador del Taller ve costos** | `DICCIONARIO-RETAIL.md:2088` | F4c cierra ese hueco (D-G) |
| `useFlip`, `useContar`, `useEnVista`, `Sparkline`, `CifraAnimada`, `PasoSugerido`, `TarjetaSenal`, `Avisos` (con «Deshacer»), `SegmentoDeslizante`, `Tabla`, `Chip` **ya existen** | `apps/web/lib`, `components/ui` | El spike se **porta con estas piezas**, no se copia su CSS |
| Otras sesiones rediseñaron Proveedores (ADR-0128, en `main`) y Recibir (ADR-0129, en `main`); Por pagar se rediseña en otra rama (ADR-0131) | `SESIONES-ACTIVAS.md`, ramas | **«Abastecer» es navegación y conexión, no rediseño** de esas pantallas |

## 3. Decisiones (mi recomendación; Felipe decide)

| # | Decisión | Recomiendo | Por qué | Gate |
|---|---|---|---|---|
| **D-A** | Menú: ¿quién ve el grupo Producción? | Líder **desde cualquier ubicación**; colaborador del Taller ve Recibir, Órdenes e Insumos; el grupo Compras desaparece | La base ya lo permite; el líder decide el abastecimiento estando en una tienda. **Revierte la regla del 2026-09-17** | ok de Felipe (F1) |
| **D-B** | Destino Taller/Tiendas de un comprobante | **El reparto de ADR-0132** (`compra_item_destinos`): una línea de insumo se destina al Taller como a cualquier ubicación. Sin columna nueva y sin mirar `ubicacion_destino_id`, que ADR-0132 elimina | Una ubicación ya es un destino; una columna `destino` duplicaría el dato (principio 4) y chocaría con ADR-0132 | F4 espera a ADR-0132 |
| **D-C** | Cómo entra la tela a una factura | `compra_items.insumo_id` **nullable** + CHECK «exactamente uno de `producto_id` / `insumo_id`». `producto_id` deja de ser NOT NULL | Pago, recepción, faltantes y nota de crédito ya cuelgan de `compra_items`; una tabla paralela duplicaría todo (principio 3) | **cambio de esquema en producción: ok explícito** |
| **D-D** | Rendimiento (m/prenda) | **Medido**: consumo real ÷ buenas de las órdenes cerradas del modelo. Sin receta ni tablas. Modelo sin historial: se escribe el rendimiento en la orden y solo alimenta la vista previa | `bom_items` murió; una receta manual envejece. Lo medido no miente | — |
| **D-E** | Cotización de maquila externa (D-31) | Tabla `maquila_referencias` (append-only: modelo, precio por prenda, fecha, proveedor opcional). Solo líder | Es la mitad de D-31 sin dónde vivir (hueco 3) | esquema: ok |
| **D-F** | Gastos del Taller (denominador de D-31) | Tabla mínima `gastos_taller` (mes, concepto, monto). Solo líder | Finanzas se borró en el corte V1→V2; esperar su reconstrucción bloquea Eficiencia. Se migra cuando exista | esquema: ok |
| **D-G** | Costos de insumos | Cerrar `insumo_lotes`/`movimientos_insumo` a `fn_puede_ver_dinero_de_compras`; el colaborador lee cantidades por una función **operativa** (mismo patrón que ADR-0126) y `v_insumo_saldos` pasa a `security_invoker` | El colaborador no debe ver lo que cuesta la tela; hoy puede | esquema: ok |

Mientras D-E y D-F no se decidan, **Eficiencia se construye con estados vacíos honestos** («Sin gastos registrados»), nunca con cifras de ejemplo.

## 4. Cómo se conecta todo (la matriz que no se rompe)

| Origen → destino | Qué viaja | Cómo se materializa | Fase |
|---|---|---|---|
| Comprobante (Compras) → Insumos | metros/unidades + costo + proveedor + documento | al recibir, cada línea de insumo abre **un lote** (`recibir_insumo` por dentro de `recibir_compras`/`recibir_envio`) | F4 |
| Insumos → Orden | consumo real por lote (el más antiguo con saldo) | `registrar_consumo_insumo` → recalcula `costo_tela`/`costo_avios` | F3 |
| Orden → Inventario | prendas buenas por variante + costo real | `cerrar_produccion` → `movimientos` (`produccion`) + costo promedio ponderado a `variantes.costo` | ya existe |
| Inventario/Ventas → «¿Qué producir?» | ventas, disponible y en camino por variante | `fn_resumen_variantes` (ADR-0121) | F5, F6 |
| Comprobantes → Resumen | vencido, por vencer, por recibir | `resumen_compras`, `deuda_por_vencimiento` (bajo el candado de ADR-0126) | F6 |
| Insumos + Compras → Resumen | tela que falta, tela en camino | saldo por insumo + líneas de insumo sin recibir | F6 |
| Orden cerrada → Traslados | «Siguiente paso: llevarlas a las tiendas» | enlace a `/inventario/mover` prellenado desde el Taller | F8 |
| Orden → Movimientos | referencia «Orden N» | ADR-0127 ya muestra el proceso de origen | verificar en F8 |
| Proveedores | gasto en insumos, puntualidad, precio por metro | `fn_proveedor_metricas_insumos` ya existe (hoy en ceros: se llena con F4) | F4 |
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

### F1 · Navegación: Producción es el padre (M) — sin esquema · requiere **D-A**
- `AppShell.tsx`: grupo `produccion` con secciones Decidir/Abastecer/Fabricar/Medir; el grupo `compras` deja de existir;
  `RUTAS_POR_GRUPO` y `veProduccion` según D-A; `recibir` sigue en Inventario para quien no es líder.
- Rutas: **`/produccion/ordenes`** (el contenido actual, movido) y `/produccion`, que redirige ahí hasta que exista el Resumen (F6;
  el Resumen de Inventario ya enlaza a `/produccion`). `/produccion/insumos` y `/produccion/eficiencia` nacen en F3 y F7: **no se
  crean páginas vacías ni ítems de menú muertos**. **Las URLs `/compras/*` y `/recibir` no cambian** (ADR-0128 y ADR-0129 dependen de ellas).
- **Aplicada el 2026-09-19.** Diferido a propósito: las **insignias** del menú (Por pagar, Recibir, Órdenes, Insumos) piden una
  consulta por carga de página en el layout; entran con F6, cuando el Resumen ya calcula esos números. Quien trabaja en el Taller
  ve solo Órdenes (su «Recibir mercadería» sigue en Inventario para que una ruta no aparezca en dos grupos); un grupo de una fila
  se muestra como fila suelta.
- **Verificado:** líder parado en Tienda Lima ve el grupo y abre Órdenes; los 4 enlaces viejos de Compras abren y resaltan su ítem al entrar
  por URL directa (el grupo se abre solo); `/produccion` redirige; sin errores de consola; tipos, lint y 1178 pruebas en verde. **Sin
  verificar en navegador:** colaborador del Taller y de tienda (probarlos exige cerrar la sesión de Felipe); la regla está en
  `lib/produccion-menu.ts` con pruebas para los tres perfiles.

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
  `fn_puede_operar_ubicacion`: un colaborador ve costos **por la API** aunque la pantalla se los oculte — se suma a D-G (F4c);
  (3) el menú del celular no tiene entrada a Producción (ya era así).

### F3 · Insumos: pantalla y consumo (M) — sin esquema (la lectura por el hueco D-G queda para F4c)
- `lib/insumos.ts` (lectura por `fn_puede_operar_ubicacion`, como hoy) + pantalla: saldo contra mínimo, lotes con «1º»,
  libro de movimientos, «Recibir insumo» (`recibir_insumo`), consumo desde la orden (`registrar_consumo_insumo`).
- **Verificas:** recibir 60 m → aparece el lote y el libro; consumir 10 m desde una orden → el costo de la orden cambia y el
  aviso ofrece «Deshacer» (devolución); pedir más que el lote → mensaje en español con el saldo exacto.

### F4 · Compras ↔ Insumos: el ciclo cerrado (L, **alto riesgo**) — esquema · requiere **D-C, D-G** y **ADR-0132 fusionado**
- **Antes de empezar:** confirmar con la sesión de `modulos-por-tienda-ca0f59` (dueña de `registrar_compra`/`recibir_compras`/`compra_item_destinos`) el orden y quién toca cada función. F4 se escribe **sobre** el resultado de ADR-0132: una línea de insumo lleva su destino (el Taller) en `compra_item_destinos`, y `recibir_compras` decide entre mover stock de variante o abrir lote según la línea. Dos migraciones distintas reescribiendo la misma función en paralelo es exactamente el choque que ya costó dos firmas de `registrar_compra`.
- **4a · Comprobante con renglón de insumo.** Migración: `compra_items.insumo_id` + CHECK; `registrar_compra` (`p_items`
  acepta `insumo_id`); vistas `compras_resumen`/`compra_items_resumen` suman insumos en `facturado`/`recibido`.
- **4b · Recibir abre el lote.** `recibir_compras` y `recibir_envio`: la línea de insumo llama a la lógica de
  `recibir_insumo` (lote con proveedor, documento y costo **sin IGV**); faltantes y nota de crédito funcionan igual.
- **4c · Candado del dinero de insumos (D-G).** `insumo_lotes`/`movimientos_insumo` solo líder; función operativa sin costos;
  `v_insumo_saldos` con `security_invoker`. Reaplicar `fn_aplicar_candado_de_dinero()` si se recrea alguna de las 5 funciones de indicadores.
- **Ojo, cambió desde que se escribió el plan:** `main` ya trae `20260919181000_registrar_compra_endurecimiento_por_parche.sql` (ADR-0135, guarda de
  `registrar_compra` independiente del reparto por tienda) y las migraciones de pago por lote (`…190000`, `…200000`). F4 debe partir de
  la definición **vigente** de esas funciones, no de las del plan. Timestamps libres: **≥ `20260919210000`**.
- **Método (obligatorio, aprendido a la mala):** partir de `pg_get_functiondef` **de producción**, no del archivo del repo;
  una sola firma (verificar con `explain`, no `create or replace` con parámetros distintos); migración idempotente;
  prueba nueva `scripts/pruebas/compras_insumos.mjs` + paso en `ci.yml`; en producción con prefijo `retail.` (regla de CLAUDE.md).
- **Verificas:** registrar comprobante de 100 m a crédito → aparece en Por pagar y en Recibir; recibirlo → lote nuevo y saldo
  sube; el comprobante muestra «de la factura a la prenda»; con sesión de colaborador **la API directa no devuelve costos**;
  `pnpm datos:generar:produccion` y `pnpm datos:comparar` sin rotos.
- **Gate:** el SQL lo pega **Felipe** en producción, con el ok explícito, después de un dry-run con rollback.

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
F0 ─ F1 ─ F2 ─ F3 ─┬─ F4 (esquema, gate; espera ADR-0132) ─┬─ F6
                   └─ F5 ───────────────────────────────────┘
                              F7 (esquema, gate D-E/D-F) ─ F8
```
F1–F3 dan valor visible sin tocar la base y se pueden fusionar uno por uno. F4 es el cuello de botella y el mayor riesgo:
va solo, con su prueba SQL, y no se mezcla con pantallas. F5 y F6 pueden avanzar en paralelo una vez que F3 existe.

## 8. Riesgos y cómo se acotan

| Riesgo | Mitigación |
|---|---|
| F4 deja `registrar_compra` con **dos firmas** (ya pasó el 2026-09-18) | partir de `pg_get_functiondef` de producción; `explain` de verificación; prueba SQL en CI |
| Choque con otras sesiones (ADR/timestamps/Compras). **Ya visible:** ADR-0131 y ADR-0132 están tomados por ramas sin fusionar | F0: fusionar `main`, reservar ADR-0133 y timestamps, fila en `SESIONES-ACTIVAS.md`; `git status` y ramas antes de cada fase; F4 solo tras ADR-0132 |
| Rediseñar de más Compras y pisar ADR-0128/0129/0131 | «Abastecer» = navegación y conexión; ninguna fase restila Proveedores, Recibir, Comprobantes ni Por pagar |
| Regla de menú del 2026-09-17 revertida sin querer | D-A explícita; el ADR-0133 la marca como **reemplazada** |
| El colaborador ve costos por la API | F4c antes de exponer Insumos a colaboradores fuera del Taller; prueba `dinero_compras_solo_lider.mjs` extendida |
| Cifras de ejemplo que se cuelan a producción | regla 4 del contrato de diseño; revisión de cada PR contra el spike |
| El spike se ve distinto en Tailwind real | criterio único: lo que difiera debe estar en la tabla de la sección 5 |

## 9. Cierre de cada fase (definición de «terminado»)

`pnpm typecheck` · `pnpm lint` · tests de la fase · verificación en navegador (1440/1024/390) con sesión de líder **y** de
colaborador · sin errores de consola · si hubo esquema: prueba SQL en CI + `pnpm datos:generar:produccion` +
`pnpm datos:comparar` · BACKLOG y BITACORA actualizados · PR abierto (lo fusiona Felipe).
