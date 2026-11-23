-- ============================================================================
-- 20261122193000_barrido_piso_confirmar.sql — CAYLA V2 · ADR-0690 «El barrido del piso» · actividad 5 · revisar y confirmar
-- Pega DESPUÉS de 20261122190000 (tablas), 20261122191000 (funciones) y 20261122192000 (bucket): lo comprueba la guarda.
--
-- EL PROBLEMA PRIMERO. El barrido ya junta lo que el equipo escaneó COLGADO. Falta lo que Felipe pidió al principio: que al final
-- diga cuántas hay en el piso y cuántas el sistema tenía en el almacén, y que lo corrija solo. Como el barrido escanea TODO lo
-- colgado, corrige en los dos sentidos (decisión de Felipe, 2026-11-22):
--   · las escaneadas que el sistema creía GUARDADAS pasan al piso;
--   · las que el sistema creía COLGADAS y nadie escaneó vuelven al almacén;
--   · lo escaneado que la sede no tiene en ningún lado NO se crea: queda «no cargado», con dónde lo tiene el sistema.
-- Todo con traslados internos (`mover_interno`): el total de la sede no cambia.
--
-- LA CUENTA, por prenda y con unidades LIBRES (lo apartado no se mueve). P = piso libre, A = almacén libre, S = lo escaneado que
-- sigue contando (sin lo quitado):
--   vuelve al almacén = max(0, P − S) · pasa al piso = min(max(0, S − P), A) · no cargada = max(0, S − P − A)
-- Es la de `cuadrar_piso` (ADR-0328) mirada desde el otro lado: aquí se escanea el piso, allá el almacén.
--
-- LO QUE NO SE TOCA (motivo de la línea):
--   · `se_movio`: la prenda tuvo CUALQUIER movimiento en el piso o el almacén de la sede después de abrir el barrido (una venta, una
--     bajada, un apartado, una recepción). Lo escaneado ya no se puede comparar con el sistema: corregirla movería de más. Se lista
--     para el barrido siguiente. Así el barrido se puede hacer con la tienda abierta sin mentir (revisión adversarial, actividad 2).
--   · `archivada` (la talla está desactivada) y `no_es_inventario` (la «Prenda sin registrar» o un producto de prueba).
--
-- QUÉ HACE. Dos columnas en `cuadres_piso` (el barrido confirmado ES un cuadre: Frescura, el plan del piso y el historial ya lo
-- entienden, y sus ítems van a `cuadre_piso_items` con el mismo disparador de coherencia) y cinco funciones:
--   · `fn_barrido_piso_calculo` (interna): la cuenta, una fila por prenda.
--   · `fn_barrido_piso_vista` (interna): el resumen y las líneas con algo que decir, cada no cargada con dónde la tiene el sistema.
--   · `previsualizar_barrido_piso(barrido)`: lo que va a pasar, sin mover nada (la MISMA cuenta que confirmar).
--   · `confirmar_barrido_piso(barrido, marca, todo_escaneado)`: mueve todo o nada, deja el cuadre y cierra el barrido.
--   · `cancelar_barrido_piso(barrido)`: lo descarta sin mover nada (lo escaneado queda como historia).
--
-- CÓMO SE PEGA EN PRODUCCIÓN. Sola, tal cual, fuera de hora punta. El `alter table cuadres_piso` agrega dos columnas con valor por
-- defecto constante (no reescribe la tabla) y toma un candado breve: va SIN políticas y con `lock_timeout = 3s` (si no consigue el
-- candado falla sin daño y se vuelve a pegar). El resto es `create or replace function` + `revoke` + `grant`. Idempotente.
-- Sin `select … into` dentro de textos entre comillas (ADR-0288).
--
-- SE ROMPE SI alguien mueve stock de un barrido sin pasar por confirmar_barrido_piso (perdería la cuenta bajo candado y el cuadre), o
-- si una pantalla confirma sin `p_todo_escaneado`: la vuelta al almacén solo vale si se escaneó TODO lo colgado.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $guarda$
begin
  if to_regclass('retail.barrido_piso_hallazgos') is null or to_regprocedure('retail.fn_barrido_piso_estado(uuid)') is null then
    raise exception 'Falta el barrido: pega antes 20261122190000_barrido_piso_tablas.sql y 20261122191000_barrido_piso_funciones.sql.';
  end if;
  if to_regclass('retail.cuadres_piso') is null or to_regprocedure('retail.fn_cuadre_piso_conteo_abierto(uuid)') is null then
    raise exception 'Falta el cuadre del piso (ADR-0328): pega antes 20261004200000 y 20261004200100.';
  end if;
  if to_regprocedure('retail.mover_interno(uuid, uuid, integer, uuid, uuid, text, uuid)') is null
     or to_regprocedure('retail.fn_bloquear_en_orden(uuid, uuid[], boolean, uuid[])') is null then
    raise exception 'Faltan mover_interno con marca o fn_bloquear_en_orden.';
  end if;
