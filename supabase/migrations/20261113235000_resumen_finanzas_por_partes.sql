-- ============================================================================
-- 20261113235000 — El Resumen de Finanzas se lee por partes (ADR-0661, «Resumen por bloques»)
--
-- EL PROBLEMA PRIMERO. Finanzas ▸ Resumen tarda 6,4–6,7 s en producción (el cronómetro del clic, 2026-11-13) y la persona no ve nada hasta que
-- termina todo. Lo más largo es `fn_resumen_finanzas` (4,3 s de media, `pg_stat_statements`): arma 13 partes UNA DETRÁS DE OTRA en una sola
-- llamada. Según su propio `ms` en los logs (mediana de 10 cargas mirando CAYLA entera), tres partes son ~78 %: `resultados_mes` ≈2,05 s,
-- `presupuesto` ≈0,94 s y `resultados_anterior` ≈0,40 s; las otras diez suman ≈0,63 s. Lo que la pantalla necesita primero («Libre para
-- usar»: los saldos y la caja que viene) está en esas diez, pero espera a las tres largas.
--
-- LO QUE CAMBIA. Nace `fn_resumen_finanzas_partes(p_ubicacion_id, p_solo_empresa, p_partes)`: el MISMO cuerpo de `fn_resumen_finanzas`
-- (copiado de su definición viva, md5 061a3cec…), con cada parte envuelta en «si se pidió». Sin `p_partes` (null) arma todas, como siempre;
-- con una lista, solo esas, y lo de arriba (quién mira, qué se mira, los parámetros y las sedes) siempre. Una parte que no existe es un error
-- (22023), nunca un silencio. Y `fn_resumen_finanzas` pasa a ser `fn_resumen_finanzas_partes(…, null)`: la regla vive en UN lugar.
-- La web pide tres lecturas a la vez (lo rápido, el mes, el anterior y el presupuesto) y dibuja cada bloque cuando llega su parte.
--
-- IDÉNTICO. Ni una cifra cambia: las partes son las mismas sentencias, con los mismos argumentos. Comprobado por md5 de la salida (sin `ms`)
-- antes y después, y juntando las tres lecturas contra la entera; `pnpm pruebas:resumen-por-partes` lo exige para siempre.
--
-- ANTES DE PEGAR. Una sola parte, sin políticas, sin `alter table` y sin `drop`: dos `create or replace function` y sus permisos. Frena sin
-- cambiar nada si `fn_resumen_finanzas` no es la de main (ni ya el envoltorio de esta migración) o si alguien cambió la función por partes.
-- Se puede pegar dos veces. La web funciona antes y después: sin esta función, lee la entera una vez y la reparte. Termina con «QUEDÓ BIEN».
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- 1. El candado: el cuerpo vivo tiene que ser el de main (o ya el envoltorio de esta migración), y la función por partes, si existe, la de aquí.
do $candado$
declare
  v_resumen text := (select md5(p.prosrc) from pg_proc p where p.oid = 'retail.fn_resumen_finanzas(uuid,boolean)'::regprocedure);
  v_partes text := (select md5(p.prosrc) from pg_proc p
                     where p.pronamespace = 'retail'::regnamespace and p.proname = 'fn_resumen_finanzas_partes');
begin
  if v_resumen not in ('061a3cec3d280b98c5bd7cccf25f3685', '6f5cc4f3f5e93f5a598cb1730dbc4030') then
    raise exception '20261113235000: fn_resumen_finanzas cambió desde que se escribió esta migración (md5 %; se esperaba 061a3cec… de main). No se cambió nada: regenera la función por partes desde su definición viva.', v_resumen;
  end if;
  if v_partes is not null and v_partes <> 'cb1b94d1868ad74b9b3c975f4ab6870c' then
    raise exception '20261113235000: fn_resumen_finanzas_partes ya existe con otro cuerpo (md5 %). No se cambió nada.', v_partes;
  end if;
end
$candado$;

