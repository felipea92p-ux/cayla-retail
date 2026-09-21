# ADR-0133 — Producción es un módulo propio, con su abastecimiento, conectado con Compras solo por los datos

- **Numeración:** nació como ADR-0130 («Producción es el módulo padre») y se renumeró a 0133 al fusionar con `main`, donde el 0130 ya era
  «El menú lateral se pliega a íconos». El título y el rumbo cambiaron el mismo día (ver «Historia»).
- **Estado:** **Aceptado e implementado (F0 a F8, 2026-09-19 a 2026-09-22).** Las decisiones abiertas se resolvieron con Felipe: D-H (Producción con su propio abastecimiento) el 2026-09-19; D-G (dinero solo del líder)
  y D-I (deuda consolidada e IGV) el 2026-09-21; **D-E (cotización de maquila externa) descartada** y **D-F (gastos del Taller) resuelta sin tabla propia** —sueldos de Dynamic, alquiler y servicios de Finanzas— el 2026-09-22.
  Qué se construyó y qué migraciones lleva cada fase: `docs/PLAN-PRODUCCION.md`. Estado de la base: todas las migraciones de Producción están pegadas en producción.
- **Reemplazó, en un punto, y luego se revirtió:** la regla del 2026-09-17 «Producción solo se ve parado en el Taller, líder incluido» (comentario
  en `AppShell.tsx`, ADR-0051). El 2026-09-19 la Decisión 2 la cambió (el líder la veía desde cualquier ubicación); **el 2026-09-20 Felipe la
  restituyó** — ver la nota bajo la Decisión 2. Hoy manda la del 2026-09-17.
- **Refina:** ADR-0090 (insumos del Taller) — ahora se conecta con su propio abastecimiento y con la orden; ADR-0126 (el dinero es del líder) — se extiende
  a los costos de insumos. **Copia las reglas de** ADR-0035 (la factura es el eje) para los comprobantes de Producción, sin tocar las tablas de Compras.
- **Diseño de referencia:** `docs/maquetas/produccion-modulo-2026-09/`.

## Historia (por qué el título cambió)

La primera versión de este ADR proponía a Producción como **módulo padre** que absorbía a Compras (así lo mostraba el spike, con un grupo «Abastecer»).
Se publicó en el PR #185 y se vio en pantalla: **las mismas cuatro pantallas de Compras, con los mismos datos, aparecían dos veces en el menú**
(una copia). Felipe lo corrigió el mismo día: **Producción y Compras son módulos distintos, cada uno con sus proveedores y sus pantallas.** Además
eligió, contra la recomendación de este ADR (una lista de proveedores vista por rubro y una sola factura registrada en Compras), que Producción
tenga **su propio directorio de proveedores** y **sus propios Comprobantes, Por pagar y Recibir**.

## Contexto

CAYLA fabrica y vende. El costo de la prenda que llega a la tienda —y con él el margen de todo el negocio (D-31)— depende hoy de un número que alguien
escribe: Insumos existe en la base (ADR-0090) con **0 filas y ninguna pantalla**, y `NuevaOrdenProduccionForm.tsx` teclea a mano tela y avíos. Comprar tela
y avíos es, en la práctica, parte de fabricar: otros proveedores (Gamarra, lino, botones), otras unidades (metros, conos), otro destino (el Taller) y
otra pregunta («¿alcanza para cortar?»).

## Decisión

1. **Producción y Compras son dos módulos distintos**, cada uno con su grupo en el menú. Se conectan por los datos (la factura de tela abre un lote, la
   orden lo consume), **no por el menú**. Compras **no se modifica**: sus pantallas, sus tablas y sus funciones quedan tal cual.
2. ~~**El líder ve Producción desde cualquier ubicación**~~ **(revertida el 2026-09-20 — ver nota)**: quien trabaja en el Taller ve sus pantallas; el
   resto no la ve.
   > **Nota 2026-09-20 (Felipe, al ver «Producción» en el menú de una tienda):** Producción se ve **solo parado en un Taller, líder incluido**. La
   > regla mira el **tipo** de la ubicación activa (`ubicaciones.tipo = 'taller'`), no un nombre: un segundo Taller entraría sin tocar código. Es una
   > regla de **visibilidad** (menú y páginas), no de permiso: la base sigue permitiéndole al líder operar el Taller desde cualquier sede
   > (`fn_puede_operar_ubicacion` = líder o mi ubicación), así que no hubo cambio de esquema. Un líder que llega a `/produccion/*` desde otra ubicación
   > (por ejemplo, con el enlace del Resumen de Inventario) ve un aviso que le dice que cambie al Taller; quien no puede cambiar de ubicación vuelve al
   > inicio. La regla vive en `puedeVerProduccion` (`lib/produccion-menu.ts`), que usan el menú y las dos páginas.
