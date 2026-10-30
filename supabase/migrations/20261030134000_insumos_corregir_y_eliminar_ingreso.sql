-- ============================================================================
-- 20261030134000_insumos_corregir_y_eliminar_ingreso.sql — CAYLA V2 (ADR-0570, actividad 6a · 2026-10-30)
--
-- EL PROBLEMA PRIMERO. Un ingreso de tela escrito por error no se arregla desde ninguna pantalla. El 2026-10-29 alguien anotó 9 m en «Milano Melange · Arena (retirado)» (MM-01-ARE) cuando eran del
-- Arena de verdad: «Retirar color» se niega porque el color «todavía tiene 9 m», y no existe un botón para corregir ni para eliminar ese ingreso. El libro de movimientos es de solo agregar y la única función
-- que escribía un `ajuste` se borró el 28-oct: quedaba escribir SQL a mano en producción. Felipe (ADR-0570, rondas 4, 5 y 8): «un ingreso equivocado se corrige libre mientras nadie lo use; si ya se usó,
-- solo se ajusta lo que queda», «eliminar = sale de la vista, con su rastro y se puede restaurar», con el motivo obligatorio.
--
-- QUÉ HACE (una sola parte; sin políticas — ADR-0195; sin `drop trigger`)
--   1. `insumo_lotes.anulado_at` (legible por la API: las columnas de esa tabla se leen una por una) y dos candados: `cantidad_ingresada >= 0` (antes `> 0`) y `(anulado_at is null) = (cantidad_ingresada > 0)`. Un ingreso eliminado queda en CERO con su marca; una cantidad en
--      cero sin marca, o una marca con cantidad, no pueden existir. Con la cantidad en cero TODA cuenta de lote que ya existe (el saldo que descuenta la tela, «lo que hay» de la orden, el PEPS) ve
--      un lote vacío sin que ninguna de esas funciones cambie: no se reescribe ninguna función viva de producción.
--   2. `insumo_lote_cambios` (nueva, de solo agregar): cada corrección, eliminación y restauración de un ingreso, con quién, cuándo, el motivo y el antes y el después. Se escribe en la MISMA transacción
--      que el cambio (la Actividad, en cambio, falla en silencio y no alcanza como historia).
--   3. `corregir_ingreso_insumo(lote, cantidad_que_vio, cantidad, costo, fecha, documento, código, motivo)`, `eliminar_ingreso_insumo(lote, cantidad_que_vio, motivo)` y
--      `restaurar_ingreso_insumo(lote, motivo)`: del líder, firman con el responsable, todo o nada. Corregir y eliminar solo se dejan sobre un lote que NADIE usó (ningún consumo, merma ni devolución) y que
--      no llegó con una factura ni con una orden de insumos recibida (esos se corrigen desde su recepción). `fn_ingreso_insumo_corregible` es la ÚNICA lista de lo que lo impide.
--   4. `fn_ingresos_eliminados(taller)`: lo eliminado con quién, cuándo y por qué, para que la pantalla lo muestre y ofrezca «Restaurar». Solo al líder.
--
-- CÓMO QUEDA EL LIBRO (la parte que más importa)
--   El libro `movimientos_insumo` no se toca ni se borra: el ingreso original (`compra`) queda. Cada cambio se escribe como «deshago lo que había y anoto lo nuevo», con el tipo `ajuste` ligado al lote:
--     corregir 9 m a 7 m   →  ajuste −9 al costo viejo  +  ajuste +7 al costo nuevo   (el saldo del color baja 2 y su valor cuadra al céntimo)
--     eliminar 9 m          →  ajuste −9 al costo del lote, y el lote queda en cero con `anulado_at`
--     restaurar             →  ajuste +9 al costo del lote, y el lote vuelve a su cantidad
--   Así el saldo del color (suma del libro) y el saldo del lote (la cantidad del lote menos lo que salió) dicen siempre lo mismo: la cantidad del lote y la suma de sus `compra` + `ajuste` son la misma cifra
--   (lo vigila `scripts/chaos/invariantes.mjs`, INV-26). Un `ajuste` ligado a un lote NO entra en el saldo del lote (la fórmula del lote solo mira consumo, merma y devolución), y eso es lo correcto: la
--   cantidad del lote ya está corregida en el propio lote.
--
-- CONTRATO (Liskov)
--   PROMETE: nada se borra (la fila del lote y todo el libro quedan); todo cambio lleva motivo, responsable y su antes y después; ningún cambio deja un saldo de color distinto de la suma de sus lotes; un
--            lote que alguien ya usó no se toca. Repetir una llamada (doble clic, red que se corta) no duplica nada: corregir con lo mismo no escribe, eliminar uno ya eliminado lo dice, restaurar uno ya activo lo dice.
--   ASUME:   están pegadas 20260921140000 y 20261015035000 (las columnas `comprobante_item_id`, `recepcion_id`, `orden_insumo_recepcion_id` y `orden_insumo_item_id` de `insumo_lotes`), 20261014154000
--            (`fn_produccion_exigir_operar`) y 20260924130000 (`token_cliente`). Si falta algo, se detiene al principio con un mensaje claro y no cambia nada.
--   NO HACE: no corrige un lote que ya se usó (la regla del ADR: ahí «se ajusta lo que queda», que aún no existe como pantalla); no corrige lo que llegó con una factura u orden recibida; no toca el proveedor
--            ni la nota del lote; no libera el código de un lote eliminado (sigue ocupado por el índice único de códigos); las métricas por proveedor (`fn_proveedor_metricas_insumos`) cuentan un lote eliminado como
--            «un lote» de total cero (no pasa con los ingresos desde la pantalla, que no llevan proveedor); no reactiva un color retirado (restaurar un ingreso se niega si su color está retirado).
--
-- DECIDÍ: corregir el propio lote cuando nadie lo usó, y dejar en el libro el par «deshago + anoto» con `ajuste` ligado al lote; eliminar = cantidad en cero + marca. DESCARTÉ (1) un tipo de movimiento nuevo
--   (`anulacion`): cambia el CHECK de `tipo` y obliga a reescribir en cuatro funciones vivas (`registrar_consumo_insumo`, `fn_insumo_consumir_peps`, `devolver_insumo_de_produccion`, `fn_orden_produccion`) y en la
--   web la fórmula del saldo de un lote, o el lote anulado seguiría dando 9 m al PEPS y el color quedaría en −9 (stock fantasma, la advertencia del ADR-0570); (2) una `merma` por la cantidad: las cuentas
--   del lote ya la entienden, pero el consumo semanal la cuenta como tela usada y falsearía las «semanas que alcanza»; (3) borrar la fila del lote y su `compra`: rompe el libro de solo agregar.
-- SE ROMPE SI: alguien agrega una función que lea `cantidad_ingresada` de los lotes para otra cosa y no entienda que un lote eliminado vale cero (se arregla sola: cero es cero); si una pantalla nueva escribe
--   `cantidad_ingresada` de un lote sin pasar por aquí (el invariante INV-26 lo ve: lote y libro dejan de coincidir); o si dos personas corrigen el mismo ingreso a la vez con valores distintos (el candado del
--   lote las pone en fila y la segunda recibe `ingreso_cambio_mientras_tanto` porque su pantalla vio una cantidad que ya cambió).
--
-- PRODUCCIÓN. NO está aplicada. Una sola parte, re-ejecutable, `lock_timeout = 3s`: una columna nueva y dos CHECK en `insumo_lotes` (tabla chica, sin políticas), una tabla nueva con RLS encendido y SIN políticas
-- (solo la leen funciones security definer, ADR-0195), funciones nuevas y UN disparador nuevo con `create or replace trigger` (sin `drop trigger`). No hay `select … into` dentro de un texto entre comillas
-- (ADR-0288). Prueba: `pnpm pruebas:insumos-corregir-ingreso`.
--
-- ORDEN Y VENTANA. Va DESPUÉS de 20261029190000 (que ya está pegada). Se pega ENTERA, una sola vez, en el SQL Editor de cayla-dynamic; dura menos de un segundo y no hay ventana que avisar: ninguna función viva cambia, y
--   la web de hoy no la usa. La web nueva funciona antes y después (si la columna `anulado_at` todavía no se puede leer, lee los lotes como hasta hoy). Se puede publicar la web antes o después.
--
-- SI HAY QUE VOLVER ATRÁS. Solo mientras ningún ingreso esté eliminado (si lo hay, primero «Restaurar» desde la pantalla: así ningún lote queda con `anulado_at` y en cero). Si queda alguno, el `add constraint` de abajo
--   se detiene con el error de Postgres «violated by some row» y no cambia nada:
--     alter table retail.insumo_lotes drop constraint if exists insumo_lotes_anulado_sin_cantidad;
--     alter table retail.insumo_lotes drop constraint if exists insumo_lotes_cantidad_ingresada_check;
--     alter table retail.insumo_lotes add constraint insumo_lotes_cantidad_ingresada_check check (cantidad_ingresada > 0);
--     drop function if exists retail.corregir_ingreso_insumo(uuid, numeric, numeric, numeric, date, text, text, text), retail.eliminar_ingreso_insumo(uuid, numeric, text),
--       retail.restaurar_ingreso_insumo(uuid, text), retail.fn_ingresos_eliminados(uuid);
--   La historia (`insumo_lote_cambios`), la columna `anulado_at` y las funciones internas se quedan: no estorban y guardan lo que se hizo. Un ingreso YA corregido no se deshace al volver atrás: su lote tiene la cantidad
--   nueva y el libro dice por qué.
-- ============================================================================
set lock_timeout = '3s';

