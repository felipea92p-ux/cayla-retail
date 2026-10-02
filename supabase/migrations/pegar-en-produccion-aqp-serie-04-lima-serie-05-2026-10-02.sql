-- ============================================================================
-- ⚠️ SOLO PARA PEGAR EN EL SQL EDITOR DE PRODUCCIÓN. NO es la migración local.
-- Sin timestamp a propósito (mismo motivo que `pegar-en-produccion-series-salida-a-produccion-2026-09.sql`): `db reset`
-- la ignora. Toca datos que existen una sola vez, en producción.
--
-- QUÉ HACE (2026-10-02; decisión de Felipe, con lo que le dijo Lucode).
--   Lucode avisó: «el RUC 20605964550 ya utilizó anteriormente la serie B002 con otro proveedor». En el panel de Lucode las
--   boletas B002-… de Tienda AQP figuran RECHAZADAS: SUNAT nunca las aceptó. Lucode confirmó que la B004 sí está bien, y que la
--   serie 3 (Lima) también está ocupada. Por eso:
--     · TIENDA AQP pasa a la «serie 04» en todo:  B004 · F004 · BC04 · FC04 · NV04   (próximo de B004: el 4 + las que ya existen).
--     · TIENDA LIM pasa a la «serie 05» en todo:  B005 · F005 · BC05 · FC05 · NV05   (todas desde el 1; Lima aún no emite).
--     · Las series viejas (B002 F002 BC02 FC02 NV02 · B003 F003 BC03 FC03 NV03) se ARCHIVAN, no se borran.
--     · Las boletas B002-1 … B002-N de AQP (todas «enviado», ninguna aceptada) se RENUMERAN a B004-4 … B004-(N+3), en el orden
--       en que se vendieron, y quedan «pendiente» para volver a transmitirse. Su número viejo, su respuesta de Lucode y sus
--       datos de transmisión quedan guardados en `retail.respaldo_b002_renumeradas_20261002`.
--
-- POR QUÉ B004 EMPIEZA EN 4. En Lucode (PROD) B004-1, B004-2 y B004-3 ya existen (el 3, anulado): son de Trujillo y de antes de
--   las series nuevas. Los comprobantes de Trujillo B004-2 y B004-3 siguen en `comprobantes` con su serie (no se tocan).
--
-- POR QUÉ SE RENUMERA EN SU LUGAR (y no se crea una boleta nueva). La regla es «un comprobante no se renumera» y este script la
--   rompe a propósito, con respaldo: SUNAT nunca vio B002-N (Lucode las rechazó), así que el número no existe fuera del ERP y la
--   venta sigue siendo la misma. Crear una boleta nueva por cada venta dejaría cada venta con dos comprobantes.
--   LO QUE NO SE ARREGLA: los tickets ya entregados dicen «B002-…»; ese número no va a existir ante SUNAT.
--
-- ORDEN (importa). 1) Desplegar el arreglo de la fecha de emisión (`lib/lucode.ts`: `fechaDeLima`). 2) Pegar este script.
--   3) Transmitir las boletas desde Comprobantes ▸ Emitidos. Sin el paso 1, salen con la fecha del reenvío en UTC.
--   NO hace falta frenar las ventas de AQP: el script toma el candado de la serie B002 (`for update`) y espera a la venta que
--   esté a medias; la venta siguiente ya sale con B004.
--
-- TODO O NADA. El SQL Editor corre lo pegado en UNA transacción: si una comprobación falla, no queda nada a medias.
-- Es idempotente: si AQP ya tiene B004 activa, no cambia nada.
-- No crea políticas ni altera tablas existentes: no toma los bloqueos de `auth`/`storage` (ADR-0195). Crea una tabla nueva
-- (el respaldo), con RLS encendido y sin políticas: solo `postgres` la lee.
-- Sin `select … into` dentro de textos entre comillas (ADR-0288: el SQL Editor se confunde).
--
-- CÓMO SE DESHACE: con la tabla de respaldo (número y datos viejos de cada boleta). No hay botón: es un trabajo de una vez.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- PASO 1 · PREVIEW (córrelo SOLO antes de pegar todo: el Editor muestra solo la última sentencia) ----------
-- Debe salir: AQP con B002 activa (próximo = las emitidas + 1) y Lima con B003 activa, todo desde 1.
select u.nombre as sede, s.tipo, s.serie, s.siguiente_numero as proximo,
       case when s.archivada_at is null then 'ACTIVA' else 'archivada' end as estado
  from retail.series_comprobantes s
  join retail.ubicaciones u on u.id = s.ubicacion_id
 where u.nombre in ('Tienda AQP', 'Tienda LIM')
 order by u.nombre, s.tipo, s.archivada_at nulls first, s.serie;

