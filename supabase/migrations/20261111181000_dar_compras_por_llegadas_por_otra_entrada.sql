-- ============================================================================
-- 20261111181000 — Dar una compra por llegada cuando su mercadería entró por otra puerta («Nuevo producto», ajustes) (ADR-0636, act. 2026-11-11 d)
--
-- EL PROBLEMA PRIMERO. ENV-002 de Trujillo lleva seis compras del 28-oct (163 prendas, S/ 4,293) y quedó en «Seguir recibiendo» con 154 contadas.
-- Sus prendas ya están en la tienda desde el 29-oct, pero no por una recepción: entraron con «Nuevo producto» («Llegó con el alta del producto») y
-- con ajustes («Stock inicial de una variante nueva», «ingreso de mercadería», «Mercadería nueva»): Ivanana 39 de 39, Lalesh New 44 de 44, Moda Mia
-- 9 de 9, nervus 23 de 24, Strend 7, Matic Moda 35 de 40. Si alguien cierra ENV-002 contando, entran 154 prendas dos veces. `unir_recepcion_con_compra`
-- no sirve: une con una recepción «sin aviso», y aquí no hay ninguna.
--
-- LA DECISIÓN (Felipe, 2026-11-11: «busca la mejor solución, que todo quede cuadrado y no malograr otras cosas»).
--   · La misma tabla de uniones (`compra_papel_llegadas`) guarda también «llegó por otra entrada»: sin recepción (`despacho_id` vacío) y con su
--     nota. Así TODOS los candados que ya existen la reconocen sin tocarlos: no se vuelve a mandar (`fn_compra_item_por_mandar`, el tope de
--     `despacho_items`), no se anula ni se edita (`fn_compra_unida_no_se_cambia`), no sale «por enviar» ni «Llegó esta orden» (20261111165000) y el
--     Balance la ve «en la tienda».
--   · `dar_compras_por_llegadas(papeles, motivo)`: solo un Admin, con motivo. Anula los envíos de Compras de esas compras (lo contado queda como
--     historia, como en la unión) y, si un envío llevaba otras compras, nace otro en camino con ellas. Se niega si por esos envíos ya entró algo.
--   · LOS LIBROS NO SE TOCAN: esa mercadería entró antes del arranque contable (1-nov) y ya está en el inventario de apertura; estas seis compras
--     son los «6 papeles de antes del arranque» que ADR-0636 dejó para decidir con el contador. Por eso el papel NO pasa solo al libro
--     (`fn_papel_pasa_solo` lo salta) y ninguna cifra del Balance cambia. Pasarlo ahora contaría la mercadería dos veces en los libros.
-- QUÉ NO CAMBIA. Stock, movimientos, costos, montos del Balance ni la unión con una recepción «sin aviso».
--
-- PRODUCCIÓN. DOS PARTES, por separado y en orden (ADR-0195): PARTE 1 (la tabla: dos columnas y un check; sin políticas; la tabla solo la leen
--   funciones `security definer`), PARTE 2 (funciones). Re-ejecutables. Los reemplazos anclados abortan si su texto no aparece exactamente una vez.
-- VERIFICACIÓN (solo lectura): select to_regprocedure('retail.dar_compras_por_llegadas(uuid[],text)') is not null;
-- CÓMO SE DESHACE (solo sin filas con `via = 'otra_entrada'`): drop function retail.dar_compras_por_llegadas(uuid[],text); volver a pegar
--   `fn_papel_llegada_reparte` y `fn_papel_pasa_solo` de 20261110011000. Las columnas pueden quedarse.
-- ============================================================================

-- ════════════════════════════════════════ PARTE 1 · la tabla ════════════════════════════════════════
set search_path = retail, public, extensions;
set lock_timeout = '3s';

alter table retail.compra_papel_llegadas alter column despacho_id drop not null;
alter table retail.compra_papel_llegadas add column if not exists via text not null default 'recepcion';
alter table retail.compra_papel_llegadas add column if not exists nota text;
do $check$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'retail.compra_papel_llegadas'::regclass and conname = 'compra_papel_llegadas_via') then
    alter table retail.compra_papel_llegadas add constraint compra_papel_llegadas_via check (
      (via = 'recepcion' and despacho_id is not null)
      or (via = 'otra_entrada' and despacho_id is null and length(btrim(coalesce(nota, ''))) >= 10));
  end if;
