-- ============================================================================
-- 20261021161000_campanas_web_modulo_y_lista.sql — Tienda web ▸ Campañas, actividad 1: el módulo, el diseño de cada campaña y la lista
--
-- EL PROBLEMA PRIMERO. Una campaña de la tienda online hoy es una fila de `retail.etiquetas` (estilo 'campana': nombre, descuento,
-- vigencia, prendas) y la tienda solo la dice en una frase. Felipe pidió que cada campaña tenga su propio diseño y movimiento
-- (Aniversario, Black Week, Navidad, Día del Gato…) y que el líder lo arme desde el ERP sin escribir código (maqueta aprobada:
-- docs/maquetas/campanas-tienda-2026-10/). El DISEÑO cuelga de la campaña; no la reemplaza: fechas, % y prendas siguen en Catálogo ▸
-- Etiquetas (principio 4, una sola fuente de verdad), así la tienda nunca dice un precio distinto al de la caja.
--
-- LO QUE HACE
--   1. El módulo `campanas_web` (Tienda web ▸ Campañas). Nace SIN rol (ADR-0161): solo lo ve el líder hasta que él lo da; delegable.
--   2. `retail.campana_disenos`: una fila por etiqueta de campaña con su diseño (ambiente del catálogo cerrado O imagen propia con su
--      versión vertical opcional, colores, movimiento, textos cortos, dónde se ve y si es borrador o está programado). RLS encendido
--      y SIN políticas: solo la tocan funciones `security definer` (la de escribir llega en la actividad 2).
--   3. `retail.fn_campanas_web()`: la lectura de la lista (campañas con su estado, descuento, vigencia, prendas y su diseño).
--
-- REGLAS (Lamport: lo que la base no deja que pase)
--   · Un diseño es de UNA campaña (la clave es la etiqueta) y se va con ella (`on delete cascade`: es configuración, no historia).
--   · Ambiente O imagen, nunca los dos ni ninguno: `plantilla` solo si el modo es 'ambiente', y una imagen horizontal obligatoria
--     si el modo es 'imagen'. Los valores salen de listas cerradas (CHECK): la tienda nunca recibe un efecto o ambiente que no
--     conoce, y el líder nunca escribe CSS.
--   · Textos con tope (titular 28, bajada 40, botón 22) y colores solo `#rrggbb`: nada que rompa la portada.
--
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
create table if not exists retail.campana_disenos (
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
  constraint campana_disenos_modo check (modo in ('ambiente', 'imagen')),
  constraint campana_disenos_plantilla check (
    plantilla is null or plantilla in ('sobrio', 'aniversario', 'patrias', 'madre', 'cyber', 'gato', 'navidad')
  ),
  constraint campana_disenos_modo_coherente check (
    (modo = 'ambiente') = (plantilla is not null) and (modo <> 'imagen' or imagen_ruta is not null)
  ),
  constraint campana_disenos_paleta check (paleta between 0 and 2),
  constraint campana_disenos_acento check (acento is null or acento ~ '^#[0-9a-f]{6}$'),
  constraint campana_disenos_franja check (franja in ('rota', 'marquesina', 'quieta')),
  constraint campana_disenos_entrada check (entrada in ('telon', 'caen', 'aparece', 'ninguna')),
  constraint campana_disenos_efecto check (
    efecto in ('ninguno', 'destellos', 'confeti', 'petalos', 'copos', 'corazones', 'estrellas', 'hojas', 'burbujas', 'patitas')
  ),
  constraint campana_disenos_intensidad check (intensidad in ('poca', 'media')),
  constraint campana_disenos_duracion check (duracion in ('una', 'continuo')),
  constraint campana_disenos_cuenta check (cuenta in ('siempre', 'ultimo', 'no')),
  constraint campana_disenos_titular check (titular is null or char_length(titular) between 1 and 28),
  constraint campana_disenos_bajada check (bajada is null or char_length(bajada) between 1 and 40),
  constraint campana_disenos_boton check (boton is null or char_length(boton) between 1 and 22),
  constraint campana_disenos_imagen_ruta check (imagen_ruta is null or (imagen_ruta like 'campanas/%' and char_length(imagen_ruta) <= 300)),
  constraint campana_disenos_imagen_vertical check (
    imagen_vertical_ruta is null
    or (imagen_ruta is not null and imagen_vertical_ruta like 'campanas/%' and char_length(imagen_vertical_ruta) <= 300)
  ),
  constraint campana_disenos_estado check (estado in ('borrador', 'programado')),
  constraint campana_disenos_version check (version >= 1)
);

comment on table retail.campana_disenos is
  'El diseño de la tienda online durante una campaña (Tienda web ▸ Campañas): ambiente del catálogo cerrado o imagen propia, colores, movimiento, textos cortos y dónde se ve. Cuelga de retail.etiquetas (estilo campana): fechas, % y prendas viven allí. Sin fila, la campaña se ve como siempre. Se escribe solo con funciones security definer; quién y cuándo, en retail.actividad (módulo campanas_web).';
comment on column retail.campana_disenos.modo is 'ambiente | imagen. Con ambiente, plantilla obligatoria; con imagen, imagen_ruta obligatoria (la vertical es opcional y se usa en celular).';
comment on column retail.campana_disenos.acento is 'Color propio #rrggbb: el acento del ambiente o el del botón «Ver la campaña» sobre la imagen. Null = el de la paleta o el de fábrica.';

alter table retail.campana_disenos enable row level security;
revoke all on table retail.campana_disenos from public, anon, authenticated;

-- ---------- 3. La lista ----------
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
      select jsonb_agg(c.fila order by c.orden_estado, c.orden_fecha, c.nombre)
        from (
          select
            e.nombre,
            case when e.vigente_desde is not null and e.vigente_desde > v_hoy then 2
                 when e.vigente_hasta is not null and e.vigente_hasta < v_hoy then 3
                 else 1 end as orden_estado,
            -- vivas: la que termina primero (como la portada); programadas: la que empieza primero; terminadas: la más reciente.
            case when e.vigente_hasta is not null and e.vigente_hasta < v_hoy then (v_hoy - e.vigente_hasta)::numeric
                 when e.vigente_desde is not null and e.vigente_desde > v_hoy then (e.vigente_desde - v_hoy)::numeric
                 else coalesce((e.vigente_hasta - v_hoy)::numeric, 100000) end as orden_fecha,
            jsonb_build_object(
              'id', e.id,
              'nombre', e.nombre,
              'pct', e.descuento_pct,
              'desde', e.vigente_desde,
              'hasta', e.vigente_hasta,
              'estado', case when e.vigente_desde is not null and e.vigente_desde > v_hoy then 'prog'
                             when e.vigente_hasta is not null and e.vigente_hasta < v_hoy then 'fin'
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
                  from retail.campana_disenos d where d.etiqueta_id = e.id
              )
            ) as fila
          from retail.etiquetas e
          where e.estilo = 'campana'
            and e.estado = 'aprobado'
            and e.activo
            and e.descuento_pct > 0
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
