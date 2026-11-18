-- ============================================================================
-- 20261026161000_admin_recibe_lo_que_compro.sql — CAYLA V2 · ADR-0517
-- Un Admin puede recibir lo que él mismo compró, y queda a la vista que lo hizo.
--
-- EL PROBLEMA PRIMERO. La decisión 17 de ADR-0362 dice «quien crea la orden de compra no puede recibirla, sin excepción (ni el líder)».
-- Funciona cuando compra una persona y recibe otra, pero Felipe compra y recibe en la misma tienda y su cuenta se quedaba mirando su propio
-- envío con «La recibe otra persona: tú hiciste la orden». Levantar la regla para todo líder (14 personas el 2026-10-10) deja sin control a
-- las encargadas de tienda, que son justo quienes compran (decisión 19). Felipe eligió el escalón de arriba: **solo Admin** (6 personas,
-- ADR-0178), con el rastro visible y sin tocar el Taller todavía.
--
-- QUÉ CAMBIA
--   1. `fn_recepcion_puede_recibir_lo_propio()` (nueva): el ÚNICO lugar donde se dice quién tiene la excepción. Hoy: la cuenta es de un
--      Admin (`fn_es_admin()`: Admin en Dynamic y Líder activo aquí). Se pregunta a la CUENTA, no al responsable del combo (CLAUDE.md,
--      «Módulos y roles»): una terminal nunca la tiene, aunque en el combo se elija a un Admin. Si Dynamic no responde, `fn_es_admin()` da
--      `false` sin error y la regla vuelve a ser la de siempre (principio 9).
--   2. `fn_recepcion_exigir` (el candado de abrir, contar, cerrar, reabrir, precio y observaciones del envío): no frena al Admin que hizo
--      la orden. Los demás —líder o no— siguen frenados, con el mismo error de siempre (`recibir_quien_compro`).
--   3. `recibir_orden_sin_envio` («Llegó esta orden», sin guía): su comprobación propia de «hiciste esta orden» tampoco frena al Admin
--      (reemplazo anclado: se detiene si la definición viva no es la esperada).
--   4. `fn_recepcion_quien_mira()`: sale `null` para el Admin. Las tres lecturas de Recibir (`fn_envios_por_recibir`,
--      `fn_ordenes_directas_por_recibir`, `fn_envio_detalle`) la usan SOLO para marcar `creado_por_mi`, que es lo que bloquea la fila en la
--      pantalla; con esto la pantalla avisa lo mismo que la base hace (sin tocar las tres lecturas). La persona de la cuenta, sin la
--      excepción, ahora es `fn_recepcion_mi_persona()`.
--   5. EL RASTRO, tres cosas que no se pueden olvidar:
--        a. `fn_envio_detalle` trae dos claves nuevas (reemplazo anclado): `compro_quien_mira` (quien mira hizo alguna de las órdenes:
--           la pantalla se lo avisa antes de contar) y `recibio_quien_compro` (quien cerró el conteo hizo alguna: se ve en el envío
--           cerrado, para cualquiera que lo mire). Son lecturas de lo que ya está en `ordenes_compra.creada_por` y `despachos.cerrado_por`:
--           no hay un dato nuevo que pueda quedar distinto de la realidad (principio 4).
--        b. Un disparador anota en Actividad «lo recibió quien hizo la compra» cada vez que un envío pasa a «cerrado» por quien hizo alguna
--           de sus órdenes. Sirve igual si el cierre lo hizo `cerrar_conteo_envio` o `recibir_despacho`, y no depende de reescribir
--           ninguna de las dos. Si anotar falla, el cierre sigue (un aviso en el log): la anotación nunca frena una recepción.
--        c. `fn_revisar_compras` (la bandeja de «Revisar compras») marca cada envío de un papel con `recibio_quien_compro`: quien completa
--           el papel —que nunca es quien compró— ve que nadie más contó esa mercadería (reemplazo anclado).
--
-- LO QUE NO CAMBIA (y por qué importa)
--   · Revisar compras sigue siendo de otra persona: `completar_papel_compra` y `confirmar_plata_compras` piden `fondos` y «nunca la
--     propia». Quien compra y recibe su compra ya no tiene un segundo contador de las prendas, pero la plata sigue pasando por otra persona.
--   · El Taller (insumos) conserva el bloqueo íntegro: `recibir_orden_insumo` y lo que no llegó (20261015040000, 20261015043000). Felipe
--     pidió no tocarlo todavía.
--   · Las pruebas viejas de la recepción cargan SUS migraciones dentro de cada caso (y hacen ROLLBACK): siguen probando la regla de la fase
--     4. La regla de hoy la prueba `scripts/pruebas/recibir_lo_propio.mjs`.
--
-- DESCARTÉ
--   · Levantar la regla para todo líder: quita el único control independiente sobre la mercadería física justo donde compra la encargada.
--   · Una columna «recibida por quien compró» en `despachos`: duplica lo que ya dicen `creada_por` y `cerrado_por` y puede discrepar de
--     ellos; además obligaba a reescribir `cerrar_conteo_envio` y `recibir_despacho`, que ya llevan varios parches.
--   · Reescribir las tres lecturas de Recibir: con que `fn_recepcion_quien_mira()` salga `null` para el Admin, las tres dicen lo correcto.
--   · Preguntar al responsable del combo si es Admin: contradice «los permisos se preguntan a la cuenta» y abriría la excepción a una
--     terminal compartida donde cualquiera elige a un Admin.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe, después de 20261024235000). UNA parte: solo funciones y un disparador (`create or replace
-- trigger`, nunca `drop trigger`: ADR-0195), sin tablas ni políticas, con `lock_timeout`. Idempotente: un reemplazo ya hecho se salta. Sin
-- `select … into` dentro de textos entre comillas (ADR-0288). El bloque final comprueba que quedó todo.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

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
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ---------- 1. La excepción, en un solo lugar ----------
create or replace function retail.fn_recepcion_puede_recibir_lo_propio()
returns boolean
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select coalesce(retail.fn_es_admin(), false);
$$;
comment on function retail.fn_recepcion_puede_recibir_lo_propio() is
  'ADR-0517: la cuenta puede recibir lo que ella misma compró (decisión 17 de ADR-0362, con su excepción). Hoy: la cuenta es de un Admin '
  '(fn_es_admin: Admin en Dynamic y Líder activo aquí). Se pregunta a la cuenta, no al responsable del combo: una terminal nunca la tiene. '
  'Si Dynamic no responde, false. Interna.';
