# 2026-10-28 · Tienda web ▸ Tráfico: maqueta «Observatorio» (rama web-store-traffic-dashboard-e8b9e2)

- **Qué quedó:** una maqueta tocable (`docs/maquetas/trafico-decisiones-2026-10/index.html`, datos inventados, sin código del ERP) que evoluciona la pantalla Tráfico de ADR-0495:
  filtros Hoy / Ayer / 7 días / Este mes / Mes pasado / campaña, cifras que eligen el gráfico principal con comparación, mapa de calor día × hora, «De dónde vienen» (camino y ciudad),
  «Hasta dónde llega la gente» (100 puntos), prendas, tallas que piden y no hay por categoría, «Necesita tu atención» (reponer / recoger / empujar) y calendario. Claro, oscuro y 375 px.
- **Decisiones de Felipe en la conversación:** fuera el Sankey (no era útil), fuera «Qué conviene hacer» y «Por dónde llegan» como tarjetas sueltas, fuera «Qué movió a la gente» y «Qué enlaces
  funcionan»; las tallas van por categoría, no por prenda; «De dónde vienen» ocupa el lugar junto al mapa de calor.
- **Verificado:** en el navegador a 1440 px (claro y oscuro) y a 375 px en las versiones anteriores; sin errores de consola. **Falta:** revisar a 375 px la última versión, y nada de esto está en el ERP.
- **Datos que hoy la base no entrega** (se ven con «Marcar lo nuevo» en la maqueta): períodos Hoy / Ayer / Este mes con su comparación, series por cifra, conversión por camino,
  mapa de calor día × hora, calendario día por día, talla elegida cruzada con el stock por talla y quienes vuelven contra los nuevos. Cada uno pide ampliar `resumen_trafico_web` (migración con OK de Felipe).

## Construcción del Observatorio (`/construir`, 10 actividades aprobadas por Felipe el 2026-10-28)

- **Actividad 1 · Períodos:** Hoy (contra ayer a esta hora), Ayer (contra el mismo día de la semana pasada), 7 días, Este mes (contra los mismos días del
  mes anterior), Mes pasado (contra el mes de antes) y la campaña, en un solo segmento (`SegmentoEnlaces`) con teclas H A 7 M P C; la frase dice contra qué
  se compara. Base: `20261029015000_trafico_web_periodos.sql` suma `p_ant_desde`, `p_ant_hasta` y `p_ant_corte` a `resumen_trafico_web` (borra la firma de 4
  y crea la de 7: sin sobrecarga). Con corte, las prendas no se comparan («Sin comparar prenda por prenda»). El enlace viejo `?periodo=30` cae en 7 días.
  **Verificado:** `pnpm pruebas:tienda-trafico-resumen` 46/46 (13 escenarios nuevos), vitest de reglas 50/50, tsc, y en el navegador (página temporal con datos
  inventados) los períodos, la frase y las teclas. **No está en producción:** la migración espera el OK de Felipe.
