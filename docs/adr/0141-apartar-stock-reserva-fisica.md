# ADR-0141 — Apartar stock: reservar una prenda para una clienta sin restarla del conteo físico

**Fecha:** 2026-09-20
**Estado:** Aceptado e **implementado (Fase 1)** en la rama `claude/apartado-stock-reserva-fisica`. Verificado con SQL contra un Postgres 17
real (46 pruebas nuevas, 54 de regresión del motor y de ventas, y carreras con COMMIT de hasta 120 conexiones), 1645 pruebas unitarias y el
navegador (los componentes reales con datos de ejemplo). **La migración NO está aplicada en producción**: se pega con ok de Felipe, en el orden
de «Cómo se pega en producción».
**Decide:** Felipe, en lo de negocio (24 preguntas del 2026-09-17 y 8 más el 2026-09-20). Arquitectura: este documento.
**Afecta:** `stock` (columna nueva), `movimientos` (dos tipos nuevos), `fn_aplicar_movimiento` y `recalcular_stock` (reescritas sobre el cuerpo
de producción), tabla nueva `apartados`, cuatro funciones nuevas, Existencias, lo que ofrecen Vender/Cambios/Traslados, y las etiquetas de Movimientos.
**Historia:** pieza #6 de «Anatomía del Producto» (la de mayor prioridad de esa sesión). Una rama anterior (`claude/apartar-stock-solo-f3a1c2`,
que llamó ADR-0094 a su documento) resolvió el mecanismo sin tabla y sin pantalla; este ADR la reemplaza — ver «Qué cambió respecto de esa rama».

## Contexto (verificado contra `main` y contra producción, solo lectura, 2026-09-20)

1. Una prenda «apartada» (la clienta la pidió por WhatsApp, o la dejó a medias) sigue contando como disponible: cualquier otra caja puede
   vendérsela. Y una reserva sin dueño ni fecha —la clienta que «dijo que volvía en la tarde»— bloquea la prenda para siempre sin que nadie lo note.
2. Producción tenía 474 movimientos y ninguna de las columnas/tablas de esta pieza. `fn_aplicar_movimiento` y `registrar_movimiento` son
   idénticas a las del repo (md5 igual una vez quitados los comentarios); `recalcular_stock` es idéntica sin más.
3. **Solo dos funciones escriben `stock`**: `fn_aplicar_movimiento` y `recalcular_stock` (verificado leyendo el cuerpo de todas las funciones del
   schema con las 175 migraciones aplicadas). Por eso el invariante de abajo cuesta cuidar dos funciones, no treinta.
4. ADR-0050 dice «`movimientos` tiene 4 `tipo` y eso NO cambia». Esta decisión lo **enmienda** (decisión 8).

## Decisiones

**DECIDÍ 1 — un segundo contador sobre la MISMA fila de `stock`:** `stock.cantidad_apartada`, con dos CHECK (`>= 0` y `<= cantidad`).
`disponible = cantidad - cantidad_apartada`. El conteo físico sigue leyendo `cantidad`: la prenda apartada sigue en la tienda.
**DESCARTÉ** calcular «disponible» sumando `apartados` en cada lectura: cada venta pagaría un `sum` sobre otra tabla, y el `for update` de la fila
de stock —que es lo que serializa a dos cajas— no cubriría esa segunda tabla. Con el contador en la misma fila, validar y descontar ocurren bajo
el mismo candado.
**SE ROMPE SI** alguien escribe `stock` por un camino que no sea uno de los dos motores: `fn_verificar_apartados()` lo detecta (devuelve las filas
donde el contador no cuadra con la suma de sus apartados abiertos; debe devolver cero filas).

