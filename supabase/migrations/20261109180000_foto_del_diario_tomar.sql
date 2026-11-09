-- ============================================================================
-- 20261109180000 — La foto del diario, parte 1: se puede tomar la foto de un mes (ADR-0633)
--
-- EL PROBLEMA PRIMERO. El diario (`fn_asientos`) se arma de cero cada vez que alguien lo mira; con ningún mes cerrado, Finanzas ▸ Resumen
-- lo arma cuatro veces por carga y empujó la base de producción a usar swap (2026-11-09). ADR-0633: cada mes que ya terminó se guarda
-- calculado (la «foto») y se lee guardado mientras nada suyo cambie.
--
-- LO QUE HACE ESTA PARTE (todavía no cambia nada que alguien vea: nadie lee la foto hasta la parte siguiente, y con su interruptor apagado):
--   1. `diario_fotos` y `diario_foto_lineas`: la foto de cada mes, con TODAS las unidades y la planilla, su huella (la misma de lo congelado:
--      `fn_diario_linea_texto`) y la huella de lo que se leyó de Dynamic para ese mes. RLS encendido y sin políticas: solo las leen funciones
--      `security definer`. Es una COPIA derivada, no un dato: rehacerla borra las líneas de ese mes y las vuelve a escribir.
--   2. `fn_asientos` y `fn_planilla_periodos` dejan ver todo a la llave de servicio (el trabajo que toma la foto; mismo patrón que
--      `fn_tomar_comprobantes_para_reintento`): la foto es de la empresa entera. Para cualquier otra cuenta, nada cambia.
--   3. `fn_huella_planilla_mes(mes)`: la huella de lo que Dynamic dice de la planilla de ese mes (2 ms en producción). Sin Dynamic, una fija.
--   4. `tomar_foto_diario(mes)`: SOLO la llave de servicio; solo un mes que ya terminó.
--
-- ANTES DE PEGAR. Una sola parte: tablas nuevas (sin políticas: no toman las tablas de `auth`/`storage`), funciones y dos reemplazos
-- anclados (`create or replace function`). Idempotente: se puede pegar dos veces. Termina con «QUEDÓ BIEN».
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

create table if not exists retail.diario_fotos (
  mes date primary key check (mes = date_trunc('month', mes)::date),
  tomada_en timestamptz not null default now(),
  lineas integer not null,
  huella text not null,
  huella_planilla text not null
);
comment on table retail.diario_fotos is
  'ADR-0633: la foto del diario de un mes que ya terminó (todas las unidades, con la planilla). Copia derivada de fn_asientos: se rehace, no se edita a mano.';

create table if not exists retail.diario_foto_lineas (
  mes date not null references retail.diario_fotos (mes) on delete cascade deferrable initially deferred,
  fecha date not null,
  ubicacion_id uuid,
  asiento text not null,
  regla text not null,
  cuenta text not null,
  debe numeric not null,
  haber numeric not null,
  origen_tabla text,
  origen_id uuid,
  glosa text
);
create index if not exists diario_foto_lineas_mes_idx on retail.diario_foto_lineas (mes, fecha);
comment on table retail.diario_foto_lineas is 'ADR-0633: las líneas de la foto de cada mes, con las mismas columnas que fn_asientos.';

alter table retail.diario_fotos enable row level security;
alter table retail.diario_foto_lineas enable row level security;
revoke all on retail.diario_fotos, retail.diario_foto_lineas from public, anon, authenticated;

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

-- La llave de servicio (el trabajo que toma la foto, ADR-0633) ve todo el diario: la foto es de la empresa entera.
select pg_temp.reemplazar('retail.fn_asientos(date,date,uuid)',
$a$  v_lider boolean := retail.fn_ve_diario_de_todo();$a$,
$n$  -- ADR-0633: la llave de servicio (el trabajo que toma la foto del diario) ve todo; para cualquier otra cuenta, lo de siempre.
  v_lider boolean := retail.fn_ve_diario_de_todo() or auth.role() is not distinct from 'service_role';$n$, 1);

-- ...y la planilla, que la foto guarda siempre: al leerla, solo la ve quien la ve en Dynamic (como lo congelado).
select pg_temp.reemplazar('retail.fn_planilla_periodos(date,date)',
$a$  if not retail.fn_planilla_visible() then$a$,
$n$  -- ADR-0633: la llave de servicio la incluye en la foto del diario (si Dynamic está); al leerla, `fn_diario` la muestra solo a quien la ve.
  if not (retail.fn_planilla_visible()
          or (auth.role() is not distinct from 'service_role' and to_regclass('retail.planilla_por_sede') is not null)) then$n$, 1);

