-- ============================================================================
-- SQL PENDIENTE DE PRODUCCIÓN · 2026-09-16 · Loro (módulo 02) · antes del censo
--
-- Medido contra producción (proyecto cayla-dynamic, schema retail) el 2026-09-16:
--   · 37 variantes; 36 sin código ni código de barras. Las 36 son de los 6
--     productos de prueba (datos-prueba-catalogo-produccion.sql). La variante
--     restante es el "Cargo especial" del POS, que ya tiene GEN-0001.
--   · 0 pares de variantes que choquen con la regla nueva de identidad.
--   · "Polos" (categoría de los datos de prueba) no tiene prefijo ni familia; la
--     del vocabulario es "Polos/Camisetas" (POL). Su único producto es POL-001.
--   · Arena es ARE (prefijo de Aretes) en vez de ARN, y Negro, Blanco, Beige,
--     Rojo y Azul Marino no tienen familia de color.
--
-- Cómo pegar: en el SQL Editor de producción, UN bloque por vez y en orden.
-- Todos los bloques son repetibles: pegar dos veces no falla ni duplica nada.
-- Nada se borra: los productos de prueba quedan descontinuados con su
-- historial, sus 13 salidas y sus 5 ventas intactos.
-- ============================================================================


-- ---------- 0. PRE-FLIGHT — tiene que devolver duplicados = 0 ----------
-- Si devuelve más de 0, NO sigas: cada par se fusiona con movimientos de
-- ajuste (decisión 2026-09-16), nunca borrando.
select count(*) as duplicados
from (
  select 1 from retail.variantes
  group by producto_id, retail.fn_token_talla(talla), color_codigo
  having count(*) > 1
) d;


-- ---------- 1. Archivar los 6 productos de prueba ----------
-- El sistema no tiene estado "archivado": un producto está activo o
-- descontinuado, y lo que oculta la prenda de caja, catálogo y conteo es
-- variantes.activo. Van por ID, no por referencia, para no tocar nunca una
-- prenda real que algún día se llame "BLU-001".
begin;
update retail.productos set estado = 'descontinuado'
where id in (
  'a292599f-58ba-4555-baa6-1df314606cc1', -- BLU-001 Blusa Valentina
  'b2b3db8a-b7f1-45c7-b4bf-05f7ad1a1ad3', -- PAN-001 Pantalón Palazzo
  '49e93952-99fa-42dd-95d1-ddf212feca7a', -- VES-001 Vestido Camila
  '1c7428fd-663b-4fa3-8808-9c3ab021b863', -- POL-001 Polo Básico
  'cc3a39bb-3147-4b52-9815-92afeba12112', -- CHO-001 Chompa Oversize
  'd8df06b2-7254-4fa3-95d1-e502b8b6de46'  -- FAL-001 Falda Midi
);
update retail.variantes set activo = false
where activo and producto_id in (
  'a292599f-58ba-4555-baa6-1df314606cc1',
  'b2b3db8a-b7f1-45c7-b4bf-05f7ad1a1ad3',
  '49e93952-99fa-42dd-95d1-ddf212feca7a',
  '1c7428fd-663b-4fa3-8808-9c3ab021b863',
  'cc3a39bb-3147-4b52-9815-92afeba12112',
  'd8df06b2-7254-4fa3-95d1-e502b8b6de46'
);
-- "Polos" quedó fuera del vocabulario (sin prefijo): se apaga para que nadie
-- cargue ahí una prenda real, cuyo código saldría GEN-000N en vez de POL-000N.
update retail.categorias set activo = false
where id = '1a7a0f31-cea0-42cd-8528-34614f73fe4a';
commit;


-- ---------- 1b. Colores de producción iguales a los del repo ----------
-- Los datos de prueba crearon 6 colores ANTES del vocabulario cerrado, y el
-- vocabulario no los pisó (`on conflict do nothing`):
--   · Arena quedó como ARE, que es también el prefijo de Aretes: una etiqueta
--     ARE-0001-ARE-U se lee "Aretes 1, Arena". El código de un color no se
--     cambia (lo usan variantes y etiquetas), así que ARE se retira y Arena
--     real nace como ARN, igual que en el repo. Las 6 variantes con ARE son de
--     prueba y ya quedaron apagadas en el bloque 1.
--   · Negro, Blanco, Beige, Rojo y Azul Marino no tienen familia: cualquier
--     reporte por familia de color deja fuera justo los colores más vendidos.
-- Tiene que ir ANTES de cargar el catálogo real: después, ARE ya estaría
-- impreso en etiquetas.
begin;
update retail.colores set nombre = 'Arena (retirado)', activo = false
where codigo = 'ARE' and nombre <> 'Arena (retirado)';
insert into retail.colores (codigo, nombre, familia_color, hex, orden, tipo)
values ('ARN', 'Arena', 'tierra', '#C9B79C', 15, 'solido')
on conflict (codigo) do nothing;
update retail.colores c set familia_color = v.familia, orden = v.orden, nombre = v.nombre
from (values
  ('NEG', 'Negro',       'neutro', 10),
  ('BLA', 'Blanco',      'neutro', 11),
  ('BEI', 'Beige',       'neutro', 14),
  ('AZM', 'Azul marino', 'azul',   20),
  ('ROJ', 'Rojo',        'rojo',   30)
) as v(codigo, nombre, familia, orden)
where c.codigo = v.codigo and c.familia_color is null;
commit;


-- ---------- 2. Migración 20260916190000_variantes_identidad_unica ----------
begin;
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

insert into supabase_migrations.schema_migrations (version, name)
values ('20260916190000', 'variantes_identidad_unica')
on conflict (version) do nothing;
commit;


-- ---------- 3. COMPROBACIÓN — lo esperado está a la derecha de cada columna ----------
select
  (select count(*) from retail.variantes where activo and codigo is null)             as activas_sin_codigo,         -- 0
  (select count(*) from retail.variantes v where activo
     and not exists (select 1 from retail.codigos_barras cb where cb.variante_id = v.id)) as activas_sin_codigo_barras, -- 0
  (select count(*) from retail.productos where estado = 'descontinuado')              as productos_descontinuados,   -- 6
  (select count(*) from pg_indexes where schemaname = 'retail'
     and indexname = 'variantes_identidad_unica')                                     as regla_nueva,                -- 1
  (select count(*) from pg_constraint
     where conname = 'variantes_producto_id_talla_color_codigo_key')                  as regla_vieja,                -- 0
  (select count(*) from retail.colores where activo and familia_color is null)        as colores_sin_familia,        -- 0
  (select string_agg(codigo, ',') from retail.colores where activo
     and retail.fn_clave_texto(nombre) = 'arena')                                            as arena_activa;               -- ARN
