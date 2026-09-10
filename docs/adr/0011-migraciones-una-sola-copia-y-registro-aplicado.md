# ADR-0011 — Una sola copia de cada migración: baseline desde producción y `retail.migraciones_aplicadas` con hash

**Fecha:** 2026-09-05
**Estado:** Parcialmente escrito — sale de la auditoría completa del 2026-09-05.
La pieza del **registro** está escrita en
`supabase/unificacion/25_migraciones_aplicadas.sql`, pendiente de pegar en
producción. La pieza del **baseline** (mover el historial a `_historico/` y
tomar la foto de producción) no está escrita y requiere aprobación de Felipe
antes de tocar `supabase/`.

## Contexto

Cada migración se escribe hoy **dos veces**: `supabase/migrations/*.sql` (sin
prefijo, para el Postgres local, hasta la `0038`) y `supabase/unificacion/*.sql`
(schema-calificada, para pegar a mano en el SQL Editor de producción, hasta la
`21`). La numeración además colisiona: la `0019` local no es la `19` de
unificacion, y las 32 funciones llevan `set search_path` escrito en su
definición, que el seed local tiene que reescribir en bloque
(`supabase/seed.sql`) porque renombrar el schema no reescribe ese texto.

La transcripción a mano ya costó cinco divergencias reales, tres documentadas y
dos vivas hoy:

- **ADR-0004** — `recibir_lote` perdió validación de sede, `categoria_id` y
  `p_orden_compra_id`.
- **ADR-0006** — `patrimonio_items.categoria` nunca llegó a producción.
- **ADR-0010** — el entorno local no existía porque las dos formas de escribir
  la migración nunca se habían encontrado en la misma máquina.
- **`registrar_gasto`** — producción tiene 6 parámetros
  (`pg_get_function_identity_arguments` → `p_sede_id uuid, p_categoria text,
  p_subtotal numeric, p_igv numeric, p_total numeric, p_especificacion text`) y
  `apps/web/components/RegistrarGastoModal.tsx:56-64` manda 7. La pantalla de
  Egresos entregada el 2026-09-04 (commit `d54b760`) **no puede registrar un
  solo gasto en producción**: `select count(*) from retail.gastos` → 0.
- **`retail.personas`** — el repo la declara `with (security_invoker = true)`
  (`supabase/unificacion/03_candados.sql:15`) y en producción `pg_class` devuelve
  `reloptions = {security_invoker=false}`. La opción se perdió en el camino y
  nadie lo vio; las consecuencias las trata ADR-0012.

Y una tabla que quedó vacía sin que nadie lo notara: `retail.cuentas_contables`
tiene 0 filas contra las 35 que siembra
`supabase/migrations/0020_contabilidad_cimientos.sql:49` —
`unificacion/06_contabilidad_produccion.sql` creó la tabla y no copió el
`insert`. Nadie lo ha visto porque contabilidad todavía no se usa.

**No hay forma de saber qué corrió.** `select count(*) from
information_schema.tables where table_schema='retail' and
table_name='migraciones_aplicadas'` → **0**. Toda esta auditoría tuvo que inferir
el estado probando el *efecto* de cada archivo contra
`information_schema`/`pg_proc`. Esa inferencia tiene un techo que se ve en dos
casos reales: `unificacion/05` y `07` están aplicados pero **no en la versión que
hoy está en el repo** (al `05` le falta el `check (metodo_pago in (...))` de
`0013_finanzas_nucleo.sql:35-36`; al `07` le falta el 7º parámetro).
*"La tabla existe"* no prueba *"corrí este archivo"*.

Sin registro, `docs/BACKLOG.md` es la única fuente de verdad sobre el estado de
producción, y hoy miente en las dos direcciones: sigue pidiendo pegar el `19` de
categorías —que ya está aplicado: `select familia, count(*) from
retail.categorias group by familia` → 37 filas repartidas en las 6 familias,
exactamente la verificación que el propio archivo declara— y ordena pegar el
`16`, que recrearía la sobrecarga fantasma del ADR-0004 (producción ya tiene la
firma de 8 argumentos del `18`, y ni el `16` ni el `18` dropean nada).

Detalle aparte, del mismo agujero: **no existe `unificacion/02_*.sql`**.
`ls supabase/unificacion/` arranca en `01` y salta a `03`, y
`03_candados.sql:3` dice "después del paso 2 (schema retail + sede_meta)". El
DDL que creó el schema `retail` en producción no está versionado en ninguna
parte del repo.

## Decisión

**DECIDÍ: una sola copia de cada migración, con producción como fuente de
verdad, y un registro que se escribe dentro del mismo script que se pega.**

Dos piezas, en este orden:

1. **Baseline.** Mover `supabase/migrations/0001..0038` y todo
   `supabase/unificacion/` a `supabase/migrations/_historico/` (se conservan
   legibles, no se borran), tomar `supabase db dump --schema retail` contra el
   proyecto de Dynamic → `supabase/migrations/0000_baseline_retail.sql`, ya
   calificado y por construcción idéntico a producción. Las dos vistas puente
   (`retail.sedes`, `retail.personas`) salen del baseline y van a
   `supabase/seed.sql` junto con stubs locales de `public.sedes`,
   `public.personas`, `public.fn_rol_actual()` y `public.fn_sede_actual_persona()`
   — dependen de tablas de Dynamic que en local no existen (ADR-0012). Desde
   ahí, cada migración nueva se escribe **una vez**, calificada, corre con
   `npx supabase db reset` y se pega textual en el SQL Editor.
