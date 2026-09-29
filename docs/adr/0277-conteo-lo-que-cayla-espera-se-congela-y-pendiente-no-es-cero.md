# ADR-0277 — Conteo: lo que CAYLA espera se ve y se congela al abrir, y «pendiente» no es cero

**Fecha:** 2026-09-29
**Estado:** Construido y probado **solo en local** (rama `Benja-responsive`). Las dos migraciones **no están en producción**: ver «Cómo se despliega».
**Pedido:** Felipe, 2026-09-29, rediseño de Inventario ▸ Conteo («muy fácil de operar, sin capacitación»).
**Reemplaza:** ADR-0174 (conteo a ciegas y «Conviene contar primero»), la parte de ADR-0244 que recontaba a ciegas y decidía «No se encontraron», y ADR-0074 (prioridad por valor). **Conserva:** ADR-0189 (concurrencia: el ajuste es un delta sobre el stock actual) y ADR-0027.
**Relacionados:** ADR-0136 (modales), ADR-0149 (loader), ADR-0162 (responsable), ADR-0169/0220 (paleta y cabecera), ADR-0195 (SQL por partes), ADR-0209 (combos).

## Problema

1. El conteo era **a ciegas** y priorizaba por **plata** («Conviene contar primero», soles en riesgo, costo en el resumen). Quien cuenta en la tienda no necesita plata ni adivinar; necesita saber qué debería haber.
2. **«Pendiente» no existía.** `conteo_items` solo tenía filas de lo ya contado; lo no contado era «ausencia de fila», y la pantalla lo convertía en «No se encontraron» o en un 0 con un clic. Una prenda nunca vista podía terminar como falta.
3. **No había foto al abrir.** Cada lectura reescribía `cantidad_sistema` con el stock vivo, así que el «debe haber» cambiaba solo mientras se contaba.
4. La revisión era un **modal** larguísimo con cuatro decisiones mezcladas (recontar, no está → 0, dejar como está, cerrar).

## Decidí

**D1 — Una sola tabla; pendiente = fila con `cantidad_contada IS NULL`.** Al abrir (`abrir_conteo`) se crea una fila por cada variante con stock > 0 en la sububicación elegida (y solo de la categoría, si el alcance lo es) con `cantidad_foto = cantidad_sistema = stock` y `cantidad_contada = NULL`. **Vacío ≠ 0**: NULL es «todavía no se verificó»; un 0 escrito es «verifiqué y no hay». Se garantiza en la base (columna nullable, el 0 es un valor) y en la web (`cantidadEscrita`: vacío → `null`, nunca 0).

**D2 — El «debe haber» que manda es el stock leído al verificar; la foto es referencia y auditoría; el libro explica.** `conteo_contar` lee el stock de la variante bajo `for share` y guarda `cantidad_sistema` con lo que había en ese instante; la diferencia es `contada − cantidad_sistema`. `cerrar_conteo` aplica esa diferencia como **delta** (`ajuste`/`conteo`) sobre el stock **actual**, nunca «fija el stock = contado». Por eso una venta antes de verificar ya está descontada, y una venta después de verificar se conserva (09:13 abre con 6, 09:20 cuentan 6, 09:24 se vende 1, 09:30 cierra → sin diferencia y el stock queda en 5). La pantalla muestra la foto solo como nota cuando cambió («Al abrir: 11 · salieron 1 durante el conteo»).

**D3 — Estados derivados, no almacenados.** Se guardan solo cuatro datos por línea (`cantidad_foto`, `verificado_en`, `contada_anterior`, `confirmada_en`); el estado sale de ellos con una regla única, escrita en SQL (`fn_conteo_lineas_json`) y en TS (`estadoDeLinea`): pendiente · en reconteo (`contada NULL` y `contada_anterior` con valor) · correcta · con diferencia · diferencia confirmada. Una línea se ignora solo si `contada IS NULL`, la foto es 0 **y** nunca se recontó. «Conteo parcial» y «Cancelado» también se derivan (sin columna).

