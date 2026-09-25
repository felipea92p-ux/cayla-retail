-- ============================================================================
-- 20260925200000 — Finanzas ▸ Resumen: el tablero del lunes (ADR-0195 F10; docs/PLAN-FINANZAS.md §3 pieza 4 y §6 bis)
--
-- EL PROBLEMA PRIMERO
--   Las fases F3–F9 y Presupuesto ya calculan todo lo que Felipe necesita para decidir: cuánta plata hay (F3), qué se debe y
--   cuándo vence (F4), si se ganó (F5), si la caja aguanta (F6), cuánto IGV toca (F8), qué mes falta cerrar (F9) y en qué
--   rubro se está pasando (Presupuesto). Pero está en siete pantallas. El lunes, Felipe no quiere recorrerlas: quiere UNA
--   que le diga los números que mira primero (D-52) y qué conviene decidir hoy, cada cosa con su origen y un enlace a donde
--   se actúa. Si esa pantalla recalculara cada número por su cuenta, un día el Resumen y el Estado de resultados dirían dos
--   utilidades distintas.
--
-- LAS REGLAS
--   1. NO SE DUPLICA NINGUNA REGLA. `fn_resumen_finanzas` LLAMA a las funciones de cada fase y devuelve lo que ellas dicen,
--      con sus mismas columnas (la web las lee con los mismos lectores de cada fase). Si un número del Resumen está mal, se
--      corrige en su fase y el Resumen cambia solo. Lo único nuevo es un aviso que ninguna fase calculaba: el gasto «fuera
--      de lo normal» (regla 4).
--   2. «VER» ES QUÉ SE MIRA (como el resto de Finanzas, PLAN §6 bis): CAYLA entera (nulo), una tienda o el Taller
--      (`p_ubicacion_id`), o «De la empresa» (`p_solo_empresa`).
--        · El líder ve cualquiera.
--        · Con el módulo «Reportes financieros» (sin ser líder), SU sede y nada más: pedir otra, o la empresa, es 42501.
--      Lo que es de CAYLA entera (días de caja y la semana bajo el mínimo, IGV, lo «sin cuenta») solo existe mirando CAYLA
--      entera; el cierre de mes, solo para el líder.
--   3. CADA PARTE RESPETA EL PERMISO DE SU FASE. Cada llamada va en su propio bloque: si la fase dice 42501 (ese módulo no
--      está en el rol, o es solo del líder), la parte vuelve como `{"sin_permiso": "<lo que dijo la fase>"}` y la pantalla lo
--      explica; si falla por otra cosa (una fase todavía no pegada en producción), `{"falla": …}` y la pantalla dice «no se
--      pudo leer». Una parte que no aplica a lo que se mira vuelve `{"no_aplica": true}`. Nunca un cero en lugar de un dato
--      que no se pudo leer (principio 9). Así, si mañana Felipe abre el flujo a quien tiene Reportes, el Resumen lo sigue
--      solo, sin tocar esta función.
--   4. GASTO FUERA DE LO NORMAL (`fn_gastos_fuera_de_lo_normal`, la regla del spike y de PLAN §6 bis):
--        · se agrupan los gastos vigentes por PROVEEDOR (el de su comprobante) y TIENDA («de la empresa» es una más); un
--          gasto sin comprobante que viene de un gasto fijo se agrupa por ese fijo; uno sin proveedor ni fijo (el
--          mototaxi) no se compara con nada: no tiene con qué;
--        · lo gastado con ese proveedor en el mes se compara con el PROMEDIO MENSUAL de los 6 meses anteriores, contando
--          solo los meses en que hubo gasto con él (un recibo bimestral no se vuelve «el doble»), y hacen falta al menos 2
--          de esos meses para hablar de «lo normal»;
--        · se avisa si lo del mes pasa ese promedio en más de `aviso_gasto_pct` (Configuración ▸ Caja y avisos);
--        · se mira el mes de hoy y, durante la primera semana del mes, también el anterior (el lunes 1 todavía importa
--          la luz de agosto);
--        · montos con IGV de los dos lados (lo que salió de la caja), así se comparan igual.
--   5. `ms`: cuánto tardó cada parte, en milisegundos, para ver en producción qué parte pesa si algún día el tablero se
--      pone lento.
--
-- CÓMO SE PEGA EN PRODUCCIÓN — UNA SOLA EJECUCIÓN, con el prefijo `retail.` que ya trae. Solo crea funciones de lectura y les
-- da permisos: no crea tablas, no toma ninguna tabla en exclusiva y no toca políticas ni disparadores, así que no choca con
-- la tienda ni con el Asesor de seguridad. `lock_timeout = 3s`; idempotente.
--   Antes: F2a/F2b (`gastos`, `compras.naturaleza`) y Caja y avisos (20260925103000, `fn_parametros_finanzas`). Las demás
--   fases (F3 20260925110000, F4 20260925120000, F5 20260925130000, F6 20260925160000, F8 20260925140000, F9
--   20260925180000 y Presupuesto 20260925190000) pueden estar o no: la parte que falte sale «no se pudo leer» (regla 3).
-- SE ROMPE SI: la web se publica antes (Finanzas ▸ Resumen diría «No se pudo leer el resumen»; nada más se rompe). Si esto
-- se pega primero, nada cambia: nadie lo llama todavía.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. El gasto fuera de lo normal (regla 4) ----------

