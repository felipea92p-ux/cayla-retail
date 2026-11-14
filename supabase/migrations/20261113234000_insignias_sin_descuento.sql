-- ============================================================================
-- 20261113234000 — Una insignia nunca baja el precio: las que lo bajaban pasan a campañas (ADR-0655, actividad 5; Felipe 2026-11-13)
--
-- EL PROBLEMA. «Insignias» y «Campañas» son la misma tabla (`etiquetas`, ADR-0473) y cualquiera de las dos podía tener su descuento de
--   siempre (`descuento_pct`). Felipe no encontraba los descuentos dentro de Insignias y decidió la regla de la maqueta
--   (`docs/maquetas/campanas-y-ofertas-2026-11/`): «¿cambia lo que paga el cliente? → Campañas y ofertas. ¿Solo dice algo de la prenda?
--   → Insignias». En producción, al 2026-11-13, cuatro insignias bajaban el precio: «Para liquidar» (−15 %, 1.251 prendas, una tienda,
--   hasta el 31 dic), «Top ventas» (−20 %, 3, hasta el 31 dic), «Prendas de 10%» (−10 %, 37 tallas, una tienda, hasta el 12 dic) y
--   «Sorteo» (−100 %, 1, sin fechas).
--
-- LO QUE HACE.
--   1. Toda etiqueta con descuento que no es campaña pasa a ser campaña (`estilo = 'campana'`), con todo lo demás igual: el mismo %, las
--      mismas prendas marcadas y categorías, las mismas tiendas (`campana_sedes`) y las mismas fechas. El cliente paga exactamente lo mismo:
--      la caja (`fn_campanas_en_sede`) lee el descuento de siempre sin mirar el estilo. Felipe decidió (2026-11-13) que las cuatro pasan
--      —también «Top ventas» y «Prendas de 10%»— y que «Para liquidar» conserva su fin del 31 dic (sin fecha de fin habría seguido con
--      −15 % desde el 1 de enero). «Sorteo» ya no tenía fechas: queda como campaña sin fecha de fin.
--   2. El candado: `etiquetas_descuento_solo_campana`, un descuento solo en una campaña. Una insignia que intente tener uno (por cualquier
--      camino) se rechaza.
--   3. «Anunciar en la portada» (`etiquetas.anunciar_en_portada`, Felipe 2026-11-13): la portada de la tienda online anuncia la campaña que
--      termina primero (`fn_campana_portada`) y hasta hoy dejaba fuera a estas cuatro por ser insignias. Como campañas entrarían («Prendas de
--      10%» desde que se pegue, «Sorteo» −100 % desde enero si queda sola). Cada campaña dice ahora si se anuncia: las cuatro nacen apagadas
--      (la portada queda como hoy) y las demás encendidas (como siempre). Se cambia con `fijar_anuncio_campana`, quien tiene la llave de las
--      campañas, desde «Cambiar nombre, ícono o fechas».
--
-- QUÉ CAMBIA DE PASO. Las cuatro se ven en Catálogo ▸ Campañas y ofertas y no en Insignias, con el sello de campaña; y las tres con fechas
--   cuentan como campañas donde se listan campañas con fechas (Finanzas y el plan de compra). Nada se borra.
--
-- DESCARTÉ: convertir su descuento en una oferta: una oferta necesita fecha de fin (hasta un año) y «Sorteo» no tiene; el descuento de siempre
--   de una campaña cobra lo mismo, sin tocar nada de la caja.
-- DESCARTÉ: quitarles el descuento: el cliente pagaría más (Felipe eligió que pasen a campañas).
--
-- ESTADO QUE NUNCA DEBE EXISTIR (lo cierra el esquema): una insignia (estilo distinto de «campana») con descuento.
--
-- CÓMO SE PEGA. Una sola parte, idempotente, `lock_timeout` 3 s: una columna nueva con valor por defecto, un `update` de datos, un `alter
--   table … add constraint`, un reemplazo anclado de `fn_campana_portada` y una función (sin políticas ni disparadores, ADR-0195). Camino de vuelta: `alter table retail.etiquetas drop constraint etiquetas_descuento_solo_campana;` y devolverles su
--   estilo de antes (`urgencia` a las tres de rotación, `neutral` a «Sorteo»), que esta migración deja escrito en el NOTICE.
-- CAÍDA EXTERNA. Nada llama a la red.
-- PRUEBA. `pnpm pruebas:insignias-sin-descuento`.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- 0. La columna de «Anunciar en la portada» (sí, por defecto: las campañas de siempre se siguen anunciando).
alter table retail.etiquetas add column if not exists anunciar_en_portada boolean not null default true;