**D4 — Flujo por pantallas, no por modal:** Inicio → Abrir → Contar → **Revisar** (`/inventario/conteo/[id]/revisar`) → **Confirmar** (`/confirmar`) → cierre → **Resultado** (`/inventario/conteo/[id]`). `cerrar_conteo(p_conteo, p_parcial)` hace cumplir el orden: `conteo_vacio` (nada verificado), `conteo_pendientes` (sin `p_parcial`), `diferencias_sin_confirmar`. Un cierre parcial deja las pendientes sin tocar y sin ajuste. «Volver a contar» y «Confirmar N» son `conteo_recontar` y `conteo_confirmar_diferencia`; una cifra recontada igual a la anterior queda confirmada sola.

**D5 — Sububicación obligatoria en tiendas.** `abrir_conteo` recupera la guarda que se había perdido en `20260916110000`: en una sede con piso y almacén hay que elegir uno de los dos (no cuarentena). El Taller (racks, stock sin sububicación) sigue contando «toda la ubicación».

**Se elimina:** prioridad por valor (`fn_prioridad_conteo`, tarjeta, tabla, `getPrioridadConteo`, `prioridadDesdeFila`), conteo a ciegas (textos, `pendientesSinCifras`, recontar a ciegas), todo costo/PVP/S/ del Conteo (`fn_soles_diferencia_conteo`, `getCostosVariantes` en Conteo, soles del historial y del detalle, campos Costo/Precio del alta al vuelo), «No se encontraron»/«No está → 0»/«Dejar como está», las marcas locales `a-mano`/`recontar`, «Imprimir etiquetas» y «Lo que sigue» del detalle, y `previsualizar_cierre_conteo`. `fn_costos_variantes_json` **no** se toca (la usan Compras, Catálogo y Productos).

## Descarté

- **Tabla aparte `conteo_esperado` para la foto**, porque toca ≥8 archivos de purga/clasificación (`eliminar_producto*`, `restaurar-purga`, aviario) sin aportar. **Pero** la alternativa elegida obliga a corregir todo lector que cuente filas: `fn_conteos_resumen` (Análisis), la guarda de conteo vacío y los lectores de Movimientos; quedaron cubiertos por `pruebas:conteo-rediseno`.
- **Reconciliar con una ventana `created_at > foto_en`** como cifra autoritativa: `created_at` es `now()` = **inicio** de la transacción, no el orden de confirmación; una venta en vuelo (empieza antes de la foto, confirma después) produce un falso faltante de 1 (probado con dos sesiones) y en Finanzas una falsa merma (`fn_es_merma` → cuenta 659). `stock` es Σ movimientos (0 descuadres en las filas locales); leerlo bajo candado al verificar es exacto.
- **Un `estado` nuevo en `conteos`** (revisión/parcial): Análisis (`=== "cerrado"`), Inicio (`estado = 'abierto'`) y el índice único parcial lo ignorarían en silencio.
- **Columna `estado_linea` y booleano `en_reconteo`:** permiten estados imposibles y `restaurar-purga.sql` reinserta respaldos viejos con columnas ausentes (NULL).
- **Pedir motivo por cada diferencia:** el usuario pidió que «confirmar 9» baste.

## Se rompe si

- Alguien cambia el cierre a `contado − stock_actual` o a «fijar stock = contado» (resucita ventas posteriores o duplica ajustes).
- Una función escribe `stock` sin `fn_aplicar_movimiento` (foto y libro dejan de cuadrar).
- Un lector nuevo de `conteo_items` cuenta filas sin mirar `cantidad_contada IS NOT NULL` (exactitud de Análisis inflada).
- El ajuste deja el stock por debajo de lo apartado o negativo: `fn_aplicar_movimiento` aborta el **cierre entero** (todo o nada). La pantalla de Confirmar avisa antes cuando ya se sabe que va a pasar (por stock negativo; lo apartado no lo trae `fn_conteo_detalle`).
- Dos personas cuentan la misma variante a la vez: gana el último total (la base guarda el total, no una suma; sigue en el BACKLOG).
- Producción tiene conteos abiertos anteriores al rediseño (`cantidad_foto` NULL): siguen funcionando, pero sin lista de pendientes; conviene cerrarlos o anularlos antes de pegar.

