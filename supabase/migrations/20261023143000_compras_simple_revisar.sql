-- ============================================================================
-- 20261023143000_compras_simple_revisar.sql — CAYLA V2 · ADR-0480 (Compras simple), actividad 7
-- «Revisar compras»: Compras completa el papel de cada compra que ya llegó a la tienda y recibe lo que se devuelve al terminar el día.
--
-- EL PROBLEMA PRIMERO. Lo que la compradora anota desde el celular baja de su plata al instante, pero los libros no lo ven (Felipe, actividad
-- 3): ni el libro de compras, ni el fondo, ni Por pagar. Faltaba quien lo pase a los libros: mirar la foto, copiar la serie y el número, y que
-- ese papel quede como un comprobante de verdad, pagado desde el fondo de quien compró. Y faltaba quien reciba la plata que la compradora
-- devuelve al terminar el día (o le pague lo que puso de su bolsillo).
--
-- QUÉ HACE
--   1. `completar_papel_compra`: con la compra ya recibida por la tienda (todas sus prendas mandadas y sus envíos cerrados), crea UN
--      comprobante por papel (`compras`, al contado, del proveedor que eligió la compradora o el que corrige Compras), con una línea por
--      prenda anotada a la tienda de su orden, y lo paga desde el fondo de quien compró (`compra_pagos` con la cuenta del fondo). El papel
--      pasa a «completado» y desde ahí los libros lo ven: el fondo baja, el libro de compras lo tiene, Facturas de proveedor lo lista.
--      **Manda el papel (Felipe 2026-10-23):** el comprobante y el pago quedan por lo que dice el papel (el monto que anotó la compradora, o el
--      que corrige Compras si se anotó mal). Si las prendas anotadas suman otra cosa, el costo de cada línea del comprobante se ajusta en
--      proporción; el costo con que entraron a la tienda no se toca. En factura, el monto lleva el IGV adentro: las líneas van sin IGV.
--   2. `compra_item_recibido_antes`: la tienda recibió las prendas ANTES de que existiera el comprobante, así que sus entradas no apuntan a
--      ninguna línea (`movimientos.compra_item_id` es nulo y `movimientos` no se edita). Esta tabla dice qué fila de lo recibido es de qué
--      línea del comprobante; con ella el comprobante nace «recibido» y Recibir no lo ofrece otra vez. Las cuatro lecturas que cuentan lo
--      recibido de un comprobante la suman (REEMPLAZOS ANCLADOS): el cupo de la recepción (`fn_recepcion_entrar`), el de las deudas del
--      proveedor (`fn_deuda_papel`), `recalcular_compras` y la explicación del Balance (`fn_bal_causas_mercaderia`).
--   3. `fn_fondo_para_pagar` (REEMPLAZO ANCLADO): desde un fondo paga solo su dueña, salvo el pago que arma `completar_papel_compra` para ese
--      fondo, dentro de su transacción (`retail.papel_paga_de`). Es la plata que la compradora ya gastó: Compras solo la pasa a los libros.
--   4. `fn_envio_reabrir_bloqueo` y `reabrir_envio` (REEMPLAZOS ANCLADOS): un envío cuya compra ya se completó no se reabre
--      (`reabrir_papel_completado`), como no se reabre uno cuya deuda Compras ya resolvió (decisión 5 de ADR-0393). Completar bloquea sus
--      envíos mientras guarda, así no se cruza con una reapertura.
--   5. `recibir_cierre_compras`: el cierre del día que espera a Compras. «Lo devuelvo» → `devolver_fondo` a la cuenta que elige Compras;
--      «CAYLA me debe» → `entregar_fondo` desde la cuenta que elige Compras. Las dos con el cierre como marca: un reintento no mueve dos
--      veces. El cierre queda resuelto (ya no se vuelve a cerrar ese día), y su plata no se anula aparte (`anular_movimiento_fondo` y
--      el «Anular» de `fn_fondos_movimientos`, REEMPLAZOS ANCLADOS): el cierre quedaría «recibido» sin plata.
--   6. `revisar_gasto_compra`: el gasto que no es ropa («Gasté en otra cosa») pasa a los libros como un gasto del viaje, con la función de
--      siempre (`registrar_gasto_viaje`): taxi y comida → del viaje; cargador → cargador, envío → flete y bolsas → embalaje, para traer la
--      mercadería; «otro» → del viaje, con lo que escribió. Compras dice qué papel le dieron (boleta, factura, ticket o, sin papel, planilla
--      de movilidad: solo taxi y cargador, decisión 55 de ADR-0362). Se paga desde el fondo de quien gastó y va a sus compras de ese día
--      (decisión 75: un gasto del viaje va siempre a una compra; si ese día no compró, a su compra anterior más cercana). Dos REEMPLAZOS
--      ANCLADOS en `registrar_gasto_viaje`, solo para el gasto que se está revisando (`retail.gasto_revisado`): no pide «Mi plata para
--      compras» a quien revisa, y la sede del gasto es la de quien gastó (decisión 46), no la de quien revisa.
--   7. `fn_revisar_compras`: la lectura de la pantalla (papeles por completar con sus prendas, lo que llegó y lo que faltó; gastos por
--      revisar; cierres por recibir).
--
-- LO QUE FALTÓ NO SE DECIDE AQUÍ. La tienda ya dijo al recibir por qué faltó cada prenda (`despacho_diferencias`): «No vino» es deuda del
-- proveedor y está en «Nos debe»; «Se perdió» lo asume CAYLA. Compras lo ve al completar, sin volver a decidirlo.
--
-- PERMISOS. Todo pide «Revisar compras» (`fondos`). Nadie completa su propio papel ni recibe su propio cierre (`fn_fondo_exigir_otra_persona`,
-- como confirmar la plata). Firma quien revisa (`fn_actor_persona_id(true)`: con su cuenta, ella; desde una terminal, el combo).
--
-- DESCARTÉ
--   · `registrar_comprobante_orden`: un comprobante por orden, y un papel tiene una orden por tienda; pide «Órdenes de compra» (la llave de
--     la compradora) y calcula el IGV aparte. El papel es UN documento: un comprobante con líneas a varias tiendas (`compra_item_destinos`).
--   · Escribir `recibido_cantidad` a mano: es una foto de lo que dicen `movimientos` y las tablas de cierre; `recalcular_compras` la borraría.
--   · Repartir el ajuste del papel en el costo de las prendas que ya están en la tienda: Felipe eligió que el catálogo quede con lo anotado.
--   · Recibir la devolución con dos llamadas desde la pantalla (devolver y marcar el cierre): si la segunda falla, el cierre queda abierto
--     con la plata ya devuelta.
--   · Escribir el gasto del viaje en esta migración (los `insert` de `gastos`, `gastos_viaje` y su reparto): dos formas de guardar lo
--     mismo; la primera corrección se olvidaría en una.
--   · [provisional] El pago del papel y del gasto sale del fondo «en efectivo»: el papel no guarda cómo se pagó y la mayoría de compras en la calle son
--     así. Si hace falta, el medio se agrega al anotar la compra.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe, después de 20261023121000). Una sola parte: una tabla NUEVA sin políticas (RLS encendido:
-- solo la tocan estas funciones), disparadores con `create or replace trigger`, funciones nuevas y reemplazos anclados. Sin `drop trigger`,
-- sin políticas, sin `alter` de tablas en uso (ADR-0195), sin `select … into` dentro de textos entre comillas (ADR-0288). Idempotente: un
-- reemplazo ya hecho se salta y uno cuya función cambió se detiene sin tocar nada.
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
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ---------- 1. Lo que la tienda recibió antes de que existiera el comprobante ----------
create table if not exists retail.compra_item_recibido_antes (
  id uuid primary key default gen_random_uuid(),
  compra_item_id uuid not null references retail.compra_items (id),
  despacho_recibido_id uuid not null references retail.despacho_recibidos (id),
  cantidad integer not null check (cantidad > 0),
  creado_por uuid not null references public.personas (id),
  creado_en timestamptz not null default now(),
  unique (compra_item_id, despacho_recibido_id)
);
comment on table retail.compra_item_recibido_antes is
  'ADR-0480: qué parte de lo recibido en un envío (sin papel todavía) es de qué línea del comprobante que se completó después. Solo se agregan filas.';
