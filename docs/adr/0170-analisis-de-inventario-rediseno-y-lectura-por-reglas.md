# ADR-0170 — Análisis de inventario: una sola lectura, misma anatomía en las dos pestañas y «Cambio relevante» por reglas

**Fecha:** 2026-09-22 · **Estado:** aceptado (Felipe, 2026-09-22) · **Sin migraciones** · **Amplía:** ADR-0138 (Análisis de inventario) · **Se apoya en:** ADR-0169 (paleta oficial) · **Referencia visual:** Sala de Diseño («Análisis — Comparar períodos») y la demo `docs/maquetas/analisis-rediseno-2026-09/demo.html`

## Contexto

Felipe pasó dos capturas de `/inventario/resumen` en Tienda TRU: las dos pestañas vacías, con una sola línea de texto. Pidió rediseñar la pantalla con la guía de la Sala de Diseño. ADR-0169 ya había cambiado el tono y el orden visual de Inventario («solo visual: la información no cambia»). Faltaba lo que la guía dibuja y la pantalla no tenía:

- Desempeño era solo una tabla, sin un veredicto arriba.
- Comparar se partía en «Vista general / Detalle por producto»: para ver qué productos explicaban el cambio había que saltar de vista.
- La tabla no decía qué hacer con las cifras. El «cambio relevante» de Comparar era una etiqueta («Aceleró», «Mejoró rotación»), sin acción.
- El aviso de exactitud era una tarjeta al lado del título y le peleaba la jerarquía.
- Una sede sin datos dejaba al líder en un callejón sin salida.

Se armó una demo interactiva con las decisiones intercambiables y Felipe eligió.

## Decisión (Felipe, 2026-09-22)

1. **Desempeño toma la misma anatomía que Comparar (opción A):** cuatro cifras (ventas del período con la 2.ª mitad frente a la 1.ª, rotación, sell-through y capital al cierre), tres gráficos (tendencia dentro del período, top rotación y distribución de sell-through) y la tabla.
2. **«Cambio relevante» por reglas fijas** (`lib/resumen-lectura.ts`). Hay una frase por variante, siete reglas en orden y gana la primera:
   1. cifras estimadas (el historial no cuadra, ≈);
   2. se agotó: vendió y cerró en 0 → pendiente reponer;
   3. sin ventas con stock en un período de 14 días o más → liquidar o trasladar;
   4. cambió el ritmo. En Desempeño es la 2.ª mitad frente a la 1.ª (±25 %). En Comparar es el cambio más importante de A a B con la prioridad de siempre (`cambioMostrado`: ritmo, rotación, sell-through ±10 pp), así que no se pierde «Mejoró rotación»;
   5. vendió el 80 % o más de lo disponible;
   6. rota lento: menos del 15 % con 20 u. o más al cierre (solo Desempeño);
   7. sin cambio relevante; si no hay nada medible, «—».
3. **El aviso de exactitud es una franja** fina a todo el ancho bajo el título (`ResumenBanner`).
4. **Sede sin datos: vacío con salidas** (`ResumenVacio`). Ofrece «Ampliar a 90 días» (solo en Desempeño y si el período es menor), «Ver <otra tienda>» (la misma acción que el selector de sede, `cambiarUbicacionActiva`) e «Ir a Recibir mercadería». El Taller usa la misma pieza.

Y tres consecuencias de diseño que decidí yo, porque son de ingeniería y no de negocio:

- **Comparar es una sola lectura:** cifras → gráficos → tabla. Se quitó `vista` de la URL y del tipo; un `?vista=detalle` viejo se ignora sin romper nada. La dona y «Ver ranking» ahora filtran u ordenan la tabla de abajo y llevan la vista hasta ella.
- **La banda de sell-through de Desempeño pasó a la cabecera de la tabla.** Recorta la tabla y nada más, igual que el filtro de cambio en Comparar. Las cifras y los gráficos salen del alcance (categoría y búsqueda): elegir «Alto» no mueve ningún número de arriba (lo fija una prueba).
- **Colores de gráfico propios** (`--color-grafico-alza/neutro/baja` en `globals.css`). Con el validador de paletas, el verde y el ámbar oficiales se confunden como relleno vecino (ΔE 7.9, 4.5 con deuteranopía), y el taupe que usaba la dona se confundía con el ámbar (ΔE 9.8). El trío nuevo pasa en todos los pares y el texto sigue con los tokens oficiales.

## Lo que NO cambió

- **Ninguna fórmula nueva.** Las cifras de Desempeño reutilizan `rotacionAgregada`, `calcularSellThrough` sobre las sumas, `costoEsVerificable` y `variacionPct`. El cambio de la 2.ª mitad se mide por día, porque con 7 días las mitades duran 3 y 4.
- **Sin migración:** `fn_resumen_comparacion` ya traía las dos mitades.
- La barra de controles, el selector de fechas (`PopoverRango`) y el popover «Actualizado» siguen igual.

## Cómo se verificó

- Typecheck, lint y las 8,002 pruebas unitarias en verde. Hay pruebas nuevas en `resumen-lectura.test.ts` (el orden de las reglas y la evidencia que pide cada una) y en `resumen-desempeno.test.ts` (cifras, gráficos y que la banda no mueva las cifras).
- En esta sesión no había base local (sin Docker). Como en ADR-0169, se montaron los componentes reales en una ruta temporal, sin commitear, con datos de muestra. Se vieron Desempeño, Comparar, el clic en la dona (filtra y baja a la tabla), TRU vacío y el celular a 390 px sin desplazamiento lateral.
- **Falta verlo con clics reales contra la base.**

## Se rompe si

- Una regla nueva de lectura se agrega en un componente y no en `resumen-lectura.ts`: la tabla y las pruebas dejarían de decir lo mismo.
- Alguien vuelve a pintar la dona con `--color-verde`/`--color-ambar`/`--color-taupe`, que son colores de texto, no de relleno.
- El filtro de sell-through de Desempeño vuelve a entrar en `calcularKpisDesempeno`: las cifras de arriba cambiarían con un filtro de la tabla.