-- ---------- PASO 2 · EL RESPALDO ----------
create table if not exists retail.respaldo_b002_renumeradas_20261002 (
  comprobante_id uuid primary key,
  serie_vieja text not null,
  numero_viejo integer not null,
  serie_nueva text not null,
  numero_nuevo integer not null,
  estado_viejo text not null,
  entorno_transmision_viejo text,
  respuesta_sunat_vieja jsonb,
  motivo_rechazo_viejo text,
  enviado_at_viejo timestamptz,
  intentos_transmision_viejo integer,
  ultimo_error_transmision_viejo text,
  created_at_comprobante timestamptz not null,
  respaldado_at timestamptz not null default now()
);
alter table retail.respaldo_b002_renumeradas_20261002 enable row level security;
revoke all on table retail.respaldo_b002_renumeradas_20261002 from anon, authenticated;
comment on table retail.respaldo_b002_renumeradas_20261002 is
  'Las boletas B002-N de Tienda AQP antes de renumerarse a B004 (2026-10-02): Lucode las rechazó porque B002 ya la usó otro proveedor con este RUC. Solo lectura; no se borra.';

-- ---------- PASO 3 · APLICAR ----------
do $$
declare
  v_aqp uuid;
  v_lim uuid;
  v_n integer;
  v_viejas text[];
  v_tipo_serie record;
  v_motivo_aqp constant text :=
    'Cambio del 2026-10-02: Lucode avisó que el RUC ya usó la serie B002 con otro proveedor (las boletas B002 de AQP figuran rechazadas). Tienda AQP pasa a la serie 04: B004, F004, BC04, FC04, NV04.';
  v_motivo_lim constant text :=
    'Cambio del 2026-10-02: Lucode avisó que la serie 3 también está ocupada para este RUC. Tienda LIM pasa a la serie 05: B005, F005, BC05, FC05, NV05. Lima aún no había emitido.';
