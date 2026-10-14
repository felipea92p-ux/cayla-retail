-- ============================================================================
-- 20261013211000_apartados_y_proformas_candados.sql — CAYLA V2 (/chaos 2026-10-13)
--
-- EL PROBLEMA PRIMERO. Tres huecos chicos de Apartados y Proformas que /chaos encontró el 2026-10-13 (solo por la API: la
-- pantalla no los manda, pero la base es la que tiene que cuidarlos):
--   1. `separar_prendas` con un celular escrito sin ningún dígito («abcdefghi»): se descartaba en silencio y el apartado
--      quedaba sin celular, sin que nadie lo supiera (el aviso de «ya llegó» no tendría a quién ir).
--   2. `crear_proforma` aceptaba una proforma que ya venció (`vence_at` en el pasado): nacía vencida.
--   3. `marcar_proforma_cobrada` aceptaba una venta de OTRAS prendas: la proforma quedaba «convertida» con una venta que no la
--      cobró.
--
-- LA DECISIÓN. Cada función lo dice y no guarda:
--   1. un celular escrito que no deja dígitos se rechaza con el mismo mensaje que uno de largo equivocado (`celular_invalido`);
--   2. una proforma con el vencimiento en el pasado se rechaza (`proforma_vencida_al_crear`); la pantalla siempre manda un día o más;
--   3. cada prenda de la proforma, en su cantidad, tiene que estar en la venta (`proforma_otras_prendas`). Las líneas de más (una
--      bolsa que se sumó al cobrar) sí se permiten.
--
-- CONTRATO (Liskov)
--   PROMETE: lo de arriba; lo válido pasa igual que antes.
--   ASUME:   las tres funciones vivas a la fecha (verificado el 2026-10-13: cada ancla aparece una vez, en local y en producción).
--   NO HACE: no toca tablas, políticas ni datos.
--
-- CÓMO SE PEGA. Una sola parte, solo funciones. Reemplazos ANCLADOS sobre la definición viva (ADR-0288), anclas de una línea de
-- código. Idempotente. Sin `select … into` dentro de un texto entre comillas.
-- ============================================================================
set lock_timeout = '3s';

create or replace function pg_temp.reemplazar_candados(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
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

select pg_temp.reemplazar_candados(
  'retail.separar_prendas(uuid, jsonb, jsonb, text, text, text, text, text, text, text, text, text, text, uuid, uuid, text, uuid)',
  $v$  if v_celular is not null and v_celular !~ '^[0-9]{9}$' then$v$,
  $v$  -- Un celular escrito que no deja ningún dígito no se descarta en silencio: se pide corregirlo.
  if btrim(coalesce(p_clienta_celular, '')) <> '' and v_celular is null then
    raise exception 'El celular del cliente tiene 9 dígitos (o déjalo vacío)' using errcode = 'P0001', hint = 'celular_invalido';
  end if;
  if v_celular is not null and v_celular !~ '^[0-9]{9}$' then$v$,
  1);

select pg_temp.reemplazar_candados(
  'retail.crear_proforma(uuid, jsonb, text, text, timestamp with time zone, text)',
  $v$  v_persona := retail.fn_actor_persona_id(true);$v$,
  $v$  -- Una proforma no nace vencida.
  if p_vence_at is not null and p_vence_at < now() then
    raise exception 'La fecha de vencimiento ya pasó: elige una que venga.' using errcode = 'P0001', hint = 'proforma_vencida_al_crear';
  end if;
  v_persona := retail.fn_actor_persona_id(true);$v$,
  1);

select pg_temp.reemplazar_candados(
  'retail.marcar_proforma_cobrada(uuid, uuid)',
  $v$  update proformas set estado = 'convertida', venta_id = p_venta_id where id = p_proforma_id;$v$,
  $v$  -- La venta tiene que llevar cada prenda de la proforma, en su cantidad. Las líneas de más (una bolsa) sí se permiten.
  if exists (
    select 1 from jsonb_array_elements(v_proforma.items) pi
     where coalesce((select sum(vi.cantidad) from venta_items vi
                      where vi.venta_id = p_venta_id and vi.variante_id = (pi ->> 'variante_id')::uuid), 0)
           < coalesce((pi ->> 'cantidad')::integer, 0)
  ) then
    raise exception 'Esa venta no lleva las prendas de la proforma: se marca con la venta que la cobró.'
      using errcode = 'P0001', hint = 'proforma_otras_prendas';
  end if;
  update proformas set estado = 'convertida', venta_id = p_venta_id where id = p_proforma_id;$v$,
  1);
