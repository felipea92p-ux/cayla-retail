-- ============================================================================
-- ⚠️ SOLO PARA PEGAR EN EL SQL EDITOR DE PRODUCCIÓN. NO es la migración local.
-- Sin timestamp a propósito (mismo motivo que `pegar-en-produccion-aqp-serie-04-lima-serie-05-2026-10-02.sql`, su modelo):
-- `db reset` la ignora. Toca datos que existen una sola vez, en producción.
--
-- QUÉ HACE (2026-10-07; decisión de Felipe, con lo que le dijo Lucode).
--   Lucode avisó que el RUC 20605964550 ya usó la serie B001 con otro proveedor: en su panel las boletas B001-113… de
--   Tienda TRU figuran RECHAZADAS (el ERP las tenía en «enviado», con Lucode diciendo PENDIENTE). Por eso:
--     · TIENDA TRU pasa a la «serie 05» en todo:  B005 · F005 · BC05 · FC05 · NV05.
--     · TIENDA LIM pasa a la «serie 06» en todo:  B006 · F006 · BC06 · FC06 · NV06   (todas desde el 1; Lima aún no emite).
--       Lima tenía la 05 desde el 2026-10-02 sin haberla usado nunca: se le archiva para dársela a Trujillo.
--     · Tienda AQP no se toca (sigue en la 04).
--     · Las series viejas (B001 F001 BC01 FC01 NV01 de TRU · B005 F005 BC05 FC05 NV05 de LIM) se ARCHIVAN, no se borran.
--     · TODAS las boletas B001 y facturas F001 de TRU se RENUMERAN a B005-1… y F005-1…, en el orden de su número viejo,
--       y quedan en la cola de transmisión («pendiente_reintento»). Su número viejo, su respuesta de Lucode y sus datos de
--       transmisión quedan en `retail.respaldo_b001_f001_renumeradas_20261007`.
--     · Excepción: B001-1 (S/ 59.90) es de una venta ANULADA. El ERP nunca transmite una venta anulada, así que renumerada
--       quedaría «pendiente» para siempre. Se queda como B001-1, tal cual.
--
-- ⚠️ LO QUE ESTE SCRIPT HACE DISTINTO A AQP, POR DECISIÓN DE FELIPE (2026-10-07): renumera también las 108 boletas que
--   SUNAT ya ACEPTÓ (B001-5 … B001-112, con su CDR). Esas boletas siguen existiendo ante SUNAT con su número B001: al
--   volver a emitirlas como B005, SUNAT tendrá esas ventas DOS VECES (unos S/ 8.640 de ventas declaradas de más) hasta que
--   las B001 aceptadas se den de baja. La baja NO la hace este script: queda pendiente con Lucode/contador.
--   Si antes de pegar te arrepientes, cambia `v_incluir_aceptadas` a false (PASO 3): entonces solo se renumeran las 85
--   que SUNAT no aceptó (B001-4, B001-113…192, F001-1…4) y las aceptadas se quedan como B001.
--
-- POR QUÉ SE RENUMERA EN SU LUGAR (y no se crea un comprobante nuevo): igual que AQP, la venta sigue siendo la misma; crear
--   otro comprobante dejaría cada venta con dos. Lo que no se arregla: los tickets ya entregados dicen «B001-…».
--
-- FECHA DE EMISIÓN: `lib/transmitir-comprobante.ts` manda la fecha de la VENTA (`fechaDeLima(created_at)`), no la de hoy.
--   La más vieja es del 2026-09-29: si SUNAT/Lucode la rechaza por plazo, el ERP muestra el motivo en Comprobantes ▸ Emitidos.
--
-- NO HACE FALTA FRENAR LAS VENTAS DE TRUJILLO: el script toma el candado de las series activas de TRU y LIM (`for update`) y
--   espera a la venta que esté a medias; la siguiente ya sale con B005.
--
-- TODO O NADA. El SQL Editor corre lo pegado en UNA transacción: si una comprobación falla, no queda nada a medias.
-- Es idempotente: si TRU ya tiene B005 activa, no cambia nada.
-- No crea políticas ni altera tablas existentes: no toma los bloqueos de `auth`/`storage` (ADR-0195). Crea una tabla nueva
-- (el respaldo), con RLS encendido y sin políticas: solo `postgres` la lee.
-- Sin `select … into` dentro de textos entre comillas (ADR-0288).
--
-- DESPUÉS DE PEGARLO: la cola en producción avanza de a 3 cuando un líder abre Comprobantes o alguien cobra en Vender
-- (el cron solo corre en sandbox). Para vaciarla de un tirón, ver el PASO 5.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- PASO 1 · PREVIEW (córrelo SOLO antes de pegar todo: el Editor muestra solo la última sentencia) ----------
-- Debe salir: TRU con B001 F001 BC01 FC01 NV01 activas y LIM con B005 F005 BC05 FC05 NV05 activas (próximo 1).
select u.nombre as sede, s.tipo, s.serie, s.siguiente_numero as proximo,
       case when s.archivada_at is null then 'ACTIVA' else 'archivada' end as estado
  from retail.series_comprobantes s
  join retail.ubicaciones u on u.id = s.ubicacion_id
 where u.nombre in ('Tienda TRU', 'Tienda LIM') and s.archivada_at is null
 order by u.nombre, s.tipo, s.serie;

