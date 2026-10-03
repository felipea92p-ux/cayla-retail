-- ============================================================================
-- 20261003190000 — Colores: descripción y «combina con» (ADR-0316), parte 1 de 2: la estructura
--
-- EL PROBLEMA
--   El catálogo de colores dice cómo se llama un color, su familia, su tono y su Pantone, pero no
--   qué transmite ni con qué se lleva. Eso es lo que una asesora le dice a una cliente («el verde
--   botella queda muy bien con crema y dorado») y vivía solo en la cabeza de quien atiende. Además,
--   «qué colores se piden juntos» es la base de cualquier lectura de tendencias del catálogo.
--
-- DECIDÍ (Felipe pidió «una descripción de las virtudes del color y con qué se combina bien»)
--   · `descripcion text`: qué transmite el color y dónde funciona, en una o dos frases (hasta 300
--     caracteres). Vive en la base, no en el código: un Líder la corrige sin deploy.
--   · `combina_con text[]`: los CÓDIGOS de otros colores con los que se lleva bien (hasta 8). Mismo
--     patrón que `sinonimos text[]` (ADR-0215): una columna, sin tabla aparte, sin políticas nuevas
--     (colores ya tiene las suyas: insertar cualquiera, editar solo un Líder).
--   · Un disparador (`colores_valida_combina_con`) hace IMPOSIBLE el estado inválido: un código que
--     no existe, repetido, o el del propio color. Un candado de la base vale más que una validación
--     en la pantalla (CLAUDE.md, estados imposibles).
-- DESCARTÉ
--   · Una tabla `colores_combinaciones (a, b)` con llaves foráneas: integridad perfecta, pero 2 piezas
--     más (RLS, API, pruebas de políticas) para ~450 filas que casi nunca cambian; los sinónimos ya
--     se resolvieron como columna (ADR-0215) y aquí rige el mismo argumento. Los colores no se borran
--     (se desactivan), así que un código válido hoy sigue siéndolo.
--   · Calcular las combinaciones con teoría del color: da listas correctas y sosas (el ensayo previo
--     repetía «Chocolate» y «Celeste» con todo y proponía azul eléctrico con amarillo limón). El
--     criterio de estilismo es dato, no fórmula.
--   · Simetría obligatoria (si A combina con B, B con A): «el rojo va con el negro» no implica que el
--     negro liste al rojo como primera opción; cada color guarda su propia recomendación.
-- SE ROMPE SI
--   · Alguien escribe un código con minúsculas o con espacio: el disparador lo rechaza con el nombre
--     del código; la pantalla lo normaliza antes de enviar.
--   · Se desactiva un color que otros recomiendan: sigue existiendo, así que sigue siendo válido, pero
--     la pantalla no debería ofrecerlo como compañero (la web filtra los activos al mostrarlo).
--
-- IDEMPOTENTE: columnas con `if not exists`, restricciones verificadas antes de crearse, función con
-- `create or replace` y disparador con `create or replace trigger` (nunca `drop trigger`: en Supabase
-- toma en exclusiva tablas de `auth` y `storage`, ver CLAUDE.md). Sin políticas: se pega entera.
-- ============================================================================

set lock_timeout = '3s';

alter table retail.colores add column if not exists descripcion text;
alter table retail.colores add column if not exists combina_con text[] not null default '{}';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'colores_descripcion_largo') then
    alter table retail.colores
      add constraint colores_descripcion_largo check (descripcion is null or char_length(descripcion) between 1 and 300);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'colores_combina_con_maximo') then
    alter table retail.colores
      add constraint colores_combina_con_maximo check (cardinality(combina_con) <= 8);
  end if;
end;
$$;

comment on column retail.colores.descripcion is
  'Qué transmite el color y dónde funciona (1-2 frases, hasta 300 caracteres). Lo usa la asesora para recomendar. Null = sin escribir.';
comment on column retail.colores.combina_con is
  'Códigos de OTROS colores con los que se lleva bien (hasta 8). El disparador colores_valida_combina_con rechaza uno que no exista, repetido o el propio.';

create or replace function retail.fn_colores_valida_combina_con()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_malo text;
begin
  if new.combina_con is null then
    new.combina_con := '{}';
  end if;

  if new.codigo = any (new.combina_con) then
    raise exception 'Un color no combina consigo mismo (%).', new.codigo using errcode = '23514';
  end if;

  select x into v_malo
  from unnest(new.combina_con) as x
  group by x
  having count(*) > 1
  limit 1;
  if v_malo is not null then
    raise exception 'El color % está repetido en «combina con».', v_malo using errcode = '23514';
  end if;

  select x into v_malo
  from unnest(new.combina_con) as x
  where not exists (select 1 from retail.colores c where c.codigo = x)
  limit 1;
  if v_malo is not null then
    raise exception 'El color % no existe, no puede ir en «combina con».', v_malo using errcode = '23503';
  end if;

  return new;
end;
$$;

create or replace trigger colores_valida_combina_con
  before insert or update of combina_con on retail.colores
  for each row execute function retail.fn_colores_valida_combina_con();
