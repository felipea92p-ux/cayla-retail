-- ============================================================================
-- 20261029052000_planilla_salidas_por_registrar.sql — CAYLA V2 (ADR-0567, actividad 1)
--
-- EL PROBLEMA PRIMERO. Cuando Dynamic marca pagado un grupo de la planilla, retail anota el gasto (62 | 41), pero nadie sabe de qué banco
-- salió la plata: Dynamic guarda solo que se pagó, cuándo y quién lo marcó (`public.periodo_grupo_pago`). La salida se registra a mano en
-- Cuentas y dinero ▸ «Pagar la planilla» (`pago_planilla`, ADR-0417) y, al 28-oct, había 0 registradas contra 10 grupos pagados. Si nadie
-- la registra, el saldo de BCP Empresa e Interbank Empresas queda alto en el ERP y la conciliación no cuadra. CAYLA paga a cada persona
-- desde el banco donde cobra (Felipe, 2026-10-28): quien cobra en BCP, desde BCP Empresa; quien cobra en Interbank, desde Interbank
-- Empresas. Dynamic ya tiene ese dato, en texto libre (`datos_personales.entidad_bancaria`).
--
-- CONTRATO (Liskov)
--   PROMETE: (1) `fn_banco_del_colaborador(texto)` lee el banco de ese texto: 'bcp', 'interbank' o nulo (vacío, otro banco o un texto
--            que no se entiende). Entiende las grafías que hay hoy en Dynamic («BCP», «BANCO DE CREDITO», «Banco de Crédito del Perú»,
--            «Interbank», «INTERBANK»). (2) `planilla_salidas`: una fila por período, grupo y banco del colaborador, que apunta al
--            «Pago de la planilla» que la registró; la clave primaria hace imposible dos enlaces para el mismo tramo. (3)
--            `fn_planilla_salidas_por_registrar()`: por cada grupo PAGADO en Dynamic de un período que termina desde el inicio de
--            Finanzas, el neto (lo que recibe cada persona que cobra algo) y cuántas personas cobran en cada banco, con el pago ya registrado si lo hay
--            y sigue vigente. Solo trae los grupos que piden atención: algún tramo sin registrar, o registrado cuando Dynamic decía otro neto
--            (Dynamic reabrió y volvió a pagar). Que la salida registrada sea de otro monto que el neto NO pide atención: quien la registró
--            escribió lo que de verdad salió del banco (`planilla_salidas.neto_dynamic` guarda lo que Dynamic decía en ese momento).
--   ASUME:   Dynamic: `v_planilla_pagada` (la foto vigente, con `persona_id`, `grupo`, `total`), `periodo_grupo_pago` (estado y
--            `pagado_at` por grupo), `periodos_planilla` y `datos_personales`. El neto es `total`: la AFP, el EsSalud y la renta de 4ª
--            salen por otro lado (a la AFP y a SUNAT) y no van aquí.
--   FALLA:   no falla: sin ser líder, sin ver la planilla en Dynamic (`fn_planilla_visible`) o sin Dynamic en la base, devuelve vacío.
--   NO HACE: no escribe nada (registrar es la actividad 3), no elige la cuenta (actividad 2), no toca Dynamic, no cambia el 62 | 41.
--
-- PRIVACIDAD. A diferencia de `planilla_por_sede`, aquí un banco con una o dos personas NO se esconde: la salida del banco tiene que ser
-- exacta. Lo ve solo quien es líder en retail y además ve la planilla en Dynamic (admin o líder de DO), que allá ya ve cada sueldo:
-- retail no abre ninguna puerta nueva a la planilla (ADR-0133 F7). Nunca devuelve una persona ni un nombre.
--
-- CÓMO SE PEGA EN PRODUCCIÓN — UNA SOLA EJECUCIÓN. Crea dos funciones y una tabla nueva (RLS encendido y sin políticas: solo la leen y
-- escriben funciones security definer). La tabla toma un candado corto sobre `movimientos_dinero` y `public.personas` al crear sus
-- llaves foráneas; no crea políticas, así que no choca con el Asesor (la regla de «Políticas y deadlocks»). Idempotente.
-- Verificado: `scripts/pruebas/planilla_salidas.mjs`.
-- SE ROMPE SI: Dynamic renombra `entidad_bancaria`, `periodo_grupo_pago.pagado_at` o `v_planilla_pagada.total` (la lectura falla en voz
-- alta, no en silencio); o alguien escribe en Dynamic un banco nuevo para quien sí cobra en BCP o Interbank (sale como «sin banco» y el
-- líder elige la cuenta a mano).
-- DOWN: drop function retail.fn_planilla_salidas_por_registrar(); drop table retail.planilla_salidas; drop function
--       retail.fn_banco_del_colaborador(text);
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. El banco del colaborador, de lo que Dynamic tiene escrito ----------
-- Se compara sin mayúsculas ni tildes. «Crédito» suelto no basta: una «Caja Municipal de Ahorro y Crédito» no es el BCP.
create or replace function retail.fn_banco_del_colaborador(p_texto text)
returns text
language sql
immutable
parallel safe
set search_path = retail, public, extensions
as $$
  select case
    when t ~ '\mbcp\M' or t ~ 'banco de credito' then 'bcp'
    when t ~ 'interbank' then 'interbank'
  end
  from (select translate(lower(btrim(coalesce(p_texto, ''))), 'áéíóúü', 'aeiouu') as t) x
