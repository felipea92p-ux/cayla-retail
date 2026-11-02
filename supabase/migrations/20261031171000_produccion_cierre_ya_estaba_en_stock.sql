-- ============================================================================
-- 20261031171000_produccion_cierre_ya_estaba_en_stock.sql
-- Cerrar una orden cuyas prendas YA estaban registradas en una sede, sin volver a meterlas al stock
-- (ADR-0551, decisión C y actividad 3; Felipe 2026-10-27 «el Chaleco ya está en tienda: su orden NO mete stock» y 2026-10-31 «sí, armarla»).
--
-- EL PROBLEMA PRIMERO. `cerrar_produccion` SIEMPRE mete una `entrada` al Taller por cada talla y color buenos. El Chaleco Cayla ya estaba en Tienda TRU
-- (15 ajustes «Encontré prendas» del 21-oct, 57 prendas) cuando se abrió su orden (OP-000001, 27-oct). Pasarla al stock de verdad habría dejado 114 prendas
-- en el sistema para 57 que existen, y el botón «Llevarlas a las tiendas» del aviso de éxito las habría duplicado otra vez en TRU. No había otra salida
-- que cerrar y después restar a mano con un ajuste «Otro»: un movimiento sin causa en el Taller y un cierre que miente («entraron 57 al stock»).
--
-- QUÉ PROMETE (el contrato, en tres líneas).
--   1. `marcar_orden_ya_en_stock(orden, true)` —solo un líder, solo mientras la orden está en proceso, nunca una muestra— anota que esa orden va a cerrar
--      SIN stock. Es una declaración, no mueve nada; se puede desmarcar con `false` mientras la orden siga en proceso.
--   2. `cerrar_produccion` de una orden marcada hace TODO lo de siempre (buenas por talla, candados de fase, tela, costo de la orden, lo medido) EXCEPTO
--      tocar el stock: no escribe en `movimientos`, no llama a `fn_aplicar_movimiento` ni a `fn_recalcular_costo_variante`, y deja `inventariado_at` en
--      nulo (la orden nunca «entró al stock»; así no cuenta como llegada del mes ni como origen de la prenda). El costo por prenda se queda SOLO en la orden
--      (`producciones.costo_unitario`), como decidió Felipe: `variantes.costo` no se mueve.
--      Tampoco pregunta por el «costo atípico»: esa pregunta protege el promedio de la prenda, que aquí no se toca.
--   3. Antes de cerrar se comprueba que no se esté declarando «ya estaba» de algo que nunca se registró: por cada talla y color con buenas, en las sedes
--      tiene que haber entrado (entrada, o ajuste que suma) por lo menos esa cantidad (`ya_estaba_sin_registro`). Es un tope de cordura, no una prueba de que
--      sean las mismas prendas: la lectura final la hace el líder, que es el único que puede marcarla.
--
-- ESTADOS IMPOSIBLES (que el esquema impide, no la pantalla).
--   · Una muestra no puede ser `ya_estaba`: no toca el stock de ninguna manera (CHECK `producciones_ingreso_al_stock_valido`).
--   · Un valor fuera de {movimiento, ya_estaba}: el mismo CHECK.
--   · Una orden `ya_estaba` con `inventariado_at` lleno o con una entrada en `movimientos`: lo vigila `scripts/pruebas/produccion_ya_estaba.mjs` (cruza dos tablas;
--     un CHECK no puede).
--
-- QUÉ NO HACE.
--   · No decide en qué sede están las prendas ni las liga a la orden (los ajustes de TRU no llevan `produccion_id`; mover o reetiquetar un movimiento
--     existente rompería el append-only de `movimientos`, principio 4).
--   · No cambia `variantes.costo`: el costo real queda en la orden. Si Felipe quiere que el promedio ponderado lo tome, es otra decisión (dinero).
--   · No se aplica sola a órdenes viejas: todas nacen y siguen `movimiento`.
--
-- QUÉ SE ROMPE SI. Se marca una orden `ya_estaba` y esas prendas en realidad nunca se registraron (el tope de cordura solo atrapa lo que no llegó ni en
-- cantidad): el stock nunca entra y la prenda no se vende. Se arregla desmarcando y cerrando normal, o con «Revertir» (que reabre la orden y la deja en
-- `movimiento`).
--
-- TODO FALLA. No toca ninguna dependencia externa. Si la web nueva sale antes que el SQL, la casilla pide una función que no existe: el cierre normal no cambia
-- (la casilla solo la ve un líder y solo llama a la función si la marca); si el SQL sale antes, nadie la usa todavía. Cualquier orden puede cerrarse como siempre.
--
-- ORDEN PARA PRODUCCIÓN. Se pega en UNA parte (no crea políticas): primero el `alter table` (con `lock_timeout`), después las funciones. Las partes 2 a 4 son reemplazos
-- anclados sobre las funciones vivas (cerrar/revertir/fn_orden_produccion ya tienen varios parches encima: NO se recrean; ver la nota «Parches vivos»): si un ancla ya
-- no aparece una vez, el pegado se detiene con un mensaje y no cambia nada. Repegarla no hace nada (idempotente).
--
-- CÓMO SE DESHACE. (Producción hoy: 0 órdenes `ya_estaba`.) Si alguna se marcó: `update retail.producciones set ingreso_al_stock = 'movimiento' where ingreso_al_stock = 'ya_estaba';`
-- Después, quitar los tres anclajes (los `reemplazar_anclado` al revés), `drop function retail.marcar_orden_ya_en_stock(uuid, boolean)`,
-- `drop function retail.fn_produccion_exigir_ya_registrada(uuid)`, y `alter table retail.producciones drop constraint producciones_ingreso_al_stock_valido,
-- drop column ingreso_al_stock`.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------------------------------------------------------------- 1. La columna: cómo entra (o no) al stock una orden.
alter table retail.producciones add column if not exists ingreso_al_stock text not null default 'movimiento';

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'retail.producciones'::regclass and conname = 'producciones_ingreso_al_stock_valido') then
    alter table retail.producciones add constraint producciones_ingreso_al_stock_valido
      check (ingreso_al_stock in ('movimiento', 'ya_estaba') and (ingreso_al_stock = 'movimiento' or not es_muestra));
  end if;
