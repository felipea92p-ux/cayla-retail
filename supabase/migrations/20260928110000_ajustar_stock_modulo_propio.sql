-- ============================================================================
-- 20260928110000_ajustar_stock_modulo_propio.sql — CAYLA V2 · ADR-0247
--
-- EL PROBLEMA PRIMERO. `fn_puede_ajustar_inventario()` (D-13, ADR-0160) da la capacidad de ajustar stock a quien VE
-- Existencias, Conteos o Traslados — no a quien tiene un módulo que lo diga. Hoy el rol «Integrante» (17 cuentas) tiene
-- los tres, así que cualquier integrante puede subir o bajar el stock de una prenda sin que el líder lo haya decidido
-- módulo por módulo (ADR-0161: «un rol decide solo ve/no ve por módulo»). Es el mismo hueco que cerró ADR-0240 para
-- reponer/retirar/apartar, pero esta puerta quedó afuera a propósito («decide Felipe cuándo separarla», BACKLOG).
--
-- QUÉ HACE. Da de alta el módulo «Ajustar stock» en el catálogo (regla ADR-0161 «Módulos y roles») y lo exige donde se
-- corrige una cantidad SUELTA (no una venta, un traslado, una recepción ni un conteo):
--   · orden 86: entre Bajada al piso (85) y Conteos (90), igual que en el menú/Roles y accesos.
--   · delegable = true: la función nueva no exige `fn_es_lider()`, pide el módulo. NO asigna el módulo a ningún rol:
--     nace sin rol, solo lo ve el líder hasta que él lo encienda en Colaboradores ▸ Roles y accesos (ADR-0161/0178:
--     «solo das lo que tienes» — nadie más lo asigna).
--   · `retail.fn_puede_ajustar_stock()`: espeja `fn_puede_ajustar_inventario()` pero contra ESTE módulo, no contra
--     Existencias/Conteos/Traslados.
--   · `registrar_movimiento` (el único lugar que ESCRIBE un ajuste/entrada/salida suelto) cambia su candado de
--     `fn_puede_ajustar_inventario()` a `fn_puede_ajustar_stock()`. Su único llamador hoy es `ajustar_inventario`
--     (ADR-0240 dejó a la web sin otra puerta), con tipo 'ajuste'.
--   · `ajustar_inventario` suma el mismo candado ANTES de tomar ningún lock, para que la lista de ajustes falle rápido
--     y sin bloquear filas si la cuenta no tiene el módulo (las CARGAS de prenda nueva no lo piden: siguen su regla de
--     siempre, ver «Descarté»).
--
-- NO TOCA (a propósito):
--   · `fn_puede_ajustar_inventario()` — sigue significando lo mismo (Existencias/Conteos/Traslados) porque todavía la
--     usan `cerrar_conteo` y `cerrar_traslado_con_diferencia` («cerrar es aprobar lo contado/recibido», D-13): Felipe
--     decidió (2026-09-27) que ESTAS dos puertas no cambian hoy.
--   · `cargar_stock_inicial`/`fn_cargar_stock_inicial` (ADR-0212/0235: la carga inicial de una prenda nueva en la
--     tienda) — sigue aceptando `fn_puede_editar_catalogo() or fn_puede_ajustar_inventario()`, sin tocar. Cargar no es
--     ajustar (ADR-0235): la primera cantidad de una prenda no corrige nada.
--
-- CONSECUENCIA DE NEGOCIO (decidida por Felipe, 2026-09-27): el rol «Integrante» (17 cuentas) pierde el botón «Ajustar»
-- de Existencias, Productos y Movimientos el día que se pega esta migración — nace sin rol a propósito, Felipe lo
-- delega después en Roles y accesos. Mientras tanto, quien vea un stock que no cuadra se lo dice a una líder de su
-- sede, que ajusta ella (sin pantalla nueva: es la misma que ya usa hoy).
--
-- Producción: pegar tal cual en el SQL Editor de cayla-dynamic (ya trae `retail.`). Sin políticas ni `alter` de tablas
-- en uso: no aplica el bloqueo mutuo de ADR-0195. Ojo: `registrar_movimiento` SÍ tiene parches en vivo previos
-- (`pg_temp.reemplazar` en 20260922200000; `pg_temp.insertar_antes` en 20260926000400 y 20260927153200 — el reposicion
-- y el ajuste_sin_historia) — este `create or replace` no los reescribe a mano ni los borra: el cuerpo de abajo es el
-- que devuelve HOY `pg_get_functiondef` en producción (consultado en vivo, solo lectura, 2026-09-27), que ya los
-- trae todos aplicados; solo se le cambia la línea del candado y su mensaje. `ajustar_inventario` no tiene parches en
-- vivo (`grep reemplazar_vivo\|insertar_antes` no la nombra): se parte de `20260927180100`. Re-ejecutable.
--
-- SE ROMPE SI alguien asigna este módulo a un rol desde una migración (lo prohíbe `lib/modulos.test.ts`) o si el
-- orden de acá deja de coincidir con `CLAVES_MODULO` de `apps/web/lib/modulos.ts`.
-- ============================================================================