$$;
comment on function retail.fn_banco_del_colaborador(text) is
  'ADR-0567: el banco donde cobra un colaborador, leído del texto libre de Dynamic (datos_personales.entidad_bancaria): bcp, interbank o nulo.';
revoke all on function retail.fn_banco_del_colaborador(text) from public, anon;
grant execute on function retail.fn_banco_del_colaborador(text) to authenticated;

-- ---------- 2. Qué salida del banco registró cada tramo ----------
-- Un tramo = un período de Dynamic, uno de sus grupos (planilla, RxH, practicantes…) y el banco donde cobran esas personas. El período
-- no lleva llave foránea: vive en Dynamic (`public.periodos_planilla`), que es otro sistema, y la base local no lo tiene.
create table if not exists retail.planilla_salidas (
  periodo_id uuid not null,
  grupo text not null check (btrim(grupo) <> ''),
  banco text not null check (banco in ('bcp', 'interbank', 'sin_banco')),
  movimiento_id uuid not null unique references retail.movimientos_dinero (id),
  -- Lo que Dynamic decía que salía de este tramo cuando se registró: si después cambia, el tramo vuelve a pedir atención.
  neto_dynamic numeric not null check (neto_dynamic >= 0),
  registrada_por uuid references public.personas (id),
  registrada_en timestamptz not null default now(),
  primary key (periodo_id, grupo, banco)
);
comment on table retail.planilla_salidas is
  'ADR-0567: de qué «Pago de la planilla» (movimientos_dinero.tipo = pago_planilla) salió cada tramo de un grupo pagado en Dynamic. Si el movimiento se anula, el tramo vuelve a pedir su salida.';
alter table retail.planilla_salidas enable row level security;
revoke all on retail.planilla_salidas from public, anon, authenticated;

-- ---------- 3. Lo que falta registrar ----------
create or replace function retail.fn_planilla_salidas_por_registrar()
returns table (
  periodo_id uuid,
  fecha_ini date,
  fecha_fin date,
  grupo text,
  pagado_el date,
  banco text,
  personas integer,
  neto numeric,
  movimiento_id uuid,
  registrado numeric,
  neto_al_registrar numeric,
  cuenta_id uuid,
  cuenta_nombre text,
  fecha_registrada date
)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
#variable_conflict use_column
declare
  v_desde date := retail.fn_finanzas_desde();
begin
  if not coalesce(retail.fn_es_lider(), false) or not retail.fn_planilla_visible() then
    return;
  end if;
  if to_regclass('public.v_planilla_pagada') is null or to_regclass('public.periodo_grupo_pago') is null
     or to_regclass('public.periodos_planilla') is null or to_regclass('public.datos_personales') is null then
    return;
  end if;

  return query
  with tramos as (
    select v.periodo_id, v.grupo,
           coalesce(retail.fn_banco_del_colaborador(dp.entidad_bancaria), 'sin_banco') as banco,
           -- Del banco sale lo que recibe cada persona: quien no cobra nada (o le queda un descuento a deber) no suma ni resta.
           count(distinct v.persona_id) filter (where v.total > 0)::integer as personas,
           round(coalesce(sum(v.total) filter (where v.total > 0), 0), 2) as neto
      from public.v_planilla_pagada v
      left join public.datos_personales dp on dp.persona_id = v.persona_id
     group by 1, 2, 3
  ),
  filas as (
    select t.periodo_id, p.fecha_ini, p.fecha_fin, t.grupo,
           (g.pagado_at at time zone 'America/Lima')::date as pagado_el,
           t.banco, t.personas, t.neto,
           m.id as movimiento_id, m.monto as registrado, case when m.id is not null then s.neto_dynamic end as neto_al_registrar,
           m.cuenta_origen_id as cuenta_id, c.nombre as cuenta_nombre, m.fecha as fecha_registrada
      from tramos t
      join public.periodo_grupo_pago g on g.periodo_id = t.periodo_id and g.grupo = t.grupo and g.estado = 'pagado'
      join public.periodos_planilla p on p.id = t.periodo_id
      left join retail.planilla_salidas s on s.periodo_id = t.periodo_id and s.grupo = t.grupo and s.banco = t.banco
      left join retail.movimientos_dinero m on m.id = s.movimiento_id and m.estado = 'vigente'
      left join retail.cuentas_dinero c on c.id = m.cuenta_origen_id
     where t.neto > 0
       and (v_desde is null or p.fecha_fin >= v_desde)
  )
  select f.periodo_id, f.fecha_ini, f.fecha_fin, f.grupo, f.pagado_el, f.banco, f.personas, f.neto,
         f.movimiento_id, f.registrado, f.neto_al_registrar, f.cuenta_id, f.cuenta_nombre, f.fecha_registrada
    from filas f
   where exists (
     select 1 from filas o
      where o.periodo_id = f.periodo_id and o.grupo = f.grupo
        and (o.movimiento_id is null or o.neto_al_registrar is distinct from o.neto))
   order by f.fecha_fin, f.pagado_el, f.grupo, f.banco;
end $$;
comment on function retail.fn_planilla_salidas_por_registrar() is
  'ADR-0567: por cada grupo pagado en Dynamic desde el inicio de Finanzas, el neto y las personas por banco del colaborador, con su salida registrada si la hay. Solo los grupos con algo por registrar o que Dynamic cambió después de registrar. Líder que ve la planilla en Dynamic; si no, vacío.';
revoke all on function retail.fn_planilla_salidas_por_registrar() from public, anon;
grant execute on function retail.fn_planilla_salidas_por_registrar() to authenticated;
