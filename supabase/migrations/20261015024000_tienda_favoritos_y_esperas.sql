-- ============================================================================
-- 20261015024000_tienda_favoritos_y_esperas.sql — CAYLA V2 · Tienda online (ADR-0408), actividad 12 · PARTE 1 de 3
--
-- EL PROBLEMA PRIMERO. Una clienta mira la Blusa Emma en negro talla M y en Trujillo no hay. Hoy le escribe a la tienda «¿cuándo
-- llega?» y nadie anota nada: si llega, nadie se acuerda de ella, y CAYLA no sabe cuántas personas esperaban esa talla. La maqueta
-- aprobada (docs/maquetas/tienda-online-2026-10, `vProducto`, `vCuenta`, `vVitrina`) le da dos gestos: el corazón (guardar el
-- modelo en sus favoritos) y «Avísame cuando llegue» (anotar que espera esa talla). Los dos los ve en «Mi cuenta», y lo que espera
-- la gente lo ve la tienda en Catálogo ▸ Vitrina web ▸ «Esperan una talla».
--
-- ANALOGÍA CAYLA. El cuaderno de encargos que cada tienda tiene junto a la caja, pero escrito por la propia clienta y leído por
-- todas las tiendas: «Ana espera la M negra de la Blusa Emma en Trujillo». Y el corazón es el «me la guardas en mi lista».
--
-- QUÉ HACE
--   1. `retail.favoritos_web`: los modelos que una cuenta guardó con el corazón (uno por cuenta y modelo, como la maqueta: el
--      corazón está en la tarjeta del MODELO). Quitar no borra: marca `quitado_en`; volver a guardarlo la reactiva.
--   2. `retail.esperas_web`: lo que una cuenta espera, por PRENDA (`variante_id`: modelo, color y talla) y TIENDA
--      (`ubicacion_id`; vacío = «en cualquier tienda de la web»). Una viva por cuenta, prenda y tienda. Quitar no borra: marca
--      `quitada_en`. Cuándo «llegó» NO se guarda: se calcula al leer (hay stock libre en esa tienda, o en alguna de la web), igual
--      que los plazos de los pedidos web (ADR-0408, DECIDÍ 8). Si llega y se vuelve a acabar, vuelve a esperar sola.
--   3. Las funciones de la tienda (rol `tienda_web`, ADR-0408 decisión 3), cada una validando por dentro lo que recibe:
--      · `tienda_favorito(usuario, producto, guardar)`: guarda o quita (no alterna: el mismo pedido dos veces deja lo mismo).
--      · `tienda_avisame(usuario, variante, tienda)`: anota la espera, solo si NO hay en ese alcance (si hay, responde `hay` sin
--        escribir nada: a la clienta le toca separarla, no esperarla).
--      · `tienda_quitar_avisame(usuario, espera)`: la quita (solo una suya).
--      · `tienda_mis_favoritos_y_esperas(usuario)`: lo guardado, para dibujar los corazones y los «Te avisaremos» de la ficha y
--        las tarjetas.
--
-- QUÉ SE GARANTIZA Y DÓNDE
--   · Una espera viva por cuenta, prenda y tienda: índice único parcial (con «cualquier tienda» como un valor más: NULLS NOT
--     DISTINCT). Un favorito por cuenta y modelo: llave primaria.
--   · Cada cuenta solo toca lo suyo: las funciones buscan la cuenta por el usuario del proyecto de CLIENTES que manda el servidor
--     de la tienda (el que ya validó la sesión) y escriben solo filas de esa cuenta. Una espera ajena se trata como inexistente.
--   · Topes contra el abuso de una cuenta robada o un programa: 100 favoritos y 30 esperas vivas por cuenta. Cada escritura toma
--     la fila de la cuenta (`for update`): dos pestañas o un doble clic se turnan y el tope no se pasa.
--   · Solo se guarda lo que se ve en la web: un modelo publicado y vendible (`fn_vitrina_publicable`, la regla de la Vitrina) y,
--     para esperar, una talla activa con precio de ese modelo.
--   · Nadie lee ni escribe estas tablas por fuera de sus funciones: RLS encendido y sin políticas, y revoke (ni `tienda_web`).
--
-- DECIDÍ: se guardan contra la CUENTA web (`cuenta_web_id`), no contra la ficha del Club. Qué pasa con la cuenta cuando su ficha se
--   une a otra o se anonimiza está POR DECIDIR (pregunta para Felipe, backlog de la tienda): colgando de la cuenta, lo que se decida
--   para ella vale también para sus favoritos y sus esperas, sin otra migración.
-- DECIDÍ: con la ficha archivada (y por eso también anonimizada o unida a otra, que la archivan) la cuenta ya no AGREGA favoritos ni
--   esperas (`cuenta_inactiva`), pero sí puede quitarlos. Es lo más fácil de cambiar después: no junta datos nuevos de alguien cuya
--   ficha la tienda archivó, y levantar el candado es borrar una línea.
-- DECIDÍ: «hay» es lo LIBRE (stock − apartado) fuera de Cuarentena: la misma regla con que `confirmar_pedido_web` busca la prenda
--   (20261014235000: piso, almacén de la tienda o sin lugar). Las tiendas son las que la web muestra (`tienda_sedes()`); sin
--   ninguna, las tiendas abiertas (una base sin Configuración ▸ Tienda web no deja a nadie esperando algo que está en el piso).
-- DECIDÍ: una tienda que no se ve en la web (escondida, o un id cualquiera) se lee como «cualquier tienda», igual que el catálogo
--   (`tienda_catalogo`): la respuesta dice con qué tienda quedó (`sede`).
-- DECIDÍ: el aviso es en la cuenta, nunca por WhatsApp: el Club no manda mensajes personales (ADR-0288 G-5: ni «llegó tu talla»).
-- DESCARTÉ: borrar al quitar (las esperas quitadas son la historia de lo que se pidió: la demanda que la tienda no tuvo); un
--   «alternar» en la base (un doble clic dejaría el corazón al revés de lo que se ve); guardar si «llegó» (envejece apenas alguien
--   vende o recibe, y un proceso que lo mantenga es una pieza más que puede fallar).
-- `on delete cascade` a productos y variantes: solo se elimina un producto que no tiene historia (nunca se vendió ni se movió,
--   `eliminar_producto`); sus favoritos y esperas se van con él, como su fila de la Vitrina (`eliminar_producto.mjs`, lista SUYAS).
--
-- PRODUCCIÓN. NO está aplicada (actividad 13, con el OK de Felipe). Va DESPUÉS de las de la tienda (20261014220000, 223000, 224000,
-- 225000 y 231000). Una sola parte, re-ejecutable: tablas NUEVAS sin políticas y funciones; no altera ninguna tabla en uso (las
-- llaves foráneas toman un instante `productos`, `variantes`, `ubicaciones` y `cuentas_web` en modo SHARE ROW EXCLUSIVE, compatible
-- con las lecturas y las ventas; `lock_timeout` las corta a los 3 s), sin `drop trigger` (ADR-0195) y sin ningún `select … into`
-- dentro de un texto entre comillas (ADR-0288). Prueba: `pnpm pruebas:tienda-club`.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. Las tablas ----------
create table if not exists retail.favoritos_web (
  cuenta_web_id uuid not null references retail.cuentas_web (id),
  producto_id   uuid not null references retail.productos (id) on delete cascade,
  guardado_en   timestamptz not null default now(),
  quitado_en    timestamptz,
  constraint favoritos_web_pkey primary key (cuenta_web_id, producto_id),
  constraint favoritos_web_quitado_despues check (quitado_en is null or quitado_en >= guardado_en)
);

