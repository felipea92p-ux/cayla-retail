-- ============================================================================
-- 20261122194500_barrido_piso_correcciones.sql — CAYLA V2 · ADR-0690 «El barrido del piso» · lo que encontró la revisión adversarial
-- Pega DESPUÉS de 20261122193000_barrido_piso_confirmar.sql (redefine sus funciones): lo comprueba la guarda. No depende de «Por resolver»
-- (20261122195000, actividad 8): se pega antes y sola, para publicar las actividades 1 a 7 con lo corregido (Felipe, 2026-11-23).
--
-- EL PROBLEMA PRIMERO. Una revisión adversarial de las actividades 3 a 7 (16 revisores, cada hallazgo reproducido en un Postgres local
-- con ROLLBACK) encontró que la cuenta y sus vecinos podían dejar el stock mal o trabar una pantalla. Lo que arregla esta migración:
--   1. UNA PRENDA APARTADA QUE SIGUE COLGADA. La cuenta comparaba lo escaneado (que la incluye) con el piso LIBRE (que no): una blusa
--      apartada y escaneada «pasaba al piso» desde el almacén aunque nadie la moviera, y el sistema quedaba con una de más colgada y una
--      de menos guardada. Ahora lo escaneado se compara también con lo apartado del piso: al_piso = min(max(0, S − P − Ap), A) y
--      no_cargadas = max(0, S − P − Ap − A). «Vuelve al almacén» sigue siendo max(0, P − S): conservador, solo lo libre que nadie vio.
--   2. TIENDA LIM, DOS DUEÑOS (ADR-0542). Si la fila de donde sale una prenda tiene unidades libres de CAYLA y de CLAURE, el traslado
--      interno no sabe de cuál es y la base frena TODO el barrido (elegir_dueno). Qué dueño vuelve al almacén lo decide una persona: la
--      línea sale con el motivo nuevo «dos_duenos», no se mueve y se lista para moverla en Existencias, donde se elige. El barrido sigue.
--      (El 2026-11-23, en producción, ninguna fila de Lima mezcla los dos dueños: hoy no frena nada.)
--   3. UN BARRIDO VACÍO. Sin una sola lectura vigente, confirmar mandaría todo el piso al almacén. Se rechaza (barrido_vacio).
--   4. «REVISAR» VIEJO, «CONFIRMAR» NUEVO. Lo que alguien escaneó o quitó mientras otra persona revisaba entraba a la cuenta sin que
--      quien confirma lo viera. Ahora «Revisar» devuelve una huella de lo escaneado (`fn_barrido_piso_huella`) y confirmar la exige: si
--      cambió, rechaza (barrido_cambio) sin mover nada y la pantalla vuelve a mostrar la cuenta. Confirmar pasa a tener 4 parámetros;
--      la versión de 3 se quita (ninguna pantalla publicada la llama: el barrido aún no está publicado).
--   5. CUARENTENA. Una prenda colgada que la sede tiene en su cuarentena salía «No está en ninguna tienda». La no cargada ahora dice
--      cuántas hay en cuarentena aquí (`en_cuarentena`). No se mueve nada: la cuarentena sigue fuera de la cuenta.
--   6. CUADRAR EL PISO. El resumen de un barrido no traía las claves del resumen de un cuadre (prendas_escaneadas, apartadas, archivadas,
--      escaneadas_fuera, danadas) y Cuadrar no lo sabía leer. Ahora las trae.
--   7. ELIMINAR UN PRODUCTO. Lo escaneado en un barrido es historia que no se borra: renglón nuevo en `fn_producto_historia` (27,
--      borrable = false). Catálogo ofrece «Desactivar» y lo dice, en vez de fallar con la llave. (Lo resuelto de un barrido, el 28, lo
--      suma «Por resolver», 20261122195000.)
--   8. FUSIONAR PRODUCTOS. Una talla que se junta y está en un barrido ABIERTO frena la fusión (junta_barrido), como un conteo abierto:
--      lo escaneado de la juntada se quedaría sin cuenta; y una talla vacía en un barrido abierto no se ofrece para sacar de la venta.
--      Lo de un barrido cerrado es historia y se queda en la juntada.
--
-- QUÉ NO CAMBIA. Las tablas y los permisos. Los demás motivos (se_movio, archivada, no_es_inventario) y su orden.
--
-- CÓMO SE PEGA EN PRODUCCIÓN. Sola, a cualquier hora: funciones (create or replace), un `drop function` de la firma vieja de confirmar
-- (no toma las tablas de auth ni storage, ADR-0195) y dos reemplazos ANCLADOS (si el texto vivo no es el esperado, aborta sin cambiar
-- nada). Ni tablas, ni políticas, ni disparadores. Idempotente. Sin `select … into` dentro de textos entre comillas (ADR-0288).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $guarda$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'retail' and table_name = 'cuadres_piso' and column_name = 'barrido_id') then
    raise exception 'Falta cuadres_piso.barrido_id: pega antes 20261122193000_barrido_piso_confirmar.sql.';
  end if;
  if to_regprocedure('retail.fn_reparto_de_la_fila(uuid, uuid, uuid)') is null or to_regprocedure('retail.fn_sede_con_dos_empresas(uuid)') is null then
    raise exception 'Faltan fn_reparto_de_la_fila o fn_sede_con_dos_empresas (ADR-0542).';
  end if;
