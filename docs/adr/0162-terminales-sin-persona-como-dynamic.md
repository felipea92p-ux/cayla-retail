# ADR-0162 — Terminales sin persona, como en Dynamic

**Fecha:** 2026-09-22 · **Estado:** **aprobado por Felipe el 2026-09-22** (plan y spike)
(`docs/maquetas/responsable-y-roles-spike-2026-09/`, pantallas 5 y 6). Nada construido ·
**Reemplaza** la identidad del ADR-0160 (cada terminal = una persona de Dynamic). **Se apoya** en el ADR-0161
(el combo Responsable) · **Origen:** pedido de Felipe, 2026-09-22: «replicar lo de Dynamic con las terminales sin persona».

## El problema

El ADR-0160 hizo de cada terminal una **persona de Dynamic**. Hubo que hacerlo así porque retail averigua quién opera
buscando su persona. Eso trae tres costos:
- Hay que crear 6 personas falsas en Dynamic, que después aparecen en su directorio, en el kiosco de marcación y en la planilla.
- Una «persona» que en realidad es un aparato termina firmando ventas y movimientos.
- Esconderlas exige tocar el código de Dynamic.

El ADR-0160 descartó la alternativa, «la terminal como usuario sin persona», porque obligaba a reescribir unas 81 funciones.

Dos cosas cambiaron desde entonces:
1. Con el ADR-0161, **toda operación ya elige a su responsable**, una persona real y presente en la tienda. Esa persona
   es quien debe firmar, no el aparato.
2. Se midió en producción cuánto hay que reescribir. Es menos de lo que se creía y es casi todo mecánico (ver «Cuánto se reescribe»).

## Cómo lo hace Dynamic (verificado en su repo y en producción, 2026-09-22)

- **La tabla `public.terminales`:** cada fila es un dispositivo con `sede_id`, `nombre_dispositivo`, un `auth_user_id`
  propio y `activo`. Tiene el candado `terminal_activo_con_dueno`: una terminal activa siempre tiene su cuenta.
- **La cuenta del dispositivo** es un usuario normal de Auth (`terminal-tru@cayla.dev`) con contraseña. Se crea con un
  script de un solo uso (`scripts/setup-terminales-prod.mjs`, con la llave de servicio), **no desde una pantalla**. El
  dispositivo inicia sesión en «Vincular este dispositivo».
- **Una función distingue la sesión de una terminal de la de una persona:** `fn_sede_actual_terminal()`. Si quien opera
  es una terminal activa, devuelve su sede.
- **Cada registro guarda las dos identidades:** `marcajes.persona_id` (quién) y `terminal_id` (desde qué aparato).
- **La terminal no puede leer `personas`** (Dynamic lo cerró en la migración 0291, porque se veían el DNI y el sueldo).
  Solo ve una vista con nombre y foto.
- **Sin PIN desde la migración 0375:** se toca el nombre y listo. **Sin pantalla de administración:** se desactiva con SQL.
- **Hoy hay 4 terminales en producción** y ninguna usa PIN.

## La decisión

**Retail tiene su propia tabla `retail.terminales`, igual a la de Dynamic.** Una terminal es un usuario de Auth **sin
persona**, fijo en una tienda y con un tipo (ventas o administrativa; más adelante, un rol del ADR-0161). **Toda
escritura que haga una terminal se firma con el responsable elegido en el combo.** El aparato queda anotado aparte,
en `terminal_id`.

Qué se copia de Dynamic y qué no:

| De Dynamic | En retail |
|---|---|
| Tabla `terminales` con cuenta de Auth propia | ✔ `retail.terminales`, **separada** de `public.terminales`. Retail solo escribe en sus propias tablas (frontera D-33), y las terminales de asistencia no son las de venta. |
| `terminal_activo_con_dueno` | ✔ El mismo candado. |
| `fn_sede_actual_terminal()` | ✔ `retail.fn_terminal_actual()`, que devuelve la terminal (id, tienda, tipo). |
| El registro guarda persona y aparato | ✔ `usuario_id` = el **responsable** (una persona real) y `terminal_id` = el aparato. |
| La terminal no lee `personas` | ✔ La lista del combo sale de `fn_asesoras_de_turno`, que es security definer y devuelve solo el nombre corto. |
| Crear la cuenta con un script | ✔ `pnpm terminales:crear`, que corre Felipe y muestra la clave **una sola vez**. |
| Sin pantalla de administración | ✘ **Retail sí tiene una:** Colaboradores ▸ Terminales, para ver, desactivar y reactivar. Desactivar corta la sesión en el acto. Crear y cambiar la clave quedan en el script. |
| Sin PIN | ✔ Coincide con el ADR-0161 (A2). |
| Modo sin conexión | Retail ya tiene ventas sin conexión (`lib/ventas-offline.ts`). El responsable viaja en la venta guardada; ver «Abierto». |

### Por qué se crea con un script y no desde una pantalla

Crear un usuario de Auth exige la **llave de servicio**, que salta todo candado (RLS). La web de retail no la usa hoy
en ningún lado. Meterla para algo que pasa 6 veces en total (una por terminal) abre un riesgo permanente por una
comodidad ocasional. Dynamic llegó a la misma conclusión. La pantalla hace lo frecuente (ver, desactivar); lo raro
(crear, cambiar la clave) lo hace el script.

## Cuánto se reescribe (medido en producción, 2026-09-22)

De las 243 funciones de `retail`, **75** buscan a la persona con `auth_user_id = auth.uid()`:

| Grupo | Cuántas | Qué se hace |
|---|---|---|
| **Firmar el registro:** `select id into v_persona from [public.]personas where auth_user_id = auth.uid();` (y sus variantes `v_quien`, `v_persona_id`, `v_usuario_id`) | **~65** | Reemplazo **mecánico** por `v_persona := retail.fn_actor_persona_id();`, inyectado desde `pg_get_functiondef` y exigiendo el número exacto de ocurrencias (patrón del ADR-0160: si una función cambió, aborta sin tocar nada). |
| **Ayudantes de permisos** (`fn_es_lider`, `fn_es_terminal`, `fn_mi_terminal`, `fn_ubicacion_actual_persona`, `fn_persona_actual_resumen`, …) | **8** | A mano, uno por uno. |
| Casos sueltos (`fn_colaboradores` marca «Tú»; un `(select id … )` en línea) | **2** | A mano. |

**Lo del ADR-0160 no se pierde.** Las 5 capacidades `fn_puede_*()` y las 23 funciones que las consultan **no se tocan**.
Solo cambia de dónde sacan su respuesta `fn_es_terminal(tipo)` y `fn_mi_terminal()`: de `retail.terminales` en vez de
`colaboradores.terminal`. Por eso se diseñaron como punto único.

## Las piezas

1. **`retail.terminales`:** `id`, `ubicacion_id` (solo tiendas), `nombre` («Terminal Ventas TRU»), `tipo`
   (`ventas | administrativa`), `auth_user_id` (único, referencia a `auth.users`), `activo`, `creada_por`,
   `creada_at`, `desactivada_por`, `desactivada_at`.
   - Candados: `activo ⇒ auth_user_id is not null`; una terminal de cada tipo **activa** por tienda.
   - Nunca se borra: se desactiva.
2. **`fn_terminal_actual()`:** la terminal activa de la sesión, o nada. Es security definer.
3. **`fn_actor_persona_id()`**, el corazón del cambio:
   - Con la sesión de una **terminal**, lee `x-responsable` del encabezado de la petición y exige que sea una persona
     activa, con acceso a retail y **presente ahora en la tienda de la terminal**. Si no, lanza un error. Nunca devuelve
     vacío en silencio.
   - Con la sesión de una **persona**, aplica la misma regla del ADR-0161 si la operación es de tienda. Si no, devuelve
     la propia persona.
