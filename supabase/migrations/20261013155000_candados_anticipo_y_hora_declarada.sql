-- Dos candados que hoy solo ponía la pantalla (2026-10-13, auditoría de 20 puntos, punto 17: «la base acepta datos que solo
-- la pantalla filtra»). Una sola parte; sin políticas ni `drop trigger`.
--
-- 1. UN PAGO «ANTICIPO» SOLO EXISTE EN LA ENTREGA DE UN APARTADO.
--    EL PROBLEMA. `venta_pagos_metodo_check` admite 'anticipo' (es el adelanto que se descuenta al entregar un apartado,
--    20260923090000) y `registrar_venta` inserta el medio tal como llega. Saltándose la pantalla, una venta podía «pagarse» con
--    anticipo sin que existiera ningún apartado: la prenda sale, se emite la boleta, la caja cuadra (solo espera efectivo) y el
--    dinero nunca entró. A diferencia de un Yape inventado, no hay estado de cuenta con qué cruzarlo.
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
--    EL PROBLEMA. `fn_actor_persona_id` acepta la hora que manda el navegador (hasta 7 días atrás) en CUALQUIER operación. Se
--    pensó para la venta sin conexión (Felipe, 2026-09-22: «vale la hora de la venta»), pero servía igual para un retiro de caja
--    o un ajuste de stock: quien opera la tienda podía firmarlo a nombre de una compañera que trabajó cualquier día de esa semana.
--    Eso anula para qué existe el responsable: saber quién fue cuando falta plata o mercadería.
--    LA SALIDA. La hora declarada solo cuenta si la llamada es a una de las dos funciones que la web encola sin conexión
--    (`registrar_venta` y `crear_producto_con_stock_inicial`; lo dicen `lib/ventas-offline.ts` y `NuevoProductoForm.tsx`). En
--    cualquier otra, se ignora y se usa la hora real: la operación sigue funcionando, solo que firma quien está de turno AHORA.
--    PostgREST dice qué función se llama en `request.path` ('/rpc/<función>', medido en local con PostgREST 16).
--    DECIDÍ: ignorar la hora en las demás funciones.
--    DESCARTÉ: rechazar la operación, porque una función que en el futuro se encole sin conexión fallaría entera por un detalle de
--    la firma; ignorarla la deja funcionar con la hora real (y si la persona ya no está de turno, el error es el claro de siempre).
--    SE ROMPE SI: se encola sin conexión una función nueva que firma con responsable y no se suma a esta lista: al subir usará la
--    hora real, y si la persona ya marcó su salida se rechazará. La prueba `pnpm pruebas:candados-pago-y-firma` documenta la lista.
--    Si la ruta no se conoce (llamada directa, no por PostgREST), se conserva el comportamiento de antes.
--
-- PRODUCCIÓN. Una sola parte, re-pegable. Crear el disparador toma un candado breve sobre `venta_pagos`: con `lock_timeout = 3s`,
-- si una venta la tiene tomada, falla sin tocar nada y se vuelve a pegar. El parche de `fn_actor_persona_id` es un reemplazo
-- anclado: si la función viva cambió desde que se escribió esto (md5 del cuerpo b95038c3f6fbd9e10acfec20959d5f0d el 2026-10-13,
-- igual en local y en producción), aborta sin tocar nada.

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

select pg_temp.reemplazar(
  'retail.fn_actor_persona_id(boolean)',
  $viejo$  v_texto := nullif(trim(v_headers ->> 'x-momento'), '');
$viejo$,
  $nuevo$  v_texto := nullif(trim(v_headers ->> 'x-momento'), '');
  -- Auditoría 2026-10-13, punto 17: la hora declarada solo vale en lo que la web encola sin conexión. En cualquier otra
  -- función se ignora y firma quien está de turno AHORA (sin esto, un retiro o un ajuste podía firmarse a nombre de quien
  -- trabajó cualquier día de la semana). Si la ruta no se conoce (llamada directa, no por PostgREST), queda como antes.
  if v_texto is not null
     and coalesce(current_setting('request.path', true), '') <> ''
     and current_setting('request.path', true) not in ('/rpc/registrar_venta', '/rpc/crear_producto_con_stock_inicial') then
    v_texto := null;
  end if;
$nuevo$,
  1
);

-- ¿SE PEGÓ ENTERO? Esta es la ÚLTIMA instrucción del archivo. Si no ves «QUEDÓ BIEN», el texto se pegó cortado o falta algo:
-- es seguro volver a pegarlo completo.
select '20261013155000 · candados del anticipo y de la hora declarada' as parte,
       case when exists (select 1 from pg_trigger where tgrelid = 'retail.venta_pagos'::regclass and tgname = 'venta_pagos_anticipo_solo_de_apartado')
             and pg_get_functiondef('retail.fn_actor_persona_id(boolean)'::regprocedure) like '%/rpc/crear_producto_con_stock_inicial%'
            then 'QUEDÓ BIEN' else 'REVISAR: falta el disparador o el parche de fn_actor_persona_id' end as resultado;
