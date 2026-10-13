## 🧩 /unificar, ronda 9: las seis que dejaron abiertas las rondas 6–8 (2026-10-13, ADR-0358) — solo web, sin migración; rama `claude/mystifying-jang-ef15d0`

- [x] Página de elegir con las seis preguntas (demos vivas; lo de hoy copiado del DOM real; claro y oscuro; fuentes en `docs/unificar/rondas/9/`). Felipe eligió P1 · P1 · P1 · P1 · P2 · P2.
- [x] Piezas: `ListaSugerencias` (+ `ariaDelBuscador`), `apartado` en `DesplegablePildora`, `cuenta`/`nota` en `TituloSeccion` y `TituloGrupo`, el respiro de la fila recién contada en un `<table>`. Registradas en `familias.mjs` con dos firmas nuevas.
- [x] Migradas: Llegó mercadería, Recibir contra factura, Registrar nota de crédito, Contar, Frescura (y sus escenarios del auditor), Colores, ocho acciones chicas y doce títulos. Deuda 4 → 0. Huellas de seis guías aceptadas tras revisar que su texto sigue siendo verdad.
- [x] Verificado en el ERP local, claro y oscuro: las tres listas (filtrar, ↑ ↓, Enter, el hilo de la activa), Frescura (abrir «Estado», sus apartados, la píldora puesta con su ✕), el pie de Colores, el globito de los títulos, «Marcar las 1 atrasadas» como botón. Contar, en una página de ensayo con datos en memoria (borrada).
- [x] **«Desactivar proveedor» quitado de la hoja de Proveedor** (Felipe, 2026-10-13: «no se desactivan proveedores desde esa hoja»): ninguna pantalla se lo pasaba; fuera también de su guía.
- [ ] **Contar en un conteo real:** mirar la planilla y el respiro verde con un conteo abierto de verdad (la base local no tenía uno).
- [ ] **`NotaCreditoDetalle`: `cerrar` declarado y sin usar** (aviso del linter, anterior a esta rama).
- [x] **Censo de después** (Admin, 252 de 277 vistas) rastreado al código: 10 títulos, 4 «Ver … →», 2 casillas, 5 «+ Agregar» y la caja «Producto» de Nueva compra (78 px) — migrados o arreglados; firmas nuevas o corregidas en `titulo-seccion`, `etiqueta-campo`, `enlace` y `casilla`.
- [x] **Modo oscuro** de las 11 pantallas tocadas con sus modales (`tema:auditar --escenarios`): 0 hallazgos solo en oscuro tras arreglar el detalle del cierre de Caja.
- [x] **Guías** de las 22 pantallas tocadas (`guias:recorrer`), y Cambios, Devoluciones y Apartados a 375 px: todas en verde.
- [ ] **Nueva compra a 1440 px sigue apretada:** la tarjeta de líneas mide 718 px; con lugar para escribir, el ejemplo de Producto se corta («Busca la prenc…») y «Talla y color» también. Pensar si la fila baja de línea o si el resumen de la derecha se angosta.
- [ ] **Guías sin datos locales:** `compras.plan.resultados` y `compras.plan.historial` (la base local no tiene las migraciones del 2026-10-12 del plan de compra y de Sinatra). Recorrerlas cuando Felipe actualice la base local.
- [ ] **Versalitas a mano de familias sin decidir:** «Limpiar», «Limpiar todo» (Existencias, Recibidas), «Cancelar» (decisión de faltante), «Entendido» (Movimientos), «Descargar reporte de este ajuste»: entran con las rondas de `accion.limpiar`, `accion.cancelar` y `accion.exportar` (esta, la ronda 10).
- [ ] **Ronda 10 armada** (descargar, filtros, ver): espera la elección de Felipe (`docs/unificar/rondas/10/`).

