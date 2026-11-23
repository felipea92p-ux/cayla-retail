# Maqueta · Gestión ▸ Análisis, más claro (2026-11-21)

> **Estado: Felipe eligió la cara B «Una respuesta por pregunta» (2026-11-21), con los filtros, «Qué pedir» de B y «No se vende» sin
> «Liquidar».** Todavía es solo maqueta: no toca el código del ERP, la base ni producción. Datos inventados (el repo es
> público): los mismos 18 modelos con que se dibujó la pantalla real para «Así está hoy».

`index.html` se abre con la config `maquetas` (puerto 8791) en `/analisis-claro-2026-11/`. Va sobre la base de vidrio
(`../vidrio-base-2026-10/`). La barra negra elige la cara, los datos (confiables o incompletos), las animaciones, el tema y el ancho.

## Lo que pidió Felipe

«Mejorar el diseño de todo lo que está dentro de Análisis: un diseño mejor, más intuitivo y amigable, para que cualquier persona que
ingrese pueda entenderlo. Propuestas antes de empezar a modificar, para ver cuál se ve mejor.»

## Las caras

| Cara | Qué es |
|---|---|
| A · Tu lista de hoy | Lo que hay que hacer hoy, agrupado por verbo: Comprar · Bajar al piso · Mandar a Arequipa · Liquidar. Cada fila: la prenda, su porqué en una línea y su botón. «Qué pedir» es la segunda pestaña y es otra lista igual (Pide ya · Te alcanzan · Sin ventas, un tipo por fila). |
| **B · Una respuesta por pregunta** (elegida) | Las 5 pestañas de hoy; cada una abre con su respuesta en grande y las prendas en una sola tarjeta. En «Qué pedir»: «5 tipos no te alcanzan» y una tarjeta por tipo. |
| C · La vitrina | Una pantalla con todos los modelos como en la percha, en repisas por cómo van, cada prenda con su etiqueta colgada. «Qué pedir» es un tendedero de hoy a Navidad: cada tipo cuelga el día en que se acaba. |

Iguales en las tres: todo se cuenta en **modelos**; la ficha en tres bloques (qué hacer, cómo se vendió, qué talla falta); «Qué
pedir» mide lo mismo (¿te alcanza cada tipo hasta Navidad?, qué talla se acaba primero, lo más vendido), aunque cada cara lo
dibuja a su manera (Felipe 2026-11-21: la pestaña se llama «Qué pedir», nunca «Para Navidad»); y las reglas de ADR-0357 (solo tu tienda, sin cantidades, botones según
el rol, aviso de datos incompletos que no se cierra). Ninguna pide un cambio en la base.

**Filtros (Felipe 2026-11-21: «hay que darle la facilidad al usuario»), iguales en las tres caras y en las dos vistas:** buscar mientras se
escribe (prenda, tipo o color), y Tipo · Talla · Color · Precio · De dónde viene, cada uno con varias opciones y cuántos hay en cada
una; cuántos ves y cómo ordenar al lado; un vacío que deja quitar cada filtro. En «Qué pedir», la talla elegida rearma el «¿te alcanza?».
Suma el filtro «Sin venderse» (1 a 2 meses, 2 a 3, más de 3).
En el celular, un botón «Filtros» abre una hoja con chips. Todo sale de datos que Análisis ya lee (categoría, talla, color, precio,
origen): no pide cambios en la base.

## Medido (2026-11-21, en local, la pantalla real con estos datos a 1280 px)

| Pestaña | Palabras | Controles | Formas de gráfico |
|---|---:|---:|---|
| Hoy | 215 | 32 | 3 |
| Se está acabando | 178 | 27 | 1 |
| No se vende | 292 | 29 | 2 |
| Nunca salió al piso | 178 | 20 | 2 |
| Qué pedir | 371 | 32 | 5 |

13 formas de gráfico en total contando la ficha. En «Qué pedir», «4 semanas para Navidad» arriba y «Navidad · 5 semanas» en la tabla
(34 días redondeados de dos formas). Las capturas están en `hoy/`.

## Lo que sigue

Felipe elige mirando. Con la cara elegida: `/milimetro diseñar` de la pantalla, construir por actividades (`/construir`), y después
`/formidable`, `/focus` y `/guia` (la guía interactiva de Análisis cambia entera).

## Lo que no se vende, sin «Liquidar» (Felipe 2026-11-21)

Felipe primero pidió que «no se vende» sirviera para saber qué liquidar, y después: «hay que quitar el liquidar, mejor; basta con que aparezca
lo que no se vende, así el usuario decide qué hacer». Quedó así, en las tres caras: el grupo (y la tarjeta) se llama «No se vende»; cada
prenda dice hace cuánto no se vende (rojo desde 3 meses), cuántas tienes y cuánta plata tiene parada (costo × prendas); se ordena por días,
plata parada o prendas, y se filtra por «Sin venderse». Sin botón «Liquidar», sin casillas ni rebaja sugerida: tocar la prenda abre su ficha
(«96 días sin venderse.», sus cifras y «Ver en Existencias»). Lo que en Arequipa sí se vende conserva su «Mandar». El enlace «Desde 60 días»
sigue cambiando el umbral (hoy esa hoja se llama «Liquidar desde»: al construir, se nombra como lo que cuenta).
