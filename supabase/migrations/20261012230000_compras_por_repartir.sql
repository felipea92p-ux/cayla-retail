-- ADR-0362 · fase 3 (la actividad 9 de la fase 2, pasada aquí; Felipe 2026-10-12): el comprobante de una orden «Por repartir» y
-- de quién es la deuda de una orden (decisión 46).
-- Contrato con la pantalla: docs/compras/ordenes-de-compra-2026-10/contrato-envio-a-sede.md («Por repartir»).
--
-- EL PROBLEMA PRIMERO. `registrar_comprobante_orden` (20261012211000) rechazaba una orden sin «Llega a» porque no sabía qué tienda
-- gestiona el papel: lo de una orden «Por repartir» llega a Lima, que no es una sede (decisiones 10 y 22), y se reparte después con
-- los envíos (20261012225000). Y en una orden «directo» la deuda caía en la tienda a la que llega, aunque la orden la hubiera hecho
-- otra sede. Felipe decidió (decisión 46): la deuda de una orden es de la sede de QUIEN HIZO LA ORDEN.
--
-- QUÉ HACE.
--   1. `fn_orden_compra_gestora(p_orden_id)`: la ÚNICA definición de qué tienda gestiona el comprobante de una orden y carga su deuda,
--      para TODA orden («directo» y «Por repartir»): la sede asignada de quien la creó (`colaboradores.ubicacion_asignada_id` de
--      `ordenes_compra.creada_por`), si existe y está activa; si no, «Llega a»; si la orden es «Por repartir», la sede desde donde
--      trabaja quien lo registra (`fn_ubicacion_actual_persona()`); si nada, NULL. Interna.
--   2. `registrar_comprobante_orden` (REEMPLAZOS ANCLADOS sobre su definición viva; su firma y su respuesta no cambian): ya no rechaza
--      la orden «Por repartir»; toma la gestora de esa función, y si no hay ninguna: «Elige desde qué sede trabajas» (hint
--      `comprobante_orden_sin_sede`). Todo lo comprado va, en el papel, a la gestora (`compra_item_destinos`): es solo contable —lo
--      físico va por los envíos y Recibir no ofrece líneas sin prenda— y además la gestora tiene que conservar parte
--      (`fn_gestora_con_parte`). Actividad sigue anotando «Llega a» como destino.
--   3. `fn_orden_compra_detalle` suma `deuda_de` (`{id, nombre}` o null): la sede que quedaría como gestora si se registrara ahora.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). UNA parte, después de 20261012211000 (no depende de 20261012225000, pero va
-- después de ella en el orden de versiones). Sin tablas, sin políticas ni `drop trigger` (ADR-0195), sin `select … into` dentro de
-- textos entre comillas (ADR-0288). Los reemplazos abortan SIN TOCAR NADA si una función viva cambió y no hacen nada si ya están
-- aplicados: se puede pegar dos veces. El bloque final comprueba que quedó todo.

set lock_timeout = '3s';

-- Reemplazo anclado (el mismo de 20261012211000): falla si la función viva cambió, y es re-ejecutable.
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

-- ---------- 1. De quién es la deuda de una orden (decisión 46) ----------
create or replace function retail.fn_orden_compra_gestora(p_orden_id uuid)
returns uuid
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select coalesce(
           -- La sede asignada de quien hizo la orden, si sigue activa.
           (select u.id
              from retail.colaboradores co
              join retail.ubicaciones u on u.id = co.ubicacion_asignada_id
             where co.persona_id = o.creada_por
               and u.activo),
           -- Si no tiene (un líder sin sede asignada), «Llega a».
           o.ubicacion_destino_id,
           -- Y si la orden es «Por repartir», la sede desde donde trabaja quien registra el papel.
           retail.fn_ubicacion_actual_persona())
    from retail.ordenes_compra o
   where o.id = p_orden_id;
$$;
comment on function retail.fn_orden_compra_gestora(uuid) is
  'ADR-0362 (decisión 46): la tienda que gestiona el comprobante de una orden y carga su deuda: la sede asignada (activa) de quien la '
  'creó; si no, «Llega a»; si no, la sede de quien registra; si nada, NULL. Interna: la usan registrar_comprobante_orden y '
  'fn_orden_compra_detalle (deuda_de).';
revoke all on function retail.fn_orden_compra_gestora(uuid) from public, anon, authenticated;

-- ---------- 2. Registrar el comprobante: la gestora sale de esa función ----------
-- 2a. La variable de la tienda gestora.
select pg_temp.reemplazar(
  'retail.registrar_comprobante_orden(uuid,text,text,text,jsonb,date,text,date,boolean,numeric,jsonb,text,uuid)',
  $v$  v_restriccion text;
begin$v$,
  $v$  v_restriccion text;
  v_gestora uuid;
begin$v$,
  1);

