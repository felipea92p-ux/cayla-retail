-- ============================================================================
-- 20260930230200_club_paso1c_parte3_cumpleanos.sql — CAYLA V2 · Club de clientas · paso 1, tanda 1c · PARTE 3 de 3
-- ADR-0288 (D-5, CL-10, CL-11 y «Contrato de la tanda 1c»). TRES PARTES, sin políticas ni `drop trigger` (CLAUDE.md,
-- «Políticas y deadlocks»).
--
-- EL PROBLEMA. El club promete un regalo de cumpleaños (CL-10), y hoy la caja solo puede darlo como un descuento a mano con
-- el motivo «Cumpleaños clienta top»: la base le cree a la pantalla el monto y quién lo merece, nada impide darlo dos veces
-- en el año o fuera de su mes, cualquier descuento puede disfrazarse de cumpleaños, y el candado de costo lo frena en una
-- prenda rebajada aunque Felipe decidió regalarlo completo.
--
-- QUÉ HACE
--   PARTE 1 (venta_items, sola): `venta_items.descuento_club_unitario` (default 0), cuánto del descuento de cada prenda es
--     del cumpleaños; `descuento_unitario` sigue siendo el TOTAL, así que comprobante, pagos y reportes no cambian. Candados:
--     `0 <= club <= descuento_unitario`, y el motivo describe el descuento SIN el club.
--   PARTE 2 (configuracion_empresa, sola): `club_cumple_pct` (10 por defecto, entre 1 y 50).
--   PARTE 3 (este archivo):
--   1. `retail.club_canjes`: un canje por socia, tipo y año, con su venta, el %, el monto y quién lo registró. El único
--      parcial `(clienta_id, tipo, anio) where anulado_en is null` hace imposible un segundo canje vivo del mismo año (en el
--      esquema, no solo en el código). RLS encendido sin políticas y sin permisos para la API: solo lo tocan estas funciones.
--   2. `registrar_venta` suma `p_canjear_cumpleanos boolean default false` (cambia de firma: `drop` de la vieja y `create`
--      de la nueva, sobre su definición viva, la de la tanda 1a). Con `true`:
--        · exige clienta (`cumple_sin_clienta`), que sea socia sin anonimizar ni archivar (`cumple_no_socia`; anonimizada
--          ya la frena la D-1 con `clienta_anonimizada`), que el mes de Lima sea su `cumple_mes` (`cumple_fuera_de_mes`) y que
--          no tenga un canje vivo este año (`cumple_ya_canjeado`);
--        · recalcula en cada línea `round((precio − descuento_sin_club) × pct / 100, 2)` y rechaza si lo que mandó Cobrar en
--          `descuento_club_unitario` difiere en más de 1 céntimo (`cumple_descuento_distinto`), o si nada queda por
--          descontar (`cumple_sin_monto`);
--        · anota el canje en `club_canjes` y la actividad (sin datos de la clienta).
--      Sin canjear, toda `descuento_club_unitario` tiene que ser 0 (`cumple_sin_canje`). Los candados de la venta (costo,
--      campaña, 35 % del líder, argumento sobre el 15 % y código de descuento) miden el descuento SIN la parte del club.
--   3. Anular una venta libera su canje (`anulado_en`, `anulado_por`, los de la venta): un disparador sobre `ventas`
--      (`trg_club_canje_libera_al_anular`), como el de la prenda por regularizar. Una devolución NO lo libera.
--   4. `resumen_clienta_caja` suma `cumple_disponible`, `cumple_pct` y `cumple_canjeado_este_anio` (cambia su tipo de
--      retorno: `drop` y `create`, con la misma lectura y los mismos permisos).
--
-- DECIDÍ: Felipe (2026-09-30): el % se aplica completo aunque la prenda quede bajo su costo. Es un regalo del club; el
--   candado de costo sigue valiendo para el resto de los descuentos, medido sin la parte del club.
-- DECIDÍ: Cobrar manda el monto de cada línea (`descuento_club_unitario`) y la base lo recalcula con la misma regla y lo
--   rechaza si no coincide. Se guarda lo que mandó Cobrar (a 1 céntimo de lo calculado, como la campaña): así el total que
--   ve la clienta y el de la base son el mismo, y los pagos cuadran al céntimo.
-- DECIDÍ: el motivo de la línea describe el descuento sin el club; una prenda cuyo único descuento es el cumpleaños no
--   lleva motivo (PARTE 1). La marca del cumpleaños es su columna, no un motivo más en la lista del descuento a mano.
-- DECIDÍ: la ficha se toma `for no key update` (no `for update`) al canjear, en la MISMA lectura de la D-1 (la que sigue
--   las uniones). Dos cajas que canjean a la misma socia hacen fila ahí (y una unión o un archivo de esa ficha también),
--   pero una venta SIN canje a la misma clienta, en otra tienda, no espera: su `for key share` no choca con él. Tomarla
--   primero `for key share` y subirla después a un candado fuerte trabaría a dos canjes entre sí (deadlock).
-- DECIDÍ: anular libera el canje con un disparador sobre `ventas`, no dentro de `anular_venta`: así lo libera TODA
--   anulación (la RPC, y el SQL a mano de `pegar-en-produccion-anular-venta-*.sql`, que cambia el estado sin pasar por
--   ella). Es el mismo patrón que `trg_prendas_por_regularizar_al_anular`. `anular_venta` no cambia.
-- DECIDÍ: el tope de descuento de VENTA de la asesora (D-67) no necesita nada: mide `p_descuento_pct`, que la caja declara
--   aparte y que no sale de las líneas; la parte del club nunca entra ahí. Lo prueba club_cumpleanos.mjs.
-- DECIDÍ: sin fila en `configuracion_empresa` (una base recién armada) el % es 10, el default de la columna.
-- DESCARTÉ: que la pantalla calcule el 10 % y lo mande en `descuento_unitario` con el motivo «cumpleaños» (la base le
--   creería al navegador el monto y la elegibilidad: D-5); que la base ignore lo que manda Cobrar y ponga su monto (un
--   céntimo de diferencia haría que los pagos no cuadren y la venta fallaría con un mensaje que no dice por qué); un motivo
--   `club_cumpleanos` en la lista (mezclaría el regalo del club con el criterio de la asesora en los reportes de motivo);
--   liberar el canje con una devolución (Felipe, 2026-09-29: la clienta se llevó el regalo en esa compra).
-- SE ROMPE SI: una función nueva escribe `venta_items` con descuento de cumpleaños sin pasar por `registrar_venta` (nadie
--   anotaría el canje: el único parcial no lo ve), o alguien vuelve a medir el costo, el tope o el código sobre
--   `descuento_unitario` entero (el cumpleaños volvería a chocar con ellos). Una migración futura que recree
--   `registrar_venta` tiene que partir de esta definición viva, no de un archivo viejo (su candado de versión).
--
-- CANDADO DE VERSIÓN. Antes de tocar nada, la sección 0 compara el md5 NORMALIZADO (sin comentarios ni espacios) del cuerpo
-- vivo de lo que reescribe con el que tenía el 2026-09-30 (el «después» de la 1a para `registrar_venta`, que está en
-- producción; el «después» de la 1b para `resumen_clienta_caja`) o con el de después de este archivo. Con cualquier otro,
-- aborta sin tocar nada. También aborta si faltan la PARTE 1, la PARTE 2 o la tanda 1b.
--
-- CÓMO SE PEGA EN PRODUCCIÓN — TRES ARCHIVOS, CADA UNO SOLO EN EL SQL EDITOR, EN ORDEN (el SQL Editor corre todo lo pegado
-- en UNA transacción):
--   · Antes: la tanda 1b entera (20260930200000 y 20260930200100).
--   · PARTE 1 = 20260930230000_club_paso1c_parte1_venta_items.sql: solo `venta_items` (toda venta escribe ahí).
--   · PARTE 2 = 20260930230100_club_paso1c_parte2_configuracion.sql: solo `configuracion_empresa` (toda venta la lee antes
--     de escribir). Juntas en una transacción, una venta que ya leyó la configuración y espera `venta_items` y esta
--     migración, que tiene `venta_items` y espera la configuración, se trabarían (deadlock); por separado, cada parte toma
--     una sola tabla en uso y no puede trabarse con nadie.
--   · PARTE 3 = este archivo: toma `clientas`, `ventas` y `personas` (las llaves de `club_canjes` y el disparador) en modo
--     compartido y en el mismo orden que una venta (ficha → venta), y reescribe las dos funciones.
--   Cada parte espera como mucho 3 s un candado (`lock_timeout`): si la tienda está usando esa tabla, falla limpio y se
--   vuelve a pegar ESA parte. Las tres se pueden pegar dos veces (idempotentes). En local y en el CI corren seguidas.
--   Entre las partes, vender funciona igual (la columna nueva nace en 0 y la firma vieja sigue hasta la PARTE 3). Después
--   de la PARTE 3, la pantalla de hoy sigue vendiendo (no manda el parámetro nuevo: queda en `false`). Fusionar el PR de
--   la web DESPUÉS de pegar las tres.
--
-- VERIFICACIÓN (solo lectura, después de pegar las tres partes):
--   select p.oid::regprocedure, md5(regexp_replace(regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'),
--          '--[^' || chr(10) || ']*', '', 'g'), '\s+', '', 'g'))
--     from pg_proc p
--    where p.pronamespace = 'retail'::regnamespace
--      and p.proname in ('registrar_venta', 'resumen_clienta_caja', 'fn_club_canje_libera_al_anular')
--    order by 1;
--   → exactamente 3 filas, cada una con su md5 «después» de la sección 0 (una sola firma de registrar_venta, la de 17); y
--   select column_default from information_schema.columns
--    where table_schema = 'retail' and table_name = 'venta_items' and column_name = 'descuento_club_unitario';   → 0
--   select club_cumple_pct from retail.configuracion_empresa;   → 10.00
--   select relrowsecurity, (select count(*) from pg_policy where polrelid = 'retail.club_canjes'::regclass),
--          has_table_privilege('authenticated', 'retail.club_canjes', 'select')
--     from pg_class where oid = 'retail.club_canjes'::regclass;   → t | 0 | f
--   select count(*) from pg_trigger where tgrelid = 'retail.ventas'::regclass and tgname = 'trg_club_canje_libera_al_anular';   → 1
--   select proacl from pg_proc where oid = 'retail.registrar_venta(uuid,jsonb,jsonb,uuid,uuid,text,text,text,text,text,text,uuid,text,numeric,uuid,text,boolean)'::regprocedure;
--     → {postgres=X/postgres,authenticated=X/postgres}
--
-- CONCURRENCIA. Dos cajas canjean a la vez a la misma socia: las dos toman su ficha `for no key update` en la lectura de la
-- D-1; la segunda espera, y cuando la primera confirma ve su canje y se rechaza con `cumple_ya_canjeado` (y si igual llegara
-- a insertar, el único parcial lo impide y se traduce al mismo hint). Un reintento de la MISMA venta (mismo `p_token`) que
-- esperó ahí devuelve la venta que ya quedó, en vez de rechazarse. Una venta sin canje a la misma clienta no espera. Lo
-- prueban (j1)–(j4) de scripts/pruebas/club_cumpleanos.mjs (las tres con COMMIT, contra un Postgres desechable).
-- Anular una venta mientras otra caja canjea a la misma socia: el canje de la venta anulada se libera en la misma
-- transacción de la anulación; la otra caja lo ve libre o no según quién confirme primero, y el único parcial garantiza que
-- en ningún caso quedan dos canjes vivos.
-- CAÍDA EXTERNA. Nada de esto llama a WhatsApp, al padrón ni a Lucode. Sin conexión, la web no ofrece el canje (D-5): una
-- venta en cola que llega con el canje ya usado se rechaza entera y la cola la muestra como rechazo (ADR-0036).
-- ============================================================================

