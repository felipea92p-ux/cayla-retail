# ADR-0282 — Conteo: lo que CAYLA espera se ve y se congela al abrir, y «pendiente» no es cero

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

Las migraciones **eliminan** funciones que la web vieja llama (`previsualizar_cierre_conteo`, `fn_prioridad_conteo`), quitan la columna `soles_diferencia` de `fn_conteos_resumen` y `conteo_contar` pasa de devolver `uuid` a `jsonb`. Pegarlas antes de publicar la web nueva rompe Conteo y el resumen de Análisis; publicar la web antes de pegarlas también. **Orden:** web nueva lista para publicar → `20260930010000_conteo_rediseno_columnas.sql` → `20260930010100_conteo_rediseno_funciones.sql` (idempotentes, sin políticas ni `drop trigger`, con `lock_timeout` de 3 s) → publicar. Antes de pegar: `pnpm migraciones:deriva` y comparar los cuerpos de `abrir_conteo`, `conteo_contar`, `cerrar_conteo` y `fn_conteos_resumen` con producción (se recrean enteros: un parche vivo que solo exista allá se perdería). Re-pegar `20260923120000` sobre la base nueva ya no es un no-op: aborta (42883, busca `cerrar_conteo(uuid)`) sin tocar nada; `20260924120000` sí sigue siendo un no-op.

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

## Actualización 2026-09-29 (b): Contar en tarjetas y «Completar todo»

La lista de Contar es una tarjeta por producto y color (columnas independientes, sin filas de igual alto), con «Completar todo» por tarjeta: cuenta con `debe_haber` solo las tallas que siguen con `contada IS NULL`; una talla con número (incluido un 0) no se toca. Es un atajo de la web, no una regla nueva de la base: cada talla sube por el mismo `conteo_contar` de siempre, así que el modelo, el «debe haber» congelado y el cierre no cambian. Se descartó una acción de servidor «completar producto»: sería otra puerta que escribe conteos y habría que blindarla igual. Se rompe si una persona pulsa «Completar todo» sin haber mirado la percha: es responsabilidad de quien cuenta, igual que teclear el número.

## Actualización 2026-09-29 (c): editar un conteo cerrado

`reabrir_conteo(id)` devuelve un conteo cerrado (modelo nuevo, con `foto_en`, solo líder) a «abierto» con sus mismas líneas; se edita con Contar → Revisar → Confirmar y se cierra con `cerrar_conteo`, que no cambió. **Nada se deshace:** el segundo cierre ajusta solo las líneas que se volvieron a contar, como delta sobre el stock de ese momento (`conteo_contar` suelta `diferencia` al re-verificar una línea ya ajustada; `cerrar_conteo` solo ajusta `diferencia is null`). Se descartó deshacer con movimientos inversos (duplicaría el asiento de merma y un sobrante ya vendido dejaría stock negativo). Se rompe si ya hay otro conteo abierto en la sede (`ya_hay_abierto`; un abierto por sede) o si una variante ya ajustada queda pendiente (su ajuste anterior se conserva). Migración `20260930020100`; botón `EditarConteo` en el resultado.

## Actualización 2026-09-29 (d): «Volver a contar» directo a Contar

«Volver a contar» de una fila de Revisar manda a recontar (`conteo_recontar`) y navega a `/inventario/conteo/<id>?variantes=<id>` (el filtro de «Contar esta prenda», ADR-0241); el botón del pie manda a las pendientes (hasta 40 ids, 37 caracteres cada una: pasado el tope va a la lista completa). En Contar acotado el cursor cae en la primera cifra. Una variante en reconteo muestra en el campo la cifra de antes (`contada_anterior`) como borrador seleccionado: Enter la acepta, escribir otra la reemplaza, salir sin tocar no guarda. Se descartó dejar el campo vacío (más lento y contrario a corregir «lo que puse») y guardar el borrador al salir (una omisión no es una decisión). Solo web; ninguna función de la base cambió. Se rompe si el reconteo se acepta con Enter sin mirar la prenda (regla de hoy: misma cifra → diferencia confirmada sola) o si algún día `staleTimes.dynamic` deja de ser 30 s y se quita el guardia de frescura de Revisar sin necesidad.

