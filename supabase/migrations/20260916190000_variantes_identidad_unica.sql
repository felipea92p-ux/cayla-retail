-- ============================================================================
-- 20260916190000_variantes_identidad_unica.sql — CAYLA V2 · módulo 02 (Loro)
--
-- EL PROBLEMA
--   La regla que impedía crear dos veces la misma prenda era
--   `unique (producto_id, talla, color_codigo)`, y tenía dos agujeros:
--   1. Compara la talla como texto exacto: "M", "m" y "M " pasaban como tres
--      variantes distintas del mismo modelo y color. Cada una con su stock, su
--      código y su etiqueta; el conteo de esa talla nunca cuadra.
--   2. En Postgres dos NULL no son iguales, así que dos variantes SIN color con
--      la misma talla (una correa, un gorro) no chocaban nunca.
--
-- LA REGLA NUEVA
--   Una variante = producto + talla normalizada + color. La talla se normaliza
--   con fn_token_talla, la MISMA función que arma el código impreso: "M", "m "
--   y "M" dan M; "Única", "U" y vacío dan U; "S/M" y "SM" dan SM. Si la
--   identidad usara otra normalización, "Única" y "U" pasarían esta regla y
--   reventarían después contra variantes_codigo_unico con un error crudo.
--   `nulls not distinct` hace que "sin color" cuente como un color más.
--   Se reemplaza la regla vieja en vez de convivir con ella: la nueva es
--   estrictamente más fuerte y ninguna función usa la vieja en un `on conflict`.
--
-- LA RED DE CÓDIGOS
--   El disparador `variantes_asignar_codigo` (20260912235500) le da código y
--   código de barras a toda variante nueva. Las que nacieron antes quedaron
--   sin nada y la pistola no las encuentra. Esto rellena solo las ACTIVAS: una
--   variante apagada no se vende ni se cuenta, y gastarle el correlativo
--   (BLU-0001) haría que la primera blusa real salga BLU-0002. Repetible: una
--   variante que ya tiene código se salta.
--
-- Antes de aplicar en producción, el pre-flight de
-- docs/datos/SQL-PENDIENTE-PRODUCCION-2026-09-16-loro.sql tiene que dar 0.
-- ============================================================================

alter table retail.variantes
  drop constraint if exists variantes_producto_id_talla_color_codigo_key;

create unique index if not exists variantes_identidad_unica
  on retail.variantes (producto_id, retail.fn_token_talla(talla), color_codigo)
  nulls not distinct;

comment on index retail.variantes_identidad_unica is
  'Una prenda = producto + talla (fn_token_talla, igual que el código impreso) + color. "M"/"m " y "Única"/"U" son la misma talla; dos variantes sin color con la misma talla chocan.';

do $$
declare v_id uuid;
begin
  for v_id in
    select id from retail.variantes
    where codigo is null and activo
    order by created_at
  loop
    perform retail.fn_asignar_codigo_variante(v_id);
  end loop;
end $$;
