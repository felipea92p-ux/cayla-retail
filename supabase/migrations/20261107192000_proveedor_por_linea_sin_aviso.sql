-- ============================================================================
-- 20261107192000_proveedor_por_linea_sin_aviso.sql — CAYLA V2 · ADR-0393 (act. 2026-11-07 c)
-- Recibir sin aviso: cada categoría y marca que se cuenta es de SU proveedor; el envío ya no es de uno solo.
--
-- EL PROBLEMA PRIMERO. Lo que llega sin aviso casi nunca es de un solo proveedor (Felipe, prueba del 2026-11-07): un fardo trae Miramhe de uno, AELO de
-- otro y prendas sin marca. Pero el envío sin aviso guardaba UN proveedor (`despachos_sin_aviso.proveedor_id`), la puerta lo preguntaba antes de contar,
-- todo lo contado tenía que ser de él (`guardar_conteo_envio` rechazaba otro con `recepcion_extra_proveedor`) y el cierre pedía uno solo. Quien recibía
-- tenía que mentir, o abrir un envío por proveedor y repartir el fardo antes de contarlo.
--
-- QUÉ CAMBIA (solo en un envío SIN AVISO; los de Compras siguen igual, su proveedor es el de sus órdenes)
--   1. `guardar_conteo_envio`: lo de fuera de la guía acepta cualquier proveedor activo. Si no se dice, toma el del envío (si se eligió uno en la puerta) o, si
--      no, el único proveedor de su marca (`marca_proveedores`: en producción 105 de las 110 marcas activas tienen uno solo). Si no se puede saber (marca con
--      dos proveedores, o «Sin marca»), queda sin proveedor y se pone antes de cerrar.
--   2. `preparar_prenda_al_recibir`: la prenda que se crea al contar acepta el proveedor de su línea aunque no sea «el del envío».
--   3. `cerrar_conteo_envio`: ya no pide el proveedor del envío, sino que cada línea con algo contado tenga el suyo. El mensaje dice qué marcas faltan.
--   4. `fn_envio_conteos`: `proveedor_por_confirmar` = alguna línea contada sin proveedor; `proveedores` suma los de las líneas.
--   4b. La Actividad, al abrir sin proveedor, ya no dice «(proveedor por confirmar)» sino «(cada marca con su proveedor)».
--   4c. `corregir_proveedor_envio`: sin proveedor del envío, corrige el único de sus líneas (con varios, la pantalla no lo ofrece).
--   5. Nueva `poner_proveedor_de_marca(p_despacho_id, p_marca_id, p_proveedor_id)`: el proveedor de todo lo de una marca (`null` = sin marca) del envío
--      abierto, con su rastro en la Actividad. Registra que ese proveedor trae esa marca, para que la próxima vez se sepa solo.
--
-- LO QUE NO SE PUEDE: lo que salió al stock antes de cerrar sin proveedor quedó en el lote «Por confirmar», y los movimientos apuntan a su lote
-- (`movimientos.lote_id`, que no se edita). Si ese lote junta prendas de dos marcas que resultan de proveedores distintos, no se parte: la función se niega
-- y dice por qué (pregúntale a Compras, o pon el mismo proveedor). Si solo tiene prendas de esta marca, el lote entero pasa al proveedor real.
--
-- DESCARTÉ
--   · Un envío por proveedor: obliga a separar el fardo antes de contarlo, que es justo lo que no se hace al recibir.
--   · Borrar `despachos_sin_aviso.proveedor_id`: sigue siendo el atajo de «todo es de uno» que la puerta todavía ofrece, y lo leen Corregir y el historial.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). UNA parte, idempotente, sin políticas ni `drop trigger` (ADR-0195). Los reemplazos anclados se
-- niegan si la función viva cambió.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

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
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición viva.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- El único proveedor activo de una marca, o `null` si tiene cero o más de uno (entonces no se adivina).
create or replace function retail.fn_proveedor_unico_de_marca(p_marca_id uuid)
returns uuid
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select case when count(*) = 1 then (array_agg(mp.proveedor_id))[1] end
    from retail.marca_proveedores mp
    join retail.proveedores pr on pr.id = mp.proveedor_id and pr.activo and not coalesce(pr.por_confirmar, false)
   where mp.marca_id = p_marca_id;
$$;
comment on function retail.fn_proveedor_unico_de_marca(uuid) is
  'ADR-0393 (act. 2026-11-07 c): el único proveedor activo de una marca, o null si tiene cero o varios. Lo usa Recibir sin aviso para saber de quién es lo contado.';
revoke all on function retail.fn_proveedor_unico_de_marca(uuid) from public, anon, authenticated;