-- 2. La lectura por partes. El cuerpo es el de `fn_resumen_finanzas` hasta hoy, letra por letra, con cada parte dentro de «si se pidió».
create or replace function retail.fn_resumen_finanzas_partes(p_ubicacion_id uuid default null, p_solo_empresa boolean default false, p_partes text[] default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_lider boolean := coalesce(retail.fn_es_lider(), false);
  v_hoy date := retail.fn_hoy_lima();
  v_mes date := date_trunc('month', retail.fn_hoy_lima())::date;
  v_mes_ant date := (date_trunc('month', retail.fn_hoy_lima()) - interval '1 month')::date;
  v_fin_ant date := (date_trunc('month', retail.fn_hoy_lima()) - interval '1 day')::date;
  v_ubic uuid;
  v_empresa boolean := false;
  v_todas boolean;
  v_tipo text;
  v_nombre text;
  v_param jsonb;
  v_dias integer := 7;
  v_out jsonb := '{}'::jsonb;
  v_ms jsonb := '{}'::jsonb;
  v_sec jsonb;
  v_t0 timestamptz;
  -- 20261113235000: sin `p_partes`, todas (lo que fue siempre `fn_resumen_finanzas`); con ellas, solo esas.
  v_todo boolean := p_partes is null;
begin
  if not v_todo and exists (select 1 from unnest(p_partes) x where x is null or x <> all (array[
       'resultados_mes', 'resultados_anterior', 'presupuesto', 'cuentas', 'por_pagar', 'flujo', 'igv',
       'campanas', 'egresos', 'fijos', 'raros', 'cierre', 'sin_cuenta'])) then
    raise exception 'El Resumen no tiene esa parte: %.', array_to_string(p_partes, ', ') using errcode = '22023';
  end if;

  if not v_lider and not coalesce(retail.fn_capacidad_por_modulos(array['reportes_financieros']), false) then
    raise exception 'El Resumen de Finanzas necesita el módulo «Reportes financieros» en tu rol.' using errcode = '42501';
  end if;

  -- Qué se mira (regla 2).
  if v_lider then
    v_ubic := p_ubicacion_id;
    v_empresa := coalesce(p_solo_empresa, false) and p_ubicacion_id is null;
  else
    v_ubic := retail.fn_ubicacion_actual_persona();
    if v_ubic is null then
      raise exception 'Tu cuenta no tiene una sede: el Resumen muestra la tienda donde trabajas.' using errcode = '42501';
    end if;
    if coalesce(p_solo_empresa, false) or (p_ubicacion_id is not null and p_ubicacion_id <> v_ubic) then
      raise exception 'Con «Reportes financieros» ves solo tu tienda.' using errcode = '42501';
    end if;
  end if;
  if v_ubic is not null then
    select u.tipo, u.nombre into v_tipo, v_nombre from retail.ubicaciones u where u.id = v_ubic;
    if not found then
      raise exception 'Esa ubicación no existe.' using errcode = 'P0001';
    end if;
  elsif v_empresa then
    v_tipo := 'empresa'; v_nombre := 'De la empresa';
  else
    v_tipo := 'todas'; v_nombre := 'CAYLA';
  end if;
  v_todas := v_ubic is null and not v_empresa;

  -- Los umbrales de Configuración ▸ Caja y avisos (mínimo de caja, días para «vence pronto», % de «fuera de lo normal»).
  begin
    v_param := retail.fn_parametros_finanzas();
    v_dias := coalesce((v_param ->> 'aviso_vence_dias')::integer, 7);
  exception
    when insufficient_privilege then v_param := jsonb_build_object('sin_permiso', sqlerrm);
    when others then v_param := jsonb_build_object('falla', sqlerrm);
  end;

  v_out := jsonb_build_object(
    'hoy', v_hoy, 'mes', v_mes, 'mes_anterior', v_mes_ant, 'lider', v_lider,
    'ver', jsonb_build_object('ubicacion_id', v_ubic, 'solo_empresa', v_empresa, 'todas', v_todas, 'tipo', v_tipo, 'nombre', v_nombre),
    'parametros', v_param,
    -- Para «Ver» del líder: las tiendas y el Taller activos (la empresa la agrega la pantalla).
    'unidades', case when v_lider then coalesce((
        select jsonb_agg(jsonb_build_object('id', u.id, 'nombre', u.nombre, 'tipo', u.tipo)
                         order by case u.tipo when 'tienda' then 1 else 2 end, u.nombre)
          from retail.ubicaciones u where u.activo and u.tipo in ('tienda', 'taller')), '[]'::jsonb)
      else '[]'::jsonb end
  );

  -- F5 · El mes en curso a la fecha (lo vendido) y el último mes completo (utilidad, punto de equilibrio, quién perdió).
  if v_todo or 'resultados_mes' = any (p_partes) then
    v_t0 := clock_timestamp();
    begin
      select jsonb_build_object('desde', v_mes, 'hasta', v_hoy,
                                'filas', coalesce(jsonb_agg(to_jsonb(r) order by r.orden, r.nombre), '[]'::jsonb))
        into v_sec
        from retail.fn_estado_resultados(v_mes, v_hoy, v_ubic) r
       where not v_empresa or r.unidad = 'empresa';
    exception
      when insufficient_privilege then v_sec := jsonb_build_object('sin_permiso', sqlerrm);
      when others then v_sec := jsonb_build_object('falla', sqlerrm);
    end;
    v_out := v_out || jsonb_build_object('resultados_mes', v_sec);
    v_ms := v_ms || jsonb_build_object('resultados_mes', round(extract(epoch from clock_timestamp() - v_t0) * 1000));
  end if;

  if v_todo or 'resultados_anterior' = any (p_partes) then
    v_t0 := clock_timestamp();
    begin
      select jsonb_build_object('desde', v_mes_ant, 'hasta', v_fin_ant,
                                'filas', coalesce(jsonb_agg(to_jsonb(r) order by r.orden, r.nombre), '[]'::jsonb))
        into v_sec
        from retail.fn_estado_resultados(v_mes_ant, v_fin_ant, v_ubic) r
       where not v_empresa or r.unidad = 'empresa';
    exception
      when insufficient_privilege then v_sec := jsonb_build_object('sin_permiso', sqlerrm);
      when others then v_sec := jsonb_build_object('falla', sqlerrm);
    end;
    v_out := v_out || jsonb_build_object('resultados_anterior', v_sec);
    v_ms := v_ms || jsonb_build_object('resultados_anterior', round(extract(epoch from clock_timestamp() - v_t0) * 1000));
  end if;

  -- Presupuesto · la meta de ventas del mes y los topes. Mirando CAYLA entera basta la fila de CAYLA y lo que se pasa.
  if v_todo or 'presupuesto' = any (p_partes) then
    v_t0 := clock_timestamp();
    begin
      select jsonb_build_object('filas', coalesce(jsonb_agg(to_jsonb(p) order by p.orden, p.nombre, p.orden_linea), '[]'::jsonb))
        into v_sec
        from retail.fn_presupuesto_vs_real(v_mes, v_ubic, null) p
       where case when v_todas then p.unidad = 'consolidado' or p.se_pasa
                  when v_empresa then p.unidad = 'empresa'
                  else true end;
    exception
      when insufficient_privilege then v_sec := jsonb_build_object('sin_permiso', sqlerrm);
      when others then v_sec := jsonb_build_object('falla', sqlerrm);
    end;
    v_out := v_out || jsonb_build_object('presupuesto', v_sec);
    v_ms := v_ms || jsonb_build_object('presupuesto', round(extract(epoch from clock_timestamp() - v_t0) * 1000));
  end if;

  -- F3 · Los saldos de hoy. Una tienda: su cajón y su caja fuerte; la empresa: lo que no es de ninguna tienda.
  if v_todo or 'cuentas' = any (p_partes) then
    v_t0 := clock_timestamp();
    begin
      select jsonb_build_object('filas', coalesce(jsonb_agg(to_jsonb(c) order by c.orden, c.nombre), '[]'::jsonb))
        into v_sec
        from retail.fn_cuentas_dinero_saldos(v_hoy, v_ubic) c
       where not c.archivada
         and case when v_todas then true
                  when v_empresa then c.ubicacion_id is null
                  else c.ubicacion_id = v_ubic end;
    exception
      when insufficient_privilege then v_sec := jsonb_build_object('sin_permiso', sqlerrm);
      when others then v_sec := jsonb_build_object('falla', sqlerrm);
    end;
    v_out := v_out || jsonb_build_object('cuentas', v_sec);
    v_ms := v_ms || jsonb_build_object('cuentas', round(extract(epoch from clock_timestamp() - v_t0) * 1000));
  end if;

  -- F4 · Lo que se debe: el total, y cada comprobante vencido o que vence en los próximos `aviso_vence_dias`.
  if v_todo or 'por_pagar' = any (p_partes) then
    v_t0 := clock_timestamp();
    begin
      select jsonb_build_object('dias', v_dias, 'total', coalesce(sum(p.saldo), 0), 'n', count(*),
                                'filas', coalesce(jsonb_agg(to_jsonb(p) order by p.vence, p.proveedor, p.documento)
                                                    filter (where p.vence <= v_hoy + v_dias), '[]'::jsonb))
        into v_sec
        from retail.fn_por_pagar_consolidado(v_ubic, null, v_empresa) p;
    exception
      when insufficient_privilege then v_sec := jsonb_build_object('sin_permiso', sqlerrm);
      when others then v_sec := jsonb_build_object('falla', sqlerrm);
    end;
    v_out := v_out || jsonb_build_object('por_pagar', v_sec);
    v_ms := v_ms || jsonb_build_object('por_pagar', round(extract(epoch from clock_timestamp() - v_t0) * 1000));
  end if;

  -- F6 · Las próximas 6 semanas, los días de caja y la semana bajo el mínimo: son de CAYLA entera. CON los cobros día a día desde
  -- 20261109175000: la página de Resumen los necesita para «Tu caja en las próximas dos semanas» y antes volvía a pedir la proyección entera
  -- aparte (~2 s más por carga); ahora usa esta. Pesa unos KB más en la respuesta.
  if v_todo or 'flujo' = any (p_partes) then
    v_t0 := clock_timestamp();
    if v_todas then
      begin
        v_sec := retail.fn_flujo_caja_proyeccion(6);
      exception
        when insufficient_privilege then v_sec := jsonb_build_object('sin_permiso', sqlerrm);
        when others then v_sec := jsonb_build_object('falla', sqlerrm);
      end;
    else
      v_sec := jsonb_build_object('no_aplica', true);
    end if;
    v_out := v_out || jsonb_build_object('flujo', v_sec);
    v_ms := v_ms || jsonb_build_object('flujo', round(extract(epoch from clock_timestamp() - v_t0) * 1000));
  end if;

  -- F8 · El IGV del mes en curso (y el del anterior, que es el que se declara ahora) y el límite de 300 UIT.
  if v_todo or 'igv' = any (p_partes) then
    v_t0 := clock_timestamp();
    if v_todas then
      begin
        v_sec := retail.fn_impuestos_panel(v_mes);
      exception
        when insufficient_privilege then v_sec := jsonb_build_object('sin_permiso', sqlerrm);
        when others then v_sec := jsonb_build_object('falla', sqlerrm);
      end;
    else
      v_sec := jsonb_build_object('no_aplica', true);
    end if;
    v_out := v_out || jsonb_build_object('igv', v_sec);
    v_ms := v_ms || jsonb_build_object('igv', round(extract(epoch from clock_timestamp() - v_t0) * 1000));
  end if;

  -- F5 · Campañas que empiezan en las próximas dos semanas (el veredicto lo da la regla de F5 en la web). Solo donde se
  -- vende: CAYLA entera o una tienda (el Taller y la empresa no tienen meta de ventas que subir).
  if v_todo or 'campanas' = any (p_partes) then
    v_t0 := clock_timestamp();
    if v_todas or v_tipo = 'tienda' then
      begin
        select jsonb_build_object('filas', coalesce(jsonb_agg(to_jsonb(c) order by c.desde, c.nombre), '[]'::jsonb))
          into v_sec
          from retail.fn_campanas_reporte(v_ubic) c
         where c.momento = 'viene' and c.desde > v_hoy and c.desde <= v_hoy + 14;
      exception
        when insufficient_privilege then v_sec := jsonb_build_object('sin_permiso', sqlerrm);
        when others then v_sec := jsonb_build_object('falla', sqlerrm);
      end;
    else
      v_sec := jsonb_build_object('no_aplica', true);
    end if;
    v_out := v_out || jsonb_build_object('campanas', v_sec);
    v_ms := v_ms || jsonb_build_object('campanas', round(extract(epoch from clock_timestamp() - v_t0) * 1000));
  end if;

  -- F2 · Egresos de caja sin clasificar (siempre son de una caja, así que no aplican a «De la empresa»).
  if v_todo or 'egresos' = any (p_partes) then
    v_t0 := clock_timestamp();
    if not v_empresa then
      begin
        with e as materialized (select * from retail.fn_egresos_sin_clasificar(v_ubic, 1000)),
        x as (select e.ubicacion_id, e.ubicacion_nombre, count(*) as n, sum(e.monto) as monto
                from e group by e.ubicacion_id, e.ubicacion_nombre)
        select jsonb_build_object(
                 'n', (select count(*) from e), 'monto', coalesce((select sum(e.monto) from e), 0),
                 'desde', (select min(e.creado_en) from e),
                 'por_ubicacion', coalesce((select jsonb_agg(jsonb_build_object('ubicacion_id', x.ubicacion_id, 'nombre', x.ubicacion_nombre,
                                                                                'n', x.n, 'monto', x.monto)
                                                             order by x.n desc, x.ubicacion_nombre) from x), '[]'::jsonb))
          into v_sec;
      exception
        when insufficient_privilege then v_sec := jsonb_build_object('sin_permiso', sqlerrm);
        when others then v_sec := jsonb_build_object('falla', sqlerrm);
      end;
    else
      v_sec := jsonb_build_object('no_aplica', true);
    end if;
    v_out := v_out || jsonb_build_object('egresos', v_sec);
    v_ms := v_ms || jsonb_build_object('egresos', round(extract(epoch from clock_timestamp() - v_t0) * 1000));
  end if;

  -- F2b · Gastos fijos que ya debieron llegar este mes y no se registraron.
  if v_todo or 'fijos' = any (p_partes) then
    v_t0 := clock_timestamp();
    begin
      select jsonb_build_object('filas', coalesce(jsonb_agg(to_jsonb(f) order by f.fecha_esperada, f.descripcion), '[]'::jsonb))
        into v_sec
        from retail.fn_gastos_fijos_mes(v_mes, v_ubic, v_empresa) f
       where f.estado = 'falta';
    exception
      when insufficient_privilege then v_sec := jsonb_build_object('sin_permiso', sqlerrm);
      when others then v_sec := jsonb_build_object('falla', sqlerrm);
    end;
    v_out := v_out || jsonb_build_object('fijos', v_sec);
    v_ms := v_ms || jsonb_build_object('fijos', round(extract(epoch from clock_timestamp() - v_t0) * 1000));
  end if;

  -- F10 · Gastos fuera de lo normal (regla 4).
  if v_todo or 'raros' = any (p_partes) then
    v_t0 := clock_timestamp();
    begin
      select jsonb_build_object('pct', v_param -> 'aviso_gasto_pct',
                                'filas', coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb))
        into v_sec
        from retail.fn_gastos_fuera_de_lo_normal(v_ubic, v_empresa, null) r;
    exception
      when insufficient_privilege then v_sec := jsonb_build_object('sin_permiso', sqlerrm);
      when others then v_sec := jsonb_build_object('falla', sqlerrm);
    end;
    v_out := v_out || jsonb_build_object('raros', v_sec);
    v_ms := v_ms || jsonb_build_object('raros', round(extract(epoch from clock_timestamp() - v_t0) * 1000));
  end if;

  -- F9 · El mes anterior: qué unidades ya se cerraron. El cierre es solo del líder (el módulo no se delega). No se llama a
  -- `fn_cierre_mes_estado` (recorre el diario del mes entero): basta saber qué está cerrado.
  if v_todo or 'cierre' = any (p_partes) then
    v_t0 := clock_timestamp();
    if v_lider then
      begin
        with per as (select * from retail.fn_periodos_mes(v_mes_ant)),
        uni as (
          select 'ubicacion'::text as alc, u.id as uid, u.nombre::text as nom, case u.tipo when 'taller' then 2 else 1 end as ord
            from retail.ubicaciones u
           where u.activo and (v_todas or u.id = v_ubic)
          union all
          select 'empresa', null::uuid, 'De la empresa', 3 where v_todas or v_empresa
        )
        select jsonb_build_object(
                 'mes', v_mes_ant,
                 'consolidado', exists (select 1 from per where per.alcance = 'consolidado' and per.estado = 'cerrado'),
                 'unidades', coalesce(jsonb_agg(jsonb_build_object(
                               'alcance', uni.alc, 'ubicacion_id', uni.uid, 'nombre', uni.nom,
                               'cerrada', exists (select 1 from per where per.alcance = uni.alc
                                                    and per.ubicacion_id is not distinct from uni.uid and per.estado = 'cerrado'))
                             order by uni.ord, uni.nom), '[]'::jsonb))
          into v_sec
          from uni;
      exception
        when insufficient_privilege then v_sec := jsonb_build_object('sin_permiso', sqlerrm);
        when others then v_sec := jsonb_build_object('falla', sqlerrm);
      end;
    else
      v_sec := jsonb_build_object('no_aplica', true);
    end if;
    v_out := v_out || jsonb_build_object('cierre', v_sec);
    v_ms := v_ms || jsonb_build_object('cierre', round(extract(epoch from clock_timestamp() - v_t0) * 1000));
  end if;

  -- F3 · Lo que este mes movió plata sin decir de qué cuenta (no suma en ningún saldo). Es de CAYLA entera.
  if v_todo or 'sin_cuenta' = any (p_partes) then
    v_t0 := clock_timestamp();
    if v_todas or v_empresa then
      begin
        select jsonb_build_object('filas', coalesce(jsonb_agg(to_jsonb(s) order by s.origen), '[]'::jsonb))
          into v_sec
          from retail.fn_dinero_sin_cuenta(v_mes, v_hoy) s;
      exception
        when insufficient_privilege then v_sec := jsonb_build_object('sin_permiso', sqlerrm);
        when others then v_sec := jsonb_build_object('falla', sqlerrm);
      end;
    else
      v_sec := jsonb_build_object('no_aplica', true);
    end if;
    v_out := v_out || jsonb_build_object('sin_cuenta', v_sec);
    v_ms := v_ms || jsonb_build_object('sin_cuenta', round(extract(epoch from clock_timestamp() - v_t0) * 1000));
  end if;

  return v_out || jsonb_build_object('ms', v_ms);
