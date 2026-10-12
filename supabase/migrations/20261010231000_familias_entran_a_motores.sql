-- ============================================================================
-- 20261010231000_familias_entran_a_motores.sql — una familia puede quedar FUERA de los motores (actividad 1 de «Bolsas de despacho»)
--
-- EL PROBLEMA PRIMERO. La bolsa de despacho (S/ 0.50) se vende todos los días y no es una prenda: no se cuelga, no rota, no se pide al Taller ni se compra
-- por temporada. Pero no hay dónde registrarla. Caja la anota como «prenda sin registrar» con la categoría que se le ocurre (en producción, el 2026-10-10:
-- unas 54 ventas de S/ 1 o menos en Tienda AQP, anotadas como Bolsos y Carteras, Anillos y Aretes) y el motor del piso, el de demanda, el plan de compra,
-- Análisis y Frescura las cuentan como demanda de esa categoría: Bolsos «vende» bolsas beige. Ningún motor sabe distinguir lo que no es mercadería.
--
-- LA DECISIÓN (Felipe, 2026-10-10: «familia fuera de los motores»). Una columna en la familia: `familias.entra_a_motores` (por defecto `true`, así
-- NINGUNA familia existente cambia de comportamiento). Un Líder crea la familia «Empaque», le apaga el interruptor y cuelga de ella la categoría «Bolsas»
-- (tipos de bolsa = productos). Esta migración solo trae la marca y UNA función para preguntarla; las actividades 2 y 3 hacen que los motores la
-- respeten, y la 4 reclasifica lo ya vendido.
--
-- UNA SOLA PREGUNTA PARA TODOS: `retail.fn_categoria_entra_a_motores(categoria_id)`. Sin dato (categoría vacía, inexistente o sin familia) responde
-- `true`: lo que no se sabe sigue contando, como hoy (principio 9: ante la duda, el motor no pierde una prenda).
--
-- DESCARTÉ (i) la marca en la categoría: crear una categoría exige elegir familia, y la bolsa no cabe en ninguna de las seis (colgarla de «Accesorios»
-- obligaría a apagar también carteras y relojes, que sí cuentan); con la marca en la familia, «Empaque» agrupa bolsas, cajas y sorpresas con un solo
-- interruptor. (ii) una lista de categorías excluidas dentro de cada función del motor: cinco funciones con la misma lista a mano se desincronizan.
-- (iii) quitar la bolsa de las ventas: es una venta real, el dinero y el comprobante la cuentan; solo los motores de DECISIÓN la ignoran.
--
-- SE ROMPE SI: un motor nuevo cuenta ventas por categoría sin preguntar esto: la bolsa vuelve a entrar. Por eso la prueba de cada motor (actividades 2 y 3)
-- vigila que una venta de una familia apagada no mueva ninguna cifra.
--
-- PARA PRODUCCIÓN: una sola parte. Un `alter table … add column` con valor por defecto constante no reescribe la tabla (Postgres 11+) y no toma
-- ninguna política; el `create or replace function` no toca tablas en uso. Se pega tal cual en el SQL Editor (todo lleva el prefijo `retail.`).
-- ============================================================================

set lock_timeout = '3s';

-- ---------- 1. La marca ----------
alter table retail.familias add column if not exists entra_a_motores boolean not null default true;
comment on column retail.familias.entra_a_motores is
  'true (lo normal) = lo que se vende de esta familia cuenta en los motores de decisión (piso, demanda, plan de compra, Análisis, Frescura). false = es lo que se vende pero no se piensa como mercadería (bolsas, cajas): sigue siendo venta, caja y comprobante, pero ningún motor lo cuenta como demanda ni lo pide. Se cambia en Catálogo ▸ Familias, por quien edita el catálogo (`fn_puede_editar_catalogo()`, la misma política de escritura de la tabla).';

-- ---------- 2. La pregunta única ----------
-- `language sql stable` sin `security definer` ni `set`: el planificador la expande dentro de la consulta que la llama (un join, no una llamada por fila).
create or replace function retail.fn_categoria_entra_a_motores(p_categoria_id uuid)
returns boolean
language sql
stable
as $$
  select coalesce(
    (select f.entra_a_motores
       from retail.categorias c
       join retail.familias f on f.codigo = c.familia
      where c.id = p_categoria_id),
    true);
$$;

comment on function retail.fn_categoria_entra_a_motores(uuid) is
  'Bolsas de despacho (2026-10-10): ¿lo que se vende de esta categoría cuenta en los motores de decisión? Lee `familias.entra_a_motores` de su familia. Sin dato (categoría vacía, inexistente o sin familia) responde true: lo que no se sabe sigue contando.';
revoke all on function retail.fn_categoria_entra_a_motores(uuid) from public, anon;
grant execute on function retail.fn_categoria_entra_a_motores(uuid) to authenticated;

-- ---------- 3. Validación final: si algo no quedó, se deshace todo ----------
do $v$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'retail' and table_name = 'familias' and column_name = 'entra_a_motores'
                    and is_nullable = 'NO' and column_default = 'true') then
    raise exception 'familias entran a motores: la columna quedó mal (debe ser not null, por defecto true)';
  end if;
  if (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'fn_categoria_entra_a_motores') <> 1 then
    raise exception 'familias entran a motores: debe haber una sola fn_categoria_entra_a_motores';
  end if;
end
$v$;

reset lock_timeout;
notify pgrst, 'reload schema';
