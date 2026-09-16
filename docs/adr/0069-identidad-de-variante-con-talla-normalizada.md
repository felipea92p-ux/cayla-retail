# ADR-0069 — La identidad de una variante compara la talla normalizada y trata "sin color" como un color

**Fecha:** 2026-09-16
**Estado:** Aplicado en local (`20260916190000_variantes_identidad_unica.sql`). Producción:
pendiente de que Felipe pegue `docs/datos/SQL-PENDIENTE-PRODUCCION-2026-09-16-loro.sql`
(pre-flight medido el mismo día: 0 pares en conflicto).
**Afecta:** `retail.variantes` (regla única), `apps/web/lib/error-escritura.ts` (traducción del
error). Módulo 02 · Loro, hueco 4.

## El problema

En V2 el color de una variante ya es una referencia obligatoria a `colores`, así que "azul" y
"azul " ya no pueden ser dos colores. Pero la regla que impide cargar dos veces la misma prenda,
`unique (producto_id, talla, color_codigo)`, tenía dos agujeros:

- **La talla se comparaba como texto exacto.** Una encargada escribe "M", otra "m", una
  importación trae "M ". Son tres variantes del mismo modelo y color, cada una con su stock, su
  código y su etiqueta. El censo cuenta 5 en una fila y 0 en las otras dos, y "qué talla se está
  quedando" mide mal justo la talla que importa.
- **Dos NULL no son iguales en Postgres.** Dos variantes sin color con la misma talla (una
  correa, un gorro) no chocaban nunca.

## Decisión

DECIDÍ: reemplazar la regla por un índice único sobre
`(producto_id, retail.fn_token_talla(talla), color_codigo) nulls not distinct`. La talla se
compara con `fn_token_talla`, la misma función que arma el segmento de talla del código impreso:
"M" y "m " dan `M`; "Única", "U" y vacío dan `U`; "S/M" y "sm" dan `SM`. "Sin color" cuenta como
un color más. Así, dos variantes chocan en la identidad exactamente cuando chocarían en su código.

DESCARTÉ (1): normalizar con `fn_clave_texto`, que fue la primera versión de este mismo ADR.
Iguala mayúsculas y espacios, pero no "Única" con "U" ni "S/M" con "SM". Esas tallas pasaban la
identidad y reventaban después contra `variantes_codigo_unico`, con el error crudo "avisa a
Felipe". Dos reglas para la misma pregunta, con respuestas distintas.

DESCARTÉ (2): una tabla `tallas` con FK, como se hizo con `colores`. Cierra el agujero y además
fija un orden (XS < S < M), pero obliga a migrar todas las variantes, a mantener otro
vocabulario y a decidir antes del censo qué hacer con tallas numéricas de calzado y jeans. El
backlog del 2026-09-09 ya lo dejó fuera a propósito: agregar tallas tarde es barato, porque no
es FK de nada.

SE ROMPE SI: un modelo de calzado necesita las tallas "36.5" y "365" como distintas, o un modelo
necesita "S-M" y "SM" como tallas diferentes: `fn_token_talla` borra todo lo que no es letra o
número y las iguala. En CAYLA no existe hoy, y el código impreso ya las confundía igual. Si
aparece, se corrige `fn_token_talla` (y con ella el código), no la identidad.

## Por qué reemplazar y no convivir

La regla nueva es estrictamente más fuerte que la vieja, y ninguna función usa la vieja en un
`on conflict` (verificado con grep en `supabase/migrations/` y `apps/web`). Dos reglas sobre la
misma idea obligan a traducir dos errores distintos para la misma equivocación.

## La red de códigos que viene en la misma migración

El disparador `variantes_asignar_codigo` (20260912235500) le da código y código de barras a
toda variante nueva. La migración además recorre las variantes **activas** sin código y les
asigna uno. No toca las apagadas: una variante apagada no se vende ni se cuenta, y gastarle el
correlativo haría que la primera blusa real salga BLU-0002. En producción, las 36 variantes sin
código eran todas de productos de prueba, que se archivan antes en el mismo script.

## Cómo se verificó

En local, dentro de transacciones deshechas: variante nueva nace con código y su fila en
`codigos_barras`; "m " rechazada contra "M"; "U" y talla vacía rechazadas contra "Única"; "sm "
sin color rechazada contra "S/M" sin color; "M" y "L" aceptadas; una variante activa a la que se
le quitó el código lo recupera al re-ejecutar el bloque. El script de producción se ejecutó dos
veces seguidas contra local sin errores. Producción: 0 pares en conflicto con esta regla.

## Lo que viaja en el mismo script de producción

Los datos de prueba crearon colores antes del vocabulario cerrado: Arena quedó como `ARE`, que
es también el prefijo de Aretes, y cinco colores quedaron sin familia. El script retira `ARE`,
crea `ARN` (igual que en el repo) y completa las familias, antes de que se imprima la primera
etiqueta real.
