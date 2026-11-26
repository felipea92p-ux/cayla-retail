-- ============================================================================
-- 20261121171000 — Las campañas y el reparto de gastos, para cualquier empresa aliada (ADR-0683, actividad 5)
--
-- EL PROBLEMA PRIMERO. Dos reglas de dinero conocían a una sola aliada, CLAURE, escrita a mano:
--   · Campañas: ocho funciones deciden si una oferta alcanza a una prenda con «salvo que sea de CLAURE» (`p.empresa_id is distinct from` el id
--     de CLAURE). Las prendas de una aliada NUEVA pasaban como si fueran de CAYLA: una campaña de CAYLA les bajaba el precio sin que su dueña
--     lo supiera.
--   · Gastos: qué parte de la luz o del alquiler de una tienda es de la aliada (`gasto_reparto_claure`) existía solo para CLAURE. Una aliada
--     nueva no podía cargar su parte, y el Diario y «lo que falta del mes» solo restaban la de CLAURE.
--
-- QUÉ PROMETE.
--   · Campañas. Cada aliada dice si sus prendas pueden entrar a las campañas de CAYLA (`empresas.entra_a_campanas`). Nace APAGADO: una
--     aliada nueva queda fuera de toda campaña, también de las que ya están activas. CLAURE queda encendida, como hasta hoy. Una campaña con
--     «incluir las de las aliadas» (`incluye_claure`, el mismo campo) alcanza a las prendas de las aliadas que lo tienen encendido; sin él,
--     a ninguna. Lo de CAYLA no cambia. La regla vive en una sola función (`fn_campana_alcanza_empresa`), que las ocho llaman.
--   · Gastos. `gasto_reparto_aliadas (empresa_id, categoria, pct)` es el reparto de TODAS las aliadas (CLAURE se copia de su tabla). Una
--     aliada nueva empieza en 0 %. En una tienda, la parte de todas las aliadas de una categoría no pasa de 100 %. El Diario
--     (`fn_asientos_claure`), la cuenta de cada dueña (`fn_aliada_gastos_base`) y «lo que falta del mes» leen esta tabla.
--   · `fn_reparto_aliadas` / `guardar_reparto_aliada`: lo que ve y guarda Configuración ▸ Gastos, una aliada a la vez.
--
-- QUÉ NO PROMETE. Elegir aliadas una por una dentro de una campaña (se decide por aliada, no por campaña). `gasto_reparto_claure` se queda:
-- `guardar_reparto_aliada` la mantiene igual para CLAURE mientras existan las funciones `fn_claure_*` (se borran juntas, backlog).
--
-- DECIDÍ un interruptor por aliada + la casilla de siempre en la campaña. DESCARTÉ una lista de aliadas por campaña: cambia la firma de las
-- cuatro funciones `guardar_oferta*` y el JSON de las ofertas, las más parchadas del ERP (catorce migraciones las tocaron en un mes).
-- SE ROMPE SI Felipe quiere una campaña con CLAURE pero no con otra aliada que también tiene el interruptor encendido en la MISMA tienda:
-- hoy se logra limitando la campaña a una tienda o apagando a la otra mientras dure.
-- SE ROMPE SI a una aliada se le suma una tienda donde otra aliada ya tiene su parte: la suma por categoría puede pasar de 100 % hasta que
-- alguien la corrija (el candado está al guardar el reparto, no al sumar la tienda).
--
-- CÓMO VERIFICAR. pnpm pruebas:aliadas-campanas-gastos
-- CÓMO SE PEGA. Después de 20261121164000. Una sola parte, sin políticas (las tablas nuevas tienen RLS sin políticas: se leen por funciones
-- `security definer`). El `alter table empresas` y los reemplazos anclados van juntos: ninguno toma `auth`/`storage`. Se puede pegar dos veces.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real. No se aplicó nada.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- =========================== CAMPAÑAS ===========================

-- ---------- 1. Cada aliada dice si sus prendas pueden entrar a las campañas de CAYLA ----------
do $columna$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'retail' and table_name = 'empresas' and column_name = 'entra_a_campanas') then
    alter table retail.empresas add column entra_a_campanas boolean not null default false;
    -- CLAURE ya entraba (con la casilla de la campaña): sigue igual. Solo la primera vez: después lo decide el Admin.
    update retail.empresas set entra_a_campanas = true where clave = 'claure';
  end if;
