-- ============================================================================
-- 20261106145000 — «Multicolor»: un color de verdad, sin tono falso (ADR-0616, Felipe 2026-11-06)
--
-- EL PROBLEMA
--   La carta tenía dos filas para lo mismo. MUL «Multicolor» quedó archivada (20261010160000) y, como
--   Nuevo producto no la ofrecía, alguien creó MIU «MIULTICOLOR» (mal escrito) en la familia Verde con
--   un verde fosforescente, porque el formulario exige un tono. Una bufanda a cuadros salía en la tienda
--   con un punto verde y bajo el filtro «Verde».
--
-- DECIDÍ
--   · MIU pasa a ser EL color «Multicolor», sin hex y sin familia: en este repo «sin hex» ya significa
--     «de varios colores» (`MuestraColor`, la rueda de tonos; el Plan del piso lo junta en «Otros
--     colores»). El ERP y la tienda lo dibujan en rueda y la tienda le da su propio filtro.
--   · Se corrige la fila MIU y NO se pasan sus prendas a MUL: `color_codigo` va impreso en el código de
--     cada prenda (SKU) y tiene historia (ADR-0258, solo se corrige lo que no tiene historia). Ninguna
--     prenda, stock ni movimiento se toca.
--   · MUL sigue archivada y cambia de nombre: `colores_clave_unica` no deja dos filas con «Multicolor».
-- DESCARTÉ
--   · Una familia nueva «varios» en el candado: toca a cada motor que lista las 10 familias, y un color
--     sin familia ya funciona en todos ellos.
--   · Una columna nueva `es_multicolor`: repetiría lo que `hex is null` ya dice.
-- SE ROMPE SI
--   · Se pega ANTES de publicar la web: Atributos ▸ Colores todavía le ofrecería tono y familia al
--     editarlo, y guardar le pondría un beige. Orden: primero la web, después esto.
--   · MUL ya tiene prendas (hoy ninguna, medido el 2026-10-10): la guarda corta y no se aplica nada.
--
-- IDEMPOTENTE: repegarlo no cambia nada. Donde MIU no existe (local, CI) no hace nada. Sin políticas: se
-- pega entero en el SQL Editor.
--
-- DESHACER (solo si hace falta volver al tono de antes):
--   update retail.colores set nombre = 'Multicolor' where codigo = 'MUL';  -- después de renombrar MIU
--   update retail.colores set nombre = 'Miulticolor', hex = '#09FF00', familia_color = 'verde' where codigo = 'MIU';
-- ============================================================================

set lock_timeout = '3s';

do $$
declare
  v_prendas integer;
begin
  if not exists (select 1 from retail.colores where codigo = 'MIU') then
    raise notice 'Multicolor: no existe MIU en esta base, no hay nada que corregir.';
    return;
  end if;

  v_prendas := (select count(*) from retail.variantes where color_codigo = 'MUL');
  if v_prendas > 0 then
    raise exception 'MUL ya tiene % prendas: decide con Felipe cuál de los dos colores queda.', v_prendas;
  end if;

  update retail.colores set nombre = 'Multicolor (archivado)'
   where codigo = 'MUL' and nombre = 'Multicolor';

  update retail.colores
     set nombre = 'Multicolor', hex = null, familia_color = null, tipo = 'solido', activo = true
   where codigo = 'MIU';
end;
$$;
