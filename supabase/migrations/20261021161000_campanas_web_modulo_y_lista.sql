-- ============================================================================
-- 20261021161000_campanas_web_modulo_y_lista.sql — Tienda web ▸ Campañas, actividades 1 y 2: el módulo, el diseño de cada campaña, la lista y guardar
--
-- EL PROBLEMA PRIMERO. Una campaña de la tienda online hoy es una fila de `retail.etiquetas` (estilo 'campana': nombre, descuento,
-- vigencia, prendas) y la tienda solo la dice en una frase. Felipe pidió que cada campaña tenga su propio diseño y movimiento
-- (Aniversario, Black Week, Navidad, Día del Gato…) y que el líder lo arme desde el ERP sin escribir código (maqueta aprobada:
-- docs/maquetas/campanas-tienda-2026-10/). El DISEÑO cuelga de la campaña; no la reemplaza: fechas, % y prendas siguen en Catálogo ▸
-- Etiquetas (principio 4, una sola fuente de verdad), así la tienda nunca dice un precio distinto al de la caja.
--
-- LO QUE HACE
--   1. El módulo `campanas_web` (Tienda web ▸ Campañas). Nace SIN rol (ADR-0161): solo lo ve el líder hasta que él lo da; delegable.
--   2. `retail.campana_web_disenos`: una fila por etiqueta de campaña con su diseño (ambiente del catálogo cerrado O imagen propia con su
--      versión vertical opcional, colores, movimiento, textos cortos, dónde se ve y si es borrador o está programado). RLS encendido
--      y SIN políticas: solo la tocan funciones `security definer` (la de escribir llega en la actividad 2).
--   3. `retail.fn_campanas_web()`: la lectura de la lista (campañas con su estado, descuento, vigencia, prendas y su diseño).
--   4. `retail.fn_campana_diseno(etiqueta)`: la lectura de UNA campaña con su diseño completo (lo que abre el editor).
--   5. `retail.guardar_campana_diseno(etiqueta, version, diseno jsonb)`: crea o cambia el diseño. Pide el módulo y firma con el
--      responsable (`fn_actor_persona_id(true)`, ADR-0162); la versión frena a la segunda persona; sin cambios no escribe ni anota; cada
--      cambio deja su línea en la Actividad (módulo `campanas_web`). Recibe un jsonb (un parche) y no columnas sueltas: las actividades
--      que siguen (movimiento, textos, imagen) suman llaves sin cambiar la firma (un `create or replace` con otros parámetros crearía
--      una segunda función). NO toca `estado`: pasar de borrador a programado es de la actividad que programa.
--   6. `retail.tienda_diseno_campana()`: lo que la TIENDA lee (rol `tienda_web`): la campaña que gana la portada y, si su diseño está
--      programado, ese diseño. Es una función aparte y NO toca `tienda_portada()`: esa ya está en producción con el diseño del PR #1190
--      (ADR-0436) y reescribirla lo pisaría. La tienda aplica el diseño solo si el nombre de la campaña coincide con el de la portada.
--
-- REGLAS (Lamport: lo que la base no deja que pase)
--   · Un diseño es de UNA campaña (la clave es la etiqueta) y se va con ella (`on delete cascade`: es configuración, no historia).
--   · Ambiente O imagen, nunca los dos ni ninguno: `plantilla` solo si el modo es 'ambiente', y una imagen horizontal obligatoria
--     si el modo es 'imagen'. Los valores salen de listas cerradas (CHECK): la tienda nunca recibe un efecto o ambiente que no
--     conoce, y el líder nunca escribe CSS.
--   · Una campaña terminada ya no se rediseña (la tienda volvió sola a su diseño de siempre) y solo se guarda el diseño de una campaña
--     que existe (etiqueta de estilo campana, aprobada, activa y con %).
--   · Dos personas con la misma campaña abierta: gana la primera y la segunda recibe `campana_cambio_otro` (la fila lleva `version`).
--   · Textos con tope (titular 28, bajada 40, botón 22) y colores solo `#rrggbb`: nada que rompa la portada.
--
-- NOMBRE DE LA TABLA. Se llama `campana_web_disenos` y no `campana_disenos` a propósito: en producción ya existe una `retail.campana_disenos`
--   (otro esquema: paleta, fondo, patrón, acomodo, estado «publicado») que llegó con el PR #1190 (ADR-0436). Con ese nombre, el
--   `create table if not exists` de esta migración se habría saltado en silencio y las funciones de abajo habrían fallado contra la tabla ajena.
--   Ningún otro nombre de aquí (funciones, módulo) choca con los de producción (consultados el 2026-10-21).
-- DECIDÍ: «Dónde se ve» son cinco columnas booleanas y no un jsonb: la base las valida sola y la tienda las lee sin interpretar.
--   La campaña sin fila de diseño se ve como siempre (no hace falta una opción «sin diseño»). La imagen vive en el almacenamiento
--   público de la web; aquí solo su ruta (`campanas/…`, validada).
-- DESCARTÉ: guardar el diseño en `etiquetas` (el núcleo de promociones no se toca y mezclaría lo de la caja con lo de la web); un
--   campo de CSS libre (rompe el contraste y la regla «el líder elige, no escribe»); un interruptor «activar el diseño» (empieza y
--   termina con las fechas de la campaña, no hay nada que acordarse de apagar).
--
-- PRODUCCIÓN. NO está aplicada. Una sola parte, re-ejecutable: una fila en `modulos`, una tabla NUEVA sin políticas y una función; no
-- hace `alter` de tablas en uso ni toca disparadores (ADR-0195). Dentro de los textos entre comillas no hay `select … into`
-- (ADR-0288). Prueba: `pnpm pruebas:campanas-web`.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. El módulo (nace sin rol: solo el líder) ----------
insert into retail.modulos (clave, grupo, nombre, incluye, orden, solo_lider, delegable) values
  ('campanas_web', 'Tienda web', 'Campañas de la tienda web',
   'Elegir cómo se ve la tienda online durante cada campaña (el ambiente, los colores, el movimiento, los textos o una imagen propia y dónde se muestra), programarlo y verlo antes con un enlace privado. Las fechas, el descuento y las prendas se siguen armando en Etiquetas',
   67, false, true)