alter table retail.compra_item_recibido_antes enable row level security;
create index if not exists compra_item_recibido_antes_recibido_idx on retail.compra_item_recibido_antes (despacho_recibido_id);

-- Antes de anotar: la fila de lo recibido no tiene papel, es de la misma línea pedida y no se reparte más de lo que llegó; la línea del
-- comprobante no recibe más de lo facturado. Las dos filas se bloquean: dos completados a la vez se ponen en fila.
create or replace function retail.fn_compra_item_recibido_antes_valida()
returns trigger
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_r retail.despacho_recibidos%rowtype;
  v_ci retail.compra_items%rowtype;
  v_oci uuid;
begin
  if tg_op <> 'INSERT' then
    raise exception 'Lo recibido antes del comprobante no cambia ni se borra.' using errcode = 'P0001';
  end if;
  for v_r in select * from retail.despacho_recibidos r where r.id = new.despacho_recibido_id for update loop exit; end loop;
  for v_ci in select * from retail.compra_items ci where ci.id = new.compra_item_id for update loop exit; end loop;
  v_oci := (select di.orden_compra_item_id from retail.despacho_items di where di.id = v_r.despacho_item_id);
  if v_r.id is null or v_ci.id is null or v_r.compra_item_id is not null or v_oci is null or v_oci is distinct from v_ci.orden_compra_item_id then
    raise exception 'Esa fila de lo recibido no es de esta línea del comprobante.' using errcode = 'P0001';
  end if;
  if coalesce((select sum(a.cantidad) from retail.compra_item_recibido_antes a where a.despacho_recibido_id = v_r.id), 0) + new.cantidad > v_r.cantidad then
    raise exception 'Se repartió más de lo que llegó en esa fila.' using errcode = 'P0001';
  end if;
  if coalesce((select sum(a.cantidad) from retail.compra_item_recibido_antes a where a.compra_item_id = v_ci.id), 0) + new.cantidad > v_ci.cantidad then
    raise exception 'La línea del comprobante recibiría más de lo facturado.' using errcode = 'P0001';
  end if;
  return new;
end $$;

create or replace function retail.fn_compra_item_recibido_antes_insertado()
returns trigger
language plpgsql security definer set search_path = retail, public, extensions as $$
begin
  update retail.compras c set recibido_cantidad = c.recibido_cantidad + new.cantidad
    from retail.compra_items ci where ci.id = new.compra_item_id and c.id = ci.compra_id;
  return new;
end $$;

create or replace trigger compra_item_recibido_antes_valida
  before insert or update or delete on retail.compra_item_recibido_antes
  for each row execute function retail.fn_compra_item_recibido_antes_valida();
create or replace trigger compra_item_recibido_antes_insertado
  after insert on retail.compra_item_recibido_antes
  for each row execute function retail.fn_compra_item_recibido_antes_insertado();

-- Las cuatro lecturas que cuentan lo recibido de un comprobante también cuentan lo recibido antes.
select pg_temp.reemplazar('retail.recalcular_compras()',
$v$select sum(m.cantidad) from movimientos m join compra_items i on i.id = m.compra_item_id$v$,
$n$select sum(m.cantidad) from (select x.cantidad, x.compra_item_id from movimientos x
                                     union all select a.cantidad, a.compra_item_id from compra_item_recibido_antes a) m -- ADR-0480
        join compra_items i on i.id = m.compra_item_id$n$,
1);

select pg_temp.reemplazar('retail.fn_recepcion_entrar(uuid,uuid,text,text,uuid,jsonb,uuid[],text)',
$v$                 - coalesce((select sum(k.cantidad) from retail.compra_item_cierres k where k.compra_item_id = ci.id), 0) as cupo$v$,
$n$                 - coalesce((select sum(k.cantidad) from retail.compra_item_cierres k where k.compra_item_id = ci.id), 0)
                 -- ADR-0480: lo que llegó antes de que existiera el comprobante ya no es cupo.
                 - coalesce((select sum(a.cantidad) from retail.compra_item_recibido_antes a where a.compra_item_id = ci.id), 0) as cupo$n$,
1);

select pg_temp.reemplazar('retail.fn_deuda_papel(uuid,integer)',
$v$             - coalesce((select sum(k.cantidad) from retail.compra_item_cierres k where k.compra_item_id = ci.id), 0))::integer as cupo$v$,
$n$             - coalesce((select sum(k.cantidad) from retail.compra_item_cierres k where k.compra_item_id = ci.id), 0)
             -- ADR-0480: lo que llegó antes de que existiera el comprobante ya no es cupo.
             - coalesce((select sum(a.cantidad) from retail.compra_item_recibido_antes a where a.compra_item_id = ci.id), 0))::integer as cupo$n$,
