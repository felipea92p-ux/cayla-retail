# 2026-11-04 · Horas pico del Observatorio con todas las horas y color

- **Qué:** la grilla «Horas pico · últimas 4 semanas» (Inicio del Admin ▸ tienda ▸ Ritmo) ahora dibuja una columna por hora, de 10 h como mínimo hasta la última hora con ventas (`rangoPico`), y colorea de dorado a rojo (`tonoPico`).
- **Por qué:** estaba fija de 10 a 20 h y lo vendido a las 21 y 22 h (Arequipa) se amontonaba en la columna de las 8 pm, escondiendo la hora más fuerte.
- **Cómo verificar:** abrir el panel de Arequipa ▸ Ritmo: deben verse las horas hasta las 10 p con «a/p»; `pnpm --filter web exec vitest run lib/observatorio-reglas.test.ts`. El gráfico de línea del día sigue asumiendo 10 a 21 h (`ABRE`/`CIERRA`): pendiente aparte.
