-- ============================================================================
-- 20260921153700_movimientos_busqueda_especial.sql — CAYLA V2
--
-- Movimientos busca prendas con el «Filtro de búsqueda especial», el mismo de
-- Existencias y de Análisis (apps/web/lib/filtro-busqueda-especial.ts).
--
-- POR QUÉ. `fn_movimientos_variantes` (la que resuelve el texto de la caja de
-- búsqueda a prendas) tomaba lo escrito como UNA sola cadena y la buscaba con
-- ILIKE en SKU, código de variante, nombre y código de producto, y solo
-- IGUAL en el código de barras. «blusa rosado m» no encontraba nada (ninguna
-- prenda tiene esa frase entera), el color y la talla no se miraban, y un
-- código de barras solo servía si se escribía completo. Quien mira el historial
-- piensa «los movimientos de la blusa rosada M»: tiene que poder escribirlo así.
--
-- QUÉ CAMBIA. Solo el CUERPO de `fn_movimientos_variantes(text) returns uuid[]`
-- (misma firma, mismos permisos): lo escrito se parte en términos y TODOS deben
-- cumplirse, cada uno en el campo que le toque, en cualquier orden.
--   · Sin mayúsculas ni tildes, y parcial mientras se escribe («blu» → Blusa).
--   · Un término suelto que es una TALLA que existe («s», «m», «l», «30») se
--     compara solo con la talla y exacto: si no, «blusa l» traería toda blusa.
--   · Un término que es un COLOR completo se compara con el color y sus
--     equivalentes: «blanca» = «blanco», «rosada» = «rosado», «cafe» = «marrón».
--   · Lo escrito en plural busca el singular al comienzo de una palabra del
--     nombre («blusas» → Blusa). Los códigos se encuentran aunque se escriban sin
--     guiones, guiones bajos, puntos ni barras («blucamblal» → BLU-CAM-BLA-L) y el código de barras vale a medias.
--   · «talla», «color», «de», «la»… no filtran nada, salvo que sean lo único
--     escrito.
-- Las mismas reglas están escritas en TypeScript; las dos versiones se mantienen
-- iguales con `filtro-busqueda-especial.casos.json` (los mismos casos, las mismas
-- respuestas) y `pnpm pruebas:fn-movimientos-busqueda-especial`.
--
-- CONTRATO (lo que promete y lo que asume).
--   Promete: los ids de las variantes que cumplen TODOS los términos escritos;
--            '{}' si ninguna; NULL si no hay nada escrito (nada que buscar).
--   Asume:   el texto llega tal como lo tecleó la persona (no hace falta escaparlo:
--            se compara con strpos, así que `%` y `_` son un carácter más) y
--            `fn_movimientos_busqueda` ya resolvió antes las referencias de
--            proceso («traslado 24», «boleta 184», «B001-000184»).
--   No promete orden.
--
-- QUÉ ES TALLA Y QUÉ ES COLOR sale de las prendas del catálogo (las tallas y los
-- colores que alguna variante usa), no de una lista fija: «xl» solo es talla si
-- existe una XL. Es lo mismo que hace la versión de pantalla con las filas que
-- busca; aquí las filas son todo el catálogo, porque el historial abarca todo.
--
-- CUANDO ALGO FALLA. No toca nada externo: lee `variantes`, `productos`, `colores`,
-- `tallas` y `codigos_barras` y no escribe. Es `stable` e invoker, igual que antes:
-- quien la llama ve lo que su rol ya podía ver.
--
-- COSTO (medido en el Postgres local con catálogos sintéticos, en una transacción revertida).
--   4.049 variantes:   la búsqueda anterior 13 ms · esta 30 ms.
--   20.049 variantes:  la búsqueda anterior 51 ms · esta 120 ms.
-- Cada prenda se normaliza UNA vez por llamada (no una por término), con la normalización más barata que
-- alcanza (minúsculas + tildes del español), el código de producto se normaliza una vez por producto y los
-- códigos de barras que solo repiten el SKU o el código de variante (el alta los guarda también como barras)
-- no se normalizan dos veces. La primera versión, con `fn_clave_texto` en cada código, tardaba 95 ms y
-- 485 ms: se descartó. Cada pantalla de Movimientos hace dos llamadas (lista y tarjetas). Si el catálogo
-- creciera 10x, el paso siguiente sería una columna de búsqueda ya normalizada (no hace falta hoy).
--
-- Dos ayudas nuevas (`fn_busqueda_singulares`, `fn_busqueda_formas_color`) llevan las
-- reglas de plural, género y alias de color: son de todo buscador que use estas
-- reglas, no solo de Movimientos.
-- ============================================================================

