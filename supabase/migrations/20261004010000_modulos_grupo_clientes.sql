-- ============================================================================
-- 20261004010000_modulos_grupo_clientes.sql — Roles y accesos: grupo propio «Clientes» (Felipe, 2026-10-03)
--
-- En el menú izquierdo, Clientes es un grupo propio desde D-92 (Fichas y Avisos), pero en Roles y accesos sus dos
-- módulos seguían bajo «Ventas»: D-92 pidió el grupo del MENÚ y no se recategorizó el módulo, y `avisos_club`
-- (20261001210500) copió ese grupo. Felipe: «debería tener su propio apartado que diga Clientes y dentro esté Fichas
-- y Avisos». Aquí `clientas` y `avisos_club` pasan al grupo «Clientes».
--
-- El módulo `clientas` se llama «Fichas de clientes» y no «Fichas» a secas: su nombre también sale FUERA de su grupo
-- (mensajes de error de roles en `fn_*`, la anotación de Actividad «puso «…» como pantalla principal», el combo de
-- pantalla principal), y ahí un «Fichas» suelto no dice de qué. `avisos_club` ya se llamaba «Avisos del club».
--
-- Solo cambia cómo se agrupa y se rotula la lista: claves, orden, delegable y quién ve qué quedan iguales (ningún rol
-- gana ni pierde un módulo). `grupo` es texto libre (sin check). Producción: un `update` de dos filas de `modulos`,
-- sin `alter` ni políticas: se pega entera; pegarla dos veces no cambia nada.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

update retail.modulos set grupo = 'Clientes' where clave in ('clientas', 'avisos_club');
update retail.modulos set nombre = 'Fichas de clientes' where clave = 'clientas';

reset lock_timeout;
notify pgrst, 'reload schema';
