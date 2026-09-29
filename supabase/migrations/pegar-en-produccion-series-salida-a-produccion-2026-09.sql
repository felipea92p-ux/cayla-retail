-- ============================================================================
-- ⚠️ SOLO PARA PEGAR EN EL SQL EDITOR DE PRODUCCIÓN. NO es la migración local.
-- No es parte de la cadena numerada a propósito (mismo motivo que
-- `pegar-en-produccion-archivar-datos-prueba-2026-09.sql`): el nombre no sigue
-- `<timestamp>_nombre.sql`, así `supabase db reset` local la ignora. Toca datos que existen una sola vez, en
-- producción; en local pisaría las series B001/F001 con las que se siembran las pruebas.
--
-- QUÉ HACE (salida a la SUNAT real, 2026-09-29; decisión de Felipe, series y nombres dictados por él).
--   1. ARCHIVA —no borra— las series usadas en pruebas o mal nombradas:
--        B004 (boleta, Trujillo) · B005 (boleta, Arequipa) · F004 · F005 · NC01 · NC02.
--      B004 y B005 gastaron su numeración en el sandbox de Lucode (B004 llegó al 33; en SUNAT real solo existen los
--      números 1 a 3), así que no pueden seguir: sus números chocarían con comprobantes que ya existen o dejarían
--      un hueco 4-33 en la SUNAT real. F004/F005 no se usaron pero se cambian por la numeración nueva. NC01/NC02
--      no empiezan con B ni con F: SUNAT rechaza todo lo que salga con ellas.
--      Sus comprobantes (`B004-2`, `B004-3`, `B004-33`) quedan intactos, nombrando una serie archivada.
--   2. REGISTRA, con el próximo número en 1, una serie por sede y tipo (Trujillo 1, Arequipa 2, Lima 3):
--        boleta            B001 B002 B003
--        factura           F001 F002 F003
--        nota de crédito   BC01 BC02 BC03   (corrigen boletas)
--        nota de crédito   FC01 FC02 FC03   (corrigen facturas)
--      Las notas de venta (NV01, NV02, NV03) NO se tocan: no son documentos de SUNAT.
--
-- REQUISITO. `20260929170000_notas_de_credito_una_serie_por_letra.sql` (con el prefijo `retail.` que ya trae) tiene
-- que estar YA pegada: sin ella la base no admite dos series de nota de crédito por sede. Este script lo comprueba
-- al inicio y, si falta, se detiene sin cambiar nada.
--
-- CUÁNDO. En una ventana SIN VENTAS y en este orden (el resto vive en `docs/adr/0278-…`, «Salida a producción»):
--   a) pegar `20260929170000_…` (no cambia datos: se puede pegar antes, sin ventana);
--   b) pegar ESTE script;
--   c) `LUCODE_ENTORNO=produccion` en Vercel (solo Production), con `LUCODE_TOKEN` el de app.apisunat.pe, y redesplegar;
--   d) una venta chica y verificar en Emitidos que sale «Aceptado» SIN «· prueba».
-- Entre (b) y (c) toda venta se transmite todavía al sandbox y se comería el número 1 de la serie nueva: no vendas.
-- Y nunca (c) antes que (b): una venta saldría a la SUNAT real como `B004-34`, dejando el hueco 4-33.
--
-- POR QUÉ NO USA `registrar_serie_comprobante`/`archivar_serie_comprobante`. El SQL Editor corre como `postgres` sin
-- JWT: `auth.uid()` da NULL, `fn_es_lider()` da falso y esas funciones rechazarían todo. Este script hace el
-- INSERT/UPDATE directo —mismo patrón que `datos-reales-produccion.sql`—; la auditoría es el archivo: revisado, con
-- fecha, en el repo, y pegado por una persona con acceso directo a la base. `archivada_por` queda en NULL (no hay
-- «quién» sin sesión de app) y el motivo lo dice.
--
-- TODO O NADA. El SQL Editor corre lo pegado en UNA transacción: si cualquier comprobación falla, no queda nada a medias.
-- Es idempotente: pegarlo dos veces no duplica nada (la segunda vez solo repite las comprobaciones y la tabla final).
-- No crea políticas ni altera tablas: no toma los bloqueos de `auth`/`storage` (ADR-0195).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- PASO 1 · PREVIEW: mira las series de hoy antes de seguir ----------
-- El SQL Editor muestra solo el resultado de la ÚLTIMA sentencia: para ver esta tabla, córrela SOLA antes de pegar todo.
-- Debe salir: Trujillo B004/F004/NC01/NV01, Arequipa B005/F005/NC02/NV02, Lima NV03 (9 filas activas).
select u.nombre as sede, s.tipo, s.serie, s.siguiente_numero as proximo, s.archivada_at
  from retail.series_comprobantes s
  join retail.ubicaciones u on u.id = s.ubicacion_id
 order by u.nombre, s.tipo, s.serie;

-- ---------- PASO 2 · APLICAR (todo lo de abajo corre junto) ----------
do $$
declare
  v_filas integer;