4. **La sede y los permisos de una terminal:**
   - `fn_ubicacion_actual_persona()` devuelve la tienda de la terminal, así `fn_puede_operar_ubicacion` funciona sin
     cambios.
   - `fn_es_lider()` es falso para una terminal, **aunque la responsable elegida sea una líder**. Los permisos son de la
     **cuenta**, no de quien firma. Si no, elegir a Carmen (líder) en el combo le daría a la terminal los poderes de líder.
5. **`terminal_id`**, que admite vacío, en `ventas`, `movimientos`, los movimientos y cierres de caja, `transferencias`
   y `conteos`: desde qué aparato se hizo.
   **Esto simplifica el ADR-0161:** ya no hace falta la columna `responsable_id`, porque `usuario_id` pasa a ser el
   responsable.
6. **La web:**
   - `requirePersonaActualV2` gana una rama de terminal: tienda fija, tipo, nombre del aparato, y ya no manda a
     `?error=sin_persona`.
   - El pie del menú lateral muestra el aparato, no una persona.
   - La terminal de ventas aterriza en `/vender` (como hoy).
7. **Colaboradores ▸ Terminales:** una lista con tienda, tipo, estado y última actividad, más **Desactivar / Reactivar**.
   Reemplaza a la pestaña del ADR-0160.
8. **Retiro de lo del ADR-0160:**
   - `colaboradores.terminal` tiene 0 filas en producción (verificado). Se le pone el candado `terminal is null`, y
     `agregar_terminal` se retira.
   - **No hay que crear las 6 personas en Dynamic.** Con eso queda resuelta la pregunta de esconderlas allá: dejan de
     existir en Dynamic.

## Fases (cada una se puede ver funcionando; cada paso a producción se confirma antes)

| # | Fase | Cómo se verifica |
|---|---|---|
| F0 | Este ADR y las pantallas 5 y 6 del spike | Felipe aprueba |
| F1 | **Prueba del encabezado:** una RPC de juguete lee `x-responsable` a través de PostgREST en local y en una rama de Supabase | Si el encabezado no llega, se cambia de mecanismo **antes** de construir lo demás |
| | **F1 HECHA (2026-09-22): el encabezado llega.** Local: `curl` y `supabase-js` con `.rpc(...).setHeader('x-responsable', …)` → la función lo lee de `request.headers`; sin él, llega vacío. Producción: la pregunta previa del navegador (CORS) a `vovjyyiafkxteijimpuy.supabase.co` responde `access-control-allow-headers: …,x-responsable` (sin tocar datos). | |
| | **F2 HECHA en local:** `20260923010000_terminales_sin_persona.sql` y `pnpm pruebas:terminales-sin-persona` (34/34) sobre una copia aislada del local (`cayla_f2`), para no tocar la base compartida. | |
| | **F3 HECHA en local (2026-09-22):** `20260923100000_actor_firma_las_operaciones.sql`, 65 funciones firman con `fn_actor_persona_id` (36 de tienda, 29 no). Se cotejó contra producción (solo lectura): las funciones que allí buscan a la persona están todas clasificadas (se sumaron `archivar_serie_comprobante` y `registrar_gasto`, que solo existen allá). Las listadas que producción no tiene (apartar stock, comprador de tienda) se omiten con aviso: **al pegar sus migraciones, volver a pegar la F3.** `pruebas:actor-firma` 28/28, `pruebas:terminales` (reescrita) 74/74. | |
| F2 | Migración base: `retail.terminales`, `fn_terminal_actual`, `fn_actor_persona_id`, `terminal_id`, y el nuevo interior de `fn_es_terminal` / `fn_mi_terminal` / `fn_ubicacion_actual_persona` | `pnpm pruebas:terminales` adaptado: una terminal sin persona abre la caja de su tienda y no la de otra |
| F3 | Reemplazo mecánico de las ~65 funciones, más las 10 a mano | Prueba nueva: cada una de las 75, llamada como terminal con un responsable presente, firma con ese responsable. Sin responsable o con uno ausente, se rechaza |
| F4 | Web: la rama de terminal, el pie del menú, Colaboradores ▸ Terminales, el combo Responsable (ADR-0161) mandando el encabezado | Demo en el navegador con una terminal de verdad |
| | **F4a CONSTRUIDA (rama `claude/adr-0162-f4a-terminales`, sin verificar en navegador):** la sesión de una terminal entra por el mismo `requirePersonaActualV2` (su fila ya viene de `fn_persona_actual_resumen`); `persona.terminal` es el dato de «es un aparato». El pie del lateral muestra el aparato («Terminal Ventas TRU», «APARATO · TIENDA TRU») y no abre «Mi perfil». Inicio no la saluda por «primer nombre». Una terminal desactivada ve su propio aviso en `/login`. Colaboradores ▸ Terminales lee `fn_terminales()` con Desactivar / Reactivar y sin alta desde la pantalla. Se retiró la lectura de `colaboradores.terminal`. El combo Responsable queda fuera: es F4b. | |
| F5 | `pnpm terminales:crear` (lo corre Felipe), retiro de `agregar_terminal`, diccionario (`datos:generar:produccion`) | Las 6 terminales entran y venden en TRU/AQP |
| | **Script CONSTRUIDO, sin correr contra ningún entorno:** `scripts/terminales/crear.mjs` (uso en `scripts/terminales/README.md`), con pruebas de sus partes puras en `pnpm terminales:probar`. | |

