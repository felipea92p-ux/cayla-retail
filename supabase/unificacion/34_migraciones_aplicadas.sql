-- ============================================================================
-- 34 — Registro de qué migró en producción
-- Correr en cayla-DYNAMIC (SQL Editor). Todo en el cajón `retail`.
-- Gemelo de `supabase/migrations/0053_migraciones_aplicadas.sql`.
--
-- RENUMERADO DOS VECES el mismo día (2026-09-10): un colaborador externo
-- (Danytristee, fuera de esta máquina, invisible para cualquier coordinación
-- entre sesiones de Claude) empujó directo a `origin/main` mientras esta
-- sesión trabajaba. Primero tomó 33/0051 (`33_conteo_color_vacio.sql`, ya
-- aplicado en producción — nada que ver con esta tabla); al renombrar a
-- 34/0052 apareció que 0052 TAMBIÉN ya estaba tomado
-- (`0052_taxonomia_universal.sql`), así que el local quedó en 0053. La
-- unificación se quedó en 34 (sin choque ahí). Este archivo YA SE HABÍA
-- PEGADO en producción bajo el nombre original antes de descubrir la primera
-- colisión — por eso la fila que se autorregistra abajo dice
-- `33_migraciones_aplicadas.sql`, no `34`: es el registro histórico real de
-- lo que se pegó, y no se reescribe. El nombre del ARCHIVO cambió dos veces;
-- lo que corrió en producción ese día, no.
--
-- POR QUÉ AHORA. Pasó una tercera vez: `27`, `28`, `29` y `30` ya estaban
-- aplicadas en producción y el BACKLOG seguía diciendo "falta pegar" un día
-- después — mismo agujero que `recibir_lote` (ADR-0004) y
-- `patrimonio_items.categoria` (ADR-0006). El verificador de
-- `scripts/migraciones/` (ADR-0026) resuelve la mitad heurística del problema
-- ("¿existe algo con este nombre?"); esta tabla resuelve la otra mitad, la que
-- ningún análisis de esquema puede inferir: CUÁNDO corrió cada archivo, y con
-- certeza — no "algo con ese nombre existe", sino "este archivo se pegó".
--
-- CONVENCIÓN A PARTIR DE ACÁ. Todo archivo nuevo de esta carpeta termina con:
--
--   insert into retail.migraciones_aplicadas (archivo) values ('NN_nombre.sql')
--     on conflict (archivo) do nothing;
--
-- `do nothing` y no `do update`: si el archivo se vuelve a pegar sin saber que
-- ya corrió, la fecha que queda es la PRIMERA vez, no la última.
--
-- BACKFILL — LEER ANTES DE CONFIAR EN UNA FILA VIEJA. Dos niveles de certeza,
-- distinguidos en `nota`:
--   · "verificado en vivo 2026-09-10" — confirmado esta sesión con una consulta
--     directa contra producción (`pg_proc`, `information_schema`, o los datos
--     mismos). Certeza real.
--   · "según BACKLOG.md, no re-verificado hoy" — la fecha viene de lo que una
--     sesión anterior escribió como confirmado, con el método que usó citado
--     ahí. No es una medición de hoy.
-- Lo que NO entra al backfill, a propósito: `01_sedes.sql` (el verificador
-- encontró `retail_sede_meta` ausente — la unificación de julio nunca quedó
-- documentada del todo, ver el ítem de deuda en BACKLOG), `03`-`11`, `13`, `16`,
-- `18` (sin evidencia directa citada en ningún lado), `26` (su lógica ya viene
-- INCLUIDA dentro de `27`, así que no hay forma de probar si corrió aparte), y
-- `31` (BITÁCORA 2026-09-09 dice explícito "Producción no se tocó"). Ausencia
-- acá NO significa "no corrió" para estos: significa "todavía no hay evidencia
-- de ningún lado que lo confirme con certeza". Ese es justo el punto de esta
-- tabla — no inventar un verde que no se ganó.
-- ============================================================================