-- 2b. Donde rechazaba la orden «Por repartir»: ahora toma la gestora de la regla.
select pg_temp.reemplazar(
  'retail.registrar_comprobante_orden(uuid,text,text,text,jsonb,date,text,date,boolean,numeric,jsonb,text,uuid)',
  $v$  if v_orden.ubicacion_destino_id is null then
    raise exception 'Esta orden es «Por repartir»: su comprobante todavía no se puede registrar' using hint = 'orden_compra_por_repartir';
  end if;$v$,
  $v$  -- La tienda que gestiona el papel y carga la deuda: la de quien hizo la orden (decisión 46; la regla vive en
  -- fn_orden_compra_gestora). Una orden «Por repartir» ya registra su comprobante: el reparto físico lo hacen los envíos.
  v_gestora := retail.fn_orden_compra_gestora(v_orden.id);
  if v_gestora is null then
    raise exception 'Elige desde qué sede trabajas' using hint = 'comprobante_orden_sin_sede';
  end if;$v$,
  1);

-- 2c. La compra la gestiona esa tienda…
select pg_temp.reemplazar(
  'retail.registrar_comprobante_orden(uuid,text,text,text,jsonb,date,text,date,boolean,numeric,jsonb,text,uuid)',
  $v$v_orden.fecha_entrega_estimada, v_orden.ubicacion_destino_id, 'mercaderia',$v$,
  $v$v_orden.fecha_entrega_estimada, v_gestora, 'mercaderia',$v$,
  1);

-- 2d. …y todo lo comprado va, en el papel, a ella (contable; la gestora conserva parte, fn_gestora_con_parte).
select pg_temp.reemplazar(
  'retail.registrar_comprobante_orden(uuid,text,text,text,jsonb,date,text,date,boolean,numeric,jsonb,text,uuid)',
  $v$  select lineas.id, v_orden.ubicacion_destino_id, lineas.cantidad from lineas;$v$,
  $v$  select lineas.id, v_gestora, lineas.cantidad from lineas;$v$,
  1);

comment on function retail.registrar_comprobante_orden(uuid, text, text, text, jsonb, date, text, date, boolean, numeric, jsonb, text, uuid) is
  'ADR-0362 (fases 2 y 3): registra la boleta, nota de venta o factura de una orden generada, también «Por repartir» (gestora = '
  'fn_orden_compra_gestora: la sede de quien hizo la orden, decisión 46; líneas sin prenda; al contado, pago de la empresa sin '
  'tienda). Solo el módulo Órdenes de compra. Devuelve {compra_id, documento, total, saldo, avisos}: «de más» y «fuera de la orden» '
  'se avisan sin bloquear. p_token + huella: un reintento devuelve lo mismo.';

-- ---------- 3. Ver una orden: de quién sería la deuda ----------
select pg_temp.reemplazar(
  'retail.fn_orden_compra_detalle(uuid)',
  $v$'destino', case when u.id is null then null else jsonb_build_object('id', u.id, 'nombre', u.nombre) end,$v$,
  $v$'destino', case when u.id is null then null else jsonb_build_object('id', u.id, 'nombre', u.nombre) end,
           -- La sede que quedaría como gestora del comprobante y cargaría la deuda (decisión 46), o null si no hay ninguna.
           'deuda_de', (select jsonb_build_object('id', g.id, 'nombre', g.nombre)
                          from retail.ubicaciones g
                         where g.id = retail.fn_orden_compra_gestora(o.id)),$v$,
  1);

-- ---------- 4. Comprobación: si algo no quedó, la migración no se da por aplicada ----------
do $$
declare
  v_def text := pg_get_functiondef(
    'retail.registrar_comprobante_orden(uuid,text,text,text,jsonb,date,text,date,boolean,numeric,jsonb,text,uuid)'::regprocedure);
begin
  if position('orden_compra_por_repartir' in v_def) > 0 or position('comprobante_orden_sin_sede' in v_def) = 0
     or position('retail.fn_orden_compra_gestora(v_orden.id)' in v_def) = 0 then
    raise exception 'registrar_comprobante_orden no quedó con la gestora de la decisión 46';
  end if;
  if position($t$v_orden.ubicacion_destino_id, 'mercaderia'$t$ in v_def) > 0
     or position('lineas.id, v_orden.ubicacion_destino_id' in v_def) > 0 then
    raise exception 'registrar_comprobante_orden todavía toma la gestora de «Llega a» en algún lugar';
  end if;
  if (length(v_def) - length(replace(v_def, 'v_gestora', ''))) / length('v_gestora') <> 5 then
    raise exception 'registrar_comprobante_orden: se esperaban 5 apariciones de v_gestora';
  end if;
  if has_function_privilege('authenticated', 'retail.fn_orden_compra_gestora(uuid)', 'execute') then
    raise exception 'fn_orden_compra_gestora es interna: authenticated no la ejecuta';
  end if;
  if position($t$'deuda_de'$t$ in pg_get_functiondef('retail.fn_orden_compra_detalle(uuid)'::regprocedure)) = 0 then
    raise exception 'fn_orden_compra_detalle no quedó con deuda_de';
  end if;
end;
$$;

reset lock_timeout;