end;
$guarda$;

-- ---------------------------------------------------------------------------
-- 1 y 2. La cuenta: lo apartado colgado y las filas con dos dueños.
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
    select b.ubicacion_id as sede, b.abierto_en, fn_sede_con_dos_empresas(b.ubicacion_id) as dos from barridos_piso b where b.id = p_barrido_id
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
           coalesce(sum(st.cantidad_apartada), 0) as ap,
           -- Lo apartado que sigue COLGADO: una prenda apartada en el piso se escanea como cualquier otra.
           coalesce(sum(st.cantidad_apartada) filter (where st.sububicacion_id = lu.piso), 0) as ap_piso
      from stock st, b, lugares lu
     where st.ubicacion_id = b.sede and st.sububicacion_id in (lu.piso, lu.almacen)
     group by st.variante_id
  ),
  juntos as (
    select coalesce(k.variante_id, e.variante_id) as variante_id,
           greatest(coalesce(k.a, 0), 0)::integer as a,
           greatest(coalesce(k.p, 0), 0)::integer as p,
           coalesce(k.ap, 0)::integer as ap,
           greatest(coalesce(k.ap_piso, 0), 0)::integer as ap_piso,
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
    select j.variante_id, j.a, j.p, j.ap, j.ap_piso, j.s,
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
  ),
  cuenta as (
    select c.*,
           (case when c.motivo = 'cuadra' then least(greatest(0, c.s - c.p - c.ap_piso), c.a) else 0 end)::integer as baja,
           (case when c.motivo = 'cuadra' then greatest(0, c.p - c.s) else 0 end)::integer as sube,
           (case when c.motivo = 'cuadra' then greatest(0, c.s - c.p - c.ap_piso - c.a) else 0 end)::integer as falta
      from clasificadas c
  ),
  -- En una sede con dos empresas, la fila de donde SALE la prenda no puede tener unidades libres de dos dueños: el traslado interno no
  -- sabría de cuál es. Esa línea no se mueve (lo decide una persona en Existencias).
  con_duenos as (
    select k.*,
           (b.dos and ((k.baja > 0 and (select count(*) from fn_reparto_de_la_fila(k.variante_id, b.sede, lu.almacen) r
                                         where r.cantidad - r.cantidad_apartada > 0) > 1)
                    or (k.sube > 0 and (select count(*) from fn_reparto_de_la_fila(k.variante_id, b.sede, lu.piso) r
                                         where r.cantidad - r.cantidad_apartada > 0) > 1))) as mezcla
      from cuenta k, b, lugares lu
  )
  select d.variante_id, case when d.mezcla then 'dos_duenos' else d.motivo end, d.a, d.p, d.ap, d.s,
         case when d.mezcla then 0 else d.baja end,
         case when d.mezcla then 0 else d.sube end,
         d.falta
    from con_duenos d;
$fn$;

