# ADR-0640 — Dañadas: corregir lo reportado por error sin «Ajustar stock», y «Se arregló» a la vista

- **Fecha:** 2026-11-10 · **Estado:** construido y probado en local; **las dos migraciones están en producción desde el 2026-11-10** (pegadas con el OK de Felipe; ver «Lo que pasó al pegar»).
- **Rama:** `claude/damaged-items-stock-visibility-b62e57`. Números reservados con `pnpm reservar`.
- **Relacionados:** ADR-0071 (cuarentena), ADR-0328 act. 10 (`reportar_danada` y «Se arregló»), ADR-0564 (dañadas en tienda), ADR-0534 (quien ve
  Existencias resuelve), ADR-0391 (panel de la talla), ADR-0389 (guías).

## El problema

El 2026-11-10 en Tienda Trujillo se reportó dañado un Vestido Campanita Celeste **talla 28** cuando la manchada era la **30**. La consulta de
solo lectura a producción mostró lo que pasó después:

| Hora | Qué se hizo | Lo que el sistema creía |
|---|---|---|
| 07-nov 15:06 | Llegan 1×28 y 1×30 (ENV-000007) | 28 almacén 1 · 30 almacén 1 |
| 10-nov 10:54 | Reportan dañada **la 28** | 28 almacén 0 · 28 dañada 1 · 30 almacén 1 |
| 10:56 | «Ajustar stock»: 28 +1, 30 −1 | 28 almacén 1 · 28 dañada 1 · 30 almacén 0 |
| 11:02 | «Ajustar stock»: 30 +1 | 28 almacén 1 · 28 dañada 1 · **30 almacén 1** |
| 11:43 | Cuelgan la 28 | 28 piso 1 · 28 dañada 1 · 30 almacén 1 |

Tres prendas en el sistema, dos en la tienda: una 28 en la cuarentena que no existe y la 30 manchada contada como vendible. No hubo un error
de código: **no había cómo corregir una dañada**, y la única herramienta a mano (el ajuste) no sabe que existe la cuarentena. Además la ficha
no decía de qué talla era la dañada (la casilla «1 dañada» no tenía lugar y la cuadrícula no la marcaba), así que el error no se veía.

## Lo que se decidió (Felipe, 2026-11-10)

1. **«Me equivoqué de prenda»** en cada dañada reportada en la tienda: se elige la talla o el color correcto y, en un solo paso, la
   equivocada vuelve a donde estaba y la correcta pasa a dañadas. Sin ajustes.
2. **«No estaba dañada»**: vuelve a su lugar sin anotarse como arreglo ni pérdida. **La marca cualquiera que vea Existencias, siempre**
   (Felipe eligió «Cualquiera, siempre» sobre «el mismo día» y «solo el líder»).
3. **La dañada se ve en su talla** en la ficha de la prenda.
4. **«Se arregló» más notable y accesible.**

## Lo que se construyó

- `20261110172000_danadas_corregir_la_prenda.sql`: columnas `corregida_de_variante_id`, `corregida_en`, `corregida_por` (juntas o ninguna)
  y `corregir_prenda_danada(p_id, p_variante_id, p_desde, p_token)`. Dos `mover_interno` en una transacción, con la fila y el stock de las
  dos prendas tomados; mira lo libre de la correcta; solo otra talla o color del MISMO modelo; marca con huella.
- `20261110173000_danadas_no_estaba_danada.sql`: estado `no_estaba_danada` y `devolver_danada_sin_dano(p_id, p_nota, p_token)`. No si ya
  salió a arreglar (estaba dañada).
- Las dos solo aceptan lo **reportado en la tienda**: su movimiento de entrada es un traslado del piso o del almacén de la sede a su
  cuarentena. Lo que llegó de una devolución, un cambio o una recepción no salió de ningún piso al que volver (`danada_no_se_corrige`).
