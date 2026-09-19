# ADR-0105 — Las clases de componente propias viven en `@layer components`

**Fecha:** 2026-09-18
**Estado:** Aplicado. Verificado en navegador con un corpus de 752 `className` reales del
código (ver "Cómo se verificó"). `tsc`, `eslint` y `vitest` (417/417) en verde. CSS compilado
y minificado como en producción (Tailwind + lightningcss): ninguna clase de componente
queda fuera de capa. No toca esquema ni RPC. **Lo que NO se pudo hacer:** verificar las
pantallas con datos reales — el Docker local estaba caído (500) y no se reinició para no
tumbar los Supabase de otras sesiones. Ver "Cómo se verifica con datos reales".
**Afecta:** `apps/web/app/globals.css` (bloque de clases de componente + movimiento reducido),
21 `className` sueltos en 10 archivos (ver la tabla de la decisión), y los enlaces de acción de
`TarjetaCifra` y de las tarjetas locales de Conteo y Traslados.
**A qué pájaro toca:** Gorrión (plataforma; el sistema visual no es de un módulo). De rebote,
a cualquiera que escriba una tarjeta con `border-l-2 border-l-rojo`.

## El problema

`.card-cayla` estaba definida en `globals.css` **fuera de toda `@layer`**. Una regla sin capa
le gana a cualquier regla dentro de una capa, sin importar la especificidad ni el orden. Las
utilidades de Tailwind v4 viven en `@layer utilities`. Resultado: `card-cayla border-l-2
border-l-rojo` pintaba `border-left: 1px solid sand` — el acento rojo de "esta tarjeta pide
algo" (`acento` de `TarjetaCifra`, `InventarioPanel`, Conteo, Traslados, Productos,
`RevisarAltaBanner`) **nunca se vio**. Medido el 2026-09-18 con `getComputedStyle`.

Peor que el acento fue lo que nadie había notado: por la misma causa, sobre una tarjeta
tampoco existían el `hover:bg-*` (tarjetas que se pueden tocar), el `bg-sand/40` de `activa`
(el filtro seleccionado en Resumen/Existencias no se distinguía del resto — solo lo decía
`aria-pressed`), ni el `focus-visible:border-rojo` de `/compras` y el `focus:border-rojo` de
`campoSelect`, que además llevan `outline-none`: **esos controles no tenían indicador de foco
de teclado**.

Y no solo `.card-cayla`: `.label-cayla`, `.font-display`, `.alza-cayla` tenían el mismo
defecto (17 `font-normal`/`font-bold` sobre `label-cayla`, un `font-semibold` sobre
`font-display`, 3 `transition-*` sobre `alza-cayla` — todos ignorados en silencio).

## La decisión

**DECIDÍ: todas las clases de componente con nombre propio (`card-cayla`, `font-display`,
`label-cayla`, `alza-cayla`, `scroll-cayla`, `anim-*`) pasan a `@layer components`.** Dentro
del bloque de Tailwind el orden es base < components < utilities, así que la clase pone el
valor por defecto y la utilidad lo cambia — lo que cualquiera espera al escribir
`card-cayla rounded-none`. Fuera de capa quedan solo: `body`, los `@keyframes`, el bloque de
impresión y el `!important` de movimiento reducido (lo que no se combina con utilidades o
tiene que ganarle a todo). La regla queda escrita en el comentario de `globals.css`.

DESCARTÉ dejar `.card-cayla` suelta y poner `!` en cada utilidad (`border-l-2! border-l-rojo!`,
que es lo que hizo `ComercialPanel` mientras tanto) porque es un parche por sitio: cada
tarjeta nueva tiene que acordarse, y el olvido es silencioso — exactamente como se perdió el
acento en seis pantallas. También descarté mover solo `.card-cayla`: las otras tres tenían
17+1+3 utilidades muertas; arreglar una y dejar tres con la misma trampa es dos formas de
resolver lo mismo.

**DECIDÍ: las utilidades que estaban muertas y expresaban una intención de diseño se
quedan y ahora aplican; las que contradecían el sistema se borran.**

| Utilidad muerta | Sitios | Decisión |
|---|---|---|
| `border-l-2 border-l-rojo` (acento) | 6 tarjetas | **Queda** — es la señal de "pide algo" |
| `bg-sand/40` (`activa`), `hover:bg-*`, `focus:border-rojo` | TarjetaCifra, Tarjeta de Existencias, `/compras`, `/compras/por-pagar`, `campoSelect` | **Queda** — estado seleccionado, hover y foco de teclado que faltaban |
| `border-dashed` | 2 (placeholders en `productos/[id]/editar`) | **Queda** |
| `border-rojo/30`, `border-ambar/30` | `vender/page.tsx` (error), `PuntoDeVenta.tsx` (venta guardada sin conexión) | **Queda** |
| `font-normal` sobre `label-cayla` | 13 (etiquetas móviles de tabla, `<th>` de matrices de tallas) | **Se borra** — `label-cayla` es 600 a propósito (comentario del 2026-09-08: "la versalita necesita cuerpo para no desaparecer contra el crema"); 400 a 10px sobre `tinta/45` reprueba legibilidad, y estas pantallas se venían usando (y mirando) en 600 |
| `font-bold` sobre `label-cayla` | 4 (`CajaAbiertaPanel`, `CambiosLista`) | **Se borra** — verificado en navegador a 600, no a 700 |
| `font-semibold` sobre `font-display` | 1 (`CajaAbiertaPanel:360`) | **Se borra** — `font-display` es 400, "el alma del sistema"; el 600 nunca se vio |
| `transition-colors` / `transition-shadow` sobre `alza-cayla` | 3 | **Se borra** — sobreescribirían la lista de transiciones de `alza-cayla` y el "levante" de 2px pasaría de animarse a saltar. Hoy el color no anima y el levante sí; se conserva así |

