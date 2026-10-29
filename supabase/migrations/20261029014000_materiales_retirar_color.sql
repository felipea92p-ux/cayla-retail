-- ============================================================================
-- 20261029014000_materiales_retirar_color.sql — CAYLA V2 (ADR-0554, «Retirar color» · 2026-10-29)
--
-- EL PROBLEMA PRIMERO. Alguien se equivocó al elegir el color de una tela y no hay forma de quitarlo: «Editar tela» corrige la tela (no sus colores), «Agregar colores» solo suma, y la columna que sí
-- esconde un color de la lista (`insumos.archivado_at`, que la lista ya respeta) no la escribe ninguna pantalla ni función. Quitarlo «a mano» es peligroso por una razón concreta: un color con saldo
-- que se esconde deja metros que el libro sigue contando y que nadie ve (stock fantasma); y un color que está en una orden en proceso, en una orden de insumos por recibir o en la receta de un
-- modelo dejaría ese documento apuntando a algo que ya no aparece.
--
-- QUÉ HACE (una sola parte, sin políticas — ADR-0195; solo funciones nuevas y UN disparador nuevo, sin `drop trigger`)
--   1. `retirar_color_de_material(color, taller)`: esconde un color de su tela (`archivado_at = now()`) y deja su línea en «Actividad». NO BORRA NADA: el color conserva su código, sus lotes y
--      sus movimientos; solo deja de salir en la lista. Es del LÍDER (como «Editar tela»), firma con el responsable, es todo o nada y toma el mismo candado por tela que «agregar colores» y «editar»
--      (dos personas sobre la misma tela van una a una). Retirar uno ya retirado no hace nada y lo dice (un doble clic no falla ni anota dos veces).
--   2. `fn_color_compromisos(color)`: la ÚNICA lista de cosas que impiden retirar un color; devuelve la primera, en castellano, o NULL si no hay ninguna:
--        a. saldo distinto de cero en cualquier sede,
--        b. una orden de producción en proceso que lo usa,
--        c. una orden de insumos generada con tela de este color por recibir,
--        d. una factura vigente con tela de este color por recibir,
--        e. la receta de un modelo (`producto_avios`, sin archivar).
--   3. `insumo_lotes_color_activo` (disparador BEFORE INSERT en `insumo_lotes`): a un color retirado NO le entra tela. Sin él, quien tuviera abierta la pantalla «Llegó tela» podía ingresar un lote a
--      un color recién retirado (la pantalla vieja todavía lo mostraba) y dejar metros en un color que nadie ve. Espera (`for key share`) a quien esté retirando ese color y vuelve a leerlo, así que
--      la carrera «retiran y reciben al mismo tiempo» termina siempre en uno de dos estados válidos: el color se retiró sin saldo, o el ingreso entró y el retiro se negó por tener saldo.
--
-- PROMETE: un color retirado no tiene saldo, no está en una orden abierta ni en una receta, y no puede recibir tela; todo queda dicho en Actividad (quién, cuándo, qué color de qué tela).
-- ASUME:   `20261028203000` ya está pegada (usa `fn_material_anotar` y `fn_material_exigir_taller`). Si falta, se detiene al principio con un mensaje claro y no cambia nada. Se pega entera, en una sola
--   pegada, y se puede repetir (todo es `create or replace`).
-- NO HACE: no borra; no reactiva (si se retira un color por error y se vuelve a necesitar, hoy hay que devolverle `archivado_at` con una línea de SQL del líder: ver «Si hay que volver atrás»);
--   no libera el código del color (`MM-01-ARN` queda ocupado por el índice único de códigos, así que «Agregar colores» no puede crear OTRO color con ese mismo código); no retira telas enteras;
--   no da salida a un saldo (no existe aún un «anular ingreso»: un color con saldo no se retira); no deja que un colaborador retire (es del líder, como editar la tela).
--
-- DECIDÍ: retirar (esconder) con una función que se niega ante lo abierto, y un disparador que impide que entre tela a un retirado. DESCARTÉ (1) borrar la fila: tiene lotes y movimientos con llave
--   foránea, y el libro de insumos es solo de agregar; (2) dejar que la web actualice `archivado_at` con un UPDATE directo (la política `insumos_update_lider` lo permite, pero sin las comprobaciones de
--   arriba, sin Actividad y sin candado por tela); (3) dejar el saldo y mostrarlo igual en la lista: un color «retirado» que sigue sumando al capital en insumos confunde más que un botón que dice no.
-- SE ROMPE SI: una pantalla nueva escribe `archivado_at` sin pasar por aquí (el disparador de lotes lo cubre solo en la entrada de tela, no en consumos ni devoluciones); si se agrega una tabla nueva
--   que apunte a `insumos` con un documento «abierto» y nadie la suma a `fn_color_compromisos` (la lista sale hoy de las llaves foráneas: `comprobantes_produccion_items`, `insumo_lotes`,
--   `movimientos_insumo`, `orden_insumo_cierres`, `orden_insumo_items`, `produccion_insumos`, `producto_avios`); o si alguien abre una orden o una receta con un color en una pantalla vieja justo
--   mientras otra persona lo retira (el documento queda con un color retirado: no mueve stock, porque el saldo ya era cero).
--
-- PRODUCCIÓN. Una sola pegada (sin políticas, sin `drop trigger`: solo `create or replace`), con el cursor sin selección. Es posterior a 20261028203000. Dentro de los textos no hay ningún
--   `select … into` (ADR-0288). Prueba: `pnpm pruebas:materiales` (grupo U).
--
-- SI HAY QUE VOLVER ATRÁS
--   Devolver un color a la lista:   update retail.insumos set archivado_at = null where codigo = '<CÓDIGO>';
--   Quitar todo esto:               drop function retail.retirar_color_de_material(uuid, uuid);
--                                   drop function retail.fn_color_compromisos(uuid);
--                                   drop trigger insumo_lotes_color_activo on retail.insumo_lotes;  -- toma un candado breve en `insumo_lotes` (no en `auth` ni `storage`)
--                                   drop function retail.fn_insumo_lotes_color_activo();
--   Los colores ya retirados siguen retirados hasta que se les devuelva `archivado_at = null`.
-- ============================================================================

