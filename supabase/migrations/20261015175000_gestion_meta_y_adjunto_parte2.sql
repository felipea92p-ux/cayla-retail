-- ============================================================================
-- 20261015175000_gestion_meta_y_adjunto_parte2.sql — CAYLA V2 (/chaos de Gestión e Inicio, ADR-0423, 2026-10-15) · PARTE 2 de 2
--
-- EL PROBLEMA PRIMERO. /chaos del último grupo del ERP (corrida del 2026-10-15, semilla 20261015). Frescura, el Plan del piso, Elige sede,
-- las guías y la cola de arranque resistieron todo (también dos personas a la vez). Quedaron cuatro cosas, todas solo por la API:
--   1. GRAVEDAD 2 · `fijar_meta_persona` aceptaba la meta de una persona para enero de 2999. Rendimiento solo edita el mes en curso, y la
--      función ya rechazaba los meses pasados; el futuro no tenía techo.
--   2. GRAVEDAD 4 · Un motivo de 81 letras respondía con el texto crudo del candado de la tabla
--      (`violates check constraint "metas_persona_ajustes_detalle_check"`).
--   3. GRAVEDAD 2 · `registrar_adjunto_compra` aceptaba un nombre de 5000 letras y una ruta con más carpetas que la de su factura.
--   4. GRAVEDAD 4 · El mismo archivo registrado dos veces respondía `duplicate key value violates unique constraint`.
--
-- LA DECISIÓN.
--   1. La meta de una persona se fija hasta 12 meses adelante (`meta_mes_lejano`): el horizonte del plan de campaña. Rendimiento no cambia.
--   2. El motivo cabe en 80 letras, con su frase (`meta_detalle_largo`): la misma regla que ya tenían la tabla y la pantalla.
--   3. El adjunto: nombre hasta 255 letras (`adjunto_nombre_largo`) y la ruta, la carpeta de su factura y UN archivo sin más carpetas
--      (`adjunto_ruta_invalida`), lo que arma `rutaPara`. La parte 1 lo deja también en la tabla.
--   4. El archivo ya registrado responde «ya está adjunto» (`adjunto_repetido`) en vez del error crudo.
--
-- CONTRATO (Liskov)
--   PROMETE: ninguna meta más allá de 12 meses, ningún motivo de más de 80 letras sin su frase, ningún adjunto fuera de ese formato; lo que
--            Rendimiento y Compras mandan hoy entra igual.
--   ASUME:   las dos funciones vivas a la fecha (anclas verificadas en local y en producción el 2026-10-15, md5 iguales).
--   NO HACE: no toca tablas ni políticas; no cambia quién puede fijar metas ni adjuntar.
--
-- CÓMO SE PEGA. Una sola parte, solo funciones. Reemplazos ANCLADOS sobre la definición viva (ADR-0288): cada bloque va antes de la
-- primera aparición de su ancla, que tiene que aparecer exactamente una vez (si no, se detiene sin tocar nada). Idempotente. Sin políticas.
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

-- 1 y 2. La meta de una persona: hasta 12 meses adelante, y el motivo en 80 letras.
select pg_temp.insertar_antes(
  'retail.fijar_meta_persona(uuid, uuid, date, numeric, text, text, numeric)',
  $v$  v_fin := (v_mes + interval '1 month - 1 day')::date;$v$, 1,
  $v$  -- ADR-0423: hasta 12 meses adelante (el horizonte del plan de campaña) y el motivo en 80 letras, como la tabla y la pantalla.
  if v_mes > (date_trunc('month', v_hoy) + interval '12 months')::date then
    raise exception 'Las metas se fijan hasta un año adelante: elige un mes más cercano' using errcode = '22023', hint = 'meta_mes_lejano';
  end if;
  if v_detalle is not null and char_length(v_detalle) > 80 then
    raise exception 'El motivo cabe en 80 letras: cuéntalo más corto' using errcode = '22023', hint = 'meta_detalle_largo';
  end if;
$v$,
  $v$hint = 'meta_mes_lejano'$v$);

-- 3 y 4. El adjunto de una factura: nombre con tope, la ruta que arma la pantalla, y el repetido con su frase.
select pg_temp.insertar_antes(
  'retail.registrar_adjunto_compra(uuid, text, text, text, integer, uuid)',
  $v$  if p_tipo not in ('application/pdf'$v$, 1,
  $v$  -- ADR-0423: el nombre hasta 255 letras; la ruta, la carpeta de esta factura y UN archivo (lo que arma `rutaPara`); y el mismo
  -- archivo registrado dos veces se dice con palabras (adjunto_repetido), no con el error del índice único.
  if char_length(trim(p_nombre)) > 255 then
    raise exception 'El nombre del archivo es demasiado largo: hasta 255 letras' using hint = 'adjunto_nombre_largo';
  end if;
  if p_ruta is null or p_ruta !~ ('^' || p_compra_id::text || '/[A-Za-z0-9._-]{1,200}$') then
    raise exception 'El archivo tiene que estar en la carpeta de esta factura' using hint = 'adjunto_ruta_invalida';
  end if;
  if exists (select 1 from retail.compra_adjuntos a where a.ruta = p_ruta) then
    raise exception 'Ese archivo ya está adjunto a esta factura' using hint = 'adjunto_repetido';
  end if;
$v$,
  $v$hint = 'adjunto_repetido'$v$);
