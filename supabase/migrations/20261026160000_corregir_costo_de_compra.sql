-- ============================================================================
-- 20261026160000_corregir_costo_de_compra.sql — CAYLA V2 (Felipe, 2026-10-24; ADR-0515)
-- Corregir el costo de la ÚLTIMA compra de una prenda, sin tocar el historial
--
-- EL PROBLEMA PRIMERO. El costo de una prenda es el promedio ponderado de sus compras (ADR-0067): cada `Recibir mercadería` deja
-- una fila en `costo_historial` y mueve `variantes.costo`. Si quien recibió tecleó mal el costo de lo que llegó (S/ 20.50 en vez de
-- S/ 19.50), el promedio queda mal para siempre: la ficha no deja editar el costo de una prenda que ya tuvo compras
-- (`variantes_costo_hasta_la_primera_compra`) y `costo_historial` es de solo lectura. La pestaña «Costo» del Historial
-- (20261024223000) hizo visible ese error y no había cómo arreglarlo.
--
-- LA DECISIÓN (Felipe, 2026-10-24): se corrige SOLO la última compra de la prenda. Una compra más vieja ya está mezclada con todo lo
-- que llegó después (y con lo vendido): corregirla reescribiría el promedio de las siguientes. Y es una CORRECCIÓN, no una compra
-- nueva: la línea del costo no se mueve por ella; sale aparte, en «Errores arreglados» (decisión de Felipe, misma fecha).
--
-- CONTRATO (Liskov)
--   PROMETE: `corregir_costo_de_compra(p_producto_id, p_compra_en, p_costo, p_motivo, p_confirma_costo) → jsonb` con lo que quedó. Cambia el costo de
--            lo que llegó en esa compra, para TODAS las variantes de la prenda que llegaron en ella (un solo costo, decisión de
--            Felipe), y recalcula `variantes.costo` con la misma fórmula de `fn_recalcular_costo_variante`:
--            (stock_previo × costo_anterior + cantidad × costo_correcto) / (stock_previo + cantidad). Lo de antes no se pierde: cada
--            línea queda en `costo_correcciones` (solo se agrega) con su antes, su después, el motivo y quién.
--   ASUME:   la cuenta es de un líder (`fn_es_lider`, dinero de compras: Felipe 2026-10-24) y firma el responsable del combo
--            (`fn_actor_persona_id(true)`, ADR-0162). `p_compra_en` es la fecha exacta que devuelve `fn_costo_de_la_prenda`.
--   FALLA:   `costo_no_es_lider`, `costo_prenda_no_existe`, `costo_invalido` (no es un monto entre 0.01 y 5000), `costo_motivo`
--            (el motivo no tiene entre 3 y 300 letras), `costo_atipico` (el costo está fuera de lo normal y falta `p_confirma_costo`),
--            `costo_sin_compras`, `costo_no_es_la_ultima` (otra compra entró después, o la
--            fecha no es la de la última), `costo_del_taller` (el costo de un cierre del Taller sale de su orden, no de un monto
--            tecleado), `costo_desalineado` (el costo de una variante no es el que dejó su última compra: estado imposible, se
--            detiene en vez de pisarlo), `costo_sin_cambios` (es el costo que ya tenía: un doble clic cae aquí y la web lo toma
--            como hecho).
--   NO HACE: no toca la factura (lo que se debe al proveedor es lo que dice el documento: si la factura misma está mal, eso es otro
--            arreglo), ni el stock, ni `movimientos`, ni `costo_historial`, ni las VENTAS ya hechas: guardaron el costo con el que
--            salieron y un cierre ya reportado no cambia (decisión de Felipe, 2026-10-24).
--
-- ESTADOS IMPOSIBLES (Lamport). Se toman, en orden de id, las variantes de la prenda `for no key update` —las mismas que bloquea
-- `fn_recalcular_costo_variante` al recibir mercadería—: una compra nueva y una corrección se turnan, y si la compra gana, la
-- corrección ve que ya no es la última y falla con `costo_no_es_la_ultima` (nunca corrige una compra a la que ya se le sumó otra).
-- Dos correcciones a la vez: la segunda espera, ve que su costo ya es el vigente y cae en `costo_sin_cambios`.
-- Antes de escribir se comprueba que `variantes.costo` sea el que dejó la última fila de cada variante (`costo_desalineado`).
--
-- UN COSTO FUERA DE LO NORMAL SE CONFIRMA (ADR-0298; lo encontró `/chaos` el 2026-10-26: corregir a S/ 1950 una prenda de S/ 18 se
-- guardaba sin preguntar, justo el tipo de error que esta función existe para arreglar). La regla vive en `fn_costo_fuera_de_banda`
-- (la misma de Recibir y del Taller): se compara el costo nuevo con el costo vigente y el precio de cada variante de la compra. Si alguna
-- sale de la banda y no llega `p_confirma_costo = true`, se rechaza con `costo_atipico` y el dato en `detail` (`{"items":[…]}`, lo que ya
-- lee `lib/costo-atipico-reglas.ts`) y no se escribe nada. Con la confirmación se guarda y la línea lo anota (`costo_atipico_confirmado`).
--
-- DECIDÍ: tabla nueva de solo agregar, y `fn_costo_historial_efectivo`, que devuelve `costo_historial` con lo que valen las filas
--   tras sus correcciones. `fn_costo_de_la_prenda` lee de ahí (el gráfico y la tabla usan el costo bueno) y `costo_historial` queda
--   idéntico para siempre (principio 4: una sola fuente de verdad que se agrega, no se reescribe).
-- DESCARTÉ: dejar corregir una compra que no es la última (reescribiría el promedio de lo que llegó después), corregir el costo de
--   un cierre del Taller (su costo sale de la orden: se corrige allá), un costo por variante (la pantalla dice UN «llegaron a S/ X»
--   por compra) y recalcular las ventas ya hechas (cambiaría cifras ya cerradas; si Felipe lo quiere, es una decisión aparte).
--
-- PRODUCCIÓN. Una sola parte, re-ejecutable: una tabla NUEVA (RLS encendido y SIN políticas: la escriben y leen solo funciones
-- `security definer`), su candado `create or replace trigger` (nunca `drop trigger`) y funciones. No hace `alter` de tablas en uso
-- ni crea políticas: ADR-0195 no aplica. Pegar ANTES de publicar la web: sin las funciones, la pestaña «Costo» sigue como estaba.
--
-- VERIFICACIÓN (solo lectura):
--   select to_regprocedure('retail.corregir_costo_de_compra(uuid,timestamptz,numeric,text,boolean)') is not null,
--          to_regclass('retail.costo_correcciones') is not null;                                       → t | t
-- CÓMO SE DESHACE: drop function retail.corregir_costo_de_compra(uuid,timestamptz,numeric,text,boolean), retail.previsualizar_correccion_de_costo(uuid,timestamptz,numeric),
--   retail.fn_costo_correccion_calculo(uuid,timestamptz,numeric), retail.fn_costo_historial_efectivo(uuid); y volver `fn_costo_de_la_prenda`
--   a 20261024223000. La tabla se deja (solo agrega): las filas que tenga son historia de lo corregido.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. La foto de cada corrección (solo se agrega) ----------
create table if not exists retail.costo_correcciones (
  id uuid primary key default gen_random_uuid(),
  -- Una acción de la persona = varias líneas (una por fila de `costo_historial` de esa compra): comparten este id.
  correccion_id uuid not null,
  producto_id uuid not null references retail.productos (id),
  variante_id uuid not null references retail.variantes (id),
  -- La fila de `costo_historial` que se corrige (su `movimiento_id` es único allí) y la compra a la que pertenece
  -- (`costo_historial.created_at`: lo que se escribió junto).
  movimiento_id uuid not null references retail.movimientos (id),
  compra_en timestamptz not null,
  stock_previo integer not null check (stock_previo >= 0),
  cantidad integer not null check (cantidad > 0),
  -- Lo que valía la fila ANTES de esta corrección (la anterior, o la original) y lo que vale DESPUÉS.
  costo_unitario_antes numeric(12,2) not null check (costo_unitario_antes >= 0),
  costo_unitario_despues numeric(12,2) not null check (costo_unitario_despues > 0),
  costo_anterior_despues numeric(12,2) not null check (costo_anterior_despues >= 0),
  costo_resultante_antes numeric(12,2) not null check (costo_resultante_antes >= 0),
  costo_resultante_despues numeric(12,2) not null check (costo_resultante_despues >= 0),
  motivo text not null check (length(btrim(motivo)) between 3 and 300),
  -- El costo estaba fuera de lo normal (`fn_costo_fuera_de_banda`) y el líder lo confirmó (ADR-0298).
  costo_atipico_confirmado boolean not null default false,
  -- Quién corrigió: el responsable que firmó (ADR-0162).
  persona_id uuid not null references public.personas (id),
  -- `clock_timestamp()` y no `now()`: dos correcciones dentro de una misma transacción (una prueba, un script) siguen en orden.
  creado_en timestamptz not null default clock_timestamp()
);

