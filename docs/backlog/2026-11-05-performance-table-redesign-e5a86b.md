## Desbordes de página que no vienen de una tabla (medido 2026-11-05)

Scroll lateral de toda la página, en px de más, según el barrido local:

- `/vender/reportes`: 375 (121), 600 (8), 768 (50), y `/vender/historial`: 375 (12). El globito de `BarrasTiempo` (`.barra-t-globo`) cuenta para el ancho aunque esté escondido.
- `/finanzas` y `/finanzas/resumen`: 768 (116), 1024 (31). Un chip de comparación que no baja de línea.
- `/finanzas/reportes/campanas`: 375 (163), 768 (46). `/finanzas/reportes` y `/finanzas/reportes/presupuesto`: 375 (4).
- `/finanzas/dinero/conciliacion`: 1024 (25). Un campo del cuadre.
- `/productos/familias`: 1024 (12). La columna de acciones de la tarjeta.
- `/devoluciones`: 768 (46), `/cambios`: 768 (12), `/gestion/frescura`: 768 (9).

## Tablas de Finanzas que corren de lado

`/finanzas/reportes/balance` a 1440 px (730 de 920), `flujo` y `escenarios` a 1440 px, y `/configuracion` (planilla) a 1180 px. Usan el kit de Finanzas (ADR-0195); van con el rediseño de Estados financieros.
