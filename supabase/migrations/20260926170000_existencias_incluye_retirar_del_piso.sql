-- ============================================================================
-- 20260926170000_existencias_incluye_retirar_del_piso.sql — CAYLA V2 · ADR-0208 «Frescura del piso», revisión del bloque 2
--
-- EL PROBLEMA PRIMERO. Desde el bloque 2 (#440), quien ve el módulo Existencias también saca prendas del piso al
-- almacén («Retirar del piso», en el menú «⋯» de cada talla). Por ADR-0161 quien ve un módulo hace todo lo que hay en
-- él, y el líder decide a quién dárselo leyendo su descripción en Colaboradores ▸ Roles y accesos. Esa descripción
-- seguía diciendo «Consultar stock, reponer el piso, ajustar stock, apartar prendas»: el retiro entró al módulo (y a
-- las terminales de ventas, que lo ven) sin que el texto lo dijera.
--
-- QUÉ HACE. Solo corrige `incluye` de 'existencias': «Consultar stock, reponer y retirar del piso, ajustar stock,
-- apartar prendas». El mismo texto vive en `apps/web/lib/modulos.ts`. No toca permisos, roles ni el resto de la fila
-- (grupo, orden 80, solo_lider, delegable): nadie gana ni pierde nada, solo se nombra lo que ya había. Un `update` y
-- no un upsert, para no pisar esos otros campos si alguien los cambia después y vuelve a pegar esto.
--
-- Producción: pegar tal cual en el SQL Editor de cayla-dynamic (ya trae `retail.`), DESPUÉS de la 20260926000000
-- (cuyo upsert escribe el texto viejo). Sin políticas ni `alter` de tablas en uso: no aplica el bloqueo mutuo de
-- ADR-0195. Re-ejecutable: pegarla dos veces deja lo mismo.
--
-- SE ROMPE SI alguien pega (o vuelve a pegar) la 20260926000000 después de esta: repone «reponer el piso» en la base
-- (Roles y accesos no cambia, lee lib/modulos.ts; se desalinean la base y el diccionario); se arregla pegando esta otra vez. O si Existencias suma otra acción y nadie corrige este
-- texto y el de `lib/modulos.ts`.
-- ============================================================================

set search_path = retail, public, extensions;

update retail.modulos
   set incluye = 'Consultar stock, reponer y retirar del piso, ajustar stock, apartar prendas'
 where clave = 'existencias';