end;
$guarda$;

-- Un cuadre puede venir del almacén (cuadrar_piso: se escanea lo guardado) o del piso (un barrido confirmado: se escanea lo colgado).
alter table retail.cuadres_piso add column if not exists lado text not null default 'almacen' check (lado in ('almacen', 'piso'));
alter table retail.cuadres_piso add column if not exists barrido_id uuid unique references retail.barridos_piso (id);
comment on column retail.cuadres_piso.lado is 'ADR-0690: almacen = se escaneó lo guardado (Cuadrar el piso) · piso = se escaneó lo colgado (un barrido del piso confirmado).';
comment on column retail.cuadres_piso.barrido_id is 'ADR-0690: el barrido del piso que este cuadre confirmó (solo lado = piso). Un barrido se confirma una sola vez.';

-- ---------------------------------------------------------------------------
-- 1. La cuenta (interna).
-- ---------------------------------------------------------------------------
create or replace function retail.fn_barrido_piso_calculo(p_barrido_id uuid)
returns table (
  variante_id   uuid,
  motivo        text,
  almacen_libre integer,
  piso_libre    integer,
  apartadas     integer,
  escaneadas    integer,
  al_piso       integer,
  al_almacen    integer,
  no_cargadas   integer
)
language sql
stable
security definer
set search_path = retail, public, extensions
as $fn$
  with b as (
    select b.ubicacion_id as sede, b.abierto_en from barridos_piso b where b.id = p_barrido_id
  ),
  lugares as (
    select (select s.id from sububicaciones s, b where s.ubicacion_id = b.sede and s.tipo = 'piso_venta') as piso,
           (select s.id from sububicaciones s, b where s.ubicacion_id = b.sede and s.tipo = 'almacen_tienda') as almacen
  ),
  escaneo as (
    select l.variante_id, sum(l.cantidad)::integer as s
      from barrido_piso_lecturas l
     where l.barrido_id = p_barrido_id and l.anulada_en is null
     group by l.variante_id
  ),
  en_stock as (
    select st.variante_id,
           coalesce(sum(st.cantidad - st.cantidad_apartada) filter (where st.sububicacion_id = lu.almacen), 0) as a,
           coalesce(sum(st.cantidad - st.cantidad_apartada) filter (where st.sububicacion_id = lu.piso), 0) as p,
           coalesce(sum(st.cantidad_apartada), 0) as ap
      from stock st, b, lugares lu
     where st.ubicacion_id = b.sede and st.sububicacion_id in (lu.piso, lu.almacen)
     group by st.variante_id
  ),
  juntos as (
    select coalesce(k.variante_id, e.variante_id) as variante_id,
           greatest(coalesce(k.a, 0), 0)::integer as a,
           greatest(coalesce(k.p, 0), 0)::integer as p,
           coalesce(k.ap, 0)::integer as ap,
           coalesce(e.s, 0)::integer as s
      from en_stock k
      full join escaneo e on e.variante_id = k.variante_id
  ),
  movidas as (
    -- Lo que tocó el piso o el almacén de la sede después de abrir el barrido: lo escaneado ya no se compara con eso.
    select distinct m.variante_id
      from movimientos m, b, lugares lu
     where m.created_at > b.abierto_en
       and ((m.ubicacion_id = b.sede and m.sububicacion_id in (lu.piso, lu.almacen))
         or (m.ubicacion_destino_id = b.sede and m.sububicacion_destino_id in (lu.piso, lu.almacen)))
  ),
  clasificadas as (
    select j.variante_id, j.a, j.p, j.ap, j.s,
           case when j.variante_id = '22222222-2222-4222-8222-222222222222'
                  or pr.id = '11111111-1111-4111-8111-111111111111'
                  or pr.es_prueba then 'no_es_inventario'
                when not va.activo then 'archivada'
                when j.variante_id in (select mv.variante_id from movidas mv) then 'se_movio'
                else 'cuadra' end as motivo
      from juntos j
      join variantes va on va.id = j.variante_id
      join productos pr on pr.id = va.producto_id
     where j.a > 0 or j.p > 0 or j.ap > 0 or j.s > 0
  )
  select c.variante_id, c.motivo, c.a, c.p, c.ap, c.s,
         (case when c.motivo = 'cuadra' then least(greatest(0, c.s - c.p), c.a) else 0 end)::integer,
         (case when c.motivo = 'cuadra' then greatest(0, c.p - c.s) else 0 end)::integer,
         (case when c.motivo = 'cuadra' then greatest(0, c.s - c.p - c.a) else 0 end)::integer
    from clasificadas c;