end
$columna$;
comment on column retail.empresas.entra_a_campanas is
  'ADR-0683: las prendas de esta aliada pueden entrar a una campaña de CAYLA que diga «incluir las de las aliadas». Nace apagado: una aliada nueva queda fuera de toda campaña hasta que el Admin lo encienda (con el sí de su dueña).';

-- ---------- 2. La regla, en un solo lugar ----------
-- ¿Una campaña alcanza a una prenda de esta empresa? Lo de CAYLA (o sin dueña), siempre. Lo de una aliada, solo si la campaña incluye a las
-- aliadas Y esa aliada entra a las campañas. SQL simple y `stable`: Postgres la mete dentro de la consulta que la llama.
create or replace function retail.fn_campana_alcanza_empresa(p_empresa uuid, p_incluye_aliadas boolean)
returns boolean
language sql
stable
set search_path = retail, public, extensions
as $$
  select p_empresa is null
      or p_empresa = retail.fn_empresa_casa_id()
      or (coalesce(p_incluye_aliadas, false) and exists (select 1 from retail.empresas e where e.id = p_empresa and e.entra_a_campanas));
$$;
revoke all on function retail.fn_campana_alcanza_empresa(uuid, boolean) from public, anon;
grant execute on function retail.fn_campana_alcanza_empresa(uuid, boolean) to authenticated;

-- ---------- 3. Las ocho funciones de ofertas dejan de nombrar a CLAURE ----------
-- Toda función de `retail` con «(X or p.empresa_id is distinct from (…clave = 'claure'))» pasa a «retail.fn_campana_alcanza_empresa(p.empresa_id, X)».
-- X es una de cuatro formas conocidas; otra forma detiene la migración (no se adivina).
do $campanas$
declare
  v_cola constant text := ' or p.empresa_id is distinct from (select em.id from retail.empresas em where em.clave = ''claure''))';
  v_formas constant text[] := array['r.incluye_claure', 'coalesce(r.incluye_claure, false)', 'coalesce(p_claure, false)', 'coalesce(o.claure, false)'];
  v_f record;
  v_def text;
  v_forma text;
begin
  for v_f in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'retail' and p.prosrc like '%' || v_cola || '%'
  loop
    v_def := pg_get_functiondef(v_f.oid);
    foreach v_forma in array v_formas loop
      v_def := replace(v_def, '(' || v_forma || v_cola, 'retail.fn_campana_alcanza_empresa(p.empresa_id, ' || v_forma || ')');
    end loop;
    if position(v_cola in v_def) > 0 then
      raise exception '% nombra a CLAURE de una forma que esta migración no conoce: regenera el reemplazo. No se aplicó nada.', v_f.oid::regprocedure;
    end if;
    execute v_def;
  end loop;
end
$campanas$;

-- ---------- 4. El Admin enciende o apaga una aliada en las campañas ----------
create or replace function retail.fijar_aliada_en_campanas(p_id uuid, p_entra boolean)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid := retail.fn_actor_persona_id(true);
  v_antes boolean;
  v_nombre text;
begin
  if not retail.fn_es_admin() then
    raise exception 'Solo un Admin decide si las prendas de una empresa aliada entran a las campañas.' using errcode = '42501';
  end if;
  if p_entra is null then
    raise exception 'Falta decir si entra o no.' using errcode = 'P0001';
  end if;
  -- En fila: dos Admin que cambian a la misma aliada a la vez dejan un antes→después que encadena.
  select e.entra_a_campanas, e.nombre into v_antes, v_nombre
    from retail.empresas e where e.id = p_id and e.id <> retail.fn_empresa_casa_id() and e.activo for update;
  if v_nombre is null then
    raise exception 'Esa empresa aliada no existe o está dada de baja.' using errcode = 'P0001';
  end if;
  if v_antes is distinct from p_entra then
    update retail.empresas set entra_a_campanas = p_entra where id = p_id;
    insert into retail.configuracion_historial (que, detalle, hecho_por)
    values ('aliada_campanas', jsonb_build_object('empresa_id', p_id, 'nombre', v_nombre, 'antes', v_antes, 'despues', p_entra), v_actor);
  end if;
end $$;
revoke all on function retail.fijar_aliada_en_campanas(uuid, boolean) from public, anon;
grant execute on function retail.fijar_aliada_en_campanas(uuid, boolean) to authenticated;

