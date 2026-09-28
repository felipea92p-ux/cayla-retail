## 🧵 Nuevo producto en cuatro preguntas (2026-09-28, ADR-0260) — solo web, sin migración; rama `claude/producto-nuevo-v2`

- [x] Cuatro pasos (`PASOS_ALTA`, `pasoDeProblema`, `piePaso`, `siguienteDelAlta` en `lib/alta-producto.ts`, con pruebas); sin la barra de 5 segmentos; lista «Avance» en la ficha.
- [x] `ElegirMuestra` (tejido/patrón: 5 + «Ver todos» en hoja, lo elegido al frente) y `ElegirTallas` (+ «Otra talla» en hoja, «Solo las de siempre», «Todas las tallas» en la línea del título).
- [x] `ElegirColores` (elegidos con ×, buscador con crear primero, carta abierta) + `NuevoColorAlta` (`POST /api/productos/colores`).
- [x] `ElegirMarcaProveedor` sin sugerencias en el alta (`sugerencias={false}`; Editar producto y Conteo las conservan) + `NuevaMarcaForm` «Registrar marca o proveedor» (marca nueva, proveedor nuevo, proveedor más para una marca existente; pareja repetida bloqueada).
- [x] `MatrizVariantes` (fotos por fila, celda que se quita tocándola, encabezado y columna fijos) y `MatrizCantidades` (cantidades / «¿Alguna cuesta distinto?», «Llenar todas con», totales).
- [x] Cabecera de Ventas (`EncabezadoPagina`, ADR-0254) con «← Productos» bajo la frase; vista a 1280 y 375 px.
- [x] `tsc` limpio, `vitest` 219 archivos en verde; recorrido en navegador a 1280 y 375 px con catálogo de ejemplo (sin sesión).
- [ ] **Sin probar:** «Crear producto» de punta a punta con una cuenta real (con fotos, con stock de hoy, sin conexión) y los tres casos de «Registrar marca o proveedor» contra la base.
- [ ] **Sin probar:** crear un color desde el alta como no-Líder (debe nacer pendiente y quedar elegido).
- [ ] **Mirar:** Catálogo → Marcas usa el mismo formulario nuevo (botón «Registrar»).