begin
  -- Comprobaciones: si alguna falla, se detiene sin tocar nada.
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'retail' and tablename = 'series_comprobantes'
       and indexname = 'series_comprobantes_activa_por_tienda_tipo_y_letra'
  ) then
    raise exception 'Primero pega 20260929170000_notas_de_credito_una_serie_por_letra.sql: sin ella no caben dos series de nota de crédito por sede.';
  end if;

  select count(*) into v_filas from retail.ubicaciones where nombre in ('Tienda TRU', 'Tienda AQP', 'Tienda LIM');
  if v_filas <> 3 then
    raise exception 'Se esperaban las 3 sedes «Tienda TRU», «Tienda AQP» y «Tienda LIM» y hay %: revisa los nombres en retail.ubicaciones.', v_filas;
  end if;

  select count(*) into v_filas from retail.comprobantes
   where serie in ('B001','B002','B003','F001','F002','F003','BC01','BC02','BC03','FC01','FC02','FC03');
  if v_filas > 0 then
    raise exception 'Ya hay % comprobantes con alguna de las series nuevas: esos números existen y la serie no puede empezar en 1.', v_filas;
  end if;

  -- 1. Archivar las series de prueba o mal nombradas (nunca un DELETE: sus comprobantes las nombran).
  update retail.series_comprobantes
     set archivada_at = now(),
         motivo_archivo = case
           when serie in ('NC01', 'NC02') then
             'Nombre no válido ante SUNAT: una nota de crédito lleva B (boletas) o F (facturas) de primera letra. Reemplazada por BC0x/FC0x al salir a producción (2026-09-29).'
           else
             'Serie de pruebas: su numeración se gastó en el sandbox de Lucode. Cerrada al salir a la SUNAT real, con series nuevas desde el 1 (2026-09-29).'
         end
   where archivada_at is null
     and (tipo, serie) in (
       ('boleta', 'B004'), ('boleta', 'B005'), ('factura', 'F004'), ('factura', 'F005'),
       ('nota_credito', 'NC01'), ('nota_credito', 'NC02')
     );

  -- 2. Registrar las series nuevas (Trujillo 1, Arequipa 2, Lima 3), desde el 1. `where not exists` = idempotente.
  insert into retail.series_comprobantes (ubicacion_id, tipo, serie, siguiente_numero)
  select u.id, v.tipo, v.serie, 1
    from (values
      ('Tienda TRU', 'boleta',       'B001'), ('Tienda AQP', 'boleta',       'B002'), ('Tienda LIM', 'boleta',       'B003'),
      ('Tienda TRU', 'factura',      'F001'), ('Tienda AQP', 'factura',      'F002'), ('Tienda LIM', 'factura',      'F003'),
      ('Tienda TRU', 'nota_credito', 'BC01'), ('Tienda AQP', 'nota_credito', 'BC02'), ('Tienda LIM', 'nota_credito', 'BC03'),
      ('Tienda TRU', 'nota_credito', 'FC01'), ('Tienda AQP', 'nota_credito', 'FC02'), ('Tienda LIM', 'nota_credito', 'FC03')
    ) as v(sede, tipo, serie)
    join retail.ubicaciones u on u.nombre = v.sede
   where not exists (select 1 from retail.series_comprobantes s where s.tipo = v.tipo and s.serie = v.serie);

  -- Comprobación final: exactamente estas 12 activas y ninguna otra de boleta, factura o nota de crédito.
  select count(*) into v_filas
    from retail.series_comprobantes s
    join retail.ubicaciones u on u.id = s.ubicacion_id
   where s.archivada_at is null
     and (u.nombre, s.tipo, s.serie) in (
       ('Tienda TRU', 'boleta', 'B001'), ('Tienda AQP', 'boleta', 'B002'), ('Tienda LIM', 'boleta', 'B003'),
       ('Tienda TRU', 'factura', 'F001'), ('Tienda AQP', 'factura', 'F002'), ('Tienda LIM', 'factura', 'F003'),
       ('Tienda TRU', 'nota_credito', 'BC01'), ('Tienda AQP', 'nota_credito', 'BC02'), ('Tienda LIM', 'nota_credito', 'BC03'),
       ('Tienda TRU', 'nota_credito', 'FC01'), ('Tienda AQP', 'nota_credito', 'FC02'), ('Tienda LIM', 'nota_credito', 'FC03')
     );
  if v_filas <> 12 then
    raise exception 'Quedaron % de las 12 series nuevas activas: no se aplica nada.', v_filas;
  end if;

  select count(*) into v_filas
    from retail.series_comprobantes
   where archivada_at is null and tipo in ('boleta', 'factura', 'nota_credito', 'nota_debito');
  if v_filas <> 12 then
    raise exception 'Hay % series activas de boleta, factura o nota y deberían ser exactamente 12: alguna vieja sigue viva.', v_filas;
  end if;
end $$;

-- ---------- PASO 3 · VERIFICAR (mira la tabla) ----------
-- Debe salir: 12 activas nuevas con próximo = 1 y las 3 NV intactas; abajo las 6 archivadas con su motivo.
select u.nombre as sede, s.tipo, s.serie, s.siguiente_numero as proximo,
       case when s.archivada_at is null then 'ACTIVA' else 'archivada' end as estado
  from retail.series_comprobantes s
  join retail.ubicaciones u on u.id = s.ubicacion_id
 order by (s.archivada_at is not null), u.nombre, s.tipo, s.serie;

-- Y los comprobantes que ya existían siguen donde estaban (no se tocó ninguno): 3 filas, B004 números 2, 3 y 33.
select serie, numero, estado, entorno_transmision from retail.comprobantes where tipo = 'boleta' order by numero;