**DECIDÍ (Felipe eligió la opción A el 2026-09-18): los enlaces de acción de las tarjetas
("Ver detalle →", "Confirmar el…", "Seguir contando →") pasan de rojo a tinta subrayado, y lo
mismo los enlaces de prenda del banner de altas pendientes de Productos.** Aplica en
`TarjetaCifra` y en las copias locales de Conteo y Traslados. El rojo de una tarjeta queda para
el borde `acento`: lo que "pide algo" se ve por el borde, no por cuatro enlaces iguales.

DESCARTÉ dejar los enlaces rojos junto al borde (lo que decía el comentario original de
`TarjetaCifra`, escrito sin haber visto nunca el borde) porque `MAX_ROJO_POR_PANTALLA = 2` se
rompía apenas el borde se hizo visible: Resumen mostraba 5 rojos. También descarté ("C") cambiar
la regla a "2 por bloque": es tocar la marca para acomodar la pantalla, no al revés. Y descarté una
solución a medias que probé primero (solo el enlace de la tarjeta con borde en tinta): dejaba a
Resumen en 4 y hacía que dos tarjetas iguales se vieran distinto según tuvieran o no borde.

## Cómo se verificó

Con un andamio temporal (no commiteado): una página que pinta un `<div>` por cada `className`
del código que usa una de estas clases (752, con las ramas condicionales encendidas — peor
caso) y vuelca sus estilos calculados (fondo, bordes, radios, tipografía, transición,
animación, sombra).

1. **Antes** de tocar nada: línea base.
2. Mover las clases a la capa, sin tocar ningún `className`: cambian **31 de 752** — exactamente
   los 31 que el análisis estático predijo (17 + 1 + 3 + 10). Los otros 721 quedan idénticos:
   mover la capa no altera nada más.
3. Aplicar las decisiones de arriba: cambian **10 de 752**, todos intencionales (los acentos,
   `border-dashed`, `border-rojo/30`, `border-ambar/30`, el fondo de `activa`).
4. Hover y foco no salen de `getComputedStyle`: se probaron con el mouse real sobre un
   elemento de prueba (`hover:border-rojo/40` y `hover:bg-*` aplican; `focus-visible:border-rojo`
   pasa a rojo; `.alza-cayla:hover` sigue levantando 2px con `--shadow-md`).
5. Réplica del Resumen con el componente real `TarjetaCifra` en el peor caso, a la vista:
   el borde rojo de "Necesita reposición ahora" se dibuja y su enlace va en tinta.

## `MAX_ROJO_POR_PANTALLA` — lo medido (peor caso, estado normal, sin hover ni errores)

Cuenta el color de acento `rojo` (no `rojo-profundo`), por elemento; no cuenta puntos de
estado repetidos por fila de una tabla.

| Pantalla | Antes del cambio | Con solo mover la capa | Final (con A) |
|---|---|---|---|
| **Resumen** | 4 (3 enlaces + cifra de Riesgo) | 5 (+ borde) | **2** (borde + cifra de Riesgo) — medido en el navegador |
| Traslados | 2 | 3 | **1** (solo el borde; "Con diferencia" va en rojo-profundo) |
| Conteo, con un conteo abierto | 2 | 3 | **2** (borde + "Ver ajustes por conteo →") |
| Existencias (tarjetas) | 1 | 2 | 2 |
| Productos, con altas pendientes | N+1 | N+2 | **2** (borde + "N sin stock") |
| Producto → editar (banner de alta pendiente) | 0 | 1 | 1 (+ lo que ya tenga el formulario) |

Conteos hechos leyendo el código (Traslados, Conteo, Existencias, Productos) y midiendo en el
navegador (Resumen, con el componente real). Ninguna pantalla medida pasa de 2.

## Se rompe si

- Alguien agrega una clase `algo-cayla` **fuera** de `@layer components` "porque así estaban
  las otras" — vuelve el defecto, en silencio, en la primera tarjeta que la combine con una
  utilidad. Nada lo avisa hoy (ver BACKLOG: falta una prueba que lo haga cumplir).
- Se escribe una utilidad esperando que **no** aplique sobre una clase de componente
  (`font-normal` sobre `label-cayla` "que no hace nada"): ahora sí hace algo.
- Dos tarjetas con `acento` conviven en la misma pantalla junto a otros rojos: el conteo de
  arriba es de peor caso por pantalla, no por tarjeta.

## Cómo se verifica con datos reales (pendiente — lo hace Felipe)

Con Supabase local arriba, entrar como líder y mirar: **Inventario → Resumen** (borde rojo en
"Necesita reposición ahora" si hay reposición pendiente; el filtro elegido queda con fondo
sand), **Inventario → Traslados** (borde en "Por confirmar en mi sede"), **Inventario →
Conteo** con un conteo abierto (borde en "Conteo abierto"), **Productos** con una prenda dada
de alta en un conteo (banner con borde rojo), **Compras** (tab con Tab: la tarjeta enfocada
marca borde rojo).
