# Cómo refrescar la foto de producción

> El diccionario de `docs/datos/generado/` describe **la base de producción**. Pero a
> producción no se llega con `docker exec`: vive en Supabase, detrás de internet. Este
> archivo explica el camino de en medio.

## El problema

`pnpm datos:generar` se conecta a un Postgres local por Docker. Eso sirve para tu
máquina, no para las tiendas. Y describir la copia local en vez de producción es
justamente cómo nacieron los "tres números de tablas" que este trabajo vino a matar:
la copia local iba por detrás y decía 28 tablas donde producción tiene 45.

## La solución: un volcado

Se le pide a producción su inventario **una vez**, se guarda en disco, y el generador
lo lee desde ahí:

```bash
pnpm datos:generar:produccion
```

Eso no se conecta a nada: arma el diccionario desde los siete archivos
`retail_*.json` de esta carpeta.

## Cómo se refrescan esos archivos

Cuando el esquema de producción cambie, hay que volver a pedirle la foto. Pega cada
consulta en el **SQL Editor de producción** (el proyecto de Dynamic, donde vive el
schema `retail`) y guarda el resultado en el archivo que se indica, **sin cambiarle la
forma**.

> Recuerda el prefijo: en ese proyecto, `public` es Dynamic. Todo lo de retail va
> explícito como `retail.<tabla>` o con `set search_path to retail, public;` delante.

### 1 · `retail_columnas.json` — un objeto `{tabla: [columnas]}`

```sql
select jsonb_object_agg(tabla, cols) from (
  select table_name as tabla, jsonb_agg(jsonb_build_object(
    'table_schema', table_schema, 'table_name', table_name,
    'column_name', column_name, 'data_type', data_type,
    'is_nullable', is_nullable, 'column_default', column_default,
    'ordinal_position', ordinal_position
  ) order by ordinal_position) as cols
  from information_schema.columns
  where table_schema = 'retail'
  group by table_name
) s;
```

### 2 · `retail_constraints.json` — una lista

```sql
select jsonb_agg(jsonb_build_object(
  'tabla', n.nspname || '.' || c.relname,
  'conname', con.conname,
  'definicion', pg_get_constraintdef(con.oid)
) order by c.relname, con.conname)
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'retail';
```

### 3 · `retail_indices_unicos.json` — una lista

```sql
select jsonb_agg(jsonb_build_object(
  'tablename', tablename, 'indexname', indexname, 'indexdef', indexdef
) order by tablename, indexname)
from pg_indexes
where schemaname = 'retail' and indexdef ilike '%unique%';
```

### 4 · `retail_policies.json` — una lista

```sql
select jsonb_agg(jsonb_build_object(
  'schemaname', schemaname, 'tablename', tablename, 'policyname', policyname,
  'cmd', cmd, 'roles', roles::text, 'qual', qual, 'with_check', with_check
) order by tablename, policyname)
from pg_policies
where schemaname = 'retail';
```

### 5 · `retail_filas.json` — un objeto `{tabla: conteo}`

Este cuenta filas de verdad, no estimaciones, porque con tan pocos datos la
estimación del planificador da 0 en casi todo y el diccionario diría que el sistema
está vacío cuando no lo está.

```sql
select jsonb_object_agg(tabla, n) from (
  select c.relname as tabla,
         (xpath('/row/c/text()',
           query_to_xml(format('select count(*) as c from retail.%I', c.relname),
                        false, true, '')))[1]::text::bigint as n
  from pg_class c join pg_namespace nsp on nsp.oid = c.relnamespace
  where nsp.nspname = 'retail' and c.relkind = 'r'
) s;
```

### 6 · `retail_fks_cruzadas.json` — las llaves que salen de `retail` hacia Dynamic

Es la frontera entre los dos sistemas, y conviene vigilarla: si alguien cambia una
tabla de Dynamic, esto dice qué de retail se rompe.

```sql
select jsonb_agg(jsonb_build_object(
  'conname', con.conname,
  'src_table', src.relname,
  'ref_table', refn.nspname || '.' || ref.relname
) order by src.relname, con.conname)
from pg_constraint con
join pg_class src on src.oid = con.conrelid
join pg_namespace srcn on srcn.oid = src.relnamespace
join pg_class ref on ref.oid = con.confrelid
join pg_namespace refn on refn.oid = ref.relnamespace
where con.contype = 'f' and srcn.nspname = 'retail' and refn.nspname <> 'retail';
```

### 7 · `funciones-produccion.txt` — las firmas, para `pnpm datos:comparar`

Este no es JSON: es texto plano, una firma por línea.

```sql
select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
       || ' -> ' || pg_get_function_result(p.oid)
       || case when p.prosecdef then ' [definer]' else ' [invoker]' end
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'retail' and p.prokind = 'f'
order by 1;
```

### 8 · `retail_rls.json` — un objeto `{relación: {relkind, rls, forzado}}`

Es lo que dice, tabla por tabla, si los permisos por fila (RLS) están encendidos, y qué
relación es vista (`relkind` v/m) y cuál tabla (`r`/`p`). **No se puede deducir de las
políticas**: por diseño (ADR-0195) las tablas de plata quedan con RLS encendido y SIN
políticas —cerradas para los clientes, abiertas solo por funciones `security definer`—, y
una foto que las deduzca de las políticas las pinta «sin permisos por fila» cuando están
cerradas con llave. Se pide **junto** con las otras: el generador se detiene si una
relación está en `retail_columnas.json` y no aquí.

```sql
select jsonb_object_agg(c.relname, jsonb_build_object(
  'relkind', c.relkind::text, 'rls', c.relrowsecurity, 'forzado', c.relforcerowsecurity
) order by c.relname)
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'retail' and c.relkind in ('r','p','v','m','f');
```

## Después de refrescar

```bash
pnpm datos:generar:produccion   # reescribe el diccionario
pnpm datos:comparar             # avisa si alguna pantalla quedó rota, o si una función quedó con dos firmas
pnpm datos:aviario              # falla si una tabla de producción quedó sin pájaro
```

Y mira el diff antes de commitear: si aparecen tablas o columnas que nadie recuerda
haber creado, alguien pegó SQL en producción sin anotarlo — que es exactamente lo que
`migraciones_aplicadas` y la decisión D-11 existen para evitar.

Si `datos:aviario` falla, la tabla nueva necesita pájaro antes de commitear el volcado:
se agrega a su lista en `scripts/datos/aviario.mjs` y se vuelve a correr. El CI corre
la misma revisión en cada push, así que un volcado commiteado sin eso sale en rojo.

## Cuándo hace falta hacer todo esto

Casi nunca, y esa es la idea. Solo cuando **el esquema de producción** cambia: una
tabla nueva, una columna nueva, un candado nuevo, una función con parámetros
distintos. Los datos del día a día no afectan al diccionario — salvo `retail_filas`,
que envejece siempre y no pasa nada, porque los conteos están ahí para dar escala
("esta tabla está vacía", "esta tiene 16.527 filas"), no para ser exactos.
