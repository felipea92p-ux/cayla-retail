-- ============================================================================
-- 20261022225000_compras_simple_modulos.sql — CAYLA V2 · ADR-0480 (Compras simple), actividad 1
-- El menú de Compras pasa de 7 a 6 opciones: «Mi plata para compras» y «Revisar compras» toman el lugar de «Órdenes de
-- compra» y «Fondos por rendir», y «Notas de crédito» se retira.
--
-- EL PROBLEMA PRIMERO. El 2026-10-22 producción tenía 0 órdenes de compra, 0 fondos por rendir y 0 notas de crédito, y
-- 3 065 prendas habían entrado por carga inicial con el costo escrito a mano: Compras estaba construido y nadie lo usaba.
-- Felipe aprobó una maqueta (docs/maquetas/compras-simple-2026-10/) donde la compra nace en el celular de quien compra.
--
-- QUÉ HACE.
--   · `ordenes_compra` SE REUSA como «Mi plata para compras». Unas 40 funciones de la base usan esa clave como llave
--     de permiso: no solo las de órdenes, también recibir, gastos del viaje, datos bancarios del proveedor, registrar un
--     proveedor nuevo y «Nos debe». Retirarla cambiaría en silencio quién puede qué; reusarla deja todas igual, y quien
--     hoy compra (el rol «Compras», 1 persona el 2026-10-22) sigue pudiendo. Solo cambia lo que se ve: nombre e «incluye».
--   · `fondos` se llama «Revisar compras»: la oficina confirma la plata que anotaron las compradoras y completa las compras.
--   · `notas_credito` SE RETIRA (Felipe: «por ahora no manejaremos notas de crédito»). Como en ADR-0306, se quitan sus
--     asignaciones de rol (configuración, no historia) y la fila del catálogo. No le quita a nadie ver el dinero de
--     Compras: `fn_puede_ver_dinero_de_compras()` y `fn_puede_registrar_compras()` piden CUALQUIERA de facturas_compra,
--     por_pagar o notas_credito, y los dos roles que tenían notas (Compras y Terminal Almacén) tienen también las otras.
--     `fn_puede_registrar_notas_credito()` queda solo del líder. Las tablas y funciones de notas NO se tocan.
--
-- ESTADO QUE DEJA DE SER POSIBLE: que alguien vea «Notas de crédito» en Roles y accesos sin una pantalla detrás.
-- NUNCA BORRA HISTORIA: `actividad` y `roles.pantalla_principal` referencian `modulos`; si alguna fila nombra
-- `notas_credito`, la migración se detiene antes de borrar (el 2026-10-22 había 0 en ambas).
--
-- CÓMO SE PEGA EN PRODUCCIÓN: tal cual en el SQL Editor, DESPUÉS de publicar la web de este cambio (si no, el menú de hoy
-- busca «Notas de crédito»). Sin políticas ni `alter` de tablas: ADR-0195 no aplica. Re-pegable.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

update retail.modulos
   set nombre = 'Mi plata para compras',
       incluye = 'En el celular: anotar la plata que te dieron para comprar, lo que compraste (proveedor, prendas, la boleta con foto) y otros gastos; mandar lo comprado a cada tienda y terminar el día'
 where clave = 'ordenes_compra';

update retail.modulos
   set nombre = 'Revisar compras',
       incluye = 'Confirmar la plata que anotaron las compradoras, completar las compras que llegaron a la tienda (serie y número de la boleta o factura, y qué hacer si algo no cuadró) y ver los cierres del día'
 where clave = 'fondos';

do $$
begin
  if exists (select 1 from retail.actividad where modulo = 'notas_credito')
     or exists (select 1 from retail.roles where pantalla_principal = 'notas_credito') then
    raise exception 'notas_credito tiene historia (actividad o pantalla principal de un rol): no se retira' using errcode = 'P0001';
  end if;
end $$;

delete from retail.lider_modulos_ocultos where modulo = 'notas_credito';
delete from retail.rol_modulos where modulo in ('notas_credito');
delete from retail.modulos where clave in ('notas_credito');