comment on function retail.fn_barrido_piso_calculo(uuid) is
  'ADR-0690: la cuenta del barrido del piso por prenda (P piso libre, A almacén libre, Ap apartado colgado, S escaneado sin lo quitado): al_almacen = max(0, P−S), al_piso = min(max(0, S−P−Ap), A), no_cargadas = max(0, S−P−Ap−A). No se mueven: lo que se movió después de abrir el barrido (se_movio), lo archivado, la centinela y lo de prueba, y en una sede con dos empresas la línea cuya fila de origen tiene unidades libres de dos dueños (dos_duenos). Interna. Corregida en 20261122194500.';

-- ---------------------------------------------------------------------------
-- 4. La huella de lo escaneado: cambia si alguien sube, quita o aparta algo.
-- ---------------------------------------------------------------------------
create or replace function retail.fn_barrido_piso_huella(p_barrido_id uuid)
returns text
language sql
stable
security definer
set search_path = retail, public, extensions
as $fn$
  select md5(concat_ws('|',
    (select count(*) || ':' || coalesce(sum(l.cantidad), 0) || ':' || count(*) filter (where l.anulada_en is not null)
            || ':' || coalesce(max(l.leida_en)::text, '') || ':' || coalesce(max(l.anulada_en)::text, '')
       from barrido_piso_lecturas l where l.barrido_id = p_barrido_id),
    (select count(*) || ':' || coalesce(sum(h.cantidad), 0) || ':' || count(*) filter (where h.anulada_en is not null)
       from barrido_piso_hallazgos h where h.barrido_id = p_barrido_id)));
$fn$;

comment on function retail.fn_barrido_piso_huella(uuid) is
  'ADR-0690 (20261122194500): la huella de lo escaneado y lo apartado en un barrido (cuántas, cuánto, lo quitado y la última hora). «Revisar» la devuelve y confirmar la exige igual: lo que alguien escaneó mientras otra persona revisaba no entra sin que se vea. Interna.';

-- ---------------------------------------------------------------------------
-- 5 y 6. La vista: cuarentena en las no cargadas, la línea de dos dueños y el resumen con las claves del cuadre.
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
  cuadran as (select * from c where c.motivo = 'cuadra'),
  archivadas as (select * from c where c.motivo = 'archivada')
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
      'lineas_dos_duenos', (select count(*) from c where motivo = 'dos_duenos'),
      'aparte', coalesce((select sum(h.cantidad) from barrido_piso_hallazgos h where h.barrido_id = p_barrido_id and h.anulada_en is null), 0),
      -- Las claves del resumen de un cuadre (Cuadrar el piso lee los dos con la misma pieza).
      'prendas_escaneadas', coalesce((select sum(escaneadas) from c), 0),
      'apartadas', coalesce((select sum(apartadas) from c), 0),
      'archivadas', jsonb_build_object('lineas', (select count(*) from archivadas),
                                       'almacen', coalesce((select sum(almacen_libre) from archivadas), 0),
                                       'piso', coalesce((select sum(piso_libre) from archivadas), 0)),
      'escaneadas_fuera', 0,
      'danadas', 0,
      'lado', 'piso'),
    'lineas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'variante_id', c.variante_id,
               'prenda', coalesce(fn_prenda_corta(c.variante_id), 'Una prenda'),
               'motivo', c.motivo,
               'escaneadas', c.escaneadas, 'piso', c.piso_libre, 'almacen', c.almacen_libre,
               'al_piso', c.al_piso, 'al_almacen', c.al_almacen, 'no_cargadas', c.no_cargadas,
               -- Dónde la tiene el sistema, para lo que no está en la sede: las otras sedes, lo que viene en camino hacia aquí y lo que
               -- esta sede tiene en su cuarentena (no se vende: por eso no cuenta en el piso ni en el almacén).
               'otras_sedes', case when c.no_cargadas > 0 then coalesce((
                   select jsonb_agg(jsonb_build_object('sede', u.nombre, 'cantidad', t.n) order by t.n desc, u.nombre)
                     from (select st.ubicacion_id, sum(st.cantidad)::integer as n from stock st, sede
                            where st.variante_id = c.variante_id and st.ubicacion_id <> sede.id and st.cantidad > 0
                            group by st.ubicacion_id) t
                     join ubicaciones u on u.id = t.ubicacion_id), '[]'::jsonb) else '[]'::jsonb end,
               'en_camino', case when c.no_cargadas > 0 then coalesce((
                   select sum(ti.cantidad)::integer from transferencias tr join transferencia_items ti on ti.transferencia_id = tr.id, sede
                    where tr.estado = 'en_transito' and tr.ubicacion_destino_id = sede.id and ti.variante_id = c.variante_id), 0) else 0 end,
               'en_cuarentena', case when c.no_cargadas > 0 then coalesce((
                   select sum(st.cantidad)::integer from stock st join sububicaciones sb on sb.id = st.sububicacion_id, sede
                    where st.ubicacion_id = sede.id and sb.tipo = 'cuarentena' and st.variante_id = c.variante_id), 0) else 0 end)
             order by c.variante_id)
        from c
       where c.al_piso > 0 or c.al_almacen > 0 or c.no_cargadas > 0 or c.motivo in ('se_movio', 'archivada', 'dos_duenos')
          or (c.motivo = 'no_es_inventario' and c.escaneadas > 0)), '[]'::jsonb));