revoke all on function retail.fn_recepcion_puede_recibir_lo_propio() from public, anon, authenticated;

-- ---------- 2. La persona de la cuenta, y la que «bloquea» ----------
create or replace function retail.fn_recepcion_mi_persona()
returns uuid
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select p.id from public.personas p where p.auth_user_id = auth.uid() limit 1;
$$;
comment on function retail.fn_recepcion_mi_persona() is
  'ADR-0517: la persona de la cuenta que mira, sin excepciones (null en una terminal o sin sesión). Interna: para decir «tú compraste esto».';
revoke all on function retail.fn_recepcion_mi_persona() from public, anon, authenticated;

create or replace function retail.fn_recepcion_quien_mira()
returns uuid
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select case when retail.fn_recepcion_puede_recibir_lo_propio() then null else retail.fn_recepcion_mi_persona() end;
$$;
comment on function retail.fn_recepcion_quien_mira() is
  'ADR-0362 (fase 4) y ADR-0517: la persona a quien Recibir le cierra lo que ella misma compró (decisión 17): null en una terminal, sin '
  'sesión, o si la cuenta es de un Admin (puede recibir lo suyo). Interna: la usan las lecturas de Recibir para marcar creado_por_mi.';
revoke all on function retail.fn_recepcion_quien_mira() from public, anon, authenticated;

