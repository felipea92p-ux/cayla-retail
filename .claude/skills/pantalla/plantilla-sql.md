# Plantilla SQL — consulta de solo lectura para una pantalla

Se lee en el Paso 2 de `/pantalla`. Reemplaza `<TABLAS>` y `<FUNCIONES>` por las del mapa del código (`'a','b'`). Felipe la pega en el SQL Editor de **producción** (proyecto cayla-dynamic, schema `retail`), por eso lleva el prefijo `retail.`. Nunca la guardes en `supabase/migrations/`.

## Reglas

- **Solo lectura.** Ni `insert`, `update`, `delete`, ni funciones que escriban.
- **Cero datos personales.** Antes de elegir columnas para la muestra, revisa `docs/datos/06-DATOS-PERSONALES.md` §3–§5. Nada de `select *` sobre `comprobantes`, `proformas` ni `public.personas`; en esas tablas excluye o enmascara nombre, documento, teléfono, correo, dirección.
- `retail.personas` es una **vista** de 7 columnas sobre `public.personas`. No la trates como tabla.
- Los bloques van **separados y numerados**, para que Felipe pegue el resultado de cada uno sin perderse. Si una tabla no tiene `created_at`, quita el filtro de crecimiento (míralo en `docs/datos/generado/retail_columnas.json`).
- Después de recibir el resultado, clasifica cada dato como **hueco** (algo que falta o está roto) o **está bien** (con la evidencia); los dos van al análisis.

## A · Estructura

```sql
-- A1. Columnas
select table_name, ordinal_position, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'retail' and table_name in (<TABLAS>)
order by table_name, ordinal_position;

-- A2. Constraints (PK, FK, UNIQUE, CHECK)
select conrelid::regclass::text as tabla, contype, conname, pg_get_constraintdef(oid) as definicion
from pg_constraint
where conrelid in (
  select oid from pg_class
  where relnamespace = 'retail'::regnamespace and relname in (<TABLAS>)
)
order by 1, 2, 3;

-- A3. Índices
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'retail' and tablename in (<TABLAS>)
order by 1, 2;
```

## B · Volumen real

```sql
-- B1. Filas y crecimiento reciente (una línea por tabla; quita el filtro si no hay created_at)
select 'retail.tabla_1' as tabla, count(*) as filas,
       count(*) filter (where created_at > now() - interval '30 days') as ultimos_30_dias
from retail.tabla_1
union all
select 'retail.tabla_2', count(*),
       count(*) filter (where created_at > now() - interval '30 days')
from retail.tabla_2;
```

## C · Muestra de filas (sin datos personales)

```sql
-- C1. Cinco filas recientes por tabla, solo con columnas no personales
select col_a, col_b, col_c, created_at
from retail.tabla_1
order by created_at desc
limit 5;
```

## D · Seguridad y lógica

```sql
-- D1. Políticas RLS
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'retail' and tablename in (<TABLAS>)
order by 1, 2;

-- D2. ¿RLS activado?
select relname, relrowsecurity, relforcerowsecurity
from pg_class
where relnamespace = 'retail'::regnamespace and relkind = 'r' and relname in (<TABLAS>);

-- D3. Funciones RPC que la pantalla llama: firma, si son security definer y el cuerpo real
select p.proname, pg_get_function_identity_arguments(p.oid) as firma,
       p.prosecdef as security_definer, p.proconfig, pg_get_functiondef(p.oid) as definicion
from pg_proc p
where p.pronamespace = 'retail'::regnamespace and p.proname in (<FUNCIONES>)
order by 1, 2;
```

## E · Huecos

```sql
-- E1. Tablas de la pantalla SIN RLS activado (debería salir vacío)
select relname from pg_class
where relnamespace = 'retail'::regnamespace and relkind = 'r'
  and relname in (<TABLAS>) and not relrowsecurity;

-- E2. Funciones security definer SIN search_path fijo (debería salir vacío)
select proname from pg_proc
where pronamespace = 'retail'::regnamespace and prosecdef
  and proname in (<FUNCIONES>)
  and (proconfig is null or not exists (select 1 from unnest(proconfig) c where c like 'search_path=%'));

-- E3 y E4 los escribes tú, a la medida de la pantalla:
--   E3. Columnas nullable que el código trata como obligatorias (cuenta de NULL por columna).
--   E4. Valores de una columna de estado fuera del vocabulario que la pantalla espera
--       (select estado, count(*) from retail.tabla group by 1).
```

Cierra tu mensaje con una línea: *"Pega aquí el resultado de A a E (o dime 'sin SQL' y sigo con el volcado del repo, marcando lo que quede sin datos reales)."*
