-- ============================================================================
-- Catálogo ▸ Campañas, y las etiquetas de prenda pasan a llamarse «Sellos» (ADR-0473, Felipe 2026-10-22).
--
-- EL PROBLEMA: «Etiquetas», dentro de Catálogo ▸ Atributos, se confundía con las etiquetas de precio que se imprimen, y
--   las campañas (San Valentín, Halloween, Navidad: fechas y descuento) vivían metidas en un vocabulario de la prenda.
-- LO QUE HACE:
--   1. Un módulo nuevo, `campanas_catalogo` («Campañas», grupo Catálogo): la entrada del menú donde se arman las
--      campañas. Nace SIN rol (ADR-0161) y delegable.
--   2. El módulo `etiquetas` se sigue llamando así en la base (su clave no se renombra), pero en pantalla dice «Sellos».
--   3. `fn_puede_editar_etiquetas()` acepta también el módulo nuevo. Una campaña ES una fila de `etiquetas` (estilo
--      `campana`): sin esto, quien recibe Campañas vería la pantalla y la base le rechazaría cada guardado. La tabla y las
--      funciones que guardan no cambian: solo cambia quién entra.
-- DESCARTÉ: separar la base por estilo (Sellos solo toca lo que no es campaña, Campañas solo lo que sí): obligaba a tocar
--   todas las funciones que crean, aprueban, configuran y ponen etiquetas, varias de ellas leídas por la caja. Quien ve uno
--   de los dos módulos ya podía todo eso hasta hoy (con `etiquetas`); nadie gana un permiso que no tenía. La pantalla es
--   la que separa.
-- DESCARTÉ: la clave `campanas`: ya existe en producción (Tienda web, PR #1190) y es otra cosa.
-- CÓMO SE PEGA: este archivo tal cual en el SQL Editor de producción. Idempotente. `lock_timeout` 3 s. Sin políticas ni
--   `drop trigger`. NO escribe en `rol_modulos`: el módulo nace sin rol.
-- CAÍDA EXTERNA. Nada llama a la red.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. El módulo ----------
insert into retail.modulos (clave, grupo, nombre, incluye, orden, solo_lider, delegable) values
  ('campanas_catalogo', 'Catálogo', 'Campañas',
   'Crear y archivar campañas (San Valentín, Halloween, Navidad…), elegir sus fechas, su descuento y las categorías donde rige, repetirlas el año siguiente e imprimir sus etiquetas de precio',
   142, false, true)
on conflict (clave) do nothing;

-- ---------- 2. «Etiquetas» se llama «Sellos» en Roles y accesos ----------
update retail.modulos
   set nombre = 'Sellos',
       incluye = 'Crear, editar, aprobar y archivar los sellos de las prendas (Nuevo, Top ventas, Hecho a mano…), con descuento o sin él, y ponérselos a las prendas'
 where clave = 'etiquetas'
   and nombre is distinct from 'Sellos';

-- ---------- 3. Quien ve Campañas también guarda ----------
create or replace function retail.fn_puede_editar_etiquetas() returns boolean
language sql stable set search_path = retail, public, extensions
as $$ select retail.fn_es_lider() or retail.fn_capacidad_por_modulos(array['etiquetas', 'campanas_catalogo']); $$;

comment on function retail.fn_puede_editar_etiquetas() is
  'Líder, o un rol que ve Sellos (`etiquetas`) o Campañas (`campanas_catalogo`) (ADR-0161, ADR-0293, ADR-0473). Crear, editar, aprobar y archivar etiquetas, con descuento o sin él; configurar su campaña; etiquetar prendas con ellas. Una campaña es una fila de `etiquetas` con estilo `campana`.';
