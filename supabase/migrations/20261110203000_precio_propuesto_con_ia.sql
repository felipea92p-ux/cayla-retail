-- ============================================================================
-- Precio propuesto con IA (ADR-0641; Felipe 2026-11-10)
--
-- QUÉ. Felipe pidió que el sistema calcule el precio de una prenda «siempre teniendo en cuenta los costos», y que lo PROPONGA la IA
-- (Claude, con los créditos de Anthropic): al crear una prenda (Nuevo producto) y al revisar los precios ya puestos (Productos).
-- Esta migración trae lo que la base aporta: los datos que la IA mira y el registro de cada propuesta. El precio NO se escribe aquí:
-- aplicarlo sigue pasando por la función de siempre (`crear_producto_con_*`, `catalogo_actualizar_producto`), que guarda su historial.
--
-- LAS REGLAS DE FELIPE (dinero: no se cambian sin él):
--   · Piso duro: ninguna propuesta deja menos de 30 % de margen sobre el precio (precio × 0,70 ≥ costo). Lo calcula la web
--     (`lib/precio-propuesto-reglas.ts`) y la tabla lo vuelve a exigir: una fila bajo el piso no entra, la escriba quien la escriba.
--   · Sin costo cargado: se usa el costo promedio de la categoría, y la fila lo dice (`costo_estimado`).
--   · Tope propio de US$ 20 al mes (aparte del asistente): `fn_precio_gasto_del_mes()` lo suma; la web deja de llamar a la IA al llegar.
--
-- QUIÉN. Proponer es una función de Productos (ADR-0306: no es un módulo aparte): pide `fn_ve_modulo('productos')`. Firma con
-- `fn_actor_persona_id(true)`, como toda función que guarda (ADR-0161 act. c).
--
-- CÓMO SE PEGA. Una sola parte: tabla nueva (RLS encendido SIN políticas: solo la tocan estas funciones `security definer`) y tres
-- funciones; no hace `alter` de tablas en uso ni crea políticas (ADR-0195). Re-ejecutable. Nada se borra nunca.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

do $$
begin
  if to_regprocedure('retail.fn_actor_persona_id(boolean)') is null then
    raise exception 'Falta retail.fn_actor_persona_id: pega antes 20260929230000_acciones_sin_responsable.sql.';
  end if;
  if to_regprocedure('retail.fn_ve_modulo(text)') is null then
    raise exception 'Falta retail.fn_ve_modulo(text).';
  end if;
end $$;

