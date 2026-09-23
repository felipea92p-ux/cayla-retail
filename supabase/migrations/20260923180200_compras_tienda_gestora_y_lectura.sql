-- ============================================================================
-- 20260923180200_compras_tienda_gestora_y_lectura.sql — CAYLA V2 · ADR-0184 (F1 + F3 reescritas sobre ADR-0161)
--
-- EL PROBLEMA PRIMERO. Hoy (producción, ADR-0161) quien tiene un módulo de Compras ve TODAS las facturas de TODAS las tiendas
-- y puede anular, adjuntar o reasignar cualquiera: las políticas preguntan «¿tiene el módulo?», nunca «¿de qué tienda?».
-- Felipe decidió (2026-09-23) que cada tienda ve y maneja solo lo suyo. Y una factura repartida entre tiendas no dice QUIÉN
-- responde por ella: el papel queda en una tienda (ADR-0184, respuesta 12) que no está escrita en ningún lado.
--
-- QUÉ HACE
--   1. `compras.ubicacion_gestion_id` — la TIENDA GESTORA: donde queda el papel, la que registra, anula, adjunta y reasigna.
--      No es el destino de la mercadería (eso sigue siendo el reparto por línea, ADR-0139). Obligatoria en toda factura vigente
--      y, candado de esquema (principio 2), tiene que tener parte en el reparto. Lo existente se rellena con la tienda que más
--      unidades recibe.
--   2. UNA regla de lectura: una cuenta ve una factura ENTERA (cabecera, líneas, pagos, adjuntos, notas, escaneos) si es líder
--      o si la gestora es una de SUS tiendas (`fn_compras_ubicaciones`, 20260923180000). Como la gestora siempre tiene parte,
--      «toda la factura va a mis tiendas» ya está incluido. Una tienda que solo TIENE PARTE en una factura ajena no ve la
--      factura (vería la deuda de la otra): ve su parte por `fn_mis_partes_de_compras` (20260923180400).
--      Las políticas lo resuelven UNA vez por consulta (`= any((select fn_compras_visibles()))`, ADR-0176).
--   3. Todas las lecturas de dinero que sumaban «lo que el rol ve» pasan a sumar solo lo de mis tiendas: los 5 indicadores
--      (ADR-0126), el directorio de proveedores, sus métricas y su serie de 12 meses, el tablero y el buscador de notas de
--      crédito, los faltantes sin nota. `fn_puede_ver_compra` (Recibir) también: con módulo, las de mis tiendas; sin él, las
--      que tienen destino en mi sede, como siempre.
--   4. Escribir sobre una factura existente (anular, adjuntar, archivar adjunto, reasignar reparto, registrar nota de crédito)
--      exige además que la factura sea de mis tiendas. Registrar exige que la gestora sea mía y tenga parte. El PERMISO sigue
--      siendo el del módulo de cada acción (ADR-0161 P1): esto solo agrega DÓNDE.
--   5. `cambiar_tienda_gestora_compra`: solo el líder (el candado del punto 1 impediría, si no, mover todo el reparto fuera de
--      la gestora).
--
-- QUÉ NO HACE. Pagar por tienda (20260923180300). La vista de «mi parte» para quien no gestiona (20260923180400). Notas de
-- crédito repartidas por tienda (F6): hoy una nota es de la factura y la registra la gestora. `proveedor_creditos` (el saldo a
-- favor con un proveedor) sigue siendo de la empresa: lo ve quien tiene cualquier módulo de Compras, como hoy.
--
-- HOY NO CAMBIA NADA PARA NADIE: el líder ve lo mismo (todo), y el 2026-09-23 ningún rol de producción tiene Facturas de compra,
-- Por pagar ni Notas de crédito. Deja la puerta bien puesta ANTES de que el líder reparta esos módulos.
--
-- CÓMO. Cada función se cambia sobre su definición VIVA (`pg_get_functiondef`), nunca copiando cuerpos del repo: cada cambio
-- exige cuántas veces aparece lo que reemplaza; si la base cambió por debajo, aborta y no deja nada a medias. Ninguna cambia
-- de parámetros (no puede nacer una sobrecarga). Re-pegable.
--
-- REEMPLAZA a 20260922130000_compras_dinero_por_tienda_lectura.sql y 20260922160000_compras_tienda_gestora.sql (rama
-- adr-0145-compras-permisos, nunca en producción): fueron escritas cuando Compras era solo del líder y parchaban textos que
-- ADR-0161 ya cambió.
--
-- PARA PEGAR EN PRODUCCIÓN: después de 20260923180000 y 20260923180100. Trae `set search_path`. Al terminar,
-- `select retail.fn_aplicar_candado_de_dinero();` debe devolver `{}`.
-- ============================================================================

