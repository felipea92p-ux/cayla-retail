-- ============================================================================
-- Precio propuesto con IA, también al recibir mercadería (ADR-0641, actualización 2026-11-11; Felipe)
--
-- QUÉ. Casi toda prenda nueva nace en Recibir mercadería, y ahí solo entran las cuentas de terminal (caja y almacén). Felipe decidió:
--   · la propuesta sale sola en el paso «¿Cuánto cuesta?» de la hoja de la prenda nueva, con el costo y el precio juntos;
--   · también propone para una prenda que ya existe al cerrar el envío (si cambió el costo o el margen quedó bajo 30 %);
--   · queda ABIERTO para quien ve Recibir o Productos, sin pedir el dinero de Compras, con los costos de otras prendas incluidos
--     (se le mostró que fuera de Recibir esos costos solo los ve quien ve el dinero de Compras, y lo eligió así).
--
-- QUÉ CAMBIA. `fn_precio_contexto`, `registrar_precio_propuesta` y `fn_precio_gasto_del_mes` aceptan a quien ve Recibir o Productos.
-- `precio_propuestas` suma el origen «recepcion» (una prenda nueva sin ficha todavía, o una existente al cerrar). «Revisar precios»
-- (`fn_precios_a_revisar`) y aplicar (`aplicar_precio_propuesto`) NO cambian: siguen pidiendo editar el catálogo y ver el dinero de Compras.
-- El piso de 30 % y el tope de US$ 20 al mes siguen iguales.
--
-- CÓMO SE PEGA. Una sola parte: `alter` de los candados de `precio_propuestas` (tabla que solo tocan estas funciones; ninguna pantalla la
-- lee) y `create or replace` de tres funciones. Sin políticas (ADR-0195). Re-ejecutable. Los candados se buscan por lo que dicen, no por su
-- nombre: en cada base pueden llamarse distinto.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

do $$
begin
  if to_regclass('retail.precio_propuestas') is null then
    raise exception 'Falta retail.precio_propuestas: pega antes 20261110203000_precio_propuesto_con_ia.sql.';
  end if;
end $$;