-- ---------- PASO 2 · EL RESPALDO ----------
create table if not exists retail.respaldo_b001_f001_renumeradas_20261007 (
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
alter table retail.respaldo_b001_f001_renumeradas_20261007 enable row level security;
revoke all on table retail.respaldo_b001_f001_renumeradas_20261007 from anon, authenticated;
comment on table retail.respaldo_b001_f001_renumeradas_20261007 is
  'Las boletas B001 y facturas F001 de Tienda TRU antes de renumerarse a B005/F005 (2026-10-07): Lucode avisó que el RUC ya usó B001 con otro proveedor. Las que estaban «aceptado» siguen existiendo ante SUNAT con su número viejo (respuesta_sunat_vieja guarda su CDR). Solo lectura; no se borra.';

-- ---------- PASO 3 · APLICAR ----------
do $$
declare
  -- Decisión de Felipe (2026-10-07): true = también las aceptadas. false = solo las que SUNAT no aceptó.
  v_incluir_aceptadas constant boolean := true;
  v_tru uuid;
  v_lim uuid;
  v_nb integer;
  v_nf integer;
  v_estados text[];
  v_tipo_serie record;
  v_motivo_tru constant text :=
    'Cambio del 2026-10-07: Lucode avisó que el RUC ya usó la serie B001 con otro proveedor (las boletas B001 de TRU figuran rechazadas). Tienda TRU pasa a la serie 05: B005, F005, BC05, FC05, NV05.';
  v_motivo_lim constant text :=
    'Cambio del 2026-10-07: la serie 05 pasa a Tienda TRU. Tienda LIM pasa a la serie 06: B006, F006, BC06, FC06, NV06. Lima aún no había emitido.';
begin
  v_estados := case when v_incluir_aceptadas
                    then array['aceptado', 'enviado', 'rechazado', 'pendiente', 'pendiente_reintento']
                    else array['enviado', 'rechazado', 'pendiente', 'pendiente_reintento'] end;

  v_tru := (select id from retail.ubicaciones where nombre = 'Tienda TRU');
  v_lim := (select id from retail.ubicaciones where nombre = 'Tienda LIM');
  if v_tru is null or v_lim is null then
    raise exception 'No encuentro «Tienda TRU» o «Tienda LIM» en retail.ubicaciones: revisa los nombres.';
  end if;

  -- Ya está hecho: TRU con B005 activa. Pegarlo dos veces no cambia nada.
  if exists (select 1 from retail.series_comprobantes
              where ubicacion_id = v_tru and tipo = 'boleta' and serie = 'B005' and archivada_at is null) then
    return;
  end if;

  -- El candado: las series activas de TRU y LIM. Una venta que esté reservando un número la termina antes de que sigamos;
  -- la que venga después ya no encuentra B001 activa. (Se toma ANTES de contar nada.)
  perform 1 from retail.series_comprobantes
   where ubicacion_id in (v_tru, v_lim) and archivada_at is null
     for update;
  if not exists (select 1 from retail.series_comprobantes
                  where ubicacion_id = v_tru and tipo = 'boleta' and serie = 'B001' and archivada_at is null) then
    raise exception 'Tienda TRU no tiene B001 activa y tampoco B005: no sé en qué estado está. Revisa retail.series_comprobantes.';
  end if;
  if not exists (select 1 from retail.series_comprobantes
                  where ubicacion_id = v_lim and tipo = 'boleta' and serie = 'B005' and archivada_at is null) then
    raise exception 'Tienda LIM no tiene B005 activa: no sé en qué estado está. Revisa retail.series_comprobantes.';
  end if;

  -- Los B001/F001 son todos de TRU y del tipo que dicen.
  if exists (select 1 from retail.comprobantes
              where (serie = 'B001' and (ubicacion_id <> v_tru or tipo <> 'boleta'))
                 or (serie = 'F001' and (ubicacion_id <> v_tru or tipo <> 'factura'))) then
    raise exception 'Hay comprobantes B001/F001 que no son boletas/facturas de Tienda TRU.';
  end if;
  -- Ninguno tiene nota ni deduce un anticipo: renumerarlo dejaría a la otra fila apuntando a un número que SUNAT no conoce.
  if exists (select 1 from retail.comprobantes n join retail.comprobantes o on o.id = n.comprobante_original_id
              where o.serie in ('B001', 'F001'))
     or exists (select 1 from retail.comprobantes n join retail.comprobantes o on o.id = n.anticipo_comprobante_id
              where o.serie in ('B001', 'F001')) then
    raise exception 'Algún B001/F001 tiene una nota o un anticipo que lo referencia. Revisa antes de seguir.';
  end if;
  -- Ningún comprobante usa todavía las series que se estrenan, ni las de Lima que se archivan.
  if exists (select 1 from retail.comprobantes
              where serie in ('B005', 'F005', 'BC05', 'FC05', 'NV05', 'B006', 'F006', 'BC06', 'FC06', 'NV06',
                              'BC01', 'FC01')) then
    raise exception 'Ya hay comprobantes con alguna de las series que se van a archivar o a estrenar. Revisa retail.comprobantes.';
  end if;

  -- 0. Respaldar a quiénes se renumera, con su número nuevo: en el orden del número viejo, por serie.
  --    Nunca una venta anulada (no se transmitiría nunca) ni un anticipo (su envío a SUNAT aún no se activa, ADR-0166).
  insert into retail.respaldo_b001_f001_renumeradas_20261007 (
    comprobante_id, serie_vieja, numero_viejo, serie_nueva, numero_nuevo, estado_viejo, entorno_transmision_viejo,
    respuesta_sunat_vieja, motivo_rechazo_viejo, enviado_at_viejo, intentos_transmision_viejo,
    ultimo_error_transmision_viejo, created_at_comprobante)
  select c.id, c.serie, c.numero,
         case c.serie when 'B001' then 'B005' else 'F005' end,
         row_number() over (partition by c.serie order by c.numero),
         c.estado, c.entorno_transmision, c.respuesta_sunat::jsonb, c.motivo_rechazo, c.enviado_at,
         c.intentos_transmision, c.ultimo_error_transmision, c.created_at
    from retail.comprobantes c
    left join retail.ventas v on v.id = c.venta_id
   where c.serie in ('B001', 'F001')
     and c.estado = any (v_estados)
     and (v.id is null or v.estado <> 'anulada')
     and not coalesce(c.es_anticipo, false)
     and coalesce(c.anticipo_deducido, 0) = 0;

  v_nb := (select count(*) from retail.respaldo_b001_f001_renumeradas_20261007 where serie_vieja = 'B001');
  v_nf := (select count(*) from retail.respaldo_b001_f001_renumeradas_20261007 where serie_vieja = 'F001');

  -- 1. Archivar las series viejas PRIMERO: hay una sola activa por sede, tipo y (en notas) letra.
  update retail.series_comprobantes
     set archivada_at = now(), motivo_archivo = v_motivo_tru
   where ubicacion_id = v_tru and archivada_at is null
     and serie in ('B001', 'F001', 'BC01', 'FC01', 'NV01');
  update retail.series_comprobantes
     set archivada_at = now(), motivo_archivo = v_motivo_lim
   where ubicacion_id = v_lim and archivada_at is null
     and serie in ('B005', 'F005', 'BC05', 'FC05', 'NV05');

  -- 2. Registrar las nuevas. B005 y F005 siguen después de las renumeradas; el resto, desde el 1.
  insert into retail.series_comprobantes (ubicacion_id, tipo, serie, siguiente_numero) values
    (v_tru, 'boleta',       'B005', v_nb + 1),
    (v_tru, 'factura',      'F005', v_nf + 1),
    (v_tru, 'nota_credito', 'BC05', 1),
    (v_tru, 'nota_credito', 'FC05', 1),
    (v_tru, 'nota_venta',   'NV05', 1),
    (v_lim, 'boleta',       'B006', 1),
    (v_lim, 'factura',      'F006', 1),
    (v_lim, 'nota_credito', 'BC06', 1),
    (v_lim, 'nota_credito', 'FC06', 1),
    (v_lim, 'nota_venta',   'NV06', 1);

  -- 3. Renumerar y mandar a la cola de transmisión. `pendiente_reintento` y no `pendiente`: la cola solo toma un
  --    «pendiente» de los últimos 3 días, y estas son de hasta el 2026-09-29.
  update retail.comprobantes c
     set serie = r.serie_nueva,
         numero = r.numero_nuevo,
         estado = 'pendiente_reintento',
         entorno_transmision = null,
         respuesta_sunat = null,
         motivo_rechazo = null,
         enviado_at = null,
         intentos_transmision = 0,
         ultimo_intento_transmision_at = null,
         ultimo_error_transmision = null,
         proximo_reintento_at = null
    from retail.respaldo_b001_f001_renumeradas_20261007 r
   where r.comprobante_id = c.id;

  -- Comprobación final: todo quedó como se dijo, o no se aplica nada.
  if v_nb = 0 then
    raise exception 'No se renumeró ninguna boleta B001: algo no calza. No se aplica nada.';
  end if;
  if v_incluir_aceptadas and exists (
       select 1 from retail.comprobantes c left join retail.ventas v on v.id = c.venta_id
        where c.serie in ('B001', 'F001') and (v.id is null or v.estado <> 'anulada')) then
    raise exception 'Quedaron B001/F001 de ventas vigentes sin renumerar (¿un anticipo o un estado raro?): no se aplica nada.';
  end if;
  if (select count(*) from retail.comprobantes where serie = 'B005') <> v_nb
     or coalesce((select max(numero) from retail.comprobantes where serie = 'B005'), 0) <> v_nb
     or (select count(*) from retail.comprobantes where serie = 'F005') <> v_nf
     or coalesce((select max(numero) from retail.comprobantes where serie = 'F005'), 0) <> v_nf then
    raise exception 'B005/F005 no quedaron de 1 a % / de 1 a % sin huecos: no se aplica nada.', v_nb, v_nf;
  end if;
  for v_tipo_serie in
    select ubicacion_id, tipo, count(*) as activas
      from retail.series_comprobantes
     where ubicacion_id in (v_tru, v_lim) and archivada_at is null
     group by ubicacion_id, tipo, case when tipo = 'nota_credito' then left(serie, 1) else '' end
  loop
    if v_tipo_serie.activas <> 1 then
      raise exception 'Una sede quedó con % series activas del mismo tipo: no se aplica nada.', v_tipo_serie.activas;
    end if;
  end loop;
  if (select count(*) from retail.series_comprobantes where ubicacion_id in (v_tru, v_lim) and archivada_at is null) <> 10 then
    raise exception 'TRU y Lima deben quedar con 5 series activas cada una: no se aplica nada.';
  end if;
end $$;

-- ---------- PASO 4 · VERIFICAR (mira las tablas) ----------
-- 1) Debe salir: TRU · B005 (próximo = renumeradas + 1) F005 (próximo 5) BC05 FC05 NV05 ACTIVAS · LIM · B006 F006 BC06 FC06 NV06
--    ACTIVAS desde 1. AQP no aparece: no se tocó.
select u.nombre as sede, s.tipo, s.serie, s.siguiente_numero as proximo
  from retail.series_comprobantes s
  join retail.ubicaciones u on u.id = s.ubicacion_id
 where u.nombre in ('Tienda TRU', 'Tienda LIM') and s.archivada_at is null
 order by u.nombre, s.tipo, s.serie;

