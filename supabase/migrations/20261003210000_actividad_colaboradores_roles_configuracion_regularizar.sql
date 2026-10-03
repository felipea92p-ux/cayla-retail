-- ============================================================================
-- 20261003210000_actividad_colaboradores_roles_configuracion_regularizar.sql — CAYLA V2 (ADR-0207, act. 2026-10-03)
--
-- EL PROBLEMA. Lo más delicado del ERP no estaba en Actividad: quién le dio acceso a quién (Colaboradores y Roles),
-- quién cambió el fondo de caja o una meta (Configuración) y quién regularizó una prenda vendida sin registrar (Recibir
-- mercadería). Las tres cosas ya guardaban su propio historial con el antes y el después (`colaboradores_historial`,
-- `roles_historial`, `configuracion_historial`, `prendas_por_regularizar`), pero en tablas que nadie lee sin SQL. En
-- producción al 2026-10-03: 55 cambios de colaboradores (30 en dos semanas), 31 de roles, 25 de configuración y 134
-- prendas por regularizar.
--
-- LA DECISIÓN (Felipe, 2026-10-03: «arranca con esa tanda»). Mismo patrón que las etapas anteriores: disparadores sobre
-- esas tablas (que ya son de solo agregar), sin tocar ninguna función que guarda; un error del historial nunca detiene la
-- operación; lo pasado se carga. Aquí no hace falta agrupar ni diferir: cada fila de esos historiales ya es UNA
-- operación completa, así que el disparador es un AFTER INSERT común.
--
-- DE QUÉ SEDE ES CADA LÍNEA (quién la ve: el líder todas; la líder de tienda, la suya):
--   · Colaboradores: la sede de la persona (al moverla, las dos: de dónde sale y a dónde llega).
--   · Roles: dar un rol a alguien, la sede de esa persona o terminal; crear, renombrar, archivar o cambiar los módulos de
--     un rol (que no tiene sede), la sede de quien lo hizo — la misma regla que Productos (Felipe, 2026-10-02).
--   · Configuración: la sede del ajuste si es de una tienda (fondo, metas, WhatsApp, medio de cobro); si es de la empresa
--     (cuentas, impuestos, presupuesto), la sede de quien lo hizo.
--   · Regularizar: la sede de la prenda.
--
-- EL DINERO DE LA EMPRESA NO SE ESCRIBE. Igual que el costo de una prenda (20261002234500): el saldo inicial de una
-- cuenta, los montos del presupuesto y los umbrales de Finanzas no van ni en el texto ni en `detalle` (una línea de
-- Actividad la lee la líder de tienda). El fondo de caja y la meta de una tienda sí: son de esa tienda y su líder los usa.
--
-- PRODUCCIÓN. Sin políticas: UNA sola parte; toma candados breves de las cuatro tablas al crear los disparadores;
-- `lock_timeout = 3s`. Re-ejecutable. Prueba: `pnpm pruebas:actividad-gestion`.
-- ============================================================================

set lock_timeout = '3s';

update retail.modulos
   set incluye = 'Ver quién hizo qué en cada módulo de su tienda: ventas, caja, cambios, apartados, existencias, conteos, traslados, productos, colaboradores, roles y configuración, con fecha, hora y persona'
 where clave = 'actividad';

-- ---------- 1. Piezas ----------

-- El nombre de una persona (o de una terminal, que también recibe roles): «Rosa Mendoza».
create or replace function retail.fn_actividad_nombre(p_id uuid) returns text
language sql stable security definer set search_path = retail, public, extensions as $$
  select coalesce(
    (select nullif(btrim(coalesce(p.nombres, '') || ' ' || coalesce(p.apellidos, '')), '') from public.personas p where p.id = p_id),
    (select 'la terminal «' || t.nombre || '»' from retail.terminales t where t.id = p_id),
    'una persona');
$$;

create or replace function retail.fn_actividad_sede_nombre(p_id uuid) returns text
language sql stable security definer set search_path = retail, public, extensions as $$
  select u.nombre from retail.ubicaciones u where u.id = p_id;
$$;

