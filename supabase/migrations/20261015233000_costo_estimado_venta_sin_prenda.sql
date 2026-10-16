-- ============================================================================
-- 20261015233000_costo_estimado_venta_sin_prenda.sql — CAYLA V2 (ADR-0417, decisión 1; Felipe 2026-10-15)
--
-- EL PROBLEMA PRIMERO. Una «prenda sin registrar» (ADR-0179) se vende con la variante centinela «Cargo especial», cuyo costo es 0.
-- Mientras no se regularice, esa línea entra al diario (`fn_asientos`, regla «venta») con costo 0: el margen sale inflado y nadie
-- puede compararlo. Medido en producción el 15-oct-2026: 737 de 1,096 líneas de octubre (S/ 35,311, el 64 % de la venta) estaban
-- así; en Arequipa, el 95 %. Las 647 `cerrada_sin_prenda` (ADR-0334) no se van a regularizar nunca: su costo 0 era definitivo.
--
-- CONTRATO (Liskov)
--   PROMETE: toda línea de venta sin prenda nace con un COSTO ESTIMADO —el promedio de costo de las prendas de su categoría— y la
--            marca `venta_items.costo_estimado = true`. Se sella UNA sola vez, al crearse: un mes cerrado da siempre el mismo
--            número (ADR-0198). Al regularizar (`regularizar_prenda`, `regularizar_prendas_sugeridas`, liquidación), el costo
--            real reemplaza al estimado y la marca se apaga sola. `fn_costo_estimado_resumen(desde, hasta, ubicación)` dice
--            cuánto de lo vendido en un rango lleva costo estimado (unidades, costo y venta) contra el total, para que Resumen,
--            Reportes y Cierre lo muestren. Las líneas que ya existían se rellenan al pegar (solo las de meses sin cerrar).
--   ASUME:   `prendas_por_regularizar.categoria_id` nunca es nulo (lo exige la tabla); `precio_cobrado` ya trae IGV, igual que
--            `variantes.precio`. Si la categoría no tiene ninguna prenda con costo, se usa la razón costo/precio de TODO el
--            catálogo sobre el precio cobrado; si tampoco hay catálogo con costo, queda 0 y el chequeo de costo lo sigue viendo.
--   FALLA:   `fn_costo_estimado_resumen` con `insufficient_privilege` si la cuenta no ve el diario (`fn_diario_ubicaciones`).
--   NO HACE: no toca `registrar_venta` ni `regularizar_prenda` (las dos llevan parches vivos: un disparador compone sin
--            recrearlas); no recalcula el estimado al corregir lo anotado (`corregir_prenda_sin_registrar`, ADR-0369): lo sellado
--            queda; no cambia `fn_estado_resultados` ni `fn_cierre_mes_estado` (el estimado entra al diario solo, por la regla
--            «venta», y el «cuánto es estimado» lo lee cada pantalla de la función nueva).
--
-- ESTADOS IMPOSIBLES (Lamport). Una línea con `costo_estimado = true` y una variante real: el disparador `venta_items_costo_real`
-- apaga la marca en el mismo `update` que cambia la variante. Una línea del centinela con costo 0 después de esta migración:
-- solo si no hay NADA con costo en el catálogo (y entonces el chequeo `sin_costo` del cierre no la ve, porque excluye al
-- centinela a propósito; por eso `fn_costo_estimado_resumen` cuenta aparte las del centinela que siguen en 0).
--
-- DECIDÍ: el promedio simple del costo de las variantes de la categoría (con costo y precio mayores a 0, sin el centinela),
--   redondeado a 2 decimales, sellado por un disparador AFTER INSERT en `prendas_por_regularizar`.
-- DESCARTÉ: un porcentaje fijo del precio (aplana el margen por categoría: una casaca y un top no dejan lo mismo); esperar a
--   regularizar (las cerradas no se regularizan nunca); sacarlas del margen (esconde el 64 % de la venta); recalcular al leer
--   (el promedio cambia con cada compra y el hash de un mes cerrado dejaría de coincidir); pesar el promedio por stock (más caro
--   y no más cierto: el stock de hoy no es el de la venta).
-- SE ROMPE SI: una categoría con dos o tres prendas da un promedio ruidoso (la pantalla dice «estimado», nunca lo presenta como
--   real); o si la venta sin prenda pasa a ser lo normal (la cura está en Vender, no aquí).
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. La marca ----------
alter table retail.venta_items add column if not exists costo_estimado boolean not null default false;
comment on column retail.venta_items.costo_estimado is
  'true si el costo de la línea es un estimado (prenda sin registrar: promedio de su categoría, ADR-0417 dec. 1); se apaga sola al regularizar.';