set lock_timeout = '3s';

-- ---------- 0. Antes de tocar nada ----------
do $f$
begin
  if to_regprocedure('retail.fn_material_anotar(text,text,uuid,uuid,uuid,jsonb)') is null
     or to_regprocedure('retail.fn_material_exigir_taller(uuid)') is null then
    raise exception 'Primero pega 20261028203000 (editar tela): esta migración la necesita. No se cambió nada.' using hint = 'falta_203000';
  end if;
end
$f$;

-- ---------- 1. Qué impide retirar un color ----------
-- Devuelve la PRIMERA razón, escrita para quien lee la pantalla, o NULL. El orden va de lo más grave (hay tela guardada) a lo más fácil de resolver (una receta). Solo lee.
create or replace function retail.fn_color_compromisos(p_insumo_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $f$
declare
  r record;
begin
  -- a. Saldo en cualquier sede. El saldo nunca es una columna: es la suma del libro (`v_insumo_saldos`).
  for r in
    select s.fisico, i.unidad_medida, u.nombre as sede
      from retail.v_insumo_saldos s
      join retail.insumos i on i.id = s.insumo_id
      join retail.ubicaciones u on u.id = s.ubicacion_id
     where s.insumo_id = p_insumo_id and s.fisico <> 0
     order by u.nombre
     limit 1
  loop
    return 'Este color todavía tiene ' || trim_scale(r.fisico)::text || ' ' || case when r.unidad_medida = 'metro' then 'm' else r.unidad_medida end || ' en ' || r.sede
        || ': solo se retira un color sin saldo.';
  end loop;

  -- b. Una orden de producción en proceso que lo usa (la tela de la orden).
  for r in
    select p.numero
      from retail.produccion_insumos pi
      join retail.producciones p on p.id = pi.produccion_id
     where pi.insumo_id = p_insumo_id and p.estado = 'en_proceso'
     order by p.numero
     limit 1
  loop
    return 'Este color está en la orden ' || retail.fn_produccion_numero_texto(r.numero) || ', que sigue en proceso: termínala o quítalo de ella primero.';
  end loop;

  -- c. Una orden de insumos generada con tela de este color que todavía no llegó (`fn_orden_insumo_por_recibir_lineas` es la misma cuenta que usa la pantalla de recibir).
  for r in
    select o.numero
      from retail.ordenes_insumo o
     where o.estado = 'generada'
       and (exists (select 1 from retail.orden_insumo_items x where x.orden_insumo_id = o.id and x.insumo_id = p_insumo_id)
         or exists (select 1 from retail.comprobantes_produccion y join retail.comprobantes_produccion_items z on z.comprobante_id = y.id
                     where y.orden_insumo_id = o.id and y.estado = 'vigente' and z.insumo_id = p_insumo_id))
       and exists (select 1 from retail.fn_orden_insumo_por_recibir_lineas(o.id) l where l.insumo_id = p_insumo_id and l.queda > 0)
     order by o.numero
     limit 1
  loop
    return 'Este color tiene tela por recibir en la orden de insumos ' || retail.fn_orden_insumo_numero_texto(r.numero) || ': recíbela o ciérrala primero.';
  end loop;

  -- d. Una factura vigente (sin orden de insumos) con tela de este color que todavía no se recibió: lo pedido menos lo recibido menos lo cerrado.
  for r in
    select y.serie, y.numero
      from retail.comprobantes_produccion_items z
      join retail.comprobantes_produccion y on y.id = z.comprobante_id
     where z.insumo_id = p_insumo_id and y.estado = 'vigente' and y.orden_insumo_id is null
       and z.cantidad
           - coalesce((select sum(l.cantidad_ingresada) from retail.insumo_lotes l where l.comprobante_item_id = z.id), 0)
           - coalesce((select sum(c.cantidad) from retail.orden_insumo_cierres c where c.comprobante_item_id = z.id), 0) > 0
     order by y.serie, y.numero
     limit 1
  loop
    return 'Este color tiene tela por recibir en la factura ' || r.serie || '-' || r.numero || ': recíbela o ciérrala primero.';
  end loop;

  -- e. La receta de un modelo (la tela o el avío que declara el modelo). Una línea de receta archivada ya no cuenta.
  for r in
    select coalesce(nullif(btrim(p.referencia), ''), p.codigo) as modelo
      from retail.producto_avios a
      join retail.productos p on p.id = a.producto_id
     where a.insumo_id = p_insumo_id and a.archivado_at is null
     order by 1
     limit 1
  loop
    return 'Este color es parte de la receta del modelo «' || r.modelo || '»: quítalo de la receta primero.';
  end loop;

  return null;
end;
$f$;
revoke all on function retail.fn_color_compromisos(uuid) from public, anon, authenticated;
comment on function retail.fn_color_compromisos(uuid) is
  'ADR-0554: la primera razón (en castellano) por la que un color de tela no se puede retirar —saldo, orden en proceso, orden de insumos o factura por recibir, receta de un modelo— o NULL. Solo lee.';

-- ---------- 2. Retirar un color ----------
create or replace function retail.retirar_color_de_material(p_insumo_id uuid, p_ubicacion_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $f$
declare
  i retail.insumos%rowtype;
  m retail.materiales%rowtype;
  v_actor uuid;
  v_material uuid;
  v_motivo text;
  v_color text;
begin
  perform retail.fn_produccion_exigir_operar(p_ubicacion_id);
  perform retail.fn_material_exigir_taller(p_ubicacion_id);
  -- Retirar un color cambia lo que las pantallas de Producción y de Compras ofrecen: como editar la tela, es del líder.
  if not retail.fn_es_lider() then
    raise exception 'Retirar un color es del líder.' using errcode = '42501', hint = 'retirar_color_sin_lider';
  end if;
  -- Firma con el responsable (como las hermanas de Producción): sin él no queda dicho quién lo retiró.
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién guarda esto' using errcode = '42501', hint = 'responsable_requerido';
  end if;

  v_material := (select x.material_id from retail.insumos x where x.id = p_insumo_id);
  if not exists (select 1 from retail.insumos x where x.id = p_insumo_id) then
    raise exception 'Ese color ya no existe. Actualiza la pantalla.' using hint = 'retirar_color_no_existe';
  end if;
  if v_material is null then
    raise exception 'Solo se retira el color de una tela. Este insumo no es el color de ninguna.' using errcode = '23514', hint = 'retirar_color_sin_tela';
  end if;

  -- El mismo candado que «agregar colores» y «editar tela»: mientras se retira un color no se edita ni se le suman colores a la tela (y al revés).
  perform pg_advisory_xact_lock(hashtextextended('materiales:colores:' || v_material::text, 0));
  -- La fila del color, bloqueada: quien esté ingresando tela a este color (`recibir_*` toma la fila con su llave foránea) termina antes de que se mire el saldo, o espera a que esto acabe y el
  -- disparador `insumo_lotes_color_activo` le dice que el color ya está retirado.
  select * into i from retail.insumos where id = p_insumo_id for update;
  if not found then
    raise exception 'Ese color ya no existe. Actualiza la pantalla.' using hint = 'retirar_color_no_existe';
  end if;

  -- Un doble clic, o dos personas a la vez: el segundo ya lo encuentra retirado. No es un error y no se anota otra vez.
  if i.archivado_at is not null then
    return jsonb_build_object('insumo_id', i.id, 'codigo', i.codigo, 'nombre', i.nombre, 'material_id', i.material_id, 'retirado', true, 'ya_estaba', true);
  end if;

  v_motivo := retail.fn_color_compromisos(i.id);
  if v_motivo is not null then
    raise exception '%', v_motivo using errcode = '23514', hint = 'retirar_color_con_compromisos';
  end if;

  update retail.insumos set archivado_at = now() where id = i.id;

  select * into m from retail.materiales where id = i.material_id;
  v_color := coalesce((select c.nombre from retail.colores c where c.codigo = i.color_codigo), i.codigo);
  perform retail.fn_material_anotar('color_retirado',
    'retiró el color «' || v_color || '» (' || i.codigo || ') de la tela «' || m.nombre || '» (' || m.codigo || ')',
    v_actor, p_ubicacion_id, m.id,
    jsonb_build_object('material_id', m.id, 'insumo_id', i.id, 'codigo', i.codigo, 'color_codigo', i.color_codigo, 'color', v_color));

  return jsonb_build_object('insumo_id', i.id, 'codigo', i.codigo, 'nombre', i.nombre, 'material_id', i.material_id, 'retirado', true, 'ya_estaba', false);
end;
$f$;
revoke all on function retail.retirar_color_de_material(uuid, uuid) from public, anon;
grant execute on function retail.retirar_color_de_material(uuid, uuid) to authenticated;
comment on function retail.retirar_color_de_material(uuid, uuid) is
  'ADR-0554: esconde un color de su tela (archivado_at) sin borrar nada. Solo el líder. Se niega si el color tiene saldo, está en una orden en proceso, tiene tela por recibir o es parte de una receta. Retirar uno ya retirado no hace nada.';

-- ---------- 3. A un color retirado no le entra tela ----------
-- `for key share` lee el color tomando su fila: si alguien lo está retirando en este mismo instante, espera a que esa transacción termine y vuelve a leer la fila ya retirada (en `read committed`
-- el bloqueo devuelve la versión nueva). Sin esa espera, el ingreso pasaría la comprobación con la fila vieja y entraría al color recién retirado.
create or replace function retail.fn_insumo_lotes_color_activo()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $f$
declare
  v_archivado timestamptz;
  v_codigo text;
begin
  select i.archivado_at, i.codigo into v_archivado, v_codigo from retail.insumos i where i.id = new.insumo_id for key share;
  if v_archivado is not null then
    raise exception 'El color % está retirado: no se le ingresa tela. Si lo necesitas otra vez, avisa al líder.', v_codigo using errcode = '23514', hint = 'insumo_retirado';
  end if;
  return new;
end;
$f$;
revoke all on function retail.fn_insumo_lotes_color_activo() from public, anon, authenticated;

create or replace trigger insumo_lotes_color_activo
  before insert on retail.insumo_lotes
  for each row execute function retail.fn_insumo_lotes_color_activo();