3. **Producción tiene su propio abastecimiento (D-H, decidido por Felipe):** `proveedores_produccion` (tela, avíos, maquila), `comprobantes_produccion`
   (+ ítems y pagos), Por pagar y Recibir propios. Recibir un comprobante **abre un lote** por línea (proveedor, documento, costo sin IGV). Son pantallas
   **nuevas** sobre **datos distintos** de los de Compras: se parecen en el lenguaje visual, no en lo que muestran.
4. **El costo de tela y avíos de una orden sale del consumo real** (`registrar_consumo_insumo`), no de un campo tecleado. `cerrar_produccion` conserva su
   firma (acepta `null`).
5. **El rendimiento se mide, no se declara:** consumo real ÷ prendas buenas de las órdenes cerradas. No se revive `bom_items`.
6. **D-31 se completa con dos tablas mínimas:** `maquila_referencias` (cotización externa por modelo) y `gastos_taller` (mes, concepto, monto), solo líder.
   Hasta que existan, Eficiencia muestra estados vacíos, **nunca cifras inventadas**.
7. **Los costos y los comprobantes de Producción nacen bajo el candado de ADR-0126:** solo el líder ve montos; el Taller usa funciones operativas sin
   monto. `v_insumo_saldos` deja de saltarse la RLS (`security_invoker`).
8. **El diseño se porta del spike y solo cambia donde CAYLA lo exige** (tabla de la sección 5 del plan): tope de rojo por pantalla, piso de contraste,
   candado en la base, estados vacíos en vez de datos de ejemplo, piezas reales del repo, **ninguna animación en bucle**, sin rótulos de sección en el lateral.
9. **Gestos de movimiento:** se reutiliza lo de ADR-0128 (`anim-entra`, `anim-crece-x/y`, `anim-trazo`, `anim-cajon`, `useFlip`, `useContar`, `Avisos` con
   «Deshacer»). Lo nuevo: `useFlipCajas` (la tarjeta viaja **entre columnas**) y, en F7, el trazo del gráfico de línea.

## Lo que cuesta esta decisión (Felipe la tomó sabiéndolo)

- **Un proveedor real que vende a los dos módulos existe dos veces** (RUC, cuenta, contacto): dos fichas que mantener.
- **La deuda con proveedores vive en dos lugares** y el **IGV crédito fiscal sale de dos libros**. Nadie ve «lo que debe CAYLA» ni el registro de compras
  completo sin una vista consolidada de solo lectura (**D-I**, abierta; recomendada).
- **Se duplica lógica financiera** ya resuelta en Compras (contado ⇒ pago en la misma transacción, vencimiento, faltantes, pagos). Se mitiga copiando las
  reglas de ADR-0035 y probándolas con los mismos casos.
- **A favor:** Producción avanza sin depender de ADR-0139 ni de las funciones de Compras, y sin riesgo de romperlas. Como `insumos` e `insumo_lotes` tienen
  0 filas, repuntar sus llaves al nuevo directorio hoy es barato.

## Lo que la base vuelve imposible (cuando esté construido)

- Un comprobante de Producción al contado sin su pago, o a crédito sin vencimiento.
- Recibir dos veces el mismo comprobante y abrir dos lotes (idempotencia por token).
- Consumir de un lote más de lo que tiene (`registrar_consumo_insumo`, ya verificada) o sobre una orden cerrada.
- Que un colaborador lea montos de insumos, comprobantes o pagos por la API directa.

## Alternativas descartadas

- **Producción como módulo padre de Compras** (la primera versión): mostraba las mismas pantallas y los mismos datos dos veces. Descartada por Felipe.
- **Una sola lista de proveedores vista por rubro + una sola factura registrada en Compras** (mi recomendación): no duplicaba proveedores ni deuda.
  Descartada por Felipe a favor de módulos con sus propios proveedores y comprobantes.
- **Columna `insumo_id` en `compra_items`:** ya no aplica; Producción no usa las tablas de Compras.
- **Receta de costo por modelo (`bom_items`):** murió con el corte V1→V2 y una receta manual envejece. Lo medido no miente.
- **Esperar a que se reconstruya Finanzas para Eficiencia:** bloquea D-31 indefinidamente; `gastos_taller` es migrable después.

## Consecuencias

- **Costo:** F4 (cinco PR) construye esquema y lógica financiera nuevos (proveedores, comprobantes, pagos, recepción); cada uno va solo, con prueba SQL en CI
  y dry-run antes de pegarlo.
- **Ganancia:** el costo real de cada prenda queda conectado de la factura de tela a la tienda, y el Resumen puede decir *qué decidir* con datos de
  Producción, Insumos e Inventario juntos.
- **Sin decidir:** D-I (consolidado de deuda e IGV); cuándo se reconstruye Finanzas (migrar `gastos_taller`); si algún día un colaborador del Taller registra
  comprobantes (hoy solo el líder).
