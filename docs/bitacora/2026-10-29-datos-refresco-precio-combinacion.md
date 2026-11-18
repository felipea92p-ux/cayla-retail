# 2026-10-29 · Refresco del diccionario de datos (precio por combinación)

- **Qué:** la foto de `docs/datos/generado/` se puso al día con producción tras pegar las 4 migraciones del costo y precio por color y talla (y las de otras ramas que entraron el mismo día). Por diferencia: 47 grupos.
- **Por qué así:** la consulta completa de `pnpm datos:refrescar` (87 KB de huellas) no cabe pegada a mano; se comparó por cubetas (112 huellas) y solo se trajo de producción lo que cambió. Todas las huellas coinciden.
- **Verificación:** `pnpm datos:generar:produccion`, `datos:comparar`, `datos:aviario` y `pnpm --filter web exec vitest run diccionario-datos`.
