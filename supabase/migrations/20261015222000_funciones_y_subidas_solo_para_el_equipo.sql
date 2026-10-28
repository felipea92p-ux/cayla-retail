-- ============================================================================
-- 20261015222000_funciones_y_subidas_solo_para_el_equipo.sql — CAYLA V2
-- Las funciones que no preguntaban quién llama, y las subidas a cuatro buckets, piden ser del equipo de retail.
--
-- EL PROBLEMA PRIMERO. Es la segunda mitad de 20261015221000 (las reglas de fila). Algunas funciones `security definer` de
-- retail se podían llamar con cualquier sesión del proyecto (el que retail comparte con Dynamic) y respondían sin preguntar
-- si la cuenta era del equipo:
--   · `fn_nombres_personas` y `fn_fotos_personas` dan el nombre y la foto de una persona por su id;
--   · `fn_parametros_caja` da la meta del día y el fondo de caja de una sede, y `fn_saldo_de_tienda` lo que le queda por
--     pagar a una tienda de una factura;
--   · `fn_meta_mes`, `fn_rendimiento_horas_nucleo` y `recalcular_compras` son piezas internas que solo llaman otras
--     funciones, pero tenían EXECUTE abierto a `authenticated`.
-- Y las subidas a `retail-productos-fotos`, `retail-colores-muestras`, `retail-compras-adjuntos` y `retail-gastos-viaje`
-- solo pedían el bucket, sin preguntar si la cuenta era de retail.
--
-- QUÉ CAMBIA.
--   PARTE 1 · funciones (no toca ninguna tabla ni política):
--     · `fn_nombres_personas` y `fn_fotos_personas` devuelven filas solo a una cuenta del equipo (o a la base misma, sin
--       sesión: la llave de servicio y el SQL Editor). A otra cuenta le devuelven cero filas, sin error: Caja, Compras y el
--       Inicio de Almacén las llaman para mostrar nombres y no deben caerse.
--     · `fn_parametros_caja` rechaza a una cuenta con sesión que no es del equipo (`42501`). La llaman Configuración, Caja y
--       una docena de funciones del equipo; para todas ellas no cambia nada.
--     · `fn_saldo_de_tienda` le devuelve vacío a una cuenta con sesión que no es del equipo. Se queda abierta al equipo:
--       Pagos de compras la llama por cada factura, y sus pruebas la llaman directo como colaboradora.
--     · `fn_meta_mes`, `fn_rendimiento_horas_nucleo` y `recalcular_compras` dejan de poder llamarse desde la API: ninguna
--       pantalla las llama directo (2026-10-15) y las funciones que las usan corren como su dueño, así que siguen
--       funcionando.
--   PARTE 2 · políticas de storage (sola y al final, ADR-0195): las cuatro subidas piden además `fn_tiene_acceso_retail()`.
--
-- QUÉ NO CAMBIA. Para el equipo y las terminales, nada. Lo que se lee por funciones lo sigue decidiendo cada función.
--
-- ORDEN AL PEGAR. Primero 20261015221000. Después esta, cada PARTE por separado, en orden, con `lock_timeout` de 3 s. Mejor
-- fuera del horario de tienda: la PARTE 2 toma `storage.objects` un instante.
--
-- GUARDIA. Antes de reemplazar una función se compara el md5 de su cuerpo vivo con el de producción del 2026-10-15 y con el
-- de este archivo. Si es otro, alguien la cambió en vivo: se detiene sin tocar nada. Se puede pegar dos veces.
-- ============================================================================

-- ============================== PARTE 1 · funciones ==============================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $$
declare
  v_md5 text;
begin
  if to_regprocedure('retail.fn_tiene_acceso_retail()') is null then
    raise exception 'Falta retail.fn_tiene_acceso_retail(): pega antes 20260930050000_terminales_pasan_la_puerta_de_lectura.sql.';
  end if;

  v_md5 := (select md5(p.prosrc) from pg_proc p where p.oid = to_regprocedure('retail.fn_nombres_personas(uuid[])'));
  if v_md5 is distinct from '503deefed110c3542fe2f481e9a43730' and v_md5 is distinct from '3d22f239af03df408fb9c58e816fff44' then
    raise exception 'fn_nombres_personas tiene otro cuerpo (md5 %): reescribe desde su definición real antes de pegar.', v_md5;
  end if;
  v_md5 := (select md5(p.prosrc) from pg_proc p where p.oid = to_regprocedure('retail.fn_fotos_personas(uuid[])'));
  if v_md5 is distinct from 'ce30afba41aa17f1e9c942ebd75ed54f' and v_md5 is distinct from 'c6ceb7efa34d5f633563b532a71a8686' then
    raise exception 'fn_fotos_personas tiene otro cuerpo (md5 %): reescribe desde su definición real antes de pegar.', v_md5;
  end if;
  v_md5 := (select md5(p.prosrc) from pg_proc p where p.oid = to_regprocedure('retail.fn_parametros_caja(uuid,date)'));
  if v_md5 is distinct from 'e26b20e3a2b0ac5e9febce12fdb08940' and v_md5 is distinct from '13851fb766c8a82efbec04dffa5af492' then
    raise exception 'fn_parametros_caja tiene otro cuerpo (md5 %): reescribe desde su definición real antes de pegar.', v_md5;
  end if;
  v_md5 := (select md5(p.prosrc) from pg_proc p where p.oid = to_regprocedure('retail.fn_saldo_de_tienda(uuid,uuid)'));
  if v_md5 is distinct from '87ecfa378c9f2a18e62adaa06d466911' and v_md5 is distinct from '4a35d303818da97cc1cf9f60ab4d9a40' then
    raise exception 'fn_saldo_de_tienda tiene otro cuerpo (md5 %): reescribe desde su definición real antes de pegar.', v_md5;
  end if;
