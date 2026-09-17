# ADR-0027 — El censo es el primer conteo, y el cierre es la aprobación

**Fecha:** 2026-09-09
**Estado:** aplicado y verificado en local (`supabase/migrations/0048_conteos.sql`);
pendiente de pegar en producción (`supabase/unificacion/30_conteos.sql`, después
de la 26, 27, 28 y 29)

## Contexto

CAYLA tiene entre 300 y 900 prendas en el piso de TRU, AQP y LIM y casi ninguna
en el sistema. El plan de captura gradual de julio llevaba dos meses sin moverse,
por una razón estructural: **mientras el catálogo esté a medias, el sistema nunca
es verdad.** Si el 40% está cargado, "stock dice 0" es ambiguo — ¿se agotó, o
nunca se capturó? Cada alerta de reposición y cada clase ABC es ruido; nadie
confía, nadie usa, nadie llena.

Hacía falta un censo de una vez. Y hacía falta que ese censo no fuera una
herramienta desechable.

## Decisión

**Un conteo que puede crear prendas al vuelo es un censo. Un censo sobre un
catálogo ya cargado es un conteo. Son la misma operación.**

Eso es lo que evita el código de "carga inicial" que se usa una vez y se
abandona: la misma pantalla que trae las 900 prendas es la que mantiene el
inventario honesto para siempre. `conteos` + `conteo_lineas` + siete RPC.

### Sesión, y no aplicar al instante

Aplicar cada línea en el momento habría sido **más simple y también correcto**.
Se eligió la sesión por una razón de negocio, no técnica: Felipe pidió aprobar
antes de que entre nada. Las Encargadas cuentan; hasta que él no cierra, el
`stock` no se mueve.

**El cierre ES la aprobación.** Por eso `cerrar_conteo` y `anular_conteo` son
solo de Líder, mientras `abrir_conteo`, `conteo_contar` y `conteo_crear_variante`
solo piden `fn_puede_operar_sede`.

Precio: dos tablas y un estado que alguien puede dejar abierto. Se mitiga con
`conteos_un_abierto_por_sede`.

### `cantidad_sistema` se congela al contar, no al cerrar

La decisión más fina del diseño, y la que más fácil se habría hecho mal.

Sistema dice 10. A las 15:00 la Encargada cuenta y hay 8. A las 15:30 se vende 1
→ sistema 9. A las 16:00 el Líder cierra.

| | delta | stock final | ¿correcto? |
|---|---|---|---|
| Congelado al contar | 8 − **10** = −2 | 9 − 2 = **7** | sí (contó 8, se vendió 1) |
| Leído al cerrar | 8 − **9** = −1 | 9 − 1 = 8 | no — **la venta desaparece** |

Un conteo es una afirmación sobre un **instante**, no sobre el presente. Un delta
compone con lo que pasó después; un absoluto lo pisa. Por eso
`conteo_lineas.cantidad_sistema` guarda lo que el sistema decía cuando la prenda
se contó, y el `do update` de un re-conteo **no lo toca**.

Verificado en local reproduciendo el escenario completo: resultado 7.

### `ajuste` con signo, no un `tipo='conteo'` nuevo

Un tipo nuevo habría sido más expresivo en el historial. Se descartó por dos
razones, la primera decisiva:

1. **`recalcular_stock` conoce entrada/salida/ajuste/traslado y nada más.** Un
   `tipo='conteo'` quedaría excluido **en silencio**, y el día que alguien corra
   la red de seguridad para arreglar otra cosa, el censo entero se borraría. Es
   la peor clase de bug: latente, y estalla meses después cuando nadie recuerda
   por qué.
2. Cero cambios al núcleo: no se toca el CHECK de `movimientos.tipo`, ni
   `registrar_movimiento`, ni `TIPOS_MOVIMIENTO` en `packages/shared`, ni la
   lista de movimientos del frontend (principios 1 y 3).

Esto solo es posible gracias a ADR-0023: antes de esa migración un ajuste
negativo era imposible.

### El alcance es descriptivo, no restrictivo

`conteos.alcance` no limita qué variantes se pueden contar. Si alguien encuentra
un jean mientras cuenta blusas, tiene que poder registrarlo — bloquearlo
garantiza que ese jean nunca entre al sistema. El alcance alimenta la hoja de
trabajo de la pantalla y define el universo de `poner_en_cero`. Una ruta menos de
enforcement y una forma menos de frenar a alguien con una prenda en la mano
(principio 10).

### `sumar` es el modo por defecto

Con la pistola, cada disparo es **una prenda que acabas de levantar de la pila**.
Si el modo fuera absoluto, el segundo escaneo de la segunda blusa idéntica
pisaría al primero y el conteo siempre daría 1. `fijar` existe para teclear un
número corregido.

## Consecuencias

- **El permiso que hace posible el censo.** `conteo_crear_variante` acepta a
  cualquiera que pueda operar su sede, mientras `crear_producto_con_variantes`
  (0035) sigue rechazando a quien no es Líder. Verificado en local con una
  Encargada real (`rol='integrante'`): abre el conteo, crea la prenda adoptando
  su código de fábrica, y al intentar cerrar recibe *"Solo un líder puede cerrar
  un conteo — es la aprobación de lo contado"*. El stock quedó en 0 hasta que
  Felipe cerró.
- Cerrar dos veces es idempotente: devuelve el resumen guardado sin duplicar
  movimientos. Dos cierres concurrentes se serializan en el `for update`; el
  segundo ve `'cerrado'` y no emite nada. Sin tabla de idempotency-keys.
- `previsualizar_cierre_conteo` es lo que hace que cerrar no dé miedo: se ve
  exactamente qué va a pasar antes de que pase.
- `tratar_no_contado='poner_en_cero'` existe pero **no se usa en el censo
  inicial**: es la única pieza que puede destruir datos en masa, y con `stock`
  casi vacío no hay nada que poner en cero. Queda detrás de Líder + previsualización
  obligatoria, para el día que un conteo de control sí necesite cerrar el círculo.
- **Un error propio, anotado porque enseña algo:** la primera corrida de pruebas
  dio "FALLA — la venta se perdió". El código estaba bien; la **aserción** estaba
  mal (había contado 3 sobre 10 y esperaba el resultado de contar 8 sobre 10). Una
  prueba que falla no prueba que el código esté mal, solo que la prueba y el
  código discrepan — y averiguar cuál de los dos miente es parte del trabajo, no
  un trámite.

## Lo que falta para que esto sirva

Las RPC están; las pantallas no. Falta la captura por matriz (talla × color), la
pantalla de conteo con la pistola, el resumen de varianza y las etiquetas en lote.
Hasta entonces el censo existe en la base pero no en las manos del equipo.