-- ---------- 2. El estimado ----------
create or replace function retail.fn_costo_estimado_prenda(p_categoria_id uuid, p_precio numeric)
returns numeric
language sql stable
set search_path = retail, public, extensions
as $$
  with cat as (
    select avg(v.costo) as costo
      from retail.variantes v
      join retail.productos p on p.id = v.producto_id
     where p_categoria_id is not null and p.categoria_id = p_categoria_id
       and v.costo > 0 and v.precio > 0
       and v.id <> '22222222-2222-4222-8222-222222222222'
  ),
  todo as (
    select sum(v.costo) / nullif(sum(v.precio), 0) as razon
      from retail.variantes v
     where v.costo > 0 and v.precio > 0
       and v.id <> '22222222-2222-4222-8222-222222222222'
  )
  select round(coalesce((select costo from cat), (select razon from todo) * coalesce(p_precio, 0), 0), 2);
$$;
comment on function retail.fn_costo_estimado_prenda(uuid, numeric) is
  'El costo estimado de una prenda sin registrar: promedio de costo de su categoría; sin categoría con costo, la razón costo/precio del catálogo sobre el precio cobrado; sin nada, 0.';

-- ---------- 3. Al nacer la prenda sin registrar, la línea de la venta recibe el estimado ----------
create or replace function retail.trg_prenda_sin_registrar_costo_estimado()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  update retail.venta_items vi
     set costo_unitario = retail.fn_costo_estimado_prenda(new.categoria_id, new.precio_cobrado),
         costo_estimado = true
   where vi.id = new.venta_item_id
     and vi.variante_id = '22222222-2222-4222-8222-222222222222'
     and vi.costo_unitario = 0;
  return null;
end $$;

create or replace trigger prendas_por_regularizar_costo_estimado
  after insert on retail.prendas_por_regularizar
  for each row execute function retail.trg_prenda_sin_registrar_costo_estimado();

-- ---------- 4. Al regularizar, el costo real manda y la marca se apaga ----------
create or replace function retail.trg_venta_item_costo_real()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  if new.costo_estimado and new.variante_id <> '22222222-2222-4222-8222-222222222222' then
    new.costo_estimado := false;
  end if;
  return new;
end $$;

create or replace trigger venta_items_costo_real
  before update of variante_id on retail.venta_items
  for each row execute function retail.trg_venta_item_costo_real();

-- ---------- 5. Las que ya existían (solo meses sin cerrar; pegar dos veces no cambia nada) ----------
update retail.venta_items vi
   set costo_unitario = retail.fn_costo_estimado_prenda(p.categoria_id, p.precio_cobrado),
       costo_estimado = true
  from retail.prendas_por_regularizar p
  join retail.ventas v on v.id = (select venta_id from retail.venta_items x where x.id = p.venta_item_id)
 where p.venta_item_id = vi.id
   and vi.variante_id = '22222222-2222-4222-8222-222222222222'
   and vi.costo_unitario = 0
   and p.estado in ('pendiente', 'cerrada_sin_prenda')
   and not exists (
     select 1 from retail.periodo_cierres pc
      where pc.mes = date_trunc('month', (v.created_at at time zone 'America/Lima'))::date
   );