-- ============================== PARTE 3 · el cumpleaños ==============================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 0. candado de versión ----------
do $guarda$
declare
  r record;
  v_md5 text;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'retail' and table_name = 'venta_items' and column_name = 'descuento_club_unitario') then
    raise exception 'Falta la PARTE 1 de esta migración (venta_items.descuento_club_unitario): pégala antes que esta.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'retail' and table_name = 'configuracion_empresa' and column_name = 'club_cumple_pct') then
    raise exception 'Falta la PARTE 2 de esta migración (configuracion_empresa.club_cumple_pct): pégala antes que esta.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'retail' and table_name = 'clientas' and column_name = 'club_desde') then
    raise exception 'Falta la tanda 1b del club (clientas.club_desde): pega antes 20260930200000 y 20260930200100.';
  end if;
  for r in
    select * from (values
      -- firma                                                                                                          antes (producción / 1b)              despues (este archivo)
      ('retail.registrar_venta(uuid,jsonb,jsonb,uuid,uuid,text,text,text,text,text,text,uuid,text,numeric,uuid,text)',         '703928f528c805117648d43c6fea3b76', null),
      ('retail.registrar_venta(uuid,jsonb,jsonb,uuid,uuid,text,text,text,text,text,text,uuid,text,numeric,uuid,text,boolean)', null,                               '2b55a94a754e7708f5b133008f30469f'),
      ('retail.resumen_clienta_caja(uuid)',                                                                                    'dac9d86ff36907d1c82bdf1746627305', '1cfcde52084341a1d32b7b5a488c8ffa'),
      ('retail.fn_club_canje_libera_al_anular()',                                                                              null,                               'a9507e16b3e6a5f114aa886a0667376c')
    ) as t(firma, antes, despues)
  loop
    select md5(regexp_replace(regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\s+', '', 'g'))
      into v_md5
      from pg_proc p
     where p.oid = to_regprocedure(r.firma);
    if v_md5 is null then
      -- Que no exista es «después» para la firma vieja de registrar_venta (este archivo la suelta) y «antes» para lo nuevo.
      if r.antes is not null and r.despues is not null then
        raise exception '% no existe en esta base: pega antes la tanda 1b del club (20260930200100).', r.firma;
      end if;
    elsif v_md5 is distinct from r.antes and v_md5 is distinct from r.despues then
      raise exception '% cambió desde que se escribió esta migración (md5 normalizado %; se esperaba % —antes— o % —después—). No se reemplaza a ciegas: lee su definición viva y rehace este cambio sobre ESA versión.',
        r.firma, v_md5, coalesce(r.antes, 'que no exista'), coalesce(r.despues, 'que ya no exista');
    end if;
  end loop;
end
$guarda$;

-- ---------- 1. club_canjes: un canje vivo por socia, tipo y año ----------
-- Las llaves en el orden de una venta: la ficha (`clientas`) primero, la venta (`ventas`) después, y `personas` al final.
-- Así una venta con clienta que ya tomó su ficha termina antes, y nadie queda esperando algo que esta parte tenga.
create table if not exists retail.club_canjes (
  id             uuid primary key default gen_random_uuid(),
  clienta_id     uuid not null references retail.clientas (id),
  venta_id       uuid not null references retail.ventas (id),
  tipo           text not null,
  anio           smallint not null,
  pct            numeric(5,2) not null,
  monto          numeric(12,2) not null,
  registrado_por uuid references public.personas (id),
  created_at     timestamptz not null default now(),
  anulado_en     timestamptz,
  anulado_por    uuid references public.personas (id),
  -- (los candados, abajo: fuera del `create table`, para que pegar otra vez los rehaga)
  constraint club_canjes_tipo_no_vacio check (btrim(tipo) <> '')
);
comment on table retail.club_canjes is
  'Los canjes del club (ADR-0288 D-5): hoy, el cumpleaños (tipo cumpleanos; más adelante, aniversario). Un canje vivo por socia, tipo y año de Lima (único parcial club_canjes_uno_vivo_por_anio). Lo escribe registrar_venta con p_canjear_cumpleanos; anular la venta lo libera (anulado_en, disparador trg_club_canje_libera_al_anular); una devolución no. monto = lo que regaló el club en esa venta (suma de descuento_club_unitario por cantidad). RLS sin políticas y sin permisos para la API.';
comment on column retail.club_canjes.registrado_por is
  'Quien vendió (el responsable del combo, como ventas.usuario_id). Puede faltar solo si la venta tampoco lo tiene.';

alter table retail.club_canjes drop constraint if exists club_canjes_tipo_valido;
alter table retail.club_canjes add constraint club_canjes_tipo_valido check (tipo in ('cumpleanos'));
alter table retail.club_canjes drop constraint if exists club_canjes_anio_valido;
alter table retail.club_canjes add constraint club_canjes_anio_valido check (anio between 2026 and 2200);
alter table retail.club_canjes drop constraint if exists club_canjes_pct_valido;
alter table retail.club_canjes add constraint club_canjes_pct_valido check (pct >= 1 and pct <= 50);
alter table retail.club_canjes drop constraint if exists club_canjes_monto_valido;
alter table retail.club_canjes add constraint club_canjes_monto_valido check (monto > 0);
alter table retail.club_canjes drop constraint if exists club_canjes_anulado_completo;
alter table retail.club_canjes add constraint club_canjes_anulado_completo check (anulado_por is null or anulado_en is not null);

-- El candado del año: un segundo canje vivo del mismo tipo y año es imposible en el esquema.
create unique index if not exists club_canjes_uno_vivo_por_anio
  on retail.club_canjes (clienta_id, tipo, anio) where anulado_en is null;
create index if not exists club_canjes_venta_idx on retail.club_canjes (venta_id);

alter table retail.club_canjes enable row level security;
revoke all on retail.club_canjes from public, anon, authenticated;

-- ---------- 2. anular una venta libera su canje ----------
-- PROMETE: cuando una venta pasa a `anulada` (por `anular_venta` o por el SQL a mano de una anulación), su canje vivo queda
--   anulado con la misma hora y la misma persona que la venta. La socia puede volver a canjear este año.
-- NO HACE: una devolución no cambia el estado de la venta: no libera nada (Felipe, 2026-09-29).
create or replace function retail.fn_club_canje_libera_al_anular()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  update retail.club_canjes k
     set anulado_en = coalesce(new.anulado_en, now()),
         anulado_por = new.anulado_por
   where k.venta_id = new.id
     and k.anulado_en is null;
  return null;
end;
$$;
comment on function retail.fn_club_canje_libera_al_anular() is
  'Disparador de ventas (ADR-0288 D-5): al anular una venta, libera su canje de cumpleaños (anulado_en y anulado_por, los de la venta).';
revoke all on function retail.fn_club_canje_libera_al_anular() from public, anon, authenticated;

create or replace trigger trg_club_canje_libera_al_anular
  after update of estado on retail.ventas
  for each row
  when (new.estado = 'anulada' and old.estado is distinct from 'anulada')
  execute function retail.fn_club_canje_libera_al_anular();

-- ---------- 3. registrar_venta: el cumpleaños con un canje por año ----------
-- Sobre la definición viva (la de la tanda 1a, md5 703928f5… en producción). Lo que cambia está marcado «ADR-0288 D-5».
drop function if exists retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text, uuid, text, numeric, uuid, text);

create or replace function retail.registrar_venta(
  p_ubicacion_id uuid,
  p_items jsonb,
  p_pagos jsonb,
  p_cliente_id uuid default null,
  p_token uuid default null,
  p_tipo_comprobante text default null,
  p_cliente_tipo_doc text default 'sin_documento',
  p_cliente_num_doc text default null,
  p_cliente_nombre text default null,
  p_codigo_descuento text default null,
  p_nota text default null,
  p_asesora_id uuid default null,
  p_emisor text default 'retail',
  p_descuento_pct numeric default 0,
  p_autorizado_por uuid default null,
  p_motivo_descuento text default null,
  p_canjear_cumpleanos boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_venta_id uuid; v_existente ventas%rowtype; v_item jsonb; v_pago jsonb;
  v_item_id uuid; v_mov_id uuid; v_costo numeric; v_persona uuid;
  v_sub uuid;
  v_caja_id uuid;
  v_total_items numeric := 0;
  v_total_pagos numeric := 0;
  v_igv numeric;
  v_subtotal numeric;
  v_precio_catalogo numeric; v_referencia text; v_sku text;
  c_cargo_especial constant uuid := '22222222-2222-4222-8222-222222222222';
  -- Días después de terminar que la base todavía ACEPTA el descuento de una
  -- campaña (venta hecha sin red y subida más tarde). No afecta lo que se exige.
  c_tolerancia_campana constant integer := 3;
  v_descuento numeric;               -- ADR-0288 D-5: el descuento de la línea SIN la parte del club
  v_hay_descuento boolean := false;  -- descuento MANUAL (el que pide código a una colaboradora)
  v_codigo codigos_descuento%rowtype;
  v_codigo_limpio text := upper(btrim(coalesce(p_codigo_descuento, '')));
  v_motivo text; v_motivo_otro text; v_argumento text;
  v_hoy date := fn_hoy_lima();
  v_c_id uuid; v_c_nombre text; v_c_pct numeric; v_c_unit numeric;
  v_etq_id uuid; v_etq_pct numeric;
  v_tope_descuento numeric;  -- D-67: tope de descuento de VENTA de quien vende (NULL = sin tope)
  -- ADR-0288 D-5 (tanda 1c): el cumpleaños de la socia.
  v_club numeric;                        -- la parte del club de la línea (descuento_club_unitario que mandó Cobrar)
  v_club_calc numeric;                   -- la misma, calculada aquí
  v_club_pct numeric;                    -- configuracion_empresa.club_cumple_pct (solo si se canjea)
  v_club_monto numeric := 0;             -- lo que regala el club en esta venta: Σ parte del club × cantidad
  v_anio_lima smallint := extract(year from v_hoy)::smallint;
begin
  -- ADR-0288 D-5: un null explícito es «no canjear» (con null, `if not …` tomaría la rama equivocada).
  p_canjear_cumpleanos := coalesce(p_canjear_cumpleanos, false);

  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para vender en esa ubicación';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'El carrito está vacío';
  end if;
  if p_pagos is null or jsonb_array_length(p_pagos) = 0 then
    raise exception 'Falta indicar cómo se pagó la venta';
  end if;
  if p_tipo_comprobante is not null and p_tipo_comprobante not in ('boleta', 'factura', 'nota_venta') then
    raise exception 'Una venta solo puede facturarse como boleta o factura (se pidió %)', p_tipo_comprobante;
  end if;
  if p_emisor not in ('alegra', 'retail') then
    raise exception 'p_emisor solo puede ser "alegra" o "retail" (se pidió %)', p_emisor;
  end if;
  if p_descuento_pct < 0 or p_descuento_pct > 100 then
    raise exception 'El descuento de la venta debe estar entre 0%% y 100%% (se pidió %)', p_descuento_pct;
  end if;

  if p_token is not null then
    select * into v_existente from ventas where token_cliente = p_token;
    if found then return v_existente.id; end if;
  end if;

  select id into v_caja_id from cajas where ubicacion_id = p_ubicacion_id and estado = 'abierta' for share;
  -- ADR-0190: los candados en orden fijo antes de mover nada (sin bloqueos mutuos entre dos operaciones).
  perform fn_bloquear_en_orden(p_ubicacion_id, fn_ids_de_items(p_items));
  if v_caja_id is null then
    raise exception 'No hay una caja abierta en esta ubicación — ábrela antes de registrar una venta';
  end if;

  v_persona := retail.fn_actor_persona_id(true);

  -- ADR-0288 D-1: la clienta del ticket. Si su ficha se unió a otra, la venta va a la que quedó (unir_clientas ya movió
  -- las anteriores); si está anonimizada, pidió que la olvidaran y no se le cuelga nada nuevo.
  -- Variables sueltas y no un `record`: sin clienta (la mayoría de las ventas) nadie las asigna, y leer un campo de un
  -- `record` sin asignar falla («record is not assigned yet») aunque el `and` de al lado ya sea falso.
  -- `for key share`: si otra caja está uniendo esta ficha (unir_clientas la toma con `for update`), la venta espera a que
  -- termine y sigue la unión; sin él, leía la ficha de antes de la unión y la venta quedaba colgada de la ficha unida.
  -- ADR-0288 D-5: si se canjea el cumpleaños, la misma lectura la toma `for no key update`: dos cajas que canjean a la misma
  -- socia hacen fila aquí (tomarla primero `for key share` y subirla después las trabaría entre sí). Una venta sin canje no
  -- espera a un canje: su `for key share` no choca con `for no key update`.
  declare
    v_ficha_id uuid;
    v_ficha_anonimizada boolean;
    v_ficha_fusionada_en uuid;
    v_saltos_union integer := 0;
  begin
    while p_cliente_id is not null loop
      -- Sin `select … into` a propósito: el SQL Editor de Supabase lo confunde, dentro de un texto, con un `SELECT INTO`
      -- que crea una tabla (pasó el 2026-09-30). El `for` lee la misma fila; si no hay, las variables quedan en null.
      v_ficha_id := null;
      v_ficha_anonimizada := null;
      v_ficha_fusionada_en := null;
      if p_canjear_cumpleanos then
        for v_ficha_id, v_ficha_anonimizada, v_ficha_fusionada_en in
          select c.id, c.anonimizada, c.fusionada_en_id from retail.clientas c where c.id = p_cliente_id for no key update
        loop
          exit;
        end loop;
      else
        for v_ficha_id, v_ficha_anonimizada, v_ficha_fusionada_en in
          select c.id, c.anonimizada, c.fusionada_en_id from retail.clientas c where c.id = p_cliente_id for key share
        loop
          exit;
        end loop;
      end if;
      if v_ficha_id is null then
        raise exception 'Esa clienta ya no está en la libreta. Quítala del ticket y vuelve a buscarla.'
          using hint = 'clienta_no_existe';
      end if;
      exit when v_ficha_fusionada_en is null;
      v_saltos_union := v_saltos_union + 1;
      if v_saltos_union > 10 then
        raise exception 'La ficha de esta clienta tiene una cadena de uniones demasiado larga. Avísale al líder.';
      end if;
      p_cliente_id := v_ficha_fusionada_en;
    end loop;
    if v_ficha_anonimizada then
      raise exception 'Esta clienta pidió borrar sus datos: la venta no se puede guardar a su nombre. Quítala del ticket y vende sin clienta.'
        using hint = 'clienta_anonimizada';
    end if;
  end;

  -- ADR-0288 D-5 (tanda 1c): el cumpleaños. Cobrar solo dice «canjear»; si puede y cuánto lo decide la base.
  if p_canjear_cumpleanos then
    if p_cliente_id is null then
      raise exception 'El cumpleaños es de una socia del club: elige a la clienta en el ticket antes de canjearlo.'
        using hint = 'cumple_sin_clienta';
    end if;
    -- Un reintento de ESTA venta que esperó en la ficha mientras la primera se guardaba: ya está, se devuelve.
    if p_token is not null then
      select * into v_existente from ventas where token_cliente = p_token;
      if found then return v_existente.id; end if;
    end if;
    declare
      v_socia boolean;
      v_cumple_mes smallint;
    begin
      for v_socia, v_cumple_mes in
        select c.club_desde is not null and not c.anonimizada and c.archivada_en is null, c.cumple_mes
          from retail.clientas c where c.id = p_cliente_id
      loop
        exit;
      end loop;
      if not coalesce(v_socia, false) then
        raise exception 'El descuento de cumpleaños es para las socias del club: esta clienta no es socia.'
          using hint = 'cumple_no_socia';
      end if;
      if v_cumple_mes is null or v_cumple_mes <> extract(month from v_hoy) then
        raise exception 'El descuento de cumpleaños se canjea en el mes de su cumpleaños, y este no es.'
          using hint = 'cumple_fuera_de_mes';
      end if;
    end;
    if exists (select 1 from club_canjes k
                where k.clienta_id = p_cliente_id and k.tipo = 'cumpleanos' and k.anio = v_anio_lima and k.anulado_en is null) then
      raise exception 'Esta socia ya canjeó su cumpleaños este año.'
        using hint = 'cumple_ya_canjeado';
    end if;
    v_club_pct := coalesce((select e.club_cumple_pct from configuracion_empresa e limit 1), 10.00);
  end if;

  v_sub := fn_sububicacion_por_defecto(p_ubicacion_id, 'venta');

  -- D-67: descuento a nivel de VENTA (distinto del descuento por línea, que sigue su propio
  -- candado más abajo sin cambios). Solo se evalúa si de verdad se pidió uno.
  -- ADR-0288 D-5: la parte del club nunca entra aquí: p_descuento_pct lo declara la caja aparte, no sale de las líneas.
  if p_descuento_pct > 0 then
    -- ADR-0162: el tope es un PERMISO de la CUENTA, no de quien firma (v_persona puede ser el responsable
    -- elegido en el combo, sin PIN). Una terminal descuenta SIN tope ni autorización (Felipe, 2026-09-22):
    -- NULL = «sin tope», igual que un líder.
    select tope_descuento_pct into v_tope_descuento from colaboradores
      where persona_id = (select id from personas where auth_user_id = auth.uid());
    if exists (select 1 from retail.fn_terminal_actual()) then
      v_tope_descuento := null;
    end if;
    if v_tope_descuento is not null and p_descuento_pct > v_tope_descuento then
      if p_autorizado_por is null or not fn_es_lider_persona(p_autorizado_por) then
        raise exception 'Ese descuento (%.2f%%) supera tu tope (%.2f%%) — necesita la autorización de un líder de equipo', p_descuento_pct, v_tope_descuento
          using errcode = '42501';
      end if;
    end if;
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select v.precio, p.referencia, coalesce(v.codigo, v.sku, 'sin código')
      into v_precio_catalogo, v_referencia, v_sku
      from variantes v join productos p on p.id = v.producto_id
      where v.id = (v_item ->> 'variante_id')::uuid;
    if v_precio_catalogo is null then
      raise exception 'La variante % no existe', v_item ->> 'variante_id';
    end if;

    if (v_item ->> 'variante_id')::uuid <> c_cargo_especial
       and not fn_variante_permitida_en_sede((v_item ->> 'variante_id')::uuid, p_ubicacion_id) then
      raise exception 'venta_variante_restringida_a_otra_sede' using detail = v_referencia || ' (' || v_sku || ')';
    end if;

    if (v_item ->> 'variante_id')::uuid <> c_cargo_especial
       and round((v_item ->> 'precio_unitario')::numeric, 2) <> round(v_precio_catalogo, 2) then
      raise exception 'venta_precio_cambiado'
        using detail = v_referencia || ' (' || v_sku || ')',
              hint = format('En catálogo vale S/%s y la caja mandó S/%s', v_precio_catalogo, v_item ->> 'precio_unitario');
    end if;

    -- ADR-0179: una prenda sin registrar sin sus datos no se puede regularizar después.
    if (v_item ->> 'variante_id')::uuid = c_cargo_especial and (
         btrim(coalesce(v_item ->> 'descripcion_libre', '')) = ''
         or nullif(v_item ->> 'categoria_id', '') is null
         or nullif(v_item ->> 'talla_id', '') is null
         or nullif(v_item ->> 'color_codigo', '') is null
         or (v_item ->> 'cantidad')::integer <> 1
         or (v_item ->> 'precio_unitario')::numeric - coalesce((v_item ->> 'descuento_unitario')::numeric, 0) <= 0) then
      raise exception 'prenda_sin_registrar_incompleta'
        using hint = 'Una prenda sin registrar necesita descripción, categoría, talla, color, precio y cantidad 1';
    end if;

    -- ADR-0288 D-5: `descuento_unitario` es el TOTAL; `descuento_club_unitario`, la parte del cumpleaños. Todo lo que sigue
    -- (campaña, descuento a mano, costo, 35 %, argumento) mide el descuento SIN el club: v_descuento.
    v_club := coalesce((v_item ->> 'descuento_club_unitario')::numeric, 0);
    v_descuento := coalesce((v_item ->> 'descuento_unitario')::numeric, 0) - v_club;
    if not p_canjear_cumpleanos then
      if v_club <> 0 then
        raise exception 'Esta venta trae un descuento de cumpleaños sin canjearlo. Vuelve a tocar «Canjear» o quítalo.'
          using detail = v_referencia || ' (' || v_sku || ')', hint = 'cumple_sin_canje';
      end if;
    else
      -- CL-11: en cascada, sobre lo que queda de la prenda. El mismo redondeo que la web (lib/club-cumple-canje-reglas.ts).
      v_club_calc := round(((v_item ->> 'precio_unitario')::numeric - v_descuento) * v_club_pct / 100, 2);
      if abs(v_club - v_club_calc) > 0.01 then
        raise exception 'El descuento de cumpleaños de % no es el que corresponde (S/% y la caja mandó S/%). Vuelve a abrir el cobro.',
          v_referencia || ' (' || v_sku || ')', v_club_calc, v_club
          using detail = v_referencia || ' (' || v_sku || ')', hint = 'cumple_descuento_distinto';
      end if;
      v_club_monto := v_club_monto + v_club * (v_item ->> 'cantidad')::integer;
    end if;
    v_motivo := btrim(coalesce(v_item ->> 'motivo_descuento', ''));

    -- La campaña que RIGE HOY para esta prenda (la de mayor %). El "Monto
    -- manual" no es una prenda del catálogo: no entra en campañas.
    v_c_id := null; v_c_nombre := null; v_c_pct := null;
    if (v_item ->> 'variante_id')::uuid <> c_cargo_especial then
      select c.etiqueta_id, c.etiqueta_nombre, c.descuento_pct
        into v_c_id, v_c_nombre, v_c_pct
        from fn_campanas_por_variante(v_hoy, 0, array[(v_item ->> 'variante_id')::uuid]) c
        order by c.descuento_pct desc, c.etiqueta_nombre, c.etiqueta_id
        limit 1;
    end if;
    v_c_unit := case when v_c_pct is null then 0
                     else retail.fn_descuento_campana((v_item ->> 'precio_unitario')::numeric, v_c_pct) end;

    -- Lo EXIGIDO: si la prenda tiene campaña hoy, la clienta la recibe. La caja
    -- no puede cobrar menos descuento (el 0,01 absorbe el redondeo del navegador).
    if v_c_id is not null and v_descuento < v_c_unit - 0.01 then
      raise exception 'venta_campana_omitida'
        using detail = v_referencia || ' (' || v_sku || ')',
              hint = format('«%s» da %s %% y la caja mandó S/%s de descuento', v_c_nombre,
                            trim(trailing '.' from trim(trailing '0' from v_c_pct::text)), v_descuento);
    end if;

    if v_motivo = 'campana' then
      -- Descuento de campaña: se verifica contra la etiqueta que la caja dice
      -- (aceptando una terminada hace pocos días, por la venta sin red).
      v_etq_id := nullif(btrim(coalesce(v_item ->> 'descuento_etiqueta_id', '')), '')::uuid;
      if v_etq_id is null then
        raise exception 'venta_campana_sin_etiqueta' using detail = v_referencia || ' (' || v_sku || ')';
      end if;
      select c.descuento_pct into v_etq_pct
        from fn_campanas_por_variante(v_hoy, c_tolerancia_campana, array[(v_item ->> 'variante_id')::uuid]) c
        where c.etiqueta_id = v_etq_id;
      if not found then
        raise exception 'venta_campana_no_vigente' using detail = v_referencia || ' (' || v_sku || ')';
      end if;
      if v_descuento <= 0
         or abs(v_descuento - retail.fn_descuento_campana((v_item ->> 'precio_unitario')::numeric, v_etq_pct)) > 0.011 then
        raise exception 'venta_campana_monto_no_coincide'
          using detail = v_referencia || ' (' || v_sku || ')',
                hint = format('La etiqueta da %s %% y la caja mandó S/%s de descuento',
                              trim(trailing '.' from trim(trailing '0' from v_etq_pct::text)), v_descuento);
      end if;

    elsif v_descuento > 0 then
      -- Descuento MANUAL. Con campaña, solo vale si la supera: un solo descuento.
      if v_c_id is not null and v_descuento <= v_c_unit + 0.01 then
        raise exception 'venta_descuento_no_supera_campana'
          using detail = v_referencia || ' (' || v_sku || ')',
                hint = format('«%s» ya da S/%s por prenda', v_c_nombre, v_c_unit);
      end if;

      v_hay_descuento := true;

      v_motivo_otro := btrim(coalesce(v_item ->> 'motivo_descuento_detalle', ''));
      v_argumento := btrim(coalesce(v_item ->> 'argumento_descuento', ''));

      if v_motivo not in ('cumpleanos_clienta_top', 'prenda_con_desperfecto', 'liquidacion_temporada', 'cerrar_venta', 'otro') then
        raise exception 'venta_descuento_requiere_motivo' using detail = v_referencia || ' (' || v_sku || ')';
      end if;
      if v_motivo = 'otro' and v_motivo_otro = '' then
        raise exception 'venta_descuento_otro_sin_detalle' using detail = v_referencia || ' (' || v_sku || ')';
      end if;

      -- ADR-0288 D-5 (Felipe, 2026-09-30): el costo se mide SIN el cumpleaños; el regalo del club puede dejarla bajo costo.
      select costo into v_costo from variantes where id = (v_item ->> 'variante_id')::uuid;
      if (v_item ->> 'precio_unitario')::numeric - v_descuento < v_costo then
        raise exception 'venta_descuento_bajo_costo' using detail = v_referencia || ' (' || v_sku || ')';
      end if;

      if fn_es_lider() and v_descuento > round((v_item ->> 'precio_unitario')::numeric * 0.35, 2) + 0.01 then
        raise exception 'venta_descuento_supera_autorizacion' using detail = v_referencia || ' (' || v_sku || ')';
      end if;
      -- Felipe 2026-09-25: pasado el 15 %, argumento escrito para cualquiera (antes: Líder, 20 %).
      if v_descuento > round((v_item ->> 'precio_unitario')::numeric * 0.15, 2) + 0.01 and v_argumento = '' then
        raise exception 'venta_descuento_requiere_argumento' using detail = v_referencia || ' (' || v_sku || ')';
      end if;
    end if;

    v_total_items := v_total_items +
      (((v_item ->> 'precio_unitario')::numeric - v_descuento - v_club) * (v_item ->> 'cantidad')::integer);
  end loop;

  -- ADR-0288 D-5: un canje que no regala nada gastaría el cumpleaños del año por nada.
  if p_canjear_cumpleanos and v_club_monto <= 0 then
    raise exception 'En esta venta no queda nada que descontar por el cumpleaños: no se canjea.'
      using hint = 'cumple_sin_monto';
  end if;

  -- El código de una colaboradora autoriza solo los descuentos MANUALES: una
  -- campaña no lo pide (y una línea de campaña no cuenta contra el tope).
  -- ADR-0288 D-5: la parte del club tampoco cuenta contra el código.
  if v_hay_descuento and not fn_es_lider() then
    if v_codigo_limpio = '' then
      raise exception 'venta_descuento_requiere_codigo';
    end if;
    select * into v_codigo from codigos_descuento
      where codigo = v_codigo_limpio
        and activo
        and (vigente_desde is null or vigente_desde <= v_hoy)
        and (vigente_hasta is null or vigente_hasta >= v_hoy)
        and (ubicacion_id is null or ubicacion_id = p_ubicacion_id);
    if not found then
      raise exception 'venta_codigo_descuento_invalido' using detail = v_codigo_limpio;
    end if;
    for v_item in select * from jsonb_array_elements(p_items) loop
      if btrim(coalesce(v_item ->> 'motivo_descuento', '')) <> 'campana'
         and coalesce((v_item ->> 'descuento_unitario')::numeric, 0) - coalesce((v_item ->> 'descuento_club_unitario')::numeric, 0)
             > round((v_item ->> 'precio_unitario')::numeric * v_codigo.porcentaje / 100, 2) + 0.01 then
        raise exception 'venta_descuento_supera_codigo'
          using detail = trim(trailing '.' from trim(trailing '0' from v_codigo.porcentaje::text)),
                hint = format('La línea %s pide S/%s de descuento', v_item ->> 'variante_id', v_item ->> 'descuento_unitario');
      end if;
    end loop;
  end if;

  for v_pago in select * from jsonb_array_elements(p_pagos) loop
    v_total_pagos := v_total_pagos + (v_pago ->> 'monto')::numeric;
  end loop;
  if round(v_total_items, 2) <> round(v_total_pagos, 2) then
    raise exception 'Los pagos (S/%) no cuadran con el total de la venta (S/%)', v_total_pagos, v_total_items;
  end if;

  begin
    insert into ventas (
      ubicacion_id, cliente_id, caja_id, usuario_id, token_cliente, nota,
      asesora_id, emisor, descuento_pct, descuento_autorizado_por, descuento_motivo
    )
      values (
        p_ubicacion_id, p_cliente_id, v_caja_id, v_persona, p_token, nullif(btrim(p_nota), ''),
        p_asesora_id, p_emisor, p_descuento_pct, p_autorizado_por,
        nullif(btrim(coalesce(p_motivo_descuento, '')), '')
      )
      returning id into v_venta_id;
  exception when unique_violation then
    if p_token is null then raise; end if;
    select * into v_existente from ventas where token_cliente = p_token;
    if not found then raise; end if;
    return v_existente.id;
  end;

  -- ADR-0288 D-5: el canje queda anotado con su venta. El único parcial (clienta, tipo, año) lo hace imposible dos veces;
  -- si otra caja ganó la carrera por otro camino, se traduce al mismo aviso.
  if p_canjear_cumpleanos then
    begin
      insert into club_canjes (clienta_id, venta_id, tipo, anio, pct, monto, registrado_por)
        values (p_cliente_id, v_venta_id, 'cumpleanos', v_anio_lima, v_club_pct, v_club_monto, v_persona);
    exception when unique_violation then
      raise exception 'Esta socia ya canjeó su cumpleaños este año.'
        using hint = 'cumple_ya_canjeado';
    end;
    -- La actividad, sin datos de la clienta: la venta y cuánto regaló el club. Si no se puede anotar, la venta sigue.
    begin
      perform retail.fn_actividad_anotar(
        'vender', 'cumpleanos_canjeado',
        'canjeó el cumpleaños de una socia: ' || trim_scale(v_club_pct)::text || ' % menos, ' || retail.fn_actividad_soles(v_club_monto),
        v_persona, (select v.terminal_id from ventas v where v.id = v_venta_id), p_ubicacion_id, null,
        'ventas', v_venta_id::text, now(),
        jsonb_build_object('pct', v_club_pct, 'monto', v_club_monto), 'vivo');
    exception when others then
      raise warning 'actividad: no se anotó el canje de cumpleaños de la venta % (%)', v_venta_id, sqlerrm;
    end;
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select costo into v_costo from variantes where id = (v_item ->> 'variante_id')::uuid;
    if v_costo is null then
      raise exception 'La variante % no existe', v_item ->> 'variante_id';
    end if;

    insert into venta_items (
      venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario,
      motivo_descuento, motivo_descuento_detalle, argumento_descuento, descuento_etiqueta_id,
      descuento_club_unitario
    )
      values (
        v_venta_id, (v_item ->> 'variante_id')::uuid, (v_item ->> 'cantidad')::integer,
        (v_item ->> 'precio_unitario')::numeric, coalesce((v_item ->> 'descuento_unitario')::numeric, 0), v_costo,
        nullif(btrim(coalesce(v_item ->> 'motivo_descuento', '')), ''),
        nullif(btrim(coalesce(v_item ->> 'motivo_descuento_detalle', '')), ''),
        nullif(btrim(coalesce(v_item ->> 'argumento_descuento', '')), ''),
        case when btrim(coalesce(v_item ->> 'motivo_descuento', '')) = 'campana'
             then nullif(btrim(coalesce(v_item ->> 'descuento_etiqueta_id', '')), '')::uuid end,
        coalesce((v_item ->> 'descuento_club_unitario')::numeric, 0)
      )
      returning id into v_item_id;

    -- ADR-0179: la prenda sin registrar no mueve stock (no está en el sistema); queda en la cola
    -- y su único movimiento es el real, el que escribe almacén al regularizarla.
    if (v_item ->> 'variante_id')::uuid = c_cargo_especial then
      insert into prendas_por_regularizar (venta_item_id, ubicacion_id, descripcion, categoria_id, talla_id,
                                           color_codigo, precio_cobrado, vendido_por)
        values (v_item_id, p_ubicacion_id, btrim(v_item ->> 'descripcion_libre'),
                (v_item ->> 'categoria_id')::uuid, (v_item ->> 'talla_id')::uuid, v_item ->> 'color_codigo',
                (v_item ->> 'precio_unitario')::numeric - coalesce((v_item ->> 'descuento_unitario')::numeric, 0),
                coalesce(p_asesora_id, v_persona));
      continue;
    end if;

    insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, venta_item_id, usuario_id)
      values ((v_item ->> 'variante_id')::uuid, p_ubicacion_id, v_sub, 'salida',
              (v_item ->> 'cantidad')::integer, 'venta', v_item_id, v_persona)
      returning id into v_mov_id;
    perform fn_aplicar_movimiento(v_mov_id);
  end loop;

  for v_pago in select * from jsonb_array_elements(p_pagos) loop
    -- `recibido`: lo que la clienta entregó en efectivo (para reimprimir el ticket con su
    -- vuelto). Solo cuenta en efectivo; cualquier otro medio lo deja en NULL.
    insert into venta_pagos (venta_id, metodo, monto, recibido, referencia)
      values (
        v_venta_id, v_pago ->> 'metodo', (v_pago ->> 'monto')::numeric,
        case when v_pago ->> 'metodo' = 'efectivo' then nullif(v_pago ->> 'recibido', '')::numeric end,
        case when v_pago ->> 'metodo' in ('yape', 'plin', 'transferencia')
             then nullif(left(regexp_replace(coalesce(v_pago ->> 'referencia', ''), '[^0-9A-Za-z]', '', 'g'), 40), '') end
      );
  end loop;

  -- D-56: solo retail reserva comprobante. Cuando el emisor es Alegra, la venta queda
  -- registrada completa (stock, caja, pagos) y el comprobante se emite aparte, en Alegra.
  -- ADR-0288 D-5: el comprobante lleva el descuento TOTAL de cada línea (descuento_unitario), cumpleaños incluido.
  if p_tipo_comprobante is not null and p_emisor = 'retail' then
    v_igv := case when p_tipo_comprobante = 'nota_venta' then 0 else round((v_total_items - v_total_items / 1.18) * 100) / 100 end;
    v_subtotal := round((v_total_items - v_igv) * 100) / 100;
    perform emitir_comprobante(
      p_ubicacion_id, p_tipo_comprobante, v_subtotal, v_igv, v_total_items,
      v_venta_id, p_cliente_tipo_doc, p_cliente_num_doc, p_cliente_nombre, p_items
    );
  end if;

  return v_venta_id;
end;
$$;

-- Los permisos de siempre (20260922231700): solo `authenticated`, sin PUBLIC ni `anon`.
revoke all on function retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text, uuid, text, numeric, uuid, text, boolean) from public, anon;
grant execute on function retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text, uuid, text, numeric, uuid, text, boolean) to authenticated;