set search_path = retail, public, extensions;

insert into retail.modulos (clave, grupo, nombre, incluye, orden, solo_lider, delegable) values
  ('ajustar_stock', 'Inventario', 'Ajustar stock', 'Corregir la cantidad de una prenda cuando no cuadra con lo que hay en la tienda, sin que sea una venta, un traslado, una recepción ni un conteo', 86, false, true),
  ('existencias', 'Inventario', 'Existencias', 'Consultar stock, reponer y retirar del piso, apartar prendas', 80, false, true)
on conflict (clave) do update set
  grupo = excluded.grupo, nombre = excluded.nombre, incluye = excluded.incluye, orden = excluded.orden,
  solo_lider = excluded.solo_lider, delegable = excluded.delegable;

create or replace function retail.fn_puede_ajustar_stock() returns boolean
language sql stable
set search_path to retail, public, extensions
as $function$
  select retail.fn_es_lider() or retail.fn_capacidad_por_modulos(array['ajustar_stock']);
$function$;

comment on function retail.fn_puede_ajustar_stock() is
  'ADR-0247: líder, o su rol ve el módulo «Ajustar stock». La usan registrar_movimiento (candado real) y ajustar_inventario (falla rápido, sin tomar locks). No la confundas con fn_puede_ajustar_inventario(), que sigue siendo Existencias/Conteos/Traslados para cerrar_conteo y cerrar_traslado_con_diferencia.';

revoke all on function retail.fn_puede_ajustar_stock() from public, anon;
grant execute on function retail.fn_puede_ajustar_stock() to authenticated;