$fn$;

comment on function retail.fn_barrido_piso_vista(uuid) is
  'ADR-0690: el resumen del barrido del piso (antes y después, cuántas pasan al piso y vuelven al almacén, no cargadas, las que se movieron, las de dos dueños, y las claves del resumen de un cuadre) y sus líneas; cada no cargada con las otras sedes que la tienen, lo que viene en camino y lo que la sede tiene en cuarentena. La usan previsualizar y confirmar: una sola cuenta. Interna. Corregida en 20261122194500.';

-- ---------------------------------------------------------------------------
-- 4. Revisar devuelve la huella.
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
    'ultima_lectura', (select max(l.leida_en) from barrido_piso_lecturas l where l.barrido_id = p_barrido_id),
    'huella', fn_barrido_piso_huella(p_barrido_id));
end;
$fn$;

comment on function retail.previsualizar_barrido_piso(uuid) is
  'ADR-0690: lo que el barrido del piso va a mover, sin mover nada (la misma cuenta que confirmar), con el conteo abierto de la sede si lo hay, la hora de la última lectura y la huella de lo escaneado que confirmar exige. Quien ve Existencias en la sede (o el líder).';

-- ---------------------------------------------------------------------------
-- 3 y 4. Confirmar: no vacío y con la huella de lo que se revisó.
-- ---------------------------------------------------------------------------
drop function if exists retail.confirmar_barrido_piso(uuid, uuid, boolean);

create or replace function retail.confirmar_barrido_piso(p_barrido_id uuid, p_token uuid, p_todo_escaneado boolean, p_huella text)
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
  -- Sin una sola prenda escaneada, «vuelve al almacén» mandaría todo el piso: eso no es un barrido.
  if not exists (select 1 from barrido_piso_lecturas l where l.barrido_id = p_barrido_id and l.anulada_en is null) then
    raise exception 'Este barrido no tiene ninguna prenda escaneada: no hay nada que confirmar. Escanea lo colgado o descártalo.'
      using hint = 'barrido_vacio';
  end if;
  -- Lo que se revisó tiene que ser lo que hay: alguien pudo escanear o quitar algo mientras se revisaba (bajo el candado del barrido).
  if p_huella is null or p_huella <> fn_barrido_piso_huella(p_barrido_id) then
    raise exception 'Alguien escaneó o quitó prendas mientras revisabas. Mira la cuenta nueva antes de confirmar. No se movió nada.'
      using hint = 'barrido_cambio';
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
                                                          'en_camino', l -> 'en_camino', 'en_cuarentena', l -> 'en_cuarentena')
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

comment on function retail.confirmar_barrido_piso(uuid, uuid, boolean, text) is
  'ADR-0690: confirma el barrido del piso, todo o nada: lo escaneado que el sistema creía guardado pasa al piso, lo que creía colgado y nadie escaneó vuelve al almacén (traslados internos: el total no cambia), deja el cuadre (lado piso) y cierra el barrido. Exige p_todo_escaneado, al menos una lectura vigente (barrido_vacio) y la huella de lo que se revisó (barrido_cambio si alguien escaneó o quitó algo mientras tanto). No toca lo que se movió después de abrir el barrido ni las filas con dos dueños. Quien ve Existencias en la sede, firmado por el responsable. La misma marca devuelve el mismo resultado.';