set search_path = retail, public, extensions;

do $$
begin
  if to_regprocedure('retail.fn_compras_ubicaciones()') is null then
    raise exception 'Falta 20260923180000_compras_por_tienda_quien_y_donde.sql';
  end if;
  if to_regprocedure('retail.fn_puede_registrar_facturas_compra()') is null or to_regprocedure('retail.fn_puede_registrar_notas_credito()') is null then
    raise exception 'Falta 20260923140000_modulos_seis_decisiones.sql (un permiso por módulo de Compras)';
  end if;
  if to_regclass('retail.compra_item_destinos') is null or to_regprocedure('retail.fn_rls_una_vez_por_consulta()') is null then
    raise exception 'Falta el reparto por tienda (ADR-0139) o 20260923152300 (RLS una vez por consulta)';
  end if;
end $$;

-- Reemplaza un texto EXACTO en la definición viva de una función, exigiendo `p_veces` ocurrencias. Si la función ya tiene
-- `p_ya_esta` (la marca del cambio), no hace nada: re-pegable también cuando el cambio AGREGA un bloque y deja el ancla.
create or replace function pg_temp.cambiar(p_firma text, p_viejo text, p_nuevo text, p_veces integer, p_ya_esta text)
returns void
language plpgsql
as $$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_ya_esta in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: «%» aparece % vez/veces y se esperaban %. Revísala a mano.',
      p_firma, left(p_viejo, 80), v_n, p_veces;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$$;

-- ==================== 1. la tienda gestora ====================
alter table retail.compras add column if not exists ubicacion_gestion_id uuid references retail.ubicaciones(id);

comment on column retail.compras.ubicacion_gestion_id is
  'ADR-0184. La tienda que GESTIONA la factura: donde queda el papel y la que la registra, anula, adjunta y reasigna. No es el destino de la mercadería (ese es el reparto por línea). Tiene que tener parte en el reparto. Quien tiene un módulo de Compras ve la factura entera solo si la gestora es una de sus tiendas.';

-- Lo que ya había: la tienda que más unidades recibe (empate: la de menor id).
update retail.compras c
   set ubicacion_gestion_id = x.ubicacion_id
  from (
    select distinct on (t.compra_id) t.compra_id, t.ubicacion_id
    from (
      select i.compra_id, d.ubicacion_id, sum(d.cantidad) as unidades
      from retail.compra_items i
      join retail.compra_item_destinos d on d.compra_item_id = i.id
      group by i.compra_id, d.ubicacion_id
    ) t
    order by t.compra_id, t.unidades desc, t.ubicacion_id
  ) x
 where c.id = x.compra_id and c.ubicacion_gestion_id is null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'compras_gestora_obligatoria' and conrelid = 'retail.compras'::regclass) then
    alter table retail.compras add constraint compras_gestora_obligatoria
      check (estado <> 'vigente' or ubicacion_gestion_id is not null) not valid;
  end if;
  begin
    alter table retail.compras validate constraint compras_gestora_obligatoria;
  exception when check_violation then
    raise notice 'compras_gestora_obligatoria queda NOT VALID: hay facturas vigentes sin reparto de las que no sale la gestora. Revísalas: select id, documento from retail.compras where estado = ''vigente'' and ubicacion_gestion_id is null;';
  end;
end $$;

create index if not exists compras_gestora_idx on retail.compras (ubicacion_gestion_id);

