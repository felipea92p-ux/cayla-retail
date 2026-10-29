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
- **Actividad 4 · Cuándo entra la gente:** «A qué hora entran» (24 barras de todo el período) pasó a un mapa de calor día de la semana × hora en rojo
  CAYLA, con las 6 horas más fuertes con filo, el total de cada día, cuánta gente entra en cada hora y, en Hoy, el punto de «ahora»; la frase dice los dos
  días y el tramo de 3 horas con más gente y el más tranquilo. Mira el período, pero nunca menos de 4 semanas (con un día no hay patrón: lo dice el
  subtítulo). Va junto a «De dónde vienen», como pidió Felipe en la maqueta; los 100 puntos bajan a la fila siguiente y la vitrina queda a lo ancho hasta
  la actividad 6. Base: `20261029042000_trafico_web_calor.sql` suma `calor` a `resumen_trafico_web` (misma firma). **Verificado:**
  `pruebas:tienda-trafico-resumen` 60/60 (6 nuevos), vitest de reglas 71/71, guías, unificar, colores, tokens, movimiento, ancho, tsc, eslint y knip; en el
  navegador a 1440 (claro y oscuro, con el globito de cada celda) y a 375 px sin scroll lateral. **No está en producción.**
- **Actividad 5 · De dónde vienen:** una tarjeta con «Por camino» (cuántos llegan, cuántos de 100 y cuántos de cada 100 separan; el chip va en verde si
  el camino separa un cuarto más que el promedio y en ámbar si separa un cuarto menos y trae 8 de cada 100 o más) y «Por ciudad»: el contorno real del
  Perú con cada departamento más rojo mientras más gente mira desde ahí (Felipe pidió pintar el departamento en vez de un círculo que crece), las tres
  tiendas marcadas, la ciudad sin tienda que más mira y la lista. Tocar una fila o un departamento filtra la pantalla. El contorno sale de geoBoundaries
  (PER ADM1, dominio público; Felipe aprobó bajarlo), proyectado y simplificado a 21 KB en `lib/peru-departamentos.ts`. Base:
  `20261029050000_trafico_web_regiones.sql` hace que `fn_trafico_web_personas` devuelva el departamento y suma `regiones` y `caminos_separan` al resumen.
  **Verificado:** `pruebas:tienda-trafico-resumen` 66/66, `pruebas:tienda-trafico` 21/21, vitest de reglas 76/76, guías (huella aceptada tras revisar la
  guía), unificar, colores, tokens, movimiento, tsc, eslint y knip; en el navegador a 1440 (claro y oscuro, globito y filtro al tocar un departamento) y a
  375 px sin scroll lateral. **No está en producción.**
- **Actividad 6 · Qué prendas miran:** la vitrina de baldosas pasó a una tabla (`<Tabla>` + `<Encabezado orden>`) que se ordena por Miraron, Separan o
  Separaron: cada fila con su miniatura, el cambio contra los días de antes, su recorrido en cuatro barras (el paso donde se atora en ámbar), «N de cada
  100» la separan con la raya del promedio de la tienda y su estado (Estrella si separa un 30 % más que el promedio, Revisar si menos de la mitad, Pocas
  personas con menos de 10). Se ven 8 y el resto con «Ver más»; el cajón de cada prenda sigue igual y pasa de una a otra en el orden de la tabla. Al
  ordenar por «Separan», las de menos de 10 personas van al final (1 de 8 no es una estrella). Se fueron `VitrinaTrafico`, su CSS y las funciones del
  mosaico (queda `franjasDe`). Sin cambio en la base. **Verificado:** vitest de reglas 80/80, mosaico 4/4, movimiento 20/20 (sin la baldosa), guías
  (huella aceptada), unificar, colores, tokens, sin foto, ancho, tsc, eslint y knip; en el navegador a 1440 (ordenar, abrir el cajón) y a 375 px en oscuro.
- **Actividad 7 · Tallas que piden y no hay, y Quién entra:** junto a «Qué prendas miran» (dos tercios y un tercio, como la maqueta), por categoría
  cada talla que ofrecen sus prendas publicadas: cuántas personas la eligieron en 4 semanas, cuántas unidades libres quedan en las tiendas (cantidad menos
  lo apartado, como la vitrina web) y cuántos modelos ya no la tienen. En ámbar, la que piden mucho (3 de cada 10 de la más pedida y 5 personas o más) y
  le queda menos de 1 unidad por cada 10 personas; la frase nombra las tres primeras. Cada categoría muestra SUS tallas (letras, numeración o única), no
  una grilla fija. Debajo, «Quién entra»: nuevos contra los que ya habían entrado en los 180 días de antes (la cookie del aparato), con cuántos de cada
  grupo separan. Base: `20261029120000_trafico_web_tallas_y_quienes.sql` suma `tallas` y `quienes` al resumen (misma firma). **Verificado:**
  `pruebas:tienda-trafico-resumen` 72/72, vitest de reglas 84/84, guías (dos pasos nuevos), unificar, tokens, movimiento, ancho, tsc, eslint y knip; en
  el navegador a 1440 en claro y a 375 px en oscuro sin scroll lateral. **No está en producción.**