## Actualización 2026-09-29 (e): «Abrir un conteo» dice de qué tamaño es antes de abrir

La tarjeta de abrir pasa a dos columnas: las tres preguntas (dónde, qué, quién) y «Tu conteo» con la cifra, un resumen y el botón (maqueta `docs/maquetas/conteo-abrir-2026-09/`). La cifra es de **variantes**, nunca de unidades: decir cuántas prendas espera el sistema le regala la meta a quien cuenta y rompe el conteo a ciegas; contar variantes es el mismo «X de N variantes verificadas» que ya muestra Contar. Sale de `fn_conteo_alcance(ubicación)`, una función de solo lectura que devuelve variantes por lugar y categoría con la MISMA regla que la foto de `abrir_conteo` (stock > 0, sin la pieza del sistema, categoría del conteo); `scripts/pruebas/conteo_rediseno.mjs` compara ambas fila por fila y trae dos controles de mutación. Migración `20260930040000` (solo lectura, sin políticas: pegar como una sola parte).

**Descarté** calcular la cifra en la web leyendo `stock` (PostgREST corta en 1.000 filas sin error: una sede con más variantes daría una cifra falsa) y **refactorizar `abrir_conteo`** para que comparta el cálculo (la función lleva parches vivos en producción; reescribirla por una cifra de apoyo es más riesgo que la duplicación de una condición, que la prueba de paridad vigila). **Se degrada así:** si la función no existe todavía en la base (la web salió antes que el SQL) o falla, la tarjeta se dibuja igual, sin cifras, y abrir un conteo sigue funcionando: por eso, a diferencia del resto del rediseño, esta pieza NO exige que web y SQL vayan juntos. **Se rompe si** alguien cambia la regla de la foto en `abrir_conteo` sin tocar `fn_conteo_alcance`: la prueba de paridad lo detecta en el CI, no en el mostrador.

Las categorías pasan a píldoras con buscador (con la cifra de cada una, las que tienen prendas primero) en vez del combo: es una excepción a ADR-0209 a propósito, porque elegir la categoría es la decisión de esta tarjeta. La guía de foco (ADR-0284) es la estándar de los modales (`useGuiaCampos` con `{ enModal: false }`, `CampoGuiado`, `PieGuia`), con su lógica en `lib/conteo-inicio-guia.ts` comprobada contra lo que `abrir_conteo` rechaza (32 combinaciones).

## Actualización 2026-09-30: al editar un conteo cerrado, la nota explica lo que el propio cierre ajustó

**Problema.** Conteo 13: la camisa tenía 1, no se encontró, se contó 0 y el cierre restó 1 (stock 0). Después la encuentran, se pulsa «Editar conteo» y se cuenta 1: la fila decía «Debe haber 0 · Contaste 1 · Hay 1 de más» y debajo «Al abrir: 1 · salió 1 durante el conteo». Falso: nadie la vendió; la sacó el ajuste del propio cierre. La foto (1) y el «debe haber» (0) difieren porque `conteo_contar` relee el stock vivo (D2) y el stock ya trae el ajuste, pero la nota atribuía toda la diferencia a «otros».

**Decidí** que la línea traiga dos números salidos del libro (`fn_conteo_lineas_json`, migración `20260930050100`): `ajustado_total` (lo que los cierres de este conteo le sumaron o restaron a la variante) y `ajustado_antes` (la parte que ya está dentro del «debe haber» actual: todo salvo el ajuste del último cierre si la línea no se volvió a verificar). La nota parte el cambio en dos: «salió/entró N durante el conteo» = `debe_haber − foto − ajustado_antes` (lo de otros) y «el cierre de este conteo restó/sumó N» = `ajustado_antes` (lo nuestro). Ejemplos: `Al abrir: 1 · el cierre de este conteo restó 1`; con una venta de por medio, `Al abrir: 5 · salió 1 durante el conteo · el cierre de este conteo restó 1`. `contarLinea` (lo que se pinta antes de que conteste la base) pasa `ajustadoAntes := ajustadoTotal` al verificar, para que la nota correcta salga de inmediato y no aparezca un instante la falsa. `ajustado_antes` se decide con `diferencia` y `movimiento_id` (que `cerrar_conteo` escribe juntos y `conteo_contar` suelta), no con relojes.

