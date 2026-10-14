# ADR-0410 · Un corte de red no dice si se guardó: la frase de siempre deja de prometer «No se guardó nada»

- **Fecha:** 2026-10-14 · **Estado:** aprobado por Felipe el 2026-10-14 («aplica la frase honesta a todas las escrituras»), mirando el
  inventario y la alternativa de limitarlo a las pantallas con token. Verificado en local en la rama `claude/happy-euler-dda937`. Solo web:
  sin migración, sin RPC, sin reglas de negocio.
- **Pedido:** el `/chaos` de Producción (ADR-0409) lo dejó como tarea aparte: «Cambiarlo toca todos los módulos: va como tarea aparte,
  para que Felipe lo decida».
- **Extiende:** ADR-0409. **Generaliza** lo que diez módulos ya habían decidido cada uno por su cuenta (abajo).

## El problema

`TypeError: Failed to fetch` —y `NetworkError`, `Load failed`, `fetch failed`, `aborted`— dice que **la respuesta no llegó**, no que la
petición no salió. Si la conexión se cae después de que Postgres confirmó la transacción, el navegador lo cuenta exactamente igual que
si nunca hubiera habido internet. `traducirError` (`apps/web/lib/error-escritura.ts`) respondía por defecto:

> No se pudo ingresar el insumo: la conexión falló antes de llegar al servidor. No se guardó nada — revisa el internet y vuelve a intentar.

Es una certeza falsa, y empuja a repetir. Reproducido el 2026-10-14 en Producción ▸ Insumos ▸ Ingresar insumo: el lote se guardó y la
pantalla dijo «No se guardó nada».

La frase honesta ya existía, pero había que pedirla (`confirmarAntesDeRepetir`): 14 llamadas lo hacían, casi todas de dinero. Y diez
módulos ya habían escrito su propio «no sé» después de chocar con lo mismo: la bajada al piso (`lib/bajada-reglas.ts`), «Bajar en mano»,
«Retirar del piso», las dañadas, el cuadre del piso, el cierre del conteo (`lib/conteo-revision.ts`), las órdenes de compra y sus envíos,
la recepción de un envío, la orden de insumos, el modelo nuevo de Producción, las decisiones de Frescura y «liquidar» de Análisis. Cada
`/chaos` o `/formidable` lo arreglaba una pantalla a la vez: el defecto estaba en el valor por defecto (principio 12).

## Inventario (2026-10-14, sobre `main` `dfb6d89`)

249 llamadas a `traducirError` en 151 archivos (sin contar pruebas):

| Grupo | Llamadas | Qué cambia |
|---|---|---|
| **Lecturas**: cargar, buscar, leer, revisar antes de borrar, exportar, preparar una propuesta | 19 | Piden `{ lectura: true }`: «No se pudo X: se cortó la conexión. Revisa el internet y vuelve a intentar.» |
| Escrituras que ya pedían la frase honesta (`confirmarAntesDeRepetir`) | 14 | Nada |
| Escrituras que deciden el corte ANTES del traductor (la cola sin conexión de Vender, las marcas de la bajada, el retiro, las dañadas y el cuadre, órdenes de compra, recepción, conteo, Frescura, Análisis) | ~44 | Nada: el traductor no ve el corte |
| Escrituras que llegaban al traductor con la frase vieja | hasta 172 (114 en archivos sin token, 58 con token) | Pasan a la frase honesta |

**Toda escritura puede confirmarse antes de que la respuesta se pierda**: una RPC, un `insert`/`update`/`delete`, una foto que se sube, una
ruta de `/api` que escribe. No hay una sola donde «no se guardó nada» sea cierto después de un corte. Entre las 172 hay dinero que hasta hoy
decía «No se guardó nada — vuelve a intentar»: el abono de un apartado, el movimiento y el ingreso de caja, el gasto rápido, anular un gasto.

## La decisión