-- Candado diferido (se mira al cerrar la transacción, como compra_item_destinos_cuadra): registrar_compra escribe cabecera,
-- líneas y reparto en orden.
create or replace function retail.fn_gestora_con_parte()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_compra uuid;
begin
  if tg_table_name = 'compras' then
    v_compra := new.id;
  else
    select i.compra_id into v_compra from retail.compra_items i where i.id = coalesce(new.compra_item_id, old.compra_item_id);
  end if;
  if v_compra is null then
    return null;
  end if;
  if exists (
    select 1 from retail.compras c
    where c.id = v_compra
      and c.estado = 'vigente'
      and c.ubicacion_gestion_id is not null
      and exists (select 1 from retail.compra_items i where i.compra_id = c.id)
      and not exists (
        select 1 from retail.compra_items i
        join retail.compra_item_destinos d on d.compra_item_id = i.id
        where i.compra_id = c.id and d.ubicacion_id = c.ubicacion_gestion_id
      )
  ) then
    raise exception 'La tienda que gestiona el comprobante tiene que conservar parte de la mercadería. Cambia primero la tienda gestora o deja parte en el reparto.'
      using errcode = '23514';
  end if;
  return null;
end;
$$;

revoke all on function retail.fn_gestora_con_parte() from public, anon, authenticated;

drop trigger if exists compras_gestora_con_parte on retail.compras;
create constraint trigger compras_gestora_con_parte
  after insert or update of ubicacion_gestion_id, estado on retail.compras
  deferrable initially deferred
  for each row execute function retail.fn_gestora_con_parte();

drop trigger if exists compra_item_destinos_gestora_con_parte on retail.compra_item_destinos;
create constraint trigger compra_item_destinos_gestora_con_parte
  after update or delete on retail.compra_item_destinos
  deferrable initially deferred
  for each row execute function retail.fn_gestora_con_parte();

-- ==================== 2. la regla de lectura ====================
create or replace function retail.fn_compras_visibles()
returns uuid[]
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select coalesce(array_agg(c.id), '{}')
    from retail.compras c
   where retail.fn_es_lider() or c.ubicacion_gestion_id = any(retail.fn_compras_ubicaciones());
$$;

comment on function retail.fn_compras_visibles() is
  'ADR-0184. Las facturas que quien consulta ve ENTERAS: todas si es líder; las que gestiona una de sus tiendas si su rol ve un módulo de Compras; ninguna si no. Arreglo para que las políticas lo resuelvan una vez por consulta.';

create or replace function retail.fn_compra_es_de_mis_tiendas(p_compra_id uuid)
returns boolean
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select coalesce(
    retail.fn_es_lider()
    or exists (
      select 1 from retail.compras c
      where c.id = p_compra_id and c.ubicacion_gestion_id = any(retail.fn_compras_ubicaciones())
    ),
    false);
$$;

comment on function retail.fn_compra_es_de_mis_tiendas(uuid) is
  'ADR-0184. ¿Ve y gestiona quien consulta esta factura ENTERA? Líder: siempre. Si no: su rol ve un módulo de Compras y la tienda gestora es suya. Es la regla de las lecturas de dinero y de las escrituras sobre una factura existente. NULL → false.';

revoke all on function retail.fn_compras_visibles() from public, anon;
revoke all on function retail.fn_compra_es_de_mis_tiendas(uuid) from public, anon;
grant execute on function retail.fn_compras_visibles() to authenticated;
grant execute on function retail.fn_compra_es_de_mis_tiendas(uuid) to authenticated;

-- ==================== 3. las políticas de lectura ====================
drop policy if exists compras_select on retail.compras;
create policy compras_select on retail.compras for select
  using ((select retail.fn_es_lider()) or id = any((select retail.fn_compras_visibles())::uuid[]));

drop policy if exists compra_items_select on retail.compra_items;
create policy compra_items_select on retail.compra_items for select
  using ((select retail.fn_es_lider()) or compra_id = any((select retail.fn_compras_visibles())::uuid[]));

drop policy if exists compra_pagos_select on retail.compra_pagos;
create policy compra_pagos_select on retail.compra_pagos for select
  using ((select retail.fn_es_lider()) or compra_id = any((select retail.fn_compras_visibles())::uuid[]));

drop policy if exists compra_adjuntos_select on retail.compra_adjuntos;
create policy compra_adjuntos_select on retail.compra_adjuntos for select
  using ((select retail.fn_es_lider()) or compra_id = any((select retail.fn_compras_visibles())::uuid[]));

drop policy if exists compra_notas_credito_select on retail.compra_notas_credito;
create policy compra_notas_credito_select on retail.compra_notas_credito for select
  using ((select retail.fn_es_lider()) or compra_id = any((select retail.fn_compras_visibles())::uuid[]));

