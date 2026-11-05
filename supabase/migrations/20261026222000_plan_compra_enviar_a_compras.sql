-- ============================================================================
-- 20261026222000 — Plan de campaña ▸ Enviar a Compras: los pedidos pendientes de campaña
--   (ADR-0530, Felipe 2026-10-26, spike ⑦ «Enviar a Compras» y tarea 7b de la auditoría)
--
-- EL PROBLEMA PRIMERO. El paso 2 del Plan dice QUÉ comprar (modelos, colores y tallas) pero ese reparto se queda en la pantalla: para pedirlo hay que volver a teclearlo en Órdenes de compra. Y una orden
--   de compra solo puede estar `generada` o `anulada`: no existe «lo que pienso pedir pero todavía no confirmé». Un borrador no es un pedido (principio 2): no se le puede sumar un estado «pendiente» a
--   `ordenes_compra` sin romper su numeración, su PDF, el envío al proveedor y `fn_plan_compra_pedido` (que solo cuenta las generadas).
--
-- LO QUE HACE.
--   1. `pedidos_campana`: un pedido pendiente por (campaña, categoría, proveedor): qué estado tiene (pendiente → pedido | rectificado), cuándo piensa la persona pedirlo («ya» o una fecha), con qué
--      versión del paso 2 se envió, cuántas prendas y a qué costo, quién y cuándo. Y `pedidos_campana_lineas`: la foto de lo enviado (modelo × color × talla × prendas), que no se edita.
--   2. `fn_plan_compra_envio` (qué se puede enviar y en qué estado está cada grupo), `fn_plan_compra_envios` (el resumen por categoría para la lista del Plan), `enviar_plan_compra_a_compras`
--      (deja los grupos como pendientes), `cambiar_fecha_pedido_campana`, `rectificar_pedido_campana` (cambiar de decisión ANTES de pedir) y `confirmar_pedido_campana` (el único paso que de
--      verdad pide: crea la orden de compra con `crear_orden_compra` y la deja ligada al pedido, todo en una transacción).
--   3. `fn_pedidos_campana` y `fn_pedido_campana_lineas`: lo que lee Compras ▸ Órdenes («Pendientes de campaña»).
--
-- LO QUE NO HACE.
--   · Enviar NO pide nada: solo deja el pedido pendiente. La única función que crea una orden es `confirmar_pedido_campana`, y la persona la aprieta en Compras.
--   · Lo del Taller (el proveedor «CAYLA SAC», que es el propio taller) NO se envía a Compras: es una orden de producción. Queda dicho en la lectura y no se crea ningún pedido (conectarlo a Producción
--     ▸ Órdenes es otro cambio, de otro módulo).
--   · Un pedido ya confirmado NO se rectifica desde aquí: es una orden, y se anula en Órdenes (para que la orden y el plan no queden contradiciéndose).
--   · No toca `ordenes_compra`, `fn_plan_compra_pedido` ni la numeración: la orden que crea es una más, igual a la que se crea a mano.
--
-- CONTRATO. PROMETE: a lo más UN pedido pendiente por campaña, categoría y proveedor, y a lo más uno ya pedido por cada versión del paso 2 (una segunda tanda al mismo proveedor nace de un paso 2 NUEVO,
--   que reparte lo que faltaba después de la primera orden); que un pedido solo pase de pendiente a pedido o a rectificado y de ahí no se mueva; que un
--   pedido «pedido» tenga SIEMPRE su orden de compra y que una orden no cubra dos pedidos; que lo enviado (las líneas) no se edite ni se borre; que confirmar dos veces el mismo pedido cree UNA
--   sola orden; y que lo que se manda sale del paso 2 GUARDADO, con la versión que la persona vio (si otra persona guardó otro paso 2 entre medio, se rechaza con `PT409`). ASUME: que el producto
--   de cada línea trae su marca y su proveedor (los que no, no se envían: la lectura dice cuántas prendas) y que el proveedor «CAYLA SAC» es el Taller.
--
-- ESTADOS QUE NUNCA DEBEN EXISTIR (los cierra el esquema, no la pantalla):
--   · un pedido con «ya» y una fecha, o con una fecha prevista sin decir «fecha» (CHECK `pedidos_campana_cuando_coherente`);
--   · un pedido `pedido` sin orden de compra, o uno `pendiente`/`rectificado` con una orden (CHECK `pedidos_campana_estado_coherente`); un `rectificado` sin motivo ni quién;
--   · dos pedidos pendientes de lo mismo, o dos ya pedidos de la misma versión del paso 2 (índices únicos parciales), o una orden ligada a dos pedidos (UNIQUE);
--   · un pedido que cambia después de pedido o de rectificado, o que se borra, o cuyo plan, categoría, proveedor, versión, prendas o costo se editan (disparador `pedidos_campana_guardia`);
--   · una línea editada o borrada (disparador `pedidos_campana_lineas_inmutable`, el mismo del historial del plan);
--   · nadie lee ni escribe las tablas desde la web (RLS sin políticas y sin permisos de tabla).
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Dos tablas NUEVAS con su `alter … enable row level security`, disparadores con `create or replace trigger` (nunca `drop trigger`: ADR-0195) y
--   funciones; SIN políticas; `lock_timeout` de 3 s; idempotente. No hace `alter` de ninguna tabla en uso. Va DESPUÉS de 20261026212000.
-- ORDEN CON LA WEB: da igual. La web nueva con la base vieja recibe «no existe esa función» y no ofrece enviar ni dibuja «Pendientes de campaña»; la web vieja con la base nueva no sabe de pedidos.
-- CAÍDA EXTERNA. Nada llama a la red. Confirmar es todo-o-nada: si `crear_orden_compra` falla (un proveedor inactivo, una marca inactiva), el pedido sigue pendiente y el mensaje dice qué falló.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- 1. Las tablas -----------------------------------------------------------------------------------------------------------------------