create or replace function retail.fn_gastos_fuera_de_lo_normal(p_ubicacion_id uuid default null, p_solo_empresa boolean default false,
                                                               p_hoy date default null)
returns table (
  llave text, proveedor_id uuid, gasto_fijo_id uuid, proveedor text, ubicacion_id uuid, ubicacion_nombre text,
  categoria text, categoria_nombre text, mes date, monto numeric, gastos integer, promedio numeric, meses_base integer,
  exceso_pct numeric, ultimo_gasto_id uuid, ultima_fecha date, ultima_descripcion text
)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare
  v_hoy date := coalesce(p_hoy, retail.fn_hoy_lima());
  v_mes date := date_trunc('month', coalesce(p_hoy, retail.fn_hoy_lima()))::date;
  v_lider boolean := coalesce(retail.fn_es_lider(), false);
  v_ubics uuid[] := retail.fn_diario_ubicaciones();
  v_pct numeric;
begin
  if not v_lider and coalesce(cardinality(v_ubics), 0) = 0 then
    raise exception 'Ver los gastos fuera de lo normal necesita el módulo «Reportes financieros» en tu rol.' using errcode = '42501';
  end if;
  if p_ubicacion_id is not null and not (p_ubicacion_id = any (v_ubics)) then
    raise exception 'No puedes ver los gastos de esa ubicación.' using errcode = '42501';
  end if;
  if coalesce(p_solo_empresa, false) and not v_lider then
    raise exception 'Lo de la empresa lo ve el líder.' using errcode = '42501';
  end if;
  -- El umbral es el de Configuración ▸ Caja y avisos, el mismo que ve el líder.
  v_pct := coalesce((retail.fn_parametros_finanzas() ->> 'aviso_gasto_pct')::numeric, 25);

  return query
  with
  -- Los meses que se miran: el de hoy y, en la primera semana, también el anterior.
  meses as (
    select v_mes as m
    union all
    select (v_mes - interval '1 month')::date where extract(day from v_hoy) <= 7
  ),
  g as (
    select x.id, x.ubicacion_id as uid, x.categoria as cat, x.descripcion as des, x.fecha as fec, x.monto_total as monto,
           c.proveedor_id as pid, x.gasto_fijo_id as fid, x.created_at as creado,
           case when c.proveedor_id is not null then 'p:' || c.proveedor_id::text else 'f:' || x.gasto_fijo_id::text end as ll,
           date_trunc('month', x.fecha)::date as m
      from retail.gastos x
      left join retail.compras c on c.id = x.compra_id
     where x.estado = 'vigente'
       and (c.id is null or c.estado = 'vigente')
       and (c.proveedor_id is not null or x.gasto_fijo_id is not null)
       and x.fecha <= v_hoy
       and x.fecha >= (v_mes - interval '7 months')::date
       and ((x.ubicacion_id is null and v_lider) or x.ubicacion_id = any (v_ubics))
       and (p_ubicacion_id is null or x.ubicacion_id = p_ubicacion_id)
       and (not coalesce(p_solo_empresa, false) or x.ubicacion_id is null)
  ),
  por_mes as (
    select g.ll, g.uid, g.m, sum(g.monto) as monto, count(*)::integer as n from g group by g.ll, g.uid, g.m
  ),
  evaluado as (
    select a.ll, a.uid, a.m, a.monto, a.n,
           (select avg(b.monto) from por_mes b
             where b.ll = a.ll and b.uid is not distinct from a.uid
               and b.m >= (a.m - interval '6 months')::date and b.m < a.m) as prom,
           (select count(*)::integer from por_mes b
             where b.ll = a.ll and b.uid is not distinct from a.uid
               and b.m >= (a.m - interval '6 months')::date and b.m < a.m) as base
      from por_mes a
      join meses on meses.m = a.m
  )
  select e.ll, u.pid, u.fid,
         coalesce(pr.nombre, gf.descripcion, u.des),
         e.uid, coalesce(ub.nombre, 'De la empresa'),
         u.cat, coalesce(k.nombre, u.cat),
         e.m, e.monto, e.n, round(e.prom, 2), e.base,
         round((e.monto / e.prom - 1) * 100, 1),
         u.id, u.fec, u.des
    from evaluado e
    -- El último gasto del grupo en ese mes: da la categoría, la descripción y a dónde ir a revisarlo.
    cross join lateral (
      select g.id, g.pid, g.fid, g.cat, g.des, g.fec from g
       where g.ll = e.ll and g.uid is not distinct from e.uid and g.m = e.m
       order by g.fec desc, g.creado desc limit 1
    ) u
    left join retail.proveedores pr on pr.id = u.pid
    left join retail.gastos_fijos gf on gf.id = u.fid
    left join retail.ubicaciones ub on ub.id = e.uid
    left join retail.categorias_gasto k on k.codigo = u.cat
   where e.base >= 2
     and e.prom > 0
     and e.monto > e.prom * (1 + v_pct / 100)
   order by (e.monto - e.prom) desc, e.ll;