-- El escaneo vive en `<compra_id>/<archivo>`: la carpeta dice de qué factura es.
drop policy if exists retail_compras_adjuntos_select on storage.objects;
create policy retail_compras_adjuntos_select on storage.objects for select to authenticated
  using (
    bucket_id = 'retail-compras-adjuntos'
    and ((select retail.fn_es_lider()) or split_part(name, '/', 1) = any((select retail.fn_compras_visibles())::text[]))
  );

-- A qué tienda va cada línea y cada faltante: quien opera esa sede (Recibir, como siempre) o quien ve la factura entera.
drop policy if exists compra_item_destinos_select on retail.compra_item_destinos;
create policy compra_item_destinos_select on retail.compra_item_destinos for select
  using (
    retail.fn_puede_operar_ubicacion(ubicacion_id)
    or exists (select 1 from retail.compra_items i where i.id = compra_item_id and i.compra_id = any((select retail.fn_compras_visibles())::uuid[]))
  );

drop policy if exists compra_item_cierres_select on retail.compra_item_cierres;
create policy compra_item_cierres_select on retail.compra_item_cierres for select
  using (
    retail.fn_puede_operar_ubicacion(ubicacion_id)
    or exists (select 1 from retail.compra_items i where i.id = compra_item_id and i.compra_id = any((select retail.fn_compras_visibles())::uuid[]))
  );

-- ==================== 4. las lecturas de dinero, acotadas a mis tiendas ====================
do $$
begin
  -- Recibir (listar_compras_operativo) y todo lo que pregunta «¿la veo?»: con módulo, mis tiendas; sin él, mi sede.
  perform pg_temp.cambiar('retail.fn_puede_ver_compra(uuid)',
    'retail.fn_puede_ver_dinero_de_compras()', 'retail.fn_compra_es_de_mis_tiendas(p_compra_id)', 1, 'fn_compra_es_de_mis_tiendas');

  -- Indicadores y proveedores: filtraban fila por fila con fn_puede_ver_compra, que además deja pasar las facturas con
  -- destino en MI SEDE (hecho para recibir): sumarían el total de una factura que gestiona otra tienda.
  perform pg_temp.cambiar('retail.resumen_compras()', 'fn_puede_ver_compra(', 'fn_compra_es_de_mis_tiendas(', 10, 'fn_compra_es_de_mis_tiendas(');
  perform pg_temp.cambiar('retail.resumen_compras_extra()', 'fn_puede_ver_compra(', 'fn_compra_es_de_mis_tiendas(', 5, 'fn_compra_es_de_mis_tiendas(');
  perform pg_temp.cambiar('retail.deuda_por_vencimiento()', 'fn_puede_ver_compra(', 'fn_compra_es_de_mis_tiendas(', 1, 'fn_compra_es_de_mis_tiendas(');
  perform pg_temp.cambiar('retail.salidas_caja_30d()', 'fn_puede_ver_compra(', 'fn_compra_es_de_mis_tiendas(', 1, 'fn_compra_es_de_mis_tiendas(');
  perform pg_temp.cambiar('retail.por_pagar_tramos(uuid, text, boolean, text, text, date, date, uuid)', 'fn_puede_ver_compra(', 'fn_compra_es_de_mis_tiendas(', 1, 'fn_compra_es_de_mis_tiendas(');
  perform pg_temp.cambiar('retail.fn_proveedores()', 'fn_puede_ver_compra(', 'fn_compra_es_de_mis_tiendas(', 1, 'fn_compra_es_de_mis_tiendas(');
  perform pg_temp.cambiar('retail.fn_proveedor_metricas_compras(uuid)', 'fn_puede_ver_compra(', 'fn_compra_es_de_mis_tiendas(', 1, 'fn_compra_es_de_mis_tiendas(');
  perform pg_temp.cambiar('retail.fn_proveedor_costo_evolucion(uuid, integer)', 'fn_puede_ver_compra(', 'fn_compra_es_de_mis_tiendas(', 2, 'fn_compra_es_de_mis_tiendas(');

  -- Las que sumaban sin filtro por fila (solo la puerta del módulo).
  perform pg_temp.cambiar('retail.fn_proveedores_serie_12m()',
    'where retail.fn_puede_ver_dinero_de_compras()',
    'where retail.fn_puede_ver_dinero_de_compras() and retail.fn_compra_es_de_mis_tiendas(c.id)', 1, 'fn_compra_es_de_mis_tiendas(c.id)');
  perform pg_temp.cambiar('retail.compras_nota_pendiente(uuid[])',
    'where fn_puede_registrar_compras()',
    'where fn_puede_registrar_compras() and retail.fn_compra_es_de_mis_tiendas(c.id)', 1, 'fn_compra_es_de_mis_tiendas(c.id)');
  perform pg_temp.cambiar('retail.notas_credito_tablero()',
    E'left join retail.compra_item_cierres k on k.id = n.cierre_id\n',
    E'left join retail.compra_item_cierres k on k.id = n.cierre_id\n    where retail.fn_compra_es_de_mis_tiendas(n.compra_id)\n', 1, 'fn_compra_es_de_mis_tiendas(n.compra_id)');
  perform pg_temp.cambiar('retail.notas_credito_tablero()',
    E'where c.estado = ''vigente''\n        and not exists (',
    E'where c.estado = ''vigente''\n        and retail.fn_compra_es_de_mis_tiendas(c.id)\n        and not exists (', 1, 'fn_compra_es_de_mis_tiendas(c.id)');
  perform pg_temp.cambiar('retail.fn_facturas_para_nota_credito(text, uuid, text, integer)',
    E'where c.estado = ''vigente''\n      and (p_proveedor_id is null',
    E'where c.estado = ''vigente''\n      and retail.fn_compra_es_de_mis_tiendas(c.id)\n      and (p_proveedor_id is null', 1, 'fn_compra_es_de_mis_tiendas(c.id)');
  -- Costo promedio de un ingreso sin comprobante: quien gestiona Compras de ESA tienda.
  -- (con o sin el prefijo `retail.`: según por dónde pasó la base, la definición viva trae una u otra forma)
  perform pg_temp.cambiar('retail.recepciones_sin_comprobante(uuid, integer)',
    case when position('case when retail.fn_puede_ver_dinero_de_compras() then' in pg_get_functiondef('retail.recepciones_sin_comprobante(uuid, integer)'::regprocedure)) > 0
         then 'case when retail.fn_puede_ver_dinero_de_compras() then' else 'case when fn_puede_ver_dinero_de_compras() then' end,
    'case when retail.fn_puede_comprar_en(l.ubicacion_id) then', 1, 'fn_puede_comprar_en(l.ubicacion_id)');
