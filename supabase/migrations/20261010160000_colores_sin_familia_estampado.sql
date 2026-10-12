-- ============================================================================
-- 20261010160000 — Colores: «Estampado» deja de ser una familia (ADR-0312, actualización 2026-10-10)
--
-- EL PROBLEMA
--   La lista de familias de color tenía 11 filas y la última, «Estampado», no es un color: un
--   estampado no tiene un tono, es un dibujo, y los dibujos viven en Patrones (ADR-0106). En el
--   combo «Familia» de Atributos ▸ Colores aparecía al lado de Verde y Azul, y quien creaba un
--   color tenía que decidir si «Rayas azules» era Azul o Estampado. Felipe (2026-10-10): «estampado
--   no existe, ya no existe».
--
-- DECIDÍ
--   · Salen de 11 a 10 familias: `neutro, tierra, rosado, rojo, naranja, amarillo, verde, azul,
--     morado, metalico`. En la web la lista vive en `lib/colores-familias.ts`; este archivo cambia
--     solo el candado de la base y los datos que lo incumplían.
--   · Las 3 filas que la usaban (EST Estampado, MUL Multicolor, ANI Animal print) NO se borran:
--     se archivan (`activo = false`, el mismo botón «Desactivar» de la pantalla) y quedan SIN
--     familia (`familia_color` admite nulo). Estaban «aprobadas» pero con el hex de relleno
--     #c9b79c —un beige que no significaba nada— y, medido en producción el 2026-10-10, con
--     0 variantes, 0 prendas por regularizar, 0 fotos y 0 temporadas: nadie las usó nunca.
--   · Un Líder las puede reactivar desde Atributos ▸ Colores y elegirles una familia real.
-- DESCARTÉ
--   · Dejarlas activas sin familia: seguirían saliendo en la carta de Nuevo producto como un
--     círculo beige, bajo «Sin familia», y alguien las elegiría creyendo que son un color.
--   · Reasignarlas a Neutro: una mentira de datos. Multicolor no es neutro.
--   · `delete`: regla del repo, nunca se borra un catálogo con historial.
-- SE ROMPE SI
--   · Se pega ANTES de fusionar la web: la web vieja todavía ofrece «Estampado» en el combo y, si
--     alguien lo elige, el candado nuevo rechaza el guardado. Orden: primero la web, después esto
--     (al revés que `20261002180000`, porque aquí el candado nuevo acepta MENOS, no más).
--   · Alguna de las 3 filas ya tiene variantes cuando se pega: la guarda de abajo corta con un
--     mensaje que lo dice y no se aplica nada (todo va en una transacción).
--
-- IDEMPOTENTE: el `update` solo toca filas que siguen en 'estampado', y el candado se suelta y
-- se vuelve a crear. Sin políticas: se pega entero en el SQL Editor (un `alter` sobre `colores`
-- sin `create policy` en la misma transacción, ver CLAUDE.md).
--
-- DESHACER (los colores archivados vuelven con su familia vieja):
--   alter table retail.colores drop constraint if exists colores_familia_color_check;
--   alter table retail.colores add constraint colores_familia_color_check check (familia_color in
--     ('neutro','tierra','rosado','rojo','naranja','amarillo','verde','azul','morado','metalico','estampado'));
--   update retail.colores set familia_color = 'estampado', activo = true where codigo in ('EST','MUL','ANI');
-- ============================================================================

set lock_timeout = '3s';

-- ---------- 1. Guarda: si alguna de las 3 filas ya se usa, no se archiva ----------
do $$
declare
  v_en_uso integer;
begin
  v_en_uso := (
    select count(*)
    from retail.variantes v
    join retail.colores c on c.codigo = v.color_codigo
    where c.familia_color = 'estampado'
  ) + (
    select count(*)
    from retail.prendas_por_regularizar p
    join retail.colores c on c.codigo = p.color_codigo
    where c.familia_color = 'estampado'
  );
  if v_en_uso > 0 then
    raise exception 'Hay % variantes o prendas por regularizar con un color de la familia Estampado: muévelas a un color real antes de quitar la familia', v_en_uso
      using errcode = 'P0001';
  end if;
end;
$$;

-- ---------- 2. Las 3 filas se archivan y quedan sin familia ----------
update retail.colores
set familia_color = null,
    activo = false
where familia_color = 'estampado';

-- ---------- 3. El candado: 10 familias ----------
alter table retail.colores drop constraint if exists colores_familia_color_check;
alter table retail.colores
  add constraint colores_familia_color_check check (familia_color in
    ('neutro', 'tierra', 'rosado', 'rojo', 'naranja', 'amarillo', 'verde', 'azul', 'morado', 'metalico'));