$fn$;

comment on function retail.fn_barrido_piso_calculo(uuid) is
  'ADR-0690: la cuenta del barrido del piso por prenda, con unidades libres (P piso, A almacén, S escaneado sin lo quitado): al_almacen = max(0, P−S), al_piso = min(max(0, S−P), A), no_cargadas = max(0, S−P−A). No se mueven: lo que se movió después de abrir el barrido (se_movio), lo archivado, la centinela y lo de prueba. Interna.';

-- ---------------------------------------------------------------------------
-- 2. Lo que se muestra y se aplica (interna): el resumen y las líneas con algo que decir.
--    resumen.total = antes.piso + antes.almacen = despues.piso + despues.almacen (el total no cambia).
-- ---------------------------------------------------------------------------
create or replace function retail.fn_barrido_piso_vista(p_barrido_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $fn$
  with c as (select * from fn_barrido_piso_calculo(p_barrido_id)),
  sede as (select b.ubicacion_id as id from barridos_piso b where b.id = p_barrido_id),
  cuadran as (select * from c where c.motivo = 'cuadra')
  select jsonb_build_object(
    'resumen', jsonb_build_object(
      'antes', jsonb_build_object('piso', coalesce((select sum(piso_libre) from cuadran), 0), 'almacen', coalesce((select sum(almacen_libre) from cuadran), 0)),
      'despues', jsonb_build_object(
        'piso', coalesce((select sum(piso_libre + al_piso - al_almacen) from cuadran), 0),
        'almacen', coalesce((select sum(almacen_libre - al_piso + al_almacen) from cuadran), 0)),
      'total', coalesce((select sum(piso_libre + almacen_libre) from cuadran), 0),
      'escaneadas', coalesce((select sum(escaneadas) from c), 0),
      'prendas_al_piso', coalesce((select sum(al_piso) from c), 0),
      'prendas_al_almacen', coalesce((select sum(al_almacen) from c), 0),
      'lineas_al_piso', (select count(*) from c where al_piso > 0),
      'lineas_al_almacen', (select count(*) from c where al_almacen > 0),
      'prendas_no_cargadas', coalesce((select sum(no_cargadas) from c), 0),
      'lineas_no_cargadas', (select count(*) from c where no_cargadas > 0),
      'lineas_se_movieron', (select count(*) from c where motivo = 'se_movio'),
      'aparte', coalesce((select sum(h.cantidad) from barrido_piso_hallazgos h where h.barrido_id = p_barrido_id and h.anulada_en is null), 0),
      'lado', 'piso'),
    'lineas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'variante_id', c.variante_id,
               'prenda', coalesce(fn_prenda_corta(c.variante_id), 'Una prenda'),
               'motivo', c.motivo,
               'escaneadas', c.escaneadas, 'piso', c.piso_libre, 'almacen', c.almacen_libre,
               'al_piso', c.al_piso, 'al_almacen', c.al_almacen, 'no_cargadas', c.no_cargadas,
               -- Dónde la tiene el sistema, para lo que no está en la sede: las otras sedes y lo que viene en camino hacia aquí.
               'otras_sedes', case when c.no_cargadas > 0 then coalesce((
                   select jsonb_agg(jsonb_build_object('sede', u.nombre, 'cantidad', t.n) order by t.n desc, u.nombre)
                     from (select st.ubicacion_id, sum(st.cantidad)::integer as n from stock st, sede
                            where st.variante_id = c.variante_id and st.ubicacion_id <> sede.id and st.cantidad > 0
                            group by st.ubicacion_id) t
                     join ubicaciones u on u.id = t.ubicacion_id), '[]'::jsonb) else '[]'::jsonb end,
               'en_camino', case when c.no_cargadas > 0 then coalesce((
                   select sum(ti.cantidad)::integer from transferencias tr join transferencia_items ti on ti.transferencia_id = tr.id, sede
                    where tr.estado = 'en_transito' and tr.ubicacion_destino_id = sede.id and ti.variante_id = c.variante_id), 0) else 0 end)
             order by c.variante_id)
        from c
       where c.al_piso > 0 or c.al_almacen > 0 or c.no_cargadas > 0 or c.motivo in ('se_movio', 'archivada')
          or (c.motivo = 'no_es_inventario' and c.escaneadas > 0)), '[]'::jsonb));
