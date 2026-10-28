-- ============================================================================
-- Entel Perú entra a la lista de proveedores de Gastos (ADR-0452, Felipe 2026-10-23)
--
-- POR QUÉ. La siembra de 20261018004000 dejó 9 proveedores de servicios, pero ninguna telefónica con la que CAYLA paga el internet del
-- Taller: Entel. Su gasto fijo dice «Entel solo va como beneficiario», y eso deja el combo «Proveedor» de Registrar gasto sin ella:
-- quien registra el recibo no la encuentra y lo carga a otro proveedor o sin proveedor. Ese combo solo ofrece a los que llevan el rubro
-- «Gastos» (`proveedoresParaElegirEnGasto`), así que Entel tiene que existir con ese rubro.
--
-- QUÉ HACE. (1) Inserta «Entel Perú S.A.» con el rubro «Gastos», salvo que su RUC o su nombre ya existan. (2) Si ya existía con ese RUC,
-- solo le SUMA el rubro «Gastos» (no cambia su nombre ni nada más). No borra ni reemplaza nada. Se puede pegar dos veces.
--
-- DE DÓNDE SALE EL DATO (2026-10-23, sin acceso a la Consulta RUC de SUNAT desde la nube): el RUC 20106897914 figura como el de Entel
-- Perú S.A. en recibos de Entel de 2023, 2024, 2025 y 2026 (con direcciones de Lima, Piura y Chachapoyas), y sus 11 dígitos pasan la
-- verificación módulo 11 de SUNAT. Entel Perú es la antigua Nextel del Perú (marca cambiada en octubre de 2014). NO es lo mismo que
-- haberlo mirado en la Consulta RUC: ANTES DE PEGAR, búscalo ahí. Si no calza, cámbialo aquí: el RUC es único en `proveedores` y uno
-- equivocado impediría sumar después al proveedor correcto.
--
-- CÓMO SE PEGA EN PRODUCCIÓN. Sola, tal cual. Solo datos de `proveedores`: sin políticas, sin `alter`, sin `drop trigger`.
-- `lock_timeout` de 3 s. La última línea dice «QUEDÓ BIEN» si Entel quedó en la lista.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

insert into retail.proveedores (nombre, ruc, rubros)
select v.nombre, v.ruc, array['Gastos']
  from (values
    ('Entel Perú S.A.', '20106897914')
  ) as v(nombre, ruc)
 where not exists (
   select 1 from retail.proveedores p
    where p.ruc = v.ruc or retail.fn_clave_texto(p.nombre) = retail.fn_clave_texto(v.nombre)
 );

-- Si ya existía con el mismo RUC: solo se le suma el rubro.
update retail.proveedores p
   set rubros = retail.fn_rubros_limpios(p.rubros || array['Gastos'])
 where p.ruc = '20106897914'
   and not ('Gastos' = any (p.rubros));

-- ¿SE PEGÓ ENTERO? Esta es la ÚLTIMA instrucción del archivo. Si no ves «QUEDÓ BIEN», es seguro volver a pegarlo completo.
select '20261023171000 · proveedor de gastos Entel' as parte,
       count(*) || ' de 1 en la lista de gastos' as en_la_lista,
       case when count(*) = 1 then 'QUEDÓ BIEN' else 'REVISAR: Entel no quedó en la lista (¿su nombre ya existía con otro RUC?)' end as resultado
  from retail.proveedores
 where 'Gastos' = any (rubros)
   and ruc = '20106897914';