comment on table retail.favoritos_web is
  'Tienda online (ADR-0408, actividad 12): los modelos que una cuenta web guardó con el corazón. Uno por cuenta y modelo; quitar marca quitado_en (no se borra) y volver a guardarlo lo reactiva. Solo por tienda_favorito; RLS sin políticas.';
comment on column retail.favoritos_web.quitado_en is 'Cuándo lo quitó (vacío: está guardado). Volver a guardarlo lo vacía y mueve guardado_en.';

create table if not exists retail.esperas_web (
  id            uuid primary key default gen_random_uuid(),
  cuenta_web_id uuid not null references retail.cuentas_web (id),
  variante_id   uuid not null references retail.variantes (id) on delete cascade,
  ubicacion_id  uuid references retail.ubicaciones (id),
  creada_en     timestamptz not null default now(),
  quitada_en    timestamptz,
  constraint esperas_web_quitada_despues check (quitada_en is null or quitada_en >= creada_en)
);

-- Una espera viva por cuenta, prenda y tienda; «cualquier tienda» (null) es un valor más, no un comodín que se repite.
create unique index if not exists esperas_web_viva_unica
  on retail.esperas_web (cuenta_web_id, variante_id, ubicacion_id) nulls not distinct
  where quitada_en is null;
-- «Esperan una talla» del ERP lee las vivas por prenda.
create index if not exists esperas_web_vivas_por_variante on retail.esperas_web (variante_id) where quitada_en is null;