create table if not exists retail.pedidos_campana (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references retail.planes_compra (id),
  categoria_id uuid not null references retail.categorias (id),
  proveedor_id uuid not null references retail.proveedores (id),
  estado text not null default 'pendiente',
  -- Cuándo piensa la persona pedirlo: «ya» o una fecha. Es una intención, no un pedido.
  cuando text not null,
  fecha_prevista date,
  -- Con qué se envió: la versión del paso 2 (para saber si el plan cambió después), cuántas prendas y a qué costo por prenda (el del plan al enviar).
  paso_2_version integer not null check (paso_2_version >= 1),
  unidades integer not null check (unidades >= 1),
  costo_unitario numeric(12, 2) not null check (costo_unitario >= 0),
  enviado_por uuid not null references public.personas (id),
  enviado_en timestamptz not null default now(),
  -- Si la persona cambió la fecha mientras estaba pendiente.
  actualizado_por uuid references public.personas (id),
  actualizado_en timestamptz,
  -- Si se confirmó: la orden de compra que nació de él.
  orden_compra_id uuid references retail.ordenes_compra (id),
  pedido_por uuid references public.personas (id),
  pedido_en timestamptz,
  -- Si se rectificó: quién, cuándo y por qué.
  rectificado_por uuid references public.personas (id),
  rectificado_en timestamptz,
  motivo text,
  constraint pedidos_campana_estado_valido check (estado in ('pendiente', 'pedido', 'rectificado')),
  constraint pedidos_campana_cuando_coherente check (
    (cuando = 'ya' and fecha_prevista is null) or (cuando = 'fecha' and fecha_prevista is not null)
  ),
  constraint pedidos_campana_estado_coherente check (
    case estado
      when 'pendiente' then orden_compra_id is null and pedido_por is null and pedido_en is null and rectificado_por is null and rectificado_en is null and motivo is null
      when 'pedido' then orden_compra_id is not null and pedido_por is not null and pedido_en is not null and rectificado_por is null and rectificado_en is null and motivo is null
      when 'rectificado' then orden_compra_id is null and pedido_por is null and pedido_en is null and rectificado_por is not null and rectificado_en is not null and btrim(coalesce(motivo, '')) <> ''
    end
  ),
  constraint pedidos_campana_motivo_con_tope check (motivo is null or length(motivo) <= 200),
  constraint pedidos_campana_actualizado_con_autor check ((actualizado_por is null) = (actualizado_en is null)),
  constraint pedidos_campana_una_orden unique (orden_compra_id)
);
comment on table retail.pedidos_campana is
  'Lo que el Plan de campaña manda a Compras: un pedido PENDIENTE por (campaña, categoría, proveedor), con la fecha en que la persona piensa pedirlo. Solo pasa de pendiente a pedido (nace la orden de compra) o a rectificado (cambió de decisión antes de pedir). Enviar no pide nada.';
-- Un solo pedido PENDIENTE de lo mismo, y uno solo ya pedido por versión del paso 2 (los rectificados son historia y pueden repetirse; una segunda tanda al mismo proveedor viene de un paso 2 nuevo).
-- (El índice de una primera idea —uno solo «activo»— impedía esa segunda tanda: se quita.)
drop index if exists retail.pedidos_campana_uno_activo;
create unique index if not exists pedidos_campana_un_pendiente on retail.pedidos_campana (plan_id, categoria_id, proveedor_id) where estado = 'pendiente';
create unique index if not exists pedidos_campana_un_pedido_por_version on retail.pedidos_campana (plan_id, categoria_id, proveedor_id, paso_2_version) where estado = 'pedido';
create index if not exists pedidos_campana_pendientes on retail.pedidos_campana (fecha_prevista nulls first, enviado_en) where estado = 'pendiente';
alter table retail.pedidos_campana enable row level security;
revoke all on retail.pedidos_campana from public, anon, authenticated;

create table if not exists retail.pedidos_campana_lineas (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references retail.pedidos_campana (id),
  producto_id uuid not null references retail.productos (id),
  color_codigo text not null,
  talla_id uuid references retail.tallas (id),
  -- Hasta 100 000 por celda, igual que el paso 2 (que de ahí sale); lo que la orden de compra no acepte lo dirá ella al confirmar.
  cantidad integer not null check (cantidad >= 1 and cantidad <= 100000)
);
comment on table retail.pedidos_campana_lineas is
  'La foto de lo que se envió a Compras (modelo × color × talla × prendas), tomada del paso 2 guardado. No se edita ni se borra: si el plan cambia, se rectifica y se vuelve a enviar.';
create unique index if not exists pedidos_campana_lineas_unica on retail.pedidos_campana_lineas (pedido_id, producto_id, color_codigo, coalesce(talla_id, '00000000-0000-0000-0000-000000000000'::uuid));
alter table retail.pedidos_campana_lineas enable row level security;
revoke all on retail.pedidos_campana_lineas from public, anon, authenticated;

-- 2. Las guardias ---------------------------------------------------------------------------------------------------------------------

-- Un pedido no se borra; mientras está pendiente solo cambia su fecha o pasa a pedido o a rectificado; lo enviado (plan, categoría, proveedor, versión, prendas, costo, quién y cuándo) no se edita nunca.
create or replace function retail.fn_pedido_campana_guardia()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Un pedido de campaña no se borra: se rectifica' using hint = 'pedido_campana_no_se_borra';
  end if;
  if new.plan_id is distinct from old.plan_id or new.categoria_id is distinct from old.categoria_id or new.proveedor_id is distinct from old.proveedor_id
     or new.paso_2_version is distinct from old.paso_2_version or new.unidades is distinct from old.unidades or new.costo_unitario is distinct from old.costo_unitario
     or new.enviado_por is distinct from old.enviado_por or new.enviado_en is distinct from old.enviado_en or new.id is distinct from old.id then
    raise exception 'Lo que se envió a Compras no se edita: se rectifica y se vuelve a enviar' using hint = 'pedido_campana_no_se_edita';
  end if;
  if old.estado <> 'pendiente' then
    raise exception 'Un pedido de campaña que ya está «%» no cambia', old.estado using hint = 'pedido_campana_terminal';
  end if;
  return new;
end;
$$;
revoke all on function retail.fn_pedido_campana_guardia() from public, anon, authenticated;
create or replace trigger pedidos_campana_guardia
  before update or delete on retail.pedidos_campana
  for each row execute function retail.fn_pedido_campana_guardia();

create or replace trigger pedidos_campana_lineas_inmutable
  before update or delete on retail.pedidos_campana_lineas
  for each row execute function retail.fn_plan_compra_historial_inmutable();

-- 3. Quién es el Taller y de dónde salen los grupos ---------------------------------------------------------------------------------

-- El taller propio figura como el proveedor «CAYLA SAC» (así lo dejó 20260918231000). Lo suyo es una orden de producción, no de compra.
create or replace function retail.fn_es_proveedor_taller(p_proveedor_id uuid)
returns boolean
language sql
stable
set search_path = retail, public, extensions
as $$
  select exists (select 1 from retail.proveedores p where p.id = p_proveedor_id and retail.fn_clave_texto(p.nombre) = 'cayla sac')
$$;
revoke all on function retail.fn_es_proveedor_taller(uuid) from public, anon, authenticated;

