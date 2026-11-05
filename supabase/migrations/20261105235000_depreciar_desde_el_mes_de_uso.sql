-- ============================================================================
-- 20261105235000 — Se deprecia desde el mes de uso (tarea 8 de «Las 36 de Finanzas»; ADR-0485 d.7)
--
-- EL PROBLEMA PRIMERO. `fn_meses_depreciados` contaba 0 en el mes de la compra. ADR-0485 decidió empezar en ese mes, que es lo que pide el Reglamento de
-- la Ley del Impuesto a la Renta (art. 22 c), antes de cerrar octubre, y no se hizo. El efecto de hoy es chico porque el último activo es de junio: unos
-- céntimos en la cuota de octubre y una cuota más por activo en el acumulado.
--
-- LA DECISIÓN. El mes de uso es el de `fecha_adquisicion`, sin campo nuevo (ADR-0485). Un mes más en la cuenta; el tope sigue siendo la vida útil.
--
-- POR QUÉ FRENA SI HAY MESES CERRADOS. Cambiar esta función cambia el diario de los meses pasados: con uno cerrado, su huella queda en rojo. Si eso pasa, esta
-- migración aborta entera y hay que decidir qué hacer con ese mes. Va antes de cargar el arranque, porque `fn_bal_activos` suma estas cuotas.
--
-- SUPUESTO PARA EL CONTADOR: el mes de la baja también lleva su cuota entera, como hasta hoy.
--
-- CÓMO SE PEGA EN PRODUCCIÓN: una ejecución, idempotente. Sin tablas ni políticas. Verificado: `pnpm pruebas:activos-y-fijos`.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $$
begin
  if exists (select 1 from retail.periodos p where p.estado = 'cerrado')
     and position('+ 1' in pg_get_functiondef('retail.fn_meses_depreciados(date,integer,date,date)'::regprocedure)) = 0 then
    raise exception 'Hay meses cerrados: cambiar la depreciación pondría su huella en rojo. Decide primero qué hacer con ellos.';
  end if;
end $$;

create or replace function retail.fn_meses_depreciados(p_fecha_adquisicion date, p_vida integer, p_corte date, p_fecha_baja date default null)
returns integer
language sql immutable
as $$
  select greatest(0, least(p_vida,
    (extract(year from least(p_corte, coalesce(p_fecha_baja, p_corte)))::int * 12 + extract(month from least(p_corte, coalesce(p_fecha_baja, p_corte)))::int)
    - (extract(year from p_fecha_adquisicion)::int * 12 + extract(month from p_fecha_adquisicion)::int) + 1));
$$;

reset lock_timeout;