on conflict (clave) do nothing;

-- ---------- 2. El diseño de cada campaña ----------
create table if not exists retail.campana_web_disenos (
  etiqueta_id            uuid primary key references retail.etiquetas (id) on delete cascade,
  -- 'ambiente': uno del catálogo cerrado (con 3 paletas); 'imagen': el banner que sube el líder, con los botones encima.
  modo                   text not null,
  plantilla              text,
  paleta                 smallint not null default 0,
  -- Color propio: en 'ambiente', el acento; en 'imagen', el del botón «Ver la campaña». Null = el de la paleta / el de fábrica.
  acento                 text,
  franja                 text not null default 'rota',
  entrada                text not null default 'telon',
  efecto                 text not null default 'ninguno',
  intensidad             text not null default 'poca',
  duracion               text not null default 'una',
  cuenta                 text not null default 'siempre',
  titular                text,
  bajada                 text,
  boton                  text,
  -- Rutas en el almacenamiento público (`campanas/<etiqueta>/…`): la horizontal y la vertical (opcional) para celular.
  imagen_ruta            text,
  imagen_vertical_ruta   text,
  donde_franja           boolean not null default true,
  donde_portada          boolean not null default true,
  donde_catalogo         boolean not null default true,
  donde_sello            boolean not null default true,
  donde_bolsa            boolean not null default true,
  estado                 text not null default 'borrador',
  version                integer not null default 1,
  creado_en              timestamptz not null default now(),
  creado_por             uuid references public.personas (id),
  actualizado_en         timestamptz not null default now(),
  actualizado_por        uuid references public.personas (id),
  constraint campana_web_disenos_modo check (modo in ('ambiente', 'imagen')),
  constraint campana_web_disenos_plantilla check (
    plantilla is null or plantilla in ('sobrio', 'aniversario', 'patrias', 'madre', 'cyber', 'gato', 'navidad')
  ),
  constraint campana_web_disenos_modo_coherente check (
    (modo = 'ambiente') = (plantilla is not null) and (modo <> 'imagen' or imagen_ruta is not null)
  ),
  constraint campana_web_disenos_paleta check (paleta between 0 and 2),
  constraint campana_web_disenos_acento check (acento is null or acento ~ '^#[0-9a-f]{6}$'),
  constraint campana_web_disenos_franja check (franja in ('rota', 'marquesina', 'quieta')),
  constraint campana_web_disenos_entrada check (entrada in ('telon', 'caen', 'aparece', 'ninguna')),
  constraint campana_web_disenos_efecto check (
    efecto in ('ninguno', 'destellos', 'confeti', 'petalos', 'copos', 'corazones', 'estrellas', 'hojas', 'burbujas', 'patitas')
  ),
  constraint campana_web_disenos_intensidad check (intensidad in ('poca', 'media')),
  constraint campana_web_disenos_duracion check (duracion in ('una', 'continuo')),
  constraint campana_web_disenos_cuenta check (cuenta in ('siempre', 'ultimo', 'no')),
  constraint campana_web_disenos_titular check (titular is null or char_length(titular) between 1 and 28),
  constraint campana_web_disenos_bajada check (bajada is null or char_length(bajada) between 1 and 40),
  constraint campana_web_disenos_boton check (boton is null or char_length(boton) between 1 and 22),
  constraint campana_web_disenos_imagen_ruta check (imagen_ruta is null or (imagen_ruta like 'campanas/%' and char_length(imagen_ruta) <= 300)),
  constraint campana_web_disenos_imagen_vertical check (
    imagen_vertical_ruta is null
    or (imagen_ruta is not null and imagen_vertical_ruta like 'campanas/%' and char_length(imagen_vertical_ruta) <= 300)
  ),
  constraint campana_web_disenos_estado check (estado in ('borrador', 'programado')),
  constraint campana_web_disenos_version check (version >= 1)
);