1);

-- El Balance explica la mercadería: una entrada que después recibió su comprobante ya no es «recibida sin factura».
select pg_temp.reemplazar('retail.fn_bal_causas_mercaderia(date,date)',
$v$retail.fn_costo_variante_al(m.variante_id, m.created_at)) as c_mov$v$,
$n$retail.fn_costo_variante_al(m.variante_id, m.created_at)) as c_mov,
           -- ADR-0480: la línea del comprobante de la entrada, también si el comprobante se completó después de recibir.
           coalesce(m.compra_item_id, (select a.compra_item_id from retail.despacho_recibidos r
                                         join retail.compra_item_recibido_antes a on a.despacho_recibido_id = r.id
                                        where m.id in (r.movimiento_id, r.movimiento_danada_id) limit 1)) as ci_papel$n$,
1);
select pg_temp.reemplazar('retail.fn_bal_causas_mercaderia(date,date)', $v$mv.compra_item_id is null$v$, $n$mv.ci_papel is null$n$, 1);
select pg_temp.reemplazar('retail.fn_bal_causas_mercaderia(date,date)', $v$ci.id = mv.compra_item_id$v$, $n$ci.id = mv.ci_papel$n$, 1);

-- ---------- 2. Compras paga desde el fondo de quien compró, solo al completar su papel ----------
select pg_temp.reemplazar('retail.fn_fondo_para_pagar(uuid,text)',
$v$  -- La plata del fondo la tiene una persona: la mueve ella, con su cuenta. En una terminal cualquiera elige un nombre en el combo.$v$,
$n$  -- ADR-0480 (actividad 7): el papel de una compra anotada desde el celular lo paga Compras desde el fondo de quien compró, dentro de
  -- `completar_papel_compra` (que marca ese fondo en `retail.papel_paga_de` y lo borra al terminar). Es plata que ella ya gastó.
  if coalesce(current_setting('retail.papel_paga_de', true), '') = p_cuenta_id::text then
    perform pg_advisory_xact_lock(hashtextextended('fondo:' || v_c.persona_id::text, 0));
    return;
  end if;
  -- La plata del fondo la tiene una persona: la mueve ella, con su cuenta. En una terminal cualquiera elige un nombre en el combo.$n$,
1);

-- ---------- 3. Un envío cuya compra ya se completó no se reabre ----------
select pg_temp.reemplazar('retail.fn_envio_reabrir_bloqueo(uuid)',
$v$                  where x.despacho_id = p_despacho_id) then 'reabrir_reposicion_saldo'$v$,
$n$                  where x.despacho_id = p_despacho_id) then 'reabrir_reposicion_saldo'
    -- ADR-0480: Compras ya completó el papel de una compra que viene en este envío (lo recibido ya es de su comprobante).
    when exists (select 1 from retail.despacho_items di
                   join retail.orden_compra_items i on i.id = di.orden_compra_item_id
                   join retail.ordenes_compra o on o.id = i.orden_compra_id
                   join retail.compra_papeles cp on cp.id = o.papel_id
                  where di.despacho_id = p_despacho_id and cp.estado = 'completado') then 'reabrir_papel_completado'$n$,
1);
-- Y `reabrir_envio` lo respeta (solo frenaba con los dos motivos que conocía; /chaos 2026-10-23 lo reabrió).
select pg_temp.reemplazar('retail.reabrir_envio(uuid,integer,text,uuid)',
$v$  if v_bloqueo = 'reabrir_reposicion_saldo' then$v$,
$n$  if v_bloqueo = 'reabrir_papel_completado' then
    raise exception 'Compras ya completó el papel de una compra de %: ya no se reabre', v_envio using hint = v_bloqueo;
  end if;
  if v_bloqueo = 'reabrir_reposicion_saldo' then$n$,
1);

-- Lo que se recibe o se paga de un cierre del día no se anula aparte: el cierre quedaría «recibido» sin su plata. La pantalla no ofrece
-- «Anular» y la función lo rechaza.
select pg_temp.reemplazar('retail.anular_movimiento_fondo(uuid,text)',
$v$  v_fondo := case when v_m.tipo = 'entrega_fondo' then v_m.cuenta_destino_id else v_m.cuenta_origen_id end;$v$,
$n$  -- ADR-0480 (actividad 7): la plata de un cierre del día (lo que devolvió o lo que se le pagó) va con su cierre.
  if exists (select 1 from retail.compra_cierres k where k.id = v_m.token_cliente) then
    raise exception 'Es la plata del cierre del día de una compradora: no se anula aparte.' using errcode = 'P0001', hint = 'movimiento_de_cierre';
  end if;
  v_fondo := case when v_m.tipo = 'entrega_fondo' then v_m.cuenta_destino_id else v_m.cuenta_origen_id end;$n$,
1);
select pg_temp.reemplazar('retail.fn_fondos_movimientos(uuid,integer)',
$v$d.estado = 'vigente' and f.persona_id is distinct from v_yo as puede_anular$v$,
$n$d.estado = 'vigente' and f.persona_id is distinct from v_yo
             and not exists (select 1 from retail.compra_cierres k where k.id = d.token_cliente) as puede_anular -- ADR-0480$n$,
1);

-- ---------- 4. Firman con su cuenta, sin combo ----------
insert into retail.acciones_sin_responsable (clave, descripcion) values
  ('papel_completar', 'Completar el papel de una compra anotada desde el celular (con la cuenta de una persona firma ella, desde una terminal se elige quién)'),
  ('compra_cierre_recibir', 'Recibir lo que devuelve una compradora al terminar el día, o pagarle lo que puso (con la cuenta de una persona firma ella, desde una terminal se elige quién)'),
  ('gasto_revisar', 'Pasar a los gastos lo que una compradora gastó en otra cosa (con la cuenta de una persona firma ella, desde una terminal se elige quién)')
on conflict (clave) do update set descripcion = excluded.descripcion;

-- ---------- 5. Completar el papel ----------
-- El mismo pedido dos veces (doble clic, reintento sin red) devuelve el mismo comprobante; con otros datos, lo dice.
create or replace function retail.completar_papel_compra(
  p_papel_id uuid,
  p_proveedor_id uuid default null,
  p_serie text default null,
  p_numero text default null,
  p_monto numeric default null
) returns jsonb
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_p retail.compra_papeles%rowtype;
  v_actor uuid;
  v_huella text;
  v_prov uuid;
  v_monto numeric;
  v_serie text;
  v_numero text;
  v_base numeric;
  v_igv numeric := 0;
  v_anotado numeric;
  v_unidades integer;
  v_lineas jsonb := '[]'::jsonb;
  v_l jsonb;
  v_suma numeric := 0;
  v_resto numeric;
  v_j integer;
  v_c numeric;
  v_gestora uuid;
  v_fondo uuid;
  v_compra uuid;
  v_documento text;
  v_ci uuid;
  v_falta integer;
  v_toma integer;
  v_recibidas integer := 0;
  v_r record;
  v_existe record;
  v_restriccion text;
