-- ============================================================================
-- 20260918230200 — Qué talla, tejido y patrón ofrece cada categoría (el mapa)
--
-- EL PROBLEMA (verificado en producción, 2026-09-18)
--   El vocabulario existe —25 tallas, 17 tejidos, 7 patrones, todos
--   aprobados— pero ninguna categoría tiene tejidos ni patrones asignados
--   (0 de 40), y 15 no tienen tallas. Por eso "Nuevo producto" mostraba
--   "Sin tejidos habilitados para esta categoría" en TODAS: el formulario
--   estaba bien, estaba desconectado del catálogo. Este archivo lo conecta.
--
-- CÓMO SE DECIDIÓ (Felipe, 2026-09-18, AskUserQuestion + revisión del mapa)
--   * Curva habitual de ropa: S M L (XS, XL, XXL y Estándar disponibles).
--   * Pantalón/Jeans: habitual 28-30-32, disponibles 26 y 34 (sin 36).
--   * Calzado: habitual 35 a 40, disponibles 34, 41 y 42.
--   * (2026-09-18, tras revisar producción) la talla se llama "Única", no "Único": la
--     renombró 20260918170000_talla_unica_en_femenino. Este mapa la busca por su nombre nuevo.
--   * "Estándar" para ropa, "Única" para todo lo demás. NO es un duplicado:
--     se reparten por familia y nunca conviven en una misma categoría, que es
--     como lo lee la clienta en la etiqueta (una blusa dice Estándar, una
--     gorra dice Única).
--   * Tejidos según Gamarra y cómo Zara/H&M clasifican; solo Indumentaria,
--     más Gorros y Pañuelos (son de tela). Patrones: los 7 en toda
--     Indumentaria (Liso incluido: es la respuesta a "sin diseño") y en
--     Pañuelos.
--   * Anillos habitual 6-7-8: supuesto del arquitecto, Felipe no lo objetó.
--
-- SOLO SUMA, NUNCA BORRA. Ningún vínculo existente se elimina (principio:
-- nada de DELETE en catálogos con historial); `habitual` sí se actualiza en
-- los vínculos que el mapa nombra. Se puede volver a correr sin daño.
--
-- SE ROMPE SI alguien renombra una categoría, talla o tejido antes de correr
-- esto: el bloque de verificación de abajo aborta TODO en vez de cargar la
-- mitad, y dice cuál nombre no encontró.
-- ============================================================================

drop table if exists _mapa_tallas;
create temp table _mapa_tallas (categoria text, talla text, habitual boolean);

insert into _mapa_tallas
select c, t, t = any (g.hab)
from (values
  -- Ropa: S M L de curva; XS/XL/XXL y Estándar (una medida) disponibles.
  (array['Abrigos','Blazers','Casacas','Chalecos','Conjuntos','Enterizos','Faldas','Shorts','Vestidos',
         'Camisas y Blusas','Chompas','Poleras','Polos','Tops'],
   array['XS','S','M','L','XL','XXL','Estándar'], array['S','M','L']),
  -- Ropa íntima: sin XXL, sin Estándar.
  (array['Bodys','Ropa interior/Lencería'], array['XS','S','M','L','XL'], array['S','M','L']),
  -- Pantalón: numérico.
  (array['Jeans','Pantalones'], array['26','28','30','32','34'], array['28','30','32']),
  -- Calzado: las 4 de siempre + Bailarinas, Botines y Mocasines (que no tenían ninguna).
  (array['Botas','Sandalias','Zapatillas','Zapatos formales','Bailarinas','Botines','Mocasines'],
   array['34','35','36','37','38','39','40','41','42'], array['35','36','37','38','39','40']),
  (array['Cinturones'], array['S','M','L','XL'], array['S','M','L']),
  (array['Anillos'], array['6','7','8','9'], array['6','7','8']),
  -- Una sola medida: "Única" (accesorios, bisutería, belleza, papelería).
  (array['Aretes','Collares','Pulseras','Gorros y Sombreros','Lentes de sol','Maquillaje','Colores','Lapiceros',
         'Bolsos y Carteras','Mochilas','Pañuelos y Pañoletas','Relojes','Riñoneras','Libretas/Cuadernos','Útiles de oficina'],
   array['Única'], array['Única'])
) as g(cats, tallas, hab),
  unnest(g.cats) as c,
  unnest(g.tallas) as t;

drop table if exists _mapa_tejidos;
create temp table _mapa_tejidos (categoria text, tejido text);

insert into _mapa_tejidos
select c, t
from (values
  (array['Polos'],
   array['Algodón','Algodón pima','Jersey','Piqué','Rib','Licra','Poliéster']),
  (array['Poleras'],
   array['Algodón','Algodón pima','Jersey','Piqué','Rib','Licra','Poliéster','Polar']),
  (array['Tops','Bodys'],
   array['Algodón','Jersey','Rib','Licra','Poliéster','Viscosa','Seda']),
  (array['Camisas y Blusas'],
   array['Algodón','Algodón pima','Lino','Popelina','Seda','Viscosa','Poliéster']),
  (array['Chompas'],
   array['Algodón','Algodón pima','Alpaca','Jersey','Rib','Poliéster']),
  (array['Vestidos','Enterizos','Conjuntos'],
   array['Algodón','Lino','Popelina','Seda','Viscosa','Poliéster','Jersey','Licra','Rib']),
  (array['Faldas','Shorts'],
   array['Denim','Drill','Gabardina','Lino','Popelina','Viscosa','Poliéster','Licra','Algodón']),
  (array['Jeans'],
   array['Denim','Algodón','Licra']),
  (array['Pantalones'],
   array['Denim','Drill','Gabardina','Lino','Pana','Algodón','Viscosa','Poliéster','Licra']),
  (array['Casacas'],
   array['Algodón','Denim','Drill','Gabardina','Pana','Polar','Poliéster']),
  (array['Chalecos'],
   array['Algodón','Denim','Drill','Gabardina','Pana','Polar','Poliéster','Alpaca']),
  (array['Blazers'],
   array['Gabardina','Lino','Drill','Pana','Poliéster','Viscosa']),
  (array['Abrigos'],
   array['Alpaca','Gabardina','Pana','Polar','Poliéster']),
  (array['Ropa interior/Lencería'],
   array['Algodón','Licra','Seda','Poliéster']),
  (array['Gorros y Sombreros'],
   array['Algodón','Lino','Alpaca','Pana','Poliéster']),
  (array['Pañuelos y Pañoletas'],
   array['Seda','Viscosa','Algodón','Alpaca','Poliéster'])
) as g(cats, tejidos),
  unnest(g.cats) as c,
  unnest(g.tejidos) as t;