-- 0. Se detiene, sin tocar nada, si falta algo de lo que este SQL usa.
do $f$
declare
  v_falta text;
begin
  v_falta := (
    select string_agg(x.que, ', ')
      from (values
        ('insumo_lotes.comprobante_item_id', exists (select 1 from information_schema.columns where table_schema = 'retail' and table_name = 'insumo_lotes' and column_name = 'comprobante_item_id')),
        ('insumo_lotes.recepcion_id', exists (select 1 from information_schema.columns where table_schema = 'retail' and table_name = 'insumo_lotes' and column_name = 'recepcion_id')),
        ('insumo_lotes.orden_insumo_recepcion_id', exists (select 1 from information_schema.columns where table_schema = 'retail' and table_name = 'insumo_lotes' and column_name = 'orden_insumo_recepcion_id')),
        ('insumo_lotes.orden_insumo_item_id', exists (select 1 from information_schema.columns where table_schema = 'retail' and table_name = 'insumo_lotes' and column_name = 'orden_insumo_item_id')),
        ('retail.fn_produccion_exigir_operar', to_regproc('retail.fn_produccion_exigir_operar') is not null),
        ('retail.fn_actor_persona_id', to_regproc('retail.fn_actor_persona_id') is not null),
        ('retail.fn_actividad_anotar', to_regproc('retail.fn_actividad_anotar') is not null),
        ('retail.fn_hoy_lima', to_regproc('retail.fn_hoy_lima') is not null)
      ) as x(que, ok)
     where not x.ok
  );
  if v_falta is not null then
    raise exception 'Falta lo que este SQL necesita: %. Pega primero las migraciones de las que depende (ver el encabezado) y vuelve a pegar esta.', v_falta;
  end if;
