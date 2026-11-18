-- ============================================================================
-- «Revisar compras» dice la marca de cada compra, no solo la razón social (Felipe 2026-11-06).
--
-- EL PROBLEMA PRIMERO. La bandeja «Por completar» nombra cada compra por la razón social del proveedor («Victor Hugo Pun Renteria»), pero en la
-- tienda y en Compras la mercadería se reconoce por su marca. La marca ya está guardada en cada prenda anotada (`orden_compra_items.marca_id`,
-- obligatoria): solo faltaba que la lectura la entregara.
--
-- QUÉ HACE. `fn_revisar_compras` suma `marca` a cada línea del papel. Un papel puede traer varias marcas: la pantalla las junta sin repetir.
-- Solo una función (reemplazo anclado, ADR-0195); sin tablas ni políticas. Idempotente. Si la web se publica antes que esta migración, la pantalla
-- sigue igual, sin la línea de la marca.
-- ============================================================================
set lock_timeout = '3s';

create or replace function pg_temp.reemplazar_revisar_marca_20261106(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

select pg_temp.reemplazar_revisar_marca_20261106('retail.fn_revisar_compras()',
$v$'categoria', ca.nombre, 'cantidad', i.cantidad,$v$,
$v$'categoria', ca.nombre, 'marca', (select m.nombre from retail.marcas m where m.id = i.marca_id), 'cantidad', i.cantidad,$v$, 1);

drop function pg_temp.reemplazar_revisar_marca_20261106(text, text, text, integer);
