-- ============================================================================
-- 20261107034000 — El IGV de gestión: lo que Felipe dice que va a pagar de IGV cada mes (ADR-0620)
--
-- EL PROBLEMA PRIMERO. Finanzas muestra las ventas sin IGV y resta la mercadería y los gastos: el resultado supone que todo el
-- IGV de lo vendido sale de la caja. Hoy no es cierto: octubre no paga IGV (hay saldo a favor), así que el libro dice −26,488.05
-- y Felipe quiere leer el mes como lo vive: ventas con IGV, menos el IGV que de verdad paga, menos el costo.
--
-- LA DECISIÓN (Felipe, 2026-11-06; ADR-0620). Una capa de LECTURA sobre el Estado de resultados, como los sueldos estimados
-- (ADR-0453). El libro no cambia: ni `fn_asientos`, ni `fn_estado_resultados`, ni el cierre, ni el Balance, ni la renta, ni
-- Impuestos, ni el archivo del contador.
--   · Solo el líder dice el monto (`fn_es_lider()`, no `fn_exigir_lider_dinero`). Lo lee quien tiene `fn_ve_diario_de_todo()`.
--   · Mes sin monto dicho: se resta todo el IGV incluido, con aviso (lo decide la web, con `monto_dicho` nulo). No frena el cierre.
--
-- LA FÓRMULA, por unidad y mes.
--   IGV incluido = 4011 de: haber de venta, −debe de anulación, haber − debe de devolución y de cambio, sin adelantos.
--     Los adelantos se quedan fuera porque tampoco están en las ventas netas: el debe de la 4011 en una venta y el haber en una
--     anulación son el adelanto aplicado o devuelto, y `anticipo` / `anticipo_devuelto` son su boleta.
--   Ventas con IGV = ventas_netas + IGV incluido.
--   IGV del mes    = lo dicho, repartido por IGV incluido. Sin monto dicho: todo el IGV incluido.
--   Mes parcial    = monto × IGV del tramo ÷ IGV del mes: 0 sigue siendo 0.
--   Mes en curso   = el monto se resta entero: su IGV del mes solo llega hasta hoy, así que no hay con qué prorratearlo. `mes_en_curso`
--                    lo marca, y la web no compara ese mes «a esta fecha» contra un mes pasado que lleva solo su parte (ADR-0620).
--   Resto de céntimos: a la unidad con más IGV en el tramo. IGV incluido del mes en 0 o menos: el monto va a «De la empresa».
--   Mes con el IGV en 0 o menos y un tramo parcial: va el monto entero (no hay con qué prorratear).
--
-- CONTRATO
--   PROMETE: (1) `decir_igv_del_mes` no escribe en el diario, en el Balance ni en ningún saldo; (2) `igv_parte` de un mes completo
--            suma exacto lo dicho; (3) 0 dicho y sin dato son distintos: `monto_dicho` 0 frente a nulo; (4) con cualquier unidad
--            cerrada el mes rechaza decir el monto, porque cambiaría la columna de esa unidad; (5) lo dicho no se edita ni se borra:
--            se dice otra vez y gana lo más reciente; (6) repetir el mismo monto no agrega fila; (7) quien no ve toda CAYLA no
--            recibe el monto ni su parte, y `ve_dicho` falso se lo dice a la web: un nulo no significa que nadie lo dijo.
--   ASUME:   que `fn_asientos` sigue escribiendo la 4011 de lo vendido solo en las reglas de arriba. Una regla nueva que mueva la
--            7011 y la 4011 sin entrar a la lista deja las ventas cortas sin error: lo vigila `scripts/pruebas/igv_gestion.mjs`.
--   NO HACE: no toca 591, 50 ni 4011, y no conecta la renta ni Impuestos a esta capa.
--
-- CÓMO SE PEGA EN PRODUCCIÓN: UNA SOLA EJECUCIÓN, antes de publicar la web. Crea una tabla nueva, un disparador y cuatro funciones;
-- sin políticas (RLS encendido sin políticas: se lee y se escribe solo por funciones `security definer`), sin `alter` de tablas en
-- uso y sin `drop trigger` (ADR-0195). Sin lectura con destino de variable dentro de un texto entre comillas (ADR-0288).
-- SE ROMPE SI: se cambia la regla de la 4011 de una venta sin tocar `fn_igv_de_gestion`.
-- DOWN: `drop function` de las cuatro funciones y `drop table retail.igv_del_mes`. El libro no se entera.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. Lo que dijo el líder: solo se agregan filas y gana la más reciente ----------
create table if not exists retail.igv_del_mes (
  id bigint generated always as identity primary key,
  mes date not null,
  monto numeric(12,2) not null,
  nota text,
  creado_por uuid not null,
  creado_en timestamptz not null default clock_timestamp(),
  constraint igv_del_mes_primer_dia check (mes = date_trunc('month', mes)::date),
  -- NaN es mayor que cualquier número: `>= 0` solo no lo frena.
  constraint igv_del_mes_monto_valido check (monto >= 0 and monto < 'NaN'::numeric),
  constraint igv_del_mes_nota_corta check (nota is null or char_length(nota) <= 500)
);
comment on table retail.igv_del_mes is
  'ADR-0620: el IGV que el líder dice que va a pagar cada mes, para el resultado de gestión. Solo agrega filas: gana la de id mayor. No entra al diario, al Balance ni a la renta.';
