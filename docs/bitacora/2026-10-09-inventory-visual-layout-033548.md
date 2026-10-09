# 2026-10-09 — Existencias: el cajón de la talla escondía sus acciones en el celular

- **Qué:** en el cajón de una talla (Inventario ▸ Existencias), a 375 px solo se veía «Colgar en el piso»; Bajar, Ajustar, Apartar y Pedir quedaban recortadas detrás.
- **Por qué:** la zona que se desplaza es un `grid` de alto fijo; cuando el contenido no cabía, la grilla encogía sus filas y la lista de acciones (`overflow-hidden`, mínimo 0) era la única que podía achicarse hasta casi desaparecer.
- **Arreglo:** `auto-rows-max` en esa zona (`components/existencias/PanelTalla.tsx`): cada fila conserva su alto completo y lo que no cabe se desplaza. Verificado con una reproducción mínima: la lista pasó de 98 px recortada a 227 px completa.