begin
  if not retail.fn_ve_modulo('fondos') then
    raise exception 'Completar el papel de una compra necesita el módulo Revisar compras en tu rol.' using errcode = '42501';
  end if;
  for v_p in select * from retail.compra_papeles c where c.id = p_papel_id for update loop
    exit;
  end loop;
  if v_p.id is null then
    raise exception 'Esa compra no existe: recarga la pantalla.' using errcode = 'P0001', hint = 'papel_no_existe';
  end if;

  v_huella := md5(jsonb_build_array(p_proveedor_id, upper(btrim(coalesce(p_serie, ''))), btrim(coalesce(p_numero, '')), p_monto::text)::text);
  if v_p.estado = 'completado' then
    for v_existe in select c.id, c.documento, c.total, c.huella_envio from retail.compras c where c.token_cliente = v_p.id loop
      if v_existe.huella_envio = v_huella then
        return jsonb_build_object('compra_id', v_existe.id, 'documento', v_existe.documento, 'total', v_existe.total, 'ya_estaba', true);
      end if;
    end loop;
    raise exception 'Esa compra ya se completó: recarga la pantalla.' using errcode = 'P0001', hint = 'papel_ya_completado';
  end if;
  if v_p.estado <> 'por_completar' then
    raise exception 'Esa compra se anuló: ya no se completa.' using errcode = 'P0001', hint = 'papel_anulado';
  end if;

  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién completa el papel.' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  perform retail.fn_fondo_exigir_otra_persona(v_p.persona_id, v_actor, 'Nadie completa el papel de su propia compra');

  -- Sus envíos se bloquean mientras se completa (como los bloquea `reabrir_envio`): nadie los reabre a mitad de camino, y si alguien ya
  -- los está reabriendo, esto espera y después ve el envío abierto (/chaos 2026-10-23).
  perform 1 from retail.despachos d
   where d.id in (select di.despacho_id from retail.ordenes_compra o join retail.orden_compra_items i on i.orden_compra_id = o.id
                    join retail.despacho_items di on di.orden_compra_item_id = i.id where o.papel_id = v_p.id)
   order by d.id for share;

  -- ¿Ya llegó a la tienda? Todo mandado y todos sus envíos cerrados: recién ahí se sabe qué llegó.
  if exists (select 1 from retail.ordenes_compra o join retail.orden_compra_items i on i.orden_compra_id = o.id
              where o.papel_id = v_p.id and o.estado <> 'anulada' and retail.fn_compra_item_por_mandar(i.id) > 0) then
    raise exception 'Todavía falta mandar parte de esta compra a la tienda: se completa cuando la tienda la reciba.'
      using errcode = 'P0001', hint = 'papel_por_mandar';
  end if;
  if exists (select 1 from retail.ordenes_compra o join retail.orden_compra_items i on i.orden_compra_id = o.id
               join retail.despacho_items di on di.orden_compra_item_id = i.id join retail.despachos d on d.id = di.despacho_id
              where o.papel_id = v_p.id and o.estado <> 'anulada' and d.estado in ('en_camino', 'abierto')) then
    raise exception 'La tienda todavía no termina de recibir esta compra: se completa cuando cierre el conteo.'
      using errcode = 'P0001', hint = 'papel_sin_recibir';
  end if;

  -- El proveedor: el que eligió la compradora o el que corrige Compras mirando la foto.
  v_prov := coalesce(p_proveedor_id, v_p.proveedor_id);
  if not exists (select 1 from retail.proveedores pr where pr.id = v_prov) then
    raise exception 'Ese proveedor no existe: elígelo de nuevo.' using errcode = 'P0001', hint = 'papel_proveedor';
  end if;
  -- El monto: el que anotó la compradora, o el del papel si se anotó mal.
  if p_monto is not null and not retail.fn_monto_valido(p_monto) then
    raise exception 'El monto tiene que ser un número mayor que cero.' using errcode = 'P0001', hint = 'monto_invalido';
  end if;
  v_monto := round(coalesce(p_monto, v_p.monto), 2);
  if v_monto <= 0 or v_monto > 1000000 then
    raise exception 'El monto va de S/ 0.01 a S/ 1 000 000.' using errcode = 'P0001', hint = 'monto_invalido';
  end if;
  if p_monto is not null and p_monto <> v_monto then
    raise exception 'El monto admite como máximo 2 decimales.' using errcode = 'P0001', hint = 'monto_invalido';
  end if;

  -- La serie y el número, como en el papel. Nota de venta sin número y compra sin papel: número interno.
  if v_p.tipo in ('factura', 'boleta') then
    v_serie := upper(btrim(coalesce(p_serie, '')));
    v_numero := btrim(coalesce(p_numero, ''));
    if v_serie !~ '^[A-Z0-9]{1,8}$' then
      raise exception 'Copia la serie como está en el papel (F001, B002…): letras y números, hasta 8.' using errcode = 'P0001', hint = 'papel_serie';
    end if;
    if v_numero !~ '^[0-9]{1,12}$' then
      raise exception 'Copia el número como está en el papel: solo números, hasta 12.' using errcode = 'P0001', hint = 'papel_numero';
    end if;
  elsif v_p.tipo = 'nota_venta' then
    v_serie := 'NV';
    v_numero := nullif(btrim(coalesce(p_numero, '')), '');
    if v_numero is not null and v_numero !~ '^[0-9A-Za-z-]{1,20}$' then
      raise exception 'El número de la nota de venta: letras, números o guiones, hasta 20.' using errcode = 'P0001', hint = 'papel_numero';
    end if;
  else
    v_serie := 'SC';
    v_numero := null;
  end if;
  if v_numero is not null and exists (select 1 from retail.compras c where c.proveedor_id = v_prov and c.serie = v_serie
                                       and c.numero = v_numero and c.estado = 'vigente') then
    raise exception 'Ese comprobante ya está registrado para este proveedor: revisa la serie y el número.' using errcode = 'P0001', hint = 'papel_repetido';
  end if;

  -- Las prendas anotadas, en el orden en que se anotaron.
  select coalesce(jsonb_agg(jsonb_build_object(
           'oci', i.id, 'cat', i.categoria_id, 'marca', i.marca_id, 'desc', i.descripcion, 'q', i.cantidad,
           'sub', i.subtotal, 'sug', i.precio_venta_sugerido, 'destino', o.ubicacion_destino_id)
           order by o.creada_en, o.numero, i.posicion), '[]'::jsonb),
         coalesce(sum(i.subtotal), 0), coalesce(sum(i.cantidad), 0)
    into v_lineas, v_anotado, v_unidades
    from retail.ordenes_compra o join retail.orden_compra_items i on i.orden_compra_id = o.id
   where o.papel_id = v_p.id and o.estado <> 'anulada';
  if v_unidades = 0 then
    raise exception 'Esta compra no tiene prendas.' using errcode = 'P0001', hint = 'papel_sin_prendas';
  end if;

  -- Manda el papel: las líneas suman exactamente lo del papel (en factura, sin su IGV); el costo de cada una se ajusta en proporción.
  if v_p.tipo = 'factura' then
    v_base := round(v_monto / (1 + retail.fn_tasa_igv(v_p.fecha)), 2);
    v_igv := v_monto - v_base;
  else
    v_base := v_monto;
  end if;
  select jsonb_agg(l.v || jsonb_build_object('c',
           case when v_anotado > 0 then round((l.v ->> 'sub')::numeric / (l.v ->> 'q')::integer * v_base / v_anotado, 2)
                else round(v_base / v_unidades, 2) end) order by l.n)
    into v_lineas
    from jsonb_array_elements(v_lineas) with ordinality as l(v, n);
  v_suma := (select sum((x ->> 'q')::integer * (x ->> 'c')::numeric) from jsonb_array_elements(v_lineas) x);
  v_resto := v_base - v_suma;
  if v_resto <> 0 then
    -- El redondeo a céntimos, en la línea de costo más alto: una unidad sola lleva la diferencia (si la línea tiene más, se parte en dos).
    select (n - 1)::integer, (v ->> 'c')::numeric into v_j, v_c
      from jsonb_array_elements(v_lineas) with ordinality as l(v, n)
     order by (v ->> 'c')::numeric desc, n limit 1;
    if v_c + v_resto < 0 then
      raise exception 'No se pudo repartir el monto del papel entre las prendas: revisa el monto.' using errcode = 'P0001', hint = 'monto_invalido';
    end if;
    if (v_lineas -> v_j ->> 'q')::integer = 1 then
      v_lineas := jsonb_set(v_lineas, array[v_j::text, 'c'], to_jsonb(v_c + v_resto));
    else
      v_lineas := jsonb_set(v_lineas, array[v_j::text, 'q'], to_jsonb((v_lineas -> v_j ->> 'q')::integer - 1))
                  || jsonb_build_array((v_lineas -> v_j) || jsonb_build_object('q', 1, 'c', v_c + v_resto));
    end if;
  end if;

  -- La tienda que gestiona el papel: la que recibe más prendas de esta compra.
  v_gestora := (select (x ->> 'destino')::uuid from jsonb_array_elements(v_lineas) x
                 group by x ->> 'destino' order by sum((x ->> 'q')::integer) desc, x ->> 'destino' limit 1);

  if v_numero is null then
    v_numero := lpad(nextval('retail.compras_sin_comprobante_seq')::text, 6, '0');
  end if;
  begin
    insert into retail.compras (proveedor_id, tipo, serie, numero, fecha_emision, condicion, fecha_vencimiento, subtotal, igv, total, nota,
                                usuario_id, token_cliente, ubicacion_gestion_id, naturaleza, huella_envio)
    values (v_prov, v_p.tipo, v_serie, v_numero, v_p.fecha, 'contado', null, v_base, v_igv, v_monto,
            left('Compra anotada desde el celular por '
                 || coalesce((select nullif(btrim(concat_ws(' ', pe.nombres, pe.apellidos)), '') from public.personas pe where pe.id = v_p.persona_id), 'la compradora')
                 || case when v_anotado <> v_base then ' (el costo de las prendas se ajustó a lo que dice el papel)' else '' end, 500),
            v_actor, v_p.id, v_gestora, 'mercaderia', v_huella)
    returning id, documento into v_compra, v_documento;
  exception when unique_violation then
    get stacked diagnostics v_restriccion = constraint_name;
    if v_restriccion = 'compras_token_cliente_key' then
      raise exception 'Esa compra se está completando en otra pantalla: recarga.' using errcode = 'P0001', hint = 'papel_ya_completado';
    end if;
    raise exception 'Ese comprobante ya está registrado para este proveedor: revisa la serie y el número.' using errcode = 'P0001', hint = 'papel_repetido';
  end;

  -- Las líneas, cada una a la tienda de su orden, y lo que ya llegó de cada una.
  for v_l in select x from jsonb_array_elements(v_lineas) x loop
    insert into retail.compra_items (compra_id, producto_id, variante_id, descripcion, cantidad, costo_unitario, categoria_id, marca_id,
                                     orden_compra_item_id, precio_venta_sugerido)
    values (v_compra, null, null, v_l ->> 'desc', (v_l ->> 'q')::integer, (v_l ->> 'c')::numeric, (v_l ->> 'cat')::uuid,
            (v_l ->> 'marca')::uuid, (v_l ->> 'oci')::uuid, (v_l ->> 'sug')::numeric)
    returning id into v_ci;
    insert into retail.compra_item_destinos (compra_item_id, ubicacion_id, cantidad)
    values (v_ci, (v_l ->> 'destino')::uuid, (v_l ->> 'q')::integer);

    v_falta := (v_l ->> 'q')::integer;
    for v_r in
      select r.id, r.cantidad - coalesce((select sum(a.cantidad) from retail.compra_item_recibido_antes a
                                            join retail.compra_items ai on ai.id = a.compra_item_id
                                            join retail.compras ac on ac.id = ai.compra_id and ac.estado = 'vigente'
                                           where a.despacho_recibido_id = r.id), 0) as queda
        from retail.despacho_recibidos r
        join retail.despacho_items di on di.id = r.despacho_item_id
        join retail.despachos d on d.id = r.despacho_id and d.estado = 'cerrado'
       where di.orden_compra_item_id = (v_l ->> 'oci')::uuid and r.compra_item_id is null
       order by r.creado_en, r.id
    loop
      exit when v_falta = 0;
      if v_r.queda > 0 then
        v_toma := least(v_falta, v_r.queda);
        insert into retail.compra_item_recibido_antes (compra_item_id, despacho_recibido_id, cantidad, creado_por)
        values (v_ci, v_r.id, v_toma, v_actor);
        v_falta := v_falta - v_toma;
        v_recibidas := v_recibidas + v_toma;
      end if;
    end loop;
  end loop;

  -- El pago: del fondo de quien compró, el día que compró.
  v_fondo := retail.fn_fondo_de(v_p.persona_id, true);
  perform retail.fn_validar_fecha_pago_compra(v_p.fecha, v_p.fecha, v_documento);
  perform set_config('retail.papel_paga_de', v_fondo::text, true);
  insert into retail.compra_pagos (compra_id, fecha, monto, metodo, referencia, usuario_id, ubicacion_id, cuenta_dinero_id)
  values (v_compra, v_p.fecha, v_monto, 'efectivo', 'Plata para compras', v_actor, null, v_fondo);
  perform set_config('retail.papel_paga_de', '', true);

  update retail.compra_papeles set estado = 'completado' where id = v_p.id;

  begin
    perform retail.fn_actividad_anotar('fondos', 'papel_completado',
      'completó el papel ' || v_documento || ' de la compra de '
        || coalesce((select nullif(btrim(concat_ws(' ', pe.nombres, pe.apellidos)), '') from public.personas pe where pe.id = v_p.persona_id), 'una compradora'),
      v_actor, retail.fn_actividad_terminal_ahora(), null, v_gestora, 'compra_papeles', v_p.id::text, now(),
      jsonb_build_object('compra_id', v_compra, 'tipo', v_p.tipo, 'ajustado', v_anotado <> v_base, 'otro_monto', v_monto <> v_p.monto), 'vivo');
  exception when others then
    raise warning 'actividad: no se anotó el papel %: %', v_p.id, sqlerrm;
  end;

  return jsonb_build_object('compra_id', v_compra, 'documento', v_documento, 'total', v_monto, 'ajustado', v_anotado <> v_base,
                            'recibidas', v_recibidas, 'ya_estaba', false);
