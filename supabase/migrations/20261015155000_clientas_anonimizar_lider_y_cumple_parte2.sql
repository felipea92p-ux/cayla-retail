-- ============================================================================
-- 20261015155000_clientas_anonimizar_lider_y_cumple_parte2.sql — CAYLA V2 (/chaos de Clientes, ADR-0416, 2026-10-15) · PARTE 2 de 2
--
-- EL PROBLEMA PRIMERO.
--   1. Anonimizar una ficha (Ley 29733) borra el documento, el celular, el cumpleaños, las tallas y su lugar en el club, y no tiene
--      vuelta atrás. Hoy lo hace cualquiera que ve Clientes. Es la única acción del módulo que destruye datos (archivar se deshace; unir
--      deja los datos en la otra ficha). En producción la única ficha anonimizada la anonimizó un líder (2026-10-15).
--   2. El año de nacimiento acepta 2030 (la tabla deja hasta 2100). La pantalla ya lo frena; la base no.
--
-- LA DECISIÓN (Felipe 2026-10-15: «aplica tus recomendaciones»).
--   1. `archivar_clienta` con `p_anonimizar` exige un líder (`fn_es_lider()`, `anonimizar_solo_lider`). Archivar sin anonimizar sigue
--      siendo de quien ve Clientes (ADR-0306). La rutina que anonimiza (`fn_clienta_anonimizar`) no la ejecuta una cuenta.
--   2. Un disparador en `clientas`: el año de nacimiento no es posterior al año de hoy en Lima (`cumple_anio_futuro`). Va en un disparador
--      y no en un CHECK porque depende de la fecha de hoy.
--
-- CONTRATO (Liskov)
--   PROMETE: solo un líder anonimiza; ninguna ficha nueva o editada guarda un año de nacimiento futuro. Lo demás sigue igual.
--   ASUME:   `archivar_clienta` viva a la fecha (ancla verificada en local y en producción el 2026-10-15).
--   NO HACE: no toca filas ni políticas.
--
-- VERSIONES (md5 normalizado —sin comentarios ni espacios—, el mismo de las tablas de las tandas del club; las suites del club la leen
-- como la última tanda que tocó `archivar_clienta` y exigen que su «antes» sea el «después» de la 1g, 20261001210700):
--   ('retail.archivar_clienta(uuid,text,boolean,integer)', '73cb792a340c57f7239106bd21feccfe', 'a24c992644f6167f654f22738777041a')
--
-- CÓMO SE PEGA. Una sola parte: un reemplazo ANCLADO en `archivar_clienta` (se detiene sin tocar nada si el ancla no aparece una vez), una
-- función nueva y su disparador (`create or replace trigger`, nunca `drop trigger`, ADR-0195). Sin políticas. Idempotente.
-- ============================================================================
set lock_timeout = '3s';

-- Inserta `p_bloque` antes de la primera aparición de `p_ancla`, que tiene que aparecer exactamente `p_veces` veces.
-- Si `p_marca` ya está en la función, no hace nada.
create or replace function pg_temp.insertar_antes(p_firma text, p_ancla text, p_veces integer, p_bloque text, p_marca text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_marca in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_ancla, ''))) / length(p_ancla);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_ancla, v_n;
  end if;
  execute overlay(v_def placing p_bloque || p_ancla from position(p_ancla in v_def) for length(p_ancla));
end;
$f$;

-- 1. Anonimizar es de un líder.
select pg_temp.insertar_antes(
  'retail.archivar_clienta(uuid, text, boolean, integer)',
  $v$  if p_anonimizar then$v$, 1,
  $v$  -- ADR-0416: anonimizar borra los datos personales sin vuelta atrás: lo hace un líder (anonimizar_solo_lider).
  if p_anonimizar and not retail.fn_es_lider() then
    raise exception 'Anonimizar una ficha borra sus datos personales y no tiene vuelta atrás: lo hace un líder. Puedes archivarla sin anonimizar.'
      using errcode = '42501', hint = 'anonimizar_solo_lider';
  end if;
$v$,
  $v$anonimizar_solo_lider$v$);

-- 2. El año de nacimiento no es futuro.
create or replace function retail.fn_clienta_cumple_no_futuro()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  if new.cumple_anio is not null and new.cumple_anio > extract(year from retail.fn_hoy_lima())::integer then
    raise exception 'El año de nacimiento no puede ser futuro: llegó %.', new.cumple_anio
      using errcode = 'P0001', hint = 'cumple_anio_futuro';
  end if;
  return new;
end;
$$;

comment on function retail.fn_clienta_cumple_no_futuro() is
  'Disparador: el año de nacimiento de una ficha no es posterior al año de hoy en Lima (ADR-0416).';
revoke all on function retail.fn_clienta_cumple_no_futuro() from public, anon, authenticated;

create or replace trigger clientas_cumple_no_futuro
  before insert or update of cumple_anio on retail.clientas
  for each row execute function retail.fn_clienta_cumple_no_futuro();
