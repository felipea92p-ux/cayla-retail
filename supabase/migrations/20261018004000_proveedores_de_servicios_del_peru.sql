-- ============================================================================
-- Los 9 proveedores de servicios básicos que casi toda tienda del Perú paga todos los meses (ADR-0452, Felipe 2026-10-18)
--
-- POR QUÉ. El combo de proveedor de un gasto fijo ya no mezcla la mercadería: ofrece solo los proveedores con el rubro «Gastos»
-- (los que nacen al sumar uno desde Gastos, `registrar_proveedor_de_gasto`). En producción eran 3 de 95. Felipe pidió que el
-- resto los vaya agregando él, y que yo sembrara los 9 principales del país: luz y agua de Lima, Trujillo y Arequipa, y las dos
-- telefónicas que dan internet.
--
-- QUÉ HACE. (1) Inserta los 9 con el rubro «Gastos», salvo uno cuyo RUC o cuyo nombre ya exista. (2) A uno que ya existía con el
-- mismo RUC solo le SUMA el rubro «Gastos» (no cambia su nombre ni nada más), para que aparezca en ese combo. No borra ni
-- reemplaza nada. Se puede pegar dos veces.
--
-- DE DÓNDE SALEN LOS DATOS (2026-10-18, sin acceso a la Consulta RUC de SUNAT desde la nube): cada RUC está citado por al menos
-- dos fuentes públicas (Osinergmin, SMV, Contraloría, FONAFE, SUNAT, políticas de privacidad de la propia empresa) y los 11
-- dígitos pasan la verificación módulo 11 de SUNAT. NO es lo mismo que haberlos mirado en la Consulta RUC: ANTES DE PEGAR,
-- búscalos ahí (9 búsquedas). Si uno no calza, cámbialo aquí: el RUC es único en `proveedores` y un RUC equivocado impediría
-- sumar después al proveedor correcto.
--   · Pluz Energía Perú S.A.A. es la antigua Enel Distribución Perú S.A.A. (cambio de nombre en 2024; mismo RUC).
--   · Integratel Perú S.A.A. es la antigua Telefónica del Perú S.A.A., la de Movistar (cambio de nombre en 2025; mismo RUC). SUNAT
--     podría aún mostrar el nombre anterior: el RUC es el mismo.
--   · América Móvil Perú S.A.C. es Claro.
--
-- CÓMO SE PEGA EN PRODUCCIÓN. Sola, tal cual, sin orden respecto a 20261018003000. Solo datos de `proveedores`: sin políticas, sin
-- `alter`, sin `drop trigger`. `lock_timeout` de 3 s. La última línea dice «QUEDÓ BIEN» y cuántos de los 9 quedaron en la lista.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

insert into retail.proveedores (nombre, ruc, rubros)
select v.nombre, v.ruc, array['Gastos']
  from (values
    ('Luz del Sur S.A.A.',                                   '20331898008'),
    ('Pluz Energía Perú S.A.A. (antes Enel)',                '20269985900'),
    ('Hidrandina S.A.',                                      '20132023540'),
    ('SEAL · Sociedad Eléctrica del Sur Oeste S.A.',         '20100188628'),
    ('SEDAPAL · Servicio de Agua Potable y Alcantarillado de Lima', '20100152356'),
    ('SEDALIB S.A.',                                         '20131911310'),
    ('SEDAPAR S.A.',                                         '20100211034'),
    ('Integratel Perú S.A.A. (antes Telefónica · Movistar)', '20100017491'),
    ('América Móvil Perú S.A.C. (Claro)',                    '20467534026')
  ) as v(nombre, ruc)
 where not exists (
   select 1 from retail.proveedores p
    where p.ruc = v.ruc or retail.fn_clave_texto(p.nombre) = retail.fn_clave_texto(v.nombre)
 );

-- El que ya existía con el mismo RUC: solo se le suma el rubro.
update retail.proveedores p
   set rubros = retail.fn_rubros_limpios(p.rubros || array['Gastos'])
 where p.ruc in ('20331898008', '20269985900', '20132023540', '20100188628', '20100152356', '20131911310', '20100211034', '20100017491', '20467534026')
   and not ('Gastos' = any (p.rubros));

-- ¿SE PEGÓ ENTERO? Esta es la ÚLTIMA instrucción del archivo. Si no ves «QUEDÓ BIEN», es seguro volver a pegarlo completo.
select '20261018004000 · proveedores de servicios del Perú' as parte,
       count(*) || ' de 9 en la lista de gastos' as en_la_lista,
       case when count(*) = 9 then 'QUEDÓ BIEN' else 'REVISAR: faltan ' || (9 - count(*)) end as resultado
  from retail.proveedores
 where 'Gastos' = any (rubros)
   and ruc in ('20331898008', '20269985900', '20132023540', '20100188628', '20100152356', '20131911310', '20100211034', '20100017491', '20467534026');
