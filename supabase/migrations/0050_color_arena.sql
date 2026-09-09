-- ============================================================================
-- 0050 — Arena entra al vocabulario de colores
--
-- POR QUÉ
--   Al pegar `0046_colores.sql` en producción, 5 de las 19 variantes quedaron
--   sin `color_id`. Mirándolas una por una resultaron ser dos casos distintos:
--
--     · "Arena" ×3 — Short Sastre S/M/L, del taller (SKU `T2a77…`), sin precio
--       y sin stock. **Es un color real del catálogo de CAYLA** y faltaba en los
--       29 aprobados. Se agrega acá.
--     · "azul " ×2 — los SKU `A` y `B` de la unificación, con 99 y 98 unidades
--       fantasma en piso. NO es un problema de color: es data de prueba con
--       stock inventado. Decisión de Felipe (2026-09-09): **no se toca**, la
--       corrige el censo contándolas en 0, que deja el movimiento de ajuste que
--       lo explica en vez de un borrado silencioso (principio 4).
--
-- POR QUÉ 'tierra' Y NO 'neutro'
--   Arena vive entre Beige (#D8C7AE, neutro) y Camel (#B08453, tierra): es un
--   arena cálido, más saturado que un beige. Va con los tierra.
--
-- LO QUE HACE, Y POR QUÉ ES GENÉRICO
--   Después del insert repite las dos operaciones de resolución que ya trae
--   `0046` y `0047`, sin nombrar ninguna variante en particular:
--     1. resolver `color_id` de lo que ahora sí calza por clave normalizada;
--     2. asignar código corto a lo que quedó desbloqueado.
--   Escrito así, este archivo es la plantilla para cada color que se agregue de
--   acá en adelante: cambia el `insert` y lo demás queda igual.
-- ============================================================================

insert into colores (codigo, nombre, familia_color, hex, orden)
  values ('ARN', 'Arena', 'tierra', '#C9B79C', 73)
  on conflict (codigo) do nothing;

-- 1. Resolver el color de lo que ahora calza (misma consulta que el backfill de 0046).
update variantes v set color_id = c.codigo
from colores c
where v.color_id is null and fn_clave_texto(v.color) = fn_clave_texto(c.nombre);

-- 2. Darle código corto a lo que quedó desbloqueado. `fn_asignar_codigo_variante`
--    es idempotente (no renumera lo que ya tiene código) y registra el código en
--    `codigos_barras`, así que estas prendas quedan escaneables en el mismo acto.
do $$ declare r record; begin
  for r in select id from variantes where codigo is null order by created_at, id loop
    perform fn_asignar_codigo_variante(r.id);
  end loop;
end $$;
