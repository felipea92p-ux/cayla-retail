-- ============================================================================
-- 20261023180000_compras_simple_foto_opcional.sql — CAYLA V2 · ADR-0480 (Compras simple), rediseño
-- La foto del papel de una compra pasa a ser OPCIONAL (Felipe, 2026-10-23: «la foto del comprobante, que sea opcional»).
--
-- EL PROBLEMA PRIMERO. Al anotar una compra desde el celular, si el proveedor le dio una factura, una boleta o una nota de venta, la base
-- exigía la foto: sin ella, «Tómale una foto al papel que te dieron» y la compra no se guardaba. En la calle, con el celular sin batería o
-- el papel en el fardo, la compradora no podía anotar la compra que ya pagó, y la plata quedaba sin explicar hasta la noche.
--
-- QUÉ HACE
--   1. Suelta el candado `compra_papeles_foto_si_hay_papel` (con papel, foto obligatoria). Se queda el de la ruta: si hay foto, va en
--      `papeles/`.
--   2. `registrar_compra_rapida` deja de rechazar un papel sin foto (reemplazo anclado: solo se quita ese `if`).
--   Nada se borra ni cambia de lo ya guardado. Sin la foto, Compras copia la serie y el número del papel en la mano al completarlo (Revisar
--   compras ya decía «No subió foto»), y la tienda cuenta sin ver el papel.
--
-- Se pega tal cual en producción: idempotente (el candado se suelta solo si existe; el reemplazo no hace nada si ya se hizo), sin políticas.
-- ============================================================================
set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- El mismo reemplazo anclado del resto de Compras simple: falla si la función cambió desde que se escribió esto.
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

-- ---------- 1. Con papel, la foto ya no es obligatoria ----------
alter table retail.compra_papeles drop constraint if exists compra_papeles_foto_si_hay_papel;

-- ---------- 2. `registrar_compra_rapida` no rechaza un papel sin foto ----------
-- Pegada otra vez después de 20261023181000, el cuerpo de seis datos se llama `fn_registrar_compra_rapida_base`.
select pg_temp.reemplazar(coalesce(to_regprocedure('retail.registrar_compra_rapida(uuid,uuid,text,numeric,text,jsonb)'),
                                   to_regprocedure('retail.fn_registrar_compra_rapida_base(uuid,uuid,text,numeric,text,jsonb)'))::text,
$v$  if v_tipo <> 'sin_comprobante' and v_foto is null then
    raise exception 'Tómale una foto al papel que te dieron' using errcode = 'P0001', hint = 'compra_rapida_sin_foto';
  end if;
$v$,
$v$  -- La foto del papel es opcional (20261023180000, Felipe 2026-10-23): sin ella, Compras copia la serie y el número del papel en la mano.
$v$, 1);