**Descarté** (a) solo cambiar el texto en la web: sin saber cuánto ajustó el cierre, con una venta de por medio se repartirían mal las unidades; (b) comparar `movimientos.created_at` con `verificado_en`: `created_at` es el inicio de la transacción del cierre y un cierre que espera el candado de un `conteo_contar` en curso queda con hora anterior a esa verificación aunque su ajuste sea posterior; (c) una columna nueva en `conteo_items`: un dato derivado más que mantener igual en dos funciones.

**Se rompe si** `conteo_contar` deja de soltar `diferencia` al re-verificar, o `cerrar_conteo` deja de escribir `diferencia` y `movimiento_id` juntos, o un ajuste de cierre se escribe sin `conteo_item_id` / con otro `motivo`. Si la web sale antes que el SQL no se cae: los campos faltan, valen 0 y la nota es la de antes. Trae un índice parcial `movimientos_conteo_item_idx` (solo filas de conteo) para que la suma por línea no recorra todo `movimientos`.

**No cubre (a propósito):** la fila de una línea reabierta que todavía no se tocó sigue mostrando «Falta 1 · Confirmado» con el «debe haber» de entonces (es el registro de lo contado), y las pantallas Confirmar y Resultado siguen mostrando `0 → 1` sin el «antes» del cierre. Ver `docs/backlog/2026-09-30-inventory-count-logic-6d804c.md`.

## Actualización 2026-09-30 (b): el responsable se elige una sola vez, al abrir el conteo

**Problema (Felipe, probando con la cuenta «Almacén Trujillo» en producción).** Abrir, Contar, Revisar, Cancelar y el alta al vuelo pedían el combo «Responsable» cada uno. La cuenta de tienda es una terminal compartida, sin persona propia (ADR-0161/0162): cada pantalla creaba su propio combo y al navegar de Abrir a Contar el nuevo nacía vacío («Obligatorio para guardar»).

**Decidí** que quien abre el conteo lo firma de principio a fin. `AbrirConteo` guarda en el navegador el responsable elegido con la clave del conteo (`lib/responsable-conteo.ts`); `useResponsable(undefined, { recordarEn })` lo recupera en Contar, Revisar, Cancelar y el alta al vuelo, y un guardado exitoso ya no lo reinicia. Cada escritura sigue firmando con el encabezado `x-responsable`: la base no cambió y el candado de asistencia sigue igual. El combo solo reaparece si NO hay responsable vigente (otro navegador, o esa persona ya no está de turno, o la base lo rechazó). Se quitó el «Cambiar» de Contar. Además, «Editar conteo» del resultado va directo a Contar con solo las variantes que el conteo ajustó (`?variantes=`, ADR-0241).
**Descarté** guardar el responsable en la base (`conteos`) y hacer que todas las funciones lo lean de ahí: cambia el contrato de firma de ADR-0161/0162 y es caro de revertir; y un estado global de la app: el recuerdo por id de conteo no se mezcla entre dos conteos.
**Se rompe si** dos personas cuentan el mismo conteo en la misma tablet a turnos: las líneas quedan a nombre de quien abrió (quien quiera firmar aparte tiene que abrir otro conteo o la base rechaza y vuelve a pedir el combo); o si el navegador borra su almacenamiento a media cuenta: cada pantalla vuelve a pedir el responsable, como antes. «Cerrar» sigue sin responsable (ADR-0280), por eso el historial dice «Cerró —».

## Actualización 2026-09-30 (c2): «encontrada», no «corregida»; «Corregir conteo»; y qué había antes de corregir

