-- Dos candados que hoy solo ponía la pantalla (2026-10-13, auditoría de 20 puntos, punto 17: «la base acepta datos que solo
-- la pantalla filtra»). Una sola parte; sin políticas ni `drop trigger`.
--
-- 1. UN PAGO «ANTICIPO» SOLO EXISTE EN LA ENTREGA DE UN APARTADO.
--    POR QUÉ. Un anticipo es el adelanto de un apartado: la regla vivía en las pantallas y ahora también la exige la base, para
--    que ninguna función, hoy o mañana, pueda dejar un pago «anticipo» sin su apartado.
--    LA SALIDA. Un disparador de restricción DIFERIDO: al confirmar la transacción, toda fila 'anticipo' tiene que pertenecer a
--    una venta enlazada a un apartado (`separaciones.venta_id`). Diferido porque `entregar_separacion` inserta el anticipo ANTES
--    de enlazar el apartado con la venta (en la misma transacción); revisarlo al insertar rechazaría las entregas legítimas.
--    DECIDÍ: el candado en la tabla, no en `registrar_venta`.
--    DESCARTÉ: parchar `registrar_venta` para rechazar 'anticipo', porque solo cubriría esa puerta (no `corregir_pagos_venta` ni
--    una función futura) y es la función más parchada del repo (cada parche suma un ancla que las suites de Frescura deshacen).
--    SE ROMPE SI: alguna vez un anticipo legítimo no viene de un apartado (una seña de un pedido especial, por ejemplo). Entonces
--    ese flujo necesita su propio enlace, igual que el apartado.
--    En producción no hay ninguna fila 'anticipo' hoy (consultado el 2026-10-13): el candado no choca con datos viejos.
--
-- 2. LA HORA DECLARADA (`x-momento`) VALE SOLO DONDE SE PUEDE TRABAJAR SIN CONEXIÓN.
--    POR QUÉ. La hora declarada existe para subir lo hecho sin internet (Felipe, 2026-09-22: «vale la hora de la venta»): fuera
--    de eso, una operación firma con la hora real, que es la que dice quién estaba de turno.
--    LA SALIDA. La hora declarada solo cuenta si la llamada es a una de las funciones que la web encola sin conexión: la venta
--    (`registrar_venta`, `lib/ventas-offline.ts`) y todo lo que pasa por la cola genérica, que le pone la hora a TODA operación
--    encolada (`nuevaOperacion`, `lib/cola-offline.ts`): `recibir_lote` y `recibir_envio` (`RPCS_RECIBIR`,
--    `lib/useColaRecibir.ts`), `crear_producto_con_stock_inicial` y `crear_producto_con_variantes` (`RPCS_PRODUCTOS`,
--    `lib/useColaProductos.ts`). En cualquier otra función se ignora y se usa la hora real: la operación sigue funcionando, solo
--    que firma quien está de turno AHORA. PostgREST dice qué función se llama en `request.path` ('/rpc/<función>', medido en local
--    con PostgREST 16); se compara el FINAL de la ruta, por si un intermediario le antepone un prefijo.
--    DECIDÍ: ignorar la hora en las demás funciones.
--    DESCARTÉ: rechazar la operación, porque una función que en el futuro se encole sin conexión fallaría entera por un detalle de
--    la firma; ignorarla la deja funcionar con la hora real (y si la persona ya no está de turno, el error es el claro de siempre).
--    SE ROMPE SI: se encola sin conexión una función nueva que firma con responsable y no se suma a esta lista: al subir usará la
--    hora real, y si la persona ya marcó su salida se rechazará. Lo vigila `apps/web/lib/cola-hora-declarada.test.ts`: falla si
--    una función de `RPCS_RECIBIR` o `RPCS_PRODUCTOS` (o la venta) falta en la lista de esta migración.
--    Si la ruta no se conoce (llamada directa, no por PostgREST), se conserva el comportamiento de antes.
--
-- PRODUCCIÓN. Una sola parte, re-pegable. Crear el disparador toma un candado breve sobre `venta_pagos`: con `lock_timeout = 3s`,
-- si una venta la tiene tomada, falla sin tocar nada y se vuelve a pegar. El parche de `fn_actor_persona_id` es un reemplazo
-- anclado por TEXTO: si la línea de `x-momento` cambió (no aparece exactamente una vez), aborta sin tocar nada. El cuerpo vivo era
-- el mismo en local y en producción el 2026-10-13 (md5 b95038c3…), pero el candado mira la línea, no el md5.
-- COMPROBACIÓN EN PRODUCCIÓN: después de pegar, comprobar que `request.path` llega (el paso está en la conversación con Felipe,
-- no aquí: el repo es público). Si no llegara, se conserva el comportamiento de antes; nada se rompe.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- 1. El anticipo solo en la entrega de un apartado. -------------------------------------------------------------------------