end $$;

-- ---------- 6. Recibir lo del cierre del día ----------
create or replace function retail.recibir_cierre_compras(
  p_cierre_id uuid,
  p_cuenta_id uuid,
  p_monto numeric default null
) returns jsonb
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_k retail.compra_cierres%rowtype;
  v_actor uuid;
  v_monto numeric;
  v_mov uuid;
  v_nombre text;
begin
  if not retail.fn_ve_modulo('fondos') then
    raise exception 'Recibir lo del cierre del día necesita el módulo Revisar compras en tu rol.' using errcode = '42501';
  end if;
  for v_k in select * from retail.compra_cierres k where k.id = p_cierre_id for update loop
    exit;
  end loop;
  if v_k.id is null then
    raise exception 'Ese cierre no existe: recarga la pantalla.' using errcode = 'P0001';
  end if;
  if v_k.resuelto_en is not null then
    return jsonb_build_object('id', v_k.id, 'ya_estaba', true);
  end if;
  if v_k.decision = 'se_queda' then
    raise exception 'Se lo quedó para su próxima compra: no hay nada que recibir.' using errcode = 'P0001', hint = 'cierre_se_queda';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién recibe la plata.' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  perform retail.fn_fondo_exigir_otra_persona(v_k.persona_id, v_actor, 'Lo de tu propio día lo recibe otra persona');
  v_nombre := coalesce((select nullif(btrim(pe.nombres), '') from public.personas pe where pe.id = v_k.persona_id), 'la compradora');
  -- La plata por confirmar todavía no está en su fondo: devolverla o compensarla antes descuadraría los libros.
  if exists (select 1 from retail.fondo_plata_anotada a where a.persona_id = v_k.persona_id and a.estado = 'por_confirmar') then
    raise exception 'Primero confirma la plata que anotó %: arriba, en «Plata que anotaron las compradoras».', v_nombre
      using errcode = 'P0001', hint = 'cierre_plata_por_confirmar';
  end if;
  if p_monto is not null and not retail.fn_monto_valido(p_monto) then
    raise exception 'El monto tiene que ser un número mayor que cero.' using errcode = 'P0001', hint = 'monto_invalido';
  end if;
  v_monto := round(coalesce(p_monto, v_k.monto), 2);
  if v_monto <= 0 then
    raise exception 'El monto tiene que ser mayor que cero.' using errcode = 'P0001', hint = 'monto_invalido';
  end if;

  if v_k.decision = 'devuelve' then
    v_mov := retail.devolver_fondo(v_k.persona_id, p_cuenta_id, v_monto,
      'Devolvió lo que le quedó al terminar de comprar el ' || to_char(v_k.fecha, 'DD/MM'), null, v_k.id);
  else
    v_mov := retail.entregar_fondo(v_k.persona_id, p_cuenta_id, v_monto,
      'Lo que puso de su bolsillo al comprar el ' || to_char(v_k.fecha, 'DD/MM'), null, v_k.id);
  end if;

  update retail.compra_cierres set resuelto_en = now(), resuelto_por = v_actor where id = v_k.id;

  begin
    perform retail.fn_actividad_anotar('fondos', 'cierre_recibido',
      case v_k.decision when 'devuelve' then 'recibió lo que devolvió ' else 'le pagó lo que puso de su bolsillo a ' end
        || coalesce((select nullif(btrim(concat_ws(' ', pe.nombres, pe.apellidos)), '') from public.personas pe where pe.id = v_k.persona_id), 'una compradora'),
      v_actor, retail.fn_actividad_terminal_ahora(), null, null, 'compra_cierres', v_k.id::text, now(),
      jsonb_build_object('decision', v_k.decision, 'otro_monto', v_monto <> v_k.monto), 'vivo');
  exception when others then
    raise warning 'actividad: no se anotó el cierre %: %', v_k.id, sqlerrm;
  end;
  return jsonb_build_object('id', v_k.id, 'movimiento_id', v_mov, 'monto', v_monto, 'ya_estaba', false);
