# ADR-0568 · Tienda web ▸ Tráfico: del tablero de la vitrina al «Observatorio» que dice qué hacer

- **Fecha:** 2026-10-29 · **Estado:** aceptado (Felipe eligió la maqueta y aprobó las 10 actividades el 2026-10-28). Construido en la rama
  `claude/web-store-traffic-dashboard-e8b9e2`. **Las migraciones están en producción desde el 2026-10-29** (pegadas con el OK de Felipe; ver «Cómo se
  publica»). La web se publica al fusionar el PR.
- **Pedido:** un tablero del tráfico de la tienda web que ayude a decidir, con texto corto, gráficos que cualquiera entienda y filtros como «Hoy» y
  «Este mes». Maqueta final: `docs/maquetas/trafico-decisiones-2026-10/index.html` (PR #1457).
- **Relacionados:** ADR-0495 (la medición propia de visitas y la primera pantalla, maqueta C «La vitrina»), ADR-0136 (movimiento), ADR-0358 (una
  función, una pieza), ADR-0389 (guías), ADR-0336 (modo oscuro).

## El problema

La primera Tráfico (ADR-0495) contaba bien, pero respondía «cuánto» y no «qué hago»: un solo período fijo de 30 días contra los 30 de antes, una vitrina
de baldosas que mostraba qué miran sin decir si se llevan, un recorrido en barras y «a qué hora» sumado en una sola fila. Felipe pidió poder ver Hoy
contra ayer, el mes contra el anterior, y que la pantalla le diga dónde se pierde la gente, qué talla falta, qué reponer y qué pedido nadie recoge.

## La decisión (lo que eligió Felipe, en orden de la pantalla)

1. **Períodos que se comparan como se piensa** (actividad 1): Hoy contra ayer *a esta misma hora*, Ayer contra el mismo día de la semana pasada, 7 días,
   Este mes contra los mismos días del mes anterior, Mes pasado y la campaña. Un solo segmento con teclas H A 7 M P C, y la frase dice contra qué se compara.
2. **Cinco cifras que eligen el gráfico** (actividad 2): Entraron, Vieron una prenda, Separaron, Separan de cada 100 y Recogieron; la tocada se dibuja
   contra los días de antes (por hora en un día, por día en varios), con «Acumulado» y, en Hoy, el cierre esperado. Al costado, la respuesta en una
   frase y cuatro datos. La hora en curso y el día a medias no se dibujan sin acumular (la línea «caía» sin haber caído).
3. **Hasta dónde llega la gente** (actividad 3): 100 puntos por paso. El paso donde más gente se pierde se marca en ámbar **solo si va peor que de
   costumbre** (con el mismo peso de 30 personas que `dondeSeAtora`, y nunca con poca gente).
4. **Cuándo entra la gente** (actividad 4): mapa de calor día de la semana × hora en rojo CAYLA, con las 6 horas más fuertes; mira el período pero
   nunca menos de 4 semanas (con un día no hay patrón). Reemplaza «A qué hora entran».
5. **De dónde vienen** (actividad 5): por camino, cuántos llegan y **cuántos de cada 100 separan**; por ciudad, **el contorno real del Perú** con cada
   departamento más rojo mientras más gente mira (Felipe pidió pintar el departamento, no un círculo que crece). Contorno de geoBoundaries (PER ADM1,
   dominio público; Felipe aprobó bajarlo), simplificado a 21 KB en `lib/peru-departamentos.ts`.
6. **Qué prendas miran** (actividad 6): la vitrina de baldosas se fue; una tabla que se ordena por miradas, «separan» o «separaron», con el
   recorrido de cada prenda en cuatro barras, la raya del promedio y su estado (Estrella / Normal / Revisar). Con menos de 10 personas no se juzga.
7. **Tallas que piden y no hay, y Quién entra** (actividad 7): por categoría, la talla que eligieron contra las unidades libres en las tiendas; en ámbar
   la que piden mucho y queda menos de 1 unidad por cada 10 personas. Nuevos contra los que volvieron en 180 días.
8. **Necesita tu atención** (actividad 8): Reponer (se agotan en menos de 14 días al ritmo de venta), Recoger (pedidos pagados sin recoger, con el
   plazo de aviso de la tienda web) y Empujar (stock para más de 40 días o sin ventas). Últimas 4 semanas hasta hoy, sin filtros.
9. **El mes, día por día** (actividad 9): calendario en rojo, el período pleno y el resto tenue. Su rojo va de 6 a 56 % (no hasta 92 como el mapa de
   calor) porque encima va un número: hasta ahí se lee en los dos temas (medido con `tema:auditar`, 4,6:1 o más).

## Cómo se hace (y dónde volver a verlo)

- **Una sola función de la base** sigue alimentando la pantalla: `retail.resumen_trafico_web` pasó de 4 a 7 parámetros (los días con los que se
  compara y el corte de hora) y suma `serie`, `calor`, `regiones`, `caminos_separan`, `tallas`, `quienes`, `atencion` y `calendario`. Nunca hay dos
  versiones a la vez (la de 4 se borra). `fn_trafico_web_personas` devuelve además el departamento. Pruebas: `pnpm pruebas:tienda-trafico-resumen`
  (83 casos) y `pnpm pruebas:tienda-trafico`.
- **Toda decisión de la pantalla es lógica pura** en `apps/web/lib/trafico-reglas.ts`, con su prueba (`trafico-reglas.test.ts`, 93 casos): qué se
  compara, cuándo un paso «va peor», qué talla falta, qué reponer, cuánto rojo lleva cada cosa.
- **Piezas de la casa**: `TarjetaCifra`, `Linea`, `Sparkline`, `SegmentoEnlaces`, `SegmentoDeslizante`, `Tabla`/`Encabezado orden`, `BarraAvance`,
  `BarraApilada`, `Pestanas`, `Chip`, `TituloSeccion`, `Vacio`, `BotonVerMas`. Lo propio vive en `app/estilos/trafico.css`.

## Lo que se apartó a propósito

- **El período usa `SegmentoEnlaces`** (la pieza de «modo», pensada para 2–3 opciones) y no `pildora-cayla`, porque Felipe pidió que se vea como la
  maqueta. Si molesta, se decide en `/unificar`.
- **Los caminos no tienen color propio** (la maqueta reutilizaba los de método de pago): barras en tinta y el chip de «separan» con su tono. Decisión
  abierta para Felipe.
- **«Ya había venido» es por aparato**: quien borra sus cookies o cambia de celular vuelve a contar como nuevo.

## Cómo se publica

Las migraciones se pegan en el SQL Editor de producción **con el OK de Felipe y en este orden**, ANTES de publicar la web (la pantalla llama a la
función de 7 parámetros): `20261029015000` → `20261029040000` → `20261029042000` → `20261029050000` → `20261029120000` → `20261029123000` →
`20261029132000`. Cada una es un `create or replace` (la primera y la de departamentos borran antes la firma vieja con `drop function`, que no toma
las tablas de auth ni storage), sin políticas ni tablas en uso, y se puede pegar dos veces. Después: refrescar el volcado del diccionario.

**Cómo se pegó (2026-10-29, con el OK de Felipe):** cada migración trae `resumen_trafico_web` entera, sumando lo de la anterior, así que se aplicaron
en orden las tres que dejan producción igual que las siete: `20261029015000` (borra la de 4 parámetros y crea la de 7), la parte 1 de
`20261029050000` (`fn_trafico_web_personas` con su departamento) y `20261029132000` (el resumen completo, que contiene lo de `040000`, `042000`,
`050000`, `120000` y `123000`). Verificado: la huella (`md5(prosrc)`) de las dos funciones es idéntica a la de la base local donde corrieron las
pruebas, `authenticated` las ejecuta y `anon` no, y la función responde como Admin con sus 22 partes. La llamada de 4 parámetros de la web de
antes sigue funcionando (los otros tres tienen valor de fábrica).

## Qué quedó sin verificar

- **Con datos reales:** la base local no tiene visitas; todo se vio con una página temporal de datos inventados (ya borrada) y la guía se declaró
  «sin datos locales» en `guias/ejemplos.mjs`. Falta mirarla con visitas de producción y correr `/formidable` ahí.
- **Velocidad en producción:** `resumen_trafico_web` ahora lee más (4 semanas para el mapa y las tallas, 180 días para «Quién entra»). Con el
  volumen de hoy es instantáneo; si la tabla crece mucho, «Quién entra» pide un índice por visitante.

## Actualización 2026-10-29 — más igual a la maqueta (Felipe, mirando la pantalla publicada)

- **La primera parte va en UNA tarjeta**, como la maqueta: la franja de cinco cifras arriba (una por cifra, la elegida con fondo y su raya de
  3 px, la línea chica a todo el ancho con su área: `Sparkline lleno`), el gráfico con su leyenda bajo el título y la lectura al costado sobre un
  degradado de hueso. Ya no son `TarjetaCifra` sueltas: Felipe pidió verlo como la maqueta.
- **Se fue «Gráfico / Tabla»** (y `TablasTrafico`): la maqueta no lo tiene. Un enlace viejo con `?vista=tabla` cae en la pantalla de siempre.
- **«Ver más» abre una hoja** en «Qué prendas miran» (la tabla entera, con su orden) y en «Tallas que piden y no hay» (todas las categorías). Las
  tallas muestran las 8 categorías donde más gente eligió talla, con celdas más chicas, para que midan lo mismo que las 8 prendas de al lado.
- **El paso donde más gente se pierde se marca siempre**, también con pocas personas (entonces la frase dice que es una pista).

## Actualización 2026-10-30 — «Hasta dónde llega la gente» pasa a ser la línea de la tienda, y hoy entra al gráfico

- **Los 100 puntos por paso se fueron.** Con pocas visitas (127 en 7 días) cinco de las seis grillas quedaban casi grises, y «1 de cada 100»
  era, en verdad, 1 persona. Felipe vio dos rondas de maquetas (`docs/maquetas/trafico-recorrido-2026-10/`: escalera, un solo 100, anillos,
  cinta; después solo cifras, la línea de la tienda, la gente de verdad, la respuesta y el seguimiento) y eligió **F · La línea de la tienda**:
  cada paso es una estación con su ícono de lucide y **cuántas personas llegaron**; entre una y otra, cuántas se fueron y sin hacer qué. La
  estación donde se atora va en ámbar y la última en verde si alguien llegó. Angosta (menos de 760 px de tarjeta) baja de arriba abajo.
- **Sin «de cada 100» en este bloque** (Felipe: «¿es necesario?»). La frase dice personas de estos días: «de 43 que vieron una prenda, solo 6
  eligieron talla. De costumbre, serían unos 19» (`costumbreEnPersonas`). La regla de dónde se atora (`dondeSeAtora`) no cambió.
- **Movimiento (ADR-0136):** las estaciones entran una vez en cascada y el riel se dibuja detrás; sin rebote ni bucle, apagado con «reducir
  movimiento». Reemplaza a «los 100 puntos que se encienden», que era la excepción anotada en CLAUDE.md.
- **Hoy entra al gráfico de «Entraron».** En «Por día», el día en curso no entraba a la línea a propósito (a medias, la línea «caía» sin haber
  caído), pero el 30 quedaba vacío sin explicación y Felipe preguntó por qué. Ahora `graficoDe` lo devuelve aparte (`enCurso`) y `<Linea>`
  lo dibuja con un tramo punteado hasta un punto hueco con su cifra y «hasta ahora» (prop `enCurso`, nueva en la pieza única). Lo mismo con
  la hora en curso en Hoy. En «Acumulado» no cambia nada: ahí ya entraba.

## Actualización 2026-10-31 — que se note dónde se pierde la gente: «B · Zona marcada» (Felipe)

- **Qué pasó:** Felipe miró «Hasta dónde llega la gente» con una captura real (146 · 51 · 9 · 4 · 2 · 1) y dijo que «no se nota mucho dónde se pierde la
  gente». Se le mostraron tres formas nuevas (columnas a escala, una fila por paso, un río que se angosta) y dijo que **lo de hoy está bien, solo que el
  tramo naranja se note más**. Se le mostraron entonces tres intensidades sobre la misma línea y eligió **B · Zona marcada**
  (`docs/maquetas/trafico-perdida-2026-10/realce-del-tramo.html`).
- **Qué cambió:** la línea conserva su forma. El tramo donde se atora lleva un **recuadro ámbar suave** con su rótulo (de la mitad de la estación de antes a
  la mitad de la que se atora; angosta, abraza a las dos estaciones apiladas), el **riel de ese tramo se engruesa** (5 px), el círculo del paso se llena de
  ámbar y el «42 se fueron…» sube a 18 px. El rótulo dice lo mismo que el veredicto: «Aquí se atora» si va peor que de costumbre, «Una pista» con pocas
  personas, «Como de costumbre» si no. Entra una vez, sin rebote ni bucle (`trafico-zona-entra`), y se apaga con `prefers-reduced-motion`.
- **Cómo está hecho (sin script):** la estación de ANTES del paso que se atora (`data-hacia-atora`) dibuja el recuadro con su `::after`, translúcido para que
  el riel vecino se vea, detrás del contenido (`isolation: isolate`); el rótulo es un `<span aria-hidden>` (el chip ya lo dice con letras). Solo tokens
  (`--color-ambar`, `--color-papel`); en oscuro el ámbar es el claro de la paleta y el rótulo pasa a texto oscuro. `RecorridoTrafico.tsx`, `trafico.css`.
- **DESCARTÉ:** (1) bajar de tono lo demás, como en la maqueta (`opacity .72`): el texto de las salidas ya va al 70 % y quedaría bajo el piso de contraste.
  (2) Las tres formas nuevas (A/B/C de `index.html`): Felipe prefirió conservar la línea de hoy.
- **No cambió, y es de Felipe:** *qué* se marca. La regla sigue siendo la de siempre (el paso que deja pasar a menos gente de la que le llega, comparado con lo de
  costumbre): con esos datos marca «al elegir talla» (42 de 51, 82 %), aunque donde más PERSONAS se van es apenas entran (95 de 146, 65 %). Cambiar a
  «más personas» es una línea en `dondeSeAtora`; la maqueta (`index.html`, «Qué marca en ámbar») deja compararlas.
- **Verificación:** el componente real renderizado a HTML con el CSS real (la base local no tiene visitas ni estaba levantada), en claro y oscuro, a ancho de
  escritorio y a 375 px, con los datos de la captura, un caso donde se atora el primer paso y otro de poca gente. Falta mirarlo con visitas de producción.

## Actualización 2026-10-31 (b) — «C · La cifra manda» reemplaza a «B · Zona marcada», con el naranja de la maqueta

- **Qué pasó:** al mirar «B» ya aplicada en el ERP, se vio que no era lo que se eligió en la maqueta: el naranja había pasado a café (`--color-ambar`,
  #74501a) y el rótulo cambiaba de texto («Como de costumbre» dentro de una zona resaltada: dos mensajes opuestos). Se volvió a mirar la ronda
  (`docs/maquetas/trafico-perdida-2026-10/realce-del-tramo.html`) y se prefirió **«C · La cifra manda»**, con el naranja más claro del diseño.
- **Qué cambió:** el recuadro y su rótulo se fueron. El tramo donde se atora es un riel **punteado grueso (6 px) y naranja**, la estación que se atora se llena de
  naranja y lo que se fue sale como un **«−42» grande en serif** (40 px; 46 en tarjeta ancha) con «82 % se fue sin elegir talla» en ámbar, colgando de una raya
  punteada naranja. Para un lector de pantalla, el texto es el de siempre («42 se fueron sin elegir talla»); el «−42» es visual (`aria-hidden`). El chip de arriba
  sigue diciendo «Aquí se atora» o «Como de costumbre». Entra una vez (el riel que se dibuja), sin rebote ni bucle; sin la animación `trafico-zona-entra`.
- **El naranja es un token nuevo, `--color-naranja`** (`globals.css`, `tema.css` en oscuro y en `.papel-fijo`): #bf8029 en claro, #dba04a en oscuro. Es de GRÁFICO
  —línea y relleno—, nunca texto (el texto va en `ambar`). El de la maqueta (#c98a2b) daba 2.77:1 sobre papel y no llegaba al 3:1 que se exige a un gráfico; #bf8029
  es el más claro de su misma familia que sí llega (3.13:1). `lib/tema-tokens.test.ts` lo mide en claro y en oscuro.
- **DESCARTÉ:** (1) usar `--color-grafico-baja` (#a8741f, 3.8:1): ya existe, pero es más oscuro y sale más café que el naranja que se pidió. (2) Bajar de tono lo demás
  (`opacity .72` de la maqueta), por el piso de contraste del texto. (3) Dejar un rótulo sobre el tramo: ya lo dice el chip.
- **Sigue siendo de Felipe:** *qué* se marca (`dondeSeAtora`), como en la actualización anterior; y que la paleta del ERP gane un naranja.
- **Verificación:** el componente real, con datos inventados en una página temporal (ya borrada), en claro, oscuro y a 375 px; pruebas de tokens, colores, movimiento,
  guías y unificar, `tsc` y `eslint` en verde. Falta mirarlo con visitas de producción.
