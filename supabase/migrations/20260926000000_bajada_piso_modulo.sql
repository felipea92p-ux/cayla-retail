-- ============================================================================
-- 20260926000000_bajada_piso_modulo.sql — CAYLA V2 · ADR-0208 «Frescura del piso», paso 1 · PARTE 1 de 5
--
-- EL PROBLEMA PRIMERO. Los datos de Frescura solo valen si la bajada al piso se registra AL COLGAR la prenda y no al
-- cobrarla. Hoy la única bajada es el modal «Reponer» de Existencias: una prenda por vez, y para usarlo hay que tener
-- TODO Existencias (consultar stock, ajustar, apartar). Quien sube un fardo al piso no tiene cómo registrarlo rápido, y
-- darle Existencias para eso le abre el ajuste de stock.
--
-- QUÉ HACE. Da de alta el módulo «Bajada al piso» en el catálogo (regla ADR-0161 «Módulos y roles»):
--   · orden 85: entre Existencias (80) y Conteos (90), igual que en el menú.
--   · delegable = true: `bajar_al_piso` (PARTE 3) no exige `fn_es_lider()`; pide el módulo y que la cuenta opere la tienda.
--   · NO asigna el módulo a ningún rol: nace sin rol, solo lo ve el líder hasta que él lo encienda en Colaboradores ▸
--     Roles y accesos. Tampoco lo implica Existencias: «Reponer» sigue igual para quien ya lo usa, nadie pierde nada.
--   · Corrige el texto de Existencias, que omitía «reponer el piso» aunque el botón existe (mismo orden 80, false, true).
--
-- ORDEN AL PEGAR (cinco partes, cada una sola en el SQL Editor; archivos 20260926000000 a 20260926000400):
--   0000 módulo → 0100 tablas → 0200 funciones de escritura → 0300 lectura de Frescura → publicar la web → 0400
--   («Reposición» ya no toca el piso). La 0400 va DESPUÉS de la web porque su mensaje manda al botón «Bajar al piso» de
--   Existencias, que recién existe con la web publicada.
-- ESTA es la 0000: si la web sale antes, Roles y accesos pinta un módulo que la base no conoce y encenderlo falla por
-- la llave foránea de `rol_modulos`.
--
-- Producción: pegar tal cual en el SQL Editor de cayla-dynamic (ya trae `retail.`). Sin políticas ni `alter` de tablas
-- en uso: no aplica el bloqueo mutuo de ADR-0195. Re-ejecutable.
--
-- SE ROMPE SI alguien asigna este módulo a un rol desde una migración (lo prohíbe `lib/modulos.test.ts`) o si el orden
-- de acá deja de coincidir con `CLAVES_MODULO` de `apps/web/lib/modulos.ts`.
-- ============================================================================

set search_path = retail, public, extensions;

insert into retail.modulos (clave, grupo, nombre, incluye, orden, solo_lider, delegable) values
  ('bajada_piso', 'Inventario', 'Bajada al piso', 'Bajar al piso las prendas del almacén de su tienda, escaneándolas y confirmando de una vez', 85, false, true),
  ('existencias', 'Inventario', 'Existencias', 'Consultar stock, reponer el piso, ajustar stock, apartar prendas', 80, false, true)
on conflict (clave) do update set
  grupo = excluded.grupo, nombre = excluded.nombre, incluye = excluded.incluye, orden = excluded.orden,
  solo_lider = excluded.solo_lider, delegable = excluded.delegable;