1. **La frase por defecto de un corte en una escritura es la honesta**, la misma que ya leían las pantallas de dinero:

   > Se cortó la conexión mientras se intentaba X: no podemos confirmar si llegó a guardarse. Antes de volver a intentarlo, revisa si ya
   > aparece registrado.

2. **Las lecturas lo declaran** con `{ lectura: true }` y dicen solo que se cortó la conexión: ahí no hay nada que pudo guardarse.
3. **`confirmarAntesDeRepetir` sigue aceptada y ya no cambia nada.** El PR #1087 (Producción, ADR-0409) suma cuatro llamadas y una prueba
   que la exige (`lib/produccion-corte-de-red.test.ts`); se borra de las 18 llamadas cuando ese PR esté en `main`.
4. **No cambia** lo que la base rechazó antes de ejecutar: «Tu sesión se cerró… No se guardó nada» (`permission denied for function`) y
   «Tu sesión venció… no se guardó nada» (`JWT expired`) siguen diciéndolo, porque ahí es cierto.

### Lo que se descartó

- **Solo las pantallas que mandan `p_token`.** Es al revés del riesgo: con token, reenviar lo mismo con la misma marca es seguro (la base
  devuelve lo ya guardado); sin token —114 de las 172— repetir duplica. Lo primero que hay que proteger es lo que no tiene token.
- **Adivinar la lectura por el verbo del contexto** («cargar…», «leer…»): «cargar la cotización» y «cargar el stock de las variantes nuevas»
  son escrituras. La lectura se declara donde se sabe.
- **Distinguir «no salió» de «salió y se perdió»** (`navigator.onLine`, el tiempo que tardó el error): ninguna señal del navegador lo separa
  con certeza, y una adivinanza que se equivoca vuelve a mentir.

### Por qué el error en esta dirección es el bueno

Si la frase nueva se equivoca (una escritura que en verdad no salió), cuesta un vistazo a la lista. Cuando la vieja se equivocaba, costaba un
lote, un pago o un movimiento de caja duplicados, que después alguien tiene que encontrar y deshacer a mano.

## Lo que queda abierto

- **La lista de atrás no se refresca tras el corte.** Visto en la verificación: el lote ya estaba en la base y Insumos seguía mostrando
  «0 lotes», así que «revisa si ya aparece registrado» miraba una foto vieja. En Ingresar insumo la marca vive mientras la hoja está abierta
  (reintentar desde ahí es seguro desde ADR-0409); cerrar la hoja y abrirla de nuevo crea otra marca. Propuesta: refrescar los datos de la
  pantalla (`router.refresh()`, que no cierra la hoja) cuando una escritura termina sin respuesta, en un solo lugar y no pantalla por
  pantalla. Va como trabajo aparte.
- **Borrar `confirmarAntesDeRepetir`** de las 18 llamadas cuando #1087 esté en `main`, y reemplazar su prueba de guardia por las de
  `lib/error-escritura.test.ts`.

## Cómo se verificó

- `pnpm --filter web test` (492 archivos, 159.509 pruebas), `tsc --noEmit`, `eslint` de los archivos tocados y `pnpm knip`, en verde.
- En el navegador, sobre esta rama (sin #1087, o sea **sin** que Ingresar insumo pida la opción), con `window.fetch` parchado para lanzar
  `TypeError: Failed to fetch` **después** de la petición real a `/rpc/recibir_insumo`: la base respondió 200 y guardó el lote; la pantalla
  dijo «Se cortó la conexión mientras se intentaba ingresar el insumo: no podemos confirmar si llegó a guardarse…». Con `/rpc/fn_mi_perfil`
  cortado, Mi perfil dijo «No se pudo cargar tu perfil: se cortó la conexión. Revisa el internet y vuelve a intentar.»
- La base local se fotografió antes (`scripts/flujo-de-negocio/estado.mjs`) y se restauró después: idéntica a la foto.