-- ---------- 1. guardar_conteo_envio ----------
select pg_temp.reemplazar(
  'retail.guardar_conteo_envio(uuid,uuid,integer,jsonb,integer,integer,uuid,uuid,uuid)',
  $v$    v_marca := coalesce(p_marca_id, v_fila.marca_id);
$v$,
  $v$    v_marca := coalesce(p_marca_id, v_fila.marca_id);
    -- ADR-0393 (act. 2026-11-07 c): en un envío sin aviso cada línea es de su proveedor (cualquiera activo). Sin decirlo: el del envío, si se eligió uno
    -- en la puerta; si no, el único de su marca; si no se puede saber, ninguno (se pone antes de cerrar con poner_proveedor_de_marca).
    if exists (select 1 from retail.despachos_sin_aviso s where s.despacho_id = p_despacho_id) then
      if v_prov is null then
        v_prov := (select s.proveedor_id from retail.despachos_sin_aviso s where s.despacho_id = p_despacho_id);
      end if;
      if v_prov is null and v_marca is not null then
        v_prov := retail.fn_proveedor_unico_de_marca(v_marca);
      end if;
      if v_prov is not null then
        if not exists (select 1 from retail.proveedores pr where pr.id = v_prov and pr.activo) then
          raise exception 'Elige de quién llegó: un proveedor activo' using hint = 'recepcion_extra_proveedor';
        end if;
        v_proveedores := v_proveedores || v_prov;
      end if;
    end if;
$v$,
  1);

-- ---------- 2. preparar_prenda_al_recibir ----------
select pg_temp.reemplazar(
  'retail.preparar_prenda_al_recibir(uuid,uuid,uuid,uuid,uuid,text,jsonb,numeric,text,uuid,uuid,boolean,uuid,uuid)',
  $v$      if not (p_proveedor_id = any(v_candidatos)) then
        raise exception 'Ese proveedor no viene en este envío: elige uno de los del envío' using hint = 'recepcion_proveedor';$v$,
  $v$      -- ADR-0393 (act. 2026-11-07 c): sin aviso, el proveedor de su línea, aunque no sea el del envío.
      if not (p_proveedor_id = any(v_candidatos))
         and not (exists (select 1 from retail.despachos_sin_aviso s where s.despacho_id = p_despacho_id)
                  and exists (select 1 from retail.proveedores pr where pr.id = p_proveedor_id and pr.activo)) then
        raise exception 'Ese proveedor no viene en este envío: elige uno de los del envío' using hint = 'recepcion_proveedor';$v$,
  1);

-- ---------- 3. cerrar_conteo_envio: cada línea con su proveedor ----------
select pg_temp.reemplazar(
  'retail.cerrar_conteo_envio(uuid,integer,jsonb,text,uuid)',
  $v$  if exists (select 1 from retail.despachos_sin_aviso s where s.despacho_id = v_despacho.id and s.proveedor_id is null) then
    raise exception 'Falta de quién llegó: elige el proveedor (pregúntale a Compras) y vuelve a cerrar' using hint = 'envio_sin_proveedor';$v$,
  $v$  -- ADR-0393 (act. 2026-11-07 c): ya no es un proveedor por envío, sino uno por línea; falta en las líneas contadas que no lo tienen.
  if exists (select 1 from retail.despachos_sin_aviso s where s.despacho_id = v_despacho.id)
     and exists (select 1 from retail.despacho_conteos k
                  where k.despacho_id = v_despacho.id and k.despacho_item_id is null and k.contadas > 0 and k.proveedor_id is null) then
    raise exception 'Falta de quién llegó %: elige su proveedor (pregúntale a Compras) y vuelve a cerrar',
      (select string_agg(distinct coalesce(m.nombre, 'lo sin marca'), ', ')
         from retail.despacho_conteos k
         left join retail.marcas m on m.id = k.marca_id
        where k.despacho_id = v_despacho.id and k.despacho_item_id is null and k.contadas > 0 and k.proveedor_id is null)
      using hint = 'envio_sin_proveedor';$v$,
  1);

-- ---------- 4. fn_envio_conteos ----------
select pg_temp.reemplazar(
  'retail.fn_envio_conteos(uuid)',
  $v$    'proveedor_por_confirmar', exists (select 1 from retail.despachos_sin_aviso s where s.despacho_id = p_despacho_id and s.proveedor_id is null),$v$,
  $v$    -- ADR-0393 (act. 2026-11-07 c): alguna línea contada que todavía no sabe de quién es.
    'proveedor_por_confirmar', exists (select 1 from retail.despachos_sin_aviso s where s.despacho_id = p_despacho_id)
                               and exists (select 1 from retail.despacho_conteos k
                                            where k.despacho_id = p_despacho_id and k.despacho_item_id is null and k.contadas > 0 and k.proveedor_id is null),$v$,
  1);