end;
$f$;

-- 1. El lote: una marca de eliminado y la cantidad que puede quedar en cero.
alter table retail.insumo_lotes add column if not exists anulado_at timestamptz;
-- Las columnas de `insumo_lotes` se leen una por una (candado del dinero, 20260921151000: `costo_unitario` no es legible por la API): una columna NUEVA no se lee hasta que se le da permiso. Sin esta línea la
-- pantalla de Insumos se caía con «permission denied for table insumo_lotes» (lo vio la prueba en el navegador). `anulado_at` no es dinero.
grant select (anulado_at) on retail.insumo_lotes to authenticated;

-- El CHECK viejo de `cantidad_ingresada > 0` se busca por lo que dice (no por su nombre) para no dejar uno huérfano si en algún ambiente se llamó distinto.
do $f$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'retail.insumo_lotes'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) = 'CHECK ((cantidad_ingresada > (0)::numeric))'
  loop
    execute format('alter table retail.insumo_lotes drop constraint %I', c.conname);
  end loop;
end;
$f$;
alter table retail.insumo_lotes drop constraint if exists insumo_lotes_cantidad_ingresada_check;
alter table retail.insumo_lotes add constraint insumo_lotes_cantidad_ingresada_check check (cantidad_ingresada >= 0);
-- El estado imposible, hecho imposible: eliminado con cantidad, o en cero sin estar eliminado.
alter table retail.insumo_lotes drop constraint if exists insumo_lotes_anulado_sin_cantidad;
alter table retail.insumo_lotes add constraint insumo_lotes_anulado_sin_cantidad check ((anulado_at is null) = (cantidad_ingresada > 0));
comment on column retail.insumo_lotes.anulado_at is
  'ADR-0570: cuándo se eliminó este ingreso por error (cantidad_ingresada queda en 0). Nada se borra: `insumo_lote_cambios` dice quién, por qué y cuánto era, y «Restaurar» lo devuelve.';

