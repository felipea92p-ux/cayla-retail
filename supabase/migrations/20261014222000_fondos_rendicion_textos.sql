-- ============================================================================
-- 20261014222000_fondos_rendicion_textos.sql — ADR-0362 fase 6 (/formidable 2026-10-14, cambio 3; Felipe 2026-10-14)
--
-- EL PROBLEMA PRIMERO. Dos pruebas ciegas (la encargada que revisa y la vendedora que rinde) se trabaron en lo mismo: la cuenta de una
-- persona no se explicaba sola. Dos de esas dudas nacen de la base:
--   1. Quien le entregó plata a alguien en una rendición no la aprueba (decisión 35), y la hoja se lo decía con un texto que escribe
--      `fn_rendicion_quien_no_aprueba`: «…la aprueba otra persona con Fondos por rendir.». El nombre del módulo como sustantivo no se
--      entendió («otra persona con Fondos por rendir»), y la hoja no decía qué hacer si algo no cuadra.
--   2. «Ver tu rendición» le decía a la dueña «Quien la revisa decide si lo asume CAYLA o queda como deuda tuya» aunque no hubiera
--      explicado el faltante: sin explicación, la base la hace deuda sin elegir (decisión 54). La hoja no podía saberlo: lo que lee
--      («Tu fondo», `fn_mi_fondo_rendicion`) no trae la explicación.
--
-- LA DECISIÓN (Felipe 2026-10-14, cambio 3 de /formidable).
--   1. El texto: «Le entregaste plata en esta rendición: la aprueba otra persona que revise los fondos. Si algo no cuadra, devuélvela para
--      que la corrija.» (empieza igual: las pruebas y la pantalla reconocen el motivo por su comienzo).
--   2. Una lectura nueva y chica, `fn_mi_rendicion_abierta()`: la rendición por aprobar de QUIEN PREGUNTA, con su explicación. No se le
--      agrega una columna a `fn_mi_fondo_rendicion`: cambiar lo que devuelve una función de tabla obliga a borrarla, y las pruebas que
--      vuelven a cargar su migración original (`rendicion_fondo`, `deuda_fondo`) se romperían.
--
-- CONTRATO (Liskov)
--   PROMETE: `fn_rendicion_quien_no_aprueba` devuelve el texto nuevo en el caso «le entregó plata» y lo demás igual (también el mensaje de
--            `aprobar_rendicion_fondo`, que lo usa). `fn_mi_rendicion_abierta()` devuelve `{id, en, faltante, explicacion}` de la
--            rendición por aprobar del fondo de la cuenta que pregunta, o null (sin fondo, sin rendición abierta, o una terminal).
--   ASUME:   `fn_mi_fondo_cuenta()` (el fondo de la cuenta; null en una terminal).
--   NO HACE: no toca tablas, políticas ni quién aprueba.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Una sola parte: una función nueva y un reemplazo ANCLADO (la huella de
-- `fn_rendicion_quien_no_aprueba` es la misma en el banco `cayla-oc` y en producción, 873d357a…, 2026-10-14; si algo cambió, aborta sin
-- cambiar nada). Sin tablas ni políticas. Idempotente. Sin `select … into` en textos.
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

-- ---------- 1. Quién aprueba, en palabras de tienda ----------
select pg_temp.reemplazar('retail.fn_rendicion_quien_no_aprueba(uuid, uuid)',
$v$'Le entregaste plata en esta rendición: la aprueba otra persona con Fondos por rendir.'$v$,
$n$'Le entregaste plata en esta rendición: la aprueba otra persona que revise los fondos. Si algo no cuadra, devuélvela para que la corrija.'$n$,
1);

-- ---------- 2. La rendición abierta de quien pregunta, con su explicación ----------
create or replace function retail.fn_mi_rendicion_abierta()
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  -- La de su propio fondo (`fn_mi_fondo_cuenta`, null en una terminal): nadie lee la explicación de otra persona por aquí.
  select jsonb_build_object('id', r.id, 'en', r.rendida_en, 'faltante', r.faltante, 'explicacion', r.explicacion)
    from retail.rendiciones_fondo r
   where r.cuenta_id = retail.fn_mi_fondo_cuenta() and r.estado = 'por_aprobar'
   order by r.rendida_en desc
   limit 1;
$$;
comment on function retail.fn_mi_rendicion_abierta() is
  'ADR-0362 fase 6 (/formidable 2026-10-14): la rendición por aprobar del fondo de quien pregunta, con su explicación, para que «Ver tu rendición» diga qué pasa con el faltante. Null si no hay.';

revoke all on function retail.fn_mi_rendicion_abierta() from public, anon;
grant execute on function retail.fn_mi_rendicion_abierta() to authenticated, service_role;

reset lock_timeout;
notify pgrst, 'reload schema';