select pg_temp.reemplazar(
  'retail.fn_envio_conteos(uuid)',
  $v$              select pr.id, pr.nombre
                from retail.despachos_sin_aviso s
                join retail.proveedores pr on pr.id = s.proveedor_id
               where s.despacho_id = p_despacho_id) q), '[]'::jsonb),$v$,
  $v$              select pr.id, pr.nombre
                from retail.despachos_sin_aviso s
                join retail.proveedores pr on pr.id = s.proveedor_id
               where s.despacho_id = p_despacho_id
              union
              -- ADR-0393 (act. 2026-11-07 c): y los de cada línea de un envío sin aviso.
              select pr.id, pr.nombre
                from retail.despacho_conteos k
                join retail.proveedores pr on pr.id = k.proveedor_id
               where k.despacho_id = p_despacho_id and k.despacho_item_id is null
                 and exists (select 1 from retail.despachos_sin_aviso s where s.despacho_id = p_despacho_id)) q), '[]'::jsonb),$v$,
  1);

-- ---------- 4b. Lo que dice la Actividad al abrir: sin proveedor ya no es «por confirmar», es lo normal ----------
select pg_temp.reemplazar(
  'retail.abrir_envio_sin_aviso(uuid,uuid,text,text,uuid)',
  $v$coalesce('de ' || v_proveedor, '(proveedor por confirmar)')$v$,
  $v$coalesce('de ' || v_proveedor, '(cada marca con su proveedor)')$v$,
  1);

-- ---------- 4c. Corregir el proveedor de un envío cerrado: el de sus líneas, si es uno solo ----------
-- Un envío abierto sin proveedor y cerrado con el de cada marca no tiene «proveedor del envío». Si todo resultó de uno, se corrige ese; con varios no hay
-- un «proveedor del envío» que corregir de un golpe, y la pantalla no lo ofrece.
select pg_temp.reemplazar(
  'retail.corregir_proveedor_envio(uuid,uuid,text)',
  $v$  v_antes := (select s.proveedor_id from retail.despachos_sin_aviso s where s.despacho_id = p_despacho_id);
$v$,
  $v$  v_antes := (select s.proveedor_id from retail.despachos_sin_aviso s where s.despacho_id = p_despacho_id);
  -- 20261107192000: sin proveedor del envío, el único de sus líneas.
  if v_antes is null then
    v_antes := (select case when count(distinct k.proveedor_id) = 1 then (array_agg(k.proveedor_id))[1] end
                  from retail.despacho_conteos k
                 where k.despacho_id = p_despacho_id and k.despacho_item_id is null and k.proveedor_id is not null);
  end if;
$v$,
  1);

