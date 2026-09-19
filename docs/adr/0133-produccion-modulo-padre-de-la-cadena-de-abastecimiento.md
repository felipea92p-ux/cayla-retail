# ADR-0133 — Producción es el módulo padre de la cadena: decidir, abastecer, fabricar, medir

- **Numeración:** nació como ADR-0130 y se renumeró a 0133 al fusionar con `main`, donde el 0130 ya era «El menú lateral se pliega a íconos»
  (`0130-menu-lateral-se-pliega-a-iconos.md`); el 0131 y el 0132 también están ocupados.
- **Estado:** **Propuesto**; **F1 (menú, D-A) aplicada el 2026-09-19** a pedido de Felipe. Falta su ok en D-C, D-E, D-F y D-G
  (`docs/PLAN-PRODUCCION.md`) antes de tocar esquema. F2–F3 no lo necesitan.
- **Reemplaza, en un punto:** la regla del 2026-09-17 «Producción solo se ve parado en el Taller, líder incluido»
  (comentario en `AppShell.tsx`, ADR-0051). Ver Decisión 2.
- **Depende de:** ADR-0132 (reparto de un comprobante entre tiendas, en curso en `claude/modulos-por-tienda-ca0f59`) para la
  parte de esquema; coordina con ADR-0131 (Por pagar) solo en el menú.
- **Refina:** ADR-0035 (la factura de compra es el eje) — ahora también trae tela y avíos; ADR-0090 (insumos del Taller) —
  ahora se conecta con Compras y con la orden; ADR-0126 (el dinero de Compras es del líder) — se extiende a los costos de insumos.
- **Diseño de referencia:** `docs/maquetas/produccion-modulo-2026-09/`.

## Contexto

CAYLA fabrica y vende. Hoy los módulos que sostienen esa cadena son islas: Compras registra facturas pero una factura de
tela **no cabe** (`compra_items.producto_id` es obligatorio); Insumos existe en la base (ADR-0090) con **0 filas y ninguna
pantalla**; Producción teclea a mano el costo de tela y avíos (`NuevaOrdenProduccionForm.tsx:216`); y nadie junta esos
datos para decir qué decidir. El costo de la prenda que llega a la tienda —y con él el margen de todo el negocio (D-31)—
depende de un número que alguien escribe.

## Decisión

1. **Producción es el módulo padre** y agrupa el recorrido real del trabajo: **Decidir** (Resumen), **Abastecer**
   (Proveedores, Comprobantes, Por pagar, Recibir), **Fabricar** (Órdenes, Insumos) y **Medir** (Eficiencia del Taller).
   El grupo «Compras» del lateral desaparece. **Las URLs no cambian** (`/compras/*`, `/recibir`); se agregan
   `/produccion` (hoy redirige a Órdenes), `/produccion/ordenes`, y con sus fases `/produccion/insumos` y `/produccion/eficiencia`.
   Sin rótulos de sección en el lateral: el riel se mueve por filas de alto fijo, así que el orden de las filas cuenta el recorrido.
2. **El líder ve Producción desde cualquier ubicación** (la base ya lo permite: `fn_puede_operar_ubicacion` = líder o mi
   ubicación). El colaborador del Taller ve Recibir, Órdenes e Insumos. Reemplaza la regla del 2026-09-17.
3. **La factura de proveedor trae también tela y avíos:** `compra_items.insumo_id` (nullable) con «exactamente uno de
   `producto_id` / `insumo_id`». Recibir una línea de insumo **abre un lote** (proveedor, documento, costo sin IGV). El destino
   Taller/Tiendas **no es columna nueva**: es el reparto por línea de ADR-0132 (`compra_item_destinos`), donde el Taller es
   una ubicación más. **Esta decisión se implementa después de ADR-0132** (ambas reescriben `registrar_compra` y `recibir_compras`).
4. **El costo de tela y avíos de una orden sale del consumo real** (`registrar_consumo_insumo`), no de un campo tecleado.
   `cerrar_produccion` conserva su firma (acepta `null`).
5. **El rendimiento se mide, no se declara:** consumo real ÷ prendas buenas de las órdenes cerradas. No se revive `bom_items`.
6. **D-31 se completa con dos tablas mínimas:** `maquila_referencias` (cotización externa por modelo) y `gastos_taller`
   (mes, concepto, monto), ambas solo de líder. Hasta que existan, Eficiencia muestra estados vacíos, **nunca cifras inventadas**.
7. **Los costos de insumos pasan bajo el candado de ADR-0126:** solo el líder los lee; el colaborador usa funciones
   operativas sin monto. La vista `v_insumo_saldos` deja de saltarse la RLS (`security_invoker`).
8. **Abastecer no se rediseña aquí.** Proveedores (ADR-0128), Recibir (ADR-0129), Comprobantes y Por pagar ya tienen su
   diseño; este ADR solo los mueve de grupo y les agrega la conexión (destino, líneas de insumo, «de la factura a la prenda»).
9. **El diseño se porta del spike y solo cambia donde CAYLA lo exige** (tabla de la sección 5 del plan): tope de rojo por
   pantalla, piso de contraste, candado en la base y no solo en la pantalla, estados vacíos en vez de datos de ejemplo,
   piezas reales del repo en vez del CSS del spike.
10. **Gestos de movimiento nuevos que se piden aprobar** (extienden la gramática de ADR-0128): barras que crecen en
    cobertura y vencimientos, y trazo del gráfico de línea. Sin aprobación entran sin animar.

## Lo que la base vuelve imposible (cuando esté construido)

- Una línea de comprobante sin producto **ni** insumo, o con los dos (CHECK).
- Recibir dos veces el mismo comprobante y abrir dos lotes (idempotencia heredada de `recibir_envio`).
- Consumir de un lote más de lo que tiene (`registrar_consumo_insumo`, ya verificada) o sobre una orden cerrada.
- Que un colaborador lea costos de tela, factura o pagos por la API directa.

## Alternativas descartadas

- **Tabla paralela `compra_insumo_items`:** duplica pago, recepción, faltantes y notas de crédito, que ya cuelgan de
  `compra_items`. Dos caminos para lo mismo (principio 3).
- **Columna `destino` en `compras`:** el reparto por línea (ADR-0132) ya dice adónde va cada cosa. Una columna más se desincroniza (principio 4).
- **Receta de costo por modelo (`bom_items`):** murió con el corte V1→V2 y una receta manual envejece. Lo medido no miente.
- **Esperar a que se reconstruya Finanzas para Eficiencia:** bloquea D-31 indefinidamente; `gastos_taller` es migrable después.
- **Mover las URLs de Compras bajo `/produccion/…`:** rompe enlaces de ADR-0128/0129 y de `+ Nuevo`, sin ganancia para quien usa el menú.

## Consecuencias

- **Costo:** F4 —que va después de ADR-0132— toca `registrar_compra`, `recibir_compras`, `recibir_envio` y dos vistas en producción (la función que ya
  tuvo dos firmas). Va sola, con prueba SQL en CI y dry-run antes de pegarla.
- **Ganancia:** el costo real de cada prenda queda conectado de la factura a la tienda, y el Resumen puede decir *qué decidir*
  con datos de Compras, Insumos, Producción e Inventario juntos.
- **Sin decidir:** cuándo se reconstruye Finanzas (migrar `gastos_taller`); si algún día un colaborador del Taller registra
  facturas (hoy `fn_puede_registrar_compras` = líder).