- Web: `lib/danadas-correccion.ts` (con su prueba); la lista de Dañadas lee de dónde salió cada una (`desde`) y si se corrigió; en cada fila,
  la talla y el color en grande, «Se arregló» primero y en negro, lo que pierde la prenda bajo «Si no tiene arreglo», y «¿Te equivocaste al
  reportarla? Me equivoqué de prenda · No estaba dañada». En «Todas», la celda de una talla cuya única prenda está dañada dice «Dañada» (antes
  «Se acabó») y la casilla dice «dañada · talla 28» y abre la lista. En «Qué hago» de la talla, «Volvió arreglada» abre su «Se arregló».

## Por qué así

- **Traslados internos, no ajustes.** Un ajuste dice «conté otra cifra» y cuenta pérdida o hallazgo. Aquí nada se perdió: una prenda estaba
  en el lugar equivocado. `fn_es_perdida` no cuenta un traslado (lo prueba `pruebas:danadas-corregir`).
- **Se modifica la fila, no se cierra y se abre otra.** La dañada es una prenda física con su daño, foto, lugar y arreglo en curso; lo único
  mal era su código. Dos filas contarían dos dañadas.
- **`no_estaba_danada` como estado propio y no `se_arreglo`.** «Se arregló» exige decir qué se le hizo y alimenta la cuenta de arreglos;
  anotar ahí lo que nunca estuvo dañado ensucia esa cuenta.

## Descartado

- **Corregir a otro modelo**: no es un error de talla, es otra prenda. Para eso, «No estaba dañada» y reportar la correcta.
- **Un candado de tiempo para «No estaba dañada»**: Felipe eligió «siempre».
- **Bloquear «Ajustar stock» sobre una talla con dañadas**: el ajuste sigue siendo legítimo para un conteo; lo que faltaba era la
  herramienta correcta a la vista.

## Lo que no se puede pasar por alto

- **La lectura de Dañadas desambigua su enlace a `variantes`** (`variantes!prendas_danadas_variante_id_fkey`): la fila tiene ahora dos
  llaves a `variantes`. Sin eso, PostgREST rechazaría la lectura en cuanto la migración esté en la base.
- **El caso de Trujillo en producción no se arregla solo** con esta rama: la 28 «fantasma» en la cuarentena y la 30 vendible siguen ahí.
  Con la web publicada: «Me equivoqué de prenda» sobre la dañada (28 → 30, desde el almacén) y un «Ajustar stock» que deje la 28 del
  almacén en 0 (la que creó el ajuste de las 10:56). Lo hace la tienda, con el OK de Felipe.

## Lo que pasó al pegar (2026-11-10)

Se pegaron antes de publicar la web, como dice la regla general, y **Existencias se cayó en producción**: la columna `corregida_de_variante_id`
es una segunda llave de `prendas_danadas` hacia `variantes`, y la web publicada leía `variante:variantes(...)` sin decir cuál; PostgREST
rechaza ese enlace ambiguo y `getPrendasDanadasPendientes` lanza. Felipe eligió fusionar esta rama (que nombra el enlace) en vez de quitar
la llave. **Regla que queda:** una migración que agrega una segunda llave hacia una tabla que la web ya enlaza desde la misma tabla se
pega DESPUÉS de publicar la web que nombra el enlace (casilla «El SQL se pega después de fusionar»).

## Cómo se pega en producción

En el SQL Editor, cada archivo por separado y en orden, **antes** de publicar la web: `20261110172000`, después `20261110173000`. Ninguno
crea políticas ni quita disparadores (ADR-0195). Si la web sale primero, la lista sigue en pie; solo los dos botones nuevos fallan al usarse.

## Se rompe si

- alguien vuelve a pegar `20261005140000` (recrea el CHECK de estados sin `no_estaba_danada`);
- `reportar_danada` deja de entrar a la cuarentena con un traslado (las dos funciones dejarían de reconocer lo reportado en la tienda);
- `resolver_prenda_danada` acepta `no_estaba_danada` (escribiría una salida que nadie decidió si es pérdida; lo vigila `perdidas.mjs`).