set search_path = retail, public, extensions;

-- El singular de lo escrito en plural: «blusas» → {blusa}, «pantalones» → {pantalon, pantalone}.
-- Vacío si no parece plural o si trae un número (un código no se «singulariza»).
create or replace function retail.fn_busqueda_singulares(p_texto text)
returns text[]
language sql
immutable
set search_path = retail, public, extensions
as $$
  select case
    when p_texto ~ '\d' then '{}'::text[]
    else
      (case when length(p_texto) >= 6 and p_texto like '%es' then array[left(p_texto, -2)] else '{}'::text[] end)
      || (case when length(p_texto) >= 4 and p_texto like '%s' then array[left(p_texto, -1)] else '{}'::text[] end)
  end
$$;

-- Las formas con que se puede escribir un color: la que llegó, su singular, su otro género
-- («blancas» → blanca → blanco) y su alias («cafe» → marron, «rosa» → rosado).
create or replace function retail.fn_busqueda_formas_color(p_texto text)
returns text[]
language sql
immutable
set search_path = retail, public, extensions
as $$
  with base as (
    select f from unnest(array[p_texto] || retail.fn_busqueda_singulares(p_texto)) as f
  ),
  genero as (
    select f from base
    union
    select left(f, -1) || 'o' from base where f like '%a'
    union
    select left(f, -1) || 'a' from base where f like '%o'
  ),
  con_alias as (
    select f from genero
    union
    select a.destino
    from genero g
    join (values ('rosa', 'rosado'), ('anaranjado', 'naranja'), ('cafe', 'marron')) as a(origen, destino) on a.origen = g.f
  )
  select array_agg(f) from con_alias
$$;

revoke all on function retail.fn_busqueda_singulares(text) from public, anon;
revoke all on function retail.fn_busqueda_formas_color(text) from public, anon;
grant execute on function retail.fn_busqueda_singulares(text) to authenticated;
grant execute on function retail.fn_busqueda_formas_color(text) to authenticated;

comment on function retail.fn_busqueda_singulares(text) is
  'Filtro de búsqueda especial: el singular de una palabra en plural (blusas → blusa). Vacío si trae dígitos. Espejo de singularesDe en filtro-busqueda-especial.ts.';
comment on function retail.fn_busqueda_formas_color(text) is
  'Filtro de búsqueda especial: las formas de escribir un color (género, plural, alias). Espejo de formasDeColor en filtro-busqueda-especial.ts.';