grant execute on function retail.fn_asientos(date, date, uuid) to service_role;
grant execute on function retail.fn_planilla_periodos(date, date) to service_role;

-- Lo que Dynamic dice de la planilla de un mes (los períodos que terminan en él), en una huella: si cambia, la foto de ese mes ya no vale.
create or replace function retail.fn_huella_planilla_mes(p_mes date)
returns text
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_huella text;
begin
  if to_regclass('retail.planilla_por_sede') is null then
    return 'sin-dynamic';
  end if;
  execute $q$
    select md5(coalesce(string_agg(concat_ws('|', p.sede_codigo, p.periodo_id, p.fecha_ini, p.fecha_fin, p.personas, p.costo_total), ','
                                   order by p.periodo_id, p.sede_codigo), ''))
      from retail.planilla_por_sede p
     where p.fecha_fin between $1 and ($1 + interval '1 month - 1 day')::date
  $q$ into v_huella using date_trunc('month', p_mes)::date;
  return v_huella;
end;
$$;
comment on function retail.fn_huella_planilla_mes(date) is 'ADR-0633: la huella de la planilla de Dynamic de un mes, para saber si la foto del diario sigue valiendo.';
revoke all on function retail.fn_huella_planilla_mes(date) from public, anon, authenticated;

-- Tomar (o rehacer) la foto de un mes. Solo la llave de servicio; solo un mes que ya terminó.
create or replace function retail.tomar_foto_diario(p_mes date)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_mes date := date_trunc('month', p_mes)::date;
  v_fin date := (date_trunc('month', p_mes) + interval '1 month - 1 day')::date;
  v_n integer;
  v_huella text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'La foto del diario la toma solo el trabajo programado.' using errcode = '42501';
  end if;
  if p_mes is null or v_mes >= date_trunc('month', retail.fn_hoy_lima())::date then
    raise exception 'El mes % todavía no termina: no se le toma foto.', coalesce(to_char(v_mes, 'YYYY-MM'), '(vacío)') using errcode = 'P0001';
  end if;
  -- Es una copia derivada (no un dato del negocio): se reemplaza entera.
  delete from retail.diario_foto_lineas where mes = v_mes;
  insert into retail.diario_foto_lineas (mes, fecha, ubicacion_id, asiento, regla, cuenta, debe, haber, origen_tabla, origen_id, glosa)
  select v_mes, a.fecha, a.ubicacion_id, a.asiento, a.regla, a.cuenta, a.debe, a.haber, a.origen_tabla, a.origen_id, a.glosa
    from retail.fn_asientos(v_mes, v_fin, null) a;
  get diagnostics v_n = row_count;
  v_huella := (select encode(sha256(convert_to(coalesce(string_agg(t, E'\n' order by t), ''), 'UTF8')), 'hex')
                 from (select retail.fn_diario_linea_texto(l.fecha, l.ubicacion_id, l.asiento, l.regla, l.cuenta, l.debe, l.haber,
                                                          l.origen_tabla, l.origen_id, l.glosa) t
                         from retail.diario_foto_lineas l where l.mes = v_mes) x);
  insert into retail.diario_fotos (mes, tomada_en, lineas, huella, huella_planilla)
  values (v_mes, now(), v_n, v_huella, retail.fn_huella_planilla_mes(v_mes))
  on conflict (mes) do update set tomada_en = excluded.tomada_en, lineas = excluded.lineas, huella = excluded.huella,
                                  huella_planilla = excluded.huella_planilla;
  return jsonb_build_object('mes', to_char(v_mes, 'YYYY-MM'), 'lineas', v_n, 'huella', v_huella);
end;
$$;
comment on function retail.tomar_foto_diario(date) is
  'ADR-0633: toma (o rehace) la foto del diario de un mes que ya terminó, con todas las unidades y la planilla. Solo la llave de servicio.';
revoke all on function retail.tomar_foto_diario(date) from public, anon, authenticated;
grant execute on function retail.tomar_foto_diario(date) to service_role;

do $comprobar$
begin
  if position('auth.role() is not distinct from ''service_role''' in pg_get_functiondef('retail.fn_asientos(date,date,uuid)'::regprocedure)) = 0
     or position('auth.role() is not distinct from ''service_role''' in pg_get_functiondef('retail.fn_planilla_periodos(date,date)'::regprocedure)) = 0
     or to_regprocedure('retail.tomar_foto_diario(date)') is null
     or has_function_privilege('authenticated', 'retail.tomar_foto_diario(date)', 'execute') then
    raise exception '20261109180000: la foto del diario no quedó como se esperaba.';
  end if;
end
$comprobar$;

select '20261109180000 · QUEDÓ BIEN: se puede tomar la foto del diario de un mes' as resultado;