revoke all on function retail.fn_barrido_piso_huella(uuid) from public, anon, authenticated;
revoke all on function retail.fn_barrido_piso_calculo(uuid) from public, anon, authenticated;
revoke all on function retail.fn_barrido_piso_vista(uuid) from public, anon, authenticated;
revoke all on function retail.previsualizar_barrido_piso(uuid) from public, anon;
grant execute on function retail.previsualizar_barrido_piso(uuid) to authenticated;
revoke all on function retail.confirmar_barrido_piso(uuid, uuid, boolean, text) from public, anon;
grant execute on function retail.confirmar_barrido_piso(uuid, uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7 y 8. Los vecinos: eliminar y fusionar productos (reemplazos ANCLADOS).
-- ---------------------------------------------------------------------------
-- `p_marca`: un pedazo del texto nuevo que no cambia aunque otra migración siga parchando la misma función (20261122195000 agrega el
-- renglón 28 justo después del 27): volver a pegar esta migración no hace nada.
create or replace function pg_temp.reemplazar_barrido(p_firma text, p_marca text, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_marca in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: se esperaba 1 aparición del ancla y hay %. No se cambió nada.', p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- 7. Lo escaneado en un barrido es historia: frena el borrado y Catálogo ofrece «Desactivar».
select pg_temp.reemplazar_barrido('retail.fn_producto_historia(uuid)', $m$'lecturas de un barrido del piso'$m$,
$v$        from retail.orden_compra_items x where x.producto_id = p_producto_id
    ) h$v$,
$n$        from retail.orden_compra_items x where x.producto_id = p_producto_id
      -- ADR-0690: lo escaneado en un barrido del piso (quién y a qué hora) no se borra nunca.
      union all select 27, 'lecturas de un barrido del piso', count(*), false
        from retail.barrido_piso_lecturas x where x.variante_id in (select id from vs)
    ) h$n$);

-- 8. Una talla que se junta y está en un barrido ABIERTO frena la fusión, como un conteo abierto.
select pg_temp.reemplazar_barrido('retail.fn_fusion_productos_plan(uuid,uuid[],jsonb)', $m$'junta_barrido'$m$,
$v$está en un conteo abierto. Ciérralo antes de fusionar.');
    end if;$v$,
$n$está en un conteo abierto. Ciérralo antes de fusionar.');
    end if;
    -- ADR-0690: lo escaneado de la juntada en un barrido del piso ABIERTO se quedaría sin cuenta (la juntada se desactiva).
    if exists (select 1 from retail.barrido_piso_lecturas bl join retail.barridos_piso bp on bp.id = bl.barrido_id
                where bl.variante_id = r.variante_id and bp.estado = 'abierto' and bl.anulada_en is null) then
      v_bloqueos := v_bloqueos || jsonb_build_object('codigo', 'junta_barrido', 'variante_id', r.variante_id, 'producto_id', r.producto_id,
        'mensaje', '«' || r.referencia || ' ' || r.nombre || '» está en un barrido del piso abierto. Confírmalo o descártalo antes de fusionar.');
    end if;$n$);

-- 8 (b). Tampoco se ofrece «sacar de la venta» una talla vacía que está en un barrido ABIERTO (revisión adversarial, 2026-11-23): se
-- apagaría y lo escaneado de ella dejaría de contar como «no cargada» sin aviso. Va junto a la condición del conteo abierto.
select pg_temp.reemplazar_barrido('retail.fn_fusion_productos_plan(uuid,uuid[],jsonb)', $m$bl.variante_id = x.variante_id$m$,
$v$where ci.variante_id = x.variante_id and co.estado = 'abierto'))));$v$,
$n$where ci.variante_id = x.variante_id and co.estado = 'abierto')
              or exists (select 1 from retail.barrido_piso_lecturas bl join retail.barridos_piso bp on bp.id = bl.barrido_id
                          where bl.variante_id = x.variante_id and bp.estado = 'abierto' and bl.anulada_en is null))));$n$);

reset lock_timeout;

notify pgrst, 'reload schema';
