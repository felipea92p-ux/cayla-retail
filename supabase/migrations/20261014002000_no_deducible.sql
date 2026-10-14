-- Lo «no deducible», fase 6 · actividad 6 (ADR-0362, decisiones 55, 56, 57, 68 y 70).
--
-- EL PROBLEMA PRIMERO. Quien viaja a comprar paga en efectivo o con la plata de su fondo, y a veces son comprobantes grandes. La ley de la
-- bancarización (Ley 28194) dice que un comprobante de S/ 2 000 o más se paga por el banco: lo que se paga en efectivo no cuenta como gasto
-- para la renta y su IGV no se usa como crédito. Felipe decidió dejarlo pagar igual, pero marcado «no deducible» y con aviso (decisiones 56 y
-- 70: se mira el total del comprobante; el efectivo y todo lo que sale de un fondo, el Yape personal incluido, decisión 57). Y la planilla de
-- movilidad (taxi y cargador sin comprobante, decisión 55) tiene un tope diario por persona que fija el contador: lo que pase el tope se deja
-- y se marca igual (decisión 68). Sin una regla en la base, cada pantalla lo calcularía a su manera, y el contador recibiría números
-- distintos según dónde mire.
--
-- QUÉ CREA
--   1. El tope diario de la planilla de movilidad es un parámetro tributario más (`parametros_tributarios`, 'tope_planilla_movilidad'),
--      con vigencias como la tasa de IGV: rige desde la fecha que diga el contador, no solo desde el 1 de enero (la remuneración mínima
--      cambia cualquier mes). SIN FILA NO HAY TOPE (Felipe 2026-10-13: «sin tope hasta el contador»). Se guarda desde Configuración ▸
--      Impuestos con `guardar_parametro_tributario`, que aprende el nombre nuevo por reemplazos anclados.
--   2. `fn_pago_no_bancarizado(total, medio, tipo de cuenta)`: LA regla de la bancarización, en un solo lugar. La web la repite para el
--      aviso al pagar (`lib/no-deducible-reglas.ts`), con las mismas pruebas.
--   3. `fn_no_deducibles_de(claves)`: por cada fila del libro de dinero que se le pregunte (`pago:…` de un comprobante de proveedor,
--      `pagoprod:…` del Taller, `gasto:…` de un gasto del viaje), si es no deducible, por qué (`bancarizacion` o `planilla_tope`) y cuánto.
--      Es la pieza que usarán Impuestos y el Diario (actividad 7). Interna: no se llama desde la web.
--   4. `fn_no_deducibles(claves)`: la misma respuesta para la web (la rendición, «Traerla costó», el detalle de un comprobante), para quien
--      ve un módulo donde se ve esa plata o tiene su propio fondo.
--
-- LA REGLA, EN PALABRAS
--   · Bancarización: el comprobante (su total, aunque se pague en partes) es de S/ 2 000 o más, y ESTE pago es en efectivo o sale de un
--     fondo → este pago entero es no deducible. Lo pagado por transferencia, depósito, tarjeta o el Yape de CAYLA sí cuenta.
--   · Planilla de movilidad: con tope vigente en la fecha del gasto, se suman las planillas de la misma persona (quien registró) en el
--     mismo día, en el orden en que se anotaron; lo que pasa el tope es no deducible (la primera que lo cruza, en parte; las que siguen,
--     enteras). Un gasto que además cae en la bancarización es no deducible entero.
--
-- DESCARTÉ
--   · Guardar la marca en el pago (una columna `no_deducible`): es un dato derivado que se desincroniza en cuanto el contador fija el tope o
--     se anula una planilla del mismo día. Se calcula cada vez; es poco y está indexado.
--   · El umbral de S/ 2 000 como parámetro tributario: cambió una vez desde 2004 (de S/ 3 500 a S/ 2 000, D. Leg. 1529, abril de 2022). Si
--     vuelve a cambiar, son dos líneas: esta función y `UMBRAL_BANCARIZACION` en la web.
--   · Frenar el pago: Felipe eligió dejarlo pasar con aviso (decisión 56).
--   · Marcar los gastos SIN comprobante de Finanzas ▸ Gastos: ya no tienen papel que los sustente; la bancarización mira comprobantes. Los
--     gastos del viaje sí: guardan su papel (boleta, factura, ticket o planilla).
--   · Quitar el IGV de lo no deducible del crédito fiscal aquí: es la actividad 7, junto con el Diario y la conciliación, para que los tres
--     cuenten igual.
--
-- SE ROMPE SI
--   · Alguien pinta «no deducible» en la web con su propia cuenta en vez de preguntar a `fn_no_deducibles`: el contador vería dos números.
--   · Se anota una planilla con `registrado_por` de otra persona (el tope es por persona y por día).
--
-- CÓMO SE PEGA EN PRODUCCIÓN (autorización de Felipe para la fase 6). Una sola parte, después de 20261013235000: cambia tres restricciones
-- de `parametros_tributarios` (cinco filas: el `alter` es instantáneo) y crea funciones. SIN políticas ni `drop trigger` (ADR-0195) y sin
-- `select … into` dentro de textos entre comillas (ADR-0288). Los reemplazos anclados abortan sin cambiar nada si la función viva cambió.
-- Idempotente.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- Reemplaza un texto en la definición VIVA de una función, solo si aparece las veces esperadas; si ya está reemplazado, no hace nada.
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
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ---------- 1. El tope de la planilla de movilidad, un parámetro tributario con vigencias ----------
alter table retail.parametros_tributarios
  drop constraint if exists parametros_tributarios_nombre_check,
  add constraint parametros_tributarios_nombre_check
    check (nombre in ('igv', 'uit', 'umbral_uit', 'renta_pago_cuenta', 'regimen', 'tope_planilla_movilidad')),
  -- Como la tasa de IGV, el tope rige desde cualquier fecha (la remuneración mínima cambia cualquier mes); lo demás, desde el 1 de enero.
  drop constraint if exists parametros_tributarios_anual,
  add constraint parametros_tributarios_anual
    check (nombre in ('igv', 'tope_planilla_movilidad') or (extract(month from vigente_desde) = 1 and extract(day from vigente_desde) = 1)),
  drop constraint if exists parametros_tributarios_valor_coherente,
  add constraint parametros_tributarios_valor_coherente check (
    case nombre
      when 'regimen' then valor is null and texto in ('rmt', 'general', 'rer', 'nrus')
      when 'igv' then texto is null and valor > 0 and valor < 1
      when 'renta_pago_cuenta' then texto is null and valor >= 0 and valor < 1
      when 'uit' then texto is null and valor >= 1000 and valor <= 100000
      when 'umbral_uit' then texto is null and valor > 0 and valor <= 100000
      -- Soles por persona y por día (SUNAT: el 4 % de la remuneración mínima vital; lo confirma el contador).
      when 'tope_planilla_movilidad' then texto is null and valor > 0 and valor <= 1000
      else false
    end);