end $$;

-- Lo que le queda por pagar a una tienda de una factura: igual que 20260923180300, y vacío para una cuenta que no es del equipo.
create or replace function retail.fn_saldo_de_tienda(p_compra_id uuid, p_ubicacion_id uuid)
returns numeric
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select case when auth.uid() is null or retail.fn_tiene_acceso_retail() then
    greatest(0, least(
      coalesce((select p.total from retail.compra_parte_por_tienda p where p.compra_id = p_compra_id and p.ubicacion_id = p_ubicacion_id), 0)
        - coalesce((select sum(g.monto) from retail.compra_pagos g where g.compra_id = p_compra_id and g.ubicacion_id = p_ubicacion_id), 0),
      coalesce((select c.saldo from retail.compras c where c.id = p_compra_id and c.estado = 'vigente'), 0)
    ))::numeric(12, 2)
  end;
$$;

-- Nombre y foto de una persona: solo para una cuenta del equipo (o la base sin sesión). A otra cuenta, cero filas.
create or replace function retail.fn_nombres_personas(p_ids uuid[])
returns table (id uuid, nombre text)
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select id, nombres || ' ' || apellidos from public.personas
   where id = any(p_ids)
     and (auth.uid() is null or retail.fn_tiene_acceso_retail());
$$;

create or replace function retail.fn_fotos_personas(p_ids uuid[])
returns table (persona_id uuid, foto_ruta text)
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select p.id, p.foto_url
  from public.personas p
  where p.id = any(p_ids)
    and p.foto_url is not null
    and exists (select 1 from retail.colaboradores c where c.persona_id = p.id)
    and (auth.uid() is null or retail.fn_tiene_acceso_retail());
$$;

-- Meta del día y fondo de caja: una cuenta con sesión que no es del equipo se rechaza. Lo demás, igual que 20260924210000.
create or replace function retail.fn_parametros_caja(p_ubicacion_id uuid, p_fecha date)
returns table (meta numeric, meta_base numeric, meta_pct numeric, fondo numeric, fondo_base numeric, campanas jsonb)
language plpgsql stable security definer
set search_path = retail, public, extensions
as $$
declare v_base numeric; v_fondo_base numeric; v_pct numeric; v_fondo_camp numeric; v_campanas jsonb;
begin
  if auth.uid() is not null and not retail.fn_tiene_acceso_retail() then
    raise exception 'Esta cuenta no es del equipo de retail.' using errcode = '42501', hint = 'sin_acceso_retail';
  end if;

  select m.meta into v_base from ubicacion_metas_dia m
   where m.ubicacion_id = p_ubicacion_id and m.dia_semana = extract(isodow from p_fecha)::int - 1;
  select coalesce(v_base, u.meta_venta_diaria), u.fondo_caja into v_base, v_fondo_base from ubicaciones u where u.id = p_ubicacion_id;

  -- Las campañas que rigen ese día en esa tienda (activas, aprobadas, con fechas, y la tienda dentro de sus sedes).
  select coalesce(max(c.meta_pct), 0), max(c.fondo),
         coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'nombre', e.nombre, 'meta_pct', c.meta_pct, 'fondo', c.fondo,
                                               'desde', e.vigente_desde, 'hasta', e.vigente_hasta) order by c.meta_pct desc, e.nombre), '[]'::jsonb)
    into v_pct, v_fondo_camp, v_campanas
    from campana_efecto_caja c
    join etiquetas e on e.id = c.etiqueta_id
   where c.ubicacion_id = p_ubicacion_id
     and e.estilo = 'campana' and e.activo and e.estado = 'aprobado'
     and p_fecha between e.vigente_desde and e.vigente_hasta
     and (e.sedes_permitidas is null or cardinality(e.sedes_permitidas) = 0 or p_ubicacion_id = any (e.sedes_permitidas));

  return query select
    case when v_base is null then null else round(v_base * (1 + v_pct / 100)) end,
    v_base,
    v_pct,
    case when v_fondo_camp is null then v_fondo_base else greatest(coalesce(v_fondo_base, 0), v_fondo_camp) end,
    v_fondo_base,
    v_campanas;
end $$;

-- Piezas internas: solo las llaman otras funciones (que corren como su dueño). Nadie de la API.
revoke execute on function retail.fn_meta_mes(uuid, date) from public, anon, authenticated;
revoke execute on function retail.fn_rendimiento_horas_nucleo(uuid[], date) from public, anon, authenticated;
revoke execute on function retail.recalcular_compras() from public, anon, authenticated;

reset lock_timeout;

-- ============================== PARTE 2 · subidas a storage (sola, al final) ==============================

set lock_timeout = '3s';

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('retail_productos_fotos_insert',    'retail-productos-fotos'),
      ('retail_colores_muestras_insert',   'retail-colores-muestras'),
      ('retail_compras_adjuntos_insert',   'retail-compras-adjuntos'),
      ('retail_gastos_viaje_fotos_insert', 'retail-gastos-viaje')
    ) as t(regla, bucket)
  loop
    continue when not exists (
      select 1 from pg_policies p where p.schemaname = 'storage' and p.tablename = 'objects' and p.policyname = r.regla
    );
    execute format(
      'alter policy %I on storage.objects with check (bucket_id = %L and (select retail.fn_tiene_acceso_retail()))',
      r.regla, r.bucket);
  end loop;
end $$;

reset lock_timeout;