-- La sede de una persona o terminal (para dar un rol): la asignada, o la de la terminal.
create or replace function retail.fn_actividad_sede_de_cuenta(p_id uuid) returns uuid
language sql stable security definer set search_path = retail, public, extensions as $$
  select coalesce((select c.ubicacion_asignada_id from retail.colaboradores c where c.persona_id = p_id limit 1),
                  (select t.ubicacion_id from retail.terminales t where t.id = p_id));
$$;

-- «Caja y Cambios» — los nombres de unos módulos, en el orden del catálogo. Con más de cuatro, los tres primeros y
-- cuántos más («Caja, Cambios, Conteos y 11 más»): una línea de Actividad se lee de un vistazo. Una clave que ya no es
-- módulo (`bajada_piso`, ADR-0306) se lee sin guiones.
create or replace function retail.fn_actividad_nombres_modulos(p_claves text[]) returns text
language sql stable security definer set search_path = retail, public, extensions as $$
  with n as (
    select coalesce(m.nombre, replace(x, '_', ' ')) as nombre, row_number() over (order by coalesce(m.orden, 9999), x) as i,
           count(*) over () as total
      from unnest(p_claves) x left join retail.modulos m on m.clave = x
  )
  select case when max(total) <= 4 then retail.fn_actividad_enumerar(array_agg(nombre order by i))
              else array_to_string(array_agg(nombre order by i) filter (where i <= 3), ', ') || ' y ' || (max(total) - 3) || ' más' end
    from n;
$$;

-- ---------- 2. Colaboradores ----------
create or replace function retail.fn_actividad_colaborador(p_id bigint, p_origen text default 'vivo') returns void
language plpgsql security definer set search_path = retail, public, extensions as $fn$
declare
  h retail.colaboradores_historial;
  v_quien text;
  v_rol text;
  v_texto text;
  v_sede uuid;
  v_destino uuid;
begin
  select * into h from retail.colaboradores_historial where id = p_id;
  if h.id is null then return; end if;
  v_quien := '«' || retail.fn_actividad_nombre(h.persona_id) || '»';
  v_rol := case when h.rol = 'lider' then 'líder' when h.rol is null then null else 'integrante' end;
  v_texto := case h.accion
    when 'alta' then 'dio de alta a ' || v_quien || coalesce(' como ' || v_rol, '')
                     || coalesce(' en ' || retail.fn_actividad_sede_nombre(h.ubicacion_nueva_id), '')
    when 'baja' then 'dio de baja a ' || v_quien
    when 'suspension' then 'suspendió a ' || v_quien
    when 'reactivacion' then 'reactivó a ' || v_quien
    when 'aprobacion' then 'aprobó el acceso de ' || v_quien || coalesce(' como ' || v_rol, '')
    when 'ubicacion' then 'movió a ' || v_quien || coalesce(' de ' || retail.fn_actividad_sede_nombre(h.ubicacion_anterior_id), '')
                          || coalesce(' a ' || retail.fn_actividad_sede_nombre(h.ubicacion_nueva_id), '')
    else replace(h.accion, '_', ' ') || ' a ' || v_quien
  end || coalesce(' · motivo: ' || nullif(btrim(h.motivo), ''), '');
  -- La sede de la persona; al moverla, las dos.
  if h.accion = 'ubicacion' then
    v_sede := coalesce(h.ubicacion_anterior_id, h.ubicacion_nueva_id);
    v_destino := case when h.ubicacion_anterior_id is not null then h.ubicacion_nueva_id end;
  else
    v_sede := coalesce(h.ubicacion_nueva_id, h.ubicacion_anterior_id, retail.fn_actividad_sede_de_cuenta(h.persona_id));
  end if;
  perform retail.fn_actividad_anotar(
    'colaboradores', 'colaborador_' || h.accion, v_texto,
    h.por, case when p_origen = 'vivo' then retail.fn_actividad_terminal_ahora() end, v_sede, v_destino,
    'colaboradores_historial', h.id::text, h.created_at,
    jsonb_build_object('persona_id', h.persona_id, 'rol', h.rol, 'motivo', nullif(btrim(h.motivo), '')),
    p_origen);
end;
$fn$;