select pg_temp.reemplazar('retail.guardar_parametro_tributario(text,date,numeric,text)',
  $v$p_nombre not in ('igv', 'uit', 'umbral_uit', 'renta_pago_cuenta', 'regimen')$v$,
  $n$p_nombre not in ('igv', 'uit', 'umbral_uit', 'renta_pago_cuenta', 'regimen', 'tope_planilla_movilidad')$n$, 1);
select pg_temp.reemplazar('retail.guardar_parametro_tributario(text,date,numeric,text)',
  $v$if p_nombre <> 'igv' and (extract(month from p_vigente_desde)$v$,
  $n$if p_nombre not in ('igv', 'tope_planilla_movilidad') and (extract(month from p_vigente_desde)$n$, 1);
select pg_temp.reemplazar('retail.guardar_parametro_tributario(text,date,numeric,text)',
  $v$
  v_actor := retail.fn_actor_persona_id(true);$v$,
  $n$
  -- ADR-0362 (fase 6 · actividad 6, decisión 68): el tope diario de la planilla de movilidad, en soles por persona y por día.
  if p_nombre = 'tope_planilla_movilidad' and (v_valor is null or v_valor <= 0 or v_valor > 1000) then
    raise exception 'El tope de la planilla de movilidad va en soles por persona y por día (45.20), mayor que cero y hasta 1,000.'
      using errcode = 'P0001';
  end if;

  v_actor := retail.fn_actor_persona_id(true);$n$, 1);

-- ---------- 2. La regla de la bancarización ----------
-- Decisiones 56, 57 y 70: un pago es no deducible si su comprobante es de S/ 2 000 o más (el total, aunque se pague en partes) y el pago es
-- en efectivo o sale de un fondo por rendir (sea cual sea el medio: el Yape personal de quien compra no es bancarización de CAYLA).
-- La misma regla vive en la web para el aviso al pagar (`lib/no-deducible-reglas.ts`, `pagoNoBancarizado`).
create or replace function retail.fn_pago_no_bancarizado(p_total numeric, p_medio text, p_tipo_cuenta text)
returns boolean
language sql immutable set search_path = retail, public, extensions as $$
  select coalesce(p_total, 0) >= 2000 and (coalesce(p_medio, '') = 'efectivo' or coalesce(p_tipo_cuenta, '') = 'fondo');
$$;
comment on function retail.fn_pago_no_bancarizado(numeric, text, text) is
  'ADR-0362 fase 6 (decisiones 56, 57 y 70): un pago de un comprobante de S/ 2 000 o más, en efectivo o desde un fondo, es no deducible (bancarización, Ley 28194). Su espejo en la web: pagoNoBancarizado.';

-- ---------- 3. Lo no deducible de cada fila del libro ----------
create or replace function retail.fn_no_deducibles_de(p_claves text[])
returns table (clave text, motivo text, monto numeric, total numeric, tope numeric)
language sql stable set search_path = retail, public, extensions as $$
  with c as (
    -- Las claves del libro: «pago:<id>», «pagoprod:<id>» o «gasto:<id>». Una clave de otro tipo, o con un id que no es un uuid, no responde.
    select distinct x as clave, split_part(x, ':', 1) as origen,
           case when split_part(x, ':', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then split_part(x, ':', 2)::uuid end as id
      from unnest(coalesce(p_claves, '{}'::text[])) x
  ),
  gastos as (
    select c.clave, g.id, g.monto_total, g.medio_pago, cu.tipo as tipo_cuenta, gv.papel, g.fecha, g.registrado_por
      from c
      join retail.gastos g on g.id = c.id and g.estado = 'vigente'
      join retail.gastos_viaje gv on gv.gasto_id = g.id
      left join retail.cuentas_dinero cu on cu.id = g.cuenta_dinero_id
     where c.origen = 'gasto'
  ),
  -- La planilla: todas las de la misma persona y el mismo día (no solo las preguntadas), en el orden en que se anotaron.
  planilla as (
    select g.id,
           sum(g.monto_total) over (partition by g.registrado_por, g.fecha order by g.created_at, g.id) as acumulado,
           sum(g.monto_total) over (partition by g.registrado_por, g.fecha) as del_dia,
           (select t.valor from retail.fn_parametro_tributario('tope_planilla_movilidad', g.fecha) t) as tope
      from (select distinct x.registrado_por, x.fecha from gastos x where x.papel = 'planilla_movilidad') d
      join retail.gastos g on g.registrado_por is not distinct from d.registrado_por and g.fecha = d.fecha and g.estado = 'vigente'
      join retail.gastos_viaje gv on gv.gasto_id = g.id and gv.papel = 'planilla_movilidad'
  )
  select c.clave, 'bancarizacion'::text, cp.monto::numeric, co.total::numeric, 2000::numeric
    from c
    join retail.compra_pagos cp on cp.id = c.id
    join retail.compras co on co.id = cp.compra_id
    left join retail.cuentas_dinero cu on cu.id = cp.cuenta_dinero_id
   where c.origen = 'pago' and retail.fn_pago_no_bancarizado(co.total, cp.metodo, cu.tipo)
  union all
  select c.clave, 'bancarizacion', pp.monto::numeric, co.total::numeric, 2000::numeric
    from c
    join retail.comprobantes_produccion_pagos pp on pp.id = c.id
    join retail.comprobantes_produccion co on co.id = pp.comprobante_id
    left join retail.cuentas_dinero cu on cu.id = pp.cuenta_dinero_id
   where c.origen = 'pagoprod' and retail.fn_pago_no_bancarizado(co.total, pp.metodo, cu.tipo)
  union all
  select g.clave,
         case when retail.fn_pago_no_bancarizado(g.monto_total, g.medio_pago, g.tipo_cuenta) then 'bancarizacion' else 'planilla_tope' end,
         case when retail.fn_pago_no_bancarizado(g.monto_total, g.medio_pago, g.tipo_cuenta) then g.monto_total
              else least(g.monto_total, pl.acumulado - pl.tope) end,
         case when retail.fn_pago_no_bancarizado(g.monto_total, g.medio_pago, g.tipo_cuenta) then g.monto_total else pl.del_dia end,
         case when retail.fn_pago_no_bancarizado(g.monto_total, g.medio_pago, g.tipo_cuenta) then 2000::numeric else pl.tope end
    from gastos g
    left join planilla pl on pl.id = g.id
   where retail.fn_pago_no_bancarizado(g.monto_total, g.medio_pago, g.tipo_cuenta)
      or (pl.tope is not null and pl.acumulado > pl.tope);
$$;
comment on function retail.fn_no_deducibles_de(text[]) is
  'ADR-0362 fase 6 · actividad 6: de las filas del libro de dinero que se le pasan (pago:, pagoprod:, gasto:), las no deducibles, por qué (bancarizacion | planilla_tope), cuánto, el total que se miró y el tope. Interna: la usan fn_no_deducibles y, desde la actividad 7, Impuestos y el Diario.';

-- ---------- 4. La lectura de la web ----------
create or replace function retail.fn_no_deducibles(p_claves text[])
returns table (clave text, motivo text, monto numeric, total numeric, tope numeric)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
begin
  -- Producción no está: ninguna pantalla del Taller muestra todavía la marca, y pedir aquí su módulo lo haría pasar por protegido
  -- en `pruebas:roles-cobertura` sin que lo estén sus funciones de abrir y cerrar producción.
  if not (retail.fn_ve_modulo('ordenes_compra') or retail.fn_ve_modulo('fondos') or retail.fn_ve_modulo('facturas_compra')
          or retail.fn_ve_modulo('por_pagar') or retail.fn_ve_modulo('gastos') or retail.fn_ve_modulo('cuentas_dinero')
          or retail.fn_ve_modulo('impuestos') or retail.fn_mi_fondo_cuenta() is not null) then
    raise exception 'Ver lo no deducible necesita un módulo de Compras o de Finanzas en tu rol, o tener un fondo.' using errcode = '42501';
  end if;
  if cardinality(coalesce(p_claves, '{}'::text[])) > 1000 then
    raise exception 'Se preguntan 1,000 filas como máximo.' using errcode = 'P0001';
  end if;
  return query select d.clave, d.motivo, d.monto, d.total, d.tope from retail.fn_no_deducibles_de(p_claves) d;
end $$;
comment on function retail.fn_no_deducibles(text[]) is
  'ADR-0362 fase 6 · actividad 6: lo no deducible de las filas del libro que se le pasan, para la web (la rendición, «Traerla costó», el detalle de un comprobante). Solo responde lo que es no deducible.';

revoke all on function retail.fn_pago_no_bancarizado(numeric, text, text) from public, anon, authenticated;
revoke all on function retail.fn_no_deducibles_de(text[]) from public, anon, authenticated;
revoke all on function retail.fn_no_deducibles(text[]) from public, anon;
grant execute on function retail.fn_no_deducibles(text[]) to authenticated, service_role;

reset lock_timeout;