comment on table retail.esperas_web is
  'Tienda online (ADR-0408, actividad 12): «Avísame cuando llegue». Lo que una cuenta web espera, por prenda (variante: modelo, color y talla) y tienda (ubicacion_id vacío = cualquier tienda de la web). Una viva por cuenta, prenda y tienda. Si llegó se calcula al leer (stock libre en ese alcance). Quitar marca quitada_en (no se borra: es la demanda que no se tuvo). Solo por tienda_avisame / tienda_quitar_avisame; RLS sin políticas.';
comment on column retail.esperas_web.ubicacion_id is 'La tienda donde la espera; vacío: en cualquier tienda de la web.';

alter table retail.favoritos_web enable row level security;
alter table retail.esperas_web enable row level security;
revoke all on retail.favoritos_web, retail.esperas_web from public, anon, authenticated;

-- ---------- 2. Piezas internas (sin EXECUTE para nadie de la API; las llaman las tienda_* como su dueño) ----------

-- Las tiendas cuyo stock cuenta para la web: las que muestra (`tienda_sedes()`, Configuración ▸ Tienda web); sin ninguna, las
-- tiendas abiertas. Ordenadas por id: el mismo arreglo para la misma base.
create or replace function retail.fn_tienda_sedes_ids()
returns uuid[]
language sql
stable
set search_path = retail, public
as $$
  select coalesce(
    nullif(array(select (s ->> 'id')::uuid
                   from jsonb_array_elements(coalesce(retail.tienda_sedes() -> 'sedes', '[]'::jsonb)) s
                  order by 1), '{}'::uuid[]),
    array(select u.id from retail.ubicaciones u where u.tipo = 'tienda' and u.activo order by u.id));
$$;
comment on function retail.fn_tienda_sedes_ids() is
  'Tienda online (ADR-0408, act. 12): las tiendas cuyo stock cuenta para la web (las de tienda_sedes(); sin ninguna, las tiendas abiertas). Interna.';
revoke all on function retail.fn_tienda_sedes_ids() from public, anon, authenticated;

-- Lo libre de una prenda en esas tiendas: stock − apartado, fuera de Cuarentena (la regla de confirmar_pedido_web).
create or replace function retail.fn_tienda_libre(p_variante_id uuid, p_sedes uuid[])
returns integer
language sql
stable
set search_path = retail, public
as $$
  select coalesce(sum(greatest(st.cantidad - st.cantidad_apartada, 0)), 0)::integer
    from retail.stock st
    left join retail.sububicaciones su on su.id = st.sububicacion_id
   where st.variante_id = p_variante_id
     and st.ubicacion_id = any (coalesce(p_sedes, '{}'::uuid[]))
     and (su.id is null or su.tipo in ('almacen_tienda', 'piso_venta'));
$$;
comment on function retail.fn_tienda_libre(uuid, uuid[]) is
  'Tienda online (ADR-0408, act. 12): lo libre (stock − apartado) de una prenda en esas tiendas, sin Cuarentena (la regla de confirmar_pedido_web). Interna.';
revoke all on function retail.fn_tienda_libre(uuid, uuid[]) from public, anon, authenticated;