end $$;
comment on function retail.fn_gastos_fuera_de_lo_normal(uuid, boolean, date) is
  'ADR-0195 F10: los gastos del mes (y, la primera semana, del anterior) que pasan el promedio mensual de los 6 meses anteriores del mismo proveedor (o gasto fijo) y tienda en más de aviso_gasto_pct. Solo cuenta los meses con gasto y pide al menos 2. El líder, todo; con «Reportes financieros», su tienda. Solo lectura.';

-- ---------- 2. El Resumen en una lectura ----------

create or replace function retail.fn_resumen_finanzas(p_ubicacion_id uuid default null, p_solo_empresa boolean default false)
returns jsonb
language plpgsql stable security definer set search_path = retail, public, extensions as $$
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
begin
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

  -- Presupuesto · la meta de ventas del mes y los topes. Mirando CAYLA entera basta la fila de CAYLA y lo que se pasa.
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

  -- F3 · Los saldos de hoy. Una tienda: su cajón y su caja fuerte; la empresa: lo que no es de ninguna tienda.
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

  -- F4 · Lo que se debe: el total, y cada comprobante vencido o que vence en los próximos `aviso_vence_dias`.
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

  -- F6 · Las próximas 6 semanas, los días de caja y la semana bajo el mínimo: son de CAYLA entera. Sin los cobros día a día
  -- (son para Escenarios; aquí basta el total de cada semana).
  v_t0 := clock_timestamp();
  if v_todas then
    begin
      v_sec := retail.fn_flujo_caja_proyeccion(6) - 'cobros';
    exception
      when insufficient_privilege then v_sec := jsonb_build_object('sin_permiso', sqlerrm);
      when others then v_sec := jsonb_build_object('falla', sqlerrm);
    end;
  else
    v_sec := jsonb_build_object('no_aplica', true);
  end if;
  v_out := v_out || jsonb_build_object('flujo', v_sec);
  v_ms := v_ms || jsonb_build_object('flujo', round(extract(epoch from clock_timestamp() - v_t0) * 1000));

  -- F8 · El IGV del mes en curso (y el del anterior, que es el que se declara ahora) y el límite de 300 UIT.
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

  -- F5 · Campañas que empiezan en las próximas dos semanas (el veredicto lo da la regla de F5 en la web). Solo donde se
  -- vende: CAYLA entera o una tienda (el Taller y la empresa no tienen meta de ventas que subir).
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

  -- F2 · Egresos de caja sin clasificar (siempre son de una caja, así que no aplican a «De la empresa»).
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

  -- F2b · Gastos fijos que ya debieron llegar este mes y no se registraron.
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

  -- F10 · Gastos fuera de lo normal (regla 4).
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

  -- F9 · El mes anterior: qué unidades ya se cerraron. El cierre es solo del líder (el módulo no se delega). No se llama a
  -- `fn_cierre_mes_estado` (recorre el diario del mes entero): basta saber qué está cerrado.
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

  -- F3 · Lo que este mes movió plata sin decir de qué cuenta (no suma en ningún saldo). Es de CAYLA entera.
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

  return v_out || jsonb_build_object('ms', v_ms);
end $$;
comment on function retail.fn_resumen_finanzas(uuid, boolean) is
  'ADR-0195 F10: Finanzas ▸ Resumen en una lectura. Llama a las funciones de cada fase (F2b, F3, F4, F5, F6, F8, F9, Presupuesto) y devuelve lo que dicen, con sus columnas; cada parte respeta el permiso de su fase ({"sin_permiso"}), dice si falló ({"falla"}) o si no aplica a lo que se mira ({"no_aplica"}). El líder: CAYLA entera, una ubicación o la empresa; con «Reportes financieros», su sede. Solo lectura.';

-- ---------- 3. Permisos ----------
-- Las dos lecturas: `authenticated` (el permiso se pregunta adentro). `anon`, nada.
revoke all on function retail.fn_gastos_fuera_de_lo_normal(uuid, boolean, date) from public, anon;
grant execute on function retail.fn_gastos_fuera_de_lo_normal(uuid, boolean, date) to authenticated;
revoke all on function retail.fn_resumen_finanzas(uuid, boolean) from public, anon;
grant execute on function retail.fn_resumen_finanzas(uuid, boolean) to authenticated;

reset lock_timeout;
