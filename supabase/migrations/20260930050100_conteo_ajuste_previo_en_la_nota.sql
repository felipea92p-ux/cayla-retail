-- ============================================================================
-- 20260930050100_conteo_ajuste_previo_en_la_nota.sql — CAYLA V2 · Inventario > Conteo: al editar un conteo cerrado, la nota
-- «Al abrir: N» explica también lo que el PROPIO cierre ajustó (2026-09-30)
-- UNA sola parte (un índice y una función reescrita; sin políticas ni `drop trigger`; idempotente).
-- RENOMBRADA el 2026-09-30 desde `20260930050000_conteo_ajuste_previo_en_la_nota.sql`: esa versión la tomó también
-- `20260930050000_terminales_pasan_la_puerta_de_lectura.sql` (PR #642, ya pegada en producción como `20260930143821`), y
-- dos archivos con la misma versión rompen `supabase start` desde cero (llave duplicada en `schema_migrations`). Esta aún
-- no estaba en producción, por eso se movió esta y no la otra. El SQL de abajo es el mismo: solo cambió el nombre.
--
-- EL PROBLEMA PRIMERO. Conteo 13: la camisa tenía 1, no se encontró, se contó 0 y el cierre descontó 1 (stock 0). Después la
-- encuentran, el líder pulsa «Editar conteo» y cuenta 1. La pantalla decía «Debe haber 0 · Contaste 1 · Hay 1 de más» y, debajo,
-- «Al abrir: 1 · salió 1 durante el conteo». Falso: nadie la vendió; el que la sacó fue el ajuste del cierre. La persona no
-- entiende por qué el «debe haber» pasó de 1 a 0 y no puede saber que fue por su propio conteo.
--
-- DECIDÍ
--   · `fn_conteo_lineas_json` devuelve dos números nuevos por línea, salidos de `movimientos` (el libro, que no se edita):
--       `ajustado_total`  = lo que los cierres de ESTE conteo le han sumado (+) o restado (−) a la variante, en total.
--       `ajustado_antes`  = la parte de ese total que YA estaba hecha cuando se leyó el «debe haber» actual: todo, salvo el
--                           ajuste del ÚLTIMO cierre si la línea no se volvió a verificar desde entonces (su «debe haber» se
--                           leyó antes de ese ajuste). Se sabe sin relojes: `cerrar_conteo` escribe `diferencia` y `movimiento_id`
--                           juntos, y `conteo_contar` suelta `diferencia` al volver a verificar. En un conteo que nunca se cerró
--                           es 0, y en una línea reabierta que todavía no se tocó también.
--     Con ellos la pantalla parte lo que cambió desde la foto en dos: «salió/entró N durante el conteo» (lo de otros:
--     ventas, recepciones) = debe_haber − foto − ajustado_antes, y «el cierre de este conteo restó/sumó N» = ajustado_antes.
--     `ajustado_total` existe solo para pintar bien al instante, antes de que conteste la base: al volver a contar, el ajuste
--     de antes pasa a formar parte del «debe haber».
--   · El total se suma por `conteo_item_id` en el libro, no se lee de `conteo_items.movimiento_id`: ese puntero se pisa en cada
--     cierre (y queda NULL si el segundo ajuste fue 0), y con una tercera edición mentiría. El libro no se pisa; el puntero solo
--     sirve para reconocer cuál fue el ÚLTIMO ajuste.
--   · Índice parcial `movimientos_conteo_item_idx` (solo las filas de conteo: son pocas): sin él, cada línea del conteo
--     recorrería todo `movimientos`. Estimado: ~1.100 líneas por conteo; con un millón de movimientos en 3 años serían 1.100
--     recorridos completos por cada apertura de pantalla.
-- DESCARTÉ
--   · Comparar la hora del ajuste con `verificado_en`: `movimientos.created_at` es `now()` = el INICIO de la transacción del
--     cierre, y un cierre que espera el candado de un `conteo_contar` en curso queda con una hora anterior a esa verificación
--     aunque su ajuste sea posterior. Con relojes habría notas falsas de vez en cuando; con `diferencia` no.
--   · Solo cambiar el texto en la web («salió» → «se ajustó»): sin saber cuánto ajustó el cierre, cuando además hubo una venta
--     el mensaje repartiría mal las unidades (culparía a la venta o al conteo por lo que hizo el otro).
--   · Guardar el ajuste previo en una columna nueva de `conteo_items`: un dato derivado más que hay que mantener igual en
--     `cerrar_conteo` y en `conteo_contar`; el libro ya lo tiene.
-- SE ROMPE SI
--   · alguien cambia `cerrar_conteo` para ajustar sin `conteo_item_id`, o con otro `motivo`: el ajuste dejaría de contarse acá;
--   · `conteo_contar` deja de soltar `diferencia` al re-verificar, o `cerrar_conteo` deja de escribir `diferencia` y `movimiento_id`
--     juntos: `ajustado_antes` se descuadra (la nota mostraría «salió N» cuando fue el cierre, o al revés);
--   · la web se publica antes que este SQL: no se cae (los campos faltan y valen 0), pero la nota vuelve a decir «salió N»;
--   · otra función mueve stock de la variante entre el cierre y la nueva cuenta con un ajuste `motivo = 'conteo'` que no es de
--     este conteo: no cuenta (se filtra por `conteo_item_id`).
--
-- PRODUCCIÓN. Pegar tal cual en el SQL Editor (ya trae `retail.`), DESPUÉS de `20260930010100` y `20260930020100`. El índice
-- toma un candado corto sobre `movimientos` (lectura sí, escrituras esperan): hacerlo fuera de la hora de venta.
-- PARA VOLVER: `drop index retail.movimientos_conteo_item_idx;` y volver a pegar `fn_conteo_lineas_json` de `20260930010100`.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

create index if not exists movimientos_conteo_item_idx
  on retail.movimientos (conteo_item_id)
  where conteo_item_id is not null;

create or replace function retail.fn_conteo_lineas_json(
  p_conteo_id uuid,
  p_variante_id uuid default null,
  p_con_item boolean default false
)
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $function$
  select coalesce(jsonb_agg(l.j order by l.variante_id), '[]'::jsonb)
    from (
      select ci.variante_id,
             jsonb_build_object(
               'variante_id', ci.variante_id,
               'debe_haber', ci.cantidad_sistema,
               'foto', coalesce(ci.cantidad_foto, ci.cantidad_sistema),
               'contada', ci.cantidad_contada,
               'anterior', ci.contada_anterior,
               'verificado_en', ci.verificado_en,
               'confirmada_en', ci.confirmada_en,
               'actual', case when c.estado = 'abierto' then coalesce(st.cantidad, 0) end,
               'diferencia', ci.cantidad_contada - ci.cantidad_sistema,
               'ajuste_movimiento_id', ci.movimiento_id,
               'ajustado_total', coalesce(aj.total, 0),
               'ajustado_antes', coalesce(aj.antes, 0),
               'estado', case
                 when ci.cantidad_contada is null and ci.contada_anterior is null then 'pendiente'
                 when ci.cantidad_contada is null then 'en_reconteo'
                 when ci.cantidad_contada = ci.cantidad_sistema then 'correcta'
                 when ci.confirmada_en is null then 'con_diferencia'
                 else 'diferencia_confirmada'
               end
             ) || case when p_con_item then jsonb_build_object('item_id', ci.id) else '{}'::jsonb end as j
        from conteo_items ci
        join conteos c on c.id = ci.conteo_id
        left join lateral (
          select sum(s.cantidad)::integer as cantidad
            from stock s
           where c.estado = 'abierto'
             and s.variante_id = ci.variante_id
             and s.ubicacion_id = c.ubicacion_id
             and (c.sububicacion_id is null or s.sububicacion_id = c.sububicacion_id)
        ) st on true
        left join lateral (
          select sum(m.cantidad)::integer as total,
                 (sum(m.cantidad) filter (where ci.diferencia is null or m.id is distinct from ci.movimiento_id))::integer as antes
            from movimientos m
           where m.conteo_item_id = ci.id
             and m.tipo = 'ajuste'
             and m.motivo = 'conteo'
        ) aj on true
       where ci.conteo_id = p_conteo_id
         and (p_variante_id is null or ci.variante_id = p_variante_id)
         and not (ci.cantidad_contada is null and coalesce(ci.cantidad_foto, 0) = 0 and ci.contada_anterior is null)
    ) l;
$function$;

revoke all on function retail.fn_conteo_lineas_json(uuid, uuid, boolean) from public, anon, authenticated;

comment on function retail.fn_conteo_lineas_json(uuid, uuid, boolean) is
  'Las líneas de un conteo con su estado derivado (pendiente, correcta, con_diferencia, en_reconteo, diferencia_confirmada). '
  'Regla única de estados en SQL. Trae también ajustado_total (lo que los cierres de este conteo ya sumaron o restaron a la '
  'variante, del libro de movimientos) y ajustado_antes (la parte ya hecha cuando se leyó el «debe haber» actual; no cuenta el ajuste '
  'del último cierre mientras la línea no se vuelva a verificar): con ellos la '
  'pantalla separa «salió N durante el conteo» de «el cierre de este conteo restó N». Sin permisos propios: solo la llaman '
  'funciones security definer que ya los validaron; no se expone a la web.';