-- 2. La historia de los cambios de un ingreso: de solo agregar.
create table if not exists retail.insumo_lote_cambios (
  id uuid primary key default gen_random_uuid(),
  insumo_lote_id uuid not null references retail.insumo_lotes(id),
  insumo_id uuid not null references retail.insumos(id),
  ubicacion_id uuid not null references retail.ubicaciones(id),
  accion text not null check (accion in ('corregir', 'eliminar', 'restaurar')),
  -- El motivo de un cambio: nunca vacío.
  motivo text not null check (btrim(motivo) <> '' and length(motivo) <= 300),
  antes jsonb not null,
  despues jsonb not null,
  hecho_por uuid not null references public.personas(id),
  -- `clock_timestamp()` y no `now()`: dentro de una misma transacción `now()` es siempre lo mismo y la historia no sabría en qué orden pasó cada cambio (eliminar y restaurar leen «el último»).
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists insumo_lote_cambios_por_lote on retail.insumo_lote_cambios (insumo_lote_id, created_at);
comment on table retail.insumo_lote_cambios is
  'ADR-0570: cada corrección, eliminación y restauración de un ingreso de insumo, con su motivo y el antes y el después. De solo agregar; se escribe en la misma transacción que el cambio.';
alter table retail.insumo_lote_cambios enable row level security;
revoke all on table retail.insumo_lote_cambios from anon, authenticated;

create or replace function retail.fn_insumo_lote_cambios_inmutable()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $f$
begin
  raise exception 'La historia de un ingreso no se edita ni se borra: se agrega otro cambio' using errcode = '42501';
end;
$f$;
revoke all on function retail.fn_insumo_lote_cambios_inmutable() from public, anon, authenticated;

create or replace trigger insumo_lote_cambios_inmutable
  before update or delete on retail.insumo_lote_cambios
  for each row execute function retail.fn_insumo_lote_cambios_inmutable();

-- 3. Piezas compartidas.
-- 3a. El motivo: obligatorio, hasta 300 letras.
create or replace function retail.fn_ingreso_insumo_motivo(p_motivo text)
returns text
language plpgsql
immutable
set search_path = retail, public, extensions
as $f$
declare
  v text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if v is null then
    raise exception 'Cuéntanos por qué: queda en la historia del ingreso' using hint = 'ingreso_sin_motivo';
  end if;
  if length(v) > 300 then
    raise exception 'El motivo es muy largo: hasta 300 letras' using hint = 'ingreso_motivo_largo';
  end if;
  return v;
end;
$f$;
revoke all on function retail.fn_ingreso_insumo_motivo(text) from public, anon, authenticated;

-- 3b. Lo que impide corregir o eliminar un ingreso: la ÚNICA lista. `null` si se puede; si no, la frase para quien lo lee.
create or replace function retail.fn_ingreso_insumo_corregible(p_lote_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $f$
declare
  l retail.insumo_lotes;
begin
  select * into l from retail.insumo_lotes x where x.id = p_lote_id;
  if not found then
    return 'Ese ingreso ya no existe. Actualiza la pantalla.';
  end if;
  if l.comprobante_item_id is not null or l.recepcion_id is not null or l.orden_insumo_recepcion_id is not null or l.orden_insumo_item_id is not null then
    return 'Este ingreso llegó con una factura o con una orden de insumos recibida: se corrige desde esa recepción, no aquí.';
  end if;
  if exists (select 1 from retail.movimientos_insumo m where m.insumo_lote_id = l.id and m.tipo in ('consumo', 'merma', 'devolucion')) then
    return 'De este lote ya salió material: lo que entró ya no se cambia. Corrige primero lo que se anotó en la orden.';
  end if;
  return null;
end;
$f$;
revoke all on function retail.fn_ingreso_insumo_corregible(uuid) from public, anon, authenticated;

-- 3c. Abre el ingreso para cambiarlo: permisos y candado. Es del líder (mete dinero: el costo del lote), con el módulo Producción en ese Taller. El lote queda bloqueado hasta el final de la
--     transacción: quien esté descontando tela de él (`registrar_consumo_insumo` y `fn_insumo_consumir_peps` toman la fila del lote) termina antes, o espera a que esto acabe.
create or replace function retail.fn_ingreso_insumo_abrir(p_lote_id uuid)
returns retail.insumo_lotes
language plpgsql
security definer
set search_path = retail, public, extensions
as $f$
declare
  l retail.insumo_lotes;
begin
  select * into l from retail.insumo_lotes x where x.id = p_lote_id;
  if not found then
    raise exception 'Ese ingreso ya no existe. Actualiza la pantalla.' using hint = 'ingreso_no_existe';
  end if;
  perform retail.fn_produccion_exigir_operar(l.ubicacion_id);
  if not retail.fn_es_lider() then
    raise exception 'Corregir o eliminar un ingreso es del líder.' using errcode = '42501', hint = 'ingreso_sin_lider';
  end if;
  select * into l from retail.insumo_lotes x where x.id = p_lote_id for update;
  if not found then
    raise exception 'Ese ingreso ya no existe. Actualiza la pantalla.' using hint = 'ingreso_no_existe';
  end if;
  return l;
end;
$f$;
revoke all on function retail.fn_ingreso_insumo_abrir(uuid) from public, anon, authenticated;

-- 3d. La línea de Actividad (nunca tumba el cambio: si no se puede anotar, avisa y sigue; la historia de verdad es `insumo_lote_cambios`).
create or replace function retail.fn_ingreso_insumo_anotar(p_accion text, p_descripcion text, p_actor uuid, p_ubicacion_id uuid, p_insumo_id uuid, p_detalle jsonb)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $f$
begin
  perform retail.fn_actividad_anotar('produccion', p_accion, p_descripcion, p_actor, retail.fn_actividad_terminal_ahora(), p_ubicacion_id, p_ubicacion_id, 'insumos', p_insumo_id::text, now(), p_detalle, 'vivo');
exception when others then
  raise warning 'actividad: no se anotó «%» del insumo % (%)', p_accion, p_insumo_id, sqlerrm;
end;
$f$;
revoke all on function retail.fn_ingreso_insumo_anotar(text, text, uuid, uuid, uuid, jsonb) from public, anon, authenticated;

-- 4. Corregir un ingreso: cantidad, costo, día, documento o código de lote.
--    `p_cantidad_antes` es la cantidad que la pantalla vio: si ya cambió, se rechaza (otra persona lo corrigió mientras tanto). `p_costo_unitario` en `null` deja el costo como está (quien corrige
--    sin ver costos no los toca).
create or replace function retail.corregir_ingreso_insumo(
  p_lote_id uuid,
  p_cantidad_antes numeric,
  p_cantidad numeric,
  p_costo_unitario numeric,
  p_fecha date,
  p_documento text,
  p_codigo_lote text,
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $f$
declare
  l retail.insumo_lotes;
  v_actor uuid;
  v_nombre text;
  v_costo numeric(12,4);
  v_doc text := nullif(btrim(coalesce(p_documento, '')), '');
  v_cod text := nullif(btrim(coalesce(p_codigo_lote, '')), '');
  v_doc_antes text;
  v_motivo text;
  v_razon text;
  v_antes jsonb;
  v_despues jsonb;
  v_que text[] := '{}';
begin
  l := retail.fn_ingreso_insumo_abrir(p_lote_id);
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién guarda esto' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  if l.anulado_at is not null then
    raise exception 'Este ingreso ya se eliminó: restáuralo si lo necesitas.' using hint = 'ingreso_eliminado';
  end if;
  if p_cantidad_antes is null or p_cantidad_antes <> l.cantidad_ingresada then
    raise exception 'Este ingreso cambió mientras lo corregías. Actualiza la pantalla y vuelve a intentar.' using hint = 'ingreso_cambio_mientras_tanto';
  end if;

  if p_cantidad is null or p_cantidad <= 0 or p_cantidad <> round(p_cantidad, 3) or p_cantidad > 100000 then
    raise exception 'La cantidad: un número mayor que cero, con hasta tres decimales' using hint = 'ingreso_cantidad_invalida';
  end if;
  if p_costo_unitario is not null and (p_costo_unitario < 0 or p_costo_unitario > 100000) then
    raise exception 'El costo no puede ser negativo' using hint = 'ingreso_costo_invalido';
  end if;
  v_costo := case when p_costo_unitario is null then l.costo_unitario else round(p_costo_unitario, 4) end;
  -- Un ingreso de después de las 7 de la noche (hora de Lima) quedó con la fecha de mañana en UTC: si el día no se toca no se rechaza (no es culpa de quien corrige otra cosa).
  if p_fecha is null or (p_fecha <> l.fecha_ingreso and p_fecha > retail.fn_hoy_lima()) then
    raise exception 'El día del ingreso no puede quedar vacío ni ser de mañana' using hint = 'ingreso_fecha_invalida';
  end if;
  if length(coalesce(v_doc, '')) > 40 or length(coalesce(v_cod, '')) > 40 then
    raise exception 'El documento y el código de lote: hasta 40 letras' using hint = 'ingreso_texto_largo';
  end if;
  if v_cod is not null and exists (select 1 from retail.insumo_lotes o where o.insumo_id = l.insumo_id and o.codigo_lote = v_cod and o.id <> l.id) then
    raise exception 'Ya hay otro lote de este insumo con el código %', v_cod using hint = 'ingreso_codigo_repetido';
  end if;

  -- Sin nada distinto no se escribe nada (un doble clic, o guardar sin tocar): ni motivo, ni historia.
  v_doc_antes := nullif(btrim(coalesce(l.documento, '')), '');
  if p_cantidad = l.cantidad_ingresada and v_costo = l.costo_unitario and p_fecha = l.fecha_ingreso and v_doc is not distinct from v_doc_antes and v_cod is not distinct from l.codigo_lote then
    return jsonb_build_object('lote_id', l.id, 'sin_cambios', true);
  end if;

  v_razon := retail.fn_ingreso_insumo_corregible(l.id);
  if v_razon is not null then
    raise exception '%', v_razon using errcode = '23514', hint = 'ingreso_no_corregible';
  end if;
  v_motivo := retail.fn_ingreso_insumo_motivo(p_motivo);

  v_antes := jsonb_build_object('cantidad', l.cantidad_ingresada, 'costo_unitario', l.costo_unitario, 'fecha_ingreso', l.fecha_ingreso, 'documento', l.documento, 'codigo_lote', l.codigo_lote);
  v_despues := jsonb_build_object('cantidad', p_cantidad, 'costo_unitario', v_costo, 'fecha_ingreso', p_fecha, 'documento', v_doc, 'codigo_lote', v_cod);

  -- El libro: se deshace lo que había (a su costo) y se anota lo nuevo (al suyo). El saldo del color baja o sube lo que cambió y su valor cuadra.
  if p_cantidad <> l.cantidad_ingresada or v_costo <> l.costo_unitario then
    insert into retail.movimientos_insumo (insumo_id, insumo_lote_id, ubicacion_id, tipo, cantidad, costo_unitario, usuario_id, motivo)
    values
      (l.insumo_id, l.id, l.ubicacion_id, 'ajuste', -l.cantidad_ingresada, l.costo_unitario, v_actor, 'Se corrigió un ingreso: ' || v_motivo),
      (l.insumo_id, l.id, l.ubicacion_id, 'ajuste', p_cantidad, v_costo, v_actor, 'Se corrigió un ingreso: ' || v_motivo);
  end if;

  update retail.insumo_lotes
     set cantidad_ingresada = p_cantidad, costo_unitario = v_costo, fecha_ingreso = p_fecha, documento = v_doc, codigo_lote = v_cod
   where id = l.id;

  insert into retail.insumo_lote_cambios (insumo_lote_id, insumo_id, ubicacion_id, accion, motivo, antes, despues, hecho_por)
  values (l.id, l.insumo_id, l.ubicacion_id, 'corregir', v_motivo, v_antes, v_despues, v_actor);

  if p_cantidad <> l.cantidad_ingresada then v_que := v_que || ('cantidad ' || trim_scale(l.cantidad_ingresada) || ' → ' || trim_scale(p_cantidad)); end if;
  if v_costo <> l.costo_unitario then v_que := v_que || 'costo'::text; end if;
  if p_fecha <> l.fecha_ingreso then v_que := v_que || 'día'::text; end if;
  if v_doc is distinct from v_doc_antes or v_cod is distinct from l.codigo_lote then v_que := v_que || 'documento o código'::text; end if;
  v_nombre := (select i.nombre from retail.insumos i where i.id = l.insumo_id);
  perform retail.fn_ingreso_insumo_anotar('insumo_ingreso_corregido',
    'corrigió un ingreso de «' || v_nombre || '» (' || array_to_string(v_que, ', ') || ')',
    v_actor, l.ubicacion_id, l.insumo_id,
    jsonb_build_object('insumo_id', l.insumo_id, 'lote_id', l.id, 'motivo', v_motivo));

  return jsonb_build_object('lote_id', l.id, 'sin_cambios', false);
end;
$f$;
revoke all on function retail.corregir_ingreso_insumo(uuid, numeric, numeric, numeric, date, text, text, text) from public, anon;
grant execute on function retail.corregir_ingreso_insumo(uuid, numeric, numeric, numeric, date, text, text, text) to authenticated;
comment on function retail.corregir_ingreso_insumo(uuid, numeric, numeric, numeric, date, text, text, text) is
  'ADR-0570: corrige un ingreso que nadie usó (cantidad, costo, día, documento, código). Solo el líder, con motivo; en el libro deja «deshago + anoto» como ajuste ligado al lote. Con lo mismo no escribe nada.';

-- 5. Eliminar un ingreso: el lote queda en cero y marcado, y el libro lo deshace con un ajuste. Nada se borra.
create or replace function retail.eliminar_ingreso_insumo(p_lote_id uuid, p_cantidad_antes numeric, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $f$
declare
  l retail.insumo_lotes;
  v_actor uuid;
  v_nombre text;
  v_motivo text;
  v_razon text;
begin
  l := retail.fn_ingreso_insumo_abrir(p_lote_id);
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién guarda esto' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  -- Un doble clic, o dos personas a la vez: el segundo ya lo encuentra eliminado. No es un error y no se anota otra vez.
  if l.anulado_at is not null then
    return jsonb_build_object('lote_id', l.id, 'ya_estaba', true);
  end if;
  if p_cantidad_antes is null or p_cantidad_antes <> l.cantidad_ingresada then
    raise exception 'Este ingreso cambió mientras lo mirabas. Actualiza la pantalla y vuelve a intentar.' using hint = 'ingreso_cambio_mientras_tanto';
  end if;
  v_razon := retail.fn_ingreso_insumo_corregible(l.id);
  if v_razon is not null then
    raise exception '%', v_razon using errcode = '23514', hint = 'ingreso_no_corregible';
  end if;
  v_motivo := retail.fn_ingreso_insumo_motivo(p_motivo);

  insert into retail.movimientos_insumo (insumo_id, insumo_lote_id, ubicacion_id, tipo, cantidad, costo_unitario, usuario_id, motivo)
  values (l.insumo_id, l.id, l.ubicacion_id, 'ajuste', -l.cantidad_ingresada, l.costo_unitario, v_actor, 'Se eliminó un ingreso: ' || v_motivo);

  update retail.insumo_lotes set cantidad_ingresada = 0, anulado_at = now() where id = l.id;

  insert into retail.insumo_lote_cambios (insumo_lote_id, insumo_id, ubicacion_id, accion, motivo, antes, despues, hecho_por)
  values (l.id, l.insumo_id, l.ubicacion_id, 'eliminar', v_motivo,
          jsonb_build_object('cantidad', l.cantidad_ingresada, 'costo_unitario', l.costo_unitario, 'fecha_ingreso', l.fecha_ingreso, 'documento', l.documento, 'codigo_lote', l.codigo_lote),
          jsonb_build_object('eliminado', true), v_actor);

  v_nombre := (select i.nombre from retail.insumos i where i.id = l.insumo_id);
  perform retail.fn_ingreso_insumo_anotar('insumo_ingreso_eliminado',
    'eliminó un ingreso de ' || trim_scale(l.cantidad_ingresada) || ' de «' || v_nombre || '»',
    v_actor, l.ubicacion_id, l.insumo_id,
    jsonb_build_object('insumo_id', l.insumo_id, 'lote_id', l.id, 'cantidad', l.cantidad_ingresada, 'motivo', v_motivo));

  return jsonb_build_object('lote_id', l.id, 'ya_estaba', false);
end;
$f$;
revoke all on function retail.eliminar_ingreso_insumo(uuid, numeric, text) from public, anon;
grant execute on function retail.eliminar_ingreso_insumo(uuid, numeric, text) to authenticated;
comment on function retail.eliminar_ingreso_insumo(uuid, numeric, text) is
  'ADR-0570: elimina un ingreso que nadie usó: el lote queda en cero con su marca y el libro lo deshace con un ajuste. Solo el líder, con motivo. Nada se borra; «Restaurar» lo devuelve.';

-- 6. Restaurar un ingreso eliminado: vuelve a su cantidad, tal como estaba.
create or replace function retail.restaurar_ingreso_insumo(p_lote_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $f$
declare
  l retail.insumo_lotes;
  v_actor uuid;
  v_nombre text;
  v_motivo text;
  v_retirado timestamptz;
  v_antes jsonb;
  v_cantidad numeric;
begin
  l := retail.fn_ingreso_insumo_abrir(p_lote_id);
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién guarda esto' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  if l.anulado_at is null then
    return jsonb_build_object('lote_id', l.id, 'ya_estaba', true);
  end if;
  v_retirado := (select i.archivado_at from retail.insumos i where i.id = l.insumo_id);
  if v_retirado is not null then
    raise exception 'El color de este ingreso está retirado: no se le ingresa tela. Si lo necesitas otra vez, avisa al líder.' using errcode = '23514', hint = 'ingreso_color_retirado';
  end if;
  v_antes := (select c.antes from retail.insumo_lote_cambios c where c.insumo_lote_id = l.id and c.accion = 'eliminar' order by c.created_at desc, c.id desc limit 1);
  if v_antes is null then
    raise exception 'No hay con qué restaurar este ingreso: no quedó escrito cuánto era' using hint = 'ingreso_sin_historia';
  end if;
  v_cantidad := (v_antes ->> 'cantidad')::numeric;
  v_motivo := retail.fn_ingreso_insumo_motivo(p_motivo);

  insert into retail.movimientos_insumo (insumo_id, insumo_lote_id, ubicacion_id, tipo, cantidad, costo_unitario, usuario_id, motivo)
  values (l.insumo_id, l.id, l.ubicacion_id, 'ajuste', v_cantidad, l.costo_unitario, v_actor, 'Se restauró un ingreso: ' || v_motivo);

  update retail.insumo_lotes set cantidad_ingresada = v_cantidad, anulado_at = null where id = l.id;

  insert into retail.insumo_lote_cambios (insumo_lote_id, insumo_id, ubicacion_id, accion, motivo, antes, despues, hecho_por)
  values (l.id, l.insumo_id, l.ubicacion_id, 'restaurar', v_motivo, jsonb_build_object('eliminado', true), v_antes, v_actor);

  v_nombre := (select i.nombre from retail.insumos i where i.id = l.insumo_id);
  perform retail.fn_ingreso_insumo_anotar('insumo_ingreso_restaurado',
    'restauró un ingreso de ' || trim_scale(v_cantidad) || ' de «' || v_nombre || '»',
    v_actor, l.ubicacion_id, l.insumo_id,
    jsonb_build_object('insumo_id', l.insumo_id, 'lote_id', l.id, 'cantidad', v_cantidad, 'motivo', v_motivo));

  return jsonb_build_object('lote_id', l.id, 'ya_estaba', false);
end;
$f$;
revoke all on function retail.restaurar_ingreso_insumo(uuid, text) from public, anon;
grant execute on function retail.restaurar_ingreso_insumo(uuid, text) to authenticated;
comment on function retail.restaurar_ingreso_insumo(uuid, text) is
  'ADR-0570: devuelve un ingreso eliminado a la cantidad que tenía. Solo el líder, con motivo; se niega si el color está retirado.';

-- 7. Lo eliminado de un Taller, con quién, cuándo y por qué (solo al líder; a los demás, nada). Nombre con «fn_»: es de lectura y no abre el loader a pantalla completa.
create or replace function retail.fn_ingresos_eliminados(p_ubicacion_id uuid)
returns table (
  lote_id uuid,
  insumo_id uuid,
  cantidad numeric,
  costo_unitario numeric,
  fecha_ingreso date,
  documento text,
  codigo_lote text,
  motivo text,
  hecho_por text,
  eliminado_at timestamptz
)
language sql
stable
security definer
set search_path = retail, public, extensions
as $f$
  select l.id, l.insumo_id, (c.antes ->> 'cantidad')::numeric, l.costo_unitario, l.fecha_ingreso, l.documento, l.codigo_lote, c.motivo,
         btrim(coalesce(p.nombres, '') || ' ' || coalesce(p.apellidos, '')), l.anulado_at
    from retail.insumo_lotes l
    join lateral (
      select x.antes, x.motivo, x.hecho_por
        from retail.insumo_lote_cambios x
       where x.insumo_lote_id = l.id and x.accion = 'eliminar'
       order by x.created_at desc, x.id desc
       limit 1
    ) c on true
    left join public.personas p on p.id = c.hecho_por
   where l.ubicacion_id = p_ubicacion_id and l.anulado_at is not null and retail.fn_es_lider()
   order by l.anulado_at desc
$f$;
revoke all on function retail.fn_ingresos_eliminados(uuid) from public, anon;
grant execute on function retail.fn_ingresos_eliminados(uuid) to authenticated;
comment on function retail.fn_ingresos_eliminados(uuid) is
  'ADR-0570: los ingresos eliminados de un Taller (cuánto eran, quién los eliminó y por qué). Solo responde al líder.';