$fn$;

comment on function retail.fn_barrido_piso_vista(uuid) is
  'ADR-0690: el resumen del barrido del piso (antes y después, cuántas pasan al piso y vuelven al almacén, no cargadas, las que se movieron) y sus líneas; cada no cargada con las otras sedes que la tienen y lo que viene en camino. La usan previsualizar y confirmar: una sola cuenta. Interna.';

-- ---------------------------------------------------------------------------
-- 3. Revisar: lo que va a pasar, sin mover nada.
-- ---------------------------------------------------------------------------
create or replace function retail.previsualizar_barrido_piso(p_barrido_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_sede uuid;
  v_estado text;
  r record;
begin
  for r in select b.ubicacion_id, b.estado from barridos_piso b where b.id = p_barrido_id loop
    v_sede := r.ubicacion_id;
    v_estado := r.estado;
  end loop;
  if v_sede is null then
    raise exception 'Ese barrido no existe.' using hint = 'barrido_no_existe';
  end if;
  if not ((fn_es_lider() or fn_ve_modulo('existencias')) and fn_puede_operar_ubicacion(v_sede)) then
    raise exception 'Para ver el barrido del piso hace falta ver Existencias en tu rol y que sea tu sede.'
      using errcode = '42501', hint = 'barrido_sin_permiso';
  end if;
  return fn_barrido_piso_vista(p_barrido_id) || jsonb_build_object(
    'estado', v_estado,
    'conteo_abierto', fn_cuadre_piso_conteo_abierto(v_sede),
    'ultima_lectura', (select max(l.leida_en) from barrido_piso_lecturas l where l.barrido_id = p_barrido_id));
end;
$fn$;

comment on function retail.previsualizar_barrido_piso(uuid) is
  'ADR-0690: lo que el barrido del piso va a mover, sin mover nada (la misma cuenta que confirmar), con el conteo abierto de la sede si lo hay y la hora de la última lectura. Quien ve Existencias en la sede (o el líder).';

-- La respuesta de un barrido confirmado (interna): el resumen tal como se aplicó, quién y cuándo.
create or replace function retail.fn_barrido_piso_respuesta(p_cuadre_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $fn$
  select jsonb_build_object('cuadre_id', c.id, 'barrido_id', c.barrido_id, 'confirmado_en', c.created_at,
                            'por', fn_actividad_nombre(c.persona_id), 'resumen', c.resumen, 'no_cargado', c.no_cargado)
    from cuadres_piso c where c.id = p_cuadre_id;
$fn$;

-- ---------------------------------------------------------------------------
-- 4. Confirmar: todo o nada.
--    PROMETE: o se mueven todas las líneas de la cuenta (y quedan el cuadre, sus ítems y el barrido confirmado), o nada. El mismo
--             intento reenviado devuelve el MISMO resultado (ya_registrado) sin mover nada.
--    ASUME:   se escaneó TODO lo colgado (p_todo_escaneado: sin eso, «vuelve al almacén» no vale); la sede no tiene un conteo abierto.
-- ---------------------------------------------------------------------------
create or replace function retail.confirmar_barrido_piso(p_barrido_id uuid, p_token uuid, p_todo_escaneado boolean)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  c_nota_mov constant text := 'Barrido del piso';
  v_sede uuid;
  v_estado text;
  v_abierto_en timestamptz;
  v_prev cuadres_piso%rowtype;
  v_actor uuid;
  v_piso uuid;
  v_almacen uuid;
  v_conteo jsonb;
  v_vista jsonb;
  v_id uuid;
  v_mov uuid;
  r record;
begin
  if p_token is null then
    raise exception 'Falta la marca de este intento. Recarga la página.' using hint = 'barrido_sin_token';
  end if;
  -- Candado 1: la marca. Un segundo clic espera aquí y, al soltarse, encuentra el barrido ya confirmado.
  perform pg_advisory_xact_lock(hashtextextended('barrido_piso_confirmar:' || p_token::text, 0));
  for v_prev in select * from cuadres_piso c where c.token_cliente = p_token loop
    if v_prev.barrido_id is distinct from p_barrido_id then
      raise exception 'Ese intento ya se guardó con otros datos: no se repitió nada.' using hint = 'barrido_token_reusado';
    end if;
    return fn_barrido_piso_respuesta(v_prev.id) || jsonb_build_object('ya_registrado', true);
  end loop;

  -- Candado 2: el barrido, en exclusiva (nadie sube ni quita lecturas mientras se confirma; lo que llegue después se rechaza).
  for r in select b.ubicacion_id, b.estado, b.abierto_en from barridos_piso b where b.id = p_barrido_id for update loop
    v_sede := r.ubicacion_id;
    v_estado := r.estado;
    v_abierto_en := r.abierto_en;
  end loop;
  if v_sede is null then
    raise exception 'Ese barrido no existe.' using hint = 'barrido_no_existe';
  end if;
  if not fn_ve_modulo('existencias') then
    raise exception 'Confirmar el barrido del piso necesita el módulo Existencias en tu rol.' using errcode = '42501', hint = 'barrido_sin_modulo';
  end if;
  if not fn_puede_operar_ubicacion(v_sede) then
    raise exception 'No tienes permiso para mover mercadería en esa sede.' using errcode = '42501', hint = 'barrido_sin_tienda';
  end if;
  if v_estado <> 'abierto' then
    raise exception 'Este barrido ya se cerró.' using hint = 'barrido_cerrado';
  end if;
  if p_todo_escaneado is not true then
    raise exception 'Confirma que se escaneó TODO lo colgado: lo que nadie escaneó vuelve al almacén.' using hint = 'barrido_falta_todo';
  end if;
  v_actor := fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación.' using hint = 'responsable_requerido';
  end if;

  -- Candado 3: la sede, el mismo de cuadrar_piso (un barrido y un cuadre del almacén no se confirman a la vez).
  perform pg_advisory_xact_lock(hashtextextended('cuadre_piso_sede:' || v_sede::text, 0));
  v_piso := (select s.id from sububicaciones s where s.ubicacion_id = v_sede and s.tipo = 'piso_venta');
  v_almacen := (select s.id from sububicaciones s where s.ubicacion_id = v_sede and s.tipo = 'almacen_tienda');

  -- Candado 4 (ADR-0190): el stock del piso y del almacén de la sede, en orden de prenda (las que tienen stock y las escaneadas).
  perform fn_bloquear_en_orden(
    v_sede,
    array(select st.variante_id from stock st where st.ubicacion_id = v_sede and st.sububicacion_id in (v_piso, v_almacen)
          union
          select l.variante_id from barrido_piso_lecturas l where l.barrido_id = p_barrido_id and l.anulada_en is null),
    true);

  -- Un conteo abierto en la sede corregiría otra vez lo mismo al cerrarse.
  v_conteo := fn_cuadre_piso_conteo_abierto(v_sede);
  if v_conteo is not null then
    raise exception 'Hay un conteo abierto en esta sede (Conteo %). Ciérralo o cancélalo en Conteo antes de confirmar el barrido. No se movió nada.',
      v_conteo ->> 'numero'
      using hint = 'barrido_conteo_abierto', detail = v_conteo::text;
  end if;

  -- La cuenta, bajo candado: la MISMA que mostró «Revisar», con el stock de este instante.
  v_vista := fn_barrido_piso_vista(p_barrido_id);

  insert into cuadres_piso (ubicacion_id, persona_id, token_cliente, huella, escaneo_desde, resumen, no_cargado, nota, lado, barrido_id)
    values (v_sede, v_actor, p_token, md5(p_barrido_id::text || '|' || p_token::text), v_abierto_en, v_vista -> 'resumen',
            coalesce((select jsonb_agg(jsonb_build_object('variante_id', l -> 'variante_id', 'prenda', l -> 'prenda',
                                                          'escaneadas', l -> 'escaneadas', 'almacen', l -> 'almacen', 'piso', l -> 'piso',
                                                          'no_cargadas', l -> 'no_cargadas', 'otras_sedes', l -> 'otras_sedes',
                                                          'en_camino', l -> 'en_camino')
                                       order by l ->> 'variante_id')
                        from jsonb_array_elements(v_vista -> 'lineas') l
                       where (l ->> 'no_cargadas')::integer > 0), '[]'::jsonb),
            'Barrido del piso', 'piso', p_barrido_id)
    returning id into v_id;

  -- Cada línea, en orden de prenda (el mismo de los candados). Una prenda se mueve en UNA dirección (lo hace cumplir la cuenta y
  -- unique (cuadre_id, variante_id)).
  for r in
    select (l ->> 'variante_id')::uuid as v, (l ->> 'al_piso')::integer as baja, (l ->> 'al_almacen')::integer as sube
      from jsonb_array_elements(v_vista -> 'lineas') l
     where (l ->> 'al_piso')::integer > 0 or (l ->> 'al_almacen')::integer > 0
     order by 1
  loop
    if r.baja > 0 then
      v_mov := mover_interno(v_sede, r.v, r.baja, v_almacen, v_piso, c_nota_mov, null);
      insert into cuadre_piso_items (movimiento_id, cuadre_id, variante_id, sentido, cantidad) values (v_mov, v_id, r.v, 'al_piso', r.baja);
    else
      v_mov := mover_interno(v_sede, r.v, r.sube, v_piso, v_almacen, c_nota_mov, null);
      insert into cuadre_piso_items (movimiento_id, cuadre_id, variante_id, sentido, cantidad) values (v_mov, v_id, r.v, 'al_almacen', r.sube);
    end if;
  end loop;

  update barridos_piso set estado = 'confirmado', cerrado_por = v_actor, cerrado_en = clock_timestamp() where id = p_barrido_id;

  return fn_barrido_piso_respuesta(v_id) || jsonb_build_object('ya_registrado', false);
end;
$fn$;

comment on function retail.confirmar_barrido_piso(uuid, uuid, boolean) is
  'ADR-0690: confirma el barrido del piso, todo o nada: lo escaneado que el sistema creía guardado pasa al piso, lo que creía colgado y nadie escaneó vuelve al almacén (traslados internos: el total no cambia), deja el cuadre (lado piso) y cierra el barrido. Exige p_todo_escaneado. No toca lo que se movió después de abrir el barrido. Quien ve Existencias en la sede, firmado por el responsable. La misma marca devuelve el mismo resultado.';

-- ---------------------------------------------------------------------------
-- 5. Descartar el barrido sin mover nada (lo escaneado queda como historia).
-- ---------------------------------------------------------------------------
create or replace function retail.cancelar_barrido_piso(p_barrido_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_sede uuid;
  v_estado text;
  v_actor uuid;
  r record;
begin
  for r in select b.ubicacion_id, b.estado from barridos_piso b where b.id = p_barrido_id for update loop
    v_sede := r.ubicacion_id;
    v_estado := r.estado;
  end loop;
  if v_sede is null then
    raise exception 'Ese barrido no existe.' using hint = 'barrido_no_existe';
  end if;
  if not fn_ve_modulo('existencias') then
    raise exception 'El barrido del piso necesita el módulo Existencias en tu rol.' using errcode = '42501', hint = 'barrido_sin_modulo';
  end if;
  if not fn_puede_operar_ubicacion(v_sede) then
    raise exception 'No tienes permiso para mover mercadería en esa sede.' using errcode = '42501', hint = 'barrido_sin_tienda';
  end if;
  if v_estado <> 'abierto' then
    raise exception 'Este barrido ya se cerró.' using hint = 'barrido_cerrado';
  end if;
  v_actor := fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación.' using hint = 'responsable_requerido';
  end if;
  update barridos_piso set estado = 'cancelado', cerrado_por = v_actor, cerrado_en = clock_timestamp() where id = p_barrido_id;
  return jsonb_build_object('cancelado', true);
end;
$fn$;

comment on function retail.cancelar_barrido_piso(uuid) is
  'ADR-0690: descarta un barrido abierto sin mover nada; lo escaneado queda como historia. Quien ve Existencias en la sede, firmado por el responsable.';

revoke all on function retail.fn_barrido_piso_calculo(uuid) from public, anon, authenticated;
revoke all on function retail.fn_barrido_piso_vista(uuid) from public, anon, authenticated;
revoke all on function retail.fn_barrido_piso_respuesta(uuid) from public, anon, authenticated;
revoke all on function retail.previsualizar_barrido_piso(uuid) from public, anon;
grant execute on function retail.previsualizar_barrido_piso(uuid) to authenticated;
revoke all on function retail.confirmar_barrido_piso(uuid, uuid, boolean) from public, anon;
grant execute on function retail.confirmar_barrido_piso(uuid, uuid, boolean) to authenticated;
revoke all on function retail.cancelar_barrido_piso(uuid) from public, anon;
grant execute on function retail.cancelar_barrido_piso(uuid) to authenticated;

notify pgrst, 'reload schema';

reset lock_timeout;