create index if not exists costo_correcciones_producto_idx on retail.costo_correcciones (producto_id, compra_en);
create index if not exists costo_correcciones_movimiento_idx on retail.costo_correcciones (movimiento_id, creado_en desc);

-- Sin políticas: la escriben `corregir_costo_de_compra` y la leen `fn_costo_historial_efectivo` y `fn_costo_de_la_prenda`, todas
-- `security definer` (el costo es dinero de compras: no se expone la tabla).
alter table retail.costo_correcciones enable row level security;
revoke all on retail.costo_correcciones from public, anon, authenticated;

create or replace function retail.fn_costo_correcciones_inmutable() returns trigger
language plpgsql set search_path = retail, public, extensions as $$
begin
  raise exception 'costo_correcciones solo se agrega: no se edita ni se borra';
end;
$$;

create or replace trigger trg_costo_correcciones_inmutable
  before update or delete on retail.costo_correcciones
  for each row execute function retail.fn_costo_correcciones_inmutable();

-- ---------- 2. El historial del costo con lo que valen sus filas hoy ----------
-- `costo_historial` más la última corrección de cada fila (si la tiene). Es lo que lee `fn_costo_de_la_prenda`.
create or replace function retail.fn_costo_historial_efectivo(p_producto_id uuid)
returns table (
  id uuid, created_at timestamptz, variante_id uuid, movimiento_id uuid, stock_previo integer, costo_anterior numeric,
  cantidad_nueva integer, costo_unitario_nuevo numeric, costo_resultante numeric, origen text, usuario_id uuid, corregida boolean)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select ch.id, ch.created_at, ch.variante_id, ch.movimiento_id, ch.stock_previo,
         coalesce(cc.costo_anterior_despues, ch.costo_anterior), ch.cantidad_nueva,
         coalesce(cc.costo_unitario_despues, ch.costo_unitario_nuevo),
         coalesce(cc.costo_resultante_despues, ch.costo_resultante),
         ch.origen, ch.usuario_id, cc.id is not null
    from retail.costo_historial ch
    join retail.variantes v on v.id = ch.variante_id
    left join lateral (
      select c.id, c.costo_anterior_despues, c.costo_unitario_despues, c.costo_resultante_despues
        from retail.costo_correcciones c
       where c.movimiento_id = ch.movimiento_id
       order by c.creado_en desc, c.id desc
       limit 1
    ) cc on true
   where v.producto_id = p_producto_id