comment on column retail.etiquetas.anunciar_en_portada is
  'ADR-0655 (Felipe 2026-11-13): si la portada de la tienda online puede anunciar esta campaña (fn_campana_portada). Solo cuenta en una campaña. Las cuatro insignias con descuento que pasaron a campañas el 2026-11-13 nacieron apagadas.';

-- 1. Las insignias con descuento pasan a campañas, sin anunciarse en la portada (dice cuáles y su estilo de antes, para el camino de vuelta).
do $$
declare
  v record;
begin
  for v in
    update retail.etiquetas e
       set estilo = 'campana', anunciar_en_portada = false
      from (select id, estilo as antes from retail.etiquetas where descuento_pct is not null and estilo <> 'campana') x
     where e.id = x.id
    returning e.nombre, x.antes, e.descuento_pct
  loop
    raise notice 'Pasa a campaña: «%» (era %, −% %%)', v.nombre, v.antes, v.descuento_pct;
  end loop;
end;
$$;

-- 2. El candado: un descuento, solo en una campaña.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'retail.etiquetas'::regclass and conname = 'etiquetas_descuento_solo_campana') then
    alter table retail.etiquetas
      add constraint etiquetas_descuento_solo_campana check (descuento_pct is null or estilo = 'campana');
  end if;
end;
$$;

comment on constraint etiquetas_descuento_solo_campana on retail.etiquetas is
  'ADR-0655 (Felipe 2026-11-13): una insignia describe la prenda y nunca baja el precio; un descuento de siempre solo lo tiene una campaña. Lo que cambia lo que paga el cliente vive en Catálogo ▸ Campañas y ofertas.';

-- 3. La portada anuncia solo las campañas que dicen que sí.
create or replace function pg_temp.reemplazar_anclado(p_firma text, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n = 0 and position(p_nuevo in v_def) > 0 then
    return;
  end if;
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición real.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

select pg_temp.reemplazar_anclado(
  'retail.fn_campana_portada()',
  $v$     and e.activo
     and x.pct > 0$v$,
  $n$     and e.activo
     and e.anunciar_en_portada -- ADR-0655: la campaña dice si se anuncia
     and x.pct > 0$n$
);

-- 4. Encender o apagar el anuncio de una campaña.
create or replace function retail.fijar_anuncio_campana(p_etiqueta_id uuid, p_anunciar boolean)
returns void
language plpgsql
security definer
set search_path to 'retail', 'public'
as $function$
begin
  if not retail.fn_puede_campanas() then
    raise exception 'Cambiar si una campaña se anuncia necesita el módulo «Campañas», «Campañas de la tienda web» o «Insignias» en tu rol.' using errcode = '42501';
  end if;
  if p_anunciar is null then
    raise exception 'Di si la campaña se anuncia en la portada o no.';
  end if;
  if not exists (select 1 from retail.etiquetas where id = p_etiqueta_id and estilo = 'campana') then
    raise exception 'Solo una campaña se anuncia en la portada. Recarga la pantalla.';
  end if;
  update retail.etiquetas set anunciar_en_portada = p_anunciar where id = p_etiqueta_id and anunciar_en_portada is distinct from p_anunciar;
end;
$function$;

comment on function retail.fijar_anuncio_campana(uuid, boolean) is
  'ADR-0655. Enciende o apaga «Anunciar en la portada» de una campaña (fn_campana_portada). Quien tiene la llave de las campañas.';

revoke all on function retail.fijar_anuncio_campana(uuid, boolean) from public, anon;
grant execute on function retail.fijar_anuncio_campana(uuid, boolean) to authenticated;
