-- ============================================================================
-- Mis compras · «¿A qué cuenta de CAYLA devolviste?» al cerrar la ronda — PARTE 2 de 2: las funciones.
-- Se pega DESPUÉS de la parte 1 (`20261029165000`, la columna `compra_cierres.cuenta_indicada_id`).
--
-- Qué hace:
--   1. `terminar_dia_compras` recibe un parámetro más, `p_cuenta_indicada_id` (de fábrica null: lo que llama con un argumento sigue igual). Si la
--      decisión es «devuelve» y viene una cuenta, tiene que ser un banco o una caja fuerte que se usa; se guarda en el cierre. Con otra decisión
--      se ignora (el candado de la tabla solo la deja con «devuelve»). La función con un parámetro se retira: dos con el mismo nombre y un parámetro
--      opcional dejan la llamada ambigua.
--   2. `fn_cuentas_para_devolver_compras()` da a la compradora las cuentas a las que se puede devolver (las mismas que acepta `devolver_fondo`: bancos
--      y cajas fuertes, no la del líder). Sin esto no puede ni ver los nombres: `cuentas_dinero` no se lee con el módulo Mis compras.
--   3. `fn_revisar_compras()` dice, en cada cierre, la cuenta que indicó la compradora, para que «Revisar compras» la traiga ya elegida.
--
-- Solo funciones: sin tablas, sin políticas ni disparadores nuevos (ADR-0195). Idempotente. Las modificaciones a funciones que ya existen son
-- reemplazos ANCLADOS sobre su definición real (no hacen nada si ya están hechos, y avisan si la función cambió).
-- El dinero NO se mueve aquí: sigue moviéndose solo en `recibir_cierre_compras`, a la cuenta que Compras confirma.
-- ============================================================================
set lock_timeout = '3s';
set search_path = retail, public, extensions;

create or replace function pg_temp.sustituir(p_def text, p_viejo text, p_nuevo text, p_veces integer)
returns text
language plpgsql
as $f$
declare
  v_n integer;
begin
  v_n := (length(p_def) - length(replace(p_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception 'La función cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_veces, p_viejo, v_n;
  end if;
  return replace(p_def, p_viejo, p_nuevo);
end;
$f$;

-- ---------- 1. Cerrar la ronda, con la cuenta a la que devolvió ----------
do $mig$
declare
  v_def text;
begin
  -- Ya hecho: la función de dos parámetros existe. Si volvió a aparecer la de un parámetro (alguien re-pegó una migración vieja que la crea), se retira:
  -- dos con el mismo nombre y un parámetro opcional dejan ambigua toda llamada con un solo argumento.
  if to_regprocedure('retail.terminar_dia_compras(text,uuid)') is not null then
    drop function if exists retail.terminar_dia_compras(text);
    return;
  end if;
  v_def := pg_get_functiondef('retail.terminar_dia_compras(text)'::regprocedure);
  v_def := pg_temp.sustituir(v_def,
    $q$retail.terminar_dia_compras(p_decision text)$q$,
    $q$retail.terminar_dia_compras(p_decision text, p_cuenta_indicada_id uuid DEFAULT NULL::uuid)$q$, 1);
  v_def := pg_temp.sustituir(v_def,
    $q$  insert into retail.compra_cierres (persona_id, fecha, decision, monto, cerrado_por, ronda_id)$q$,
    $q$  -- La cuenta a la que devolvió (20261029170000): solo con «devuelve», y una a la que Compras pueda recibir (banco o caja fuerte).
  if v_decision = 'devuelve' and p_cuenta_indicada_id is not null
     and not exists (select 1 from retail.cuentas_dinero c
                      where c.id = p_cuenta_indicada_id and c.archivada_en is null and c.tipo in ('banco', 'caja_fuerte')) then
    raise exception 'Elige una cuenta de CAYLA de la lista' using errcode = 'P0001', hint = 'compra_cierre_cuenta';
  end if;

  insert into retail.compra_cierres (persona_id, fecha, decision, monto, cerrado_por, ronda_id, cuenta_indicada_id)$q$, 1);
  v_def := pg_temp.sustituir(v_def,
    $q$  values (v_actor, v_hoy, v_decision, abs(v_tiene), v_actor, v_ronda)$q$,
    $q$  values (v_actor, v_hoy, v_decision, abs(v_tiene), v_actor, v_ronda,
          case when v_decision = 'devuelve' then p_cuenta_indicada_id end)$q$, 1);
  execute v_def;
  drop function retail.terminar_dia_compras(text);
end
$mig$;
revoke all on function retail.terminar_dia_compras(text, uuid) from public, anon;
grant execute on function retail.terminar_dia_compras(text, uuid) to authenticated;

-- ---------- 2. Las cuentas a las que se puede devolver ----------
create or replace function retail.fn_cuentas_para_devolver_compras()
returns jsonb
language plpgsql stable security definer set search_path = retail, public, extensions as $$
begin
  if not (retail.fn_ve_modulo('ordenes_compra') or retail.fn_ve_modulo('fondos')) then
    raise exception 'Ver las cuentas de CAYLA necesita el módulo Mis compras o Revisar compras en tu rol.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.nombre, 'tipo', c.tipo,
                                        'sede', (select u.nombre from retail.ubicaciones u where u.id = c.ubicacion_id))
                     order by (c.tipo = 'banco') desc, c.orden, c.nombre)
      from retail.cuentas_dinero c
     where c.tipo in ('banco', 'caja_fuerte') and c.archivada_en is null), '[]'::jsonb);
end $$;
revoke all on function retail.fn_cuentas_para_devolver_compras() from public, anon;
grant execute on function retail.fn_cuentas_para_devolver_compras() to authenticated;

-- ---------- 3. «Revisar compras» ve la cuenta que indicó la compradora ----------
do $mig$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('retail.fn_revisar_compras()'::regprocedure);
  if position($q$'cuenta_indicada_id', k.cuenta_indicada_id$q$ in v_def) > 0 then
    return;
  end if;
  v_def := pg_temp.sustituir(v_def,
    $q$'cuaderno', case when k.ronda_id is null then null else retail.fn_ronda_compras_cuenta(k.ronda_id) end,$q$,
    $q$'cuaderno', case when k.ronda_id is null then null else retail.fn_ronda_compras_cuenta(k.ronda_id) end,
               'cuenta_indicada_id', k.cuenta_indicada_id,
               'cuenta_indicada', (select c.nombre from retail.cuentas_dinero c where c.id = k.cuenta_indicada_id),$q$, 1);
  execute v_def;
end
$mig$;

notify pgrst, 'reload schema';
