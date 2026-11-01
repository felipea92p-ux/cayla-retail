-- ============================================================================
-- Un carácter invisible ya no crea dos veces la misma cosa
-- (/chaos: Catálogo ▸ Atributos el 2026-10-30 y «Nuevo avío» el 2026-10-31; Felipe pidió cerrarlo)
--
-- EL PROBLEMA
--   `retail.fn_clave_texto` es la clave con la que la base decide si dos nombres son EL MISMO, y sobre ella cuelgan los
--   16 índices ÚNICOS de todo el vocabulario del catálogo: colores, tallas, marcas, categorías, familias, tejidos,
--   patrones, etiquetas, proveedores (los dos), materiales (nombre y código), insumos, clases de avío, los looks de la
--   vitrina y el calendario del plan. Bajaba a minúsculas, quitaba tildes y juntaba los espacios, pero NO quitaba los
--   caracteres que no se ven y que viajan en cualquier copiar y pegar: el espacio de ancho cero (U+200B, el que más
--   llega, de la web y de WhatsApp), sus parientes, el unidor de palabras, el BOM y el guion suave que mete un PDF al
--   cortar una palabra.
--
--   Resultado: «Botón ZW» y «Botón<U+200B> ZW» entraban como DOS fichas del mismo botón, con el stock partido, y el
--   candado no decía nada porque para él eran dos claves distintas. Medido también en `colores`: la base aceptó
--   «Verde Sonda» y «Verde<U+200B> Sonda». El aviso «¿Es el mismo que …?» de ADR-0576 sí salía, pero no bloquea — y
--   ADR-0576 dice que el nombre IGUAL lo tiene que frenar la base, no solo la pantalla.
--
-- QUÉ HACE
--   1. Quita esos invisibles en `fn_clave_texto`, ANTES de juntar los espacios (uno metido entre dos espacios dejaría
--      un espacio doble si se quitara después).
--   2. REHACE los índices que cuelgan de ella. Esto no es opcional: la función es IMMUTABLE y Postgres guarda en el
--      índice el valor que la función devolvía al escribir cada fila. Sin rehacerlos, se quedan con las claves viejas
--      y el candado deja de frenar lo que debería, sin un solo error a la vista.
--
-- POR QUÉ `drop` + `create` Y NO `reindex` (medido el 2026-10-31, y por poco sale mal)
--   Dentro de UNA MISMA transacción —que es como corre todo lo que se pega en el SQL Editor, y como aplica cada
--   migración el CI— `reindex` reconstruye el índice con la función que tenía CACHEADA, o sea la vieja: pasa en verde
--   sin hacer nada, y encima no avisa si quedan dos claves iguales. En una sesión aparte sí usa la nueva. `drop` +
--   `create` no tiene ese problema: el índice se planifica desde cero y evalúa la función de verdad, en una
--   transacción o en varias. Por eso esto se pega de una sola vez, sin partes.
--
--   Los 16 son índices sueltos (ninguno respalda una constraint: comprobado), así que `drop index` los suelta sin
--   tocar ninguna llave.
--
-- SI HAY DOS FILAS QUE SOLO SE DIFERENCIAN POR UN INVISIBLE
--   El `create unique index` falla y el mensaje dice en qué índice fue. Hay que decidir primero cuál de las dos se
--   queda, que es un dato del negocio y no una decisión técnica. La sonda de solo lectura que lo averigua ANTES está
--   en el PR.
--   «No se aplica nada» vale donde esto se corre DE VERDAD: el SQL Editor de producción y el CI envuelven cada pegado
--   y cada migración en UNA transacción, así que el fallo revierte también la función. Ojo si lo ensayas a mano con
--   `psql -f`, que va en autocommit: ahí la función sí queda cambiada y los índices no, que es justo el estado a
--   medias que esto evita — vuelve a correrla entera después de limpiar los duplicados, y queda coherente.
--
-- No trae políticas ni `alter` de tablas en uso (ADR-0195), así que no choca con el Asesor de seguridad del panel.
-- Las tablas del vocabulario son chicas: rehacer los 16 índices dura milisegundos.
-- ============================================================================
set search_path to retail, public;
set lock_timeout = '3s';

-- ---------- 1 · la clave, sin los invisibles ----------
create or replace function retail.fn_clave_texto(p text)
returns text language sql immutable as $$
  select nullif(
    regexp_replace(
      translate(
        lower(trim(
          -- Los invisibles salen PRIMERO: entre dos espacios, quitarlos después dejaría un espacio doble.
          translate(coalesce(p, ''), U&'\00AD\200B\200C\200D\200E\200F\2060\FEFF', '')
        )),
        'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'),
      '\s+', ' ', 'g'),
    '');
$$;

comment on function retail.fn_clave_texto(text) is
  'Clave de comparación: sin caracteres invisibles (ancho cero, BOM, guion suave), minúsculas, sin acentos, sin espacios '
  'repetidos, vacío = null. IMMUTABLE para poder indexar sobre ella: si se cambia, hay que REHACER (drop + create, no '
  'reindex) todos los índices que cuelgan de ella — ver 20261031200000.';

-- ---------- 2 · rehacer lo que cuelga de ella ----------
-- Dinámico a propósito: rehace los que HAY en esta base, sean los 16 de hoy o los que se sumen mañana. Una lista
-- escrita a mano se queda corta en cuanto alguien añade un vocabulario nuevo, y ahí el agujero vuelve en silencio.
do $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select ci.relname as indice, ni.nspname as esquema, pg_get_indexdef(i.indexrelid) as definicion,
           (select con.conname from pg_constraint con where con.conindid = i.indexrelid) as de_constraint
    from pg_index i
    join pg_class ci on ci.oid = i.indexrelid
    join pg_namespace ni on ni.oid = ci.relnamespace
    where pg_get_indexdef(i.indexrelid) like '%fn_clave_texto%'
    order by 2, 1
  loop
    if r.de_constraint is not null then
      raise exception
        'INVISIBLES: «%.%» respalda la constraint «%», así que no se puede rehacer con drop+create. Hay que mirarlo a '
        'mano antes de seguir. NO se aplicó nada.', r.esquema, r.indice, r.de_constraint;
    end if;
    begin
      execute format('drop index %I.%I', r.esquema, r.indice);
      execute r.definicion;
      n := n + 1;
    exception when unique_violation then
      raise exception
        'INVISIBLES: en «%.%» hay dos filas que, sin los caracteres invisibles, quedarían con el mismo nombre. Decide '
        'primero cuál se queda (es una decisión del negocio) y vuelve a pegar esto. NO se aplicó nada.',
        r.esquema, r.indice;
    end;
  end loop;
  if n = 0 then
    raise exception 'INVISIBLES: no se encontró ningún índice sobre fn_clave_texto. Algo no cuadra: revisa antes de seguir.';
  end if;
  raise notice 'Rehechos % índices sobre fn_clave_texto.', n;
end $$;