-- Lo que el paso 2 GUARDADO de una categoría dice que hay que pedir, agrupado por quién lo surte. Interna: la lee la lectura de la pantalla y la de enviar, así los dos ven lo mismo.
create or replace function retail.fn_plan_compra_envio_base(p_plan_id uuid, p_categoria_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_foto retail.planes_compra_paso_2%rowtype;
  v_costo numeric;
  v_grupos jsonb;
  v_sin_proveedor integer;
  v_sin_marca integer;
  v_confirmadas integer;
begin
  for v_foto in select f.* from retail.planes_compra_paso_2 f where f.plan_id = p_plan_id and f.categoria_id = p_categoria_id order by f.version desc limit 1 loop exit; end loop;
  if v_foto.id is null then
    return null;
  end if;
  -- Las prendas que YA son orden de compra desde que se guardó este paso 2. «Comprar» del Plan baja con cada orden (es lo que FALTA pedir), así que el total con que se guardó el paso 2 ya no es igual a lo que
  -- falta: sin esto, confirmar un pedido haría ver el paso 2 «por revisar» y no dejaría enviar el resto. Solo cuentan las órdenes que siguen generadas (una anulada vuelve a sumar a lo que falta) y las
  -- confirmadas DESPUÉS de guardar el paso 2 (las anteriores ya están descontadas del total con que se guardó).
  v_confirmadas := coalesce((select sum(pe.unidades) from retail.pedidos_campana pe join retail.ordenes_compra o on o.id = pe.orden_compra_id and o.estado = 'generada'
                              where pe.plan_id = p_plan_id and pe.categoria_id = p_categoria_id and pe.estado = 'pedido' and pe.pedido_en >= v_foto.en), 0);
  for v_costo in select l.costo from retail.planes_compra_lineas l where l.plan_id = p_plan_id and l.categoria_id = p_categoria_id loop exit; end loop;

  with items as (
    select x.p as producto_id, x.c as color, x.t as talla_id, x.n as cantidad
      from jsonb_to_recordset(v_foto.items) as x(p uuid, c text, t uuid, n integer)
  ), detalle as (
    select i.producto_id, i.color, i.talla_id, i.cantidad, pr.referencia as modelo, pr.proveedor_id, pr.marca_id,
           m.nombre as marca, m.activo as marca_activa, pv.nombre as proveedor, pv.activo as proveedor_activo, ta.valor as talla,
           coalesce((select co.nombre from retail.colores co where co.codigo = i.color), i.color) as color_nombre
      from items i
      join retail.productos pr on pr.id = i.producto_id
      left join retail.marcas m on m.id = pr.marca_id
      left join retail.proveedores pv on pv.id = pr.proveedor_id
      left join retail.tallas ta on ta.id = i.talla_id
  )
  select coalesce(jsonb_agg(g order by g.proveedor), '[]'::jsonb) into v_grupos
    from (
      select d.proveedor_id, d.proveedor, bool_and(d.proveedor_activo) as proveedor_activo, retail.fn_es_proveedor_taller(d.proveedor_id) as es_taller,
             (select jsonb_agg(distinct d2.marca order by d2.marca) from detalle d2 where d2.proveedor_id = d.proveedor_id and d2.marca_id is not null) as marcas,
             -- Las marcas inactivas de este grupo: la orden de compra no las acepta, y mejor saberlo antes de enviar que al confirmar.
             (select jsonb_agg(distinct d2.marca order by d2.marca) from detalle d2 where d2.proveedor_id = d.proveedor_id and d2.marca_id is not null and not d2.marca_activa) as marcas_inactivas,
             count(distinct d.producto_id)::integer as modelos, sum(d.cantidad)::integer as unidades,
             jsonb_agg(jsonb_build_object('producto_id', d.producto_id, 'modelo', d.modelo, 'marca_id', d.marca_id, 'marca', d.marca, 'color', d.color, 'color_nombre', d.color_nombre,
                                          'talla_id', d.talla_id, 'talla', d.talla, 'n', d.cantidad)
                       order by d.modelo, d.color_nombre, retail.fn_actividad_peso_talla(d.talla), d.talla) as lineas
        from detalle d
       where d.proveedor_id is not null and d.marca_id is not null
       group by d.proveedor_id, d.proveedor
    ) g;

  select coalesce(sum(i.n) filter (where pr.proveedor_id is null), 0)::integer,
         coalesce(sum(i.n) filter (where pr.proveedor_id is not null and pr.marca_id is null), 0)::integer
    into v_sin_proveedor, v_sin_marca
    from jsonb_to_recordset(v_foto.items) as i(p uuid, c text, t uuid, n integer)
    join retail.productos pr on pr.id = i.p;

  return jsonb_build_object(
    'paso_2', jsonb_build_object('version', v_foto.version, 'total', v_foto.total, 'unidades', v_foto.unidades, 'por', v_foto.por, 'en', v_foto.en),
    'costo', v_costo,
    'grupos', v_grupos,
    'confirmadas', v_confirmadas,
    'sin_proveedor', v_sin_proveedor,
    'sin_marca', v_sin_marca,
    -- Lo que el paso 2 dejó «por elegir»: no hay un producto que pedir todavía.
    'modelos_nuevos', greatest(v_foto.total - v_foto.unidades, 0));
end;
$$;
revoke all on function retail.fn_plan_compra_envio_base(uuid, uuid) from public, anon, authenticated;

-- 4. Leer lo que se puede enviar ---------------------------------------------------------------------------------------------------

create or replace function retail.fn_plan_compra_envio(p_plan_id uuid, p_categoria_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_base jsonb;
begin
  if retail.fn_ve_modulo('plan_compra') is not true then
    raise exception 'Ver el plan de campaña necesita el módulo «Plan de campaña» en tu rol'
      using errcode = '42501', hint = 'plan_compra_sin_modulo';
  end if;
  if not exists (select 1 from retail.planes_compra p where p.id = p_plan_id) or not exists (select 1 from retail.categorias c where c.id = p_categoria_id) then
    raise exception 'Esa campaña o esa categoría no existe' using hint = 'plan_compra_inexistente';
  end if;
  v_base := retail.fn_plan_compra_envio_base(p_plan_id, p_categoria_id);
  return jsonb_build_object(
    'soportado', true,
    'base', v_base,
    -- Los pedidos de esta categoría en esta campaña, el vigente de cada proveedor primero y la historia (rectificados y pedidos) después.
    'pedidos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', pe.id, 'proveedor_id', pe.proveedor_id, 'estado', pe.estado, 'cuando', pe.cuando, 'fecha_prevista', pe.fecha_prevista,
               'paso_2_version', pe.paso_2_version, 'unidades', pe.unidades, 'enviado_por', retail.fn_actividad_nombre(pe.enviado_por), 'enviado_en', pe.enviado_en,
               'orden_numero', (select o.numero from retail.ordenes_compra o where o.id = pe.orden_compra_id),
               'orden_texto', (select retail.fn_orden_compra_numero_texto(o.numero) from retail.ordenes_compra o where o.id = pe.orden_compra_id),
               'motivo', pe.motivo, 'rectificado_en', pe.rectificado_en)
             order by (pe.estado = 'rectificado'), pe.enviado_en desc)
        from retail.pedidos_campana pe where pe.plan_id = p_plan_id and pe.categoria_id = p_categoria_id), '[]'::jsonb));