end 
$$;

revoke all on function retail.fn_resumen_finanzas_partes(uuid, boolean, text[]) from public, anon;
grant execute on function retail.fn_resumen_finanzas_partes(uuid, boolean, text[]) to authenticated;

-- 3. `fn_resumen_finanzas` sigue existiendo, con la misma firma, los mismos permisos y la misma respuesta: ahora pide todas las partes.
create or replace function retail.fn_resumen_finanzas(p_ubicacion_id uuid default null, p_solo_empresa boolean default false)
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select retail.fn_resumen_finanzas_partes(p_ubicacion_id, p_solo_empresa, null)
$$;

revoke all on function retail.fn_resumen_finanzas(uuid, boolean) from public, anon;
grant execute on function retail.fn_resumen_finanzas(uuid, boolean) to authenticated;

-- 4. Comprobar: los dos cuerpos son los de esta migración.
do $comprobar$
begin
  if (select md5(p.prosrc) from pg_proc p where p.oid = 'retail.fn_resumen_finanzas(uuid,boolean)'::regprocedure) <> '6f5cc4f3f5e93f5a598cb1730dbc4030'
     or (select md5(p.prosrc) from pg_proc p where p.oid = 'retail.fn_resumen_finanzas_partes(uuid,boolean,text[])'::regprocedure) <> 'cb1b94d1868ad74b9b3c975f4ab6870c' then
    raise exception '20261113235000: las funciones no quedaron como dice esta migración.';
  end if;
end
$comprobar$;

select '20261113235000 · QUEDÓ BIEN: el Resumen de Finanzas se lee por partes' as resultado;