-- El origen «recepcion», y una propuesta de recepción puede no tener prenda todavía (la nueva se crea después de proponer).
do $$
declare v record;
begin
  for v in
    select conname from pg_constraint
     where conrelid = 'retail.precio_propuestas'::regclass and contype = 'c'
       and (pg_get_constraintdef(oid) ilike '%origen = ANY%' or pg_get_constraintdef(oid) ilike '%producto_id IS NOT NULL) OR (origen = %')
       and conname not in ('precio_propuestas_origen_valido', 'precio_propuestas_prenda_segun_origen')
  loop
    execute format('alter table retail.precio_propuestas drop constraint %I', v.conname);
  end loop;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'retail.precio_propuestas'::regclass and conname = 'precio_propuestas_origen_valido') then
    alter table retail.precio_propuestas add constraint precio_propuestas_origen_valido check (origen in ('alta', 'revision', 'recepcion'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'retail.precio_propuestas'::regclass and conname = 'precio_propuestas_prenda_segun_origen') then
    alter table retail.precio_propuestas add constraint precio_propuestas_prenda_segun_origen check (producto_id is not null or origen in ('alta', 'recepcion'));
  end if;
end $$;

create or replace function retail.fn_precio_contexto(p_categoria_id uuid, p_tejido_id uuid default null, p_producto_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_desde timestamptz := now() - interval '90 days';
  v_categoria jsonb;
  v_costo_categoria numeric;
  v_con_costo integer;
  v_producto jsonb;
  v_parecidas jsonb;
begin
  -- ADR-0641 act. 2026-11-11 (Felipe): proponer se usa al crear la prenda en Recibir, donde solo entran las terminales de caja y almacén.
  -- Quien ve Recibir o Productos propone, sin pedir el dinero de Compras: Felipe eligió abrirlo con los costos ajenos incluidos.
  if auth.uid() is null or not (retail.fn_ve_modulo('productos') or retail.fn_ve_modulo('recibir')) then
    raise exception 'Proponer un precio pide ver Recibir mercadería o Productos' using errcode = '42501';
  end if;

  select jsonb_build_object('nombre', c.nombre, 'familia', c.familia, 'prefijo', c.prefijo)
    into v_categoria
    from retail.categorias c where c.id = p_categoria_id;
  if v_categoria is null then
    raise exception 'Categoría no válida' using errcode = '22023';
  end if;

  -- El costo de la categoría: el promedio de los costos por prenda (no por variante: un modelo con 20 tallas no pesa 20 veces).
  select round(avg(costo_prenda), 2), count(*)::integer
    into v_costo_categoria, v_con_costo
    from (
      select avg(v.costo) as costo_prenda
        from retail.productos p
        join retail.variantes v on v.producto_id = p.id and v.activo and v.costo > 0
       where p.categoria_id = p_categoria_id and not p.es_prueba
         and (p_producto_id is null or p.id <> p_producto_id)
       group by p.id
    ) t;

  if p_producto_id is not null then
    select jsonb_build_object(
             'referencia', p.referencia,
             'precio', (select percentile_disc(0.5) within group (order by v.precio) from retail.variantes v where v.producto_id = p.id and v.activo and v.precio > 0),
             'costo', (select round(avg(v.costo), 2) from retail.variantes v where v.producto_id = p.id and v.activo and v.costo > 0),
             'unidades_90', coalesce((select sum(vi.cantidad) from retail.venta_items vi join retail.ventas ve on ve.id = vi.venta_id
                                       join retail.variantes v on v.id = vi.variante_id
                                      where v.producto_id = p.id and ve.estado <> 'anulada' and not ve.es_prueba and ve.created_at >= v_desde), 0),
             'stock', coalesce((select sum(s.cantidad) from retail.stock s join retail.variantes v on v.id = s.variante_id where v.producto_id = p.id), 0),
             'dias_desde_alta', (current_date - p.created_at::date)
           )
      into v_producto
      from retail.productos p
     where p.id = p_producto_id and p.categoria_id = p_categoria_id;
    if v_producto is null then
      raise exception 'Producto no válido' using errcode = '22023';
    end if;
  end if;

  select coalesce(jsonb_agg(fila order by (fila ->> 'orden')::integer), '[]'::jsonb)
    into v_parecidas
    from (
      select jsonb_build_object(
               'orden', row_number() over (order by (p.tejido_id is not distinct from p_tejido_id and p_tejido_id is not null) desc, x.unidades desc, p.created_at desc),
               'referencia', p.referencia,
               'tejido', t.nombre,
               'mismo_tejido', p_tejido_id is not null and p.tejido_id = p_tejido_id,
               'precio', x.precio,
               'costo', x.costo,
               'unidades_90', x.unidades,
               'stock', x.stock,
               'dias_desde_alta', (current_date - p.created_at::date)
             ) as fila
        from retail.productos p
        left join retail.tejidos t on t.id = p.tejido_id
        cross join lateral (
          select
            (select percentile_disc(0.5) within group (order by v.precio) from retail.variantes v where v.producto_id = p.id and v.activo and v.precio > 0) as precio,
            (select round(avg(v.costo), 2) from retail.variantes v where v.producto_id = p.id and v.activo and v.costo > 0) as costo,
            coalesce((select sum(vi.cantidad) from retail.venta_items vi join retail.ventas ve on ve.id = vi.venta_id
                       join retail.variantes v on v.id = vi.variante_id
                      where v.producto_id = p.id and ve.estado <> 'anulada' and not ve.es_prueba and ve.created_at >= v_desde), 0)::integer as unidades,
            coalesce((select sum(s.cantidad) from retail.stock s join retail.variantes v on v.id = s.variante_id where v.producto_id = p.id), 0)::integer as stock
        ) x
       where p.categoria_id = p_categoria_id and p.estado = 'activo' and not p.es_prueba
         and (p_producto_id is null or p.id <> p_producto_id)
         and x.precio is not null
       order by (p.tejido_id is not distinct from p_tejido_id and p_tejido_id is not null) desc, x.unidades desc, p.created_at desc
       limit 12
    ) t;

  return jsonb_build_object(
    'categoria', v_categoria,
    'costo_categoria', v_costo_categoria,
    'prendas_con_costo', coalesce(v_con_costo, 0),
    'producto', v_producto,
    'parecidas', v_parecidas
  );
end;
$$;

comment on function retail.fn_precio_contexto(uuid, uuid, uuid) is
  'ADR-0641: lo que la IA mira para proponer un precio (categoría, costo promedio de la categoría, la prenda y hasta 12 parecidas). Solo lectura; pide ver Recibir o Productos (act. 2026-11-11).';
revoke all on function retail.fn_precio_contexto(uuid, uuid, uuid) from public, anon;
grant execute on function retail.fn_precio_contexto(uuid, uuid, uuid) to authenticated, service_role;

create or replace function retail.registrar_precio_propuesta(
  p_origen text,
  p_categoria_id uuid,
  p_producto_id uuid default null,
  p_referencia text default null,
  p_costo numeric default null,
  p_costo_estimado boolean default false,
  p_precio_actual numeric default null,
  p_piso numeric default null,
  p_precio_propuesto numeric default null,
  p_subido_al_piso boolean default false,
  p_razon text default null,
  p_parecidas jsonb default '[]'::jsonb,
  p_motivo text default null,
  p_modelo text default null,
  p_tokens_entrada integer default 0,
  p_tokens_salida integer default 0,
  p_costo_usd numeric default 0,
  p_ms integer default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
  v_id uuid;
begin
  -- ADR-0641 act. 2026-11-11 (Felipe): proponer se usa al crear la prenda en Recibir, donde solo entran las terminales de caja y almacén.
  -- Quien ve Recibir o Productos propone, sin pedir el dinero de Compras: Felipe eligió abrirlo con los costos ajenos incluidos.
  if auth.uid() is null or not (retail.fn_ve_modulo('productos') or retail.fn_ve_modulo('recibir')) then
    raise exception 'Proponer un precio pide ver Recibir mercadería o Productos' using errcode = '42501';
  end if;
  begin
    v_persona := retail.fn_actor_persona_id(true);
  exception when others then
    v_persona := null; -- una terminal sin responsable: la propuesta queda con la cuenta
  end;
  if p_producto_id is not null and not exists (select 1 from retail.productos where id = p_producto_id and categoria_id = p_categoria_id) then
    raise exception 'Producto no válido' using errcode = '22023';
  end if;
  insert into retail.precio_propuestas (
    cuenta_id, persona_id, origen, categoria_id, producto_id, referencia, costo, costo_estimado, precio_actual, piso,
    precio_propuesto, subido_al_piso, razon, parecidas, motivo, modelo, tokens_entrada, tokens_salida, costo_usd, ms
  ) values (
    auth.uid(), v_persona, p_origen, p_categoria_id, p_producto_id, nullif(btrim(coalesce(p_referencia, '')), ''), p_costo,
    coalesce(p_costo_estimado, false), p_precio_actual, p_piso, p_precio_propuesto, coalesce(p_subido_al_piso, false),
    nullif(btrim(coalesce(p_razon, '')), ''), coalesce(p_parecidas, '[]'::jsonb), p_motivo, p_modelo,
    coalesce(p_tokens_entrada, 0), coalesce(p_tokens_salida, 0), coalesce(p_costo_usd, 0), p_ms
  )
  returning id into v_id;
  return v_id;
end;
$$;

comment on function retail.registrar_precio_propuesta(text, uuid, uuid, text, numeric, boolean, numeric, numeric, numeric, boolean, text, jsonb, text, text, integer, integer, numeric, integer) is
  'ADR-0641: anota un precio propuesto por la IA (o por qué no lo hubo). La tabla exige el piso de 30 % de margen.';
revoke all on function retail.registrar_precio_propuesta(text, uuid, uuid, text, numeric, boolean, numeric, numeric, numeric, boolean, text, jsonb, text, text, integer, integer, numeric, integer) from public, anon;
grant execute on function retail.registrar_precio_propuesta(text, uuid, uuid, text, numeric, boolean, numeric, numeric, numeric, boolean, text, jsonb, text, text, integer, integer, numeric, integer) to authenticated, service_role;

create or replace function retail.fn_precio_gasto_del_mes()
returns numeric
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_desde timestamptz := date_trunc('month', now() at time zone 'America/Lima') at time zone 'America/Lima';
begin
  -- ADR-0641 act. 2026-11-11 (Felipe): proponer se usa al crear la prenda en Recibir, donde solo entran las terminales de caja y almacén.
  -- Quien ve Recibir o Productos propone, sin pedir el dinero de Compras: Felipe eligió abrirlo con los costos ajenos incluidos.
  if auth.uid() is null or not (retail.fn_ve_modulo('productos') or retail.fn_ve_modulo('recibir')) then
    raise exception 'Proponer un precio pide ver Recibir mercadería o Productos' using errcode = '42501';
  end if;
  return coalesce((select sum(costo_usd) from retail.precio_propuestas where creada_en >= v_desde), 0);
end;
$$;

comment on function retail.fn_precio_gasto_del_mes() is
  'ADR-0641: lo que costaron las propuestas de precio en el mes de Lima (US$), para el tope de US$ 20.';
revoke all on function retail.fn_precio_gasto_del_mes() from public, anon;
grant execute on function retail.fn_precio_gasto_del_mes() to authenticated, service_role;