**Estimación:** 4 a 6 sesiones. F3 es la más larga, pero es mecánica y la cubren las pruebas.

## Decididas por Felipe al construir (2026-09-22)

- **Descuentos desde la terminal: sin tope y sin autorización.** El tope sigue siendo de la CUENTA (una persona con su
  propia cuenta conserva su tope de D-67); la terminal no tiene tope (`NULL`, como un líder). No se toma el tope del
  responsable, porque sin PIN cualquiera podría elegir a quien más tope tiene.
- **Descuento a mano sobre una prenda (el que usa el Punto de venta): la terminal PIDE CÓDIGO de descuento**, igual
  que una colaboradora (`venta_descuento_requiere_codigo`). El código lo crea una líder y fija hasta cuánto se rebaja:
  es el único límite en un aparato que usa cualquiera sin PIN. (Felipe, 2026-09-22, opción a.)
- **Apartados: la terminal libera siempre** (entregar la prenda o soltar un apartado vencido). Una persona con su
  cuenta sigue con la regla de hoy: quien apartó o una líder.
- **Operaciones de varios pasos** (conteo, recepción de traslado): el combo se vacía al cerrar la operación completa,
  no después de cada prenda.

## Abierto

1. ~~Ventas sin conexión~~ **Decidido (Felipe, 2026-09-22):** se valida contra la **hora de la venta** (como
   `timestamp_cliente` en Dynamic), no contra la de la sincronización.
2. **Si el encabezado no pasa por PostgREST (F1)**, el plan B es un parámetro `p_responsable` con valor por defecto en
   cada RPC. Tiene más costo (cambian las firmas, ADR-0026), pero es seguro.
3. **Quién puede desactivar una terminal:** solo el líder, como todo lo de Colaboradores (ADR-0150, decisión 3).

## Lo que se rompería sin esto

- Seis personas falsas en Dynamic: en su directorio, en el kiosco y en la planilla.
- Un aparato firmando ventas en lugar de la persona que atendió.
- Si alguien reusara la cuenta personal de otra para operar la terminal, lo que hiciera quedaría a nombre de esa persona.

Con la terminal sin persona, **el aparato nunca firma**: firma quien estaba presente y eligió su nombre.

## Referencias

ADR-0160 (terminales como persona, reemplazado en la identidad), ADR-0161 (responsable y roles), ADR-0153
(`fn_asesoras_de_turno`), ADR-0026 (firmas que cambian dejan sobrecargas), Dynamic: `0001_init.sql:130`,
`0202` (`terminal_activo_con_dueno`), `0291` (la terminal sin lectura de `personas`), `0375` (sin PIN),
`scripts/setup-terminales-prod.mjs`.