-- Las aliadas activas y si entran: la hoja de una oferta las nombra («Incluir las de CLAURE») y deja fuera, siempre, las de las que no entran.
create or replace function retail.fn_aliadas_en_campanas()
returns table (id uuid, nombre text, entra boolean)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select e.id, e.nombre, e.entra_a_campanas from retail.empresas e
   where e.id <> retail.fn_empresa_casa_id() and e.activo
   order by e.orden, e.nombre;
$$;
revoke all on function retail.fn_aliadas_en_campanas() from public, anon;
grant execute on function retail.fn_aliadas_en_campanas() to authenticated;

-- ---------- 5. Configuración lo ve en la tarjeta de cada aliada ----------
select pg_temp.reemplazar('retail.fn_empresas_aliadas()',
  '''regimen'', e.regimen,',
  '''regimen'', e.regimen, ''entra_a_campanas'', e.entra_a_campanas,', 1);

-- =========================== GASTOS ===========================

-- ---------- 6. El reparto de gastos de todas las aliadas ----------
create table if not exists retail.gasto_reparto_aliadas (
  empresa_id uuid not null references retail.empresas (id),
  categoria text not null references retail.categorias_gasto (codigo),
  pct numeric(5, 2) not null check (pct >= 0 and pct <= 100),
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid references public.personas (id),
  primary key (empresa_id, categoria)
);
alter table retail.gasto_reparto_aliadas enable row level security;
revoke all on table retail.gasto_reparto_aliadas from anon, authenticated;
comment on table retail.gasto_reparto_aliadas is
  'ADR-0683: qué parte (0 a 100) de cada categoría de gasto de una tienda donde opera la aliada es suya. Sin fila = 0 (todo de CAYLA). Se escribe con guardar_reparto_aliada; CLAURE se copió de gasto_reparto_claure.';

insert into retail.gasto_reparto_aliadas (empresa_id, categoria, pct, actualizado_en, actualizado_por)
select e.id, r.categoria, r.pct_claure, r.actualizado_en, r.actualizado_por
  from retail.gasto_reparto_claure r cross join retail.empresas e
 where e.clave = 'claure'
on conflict (empresa_id, categoria) do nothing;

-- El Diario guardado vence cuando cambia un reparto (como con el de CLAURE, 20261109183000).
do $vence$
begin
  if to_regprocedure('retail.fn_diario_vence()') is not null then
    execute 'create or replace trigger diario_vence after insert or update or delete on retail.gasto_reparto_aliadas for each row execute function retail.fn_diario_vence(''todo'')';
  end if;
end
$vence$;

-- ---------- 7. La parte de cada aliada en cada gasto ----------
create or replace function retail.fn_aliada_gastos_base(p_empresa uuid, p_desde date, p_hasta date, p_todo boolean, p_ubics uuid[])
returns table (fecha date, ubicacion_id uuid, gasto_id uuid, categoria text, descripcion text, cuenta_pcge text, monto_total numeric, igv numeric, pct numeric, parte numeric, parte_base numeric)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $function$
#variable_conflict use_column
declare
  v_empresa uuid;
  v_desde date;
begin
  select e.id, e.cuenta_corriente_desde into v_empresa, v_desde from retail.empresas e where e.id = p_empresa and e.id <> retail.fn_empresa_casa_id();
  if v_empresa is null or v_desde is null then
    return;
  end if;
  return query
  select g.fecha, g.ubicacion_id, g.id, g.categoria, g.descripcion, k.cuenta_pcge, g.monto_total, g.igv, r.pct,
         round(g.monto_total * r.pct / 100, 2),
         round((g.monto_total - g.igv) * r.pct / 100, 2)
    from retail.gastos g
    join retail.empresa_sedes es on es.empresa_id = v_empresa and es.ubicacion_id = g.ubicacion_id and (p_todo or es.ubicacion_id = any (p_ubics))
    join retail.gasto_reparto_aliadas r on r.empresa_id = v_empresa and r.categoria = g.categoria and r.pct > 0
    join retail.categorias_gasto k on k.codigo = g.categoria
   where g.estado = 'vigente' and g.fecha >= greatest(p_desde, v_desde) and g.fecha <= p_hasta;
end $function$;
revoke all on function retail.fn_aliada_gastos_base(uuid, date, date, boolean, uuid[]) from public, anon, authenticated;

-- Lo de todas las aliadas, un renglón por gasto (el Diario lleva un asiento por gasto: la 479 es una sola para todas).
create or replace function retail.fn_aliadas_gastos_base(p_desde date, p_hasta date, p_todo boolean, p_ubics uuid[])
returns table (fecha date, ubicacion_id uuid, gasto_id uuid, cuenta_pcge text, parte numeric, parte_base numeric)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select g.fecha, g.ubicacion_id, g.gasto_id, g.cuenta_pcge, sum(g.parte), sum(g.parte_base)
    from retail.empresas e
   cross join lateral retail.fn_aliada_gastos_base(e.id, p_desde, p_hasta, p_todo, p_ubics) g
   where e.id <> retail.fn_empresa_casa_id() and e.cuenta_corriente_desde is not null
   group by g.fecha, g.ubicacion_id, g.gasto_id, g.cuenta_pcge;
$$;
revoke all on function retail.fn_aliadas_gastos_base(date, date, boolean, uuid[]) from public, anon, authenticated;

-- ---------- 8. El Diario resta la parte de todas las aliadas ----------
select pg_temp.reemplazar('retail.fn_asientos_claure(date, date, boolean, uuid[])',
  'retail.fn_claure_gastos_base(p_desde, p_hasta, p_todo, p_ubics)',
  'retail.fn_aliadas_gastos_base(p_desde, p_hasta, p_todo, p_ubics)', 2);

-- ---------- 9. «Lo que falta del mes»: lo de CAYLA sin la parte de ninguna aliada ----------
-- La parte de todas las aliadas activas de esa tienda en esa categoría (0 a 100). Una aliada dada de baja ya no suma a lo que viene.
create or replace function retail.fn_parte_de_aliadas(p_categoria text, p_ubicacion_id uuid)
returns numeric
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select least(100, coalesce(sum(r.pct), 0))
    from retail.gasto_reparto_aliadas r
    join retail.empresas e on e.id = r.empresa_id and e.activo and e.cuenta_corriente_desde is not null and e.id <> retail.fn_empresa_casa_id()
    join retail.empresa_sedes es on es.empresa_id = r.empresa_id and es.ubicacion_id = p_ubicacion_id
   where r.categoria = p_categoria;
$$;
revoke all on function retail.fn_parte_de_aliadas(text, uuid) from public, anon, authenticated;

select pg_temp.reemplazar('retail.fn_lo_que_falta_del_mes(date)',
  '(1 - coalesce((select r.pct_claure from retail.gasto_reparto_claure r
                               where r.categoria = f.categoria
                                 and exists (select 1 from retail.empresa_sedes es
                                              where es.empresa_id = v_claure and es.ubicacion_id = f.ubicacion_id)), 0) / 100)',
  '(1 - retail.fn_parte_de_aliadas(f.categoria, f.ubicacion_id) / 100)', 1);

