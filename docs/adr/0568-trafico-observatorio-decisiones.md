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