$$;

revoke all on function retail.fn_costo_historial_efectivo(uuid) from public, anon, authenticated;
comment on function retail.fn_costo_historial_efectivo(uuid) is
  'ADR-0515: costo_historial de una prenda con la última corrección de cada fila aplicada (costo de lo que llegó, costo anterior y costo que quedó). Solo la llaman funciones security definer.';

-- ---------- 3. La cuenta de corregir (la comparten la vista previa y el guardado) ----------
-- Una fila por fila de `costo_historial` de la compra, con lo que valdría con el costo nuevo. Una variante que llegó dos veces en la
-- misma compra (dos facturas) encadena: el costo anterior de su segunda fila es lo que dejó la primera ya corregida, igual que lo
-- calculó `fn_recalcular_costo_variante` al recibir.
create or replace function retail.fn_costo_correccion_calculo(p_producto_id uuid, p_compra_en timestamptz, p_costo numeric)
returns table (
  variante_id uuid, movimiento_id uuid, stock_previo integer, cantidad integer, unitario_antes numeric, unitario_despues numeric,
  anterior_despues numeric, resultante_antes numeric, resultante_despues numeric)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  r record;
  v_var uuid;
  v_encadenado numeric;
begin
  for r in
    select e.variante_id as v_id, e.movimiento_id as m_id, e.stock_previo as stock, e.cantidad_nueva as cant,
           e.costo_anterior as anterior, e.costo_unitario_nuevo as unitario, e.costo_resultante as resultante
      from retail.fn_costo_historial_efectivo(p_producto_id) e
     where e.created_at = p_compra_en
     order by e.variante_id, e.stock_previo
  loop
    if v_var is distinct from r.v_id then
      v_var := r.v_id;
      v_encadenado := r.anterior;
    end if;
    variante_id := r.v_id;
    movimiento_id := r.m_id;
    stock_previo := r.stock;
    cantidad := r.cant;
    unitario_antes := r.unitario;
    unitario_despues := p_costo;
    anterior_despues := v_encadenado;
    resultante_antes := r.resultante;
    resultante_despues := case
      when r.stock = 0 then p_costo
      else round(((r.stock * v_encadenado) + (r.cant * p_costo)) / (r.stock + r.cant), 2)
    end;
    v_encadenado := resultante_despues;
    return next;
  end loop;
end;
$$;