end $$;

-- ==================== 5. escribir sobre una factura: además del módulo, que sea de mis tiendas ====================
-- Se agrega ANTES de la puerta del módulo un aviso propio, para que el mensaje diga la verdad («la gestiona otra tienda», no
-- «te falta el módulo»). Quien no tiene el módulo sigue cayendo en la puerta de siempre.
do $$
declare
  c_fact constant text := E'  if not retail.fn_puede_registrar_facturas_compra() then\n';
  c_otra constant text := 'la gestiona otra tienda';
begin
  perform pg_temp.cambiar('retail.anular_compra(uuid, text)', c_fact,
    E'  if retail.fn_puede_registrar_facturas_compra() and not retail.fn_compra_es_de_mis_tiendas(p_compra_id) then\n'
    || E'    raise exception ''Ese comprobante la gestiona otra tienda: solo ella (o un líder) puede anularlo'' using errcode = ''42501'';\n'
    || E'  end if;\n' || c_fact, 1, c_otra);

  perform pg_temp.cambiar('retail.reasignar_reparto_compra(uuid, uuid, uuid, integer, text, text)', c_fact,
    E'  if retail.fn_puede_registrar_facturas_compra()\n'
    || E'     and not retail.fn_compra_es_de_mis_tiendas((select i.compra_id from retail.compra_items i where i.id = p_compra_item_id)) then\n'
    || E'    raise exception ''Ese comprobante la gestiona otra tienda: solo ella (o un líder) puede reasignar su reparto'' using errcode = ''42501'';\n'
    || E'  end if;\n' || c_fact, 1, c_otra);

  perform pg_temp.cambiar('retail.registrar_adjunto_compra(uuid, text, text, text, integer, uuid)',
    E'  if not (retail.fn_puede_registrar_facturas_compra() or (p_nota_credito_id is not null and retail.fn_puede_registrar_notas_credito())) then\n',
    E'  if not retail.fn_compra_es_de_mis_tiendas(p_compra_id)\n'
    || E'     and (retail.fn_puede_registrar_facturas_compra() or retail.fn_puede_registrar_notas_credito()) then\n'
    || E'    raise exception ''Ese comprobante la gestiona otra tienda: solo ella (o un líder) puede adjuntarle documentos'' using errcode = ''42501'';\n'
    || E'  end if;\n'
    || E'  if not (retail.fn_puede_registrar_facturas_compra() or (p_nota_credito_id is not null and retail.fn_puede_registrar_notas_credito())) then\n',
    1, c_otra);

  perform pg_temp.cambiar('retail.archivar_adjunto_compra(uuid)',
    E'  if not (retail.fn_puede_registrar_facturas_compra() or (retail.fn_puede_registrar_notas_credito() and exists (select 1 from retail.compra_adjuntos a where a.id = p_adjunto_id and a.nota_credito_id is not null))) then\n',
    E'  if not retail.fn_compra_es_de_mis_tiendas((select a.compra_id from retail.compra_adjuntos a where a.id = p_adjunto_id))\n'
    || E'     and (retail.fn_puede_registrar_facturas_compra() or retail.fn_puede_registrar_notas_credito()) then\n'
    || E'    raise exception ''Ese comprobante la gestiona otra tienda: solo ella (o un líder) puede quitarle documentos'' using errcode = ''42501'';\n'
    || E'  end if;\n'
    || E'  if not (retail.fn_puede_registrar_facturas_compra() or (retail.fn_puede_registrar_notas_credito() and exists (select 1 from retail.compra_adjuntos a where a.id = p_adjunto_id and a.nota_credito_id is not null))) then\n',
    1, c_otra);

  perform pg_temp.cambiar('retail.registrar_nota_credito_compra(uuid, text, date, numeric, text, text, uuid, text, text, date, text)',
    E'  if not retail.fn_puede_registrar_notas_credito() then\n',
    E'  if retail.fn_puede_registrar_notas_credito() and not retail.fn_compra_es_de_mis_tiendas(p_compra_id) then\n'
    || E'    raise exception ''Ese comprobante la gestiona otra tienda: su nota de crédito la registra ella (o un líder)'' using errcode = ''42501'';\n'
    || E'  end if;\n'
    || E'  if not retail.fn_puede_registrar_notas_credito() then\n',
    1, c_otra);

  -- Registrar: la gestora (`p_ubicacion_destino_id`, el parámetro que la web ya manda: reusarlo evita una firma nueva y con
  -- ella una sobrecarga) tiene que ser una de mis tiendas…
  perform pg_temp.cambiar('retail.registrar_compra(uuid, text, text, text, uuid, jsonb, text, date, date, numeric, jsonb, text, numeric, uuid, date)',
    c_fact,
    E'  -- ADR-0184: la tienda que gestiona el comprobante (donde queda el papel) es `p_ubicacion_destino_id`.\n'
    || E'  if p_ubicacion_destino_id is null then\n'
    || E'    raise exception ''Elige la tienda que gestiona el comprobante'';\n'
    || E'  end if;\n'
    || E'  if retail.fn_puede_registrar_facturas_compra() and not retail.fn_puede_comprar_en(p_ubicacion_destino_id) then\n'
    || E'    raise exception ''La tienda que gestiona el comprobante tiene que ser una de las tuyas'' using errcode = ''42501'';\n'
    || E'  end if;\n' || c_fact,
    1, 'La tienda que gestiona el comprobante tiene que ser una de las tuyas');
  -- …tener parte en el reparto (ya armado a esta altura) y, si se paga al registrar, poder pagar.
  perform pg_temp.cambiar('retail.registrar_compra(uuid, text, text, text, uuid, jsonb, text, date, date, numeric, jsonb, text, numeric, uuid, date)',
    E'\n  v_persona := retail.fn_actor_persona_id(false);\n\n  insert into compras (',
    E'\n  if not exists (\n'
    || E'    select 1 from unnest(v_repartos) r cross join lateral jsonb_array_elements(r) d\n'
    || E'    where (d ->> ''ubicacion_id'')::uuid = p_ubicacion_destino_id\n'
    || E'  ) then\n'
    || E'    raise exception ''La tienda que gestiona el comprobante tiene que recibir parte de la mercadería'';\n'
    || E'  end if;\n'
    || E'  if p_pago is not null and not retail.fn_puede_pagar_compras() then\n'
    || E'    raise exception ''Pagar al registrar necesita el módulo Por pagar en tu rol: regístralo al crédito y págalo desde Por pagar'' using errcode = ''42501'';\n'
    || E'  end if;\n'
    || E'\n  v_persona := retail.fn_actor_persona_id(false);\n\n  insert into compras (',
    1, 'tiene que recibir parte de la mercadería');
  perform pg_temp.cambiar('retail.registrar_compra(uuid, text, text, text, uuid, jsonb, text, date, date, numeric, jsonb, text, numeric, uuid, date)',
    E'token_cliente, fecha_estimada_llegada\n  ) values (',
    E'token_cliente, fecha_estimada_llegada, ubicacion_gestion_id\n  ) values (', 1, 'fecha_estimada_llegada, ubicacion_gestion_id');
  perform pg_temp.cambiar('retail.registrar_compra(uuid, text, text, text, uuid, jsonb, text, date, date, numeric, jsonb, text, numeric, uuid, date)',
    E'p_token, p_fecha_estimada_llegada\n  ) returning id into v_compra_id;',
    E'p_token, p_fecha_estimada_llegada, p_ubicacion_destino_id\n  ) returning id into v_compra_id;', 1, 'p_fecha_estimada_llegada, p_ubicacion_destino_id');