create table if not exists retail.migraciones_aplicadas (
  archivo text primary key,
  aplicada_at timestamptz not null default now(),
  nota text
);

alter table retail.migraciones_aplicadas enable row level security;

insert into retail.migraciones_aplicadas (archivo, aplicada_at, nota) values
  ('12_almacen_interno.sql',                  '2026-09-03', 'según BACKLOG.md ("confirmado con select real"), no re-verificado hoy'),
  ('14_recibir_lote_produccion.sql',          '2026-09-03', 'según BACKLOG.md (ADR-0004, verificado con pg_proc/regprocedure), no re-verificado hoy'),
  ('15_patrimonio_categoria.sql',             '2026-09-05', 'según BACKLOG.md (ADR-0006, information_schema.columns), no re-verificado hoy'),
  ('17_facturacion_completa.sql',             '2026-09-05', 'según BACKLOG.md (Fase 0 ADR-0007, pg_proc/information_schema.tables), fecha aproximada, no re-verificado hoy'),
  ('19_categorias_completas.sql',             '2026-09-08', 'según BACKLOG.md (count(*) = 37), no re-verificado hoy — sin promesas detectables para el verificador estático (solo inserts)'),
  ('20_comprobantes_items.sql',               '2026-09-08', 'según BACKLOG.md, no re-verificado hoy'),
  ('21_actualizar_transmision_comprobante.sql','2026-09-08', 'según BACKLOG.md, no re-verificado hoy'),
  ('22_serie_numero_inicial.sql',             '2026-09-10', 'verificado en vivo 2026-09-10: pg_get_function_identity_arguments confirma la firma de 4 parámetros'),
  ('23_comprobante_entorno_transmision.sql',  '2026-09-09', 'según BACKLOG.md ("una sola firma de 5 args, 6 columnas nuevas"), no re-verificado hoy'),
  ('24_anular_comprobante.sql',               '2026-09-09', 'según BACKLOG.md, no re-verificado hoy'),
  ('25_recalcular_stock_neto.sql',            '2026-09-09', 'según BACKLOG.md (ADR-0020), no re-verificado hoy'),
  ('27_ajuste_con_signo.sql',                 '2026-09-09', 'verificado en vivo 2026-09-10: las tres redes convalidated=true y fn_aplicar_movimiento con el patrón nuevo — pegada de nuevo hoy sin saber que ya estaba, sin daño (idempotente)'),
  ('28_colores.sql',                          '2026-09-09 20:31:09+00', 'verificado en vivo 2026-09-10: fecha real tomada de created_at en retail.colores — pegada de nuevo hoy sin saber que ya estaba, sin daño (idempotente)'),
  ('29_codigos.sql',                          '2026-09-09', 'verificado en vivo 2026-09-10: 37 categorías con 37 prefijos, productos/variantes con código, las funciones sin sobrecarga'),
  ('30_conteos.sql',                          '2026-09-09', 'verificado en vivo 2026-09-10: las 7 funciones de conteo existen con count=1'),
  ('32_color_arena.sql',                      '2026-09-09 20:45:25+00', 'verificado en vivo 2026-09-10: fecha real tomada de created_at de la fila ARN en retail.colores')
on conflict (archivo) do nothing;

insert into retail.migraciones_aplicadas (archivo) values ('33_migraciones_aplicadas.sql')
  on conflict (archivo) do nothing;

-- ============================================================================
-- VERIFICACIÓN (correr a mano después de pegar)
-- ============================================================================
-- 1. Cuántas quedaron registradas (16 del backfill + esta misma = 17):
--   select count(*) from retail.migraciones_aplicadas;
--
-- 2. La tabla es invisible por la API (RLS sin policies) — desde la app, con
--    cualquier sesión, esto debe devolver 0 filas o un error de permiso, nunca
--    los datos:
--   select * from retail.migraciones_aplicadas;  -- correr como anon/authenticated, no como superuser
-- ============================================================================