end $$;

-- ---------- 7. Revisar un gasto que no es ropa ----------
select pg_temp.reemplazar('retail.registrar_gasto_viaje(text,text,numeric,date,text,text,uuid,uuid[],text,text,text,uuid)',
$v$  if not retail.fn_ve_modulo('ordenes_compra') then$v$,
$n$  -- ADR-0480 (actividad 7): el gasto que anotó una compradora lo pasa Compras desde «Revisar compras»: `revisar_gasto_compra` marca
  -- `retail.gasto_revisado` con ese gasto, que llega como `p_token`.
  if not retail.fn_ve_modulo('ordenes_compra')
     and not (p_token is not null and coalesce(current_setting('retail.gasto_revisado', true), '') = p_token::text) then$n$,
1);
select pg_temp.reemplazar('retail.registrar_gasto_viaje(text,text,numeric,date,text,text,uuid,uuid[],text,text,text,uuid)',
$v$      where co.persona_id = v_actor and u.activo limit 1),$v$,
$n$      -- ADR-0480: el gasto de una compradora es de su sede, aunque lo pase Compras.
      where co.persona_id = coalesce((select g.persona_id from retail.compra_gastos g
                                       where g.id = p_token and coalesce(current_setting('retail.gasto_revisado', true), '') = p_token::text), v_actor)
        and u.activo limit 1),$n$,