end $$;

-- ==================== 6. cambiar la tienda gestora (solo el líder) ====================
create or replace function retail.cambiar_tienda_gestora_compra(p_compra_id uuid, p_ubicacion_id uuid)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un líder puede cambiar la tienda que gestiona un comprobante' using errcode = '42501';
  end if;
  if not exists (select 1 from retail.compras where id = p_compra_id) then
    raise exception 'La compra % no existe', p_compra_id;
  end if;
  if not exists (select 1 from retail.ubicaciones where id = p_ubicacion_id and activo) then
    raise exception 'Esa tienda no existe o está inactiva';
  end if;
  if not exists (
    select 1 from retail.compra_items i join retail.compra_item_destinos d on d.compra_item_id = i.id
    where i.compra_id = p_compra_id and d.ubicacion_id = p_ubicacion_id
  ) then
    raise exception 'La tienda que gestiona el comprobante tiene que recibir parte de la mercadería';
  end if;
  update retail.compras set ubicacion_gestion_id = p_ubicacion_id where id = p_compra_id;
end;
$$;

comment on function retail.cambiar_tienda_gestora_compra(uuid, uuid) is
  'ADR-0184. Solo líder. Pasa la gestión de un comprobante a otra tienda que tenga parte en su reparto.';

revoke all on function retail.cambiar_tienda_gestora_compra(uuid, uuid) from public, anon;
grant execute on function retail.cambiar_tienda_gestora_compra(uuid, uuid) to authenticated;