-- 2) Las renumeradas, con su número de antes. Todas «pendiente_reintento».
select r.serie_vieja || '-' || r.numero_viejo as antes, c.serie || '-' || c.numero as ahora, r.estado_viejo, c.estado, c.total,
       c.created_at at time zone 'America/Lima' as vendida
  from retail.respaldo_b001_f001_renumeradas_20261007 r
  join retail.comprobantes c on c.id = r.comprobante_id
 order by r.serie_vieja, r.numero_viejo;

-- 3) Lo único que queda con serie vieja: B001-1 (venta anulada).
select serie, numero, estado, total from retail.comprobantes where serie in ('B001', 'F001') order by serie, numero;

-- ---------- PASO 5 · TRANSMITIR DE UN TIRÓN (no es SQL: va en el navegador) ----------
-- Entra al ERP de producción con tu cuenta de líder, abre Comprobantes, abre la consola del navegador (Cmd+Opción+J) y pega:
--
--   for (let i = 0; i < 100; i++) {
--     const r = await (await fetch('/api/lucode/reintentar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json();
--     console.log(i, r);
--     if (!r.tomados) break;
--   }
--
-- Toma de a 3 con la misma ruta que usa la pantalla (mismo candado: nunca manda dos veces el mismo) hasta que la cola queda
-- vacía. Un rechazo no frena el resto; queda con su motivo en Comprobantes ▸ Emitidos. Para ver cómo va:
--
--   select estado, count(*) from retail.comprobantes where serie in ('B005', 'F005') group by 1;