1);

create or replace function retail.revisar_gasto_compra(
  p_gasto_id uuid,
  p_papel text,
  p_serie_numero text default null,
  p_ruc text default null
) returns jsonb
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_g retail.compra_gastos%rowtype;
  v_actor uuid;
  v_tipo text;
  v_concepto text;
  v_ordenes uuid[];
  v_papel_cercano uuid;
  v_fondo uuid;
  v_id uuid;
begin
  if not retail.fn_ve_modulo('fondos') then
    raise exception 'Revisar un gasto necesita el módulo Revisar compras en tu rol.' using errcode = '42501';
  end if;
  for v_g in select * from retail.compra_gastos g where g.id = p_gasto_id for update loop
    exit;
  end loop;
  if v_g.id is null then
    raise exception 'Ese gasto no existe: recarga la pantalla.' using errcode = 'P0001';
  end if;
  if v_g.estado = 'completado' then
    return jsonb_build_object('gasto_id', (select x.id from retail.gastos x where x.token_cliente = v_g.id), 'ya_estaba', true);
  end if;
  if v_g.estado <> 'por_completar' then
    raise exception 'Ese gasto se anuló: ya no se revisa.' using errcode = 'P0001';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién revisa el gasto.' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  perform retail.fn_fondo_exigir_otra_persona(v_g.persona_id, v_actor, 'Nadie revisa sus propios gastos');

  -- Lo que anotó, en las palabras de un gasto del viaje.
  v_tipo := case when v_g.concepto in ('cargador', 'envio', 'bolsas') then 'mercaderia' else 'viaje' end;
  v_concepto := case v_g.concepto when 'envio' then 'flete' when 'bolsas' then 'embalaje' else v_g.concepto end;

  -- Sus compras de ese día; si ese día no compró, su compra anterior más cercana (o la siguiente, si no hay anterior).
  v_ordenes := array(select o.id from retail.compra_papeles cp join retail.ordenes_compra o on o.papel_id = cp.id
                      where cp.persona_id = v_g.persona_id and cp.fecha = v_g.fecha and cp.estado <> 'anulado' and o.estado <> 'anulada');
  if cardinality(v_ordenes) = 0 then
    v_papel_cercano := (select cp.id from retail.compra_papeles cp
                         where cp.persona_id = v_g.persona_id and cp.estado <> 'anulado'
                           and exists (select 1 from retail.ordenes_compra o where o.papel_id = cp.id and o.estado <> 'anulada')
                         order by cp.fecha > v_g.fecha, abs(cp.fecha - v_g.fecha), cp.created_at desc limit 1);
    v_ordenes := array(select o.id from retail.ordenes_compra o where o.papel_id = v_papel_cercano and o.estado <> 'anulada');
  end if;
  if cardinality(v_ordenes) = 0 then
    raise exception 'Todavía no hay una compra de quien gastó: un gasto del viaje va siempre a una compra. Revísalo cuando anote la primera.'
      using errcode = 'P0001', hint = 'gasto_sin_compra';
  end if;

  v_fondo := retail.fn_fondo_de(v_g.persona_id, true);
  perform set_config('retail.gasto_revisado', v_g.id::text, true);
  perform set_config('retail.papel_paga_de', v_fondo::text, true);
  v_id := retail.registrar_gasto_viaje(v_tipo, v_concepto, v_g.monto, v_g.fecha, p_papel, 'efectivo', v_fondo, v_ordenes,
                                       nullif(btrim(coalesce(p_serie_numero, '')), ''), nullif(btrim(coalesce(p_ruc, '')), ''), v_g.nota, v_g.id);
  perform set_config('retail.papel_paga_de', '', true);
  perform set_config('retail.gasto_revisado', '', true);

  update retail.compra_gastos set estado = 'completado' where id = v_g.id;

  begin
    perform retail.fn_actividad_anotar('fondos', 'gasto_revisado',
      'pasó a los gastos lo que gastó en otra cosa '
        || coalesce((select nullif(btrim(concat_ws(' ', pe.nombres, pe.apellidos)), '') from public.personas pe where pe.id = v_g.persona_id), 'una compradora'),
      v_actor, retail.fn_actividad_terminal_ahora(), null, null, 'compra_gastos', v_g.id::text, now(),
      jsonb_build_object('concepto', v_g.concepto, 'papel', p_papel), 'vivo');
  exception when others then
    raise warning 'actividad: no se anotó el gasto %: %', v_g.id, sqlerrm;
  end;
  return jsonb_build_object('gasto_id', v_id, 'ya_estaba', false);
end $$;

-- ---------- 8. La lectura de la pantalla ----------
-- Cada papel por completar con sus prendas (lo anotado, a qué tienda, cuánto se mandó, cuánto contó la tienda y por qué faltó lo que
-- faltó), sus envíos y si ya llegó; y los cierres del día que esperan a Compras. Las fotos las firma la pantalla.
create or replace function retail.fn_revisar_compras()
returns jsonb
language plpgsql stable security definer set search_path = retail, public, extensions as $$
declare
  v_yo uuid := retail.fn_persona_de_la_cuenta();