-- ---------- 4. resumen_clienta_caja: el cumpleaños disponible, el % y si ya lo canjeó ----------
-- Cambia su tipo de retorno (3 columnas más): `create or replace` no puede, así que `drop` y `create`, con la misma lectura
-- (la ficha por su id) y los mismos permisos. Pegar dos veces la suelta y la vuelve a crear igual.
drop function if exists retail.resumen_clienta_caja(uuid);

create function retail.resumen_clienta_caja(p_clienta_id uuid)
returns table (
  es_socia boolean,
  codigo_club text,
  club_desde timestamptz,
  con_publicidad boolean,
  celular text,
  cumple_dia smallint,
  cumple_mes smallint,
  cumple_disponible boolean,
  cumple_pct numeric,
  cumple_canjeado_este_anio boolean
)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  -- La ficha es del módulo «Clientas» (42501 clientas_sin_modulo). Va primero: si falla, no se lee nada.
  select retail.fn_exigir_modulo('clientas');

  -- ADR-0288 D-5: disponible = socia activa, en el mes de su cumpleaños (Lima) y sin un canje vivo este año. Es lo mismo
  -- que exige registrar_venta; la caja solo lo muestra.
  select c.club_desde is not null, c.codigo_club, c.club_desde, c.publicidad_desde is not null,
         c.telefono_whatsapp, c.cumple_dia, c.cumple_mes,
         c.club_desde is not null and not c.anonimizada and c.archivada_en is null
           and c.cumple_mes is not null and c.cumple_mes = extract(month from retail.fn_hoy_lima())
           and k.id is null,
         coalesce((select e.club_cumple_pct from retail.configuracion_empresa e limit 1), 10.00),
         k.id is not null
    from retail.clientas c
    left join lateral (
      select x.id from retail.club_canjes x
       where x.clienta_id = c.id and x.tipo = 'cumpleanos'
         and x.anio = extract(year from retail.fn_hoy_lima()) and x.anulado_en is null
       limit 1
    ) k on true
   where c.id = p_clienta_id;