-- ---------- 5. El proveedor de una marca ----------
create or replace function retail.poner_proveedor_de_marca(p_despacho_id uuid, p_marca_id uuid, p_proveedor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_despacho retail.despachos;
  v_nombre text;
  v_marca text;
  v_pc uuid;
  v_lote_pc uuid;
  v_lineas integer;
begin
  if retail.fn_ve_modulo('recibir') is not true then
    raise exception 'Recibir mercadería necesita el módulo «Recibir mercadería» en tu rol' using errcode = '42501', hint = 'recibir_sin_modulo';
  end if;
  -- El envío en exclusiva, como poner_proveedor_envio: guardar_conteo_envio lo toma compartido.
  select d.* into v_despacho from retail.despachos d where d.id = p_despacho_id for update;
  if not found then
    raise exception 'Ese envío no existe' using hint = 'envio_no_existe';
  end if;
  if not exists (select 1 from retail.despachos_sin_aviso s where s.despacho_id = p_despacho_id) then
    raise exception 'Este envío vino de Compras: su proveedor es el de sus órdenes' using hint = 'envio_no_es_sin_aviso';
  end if;
  if v_despacho.estado <> 'abierto' then
    raise exception 'Este envío ya no se está contando: recarga la pantalla' using hint = 'envio_no_abierto';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  perform retail.fn_recepcion_exigir(v_despacho.id, v_despacho.ubicacion_destino_id, v_actor);
  v_nombre := (select pr.nombre from retail.proveedores pr where pr.id = p_proveedor_id and pr.activo and not coalesce(pr.por_confirmar, false));
  if v_nombre is null then
    raise exception 'Elige de quién llegó: un proveedor activo' using hint = 'recepcion_proveedor';
  end if;
  v_marca := coalesce((select m.nombre from retail.marcas m where m.id = p_marca_id), 'lo sin marca');
  v_lineas := (select count(*) from retail.despacho_conteos k
                where k.despacho_id = p_despacho_id and k.despacho_item_id is null and k.marca_id is not distinct from p_marca_id);
  if v_lineas = 0 then
    raise exception 'En este envío no hay nada contado de %: recarga la pantalla', v_marca using hint = 'proveedor_sin_lineas';
  end if;

  -- Lo que ya salió al stock sin proveedor está en el lote «Por confirmar». Solo pasa al real si ese lote es entero de esta marca y el proveedor real no
  -- tiene ya su propio lote en el envío (los movimientos apuntan a su lote y no se mueven).
  v_pc := (select p.id from retail.proveedores p where p.por_confirmar);
  v_lote_pc := (select l.id from retail.lotes l where l.despacho_id = p_despacho_id and l.proveedor_id = v_pc);
  if v_lote_pc is not null and exists (
    select 1 from retail.despacho_recibidos r
      join retail.despacho_conteos k on k.despacho_id = r.despacho_id and k.extra_posicion = r.extra_posicion
     where r.despacho_id = p_despacho_id and r.proveedor_id = v_pc and k.marca_id is not distinct from p_marca_id
  ) then
    if exists (
      select 1 from retail.despacho_recibidos r
        left join retail.despacho_conteos k on k.despacho_id = r.despacho_id and k.extra_posicion = r.extra_posicion
       where r.despacho_id = p_despacho_id and r.proveedor_id = v_pc and k.marca_id is distinct from p_marca_id
    ) or exists (select 1 from retail.lotes l where l.despacho_id = p_despacho_id and l.proveedor_id = p_proveedor_id) then
      raise exception 'Lo que ya salió al stock de % comparte lote con otras prendas: ponles el mismo proveedor, o pregúntale a Compras', v_marca
        using hint = 'proveedor_lote_compartido';
    end if;
    perform set_config('retail.corrige_proveedor', 'si', true);
    update retail.despacho_recibidos r set proveedor_id = p_proveedor_id where r.despacho_id = p_despacho_id and r.proveedor_id = v_pc;
    update retail.lotes l set proveedor_id = p_proveedor_id where l.id = v_lote_pc;
    perform set_config('retail.corrige_proveedor', '', true);
  end if;

  update retail.despacho_conteos k set proveedor_id = p_proveedor_id
   where k.despacho_id = p_despacho_id and k.despacho_item_id is null and k.marca_id is not distinct from p_marca_id
     and k.proveedor_id is distinct from p_proveedor_id;
  -- La próxima vez se sabe solo: ese proveedor trae esa marca [provisional, como al crear una prenda al recibir].
  if p_marca_id is not null then
    insert into retail.marca_proveedores (marca_id, proveedor_id) values (p_marca_id, p_proveedor_id) on conflict do nothing;
  end if;

  begin
    perform retail.fn_actividad_anotar(
      'recibir', 'despacho_sin_aviso_proveedor_de_marca',
      'puso de quién llegó ' || v_marca || ' en ' || retail.fn_envio_numero_texto(v_despacho.numero) || ': ' || v_nombre,
      v_actor, retail.fn_actividad_terminal_ahora(), v_despacho.ubicacion_destino_id, null,
      'despachos', p_despacho_id::text, now(),
      jsonb_build_object('despacho_id', p_despacho_id, 'marca_id', p_marca_id, 'proveedor_id', p_proveedor_id),
      'vivo');
  exception when others then
    raise warning 'actividad: no se anotó el proveedor de % en el envío % (%)', v_marca, v_despacho.numero, sqlerrm;
  end;

  return jsonb_build_object('despacho_id', p_despacho_id, 'marca_id', p_marca_id, 'proveedor', jsonb_build_object('id', p_proveedor_id, 'nombre', v_nombre),
                            'lineas', v_lineas);
end;
$$;
comment on function retail.poner_proveedor_de_marca(uuid, uuid, uuid) is
  'ADR-0393 (act. 2026-11-07 c): en un envío sin aviso abierto, el proveedor de todo lo contado de una marca (null = sin marca). Pasa a él lo que salió al stock en «Por confirmar» si su lote es solo de esa marca; registra la pareja marca-proveedor; queda en la Actividad.';
revoke all on function retail.poner_proveedor_de_marca(uuid, uuid, uuid) from public, anon;
grant execute on function retail.poner_proveedor_de_marca(uuid, uuid, uuid) to authenticated, service_role;

reset search_path;
reset lock_timeout;
