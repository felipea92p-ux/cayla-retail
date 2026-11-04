-- ============================================================================
-- 20261103222000_costo_fuera_de_lo_normal_sin_aviso.sql — CAYLA V2 · ADR-0393 (act. 2026-11-03)
-- Recibir: un costo fuera de lo normal también pide confirmar en un envío sin aviso.
--
-- EL PROBLEMA PRIMERO. Un costo de S/ 9 999 en un vestido de S/ 149.90 entró sin ningún aviso y subió su costo promedio de S/ 58 a S/ 2 674
-- (`/flujo-de-negocio`, 2026-11-03). `fn_recepcion_entrar` saca del revisor lo que se regala con
-- `not (u ->> 'tipo' = 'extra' and u ->> 'sobrante_causa' = 'regalo')` (20261028182000). Un envío sin aviso no pregunta la causa: ahí
-- `sobrante_causa` es NULL, la condición da NULL y la fila se descarta. El revisor nunca corría en un envío sin aviso.
--
-- QUÉ CAMBIA
--   1. `fn_recepcion_entrar`: el revisor lee cada unidad con la causa vacía convertida en texto. Con eso la condición vuelve a dar verdadero o
--      falso. Lo que se regala sigue fuera, y lo demás de fuera de la guía entra al revisor.
--   2. `fn_costos_de_hoy` (nueva): lo que cuesta hoy cada combinación. La hoja de confirmar decía «sin precio → S/ 9,999.00» porque la web no
--      puede leer `variantes.costo`. La lee solo quien ve el dinero de Compras.
--
-- LO QUE NO CAMBIA
--   · Quién confirma, los límites del costo (`fn_costo_fuera_de_banda`) y lo que entra sin costo: sin costo, no se pregunta nada.
--   · El envío con aviso: ahí la causa de lo de más ya era obligatoria.
--
-- DESCARTÉ
--   · Reescribir la línea del filtro con `coalesce`: 20261028182000 se vuelve a cargar en `pendientes_de_envio` y busca esa línea tal cual; sin ella se
--     detiene. ADR-0605 ya pagó ese costo con cinco tandas en rojo. Por eso se cambia la fuente de la consulta y la línea queda igual.
--   · Mandar una causa desde `cerrar_conteo_envio`: esa causa también la leen los que anotan diferencias, y ahí vacía significa «no se preguntó».
--   · Dar a `authenticated` permiso de leer `variantes.costo`: lo verían quienes no ven el dinero de Compras.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). UNA parte, sin políticas ni `drop trigger` (ADR-0195), idempotente. Revisado el 2026-11-03: en
-- producción ningún costo de un envío sin aviso quedó fuera de lo normal, así que no hay nada que corregir.
-- ============================================================================

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
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición viva.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ---------- 1. El revisor del costo también corre sin aviso ----------
select pg_temp.reemplazar('retail.fn_recepcion_entrar(uuid,uuid,text,text,uuid,jsonb,uuid[],text)',
$v$    from jsonb_array_elements(p_unidades) u
   cross join lateral jsonb_array_elements(u -> 'variantes') v
    join retail.variantes vr on vr.id = (v ->> 'variante_id')::uuid
   cross join lateral (select retail.fn_costo_fuera_de_banda($v$,
$n$    -- Sin aviso no se pregunta la causa: vacía, el filtro del regalo daría NULL y descartaría la fila (20261103222000).
    from (select e.value || jsonb_build_object('sobrante_causa', coalesce(e.value ->> 'sobrante_causa', '')) as u
            from jsonb_array_elements(p_unidades) e) unidades
   cross join lateral jsonb_array_elements(u -> 'variantes') v
    join retail.variantes vr on vr.id = (v ->> 'variante_id')::uuid
   cross join lateral (select retail.fn_costo_fuera_de_banda($n$,
1);

-- ---------- 2. Lo que cuesta hoy cada combinación ----------
create or replace function retail.fn_costos_de_hoy(p_variantes uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if retail.fn_puede_ver_dinero_de_compras() is not true then
    raise exception 'Tu rol no ve el dinero de Compras' using errcode = '42501', hint = 'sin_dinero_de_compras';
  end if;
  return coalesce((
    select jsonb_object_agg(v.id, v.costo)
      from retail.variantes v
     where v.id = any((coalesce(p_variantes, '{}'::uuid[]))[1:2000])
       and v.costo is not null), '{}'::jsonb);
end;
$$;
comment on function retail.fn_costos_de_hoy(uuid[]) is
  'ADR-0393 (act. 2026-11-03): lo que cuesta hoy cada combinación, para decirlo antes de cambiarlo al cerrar un envío. Solo quien ve el dinero de Compras; una combinación sin costo no sale.';
revoke all on function retail.fn_costos_de_hoy(uuid[]) from public, anon;
grant execute on function retail.fn_costos_de_hoy(uuid[]) to authenticated, service_role;

-- ---------- 3. Comprobación ----------
do $$
begin
  if position('as u' in pg_get_functiondef('retail.fn_recepcion_entrar(uuid,uuid,text,text,uuid,jsonb,uuid[],text)'::regprocedure)) = 0
     or position('(20261103222000)' in pg_get_functiondef('retail.fn_recepcion_entrar(uuid,uuid,text,text,uuid,jsonb,uuid[],text)'::regprocedure)) = 0 then
    raise exception 'fn_recepcion_entrar no quedó revisando el costo de un envío sin aviso';
  end if;
  if to_regprocedure('retail.fn_costos_de_hoy(uuid[])') is null then
    raise exception 'fn_costos_de_hoy no quedó creada';
  end if;
end;
$$;

reset lock_timeout;
