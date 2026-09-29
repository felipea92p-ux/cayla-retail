## 2026-09-29 (Se quitó de producción el vocabulario de prueba: «Bodys › dsa» ya no sale en el selector de categoría)

Qué hice: a pedido de Felipe, desactivé en producción (`cayla-dynamic`, schema `retail`) los restos de prueba del catálogo:
las categorías «dsa» y «prueba Lapicero», las marcas «Prueba», «prueba marca1» y «dfsdf» y los proveedores «pruebaProveedor»
y «PRUEBApROVEDOR 2»; antes de cada `update` comprobé que no tuvieran productos, lotes, compras, conteos ni cotizaciones.
Después Felipe corrió el `delete` que le dejé (con esos 7 y los colores «Prueba rosa» y «prueba Verde») y verifiqué por
consulta que no quedó nada por id ni por nombre, ni enlaces marca ↔ proveedor, tejidos o patrones huérfanos.

Por qué así: el repo prohíbe borrar en catálogos (CLAUDE.md), así que yo solo desactivé —se revierte con `activo = true` y
los selectores ya filtran `activo = true`, con eso «dsa» desapareció de la lista—; el borrado permanente de producción lo
ejecutó Felipe. Se borraron en orden (`marca_proveedores`, `marcas`, `proveedores`, `categorias`, `colores`) porque esas
llaves no tienen cascada. Las 3 ventas de prueba siguen ahí, `anulada` + `es_prueba`, por diseño (ADR-0159): `movimientos`
no se purga.

Felipe se lleva: sin código ni migración, solo datos. **No se tocó** «Bodys», «Lapiceros» ni los proveedores reales
«Fibras Collection SAC» y «Y.J.J». Quedan dos decisiones suyas: la categoría «Colores» y la marca «y.j.j» / proveedor
«Y.J.J» (activos, sin productos), que el pendiente viejo listaba como de prueba. Detalle en
`docs/backlog/2026-09-29-borrar-bodys-dsa-d6124b.md`.
