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
`(producto_id, retail.fn_clave_texto(talla), color_codigo) nulls not distinct`. La talla se
compara con la misma clave que ya normaliza colores y categorías (sin mayúsculas, sin acentos,
sin espacios sobrantes), y "sin talla" / "sin color" cuentan como un valor más.

DESCARTÉ: una tabla `tallas` con FK, como se hizo con `colores`. Cierra el agujero y además
fija un orden (XS < S < M), pero obliga a migrar todas las variantes, a mantener otro
vocabulario y a decidir antes del censo qué hacer con tallas numéricas de calzado y jeans. El
backlog del 2026-09-09 ya lo dejó fuera a propósito: agregar tallas tarde es barato, porque no
es FK de nada.

SE ROMPE SI: una prenda real necesita dos variantes que solo difieren en mayúsculas o espacios
de la talla (no existe en CAYLA), o si alguien importa "talla única" y "U" como tallas distintas
del mismo modelo: `fn_clave_texto` no las iguala (`fn_token_talla` sí, pero solo para el código).
En ese caso la base acepta las dos y el duplicado vuelve.

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

En local, dentro de una transacción deshecha: variante nueva nace con `GEN-0003-AZM-M` y su fila
en `codigos_barras`; "m " rechazada contra "M"; dos variantes sin color con talla "U"/"u"
rechazadas; talla "L" aceptada; una variante activa a la que se le quitó el código lo recupera
al re-ejecutar el bloque. El script de producción se ejecutó dos veces seguidas contra local sin
errores.
