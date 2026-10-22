-- ============================================================================================================
-- 20261021185000_cambio_varias_prendas_parte1_tabla.sql — CAYLA V2 · Cambios · una prenda por VARIAS (PARTE 1 de 3, ADR-0470)
--
-- EL PROBLEMA PRIMERO. Un cambio guarda UNA prenda nueva (`cambios.variante_nueva_id`). Cuando la clienta devuelve un body de S/ 45.90 y se
-- lleva dos Top Rib de S/ 35.90, la colaboradora tiene que partirlo en un cambio uno por uno más una venta nueva, y el dinero queda en dos
-- registros que no dicen la verdad: el cambio mostraba −S/ 10 (una devolución que no ocurrió) y la venta, S/ 35.90 cobrados cuando Izipay
-- solo cobró S/ 25.90 por esa prenda. El 2026-10-21 eso dejó «Por depositar Izipay» con S/ 10 de más e Interbank con S/ 10 de menos.
--
-- ANALOGÍA CAYLA. El ticket de cambio de la tienda tenía renglón para UNA prenda de salida. Esta tabla le agrega los renglones que faltan, sin
-- tocar el ticket de los cambios de siempre.
--
-- QUÉ HACE (parte 1): `retail.cambio_salidas`, una fila por cada prenda que se lleva la clienta en un cambio por varias prendas (TODAS, la
-- primera también). La fila de `cambios` sigue siendo el cambio: lleva la prenda devuelta, la diferencia TOTAL y su medio de pago, y su
-- `variante_nueva_id` es la primera prenda que se llevó (así lo que ya lee `cambios` sigue funcionando y diciendo la plata correcta). Los
-- cambios de siempre (una por una) no tienen filas aquí: nadie los reescribe. Solo se escribe desde `registrar_cambio_varias` (parte 2);
-- es de solo agregar (el disparador impide editar y borrar, como `movimientos_dinero`).
--
-- DECIDÍ: una tabla hija de `cambios` y NO una `cambios` con varias filas por cambio: `cambios.cantidad` también cuenta cuántas unidades de
-- la línea de venta se devolvieron (`registrar_cambio` suma por `venta_item_id`); una segunda fila de la misma línea contaría la unidad dos
-- veces y rompería el «ya se cambió» y los invariantes de /chaos. El stock sigue saliendo de `movimientos` (`cambio_id`), una sola fuente.
-- DESCARTÉ: guardar las prendas en un `jsonb` dentro de `cambios`: no se puede unir con el catálogo ni auditar, y las pantallas de abajo
-- (ticket, historial) las tendrían que desarmar a mano.
--
-- DECIDÍ: la llave a `cambios` es DIFERIDA (`deferrable initially deferred`): `registrar_cambio_varias` anota las prendas ANTES que el cambio, y así
-- el disparador que escribe el registro de actividad al insertar el cambio (`fn_actividad_cambio`) ya las ve todas y dice «cambió el body por
-- Top Rib + Top Rib», no solo por la primera. Al confirmar, cada prenda tiene su cambio: nada queda huérfano.
--
-- SE ROMPE SI: alguien lee `cambios.variante_nueva_id` creyendo que es TODO lo que se llevó la clienta: en un cambio por varias es solo la
-- primera. La actividad 4 de ADR-0470 pone al día el ticket, el historial y los invariantes.
--
-- PRODUCCIÓN. Tres partes, cada una pegada por separado y en orden (regla «Políticas y deadlocks», ADR-0195). Esta es la 1: una tabla nueva
-- (con FK a `cambios` y `variantes`: toma un candado compartido de ellas unos milisegundos), un índice y un disparador; NO crea políticas.
-- RLS queda encendido y la política de lectura viene en la parte 3. Idempotente: se puede pegar dos veces.
-- ============================================================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

create table if not exists retail.cambio_salidas (
  id uuid primary key default gen_random_uuid(),
  cambio_id uuid not null references retail.cambios (id) deferrable initially deferred,
  variante_id uuid not null references retail.variantes (id),
  cantidad integer not null check (cantidad > 0),
  -- El precio con que se calculó la diferencia (`fn_precio_para_cambio`): se guarda porque el catálogo cambia y el cambio no.
  precio_unitario numeric(12, 2) not null check (precio_unitario > 0),
  created_at timestamptz not null default now(),
  unique (cambio_id, variante_id)
);
comment on table retail.cambio_salidas is
  'ADR-0470: las prendas que se lleva la clienta en un cambio por VARIAS prendas (todas, la primera incluida). Solo la escribe registrar_cambio_varias; de solo agregar. Un cambio de una por una no tiene filas aquí.';

-- Una base donde la tabla ya se había creado con la llave inmediata (una copia de desarrollo anterior a este ajuste): se rehace diferida.
do $$
begin
  if exists (select 1 from pg_constraint c where c.conrelid = 'retail.cambio_salidas'::regclass and c.contype = 'f'
                and c.confrelid = 'retail.cambios'::regclass and not c.condeferrable) then
    alter table retail.cambio_salidas drop constraint cambio_salidas_cambio_id_fkey;
    alter table retail.cambio_salidas add constraint cambio_salidas_cambio_id_fkey
      foreign key (cambio_id) references retail.cambios (id) deferrable initially deferred;
  end if;
end $$;

create index if not exists cambio_salidas_cambio_idx on retail.cambio_salidas (cambio_id);

alter table retail.cambio_salidas enable row level security;
revoke all on table retail.cambio_salidas from anon, authenticated;
grant select on table retail.cambio_salidas to authenticated;
grant all on table retail.cambio_salidas to service_role;

create or replace function retail.fn_cambio_salidas_solo_agregar()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  raise exception 'Las prendas de un cambio no se editan ni se borran: un cambio ya hecho no cambia.' using errcode = 'P0001';
end;
$$;

create or replace trigger cambio_salidas_solo_agregar
  before update or delete on retail.cambio_salidas
  for each row execute function retail.fn_cambio_salidas_solo_agregar();

select 'Cambio por varias · parte 1 (tabla)' as parte,
       case when to_regclass('retail.cambio_salidas') is not null
             and exists (select 1 from pg_trigger where tgname = 'cambio_salidas_solo_agregar' and tgrelid = 'retail.cambio_salidas'::regclass)
             and (select relrowsecurity from pg_class where oid = 'retail.cambio_salidas'::regclass)
            then 'QUEDÓ BIEN' else 'REVISAR' end as resultado;
