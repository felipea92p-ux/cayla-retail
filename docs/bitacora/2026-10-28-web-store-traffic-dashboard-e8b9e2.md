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
- **Actividad 2 · Cifras que eligen el gráfico:** cinco `TarjetaCifra` (Entraron, Vieron una prenda, Separaron, Separan de cada 100, Recogieron) con su cambio y
  su `Sparkline`; al tocar una, `<Linea>` la dibuja contra los días de antes (Hoy por hora contra ayer; varios días, día por día), con «Por hora / Acumulado»
  (`SegmentoDeslizante forma="modo"`) y, en Hoy acumulado, el cierre esperado. Al costado, la respuesta en una frase («Hoy va mejor que ayer a esta hora») y
  cuatro datos. La cifra de la cabecera (`CifraTrafico`) se fue: su «Ahora, N mirando» vive ahora en la lectura. La hora en curso y el día de hoy a medias no se
  dibujan sin acumular (la línea «caía» sin haber caído). Base: `20261029040000_trafico_web_serie.sql` suma `serie` a `resumen_trafico_web` (misma firma).
  **Verificado:** `pruebas:tienda-trafico-resumen` 54/54, vitest de reglas 61/61, guías, unificar, colores, movimiento, ancho, tsc y eslint; en el navegador a
  1440 (claro y oscuro) y a 375 px sin scroll lateral. **Ojo base local compartida:** otra sesión puso la base al día con `main` y recreó la función vieja de 4
  parámetros; se reaplicaron las dos migraciones de esta rama.
- **Actividad 3 · Hasta dónde llega la gente:** el recorrido pasó de seis barras a 100 puntos por paso (cada punto, una persona de cada 100 que entraron;
  se encienden una vez, paso tras paso). El paso donde más gente se pierde se compara con lo de costumbre (`atoraContraCostumbre`, mismo peso de 30
  personas que `dondeSeAtora`): solo si va peor que siempre por más de 4 de cada 100 —y nunca con poca gente— se pinta en ámbar con su globo; si no, la
  frase lo dice con «Como de costumbre». Sin cambio en la base. **Verificado:** vitest de reglas 65/65, movimiento 20/20, guías, unificar, colores, tsc y
  eslint; en el navegador a 1440 (claro y oscuro, con y sin fuga) y a 375 px sin scroll lateral.