## Cómo se despliega (importante: web y SQL van juntos)

Las migraciones **eliminan** funciones que la web vieja llama (`previsualizar_cierre_conteo`, `fn_prioridad_conteo`), quitan la columna `soles_diferencia` de `fn_conteos_resumen` y `conteo_contar` pasa de devolver `uuid` a `jsonb`. Pegarlas antes de publicar la web nueva rompe Conteo y el resumen de Análisis; publicar la web antes de pegarlas también. **Orden:** web nueva lista para publicar → `20260929170000_conteo_rediseno_columnas.sql` → `20260929170100_conteo_rediseno_funciones.sql` (idempotentes, sin políticas ni `drop trigger`, con `lock_timeout` de 3 s) → publicar. Antes de pegar: `pnpm migraciones:deriva` y comparar los cuerpos de `abrir_conteo`, `conteo_contar`, `cerrar_conteo` y `fn_conteos_resumen` con producción (se recrean enteros: un parche vivo que solo exista allá se perdería). Re-pegar `20260923120000` sobre la base nueva ya no es un no-op: aborta (42883, busca `cerrar_conteo(uuid)`) sin tocar nada; `20260924120000` sí sigue siendo un no-op.

## Números (local, 1.200 variantes sintéticas, con ROLLBACK)

`abrir_conteo` con la foto: 38 ms. `fn_conteo_detalle`: 23 ms y 313 KB de jsonb en **un solo renglón** (PostgREST corta en 1.000 filas; un renglón jsonb no). `conteo_contar`: ≈ 0,7 ms. Volumen esperado: ~1.100 filas por conteo de «todo» × 3 sedes × ~8 conteos al mes ≈ 26 mil filas al mes y ~1 millón en 3 años; por eso `conteo_items_variante_idx` (con 990 mil filas la comprobación de la FK de una variante bajó de 92 ms a 0,19 ms y `fn_producto_historia` de 161 ms a 3,7 ms). En la pantalla: 800+ filas sin lag (las filas se suscriben una por una a un almacén fuera de React; las perchas entran por tandas).

## Verificación

`pnpm pruebas:conteo-rediseno` (nueva, con controles que muerden por mutación) y `pnpm pruebas:conteo-vacio` (actualizada a propósito), más las pruebas SQL que citan conteo y las estructurales de la web; el caso de la venta entre contar y cerrar se probó con dos sesiones con COMMIT. En pantalla (localhost:3020, base local) se recorrieron los casos A–P del pedido.

## Límites reales que quedan

- **Un solo conteo abierto por sede** (índice `conteos_un_abierto_por_ubicacion`): no se puede contar piso y almacén a la vez. No se pidió cambiarlo.
- **El Taller** no separa piso y almacén: cuenta «toda la ubicación».
- **`fn_conteos_resumen` no filtra `es_prueba`:** un conteo archivado como prueba sigue saliendo en «Conteos recientes» y en «Último conteo» (ya era así).
- **Un cierre parcial refresca «Último conteo»** de Análisis (sus líneas verificadas sí cuentan como verificaciones reales; `exactitudConteos` no distingue parcial).
- **Rojo para «Hay N de más»** (decisión del usuario, igual que «Faltan N»): con inventario cargado a mano una primera cuenta puede traer más de la mitad de diferencias y una lista casi toda roja deja de avisar. La salida, si pasa, es una línea en `etiquetaDeLinea` (ámbar o tinta para el sobrante). Traslados y Recibir pintan el sobrante en ámbar: hoy conviven dos convenciones.
- **Traslados sigue a ciegas** (ADR-0239): dos pantallas de conteo con reglas opuestas.
- `getHistorial` trae 20 conteos: si un lugar lleva más de 20 sin contarse, «Último conteo» dice «Sin conteo reciente».