-- ---------------------------------------------------------------------------
-- registrar_movimiento: el candado real de un ajuste/entrada/salida suelto pasa de «ve Existencias, Conteos o
-- Traslados» a «tiene el módulo Ajustar stock». Cuerpo idéntico al de ADR-0160/0208/0235, solo cambia esta línea.
-- ---------------------------------------------------------------------------
create or replace function retail.registrar_movimiento(
  p_variante_id uuid,
  p_ubicacion_id uuid,
  p_tipo text,
  p_cantidad integer,
  p_motivo text default null,
  p_nota text default null,
  p_sububicacion_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path to retail, public, extensions
as $function$
declare v_id uuid; v_persona uuid; v_sub uuid;
begin
  -- CANDADO DE MÓDULO (ADR-0247, reemplaza el candado de líder D-13): va primero y cubre los tres tipos que esta
  -- función acepta. Stock que se mueve sin una venta, una recepción o un traslado es un ajuste.
  if not fn_puede_ajustar_stock() then
    raise exception 'Tu rol no tiene el módulo «Ajustar stock» — pídele a una líder de tu sede que lo ajuste' using errcode = '42501', hint = 'ajuste_sin_modulo';
  end if;

  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para registrar movimientos en esa ubicación';
  end if;
  if p_tipo not in ('entrada', 'salida', 'ajuste') then
    raise exception 'registrar_movimiento es para entrada/salida/ajuste sueltos. Traslados van por transferir()/mover_interno(), ventas por registrar_venta(), etc.';
  end if;
  if p_tipo = 'ajuste' and p_sububicacion_id is null and exists (
    select 1 from sububicaciones where ubicacion_id = p_ubicacion_id and tipo in ('piso_venta', 'almacen_tienda')
  ) then
    raise exception 'Esta ubicación separa piso y almacén — indica a cuál corresponde el ajuste';
  end if;
  -- ADR-0208: «Reposición» no sube ni baja prendas del piso; lo que viene del almacén se baja (reposicion_piso_cerrada).
  if p_tipo = 'ajuste' and lower(btrim(coalesce(p_motivo, ''))) in ('reposicion', 'reposición') and exists (
    select 1 from sububicaciones where id = p_sububicacion_id and tipo = 'piso_venta'
  ) then
    raise exception '«Reposición» no se usa en el piso: las prendas que suben del almacén se registran con «Bajar al piso» o con «Reponer», en Existencias, para que salgan del almacén (si ninguno te aparece, pídele al líder que active «Bajada al piso» en tu rol). Si al contar encontraste prendas de más, elige «Conteo físico».'
      using hint = 'reposicion_piso_cerrada';
  end if;
  v_sub := coalesce(p_sububicacion_id,
    case p_tipo
      when 'entrada' then fn_sububicacion_por_defecto(p_ubicacion_id, 'entrada')
      when 'salida' then fn_sububicacion_por_defecto(p_ubicacion_id, 'venta')
    end);
  v_persona := retail.fn_actor_persona_id(true);
  -- ADR-0235: un ajuste corrige lo que ya estaba; la primera carga de una prenda es stock inicial (ajuste_sin_historia).
  if p_tipo = 'ajuste' and not exists (
    select 1 from movimientos where variante_id = p_variante_id and ubicacion_id = p_ubicacion_id
  ) then
    raise exception 'Esta prenda todavía no tiene ningún movimiento en esta tienda: lo que hay se carga como stock inicial, no como ajuste. Ajustar stock lo hace solo al guardar; también puede llegar por un traslado o una compra.'
      using hint = 'ajuste_sin_historia';
  end if;
  insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, usuario_id, nota)
    values (p_variante_id, p_ubicacion_id, v_sub, p_tipo, p_cantidad, p_motivo, v_persona, p_nota)
    returning id into v_id;
  perform fn_aplicar_movimiento(v_id);
  return v_id;
end;
$function$;

comment on function retail.registrar_movimiento(uuid, uuid, text, integer, text, text, uuid) is
  'ADR-0160/0208/0235/0247: entrada/salida/ajuste sueltos (no ventas ni traslados). Candado: fn_puede_ajustar_stock() (módulo «Ajustar stock»), fn_puede_operar_ubicacion(). «Reposición» no toca el piso (reposicion_piso_cerrada); un ajuste sin historia se rechaza (ajuste_sin_historia): eso va por cargar_stock_inicial.';

