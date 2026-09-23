-- Versión del catálogo (velocidad, 2026-09-23 — BACKLOG «Velocidad», opción A elegida por Felipe).
--
-- EL PROBLEMA. Ocho pantallas (Vender, Apartados, Cambios, Recibir, Compras ▸ Nueva, Conteo, Ingreso sin comprobante,
-- Proformas) leen el catálogo ENTERO en cada visita (~1.300 variantes con talla, color, fotos y códigos: ~0,7 s de
-- base en una base limitada por CPU). El catálogo cambia pocas veces al día; se vende muchas veces por hora.
--
-- LA SALIDA. La web guarda el catálogo entre visitas (`unstable_cache`) y lo identifica por ESTA versión. Cualquier
-- escritura en las tablas que el catálogo muestra —desde la pantalla, una RPC, un script o Dynamic— sube la versión
-- en la misma transacción, así que la siguiente visita ya no encuentra copia y lee fresco. No hay que acordarse de
-- «invalidar» en cada lugar que edita: lo hace la base (principio 2 — un precio viejo en la caja no puede pasar).
-- La recepción de mercadería y el cierre de producción recalculan `variantes.costo`: también suben la versión (bien:
-- cambió un dato del catálogo). Una venta no toca estas tablas.
--
-- No guarda nada de negocio: solo un número. La leen todas las cuentas con sesión (`fn_catalogo_version`), nadie la
-- escribe a mano (la tabla no tiene permisos: solo los disparadores, como su dueño).

create table if not exists catalogo_version (
  id smallint primary key default 1 check (id = 1),
  version bigint not null default 0,
  cambiado_en timestamptz not null default now()
);
insert into catalogo_version (id) values (1) on conflict (id) do nothing;

alter table catalogo_version enable row level security;
revoke all on table catalogo_version from public, anon, authenticated;

create or replace function fn_catalogo_cambio()
returns trigger
language plpgsql
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
begin
  update catalogo_version set version = version + 1, cambiado_en = now() where id = 1;
  return null;
end;
$$;
revoke all on function fn_catalogo_cambio() from public, anon, authenticated;

-- Por SENTENCIA, no por fila: un alta de producto con 20 variantes sube la versión una vez por sentencia, no 20.
do $$
declare
  t text;
begin
  foreach t in array array['variantes', 'productos', 'producto_fotos', 'codigos_barras', 'tallas', 'colores', 'categorias', 'marcas'] loop
    execute format('drop trigger if exists catalogo_version_cambio on %I', t);
    execute format(
      'create trigger catalogo_version_cambio after insert or update or delete or truncate on %I '
      'for each statement execute function fn_catalogo_cambio()',
      t
    );
  end loop;
end;
$$;

create or replace function fn_catalogo_version()
returns bigint
language sql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
  select version from catalogo_version where id = 1;
$$;
revoke all on function fn_catalogo_version() from public, anon;
grant execute on function fn_catalogo_version() to authenticated;
