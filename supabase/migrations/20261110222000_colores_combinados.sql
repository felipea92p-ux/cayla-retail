-- ============================================================================
-- 20261110222000 — Colores combinados: «Hueso con azul» es un color de la carta (ADR-0643)
--
-- EL PROBLEMA
--   Una variante tiene UN color (`variantes.color_codigo`), y está bien: es lo que hace única a
--   la variante (`variantes_producto_talla_color_unico`). Pero llegan vestidos de base hueso con
--   detalles azules y otros idénticos de base azul con negro. En Recibir, elegir «hueso» y «azul»
--   crea DOS variantes (una hueso, otra azul): ninguna es la prenda que llegó. Lo que se hacía era
--   elegir la base y anotar el resto en la descripción, y el stock de «hueso con azul» y «hueso con
--   rojo» se mezclaba.
--
-- DECIDÍ
--   · Un color combinado es una FILA de `colores`, con `componentes` = los colores que lo forman:
--     primero la base y después de 1 a 3 acompañantes, todos colores reales de la carta. Así
--     `variantes`, `stock` y `movimientos` no cambian: «Hueso con azul» y «Azul con negro» son dos
--     colores, luego dos variantes con su stock aparte.
--   · El disparador `colores_valida_componentes` hace imposible: un código que no existe, uno
--     repetido, el propio color, un combinado dentro de otro, y cambiar los colores de una mezcla que
--     ya tiene prendas. Además ordena los acompañantes (por código) y copia de la base la familia y
--     el hex: Análisis, Frescura y toda pantalla que todavía no sepa de mezclas ven el color base.
--   · `colores_componentes_unico`: la misma mezcla no existe dos veces (hueso + azul + negro es la
--     misma que hueso + negro + azul, porque los acompañantes se guardan ordenados).
--   · `retail.color_combinado(p_componentes)` busca la mezcla o la crea: arma el nombre («Hueso con
--     azul y negro») y un código libre de 3 letras. Es `security invoker`: inserta con las mismas
--     reglas que «Nuevo color» (quién puede, y el estado lo pone `fn_colores_estado_trigger`). Si dos
--     personas crean la misma mezcla a la vez, la segunda recibe la que creó la primera.
-- DESCARTÉ
--   · Una segunda columna de color en `variantes`: cambia la llave única de la variante, el código
--     de la etiqueta y cada consulta de ventas y stock (principio 1).
--   · Una tabla `variante_colores` (N:M): ¿de qué color es una venta? No tiene respuesta clara.
--   · Que el orden de los acompañantes importe: es la misma prenda; solo la base cambia la prenda.
-- SE ROMPE SI
--   · Se cambia el hex de la base: la mezcla lo copia solo al tocarla. El punto partido lo dibuja la
--     web desde los componentes, así que la carta no miente; solo el `hex` guardado queda viejo.
--   · La web se publica antes de pegar esto: la carta pide `componentes` y no existe → falla la
--     lectura de colores. Pegar esto PRIMERO.
--
-- PRODUCCIÓN: un solo pegado (un `alter` sobre `colores`, sin políticas: CLAUDE.md «Políticas y
-- deadlocks»). Idempotente.
--
-- DESHACER:
--   drop function if exists retail.color_combinado(text[]);
--   drop trigger if exists colores_valida_componentes on retail.colores;  -- (toma auth/storage: pegar solo)
--   drop function if exists retail.fn_colores_valida_componentes();
--   drop index if exists retail.colores_componentes_unico;
--   alter table retail.colores drop constraint if exists colores_componentes_cuantos;
--   alter table retail.colores drop column if exists componentes;   -- solo sin variantes en mezclas
-- ============================================================================

set lock_timeout = '3s';

-- ---------- 1. La columna y su forma ----------
alter table retail.colores add column if not exists componentes text[];

comment on column retail.colores.componentes is
  'Si el color es una mezcla («Hueso con azul»): la base primero y de 1 a 3 acompañantes, ordenados por código. Nulo en un color de un solo tono. ADR-0643.';

alter table retail.colores drop constraint if exists colores_componentes_cuantos;
alter table retail.colores
  add constraint colores_componentes_cuantos check (componentes is null or cardinality(componentes) between 2 and 4);

create unique index if not exists colores_componentes_unico on retail.colores (componentes) where componentes is not null;

