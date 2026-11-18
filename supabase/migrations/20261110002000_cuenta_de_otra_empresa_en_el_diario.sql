-- ============================================================================
-- 20261110002000 — Lo que cayó en una cuenta de otra empresa, afuera del Diario de CAYLA (ADR-0638, actividad 2 de Lima, parte 2 de 3)
--
-- EL PROBLEMA PRIMERO. El Diario (`fn_asientos`) asienta cada cobro por su medio: un Yape es 104 al debe, sea cual sea la cuenta. Si ese Yape cayó en el número de Claudia, el libro ya
-- no lo cuenta (parte 1), pero el Diario seguiría poniéndolo en la 104: el Balance diría que CAYLA tiene plata que nunca tuvo y su comprobación contra los bancos se separaría.
-- Tocar el cuerpo grande de `fn_asientos` (36 mil caracteres, muchas suites con huella) no hace falta: un contraasiento en `fn_asientos_claure`, que es propia de CLAURE, hace lo mismo.
--
-- QUÉ PROMETE. Cada cobro en una cuenta de otra empresa (venta, abono de apartado, diferencia de un cambio) y su reverso (anulación, adelanto devuelto, reembolso) genera un asiento
-- `claure_fuera` que cuadra solo: 479 al debe (Claudia ya tiene esa plata: baja lo que se le debe) y la cuenta del medio al haber (esa plata no entró a CAYLA). La 104 queda como si
-- ese cobro nunca hubiera pasado por CAYLA, y el Diario sigue cuadrado. Mientras la cuenta no exista o esté vacía, `fn_claure_fuera` no devuelve filas y el Diario da idéntico.
--   · `fn_claure_fuera`: lo que entró o salió de una cuenta ajena, de cualquier marca (la cuenta manda, no el dueño de la prenda). Interna: ni `anon` ni `authenticated`.
--   · `fn_cuentas_de_otras_empresas`: lo que ve la web (id, nombre, empresa, cobrado este mes, cobrado en total, último cobro), con el candado de `fn_claure_cuenta`.
--
-- QUÉ NO PROMETE. No cambia cuánto dice la pantalla que se le debe a Claudia (actividad 4), ni el IGV o la comisión de lo suyo (actividades 4 y 6), ni a qué cuenta se sella un Yape nuevo (actividad 3).
-- Hasta la actividad 4, la 479 baja por `claure_fuera` y la pantalla CLAURE no se entera: con la cuenta vacía no hay diferencia posible.
--
-- DECIDÍ derivar `claure_fuera` de los cobros sellados, no del libro: el libro ya no trae esas líneas, y `medios_de_cobro` sigue en BCP, así que una línea ajena solo existe si está sellada.
-- DECIDÍ sumar `cuenta_id` a lo que devuelve `fn_claure_fuera` para que cada cuenta ajena diga lo suyo.
-- DESCARTÉ excluir los cobros ajenos dentro de `fn_asientos`: mueve muchas huellas y un contraasiento es local y cuadra solo.
-- SE ROMPE SI la parte 3 (la cuenta) se pega antes que esta: la plata sale del libro y sigue en la 104.
-- SE ROMPE SI aparece una marca nueva con cuenta propia: `fn_claure_fuera` la tomaría como de Claudia. Hoy solo existe CLAURE y la 479 es suya.
--
-- CÓMO VERIFICAR. Después de pegar, las mismas cinco huellas de 20261110001000 tienen que salir iguales, y:
--   select count(*) from retail.fn_claure_fuera(date '2026-10-01', retail.fn_hoy_lima(), true, null);   → 0
--   select count(*) from retail.cuentas_dinero where empresa_id <> retail.fn_empresa_casa_id();          → 0
-- CÓMO SE PEGA. Una sola parte: dos funciones nuevas y un reemplazo anclado, en ese orden. Se puede pegar dos veces.
-- VOLVER ATRÁS. El reemplazo al revés; las funciones nuevas se quedan sin llamador.
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
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ---------- 1. Lo que entró o salió de una cuenta de otra empresa ----------
-- `monto` > 0: ella tiene más; < 0: devolvió. Un apartado cuenta el día del abono, igual que el Diario (el derecho de Claudia nace con la entrega; eso es de la actividad 4).
create or replace function retail.fn_claure_fuera(p_desde date, p_hasta date, p_todo boolean, p_ubics uuid[])
returns table (fecha date, ubicacion_id uuid, ot text, origen_id uuid, clave text, medio text, monto numeric, cuenta_id uuid)
language sql
stable
security definer
set search_path = retail, public, extensions
as $f$
  with aj as materialized (select c.id from retail.cuentas_dinero c where c.empresa_id <> retail.fn_empresa_casa_id()),
  r as (select (p_desde::timestamp at time zone 'America/Lima') as ini, ((p_hasta + 1)::timestamp at time zone 'America/Lima') as fin)
  -- El cobro de una venta, el día de la venta (también la luego anulada: la anulación va en su día, como en fn_asientos).
  select (v.created_at at time zone 'America/Lima')::date, v.ubicacion_id, 'ventas'::text, v.id, 'venta:' || vp.id, vp.metodo, vp.monto, vp.cuenta_dinero_id
    from retail.venta_pagos vp join retail.ventas v on v.id = vp.venta_id, r
   where vp.cuenta_dinero_id in (select aj.id from aj) and v.created_at >= r.ini and v.created_at < r.fin and not coalesce(v.es_prueba, false) and (p_todo or v.ubicacion_id = any (p_ubics))
  union all  -- Su anulación.
  select (v.anulado_en at time zone 'America/Lima')::date, v.ubicacion_id, 'ventas', v.id, 'anulacion:' || vp.id, vp.metodo, -vp.monto, vp.cuenta_dinero_id
    from retail.venta_pagos vp join retail.ventas v on v.id = vp.venta_id, r
   where v.estado = 'anulada' and vp.cuenta_dinero_id in (select aj.id from aj) and v.anulado_en >= r.ini and v.anulado_en < r.fin and not coalesce(v.es_prueba, false) and (p_todo or v.ubicacion_id = any (p_ubics))
  union all  -- El abono de un apartado, el día del abono.
  select (sp.created_at at time zone 'America/Lima')::date, s.ubicacion_id, 'separaciones', s.id, 'abono:' || sp.id, sp.metodo, sp.monto, sp.cuenta_dinero_id
    from retail.separacion_pagos sp join retail.separaciones s on s.id = sp.separacion_id, r
   where sp.cuenta_dinero_id in (select aj.id from aj) and sp.created_at >= r.ini and sp.created_at < r.fin and (p_todo or s.ubicacion_id = any (p_ubics))
  union all  -- El adelanto devuelto.
  select (s.devuelta_en at time zone 'America/Lima')::date, s.ubicacion_id, 'separaciones', s.id, 'adelanto:' || s.id, s.devolucion_medio_real, -s.adelanto, s.devolucion_cuenta_id
    from retail.separaciones s, r
   where s.estado = 'devuelta' and s.devolucion_cuenta_id in (select aj.id from aj) and s.devuelta_en >= r.ini and s.devuelta_en < r.fin and (p_todo or s.ubicacion_id = any (p_ubics))
  union all  -- La diferencia de un cambio, ya con su signo.
  select (c.created_at at time zone 'America/Lima')::date, c.ubicacion_id, 'cambios', c.id, 'cambio:' || c.id, c.metodo_pago_diferencia, c.diferencia, c.cuenta_dinero_id
    from retail.cambios c, r
   where c.cuenta_dinero_id in (select aj.id from aj) and c.diferencia <> 0 and c.created_at >= r.ini and c.created_at < r.fin and (p_todo or c.ubicacion_id = any (p_ubics))
  union all  -- El reembolso de una devolución.
  select (d.aprobado_en at time zone 'America/Lima')::date, d.ubicacion_id, 'devoluciones', d.id, 'devolucion:' || d.id, d.reembolso_metodo, -d.reembolso_monto, d.reembolso_cuenta_id
    from retail.devoluciones d, r
   where d.estado = 'aprobada' and d.reembolso_cuenta_id in (select aj.id from aj) and d.aprobado_en >= r.ini and d.aprobado_en < r.fin and (p_todo or d.ubicacion_id = any (p_ubics));