begin
  select id into v_aqp from retail.ubicaciones where nombre = 'Tienda AQP';
  select id into v_lim from retail.ubicaciones where nombre = 'Tienda LIM';
  if v_aqp is null or v_lim is null then
    raise exception 'No encuentro «Tienda AQP» o «Tienda LIM» en retail.ubicaciones: revisa los nombres.';
  end if;

  -- Ya está hecho: AQP con B004 activa. Pegarlo dos veces no cambia nada.
  if exists (select 1 from retail.series_comprobantes
              where ubicacion_id = v_aqp and tipo = 'boleta' and serie = 'B004' and archivada_at is null) then
    return;
  end if;

  -- El candado: la serie B002 de AQP. Una venta que esté reservando un número la termina antes de que sigamos;
  -- la que venga después ya no encuentra B002 activa. (Se toma ANTES de contar nada.)
  perform 1 from retail.series_comprobantes
   where ubicacion_id = v_aqp and tipo = 'boleta' and serie = 'B002' and archivada_at is null
     for update;
  if not found then
    raise exception 'Tienda AQP no tiene B002 activa y tampoco B004: no sé en qué estado está. Revisa retail.series_comprobantes.';
  end if;

  -- Solo se renumera lo que SUNAT nunca aceptó. Una boleta aceptada o dada de baja ya existe ante SUNAT con su número.
  if exists (select 1 from retail.comprobantes
              where serie = 'B002' and estado not in ('enviado', 'rechazado', 'pendiente', 'pendiente_reintento')) then
    raise exception 'Hay boletas B002 aceptadas, anuladas o en otro estado: esas ya existen ante SUNAT y no se renumeran. Revisa antes de seguir.';
  end if;
  if exists (select 1 from retail.comprobantes n join retail.comprobantes o on o.id = n.comprobante_original_id where o.serie = 'B002') then
    raise exception 'Alguna boleta B002 tiene una nota de crédito o débito: renumerarla dejaría la nota apuntando a un número que no existe.';
  end if;
  -- Las boletas a renumerar son todas de AQP y de tipo boleta.
  if exists (select 1 from retail.comprobantes where serie = 'B002' and (ubicacion_id <> v_aqp or tipo <> 'boleta')) then
    raise exception 'Hay comprobantes B002 que no son boletas de Tienda AQP.';
  end if;

  -- La serie 04 en Trujillo solo tiene B004-2 y B004-3 (las de producción de septiembre); AQP seguirá desde el 4.
  if coalesce((select max(numero) from retail.comprobantes where serie = 'B004'), 0) > 3 then
    raise exception 'B004 ya emitió más allá del número 3: el 4 no está libre. Revisa retail.comprobantes.';
  end if;
  -- Ningún comprobante usa todavía las demás series nuevas ni las viejas de Lima.
  if exists (select 1 from retail.comprobantes
              where serie in ('F004', 'BC04', 'FC04', 'NV04', 'B005', 'F005', 'BC05', 'FC05', 'NV05',
                              'B003', 'F003', 'BC03', 'FC03', 'NV03', 'F002', 'BC02', 'FC02', 'NV02')) then
    raise exception 'Ya hay comprobantes con alguna de las series que se van a archivar o a estrenar. Revisa retail.comprobantes.';
  end if;

  select count(*) into v_n from retail.comprobantes where serie = 'B002';

  -- 1. Archivar las series viejas PRIMERO: hay una sola activa por sede, tipo y (en notas) letra.
  update retail.series_comprobantes
     set archivada_at = now(), motivo_archivo = v_motivo_aqp
   where ubicacion_id = v_aqp and archivada_at is null
     and serie in ('B002', 'F002', 'BC02', 'FC02', 'NV02');
  update retail.series_comprobantes
     set archivada_at = now(), motivo_archivo = v_motivo_lim
   where ubicacion_id = v_lim and archivada_at is null
     and serie in ('B003', 'F003', 'BC03', 'FC03', 'NV03');

  -- 2. Registrar las nuevas. La boleta de AQP sigue en el 4 + las que ya se vendieron; el resto, desde el 1.
  insert into retail.series_comprobantes (ubicacion_id, tipo, serie, siguiente_numero) values
    (v_aqp, 'boleta',       'B004', 4 + v_n),
    (v_aqp, 'factura',      'F004', 1),
    (v_aqp, 'nota_credito', 'BC04', 1),
    (v_aqp, 'nota_credito', 'FC04', 1),
    (v_aqp, 'nota_venta',   'NV04', 1),
    (v_lim, 'boleta',       'B005', 1),
    (v_lim, 'factura',      'F005', 1),
    (v_lim, 'nota_credito', 'BC05', 1),
    (v_lim, 'nota_credito', 'FC05', 1),
    (v_lim, 'nota_venta',   'NV05', 1);

  -- 3. Respaldar y renumerar las boletas, en el orden en que se vendieron (B002-1 → B004-4, B002-2 → B004-5, …).
  insert into retail.respaldo_b002_renumeradas_20261002 (
    comprobante_id, serie_vieja, numero_viejo, serie_nueva, numero_nuevo, estado_viejo, entorno_transmision_viejo,
    respuesta_sunat_vieja, motivo_rechazo_viejo, enviado_at_viejo, intentos_transmision_viejo,
    ultimo_error_transmision_viejo, created_at_comprobante)
  select c.id, c.serie, c.numero, 'B004', 3 + row_number() over (order by c.numero), c.estado, c.entorno_transmision,
         c.respuesta_sunat::jsonb, c.motivo_rechazo, c.enviado_at, c.intentos_transmision,
         c.ultimo_error_transmision, c.created_at
    from retail.comprobantes c
   where c.serie = 'B002';

  update retail.comprobantes c
     set serie = r.serie_nueva,
         numero = r.numero_nuevo,
         estado = 'pendiente',
         entorno_transmision = null,
         respuesta_sunat = null,
         motivo_rechazo = null,
         enviado_at = null,
         intentos_transmision = 0,
         ultimo_intento_transmision_at = null,
         ultimo_error_transmision = null,
         proximo_reintento_at = null
    from retail.respaldo_b002_renumeradas_20261002 r
   where r.comprobante_id = c.id;

  -- Comprobación final: todo quedó como se dijo, o no se aplica nada.
  if exists (select 1 from retail.comprobantes where serie = 'B002') then
    raise exception 'Quedaron boletas B002: no se aplica nada.';
  end if;
  if (select count(*) from retail.respaldo_b002_renumeradas_20261002) <> v_n then
    raise exception 'El respaldo no tiene las % boletas: no se aplica nada.', v_n;
  end if;
  if v_n > 0 and (select max(numero) from retail.comprobantes where serie = 'B004') <> 3 + v_n then
    raise exception 'La última boleta B004 debería ser la % : no se aplica nada.', 3 + v_n;
  end if;
  if not exists (select 1 from retail.series_comprobantes
                  where ubicacion_id = v_aqp and tipo = 'boleta' and serie = 'B004' and archivada_at is null
                    and siguiente_numero = 4 + v_n) then
    raise exception 'B004 de AQP no quedó con el próximo en %: no se aplica nada.', 4 + v_n;
  end if;
  for v_tipo_serie in
    select ubicacion_id, tipo, left(serie, 1) as letra, count(*) as activas
      from retail.series_comprobantes
     where ubicacion_id in (v_aqp, v_lim) and archivada_at is null
     group by ubicacion_id, tipo, case when tipo = 'nota_credito' then left(serie, 1) else '' end, left(serie, 1)
  loop
    if v_tipo_serie.activas <> 1 then
      raise exception 'Una sede quedó con % series activas del mismo tipo: no se aplica nada.', v_tipo_serie.activas;
    end if;
  end loop;
  if (select count(*) from retail.series_comprobantes where ubicacion_id in (v_aqp, v_lim) and archivada_at is null) <> 10 then
    raise exception 'AQP y Lima deben quedar con 5 series activas cada una: no se aplica nada.';
  end if;