-- ---------- 10. Lo que ve y guarda Configuración ▸ Gastos ----------
create or replace function retail.fn_reparto_aliadas()
returns table (empresa_id uuid, empresa text, clave text, categoria text, nombre text, ejemplos text, pct numeric, actualizado_en timestamptz)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if not retail.fn_es_lider() or not retail.fn_puede_configurar() then
    raise exception 'El reparto de gastos con las empresas aliadas lo ve el líder, con el módulo «Configuración» en su rol.' using errcode = '42501';
  end if;
  return query
  select e.id, e.nombre, e.clave, k.codigo, k.nombre, k.ejemplos, coalesce(r.pct, 0)::numeric, r.actualizado_en
    from retail.empresas e
   cross join retail.categorias_gasto k
    left join retail.gasto_reparto_aliadas r on r.empresa_id = e.id and r.categoria = k.codigo
   where e.id <> retail.fn_empresa_casa_id() and e.activo and k.activo
     and exists (select 1 from retail.empresa_sedes es where es.empresa_id = e.id)
   order by e.orden, e.nombre, k.orden, k.codigo;
end $$;
revoke all on function retail.fn_reparto_aliadas() from public, anon;
grant execute on function retail.fn_reparto_aliadas() to authenticated;

create or replace function retail.guardar_reparto_aliada(p_empresa uuid, p_categoria text, p_pct numeric)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid := retail.fn_actor_persona_id(true);
  v_empresa text;
  v_clave text;
  v_nombre text;
  v_antes numeric;
  v_pct numeric;
  v_sede text;
