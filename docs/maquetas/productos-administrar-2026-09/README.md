# Productos ▸ Administrar · spike (2026-09-28)

`spike.html` se abre directo en el navegador (o con el servidor `maquetas` de `.claude/launch.json`). Datos inventados.
La barra oscura de arriba no existe en el ERP y alterna:

1. **Quién mira:** Líder (ve «Grilla | Administrar» y «+ Nuevo producto») · Colaboradora (solo la Grilla, sin botón).
2. **Filtros:** plegados · abiertos. Son **idénticos** al modo compacto de la Grilla (`FiltrosProductos compacto`):
   buscador con hilo + botón «Filtros · N» que despliega el panel de píldoras + chips de lo aplicado.
3. **Estado de la planilla:** en reposo · una prenda abierta (ficha de variantes) · 3 marcadas (barra flotante).
   Con 3 marcadas, «Descontinuar» abre la hoja de confirmación con el combo «Responsable».

## De dónde sale

Opción C elegida por Felipe el 2026-09-28: la Tabla (`ProductosAgrupados`) deja de ser un «otro look» para todos y pasa a
ser la planilla del líder para administrar el catálogo. La colaboradora de sede solo ve la Grilla, que es donde reconoce
la prenda. Motivo: hoy cada arreglo de Productos se hace dos veces (análisis `docs/pantallas/productos.md`, tareas #4 y #6)
y la Tabla no le da nada a quien no puede marcar ni editar.

## Qué muestra y de dónde sale cada dato

Solo campos que `fn_productos` ya trae (`ProductoListado`): referencia, código, categoría, marca, proveedor, estado,
`stockTotal`, `demandaDiaria` (el «1,4/día» bajo el stock), `reponerDeProveedor` (chip «Pedir») y las variantes (talla,
color, precio, costo, código, barras). **El margen es lo único nuevo y se calcula en pantalla** con precio y costo; sin
permiso de ver el dinero, el costo llega vacío y la columna de margen no se dibuja. La miniatura usa la misma foto por
color que la Grilla, y el mismo tinte con percha si no hay foto.

## Lo que cambia respecto de la Tabla de hoy

- El botón «Tabla» pasa a llamarse **«Administrar»**, con candado, y solo lo ve quien puede editar el catálogo.
- **Filtros compactos** (pedido de Felipe): igual que la Grilla. Se aparta a propósito de ADR-0169 («filtros y tabla en
  UNA tarjeta»); debe quedar escrito en el ADR.
- La tarjeta grande de cinco cifras desaparece: queda la misma línea de resumen bajo «Productos» que ya tiene la Grilla.
- Fila con miniatura, colores como muestras, tallas, precio, costo, **margen con barra**, stock con ventas por día y estado
  con chip. Clic en la fila abre la ficha de variantes (código, barras, costo y margen por variante).
- Acciones de la fila (Editar, Ajustar inventario, Etiquetas) aparecen al pasar el mouse, flotando sobre el estado.
- Marcar varias levanta una **barra flotante**: Descontinuar · Reactivar · Etiquetas. Descontinuar/Reactivar piden
  confirmación con Responsable.

## Pendiente de decidir (Felipe)

1. **Margen bajo:** la maqueta pinta en ámbar bajo 45 %, un umbral **inventado**. ¿Cuál es el margen mínimo real de CAYLA
   (o varía por categoría)?
2. **¿Quién ve «Administrar»?** La maqueta usa «puede editar el catálogo» (líder o terminal administrativa). Si una
   encargada de sede también da de baja prendas, pasa a ser un permiso por rol.
3. **Descontinuar/Reactivar por una función de base de datos** (hoy es un `update` directo que se salta la revisión de
   marca y proveedor): necesita una migración que se pega en producción aparte.

Al construir: ADR nuevo (número a reservar mirando los PR abiertos) que actualice ADR-0077.