end;
$$;
revoke all on function retail.fn_plan_compra_envio(uuid, uuid) from public, anon;
grant execute on function retail.fn_plan_compra_envio(uuid, uuid) to authenticated, service_role;
comment on function retail.fn_plan_compra_envio(uuid, uuid) is
  'Lo que el paso 2 guardado de una categoría manda a Compras: sus grupos por proveedor (con sus líneas), lo que no se envía (sin proveedor, sin marca, modelos nuevos, el Taller) y los pedidos que ya se enviaron con su estado.';

create or replace function retail.fn_plan_compra_envios(p_plan_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if retail.fn_ve_modulo('plan_compra') is not true then
    raise exception 'Ver el plan de campaña necesita el módulo «Plan de campaña» en tu rol'
      using errcode = '42501', hint = 'plan_compra_sin_modulo';
  end if;
  return jsonb_build_object(
    'soportado', true,
    'categorias', coalesce((
      select jsonb_agg(jsonb_build_object(
               'categoria_id', x.categoria_id, 'pendientes', x.pendientes, 'pedidos', x.pedidos, 'rectificados', x.rectificados,
               'desactualizado', x.desactualizado, 'confirmadas', x.confirmadas))
        from (
          select pe.categoria_id,
                 count(*) filter (where pe.estado = 'pendiente')::integer as pendientes,
                 count(*) filter (where pe.estado = 'pedido')::integer as pedidos,
                 count(*) filter (where pe.estado = 'rectificado')::integer as rectificados,
                 -- Solo un pedido PENDIENTE puede estar desactualizado (lo de Compras es de un paso 2 anterior): uno ya pedido es historia, no hay nada que corregir en él.
                 coalesce(bool_or(pe.estado = 'pendiente'
                                  and pe.paso_2_version <> (select max(f.version) from retail.planes_compra_paso_2 f where f.plan_id = pe.plan_id and f.categoria_id = pe.categoria_id)), false) as desactualizado,
                 -- Las prendas que ya son orden desde que se guardó el último paso 2 (ver `fn_plan_compra_envio_base`): la lista del Plan las suma a «Comprar» para saber si el paso 2 sigue siendo lo que se compra.
                 coalesce(sum(pe.unidades) filter (where pe.estado = 'pedido'
                                                     and exists (select 1 from retail.ordenes_compra o where o.id = pe.orden_compra_id and o.estado = 'generada')
                                                     and pe.pedido_en >= (select max(f.en) from retail.planes_compra_paso_2 f where f.plan_id = pe.plan_id and f.categoria_id = pe.categoria_id)), 0)::integer as confirmadas
            from retail.pedidos_campana pe
           where pe.plan_id = p_plan_id
           group by pe.categoria_id
        ) x), '[]'::jsonb));
end;
$$;
revoke all on function retail.fn_plan_compra_envios(uuid) from public, anon;
grant execute on function retail.fn_plan_compra_envios(uuid) to authenticated, service_role;
comment on function retail.fn_plan_compra_envios(uuid) is
  'Por categoría de una campaña: cuántos pedidos a Compras hay pendientes, pedidos y rectificados, y si el paso 2 cambió después de enviarlos.';

-- 5. Enviar a Compras (deja pendientes; no pide nada) -------------------------------------------------------------------------------

create or replace function retail.enviar_plan_compra_a_compras(p_plan_id uuid, p_categoria_id uuid, p_paso_2_version integer, p_envios jsonb)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
  v_hoy date := retail.fn_hoy_lima();
  v_base jsonb;
  v_version integer;
  v_costo numeric;
  v_envio jsonb;
  v_proveedor uuid;
  v_cuando text;
  v_fecha date;
  v_grupo jsonb;
  v_activo record;
  v_id uuid;
  v_vistos uuid[] := '{}';
  v_creados jsonb := '[]'::jsonb;
  v_ya integer := 0;
begin
  if retail.fn_ve_modulo('plan_compra') is not true then
    raise exception 'Enviar a Compras necesita el módulo «Plan de campaña» en tu rol'
      using errcode = '42501', hint = 'plan_compra_sin_modulo';
  end if;
  if not exists (select 1 from retail.planes_compra p where p.id = p_plan_id and p.archivado_en is null) or not exists (select 1 from retail.categorias c where c.id = p_categoria_id) then
    raise exception 'Esa campaña o esa categoría no existe' using hint = 'plan_compra_inexistente';
  end if;
  if p_envios is null or jsonb_typeof(p_envios) <> 'array' or jsonb_array_length(p_envios) = 0 then
    raise exception 'Elige a quién enviar' using hint = 'pedido_campana_sin_envios';
  end if;
  if jsonb_array_length(p_envios) > 50 then
    raise exception 'Se pueden enviar hasta 50 proveedores a la vez' using hint = 'pedido_campana_muchos';
  end if;
  v_persona := retail.fn_actor_persona_id(true);
  if v_persona is null then
    raise exception 'No se encontró tu ficha de colaborador';
  end if;

  -- En fila con quien envía lo mismo a la vez: el segundo ve lo que dejó el primero.
  perform pg_advisory_xact_lock(hashtextextended('pedido_campana:' || p_plan_id::text || ':' || p_categoria_id::text, 0));
  v_base := retail.fn_plan_compra_envio_base(p_plan_id, p_categoria_id);
  if v_base is null then
    raise exception 'Esta categoría todavía no tiene su paso 2 guardado: no hay qué enviar' using hint = 'pedido_campana_sin_paso_2';
  end if;
  v_version := (v_base -> 'paso_2' ->> 'version')::integer;
  if p_paso_2_version is distinct from v_version then
    raise exception 'Otra persona guardó otro paso 2 de esta categoría mientras lo mirabas: lo tuyo no se envió. Vuelve a abrirla para ver lo que guardó.'
      using errcode = 'PT409', hint = 'version_cambiada';
  end if;
  v_costo := (v_base ->> 'costo')::numeric;
  if v_costo is null or v_costo < 0 or v_costo > 99999.99 then
    raise exception 'El plan de esta categoría no tiene un costo por prenda válido' using hint = 'pedido_campana_sin_costo';
  end if;

  for v_envio in select value from jsonb_array_elements(p_envios) loop
    if jsonb_typeof(v_envio) <> 'object' then
      raise exception 'Un envío no se entiende: cada uno lleva su proveedor y cuándo pedir' using hint = 'pedido_campana_formato';
    end if;
    begin
      v_proveedor := nullif(v_envio ->> 'proveedor_id', '')::uuid;
      v_fecha := nullif(v_envio ->> 'fecha', '')::date;
    exception when others then
      raise exception 'Un envío trae un proveedor o una fecha que no se entiende' using hint = 'pedido_campana_formato';
    end;
    v_cuando := v_envio ->> 'cuando';
    if v_proveedor is null or v_cuando is null or v_cuando not in ('ya', 'fecha') then
      raise exception 'Cada envío dice a qué proveedor va y si se pide «ya» o en una fecha' using hint = 'pedido_campana_formato';
    end if;
    if v_proveedor = any (v_vistos) then
      raise exception 'Un proveedor aparece dos veces en el envío' using hint = 'pedido_campana_repetido';
    end if;
    v_vistos := v_vistos || v_proveedor;
    if v_cuando = 'fecha' and (v_fecha is null or v_fecha < v_hoy or v_fecha > v_hoy + 365) then
      raise exception 'La fecha en que piensas pedir va desde hoy y hasta dentro de un año' using hint = 'pedido_campana_fecha';
    end if;
    if v_cuando = 'ya' then
      v_fecha := null;
    end if;
    v_grupo := null;
    select g into v_grupo from jsonb_array_elements(v_base -> 'grupos') g where (g ->> 'proveedor_id')::uuid = v_proveedor;
    if v_grupo is null then
      raise exception 'Ese proveedor no tiene nada de esta categoría en el paso 2 (o sus prendas no traen marca)' using hint = 'pedido_campana_proveedor';
    end if;
    if (v_grupo ->> 'es_taller')::boolean then
      raise exception 'Lo del Taller no se envía a Compras: es una orden de producción' using hint = 'pedido_campana_taller';
    end if;
    -- Una orden de compra no acepta un proveedor ni una marca inactivos: mejor saberlo ahora que al confirmar.
    if (v_grupo ->> 'proveedor_activo')::boolean is not true then
      raise exception 'El proveedor «%» está inactivo: reactívalo antes de enviarle un pedido', v_grupo ->> 'proveedor' using hint = 'pedido_campana_proveedor_inactivo';
    end if;
    if v_grupo -> 'marcas_inactivas' is not null and v_grupo -> 'marcas_inactivas' <> 'null'::jsonb then
      raise exception 'La marca «%» está inactiva: reactívala antes de enviar este pedido', v_grupo -> 'marcas_inactivas' ->> 0 using hint = 'pedido_campana_marca_inactiva';
    end if;

    -- Ya enviado: si es lo mismo (un doble clic, un reintento tras un corte de red) no se hace nada; si no, se dice. Lo que impide enviar: un pedido PENDIENTE de este proveedor (de cualquier versión del paso 2:
    -- se rectifica antes) o uno ya pedido de ESTA misma versión. Un pedido ya confirmado de un paso 2 ANTERIOR no impide nada: el paso 2 nuevo reparte lo que faltaba después de esa orden (segunda tanda).
    v_activo := null;
    for v_activo in select pe.id, pe.estado, pe.cuando, pe.fecha_prevista, pe.paso_2_version from retail.pedidos_campana pe
                     where pe.plan_id = p_plan_id and pe.categoria_id = p_categoria_id and pe.proveedor_id = v_proveedor
                       and (pe.estado = 'pendiente' or (pe.estado = 'pedido' and pe.paso_2_version = v_version))
                     order by (pe.estado = 'pendiente') desc loop exit; end loop;
    if v_activo.id is not null then
      if v_activo.estado = 'pendiente' and v_activo.paso_2_version = v_version and v_activo.cuando = v_cuando and v_activo.fecha_prevista is not distinct from v_fecha then
        v_ya := v_ya + 1;
        continue;
      end if;
      if v_activo.estado = 'pendiente' and v_activo.paso_2_version <> v_version then
        raise exception 'Ese proveedor ya tiene un pedido pendiente de un paso 2 anterior: rectifícalo para enviar lo nuevo' using hint = 'pedido_campana_pendiente_anterior';
      end if;
      raise exception 'Ese proveedor ya está %: para cambiarlo, cambia la fecha o rectifícalo desde Compras ▸ Órdenes',
          case v_activo.estado when 'pendiente' then 'enviado a Compras' else 'pedido con este mismo paso 2' end using hint = 'pedido_campana_ya_enviado';
    end if;

    insert into retail.pedidos_campana (plan_id, categoria_id, proveedor_id, cuando, fecha_prevista, paso_2_version, unidades, costo_unitario, enviado_por)
    values (p_plan_id, p_categoria_id, v_proveedor, v_cuando, v_fecha, v_version, (v_grupo ->> 'unidades')::integer, v_costo, v_persona)
    returning id into v_id;
    insert into retail.pedidos_campana_lineas (pedido_id, producto_id, color_codigo, talla_id, cantidad)
    select v_id, (l ->> 'producto_id')::uuid, l ->> 'color', nullif(l ->> 'talla_id', '')::uuid, (l ->> 'n')::integer
      from jsonb_array_elements(v_grupo -> 'lineas') l;
    v_creados := v_creados || jsonb_build_array(jsonb_build_object('id', v_id, 'proveedor_id', v_proveedor));
  end loop;

  return jsonb_build_object('creados', jsonb_array_length(v_creados), 'ya_enviados', v_ya, 'pedidos', v_creados);
end;
$$;
revoke all on function retail.enviar_plan_compra_a_compras(uuid, uuid, integer, jsonb) from public, anon;
grant execute on function retail.enviar_plan_compra_a_compras(uuid, uuid, integer, jsonb) to authenticated, service_role;
comment on function retail.enviar_plan_compra_a_compras(uuid, uuid, integer, jsonb) is
  'Deja como PENDIENTES en Compras los pedidos de una categoría, uno por proveedor, tomados del paso 2 guardado (con la versión que la persona vio: PT409 si otra persona guardó otro). No pide nada. Lo idéntico a lo ya enviado no se repite; lo del Taller no se envía.';

-- 6. Cambiar la fecha y rectificar (cambiar de decisión antes de pedir) --------------------------------------------------------------

create or replace function retail.cambiar_fecha_pedido_campana(p_pedido_id uuid, p_cuando text, p_fecha date)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
  v_hoy date := retail.fn_hoy_lima();
  v_ped retail.pedidos_campana%rowtype;
  v_fecha date := p_fecha;
begin
  if retail.fn_ve_modulo('plan_compra') is not true and retail.fn_ve_modulo('ordenes_compra') is not true then
    raise exception 'Cambiar cuándo pedir necesita el módulo «Plan de campaña» o «Órdenes de compra» en tu rol'
      using errcode = '42501', hint = 'pedido_campana_sin_modulo';
  end if;
  if p_cuando is null or p_cuando not in ('ya', 'fecha') then
    raise exception 'Elige si se pide «ya» o en una fecha' using hint = 'pedido_campana_formato';
  end if;
  if p_cuando = 'fecha' and (v_fecha is null or v_fecha < v_hoy or v_fecha > v_hoy + 365) then
    raise exception 'La fecha en que piensas pedir va desde hoy y hasta dentro de un año' using hint = 'pedido_campana_fecha';
  end if;
  if p_cuando = 'ya' then
    v_fecha := null;
  end if;
  for v_ped in select pe.* from retail.pedidos_campana pe where pe.id = p_pedido_id for update loop exit; end loop;
  if v_ped.id is null then
    raise exception 'Ese pedido no existe' using hint = 'pedido_campana_inexistente';
  end if;
  if v_ped.estado <> 'pendiente' then
    raise exception 'Ese pedido ya está «%»: la fecha solo se cambia mientras está pendiente', v_ped.estado using hint = 'pedido_campana_terminal';
  end if;
  if v_ped.cuando = p_cuando and v_ped.fecha_prevista is not distinct from v_fecha then
    return jsonb_build_object('sin_cambios', true);
  end if;
  v_persona := retail.fn_actor_persona_id(true);
  if v_persona is null then
    raise exception 'No se encontró tu ficha de colaborador';
  end if;
  update retail.pedidos_campana set cuando = p_cuando, fecha_prevista = v_fecha, actualizado_por = v_persona, actualizado_en = now() where id = p_pedido_id;
  return jsonb_build_object('sin_cambios', false);
end;
$$;
revoke all on function retail.cambiar_fecha_pedido_campana(uuid, text, date) from public, anon;
grant execute on function retail.cambiar_fecha_pedido_campana(uuid, text, date) to authenticated, service_role;
comment on function retail.cambiar_fecha_pedido_campana(uuid, text, date) is
  'Cambia cuándo piensa la persona pedir un pedido de campaña que sigue pendiente («ya» o una fecha). No pide nada.';

create or replace function retail.rectificar_pedido_campana(p_pedido_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_ped retail.pedidos_campana%rowtype;
begin
  if retail.fn_ve_modulo('plan_compra') is not true and retail.fn_ve_modulo('ordenes_compra') is not true then
    raise exception 'Rectificar un pedido necesita el módulo «Plan de campaña» o «Órdenes de compra» en tu rol'
      using errcode = '42501', hint = 'pedido_campana_sin_modulo';
  end if;
  if v_motivo is null or length(v_motivo) < 3 or length(v_motivo) > 200 then
    raise exception 'Di por qué rectificas, en pocas palabras (de 3 a 200 letras)' using hint = 'pedido_campana_motivo';
  end if;
  for v_ped in select pe.* from retail.pedidos_campana pe where pe.id = p_pedido_id for update loop exit; end loop;
  if v_ped.id is null then
    raise exception 'Ese pedido no existe' using hint = 'pedido_campana_inexistente';
  end if;
  if v_ped.estado = 'rectificado' then
    return jsonb_build_object('sin_cambios', true);
  end if;
  if v_ped.estado = 'pedido' then
    raise exception 'Ese pedido ya es una orden de compra: para deshacerlo, anúlala en Compras ▸ Órdenes (no se rectifica desde aquí)' using hint = 'pedido_campana_ya_es_orden';
  end if;
  v_persona := retail.fn_actor_persona_id(true);
  if v_persona is null then
    raise exception 'No se encontró tu ficha de colaborador';
  end if;
  update retail.pedidos_campana set estado = 'rectificado', rectificado_por = v_persona, rectificado_en = now(), motivo = v_motivo where id = p_pedido_id;
  return jsonb_build_object('sin_cambios', false);
end;
$$;
revoke all on function retail.rectificar_pedido_campana(uuid, text) from public, anon;
grant execute on function retail.rectificar_pedido_campana(uuid, text) to authenticated, service_role;
comment on function retail.rectificar_pedido_campana(uuid, text) is
  'Cambiar de decisión ANTES de pedir: el pedido de campaña pendiente se retira de Compras y vuelve al Plan como «por enviar», con quién, cuándo y por qué. Uno que ya es orden de compra no se rectifica: se anula en Órdenes.';

-- 7. Confirmar y pedir (el único paso que crea la orden) --------------------------------------------------------------------------

create or replace function retail.confirmar_pedido_campana(p_pedido_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
  v_hoy date := retail.fn_hoy_lima();
  v_ped retail.pedidos_campana%rowtype;
  v_plan retail.planes_compra%rowtype;
  v_categoria text;
  v_orden uuid := gen_random_uuid();
  v_entrega date;
  v_lineas jsonb;
  v_n integer;
  v_numero integer;
  v_marca_mala text;
  v_modelo_cambiado text;
begin
  if retail.fn_ve_modulo('ordenes_compra') is not true then
    raise exception 'Confirmar y pedir necesita el módulo «Órdenes de compra» en tu rol'
      using errcode = '42501', hint = 'ordenes_compra_sin_modulo';
  end if;
  for v_ped in select pe.* from retail.pedidos_campana pe where pe.id = p_pedido_id for update loop exit; end loop;
  if v_ped.id is null then
    raise exception 'Ese pedido no existe' using hint = 'pedido_campana_inexistente';
  end if;
  -- Doble clic o dos personas a la vez: el pedido ya se confirmó. Se devuelve la misma orden; nunca se crea otra.
  if v_ped.estado = 'pedido' then
    return jsonb_build_object('orden_id', v_ped.orden_compra_id, 'numero', (select o.numero from retail.ordenes_compra o where o.id = v_ped.orden_compra_id), 'sin_cambios', true);
  end if;
  if v_ped.estado = 'rectificado' then
    raise exception 'Ese pedido se rectificó: ya no se pide. Si lo quieres, vuelve a enviarlo desde el Plan de campaña' using hint = 'pedido_campana_rectificado';
  end if;
  v_persona := retail.fn_actor_persona_id(true);
  if v_persona is null then
    raise exception 'No se encontró tu ficha de colaborador';
  end if;

  for v_plan in select p.* from retail.planes_compra p where p.id = v_ped.plan_id loop exit; end loop;
  v_categoria := (select c.nombre from retail.categorias c where c.id = v_ped.categoria_id);
  -- La orden llega para el inicio de la campaña (o hoy, si ya empezó): así cuenta como pedida de ESTA campaña en el Plan y en Finanzas (`fn_plan_compra_pedido` mira la entrega estimada).
  v_entrega := least(greatest(v_plan.desde, v_hoy), v_hoy + 365);

  -- Lo que la orden de compra no acepta, dicho con el nombre de la cosa (la orden diría «la línea 3»): un proveedor, una categoría o una marca que se desactivó, o un modelo al que se le quitó la marca desde que se envió.
  if not exists (select 1 from retail.proveedores pv where pv.id = v_ped.proveedor_id and pv.activo) then
    raise exception 'El proveedor «%» está inactivo: reactívalo, o rectifica este pedido', (select pv.nombre from retail.proveedores pv where pv.id = v_ped.proveedor_id) using hint = 'pedido_campana_proveedor_inactivo';
  end if;
  if not exists (select 1 from retail.categorias c where c.id = v_ped.categoria_id and c.activo) then
    raise exception 'La categoría «%» está inactiva: reactívala, o rectifica este pedido', v_categoria using hint = 'pedido_campana_categoria_inactiva';
  end if;
  v_marca_mala := null;
  for v_marca_mala in select pr.referencia || case when m.id is null then ' (sin marca)' else ' (marca «' || m.nombre || '» inactiva)' end
                        from retail.pedidos_campana_lineas l join retail.productos pr on pr.id = l.producto_id left join retail.marcas m on m.id = pr.marca_id
                       where l.pedido_id = p_pedido_id and (m.id is null or not m.activo) order by pr.referencia loop exit; end loop;
  if v_marca_mala is not null then
    raise exception 'No se puede pedir %. Arréglalo en el catálogo, o rectifica este pedido', v_marca_mala using hint = 'pedido_campana_marca_inactiva';
  end if;
  -- El pedido guarda el proveedor al que se envió; el del modelo puede haber cambiado desde entonces. Pedirle a quien ya no lo surte es el error que no se ve hasta que llega la mercadería.
  v_modelo_cambiado := null;
  for v_modelo_cambiado in select pr.referencia from retail.pedidos_campana_lineas l join retail.productos pr on pr.id = l.producto_id
                            where l.pedido_id = p_pedido_id and pr.proveedor_id is distinct from v_ped.proveedor_id order by pr.referencia loop exit; end loop;
  if v_modelo_cambiado is not null then
    raise exception 'El proveedor de «%» cambió desde que se envió este pedido: rectifícalo y vuelve a enviarlo desde el Plan de campaña', v_modelo_cambiado using hint = 'pedido_campana_proveedor_cambio';
  end if;

  -- Una línea por modelo (con sus colores y tallas dichos en la descripción: la orden no guarda color ni talla). Si son más de 100, una línea por marca: una orden lleva hasta 100.
  select count(distinct l.producto_id) into v_n from retail.pedidos_campana_lineas l where l.pedido_id = p_pedido_id;
  if v_n <= 100 then
    select jsonb_agg(jsonb_build_object('categoria_id', v_ped.categoria_id, 'marca_id', m.marca_id, 'descripcion', left(m.modelo || ' · ' || m.detalle, 200), 'cantidad', m.cantidad, 'precio_unitario', v_ped.costo_unitario) order by m.modelo)
      into v_lineas
      from (
        select pr.id, pr.marca_id, pr.referencia as modelo, sum(c.cantidad)::integer as cantidad,
               string_agg(c.texto, '; ' order by c.color_nombre) as detalle
          from (
            select l.producto_id, coalesce((select co.nombre from retail.colores co where co.codigo = l.color_codigo), l.color_codigo) as color_nombre, sum(l.cantidad)::integer as cantidad,
                   coalesce((select co.nombre from retail.colores co where co.codigo = l.color_codigo), l.color_codigo) || ' '
                     || string_agg(case when l.talla_id is null then l.cantidad::text else ta.valor || '×' || l.cantidad end, ' ' order by retail.fn_actividad_peso_talla(ta.valor), ta.valor) as texto
              from retail.pedidos_campana_lineas l
              left join retail.tallas ta on ta.id = l.talla_id
             where l.pedido_id = p_pedido_id
             group by l.producto_id, l.color_codigo
          ) c
          join retail.productos pr on pr.id = c.producto_id
         group by pr.id, pr.marca_id, pr.referencia
      ) m;
  else
    select jsonb_agg(jsonb_build_object('categoria_id', v_ped.categoria_id, 'marca_id', m.marca_id, 'descripcion', m.cuantos || ' modelos de la campaña (el detalle está en el pedido de campaña)', 'cantidad', m.cantidad, 'precio_unitario', v_ped.costo_unitario) order by m.marca_id)
      into v_lineas
      from (
        select pr.marca_id, count(distinct pr.id) as cuantos, sum(l.cantidad)::integer as cantidad
          from retail.pedidos_campana_lineas l join retail.productos pr on pr.id = l.producto_id
         where l.pedido_id = p_pedido_id
         group by pr.marca_id
      ) m;
  end if;
  if v_lineas is null then
    raise exception 'Ese pedido no tiene líneas' using hint = 'pedido_campana_sin_lineas';
  end if;

  -- La orden de compra de siempre (con todas sus reglas: líneas, precios, cantidades). Si falla, el pedido sigue pendiente y el mensaje dice qué.
  perform retail.crear_orden_compra(
    v_orden, v_ped.proveedor_id, null, v_entrega,
    left('Pedido de campaña: ' || v_plan.nombre || ' · ' || coalesce(v_categoria, 'categoría') || '. Viene del Plan de campaña; el detalle por modelo, color y talla está en el pedido de campaña.', 500),
    v_lineas);
  v_numero := (select o.numero from retail.ordenes_compra o where o.id = v_orden);
  update retail.pedidos_campana set estado = 'pedido', orden_compra_id = v_orden, pedido_por = v_persona, pedido_en = now() where id = p_pedido_id;
  return jsonb_build_object('orden_id', v_orden, 'numero', v_numero, 'sin_cambios', false);
end;
$$;
revoke all on function retail.confirmar_pedido_campana(uuid) from public, anon;
grant execute on function retail.confirmar_pedido_campana(uuid) to authenticated, service_role;
comment on function retail.confirmar_pedido_campana(uuid) is
  'El único paso que de verdad pide: crea la orden de compra del pedido de campaña pendiente (con crear_orden_compra y todas sus reglas) y lo deja ligado a ella, en una transacción. Confirmar dos veces el mismo pedido devuelve la misma orden.';

-- 8. Lo que lee Compras ▸ Órdenes -----------------------------------------------------------------------------------------------

create or replace function retail.fn_pedidos_campana()
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if retail.fn_ve_modulo('ordenes_compra') is not true then
    raise exception 'Ver los pedidos de campaña necesita el módulo «Órdenes de compra» en tu rol'
      using errcode = '42501', hint = 'ordenes_compra_sin_modulo';
  end if;
  return jsonb_build_object(
    'soportado', true,
    -- Todos los pendientes, y lo que se pidió o rectificó hace poco (para ver en qué quedó cada uno).
    'pedidos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', pe.id, 'estado', pe.estado, 'cuando', pe.cuando, 'fecha_prevista', pe.fecha_prevista,
               'plan', jsonb_build_object('id', pl.id, 'nombre', pl.nombre, 'desde', pl.desde, 'hasta', pl.hasta, 'dias_para_llegar', pl.dias_para_llegar),
               'categoria', jsonb_build_object('id', ca.id, 'nombre', ca.nombre),
               'proveedor', jsonb_build_object('id', pv.id, 'nombre', pv.nombre),
               'unidades', pe.unidades, 'modelos', (select count(distinct l.producto_id) from retail.pedidos_campana_lineas l where l.pedido_id = pe.id)::integer,
               'costo_unitario', pe.costo_unitario, 'paso_2_version', pe.paso_2_version,
               'desactualizado', pe.estado = 'pendiente'
                                 and pe.paso_2_version <> coalesce((select max(f.version) from retail.planes_compra_paso_2 f where f.plan_id = pe.plan_id and f.categoria_id = pe.categoria_id), pe.paso_2_version),
               -- Un modelo del pedido ya es de otro proveedor: confirmar se rechazaría; mejor decirlo antes de que la persona apriete el botón.
               'cambio_el_proveedor', pe.estado = 'pendiente' and exists (select 1 from retail.pedidos_campana_lineas l join retail.productos pr on pr.id = l.producto_id
                                                                             where l.pedido_id = pe.id and pr.proveedor_id is distinct from pe.proveedor_id),
               'enviado_por', retail.fn_actividad_nombre(pe.enviado_por), 'enviado_en', pe.enviado_en,
               'orden', case when pe.orden_compra_id is null then null
                             else jsonb_build_object('id', pe.orden_compra_id, 'numero', (select o.numero from retail.ordenes_compra o where o.id = pe.orden_compra_id),
                                                     'texto', (select retail.fn_orden_compra_numero_texto(o.numero) from retail.ordenes_compra o where o.id = pe.orden_compra_id),
                                                     'por', retail.fn_actividad_nombre(pe.pedido_por), 'en', pe.pedido_en) end,
               'rectificado', case when pe.estado <> 'rectificado' then null
                                   else jsonb_build_object('por', retail.fn_actividad_nombre(pe.rectificado_por), 'en', pe.rectificado_en, 'motivo', pe.motivo) end)
             order by (pe.estado = 'pendiente') desc, pe.fecha_prevista nulls first, pe.enviado_en desc)
        from retail.pedidos_campana pe
        join retail.planes_compra pl on pl.id = pe.plan_id
        join retail.categorias ca on ca.id = pe.categoria_id
        join retail.proveedores pv on pv.id = pe.proveedor_id
       where pe.estado = 'pendiente' or (pe.estado = 'pedido' and pe.pedido_en >= now() - interval '30 days') or (pe.estado = 'rectificado' and pe.rectificado_en >= now() - interval '14 days')), '[]'::jsonb));