-- ---------- 3. El candado de la recepción ----------
create or replace function retail.fn_recepcion_exigir(p_despacho_id uuid, p_ubicacion_id uuid, p_actor uuid)
returns void
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if p_ubicacion_id is null or not retail.fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'Este envío va a %: lo recibe esa tienda',
      coalesce((select u.nombre from retail.ubicaciones u where u.id = p_ubicacion_id), 'otra sede')
      using errcode = '42501', hint = 'recibir_otra_sede';
  end if;
  -- ADR-0517: un Admin sí recibe lo que él mismo compró (queda a la vista: disparador de abajo y `fn_envio_detalle`).
  if p_actor is not null and not retail.fn_recepcion_puede_recibir_lo_propio() and exists (
    select 1
      from retail.despacho_items di
      join retail.orden_compra_items i on i.id = di.orden_compra_item_id
      join retail.ordenes_compra o on o.id = i.orden_compra_id
     where di.despacho_id = p_despacho_id
       and o.creada_por = p_actor
  ) then
    raise exception 'Hiciste esta orden: la tiene que recibir otra persona de la tienda'
      using errcode = '42501', hint = 'recibir_quien_compro';
  end if;
end;
$$;
comment on function retail.fn_recepcion_exigir(uuid, uuid, uuid) is
  'ADR-0362 (fase 4) y ADR-0517: la sede del envío (fn_puede_operar_ubicacion) y la decisión 17 (quien firma no hizo ninguna de sus órdenes), '
  'salvo que la cuenta sea de un Admin (fn_recepcion_puede_recibir_lo_propio). Interna.';
revoke all on function retail.fn_recepcion_exigir(uuid, uuid, uuid) from public, anon, authenticated;

-- ---------- 4. «Llegó esta orden» (sin guía): su comprobación propia ----------
select pg_temp.reemplazar('retail.recibir_orden_sin_envio(uuid,uuid)',
$v$  if v_orden.creada_por = v_actor then
$v$,
$n$  -- ADR-0517: un Admin sí recibe lo que él mismo compró.
  if v_orden.creada_por = v_actor and not retail.fn_recepcion_puede_recibir_lo_propio() then
$n$,
1);

-- ---------- 5a. El detalle del envío dice lo que pasó (sin bloquear nada) ----------
select pg_temp.reemplazar('retail.fn_envio_detalle(uuid)',
$v$              where x.despacho_id = d.id and xo.creada_por = v_yo), false),
$v$,
$n$              where x.despacho_id = d.id and xo.creada_por = v_yo), false),
           -- ADR-0517: un Admin sí recibe lo que él mismo compró, así que `creado_por_mi` (lo que bloquea la fila) ya no sale para él.
           -- Estas dos claves dicen lo que pasó, para dejarlo a la vista: `compro_quien_mira` (quien mira hizo alguna de las órdenes: la
           -- pantalla se lo avisa antes de contar) y `recibio_quien_compro` (quien cerró el conteo hizo alguna: se ve en el envío cerrado).
           'compro_quien_mira', coalesce(retail.fn_recepcion_mi_persona() is not null and exists (
             select 1 from retail.despacho_items x
               join retail.orden_compra_items xi on xi.id = x.orden_compra_item_id
               join retail.ordenes_compra xo on xo.id = xi.orden_compra_id
              where x.despacho_id = d.id and xo.creada_por = retail.fn_recepcion_mi_persona()), false),
           'recibio_quien_compro', coalesce(d.estado = 'cerrado' and d.cerrado_por is not null and exists (
             select 1 from retail.despacho_items x
               join retail.orden_compra_items xi on xi.id = x.orden_compra_item_id
               join retail.ordenes_compra xo on xo.id = xi.orden_compra_id
              where x.despacho_id = d.id and xo.creada_por = d.cerrado_por), false),
$n$,
1);

