-- ============================================================================
-- 20261014212000_devolucion_tope_rendicion_por_aprobar.sql — ADR-0362 fase 6 (/formidable 2026-10-14, Felipe 2026-10-14)
--
-- EL PROBLEMA PRIMERO. Micaela rinde su fondo: el sistema dice S/ 380 y ella tiene S/ 375 en la mano (faltan S/ 5). Mientras esa rendición
-- espera aprobación, el fondo sigue diciendo S/ 380 —el faltante sale recién al aprobar (`aprobar_rendicion_fondo`)—, y `devolver_fondo`
-- tomaba como tope ese saldo de los libros. La hoja de devolución también lo mostraba («Tiene S/ 380.00 en su fondo»). El escéptico de
-- /formidable lo encontró y se reprodujo en el banco: se registra una devolución de S/ 380, se aprueba la rendición y el fondo queda en
-- −S/ 5 («CAYLA le debe S/ 5») y, a la vez, nace una deuda suya de S/ 5. Los mismos cinco soles, debidos en los dos sentidos: un estado que
-- no debería poder existir (principio 2). Basta con que quien recibe la plata escriba la cifra de la pantalla en vez de contar los billetes.
--
-- LA DECISIÓN (Felipe 2026-10-14). Mientras haya una rendición por aprobar, la devolución no pasa de lo que la persona tiene de verdad en la
-- mano: el saldo de los libros menos el faltante que su rendición ya declaró (lo que saldrá del fondo al aprobarla). Con lo que pasó
-- después de rendir incluido: si después le entregaron S/ 100 más, puede devolver S/ 475. Sin una rendición por aprobar, nada cambia.
--
-- CONTRATO (Liskov)
--   PROMETE: con una rendición `por_aprobar` con faltante, `devolver_fondo` rechaza (P0001, `fondo_insuficiente`, el mismo hint de siempre)
--            un monto mayor que «saldo − faltante», con un mensaje que dice cuánto tiene en la mano. Todo lo demás, igual.
--   ASUME:   a lo más una rendición `por_aprobar` por fondo (`rendir_fondo` lo exige) y el candado por persona («fondo:<persona>») que ya
--            toman `rendir_fondo`, `aprobar_rendicion_fondo`, `devolver_rendicion_fondo` y esta función: la lectura no compite con ellas.
--   NO HACE: no toca los pagos ni los gastos desde el fondo, ni cómo se aprueba un faltante.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Una sola parte, solo una función, sin tablas ni políticas. Reemplazo ANCLADO: la función
-- tiene la misma huella en el banco `cayla-oc` y en producción (md5 13a89771…, 2026-10-14); si algo cambió, aborta sin cambiar nada.
-- Idempotente. Sin `select … into` dentro de textos entre comillas.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- Reemplaza un texto en la definición VIVA de una función, solo si aparece las veces esperadas; si ya está reemplazado, no hace nada.
create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
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
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

select pg_temp.reemplazar('retail.devolver_fondo(uuid, uuid, numeric, text, date, uuid)',
$v$  v_saldo numeric;
begin$v$,
$n$  v_saldo numeric;
  -- El faltante de su rendición por aprobar, que saldrá del fondo al aprobarla (/formidable 2026-10-14).
  v_por_aprobar numeric;
begin$n$,
1);

select pg_temp.reemplazar('retail.devolver_fondo(uuid, uuid, numeric, text, date, uuid)',
$v$  v_saldo := retail.fn_fondo_saldo(v_fondo);
  if v_monto > v_saldo then$v$,
$n$  v_saldo := retail.fn_fondo_saldo(v_fondo);
  -- Con una rendición por aprobar, lo que de verdad tiene en la mano es lo de los libros menos el faltante que ya declaró: devolver «lo
  -- de los libros» y aprobar después dejaba el fondo debiendo y debido por la misma plata (Felipe 2026-10-14).
  v_por_aprobar := coalesce((select r.faltante from retail.rendiciones_fondo r
                              where r.cuenta_id = v_fondo and r.estado = 'por_aprobar'
                              order by r.rendida_en desc limit 1), 0);
  if v_por_aprobar > 0 and v_monto > v_saldo - v_por_aprobar then
    raise exception 'Con su rendición por aprobar, tiene S/ % en la mano: no puede devolver S/ %.',
      to_char(greatest(v_saldo - v_por_aprobar, 0), 'FM999G999G990D00'), to_char(v_monto, 'FM999G999G990D00')
      using errcode = 'P0001', hint = 'fondo_insuficiente';
  end if;
  if v_monto > v_saldo then$n$,
1);

reset lock_timeout;
notify pgrst, 'reload schema';
