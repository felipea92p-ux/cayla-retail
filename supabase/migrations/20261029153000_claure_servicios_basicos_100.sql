-- ============================================================================
-- 20261029153000 — Agua, internet y baño van 100 % a CLAURE; la luz se queda 50/50 (ADR-0560; actividad 12)
--
-- EL PROBLEMA PRIMERO. La actividad 8 dejó el reparto de gastos de fábrica con «servicios básicos» al 50 % (donde Gasto rápido anota luz, agua, internet y baño). Felipe (2026-10-29):
-- «luz, alquiler y mantenimiento 50/50, lo demás lo asume Claudia», y aclaró que «lo demás» es agua, internet y baño: 100 % de CLAURE. Así que la LUZ sale de «servicios básicos» y se
-- queda en su categoría (`luz`, 50 %), y lo que queda en «servicios básicos» —agua, internet, baño— pasa a 100 %. Las categorías `agua` e `internet` (el formulario completo de Gastos) también.
--
-- CONTRATO (Liskov)
--   PROMETE: `servicios_basicos`, `agua` e `internet` reparten 100 % a CLAURE; `luz`, `alquileres` y `mantenimiento` siguen en 50 %; `telefonia` y lo demás, sin reparto (todo de CAYLA).
--            Solo cambia la TABLA `gasto_reparto_claure` (datos de configuración): ninguna función se reescribe, así que fn_claure_gastos, el Diario, el Estado de resultados y el aviso del
--            cierre leen el nuevo reparto solos. Respeta un porcentaje que ya se haya cambiado a mano: «servicios_basicos» solo pasa de 50 a 100 si todavía está en 50.
--   ASUME:   Gasto rápido manda «Luz» a su categoría `luz` (la web de esta actividad); los de «Luz» anotados antes en «servicios básicos» pasan a contar como 100 % de CLAURE hasta que
--            se reclasifiquen (la lista de los de antes está en el backlog).
--   NO HACE: no toca gastos ya registrados ni ninguna función.
--
-- CÓMO SE PEGA EN PRODUCCIÓN — UNA SOLA EJECUCIÓN, después de 20261029144000 y ANTES de la web (Gasto rápido manda ahora «Luz» a la categoría `luz`, que ya existe). Solo datos; sin políticas
-- ni `alter table`; idempotente (se puede volver a pegar sin pisar un cambio posterior).
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

update retail.gasto_reparto_claure set pct_claure = 100, actualizado_en = now() where categoria = 'servicios_basicos' and pct_claure = 50;
insert into retail.gasto_reparto_claure (categoria, pct_claure)
select c.codigo, 100 from retail.categorias_gasto c where c.codigo in ('agua', 'internet')
on conflict (categoria) do nothing;

comment on table retail.gasto_reparto_claure is
  'ADR-0560: qué parte de cada categoría de gasto de una sede donde opera CLAURE es de CLAURE. De fábrica (Felipe, 2026-10-28 y 2026-10-29): alquileres, luz y mantenimiento 50 %; servicios básicos, agua, internet, limpieza y bolsas 100 %. Sin fila o con 0, todo es de CAYLA.';

do $$
begin
  if (select pct_claure from retail.gasto_reparto_claure where categoria = 'luz') is distinct from 50
     or not exists (select 1 from retail.gasto_reparto_claure where categoria = 'agua' and pct_claure > 0)
     or not exists (select 1 from retail.gasto_reparto_claure where categoria = 'internet' and pct_claure > 0) then
    raise exception 'ADR-0560: el reparto de servicios no quedó (luz 50 %%, agua e internet repartidos)';
  end if;
end $$;