-- ---------- 2. El candado: una mezcla solo de colores reales ----------
create or replace function retail.fn_colores_valida_componentes()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_base retail.colores%rowtype;
  v_malo text;
begin
  if new.componentes is null then
    -- Un color de un tono que ya tiene prendas no se vuelve mezcla, ni al revés (abajo).
    if tg_op = 'UPDATE' and old.componentes is not null
       and exists (select 1 from retail.variantes v where v.color_codigo = old.codigo) then
      raise exception 'La mezcla «%» ya tiene prendas: no se le pueden cambiar los colores.', old.nombre using errcode = '23514';
    end if;
    return new;
  end if;

  new.componentes := array(select upper(btrim(x)) from unnest(new.componentes) with ordinality as t(x, n) order by n);

  if new.codigo = any (new.componentes) then
    raise exception 'Una mezcla no se forma consigo misma (%).', new.codigo using errcode = '23514';
  end if;

  v_malo := (select x from unnest(new.componentes) as x group by x having count(*) > 1 limit 1);
  if v_malo is not null then
    raise exception 'El color % está repetido en la mezcla.', v_malo using errcode = '23514';
  end if;

  v_malo := (select x from unnest(new.componentes) as x
             where not exists (select 1 from retail.colores c where c.codigo = x) limit 1);
  if v_malo is not null then
    raise exception 'El color % no existe, no puede ir en la mezcla.', v_malo using errcode = '23503';
  end if;

  v_malo := (select x from unnest(new.componentes) as x
             join retail.colores c on c.codigo = x where c.componentes is not null limit 1);
  if v_malo is not null then
    raise exception 'El color % ya es una mezcla: arma la mezcla con sus colores sueltos.', v_malo using errcode = '23514';
  end if;

  -- Los acompañantes, ordenados: hueso + azul + negro y hueso + negro + azul son la misma prenda.
  new.componentes := array[new.componentes[1]]
    || array(select x from unnest(new.componentes[2:]) as x order by x);

  if tg_op = 'UPDATE' and old.componentes is distinct from new.componentes
     and exists (select 1 from retail.variantes v where v.color_codigo = old.codigo) then
    raise exception 'El color «%» ya tiene prendas: no se le pueden cambiar los colores.', old.nombre using errcode = '23514';
  end if;

  -- La familia y el hex son los de la base: las pantallas que no saben de mezclas ven el color base.
  for v_base in select * from retail.colores c where c.codigo = new.componentes[1] loop
    new.familia_color := v_base.familia_color;
    new.hex := v_base.hex;
  end loop;

  return new;
end;
$$;

create or replace trigger colores_valida_componentes
  before insert or update of componentes, familia_color, hex on retail.colores
  for each row execute function retail.fn_colores_valida_componentes();

-- ---------- 3. Buscar o crear una mezcla ----------
-- Devuelve el color (las mismas columnas que lee «Nuevo color») y `creado`: si la mezcla ya existía, la
-- devuelve tal cual. Los errores hablan en español: la pantalla los muestra como vienen.
create or replace function retail.color_combinado(p_componentes text[])
returns jsonb
language plpgsql
security invoker
set search_path = retail, public, extensions
as $$
declare
  v_comp text[];
  v_existe retail.colores%rowtype;
  v_base retail.colores%rowtype;
  v_nombres text[];
  v_nombre text;
  v_codigo text;
  v_letras text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  v_candidatos text[];
  v_restriccion text;
  v_intento integer;
  i integer;
  j integer;