**DECIDÍ 2 — una tabla `apartados`, el DOCUMENTO de negocio, además del contador** (esto **revierte** lo que decidió la rama anterior). Una fila por
reserva: clienta, contacto, fecha límite, quién y cuándo, y los movimientos que la abrieron y la cerraron. `movimientos` sigue siendo la fuente de
verdad del efecto en stock; `apartados` es a la reserva lo que `transferencias` es a un traslado.
**DESCARTÉ** el contador solo (la rama anterior): no guarda para quién es ni hasta cuándo, así que una reserva olvidada es indetectable.
**DESCARTÉ** guardar clienta y fecha en `movimientos.nota`: es texto libre, no se puede listar «lo que vence primero» ni ordenar.
**SE ROMPE SI** una reserva se crea sin pasar por `apartar_stock`: por eso `registrar_movimiento` NO se amplía (decisión 3).

**DECIDÍ 3 — las dos RPC (`apartar_stock`, `liberar_apartado`) son la ÚNICA puerta al contador.** `registrar_movimiento` sigue aceptando solo
entrada/salida/ajuste. `authenticated` ya no puede ejecutar `fn_aplicar_movimiento` ni insertar en `movimientos` (ADR-0078), así que no hay puerta lateral.
**DESCARTÉ** ampliar `registrar_movimiento` con los dos tipos (la rama anterior): permitiría un `apartado` sin fila en `apartados` — un contador sin dueño.
`recalcular_stock` —el otro escritor de `stock`— también se cierra a `anon`/`authenticated` en esta migración: en producción ya estaba cerrada, pero
ningún archivo del repo lo decía, así que un Postgres construido desde el repo la dejaba abierta (la revisión adversarial lo encontró).
**SE ROMPE SI** un día se le concede a un rol el `insert` directo en `movimientos`.

**DECIDÍ 4 — `salida`, `traslado` y `ajuste` validan contra lo DISPONIBLE, con mensaje de negocio.** Los mensajes conservan el prefijo
«Stock insuficiente» que ya esperan las pruebas y `FlujoGuiado`. Un conteo que dejaría el stock por debajo de lo apartado se rechaza con
«libera o resuelve esos apartados primero», no con un error crudo de constraint.
**DESCARTÉ** que `salida` descuente sola de `cantidad_apartada` (`greatest(0, cantidad_apartada - n)`): una venta normal borraría en silencio la
reserva de otra clienta. Salió como hallazgo crítico de la revisión adversarial del diseño.
**SE ROMPE SI** alguien redefine `fn_aplicar_movimiento` desde una copia vieja, sin estas validaciones. Regla: **siempre partir del cuerpo vigente**
(el de esta migración).

**DECIDÍ 5 — `listar_apartados(ubicacion)` entrega `puede_liberar` YA calculado en SQL.** `PersonaActualV2` no trae el id de la persona, y la regla
«solo quien apartó o una líder» ya vive en `liberar_apartado`; repetirla en TypeScript son dos lugares que tienen que decir lo mismo.
**DESCARTÉ** duplicarla en la app. Efecto colateral bueno: toda la ruta de lectura es SQL y se prueba en Postgres, sin depender de un `embed` de PostgREST.

**DECIDÍ 6 — permisos (decisión de Felipe):** cualquier integrante aparta; el apartado de otra persona solo lo libera una líder. **DECIDÍ 7 —
vencimiento (decisión de Felipe):** un apartado vencido NO se libera solo, porque la clienta pudo haber dejado adelanto; sale en rojo y decide quien
lo ve. **DESCARTÉ** la liberación automática: hoy no hay tareas programadas (`pg_cron`) y soltaría prendas ya pagadas a medias.

**DECIDÍ 8 — los dos tipos aparecen en Movimientos como filas, no como categoría de filtro ni de resumen.** (Enmienda a ADR-0050.) Dicen quién
apartó qué y cuándo. `fn_resumen_variantes`/`fn_resumen_comparacion` ya reconstruyen saldos con la lista blanca
`m.tipo in ('entrada','salida','ajuste','traslado')`, así que no falsean ningún saldo histórico (verificado leyendo cada función que lee el ledger).