2. **Registro.** `retail.migraciones_aplicadas (archivo text primary key,
   sha256 text not null, aplicada_at timestamptz not null default now(),
   aplicada_por text not null default current_user, nota text)`, con RLS activo
   y **solo** política de SELECT para autenticados: se escribe desde el SQL
   Editor, queda append-only para la app, igual que `movimientos`. **La PK es la
   ruta del archivo**, no un número (la numeración es dual y colisiona), y **el
   hash es del archivo exacto que se pegó**, porque la pregunta útil no es
   "¿corrí el 20?" sino "¿corrí *la versión* del 20 que hoy está en el repo?".
   La línea de registro va **al final del propio `.sql`**, dentro del mismo
   script: aplicar y registrar son una sola operación, imposible de olvidar.

**DESCARTÉ: poner `set search_path to retail, public;` como primera línea de
cada archivo y dejar las 38 migraciones sin prefijo.** Es la opción de una línea
y por eso es tentadora. Se rompe el día que alguien olvida esa línea: el objeto
cae en `public`, **en local funciona igual** —`supabase/config.toml:16` tiene
`public` en `extra_search_path`— y en producción no existe. Es el bug de hoy con
disfraz nuevo, y con la agravante de que la verificación local le da el visto
bueno.

**DESCARTÉ también: reescribir a mano las 38 migraciones con prefijo
`retail.`** — 4.131 líneas tocadas y 51 `set search_path` que revisar, con
riesgo alto de introducir una diferencia nueva mientras se arregla la vieja, y
sin aportar nada sobre el baseline. Es el mismo descarte que ya hizo ADR-0010,
por las mismas razones. **Y `alter database ... set search_path` en una
migración `0000`**: la CLI ya tiene la sesión abierta cuando corre, el cambio no
aplica hasta reconectar, y el resultado depende de si reconecta y en qué orden —
no determinista.

**SE ROMPE SI: se toma la foto del baseline antes de reponer el candado de sede
en `abrir_caja`, `cerrar_caja` y `registrar_venta`.** El baseline congela lo que
hay: bendice como canónica la versión sin candado de esas tres funciones —
`pg_get_functiondef` sobre producción muestra que las tres van del `select ...
into v_caja` al `insert/update` sin una sola línea de `puede_operar_sede`— y el
repo deja de tener registro de que alguna vez fueron más estrictas:
`0012_rpc_valida_sede.sql:75,118,151` pasa a ser "historia" en `_historico/` en
vez de "lo que debe correr". El día que una integrante de AQP cierre la caja de
TRU desde la consola del navegador, el repo va a decir que eso es el
comportamiento correcto. El orden no es preferencia: **primero se repone el
candado (y el `coalesce` de `puede_operar_sede`, ver ADR-0012), después la
foto.**

## Cómo se retro-puebla, sin afirmar de más

Cargar las 17 filas ya aplicadas usando como prueba la misma sonda con la que se
verificó cada una (`to_regclass` para 01/04/05/06/12/17; conteo de vistas para
03; `pg_proc` para 07/08/09; `storage.buckets` para 10; `position()` sobre
`prosrc` para 11/14; `information_schema.columns` para 15/18; el `count(*)=37`
para 19), con `aplicada_at` = la fecha del commit del archivo
(`git log -1 --format=%cI`) como **cota inferior**,
`aplicada_por='retro-inferido'` y la sonda literal en `nota`.

**Esas 17 filas llevan `sha256 = 'RETRO-DESCONOCIDO'`, nunca el hash del archivo
de hoy.** Poner el hash actual haría que la tabla afirmara una mentira
precisamente en `05` y `07`, los dos archivos que esta auditoría demuestra
divergidos: diría "producción corre exactamente esto" sobre los dos casos donde
sabemos que no. El hash real empieza a existir desde la próxima migración que se
pegue con su línea de registro incluida. Un registro que dice "no sé" en 17
filas es más útil que uno que dice el número equivocado en 2.

## Consecuencias

"¿Qué falta pegar?" pasa a ser un `select` de una línea en vez de 15 consultas
de arqueología, y `docs/BACKLOG.md` deja de ser la fuente de verdad sobre
producción (deja de poder mentir). Se pierde el historial de migraciones como
narrativa —queda en `_historico/`, legible—, que es un costo real y consciente.

Pendiente y no cubierto por este ADR: recuperar el paso `02` (hoy hay un schema
en producción cuyo DDL no existe en el repo, así que `npx supabase db reset` en
una máquina nueva no reproduce producción), y marcar
`16_crear_producto_variantes.sql` como `SUPERADO` con la misma cabecera que ya
lleva `13_recibir_lote_valida_sede.sql` — el precedente existe en el repo, solo
no se aplicó ahí. Además hay que **corregir la cabecera del
`18_productos_proveedor.sql`**, que afirma que "misma firma con un parámetro
adicional al final no genera una función fantasma": es falso, Postgres
identifica una función por nombre + tipos de entrada, y mientras esa frase esté
escrita cualquier sesión futura la va a leer como regla y va a volver a omitir
un `drop` (el propio `20_comprobantes_items.sql:9-15` escribe la regla correcta,
y ADR-0009 la documenta con el bug que costó).