$f$;
comment on function retail.fn_claure_fuera(date, date, boolean, uuid[]) is
  'ADR-0638. Lo que entró o salió de una cuenta de otra empresa, de cualquier marca (la cuenta manda). Alimenta el asiento claure_fuera y fn_cuentas_de_otras_empresas. Interna.';
revoke all on function retail.fn_claure_fuera(date, date, boolean, uuid[]) from public, anon, authenticated;

-- ---------- 2. Lo que ve la web ----------
create or replace function retail.fn_cuentas_de_otras_empresas()
returns table (id uuid, nombre text, empresa text, cobrado_mes numeric, cobrado_total numeric, ultimo_cobro date)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $f$
#variable_conflict use_column
declare
  v_ubics uuid[] := retail.fn_cuentas_dinero_ubicaciones();
  v_hoy date := retail.fn_hoy_lima();
begin
  -- El mismo candado de fn_claure_cuenta: el líder, o quien tiene Cuentas y dinero, y cada quien solo lo de su sede.
  if not retail.fn_es_lider() and coalesce(cardinality(v_ubics), 0) = 0 then
    raise exception 'Ver la cuenta con CLAURE necesita el módulo Cuentas y dinero en tu rol.' using errcode = '42501';
  end if;
  return query
  with z as materialized (
    select f.cuenta_id, f.fecha, f.monto from retail.fn_claure_fuera(date '2000-01-01', v_hoy, false, v_ubics) f
  )
  select c.id, c.nombre, e.nombre,
         coalesce((select sum(z.monto) from z where z.cuenta_id = c.id and z.fecha >= date_trunc('month', v_hoy)::date), 0)::numeric,
         coalesce((select sum(z.monto) from z where z.cuenta_id = c.id), 0)::numeric,
         (select max(z.fecha) from z where z.cuenta_id = c.id and z.monto > 0)
    from retail.cuentas_dinero c
    join retail.empresas e on e.id = c.empresa_id
   where c.empresa_id <> retail.fn_empresa_casa_id()
     and c.archivada_en is null
     and exists (select 1 from retail.empresa_sedes es where es.empresa_id = c.empresa_id and es.ubicacion_id = any (v_ubics))
   order by c.orden, c.nombre;
