-- ============================================================================
-- 20261104003000_prenda_al_recibir_sin_tela_ni_web.sql — CAYLA V2 · ADR-0393 (act. 2026-11-03)
-- Recibir: crear la prenda que llegó pide solo lo que hace falta para contarla y venderla, y no la publica.
--
-- EL PROBLEMA PRIMERO. Probando un envío sin aviso (`/flujo-de-negocio`, 2026-11-03), la hoja exigía tejido y patrón y no dejaba decir «no sé»:
-- una blusa de encaje salió marcada «Liso». Además, la prenda quedaba publicada en la tienda web con el precio y los datos de ese apuro, y un
-- nombre como «Polo a rayas» se guardaba «Polo A Rayas».
--
-- QUÉ CAMBIA (Felipe, 2026-11-03)
--   1. `crear_producto_con_variantes`: con la marca de transacción `retail.alta_al_recibir`, tejido y patrón no se exigen. Se completan después en
--      Editar producto, que ya los lista en «Lo que falta». El elegido se comprueba como siempre (tiene que ser de la categoría).
--   2. `fn_vitrina_producto_nuevo_visible`: lo creado al recibir no decide su vitrina, y `preparar_prenda_al_recibir` le deja la fila oculta. Como una
--      fila que ya existe no se pisa, tampoco se publica cuando un líder aprueba la prenda. Cambia, solo para este camino, la regla del 2026-10-19.
--   3. `fn_titulo_referencia`: «a» es un conector, como «de» o «con».
--
-- LO QUE NO CAMBIA
--   · Nuevo producto y Editar producto: tejido y patrón siguen como estaban, y lo que crea un líder ahí sigue saliendo en la web.
--   · Los nombres que ya están guardados: el disparador corre solo cuando cambia el nombre.
--
-- DESCARTÉ
--   · Un parámetro nuevo en `crear_producto_con_variantes`: cambiar su firma obliga a tocar a quienes la llaman. La marca de transacción ya existe y
--     solo la pone `preparar_prenda_al_recibir`, después de comprobar el módulo.
--   · Publicar y despublicar en el mismo paso: dejaría en la actividad un «se muestra en la web» que nunca pasó.
--   · Guardar el nombre tal como se escribió: el formato único del catálogo vale para todas las pantallas. Eso lo decide Felipe aparte.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). UNA parte, sin políticas ni `drop trigger` (ADR-0195), idempotente.
-- ============================================================================

set lock_timeout = '3s';

create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
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
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición viva.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ---------- 1. Al recibir, tejido y patrón son opcionales ----------
select pg_temp.reemplazar('retail.crear_producto_con_variantes(text,uuid,jsonb,text,uuid,uuid,uuid,boolean,uuid[],uuid,uuid)',
$v$  if coalesce(v_exige, false) then$v$,
$n$  -- Al recibir, solo el precio es obligatorio (20261104003000): tejido y patrón se completan después en Editar producto.
  if coalesce(v_exige, false) and coalesce(current_setting('retail.alta_al_recibir', true), '') <> 'si' then$n$,
1);

-- ---------- 2. Lo creado al recibir no sale solo en la web ----------
select pg_temp.reemplazar('retail.fn_vitrina_producto_nuevo_visible()',
$v$  -- Quién lo da de alta: el líder que lo creó, o quien lo aprobó si nació pendiente.$v$,
$n$  -- Lo creado al recibir no se publica solo (20261104003000): su fila oculta la deja preparar_prenda_al_recibir.
  if coalesce(current_setting('retail.alta_al_recibir', true), '') = 'si' then
    return new;
  end if;

  -- Quién lo da de alta: el líder que lo creó, o quien lo aprobó si nació pendiente.$n$,
1);

select pg_temp.reemplazar('retail.preparar_prenda_al_recibir(uuid,uuid,uuid,uuid,uuid,text,jsonb,numeric,text,uuid,uuid,boolean,uuid,uuid)',
$v$    perform set_config('retail.alta_al_recibir', '', true);
  else
    v_producto_id := p_producto_id;$v$,
$n$    perform set_config('retail.alta_al_recibir', '', true);
    -- La fila oculta se queda aunque un líder apruebe la prenda: una fila que ya existe no se pisa (20261104003000).
    insert into retail.vitrina_productos (producto_id, publicado, creado_por, actualizado_por)
    values (v_producto_id, false, v_actor, v_actor)
    on conflict (producto_id) do nothing;
  else
    v_producto_id := p_producto_id;$n$,
1);

-- ---------- 3. «a» es un conector ----------
select pg_temp.reemplazar('retail.fn_titulo_referencia(text)',
$v$array['de', 'del', 'la', 'las', 'el', 'los', 'con', 'y', 'e', 'o', 'en', 'al', 'para', 'por', 'sin']$v$,
$n$array['a', 'de', 'del', 'la', 'las', 'el', 'los', 'con', 'y', 'e', 'o', 'en', 'al', 'para', 'por', 'sin']$n$,
1);

-- ---------- 4. Comprobación ----------
do $$
begin
  if position('(20261104003000)' in pg_get_functiondef('retail.crear_producto_con_variantes(text,uuid,jsonb,text,uuid,uuid,uuid,boolean,uuid[],uuid,uuid)'::regprocedure)) = 0 then
    raise exception 'crear_producto_con_variantes sigue exigiendo tejido y patrón al recibir';
  end if;
  if position('(20261104003000)' in pg_get_functiondef('retail.fn_vitrina_producto_nuevo_visible()'::regprocedure)) = 0 then
    raise exception 'fn_vitrina_producto_nuevo_visible sigue publicando lo creado al recibir';
  end if;
  if position('(20261104003000)' in pg_get_functiondef('retail.preparar_prenda_al_recibir(uuid,uuid,uuid,uuid,uuid,text,jsonb,numeric,text,uuid,uuid,boolean,uuid,uuid)'::regprocedure)) = 0 then
    raise exception 'preparar_prenda_al_recibir no dejó la fila oculta de la vitrina';
  end if;
  if retail.fn_titulo_referencia('polo a rayas') <> 'Polo a Rayas' then
    raise exception 'fn_titulo_referencia no tomó «a» como conector';
  end if;
end;
$$;

reset lock_timeout;
