-- Códigos de descuento: los lee el líder y quien ve Caja (2026-10-13, auditoría de 20 puntos, punto 18; decisión de Felipe del
-- mismo día). PARTE 2 de 2: SOLO la política, en su propio pegado (regla «Políticas y deadlocks» de CLAUDE.md, ADR-0195).
--
-- EL PROBLEMA. El código es la «llave» que el líder le dicta a la colaboradora para autorizar un descuento en Vender
-- (20260914215103). La política de lectura era `auth.role() = 'authenticated'`: cualquier cuenta con sesión del proyecto, también
-- las de Dynamic, podía leer todos los códigos vigentes, incluido el de mayor porcentaje, y aplicarse un descuento sin el líder.
-- Ninguna pantalla lee esta tabla: el código lo valida `registrar_venta` por dentro (es `security definer`), así que cerrar la
-- lectura no cambia cómo se vende.
--
-- DECIDIÓ FELIPE: el líder y quien ve Caja. En producción hay 0 códigos hoy (2026-10-13): es el momento barato de cerrarlo.
--
-- PRODUCCIÓN. Pegar SOLA, después de la parte 1. `drop policy` + `create policy` toman en exclusiva las tablas de `auth` y
-- `storage` hasta el final de la transacción: por eso va sola y con `lock_timeout`. Re-pegable.

set lock_timeout = '3s';

drop policy if exists codigos_descuento_select on retail.codigos_descuento;
create policy codigos_descuento_select on retail.codigos_descuento
  for select
  using ((select retail.fn_es_lider()) or (select retail.fn_ve_modulo('caja')));

-- ¿SE PEGÓ ENTERO? Esta es la ÚLTIMA instrucción del archivo.
select '20261013162000 · códigos de descuento: líder y quien ve Caja (parte 2 de 2)' as parte,
       case when exists (select 1 from pg_policies where schemaname = 'retail' and tablename = 'codigos_descuento'
                           and policyname = 'codigos_descuento_select' and qual like '%fn_ve_modulo%caja%')
            then 'QUEDÓ BIEN' else 'REVISAR: la política no quedó' end as resultado;