drop table if exists _mapa_patrones;
create temp table _mapa_patrones (categoria text, patron text);

insert into _mapa_patrones
select c, p
from unnest(array['Abrigos','Blazers','Bodys','Camisas y Blusas','Casacas','Chalecos','Chompas','Conjuntos',
                  'Enterizos','Faldas','Jeans','Pantalones','Poleras','Polos','Ropa interior/Lencería','Shorts',
                  'Tops','Vestidos','Pañuelos y Pañoletas']) as c,
     unnest(array['Liso','Rayas','Cuadros','Lunares','Floral','Estampado','Animal print']) as p;

-- ---------- verificación: cada nombre del mapa tiene que existir, o se aborta todo ----------
do $$
declare
  v_faltan text;
begin
  select string_agg(distinct 'categoría «' || m.categoria || '»', ', ') into v_faltan
    from (select categoria from _mapa_tallas union select categoria from _mapa_tejidos union select categoria from _mapa_patrones) m
    where not exists (select 1 from retail.categorias c where c.nombre = m.categoria and c.activo);
  if v_faltan is not null then
    raise exception 'El mapa nombra categorías que no existen o están inactivas: %', v_faltan;
  end if;

  select string_agg(distinct 'talla «' || m.talla || '»', ', ') into v_faltan
    from _mapa_tallas m
    where not exists (select 1 from retail.tallas t where t.valor = m.talla and t.activo and t.estado = 'aprobado');
  if v_faltan is not null then
    raise exception 'El mapa nombra tallas que no existen o no están aprobadas: %', v_faltan;
  end if;

  select string_agg(distinct 'tejido «' || m.tejido || '»', ', ') into v_faltan
    from _mapa_tejidos m
    where not exists (select 1 from retail.tejidos t where t.nombre = m.tejido and t.activo and t.estado = 'aprobado');
  if v_faltan is not null then
    raise exception 'El mapa nombra tejidos que no existen o no están aprobados: %', v_faltan;
  end if;

  select string_agg(distinct 'patrón «' || m.patron || '»', ', ') into v_faltan
    from _mapa_patrones m
    where not exists (select 1 from retail.patrones p where p.nombre = m.patron and p.activo and p.estado = 'aprobado');
  if v_faltan is not null then
    raise exception 'El mapa nombra patrones que no existen o no están aprobados: %', v_faltan;
  end if;
end $$;

-- ---------- carga: solo suma, y fija la curva habitual ----------
insert into retail.categoria_tallas (categoria_id, talla_id, habitual)
select c.id, t.id, m.habitual
from _mapa_tallas m
  join retail.categorias c on c.nombre = m.categoria and c.activo
  join retail.tallas t on t.valor = m.talla
on conflict (categoria_id, talla_id) do update set habitual = excluded.habitual;

insert into retail.categoria_tejidos (categoria_id, tejido_id)
select c.id, t.id
from _mapa_tejidos m
  join retail.categorias c on c.nombre = m.categoria and c.activo
  join retail.tejidos t on t.nombre = m.tejido
on conflict do nothing;

insert into retail.categoria_patrones (categoria_id, patron_id)
select c.id, p.id
from _mapa_patrones m
  join retail.categorias c on c.nombre = m.categoria and c.activo
  join retail.patrones p on p.nombre = m.patron
on conflict do nothing;

-- ---------- el estado imposible, comprobado: una familia que exige tejido y patrón ----------
-- no puede tener una categoría activa sin opciones que elegir (sería un
-- producto imposible de crear), ni sin ninguna talla habitual (el formulario
-- arrancaría vacío).
do $$
declare
  v_mal text;
begin
  select string_agg(c.nombre, ', ') into v_mal
    from retail.categorias c
      join retail.familias f on f.codigo = c.familia and f.exige_tejido_patron
    where c.activo
      and (
        not exists (select 1 from retail.categoria_tejidos x where x.categoria_id = c.id)
        or not exists (select 1 from retail.categoria_patrones x where x.categoria_id = c.id)
        or not exists (select 1 from retail.categoria_tallas x where x.categoria_id = c.id and x.habitual)
      );
  if v_mal is not null then
    raise exception 'Categorías de una familia que exige tejido/patrón quedaron sin opciones: %', v_mal;
  end if;
end $$;

-- Sin `on commit drop` a propósito: según dónde se ejecute el archivo (CLI,
-- SQL Editor) cada sentencia puede ir en su propia transacción y la tabla
-- temporal desaparecería antes de usarse. Se borran acá, explícitamente.
drop table if exists _mapa_tallas;
drop table if exists _mapa_tejidos;
drop table if exists _mapa_patrones;
