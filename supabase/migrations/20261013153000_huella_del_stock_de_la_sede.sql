-- Huella del stock de una sede (2026-10-13, auditoría de 20 puntos, punto 20: «el mostrador relee todo el stock cada 10 s»).
--
-- EL PROBLEMA. Vender, Cambios y Apartados releen TODO el stock de la sede cada 10 s mientras la pantalla está abierta
-- (`apps/web/lib/useStockEnVivo.ts`). En producción TRU tiene 1.507 filas (2 páginas de 1.000, una tras otra, por cada
-- pantalla abierta) y la cuenta solo crece: una fila que llega a 0 no se borra. Casi siempre la lectura trae exactamente lo
-- que la pantalla ya tenía, contra una base que el propio repo midió como «de poca CPU» (20260923171700: ~430 ms una llamada
-- pesada, 1,3 s seis a la vez).
--
-- LA SALIDA. Antes de releer, la pantalla pide esta huella: un md5 de las filas de stock de la sede (prenda, sububicación,
-- su tipo, cantidad y apartado). Si es la misma que la última vez, no relee nada; si cambió, relee como siempre. Es una
-- LECTURA del estado actual: no escribe, no bloquea y no agrega disparadores.
--
-- DECIDÍ: huella calculada sobre el estado (md5 de las filas) en vez de un contador que sube en cada escritura, que es el
-- patrón de `fn_catalogo_version` (20260923184300).
-- DESCARTÉ: el contador por sede, porque cada venta y cada movimiento tendrían que actualizar la misma fila y retenerla hasta
-- el final de su transacción: dos traslados cruzados en el mismo segundo (TRU→AQP y AQP→TRU) tomarían los dos contadores en
-- orden contrario y se bloquearían entre sí. Para el catálogo sirve porque se edita pocas veces al día; el stock se mueve con
-- cada venta. Y descarté `max(updated_at)`, porque una transacción larga que confirma tarde deja una fecha más vieja que la
-- que la pantalla ya vio, y ese cambio no se notaría nunca.
-- SE ROMPE SI: una sede llega a decenas de miles de filas de stock, porque el md5 recorre todas sus filas en cada vuelta (hoy
-- ~1.500; a 3 años se estiman 5.000–8.000, unos pocos milisegundos con el índice `stock_ubicacion_idx`). Ahí conviene el
-- contador, tomado siempre en el mismo orden.
--
-- SEGURIDAD. `security invoker`, a propósito: corre con los permisos de quien pregunta, así que la huella cubre exactamente
-- las filas que esa cuenta ya podía leer con el `select` directo de `stock` (las mismas políticas). No revela nada nuevo: una
-- cuenta que no ve la sede recibe la huella de cero filas.
--
-- PRODUCCIÓN. Una sola parte: sin políticas, sin disparadores y sin `alter` de tablas en uso. Se puede pegar tal cual y volver
-- a pegar. Verificación después de pegar: `select length(retail.fn_stock_huella(id)) from retail.ubicaciones limit 1;` → 32.

set lock_timeout = '3s';

create or replace function retail.fn_stock_huella(p_ubicacion_id uuid)
returns text
language sql
stable
security invoker
set search_path to 'retail', 'public', 'extensions'
as $$
  select md5(coalesce(string_agg(
           s.variante_id::text || ':' || coalesce(s.sububicacion_id::text, '-') || ':' || coalesce(sb.tipo::text, '-')
             || ':' || s.cantidad || ':' || s.cantidad_apartada,
           ',' order by s.variante_id, s.sububicacion_id), ''))
    from retail.stock s
    left join retail.sububicaciones sb on sb.id = s.sububicacion_id
   where s.ubicacion_id = p_ubicacion_id;
$$;

comment on function retail.fn_stock_huella(uuid) is
  'Huella (md5) del stock que la cuenta ve en una sede: cambia si cambia una cantidad, un apartado o una fila. La usa useStockEnVivo para no releer lo mismo cada 10 s. Solo lectura y security invoker (mismas políticas que leer stock).';

revoke all on function retail.fn_stock_huella(uuid) from public, anon;
grant execute on function retail.fn_stock_huella(uuid) to authenticated;
