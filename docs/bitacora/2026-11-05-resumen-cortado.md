# 2026-11-05 · Ícono de Finanzas ▸ Resumen se veía cortado

- Qué: el ícono `panorama` era una media luna abierta; al llenarse al elegir la fila (marco.css, «Se llena al elegir») quedaba cortada abajo.
- Cómo: se cambió por un dial de 240° (lucide «gauge»), en `apps/web/lib/menu-iconos.ts`. Solo cambia el dibujo, no qué hace la fila.
- Verificación: `vitest lib/menu lib/iconos` en verde.
