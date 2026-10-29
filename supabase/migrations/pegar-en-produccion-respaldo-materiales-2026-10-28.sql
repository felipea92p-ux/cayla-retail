-- ============================================================================
-- pegar-en-produccion-respaldo-materiales-2026-10-28.sql — «una tela con sus colores» (ADR-0554): la foto de HOY, antes de que alguien edite nada
-- SCRIPT DE UNA SOLA VEZ (no es una migración: no tiene versión, no entra al CI de migraciones). Solo AGREGA filas al respaldo de siempre; no toca `retail`.
--
-- EL PROBLEMA PRIMERO. El 28-oct la PARTE 1 de 20261028175000 convirtió el insumo suelto `MM-01` («Milano Melange») en la tela `MM-01` con su color Arena
-- (`MM-01-ARN`, «Milano Melange · Arena»). El nombre y el código ORIGINALES del insumo quedaron solo en la fila de la tela (`retail.materiales`), que es editable
-- (y desde 20261028203000, con «Editar tela», lo será por pantalla). Si mañana alguien corrige el nombre de esa tela, ya no hay forma de saber cómo era antes.
-- Esta foto guarda las dos filas tal como están HOY.
--
-- QUÉ HACE. Copia cada tela y cada insumo que cuelga de una tela a `respaldo_purgas.filas` (la tabla donde el repo guarda lo que respalda, ADR-0224 y ADR-0252),
-- bajo la purga «estado-tras-conversion-2026-10-28». No cambia ninguna fila de `retail`. Si la purga ya existe, no la repite (volver a pegarlo no hace nada).
--
-- CUÁNDO. AHORA: antes de pegar 20261028203000 y antes de publicar la web con «Editar tela». Es lo único que tiene fecha de vencimiento: mientras la sonda diga una sola tela y
-- ninguna creada por la web, la foto es la del conversor.
-- PRODUCCIÓN. Una sola parte, sin `alter`, sin políticas, sin `select … into` (ADR-0195, ADR-0288). Lo que devuelve el último `select` es el conteo: 1 tela y 1 insumo hoy.
-- ============================================================================

insert into respaldo_purgas.filas (purga, tabla, fila)
select 'estado-tras-conversion-2026-10-28', 'materiales', to_jsonb(m)
  from retail.materiales m
 where not exists (select 1 from respaldo_purgas.filas b where b.purga = 'estado-tras-conversion-2026-10-28' and b.tabla = 'materiales');

insert into respaldo_purgas.filas (purga, tabla, fila)
select 'estado-tras-conversion-2026-10-28', 'insumos', to_jsonb(i)
  from retail.insumos i
 where i.material_id is not null
   and not exists (select 1 from respaldo_purgas.filas b where b.purga = 'estado-tras-conversion-2026-10-28' and b.tabla = 'insumos');

select tabla, count(*) as filas, min(respaldado_at) as respaldado
  from respaldo_purgas.filas
 where purga = 'estado-tras-conversion-2026-10-28'
 group by tabla
 order by tabla;