end;
$f$;
comment on function retail.fn_cuentas_de_otras_empresas() is
  'ADR-0638. Las cuentas de otra empresa, para mostrarlas aparte («De CLAURE, no suma»): lo cobrado este mes, en total y el último cobro. La usan Finanzas y Configuración.';
revoke all on function retail.fn_cuentas_de_otras_empresas() from public, anon;
grant execute on function retail.fn_cuentas_de_otras_empresas() to authenticated;

-- ---------- 3. El Diario: el asiento que saca esa plata de la 104 ----------
select pg_temp.reemplazar('retail.fn_asientos_claure(date, date, boolean, uuid[])',
$v$else p_ubics end) k where k.base < 0;$v$,
$n$else p_ubics end) k where k.base < 0
  -- ADR-0638: lo que cayó en una cuenta de otra empresa (el Yape de Claudia) no entró a CAYLA. El cuerpo grande de fn_asientos lo asentó por su medio; aquí se cancela exacto: 479 al debe y la cuenta del medio al haber.
  union all
  select z.fecha, z.ubicacion_id, 'claure_fuera:' || z.clave, 'claure_fuera', '479', greatest(z.monto, 0), greatest(-z.monto, 0), z.ot, z.origen_id, 'Lo tiene Claudia en su Yape: baja lo que se le debe'
    from retail.fn_claure_fuera(p_desde, p_hasta, p_todo, p_ubics) z
  union all
  select z.fecha, z.ubicacion_id, 'claure_fuera:' || z.clave, 'claure_fuera', retail.fn_asiento_cuenta_de_medio(z.medio, 'entra'), greatest(-z.monto, 0), greatest(z.monto, 0), z.ot, z.origen_id, 'Esa plata no entró a CAYLA'
    from retail.fn_claure_fuera(p_desde, p_hasta, p_todo, p_ubics) z;$n$,
1);

do $comprobar$
begin
  if not exists (select 1 from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'fn_asientos_claure' and p.prosrc like '%claure_fuera%') then
    raise exception 'El Diario no quedó con claure_fuera.';
  end if;
end
$comprobar$;
select 'QUEDÓ BIEN' as resultado;