**DECIDÍ 9 — Vender, Cambios y Traslados ofrecen lo DISPONIBLE** (`pisoDisponible`/`almacenDisponible`), no lo físico. **NO se tocó** lo que aún muestra
físico: `fn_stock_por_sede` («dónde más hay»), `fn_productos` y los resúmenes; el motor rechaza igual lo que no esté disponible.

## Fase 2 — no construida (decidida con Felipe, 2026-09-20)

El apartado con **adelanto ligado a Caja**. Decisiones ya tomadas: el adelanto entra como **ingreso de caja «adelanto de apartado»** (solo el efectivo
entra al cajón; Yape/Plin/tarjeta se anotan en el apartado); si el apartado se cancela o vence sin venta, **se devuelve** (egreso de caja ligado); y
**no se emite comprobante al recibirlo** — sale en la venta final por el total. La tabla ya trae `adelanto_monto`, `adelanto_medio`,
`adelanto_caja_movimiento_id` y `venta_id` (nulas y sin uso; sus FK y candados se definen con el diseño de Caja).
Lo que falta y es lo más delicado: **`registrar_venta` consumiendo la reserva en una sola transacción** (hoy, cuando la clienta llega, se libera con
motivo «entregada» y se cobra en Vender; entre un paso y otro hay una ventana de segundos en la que otra caja de la MISMA tienda podría vender esa
unidad. Estimación: con 10-50 ventas al día en hora pico entre todas las sedes, es un evento de menos de una vez cada varios años, y si ocurre la venta de la
clienta falla con «Stock insuficiente», visible; no queda un estado roto).
**Antes de usar el adelanto con clientas reales: el tratamiento tributario de un anticipo de mercadería lo tiene que validar el contador.**

## Qué cambió respecto de la rama anterior (`apartar-stock-solo-f3a1c2`)

Se conservó lo que estaba bien: `salida` valida contra lo disponible, `recalcular_stock` reproduce los apartados, no se agrega una tercera firma de
`registrar_movimiento`. Se cambió: tabla `apartados` (decisión 2); no se amplía `registrar_movimiento` (3); `ajuste` y `traslado` también validan contra
lo disponible con mensaje de negocio (4); pantalla (Existencias, Apartar, Liberar); la migración lleva `set search_path` y el prefijo `retail.` (se pega
entera); y se partió de la definición de producción, verificada por md5.

## Verificación

- **SQL, Postgres 17 real** (`scripts/pruebas/apartar_stock.mjs`, 46 escenarios): el candado (venta, traslado y ajuste no se llevan lo apartado, y los bordes
  exactos: trasladar TODO lo disponible, ajustar justo a lo apartado), las dos RPC y sus permisos, RLS y privilegios (`authenticated`/`anon`, incluida la
  puerta lateral de `movimientos` y `recalcular_stock`), `listar_apartados`, y el invariante tras apartar, liberar y reconstruir el stock.
- **Regresión:** `fn_aplicar_movimiento.mjs` 11/11, `registrar_venta.mjs` 25/25, `registrar_cambio.mjs` 18/18 sobre el motor reescrito. Una prueba de
  `fn_aplicar_movimiento` asumía que `stock` tenía un solo CHECK con «cantidad»; se hizo exacta (`cantidad >= 0`).
- **Mutación:** se rompió el código a propósito de tres formas (validar contra el total, dejar liberar a cualquiera, abrir la RLS) y cada una hizo fallar
  justo la prueba que debía. Una prueba que no puede fallar no prueba nada.
- **Revisión adversarial sobre el código real** (6 revisores independientes; cada hallazgo, refutado por 2 escépticos que lo reproducían en Postgres):
  15 hallazgos de gravedad media o más → **5 confirmados, que son 3 problemas reales, ya corregidos**: (1) `Reponer` y el semáforo miraban el stock físico
  del almacén cuando la base valida contra lo disponible — ahora usan lo disponible; (2) `recalcular_stock` abierta a usuarios normales en un entorno
  construido desde el repo — cerrada; (3) el orden de despliegue: la caja (Vender), Cambios y Traslados comparten la lectura que ahora pide
  `cantidad_apartada`, y el ADR solo decía que caía `/inventario` — ahora esa lectura es **tolerante** (ver «Cómo se pega»). Los otros 10 se refutaron
  (huecos de cobertura o límites ya documentados); de ellos se adoptaron dos mejoras baratas: el mensaje del conteo nombra el SKU, y el aviso de una
  `salida` ya no dice «vender» cuando en realidad es un traslado.
