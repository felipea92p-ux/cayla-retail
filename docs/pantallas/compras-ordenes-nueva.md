# Pantalla — Nueva orden de compra + bitácora «Día de compra» (`/compras/ordenes/nueva`)

> Modo: completo · Fecha: 2026-10-21 · Rol/sede: líder y compradora, sede TRU (captura) · Datos: producción por volcado del 21-oct (`ordenes_compra` = 0 filas); la consulta SQL de abajo **no se ha corrido**
> SHA analizado: `116c3906f` (origin/main). La rama de trabajo va 20 commits detrás, pero ninguno toca esta pantalla (todos son de la tienda web y del inicio de sesión con Google). Si cambian los archivos de abajo, este análisis está vencido.
> Archivos: `app/(app)/compras/ordenes/nueva/page.tsx` · `components/ordenes-compra/NuevaOrdenCompra.tsx` · `lib/ordenes-compra.ts` · `lib/ordenes-compra-reglas.ts` · `lib/orden-compra-alta.ts` · `lib/marca-proveedor-reglas.ts` · RPC `crear_orden_compra` / `fn_orden_compra_validar` · tablas `ordenes_compra`, `orden_compra_items`, `proveedores`, `marca_proveedores`, `compras`, `compra_pagos`
> Otra sesión tocándola: **sí, sin aviso en el tablero** — la rama remota `origin/claude/skills-todos-agents-94f745` (10 commits, último WIP del 17-oct, **sin PR**) cambia `NuevaOrdenCompra.tsx`, `nueva/page.tsx`, `lib/ordenes-compra.ts` y `lib/orden-compra-alta.ts` («Comprar» de Análisis abre una orden con el proveedor y los modelos). Ver la tarea #1.

## 0 · Veredicto

La pantalla de hoy está bien hecha por dentro (idempotente, sin doble clic, con guía de foco), pero **no sabe cómo compra CAYLA**: no filtra por proveedor, no deja registrar uno nuevo, y no existe la jornada de compra (varias órdenes en un día, con presupuesto, compradora y pago). El mayor riesgo de lo que se pide no es de pantalla: **«quién compra» y «quién registró» son dos personas distintas y la deuda, la sede y la regla «quien compra no recibe» siguen atadas solo a quien registró**.
**Cumple su finalidad:** 6/10 · **Relevancia:** 7/10 — Soporte (hoy 0 órdenes en producción; sube a Núcleo en cuanto se use)

## 1 · Finalidad declarada

«Esta pantalla existe para dejar escrito qué se le pide a qué proveedor, a qué sede llega y cuánto cuesta, antes de que lleguen la factura y el envío, de modo que Compras, Recibir y Por pagar se apoyen en esa orden.» Fuente: `docs/adr/0362-ordenes-de-compra-y-despacho-a-sedes.md` y el texto de la propia pantalla («Lo que le pides al proveedor. La factura y el envío vienen después»). Docs y pantalla coinciden. **Lo que Felipe pide agrega una finalidad que el ADR no tiene**: la jornada («las compras se realizan en ciertos días y allí van varias órdenes»). Eso es una decisión estructural nueva y va como adenda al ADR-0362.

### Lo que Felipe decidió (20 respuestas, 2026-10-21)
1. Al elegir proveedor: categorías y marcas **solo las suyas + «Ver todas»**.
2. Proveedor nuevo: botón **«Registrar proveedor»** dentro del combo; mínimo **nombre + RUC**; **«No tiene RUC»** como salida (la ficha queda incompleta); permiso: **quien tenga Órdenes de compra** (permiso nuevo y acotado; el permiso final es de Felipe).
3. Las categorías de un proveedor salen **solas de sus marcas y su historial**; si empieza una categoría nueva para él, se elige una existente fuera de su lista.
4. Cambiar de proveedor con líneas llenas: **se quedan, marcadas con aviso**.
5. **Día de compra = ficha propia**; toda orden pertenece a uno; se abre a mano con atajo dentro de Nueva orden; **cualquiera con Órdenes de compra lo abre y la compradora fija su presupuesto** (puede quedar en blanco); cambios de presupuesto **con historial visible**; pasarse **avisa y no bloquea**; **sin cierre**; fechas **hoy a 7 días atrás**; **una orden no cambia de día**.
6. Pueden comprar **dos personas el mismo día** (presupuesto por compradora). Las tres compradoras de CAYLA aparecen siempre, aunque no estén en horario, **más una lista que edita el líder**.
7. El check «se le pagó» es **por proveedor dentro del día, calculado de pagos reales**, y abre «Registrar pago» (no se tilda a mano).
8. **«Cómo pagarle»** con copiar y el titular primero.
9. La bitácora es **una vista dentro de Órdenes de compra**, sin módulo nuevo (ADR-0306).

## 2 · Objeción