end $$;

-- ---------- PASO 4 · VERIFICAR (mira las tablas) ----------
-- 1) Debe salir: AQP · B004 F004 BC04 FC04 NV04 ACTIVAS (B004 con próximo = 4 + las renumeradas) · Lima · B005 F005 BC05 FC05 NV05 ACTIVAS desde 1;
--    las viejas archivadas con su motivo. Trujillo no aparece: no se tocó.
select u.nombre as sede, s.tipo, s.serie, s.siguiente_numero as proximo,
       case when s.archivada_at is null then 'ACTIVA' else 'archivada' end as estado
  from retail.series_comprobantes s
  join retail.ubicaciones u on u.id = s.ubicacion_id
 where u.nombre in ('Tienda AQP', 'Tienda LIM')
 order by u.nombre, s.tipo, s.archivada_at nulls first, s.serie;

-- 2) Las boletas renumeradas, con su número de antes. Todas «pendiente», sin respuesta de Lucode.
select r.serie_vieja || '-' || r.numero_viejo as antes, c.serie || '-' || c.numero as ahora, c.estado, c.total,
       c.created_at at time zone 'America/Lima' as vendida
  from retail.respaldo_b002_renumeradas_20261002 r
  join retail.comprobantes c on c.id = r.comprobante_id
 order by r.numero_viejo;

-- 3) Y Trujillo sigue igual: B001, F001, y B004-2 / B004-3 con su serie.
select serie, numero, estado from retail.comprobantes where serie in ('B001', 'F001') or (serie = 'B004' and numero <= 3) order by serie, numero;