revoke all on function retail.fn_costo_correccion_calculo(uuid, timestamptz, numeric) from public, anon, authenticated;
comment on function retail.fn_costo_correccion_calculo(uuid, timestamptz, numeric) is
  'ADR-0515: lo que valdría cada fila de costo_historial de una compra si lo que llegó costara p_costo (misma fórmula que fn_recalcular_costo_variante). No escribe nada. Solo la llaman funciones security definer.';

-- ---------- 4. Las reglas de «¿esta compra se puede corregir?» (las comparten la vista previa y el guardado) ----------
-- Devuelve el motivo por el que NO (el código de error) o null si se puede. Toma el candado de las variantes de la prenda.
create or replace function retail.fn_costo_compra_corregible(p_producto_id uuid, p_compra_en timestamptz)
returns text
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_ultima timestamptz;
begin
  -- Las variantes de la prenda, en orden de id: una compra que llega y una corrección se turnan (ver el contrato arriba).
  perform 1 from retail.variantes where producto_id = p_producto_id order by id for no key update;

  select max(ch.created_at) into v_ultima
    from retail.costo_historial ch join retail.variantes v on v.id = ch.variante_id
   where v.producto_id = p_producto_id;
  if v_ultima is null then
    return 'costo_sin_compras';
  end if;
  if p_compra_en is distinct from v_ultima then
    return 'costo_no_es_la_ultima';
  end if;
  if exists (select 1 from retail.fn_costo_historial_efectivo(p_producto_id) e where e.created_at = v_ultima and e.origen <> 'compra') then
    return 'costo_del_taller';
  end if;
  -- El costo de cada variante tiene que ser el que dejó su última fila: si no, algo lo movió por fuera y no se pisa.
  if exists (
    select 1
      from (select distinct on (e.variante_id) e.variante_id, e.costo_resultante
              from retail.fn_costo_historial_efectivo(p_producto_id) e
             where e.created_at = v_ultima
             order by e.variante_id, e.stock_previo desc) u
      join retail.variantes v on v.id = u.variante_id
     where v.costo is distinct from u.costo_resultante) then
    return 'costo_desalineado';
  end if;
  return null;
end;
$$;

revoke all on function retail.fn_costo_compra_corregible(uuid, timestamptz) from public, anon, authenticated;
comment on function retail.fn_costo_compra_corregible(uuid, timestamptz) is
  'ADR-0515: null si la compra (la fecha de costo_historial) es la última de la prenda y se puede corregir; si no, el código del motivo. Toma el candado de las variantes de la prenda. Solo la llaman funciones security definer.';

