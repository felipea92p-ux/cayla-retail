-- ============================================================================
-- 20260917230100 — Semilla de vocabulario de Etiquetas: comerciales,
-- festividades peruanas, tendencias globales y "Para liquidar" por sede
--
-- DE DÓNDE SALIÓ ESTA LISTA
--   Investigación real (no inventada) contra el mecanismo de mercadeo de
--   Zara/Bershka (rotación real vía RFID, cadencia de llegada), Ralph
--   Lauren ("icon programs"/cápsulas), Hermès (herencia artesanal — el
--   paralelo real con el Taller de Lima), calendario comercial peruano
--   confirmado (CyberWow lo organiza IAB Perú, 3 ediciones/año; Black
--   Friday 2026 es el 27-nov, Black Week 23-30-nov, distinto de CyberWow),
--   y fechas globales "quirky" verificadas con fuente propia (Galentine's
--   Day 13-feb, Día Internacional del Gato 8-ago, Día Internacional del
--   Perro 26-ago — NO son la misma fecha —, Día de la Tierra 22-abr,
--   nombre oficial ONU "Día Internacional de la Madre Tierra" pero el uso
--   real en Perú es "Día de la Tierra"). Decidido con Felipe en varias
--   rondas de esta sesión, sobre las etiquetas mismas y su vigencia.
--
-- TODAS QUEDAN 'aprobado' DE UNA — por qué se salta el flujo normal
--   El flujo proponer→aprobar (`fn_etiquetas_estado_trigger`) existe para
--   cuando un colaborador propone algo nuevo y un Líder lo revisa. Acá no
--   hay nada que revisar: es Felipe decidiendo su propio vocabulario de
--   catálogo, fila por fila, en esta misma sesión. Se desactiva el
--   trigger para el insert (mismo patrón ya usado en
--   `pegar-en-produccion-taxonomia-parte-segura.sql` para `tallas`) y se
--   reactiva enseguida — así el candado real de "comentario obligatorio
--   al aprobar" sigue intacto para cualquier etiqueta que alguien
--   proponga DESPUÉS de esta semilla.
--
-- POR QUÉ `propuesto_por`/`aprobado_por` QUEDAN EN NULL
--   Mismo criterio que la semilla de `tallas`: son datos migrados/
--   sembrados, no una propuesta real de una persona con `auth.uid()` en
--   sesión — poner un UUID fijo de una persona rompería `db reset` local
--   (esa fila de `personas` no existe ahí) y produciría un dato falso en
--   producción (nadie "propuso" esto en el sentido que el campo mide).
--
-- POR QUÉ "PARA LIQUIDAR" NO ES UNA FILA, ES UNA POR SEDE
--   Esta es la pieza que Felipe no tenía clara y vale la pena dejar
--   escrita: `sedes_permitidas` vive en la ETIQUETA, no en cada
--   aplicación a una variante. Si "Para liquidar" fuera una sola fila
--   genérica, restringirla a una sede restringiría TODAS las
--   liquidaciones futuras a esa misma sede — Tienda TRU no podría
--   liquidar algo distinto de lo que liquida Tienda Lima al mismo tiempo.
--   La solución correcta con el esquema actual es una fila de "Para
--   liquidar" POR sede real, cada una restringida solo a la suya. Por
--   eso este bloque NO hardcodea nombres de sede (a diferencia del resto
--   de esta semilla) — local tiene "Tienda Lima"/"Tienda Trujillo" y
--   producción tiene nombres distintos ("Tienda TRU"/"Tienda AQP"...);
--   se genera una fila por cada `retail.ubicaciones` activa que exista
--   en el momento de correr esto, sea cual sea su nombre real.
-- ============================================================================

set search_path = retail, public, extensions;

alter table retail.etiquetas disable trigger etiquetas_estado_biut;