create or replace function retail.fn_anticipo_solo_de_apartado()
returns trigger
language plpgsql
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
begin
  if new.metodo = 'anticipo' and not exists (select 1 from retail.separaciones s where s.venta_id = new.venta_id) then
    raise exception 'Un pago con anticipo solo existe al entregar un apartado: esta venta no viene de ninguno.'
      using errcode = '23514', hint = 'anticipo_sin_apartado';
  end if;
  return null;
end;
$$;
revoke all on function retail.fn_anticipo_solo_de_apartado() from public, anon, authenticated;

comment on function retail.fn_anticipo_solo_de_apartado() is
  'Candado diferido de venta_pagos: una fila con metodo anticipo pertenece a una venta enlazada a un apartado (separaciones.venta_id). Auditoría 2026-10-13, punto 17.';

-- `create or replace` no existe para un disparador de restricción: se crea solo si falta (nunca `drop trigger`).
do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'retail.venta_pagos'::regclass and tgname = 'venta_pagos_anticipo_solo_de_apartado') then
    create constraint trigger venta_pagos_anticipo_solo_de_apartado
      after insert or update of metodo, venta_id on retail.venta_pagos
      deferrable initially deferred
      for each row
      when (new.metodo = 'anticipo')
      execute function retail.fn_anticipo_solo_de_apartado();
  end if;
end;
$$;

-- 2. La hora declarada solo donde se trabaja sin conexión. ------------------------------------------------------------------

create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  -- Re-ejecutable: el texto nuevo contiene al viejo, así que si ya está puesto no se vuelve a parchear.
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

-- Si ya está puesto un bloque de este mismo parche (de cualquier versión), se quita primero: si no, el reemplazo anclado de abajo
-- sumaría el bloque nuevo y dejaría el viejo detrás (pasó en la base local el 2026-10-13).
do $quitar$
declare
  v_def text := pg_get_functiondef('retail.fn_actor_persona_id(boolean)'::regprocedure);
  v_ini integer := position('  -- Auditoría 2026-10-13, punto 17' in v_def);
  v_cierre text := '    v_texto := null;' || chr(10) || '  end if;' || chr(10);
  v_fin integer;
begin
  if v_ini = 0 then
    return; -- no hay parche previo
  end if;
  -- Hay un bloque del punto 17 (de cualquier versión, incluida esta): se quita y el reemplazo de abajo pone el de esta versión.
  -- Pegar dos veces la misma versión deja lo mismo.
  v_fin := position(v_cierre in substr(v_def, v_ini));
  if v_fin = 0 then
    raise exception 'fn_actor_persona_id tiene un parche previo del punto 17 que no se reconoce: revísala a mano.';
  end if;
  execute substr(v_def, 1, v_ini - 1) || substr(v_def, v_ini + v_fin - 1 + length(v_cierre));
end;
$quitar$;

select pg_temp.reemplazar(
  'retail.fn_actor_persona_id(boolean)',
  $viejo$  v_texto := nullif(trim(v_headers ->> 'x-momento'), '');
$viejo$,
  $nuevo$  v_texto := nullif(trim(v_headers ->> 'x-momento'), '');
  -- Auditoría 2026-10-13, punto 17: la hora declarada solo vale en lo que la web encola sin conexión. En cualquier otra
  -- función se ignora y firma quien está de turno AHORA. Si la ruta no se conoce (llamada directa, no por PostgREST), queda
  -- como antes.
  if v_texto is not null
     and coalesce(current_setting('request.path', true), '') <> ''
     and current_setting('request.path', true)
         !~ '/rpc/(registrar_venta|recibir_lote|recibir_envio|crear_producto_con_stock_inicial|crear_producto_con_variantes)$' then
    v_texto := null;
  end if;
$nuevo$,
  1
);

-- ¿SE PEGÓ ENTERO? Esta es la ÚLTIMA instrucción del archivo. Si no ves «QUEDÓ BIEN», el texto se pegó cortado o falta algo:
-- es seguro volver a pegarlo completo.
select '20261013155000 · candados del anticipo y de la hora declarada' as parte,
       case when exists (select 1 from pg_trigger where tgrelid = 'retail.venta_pagos'::regclass and tgname = 'venta_pagos_anticipo_solo_de_apartado')
             and pg_get_functiondef('retail.fn_actor_persona_id(boolean)'::regprocedure) like '%recibir_envio|crear_producto_con_stock_inicial%'
             -- un solo bloque del punto 17 (ninguna versión vieja apilada)
             and (length(pg_get_functiondef('retail.fn_actor_persona_id(boolean)'::regprocedure))
                  - length(replace(pg_get_functiondef('retail.fn_actor_persona_id(boolean)'::regprocedure), 'Auditoría 2026-10-13, punto 17', '')))
                 = length('Auditoría 2026-10-13, punto 17')
            then 'QUEDÓ BIEN' else 'REVISAR: falta el disparador o el parche de fn_actor_persona_id' end as resultado;
