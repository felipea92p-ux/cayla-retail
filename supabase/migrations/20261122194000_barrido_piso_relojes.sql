-- ============================================================================
-- 20261122194000_barrido_piso_relojes.sql — CAYLA V2 · ADR-0690 «El barrido del piso» · actividad 6 · los relojes
-- Pega DESPUÉS de 20261122193000_barrido_piso_confirmar.sql (necesita cuadres_piso.lado): lo comprueba la guarda.
--
-- EL PROBLEMA PRIMERO. Un barrido confirmado ES un cuadre (queda en `cuadres_piso`, lado piso). Y `fn_ultimo_cuadre_piso` —la fecha
-- del último cuadre de la sede— es la que reinicia tres relojes:
--   · la demanda que lee Producción arranca el día SIGUIENTE al último cuadre (fn_demanda_sede, 20261005215000);
--   · el motor de demanda y Análisis quedan en «Todavía no» hasta un nuevo conteo de arranque (20261005210000, 20261006213000);
--   · el primer conteo de cada tramo después del cuadre es «de arranque»: corrige sin contar como merma (20261004230100).
-- Eso está bien UNA vez: antes del primer cuadre el piso del sistema estaba subcontado y su historia no sirve. Pero el barrido se
-- hace una vez al mes (Felipe, 2026-11-22): si cada uno reiniciara, Producción nunca tendría más de un mes de ventas, Análisis
-- viviría en «Todavía no» y casi ningún conteo mediría merma.
--
-- LA REGLA (Felipe aprobó «solo el primer cuadre de cada tienda reinicia los relojes»):
--   · un cuadre del ALMACÉN (`cuadrar_piso`, lado almacen) reinicia siempre, como hasta hoy: es la herramienta de «rehacer desde
--     cero», pide nota al repetir y nada de eso cambia;
--   · un barrido del PISO (lado piso) reinicia SOLO si es el primer cuadre de su sede. Los siguientes corrigen dónde está cada
--     prenda y nada más.
-- Trujillo y Lima nunca cuadraron: su primer barrido reinicia (tiene que hacerlo). Arequipa cuadró el 2026-11-13: sus barridos no.
--
-- QUÉ HACE. Solo `create or replace` de `fn_ultimo_cuadre_piso` (misma firma, mismo dueño, mismos permisos). Las cuatro funciones
-- que la llaman no se tocan. Lo que NO cambia a propósito: «cuándo se cuadró el piso» del plan del piso y de la capacidad
-- (20261004213000, 20261005103000) y «hay un cuadre después de la última venta» de la cola de arranque (20261015004000) leen
-- `cuadres_piso` directo y siguen contando TODO cuadre, barridos incluidos: ahí la pregunta es «¿está al día el piso?», y un
-- barrido lo deja al día. Frescura tampoco cambia: todo cuadre corta la medida de las decisiones que lo cruzan (pendiente de
-- decidir con Felipe si un barrido mensual debe cortarla; ADR-0690).
--
-- CÓMO SE PEGA EN PRODUCCIÓN. Sola, a cualquier hora: una función, sin tablas ni políticas. Idempotente. La guarda aborta sin tocar
-- nada si la función viva no es la de 20261004230100 ni esta (alguien la parchó en vivo: hay que mirar antes de pisar).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $guarda$
declare
  v_def text;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'retail' and table_name = 'cuadres_piso' and column_name = 'lado') then
    raise exception 'Falta cuadres_piso.lado: pega antes 20261122193000_barrido_piso_confirmar.sql.';
  end if;
  v_def := pg_get_functiondef('retail.fn_ultimo_cuadre_piso(uuid)'::regprocedure);
  if position('max(cp.created_at)' in v_def) = 0 then
    raise exception 'fn_ultimo_cuadre_piso no es la que esta migración espera (¿un parche en vivo?). No se cambió nada.';
  end if;
end;
$guarda$;

create or replace function retail.fn_ultimo_cuadre_piso(p_ubicacion_id uuid)
returns timestamptz
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $fn$
begin
  if to_regclass('retail.cuadres_piso') is null then
    return null;
  end if;
  -- Los cuadres que REINICIAN los relojes: todo cuadre del almacén, y el barrido del piso solo si fue el primer cuadre de su sede.
  return (select max(cp.created_at)
            from (select c.ubicacion_id, c.created_at
                    from retail.cuadres_piso c
                   where c.lado = 'almacen'
                      or not exists (select 1 from retail.cuadres_piso a
                                      where a.ubicacion_id = c.ubicacion_id and a.created_at < c.created_at)) cp
           where cp.ubicacion_id = p_ubicacion_id);
end;
$fn$;

comment on function retail.fn_ultimo_cuadre_piso(uuid) is
  'ADR-0328 / ADR-0690: la fecha del último cuadre de la sede que REINICIA los relojes (demanda, conteo de arranque, preparación de Análisis): todo cuadre del almacén, y un barrido del piso solo si fue el primer cuadre de la sede. Nula si nunca se cuadró. «Cuándo se cuadró el piso» (cualquier cuadre) se lee de cuadres_piso.';

notify pgrst, 'reload schema';

reset lock_timeout;