revoke all on function retail.registrar_movimiento(uuid, uuid, text, integer, text, text, uuid) from public, anon;
grant execute on function retail.registrar_movimiento(uuid, uuid, text, integer, text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- ajustar_inventario: mismo candado ANTES del advisory lock y de fn_bloquear_en_orden, solo cuando hay ajustes de
-- verdad (las cargas de prenda nueva no lo piden: siguen su propia regla en cargar_stock_inicial, sin cambios). Cuerpo
-- idéntico al de ADR-0240; único agregado, el `if` nuevo justo después de comprobar el token.
-- ---------------------------------------------------------------------------
create or replace function retail.ajustar_inventario(
  p_ubicacion_id uuid,
  p_sububicacion_id uuid,
  p_ajustes jsonb,
  p_motivo text,
  p_cargas jsonb,
  p_al_piso boolean,
  p_nota text,
  p_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  c_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_ajustes jsonb := coalesce(p_ajustes, '[]'::jsonb);
  v_cargas jsonb := coalesce(p_cargas, '[]'::jsonb);
  v_nota text := nullif(btrim(p_nota), '');
  v_huella text;
  v_prev retail.ajustes_inventario_intentos%rowtype;
  v_unidades integer := 0;
  v_resultado jsonb;
  r record;
begin
  if p_token is null then
    raise exception 'Falta la marca de este ajuste. Cierra la ventana y vuelve a abrirla.' using hint = 'ajuste_sin_token';
  end if;
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para ajustar el inventario de esa tienda.' using errcode = '42501', hint = 'ajuste_sin_tienda';
  end if;
  if jsonb_typeof(v_ajustes) <> 'array' or jsonb_typeof(v_cargas) <> 'array' then
    raise exception 'Las líneas del ajuste llegaron mal armadas.' using hint = 'ajuste_linea_invalida';
  end if;
  if jsonb_array_length(v_ajustes) + jsonb_array_length(v_cargas) = 0 then
    raise exception 'Ingresa al menos un ajuste distinto de cero.' using hint = 'ajuste_vacio';
  end if;
  -- ADR-0247: el módulo se pide ANTES de bloquear nada. Las cargas (prenda nueva) no lo necesitan; registrar_movimiento
  -- lo vuelve a exigir más abajo — este `if` solo evita tomar locks y llamar a cargar_stock_inicial en vano.
  if jsonb_array_length(v_ajustes) > 0 and not fn_puede_ajustar_stock() then
    raise exception 'Tu rol no tiene el módulo «Ajustar stock» — pídele a una líder de tu sede que lo ajuste' using errcode = '42501', hint = 'ajuste_sin_modulo';
  end if;
  -- Forma: un ajuste es un entero con signo distinto de 0; una carga, un entero positivo; ninguna prenda dos veces.
  if exists (
    select 1 from jsonb_array_elements(v_ajustes) e
     where jsonb_typeof(e) <> 'object'
        or coalesce(e ->> 'variante_id', '') !~* c_uuid
        or coalesce(e ->> 'cantidad', '') !~ '^-?[1-9][0-9]{0,5}$'
  ) or exists (
    select 1 from jsonb_array_elements(v_cargas) e
     where jsonb_typeof(e) <> 'object'
        or coalesce(e ->> 'variante_id', '') !~* c_uuid
        or coalesce(e ->> 'cantidad', '') !~ '^[1-9][0-9]{0,5}$'
  ) or exists (
    select 1 from (
      select e ->> 'variante_id' as v from jsonb_array_elements(v_ajustes) e
      union all
      select e ->> 'variante_id' from jsonb_array_elements(v_cargas) e
    ) t group by lower(t.v) having count(*) > 1
  ) then
    raise exception 'Cada prenda del ajuste necesita un código válido, una cantidad entera distinta de cero y aparecer una sola vez.'
      using hint = 'ajuste_linea_invalida';
  end if;
  if jsonb_array_length(v_ajustes) > 0 and nullif(btrim(p_motivo), '') is null then
    raise exception 'Elige un motivo para el ajuste.' using hint = 'ajuste_sin_motivo';
  end if;

  v_huella := md5(concat_ws('|',
    p_ubicacion_id, p_sububicacion_id, coalesce(p_motivo, ''), coalesce(v_nota, ''), coalesce(p_al_piso, false),
    (select string_agg(lower(e ->> 'variante_id') || ':' || (e ->> 'cantidad'), ',' order by lower(e ->> 'variante_id'))
       from jsonb_array_elements(v_ajustes) e),
    (select string_agg(lower(e ->> 'variante_id') || ':' || (e ->> 'cantidad'), ',' order by lower(e ->> 'variante_id'))
       from jsonb_array_elements(v_cargas) e)));

  -- Candado 1: la marca. Un segundo envío del mismo intento espera aquí y, al soltarse, encuentra lo ya guardado. Se
  -- mira ANTES de pedir responsable: comprobar un ajuste ya guardado no escribe nada.
  perform pg_advisory_xact_lock(hashtextextended('ajustar_inventario:' || p_token::text, 0));
  select * into v_prev from ajustes_inventario_intentos where token_cliente = p_token;
  if found then
    if v_prev.ubicacion_id is distinct from p_ubicacion_id or v_prev.huella <> v_huella then
      raise exception 'Ese ajuste ya se guardó a las % con otros datos: no se repitió. Cierra la ventana y revisa Existencias antes de volver a ajustar.',
        to_char(v_prev.created_at at time zone 'America/Lima', 'HH24:MI')
        using hint = 'ajuste_token_reusado';
    end if;
    return v_prev.resultado || jsonb_build_object('ya_registrado', true, 'registrado_en', v_prev.created_at);
  end if;

  -- Candado 2: el stock de todas las prendas del ajuste en esta tienda, en orden de prenda (ADR-0190).
  perform fn_bloquear_en_orden(
    p_ubicacion_id,
    array(select (e ->> 'variante_id')::uuid from jsonb_array_elements(v_ajustes || v_cargas) e));

  -- Las prendas nuevas en la tienda: stock inicial (con su bajada si van al piso), con sus propios candados.
  if jsonb_array_length(v_cargas) > 0 then
    v_unidades := cargar_stock_inicial(p_ubicacion_id, v_cargas, v_nota, coalesce(p_al_piso, false), p_token);
  end if;

  -- Cada ajuste, en orden de prenda, por la función de siempre. Si una falla, la excepción deshace TODO lo anterior.
  for r in
    select (e ->> 'variante_id')::uuid as v, (e ->> 'cantidad')::integer as c
      from jsonb_array_elements(v_ajustes) e
     order by 1
  loop
    perform registrar_movimiento(r.v, p_ubicacion_id, 'ajuste', r.c, p_motivo, v_nota, p_sububicacion_id);
  end loop;

  v_resultado := jsonb_build_object(
    'ajustes', jsonb_array_length(v_ajustes),
    'cargas', jsonb_array_length(v_cargas),
    'unidades_cargadas', coalesce(v_unidades, 0));
  insert into ajustes_inventario_intentos (token_cliente, ubicacion_id, huella, resultado)
    values (p_token, p_ubicacion_id, v_huella, v_resultado);

  return v_resultado || jsonb_build_object('ya_registrado', false, 'registrado_en', now());
end;
$fn$;

comment on function retail.ajustar_inventario(uuid, uuid, jsonb, text, jsonb, boolean, text, uuid) is
  'ADR-0240/0247: «Ajustar inventario» de una vez y todo o nada. p_ajustes = [{variante_id, cantidad}] (con historia en la tienda, cantidad con signo) por registrar_movimiento, pide el módulo «Ajustar stock»; p_cargas = [{variante_id, cantidad}] (sin historia, > 0) por cargar_stock_inicial (p_al_piso: con su bajada), no lo pide. p_token obligatorio: el mismo token con los mismos datos devuelve lo ya guardado (ya_registrado); con otros datos no repite nada (ajuste_token_reusado).';

revoke all on function retail.ajustar_inventario(uuid, uuid, jsonb, text, jsonb, boolean, text, uuid) from public, anon;
grant execute on function retail.ajustar_inventario(uuid, uuid, jsonb, text, jsonb, boolean, text, uuid) to authenticated;

notify pgrst, 'reload schema';