-- ---------- 3. Roles ----------
create or replace function retail.fn_actividad_rol(p_id bigint, p_origen text default 'vivo') returns void
language plpgsql security definer set search_path = retail, public, extensions as $fn$
declare
  h retail.roles_historial;
  v_rol text;
  v_antes text[];
  v_despues text[];
  v_encendidos text[];
  v_apagados text[];
  v_cuenta uuid;
  v_texto text;
  v_sede uuid;
begin
  select * into h from retail.roles_historial where id = p_id;
  if h.id is null then return; end if;
  v_rol := '«' || coalesce((select r.nombre from retail.roles r where r.id = h.rol_id), 'un rol') || '»';

  if h.accion = 'modulos' then
    v_antes := coalesce((select array_agg(x) from jsonb_array_elements_text(h.detalle -> 'antes') x), '{}');
    v_despues := coalesce((select array_agg(x) from jsonb_array_elements_text(h.detalle -> 'despues') x), '{}');
    v_encendidos := array(select x from unnest(v_despues) x except select y from unnest(v_antes) y);
    v_apagados := array(select x from unnest(v_antes) x except select y from unnest(v_despues) y);
    v_texto := concat_ws(' y ',
      case when cardinality(v_encendidos) > 0 then 'encendió ' || retail.fn_actividad_nombres_modulos(v_encendidos) end,
      case when cardinality(v_apagados) > 0 then 'apagó ' || retail.fn_actividad_nombres_modulos(v_apagados) end);
    -- La pantalla con que abre el rol se guarda en el mismo paso.
    if (h.detalle -> 'pantalla_principal_antes') is distinct from (h.detalle -> 'pantalla_principal_despues')
       and h.detalle ? 'pantalla_principal_despues' then
      v_texto := concat_ws(' y ', nullif(v_texto, ''),
        'puso ' || coalesce('«' || (select m.nombre from retail.modulos m where m.clave = h.detalle ->> 'pantalla_principal_despues') || '»', 'Inicio')
        || ' como pantalla principal');
    end if;
    if nullif(v_texto, '') is null then return; end if;
    v_texto := v_texto || ' en el rol ' || v_rol;
  elsif h.accion = 'asignacion' then
    v_cuenta := coalesce(nullif(h.detalle ->> 'persona_id', '')::uuid, nullif(h.detalle ->> 'terminal_id', '')::uuid);
    v_texto := 'le dio el rol ' || v_rol || ' a «' || coalesce(nullif(h.detalle ->> 'cuenta', ''), retail.fn_actividad_nombre(v_cuenta)) || '»'
      || coalesce(' (antes: ' || nullif(h.detalle ->> 'rol_antes', '') || ')', '');
    v_sede := coalesce(nullif(h.detalle ->> 'ubicacion_id', '')::uuid, retail.fn_actividad_sede_de_cuenta(v_cuenta));
  else
    v_texto := case h.accion
      when 'creacion' then 'creó el rol ' || v_rol
      when 'renombre' then 'renombró el rol «' || coalesce(h.detalle ->> 'antes', '—') || '» a «' || coalesce(h.detalle ->> 'despues', '—') || '»'
      when 'archivo' then 'archivó el rol ' || v_rol
      when 'restauracion' then 'restauró el rol ' || v_rol
      else replace(h.accion, '_', ' ') || ' del rol ' || v_rol
    end || coalesce(' · motivo: ' || nullif(btrim(h.detalle ->> 'motivo'), ''), '');
  end if;

  perform retail.fn_actividad_anotar(
    'roles', 'rol_' || h.accion, v_texto,
    h.hecho_por, case when p_origen = 'vivo' then retail.fn_actividad_terminal_ahora() end,
    coalesce(v_sede, retail.fn_actividad_sede_de(h.hecho_por, p_origen)), null,
    'roles_historial', h.id::text, h.hecho_at,
    jsonb_build_object('rol_id', h.rol_id, 'encendidos', to_jsonb(nullif(v_encendidos, '{}')), 'apagados', to_jsonb(nullif(v_apagados, '{}'))),
    p_origen);
end;
$fn$;

