-- ============================================================================
-- 20261004223000_bajadas_en_mano_tabla.sql — CAYLA V2 · ADR-0328 actividad 9 «La tengo en la mano» · PARTE 1 de 2
-- La marca que une una bajada al piso con la corrección del almacén que la hizo posible.
--
-- EL PROBLEMA PRIMERO. En «Bajar al piso» la asesora escanea la prenda que tiene en la mano y el sistema dice 0 en el
-- almacén (la caja de un traslado que nadie recibió, una carga inicial incompleta). Hasta hoy el aviso decía «avisa al
-- líder» y ella la colgaba igual, sin registrar: justo lo que la pantalla existe para impedir (docs/pantallas/
-- inventario-bajar.md, tarea #5). Felipe decidió (ADR-0328, «Prenda en la mano»): se corrige y se cuelga en UN paso,
-- visible en Movimientos. Ese paso escribe dos hechos —la corrección (+1 en el almacén, «Encontré prendas») y la bajada
-- (almacén → piso)— y sin una marca que los una, la bajada parece una bajada cualquiera y la corrección un ajuste suelto:
-- nadie podría contar cuántas veces la mano le corrigió al sistema, ni topar cuántas correcciones de una misma prenda
-- pasan por aquí en un día, sin buscar por el texto de la nota (que es para leer, no para identificar).
--
-- QUÉ HACE. Crea `retail.bajadas_en_mano`: una fila por bajada hecha con «La tengo en la mano».
--   · `bajada_id` → la bajada (`bajadas_piso`, con su ÚNICA línea de 1 unidad en `bajada_piso_items`): Frescura la cuenta
--     como cualquier bajada, porque ES una bajada (misma cabecera, misma línea, mismo `mover_interno`).
--   · `ajuste_movimiento_id` → la corrección (+1 en el almacén, motivo `reposicion` = «Encontré prendas»). NULL cuando, al
--     guardar, el almacén ya tenía la prenda (otra persona la recibió mientras tanto): entonces no hizo falta corregir y
--     solo se bajó. Ni el stock ni el libro inventan una unidad que el almacén ya contaba.
--   · Nada más: la tienda, la prenda, la hora y quién la hizo ya están en la bajada. Copiarlas aquí sería abrir la puerta a
--     que digan otra cosa.
--
-- ESTADOS QUE DEJAN DE SER POSIBLES (por el esquema, no por una validación):
--   · Una marca de «en la mano» sin su bajada (llave a `bajadas_piso`).
--   · Dos marcas para la misma bajada (`bajada_id` es la llave primaria).
--   · Una misma corrección usada para dos bajadas (`ajuste_movimiento_id` único).
--   · Editar o borrar la marca a mano (disparadores). La ÚNICA forma de que desaparezca es que se borre su movimiento o
--     su bajada (`on delete cascade`): eso solo lo hace «Eliminar con historia» (ADR-0252), que no conoce esta tabla y no
--     tiene por qué conocerla — la marca no cita al producto, cita filas que esa función ya borra. Sin la cascada, su red
--     de seguridad `foreign_key_violation` frenaría para siempre el borrado de cualquier producto que alguna vez se corrigió
--     con la prenda en la mano.
--   Lo que el esquema NO puede expresar entre tablas (la bajada tiene una sola línea de 1 unidad de la misma prenda; la
--   corrección es un ajuste +1 en el almacén de esa tienda, en la misma transacción) lo revisa `fn_verificar_bajadas_en_mano`
--   (PARTE 2), que siempre debe dar cero filas.
--
-- CÓMO SE PEGA EN PRODUCCIÓN. Sola, tal cual (trae `retail.` y su `set search_path`), ANTES de la PARTE 2
-- (20261004223100_bajar_en_mano_funcion.sql) y antes de publicar la web. Crea una tabla NUEVA: no hay `alter` de tablas en
-- uso ni políticas (RLS encendido y sin políticas: solo la leen funciones `security definer`), así que no choca con el
-- Asesor de seguridad (ADR-0195). Las dos llaves foráneas toman un momento `movimientos` y `bajadas_piso` (share row
-- exclusive): con `lock_timeout` de 3 s, si la tienda está escribiendo, falla rápido y se vuelve a pegar. Re-ejecutable.
-- Verificación después de pegar (solo lectura): `select to_regclass('retail.bajadas_en_mano');` → `retail.bajadas_en_mano`.
--
-- SE ROMPE SI alguien agrega a esta tabla una llave hacia `productos` o `variantes` (copiar la prenda «para filtrar más
-- rápido»): «Eliminar con historia» empezaría a fallar con «otra parte del sistema todavía lo usa». Con 3 tiendas, unas
-- pocas correcciones al día y 3 años (< 25.000 filas), el filtro por prenda se hace uniendo con la bajada, sin copiarla.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

do $$
begin
  if to_regclass('retail.bajadas_piso') is null or to_regclass('retail.bajada_piso_items') is null then
    raise exception 'Faltan las tablas de la bajada al piso: pega antes 20260926000100_bajada_piso_tablas.sql';
  end if;
  if to_regprocedure('retail.fn_historial_sin_truncate()') is null then
    raise exception 'Falta fn_historial_sin_truncate: pega antes 20260914165703_movimientos_inmutables.sql';
  end if;
end $$;

create table if not exists retail.bajadas_en_mano (
  bajada_id uuid primary key references retail.bajadas_piso (id) on delete cascade,
  ajuste_movimiento_id uuid references retail.movimientos (id) on delete cascade,
  constraint bajadas_en_mano_ajuste_unico unique (ajuste_movimiento_id)
);

comment on table retail.bajadas_en_mano is
  'ADR-0328 (actividad 9): las bajadas al piso hechas con «La tengo en la mano» en Bajar al piso. Una fila por bajada (una sola prenda, 1 unidad). Solo la escribe retail.bajar_en_mano. No se edita ni se borra a mano.';
comment on column retail.bajadas_en_mano.bajada_id is
  'La bajada (bajadas_piso) que colgó la prenda: la misma cabecera y la misma línea que cualquier bajada, así que Frescura la cuenta igual.';
comment on column retail.bajadas_en_mano.ajuste_movimiento_id is
  'La corrección del almacén (+1, motivo reposicion = «Encontré prendas», nota «La tenía en la mano al bajarla…») escrita en la misma transacción. NULL si al guardar el almacén ya tenía la prenda: no hizo falta corregir.';

-- Editar o borrar a mano, no. Borrar en cascada (su movimiento o su bajada se borraron con «Eliminar con historia»), sí: la
-- cascada llega como un disparador interno de la llave, un nivel más adentro (pg_trigger_depth() > 1).
create or replace function retail.fn_bajada_en_mano_es_inmutable()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $fn$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'Una prenda corregida y colgada no se edita ni se borra. Si te equivocaste, súbela del piso y corrige el almacén con el movimiento contrario.';
end;
$fn$;

comment on function retail.fn_bajada_en_mano_es_inmutable() is
  'ADR-0328 (actividad 9): impide editar o borrar a mano retail.bajadas_en_mano; deja pasar solo el borrado en cascada de su bajada o su movimiento.';

create or replace trigger bajadas_en_mano_inmutables
  before update or delete on retail.bajadas_en_mano
  for each row execute function retail.fn_bajada_en_mano_es_inmutable();

create or replace trigger bajadas_en_mano_sin_truncate
  before truncate on retail.bajadas_en_mano
  for each statement execute function retail.fn_historial_sin_truncate();

alter table retail.bajadas_en_mano enable row level security;
revoke all on retail.bajadas_en_mano from public, anon, authenticated;
revoke all on function retail.fn_bajada_en_mano_es_inmutable() from public, anon, authenticated;

reset lock_timeout;
