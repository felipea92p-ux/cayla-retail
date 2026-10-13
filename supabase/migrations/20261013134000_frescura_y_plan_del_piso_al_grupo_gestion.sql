-- ADR-0392 (Felipe, 2026-10-13): «Gestión» es un grupo de primer nivel del lateral, debajo de Inicio, con Análisis, Frescura del
-- piso, Plan del piso y Rendimiento. Frescura y Plan nacieron archivados en el grupo «Inventario» de Roles y accesos (20260929100000 y
-- 20261006100000); desde hoy el lateral los muestra en «Gestión», y Roles y accesos tiene que contar la misma historia: pasan al grupo
-- «Gestión», justo después de Análisis (orden 210 → 212 y 214; Colaboradores sigue en 220). Roles y accesos NO cambia de lugar su grupo:
-- «Gestión» sigue después de Producción (es el segundo desvío escrito frente al lateral, igual que Producción; ver `lib/menu.ts`).
--
-- Solo dos filas de `retail.modulos`: sin `alter`, sin políticas, sin `rol_modulos` (nadie gana ni pierde un módulo; ADR-0161). Se pega
-- sola en el SQL Editor, a cualquier hora; idempotente. La web la espeja en `apps/web/lib/modulos.ts` (`lib/modulos.test.ts` compara las
-- claves y el orden contra TODAS las migraciones, esta incluida).
set lock_timeout = '3s';

update retail.modulos set grupo = 'Gestión', orden = 212 where clave = 'frescura' and (grupo <> 'Gestión' or orden <> 212);
update retail.modulos set grupo = 'Gestión', orden = 214 where clave = 'plan_piso' and (grupo <> 'Gestión' or orden <> 214);

-- Comprobación (solo lectura):
--   select clave, grupo, orden from retail.modulos where clave in ('analisis', 'frescura', 'plan_piso', 'colaboradores') order by orden;
--   → analisis 210 · frescura 212 · plan_piso 214 · colaboradores 220, los tres últimos en «Gestión».