end;
$$;

comment on column retail.producciones.ingreso_al_stock is
  'ADR-0551 C: cómo entra al stock lo que salió buenas. movimiento = una entrada por talla y color al cerrar (lo de siempre); ya_estaba = las prendas ya estaban registradas en una sede, el cierre no escribe en movimientos ni toca variantes.costo y deja inventariado_at nulo. Nunca en una muestra.';

reset lock_timeout;

-- ---------------------------------------------------------------- 2. El tope de cordura: no se declara «ya estaba» de lo que nunca se registró.
create or replace function retail.fn_produccion_exigir_ya_registrada(p_produccion_id uuid)
returns void
language plpgsql
stable
set search_path = retail, public, extensions
as $$
declare
  v_fila record;
begin
  if not exists (select 1 from retail.producciones p where p.id = p_produccion_id and p.ingreso_al_stock = 'ya_estaba' and not p.es_muestra) then
    return;
  end if;
  for v_fila in
    select l.variante_id, l.cantidad_buenas, r.registrado
      from retail.produccion_lineas l
      cross join lateral (
        -- Lo que alguna vez se registró como llegada (entrada) o como prendas encontradas (ajuste que suma), en cualquier sede, fuera de esta orden.
        select coalesce(sum(m.cantidad), 0)::integer as registrado
          from retail.movimientos m
         where m.variante_id = l.variante_id
           and (m.tipo = 'entrada' or (m.tipo = 'ajuste' and m.cantidad > 0))
           and m.produccion_id is distinct from p_produccion_id
      ) r
     where l.produccion_id = p_produccion_id and l.cantidad_buenas > 0 and r.registrado < l.cantidad_buenas
     order by l.variante_id
  loop
    raise exception 'De % marcaste % buenas como «ya estaban registradas», pero en las sedes solo se registraron % de esa talla y color. Si no estaban registradas, quita la marca y pásalas al stock del Taller.',
      retail.fn_produccion_variante_texto(v_fila.variante_id), v_fila.cantidad_buenas, v_fila.registrado
      using hint = 'ya_estaba_sin_registro';
  end loop;
