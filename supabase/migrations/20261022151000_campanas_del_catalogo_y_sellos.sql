-- ============================================================================
-- Catálogo ▸ Campañas, y las etiquetas de prenda pasan a llamarse «Sellos» (ADR-0473, Felipe 2026-10-22).
--
-- EL PROBLEMA: «Etiquetas», dentro de Catálogo ▸ Atributos, se confundía con las etiquetas de precio que se imprimen, y
--   las campañas (San Valentín, Halloween, Navidad: fechas y descuento) vivían metidas en un vocabulario de la prenda.
-- LO QUE HACE:
--   1. El módulo `campanas` («Campañas») vive en el grupo Catálogo: es la entrada del menú donde se arman las campañas.
--      En producción ya existe (PR #1190, `20261017151000`, en el grupo Tienda web, orden 67, con un rol): aquí solo se muda
--      de grupo y de lugar y se reescribe lo que incluye. En una base sin #1190 (local, CI) nace sin rol (ADR-0161).
--   2. El módulo `etiquetas` se sigue llamando así en la base (su clave no se renombra), pero en pantalla dice «Sellos».
-- QUIÉN GUARDA UNA CAMPAÑA no se decide aquí: es `fn_puede_campanas()` (líder, `campanas`, `campanas_web` o `etiquetas`,
--   Felipe 2026-10-22: «que se pueda editar desde ambos módulos»), en la migración de la sesión que unifica los módulos de
--   campañas. Esta migración no toca ninguna función.
-- DESCARTÉ: un módulo nuevo `campanas_catalogo`: `campanas` ya está cableado en producción a las 13 funciones que crean,
--   configuran y etiquetan una campaña; un tercero obligaba a sumarlo en todas (Felipe eligió reusar `campanas`).
-- CÓMO SE PEGA: este archivo tal cual en el SQL Editor de producción. Idempotente. `lock_timeout` 3 s. Sin políticas ni
--   `drop trigger`. NO escribe en `rol_modulos`: los roles que ya tienen `campanas` lo conservan.
-- CAÍDA EXTERNA. Nada llama a la red.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. Campañas, en Catálogo ----------
insert into retail.modulos (clave, grupo, nombre, incluye, orden, solo_lider, delegable) values
  ('campanas', 'Catálogo', 'Campañas',
   'Crear y archivar campañas (San Valentín, Halloween, Navidad…), elegir sus fechas, su descuento, sus prendas y las categorías donde rige, repetirlas el año siguiente e imprimir sus etiquetas de precio',
   142, false, true)
on conflict (clave) do update
  set grupo = excluded.grupo, nombre = excluded.nombre, incluye = excluded.incluye, orden = excluded.orden;

-- ---------- 2. «Etiquetas» se llama «Sellos» en Roles y accesos ----------
update retail.modulos
   set nombre = 'Sellos',
       incluye = 'Crear, editar, aprobar y archivar los sellos de las prendas (Nuevo, Top ventas, Hecho a mano…), con descuento o sin él, y ponérselos a las prendas'
 where clave = 'etiquetas'
   and nombre is distinct from 'Sellos';