- **Concurrencia real** (con COMMIT, sobre una base propia — nunca la compartida): 6 rondas de hasta 120 conexiones mezclando apartar y vender sobre la MISMA
  fila. En todas, apartadas + vendidas = exactamente las unidades disponibles; cero deadlocks; cero descuadres.
- **Idempotencia:** la migración se aplicó dos veces seguidas sin error (`if exists`, `or replace`).
- **Navegador:** Existencias, el modal de Apartados (vencido en rojo, sin «Liberar» donde no corresponde) y el de Apartar (tope de cantidad, errores en
  línea, y ante una caída de red: «No se guardó nada — revisa el internet», conservando lo escrito). **Sin base de datos real** en esa sesión: falta probarlo
  con datos reales (ver BACKLOG).

## Cómo se pega en producción

1. Pegar `supabase/migrations/20260920160000_apartar_stock.sql` **entera** en el SQL Editor de cayla-dynamic, **antes** de desplegar la web.
   Es aditiva y re-ejecutable, no crea sobrecargas (las firmas de `fn_aplicar_movimiento(uuid)` y `recalcular_stock()` no cambian).
2. Verificar (solo lectura): `select * from retail.fn_verificar_apartados();` → 0 filas; `select count(*) from retail.stock where cantidad_apartada <> 0;`
   → 0; y que existan `apartar_stock`, `liberar_apartado`, `listar_apartados` y `fn_verificar_apartados`.
3. Desplegar la web. Va **después**. Las pantallas que leen `stock.cantidad_apartada` son cuatro —Vender (la caja), Cambios, Traslados y Existencias— porque
   comparten `getStockPorUbicacion`; `/inventario` además llama `listar_apartados`. Como el deploy sale solo al fusionar y el SQL se pega a mano, ambas lecturas son
   **tolerantes mientras tanto** (ver BACKLOG para retirar el reintento): sin la columna, se lee sin ella y todo queda como antes (apartado = 0); sin la función,
   Existencias muestra cero apartados. Aun así, el orden correcto es SQL primero. La web vieja sobre la base nueva funciona sin cambios
   (mientras `cantidad_apartada` sea 0 en todas las filas, `disponible = cantidad`).

## SE ROMPE SI

- Una venta hecha **sin red** antes de que se aparte esa prenda se rechaza al subir la cola, por el mismo camino que hoy un «Stock insuficiente».
- Un conteo encuentra menos prendas que las apartadas: el cierre falla con mensaje claro y hay que liberar el apartado primero. Falta un flujo que lo
  resuelva desde el propio conteo (BACKLOG).
- Alguien aparta desde el Taller llamando a la RPC directo: la base lo permite (`fn_puede_operar_ubicacion`); la pantalla no lo ofrece (solo tiendas).
- La prenda apartada se mueve físicamente de piso a almacén: la reserva queda atada a la fila donde se hizo; hay que liberarla y volver a apartar.
- `apartados` crece con cada reserva (miles al año, no millones); los dos índices parciales cubren «abiertos de esta tienda» y «de esta fila».
- **Datos personales:** el nombre y el teléfono de la clienta los ve solo quien opera esa ubicación (más las líderes); nadie escribe directo.

## Lo que se aprendió

Los mensajes de la base con el prefijo «Stock insuficiente» ya eran un contrato con pruebas y pantallas; conservarlo costó una línea y evitó romperlas.
Y una alarma del diseño —«el `DROP` + `ADD` de `movimientos_tipo_check` congelaría la caja»— resultó ser cero con **474 filas**: primero el número, después la opinión.