create index if not exists igv_del_mes_mes_id on retail.igv_del_mes (mes, id desc);
alter table retail.igv_del_mes enable row level security;
revoke all on table retail.igv_del_mes from public, anon, authenticated;

-- ---------- 2. El candado: ninguna unidad del mes puede estar cerrada ----------
-- Con ubicación nula `fn_exigir_mes_abierto` solo mira el alcance empresa: una tienda cerrada cambiaría su columna sin que nadie lo
-- impidiera. Por eso se recorre cada unidad cerrada. La primera llamada toma el cerrojo compartido del cierre (también sin
-- unidades cerradas), así que la lectura de `periodos` de abajo ya ve un cierre que se confirmó mientras se esperaba.
create or replace function retail.fn_exigir_igv_mes_abierto(p_mes date)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_ubicacion uuid;
begin
  perform retail.fn_exigir_mes_abierto(null, p_mes, null, 'decir su IGV');
  for v_ubicacion in
    select p.ubicacion_id
      from retail.periodos p
     where p.mes = date_trunc('month', p_mes)::date and p.alcance = 'ubicacion' and p.estado = 'cerrado'
     order by p.ubicacion_id
  loop
    perform retail.fn_exigir_mes_abierto(v_ubicacion, p_mes, null, 'decir su IGV');
  end loop;
end $$;
comment on function retail.fn_exigir_igv_mes_abierto(date) is
  'ADR-0620: rechaza decir el IGV de un mes con la empresa o cualquier tienda cerrada. Interna: la llaman decir_igv_del_mes y el disparador de igv_del_mes.';
revoke all on function retail.fn_exigir_igv_mes_abierto(date) from public, anon, authenticated;

create or replace function retail.fn_igv_del_mes_candado()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'Lo dicho del IGV de un mes no se edita ni se borra: se dice otra vez.' using errcode = 'P0001';
  end if;
  perform retail.fn_exigir_igv_mes_abierto(new.mes);
  return new;
end $$;
comment on function retail.fn_igv_del_mes_candado() is
  'ADR-0620: igv_del_mes solo agrega filas y nunca en un mes con una unidad cerrada. Vale también para lo que no pase por decir_igv_del_mes.';
revoke all on function retail.fn_igv_del_mes_candado() from public, anon, authenticated;

create or replace trigger igv_del_mes_candado
  before insert or update or delete on retail.igv_del_mes
  for each row execute function retail.fn_igv_del_mes_candado();

-- ---------- 3. Decir el monto: solo el líder ----------
create or replace function retail.decir_igv_del_mes(p_mes date, p_monto numeric, p_nota text default null)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_mes date := date_trunc('month', p_mes)::date;
  v_nota text := nullif(btrim(p_nota), '');
  v_actor uuid;
  v_antes numeric;