insert into retail.etiquetas (nombre, estado, activo, notas, vigente_desde, vigente_hasta)
values
  -- Rotación real (Zara/Bershka) — sin vigencia, siempre disponibles
  ('Nuevo', 'aprobado', true,
   'Marca prendas recién ingresadas — reemplaza el criterio informal de "lo que llegó esta semana" con algo visible en catálogo. Patrón Bershka: llegadas frecuentes como gancho de retorno.',
   null, null),
  ('Últimas unidades', 'aprobado', true,
   'Señala rotación real de poco stock restante. Debe reflejar unidades bajas de verdad (ver lib/inteligencia.ts), nunca urgencia inventada — principio de "números antes que opiniones".',
   null, null),
  ('Top ventas', 'aprobado', true,
   'Se aplica según rotación real medida por el sistema, nunca a criterio manual — mismo principio que Zara resuelve con RFID en tiempo real.',
   null, null),

  -- Herencia artesanal (Hermès) — verificable, candado en cada aprobación
  ('Hecho a mano', 'aprobado', true,
   'Verificar en cada aprobación que la prenda salió realmente del Taller de Lima antes de aprobar — no es un adjetivo de marketing, es un dato verificable (mismo mecanismo que Hermès marca taller/artesano en cada pieza).',
   null, null),
  ('Pieza única', 'aprobado', true,
   'Un solo ejemplar real. El candado de "en uso" (fn_etiquetas_estado_trigger) evita desactivarla mientras una variante la tenga aplicada.',
   null, null),
  ('Reedición', 'aprobado', true,
   'Para cuando el Taller reedite una pieza de archivo — patrón "icon program" de Ralph Lauren. Aplica cuando exista catálogo histórico real que reeditar.',
   null, null),

  -- Campañas reusables sin fecha fija
  ('CyberWow', 'aprobado', true,
   'Genérica y reusable para las 3 ediciones anuales (abril/julio/noviembre) organizadas por IAB Perú — se reactiva manualmente en cada edición, no lleva ventana de vigencia fija por eso.',
   null, null),

  -- Fechas comerciales peruanas — vigencia 2026, ~2 semanas antes
  ('Día de la Madre', 'aprobado', true,
   '2do domingo de mayo (10-may-2026). Ventana de 2 semanas antes, como pidió Felipe.',
   '2026-04-26', '2026-05-10'),
  ('Fiestas Patrias', 'aprobado', true,
   '28-29 de julio.', '2026-07-14', '2026-07-29'),
  ('Navidad', 'aprobado', true,
   '25 de diciembre.', '2026-12-11', '2026-12-25'),
  ('San Valentín', 'aprobado', true,
   '14 de febrero.', '2026-01-31', '2026-02-14'),
  ('Día de la Mujer', 'aprobado', true,
   '8 de marzo — fecha fuerte en retail peruano específicamente para el público de CAYLA (mujeres jóvenes).',
   '2026-02-22', '2026-03-08'),
  ('Halloween', 'aprobado', true,
   '31 de octubre.', '2026-10-17', '2026-10-31'),
  ('Black Friday', 'aprobado', true,
   'Black Friday 2026 es el 27-nov, "Black Week" del 23 al 30-nov (Cyber Monday) — confirmado como ola propia, distinta del CyberWow de noviembre que organiza IAB Perú.',
   '2026-11-09', '2026-11-30'),
  ('Aniversario CAYLA', 'aprobado', true,
   'Fecha real: 23 de octubre. Felipe decidió correr la CELEBRACIÓN a inicios de octubre para no cruzarse con la ventana de Halloween (17 al 31-oct) — por eso la vigencia NO cubre el 23.',
   '2026-10-01', '2026-10-14'),

  -- Tendencias globales, con fuente verificada
  ('Galentine''s Day', 'aprobado', true,
   '13 de febrero, el día antes de San Valentín. Tendencia real y creciente (no inventada) liderada por Gen Z/Millennials — mensaje de "celebra a tus amigas o a ti misma", no solo pareja. Separada de San Valentín a propósito: permite comparar cuál rota más antes de decidir si se fusionan (números antes que opiniones).',
   '2026-02-06', '2026-02-13'),
  ('Día Internacional del Gato', 'aprobado', true,
   '8 de agosto. Fecha real y activa en marketing de marcas fuera del rubro mascotas.',
   '2026-07-25', '2026-08-08'),
  ('Día Internacional del Perro', 'aprobado', true,
   '26 de agosto — NO es la misma fecha que el Día del Gato (8-ago), verificado con fuente propia.',
   '2026-08-12', '2026-08-26'),
  ('Día de la Tierra', 'aprobado', true,
   '22 de abril. Nombre ganador frente a "Día del Planeta" (no es un término real de uso oficial ni común en Perú). Ojo: la evidencia real es que Gen Z desconfía del "greenwashing" sin prueba — si se usa, que vaya de la mano de algo genuino de CAYLA (producción propia en el Taller, no fast fashion importado), no solo un gráfico.',
   '2026-04-08', '2026-04-22')
on conflict (retail.fn_clave_texto(nombre)) do nothing;

-- ---------------------------------------------------------------------------
-- "Para liquidar" — una fila por cada ubicación activa, sin hardcodear
-- nombres (ver nota de cabecera). sedes_permitidas = solo esa ubicación.
-- ---------------------------------------------------------------------------
insert into retail.etiquetas (nombre, estado, activo, sedes_permitidas, notas)
select
  'Para liquidar — ' || u.nombre,
  'aprobado',
  true,
  array[u.id],
  'Liquidación local de ' || u.nombre || ' — restringida a esta sede a propósito: sin este candado, liquidar algo en una sede lo mostraría como "para liquidar" en todas las demás, aunque ahí no aplique.'
from retail.ubicaciones u
where u.activo
on conflict (retail.fn_clave_texto(nombre)) do nothing;

alter table retail.etiquetas enable trigger etiquetas_estado_biut;