$$;

comment on function retail.resumen_clienta_caja(uuid) is
  'La tarjeta de la clienta en Cobrar (ADR-0288 D-8): socia, código, desde cuándo, con publicidad, celular y cumpleaños; y el canje del cumpleaños (D-5): si está disponible hoy, el % y si ya lo canjeó este año. Lectura (prefijo resumen_: no abre el loader). Módulo «Clientas».';

revoke execute on function retail.resumen_clienta_caja(uuid) from public, anon;
grant execute on function retail.resumen_clienta_caja(uuid) to authenticated;

-- ---------- 5. una sola firma de registrar_venta ----------
do $una_firma$
declare
  v_firmas text;
  v_cuantas integer;
begin
  select string_agg(p.oid::regprocedure::text, ', '), count(*)
    into v_firmas, v_cuantas
    from pg_proc p
   where p.pronamespace = 'retail'::regnamespace and p.proname = 'registrar_venta';
  if v_cuantas <> 1
     or to_regprocedure('retail.registrar_venta(uuid,jsonb,jsonb,uuid,uuid,text,text,text,text,text,text,uuid,text,numeric,uuid,text,boolean)') is null then
    raise exception 'registrar_venta tiene que quedar con UNA firma (la de 17 parámetros) y hay: %', v_firmas;
  end if;
end
$una_firma$;

reset lock_timeout;
notify pgrst, 'reload schema';
-- ============================== FIN DE LA PARTE 3 ==============================