-- ==================== 7. la red de seguridad de los indicadores (ADR-0126), ahora también con la tienda ====================
-- Igual que la de 20260919160000 (inyecta el candado si falta, idempotente, devuelve qué arregló) y además cambia
-- `fn_puede_ver_compra(` por `fn_compra_es_de_mis_tiendas(` en las cinco: si otra migración recrea una con el cuerpo viejo,
-- correr esto la repone.
create or replace function retail.fn_aplicar_candado_de_dinero()
returns text[]
language plpgsql
set search_path = retail, public, extensions
as $$
declare
  f record;
  v_def text;
  v_nuevo text;
  v_que text;
  v_arregladas text[] := '{}';
begin
  for f in
    select p.oid, p.proname, l.lanname, p.oid::regprocedure::text as firma
    from pg_proc p
    join pg_language l on l.oid = p.prolang
    where p.pronamespace = 'retail'::regnamespace
      and p.proname in ('resumen_compras', 'resumen_compras_extra', 'deuda_por_vencimiento', 'salidas_caja_30d', 'por_pagar_tramos')
    order by p.proname, p.oid
  loop
    v_def := pg_get_functiondef(f.oid);
    v_nuevo := v_def;

    if position('fn_exige_dinero_de_compras' in v_nuevo) = 0 then
      v_que := case f.proname
        when 'deuda_por_vencimiento' then 'la deuda por vencimiento'
        when 'salidas_caja_30d' then 'las salidas de caja de Compras'
        when 'por_pagar_tramos' then 'lo que hay por pagar'
        else 'las cifras de dinero de Compras'
      end;
      if f.lanname = 'sql' then
        v_nuevo := regexp_replace(v_nuevo, E'AS \\$function\\$',
          format(E'AS $function$\n  -- CANDADO (ADR-0126): solo quien ve el dinero de Compras.\n  select retail.fn_exige_dinero_de_compras(%L);', v_que));
      elsif f.lanname = 'plpgsql' then
        v_nuevo := regexp_replace(v_nuevo, E'\\mbegin\\M',
          format(E'begin\n  -- CANDADO (ADR-0126): solo quien ve el dinero de Compras.\n  perform retail.fn_exige_dinero_de_compras(%L);', v_que), 'i');
      else
        raise exception '% está escrita en % y esta rutina solo sabe poner el candado a sql y plpgsql', f.firma, f.lanname;
      end if;
      if v_nuevo = v_def then
        raise exception 'No encontré dónde poner el candado en %', f.firma;
      end if;
    end if;

    -- ADR-0184: «lo que veo por mi sede» → «las facturas de mis tiendas».
    v_nuevo := replace(v_nuevo, 'fn_puede_ver_compra(', 'fn_compra_es_de_mis_tiendas(');

    if v_nuevo <> v_def then
      execute v_nuevo;
      v_arregladas := v_arregladas || f.firma;
    end if;
  end loop;
  return v_arregladas;