begin
  if not coalesce(retail.fn_es_lider(), false) then
    raise exception 'El IGV del mes lo dice el líder.' using errcode = '42501';
  end if;
  if v_mes is null then
    raise exception 'Elige el mes.' using errcode = 'P0001';
  end if;
  if v_mes > date_trunc('month', retail.fn_hoy_lima())::date then
    raise exception 'Ese mes todavía no llega: su IGV se dice desde que empieza.' using errcode = 'P0001';
  end if;
  if v_mes < date_trunc('month', retail.fn_finanzas_desde())::date then
    raise exception 'Finanzas cuenta desde %: ese mes queda fuera.', retail.fn_mes_nombre(retail.fn_finanzas_desde()) using errcode = 'P0001';
  end if;
  if not retail.fn_monto_valido(p_monto) or p_monto < 0 or p_monto >= 10000000000 or p_monto <> round(p_monto, 2) then
    raise exception 'El monto tiene que ser 0 o más, con dos decimales como máximo.' using errcode = 'P0001';
  end if;
  if char_length(v_nota) > 500 then
    raise exception 'La nota no puede pasar de 500 letras.' using errcode = 'P0001';
  end if;

  -- Dos clics a la vez: el segundo espera y ve lo que dijo el primero.
  perform pg_advisory_xact_lock(hashtextextended('igv_del_mes:' || to_char(v_mes, 'YYYY-MM-DD'), 0));
  -- Antes de comparar: un mes cerrado rechaza también el monto que ya tenía.
  perform retail.fn_exigir_igv_mes_abierto(v_mes);

  v_antes := (select i.monto from retail.igv_del_mes i where i.mes = v_mes order by i.id desc limit 1);
  if v_antes = p_monto then
    return jsonb_build_object('mes', v_mes, 'monto', p_monto, 'nuevo', false);
  end if;

  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'No se pudo saber quién lo dice.' using errcode = '42501';
  end if;
  insert into retail.igv_del_mes (mes, monto, nota, creado_por) values (v_mes, p_monto, v_nota, v_actor);
  return jsonb_build_object('mes', v_mes, 'monto', p_monto, 'nuevo', true);
end $$;
comment on function retail.decir_igv_del_mes(date, numeric, text) is
  'ADR-0620: el líder dice el IGV que va a pagar de un mes (el mes en curso o uno pasado, desde que cuenta Finanzas, sin ninguna unidad cerrada). No toca el diario. Repetir el monto no agrega fila.';
revoke all on function retail.decir_igv_del_mes(date, numeric, text) from public, anon;
grant execute on function retail.decir_igv_del_mes(date, numeric, text) to authenticated;

-- ---------- 4. Leerlo: el IGV incluido por mes y unidad, y la parte de lo dicho ----------
-- Una fila por mes y unidad con IGV incluido en el mes. `igv_tramo` y `igv_parte` son de lo que cae dentro del rango; `igv_mes` y
-- `monto_dicho`, del mes entero. Sin dato, o para quien no ve toda CAYLA, `monto_dicho` e `igv_parte` son nulos: esa fila se lee
-- con todo su `igv_tramo`. `mes_en_curso`: ese mes no ha terminado y `igv_mes` llega solo hasta hoy. `ve_dicho`: esta cuenta recibe lo
-- dicho, así la web no confunde «no te lo muestro» con «nadie lo dijo». Lee `fn_diario`: un mes cerrado sale de su foto.
drop function if exists retail.fn_igv_de_gestion(date, date);
create or replace function retail.fn_igv_de_gestion(p_desde date, p_hasta date)
returns table (mes date, ubicacion_id uuid, igv_tramo numeric, igv_mes numeric, monto_dicho numeric, igv_parte numeric, mes_en_curso boolean, ve_dicho boolean)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
#variable_conflict use_column
declare
  v_todo boolean := retail.fn_ve_diario_de_todo();
  v_ubics uuid[] := retail.fn_diario_ubicaciones();
  v_inicio date := retail.fn_finanzas_desde();
  v_mes_de_hoy date := date_trunc('month', retail.fn_hoy_lima())::date;
  v_ini date;
  v_fin date;
