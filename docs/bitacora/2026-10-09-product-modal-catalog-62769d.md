# 2026-10-09 · Vista rápida de producto: material, patrón, marca y ventas

- **Qué:** la vista rápida de Catálogo ▸ Productos ▸ Grilla muestra, bajo la matriz color × talla, una ficha corta: Material (tejido),
  Patrón, Marca y Vendidas (unidades en 30 días, todas las sedes). Lo no registrado dice «Sin registrar». A 375 px va en 2×2.
- **Cómo:** `listarProductos` (`lib/catalogo-v2.ts`) pega tejido y patrón en la misma consulta que ya traía la descripción (sin
  migración); la redacción es pura en `fichaCorta` / `vendidasEn30Dias` (`lib/vista-rapida-producto-reglas.ts`, con prueba). Las ventas
  salen de `demandaDiaria` × 30: se dice el total, no un promedio.
- **Verificado:** en local, 1280×800 (todo sobre el pliegue), modo oscuro y 375 px; `vitest lib` y `tsc` en verde.