-- ---------- 4. Configuración ----------
create or replace function retail.fn_actividad_configuracion(p_id bigint, p_origen text default 'vivo') returns void
language plpgsql security definer set search_path = retail, public, extensions as $fn$
declare
  h retail.configuracion_historial;
  d jsonb;
  v_sede uuid;
  v_tienda text;
  v_texto text;
  v_modulo text := 'configuracion';
  v_partes text[] := '{}';
begin
  select * into h from retail.configuracion_historial where id = p_id;
  if h.id is null then return; end if;
  d := h.detalle;
  v_sede := nullif(d ->> 'ubicacion_id', '')::uuid;
  v_tienda := coalesce(' de ' || retail.fn_actividad_sede_nombre(v_sede), '');

  if h.que = 'metas_tienda' then
    if (d #> '{antes,fondo}') is distinct from (d #> '{despues,fondo}') then
      v_partes := v_partes || ('fondo de caja '
        || coalesce(retail.fn_actividad_soles(nullif(d #>> '{antes,fondo}', '')::numeric), '—') || ' → '
        || coalesce(retail.fn_actividad_soles(nullif(d #>> '{despues,fondo}', '')::numeric), '—'));
    end if;
    if (d #> '{antes,metas}') is distinct from (d #> '{despues,metas}')
       and exists (select 1 from jsonb_array_elements(coalesce(d #> '{despues,metas}', '[]')) e where e <> 'null'::jsonb) then
      v_partes := v_partes || 'las metas de venta por día'::text;
    end if;
    if cardinality(v_partes) = 0 then return; end if;
    v_texto := 'cambió' || v_tienda || ': ' || retail.fn_actividad_enumerar(v_partes);
    v_texto := replace(v_texto, 'cambió de ', 'cambió en ');
  elsif h.que = 'whatsapp_tienda' then
    v_texto := 'cambió el WhatsApp' || v_tienda || ': ' || coalesce(nullif(d ->> 'antes', ''), '—') || ' → ' || coalesce(nullif(d ->> 'despues', ''), '—');
  elsif h.que = 'hora_cierre_tienda' then
    v_texto := 'cambió la hora de cierre' || v_tienda || ': ' || coalesce(nullif(d ->> 'antes', ''), '—') || ' → ' || coalesce(nullif(d ->> 'despues', ''), '—');
  elsif h.que = 'medio_de_cobro' then
    v_texto := 'asignó la cuenta «' || coalesce((select c.nombre from retail.cuentas_dinero c where c.id::text = d ->> 'cuenta_id'), 'sin cuenta')
      || '» al cobro con ' || case d ->> 'medio' when 'yape' then 'Yape' when 'plin' then 'Plin' when 'qr' then 'QR'
                                                  else coalesce(nullif(d ->> 'medio', ''), 'un medio') end
      || coalesce(' en ' || retail.fn_actividad_sede_nombre(v_sede), '');
  elsif h.que = 'efecto_campana' then
    v_texto := 'configuró el efecto de la campaña «' || coalesce((select e.nombre from retail.etiquetas e where e.id::text = d ->> 'etiqueta_id'), 'una campaña') || '»'
      || coalesce(' en ' || retail.fn_actividad_sede_nombre(v_sede), '')
      || case when (d #> '{antes,meta_pct}') is distinct from (d #> '{despues,meta_pct}')
              then ': meta ' || coalesce('+' || nullif(d #>> '{antes,meta_pct}', '') || ' %', '—') || ' → '
                   || coalesce('+' || nullif(d #>> '{despues,meta_pct}', '') || ' %', '—')
              else '' end
      || case when (d #> '{antes,fondo}') is distinct from (d #> '{despues,fondo}')
              then ' · fondo de caja ' || coalesce(retail.fn_actividad_soles(nullif(d #>> '{antes,fondo}', '')::numeric), '—') || ' → '
                   || coalesce(retail.fn_actividad_soles(nullif(d #>> '{despues,fondo}', '')::numeric), '—')
              else '' end;
  elsif h.que = 'parametro_tributario' then
    v_texto := case
      when (d #>> '{antes,valor}') = (d #>> '{despues,valor}') and (d #>> '{antes,provisional}') = 'true'
        then 'confirmó el parámetro tributario «' || coalesce(d ->> 'nombre', '—') || '» en ' || (d #>> '{despues,valor}') || ' (ya no es provisional)'
      else 'cambió el parámetro tributario «' || coalesce(d ->> 'nombre', '—') || '»: '
        || coalesce(nullif(d #>> '{antes,valor}', ''), nullif(d #>> '{antes,texto}', ''), '—') || ' → '
        || coalesce(nullif(d #>> '{despues,valor}', ''), nullif(d #>> '{despues,texto}', ''), '—') end
      || coalesce(' (vigente desde ' || to_char(nullif(d ->> 'vigente_desde', '')::date, 'DD/MM/YYYY') || ')', '');
  elsif h.que like 'cuenta_dinero_%' then
    -- Sin el saldo: es dinero de la empresa.
    v_texto := case h.que when 'cuenta_dinero_creada' then 'creó la cuenta «' when 'cuenta_dinero_editada' then 'editó la cuenta «'
                          when 'cuenta_dinero_eliminada' then 'eliminó la cuenta «' when 'cuenta_dinero_archivada' then 'archivó la cuenta «'
                          when 'cuenta_dinero_reactivada' then 'reactivó la cuenta «' else 'cambió la cuenta «' end
      || coalesce(d ->> 'nombre', '—') || '»' || coalesce(' (' || nullif(d ->> 'tipo', '') || ')', '');
  elsif h.que = 'parametros_finanzas' then
    v_texto := 'cambió los avisos de Finanzas (mínimo de caja, gastos y vencimientos)';
  elsif h.que = 'presupuesto' then
    -- Sin montos: el presupuesto es de la empresa.
    v_texto := 'cambió el presupuesto' || coalesce(' de «' || nullif(d ->> 'cuenta', '') || '»', '') || v_tienda
      || coalesce(' para ' || to_char(nullif(d ->> 'mes', '')::date, 'MM/YYYY'), '');
  elsif h.que = 'presupuesto_propuesta' then
    v_texto := 'guardó la propuesta de presupuesto' || coalesce(' para ' || to_char(nullif(d ->> 'mes', '')::date, 'MM/YYYY'), '');
  elsif h.que = 'beneficios_club' then
    v_modulo := 'avisos_club';
    v_texto := 'cambió los beneficios del club' || coalesce(' (versión ' || nullif(d ->> 'terminos_version', '') || ' de los términos)', '');
  else
    v_texto := 'cambió la configuración: ' || replace(h.que, '_', ' ');
  end if;
  if v_texto is null then return; end if;

  -- El módulo va escrito en cada llamada (no en una variable): `actividad-reglas.test.ts` lee las migraciones para saber
  -- qué módulos anotan, y la web tiene que reconocerlos todos.
  if v_modulo = 'avisos_club' then
    perform retail.fn_actividad_anotar(
      'avisos_club', 'config_' || h.que, v_texto,
      h.hecho_por, case when p_origen = 'vivo' then retail.fn_actividad_terminal_ahora() end,
      coalesce(v_sede, retail.fn_actividad_sede_de(h.hecho_por, p_origen)), null,
      'configuracion_historial', h.id::text, h.hecho_en, jsonb_build_object('que', h.que), p_origen);
  else
    perform retail.fn_actividad_anotar(
      'configuracion', 'config_' || h.que, v_texto,
      h.hecho_por, case when p_origen = 'vivo' then retail.fn_actividad_terminal_ahora() end,
      coalesce(v_sede, retail.fn_actividad_sede_de(h.hecho_por, p_origen)), null,
      'configuracion_historial', h.id::text, h.hecho_en, jsonb_build_object('que', h.que), p_origen);
  end if;
end;
$fn$;

-- ---------- 5. Recibir mercadería · regularizar una prenda vendida sin registrar ----------
create or replace function retail.fn_actividad_regularizar(p_id uuid, p_origen text default 'vivo') returns void
language plpgsql security definer set search_path = retail, public, extensions as $fn$
declare
  r retail.prendas_por_regularizar;
begin
  select * into r from retail.prendas_por_regularizar where id = p_id;
  if r.id is null or r.estado <> 'regularizada' then return; end if;
  perform retail.fn_actividad_anotar(
    'recibir', 'prenda_regularizada',
    'regularizó la prenda vendida sin registrar «' || btrim(r.descripcion) || '»: '
      || case r.forma when 'llego_nueva' then 'la registró como «' else 'era «' end
      || coalesce(retail.fn_actividad_prenda(r.variante_id), 'una prenda') || '»'
      || ' · precio oficial ' || retail.fn_actividad_soles(r.precio_oficial) || ', se cobró ' || retail.fn_actividad_soles(r.precio_cobrado),
    r.regularizado_por, case when p_origen = 'vivo' then retail.fn_actividad_terminal_ahora() end, r.ubicacion_id, null,
    'prendas_por_regularizar', r.id::text, r.regularizado_en,
    jsonb_build_object('forma', r.forma, 'precio_cobrado', r.precio_cobrado, 'precio_oficial', r.precio_oficial,
                       'diferencia', nullif(r.diferencia, 0), 'vendido_por', r.vendido_por),
    p_origen);
end;
$fn$;

-- ---------- 6. Disparadores (envueltos: un error del historial nunca detiene el guardado) ----------
create or replace function retail.trg_actividad_gestion() returns trigger
language plpgsql security definer set search_path = retail, public, extensions as $fn$
begin
  begin
    case tg_table_name
      when 'colaboradores_historial' then perform retail.fn_actividad_colaborador(new.id);
      when 'roles_historial' then perform retail.fn_actividad_rol(new.id);
      when 'configuracion_historial' then perform retail.fn_actividad_configuracion(new.id);
      when 'prendas_por_regularizar' then perform retail.fn_actividad_regularizar(new.id);
    end case;
  exception when others then
    raise warning 'actividad: no se anotó % % (%)', tg_table_name, new.id, sqlerrm;
  end;
  return null;
end;
$fn$;

create or replace trigger trg_actividad_colaboradores_historial
  after insert on retail.colaboradores_historial
  for each row execute function retail.trg_actividad_gestion();

create or replace trigger trg_actividad_roles_historial
  after insert on retail.roles_historial
  for each row execute function retail.trg_actividad_gestion();

create or replace trigger trg_actividad_configuracion_historial
  after insert on retail.configuracion_historial
  for each row execute function retail.trg_actividad_gestion();

create or replace trigger trg_actividad_prenda_regularizada
  after update of estado on retail.prendas_por_regularizar
  for each row when (old.estado is distinct from new.estado and new.estado = 'regularizada')
  execute function retail.trg_actividad_gestion();

-- ---------- 7. Permisos: anotar es solo de los disparadores ----------
revoke all on function retail.fn_actividad_nombre(uuid) from public, anon, authenticated;
revoke all on function retail.fn_actividad_sede_nombre(uuid) from public, anon, authenticated;
revoke all on function retail.fn_actividad_sede_de_cuenta(uuid) from public, anon, authenticated;
revoke all on function retail.fn_actividad_nombres_modulos(text[]) from public, anon, authenticated;
revoke all on function retail.fn_actividad_colaborador(bigint, text) from public, anon, authenticated;
revoke all on function retail.fn_actividad_rol(bigint, text) from public, anon, authenticated;
revoke all on function retail.fn_actividad_configuracion(bigint, text) from public, anon, authenticated;
revoke all on function retail.fn_actividad_regularizar(uuid, text) from public, anon, authenticated;
revoke all on function retail.trg_actividad_gestion() from public, anon, authenticated;

-- ---------- 8. Lo que ya pasó ----------
do $$
declare
  r record;
begin
  for r in select id from retail.colaboradores_historial order by created_at, id loop
    perform retail.fn_actividad_colaborador(r.id, 'carga_inicial');
  end loop;
  for r in select id from retail.roles_historial order by hecho_at, id loop
    perform retail.fn_actividad_rol(r.id, 'carga_inicial');
  end loop;
  for r in select id from retail.configuracion_historial order by hecho_en, id loop
    perform retail.fn_actividad_configuracion(r.id, 'carga_inicial');
  end loop;
  for r in select id from retail.prendas_por_regularizar where estado = 'regularizada' order by regularizado_en loop
    perform retail.fn_actividad_regularizar(r.id, 'carga_inicial');
  end loop;
end $$;
