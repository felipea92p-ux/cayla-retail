-- ============================================================================
-- 20261004210000_carga_inicial_cierre_por_sede_parte1_columna.sql — CAYLA V2 · ADR-0328 (actividad 4) · PARTE 1 de 3
-- La carga inicial sin papeles se cierra POR SEDE y SOLA: la fecha vive en la sede.
--
-- EL PROBLEMA PRIMERO. La carga inicial (stock que entra al dar de alta un producto o al cargar el stock de una prenda que
-- nunca estuvo en la tienda, ADR-0212/0235) entra SIN comprobante y SIN costo de compra. Es la puerta correcta mientras
-- CAYLA pasa su tienda al sistema; después es un agujero: mercadería que llega de un proveedor puede entrar por ahí y no
-- aparece en Compras ni en «sin comprobante». ADR-0270 (D20) la dejó abierta «hasta el 15 de octubre» y la base nunca lo
-- supo: no había ninguna fecha que mirar. En producción, al 2026-10-03, el 100 % del stock entró por esta puerta.
--
-- QUÉ HACE (esta parte: solo la tabla).
--   1. `ubicaciones.carga_inicial_hasta date`: el ÚLTIMO día en que esa sede acepta carga inicial (hora de Lima). Vacía =
--      abierta sin fecha (AQP, LIM y el Taller hoy: Felipe les fija el tope cuando terminen su carga).
--   2. Un disparador que no deja cambiar esa fecha desde la API (PostgREST, roles `authenticated`/`anon`), aunque la
--      política `ubicaciones_write_lider` deje al líder escribir la fila: la fecha se cambia SOLO con
--      `fijar_cierre_carga_inicial` (parte 2), que decide quién la aprieta (el líder) y quién la afloja (solo un Admin) y
--      deja el antes/después en `configuracion_historial`.
--   3. Siembra la fecha de Felipe para Tienda TRU: 2026-10-15 (ADR-0270 D20, ADR-0328). TRU se reconoce por su código de
--      Dynamic (`public.sedes.codigo = 'TRU'`) o por su nombre en retail (`Tienda TRU`, el que usan los scripts de
--      producción); si las dos señales apuntan a tiendas distintas, aborta. Si la sede ya tiene una fecha, no la pisa.
--      En una base sin esa tienda (local, CI: el seed crea las sedes DESPUÉS de las migraciones) no siembra nada.
--
-- ESTADO QUE DEJA DE SER POSIBLE: un líder que reabre la carga inicial de una sede (o le corre el cierre) escribiendo la
-- fila a mano desde la API, sin pasar por la regla «aflojar es del Admin» y sin dejar historia.
--
-- CONTRATO DEL DISPARADOR. PROMETE: rechaza (42501, hint `carga_inicial_por_funcion`) todo cambio de la fecha hecho con
-- el rol de la API. ASUME: las funciones que la cambian son `security definer` de `postgres` (corren como su dueño) y el
-- SQL Editor corre como `postgres`; por eso no mira una variable de sesión, que un cliente nunca puede fijar igual.
--
-- CÓMO SE PEGA EN PRODUCCIÓN. Esta PARTE 1 sola, ANTES de la parte 2 y de publicar la web. Toca `ubicaciones` (en uso a
-- diario): espera 3 s un candado; si dice «lock timeout», se vuelve a pegar ESTA parte. Sin políticas ni `drop trigger`
-- (ADR-0195). Idempotente: se puede pegar dos veces.
--
-- SE ROMPE SI: alguien renombra «Tienda TRU» Y le cambia la sede de Dynamic antes de pegar (la siembra no encuentra TRU y
-- solo avisa con un NOTICE: hay que fijar la fecha en Configuración); o si una función que NO es `security definer`
-- (corre como `authenticated`) intenta cambiar la fecha: el disparador la rechaza también.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

alter table retail.ubicaciones add column if not exists carga_inicial_hasta date;

comment on column retail.ubicaciones.carga_inicial_hasta is
  'ADR-0328: último día (hora de Lima) en que esta sede acepta carga inicial sin papeles (alta con stock, cargar stock inicial). Vacía = abierta sin fecha. Pasada la fecha, lo que aparece entra por «Encontré prendas» (Ajustar). Se cambia solo con fijar_cierre_carga_inicial.';

-- El guardián de la fecha. NO es security definer a propósito: `current_user` tiene que ser quien escribe.
create or replace function retail.fn_ubicaciones_cierre_carga_por_funcion()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  if tg_op = 'UPDATE' and old.carga_inicial_hasta is not distinct from new.carga_inicial_hasta then
    return new;
  end if;
  if tg_op = 'INSERT' and new.carga_inicial_hasta is null then
    return new;
  end if;
  -- Desde la API (PostgREST): la fecha la cambia fijar_cierre_carga_inicial, que pone la regla y deja la historia.
  if current_user in ('authenticated', 'anon') then
    raise exception 'La fecha de cierre de la carga inicial se cambia en Configuración ▸ Tiendas y caja.'
      using errcode = '42501', hint = 'carga_inicial_por_funcion';
  end if;
  return new;
end;
$$;

comment on function retail.fn_ubicaciones_cierre_carga_por_funcion() is
  'ADR-0328: disparador de ubicaciones. Rechaza (hint carga_inicial_por_funcion) cambiar carga_inicial_hasta con el rol de la API; la cambia solo fijar_cierre_carga_inicial (security definer).';

revoke all on function retail.fn_ubicaciones_cierre_carga_por_funcion() from public, anon, authenticated;

-- `create or replace trigger`, nunca drop + create (ADR-0195: `drop trigger` toma en exclusiva las tablas de auth y storage).
create or replace trigger ubicaciones_cierre_carga_inicial_por_funcion
  before insert or update of carga_inicial_hasta on retail.ubicaciones
  for each row
  execute function retail.fn_ubicaciones_cierre_carga_por_funcion();

-- La fecha de Felipe para TRU (ADR-0270 D20; ADR-0328 «Cierre de la carga inicial»).
do $$
declare
  v_n integer;
begin
  v_n := (
    select count(*)
      from retail.ubicaciones u
     where u.tipo = 'tienda'
       and u.activo
       and (u.nombre = 'Tienda TRU'
            or exists (select 1 from public.sedes s where s.id = u.sede_dynamic_id and s.codigo = 'TRU'))
  );
  if v_n > 1 then
    raise exception 'Hay % tiendas que parecen TRU (por nombre «Tienda TRU» o por la sede TRU de Dynamic): no se sembró ninguna fecha. Revisa retail.ubicaciones antes de pegar.', v_n;
  end if;
  if v_n = 0 then
    raise notice 'Esta base no tiene la tienda TRU (es local o CI): no se siembra la fecha. En producción, fíjala en Configuración ▸ Tiendas y caja.';
    return;
  end if;
  update retail.ubicaciones u
     set carga_inicial_hasta = date '2026-10-15'
   where u.tipo = 'tienda'
     and u.activo
     and (u.nombre = 'Tienda TRU'
          or exists (select 1 from public.sedes s where s.id = u.sede_dynamic_id and s.codigo = 'TRU'))
     and u.carga_inicial_hasta is null;
end;
$$;

reset lock_timeout;

notify pgrst, 'reload schema';