begin
  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'El rango de fechas no es válido.' using errcode = 'P0001';
  end if;
  if not v_todo and coalesce(cardinality(v_ubics), 0) = 0 then
    raise exception 'Ver el IGV de gestión necesita el módulo «Reportes financieros» en tu rol.' using errcode = '42501';
  end if;
  -- ADR-0332: Finanzas cuenta desde su fecha de inicio, como el Estado de resultados.
  if v_inicio is not null then
    if p_hasta < v_inicio then
      return;
    end if;
    p_desde := greatest(p_desde, v_inicio);
  end if;
  v_ini := date_trunc('month', p_desde)::date;
  v_fin := (date_trunc('month', p_hasta) + interval '1 month' - interval '1 day')::date;

  return query
  with
  a as materialized (
    select date_trunc('month', d.fecha)::date as m, d.fecha as f, d.ubicacion_id as u,
           case d.regla when 'venta' then d.haber
                        when 'anulacion' then -d.debe
                        else d.haber - d.debe end as igv
      from retail.fn_diario(v_ini, v_fin, null) d
     where d.cuenta = '4011' and d.regla in ('venta', 'anulacion', 'devolucion', 'cambio')
  ),
  por_unidad as (
    select a.m, a.u, sum(a.igv) as del_mes,
           coalesce(sum(a.igv) filter (where a.f between p_desde and p_hasta), 0) as tramo
      from a
     group by a.m, a.u
  ),
  dicho as (
    select distinct on (i.mes) i.mes as m, i.monto
      from retail.igv_del_mes i
     where v_todo and i.mes between v_ini and v_fin
     order by i.mes, i.id desc
  ),
  total as (
    select p.m, sum(p.del_mes) as del_mes, sum(p.tramo) as tramo from por_unidad p group by p.m
  ),
  -- Lo dicho de un mes sin IGV positivo necesita la fila de «De la empresa», aunque no tenga ventas.
  filas as (
    select p.m, p.u, p.del_mes, p.tramo from por_unidad p
    union all
    select d.m, null::uuid, 0::numeric, 0::numeric
      from dicho d
      left join total t on t.m = d.m
     where coalesce(t.del_mes, 0) <= 0
       and not exists (select 1 from por_unidad p where p.m = d.m and p.u is null)
  ),
  repartido as (
    select f.m, f.u, f.tramo, coalesce(t.del_mes, 0) as del_mes_total, d.monto,
           case when d.monto is null then null
                when coalesce(t.del_mes, 0) <= 0 then case when f.u is null then d.monto else 0 end
                else round(d.monto * f.tramo / t.del_mes, 2) end as crudo,
           case when d.monto is null then null
                when coalesce(t.del_mes, 0) <= 0 then d.monto
                else round(d.monto * t.tramo / t.del_mes, 2) end as debe_sumar,
           row_number() over (partition by f.m order by f.tramo desc, f.u nulls last) as lugar
      from filas f
      left join total t on t.m = f.m
      left join dicho d on d.m = f.m
  ),
  con_resto as (
    select r.*, r.debe_sumar - sum(r.crudo) over (partition by r.m) as resto from repartido r
  )
  select c.m, c.u, c.tramo, c.del_mes_total, c.monto,
         c.crudo + case when c.lugar = 1 then c.resto else 0 end,
         c.m = v_mes_de_hoy,
         v_todo
    from con_resto c
   order by c.m, c.u nulls last;
end $$;
comment on function retail.fn_igv_de_gestion(date, date) is
  'ADR-0620: por mes y unidad, el IGV incluido en las ventas del rango (igv_tramo), el del mes entero (igv_mes), lo dicho por el líder (monto_dicho) y la parte de esta unidad en el rango (igv_parte). Sin monto o sin ver toda CAYLA, esos dos son nulos, y ve_dicho distingue un caso del otro. mes_en_curso: el mes no ha terminado, su monto se resta entero. Solo lectura.';
revoke all on function retail.fn_igv_de_gestion(date, date) from public, anon;
grant execute on function retail.fn_igv_de_gestion(date, date) to authenticated;

reset lock_timeout;
