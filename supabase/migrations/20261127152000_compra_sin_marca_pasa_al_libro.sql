-- Una compra de «Mis compras» con una prenda SIN MARCA pasa al libro (Felipe 2026-11-27; actualización de ADR-0646).
--
-- EL PROBLEMA. La compradora anota en Gamarra «4 pantalones, sin marca»: desde ADR-0646 (2026-11-11) la marca es opcional en «Algo
-- nuevo», y desde ADR-0660 (act. 2026-11-14) la regla de Recibir es «la categoría es obligatoria, la marca no». Pero el candado de
-- `compra_items` seguía en lo que se escribió el 2026-10-12 (ADR-0362, órdenes de escritorio pedidas por «categoría + marca»):
--     compra_items_prenda_o_categoria_marca: producto_id  o  (categoria_id Y marca_id)
-- Al llegar la mercadería, `fn_papel_pasa_solo` llama a `completar_papel_compra`, que copia la línea de la orden a `compra_items` sin
-- prenda (`producto_id` nulo, eso es correcto: la prenda nace al recibir) y con la marca de la orden (nula). El candado lo rechaza, el
-- papel se queda en `por_completar` con `pasa_sola_error` = «violates check constraint …» y la compra nunca llega al libro: no está en
-- Por pagar, no descuenta el fondo de la compradora ni cuenta en el costo del mes. ADR-0646 dijo «`compra_items` ya la aceptaba
-- vacía»: miró la columna (sin `not null`) y no el candado de la tabla.
--
-- DECIDÍ: la línea de un comprobante necesita saber QUÉ es (una prenda del catálogo o, sin prenda, su categoría); la marca es opcional,
--         igual que en `orden_compra_items`, `despacho_items` y `productos`. El candado pasa a `producto_id o categoria_id` y cambia de
--         nombre (`compra_items_prenda_o_categoria`), porque el viejo nombraba una regla que ya no rige.
-- DESCARTÉ: (a) que la pantalla exija marca otra vez: revierte ADR-0646 y ADR-0660 (Felipe, 2026-11-11 y 2026-11-14) y no destraba los
--           5 papeles que ya existen; (b) una marca «Sin marca» o «Genérica»: ADR-0660 ya la descartó (una marca falsa en el catálogo,
--           que además se cuela en los motores, en «marcas por proveedor» y en los filtros de la tienda); (c) que `completar_papel_compra`
--           ponga la marca que eligió la tienda al recibir: la tienda también puede dejarla «Sin marca», así que igual hace falta este
--           candado, y tocar una función que escribe dinero no se justifica para esto.
-- SE ROMPE SI: alguien inserta en `compra_items` una línea sin prenda y SIN categoría (una «Por definir» de ADR-0660 que nadie dijo qué
--           es): el candado la sigue rechazando, a propósito. Hoy no pasa: `completar_papel_compra` toma la categoría que eligió la
--           tienda al contar, y Recibir no deja cerrar sin elegirla (medido en producción el 2026-11-27: los 5 papeles atascados tienen
--           categoría en todas sus líneas).
--
-- QUÉ NO HACE. No reintenta los papeles atascados: eso escribe comprobantes y pagos, y se hace a mano después de pegar esto (el
-- `select retail.fn_papel_pasa_solo(id) …` de la descripción del PR). No toca funciones: las que leen la marca de una línea de compra
-- ya usan `left join` o `is not distinct from` desde ADR-0646; la única con `join retail.marcas` estricto, `fn_marcas_de_compras`,
-- lista los nombres de marca de una compra, y ahí una línea sin marca simplemente no suma un nombre.
--
-- PRODUCCIÓN. Una sola parte, re-pegable: `alter table` de una tabla en uso SIN políticas (regla «Políticas y deadlocks»). El candado
-- nuevo revisa las filas que ya hay (es más flojo que el viejo: todas lo cumplen); con pocos miles de filas son milisegundos.
-- Prueba: `pnpm pruebas:compra-sin-marca-pasa-al-libro`.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

alter table retail.compra_items drop constraint if exists compra_items_prenda_o_categoria_marca;
alter table retail.compra_items drop constraint if exists compra_items_prenda_o_categoria;
alter table retail.compra_items add constraint compra_items_prenda_o_categoria
  check (producto_id is not null or categoria_id is not null);

comment on constraint compra_items_prenda_o_categoria on retail.compra_items is
  'Una línea de comprobante dice qué es: una prenda del catálogo o, sin prenda, su categoría. La marca es opcional (ADR-0646; '
  '20261127152000: antes se llamaba compra_items_prenda_o_categoria_marca y exigía marca, y una compra sin marca no pasaba al libro).';
comment on column retail.compra_items.marca_id is
  'La marca de una línea SIN prenda (ADR-0362). Opcional: vacía = «sin marca» (ADR-0646, 20261127152000). Con prenda, la marca es la de la prenda.';

-- Validación: el candado quedó como se escribió (si no, aborta todo).
do $$
begin
  if exists (select 1 from pg_constraint where conrelid = 'retail.compra_items'::regclass and conname = 'compra_items_prenda_o_categoria_marca') then
    raise exception 'compra sin marca: el candado viejo sigue en compra_items';
  end if;
  if (select pg_get_constraintdef(oid) from pg_constraint
       where conrelid = 'retail.compra_items'::regclass and conname = 'compra_items_prenda_o_categoria')
     is distinct from 'CHECK (((producto_id IS NOT NULL) OR (categoria_id IS NOT NULL)))' then
    raise exception 'compra sin marca: compra_items_prenda_o_categoria no quedó como se esperaba';
  end if;
end $$;

reset lock_timeout;