comment on table retail.campana_web_disenos is
  'El diseño de la tienda online durante una campaña (Tienda web ▸ Campañas): ambiente del catálogo cerrado o imagen propia, colores, movimiento, textos cortos y dónde se ve. Cuelga de retail.etiquetas (estilo campana): fechas, % y prendas viven allí. Sin fila, la campaña se ve como siempre. Se escribe solo con funciones security definer; quién y cuándo, en retail.actividad (módulo campanas_web).';
comment on column retail.campana_web_disenos.modo is 'ambiente | imagen. Con ambiente, plantilla obligatoria; con imagen, imagen_ruta obligatoria (la vertical es opcional y se usa en celular).';
comment on column retail.campana_web_disenos.acento is 'Color propio #rrggbb: el acento del ambiente o el del botón «Ver la campaña» sobre la imagen. Null = el de la paleta o el de fábrica.';

alter table retail.campana_web_disenos enable row level security;
revoke all on table retail.campana_web_disenos from public, anon, authenticated;

-- ---------- 3. Piezas internas ----------

-- Una línea en la Actividad (quién y cuándo). Si anotar falla, lo guardado sigue en pie (como en los demás módulos).
create or replace function retail.fn_campana_web_anotar(
  p_accion text, p_descripcion text, p_persona_id uuid, p_registro_id text, p_detalle jsonb
)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
begin
  begin
    perform retail.fn_actividad_anotar(
      'campanas_web', p_accion, p_descripcion, p_persona_id, retail.fn_actividad_terminal_ahora(),
      retail.fn_actividad_sede_de(p_persona_id, 'vivo'), null, 'campana_web_disenos', p_registro_id, now(), p_detalle, 'vivo');
  exception when others then
    raise warning 'actividad: no se anotó la campaña web (%)', sqlerrm;
  end;
end;
$fn$;
revoke all on function retail.fn_campana_web_anotar(text, text, uuid, text, jsonb) from public, anon, authenticated;

-- ¿Esta etiqueta es una campaña de la tienda web? Estilo campana, aprobada, activa y con descuento: la misma que lista `fn_campanas_web`.
create or replace function retail.fn_campana_web_valida(p_etiqueta_id uuid)
returns boolean
language sql
stable
security definer
set search_path = retail, public
as $$
  select exists (
    select 1 from retail.etiquetas e
     where e.id = p_etiqueta_id and e.estilo = 'campana' and e.estado = 'aprobado' and e.activo and e.descuento_pct > 0)
$$;
revoke all on function retail.fn_campana_web_valida(uuid) from public, anon, authenticated;