begin
  if not retail.fn_es_lider() or not retail.fn_puede_configurar() then
    raise exception 'Cambiar el reparto de gastos con una empresa aliada lo hace el líder, con el módulo «Configuración» en su rol.' using errcode = '42501';
  end if;
  select e.nombre, e.clave into v_empresa, v_clave from retail.empresas e where e.id = p_empresa and e.id <> retail.fn_empresa_casa_id() and e.activo;
  if v_empresa is null then
    raise exception 'Esa empresa aliada no existe o está dada de baja.' using errcode = 'P0001';
  end if;
  if p_pct is null or p_pct < 0 or p_pct > 100 then
    raise exception 'La parte de % va de 0 %% a 100 %%.', v_empresa using errcode = 'P0001';
  end if;
  v_nombre := (select k.nombre from retail.categorias_gasto k where k.codigo = p_categoria and k.activo);
  if v_nombre is null then
    raise exception 'Esa categoría de gasto no existe o está desactivada.' using errcode = 'P0001';
  end if;
  v_pct := round(p_pct, 2);
  -- En fila por categoría (no por aliada): dos aliadas de la misma tienda que se reparten la misma categoría a la vez no pasan juntas de 100 %.
  perform pg_advisory_xact_lock(hashtext('reparto_aliada:' || p_categoria));
  -- En una tienda, lo de todas las aliadas en una categoría no pasa de 100 %: CAYLA no puede pagar menos que nada.
  select u.nombre into v_sede
    from retail.empresa_sedes es
    join retail.ubicaciones u on u.id = es.ubicacion_id
   where es.empresa_id = p_empresa
     and v_pct + coalesce((select sum(r.pct) from retail.gasto_reparto_aliadas r
                            join retail.empresa_sedes o on o.empresa_id = r.empresa_id and o.ubicacion_id = es.ubicacion_id
                           where r.categoria = p_categoria and r.empresa_id <> p_empresa), 0) > 100
   limit 1;
  if v_sede is not null then
    raise exception 'En % las empresas aliadas ya se llevan parte de %: entre todas no pueden pasar de 100 %%.', v_sede, v_nombre using errcode = 'P0001';
  end if;
  v_antes := coalesce((select r.pct from retail.gasto_reparto_aliadas r where r.empresa_id = p_empresa and r.categoria = p_categoria), 0);
  insert into retail.gasto_reparto_aliadas (empresa_id, categoria, pct, actualizado_en, actualizado_por)
  values (p_empresa, p_categoria, v_pct, now(), v_actor)
  on conflict (empresa_id, categoria) do update set pct = excluded.pct, actualizado_en = now(), actualizado_por = excluded.actualizado_por;
  -- Mientras existan las funciones `fn_claure_*`, su tabla dice lo mismo para CLAURE (se borran juntas).
  if v_clave = 'claure' then
    insert into retail.gasto_reparto_claure (categoria, pct_claure, actualizado_en, actualizado_por)
    values (p_categoria, v_pct, now(), v_actor)
    on conflict (categoria) do update set pct_claure = excluded.pct_claure, actualizado_en = now(), actualizado_por = excluded.actualizado_por;
  end if;
  if v_antes is distinct from v_pct then
    insert into retail.configuracion_historial (que, detalle, hecho_por)
    values ('reparto_aliada', jsonb_build_object('empresa_id', p_empresa, 'empresa', v_empresa, 'categoria', p_categoria, 'nombre', v_nombre, 'antes', v_antes, 'despues', v_pct), v_actor);
  end if;
end $$;
revoke all on function retail.guardar_reparto_aliada(uuid, text, numeric) from public, anon;
grant execute on function retail.guardar_reparto_aliada(uuid, text, numeric) to authenticated;

-- La pantalla de antes (hasta que se publique la nueva) guarda por aquí: va a la misma tabla.
create or replace function retail.guardar_reparto_claure(p_categoria text, p_pct numeric)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  perform retail.guardar_reparto_aliada((select e.id from retail.empresas e where e.clave = 'claure'), p_categoria, p_pct);
end $$;

do $comprueba$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'retail' and p.prosrc like '%p.empresa_id is distinct from (select em.id from retail.empresas em where em.clave = ''claure'')%') then
    raise exception 'Quedó una función de ofertas que nombra a CLAURE.';
  end if;
  if position('fn_aliadas_gastos_base' in pg_get_functiondef('retail.fn_asientos_claure(date, date, boolean, uuid[])'::regprocedure)) = 0
     or position('fn_parte_de_aliadas' in pg_get_functiondef('retail.fn_lo_que_falta_del_mes(date)'::regprocedure)) = 0 then
    raise exception 'El Diario o lo que falta del mes no quedaron con el reparto de las aliadas.';
  end if;
end
$comprueba$;

select 'QUEDÓ BIEN' as resultado;