-- ¿Se ve este modelo en la web? Publicado en la Vitrina y vendible (la regla de la Vitrina).
create or replace function retail.fn_tienda_modelo_se_ve(p_producto_id uuid)
returns boolean
language sql
stable
set search_path = retail, public
as $$
  select exists (select 1 from retail.vitrina_productos vp where vp.producto_id = p_producto_id and vp.publicado)
     and retail.fn_vitrina_publicable(p_producto_id);
$$;
comment on function retail.fn_tienda_modelo_se_ve(uuid) is
  'Tienda online (ADR-0408, act. 12): el modelo está publicado en la Vitrina web y se puede vender (fn_vitrina_publicable). Interna.';
revoke all on function retail.fn_tienda_modelo_se_ve(uuid) from public, anon, authenticated;

-- ---------- 3. Guardar o quitar un favorito ----------
-- {estado: guardado | quitado | tope | no_disponible | cuenta_inactiva | sin_cuenta | invalido}. Guardar lo que ya está guardado
-- responde `guardado` sin escribir; quitar lo que no está, `quitado`.
create or replace function retail.tienda_favorito(p_usuario_web_id uuid, p_producto_id uuid, p_guardar boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public
as $fn$
declare
  v_cuenta uuid;
  v_activa boolean;
begin
  if p_usuario_web_id is null or p_producto_id is null or p_guardar is null then
    return jsonb_build_object('estado', 'invalido');
  end if;
  -- La cuenta, tomada: dos pestañas o un doble clic se turnan (y el tope no se pasa).
  for v_cuenta, v_activa in
    select w.id, c.archivada_en is null
      from retail.cuentas_web w
      join retail.clientas c on c.id = w.clienta_id
     where w.usuario_web_id = p_usuario_web_id
       for update of w
  loop
    exit;
  end loop;
  if v_cuenta is null then
    return jsonb_build_object('estado', 'sin_cuenta');
  end if;

  if not p_guardar then
    update retail.favoritos_web set quitado_en = now()
     where cuenta_web_id = v_cuenta and producto_id = p_producto_id and quitado_en is null;
    return jsonb_build_object('estado', 'quitado');
  end if;

  if exists (select 1 from retail.favoritos_web f
              where f.cuenta_web_id = v_cuenta and f.producto_id = p_producto_id and f.quitado_en is null) then
    return jsonb_build_object('estado', 'guardado');
  end if;
  if not v_activa then
    return jsonb_build_object('estado', 'cuenta_inactiva');
  end if;
  if not retail.fn_tienda_modelo_se_ve(p_producto_id) then
    return jsonb_build_object('estado', 'no_disponible');
  end if;
  if (select count(*) from retail.favoritos_web f where f.cuenta_web_id = v_cuenta and f.quitado_en is null) >= 100 then
    return jsonb_build_object('estado', 'tope', 'tope', 100);
  end if;

  insert into retail.favoritos_web (cuenta_web_id, producto_id)
  values (v_cuenta, p_producto_id)
  on conflict (cuenta_web_id, producto_id) do update set guardado_en = now(), quitado_en = null;
  return jsonb_build_object('estado', 'guardado');
end;
$fn$;
comment on function retail.tienda_favorito(uuid, uuid, boolean) is
  'Tienda online (ADR-0408, act. 12): guarda (p_guardar) o quita un modelo de los favoritos de esa cuenta. {estado: guardado | quitado | tope | no_disponible | cuenta_inactiva | sin_cuenta | invalido}. Idempotente. Solo la llama tienda_web.';

-- ---------- 4. «Avísame cuando llegue» ----------
-- {estado: anotada (id, sede, nueva) | hay (sede) | tope | no_disponible | cuenta_inactiva | sin_cuenta | invalido}.
create or replace function retail.tienda_avisame(p_usuario_web_id uuid, p_variante_id uuid, p_ubicacion_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public
as $fn$
declare
  v_cuenta uuid;
  v_activa boolean;
  v_producto uuid;
  v_sedes uuid[];
  v_sede uuid;
  v_id uuid;
begin
  if p_usuario_web_id is null or p_variante_id is null then
    return jsonb_build_object('estado', 'invalido');
  end if;
  for v_cuenta, v_activa in
    select w.id, c.archivada_en is null
      from retail.cuentas_web w
      join retail.clientas c on c.id = w.clienta_id
     where w.usuario_web_id = p_usuario_web_id
       for update of w
  loop
    exit;
  end loop;
  if v_cuenta is null then
    return jsonb_build_object('estado', 'sin_cuenta');
  end if;
  if not v_activa then
    return jsonb_build_object('estado', 'cuenta_inactiva');
  end if;

  -- La prenda: una talla activa con precio de un modelo que se ve en la web.
  v_producto := (select v.producto_id from retail.variantes v where v.id = p_variante_id and v.activo and v.precio > 0);
  if v_producto is null or not retail.fn_tienda_modelo_se_ve(v_producto) then
    return jsonb_build_object('estado', 'no_disponible');
  end if;

  -- La tienda: una de la web; cualquier otra se lee como «cualquier tienda» (como el catálogo).
  v_sedes := retail.fn_tienda_sedes_ids();
  if p_ubicacion_id = any (v_sedes) then
    v_sede := p_ubicacion_id;
  end if;

  -- Si hay, no se espera: se separa.
  if retail.fn_tienda_libre(p_variante_id, case when v_sede is null then v_sedes else array[v_sede] end) > 0 then
    return jsonb_build_object('estado', 'hay', 'sede', v_sede);
  end if;

  v_id := (select e.id from retail.esperas_web e
            where e.cuenta_web_id = v_cuenta and e.variante_id = p_variante_id
              and e.ubicacion_id is not distinct from v_sede and e.quitada_en is null);
  if v_id is not null then
    return jsonb_build_object('estado', 'anotada', 'id', v_id, 'sede', v_sede, 'nueva', false);
  end if;
  if (select count(*) from retail.esperas_web e where e.cuenta_web_id = v_cuenta and e.quitada_en is null) >= 30 then
    return jsonb_build_object('estado', 'tope', 'tope', 30);
  end if;

  insert into retail.esperas_web (cuenta_web_id, variante_id, ubicacion_id)
  values (v_cuenta, p_variante_id, v_sede)
  returning id into v_id;
  return jsonb_build_object('estado', 'anotada', 'id', v_id, 'sede', v_sede, 'nueva', true);
end;
$fn$;
comment on function retail.tienda_avisame(uuid, uuid, uuid) is
  'Tienda online (ADR-0408, act. 12): «Avísame cuando llegue» de esa prenda en esa tienda (vacía o no web: cualquier tienda de la web). Solo si NO hay libre en ese alcance. {estado: anotada (id, sede, nueva) | hay (sede) | tope | no_disponible | cuenta_inactiva | sin_cuenta | invalido}. Solo la llama tienda_web.';

-- ---------- 5. Quitar una espera ----------
-- {estado: quitada | no_esta | sin_cuenta | invalido}. Una espera de otra cuenta responde lo mismo que una que no existe.
create or replace function retail.tienda_quitar_avisame(p_usuario_web_id uuid, p_espera_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public
as $fn$
declare
  v_cuenta uuid;
begin
  if p_usuario_web_id is null or p_espera_id is null then
    return jsonb_build_object('estado', 'invalido');
  end if;
  for v_cuenta in
    select w.id from retail.cuentas_web w where w.usuario_web_id = p_usuario_web_id for update
  loop
    exit;
  end loop;
  if v_cuenta is null then
    return jsonb_build_object('estado', 'sin_cuenta');
  end if;
  update retail.esperas_web set quitada_en = now()
   where id = p_espera_id and cuenta_web_id = v_cuenta and quitada_en is null;
  if found or exists (select 1 from retail.esperas_web e where e.id = p_espera_id and e.cuenta_web_id = v_cuenta) then
    return jsonb_build_object('estado', 'quitada');
  end if;
  return jsonb_build_object('estado', 'no_esta');
end;
$fn$;
comment on function retail.tienda_quitar_avisame(uuid, uuid) is
  'Tienda online (ADR-0408, act. 12): quita una espera de esa cuenta (marca quitada_en). {estado: quitada | no_esta | sin_cuenta | invalido}; una ajena responde no_esta, como una que no existe. Solo la llama tienda_web.';

-- ---------- 6. Lo guardado, para la ficha y las tarjetas ----------
-- {favoritos: [producto_id, …] (lo último primero), esperas: [{id, variante_id, sede}]}, o null si ese usuario no tiene cuenta.
create or replace function retail.tienda_mis_favoritos_y_esperas(p_usuario_web_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = retail, public
as $$
  select jsonb_build_object(
    'favoritos', coalesce((
      select jsonb_agg(f.producto_id order by f.guardado_en desc, f.producto_id)
        from retail.favoritos_web f
       where f.cuenta_web_id = w.id and f.quitado_en is null), '[]'::jsonb),
    'esperas', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'variante_id', e.variante_id, 'sede', e.ubicacion_id)
                       order by e.creada_en desc, e.id)
        from retail.esperas_web e
       where e.cuenta_web_id = w.id and e.quitada_en is null), '[]'::jsonb))
  from retail.cuentas_web w
  where w.usuario_web_id = p_usuario_web_id;
