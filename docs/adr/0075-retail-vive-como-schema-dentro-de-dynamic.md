# ADR-0075 — Retail vive como schema dentro del proyecto de Dynamic

**Fecha:** 2026-09-17
**Estado:** Decisión tomada y ejecutada en producción en julio de 2026, confirmada
con datos reales el 2026-09-03 (commit `4cf4f2c`). Este ADR la documenta
retroactivamente — es la deuda de documentación que ese mismo commit y
`docs/BACKLOG.md:2606-2610` ya reconocían sin cerrar.
**Decide:** Felipe, ejecutado a mano contra el SQL Editor de producción (D-11: solo
Felipe pega SQL en producción, y queda anotado).

## Contexto

Antes de julio de 2026, `cayla-retail` tenía sus propias tablas `sedes` y
`personas` — copia propia, separada de `cayla-dynamic` (el sistema de planilla y
asistencia, que ya era "el dueño de la identidad de CAYLA": quién es cada persona,
en qué sede, con qué rol; `docs/datos/14-DYNAMIC.md:39`). Dos copias de la misma
identidad es exactamente el estado que el principio 2 del rol prohíbe ("cero
estados inconsistentes") — pueden divergir sin que nadie se entere.

Julio de 2026 lo resuelve: retail deja de tener su propia copia de `sedes`/
`personas` y pasa a leerlas directo de Dynamic (`docs/BACKLOG.md:2971-2974`).
Verificado con `git log` contra este mismo repo: **11 commits fechados
2026-07-23**, todos con mensaje `Unificación paso N` o `Unificación Fase 3 ...`,
cada uno pegando a mano un archivo de `supabase/unificacion/` en el SQL Editor de
producción:

| Commit | Qué hizo |
|---|---|
| `a512ff4` | Paso 1 — `01_sedes.sql`: tabla `retail_sede_meta` (tipo de sede) |
| *(ninguno)* | **Paso 2 — ver la sección siguiente** |
| `2911517` | Paso 3 — `03_candados.sql`: vistas puente + candados de identidad |
| `01d5339` … `23b22ac` | Pasos 4–9 — catálogo, operación, contabilidad+producción, funciones (`04`–`09`) |
| `d7e4835`, `2171079`, `36e4df9` | Fase 3 — apuntar la app al schema `retail`, mapeo de roles, bucket de fotos |

Confirmado con datos reales el 2026-09-03 (no antes): `retail.sedes` devuelve 5
filas, no vacío (`docs/BACKLOG.md:2971-2978`).

## Decisión

**DECIDÍ (Felipe, jul-2026): `retail` es un schema dentro del proyecto Supabase que
ya tenía Dynamic (`vovjyyiafkxteijimpuy`), no un proyecto Supabase propio.** El
candado que resulta es configuración del cliente, no disciplina de equipo —
`db: { schema: "retail" }` en `apps/web/lib/supabase/{server,client}.ts` hace que
PostgREST no le exponga a retail nada fuera de ese schema.

**DESCARTÉ: mantener dos proyectos Supabase (retail y Dynamic) sincronizados.**
Habría exigido inventar un mecanismo de sync para `sedes`/`personas` — una pieza
más que puede fallar (principio 9), y el mismo tipo de estado inconsistente que
esta unificación buscaba eliminar. Con un solo Postgres, en cambio, las FK de
retail hacia `public.sedes`/`public.personas` las hace cumplir el motor: 24 FKs
hacia sedes y 18 hacia personas, verificadas en
`docs/datos/generado/retail_fks_cruzadas.json` (citadas en
`docs/datos/14-DYNAMIC.md:203-211`) — contratar a alguien en Dynamic lo hace visible
en retail al instante, sin sincronizar nada.

## Lo que se perdió en el camino: el paso 02 nunca quedó versionado

`supabase/unificacion/03_candados.sql:3` dice, en su propia cabecera: *"Correr en
cayla-DYNAMIC, después del paso 2 (schema retail + sede_meta)."* Ese paso 2 — el
que en algún momento corrió lo necesario para que existiera el schema `retail` y
la tabla real `retail.sede_meta` — **no existe como archivo en ningún punto del
historial de este repo.** Verificado, no asumido:

- `git log --all --diff-filter=A --name-only -- "supabase/unificacion/02*"` → sin
  resultados, en todo el historial del repo.
- No existe ningún commit `Unificación paso 2`: los commits del 2026-07-23 van de
  `a512ff4` (paso 1) directo a `2911517` (paso 3), sin nada entremedio.

No es un archivo que se haya perdido — nunca se guardó. Se corrió a mano contra
producción y su SQL se fue con la sesión que lo escribió. El propio código de
`supabase/unificacion/` lo termina admitiendo, semanas más tarde —
`supabase/unificacion/12_almacen_interno.sql:37-40`:

```sql
-- QUÉ ASUME
--   - `retail.sede_meta` (creada por el paso "02" que nunca quedó
--     versionado en el repo — confirmado en producción el 2026-09-03:
--     `retail.sedes` devolvió 5 filas) tiene las columnas `sede_id`,
--     `tipo` ('tienda'/'fabrica'/'corporativo') y `tienda_asociada_id` —
```

**La trampa de nombres que esto dejó:** `01_sedes.sql:19` crea `retail_sede_meta`
(con guion bajo, en `public` — escrita ANTES de que el schema `retail` existiera,
y nunca actualizada). La tabla que el sistema usa de verdad es otra:
`retail.sede_meta` (con punto, dentro del schema), la que
`03_candados.sql:18` consulta — y esa la creó el paso 02 perdido. Son dos tablas
distintas con el mismo contenido esperado; volver a pegar `01_sedes.sql` hoy no
arregla nada, solo escribe en la que nadie lee. (`docs/datos/14-DYNAMIC.md:246-260`
llegó a la misma conclusión por su propio camino, el 2026-09-12 — no lo tomé de
ahí, lo confirmé yo mismo leyendo los dos archivos y lo cito porque coincide.)

Según ese mismo documento de `docs/datos/` (cita, no reconfirmación mía contra
producción en esta tarea), el paso 02 perdido no creó solo `sede_meta`: también
`retail.sede_datos_fiscales` (1 fila — dirección, ubigeo, teléfono del comprobante;
**ningún código la lee todavía**) y `retail.configuracion_empresa` (1 fila — RUC,
razón social, email del emisor). Tres tablas vivas en producción, cero
`create table` de ninguna en este repo (`docs/datos/14-DYNAMIC.md:231-244`).

## SE ROMPE SI hace falta reconstruir el schema desde cero

**Hoy es imposible reconstruir producción solo con lo que hay en el repo.**
`npx supabase db reset` local + pegar, en orden, los 34 archivos que existen de
`supabase/unificacion/` (verificado con `ls supabase/unificacion/ | sort` — van de
`01_sedes.sql` a `35_recalcular_stock_almacen.sql`, sin ningún `02_*`) produce una
base **distinta** a la de las tiendas: sin `sede_meta`, sin `sede_datos_fiscales`,
sin `configuracion_empresa`, y sin el cuerpo real de las funciones que producción
trae parchadas a mano y que nunca volvieron al repo (mismo patrón que ADR-0004
sobre `recibir_lote` y ADR-0006 sobre `patrimonio_items.categoria`).

Para reconstruirlo de verdad, en orden:

1. **`create schema retail;` más los `grant` que le dan acceso a
   `anon`/`authenticated`/`service_role`** (`docs/datos/13-PROMESAS-INCUMPLIDAS.md:211`
   cita el `grant all on all tables in schema retail to anon, authenticated,
   service_role` real). Es la parte más probable de lo que hacía el paso 02, por
   descarte — pero **no está confirmada con un comando visto en ningún archivo ni
   log**, solo inferida de que `03_candados.sql` ya encuentra el schema creado.
   Quien escriba el reemplazo algún día: verificarlo contra
   `information_schema.schemata` en producción antes de asumirlo.
2. **Las tres tablas huérfanas, con sus columnas reales.** Hoy eso solo se puede
   sacar de producción (`\d retail.sede_meta`, o `pg_dump --schema-only` contra
   `vovjyyiafkxteijimpuy`) — el repo no las define en ningún lado, así que no hay
   de dónde copiarlas.
3. **Reconciliar los cuerpos de función parchados a mano** contra lo que el repo
   cree que despachó — el mismo trabajo que ya hizo ADR-0004 para `recibir_lote`,
   repetido para cada función que marque como divergente una auditoría con
   `pg_get_functiondef`.

El inventario vivo de qué falta exactamente, y el plan para cerrarlo paso a paso,
ya se está llevando en `docs/datos/14-DYNAMIC.md` (sección 5) y
`docs/datos/08-OPERACION.md` — este ADR no lo duplica: deja la decisión y el
porqué, el estado día a día vive ahí y en `docs/BACKLOG.md`.

## Consecuencias

**Se ganó:** una sola fuente de verdad para identidad — contratar a alguien en
Dynamic lo hace visible en retail al instante, sin sincronizar nada. Los candados
de RLS de retail reusan `fn_rol_actual()`/`fn_sede_actual_persona()` de Dynamic tal
cual (`03_candados.sql:41-55`) en vez de reinventar su propia capa de sesión.

**Se pagó, y sigue vigente:** un solo proyecto Supabase para dos sistemas significa
un solo botón de restaurar para los dos — un restore de Dynamic restaura retail
entero, y viceversa (`docs/datos/08-OPERACION.md:450-459`, que además marca esto
como el argumento más fuerte a favor de la decisión de que, el día que CAYLA venda
este sistema a otra marca, cada marca tenga su propia base — nunca un schema
compartido). Y, lo que motiva directamente este ADR: al correr el paso 02 a mano y
no versionarlo, producción tiene desde julio tres tablas que el repo no sabe
crear — una deuda silenciosa, recién visible porque alguien fue a mirar.
