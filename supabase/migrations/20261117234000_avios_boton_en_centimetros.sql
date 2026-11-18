-- 20261117234000_avios_boton_en_centimetros.sql — CAYLA V2 (ADR-0580, actualización 2026-11-17)
--
-- EL PROBLEMA. Desde el 2026-10-30 un botón (y todo avío que se cuenta por pieza: broche, remache) se mide SOLO en líneas («Botón nácar 18 L»).
-- Felipe, 2026-11-17: «quitar lo de línea porque se maneja por cm». El taller compra y pide los botones en centímetros; una medida que nadie usa
-- solo invita a errores («¿18 qué?»).
--
-- QUÉ HACE (una sola parte, re-ejecutable; sin políticas, así que no choca con la regla de deadlocks de ADR-0195):
--   1. Las fichas que ya están en líneas pasan a centímetros, con su línea en Actividad:
--        · las de una clase que se cuenta por pieza (el botón): 1 L = 0,635 mm, a dos decimales («Botones 9 L» → «Botones 0.57 cm»). Es la
--          conversión exacta, no la medida real: quien tiene el botón en la mano la corrige en «Editar avío».
--        · las de cualquier otra clase («Aguja Clase B 1 L», clase «Otro»): una aguja no se mide en líneas; quedan SIN medida.
--      El nombre de sus colores lo reescribe el disparador de siempre (`materiales_propaga_a_colores`), en esta misma transacción.
--   2. `fn_medida_cuadra`: «pieza» admite SOLO centímetros, y ningún comportamiento admite líneas. Sigue siendo UNA unidad por comportamiento,
--      por la misma razón de 2026-10-30: la unidad entra en la llave del índice único, y con dos unidades el mismo botón entraría dos veces.
--   3. `fn_medida_texto` deja de saber decir «L».
--   4. El candado `materiales_medida_conocida` deja de aceptar 'linea' (después del paso 1: ya no queda ninguna).
--   5. La nota de la clase «Botón», solo si nadie la cambió desde que nació.
--
-- PROMETE: después de esta migración ninguna ficha está en líneas ni puede volver a estarlo; la web (`lib/avio-clases-reglas.ts`) dice lo mismo
--          valor por valor (su prueba lo exige) y `scripts/pruebas/materiales.mjs` (V8, V10, V15, V16) lo comprueba en Postgres.
-- ASUME:   `fn_material_leer` sigue aceptando 'linea' como palabra conocida y la rechaza en `fn_medida_cuadra` con «Esa no es la medida de «…»: revisa
--          la unidad». No se reemplaza esa función (es larga y otras migraciones la parchan): el mensaje alcanza.
-- NO HACE: no toca lotes, stock ni costos; no renombra a mano ningún insumo.
--
-- DECIDÍ: centímetros y solo centímetros para la pieza. DESCARTÉ admitir cm y mm a la vez (el mismo botón entraría dos veces, con su stock partido)
--   y DESCARTÉ dejar «línea» como opción escondida (la decisión de Felipe es quitarla, y una unidad que nadie usa vuelve por la puerta de atrás).
-- SE ROMPE SI: un proveedor factura los botones por línea y nadie sabe pasarlo a cm. A propósito la pantalla NO lo explica (Felipe 2026-11-17: «que no dé
--   tecnicismo que ellos no usan»): si pasa, se mide el botón con regla.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. Las fichas en líneas pasan a centímetros (o quedan sin medida) ----------
do $$
declare
  r record;
  v_nueva numeric;
  v_ubicacion uuid;