end;
$$;

comment on function retail.fn_aplicar_candado_de_dinero() is
  'ADR-0126 + ADR-0184. Deja las 5 funciones de indicadores de Compras con (1) el candado fn_exige_dinero_de_compras y (2) el filtro por tienda fn_compra_es_de_mis_tiendas. Idempotente; devuelve las firmas que arregló ({} = todo bien). Correrla después de pegar cualquier migración que recree una de esas cinco.';

revoke all on function retail.fn_aplicar_candado_de_dinero() from public, anon, authenticated;

-- Las políticas nuevas ya llaman una vez por consulta; esto deja igual cualquier otra que haya quedado fila por fila.
select retail.fn_rls_una_vez_por_consulta();

-- ==================== 8. comprobación final ====================
do $$
declare v text[];
begin
  v := retail.fn_aplicar_candado_de_dinero();
  if coalesce(array_length(v, 1), 0) <> 0 then
    raise exception 'fn_aplicar_candado_de_dinero todavía arregló %: algún indicador quedó sin filtro por tienda', v;
  end if;
  if exists (
    select 1 from pg_proc p
    where p.pronamespace = 'retail'::regnamespace
      and p.proname in ('resumen_compras', 'resumen_compras_extra', 'deuda_por_vencimiento', 'salidas_caja_30d', 'por_pagar_tramos',
                        'fn_proveedores', 'fn_proveedor_metricas_compras', 'fn_proveedor_costo_evolucion')
      and position('fn_puede_ver_compra(' in pg_get_functiondef(p.oid)) > 0
  ) then
    raise exception 'Alguna lectura de dinero sigue filtrando por sede (fn_puede_ver_compra)';
  end if;
  if (select count(*) from pg_policies
      where schemaname = 'retail'
        and tablename in ('compras', 'compra_items', 'compra_pagos', 'compra_adjuntos', 'compra_notas_credito')
        and cmd = 'SELECT' and qual like '%fn_compras_visibles%') <> 5 then
    raise exception 'Las 5 políticas de lectura de Compras no quedaron con fn_compras_visibles';
  end if;
  if exists (
    select 1 from pg_proc p
    where p.pronamespace = 'retail'::regnamespace
      and p.proname in ('registrar_compra', 'anular_compra', 'registrar_adjunto_compra', 'archivar_adjunto_compra',
                        'reasignar_reparto_compra', 'registrar_nota_credito_compra')
    group by p.proname having count(*) > 1
  ) then
    raise exception 'Alguna función de Compras quedó con dos firmas';
  end if;
end $$;