-- ---------- 5a'. Revisar compras: el envío de un papel dice si lo recibió quien compró ----------
select pg_temp.reemplazar('retail.fn_revisar_compras()',
$v$jsonb_agg(distinct jsonb_build_object('id', d.id, 'numero', d.numero, 'estado', d.estado))$v$,
$n$jsonb_agg(distinct jsonb_build_object('id', d.id, 'numero', d.numero, 'estado', d.estado,
                       -- ADR-0517: quien cerró el conteo hizo alguna de las órdenes del envío (un Admin recibió lo que él mismo compró).
                       'recibio_quien_compro', coalesce(d.estado = 'cerrado' and d.cerrado_por is not null and exists (
                         select 1 from retail.despacho_items xd
                           join retail.orden_compra_items xi on xi.id = xd.orden_compra_item_id
                           join retail.ordenes_compra xo on xo.id = xi.orden_compra_id
                          where xd.despacho_id = d.id and xo.creada_por = d.cerrado_por), false)))$n$,
1);

-- ---------- 5b. Actividad: «lo recibió quien hizo la compra» ----------
create or replace function retail.fn_despacho_recibido_por_quien_compro()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  if new.cerrado_por is not null and exists (
    select 1
      from retail.despacho_items x
      join retail.orden_compra_items xi on xi.id = x.orden_compra_item_id
      join retail.ordenes_compra xo on xo.id = xi.orden_compra_id
     where x.despacho_id = new.id
       and xo.creada_por = new.cerrado_por
  ) then
    begin
      perform retail.fn_actividad_anotar(
        'recibir', 'despacho_recibido_lo_propio',
        retail.fn_envio_numero_texto(new.numero) || ': lo recibió quien hizo la compra',
        new.cerrado_por, retail.fn_actividad_terminal_ahora(), new.ubicacion_destino_id, null,
        'despachos', new.id::text, now(),
        jsonb_build_object('despacho_id', new.id, 'envio', retail.fn_envio_numero_texto(new.numero)), 'vivo');
    exception when others then
      -- Anotar nunca frena una recepción.
      raise warning 'actividad: no se anotó que el envío % lo recibió quien hizo la compra (%)', new.id, sqlerrm;
    end;
  end if;
  return new;
end;
$$;
comment on function retail.fn_despacho_recibido_por_quien_compro() is
  'ADR-0517: al pasar un envío a «cerrado», si quien lo cerró hizo alguna de sus órdenes de compra, lo anota en Actividad. Disparador: no se '
  'llama a mano. Si anotar falla, el cierre sigue.';
revoke all on function retail.fn_despacho_recibido_por_quien_compro() from public, anon, authenticated;

create or replace trigger trg_despacho_recibido_por_quien_compro
  after update of estado on retail.despachos
  for each row
  when (new.estado = 'cerrado' and old.estado is distinct from 'cerrado')
  execute function retail.fn_despacho_recibido_por_quien_compro();

-- ---------- 6. Comprobación ----------
do $$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('retail.recibir_orden_sin_envio(uuid,uuid)'::regprocedure);
  if position('not retail.fn_recepcion_puede_recibir_lo_propio()' in v_def) = 0 then
    raise exception 'recibir_orden_sin_envio no quedó con la excepción del Admin';
  end if;
  v_def := pg_get_functiondef('retail.fn_envio_detalle(uuid)'::regprocedure);
  if position('recibio_quien_compro' in v_def) = 0 or position('compro_quien_mira' in v_def) = 0 then
    raise exception 'fn_envio_detalle no quedó con las claves del rastro';
  end if;
  if position('fn_recepcion_puede_recibir_lo_propio' in pg_get_functiondef('retail.fn_recepcion_exigir(uuid,uuid,uuid)'::regprocedure)) = 0 then
    raise exception 'fn_recepcion_exigir no quedó con la excepción del Admin';
  end if;
  if position('recibio_quien_compro' in pg_get_functiondef('retail.fn_revisar_compras()'::regprocedure)) = 0 then
    raise exception 'fn_revisar_compras no quedó con la marca del rastro';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_despacho_recibido_por_quien_compro' and tgrelid = 'retail.despachos'::regclass) then
    raise exception 'falta el disparador del rastro en Actividad';
  end if;
end;
$$;

reset lock_timeout;