**Problema (Felipe, probando el Conteo 25: Adelle Wide Leg Celeste 30, había 3, se contó 2).** (1) El resultado y el historial decían «1 diferencia corregida», pero nadie había corregido nada: el conteo solo **encontró** una diferencia y ajustó el stock. (2) El botón se llamaba «Editar conteo». (3) Al abrirlo, la fila decía «Debe haber 3» y, al contar de nuevo, el 3 pasaba a 2 sin explicación.
**Decidí** que el conteo cerrado dice lo que hizo: «1 diferencia **encontrada**» (resultado, historial y resumen «… · 1 con diferencia»; la sección se llama «Variantes con diferencia»). «Corregir» queda para lo que viene después: el botón pasa a **«Corregir conteo»** y, al reabrirlo, la fila dice de entrada «Había 3 · por este conteo pasó a 2. Ahora estás corrigiendo.»; al contar de nuevo la nota cambia a «Al abrir: 3 · el cierre de este conteo restó 1» (la de la actualización del 2026-09-30 sobre el ajuste previo). Solo web; se apoya en `ajustado_total`/`ajustado_antes` que ya trae `fn_conteo_lineas_json`.
**Descarté** mostrar en «Debe haber» el stock de hoy desde el principio (2): el estado de la línea se deriva de `cantidad_sistema` en SQL, y cambiarle el número a la vista sin cambiar el estado los contradice («Falta 1» con 2 = 2). **Se rompe si** `ajustado_antes`/`ajustado_total` dejan de distinguir «sin volver a contar» de «ya contada de nuevo» (la nota diría «corrigiendo» a una línea ya corregida).

**Marca fija «Había N» (Felipe, 2026-09-30, sobre el mismo cambio).** La nota sola no alcanza: al contar de nuevo el «Debe haber» salta (3 → 2) tan rápido que no da tiempo de recordar con cuánto se empezó, y con varias prendas por corregir es peor. En la fila de Contar, una línea que se está corrigiendo (el cierre la ajustó) lleva bajo el «Debe haber» una marca fija «Había 3» que **no cambia** mientras se cuenta (`textoHabiaAntes` = `debeHaber − ajustadoAntes`). Se rompe si alguien mueve el stock de esa variante entre el cierre y la nueva cuenta: «Había» lo incluiría (es el «debe haber» de entonces más lo que entró o salió después, sin el ajuste del cierre).

## Actualización 2026-10-01: Confirmar no anuncia ajustes que ya se hicieron; un solo «Había»

**Problema (visto en producción con el Conteo 25, reabierto con «Corregir conteo» y sin tocar nada).** (1) Confirmar decía «Se actualizará 1 variante · 2 → 3 · Hoy hay 3 por movimientos posteriores; quedará en 4», pero el cierre NO iba a sumar nada: `cerrar_conteo` solo ajusta las líneas con `diferencia` vacía, y la de esta línea ya estaba escrita (+1). El stock no cambió (comprobado en la base), pero la pantalla prometía lo contrario. (2) Corregido por segunda vez (3 → 2 → 3), la fila mostraba dos «Había»: 3 en la marca fija y 2 en la nota.
**Decidí** (solo web): (1) una línea contada, ya ajustada por el cierre anterior y sin volver a contar (`yaAjustadaSinTocar` = `ajustadoTotal − ajustadoAntes ≠ 0`, la misma señal de la nota) sale de la lista «Se actualizará» de Confirmar y cuenta entre las que «no cambian», con su propia nota: «N variantes ya se ajustaron en el cierre anterior y no cambian al cerrar de nuevo». (2) «Había N» es un solo número —el de antes de que este conteo ajustara nada, `debeHaber − ajustadoAntes`— en la marca fija y en la nota; si el neto es 0 la nota dice «este conteo ya se corrigió antes y volvió a N»; la marca se muestra también con el neto en 0 cuando hay un último ajuste anotado (`ajusteMovimientoId`).
**Descarté** reescribir el mensaje en SQL o exponer un campo nuevo: la señal ya viene en `ajustado_total`/`ajustado_antes`. **Se rompe si** esa señal deja de distinguir «sin volver a contar» de «ya vuelta a contar»: Confirmar ocultaría un cambio real. Lo vigila `lib/conteo-reglas.test.ts` (`yaAjustadaSinTocar`).