end $check$;
comment on column retail.compra_papel_llegadas.via is
  'ADR-0636 act. 2026-11-11 d: «recepcion» = llegó por una recepción sin aviso (despacho_id); «otra_entrada» = ya estaba en la tienda por «Nuevo producto» o un ajuste (sin recepción; la nota dice cuál).';

-- ════════════════════════════════════════ PARTE 2 · funciones ════════════════════════════════════════
set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function pg_temp.reemplazar_181(p_firma text, p_viejo text, p_nuevo text, p_marca text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_marca in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> 1 then
    raise exception '% cambió (el ancla aparece % veces): no se reemplaza. Regenera esta migración desde su definición real.', p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ---------- 1. Sin recepción no hay nada que repartir como «recibido antes» ----------
select pg_temp.reemplazar_181(
  'retail.fn_papel_llegada_reparte()',
  '  -- Con la recepción todavía abierta lo llegado puede cambiar: el papel espera a que se cierre.',
  '  -- ADR-0636 act. 2026-11-11 d: llegó por otra entrada («Nuevo producto», un ajuste): no hay recepción de la que repartir.
  if v_l.despacho_id is null then
    return new;
  end if;
  -- Con la recepción todavía abierta lo llegado puede cambiar: el papel espera a que se cierre.',
  'ADR-0636 act. 2026-11-11 d'
);

-- ---------- 2. Una compra dada por llegada por otra entrada no pasa sola al libro ----------
select pg_temp.reemplazar_181(
  'retail.fn_papel_pasa_solo(uuid)',
  '  -- ¿Ya llegó todo a la tienda?',
  '  -- ADR-0636 act. 2026-11-11 d: su mercadería entró por otra puerta que ya pudo asentarse (o es de antes del arranque): no pasa sola,
  -- lo decide Compras con el contador.
  if exists (select 1 from retail.compra_papel_llegadas l where l.papel_id = v_p.id and l.via = ''otra_entrada'') then
    return false;
  end if;
  -- ¿Ya llegó todo a la tienda?',
  'ADR-0636 act. 2026-11-11 d'
);

-- ---------- 3. Dar compras por llegadas ----------
create or replace function retail.dar_compras_por_llegadas(p_papeles uuid[], p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_papeles uuid[];
  v_id uuid;
  v_p retail.compra_papeles%rowtype;
  v_sedes integer;
  v_sede uuid;
  v_prov uuid;
  v_prendas integer;
  v_propio record;
  v_nuevo uuid;
  v_anulados uuid[] := '{}';
  v_nuevos uuid[] := '{}';
  v_descartadas integer := 0;
  v_hechos uuid[] := '{}';
  v_repetidos uuid[] := '{}';
begin
  if retail.fn_es_admin() is not true then
    raise exception 'Dar una compra por llegada sin recepción lo hace un Admin' using errcode = '42501', hint = 'solo_admin';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  if length(v_motivo) < 10 or length(v_motivo) > 300 then
    raise exception 'Escribe por dónde entró la mercadería (de 10 a 300 letras)' using hint = 'llegada_motivo';
  end if;
  v_papeles := array(select distinct x from unnest(coalesce(p_papeles, '{}')) x where x is not null order by x);
  if cardinality(v_papeles) = 0 then
    raise exception 'Falta decir qué compras' using hint = 'llegada_sin_compras';
  end if;

  -- Primero los envíos (el mismo orden que la unión y el cierre del conteo), después los papeles y sus líneas.
  perform 1 from retail.despachos d
   where d.estado in ('en_camino', 'abierto', 'cerrado')
     and exists (select 1 from retail.despacho_items di join retail.orden_compra_items i on i.id = di.orden_compra_item_id
                   join retail.ordenes_compra o on o.id = i.orden_compra_id
                  where di.despacho_id = d.id and o.papel_id = any (v_papeles))
   order by d.id
     for update of d;

  foreach v_id in array v_papeles loop
    v_p := null;
    for v_p in select * from retail.compra_papeles c where c.id = v_id for update loop exit; end loop;
    if v_p.id is null then
      raise exception 'Esa compra no existe' using errcode = 'P0001', hint = 'papel_no_existe';
    end if;
    if exists (select 1 from retail.compra_papel_llegadas l where l.papel_id = v_id) then
      v_repetidos := v_repetidos || v_id;
      continue;
    end if;
    if v_p.estado <> 'por_completar' then
      raise exception 'Esa compra ya no está pendiente' using errcode = 'P0001', hint = 'union_papel_no_pendiente';
    end if;
    select count(distinct o.ubicacion_destino_id), min(o.ubicacion_destino_id::text)::uuid, min(o.proveedor_id::text)::uuid,
           coalesce(sum((select sum(i.cantidad) from retail.orden_compra_items i where i.orden_compra_id = o.id)), 0)::integer
      into v_sedes, v_sede, v_prov, v_prendas
      from retail.ordenes_compra o where o.papel_id = v_id and o.estado <> 'anulada';
    if v_prendas = 0 or v_prov is null then
      raise exception 'Esa compra no tiene prendas anotadas' using errcode = 'P0001', hint = 'papel_sin_prendas';
    end if;
    if v_sedes > 1 then
      raise exception 'Esa compra va a más de una tienda: se resuelve tienda por tienda' using errcode = 'P0001', hint = 'union_varias_sedes';
    end if;
    -- Si por su envío ya entró algo al stock, ahí sí habría stock doble: lo revisa una persona.
    if exists (select 1 from retail.despachos d
                where (d.estado = 'cerrado' or exists (select 1 from retail.despacho_recibidos r where r.despacho_id = d.id))
                  and exists (select 1 from retail.despacho_items di join retail.orden_compra_items i on i.id = di.orden_compra_item_id
                                join retail.ordenes_compra o on o.id = i.orden_compra_id
                               where di.despacho_id = d.id and o.papel_id = v_id)) then
      raise exception 'Por el envío de esa compra ya entró mercadería: no se da por llegada; revísalo con Compras' using errcode = 'P0001', hint = 'union_envio_ya_recibido';
    end if;
    perform 1 from retail.ordenes_compra o where o.papel_id = v_id order by o.id for share;
    perform 1 from retail.orden_compra_items i join retail.ordenes_compra o on o.id = i.orden_compra_id where o.papel_id = v_id order by i.id for update of i;
    insert into retail.compra_papel_llegadas (papel_id, despacho_id, proveedor_id, unido_por, token, prendas_papel, prendas_recibidas, monto_papel,
                                              valor_recibido, via, nota)
    values (v_id, null, v_prov, v_actor, null, v_prendas, v_prendas, v_p.monto, null, 'otra_entrada', left(v_motivo, 300));
    v_hechos := v_hechos || v_id;
  end loop;

  -- Los envíos vivos que llevan alguna de esas compras se anulan; si llevaban otras, nace uno en camino con ellas.
  for v_propio in
    select d.id, d.estado, d.numero, d.numero_guia, d.nota, d.despachado_por, d.bultos, d.ubicacion_destino_id
      from retail.despachos d
     where d.estado in ('en_camino', 'abierto')
       and exists (select 1 from retail.despacho_items di join retail.orden_compra_items i on i.id = di.orden_compra_item_id
                     join retail.ordenes_compra o on o.id = i.orden_compra_id
                    where di.despacho_id = d.id and o.papel_id = any (v_hechos))
     order by d.id
  loop
    v_descartadas := v_descartadas + coalesce((select sum(k.contadas) from retail.despacho_conteos k where k.despacho_id = v_propio.id), 0)::integer;
    if v_propio.estado = 'abierto' then
      perform set_config('retail.cancelando', 'si', true);
    end if;
    begin
      update retail.despachos d
         set estado = 'anulado', anulado_por = v_actor, anulado_en = now(),
             motivo_anulacion = left('Sus compras ya estaban en la tienda por otra entrada: ' || v_motivo, 300)
       where d.id = v_propio.id;
    exception when others then
      perform set_config('retail.cancelando', '', true);
      raise;
    end;
    perform set_config('retail.cancelando', '', true);
    v_anulados := v_anulados || v_propio.id;

    if exists (select 1 from retail.despacho_items di join retail.orden_compra_items i on i.id = di.orden_compra_item_id
                 join retail.ordenes_compra o on o.id = i.orden_compra_id
                where di.despacho_id = v_propio.id and (o.papel_id is null or not (o.papel_id = any (v_hechos)))) then
      insert into retail.despachos (ubicacion_destino_id, numero_guia, nota, despachado_por, bultos)
      values (v_propio.ubicacion_destino_id, v_propio.numero_guia,
              left(concat_ws(' · ', v_propio.nota, 'Reemplaza a la ' || retail.fn_envio_numero_texto(v_propio.numero)), 500),
              v_propio.despachado_por, v_propio.bultos)
      returning id into v_nuevo;
      insert into retail.despacho_items (despacho_id, orden_compra_item_id, compra_item_id, cantidad, categoria_id, marca_id, descripcion, precio_unitario)
      select v_nuevo, di.orden_compra_item_id, di.compra_item_id, di.cantidad, di.categoria_id, di.marca_id, di.descripcion, di.precio_unitario
        from retail.despacho_items di join retail.orden_compra_items i on i.id = di.orden_compra_item_id
        join retail.ordenes_compra o on o.id = i.orden_compra_id
       where di.despacho_id = v_propio.id and (o.papel_id is null or not (o.papel_id = any (v_hechos)))
       order by di.id;
      v_nuevos := v_nuevos || v_nuevo;
    end if;
  end loop;

  if cardinality(v_hechos) > 0 then
    begin
      perform retail.fn_actividad_anotar(
        'recibir', 'compras_dadas_por_llegadas',
        'dio por llegadas ' || cardinality(v_hechos) || ' compra(s) que ya estaban en la tienda por otra entrada',
        v_actor, retail.fn_actividad_terminal_ahora(), v_sede, null,
        'compra_papeles', v_hechos[1]::text, now(),
        jsonb_build_object('papeles', to_jsonb(v_hechos), 'envios_anulados', to_jsonb(v_anulados), 'envios_nuevos', to_jsonb(v_nuevos),
                           'conteos_descartados', v_descartadas, 'motivo', v_motivo),
        'vivo');
    exception when others then
      raise warning 'actividad: no se anotó dar por llegadas % (%)', v_hechos, sqlerrm;
    end;
  end if;

  return jsonb_build_object('hechas', to_jsonb(v_hechos), 'repetidas', to_jsonb(v_repetidos), 'envios_anulados', to_jsonb(v_anulados),
                            'envios_nuevos', to_jsonb(v_nuevos), 'conteos_descartados', v_descartadas);
end $$;
comment on function retail.dar_compras_por_llegadas(uuid[], text) is
  'ADR-0636 act. 2026-11-11 d: da por llegadas compras cuya mercadería ya entró por otra puerta («Nuevo producto», un ajuste). Solo Admin. Anula sus envíos de Compras sin tocar el stock; la compra queda como llegada y NO pasa sola al libro.';
revoke all on function retail.dar_compras_por_llegadas(uuid[], text) from public, anon;
grant execute on function retail.dar_compras_por_llegadas(uuid[], text) to authenticated;

-- ---------- Comprobación ----------
do $comprueba$
begin
  if to_regprocedure('retail.dar_compras_por_llegadas(uuid[],text)') is null
     or position('ADR-0636 act. 2026-11-11 d' in pg_get_functiondef('retail.fn_papel_llegada_reparte()'::regprocedure)) = 0
     or position('ADR-0636 act. 2026-11-11 d' in pg_get_functiondef('retail.fn_papel_pasa_solo(uuid)'::regprocedure)) = 0
     or not exists (select 1 from information_schema.columns where table_schema = 'retail' and table_name = 'compra_papel_llegadas' and column_name = 'via') then
    raise exception 'La migración 20261111181000 no quedó aplicada entera: revisa antes de seguir.';
  end if;
end $comprueba$;

reset lock_timeout;
