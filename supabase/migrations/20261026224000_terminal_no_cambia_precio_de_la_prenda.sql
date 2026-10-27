-- Una terminal no cambia el precio de la prenda (Felipe 2026-10-26).
--
-- El precio de la prenda (`variantes.precio`, la matriz de la ficha) vale en TODAS las tiendas. Una terminal está fija en una
-- tienda (ADR-0162): lo que cambie tiene que valer solo ahí, y para eso existe el precio de la tienda (`poner_precio_sede`, que ya
-- la deja tocar solo la suya). Antes, una terminal con Productos editaba la matriz de la ficha —o elegía «todas las sedes» al cambiar
-- el precio desde Recibir envío— y el precio cambiaba también en las otras tiendas.
--
-- El candado es un disparador sobre la columna, no un `if` en cada función: hoy escriben el precio `catalogo_actualizar_producto`
-- (la ficha) y `cambiar_precio_en_recepcion` (alcance «todas»), y una función que se sume mañana queda cubierta sin acordarse.
-- Solo frena un CAMBIO de precio de una variante que ya existe; crear una prenda o sumarle una talla (con su precio) sigue igual,
-- y una persona (líder o integrante) no cambia nada. Sin sesión (`auth.uid()` nulo: scripts, el SQL Editor) `fn_es_terminal()` es
-- falso y no frena.
--
-- Sin políticas ni `drop trigger`: se pega de una vez en el SQL Editor y se puede pegar dos veces.

set lock_timeout = '3s';
set search_path = retail, public, extensions;

create or replace function retail.fn_terminal_no_cambia_precio_de_la_prenda()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  if retail.fn_es_terminal() then
    raise exception 'Desde una terminal el precio se cambia solo en su tienda: usa «Precio en tu tienda» en la ficha de la prenda.'
      using errcode = '42501', hint = 'terminal_precio_de_la_prenda';
  end if;
  return new;
end;
$$;

comment on function retail.fn_terminal_no_cambia_precio_de_la_prenda() is
  'Felipe 2026-10-26: una terminal no cambia variantes.precio (vale en todas las tiendas); pone el precio de SU tienda con poner_precio_sede.';

create or replace trigger variantes_terminal_no_cambia_precio
  before update of precio on retail.variantes
  for each row
  when (new.precio is distinct from old.precio)
  execute function retail.fn_terminal_no_cambia_precio_de_la_prenda();