-- La búsqueda de prendas de Movimientos. Mismo nombre, misma firma y mismos permisos que antes.
--
-- Cómo está armado el cuerpo (sin comentarios adentro, para que el texto guardado en la base sea idéntico al de este
-- archivo y se pueda comparar `md5(prosrc)` byte a byte):
--   escritos      lo escrito, sin mayúsculas ni tildes, partido por espacios, comas y punto y coma
--                 (`translate` primero y `lower` después: no depende de cómo trate el idioma de la base las mayúsculas con tilde).
--   utiles        sin las palabras que solo acompañan («talla», «de»…); si son TODO lo escrito («de» mientras se teclea «denim»), se buscan.
--   terminos      utiles, o escritos si no queda ninguno.
--   productos_n   nombre y código de cada producto, normalizados una vez por producto.
--   barras        códigos de barras por variante, sin repetir los que ya son el SKU o el código de variante.
--   base          cada variante con sus campos ya normalizados: una vez por prenda, no una por término.
--   prendas       base + el SKU y los códigos sin guiones, guiones bajos, puntos ni barras («blucamblal» → BLU-CAM-BLA-L).
--   tallas_en_uso / palabras_de_color   qué es talla y qué es color se reconoce con lo que las prendas usan de verdad.
--   clasificados  cada término: talla, color o texto.
--   buscados      con qué se compara cada término: un color solo suma equivalentes que existen; un plural busca su singular solo al
--                 comienzo de una palabra del nombre; un término de 4 letras o más también cruza el guion de un código.
--   resultado     las prendas que cumplen TODOS los términos; basta un término que no cumpla para dejarla fuera.
create or replace function retail.fn_movimientos_variantes(p_busqueda text)
returns uuid[]
language sql
stable
set search_path = retail, public, extensions
as $$
  with
  escritos as (
    select t.palabra
    from regexp_split_to_table(lower(translate(coalesce(p_busqueda, ''), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')), '[\s,;]+') as t(palabra)
    where t.palabra <> ''
  ),
  utiles as (
    select palabra from escritos
    where palabra <> all (array['talla', 'tallas', 'color', 'colores', 'de', 'del', 'en', 'la', 'el', 'los', 'las', 'y', 'con', 'para', 'un', 'una'])
  ),
  terminos as (
    select palabra from utiles
    union all
    select palabra from escritos where not exists (select 1 from utiles)
  ),
  productos_n as materialized (
    select p.id,
           lower(translate(p.referencia, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')) as nombre,
           lower(translate(coalesce(p.codigo, ''), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')) as codigo
    from retail.productos p
  ),
  barras as materialized (
    select cb.variante_id,
           string_agg(lower(translate(cb.codigo, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')), ' ') as codigos
    from retail.codigos_barras cb
    join retail.variantes v on v.id = cb.variante_id
    where cb.codigo is distinct from v.sku and cb.codigo is distinct from v.codigo
    group by cb.variante_id
  ),
  base as materialized (
    select v.id,
           pr.nombre,
           lower(translate(coalesce(v.sku, ''), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')) as sku,
           lower(translate(coalesce(co.nombre, ''), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')) as color,
           lower(translate(coalesce(ta.valor, ''), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')) as talla,
           concat_ws(' ', nullif(pr.codigo, ''), lower(translate(v.codigo, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')), b.codigos) as codigos
    from retail.variantes v
    join productos_n pr on pr.id = v.producto_id
    left join retail.colores co on co.codigo = v.color_codigo
    left join retail.tallas ta on ta.id = v.talla_id
    left join barras b on b.variante_id = v.id
  ),
  prendas as materialized (
    select b.*, translate(concat_ws(' ', b.sku, b.codigos), '-_./', '') as compactos from base b
  ),
  tallas_en_uso as (
    select distinct talla from prendas where talla <> ''
  ),
  palabras_de_color as (
    select distinct w.palabra
    from prendas b
    cross join lateral regexp_split_to_table(b.color, '[\s-]+') as w(palabra)
    where w.palabra <> ''
  ),
  clasificados as materialized (
    select t.palabra,
           case
             when t.palabra in (select talla from tallas_en_uso) then 'talla'
             when exists (
               select 1 from unnest(retail.fn_busqueda_formas_color(t.palabra)) as f
               where f in (select palabra from palabras_de_color)
             ) then 'color'
             else 'texto'
           end as tipo
    from terminos t
  ),
  buscados as materialized (
    select c.palabra,
           c.tipo,
           f.formas,
           case when c.tipo = 'texto' then retail.fn_busqueda_singulares(c.palabra) else '{}'::text[] end as singulares,
           array(
             select k from (select translate(x, '-_./', '') as k from unnest(f.formas) as x) z where length(k) >= 4
           ) as compactas
    from clasificados c
    cross join lateral (
      select case
        when c.tipo = 'talla' then '{}'::text[]
        when c.tipo = 'color' then array(
          select x from unnest(retail.fn_busqueda_formas_color(c.palabra)) as x
          where x = c.palabra or x in (select palabra from palabras_de_color)
        )
        else array[c.palabra]
      end as formas
    ) f
  )
  select case
    when not exists (select 1 from terminos) then null::uuid[]
    else coalesce((
      select array_agg(b.id)
      from prendas b
      where not exists (
        select 1 from buscados t
        where not (
          case
            when t.tipo = 'talla' then b.talla = t.palabra
            else
              exists (
                select 1 from unnest(t.formas) as f
                where strpos(b.nombre, f) > 0 or strpos(b.sku, f) > 0 or strpos(b.color, f) > 0
                   or strpos(b.talla, f) > 0 or strpos(b.codigos, f) > 0
              )
              or exists (select 1 from unnest(t.compactas) as k where strpos(b.compactos, k) > 0)
              or exists (select 1 from unnest(t.singulares) as s where strpos(' ' || b.nombre, ' ' || s) > 0)
          end
        )
      )
    ), '{}'::uuid[])
  end
$$;

comment on function retail.fn_movimientos_variantes(text) is
  'Resuelve la búsqueda de Movimientos a ids de variante con el Filtro de búsqueda especial: '
  'términos en cualquier orden sobre nombre, SKU, códigos, color y talla; todos deben cumplirse; '
  'sin mayúsculas ni tildes; talla suelta exacta; equivalencias de color; plurales. '
  'NULL si no hay nada escrito. Espejo de apps/web/lib/filtro-busqueda-especial.ts.';