-- El diseño de una campaña, completo, tal como lo lee el editor; null si la campaña no tiene.
create or replace function retail.fn_campana_diseno_json(p_etiqueta_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = retail, public
as $$
  select jsonb_build_object(
    'modo', d.modo, 'plantilla', d.plantilla, 'paleta', d.paleta, 'acento', d.acento,
    'franja', d.franja, 'entrada', d.entrada, 'efecto', d.efecto, 'intensidad', d.intensidad, 'duracion', d.duracion, 'cuenta', d.cuenta,
    'titular', d.titular, 'bajada', d.bajada, 'boton', d.boton,
    'imagen_ruta', d.imagen_ruta, 'imagen_vertical_ruta', d.imagen_vertical_ruta,
    'donde', jsonb_build_object('franja', d.donde_franja, 'portada', d.donde_portada, 'catalogo', d.donde_catalogo,
                                'sello', d.donde_sello, 'bolsa', d.donde_bolsa),
    'estado', d.estado, 'version', d.version, 'actualizado_en', d.actualizado_en)
  from retail.campana_web_disenos d where d.etiqueta_id = p_etiqueta_id
$$;
revoke all on function retail.fn_campana_diseno_json(uuid) from public, anon, authenticated;

-- Una campaña como la lista: estado con la fecha de Lima, modelos que toca y el resumen de su diseño. Lo usan la lista y el editor.
create or replace function retail.fn_campana_web_fila(p_etiqueta_id uuid, p_hoy date)
returns jsonb
language sql
stable
security definer
set search_path = retail, public
as $$
  select jsonb_build_object(
    'id', e.id,
    'nombre', e.nombre,
    'pct', e.descuento_pct,
    'desde', e.vigente_desde,
    'hasta', e.vigente_hasta,
    'estado', case when e.vigente_desde is not null and e.vigente_desde > p_hoy then 'prog'
                   when e.vigente_hasta is not null and e.vigente_hasta < p_hoy then 'fin'
                   else 'vivo' end,
    'prendas', (
      select count(*) from retail.productos p
       where p.estado = 'activo'
         and (
           exists (select 1 from retail.variante_etiquetas ve
                     join retail.variantes v on v.id = ve.variante_id
                    where ve.etiqueta_id = e.id and v.producto_id = p.id)
           or exists (select 1 from retail.etiqueta_categorias ec
                       where ec.etiqueta_id = e.id and ec.categoria_id = p.categoria_id)
         )
    ),
    'diseno', (
      select jsonb_build_object(
               'modo', d.modo, 'plantilla', d.plantilla, 'estado', d.estado,
               'imagen_ruta', d.imagen_ruta, 'version', d.version, 'actualizado_en', d.actualizado_en)
        from retail.campana_web_disenos d where d.etiqueta_id = e.id)
  )
  from retail.etiquetas e where e.id = p_etiqueta_id
$$;
revoke all on function retail.fn_campana_web_fila(uuid, date) from public, anon, authenticated;

-- ---------- 4. La lista ----------
-- Las campañas que se ven aquí: etiquetas de estilo 'campana', aprobadas, activas y con descuento, que están vigentes, por empezar
-- o terminaron hace menos de cuatro meses (la Tienda web no necesita ver las de hace un año). El estado se mide con la fecha de
-- Lima, igual que la portada de la tienda (`tienda_portada`) y la caja (`fn_campanas_por_variante`).
-- `prendas` cuenta MODELOS activos que la campaña toca, a mano (`variante_etiquetas`) o por categoría (`etiqueta_categorias`).
create or replace function retail.fn_campanas_web()
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_hoy date := retail.fn_hoy_lima();
begin
  perform retail.fn_exigir_modulo('campanas_web');
  return jsonb_build_object(
    'hoy', v_hoy,
    'campanas', coalesce((
      select jsonb_agg(retail.fn_campana_web_fila(c.id, v_hoy) order by c.orden_estado, c.orden_fecha, c.nombre)
        from (
          select
            e.id,
            e.nombre,
            case when e.vigente_desde is not null and e.vigente_desde > v_hoy then 2
                 when e.vigente_hasta is not null and e.vigente_hasta < v_hoy then 3
                 else 1 end as orden_estado,
            -- vivas: la que termina primero (como la portada); programadas: la que empieza primero; terminadas: la más reciente.
            case when e.vigente_hasta is not null and e.vigente_hasta < v_hoy then (v_hoy - e.vigente_hasta)::numeric
                 when e.vigente_desde is not null and e.vigente_desde > v_hoy then (e.vigente_desde - v_hoy)::numeric
                 else coalesce((e.vigente_hasta - v_hoy)::numeric, 100000) end as orden_fecha
          from retail.etiquetas e
          where retail.fn_campana_web_valida(e.id)
            and (e.vigente_hasta is null or e.vigente_hasta >= v_hoy - 120)
        ) c
    ), '[]'::jsonb)
  );
end;
$fn$;

comment on function retail.fn_campanas_web() is
  'Tienda web ▸ Campañas: las campañas (etiquetas estilo campana, vigentes, por empezar o terminadas hace menos de 120 días) con su estado, descuento, vigencia, modelos que toca y su diseño si lo tiene. Pide el módulo campanas_web.';

revoke all on function retail.fn_campanas_web() from public, anon;
grant execute on function retail.fn_campanas_web() to authenticated;

-- ---------- 5. Una campaña con su diseño completo (lo que abre el editor) ----------
create or replace function retail.fn_campana_diseno(p_etiqueta_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_hoy date := retail.fn_hoy_lima();
begin
  perform retail.fn_exigir_modulo('campanas_web');
  if p_etiqueta_id is null or not retail.fn_campana_web_valida(p_etiqueta_id) then
    raise exception 'campana_no_existe' using hint = 'Esa campaña ya no existe o dejó de ser una campaña. Vuelve a la lista.';
  end if;
  return jsonb_build_object(
    'hoy', v_hoy,
    'campana', retail.fn_campana_web_fila(p_etiqueta_id, v_hoy) - 'diseno',
    'diseno', retail.fn_campana_diseno_json(p_etiqueta_id));
end;
$fn$;

comment on function retail.fn_campana_diseno(uuid) is
  'Tienda web ▸ Campañas: una campaña con su diseño completo (null si no tiene). Pide el módulo campanas_web.';

revoke all on function retail.fn_campana_diseno(uuid) from public, anon;
grant execute on function retail.fn_campana_diseno(uuid) to authenticated;

-- ---------- 6. Guardar el diseño ----------
-- `p_diseno` es un parche: solo las llaves que trae cambian; el resto queda como estaba (o de fábrica, la primera vez). `p_version`: la que
-- leyó el editor (`null` si la campaña aún no tenía diseño). Las llaves son las columnas de `campana_web_disenos` menos las que la base
-- maneja sola (`estado`, `version`, quién y cuándo): cualquier otra llave se rechaza, así un error de escritura no se pierde en silencio.
create or replace function retail.guardar_campana_diseno(p_etiqueta_id uuid, p_version integer, p_diseno jsonb)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  c_llaves constant text[] := array[
    'modo', 'plantilla', 'paleta', 'acento', 'franja', 'entrada', 'efecto', 'intensidad', 'duracion', 'cuenta',
    'titular', 'bajada', 'boton', 'imagen_ruta', 'imagen_vertical_ruta',
    'donde_franja', 'donde_portada', 'donde_catalogo', 'donde_sello', 'donde_bolsa'];
  c_de_fabrica constant jsonb := jsonb_build_object(
    'paleta', 0, 'franja', 'rota', 'entrada', 'telon', 'efecto', 'ninguno', 'intensidad', 'poca', 'duracion', 'una', 'cuenta', 'siempre',
    'donde_franja', true, 'donde_portada', true, 'donde_catalogo', true, 'donde_sello', true, 'donde_bolsa', true);
  v_actor uuid;
  v_hoy date := retail.fn_hoy_lima();
  v_nombre text;
  v_hasta date;
  v_fila retail.campana_web_disenos%rowtype;
  v_existe boolean;
  v_actual jsonb;
  v_nuevo jsonb;
  v_rara text;
  v_constraint text;
begin
  perform retail.fn_exigir_modulo('campanas_web');
  v_actor := retail.fn_actor_persona_id(true);

  if p_etiqueta_id is null or not retail.fn_campana_web_valida(p_etiqueta_id) then
    raise exception 'campana_no_existe' using hint = 'Esa campaña ya no existe o dejó de ser una campaña. Vuelve a la lista.';
  end if;
  if p_diseno is null or jsonb_typeof(p_diseno) <> 'object' then
    raise exception 'campana_diseno_datos_invalidos' using hint = 'Falta el diseño que se quiere guardar.';
  end if;
  v_rara := (select k from jsonb_object_keys(p_diseno) k where k <> all (c_llaves) limit 1);
  if v_rara is not null then
    raise exception 'campana_diseno_datos_invalidos' using hint = format('«%s» no es algo que se pueda cambiar del diseño.', v_rara);
  end if;

  select e.nombre, e.vigente_hasta into v_nombre, v_hasta from retail.etiquetas e where e.id = p_etiqueta_id;
  if v_hasta is not null and v_hasta < v_hoy then
    raise exception 'campana_terminada' using hint = format('«%s» ya terminó: su diseño no se cambia.', v_nombre);
  end if;

  select * into v_fila from retail.campana_web_disenos where etiqueta_id = p_etiqueta_id for update;
  v_existe := found;

  if v_existe then
    if p_version is null or p_version <> v_fila.version then
      raise exception 'campana_cambio_otro' using hint = 'Esta campaña cambió mientras la tenías abierta. Vuelve a abrirla.';
    end if;
    v_actual := retail.fn_campana_diseno_json(p_etiqueta_id);
    -- Lo que el parche compara contra lo guardado: las columnas planas (la lectura trae «donde» anidado).
    v_actual := (v_actual - 'donde' - 'estado' - 'version' - 'actualizado_en') || jsonb_build_object(
      'donde_franja', v_fila.donde_franja, 'donde_portada', v_fila.donde_portada, 'donde_catalogo', v_fila.donde_catalogo,
      'donde_sello', v_fila.donde_sello, 'donde_bolsa', v_fila.donde_bolsa);
    v_nuevo := v_actual || p_diseno;
    if v_nuevo = v_actual then
      return retail.fn_campana_diseno_json(p_etiqueta_id);  -- sin cambios: ni se escribe ni se anota
    end if;
  else
    if p_version is not null then
      raise exception 'campana_cambio_otro' using hint = 'Esta campaña cambió mientras la tenías abierta. Vuelve a abrirla.';
    end if;
    v_nuevo := c_de_fabrica || p_diseno;
  end if;

  begin
    if v_existe then
      update retail.campana_web_disenos d
         set modo = x.modo, plantilla = x.plantilla, paleta = x.paleta, acento = x.acento,
             franja = x.franja, entrada = x.entrada, efecto = x.efecto, intensidad = x.intensidad, duracion = x.duracion, cuenta = x.cuenta,
             titular = x.titular, bajada = x.bajada, boton = x.boton,
             imagen_ruta = x.imagen_ruta, imagen_vertical_ruta = x.imagen_vertical_ruta,
             donde_franja = x.donde_franja, donde_portada = x.donde_portada, donde_catalogo = x.donde_catalogo,
             donde_sello = x.donde_sello, donde_bolsa = x.donde_bolsa,
             version = d.version + 1, actualizado_en = now(), actualizado_por = v_actor
        from jsonb_populate_record(null::retail.campana_web_disenos, v_nuevo) x
       where d.etiqueta_id = p_etiqueta_id;
    else
      insert into retail.campana_web_disenos
        (etiqueta_id, modo, plantilla, paleta, acento, franja, entrada, efecto, intensidad, duracion, cuenta, titular, bajada, boton,
         imagen_ruta, imagen_vertical_ruta, donde_franja, donde_portada, donde_catalogo, donde_sello, donde_bolsa, creado_por, actualizado_por)
      select p_etiqueta_id, x.modo, x.plantilla, x.paleta, x.acento, x.franja, x.entrada, x.efecto, x.intensidad, x.duracion, x.cuenta,
             x.titular, x.bajada, x.boton, x.imagen_ruta, x.imagen_vertical_ruta,
             x.donde_franja, x.donde_portada, x.donde_catalogo, x.donde_sello, x.donde_bolsa, v_actor, v_actor
        from jsonb_populate_record(null::retail.campana_web_disenos, v_nuevo) x
      on conflict (etiqueta_id) do nothing;
      if not found then
        -- Otra persona lo creó en el mismo instante: que esta vuelva a abrirla y vea lo que quedó.
        raise exception 'campana_cambio_otro' using hint = 'Esta campaña cambió mientras la tenías abierta. Vuelve a abrirla.';
      end if;
    end if;
  exception
    when check_violation then
      get stacked diagnostics v_constraint = constraint_name;
      raise exception 'campana_diseno_datos_invalidos' using hint = format('Ese diseño no es válido (%s).', v_constraint);
    when invalid_text_representation or invalid_parameter_value or datatype_mismatch or numeric_value_out_of_range then
      raise exception 'campana_diseno_datos_invalidos' using hint = 'Hay un dato del diseño con una forma que no es la esperada.';
  end;

  perform retail.fn_campana_web_anotar(
    'campana_diseno_guardado',
    '«' || v_nombre || '»: ' || case when v_existe then 'cambió su diseño' else 'creó su diseño' end
      || case when v_nuevo ->> 'modo' = 'imagen' then ' (imagen propia)'
              else ' (' || coalesce(v_nuevo ->> 'plantilla', '') || ')' end,
    v_actor, p_etiqueta_id::text,
    jsonb_build_object('etiqueta_id', p_etiqueta_id, 'modo', v_nuevo ->> 'modo', 'plantilla', v_nuevo ->> 'plantilla'));

  return retail.fn_campana_diseno_json(p_etiqueta_id);
end;
$fn$;

comment on function retail.guardar_campana_diseno(uuid, integer, jsonb) is
  'Tienda web ▸ Campañas: crea o cambia el diseño de una campaña con un parche jsonb. Pide el módulo campanas_web y firma con el responsable; la versión frena a la segunda persona; sin cambios no escribe; deja su línea en la Actividad. No toca el estado (borrador/programado).';

revoke all on function retail.guardar_campana_diseno(uuid, integer, jsonb) from public, anon;
grant execute on function retail.guardar_campana_diseno(uuid, integer, jsonb) to authenticated;

-- ---------- 7. Lo que lee la tienda ----------
-- La campaña que gana la portada (la que termina primero; las que no tienen fecha de fin, al final; empate, la de mayor descuento y
-- luego el nombre: la misma regla de `tienda_portada` de `20261014220000`) y su diseño si está PROGRAMADO (un borrador no se ve). Gana
-- primero la campaña y después se mira su diseño: una campaña con diseño que termina más tarde que otra sin diseño no le quita el lugar.
-- Devuelve solo lo que la tienda pinta (ningún id de persona ni fecha de edición). Sin campaña o sin diseño programado, `diseno` es null y
-- la tienda se ve como siempre.
create or replace function retail.tienda_diseno_campana()
returns jsonb
language sql
stable
security definer
set search_path = retail, public
as $$
  select jsonb_build_object(
    'campana', (
      select jsonb_build_object(
        'nombre', e.nombre,
        'diseno', (
          select jsonb_build_object(
            'modo', d.modo, 'plantilla', d.plantilla, 'paleta', d.paleta, 'acento', d.acento,
            'franja', d.franja, 'entrada', d.entrada, 'efecto', d.efecto, 'intensidad', d.intensidad, 'duracion', d.duracion, 'cuenta', d.cuenta,
            'titular', d.titular, 'bajada', d.bajada, 'boton', d.boton,
            'imagen_ruta', d.imagen_ruta, 'imagen_vertical_ruta', d.imagen_vertical_ruta,
            'donde', jsonb_build_object('franja', d.donde_franja, 'portada', d.donde_portada, 'catalogo', d.donde_catalogo,
                                        'sello', d.donde_sello, 'bolsa', d.donde_bolsa))
          from retail.campana_web_disenos d where d.etiqueta_id = e.id and d.estado = 'programado')
      )
      from retail.etiquetas e
      where e.estilo = 'campana'
        and e.estado = 'aprobado'
        and e.activo
        and e.descuento_pct > 0
        and (e.vigente_desde is null or e.vigente_desde <= retail.fn_hoy_lima())
        and (e.vigente_hasta is null or e.vigente_hasta >= retail.fn_hoy_lima())
        and (
          exists (select 1 from retail.variante_etiquetas ve where ve.etiqueta_id = e.id)
          or exists (select 1 from retail.etiqueta_categorias ec where ec.etiqueta_id = e.id)
        )
      order by e.vigente_hasta nulls last, e.descuento_pct desc, e.nombre
      limit 1
    )
  );
$$;

comment on function retail.tienda_diseno_campana() is
  'Tienda online: la campaña que gana la portada y su diseño PROGRAMADO (null si no tiene). {campana: {nombre, diseno} | null}. Solo la llama tienda_web. No reemplaza a tienda_portada().';

do $$
begin
  -- `tienda_web` nace en 20261014220000; en una base donde aún no existe, esta parte no aplica (la tienda tampoco).
  if exists (select 1 from pg_roles where rolname = 'tienda_web') then
    revoke all on function retail.tienda_diseno_campana() from public, anon, authenticated;
    grant execute on function retail.tienda_diseno_campana() to tienda_web;
  else
    revoke all on function retail.tienda_diseno_campana() from public, anon, authenticated;
  end if;
end
$$;