$$;
comment on function retail.tienda_mis_favoritos_y_esperas(uuid) is
  'Tienda online (ADR-0408, act. 12): los favoritos y las esperas vivas de esa cuenta, para dibujar la ficha y las tarjetas. {favoritos: [producto_id], esperas: [{id, variante_id, sede}]}, o null sin cuenta. Solo la llama tienda_web.';

-- ---------- 7. La puerta: solo tienda_web ----------
revoke all on function retail.tienda_favorito(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function retail.tienda_avisame(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function retail.tienda_quitar_avisame(uuid, uuid) from public, anon, authenticated;
revoke all on function retail.tienda_mis_favoritos_y_esperas(uuid) from public, anon, authenticated;
grant execute on function retail.tienda_favorito(uuid, uuid, boolean) to tienda_web;
grant execute on function retail.tienda_avisame(uuid, uuid, uuid) to tienda_web;
grant execute on function retail.tienda_quitar_avisame(uuid, uuid) to tienda_web;
grant execute on function retail.tienda_mis_favoritos_y_esperas(uuid) to tienda_web;

-- ---------- 8. Validación final: si algo no quedó, se deshace todo ----------
do $$
declare
  v_firma text;
begin
  foreach v_firma in array array['retail.tienda_favorito(uuid, uuid, boolean)', 'retail.tienda_avisame(uuid, uuid, uuid)',
                                 'retail.tienda_quitar_avisame(uuid, uuid)', 'retail.tienda_mis_favoritos_y_esperas(uuid)'] loop
    if has_function_privilege('anon', v_firma, 'EXECUTE') or has_function_privilege('authenticated', v_firma, 'EXECUTE')
       or not has_function_privilege('tienda_web', v_firma, 'EXECUTE') then
      raise exception 'tienda club: % tiene que ser solo de tienda_web', v_firma;
    end if;
  end loop;
  foreach v_firma in array array['retail.fn_tienda_sedes_ids()', 'retail.fn_tienda_libre(uuid, uuid[])',
                                 'retail.fn_tienda_modelo_se_ve(uuid)'] loop
    if has_function_privilege('tienda_web', v_firma, 'EXECUTE') or has_function_privilege('authenticated', v_firma, 'EXECUTE') then
      raise exception 'tienda club: % es interna y nadie de la API la ejecuta', v_firma;
    end if;
  end loop;
  if has_table_privilege('tienda_web', 'retail.favoritos_web', 'SELECT') or has_table_privilege('tienda_web', 'retail.esperas_web', 'SELECT')
     or has_table_privilege('authenticated', 'retail.favoritos_web', 'SELECT') or has_table_privilege('authenticated', 'retail.esperas_web', 'SELECT') then
    raise exception 'tienda club: favoritos_web y esperas_web se leen solo por sus funciones';
  end if;
end;
$$;

reset lock_timeout;