end;
$$;
revoke all on function retail.fn_pedidos_campana() from public, anon;
grant execute on function retail.fn_pedidos_campana() to authenticated, service_role;
comment on function retail.fn_pedidos_campana() is
  'Los pedidos de campaña que el Plan mandó a Compras: todos los pendientes, y lo pedido (30 días) o rectificado (14 días) hace poco, con su campaña, su categoría, su proveedor y su estado.';

create or replace function retail.fn_pedido_campana_lineas(p_pedido_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if retail.fn_ve_modulo('ordenes_compra') is not true and retail.fn_ve_modulo('plan_compra') is not true then
    raise exception 'Ver las líneas de un pedido de campaña necesita el módulo «Órdenes de compra» o «Plan de campaña» en tu rol'
      using errcode = '42501', hint = 'pedido_campana_sin_modulo';
  end if;
  if not exists (select 1 from retail.pedidos_campana pe where pe.id = p_pedido_id) then
    return null;
  end if;
  return jsonb_build_object(
    'soportado', true,
    'lineas', coalesce((
      select jsonb_agg(jsonb_build_object('producto_id', l.producto_id, 'modelo', pr.referencia, 'marca', m.nombre,
                                          'color', l.color_codigo, 'color_nombre', coalesce((select co.nombre from retail.colores co where co.codigo = l.color_codigo), l.color_codigo),
                                          'talla_id', l.talla_id, 'talla', ta.valor, 'n', l.cantidad)
                       order by pr.referencia, l.color_codigo, retail.fn_actividad_peso_talla(ta.valor), ta.valor)
        from retail.pedidos_campana_lineas l
        join retail.productos pr on pr.id = l.producto_id
        left join retail.marcas m on m.id = pr.marca_id
        left join retail.tallas ta on ta.id = l.talla_id
       where l.pedido_id = p_pedido_id), '[]'::jsonb));
end;
$$;
revoke all on function retail.fn_pedido_campana_lineas(uuid) from public, anon;
grant execute on function retail.fn_pedido_campana_lineas(uuid) to authenticated, service_role;
comment on function retail.fn_pedido_campana_lineas(uuid) is
  'Las líneas de un pedido de campaña (modelo × color × talla × prendas), tal como se enviaron.';

reset lock_timeout;
notify pgrst, 'reload schema';