1. **El presupuesto ya no controla a quien lo fija.** Felipe eligió que la compradora fije su propio presupuesto. Lo único que lo sostiene como control antifraude es el historial visible de cambios y que el líder lo vea. Si lo que se quiere es un tope que ella no pueda subir, esa decisión (17) tiene que cambiar. `[inferido]`
2. **Se construye una capa sobre un módulo que nadie ha usado.** `ordenes_compra` tiene 0 filas en producción `[producción: volcado 21-oct]`. El argumento a favor es que hacer el día obligatorio **ahora** cuesta casi nada (no hay historia que rellenar); el argumento en contra es que la pantalla de la bitácora se diseña sin haber visto una sola jornada real. Por eso se propone **cortar en tres entregas** (tarea #4): estructura y formulario ya, bitácora después de una semana de uso real.
3. **La casilla «Recordar» de la decisión 3 sobra** (tres agentes coinciden): guardar la orden ya deja el par proveedor↔categoría en el historial. Una casilla que escriba exigiría una tabla `proveedor_categorias` (segunda fuente de verdad) o escribir `marca_proveedores` desde Órdenes de compra. Hay que confirmarlo con Felipe, no resolverlo en silencio.

## 3 · Lo que está bien y no se toca

- **Idempotencia y doble clic:** `p_id` generado en el navegador (`NuevaOrdenCompra.tsx:232`) y candado `enVuelo` (`:223`); la base devuelve la misma orden si el `p_id` se repite. `[código]`
- **Estados imposibles ya cerrados en la base:** anulación con quién/cuándo/por qué, entrega ≥ emisión, `numero` único, `version > 0`, historial de versiones inmutable (`fn_orden_compra_versiones_inmutable`). `[código 20261010235000]`
- **RLS sin políticas** en las tablas de Compras: el único camino es una función `security definer`. `[código DICCIONARIO]`
- **Una sola `fn_orden_compra_validar`** para crear y editar; la web la espeja en `lib/orden-compra-alta.ts` y una prueba exige que coincidan. `[código]`
- **La guía de foco y la derivación de «Falta»** de `camposDeLaOrden`. No se agrega ningún campo «sugerido» a ese cálculo (el aviso de línea que no calza vive fuera). `[código orden-compra-alta.ts:305-339]`
- **El aviso «nos debe»** del proveedor antes de pedirle lo nuevo (fase 5a). `[código NuevaOrdenCompra.tsx:214]`
- **El gasto del viaje**, el fondo de la compradora y la rendición (ADR-0362 decisiones 26, 32, 55, 67): son lo más cercano a una jornada y **no se duplican**.

## 4 · Las seis dimensiones

| Dimensión | Puntaje | Hallazgo principal | Evidencia |
|---|---|---|---|
| Estética | 7 | Coherente con el sistema (cabecera única, tarjetas, guía «Sigue aquí»). Dos cortes de texto a 2000 px: «Entrega estimada · si la sab…» y el nombre del proveedor en el combo. La ✕ de quitar línea mide 32 px y borra sin deshacer. | `[visto]` · `[código NuevaOrdenCompra.tsx:557, :207]` |
| Lógica de negocio | 5 | La orden «no toca el catálogo»: acepta cualquier marca con cualquier proveedor y las categorías no se filtran. No existe jornada, presupuesto ni compradora distinta de quien registra. | `[código 20261010235800:97-112]` · `[código ADR-0362:503]` |
| Arquitectura | 7 | Sólida (ver §3). Falta la capa del día; y la compradora no puede salir de `creada_por` sin tocar 5 sitios. | `[código 20261012230000:64, 20261013002000:85]` |
| Funciones | 5 | Existen: crear, editar, anular, comprobante, envío. **Faltan:** prefiltro, registrar proveedor, día, presupuesto, pagado por proveedor, «Cómo pagarle». | `[visto]` · `[código]` |
| Utilidad | 5 | Una compradora nueva en Gamarra, con un proveedor que nunca vio, se atasca: no hay «Registrar proveedor», las listas son enteras y la ficha del proveedor puede estar vacía. | `[inferido]` |
| Conexión con el ERP | 7 | Bien conectada a comprobantes, envíos, recepción y Por pagar. Falta el vínculo compradora↔dinero. | `[código]` |

**Cumple su finalidad = 36 / 6 = 6,0.** No hay un defecto que dañe dinero o stock *en la pantalla de hoy* (0 órdenes), así que no aplica el tope de 5; **sí lo habría si se construye la compradora sin resolver la tarea #2.**

### Estética
- `[visto]` Orden de la pantalla: cabecera (N.º, total) → proveedor / llega a / entrega / nota en una tarjeta → «Lo que pides» con líneas → total. Sin hex sueltos ni sombras. Pastilla «SIGUE AQUÍ» en un solo campo a la vez.
- `[visto]` Dos recortes: la nota «si la sabes» del campo Entrega estimada queda como «si la sab…» y el combo de proveedor corta el nombre. Son defectos chicos de ancho, no de diseño.
- `[código]` Con 375 px: `.pestana-cayla`, `.pildora-cayla` y `.segmento-cayla` ya suben a 44 px con dedo; la ✕ de línea no.

### Lógica de negocio
- `[código]` Contra `01-INVARIANTES.md` §2 (los candados que sostiene la costumbre): «la marca es del proveedor» es hoy costumbre, no candado; ninguna decisión escrita lo exige ni lo prohíbe (ADR-0362:503 dice explícitamente que la orden acepta cualquiera). Por eso el prefiltro es de **pantalla**, no de base.
- `[código]` Toda orden ya firma con `fn_actor_persona_id(true)`: con la cuenta de una persona, firma ella sola (sin combo); solo una terminal elige. Las claves `orden_compra_*` están en `acciones_sin_responsable`. `[código 20261019185000, responsable-omitido.ts:69-77]`
- `[código]` **Cinco lugares comparan contra `creada_por`**: `fn_orden_compra_gestora` (qué sede carga la deuda), `fn_recepcion_exigir` y `recibir_orden_sin_envio` (la regla «quien compra no recibe», decisión 17; son los dos que la hacen cumplir) y tres banderas de pantalla (`fn_envios_por_recibir`, `fn_ordenes_directas_por_recibir`, `fn_envio_detalle`). Además, la sede de un gasto del viaje sale de la sede asignada del actor o, si no tiene, de la gestora de la primera orden. Ninguna migración posterior los toca. `[código 20261012230000:52-72; 20261013002000:85,323,1352,1405,1481; 20261013222000:162-170]`

### Arquitectura
- **Transacción:** abrir el día y crear la primera orden son **dos** transacciones; un día vacío es un estado válido. `abrir_dia_compra` usa `insert … on conflict (compradora, fecha) do nothing` y relee. Dos compradoras = llaves distintas, sin choque.
- **Concurrencia:** dos pestañas de la misma compradora quedan serializadas por el índice único; el presupuesto vigente no se pisa (`fijar_presupuesto_dia` con `version_esperada`, y si el monto ya es el vigente no escribe, así un doble clic no duplica el historial).
- **Caída externa — frases obligatorias:**
  - *SUNAT y la consulta de pago no responden:* el RUC se valida solo por formato y dígito verificador; el proveedor se registra con el nombre a mano, marcado «sin verificar en SUNAT». No se pierde el dato. `[código ConsultaDocumento.tsx:296-305]`
  - *Falla la lectura de «lo pagado»:* la fila dice «No pude leer lo pagado, vuelve a intentar» y **nunca** «Sin pagar» (evita un doble pago).
  - *Falla la lectura de la lista de categorías del proveedor:* la pantalla queda como hoy (todo el catálogo). La web puede publicarse antes que la migración sin romperse.
  - *Se corta la red al guardar:* token + huella (ADR-0421): reintentar no duplica; la pantalla dice «no sabemos si llegó».
  - *La base no responde:* `/sin-base` (ADR-0450).
- **Números** `[inferido]`: ~3 compradoras → unas 1.200 jornadas y ~2.300 cambios de presupuesto en 3 años (techo ≈ 2.800 y 5.600); órdenes ≈ 9.400 a 3 años (techo 42.000), ≈ 200.000 líneas en el techo. Pares proveedor↔categoría: techo duro 115 × 52 = 5.980, probablemente ~600 (~30 KB). Los únicos índices son los de correctitud. No hay problema de rendimiento medible; el problema es de correctitud.
- **Producción hoy** `[producción: volcado 21-oct]`: `ordenes_compra` 0, `orden_compra_items` 0, `compras` 8, `compra_pagos` 8, `proveedores` 115, `marca_proveedores` 106, `productos` 410, `categorias` 52, `marcas` 105, `lotes` 9, `despachos` 1.

### Funciones
- **Existen y funcionan:** crear/editar/anular orden, comprobante de la orden (al contado o a crédito), envío, nos debe, gasto del viaje, fondo.
- **Fantasma:** ninguna en esta pantalla.
- **Faltan:** las del pedido de Felipe (prefiltro, registrar proveedor, día, presupuesto con historial, quién compra, pagado por proveedor, «Cómo pagarle»).
- **Sobran:** la casilla «Recordar» (objeción 3). Y no hay que crear una tabla `proveedor_categorias` ni un módulo nuevo.

### Utilidad (persona sin contexto)
Una compradora nueva, en Gamarra, con un proveedor que nunca vio: (1) ve dos pestañas; duda si «Bitácora» es para ella — la entrada sigue siendo la Lista. (2) Nueva orden sin día abierto: no sabe qué es un día; el aviso lo dice en una frase («aquí se juntan tus órdenes y lo que falta pagar») y no le pregunta presupuesto. (3) Escribe el nombre del puesto y ve «Nada coincide»; al lado va «+ Registrar proveedor». (4) No sabe el RUC: tocará «No tiene RUC» para salir; hay precedente de relleno («SIN PROVEEDOR», «-») en `marca-proveedor-reglas.ts:44`, y el nombre del puesto puede duplicar una razón social (por eso se pregunta «¿no será…?»). (5) Proveedor sin historial: las listas abren en «Ver todas» con «es la primera vez con este proveedor». (6) **La marca es obligatoria y no hay forma de crearla desde la orden** (decisión 4): se repetirá el relleno; hay que elegir una salida (ver «Decisiones abiertas»). (7) La ✕ de 32 px borra una línea sin deshacer. (8) Si el total pasa el presupuesto, se avisa antes de guardar, sin bloquear.
Si se equivoca en alguno de estos pasos, el fallo es del diseño, no de la capacitación.

### Conexión con el ERP
Ver §6.

## 5 · Relevancia

| Criterio | Peso | Puntaje | Por qué (una línea) |
|---|---|---|---|
| Gestión (directo + indirecto) | ×2 | 8 | La orden es la raíz de lo que se compra, a quién se le debe y qué llega; de ella dependen Por pagar, Recibir y el plan de campaña. |
| Dinero y stock que toca | ×1 | 8 | No mueve plata por sí sola, pero fija el pedido contra el que se paga y se recibe. |
| Frecuencia y personas que la usan | ×1 | 6 | ~3 compradoras, varias órdenes por jornada una vez en uso; hoy 0 órdenes en producción. |
| Qué se detiene si falla | ×1 | 5 | Se sigue comprando por WhatsApp y papel (así es hoy), pero sin trazabilidad. |

Relevancia = (2·8 + 8 + 6 + 5) / 5 = **7,0** → Soporte.

## 6 · Conexión con el ERP

- **Aguas arriba:** `proveedores` (115), `marcas` y `marca_proveedores` (106 vínculos), `categorias`, el plan de campaña y Análisis (la rama sin fusionar abre una orden desde «Comprar»), el fondo de la compradora.
- **Aguas abajo:** `compras` por `orden_compra_id` (**un comprobante pertenece a una sola orden**), Por pagar, `despachos`/Recibir, `fn_proveedor_nos_debe`, gasto del viaje, rendición del fondo, Finanzas (cuenta 1413).
- **Pájaro dueño y vecinos:** Pelícano (Compras y proveedores); vecinos: Recibir, Finanzas, Catálogo (marcas).
- **Externos:** SUNAT (padrón de RUC: caché → SUNAT público → de pago; **no siempre responde 200**: devuelve 400, 401, 403, 429 por más de 60 consultas por minuto, y 503) y la base misma. Ver las frases de degradación en §4.

## 7 · Las 12 tareas, por importancia

> Orden: lo que puede dañar dinero o dejar la base en un estado mal puesto, arriba; las dependencias están marcadas. Ninguna se ejecuta sin que Felipe lo ordene.

### #1 · [Corregir] Coordinar con la rama «Comprar desde Análisis» antes de tocar `NuevaOrdenCompra.tsx`
- **Dónde:** `origin/claude/skills-todos-agents-94f745` (+ gemela `…-2yvvlf`): `NuevaOrdenCompra.tsx` (+73), `nueva/page.tsx` (+28), `lib/orden-compra-alta.ts` (+21), `lib/ordenes-compra.ts` (+15, `getModelosParaOrden`); nuevo `lib/orden-compra-desde-analisis.ts`; huellas `compras.ordenes.nueva` y `compras.ordenes.editar.id`.
- **Por qué en este puesto:** es un choque real y silencioso (no está en `SESIONES-ACTIVAS.md`, no tiene PR, último commit del 17-oct). Rehacer el formulario sin saberlo duplica trabajo y rompe el contrato del borrador (líneas armadas desde Análisis con la guía en «Por revisar»).
- **Cómo lo verificas tú:** `git log origin/main..origin/claude/skills-todos-agents-94f745` muestra 10 commits; Felipe decide si esa rama se fusiona primero o se rebasa encima.
- **Esfuerzo / dependencias:** S · antes que cualquier edición de esos 4 archivos.

### #2 · [Corregir] Separar «quién compra» de «quién registró» y decidir quién manda en deuda, sede y regla «quien compra no recibe»
- **Dónde:** `fn_orden_compra_gestora` (`20261012230000:52-72`), `fn_recepcion_exigir` (`20261013002000:85`), `recibir_orden_sin_envio` (`:323`), las 3 banderas de pantalla (`:1352, :1405, :1481`) y la sede del gasto del viaje (`20261013222000:162-170`).
- **Por qué en este puesto:** si la compradora del día no es `creada_por`, la bitácora dice «compró la compradora 2» mientras la deuda y la sede van a quien tecleó, y la compradora puede **recibir lo que ella misma compró** (se pierde la separación entre quien pide y quien recibe). Es lo que dos agentes encontraron de forma independiente. Va antes que el día de compra porque define de dónde sale la compradora.
- **Cómo lo verificas tú:** con la cuenta A registrar una orden a nombre de B; entrar a Recibir con la cuenta de B → debe decir «Hiciste esta orden…» y no dejar recibir; la deuda carga a la sede de B; el gasto del viaje de B queda en su sede.
- **Esfuerzo / dependencias:** M · bloquea la #3 y la #8.
- **DECIDÍ (recomendación):** la compradora se **deriva del día** (`dias_compra.compradora_id`) y **manda para deuda, sede y regla 17**; `creada_por` sigue siendo la firma. La regla 17 excluye a **ambas**.
- **DESCARTÉ:** una columna `compradora_id` en cada orden (la propuso un agente): duplica una verdad que el día ya tiene y puede divergir.
- **SE ROMPE SI:** alguien usa la compradora para permisos o firma en vez de `fn_actor_persona_id`; o si una compradora del día fuera de la lista deja de existir (se degrada a «yo»; ninguna orden queda sin compradora).

### #3 · [Reconstruir] Día de compra: la ficha, el presupuesto con historial y la orden obligatoriamente dentro de un día
- **Dónde:** tablas nuevas `retail.dias_compra` (`unique (compradora_id, fecha)`, `presupuesto numeric(12,2)` nulo = en blanco, `version`) y `retail.dia_compra_presupuesto_cambios` (escrito por disparador, patrón `proveedores_cambios_bancarios` de `20261013161000`); `ordenes_compra.dia_compra_id`; RPC `abrir_dia_compra`, `fijar_presupuesto_dia`; `crear_orden_compra` pasa a 7 argumentos con `drop function` de la de 6 (`20261010235000:458-459`) **en la misma migración**; `fn_orden_compra_exigir_mismo_pedido` debe comparar también el día.
- **Por qué en este puesto:** estructural y barato **solo mientras haya 0 órdenes**; después de las primeras órdenes sueltas el `NOT NULL` cuesta una migración con relleno. Lo vigilan **dos disparadores** nuevos: fecha de hoy a 7 días atrás (con `fn_hoy_lima()`, no UTC: ya hubo un fallo después de las 19:00) y «una orden no cambia de día».
- **Estados imposibles (y qué los impide):** orden sin día (FK + `NOT NULL`); dos días de la misma compradora y fecha (índice único); presupuesto ≤ 0, NaN o infinito (CHECK); fecha futura o de hace más de 7 días (disparador); orden que cambia de día (disparador); historial reescrito (disparador de bloqueo, clon de `fn_orden_compra_versiones_inmutable`); día que cambia de fecha o compradora, o que se borra (disparadores).
- **Cómo lo verificas tú:** abrir el mismo día desde dos pestañas deja **una** fila; `select compradora_id, fecha from retail.dias_compra group by 1,2 having count(*)>1` da 0; `select count(*) from retail.ordenes_compra where dia_compra_id is null` da 0; cambiar el presupuesto dos veces muestra dos líneas con quién, de cuánto a cuánto y cuándo.
- **Esfuerzo / dependencias:** L · después de la #2 · **18 suites con 47 `insert into retail.ordenes_compra`** directos no pasan por la RPC: o se migran a la vez o el día se resuelve con un disparador `BEFORE INSERT` (`create or replace trigger`, nunca `drop trigger`).
- **DECIDÍ:** `dias_compra` con una fila por (compradora, fecha); abrir el día y crear la orden son dos transacciones.
- **DESCARTÉ:** una sola RPC combinada (mezcla dos responsabilidades y un día vacío es válido); derivar el presupuesto vigente solo del historial (obliga a un lateral por fila y se aparta del patrón del repo).
- **SE ROMPE SI:** una compradora vuelve de un feriado largo y carga sus órdenes al noveno día (la regla de 7 días la deja sin poder registrar y no hay excepción de Admin); o se pega la parte 4 antes de publicar la web (el «Nueva orden» viejo llama a una firma que ya no existe).
- **Pegado en producción:** en **partes**, cada una con `set lock_timeout = '3s'`, sin políticas, sin `drop trigger`: (1) tablas, disparadores, RPC y la 7-argumentos; (2) solo el `alter` de `ordenes_compra`; (3) publicar la web, luego relleno (con 0 órdenes, vacío); (4) `set not null` y `drop function` de la de 6. Reservar versión con `pnpm reservar migracion`.

### #4 · [Replantear] Decidir el corte: entregar en tres pasos o todo junto
- **Dónde:** esta sección (§8).
- **Por qué en este puesto:** es la decisión que ordena todas las demás y la que Felipe debe tomar. La pantalla de la bitácora es lo más grande (L) y es lo único que se diseña sin haber visto una jornada real.
- **Cómo lo verificas tú:** Felipe elige A o B en la sección 8.
- **Esfuerzo / dependencias:** S (decisión) · antes de la #10.
- **DECIDÍ (recomendación):** tres entregas: **(1)** formulario (prefiltro + registrar proveedor + «Cómo pagarle» arreglado); **(2)** estructura del día + atajo en Nueva orden; **(3)** bitácora, pagado y presupuesto con historial.
- **DESCARTÉ:** todo en un solo PR: son 4 archivos que otra rama también toca, 3 migraciones y 5 pantallas; el primer error enreda todo.
- **SE ROMPE SI:** la compradora empieza a usar Nueva orden con órdenes sueltas antes de que llegue la entrega 2 (el día obligatorio exigiría relleno).

### #5 · [Corregir] «Sin cuenta, CCI ni Yape / Plin» engaña a quien solo tiene Órdenes de compra
- **Dónde:** `20261013161000_datos_bancarios_de_proveedores.sql:48-59` (`fn_puede_ver_datos_bancarios`); `getProveedor` (`lib/proveedores.ts:212-238`, cero filas → todo `null`); `lib/destino-de-pago.ts:42,48`; `CuentasProveedor.tsx:109-125`.
- **Por qué en este puesto:** **ya pasa hoy en `main`**, no es del diseño futuro: al registrar un comprobante al contado desde la orden, quien solo tiene Órdenes de compra lee «Este proveedor no tiene cuenta ni CCI registrados» aunque la cuenta exista. Para pagar una transferencia que no se revierte, un «no se ve» dicho como «no hay» es un riesgo de dinero. El patrón correcto ya existe: `ProveedorElegido.tsx:11-13,48-56` (cero filas = «no se sabe»).
- **Cómo lo verificas tú:** con una cuenta que solo ve Órdenes de compra, el pago al contado dice «No puedes ver sus datos de pago», no «no tiene cuenta».
- **Esfuerzo / dependencias:** S (texto y estado «oculto») o M (si Felipe amplía el permiso) · independiente.
- **DECIDÍ (recomendación):** agregar `ordenes_compra` a `fn_puede_ver_datos_bancarios()` **si Felipe lo aprueba** (la compradora tiene que poder pagar), y mostrar siempre tres estados: cargando, «oculto por permiso», incompleta. El historial de cambios de cuenta y su aviso al líder ya existen (`proveedores_cambios_bancarios`, ventana de 7 días, solo para el líder).
- **DESCARTÉ:** dejarlo como está (la compradora paga a ciegas).
- **SE ROMPE SI:** se amplía el permiso sin que el aviso de cambio de cuenta llegue a alguien que lo mire (hoy es solo del líder).

### #6 · [Mejorar] Prefiltro de categorías y marcas por proveedor (+ aviso de línea que no calza)
- **Dónde:** nueva `retail.fn_proveedor_categorias()` (lectura, `stable`, `security definer`, exige `fn_ve_modulo('ordenes_compra')`); `lib/ordenes-compra.ts` `getDatosNuevaOrden` (suma la RPC al `Promise.all`, L121-156); nuevo `lib/orden-compra-prefiltro.ts` con su prueba (`opcionesDeCategoria`, `opcionesDeMarcaPrefiltro`, `lineaNoCalza`); `components/ui/ComboBuscable.tsx` (suma `grupo?` a `OpcionCombo` y un `pie?` fijo); `NuevaOrdenCompra.tsx:171-196`.
- **Por qué en este puesto:** es la queja principal de Felipe y no cambia dinero ni permisos. **Medir la cobertura antes de construir**: hay ~410 productos para 115 proveedores y `productos.proveedor_id` es opcional; si pocos proveedores tienen categoría derivada el día 1 (y los que se creen con «Registrar proveedor» nacen en cero), el prefiltro parecerá roto.
- **Reglas de la función:** pares únicos de (1) `productos` con proveedor, sin rechazados ni `es_prueba`; (2) `productos` sin proveedor cuya marca tiene **un solo** proveedor (una marca compartida no se atribuye a nadie); (3) líneas de órdenes `estado='generada'` (una anulada deja de contar sola). **Sin casilla «Recordar»:** guardar la orden es el recuerdo; se avisa «Casacas quedará entre las de este proveedor al guardar».
- **Reglas de la pantalla:** conjunto vacío → muestra todas, sin «Ver todas» y sin juzgar ninguna línea; **conservar siempre la opción ya elegida aunque quede fuera del conjunto** (`ComboBuscable` muestra vacío si el valor no está en `opciones`, `:106-107`); al cambiar de proveedor la línea que no calza queda con un `Aviso tono="atencion" chico` calculado (A→B→A lo limpia), fuera de la guía de foco.
- **Cómo lo verificas tú:** `select count(distinct proveedor_id) from retail.fn_proveedor_categorias()` contra 115; con un proveedor conocido, ves solo sus categorías + «Ver todas (N)»; eliges una de fuera, guardas, y en la orden siguiente del mismo proveedor aparece entre las suyas; si se anula esa orden, desaparece.
- **Esfuerzo / dependencias:** M · tras la #1 · rompe 3 pruebas que hay que actualizar a propósito (`marca-proveedor-reglas.test.ts:136-160`, las huellas de guía `compras.ordenes.nueva` y `.editar.id`, y `ordenes-compra-doble-clic.test.ts:23`).
- **DECIDÍ:** una función de lectura con payload agrupado.
- **DESCARTÉ:** leer `productos` crudo en el navegador (crece con el catálogo y no ve las órdenes por la RLS) y una tabla `proveedor_categorias` (segunda fuente de verdad).
- **SE ROMPE SI:** pocos proveedores tienen categoría derivada, o los pares pasan de ~5.000.

### #7 · [Mejorar] «Registrar proveedor» desde la orden, y qué pasa con el duplicado
- **Dónde:** función nueva `retail.registrar_proveedor_de_orden(p_nombre, p_ruc, p_sin_ruc, p_celular)` → `(id, nombre, ruc, ya_existia)` (molde: `registrar_proveedor_de_gasto`, `20260924235100:815-838`); hoja nueva `RegistrarProveedorOrden.tsx` (`<Modal tamano="angosta">`, entra al combo con `crear` + `crearArriba`, como `NuevaMarcaForm.tsx:408`); `ConsultaDocumento` con RUC primero.
- **Por qué en este puesto:** la compradora no se puede atascar con un proveedor nuevo, y nada de lo existente le sirve: `registrar_proveedor` pide gestionar Proveedores (falla si ya existe el nombre o el RUC) y `registrar_proveedor_de_gasto` pide el módulo Gastos y siembra el rubro «Gastos», que metería a ese proveedor en el combo de gastos fijos. Hace falta una función **nueva y estrecha**.
- **Contrato:** promete devolver **un** proveedor activo, el existente o uno nuevo con solo esos datos. Asume el módulo `ordenes_compra`. No modifica uno existente, no reactiva, no escribe banco, CCI ni rubros. RUC o `p_sin_ruc`, nunca ambos ni ninguno. Firma con `fn_actor_persona_id(true)` y anota en `actividad` (con `exception → warning`). **No copiar dos defectos del molde:** si el RUC no existe pero el nombre sí, no devolver el existente descartando el RUC escrito en silencio; y los candados `'proveedor:'||ruc` y `'proveedor:'||nombre` son distintos (dos llamadas concurrentes se frenan solo por el índice único; relee y devuelve ese).
- **Ficha incompleta:** **hoy no existe una marca ni un aviso en Inicio** para proveedores incompletos (el aviso `completar` de Inicio es de *productos* sin marca o proveedor). Lo que sí existe es `sinDatosDePago` (`lib/proveedores-reglas.ts:593-596`), un chip ámbar y el filtro «Sin datos de pago · N» en Proveedores. Se propone **derivarla** de esa regla (sin columna `provisional`) y sumar un aviso `info` nuevo en Inicio; si Felipe quiere distinguir «nació en una orden» o «RUC sin verificar», sí haría falta una columna en `proveedores`.
- **Cómo lo verificas tú:** con una cuenta que solo tenga Órdenes, Nueva orden ▸ «Registrar proveedor» ▸ pegar un RUC de empresa → aparece la razón social y queda elegido; repetir con el mismo RUC o con doble clic → una sola fila; con la consulta apagada se registra con el nombre a mano y dice «sin verificar»; una cuenta sin Órdenes recibe 42501.
- **Esfuerzo / dependencias:** M · después de la #1; permiso nuevo es decisión de Felipe.
- **DECIDÍ:** función estrecha por módulo `ordenes_compra` (ADR-0306: un botón no es módulo nuevo; ADR-0178: no le entrega Proveedores, solo un acto acotado).
- **DESCARTÉ:** abrir `registrar_proveedor` a más gente (dejaría escribir banco y CCI sin el permiso de Proveedores).
- **SE ROMPE SI:** una compradora registra «Mias Gamarra» sin RUC y ya existía «Mias»: el índice solo ve nombres iguales y quedan dos fichas. **No existe fusionar proveedores** y el candado de nombre tampoco junta «SAC» con «S.A.C.» (`BACKLOG.md:890`); el primer duplicado parte Por pagar, «Nos debe» y `marca_proveedores`, y solo se arregla con SQL a mano. Por eso la pregunta «¿no será…?» (`proveedoresParecidos`) es **obligatoria**. Privacidad: un RUC que empieza con 10 contiene el DNI de la persona; pruebas y ejemplos con RUC fabricados, nada de nombre ni RUC en un `throw`, un `console.error` ni en Sentry.

### #8 · [Mejorar] «Pagó X de Y» por proveedor y día, y qué hacer con el pago al contado antes del papel
- **Dónde:** nueva `fn_dia_compra_pagos(p_dia_id)` (lectura, `fn_ve_modulo('ordenes_compra')`, prefijo `fn_` = lectura para el loader, `lib/espera-reglas.ts:61`); `compras.pagado` y `saldo` (foto que mantiene un trigger); `registrar_comprobante_orden` (`20261012211000:140,203,264-269,371-409,453-471`); `registrar_pagos_compra`, `registrar_pago_compras[_medios]` (exigen `fn_puede_pagar_compras()` = módulo Por pagar, o líder).
- **Por qué en este puesto:** dinero. Y hay un callejón: **todo pago cuelga de una fila en `compras`** (`compra_pagos.compra_id NOT NULL`); un pago «sin papel» sí existe, pero vía el tipo «Sin comprobante» (SC-…), y **una SC al contado no se puede reemplazar por su papel** (`anular_compra` rechaza una con pagos, `20260918205000:192-194`). La regla provisional de la decisión 50 («si llega el papel se anula la SC y se registra el papel») solo sirve para una SC a crédito sin pagar; el caso típico de Gamarra queda sin salida.
- **Definición de Y:** el papel donde existe (`total − notas_credito` de los comprobantes vigentes de las órdenes del día para ese proveedor) y el pedido (`orden_compra_items.subtotal`) donde no hay papel; X = `compras.pagado` (la misma foto que usa Por pagar, así la bitácora y Por pagar nunca discrepan). Estado: Y = 0 → sin chip; X ≥ Y → pagado; 0 < X < Y → parcial; X = 0 → sin pagar. **Un comprobante pertenece a una sola orden** (`compras.orden_compra_id` es un escalar y el índice único de papel vigente impide registrar el mismo papel dos veces), así que el pago nunca se reparte entre días; en cambio **un mismo papel físico no puede cubrir dos órdenes** (posible con dos compradoras y un mismo proveedor).
- **Cómo lo verificas tú:** una orden sin papel muestra «Sin pagar S/ pedido»; se paga por Yape desde «Mi fondo» y pasa a «Parcial» o «Pagado»; se completa el papel y la deuda **no se duplica** en Por pagar; se anula un comprobante y vuelve a verse el pedido como Y.
- **Esfuerzo / dependencias:** L · después de la #3 · exige decisión de Felipe sobre el permiso y el pago anticipado (ver «Decisiones abiertas»). **Dinero: la decisión es de Felipe.**
- **DECIDÍ (recomendación):** opción A: sin papel, «Registrar pago» crea la SC (contado o crédito) y paga con el flujo que ya existe, más una función nueva `completar_papel_de_compra` que convierte esa SC en su factura/boleta/nota en el mismo registro y con sus pagos (rechaza si hay recepción, notas o mes cerrado, o si el total nuevo es menor que lo pagado; si el papel trae otro total, se ajusta con una nota de crédito).
- **DESCARTÉ:** opción B, una tabla de anticipos: obliga a reabrir 5 funciones de Finanzas (`fn_asientos`, el sellado y la 1413, la regla del Yape personal, la conciliación) y a una cuenta de anticipos que el contador no ha aprobado.
- **SE ROMPE SI:** el papel llega con un total distinto del de la SC pagada, o con su mes ya cerrado (`fn_exigir_mes_abierto`); entonces hay que ajustar con nota de crédito o documento interno.

### #9 · [Mejorar] «Cómo pagarle»: titular primero, tres estados y el aviso de doble pago
- **Dónde:** `CuentasProveedor.tsx` (el titular va al final, `:109-113`, y es la pieza compartida: el cambio es global, ADR-0358); hoja nueva `ComoPagarle.tsx` (`<Modal tamano="angosta">`); `BotonCopiar` (`forma="boton"` en celular: «Copiar CCI»); `fn_proveedor_cambios_bancarios`.
- **Por qué en este puesto:** es el último paso antes de una transferencia que no se revierte. Además, con dos compradoras y un mismo proveedor ese día, **las dos ven «Falta S/ 400» y las dos transfieren**: la hoja abre con «Hoy ya se le pagó S/ 800 (compradora 2, 10:42)» o «Nadie le ha pagado hoy» (una lectura `fn_` más).
- **Cómo lo verificas tú:** a 375 px, con dos cuentas de compradora: la primera registra un pago a un proveedor; la segunda abre «Cómo pagarle» de ese proveedor y ve el pago de la primera arriba; el titular va primero y el CCI se copia sin guiones.
- **Esfuerzo / dependencias:** S–M · tras la #5.

### #10 · [Mejorar] La vista «Bitácora»: ruta hermana, píldoras de día, franjas por compradora
- **Dónde:** `/compras/ordenes/bitacora?dia=aaaa-mm-dd` (hermana, con `<Pestanas href>` y `exigirModulo("ordenes_compra")` repetido en su `page.tsx`, como `plan/page.tsx`); extraer `<CabeceraOrdenes>` para las dos vistas; píldoras `pildora-cayla` (Hoy · Ayer · 8 días + «Otro día» con `CampoFecha`); tres `TarjetaCifra` (Pedido del día · Pagado · Falta pagar); franjas por compradora con `BarraAvance` (ámbar si se pasa, `Aviso chico` «Te pasaste S/ 200») y «Cambiar presupuesto» (`<Modal angosta>` con su historial); tabla de proveedores con `Chip`, `BarraAvance fina`, «Cómo pagarle» y «Registrar pago»; filas que se abren con `FilasDeMas`.
- **Por qué en este puesto:** lo más grande y lo único sin dinero propio; depende de #3, #8 y #9. **Nunca una `Casilla`** para el check: invita a tildar y la decisión 7 lo prohíbe. Nada de esto es un módulo nuevo; hay que actualizar el `incluye` en `lib/modulos.ts:109` y su `update` en la migración.
- **Cómo lo verificas tú:** con un día abierto ves tus órdenes y lo que falta pagar; `?dia=` inválido o sin ficha muestra `<Vacio>` («El 20 no se abrió» + «Abrir este día», solo hoy y 7 atrás), no un 404.
- **Esfuerzo / dependencias:** L · después de #3, #8, #9.
- **DECIDÍ:** ruta hermana con `<Pestanas href>`.
- **DESCARTÉ:** pestañas por estado (`onCambio`) dentro de una sola página: recargar, «atrás» y el enlace compartido dejarían de funcionar y la página tendría dos modos.
- **SE ROMPE SI:** se abre el enlace de un día sin ficha o con `?dia=` inválido y sale un 404 en vez del vacío.

### #11 · [Mejorar] Celular, a 375 px: la compradora está en Gamarra
- **Dónde:** `NuevaOrdenCompra.tsx:557` (✕ de 32 px → 44 px) y `:207` (`quitarLinea` sin deshacer → `BotonDeshacer`); `inputMode` numérico/decimal en el RUC y los montos; las dos hojas nuevas son `<Modal>`, no `<Cajon>`; la tabla de proveedores se apila por `@container`; los dos recortes de texto de la captura.
- **Por qué en este puesto:** ADR-0362:629 dice que Órdenes de compra «entra a la regla de celular (375 px) porque se usa en Gamarra», pero esa frase vive en la sección **propuesta**, no en las decisiones numeradas, y ni `CLAUDE.md` ni el PR template la exigen (`docs/formidable/compras-ordenes.md:3-5`: «no está en PL-105»). Hoy es costumbre, no regla.
- **Cómo lo verificas tú:** a 375 px, quitar una línea ofrece «Deshacer»; todos los botones miden 44 px.
- **Esfuerzo / dependencias:** S · si Felipe quiere que sea obligatoria, hay que escribirla como decisión numerada y sumar `/compras/ordenes*` a «Celular obligatorio» de `CLAUDE.md` y al PR template.

### #12 · [Eliminar/fusionar] *(bajo valor hoy / futuro)* Una sola alta rápida de proveedor y una forma de fusionar duplicados
- **Dónde:** `registrar_proveedor` (`NuevaMarcaForm.tsx:228`), `registrar_proveedor_de_gasto` (`RegistrarGastoModal.tsx:204`) y la nueva de la #7: tres altas rápidas; ninguna función fusiona proveedores.
- **Por qué en este puesto:** el valor es real solo cuando aparezca el primer duplicado (hoy 0 órdenes). Va en un commit aparte, **primero el refactor y después el cambio** (Kent Beck). `registrar_proveedor` y `registrar_proveedor_de_gasto` tienen parches vivos: no se tocan en la #7.
- **Cómo lo verificas tú:** `rg "registrar_proveedor"` muestra una sola función de alta rápida en la web.
- **Esfuerzo / dependencias:** M · futuro · después de la #7.

## 8 · Estrategia alternativa

**Plan A (recomendado, la tarea #4): tres entregas.** (1) formulario: prefiltro, «Registrar proveedor», «Cómo pagarle» corregido (#5, #6, #7, #9); (2) estructura del día + atajo en Nueva orden + `drop function` de la de 6 argumentos (#2, #3), **antes de que exista la primera orden suelta**; (3) bitácora, pagado, presupuesto con historial y celular (#8, #10, #11).
- *Ganas:* cada entrega se prueba sola en el navegador; la estructura queda hecha mientras cuesta casi nada; la pantalla de la bitácora se diseña después de ver una jornada real.
- *Pagas:* tres PR en vez de uno; entre la 2 y la 3 el día existe pero la compradora solo ve un chip y un aviso.

**Plan B: todo junto en un PR.**
- *Ganas:* una sola migración y un solo ensayo.
- *Pagas:* 4 archivos que otra rama también toca, 3 migraciones y 5 pantallas en un PR; si algo falla, no se puede publicar nada.

**Plan C (descartado por Felipe en la pregunta 8): bitácora como vista agrupada por fecha, sin tabla nueva.**
- *Ganas:* sin migración.
- *Pagas:* no hay dónde guardar el presupuesto por compradora ni su historial.

Decide Felipe.

## 9 · Referentes de ERP y futuro

- *Futuro (no cuenta entre las 12):* sugerir cuánto comprar por proveedor según la jornada anterior (cuando haya jornadas); hoy no hay datos. `[inferido]`
- *Futuro:* una «lista de compra del día» que baje del plan de campaña a la jornada. Hoy el plan es por categoría y campaña, no por día. `[inferido]`
- Los referentes de memoria (Odoo y NetSuite tienen órdenes de compra y planificador de recepción por proveedor) **no se verificaron** y no se citan como evidencia.

## 10 · Fuera de esta pantalla

**La compradora y quien registró serán personas distintas desde el día uno, pero la deuda con el proveedor, la sede que la carga y «Mi fondo» siguen atados solo a quien registró.** Dos agentes lo encontraron por separado y la verificación lo confirmó: son 5 sitios que comparan contra `creada_por`, 2 de ellos hacen cumplir la regla «quien compra no recibe» y la compradora del día podría recibir lo que compró. Hay que decidirlo antes de construir (#2). Otros hallazgos de menor consecuencia que no se preguntaron: (a) la rama sin PR que choca (#1); (b) `getProveedor` no distingue «no hay datos» de «no puedes verlos» (#5); (c) el caso de Gamarra de pagar al contado antes del papel no tiene salida (#8); (d) no existe fusionar proveedores (#7, #12); (e) una factura que cubre dos órdenes no se puede registrar (un comprobante = una orden).

## 11 · Líneas propuestas para el backlog

- [ ] `[pantalla:compras-ordenes-nueva]` #1 Coordinar con la rama «Comprar desde Análisis» antes de tocar NuevaOrdenCompra — S
- [ ] `[pantalla:compras-ordenes-nueva]` #2 Separar quién compra de quién registró y decidir quién manda (deuda, sede, regla 17) — M
- [ ] `[pantalla:compras-ordenes-nueva]` #3 Día de compra: ficha, presupuesto con historial y orden obligatoriamente dentro de un día — L
- [ ] `[pantalla:compras-ordenes-nueva]` #4 Decidir el corte en tres entregas — S
- [ ] `[pantalla:compras-ordenes-nueva]` #5 Datos bancarios: «no se ve» no se dice «no hay» — S/M
- [ ] `[pantalla:compras-ordenes-nueva]` #6 Prefiltro de categorías y marcas por proveedor — M
- [ ] `[pantalla:compras-ordenes-nueva]` #7 Registrar proveedor desde la orden — M
- [ ] `[pantalla:compras-ordenes-nueva]` #8 «Pagó X de Y» por proveedor y día + pago antes del papel — L
- [ ] `[pantalla:compras-ordenes-nueva]` #9 «Cómo pagarle» con titular primero y aviso de doble pago — S/M
- [ ] `[pantalla:compras-ordenes-nueva]` #10 Vista Bitácora — L
- [ ] `[pantalla:compras-ordenes-nueva]` #11 Celular a 375 px para Órdenes de compra — S
- [ ] `[pantalla:compras-ordenes-nueva]` #12 *(bajo valor)* Una alta rápida de proveedor y fusión de duplicados — M

## Decididas por Felipe después del informe (2026-10-21)

1. **Quién manda:** **la compradora del día** (deuda, sede y regla «quien compra no recibe»); `creada_por` sigue siendo solo la firma y la regla 17 excluye a ambas. Tarea #2.
2. **Datos bancarios:** **se suma `ordenes_compra` a `fn_puede_ver_datos_bancarios()`** (el aviso de cambio de cuenta al líder ya existe). Tarea #5.
3. **Pagar al contado antes del papel:** **«Sin comprobante» pagada + `completar_papel_de_compra`** (opción A). Tarea #8. Dinero: la función se ensaya antes de pegarse.
4. **Corte:** **tres entregas** (formulario → estructura del día → bitácora). Tarea #4.

## Decisiones abiertas (de Felipe)

Si no responde, se ejecuta lo recomendado.

3b. **Permiso para pagar desde la bitácora:** quien solo tiene Órdenes de compra paga al contado desde la orden (decisión 42) y el pago a crédito posterior sigue exigiendo Por pagar (recomendado: no cambia nada de dinero). Dar «registrar pago» a Órdenes de compra sería un permiso nuevo de dinero.
4. **«Recordar»:** quitar la casilla (recomendado) o mantenerla y escribir `marca_proveedores` / un vínculo nuevo.
5. **La marca obligatoria sin salida** (decisión 4): crear la marca desde la orden (otro permiso de líder que se abre) o una marca «Sin marca» sembrada (choca con `pideDejarVacio`).
6. **El presupuesto se mide** contra lo pedido, lo facturado o lo pagado, con o sin IGV, descontando lo anulado y lo devuelto.
7. **Regla de 7 días** para un día ya abierto (si una orden nueva a un día de hace 8 días se rechaza), y si hay excepción de Admin.
8. **El nombre «Presupuesto»:** ya existe en Finanzas (`lib/presupuesto.ts`, `fn_presupuesto_vs_real`); en pantalla se podría llamar «Plata para hoy».
9. **Si `/compras/ordenes*` entra a «Celular obligatorio»** (hoy es costumbre, no regla).
10. **Taller e insumos:** «toda orden pertenece a un día» se aplica a `ordenes_compra` (mercadería), **no** a las órdenes de insumos del Taller (`OI-…`, decisión 29, fondo propio). Confirmar.

## Correcciones a los informes tras la verificación (8 revisores)

De 34 afirmaciones revisadas, 26 se confirmaron tal cual (varias con un matiz que ya está en el cuerpo del informe), 8 resultaron parciales y ninguna fue refutada por completo. **Corregidas:**
- `registrar_proveedor` **no** exige solo `fn_es_lider()`: desde `20260923140000` pide `fn_puede_gestionar_proveedores()` (líder o rol con el módulo Proveedores); `registrar_proveedor_de_gasto` pide líder o ubicaciones de Gastos. Ninguna sirve a quien solo tiene Órdenes de compra (R1).
- `NuevaMarcaForm.tsx` usa `registrar_proveedor`, no `registrar_proveedor_de_gasto` (K4).
- El aviso `completar` de Inicio es de **productos**, no de proveedores; no hay hoy un aviso de proveedores incompletos (R4).
- El padrón no siempre responde 200: 400, 401, 403, 429 (más de 60 por minuto) y 503; y hay una cuarta fuente, `comprobantes.cliente_nombre`, que responde `fuente: "historial"` (R5).
- La decisión 17 compara contra `creada_por` en **5** sitios, no 4; solo 2 hacen cumplir la regla (M2). La sede del gasto del viaje sale de la sede asignada del actor o de la gestora de la primera orden (M3).
- Un pago «sin papel» sí existe, vía «Sin comprobante»; lo que no existe es un pago sin fila en `compras` (P1). El permiso de Por pagar también lo tiene el líder (P3).
- La recepción escribe `marca_proveedores` solo al crear una prenda nueva y con el permiso del módulo Recibir (security definer); un envío sin aviso no escribe (R6).
- Solo el Plan de campaña usa `<Pestanas href>` con rutas hermanas; Fondos es una sola página (L3). `pista` es un subcampo de `crear` en `ComboBuscable` (K1).
- La definición de `fn_puede_ver_datos_bancarios` ya no es «cualquiera con cuenta» (decisión D-27 queda estrechada desde el 13-oct); las filas de `SESIONES-ACTIVAS.md` sobre este tema ya están fusionadas, y **la rama viva no está en el tablero** (Q2).

## Lo que el repo exige para una pantalla/modal nueva (qué prueba falla si se olvida)

| Exigencia | Qué tocar | Qué falla |
|---|---|---|
| Guía de foco | `lib/guia-de-foco-pantallas.ts` (la bitácora `no-aplica` con motivo; cada hoja con campos, `aplicada`); `camposDeLaOrden` y su prueba | `guia-de-foco.test.ts` |
| Guía interactiva | `lib/guias/pantallas/compras.ts` (`GUIA_BITACORA`; paso `dia` en `PASOS_FORMULARIO_ORDEN`), `registro.ts`, un `data-guia` por pieza, `guias:huella` de 4 pantallas, y sumar «abrir el dia», «fijar», «poner» a `VERBOS_QUE_ESCRIBEN` (si no, el piloto abriría un día real) | `guias.test.ts`, `reglas.test.ts` |
| Módulos | No agregar clave: actualizar el `incluye` de `ordenes_compra` | `modulos.test.ts` solo si nace un módulo |
| Modo oscuro | Solo tokens; escenarios en `tema/escenarios/registro.mjs`; correr `tema:auditar` | `tema-colores.test.ts`, `tema-tokens.test.ts` |
| Una pieza | `Pestanas`, `Tabla`, `BarraAvance`, `Chip`, `BotonCopiar`, `Casilla`, `TituloSeccion`, `Modal tamano`, `Boton cargando` | `unificar.test.ts` |
| Sugerencias | Placeholder del RUC con `// sugerir-fijo:` | `sugerir.test.ts` |
| Loader (ADR-0149) | Lecturas desde el navegador con prefijo `fn_`, `get_` o `buscar_` | `espera-reglas.test.ts` |
| Movimiento y ancho | `<Modal>`, sin overlay propio; llenar a 1440 y 1920 con franjas lado a lado | `hojas-escape.test.ts`, `ancho-completo.test.ts` |
| Código muerto | Toda regla pura nueva la importa su página | `pnpm knip` |
| Pruebas de la base | `scripts/pruebas/proveedor_de_orden.mjs` y `ordenes_compra.mjs` (casos nuevos: anulada no cuenta, sin módulo da 42501); las 18 suites con inserts directos | CI |

Además, sin prueba que lo vigile: `docs/ARQUITECTURA.md`, `pnpm datos:comparar`, `pnpm reservar`, `/abrir-pr`, las claves nuevas en `acciones_sin_responsable` con su espejo `lib/responsable-omitido.ts`, y una adenda al ADR-0362 (el día de compra y el cambio de «Recordar»).

## Consulta SQL para producción (solo lectura; Felipe la corre y pega el resultado)

> No se ha ejecutado. Solo conteos, sin nombres. Pégala en el SQL Editor del proyecto de Dynamic. Las columnas se comprobaron contra el diccionario de producción del 21-oct. Mide lo que decide el diseño: cuántos proveedores tendrían categoría derivada el día 1 (tarea #6), cuántas órdenes hay realmente (#3) y cuántos proveedores están sin RUC o sin datos de pago (#7, #9).

```sql
-- ADR-0362 · Día de compra y prefiltro por proveedor · SOLO LECTURA · SQL Editor de PRODUCCIÓN (proyecto cayla-dynamic)
-- Una sola sentencia: devuelve filas (bloque, clave, n). Sin nombres ni datos personales.
with
hoy as (select retail.fn_hoy_lima() as d),
prov as (
  select pr.id, pr.activo,
         exists (select 1 from retail.marca_proveedores mp where mp.proveedor_id = pr.id) as con_marca,
         coalesce(cardinality(pr.rubros), 0) > 0 as con_rubros,
         coalesce(btrim(pr.ruc), '') = '' as sin_ruc,
         (coalesce(btrim(pr.banco), '') <> '' or coalesce(btrim(pr.cuenta_bancaria), '') <> ''
          or coalesce(btrim(pr.cci), '') <> '' or coalesce(btrim(pr.celular_billetera), '') <> ''
          or coalesce(cardinality(pr.billeteras), 0) > 0) as con_pago
  from retail.proveedores pr
),
pares_producto as (
  select distinct p.proveedor_id, p.categoria_id
  from retail.productos p
  where p.proveedor_id is not null and p.categoria_id is not null and not p.es_prueba
),
pares_marca as (
  select distinct mp.proveedor_id, p.categoria_id
  from retail.marca_proveedores mp
  join retail.productos p on p.marca_id = mp.marca_id
  where p.categoria_id is not null and not p.es_prueba
),
pares_lote as (
  select distinct l.proveedor_id, p.categoria_id
  from retail.lotes l
  join retail.movimientos m on m.lote_id = l.id
  join retail.variantes v on v.id = m.variante_id
  join retail.productos p on p.id = v.producto_id
  where p.categoria_id is not null
),
pares_compra as (
  select distinct c.proveedor_id, coalesce(ci.categoria_id, p.categoria_id) as categoria_id
  from retail.compras c
  join retail.compra_items ci on ci.compra_id = c.id
  left join retail.productos p on p.id = ci.producto_id
  where coalesce(ci.categoria_id, p.categoria_id) is not null
),
pares_orden as (
  select distinct o.proveedor_id, i.categoria_id
  from retail.ordenes_compra o
  join retail.orden_compra_items i on i.orden_compra_id = o.id
  where o.estado <> 'anulada'
),
fuentes as (
  select 'a) productos (su proveedor)'::text as fuente, proveedor_id, categoria_id from pares_producto
  union all select 'b) marcas del proveedor y sus productos', proveedor_id, categoria_id from pares_marca
  union all select 'c) lotes recibidos', proveedor_id, categoria_id from pares_lote
  union all select 'd) compras (facturas)', proveedor_id, categoria_id from pares_compra
  union all select 'e) órdenes de compra', proveedor_id, categoria_id from pares_orden
),
todos as (select distinct proveedor_id, categoria_id from fuentes),
por_proveedor as (
  select pr.id, pr.activo, count(t.categoria_id) as cats
  from retail.proveedores pr
  left join todos t on t.proveedor_id = pr.id
  group by pr.id, pr.activo
),
dias_implicitos as (
  select o.creada_por, o.fecha_emision, count(*) as ordenes
  from retail.ordenes_compra o
  group by o.creada_por, o.fecha_emision
)
select r.bloque, r.clave, r.n
from (
  select 'A0 órdenes de compra'::text as bloque, 'total'::text as clave, count(*)::bigint as n
  from retail.ordenes_compra
  union all
  select 'A1 órdenes por estado', o.estado, count(*) from retail.ordenes_compra o group by o.estado
  union all
  select 'A2 órdenes por mes de emisión', to_char(o.fecha_emision, 'YYYY-MM'), count(*)
  from retail.ordenes_compra o group by to_char(o.fecha_emision, 'YYYY-MM')
  union all
  select 'A3 órdenes y compras', v.clave, v.n
  from (select
          (select count(distinct c.orden_compra_id) from retail.compras c where c.orden_compra_id is not null) as con_compra,
          (select count(*) from retail.compras c where c.orden_compra_id is not null) as compras_de_orden,
          (select count(*) from retail.ordenes_compra o
            where o.estado = 'generada'
              and not exists (select 1 from retail.compras c where c.orden_compra_id = o.id)) as sin_compra
       ) t
  cross join lateral (values
    ('órdenes con alguna compra ligada', t.con_compra),
    ('compras que nacen de una orden', t.compras_de_orden),
    ('órdenes generadas SIN compra ligada', t.sin_compra)
  ) as v(clave, n)
  union all
  select 'A4 días implícitos (quién × fecha de emisión)', v.clave, v.n
  from (select
          (select count(*) from dias_implicitos) as pares,
          (select coalesce(max(ordenes), 0) from dias_implicitos) as max_ordenes,
          (select count(*) from (select fecha_emision from dias_implicitos
                                  group by fecha_emision having count(*) > 1) z) as fechas_con_2_personas,
          (select count(distinct creada_por) from retail.ordenes_compra) as personas,
          (select count(*) from retail.ordenes_compra o cross join hoy
            where o.fecha_emision < hoy.d - 7) as emision_hace_mas_de_7_dias
       ) t
  cross join lateral (values
    ('pares (quién creó, fecha)', t.pares),
    ('máximo de órdenes en un par', t.max_ordenes),
    ('fechas con 2 o más personas creando', t.fechas_con_2_personas),
    ('personas distintas que crearon órdenes', t.personas),
    ('órdenes con emisión de hace más de 7 días', t.emision_hace_mas_de_7_dias)
  ) as v(clave, n)
  union all
  select 'B1 proveedores', v.clave, v.n
  from (select
          count(*) as total,
          count(*) filter (where activo) as activos,
          count(*) filter (where con_marca) as todos_con_marca,
          count(*) filter (where activo and con_marca) as activos_con_marca,
          count(*) filter (where activo and con_rubros) as activos_con_rubros,
          count(*) filter (where sin_ruc) as todos_sin_ruc,
          count(*) filter (where activo and sin_ruc) as activos_sin_ruc,
          count(*) filter (where activo and con_pago) as activos_con_pago,
          count(*) filter (where activo and sin_ruc and not con_pago) as activos_sin_ruc_y_sin_pago
        from prov) t
  cross join lateral (values
    ('total', t.total),
    ('activos', t.activos),
    ('con al menos una marca vinculada (todos)', t.todos_con_marca),
    ('con al menos una marca vinculada (activos)', t.activos_con_marca),
    ('con rubros (activos)', t.activos_con_rubros),
    ('sin RUC (todos)', t.todos_sin_ruc),
    ('sin RUC (activos)', t.activos_sin_ruc),
    ('con banco, cuenta, CCI o billetera (activos)', t.activos_con_pago),
    ('sin RUC y sin ningún dato de pago (activos)', t.activos_sin_ruc_y_sin_pago)
  ) as v(clave, n)
  union all
  select 'C1 pares (proveedor, categoría) por fuente', f.fuente, count(*) from fuentes f group by f.fuente
  union all
  select 'C1 pares (proveedor, categoría) por fuente', 'z) UNIÓN sin repetir', count(*) from todos
  union all
  select 'C1b proveedores distintos por fuente', f.fuente, count(distinct f.proveedor_id) from fuentes f group by f.fuente
  union all
  select 'C1b proveedores distintos por fuente', 'z) UNIÓN sin repetir', count(distinct t.proveedor_id) from todos t
  union all
  select 'C2 categorías derivables por proveedor activo', s.cubeta, count(*)
  from (select case when p.cats = 0 then 'a) 0'
                    when p.cats = 1 then 'b) 1'
                    when p.cats <= 3 then 'c) 2 a 3'
                    when p.cats <= 6 then 'd) 4 a 6'
                    when p.cats <= 12 then 'e) 7 a 12'
                    else 'f) 13 o más' end as cubeta
        from por_proveedor p where p.activo) s
  group by s.cubeta
  union all
  select 'C3 resumen de categorías', v.clave, v.n
  from (select
          (select count(*) from retail.categorias c where c.activo) as activas,
          (select count(distinct t2.categoria_id) from todos t2) as alcanzadas,
          (select coalesce(max(p.cats), 0) from por_proveedor p where p.activo) as maximo_por_proveedor,
          (select coalesce(round(percentile_cont(0.5) within group (order by p.cats))::bigint, 0)
             from por_proveedor p where p.activo) as mediana_por_proveedor,
          (select count(*) from por_proveedor p join prov q on q.id = p.id
            where p.activo and q.con_marca and p.cats = 0) as activos_con_marca_y_sin_categoria
       ) t
  cross join lateral (values
    ('categorías activas en el catálogo', t.activas),
    ('categorías alcanzadas por la unión', t.alcanzadas),
    ('máximo de categorías de un proveedor activo', t.maximo_por_proveedor),
    ('mediana de categorías de un proveedor activo', t.mediana_por_proveedor),
    ('activos con marca pero 0 categorías derivables', t.activos_con_marca_y_sin_categoria)
  ) as v(clave, n)
) r
order by r.bloque, r.clave;
```

## Inventario de elementos

| Zona | Elemento | Qué hace | Veredicto | Evidencia |
|---|---|---|---|---|
| Cabecera | Flecha, sede y fecha, título «Nueva orden de compra», frase | Orienta y dice qué viene después | bien | `[visto]` |
| Cabecera | N.º `OC-000001` y total `S/ 1,500.00` | Muestra el número reservado y el total vivo | bien | `[visto]` |
| Datos | Proveedor (combo con buscador) | Elige a quién se le pide | ajustar: no filtra; falta «Registrar proveedor»; nombre cortado | `[visto]` |
| Datos | Llega a | Sede de destino | bien | `[visto]` |
| Datos | Entrega estimada «SIGUE AQUÍ si la sab…» | Fecha opcional | ajustar: el texto se corta | `[visto]` |
| Datos | Nota (opcional) | Texto libre | bien | `[visto]` |
| Líneas | Categoría / Marca (combos) | Qué se pide | ajustar: sin prefiltro; marca única se autollena | `[visto]` · `[código :188-196]` |
| Líneas | Descripción, Cantidad, Precio u., Descuento (% o S/) | Detalle y cuenta | bien | `[visto]` |
| Líneas | ✕ de quitar línea | Quita una línea | ajustar: 32 px, sin deshacer | `[código :557, :207]` |
| Líneas | «+ Agregar otra prenda» | Suma una línea | bien | `[visto]` |
| Pie | Total y botón de guardar | Cierra la orden | bien | `[visto]` |
| Falta | Día de compra, quién compra, presupuesto, pagado, «Cómo pagarle», «Registrar proveedor» | — | falta | pedido de Felipe |

## Historial

| Fecha | Modo | Cumplimiento | Relevancia | Tareas cerradas de las 12 anteriores |
|---|---|---|---|---|
| 2026-10-21 | completo | 6/10 | 7/10 (Soporte) | — (primer análisis de esta pantalla) |