begin
  for r in
    select m.id, m.codigo, m.nombre, m.medida_valor, coalesce(c.comportamiento, 'otro') as comportamiento
      from retail.materiales m
      left join retail.avio_clases c on c.id = m.clase_id
     where m.tipo = 'avio' and m.medida_unidad = 'linea'
     order by m.codigo
  loop
    v_nueva := case when r.comportamiento = 'pieza' then round(r.medida_valor * 0.0635, 2) end;
    -- Un botón de menos de 0,16 L daría 0 cm: el candado de la base exige una medida mayor que cero. Queda sin medida, como la aguja.
    if v_nueva is not null and v_nueva <= 0 then
      v_nueva := null;
    end if;

    update retail.materiales
       set medida_valor = v_nueva,
           medida_unidad = case when v_nueva is null then null else 'centimetro' end
     where id = r.id;

    -- La ficha no guarda su taller: lo dice su primer lote; sin lotes, el taller activo más antiguo.
    v_ubicacion := coalesce(
      (select l.ubicacion_id from retail.insumo_lotes l join retail.insumos i on i.id = l.insumo_id where i.material_id = r.id order by l.created_at limit 1),
      (select u.id from retail.ubicaciones u where u.tipo = 'taller' and u.activo order by u.created_at limit 1));
    perform retail.fn_material_anotar('avio_editado',
      'pasó «' || r.nombre || '» (' || r.codigo || ') de ' || trim_scale(r.medida_valor)::text || ' L a '
        || case when v_nueva is null then 'sin medida' else trim_scale(v_nueva)::text || ' cm' end
        || ': el botón se mide en centímetros (ADR-0580, 2026-11-17)',
      null, v_ubicacion, r.id,
      jsonb_build_object('material_id', r.id, 'codigo', r.codigo,
        'antes', jsonb_build_object('medida_valor', r.medida_valor, 'medida_unidad', 'linea'),
        'despues', jsonb_build_object('medida_valor', v_nueva, 'medida_unidad', case when v_nueva is null then null else 'centimetro' end)));
  end loop;
end;
$$;

-- ---------- 2. Qué medida admite cada comportamiento ----------
-- `pieza` admite UNA sola unidad —centímetros— (Felipe, 2026-11-17; antes, líneas). Una sola, por la razón de 2026-10-30: la unidad entra en la llave del índice único,
-- y con dos unidades «Botón nácar 1.5 cm» y «Botón nácar 15 mm» serían dos fichas del mismo botón. `otro` admite las tres que quedan.
create or replace function retail.fn_medida_cuadra(p_comportamiento text, p_unidad text)
returns boolean
language sql
immutable
as $f$
  select case p_comportamiento
    when 'pieza' then p_unidad = 'centimetro'
    when 'largo' then p_unidad = 'centimetro'
    when 'ancho' then p_unidad = 'centimetro'
    when 'titulo' then p_unidad = 'titulo'
    when 'etiqueta' then false
    else p_unidad in ('milimetro', 'centimetro', 'titulo')
  end;
$f$;
comment on function retail.fn_medida_cuadra(text, text) is
  'ADR-0580 (act. 2026-11-17): qué unidad de medida admite cada comportamiento de clase de avío. Un botón se mide en centímetros, un cierre también, un hilo en título; una etiqueta no se mide. Ninguno en líneas.';
revoke all on function retail.fn_medida_cuadra(text, text) from public, anon, authenticated;

-- ---------- 3. Cómo se dice una medida ----------
create or replace function retail.fn_medida_texto(p_valor numeric, p_unidad text)
returns text
language sql
immutable
as $f$
  select case
    when p_valor is null or p_unidad is null then null
    when p_unidad = 'milimetro' then trim_scale(p_valor)::text || ' mm'
    when p_unidad = 'centimetro' then trim_scale(p_valor)::text || ' cm'
    when p_unidad = 'titulo' then 'título ' || trim_scale(p_valor)::text
    else null
  end;
$f$;
comment on function retail.fn_medida_texto(numeric, text) is
  'ADR-0580 (act. 2026-11-17): la medida de un avío dicha en palabras («1.5 cm», «11.4 mm», «título 40»). IMMUTABLE: la usan el disparador de los colores y las lecturas.';
revoke all on function retail.fn_medida_texto(numeric, text) from public, anon, authenticated;

-- ---------- 4. El candado de la columna: sin líneas ----------
alter table retail.materiales drop constraint if exists materiales_medida_conocida;
alter table retail.materiales add constraint materiales_medida_conocida
  check (medida_unidad is null or medida_unidad in ('milimetro', 'centimetro', 'titulo'));

-- ---------- 5. La nota de la clase «Botón» (solo si nadie la editó) ----------
update retail.avio_clases
   set nota = 'Se mide en centímetros: por ejemplo, 1.5 cm.'
 where prefijo = 'BOT' and nota = 'Se mide en líneas (L), siempre: 18 L ≈ 11,4 mm.';