create table if not exists retail.precio_propuestas (
  id uuid primary key default gen_random_uuid(),
  creada_en timestamptz not null default now(),
  -- La cuenta que pidió la propuesta (auth.users.id) y la persona que firma (vacía si una terminal no tiene responsable).
  cuenta_id uuid not null,
  persona_id uuid references public.personas (id),
  -- alta = Nuevo producto (la prenda todavía no existe) · revision = un precio ya puesto.
  origen text not null check (origen in ('alta', 'revision')),
  categoria_id uuid not null references retail.categorias (id),
  producto_id uuid references retail.productos (id),
  -- El nombre que tenía al pedir (en el alta todavía no hay producto).
  referencia text check (char_length(referencia) <= 120),
  -- El costo con que se calculó: el de la prenda o, si no tenía, el promedio de su categoría (`costo_estimado`). Vacío si no hubo ninguno.
  costo numeric(10, 2) check (costo is null or (costo > 0 and costo <= 5000)),
  costo_estimado boolean not null default false,
  precio_actual numeric(10, 2) check (precio_actual is null or (precio_actual >= 0 and precio_actual <= 5000)),
  -- El piso (costo + 30 % de margen, redondeado a .90) y lo que se propuso. Sin propuesta, `motivo` dice por qué.
  piso numeric(10, 2) check (piso is null or (piso > 0 and piso <= 5000)),
  precio_propuesto numeric(10, 2) check (precio_propuesto is null or (precio_propuesto > 0 and precio_propuesto <= 5000)),
  -- La IA propuso por debajo del piso y la regla lo subió.
  subido_al_piso boolean not null default false,
  razon text check (char_length(razon) <= 600),
  -- Las prendas parecidas que la IA dijo usar (`[{ referencia, precio }]`).
  parecidas jsonb not null default '[]'::jsonb check (jsonb_typeof(parecidas) = 'array' and jsonb_array_length(parecidas) <= 12),
  -- Por qué no hubo propuesta: sin_clave · sin_costo · tope · sin_respuesta · rechazo · respuesta_invalida.
  motivo text check (motivo in ('sin_clave', 'sin_costo', 'tope', 'sin_respuesta', 'rechazo', 'respuesta_invalida')),
  modelo text check (char_length(modelo) <= 60),
  tokens_entrada integer not null default 0 check (tokens_entrada >= 0),
  tokens_salida integer not null default 0 check (tokens_salida >= 0),
  -- Una propuesta cuesta ~US$0,03-0,05; el techo evita que una fila escrita a mano infle el gasto y deje a todos sin IA.
  costo_usd numeric(10, 6) not null default 0 check (costo_usd >= 0 and costo_usd <= 0.5),
  ms integer check (ms >= 0),
  check ((precio_propuesto is null) = (motivo is not null)),
  check (precio_propuesto is null or (piso is not null and costo is not null)),
  -- EL PISO DE FELIPE, en la base: nunca menos de 30 % de margen sobre el precio.
  check (precio_propuesto is null or precio_propuesto * 0.70 >= costo - 0.005),
  check (producto_id is not null or origen = 'alta')
);
comment on table retail.precio_propuestas is
  'ADR-0641: cada precio que la IA propuso (o por qué no propuso), con el costo usado, el piso de 30 % y lo que costó. Sin DELETE. Solo la tocan registrar_precio_propuesta y fn_precio_gasto_del_mes.';

create index if not exists precio_propuestas_creada_en on retail.precio_propuestas (creada_en);
create index if not exists precio_propuestas_producto on retail.precio_propuestas (producto_id, creada_en) where producto_id is not null;

alter table retail.precio_propuestas enable row level security;
revoke all on table retail.precio_propuestas from anon, authenticated;

-- Lo que la IA mira para proponer: la categoría, el costo promedio de la categoría (el respaldo de una prenda sin costo), la prenda
-- misma si ya existe, y hasta 12 parecidas de la misma categoría (primero las del mismo tejido y las que más se venden) con su precio,
-- su costo, lo vendido en 90 días y cuánto stock tienen. Solo lectura. Nada de clientes ni de personas.
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
  if auth.uid() is null or not retail.fn_ve_modulo('productos') then
    raise exception 'Sin acceso a Productos' using errcode = '42501';
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
  'ADR-0641: lo que la IA mira para proponer un precio (categoría, costo promedio de la categoría, la prenda y hasta 12 parecidas). Solo lectura; pide ver Productos.';
revoke all on function retail.fn_precio_contexto(uuid, uuid, uuid) from public, anon;
grant execute on function retail.fn_precio_contexto(uuid, uuid, uuid) to authenticated, service_role;

-- Anota una propuesta (o por qué no la hubo) y devuelve su id. La llama `/api/precio/proponer`.
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
  if auth.uid() is null or not retail.fn_ve_modulo('productos') then
    raise exception 'Sin acceso a Productos' using errcode = '42501';
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

-- Lo que costaron las propuestas del mes de Lima, en dólares: la web lo compara con el tope (US$ 20) antes de llamar a la IA.
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
  if auth.uid() is null or not retail.fn_ve_modulo('productos') then
    raise exception 'Sin acceso a Productos' using errcode = '42501';
  end if;
  return coalesce((select sum(costo_usd) from retail.precio_propuestas where creada_en >= v_desde), 0);
end;
$$;

comment on function retail.fn_precio_gasto_del_mes() is
  'ADR-0641: lo que costaron las propuestas de precio en el mes de Lima (US$), para el tope de US$ 20.';
revoke all on function retail.fn_precio_gasto_del_mes() from public, anon;
grant execute on function retail.fn_precio_gasto_del_mes() to authenticated, service_role;