-- ---------- 5. Corregir ----------
create or replace function retail.corregir_costo_de_compra(
  p_producto_id uuid, p_compra_en timestamptz, p_costo numeric, p_motivo text, p_confirma_costo boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
  v_costo numeric(12,2);
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_porque text;
  v_correccion uuid := gen_random_uuid();
  v_nombre text;
  v_lineas integer;
  v_variantes integer;
  v_atipicos jsonb;
  v_antes numeric;
  v_despues numeric;
  v_hoy_antes numeric;
  v_hoy_despues numeric;
begin
  -- Primero el permiso, después la firma (como `corregir_prenda_sin_registrar`).
  if not retail.fn_es_lider() then
    raise exception 'costo_no_es_lider' using errcode = '42501', hint = 'Corregir un costo es solo de un líder';
  end if;
  v_persona := retail.fn_actor_persona_id(true);
  if v_persona is null then
    raise exception 'costo_no_es_lider' using errcode = '42501', hint = 'No se pudo saber quién corrige: elige el responsable';
  end if;

  if p_costo is null or p_costo = 'NaN'::numeric or abs(p_costo) = 'Infinity'::numeric or round(p_costo, 2) < 0.01 or round(p_costo, 2) > 5000 then
    raise exception 'costo_invalido' using hint = 'Escribe un costo entre S/ 0.01 y S/ 5000';
  end if;
  v_costo := round(p_costo, 2);
  if length(v_motivo) < 3 or length(v_motivo) > 300 then
    raise exception 'costo_motivo' using hint = 'Cuenta en pocas palabras qué estaba mal (entre 3 y 300 letras)';
  end if;

  select coalesce(nullif(btrim(p.referencia), ''), 'esta prenda') into v_nombre from retail.productos p where p.id = p_producto_id;
  if not found then
    raise exception 'costo_prenda_no_existe' using hint = 'Esa prenda ya no existe: recarga la página';
  end if;

  v_porque := retail.fn_costo_compra_corregible(p_producto_id, p_compra_en);
  if v_porque is not null then
    raise exception '%', v_porque using hint = case v_porque
      when 'costo_sin_compras' then 'Esta prenda todavía no tiene compras'
      when 'costo_no_es_la_ultima' then 'Solo se corrige la última compra, y entró otra después: recarga la página'
      when 'costo_del_taller' then 'El costo de un cierre del Taller sale de su orden: se corrige allá'
      else 'El costo de esta prenda no coincide con el de su última compra: avisa a quien administra el sistema' end;
  end if;

  if not exists (select 1 from retail.fn_costo_correccion_calculo(p_producto_id, p_compra_en, v_costo) c where c.unitario_antes is distinct from v_costo) then
    raise exception 'costo_sin_cambios' using hint = 'Ese ya es el costo de esa compra';
  end if;

  -- Un costo fuera de lo normal se confirma (ADR-0298), como en Recibir y en el Taller. Antes de escribir nada.
  select jsonb_agg(jsonb_build_object('linea', x.n, 'variante_id', x.variante_id, 'sku', x.sku, 'motivo', x.motivo,
                                      'costo_unitario', v_costo, 'costo_vigente', x.costo, 'precio', x.precio) order by x.n)
    into v_atipicos
    from (select row_number() over (order by vr.id) as n, vr.id as variante_id, vr.sku, vr.costo, vr.precio,
                 retail.fn_costo_fuera_de_banda(v_costo, vr.costo, vr.precio) as motivo
            from retail.variantes vr
           where vr.id in (select c.variante_id from retail.fn_costo_correccion_calculo(p_producto_id, p_compra_en, v_costo) c)) x
   where x.motivo is not null;
  if v_atipicos is not null and not coalesce(p_confirma_costo, false) then
    raise exception 'costo_atipico' using detail = jsonb_build_object('items', v_atipicos)::text,
      hint = 'Ese costo está fuera de lo normal: confírmalo o corrígelo';
  end if;

  insert into retail.costo_correcciones (
    correccion_id, producto_id, variante_id, movimiento_id, compra_en, stock_previo, cantidad,
    costo_unitario_antes, costo_unitario_despues, costo_anterior_despues, costo_resultante_antes, costo_resultante_despues,
    motivo, costo_atipico_confirmado, persona_id)
  select v_correccion, p_producto_id, c.variante_id, c.movimiento_id, p_compra_en, c.stock_previo, c.cantidad,
         c.unitario_antes, c.unitario_despues, c.anterior_despues, c.resultante_antes, c.resultante_despues,
         v_motivo, v_atipicos is not null, v_persona
    from retail.fn_costo_correccion_calculo(p_producto_id, p_compra_en, v_costo) c;
  get diagnostics v_lineas = row_count;
  select count(distinct c.variante_id) into v_variantes from retail.costo_correcciones c where c.correccion_id = v_correccion;

  -- Lo que se calcula hoy y lo que cuesta cada prenda ahora (para decirlo: antes → después).
  select round(sum(s.cant * v.costo) / nullif(sum(s.cant), 0), 2)
    into v_hoy_antes
    from retail.variantes v
    cross join lateral (select coalesce(sum(st.cantidad), 0) as cant from retail.stock st where st.variante_id = v.id) s
   where v.producto_id = p_producto_id;

  -- El costo de cada variante pasa a ser el que dejó su última fila corregida.
  update retail.variantes v set costo = u.costo_resultante_despues
    from (select distinct on (c.variante_id) c.variante_id, c.costo_resultante_despues
            from retail.costo_correcciones c
           where c.correccion_id = v_correccion
           order by c.variante_id, c.stock_previo desc) u
   where v.id = u.variante_id;

  select round(sum(s.cant * v.costo) / nullif(sum(s.cant), 0), 2)
    into v_hoy_despues
    from retail.variantes v
    cross join lateral (select coalesce(sum(st.cantidad), 0) as cant from retail.stock st where st.variante_id = v.id) s
   where v.producto_id = p_producto_id;

  select round(sum(c.cantidad * c.costo_unitario_antes) / nullif(sum(c.cantidad), 0), 2),
         round(sum(c.cantidad * c.costo_unitario_despues) / nullif(sum(c.cantidad), 0), 2)
    into v_antes, v_despues
    from retail.costo_correcciones c where c.correccion_id = v_correccion;

  -- Actividad, sin montos (el costo solo lo ve quien ve el dinero). Un error del historial nunca detiene la corrección.
  begin
    perform retail.fn_actividad_anotar(
      'productos', 'costo_corregido',
      'corrigió el costo de la última compra de «' || v_nombre || '» (' || v_variantes || case when v_variantes = 1 then ' variante)' else ' variantes)' end
        || case when v_atipicos is not null then ' · costo fuera de lo normal, confirmado' else '' end,
      v_persona, null, retail.fn_actividad_sede_de(v_persona, 'vivo'), null, 'productos', p_producto_id::text, now(),
      jsonb_build_object('producto_id', p_producto_id, 'correccion_id', v_correccion, 'variantes', v_variantes),
      'vivo');
  exception when others then
    raise warning 'actividad: no se anotó la corrección de costo de % (%)', p_producto_id, sqlerrm;
  end;

  return jsonb_build_object(
    'correccion_id', v_correccion, 'lineas', v_lineas, 'variantes', v_variantes,
    'costo_llegaron_antes', v_antes, 'costo_llegaron_despues', v_despues,
    'hoy_antes', v_hoy_antes, 'hoy_despues', v_hoy_despues);
end;
$$;

revoke all on function retail.corregir_costo_de_compra(uuid, timestamptz, numeric, text, boolean) from public, anon;
grant execute on function retail.corregir_costo_de_compra(uuid, timestamptz, numeric, text, boolean) to authenticated;
comment on function retail.corregir_costo_de_compra(uuid, timestamptz, numeric, text, boolean) is
  'ADR-0515: corrige el costo de lo que llegó en la ÚLTIMA compra de una prenda (un solo costo para todas sus variantes), solo un líder y con motivo. Un costo fuera de lo normal pide p_confirma_costo (ADR-0298). Recalcula variantes.costo con la fórmula de fn_recalcular_costo_variante; la foto queda en costo_correcciones y costo_historial no se toca. No toca factura, stock ni ventas.';

-- ---------- 6. La vista previa de la hoja: «promedio ahora → con la corrección» ----------
-- Solo lectura. null si no es un líder, si el costo no vale o si la compra ya no se puede corregir: la hoja dice el motivo al guardar.
create or replace function retail.previsualizar_correccion_de_costo(p_producto_id uuid, p_compra_en timestamptz, p_costo numeric)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_costo numeric(12,2);
begin
  if not retail.fn_es_lider() or p_costo is null or p_costo = 'NaN'::numeric or abs(p_costo) = 'Infinity'::numeric then
    return null;
  end if;
  v_costo := round(p_costo, 2);
  if v_costo < 0.01 or v_costo > 5000 then
    return null;
  end if;
  -- `fn_costo_compra_corregible` toma el candado de las variantes: en una consulta de solo lectura no se puede. Se repiten sus
  -- comprobaciones sin candado (la vista previa es una pista; el guardado vuelve a comprobar con candado).
  if p_compra_en is distinct from (select max(ch.created_at) from retail.costo_historial ch join retail.variantes v on v.id = ch.variante_id where v.producto_id = p_producto_id)
     or exists (select 1 from retail.fn_costo_historial_efectivo(p_producto_id) e where e.created_at = p_compra_en and e.origen <> 'compra') then
    return null;
  end if;
  return (
    with calc as (select * from retail.fn_costo_correccion_calculo(p_producto_id, p_compra_en, v_costo)),
    nuevos as (select distinct on (c.variante_id) c.variante_id, c.resultante_despues from calc c order by c.variante_id, c.stock_previo desc),
    vars as (
      select v.costo as antes, coalesce(n.resultante_despues, v.costo) as despues,
             (select coalesce(sum(st.cantidad), 0) from retail.stock st where st.variante_id = v.id) as cant
        from retail.variantes v left join nuevos n on n.variante_id = v.id
       where v.producto_id = p_producto_id
    )
    select jsonb_build_object(
      'llegaron', (select sum(c.cantidad) from calc c),
      'costo_llegaron_antes', (select round(sum(c.cantidad * c.unitario_antes) / nullif(sum(c.cantidad), 0), 2) from calc c),
      'costo_llegaron_despues', v_costo,
      'hoy_antes', (select coalesce(round(sum(cant * antes) / nullif(sum(cant), 0), 2), round(avg(antes), 2)) from vars),
      'hoy_despues', (select coalesce(round(sum(cant * despues) / nullif(sum(cant), 0), 2), round(avg(despues), 2)) from vars),
      'stock', (select sum(cant) from vars))
  );
end;
$$;

revoke all on function retail.previsualizar_correccion_de_costo(uuid, timestamptz, numeric) from public, anon;
grant execute on function retail.previsualizar_correccion_de_costo(uuid, timestamptz, numeric) to authenticated;
comment on function retail.previsualizar_correccion_de_costo(uuid, timestamptz, numeric) is
  'ADR-0515: cuánto cuesta hoy cada prenda y cuánto costaría con p_costo en la última compra. Solo lectura; null si no es líder o la compra no se puede corregir.';

-- ---------- 7. La pestaña «Costo» lee el historial efectivo y dice qué se corrigió ----------
create or replace function retail.fn_costo_de_la_prenda(p_producto_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
  with vars as (
    select v.id, v.costo from retail.variantes v where v.producto_id = p_producto_id
  ),
  -- Las filas de `costo_historial` con lo que valen HOY: si una fila se corrigió (20261026160000), su costo de lo que llegó, el
  -- anterior y el que quedó son los de la última corrección. `costo_historial` en sí no se toca nunca.
  filas as (
    select e.created_at, e.variante_id, e.stock_previo, e.costo_anterior, e.cantidad_nueva, e.costo_unitario_nuevo,
           e.costo_resultante, e.origen, e.usuario_id, m.lote_id, m.compra_item_id, m.produccion_id
      from retail.fn_costo_historial_efectivo(p_producto_id) e
      join retail.movimientos m on m.id = e.movimiento_id
  ),
  -- Una variante puede llegar dos veces en la misma compra (dos facturas): se juntan. La primera fila es la de menor
  -- stock_previo (cada línea suma al stock antes de calcular la siguiente) y la última, la de mayor.
  por_variante as (
    select created_at, variante_id,
           sum(cantidad_nueva) as llegan,
           sum(cantidad_nueva * costo_unitario_nuevo) as valor_llega,
           (array_agg(stock_previo order by stock_previo))[1] as stock_previo,
           (array_agg(costo_anterior order by stock_previo))[1] as costo_anterior,
           (array_agg(costo_resultante order by stock_previo desc))[1] as costo_resultante
      from filas
     group by created_at, variante_id
  ),
  eventos as (
    select f.created_at,
           case when bool_or(f.origen = 'produccion') then 'produccion' else 'compra' end as origen,
           (select string_agg(distinct d.doc, ' · ')
              from filas f2
              left join retail.compra_items ci on ci.id = f2.compra_item_id
              left join retail.compras cp on cp.id = ci.compra_id
              left join retail.lotes lo on lo.id = f2.lote_id
              left join retail.producciones pr on pr.id = f2.produccion_id
              cross join lateral (select coalesce(
                  nullif(btrim(concat_ws('-', cp.serie, cp.numero)), ''),
                  case when pr.id is not null then 'Orden ' || coalesce(pr.numero::text, '') end,
                  nullif(btrim(lo.numero_guia), '')) as doc) d
             where f2.created_at = f.created_at) as documento,
           (select string_agg(distinct pv.nombre, ' · ')
              from filas f2
              left join retail.compra_items ci on ci.id = f2.compra_item_id
              left join retail.compras cp on cp.id = ci.compra_id
              left join retail.lotes lo on lo.id = f2.lote_id
              join retail.proveedores pv on pv.id = coalesce(cp.proveedor_id, lo.proveedor_id)
             where f2.created_at = f.created_at) as proveedor,
           (array_agg(f.usuario_id) filter (where f.usuario_id is not null))[1] as usuario_id
      from filas f
     group by f.created_at
  ),
  -- El costo declarado de cada variante (antes de su primera compra).
  declarado as (
    select v.id,
           coalesce((select f.costo_anterior from filas f where f.variante_id = v.id order by f.created_at, f.stock_previo limit 1),
                    v.costo, 0) as costo
      from vars v
  ),
  -- Cada compra × cada variante de la prenda: cuántas había, a cuánto, cuántas llegaron y en cuánto quedó.
  cruce as (
    select e.created_at, v.id as variante_id,
           coalesce(pv.stock_previo, greatest(0, (
             select coalesce(sum(case m.tipo when 'entrada' then m.cantidad when 'salida' then -m.cantidad
                                             when 'ajuste' then m.cantidad else 0 end), 0)
               from retail.movimientos m
              where m.variante_id = v.id and m.created_at < e.created_at)))::numeric as stock_antes,
           coalesce(pv.costo_anterior,
                    (select f.costo_resultante from filas f
                      where f.variante_id = v.id and f.created_at < e.created_at
                      order by f.created_at desc, f.stock_previo desc limit 1),
                    d.costo) as costo_antes,
           coalesce(pv.llegan, 0) as llegan,
           coalesce(pv.valor_llega, 0) as valor_llega,
           pv.costo_resultante
      from eventos e
     cross join vars v
      join declarado d on d.id = v.id
      left join por_variante pv on pv.created_at = e.created_at and pv.variante_id = v.id
  ),
  compras as (
    select e.created_at, e.origen, e.documento, e.proveedor,
           nullif(btrim(coalesce(per.nombres, '') || ' ' || coalesce(per.apellidos, '')), '') as persona,
           sum(c.llegan)::int as llegaron,
           round(sum(c.valor_llega) / nullif(sum(c.llegan), 0), 2) as costo_llegaron,
           sum(c.stock_antes)::int as ya_habia,
           round(sum(c.stock_antes * c.costo_antes) / nullif(sum(c.stock_antes), 0), 2) as costo_antes,
           round(sum((c.stock_antes + c.llegan) * coalesce(c.costo_resultante, c.costo_antes))
                 / nullif(sum(c.stock_antes + c.llegan), 0), 2) as costo_despues
      from eventos e
      join cruce c on c.created_at = e.created_at
      left join public.personas per on per.id = e.usuario_id
     group by e.created_at, e.origen, e.documento, e.proveedor, per.nombres, per.apellidos
  ),
  -- Una fila por corrección hecha a mano (una acción de la persona puede tocar varias variantes): cuánto costaba lo que llegó y cuánto
  -- quedó, a nivel prenda, con el motivo y quién.
  corr as (
    select c.correccion_id, c.compra_en, min(c.creado_en) as creado_en,
           round(sum(c.cantidad * c.costo_unitario_antes) / nullif(sum(c.cantidad), 0), 2) as antes,
           round(sum(c.cantidad * c.costo_unitario_despues) / nullif(sum(c.cantidad), 0), 2) as despues,
           (array_agg(c.motivo))[1] as motivo, (array_agg(c.persona_id))[1] as persona_id
      from retail.costo_correcciones c
     where c.producto_id = p_producto_id
     group by c.correccion_id, c.compra_en
  ),
  hoy as (
    select coalesce(sum(s.cantidad), 0)::int as stock,
           round(sum(s.cantidad * v.costo) / nullif(sum(s.cantidad), 0), 2) as costo
      from vars v
      left join retail.stock s on s.variante_id = v.id
  )
  select case when retail.fn_puede_ver_dinero_de_compras() then jsonb_build_object(
    'compras', coalesce((select jsonb_agg(jsonb_build_object(
        'fecha', c.created_at, 'origen', c.origen, 'llegaron', c.llegaron, 'costo_llegaron', c.costo_llegaron,
        'ya_habia', c.ya_habia, 'costo_antes', c.costo_antes, 'costo_despues', c.costo_despues,
        'documento', c.documento, 'proveedor', c.proveedor, 'persona', c.persona) order by c.created_at)
      from compras c), '[]'::jsonb),
    'hoy', (select jsonb_build_object('stock', h.stock, 'costo', h.costo) from hoy h),
    'correcciones', coalesce((select jsonb_agg(jsonb_build_object(
        'fecha', k.creado_en, 'compra', k.compra_en, 'antes', k.antes, 'despues', k.despues, 'motivo', k.motivo,
        'persona', nullif(btrim(coalesce(per.nombres, '') || ' ' || coalesce(per.apellidos, '')), '')) order by k.creado_en)
      from corr k left join public.personas per on per.id = k.persona_id), '[]'::jsonb),
    'puede_corregir', retail.fn_es_lider(),
    'inicio', jsonb_build_object(
      'fecha', (select p.created_at from retail.productos p where p.id = p_producto_id),
      'costo', (select round(avg(d.costo) filter (where d.costo > 0), 2) from declarado d))
  ) end;
$$;

revoke all on function retail.fn_costo_de_la_prenda(uuid) from public, anon;
grant execute on function retail.fn_costo_de_la_prenda(uuid) to authenticated;

comment on function retail.fn_costo_de_la_prenda(uuid) is
  'Pestaña «Costo» del Historial (2026-10-24; ADR-0515): cuánto cuesta hoy la prenda, cada compra o cierre del Taller que movió su costo (con el costo ya corregido, si se corrigió) y las correcciones hechas a mano, a nivel prenda. Null si la cuenta no ve el dinero de compras. `puede_corregir`: la cuenta es de un líder.';

-- ---------- 8. Validación final: si algo no quedó, se deshace todo ----------
do $v$
begin
  if (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'corregir_costo_de_compra') <> 1 then
    raise exception 'corregir costo: debe haber una sola corregir_costo_de_compra';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_costo_correcciones_inmutable' and not tgisinternal) then
    raise exception 'corregir costo: falta el candado de solo agregar';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'retail.costo_correcciones'::regclass) then
    raise exception 'corregir costo: la tabla quedó sin RLS';
  end if;
  if has_table_privilege('authenticated', 'retail.costo_correcciones', 'select') then
    raise exception 'corregir costo: la tabla no debe leerse directo';
  end if;
end
$v$;