-- ---------- 6. Cuánto de lo vendido es estimado ----------
create or replace function retail.fn_costo_estimado_resumen(p_desde date, p_hasta date, p_ubicacion_id uuid default null)
returns table (
  unidades_estimadas bigint, costo_estimado numeric, venta_estimada numeric,
  unidades_sin_costo bigint, venta_sin_costo numeric,
  unidades_total bigint, costo_total numeric, venta_total numeric
)
language plpgsql stable security definer
set search_path = retail, public, extensions
as $$
declare
  v_ubics uuid[] := retail.fn_diario_ubicaciones();
  v_desde date := greatest(p_desde, coalesce(retail.fn_finanzas_desde(), p_desde));
  v_ini timestamptz;
  v_fin timestamptz;
begin
  if cardinality(v_ubics) = 0 then
    raise insufficient_privilege using message = 'Ver cuánto del costo es estimado necesita el módulo Reportes financieros';
  end if;
  if p_ubicacion_id is not null and not (p_ubicacion_id = any (v_ubics)) then
    raise insufficient_privilege using message = 'No ves los números de esa sede';
  end if;
  v_ini := (v_desde::timestamp at time zone 'America/Lima');
  v_fin := ((p_hasta + 1)::timestamp at time zone 'America/Lima');
  return query
    select
      coalesce(sum(vi.cantidad) filter (where vi.costo_estimado), 0)::bigint,
      coalesce(sum(vi.cantidad * vi.costo_unitario) filter (where vi.costo_estimado), 0),
      coalesce(sum(vi.cantidad * (vi.precio_unitario - vi.descuento_unitario)) filter (where vi.costo_estimado), 0),
      coalesce(sum(vi.cantidad) filter (where vi.costo_unitario = 0), 0)::bigint,
      coalesce(sum(vi.cantidad * (vi.precio_unitario - vi.descuento_unitario)) filter (where vi.costo_unitario = 0), 0),
      coalesce(sum(vi.cantidad), 0)::bigint,
      coalesce(sum(vi.cantidad * vi.costo_unitario), 0),
      coalesce(sum(vi.cantidad * (vi.precio_unitario - vi.descuento_unitario)), 0)
      from retail.ventas v
      join retail.venta_items vi on vi.venta_id = v.id
     where v.estado = 'completada' and not coalesce(v.es_prueba, false)
       and v.created_at >= v_ini and v.created_at < v_fin
       and v.ubicacion_id = any (v_ubics)
       and (p_ubicacion_id is null or v.ubicacion_id = p_ubicacion_id);
end $$;
comment on function retail.fn_costo_estimado_resumen(date, date, uuid) is
  'Cuánto de lo vendido en el rango lleva costo estimado (prenda sin registrar) y cuánto sigue en costo 0, contra el total: lo que alimenta el medidor de confianza de Finanzas (ADR-0417).';

-- ---------- 7. Permisos (ADR-0119: revoke explícito) ----------
revoke all on function retail.fn_costo_estimado_prenda(uuid, numeric) from public, anon;
revoke all on function retail.trg_prenda_sin_registrar_costo_estimado() from public, anon, authenticated;
revoke all on function retail.trg_venta_item_costo_real() from public, anon, authenticated;
revoke all on function retail.fn_costo_estimado_resumen(date, date, uuid) from public, anon;
grant execute on function retail.fn_costo_estimado_resumen(date, date, uuid) to authenticated;

-- ---------- 8. Que quedó como se prometió ----------
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'retail' and table_name = 'venta_items' and column_name = 'costo_estimado') then
    raise exception 'ADR-0417: venta_items no quedó con costo_estimado';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'prendas_por_regularizar_costo_estimado') or
     not exists (select 1 from pg_trigger where tgname = 'venta_items_costo_real') then
    raise exception 'ADR-0417: faltan los disparadores del costo estimado';
  end if;
end $$;
