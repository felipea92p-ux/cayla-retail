# Tráfico ▸ «Hoy» se cortaba a los 8 s — 2026-11-18

Rama `claude/traffic-today-issue-de7567`. Migración `20261119002000_trafico_web_un_dia_sin_medir.sql`, **en producción** desde el 2026-11-18
(aplicada con el conector de Supabase; `schema_migrations` la registra como 20261119001719). Sin cambios en la web.

- [x] Causa: Postgres no había medido el día de hoy en `retail.trafico_web` (calculaba 1 fila, eran 372) y `fn_trafico_web_personas`
      cruzaba la lista de pasos consigo misma con bucles anidados. Medido en producción: 3.114 ms el 18 contra 7 ms el 17.
- [x] Destrabado el mismo día con `analyze retail.trafico_web` en producción (la misma consulta bajó a 7 ms).
- [x] `fn_trafico_web_personas` cuenta en una pasada. Comparada en producción contra la anterior: 136 combinaciones de período y filtro,
      33.712 filas, ninguna diferencia. Sigue marcada «[regla por fila]» y `pruebas:reglas-por-fila` pasa (10/10).
- [x] `retail.trafico_web` se mide sola cada 50 pasos nuevos (antes, 50 + 10 % de la tabla).
- [x] Caso 19 de `pruebas:tienda-trafico-resumen`: falla con la función anterior (57014) y pasa con la nueva; 90 de 90 en la base local
      con esquema de producción (`cayla-retail-prod`, que quedó con la migración aplicada).
- [x] En producción, `resumen_trafico_web` de «Hoy» como líder y con el tope de 8 s: 231 ms.
- [ ] **Sin hacer:** `fn_trafico_web_prendas` y las tallas todavía cruzan `trafico_web` con otras tablas. Con la medición cada 50 pasos el
      error de cálculo queda acotado; si un día la tienda online pasa de varios miles de personas, conviene medirlas igual que aquí.
- [ ] **Sin hacer:** refrescar el volcado de producción (`docs/datos/generado/`); no cambió ninguna tabla ni columna, solo el cuerpo de
      una función y cuándo se mide una tabla.
- [ ] **Sin correr en local:** `pruebas:tienda-trafico` (hace `grant … to current_user`, que tumba la imagen de la base local); no toca
      lo que cambió y la corre el CI.