begin
  if not retail.fn_ve_modulo('fondos') then
    raise exception 'Ver las compras por revisar necesita el módulo Revisar compras en tu rol.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'papeles', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', cp.id, 'persona_id', cp.persona_id,
               'persona', nullif(btrim(concat_ws(' ', pe.nombres, pe.apellidos)), ''),
               'es_mia', v_yo is not null and cp.persona_id = v_yo,
               'proveedor_id', cp.proveedor_id, 'proveedor', pr.nombre, 'proveedor_ruc', pr.ruc,
               'tipo', cp.tipo, 'monto', cp.monto, 'foto_ruta', cp.foto_ruta, 'fecha', cp.fecha, 'creado_en', cp.created_at,
               'lineas', (
                 select coalesce(jsonb_agg(jsonb_build_object(
                          'id', i.id,
                          'nombre', coalesce(pp.referencia, i.descripcion, ca.nombre),
                          'categoria', ca.nombre, 'cantidad', i.cantidad, 'costo', i.precio_unitario, 'subtotal', i.subtotal,
                          'destino', u.nombre,
                          'mandadas', (select coalesce(sum(di.cantidad), 0) from retail.despacho_items di join retail.despachos d on d.id = di.despacho_id
                                        where di.orden_compra_item_id = i.id and d.estado <> 'anulado'),
                          'contadas_cerrado', (select bool_and(d.estado = 'cerrado') from retail.despacho_items di join retail.despachos d on d.id = di.despacho_id
                                                where di.orden_compra_item_id = i.id and d.estado <> 'anulado'),
                          'faltan', (select coalesce(jsonb_agg(jsonb_build_object('cantidad', x.cantidad, 'causa', x.causa) order by x.creado_en), '[]'::jsonb)
                                       from retail.despacho_diferencias_vigentes x join retail.despacho_items di on di.id = x.despacho_item_id
                                      where di.orden_compra_item_id = i.id and x.tipo = 'faltante'),
                          'sobran', (select coalesce(sum(x.cantidad), 0) from retail.despacho_diferencias_vigentes x
                                       join retail.despacho_items di on di.id = x.despacho_item_id
                                      where di.orden_compra_item_id = i.id and x.tipo = 'sobrante'))
                          order by o.creada_en, o.numero, i.posicion), '[]'::jsonb)
                   from retail.ordenes_compra o
                   join retail.orden_compra_items i on i.orden_compra_id = o.id
                   join retail.ubicaciones u on u.id = o.ubicacion_destino_id
                   left join retail.categorias ca on ca.id = i.categoria_id
                   left join retail.productos pp on pp.id = i.producto_id
                  where o.papel_id = cp.id and o.estado <> 'anulada'),
               'envios', (
                 select coalesce(jsonb_agg(distinct jsonb_build_object('id', d.id, 'numero', d.numero, 'estado', d.estado)), '[]'::jsonb)
                   from retail.ordenes_compra o join retail.orden_compra_items i on i.orden_compra_id = o.id
                   join retail.despacho_items di on di.orden_compra_item_id = i.id join retail.despachos d on d.id = di.despacho_id
                  where o.papel_id = cp.id and o.estado <> 'anulada' and d.estado <> 'anulado'),
               'llego', not exists (select 1 from retail.ordenes_compra o join retail.orden_compra_items i on i.orden_compra_id = o.id
                                     where o.papel_id = cp.id and o.estado <> 'anulada' and retail.fn_compra_item_por_mandar(i.id) > 0)
                        and not exists (select 1 from retail.ordenes_compra o join retail.orden_compra_items i on i.orden_compra_id = o.id
                                          join retail.despacho_items di on di.orden_compra_item_id = i.id
                                          join retail.despachos d on d.id = di.despacho_id
                                         where o.papel_id = cp.id and o.estado <> 'anulada' and d.estado in ('en_camino', 'abierto')))
             order by cp.created_at)
        from retail.compra_papeles cp
        join public.personas pe on pe.id = cp.persona_id
        join retail.proveedores pr on pr.id = cp.proveedor_id
       where cp.estado = 'por_completar'), '[]'::jsonb),
    'gastos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', g.id, 'persona_id', g.persona_id, 'persona', nullif(btrim(concat_ws(' ', pe.nombres, pe.apellidos)), ''),
               'es_mia', v_yo is not null and g.persona_id = v_yo, 'concepto', g.concepto, 'nota', g.nota, 'monto', g.monto,
               'foto_ruta', g.foto_ruta, 'fecha', g.fecha,
               'tiene_compra', exists (select 1 from retail.compra_papeles cp join retail.ordenes_compra o on o.papel_id = cp.id
                                        where cp.persona_id = g.persona_id and cp.estado <> 'anulado' and o.estado <> 'anulada'))
             order by g.fecha, g.created_at)
        from retail.compra_gastos g join public.personas pe on pe.id = g.persona_id
       where g.estado = 'por_completar'), '[]'::jsonb),
    'cierres', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', k.id, 'persona_id', k.persona_id, 'persona', nullif(btrim(concat_ws(' ', pe.nombres, pe.apellidos)), ''),
               'es_mia', v_yo is not null and k.persona_id = v_yo, 'fecha', k.fecha, 'decision', k.decision, 'monto', k.monto,
               'plata_por_confirmar', coalesce((select sum(a.monto) from retail.fondo_plata_anotada a
                                                 where a.persona_id = k.persona_id and a.estado = 'por_confirmar'), 0))
             order by k.fecha, k.cerrado_en)
        from retail.compra_cierres k join public.personas pe on pe.id = k.persona_id
       where k.resuelto_en is null and k.decision in ('devuelve', 'le_deben')), '[]'::jsonb),
    -- Para «No es este: cambiar»: los proveedores activos (quien revisa no necesita el módulo Proveedores para elegir uno).
    'proveedores', coalesce((select jsonb_agg(jsonb_build_object('id', pr.id, 'nombre', pr.nombre, 'ruc', pr.ruc) order by pr.nombre)
                               from retail.proveedores pr where pr.activo), '[]'::jsonb));
end $$;

revoke all on function retail.fn_compra_item_recibido_antes_valida() from public, anon, authenticated;
revoke all on function retail.fn_compra_item_recibido_antes_insertado() from public, anon, authenticated;
revoke all on function retail.completar_papel_compra(uuid, uuid, text, text, numeric) from public, anon;
revoke all on function retail.recibir_cierre_compras(uuid, uuid, numeric) from public, anon;
revoke all on function retail.revisar_gasto_compra(uuid, text, text, text) from public, anon;
revoke all on function retail.fn_revisar_compras() from public, anon;
grant execute on function retail.completar_papel_compra(uuid, uuid, text, text, numeric) to authenticated;
grant execute on function retail.recibir_cierre_compras(uuid, uuid, numeric) to authenticated;
grant execute on function retail.revisar_gasto_compra(uuid, text, text, text) to authenticated;
grant execute on function retail.fn_revisar_compras() to authenticated;