begin
  if p_componentes is null or cardinality(p_componentes) < 2 or cardinality(p_componentes) > 4 then
    raise exception 'Una mezcla es un color base y de 1 a 3 que lo acompañan.' using errcode = 'P0001';
  end if;

  v_comp := array(select upper(btrim(x)) from unnest(p_componentes) with ordinality as t(x, n) order by n);
  v_comp := array[v_comp[1]] || array(select x from unnest(v_comp[2:]) as x order by x);

  if (select count(distinct x) from unnest(v_comp) as x) <> cardinality(v_comp) then
    raise exception 'Un color está repetido en la mezcla.' using errcode = 'P0001';
  end if;

  -- ¿Ya existe?
  for v_existe in select * from retail.colores c where c.componentes = v_comp loop
    if not v_existe.activo then
      raise exception '«%» existe pero está desactivado: pídele a un líder que lo reactive en Catálogo ▸ Atributos.', v_existe.nombre using errcode = 'P0001';
    end if;
    return to_jsonb(v_existe) || jsonb_build_object('creado', false);
  end loop;

  -- Cada color tiene que existir, estar activo y ser de un solo tono.
  for i in 1 .. cardinality(v_comp) loop
    if not exists (select 1 from retail.colores c where c.codigo = v_comp[i]) then
      raise exception 'El color % no existe.', v_comp[i] using errcode = 'P0001';
    end if;
    if exists (select 1 from retail.colores c where c.codigo = v_comp[i] and not c.activo) then
      raise exception 'El color % está desactivado: no puede ir en una mezcla.', v_comp[i] using errcode = 'P0001';
    end if;
    if exists (select 1 from retail.colores c where c.codigo = v_comp[i] and c.componentes is not null) then
      raise exception 'El color % ya es una mezcla: arma la mezcla con sus colores sueltos.', v_comp[i] using errcode = 'P0001';
    end if;
  end loop;

  for v_base in select * from retail.colores c where c.codigo = v_comp[1] loop end loop;

  -- El nombre: «Hueso con azul», «Hueso con azul y negro», «Hueso con azul, negro y rojo».
  v_nombres := array(
    select lower(left(c.nombre, 1)) || substr(c.nombre, 2)
    from unnest(v_comp[2:]) with ordinality as t(x, n)
    join retail.colores c on c.codigo = t.x
    order by t.n
  );
  v_nombre := v_base.nombre || ' con ' || case
    when cardinality(v_nombres) = 1 then v_nombres[1]
    else array_to_string(v_nombres[1:cardinality(v_nombres) - 1], ', ') || ' y ' || v_nombres[cardinality(v_nombres)]
  end;

  for v_intento in 1 .. 3 loop
    -- El código: 3 letras libres que empiecen como la base («HAZ», «HUA»…); si no, la inicial de la base y dos letras libres.
    v_candidatos := array[
      left(v_comp[1], 1) || left(v_comp[2], 2),
      left(v_comp[1], 2) || left(v_comp[2], 1),
      left(v_comp[1], 1) || substr(v_comp[2], 2, 2),
      left(v_comp[1], 1) || left(v_comp[2], 1) || coalesce(left(v_comp[3], 1), substr(v_comp[2], 3, 1))
    ];
    v_codigo := (select c from unnest(v_candidatos) as c
                 where c ~ '^[A-Z]{3}$' and not exists (select 1 from retail.colores x where x.codigo = c) limit 1);
    if v_codigo is null then
      <<buscar>>
      for i in 1 .. 26 loop
        for j in 1 .. 26 loop
          v_codigo := left(v_comp[1], 1) || substr(v_letras, i, 1) || substr(v_letras, j, 1);
          exit buscar when not exists (select 1 from retail.colores x where x.codigo = v_codigo);
          v_codigo := null;
        end loop;
      end loop;
    end if;
    if v_codigo is null then
      raise exception 'No quedan códigos libres que empiecen con %.', left(v_comp[1], 1) using errcode = 'P0001';
    end if;

    begin
      insert into retail.colores (codigo, nombre, familia_color, tipo, hex, orden, componentes)
      values (v_codigo, v_nombre, v_base.familia_color, v_base.tipo, v_base.hex, 2000, v_comp)
      returning * into v_existe;
      return to_jsonb(v_existe) || jsonb_build_object('creado', true);
    exception when unique_violation then
      get stacked diagnostics v_restriccion = constraint_name;
      -- Otra persona creó la misma mezcla en este instante: se devuelve la suya.
      for v_existe in select * from retail.colores c where c.componentes = v_comp loop
        return to_jsonb(v_existe) || jsonb_build_object('creado', false);
      end loop;
      if v_restriccion = 'colores_clave_unica' then
        raise exception 'Ya hay un color que se llama «%». Elígelo en vez de armar la mezcla.', v_nombre using errcode = 'P0001';
      end if;
      -- Si no, chocó el código: se vuelve a buscar uno libre.
    end;
  end loop;

  raise exception 'No se pudo crear la mezcla. Vuelve a intentarlo.' using errcode = 'P0001';
end;
$$;

revoke all on function retail.color_combinado(text[]) from public, anon;
grant execute on function retail.color_combinado(text[]) to authenticated;