end;
$$;
comment on function retail.fn_produccion_exigir_ya_registrada(uuid) is
  'ADR-0551 C: si la orden cierra «ya estaba en stock», cada talla y color con buenas debe tener registradas (entrada o ajuste que suma, en cualquier sede) al menos esas prendas. Un tope de cordura, no una prueba de identidad.';
revoke all on function retail.fn_produccion_exigir_ya_registrada(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- 3. La declaración del líder.
create or replace function retail.marcar_orden_ya_en_stock(p_produccion_id uuid, p_ya_estaba boolean)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_o record;
  v_actor uuid;
  v_nuevo text;
begin
  if p_ya_estaba is null then
    raise exception 'Indica si las prendas ya estaban registradas' using hint = 'ya_estaba_requerido';
  end if;
  select p.id, p.ubicacion_id, p.estado, p.es_muestra, p.numero, p.ingreso_al_stock
    into v_o from retail.producciones p where p.id = p_produccion_id for update;
  if v_o.id is null then
    raise exception 'Esa orden no existe' using hint = 'orden_inexistente';
  end if;
  perform retail.fn_produccion_exigir_operar(v_o.ubicacion_id);
  if not retail.fn_es_lider() then
    raise exception 'Solo un líder marca que las prendas ya estaban registradas' using errcode = '42501', hint = 'ya_estaba_solo_lider';
  end if;
  if v_o.estado <> 'en_proceso' then
    raise exception 'La orden ya no está en proceso' using hint = 'orden_cerrada';
  end if;
  if v_o.es_muestra then
    raise exception 'Una muestra no toca el stock: no hay nada que marcar' using hint = 'muestra_sin_stock';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién lo marca' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  v_nuevo := case when p_ya_estaba then 'ya_estaba' else 'movimiento' end;
  if v_o.ingreso_al_stock = v_nuevo then
    return;
  end if;
  update retail.producciones set ingreso_al_stock = v_nuevo where id = p_produccion_id;
  begin
    perform retail.fn_actividad_anotar(
      'produccion', 'produccion_ya_en_stock',
      case when p_ya_estaba then 'marcó que las prendas de la ' else 'quitó la marca «ya estaban registradas» de la ' end || retail.fn_produccion_numero_texto(v_o.numero)
        || case when p_ya_estaba then ' ya estaban registradas: al cerrarla no suma al stock' else '' end,
      v_actor, retail.fn_actividad_terminal_ahora(), v_o.ubicacion_id, v_o.ubicacion_id,
      'produccion', p_produccion_id::text, now(),
      jsonb_build_object('produccion_id', p_produccion_id, 'numero', v_o.numero, 'ya_estaba', p_ya_estaba),
      'vivo');
  exception when others then
    raise warning 'actividad: no se anotó la marca «ya estaba» de la orden % (%)', v_o.numero, sqlerrm;
  end;
end;
$$;
comment on function retail.marcar_orden_ya_en_stock(uuid, boolean) is
  'ADR-0551 C: un líder declara que las prendas de la orden ya estaban registradas en una sede, para que cerrarla no las meta otra vez al stock. Solo en proceso y nunca una muestra. No mueve nada: la declaración la respeta cerrar_produccion.';
revoke all on function retail.marcar_orden_ya_en_stock(uuid, boolean) from public, anon;
grant execute on function retail.marcar_orden_ya_en_stock(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------- 4. Reemplazos anclados sobre las funciones vivas.
-- Reemplaza `p_viejo` por `p_nuevo` en la función viva; `p_viejo` tiene que aparecer exactamente una vez. Si `p_nuevo` ya está, no hace nada.
create or replace function pg_temp.reemplazar_anclado(p_firma text, p_viejo text, p_nuevo text)
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
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición real.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- 4a. cerrar_produccion: el tope de cordura va con las buenas ya anotadas y antes de escribir el estado, y de una orden «ya estaba» no se escribe
--     ninguna entrada (el `for` queda vacío: no hay un `if` aparte) ni queda `inventariado_at`.
--     El ancla del tope es el cierre del «cero buenas», NO la llamada a `fn_produccion_exigir_tela`: la migración 20261029190000 reconoce que ya se aplicó por el
--     bloque contiguo «comentario + llamada + comentario del costo», y una línea mía en medio la haría repegarse y duplicar su llamada (lo vigila S2 de
--     `produccion_tela_al_cortar.mjs`).
select pg_temp.reemplazar_anclado(
  'retail.cerrar_produccion(uuid, jsonb, numeric, numeric, numeric, boolean)',
  $v$anula la orden en vez de cerrarla';
  end if;$v$,
  $v$anula la orden en vez de cerrarla';
  end if;
  perform retail.fn_produccion_exigir_ya_registrada(p_produccion_id);$v$
);
select pg_temp.reemplazar_anclado(
  'retail.cerrar_produccion(uuid, jsonb, numeric, numeric, numeric, boolean)',
  $v$inventariado_at = case when es_muestra then null else now() end$v$,
  $v$inventariado_at = case when es_muestra or ingreso_al_stock = 'ya_estaba' then null else now() end$v$
);
select pg_temp.reemplazar_anclado(
  'retail.cerrar_produccion(uuid, jsonb, numeric, numeric, numeric, boolean)',
  $v$select * from produccion_lineas where produccion_id = p_produccion_id and cantidad_buenas > 0$v$,
  $v$select * from produccion_lineas where produccion_id = p_produccion_id and cantidad_buenas > 0 and v_orden.ingreso_al_stock = 'movimiento'$v$
);

-- 4a bis. El costo atípico compara el costo de la orden con el costo VIGENTE de la prenda porque está por entrar a su promedio ponderado en las tres sedes. Una orden
--     «ya estaba» no lo toca (el costo se queda solo en la orden), así que no hay nada que contaminar y su pregunta («entra al costo de esta prenda en todas las sedes») sería falsa.
select pg_temp.reemplazar_anclado(
  'retail.cerrar_produccion(uuid, jsonb, numeric, numeric, numeric, boolean)',
  $v$and retail.fn_costo_fuera_de_banda(v_costo, vr.costo, vr.precio) is not null$v$,
  $v$and retail.fn_costo_fuera_de_banda(v_costo, vr.costo, vr.precio) is not null and v_orden.ingreso_al_stock = 'movimiento'$v$
);

-- 4b. revertir_produccion: reabrir una orden la devuelve a la forma de siempre (la marca no sobrevive a un «Revertir»: hay que decidirla otra vez).
select pg_temp.reemplazar_anclado(
  'retail.revertir_produccion(uuid)',
  $v$set estado = 'en_proceso', cantidad_buenas = null, inventariado_at = null$v$,
  $v$set estado = 'en_proceso', cantidad_buenas = null, inventariado_at = null, ingreso_al_stock = 'movimiento'$v$
);

-- 4c. fn_orden_produccion: la orden dice cómo entra al stock (la web lo muestra y marca la casilla).
select pg_temp.reemplazar_anclado(
  'retail.fn_orden_produccion(uuid)',
  $v$p.inventariado_at, p.cantidad_plan, p.cantidad_buenas,$v$,
  $v$p.inventariado_at, p.ingreso_al_stock, p.cantidad_plan, p.cantidad_buenas,$v$
);
select pg_temp.reemplazar_anclado(
  'retail.fn_orden_produccion(uuid)',
  $v$'inventariado_at', v_o.inventariado_at,$v$,
  $v$'inventariado_at', v_o.inventariado_at, 'ingreso_al_stock', v_o.ingreso_al_stock,$v$
);

reset lock_timeout;
