-- ============================================================================
-- 20261030144000_avios_clase_medida_y_quien_los_crea.sql — CAYLA V2 (ADR-0580, actividad 1 · 2026-10-30)
--
-- EL PROBLEMA PRIMERO. ADR-0554 convirtió la TELA en una ficha con sus colores y dejó al AVÍO como estaba: un alta por color, con el código tecleado a mano y UN solo color por ficha
-- (su hallazgo G16). Peor: el sistema no sabe que un botón es un botón. `insumos.tipo` solo vale 'tela' o 'avio', así que la medida que de verdad distingue un avío de otro —18 L de línea,
-- 40 cm de largo, 3 cm de ancho, título 40— termina escrita DENTRO del nombre. Y eso no es un detalle de estilo: `retail.fn_clave_texto('Boton nacar 18mm')` y `fn_clave_texto('Boton nacar 18 mm')`
-- NO son iguales (colapsa espacios, no los borra: `20260912235500_vocabulario_cerrado.sql:39-46`), así que el candado `materiales_nombre_tipo_unico` deja entrar dos fichas del MISMO botón,
-- cada una con su stock, sin un solo error. Y la unidad del avío se congela al primer lote (`fn_insumos_unidad_firme`, `20261028172000`): el hilo que nace en «unidades» en vez de en CONOS
-- queda mal medido para siempre.
--
-- QUÉ HACE
--   PARTE 1 (sin políticas)
--   1. Tabla `avio_clases`: el vocabulario de clases de avío (Botón, Cierre, Hilo, Etiqueta, Elástico y cinta, Pretina, Otro). El líder la amplía sin deploy; lo que NO se amplía sin deploy es
--      el `comportamiento` (CHECK cerrado de 6), que es de donde salen las reglas: qué unidad se propone, si lleva color y qué medida pide. Mismo híbrido que `categorias` (tabla + `familia`
--      CHECK) y `colores` (tabla + `familia_color` CHECK).
--   2. `materiales.clase_id`: un avío SIEMPRE tiene clase; una tela, nunca. Dos CHECK lo hacen imposible al revés.
--   3. `materiales.medida_valor` + `medida_unidad` (linea · milimetro · centimetro · titulo): la medida sale del nombre y pasa a ser dato. El candado de nombre repetido pasa a ser
--      (nombre, tipo, medida): dos medidas del mismo botón son dos fichas a propósito; la misma medida dos veces, no entra.
--   4. `fn_medida_texto` y el nombre COMPUESTO: lo que se lee en Producción, en Compras y en una orden («Botón nácar 18 L · Negro») lo arma la base en el disparador de cada color, desde el
--      nombre y la medida de la ficha. Ninguna pantalla lo escribe, así que no se pueden desfasar.
--   5. `fn_codigo_de_material` toma el prefijo de la CLASE (`BOT-01`, `CIE-01`, `HIL-01`), no de la primera palabra del nombre. Pasa a tener UNA sola firma, con el tercer argumento por defecto
--      (se suelta la de dos antes de crearla): `pruebas:una-sola-firma` no deja dos firmas vivas de la misma función, y las llamadas de dos argumentos siguen funcionando.
--   6. `fn_material_leer` valida el avío entero: clase viva, la medida que su comportamiento pide (y la que no admite), y merma solo si se mide en metros.
--   7. **Un avío lo crea quien opera el Taller, igual que una tela** (Felipe, 2026-10-30, decisión 3): se retira el candado `avio_sin_lider` de `crear_material` y de
--      `fn_material_agregar_colores`. El SALDO INICIAL, con su costo, sigue siendo solo del líder (`saldo_sin_lider`), y editar una ficha también (`editar_material`).
--   8. `editar_material` corrige la clase y la medida, con su línea en Actividad; `fn_material_como_json` las entrega.
--   PARTE 2 (las políticas, solas y al final — ADR-0195)
--   9. `avio_clases`: se lee y se crea con sesión (nace activa, como un tejido: ADR-0534) y solo el líder la corrige o la desactiva.
--
-- PROMETE: un avío no existe sin clase; su medida es un dato, no una letra del nombre; el mismo botón de la misma medida no entra dos veces ni escrito distinto; el nombre que se lee en todo
--   el ERP lo arma la base; una clase nueva no necesita deploy, pero una REGLA nueva sí; quien opera el Taller crea avíos y colores, y el dinero sigue siendo del líder.
-- ASUME: `20261028172000`, `20261028175000`, `20261028203000` y `20261029014000` ya están aplicadas (las cuatro están en producción desde el 28-29 de oct). Producción tiene **0 avíos**
--   (`retail.insumos where tipo='avio'`, consultado en vivo el 2026-10-30): por eso `materiales_avio_con_clase` puede exigirse de entrada, sin migrar una sola fila.
-- NO HACE: no toca lotes, movimientos ni costos; no agrega la unidad de compra con factor (gruesa, ciento, caja: Felipe la dejó para después, va junto con la conversión kilo→metro de la tela,
--   actividad 4 de ADR-0554); no cambia quién EDITA una ficha; no convierte ningún insumo suelto (`fn_materializar_insumos_sueltos` sigue siendo solo de telas).
--
-- DECIDÍ: la clase es TABLA (el líder la amplía) con un CHECK CERRADO de `comportamiento` del que cuelgan las reglas. DESCARTÉ el CHECK fijo de clases —una clase nueva pediría deploy, y es
--   justo lo que Felipe no sabe todavía— y DESCARTÉ la tabla con las reglas editables: una regla editable que determina una unidad IRREVERSIBLE es un estado imposible esperando su turno.
-- DECIDÍ: la medida en columnas y el nombre que se lee compuesto por la base. DESCARTÉ dejarla dentro del nombre escrito a mano (medido: `fn_clave_texto` no pega «18mm» con «18 mm», así que
--   el candado de nombre no es candado de medida) y DESCARTÉ un segundo eje de variante en `insumos` (medida × color): `20261026152000:22-23` ya decidió que «una etiqueta de la S y otra de la M
--   son DOS avíos», y tocar `insumos_material_color_unico` rompe la simetría exacta de la que viven «retirar color», el candado de unidad y las invariantes.
-- SE ROMPE SI: alguien escribe la medida DENTRO del nombre además de ponerla en su campo («Botón nácar 18mm» con medida 18 L): quedan dos fichas legítimas para la base. La hoja lo evita
--   mostrando el nombre compuesto mientras se escribe y avisando de la ficha parecida, pero la base no puede impedirlo sin prohibir los números en un nombre.
--
-- CÓMO SE PEGA. DOS PARTES, por separado y en orden, cada una entera. PARTE 1 = desde el primer `set lock_timeout` hasta «FIN DE LA PARTE 1»; PARTE 2 = lo que sigue. Las dos son
--   re-ejecutables. Sin `drop trigger` (todo `create or replace trigger`); los `drop index` y `drop function` no toman las 21 tablas de `auth`/`storage` (ADR-0195), las políticas sí: por eso
--   van solas al final. Dentro de los textos entre comillas no hay ningún `select … into` (ADR-0288). Prueba: `pnpm pruebas:materiales` (grupo V).
--   NO REPEGAR NUNCA `20261028175000`: producción tiene su texto VIEJO, sin la guardia «repegado_peligroso», y devolvería seis funciones a su versión anterior sin un solo error.
-- ============================================================================

set lock_timeout = '3s';

-- ---------- 0. Antes de tocar nada ----------
do $f$
begin
  if to_regprocedure('retail.editar_material(uuid,uuid,jsonb)') is null then
    raise exception 'Falta la migración 20261028203000 (endurecimiento y «Editar tela»). Pégala primero.' using hint = 'orden_de_migraciones';
  end if;
end
$f$;

-- ---------- 1. Las clases de avío ----------
-- `comportamiento` es lo ÚNICO cerrado: de él salen la unidad que se propone, si la clase lleva color y qué medida pide.
--   pieza    — se cuenta por unidad y su medida (opcional) es de grosor o diámetro: el botón, el broche, el remache.
--   largo    — se compra por pieza y lo que la distingue es su LARGO en cm: el cierre.
--   ancho    — se compra por metro y lo que la distingue es su ANCHO en cm: el elástico, la cinta, el sesgo, la pretina.
--   titulo   — se compra por cono y lo que la distingue es su título: el hilo.
--   etiqueta — unidad, sin medida y sin color: la etiqueta de marca, de talla o de composición.
--   otro     — todavía no se sabe; no propone nada y no exige medida.
create table if not exists retail.avio_clases (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  -- Las 2 a 4 letras con las que empieza el código de cada ficha de esta clase (`BOT-01`). No se cambia una vez que hay fichas: cambiarlo no reescribe los códigos ya emitidos.
  prefijo text not null,
  comportamiento text not null default 'otro' check (comportamiento in ('pieza', 'largo', 'ancho', 'titulo', 'etiqueta', 'otro')),
  -- La unidad que la hoja PROPONE. No la impone: la persona la ve y la puede cambiar, porque es ella quien tiene el avío en la mano. Lo que sí es definitivo es la que elija (ADR-0554).
  unidad_sugerida text not null default 'unidad' check (unidad_sugerida in ('metro', 'unidad', 'kilo', 'cono', 'par', 'docena')),
  -- `false` en lo que no tiene color (la etiqueta de composición): la hoja no lo pide ni lo cuenta como pendiente.
  pide_color boolean not null default true,
  orden integer not null default 100,
  activo boolean not null default true,
  nota text,
  creado_por uuid references public.personas (id),
  created_at timestamptz not null default now(),
  constraint avio_clases_nombre_no_vacio check (retail.fn_clave_texto(nombre) is not null),
  constraint avio_clases_prefijo_forma check (prefijo ~ '^[A-Z]{2,4}$'),
  constraint avio_clases_textos_con_tope check (length(nombre) <= 60 and length(coalesce(nota, '')) <= 200)
);
create unique index if not exists avio_clases_nombre_unico on retail.avio_clases (retail.fn_clave_texto(nombre));
create unique index if not exists avio_clases_prefijo_unico on retail.avio_clases (prefijo);
comment on table retail.avio_clases is
  'ADR-0580: las clases de avío (botón, cierre, hilo, etiqueta, elástico, pretina…). El líder la amplía sin deploy; `comportamiento` es un CHECK cerrado porque de él salen las reglas (unidad propuesta, si lleva color, qué medida pide).';
comment on column retail.avio_clases.comportamiento is
  'pieza | largo | ancho | titulo | etiqueta | otro. Cerrado a propósito: una regla nueva es código nuevo, no una fila nueva.';

alter table retail.avio_clases enable row level security;
revoke all on retail.avio_clases from anon;
revoke delete, truncate, references, trigger on retail.avio_clases from authenticated;

-- Las siete con las que arranca (Felipe, 2026-10-30, decisión 1). Re-ejecutable: una clase que el líder renombró o desactivó NO se pisa.
insert into retail.avio_clases (nombre, prefijo, comportamiento, unidad_sugerida, pide_color, orden, nota) values
  ('Botón',             'BOT', 'pieza',    'unidad', true,  10, 'Se mide en líneas (L), siempre: 18 L ≈ 11,4 mm.'),
  ('Cierre',            'CIE', 'largo',    'unidad', true,  20, 'Lo que lo distingue es su largo en centímetros.'),
  ('Hilo',              'HIL', 'titulo',   'cono',   true,  30, 'Se compra por cono (≈5.000 m) y por color.'),
  ('Etiqueta',          'ETI', 'etiqueta', 'unidad', false, 40, 'Marca, talla o composición: no lleva color.'),
  ('Elástico y cinta',  'ELA', 'ancho',    'metro',  true,  50, 'Se compra por metro; lo que lo distingue es su ancho en centímetros.'),
  ('Pretina',           'PRE', 'ancho',    'metro',  true,  60, 'Elástico ancho de cintura, por metro. Si la pretina se corta de la misma tela, es tela, no avío.'),
  ('Otro',              'AVI', 'otro',     'unidad', true,  99, 'Lo que todavía no tiene su clase. El líder puede crearla en Catálogo ▸ Atributos.')
on conflict do nothing;

-- ---------- 2. La clase y la medida de una ficha ----------
alter table retail.materiales add column if not exists clase_id uuid references retail.avio_clases (id);
alter table retail.materiales add column if not exists medida_valor numeric(8, 2);
alter table retail.materiales add column if not exists medida_unidad text;

do $f$
begin
  -- Una tela no tiene clase de avío; un avío no existe sin ella. Se puede exigir de entrada porque producción tiene 0 avíos (consultado en vivo el 2026-10-30).
  if not exists (select 1 from pg_constraint where conname = 'materiales_clase_solo_avio' and conrelid = 'retail.materiales'::regclass) then
    alter table retail.materiales add constraint materiales_clase_solo_avio check (tipo = 'avio' or clase_id is null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'materiales_avio_con_clase' and conrelid = 'retail.materiales'::regclass) then
    alter table retail.materiales add constraint materiales_avio_con_clase check (tipo <> 'avio' or clase_id is not null);
  end if;
  -- La medida es del avío, va completa o no va, y no es un número de otro mundo (`numeric` admite NaN: el rango lo deja fuera).
  if not exists (select 1 from pg_constraint where conname = 'materiales_medida_solo_avio' and conrelid = 'retail.materiales'::regclass) then
    alter table retail.materiales add constraint materiales_medida_solo_avio check (tipo = 'avio' or (medida_valor is null and medida_unidad is null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'materiales_medida_completa' and conrelid = 'retail.materiales'::regclass) then
    alter table retail.materiales add constraint materiales_medida_completa check ((medida_valor is null) = (medida_unidad is null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'materiales_medida_conocida' and conrelid = 'retail.materiales'::regclass) then
    alter table retail.materiales add constraint materiales_medida_conocida check (medida_unidad is null or medida_unidad in ('linea', 'milimetro', 'centimetro', 'titulo'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'materiales_medida_con_tope' and conrelid = 'retail.materiales'::regclass) then
    alter table retail.materiales add constraint materiales_medida_con_tope check (medida_valor is null or (medida_valor > 0 and medida_valor < 10000));
  end if;
end
$f$;
create index if not exists materiales_clase_idx on retail.materiales (clase_id) where clase_id is not null;
comment on column retail.materiales.clase_id is 'ADR-0580: la clase del avío (botón, cierre, hilo…). Nula en una tela, obligatoria en un avío.';
comment on column retail.materiales.medida_valor is 'ADR-0580: la medida que distingue este avío de otro de su misma clase (18 de línea, 40 de centímetros). Va con `medida_unidad` o no va.';

-- El candado de nombre repetido pasa a mirar también la medida: dos medidas del mismo botón son DOS fichas a propósito; la misma medida dos veces, no entra ni escrita distinto.
-- (`drop index` no toma en exclusiva las tablas de `auth`/`storage`: ADR-0195.)
drop index if exists retail.materiales_nombre_tipo_unico;
create unique index if not exists materiales_nombre_tipo_medida_unico
  on retail.materiales (retail.fn_clave_texto(nombre), tipo, coalesce(medida_valor, -1), coalesce(medida_unidad, ''));

-- ---------- 3. Cómo se dice una medida ----------
-- «18 L», «11.4 mm», «40 cm», «título 40». Una sola forma en toda la base, y `lib/medida-de-avio.ts` dice lo mismo en la web (su prueba lo exige).
create or replace function retail.fn_medida_texto(p_valor numeric, p_unidad text)
returns text
language sql
immutable
as $f$
  select case
    when p_valor is null or p_unidad is null then null
    when p_unidad = 'linea' then trim_scale(p_valor)::text || ' L'
    when p_unidad = 'milimetro' then trim_scale(p_valor)::text || ' mm'
    when p_unidad = 'centimetro' then trim_scale(p_valor)::text || ' cm'
    when p_unidad = 'titulo' then 'título ' || trim_scale(p_valor)::text
    else null
  end;
$f$;
comment on function retail.fn_medida_texto(numeric, text) is
  'ADR-0580: la medida de un avío dicha en palabras («18 L», «40 cm», «título 40»). IMMUTABLE: la usan el disparador de los colores y las lecturas.';
revoke all on function retail.fn_medida_texto(numeric, text) from public, anon, authenticated;
-- La usan por dentro las funciones `security definer` (que corren como su dueño); nadie la llama por RPC. Las otras seis de este archivo ya lo hacían: esta sigue la misma regla.

-- ---------- 4. El nombre que se lee lo arma la base ----------
-- Igual que antes, pero el nombre de cada color incluye la MEDIDA de su ficha: «Botón nácar 18 L · Negro». Así la lista de Insumos, el combo de una orden y una factura dicen lo mismo,
-- y nadie puede dejar el nombre y la medida desfasados (`editar_material` reescribe el nombre base; el nombre que se lee se vuelve a componer en esta misma transacción).
create or replace function retail.fn_insumos_copias_de_la_tela()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $f$
declare
  m retail.materiales%rowtype;
  v_color text;
begin
  if new.material_id is null then
    if tg_op = 'UPDATE' and old.material_id is not null then
      raise exception 'Un color no deja de ser de su tela.' using errcode = '23514', hint = 'insumo_sin_tela';
    end if;
    return new;
  end if;
  if tg_op = 'UPDATE' and old.material_id is not null and old.material_id <> new.material_id then
    raise exception 'Un color no pasa de una tela a otra.' using errcode = '23514', hint = 'insumo_otra_tela';
  end if;
  select * into m from retail.materiales where id = new.material_id;
  if not found then
    raise exception 'Esa tela no existe.' using errcode = '23503', hint = 'material_no_existe';
  end if;
  if tg_op = 'UPDATE' then
    if old.material_id is null and (old.tipo is distinct from m.tipo or old.unidad_medida is distinct from m.unidad_medida) then
      raise exception 'Este insumo es de otra clase que la tela (%, en %): no se le puede colgar de ella.', m.tipo, m.unidad_medida using errcode = '23514', hint = 'insumo_otra_unidad';
    end if;
    if old.material_id is not null
       and ((new.tejido_id is distinct from old.tejido_id and new.tejido_id is distinct from m.tejido_id)
         or (new.merma_pct is distinct from old.merma_pct and new.merma_pct is distinct from m.merma_pct)) then
      raise exception 'El tejido y la merma son de la tela, no de cada color: cámbialos en la tela.' using errcode = '23514', hint = 'copia_de_la_tela';
    end if;
  end if;
  v_color := (select c.nombre from retail.colores c where c.codigo = new.color_codigo);
  new.tipo := m.tipo;
  new.unidad_medida := m.unidad_medida;
  new.tejido_id := m.tejido_id;
  new.merma_pct := m.merma_pct;
  new.nombre := m.nombre || coalesce(' ' || retail.fn_medida_texto(m.medida_valor, m.medida_unidad), '') || coalesce(' · ' || v_color, '');
  new.codigo := m.codigo || coalesce('-' || new.color_codigo, '');
  return new;
end;
$f$;
revoke all on function retail.fn_insumos_copias_de_la_tela() from public, anon, authenticated;

-- La medida se suma a lo que hace bajar el cambio a los colores: corregir «18 L» → «20 L» reescribe los nombres de sus colores en la misma transacción.
create or replace trigger materiales_propaga_a_colores
  after update of nombre, codigo, tejido_id, merma_pct, medida_valor, medida_unidad on retail.materiales
  for each row execute function retail.fn_materiales_propagar_a_colores();

-- ---------- 5. El código sale de la clase ----------
-- `BOT-01` para un botón, `HIL-01` para un hilo: el prefijo es el de su clase, no las tres primeras letras del nombre (que daría `NAC-01` para «Nácar grande»).
-- UNA sola firma, con el tercer argumento por defecto: `pruebas:una-sola-firma` prohíbe que una función de retail tenga dos firmas vivas (y con las dos, el default daría 42725 por ambigüedad).
-- Por eso se SUELTA primero la de dos argumentos: así `fn_codigo_de_material('x','y')` —que llaman las pruebas y el SQL viejo— sigue funcionando, resuelta contra esta con `p_clase_id` nulo.
-- `drop function` no toma las 21 tablas de `auth`/`storage` (ADR-0195), así que puede ir en la PARTE 1.
drop function if exists retail.fn_codigo_de_material(text, text);
create or replace function retail.fn_codigo_de_material(p_nombre text, p_tipo text, p_clase_id uuid default null)
returns text
language plpgsql
security definer
set search_path = retail, public, extensions
as $f$
declare
  v_p text;
  v_n integer;
  v_cod text;
  v_vuelta integer := 0;
begin
  if p_clase_id is not null then
    v_p := (select c.prefijo from retail.avio_clases c where c.id = p_clase_id);
  end if;
  if v_p is null then
    v_p := upper(substr(regexp_replace(coalesce((string_to_array(retail.fn_clave_texto(p_nombre), ' '))[1], ''), '[^a-z]', '', 'g'), 1, 3));
  end if;
  if length(coalesce(v_p, '')) < 2 then
    v_p := case when p_tipo = 'avio' then 'AVI' else 'TEL' end;
  end if;
  loop
    v_n := retail.fn_siguiente_correlativo('MAT-' || v_p);
    v_cod := v_p || '-' || lpad(v_n::text, greatest(2, length(v_n::text)), '0');
    exit when not exists (select 1 from retail.materiales m where retail.fn_clave_texto(m.codigo) = retail.fn_clave_texto(v_cod))
      and not exists (select 1 from retail.insumos i where retail.fn_clave_texto(i.codigo) = retail.fn_clave_texto(v_cod));
    v_vuelta := v_vuelta + 1;
    if v_vuelta > 200 then
      raise exception 'No se pudo armar un código libre para esta ficha. Avisa al líder.' using hint = 'codigo_sin_libres';
    end if;
  end loop;
  return v_cod;
end;
$f$;
revoke all on function retail.fn_codigo_de_material(text, text, uuid) from public, anon, authenticated;

-- Qué medida admite cada comportamiento. Vive aparte para que la lean `fn_material_leer` y las pruebas sin repetir la tabla.
-- `pieza` admite UNA sola unidad —líneas— por decisión de Felipe (2026-10-30): la unidad entra en la llave del índice único, así que admitir también milímetros dejaba entrar «Botón nácar 18 L»
-- y «Botón nácar 11.4 mm» como DOS fichas del mismo botón, con su stock partido. Lo encontró la revisión adversarial antes de pegar, con 0 avíos, cuando cerrarlo no cuesta migrar nada.
-- `otro` sigue admitiendo las cuatro a propósito: es el cajón de lo que el líder inventa y no tiene una unidad canónica que imponerle.
create or replace function retail.fn_medida_cuadra(p_comportamiento text, p_unidad text)
returns boolean
language sql
immutable
as $f$
  select case p_comportamiento
    when 'pieza' then p_unidad = 'linea'
    when 'largo' then p_unidad = 'centimetro'
    when 'ancho' then p_unidad = 'centimetro'
    when 'titulo' then p_unidad = 'titulo'
    when 'etiqueta' then false
    else true
  end;
$f$;
comment on function retail.fn_medida_cuadra(text, text) is
  'ADR-0580: qué unidad de medida admite cada comportamiento de clase de avío. Un botón se mide en líneas, siempre; un cierre en centímetros, un hilo en título; una etiqueta no se mide.';
revoke all on function retail.fn_medida_cuadra(text, text) from public, anon, authenticated;
-- La usan por dentro las funciones `security definer` (que corren como su dueño); nadie la llama por RPC. Las otras seis de este archivo ya lo hacían: esta sigue la misma regla.

-- ---------- 6. Leer y validar una ficha, tela o avío ----------
-- Un avío ahora trae clase y medida. Las reglas salen del COMPORTAMIENTO de su clase, nunca de su nombre (ADR-0290: el nombre se renombra, el comportamiento no).
create or replace function retail.fn_material_leer(p_material jsonb, p_tipo_fijo text default null, p_unidad_fija text default null)
returns jsonb
language plpgsql
set search_path = retail, public, extensions
as $f$
declare
  v_nombre text;
  v_tipo text;
  v_tejido uuid;
  v_comp text;
  v_merma numeric;
  v_unidad text;
  v_compra text;
  v_ancho numeric;
  v_gram numeric;
  v_mrollo numeric;
  v_clase uuid;
  v_medida numeric;
  v_mu text;
  k retail.avio_clases%rowtype;
begin
  if jsonb_typeof(p_material) is distinct from 'object' then
    raise exception 'Faltan los datos de la ficha.' using hint = 'material_ilegible';
  end if;
  v_tipo := coalesce(p_tipo_fijo, nullif(btrim(p_material ->> 'tipo'), ''), 'tela');
  if v_tipo not in ('tela', 'avio') then
    raise exception 'El tipo es «tela» o «avio».' using hint = 'tipo_ilegible';
  end if;
  v_nombre := btrim(coalesce(p_material ->> 'nombre', ''));
  if v_nombre = '' or length(v_nombre) > 120 then
    raise exception 'Ponle un nombre de hasta 120 letras.' using hint = 'nombre_ilegible';
  end if;
  begin
    v_tejido := case when v_tipo = 'tela' then nullif(btrim(coalesce(p_material ->> 'tejido_id', '')), '')::uuid end;
    v_clase := case when v_tipo = 'avio' then nullif(btrim(coalesce(p_material ->> 'clase_id', '')), '')::uuid end;
    v_merma := coalesce(nullif(btrim(coalesce(p_material ->> 'merma_pct', '')), '')::numeric, 0);
    v_ancho := nullif(btrim(coalesce(p_material ->> 'ancho_cm', '')), '')::numeric;
    v_gram := nullif(btrim(coalesce(p_material ->> 'gramaje_gm2', '')), '')::numeric;
    v_mrollo := nullif(btrim(coalesce(p_material ->> 'metros_por_rollo', '')), '')::numeric;
    v_medida := case when v_tipo = 'avio' then nullif(btrim(coalesce(p_material ->> 'medida_valor', '')), '')::numeric end;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Los números de la ficha no se entienden: revisa la medida, el ancho, el gramaje, los metros por rollo y la merma.' using hint = 'numero_ilegible';
  end;
  v_mu := case when v_tipo = 'avio' then nullif(btrim(coalesce(p_material ->> 'medida_unidad', '')), '') end;
  v_comp := nullif(btrim(coalesce(p_material ->> 'composicion', '')), '');
  if length(coalesce(v_comp, '')) > 160 then
    raise exception 'La composición cabe en 160 letras.' using hint = 'composicion_larga';
  end if;

  if v_tipo = 'tela' then
    v_unidad := 'metro';
    v_compra := coalesce(nullif(btrim(p_material ->> 'unidad_compra'), ''), 'metro');
    if v_compra not in ('metro', 'kilo', 'rollo') then
      raise exception 'Una tela se compra por metro, por kilo o por rollo.' using hint = 'compra_ilegible';
    end if;
    if not (v_merma >= 0 and v_merma < 0.5) then
      raise exception 'La merma va de 0 %% a menos de 50 %%.' using hint = 'merma_ilegible';
    end if;
  else
    v_unidad := coalesce(p_unidad_fija, nullif(btrim(p_material ->> 'unidad_medida'), ''), 'unidad');
    if v_unidad not in ('metro', 'unidad', 'kilo', 'cono', 'par', 'docena') then
      raise exception 'La unidad del avío no es una de las conocidas.' using hint = 'unidad_ilegible';
    end if;
    v_compra := v_unidad;
    if v_clase is null then
      raise exception 'Elige de qué clase es el avío (botón, cierre, hilo…).' using hint = 'clase_requerida';
    end if;
    select * into k from retail.avio_clases where id = v_clase;
    if not found or not k.activo then
      raise exception 'Esa clase de avío no existe o está desactivada.' using hint = 'clase_inactiva';
    end if;
    -- La merma es «lo que se pierde de cada corte»: un botón no se corta. Solo tiene sentido en lo que se mide en metros (el elástico, la cinta, la pretina).
    if v_unidad <> 'metro' and v_merma <> 0 then
      raise exception 'La merma al cortar es de lo que se mide en metros: un %% que se cuenta por unidad no la lleva.' using hint = 'merma_sin_metro';
    end if;
    if not (v_merma >= 0 and v_merma < 0.5) then
      raise exception 'La merma va de 0 %% a menos de 50 %%.' using hint = 'merma_ilegible';
    end if;
    -- La medida: la que el comportamiento de la clase pide, y solo esa.
    if (v_medida is null) <> (v_mu is null) then
      raise exception 'La medida va con su unidad: escribe las dos o ninguna.' using hint = 'medida_incompleta';
    end if;
    if v_mu is not null and v_mu not in ('linea', 'milimetro', 'centimetro', 'titulo') then
      raise exception 'Esa unidad de medida no es una de las conocidas (línea, milímetro, centímetro, título).' using hint = 'medida_ilegible';
    end if;
    if v_medida is not null and not (v_medida > 0 and v_medida < 10000) then
      raise exception 'La medida es un número mayor que cero y menor que 10 000.' using hint = 'medida_ilegible';
    end if;
    if k.comportamiento = 'etiqueta' and v_medida is not null then
      raise exception '«%» no lleva medida: lo que lo distingue es su nombre.', k.nombre using hint = 'medida_de_mas';
    end if;
    if k.comportamiento in ('largo', 'ancho', 'titulo') and v_medida is null then
      raise exception 'Dile su medida: dos «%» de distinta medida son dos avíos distintos.', k.nombre using hint = 'medida_requerida';
    end if;
    if v_mu is not null and not retail.fn_medida_cuadra(k.comportamiento, v_mu) then
      raise exception 'Esa no es la medida de «%»: revisa la unidad.', k.nombre using hint = 'medida_de_otra_clase';
    end if;
  end if;

  if (v_ancho is not null and not (v_ancho between 20 and 400)) or (v_gram is not null and not (v_gram between 30 and 1500)) then
    raise exception 'El ancho va en centímetros, entre 20 y 400 (por ejemplo 160, no 1.60), y el gramaje en gramos por metro cuadrado, entre 30 y 1500 (por ejemplo 180).' using hint = 'medidas_fuera_de_rango';
  end if;
  if v_tipo = 'tela' and v_compra = 'kilo' and not (v_ancho is not null and v_gram is not null) then
    raise exception 'Para una tela que se compra por kilo hace falta su ancho y su gramaje: con eso se pasan los kilos a metros.' using hint = 'kilo_sin_medidas';
  end if;
  if v_compra = 'rollo' and not (coalesce(v_mrollo, 0) > 0) then
    raise exception 'Para una tela que se compra por rollo hace falta decir cuántos metros trae un rollo (lo habitual).' using hint = 'rollo_sin_metros';
  end if;
  if v_mrollo is not null and not (v_mrollo > 0 and v_mrollo < 100000) then
    raise exception 'Los metros de un rollo no se entienden: escribe un número mayor que cero y menor que 100 000.' using hint = 'rollo_sin_metros';
  end if;
  return jsonb_build_object(
    'nombre', v_nombre, 'tipo', v_tipo, 'tejido_id', v_tejido, 'composicion', v_comp, 'merma_pct', v_merma,
    'unidad_medida', v_unidad, 'unidad_compra', v_compra, 'ancho_cm', v_ancho, 'gramaje_gm2', v_gram, 'metros_por_rollo', v_mrollo,
    'clase_id', v_clase, 'medida_valor', v_medida, 'medida_unidad', v_mu
  );
end;
$f$;
revoke all on function retail.fn_material_leer(jsonb, text, text) from public, anon, authenticated;

-- ---------- 7. Lo que se entrega a la pantalla ----------
create or replace function retail.fn_material_como_json(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $f$
  select jsonb_build_object(
    'material', jsonb_build_object(
      'id', m.id, 'codigo', m.codigo, 'nombre', m.nombre, 'tipo', m.tipo, 'tejido_id', m.tejido_id, 'composicion', m.composicion, 'unidad_medida', m.unidad_medida,
      'merma_pct', m.merma_pct, 'unidad_compra', m.unidad_compra, 'ancho_cm', m.ancho_cm, 'gramaje_gm2', m.gramaje_gm2, 'metros_por_rollo', m.metros_por_rollo,
      'clase_id', m.clase_id, 'medida_valor', m.medida_valor, 'medida_unidad', m.medida_unidad,
      'nombre_largo', m.nombre || coalesce(' ' || retail.fn_medida_texto(m.medida_valor, m.medida_unidad), ''),
      'created_at', m.created_at, 'updated_at', m.updated_at, 'archivado_at', m.archivado_at),
    'insumos', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'codigo', i.codigo, 'nombre', i.nombre, 'color_codigo', i.color_codigo, 'stock_minimo', i.stock_minimo) order by i.created_at, i.codigo)
                          from retail.insumos i where i.material_id = m.id), '[]'::jsonb))
    from retail.materiales m where m.id = p_id;
$f$;
revoke all on function retail.fn_material_como_json(uuid) from public, anon, authenticated;

-- ---------- 8. Un avío lo crea quien opera el Taller ----------
-- Felipe, 2026-10-30 (decisión 3): «quien tiene la caja de botones en la mano la registra». Se retira el candado `avio_sin_lider` de las dos funciones que lo tenían. Lo que NO cambia:
-- el saldo inicial con su costo sigue siendo del líder (`saldo_sin_lider`, más abajo en `fn_material_agregar_colores`) y editar una ficha también (`editar_material`).
create or replace function retail.fn_material_agregar_colores(p_material_id uuid, p_ubicacion_id uuid, p_colores jsonb, p_token uuid)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $f$
declare
  m retail.materiales%rowtype;
  v_c jsonb;
  v_color text;
  v_min numeric;
  v_cant numeric;
  v_costo numeric;
  v_nota text;
  v_insumo uuid;
  v_existia boolean;
  v_token uuid;
  v_codigo text;
  v_ocupa record;
begin
  select * into m from retail.materiales where id = p_material_id;
  if not found then
    raise exception 'Esa ficha ya no existe. Actualiza la pantalla.' using hint = 'material_no_existe';
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p_colores, '[]'::jsonb)) e group by coalesce(nullif(btrim(e ->> 'color_codigo'), ''), '') having count(*) > 1) then
    raise exception 'Un color va una sola vez en la ficha.' using hint = 'color_repetido';
  end if;
  for v_c in select e from jsonb_array_elements(coalesce(p_colores, '[]'::jsonb)) e loop
    if jsonb_typeof(v_c) is distinct from 'object' then
      raise exception 'Cada color se manda como un objeto con su código.' using hint = 'color_ilegible';
    end if;
    v_color := nullif(btrim(v_c ->> 'color_codigo'), '');
    begin
      v_min := nullif(btrim(coalesce(v_c ->> 'stock_minimo', '')), '')::numeric;
      v_cant := nullif(btrim(coalesce(v_c -> 'saldo_inicial' ->> 'cantidad', '')), '')::numeric;
      v_costo := nullif(btrim(coalesce(v_c -> 'saldo_inicial' ->> 'costo_total', '')), '')::numeric;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Los números del color «%» no se entienden: revisa el mínimo, la cantidad y el costo.', coalesce(v_color, '(sin color)') using hint = 'numero_ilegible';
    end;
    if jsonb_exists(v_c, 'saldo_inicial') and jsonb_typeof(v_c -> 'saldo_inicial') not in ('object', 'null') then
      raise exception 'El saldo inicial del color «%» se manda como un objeto con su cantidad y su costo.', coalesce(v_color, '(sin color)') using hint = 'saldo_ilegible';
    end if;
    if v_cant is not null and not (v_cant > 0) then
      raise exception 'La cantidad del saldo inicial de «%» tiene que ser mayor que cero (déjala vacía si todavía no llegó nada).', coalesce(v_color, '(sin color)') using hint = 'saldo_ilegible';
    end if;
    v_nota := nullif(btrim(coalesce(v_c -> 'saldo_inicial' ->> 'nota', '')), '');
    v_token := case when p_token is null then null else md5(p_token::text || ':' || p_material_id::text || ':' || coalesce(v_color, ''))::uuid end;

    v_insumo := null;
    for v_insumo in select i.id from retail.insumos i where i.material_id = p_material_id and coalesce(i.color_codigo, '') = coalesce(v_color, '') loop
      exit;
    end loop;
    v_existia := v_insumo is not null;
    if not v_existia then
      if v_color is not null and not exists (select 1 from retail.colores c where c.codigo = v_color and c.activo) then
        raise exception 'El color «%» no existe o está desactivado.', v_color using hint = 'color_inactivo';
      end if;
      v_codigo := m.codigo || coalesce('-' || v_color, '');
      for v_ocupa in select i.codigo, i.nombre from retail.insumos i where retail.fn_clave_texto(i.codigo) = retail.fn_clave_texto(v_codigo) loop
        raise exception 'El código % ya lo usa otro insumo («%»): conviértelo en un color de esta ficha (avisa al líder) o cámbiale el código antes de agregar este color.', v_ocupa.codigo, v_ocupa.nombre using hint = 'codigo_ocupado';
      end loop;
      insert into retail.insumos (codigo, nombre, tipo, unidad_medida, material_id, color_codigo, stock_minimo)
      values (m.codigo, m.nombre, m.tipo, m.unidad_medida, p_material_id, v_color, v_min)
      returning id into v_insumo;
    end if;

    if v_cant is not null and v_cant > 0 then
      if not retail.fn_es_lider() then
        raise exception 'El saldo inicial, con su costo, lo anota el líder.' using errcode = '42501', hint = 'saldo_sin_lider';
      end if;
      if v_costo is null then
        raise exception 'El saldo inicial necesita su costo (escribe 0 si no lo sabes).' using hint = 'saldo_sin_costo';
      end if;
      if v_token is not null and exists (select 1 from retail.insumo_lotes l where l.token_cliente = v_token and l.insumo_id = v_insumo) then
        continue;
      end if;
      if v_existia then
        raise exception 'El color «%» ya estaba: lo que llegó se anota en «Ingresar insumo», no como saldo inicial.', coalesce(v_color, '(sin color)') using hint = 'color_ya_existe_con_saldo';
      end if;
      perform retail.recibir_insumo(p_insumo_id => v_insumo, p_ubicacion_id => p_ubicacion_id, p_cantidad => v_cant, p_costo_total => v_costo, p_origen => 'saldo_inicial', p_nota => v_nota, p_token => v_token);
    end if;
  end loop;
end;
$f$;
revoke all on function retail.fn_material_agregar_colores(uuid, uuid, jsonb, uuid) from public, anon, authenticated;


create or replace function retail.crear_material(p_ubicacion_id uuid, p_material jsonb, p_colores jsonb default '[]'::jsonb, p_token uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $f$
declare
  v_id uuid;
  v_d jsonb;
  v_nombre text;
  v_tipo text;
  v_medida numeric;
  v_mu text;
  v_existente record;
  v_suelto record;
  v_codigo text;
  v_actor uuid;
  v_n integer;
  v_que text;
begin
  perform retail.fn_produccion_exigir_operar(p_ubicacion_id);
  perform retail.fn_material_exigir_taller(p_ubicacion_id);
  if jsonb_typeof(p_material) is distinct from 'object' then
    raise exception 'Faltan los datos de la ficha.' using hint = 'material_ilegible';
  end if;
  if jsonb_typeof(coalesce(p_colores, '[]'::jsonb)) is distinct from 'array' then
    raise exception 'Los colores se mandan como una lista.' using hint = 'color_ilegible';
  end if;
  perform retail.fn_intento_con_huella('crear_material', p_token, md5(row(p_ubicacion_id, p_material, p_colores)::text));
  if p_token is not null then
    perform pg_advisory_xact_lock(hashtextextended('materiales:' || p_token::text, 0));
    for v_id in select m.id from retail.materiales m where m.token_cliente = p_token loop
      return retail.fn_material_como_json(v_id);
    end loop;
  end if;

  v_d := retail.fn_material_leer(p_material);
  v_nombre := v_d ->> 'nombre';
  v_tipo := v_d ->> 'tipo';
  v_medida := (v_d ->> 'medida_valor')::numeric;
  v_mu := v_d ->> 'medida_unidad';
  v_que := case when v_tipo = 'avio' then 'el avío' else 'la tela' end;
  v_actor := retail.fn_actor_persona_id(true);

  -- Dos personas creando la misma ficha a la vez: la segunda espera, ve que ya existe y recibe el aviso (no un error de índice). La medida entra en la llave: «Botón nácar 18 L» y
  -- «Botón nácar 20 L» son dos fichas a propósito. La medida va por `trim_scale`: `11.4` y `11.40` son el MISMO numeric para el índice, pero `::text` da dos cadenas distintas, así que
  -- sin normalizar las dos personas tomarían candados distintos y la segunda recibiría el 23505 crudo del índice en vez del aviso en castellano.
  -- Y una TELA (sin medida) conserva la llave EXACTA de antes, sin el «:» de más: `fn_materializar_insumos_sueltos` (20261028203000:696) sigue con la llave vieja y promete por escrito
  -- que el conversor «no se cruza con quien está creando o corrigiendo esa tela». Con el `case` las dos llaves siguen siendo la misma y esa promesa se mantiene sin tocar al conversor.
  perform pg_advisory_xact_lock(hashtextextended('materiales:nombre:' || v_tipo || ':' || coalesce(retail.fn_clave_texto(v_nombre), '') || case when v_medida is null and v_mu is null then '' else ':' || coalesce(trim_scale(v_medida)::text, '') || coalesce(v_mu, '') end, 0));
  for v_existente in select m.id, m.codigo, m.nombre, m.medida_valor, m.medida_unidad from retail.materiales m
    where retail.fn_clave_texto(m.nombre) = retail.fn_clave_texto(v_nombre) and m.tipo = v_tipo
      and m.medida_valor is not distinct from v_medida and m.medida_unidad is not distinct from v_mu loop
    raise exception 'Ya existe «%» (%): agrégale los colores que faltan a esa.',
      v_existente.nombre || coalesce(' ' || retail.fn_medida_texto(v_existente.medida_valor, v_existente.medida_unidad), ''), v_existente.codigo
      using hint = 'material_ya_existe', detail = v_existente.id::text;
  end loop;
  for v_suelto in select i.codigo, i.nombre from retail.insumos i where i.material_id is null and i.archivado_at is null and i.tipo = v_tipo and retail.fn_clave_texto(i.nombre) = retail.fn_clave_texto(v_nombre) loop
    raise exception 'Ya hay un insumo suelto con ese nombre (%): primero se convierte en ficha, para no duplicar su stock. Avisa al líder.', v_suelto.codigo using hint = 'insumo_suelto_igual';
  end loop;

  v_codigo := retail.fn_codigo_de_material(v_nombre, v_tipo, nullif(v_d ->> 'clase_id', '')::uuid);
  insert into retail.materiales (codigo, nombre, tipo, tejido_id, composicion, unidad_medida, merma_pct, unidad_compra, ancho_cm, gramaje_gm2, metros_por_rollo,
                                 clase_id, medida_valor, medida_unidad, token_cliente, creado_por)
  values (v_codigo, v_nombre, v_tipo, nullif(v_d ->> 'tejido_id', '')::uuid, v_d ->> 'composicion', v_d ->> 'unidad_medida', (v_d ->> 'merma_pct')::numeric, v_d ->> 'unidad_compra',
          (v_d ->> 'ancho_cm')::numeric, (v_d ->> 'gramaje_gm2')::numeric, (v_d ->> 'metros_por_rollo')::numeric,
          nullif(v_d ->> 'clase_id', '')::uuid, v_medida, v_mu, p_token, v_actor)
  returning id into v_id;

  perform retail.fn_material_agregar_colores(v_id, p_ubicacion_id, p_colores, p_token);
  v_n := (select count(*)::integer from retail.insumos i where i.material_id = v_id);
  perform retail.fn_material_anotar(case when v_tipo = 'avio' then 'avio_creado' else 'tela_creada' end,
    'creó ' || v_que || ' «' || v_nombre || coalesce(' ' || retail.fn_medida_texto(v_medida, v_mu), '') || '» (' || v_codigo || ')'
      || case when v_n > 0 then ' con ' || v_n || case when v_n = 1 then ' color' else ' colores' end else '' end,
    v_actor, p_ubicacion_id, v_id, jsonb_build_object('material_id', v_id, 'codigo', v_codigo, 'tipo', v_tipo, 'colores', v_n));
  return retail.fn_material_como_json(v_id);
end;
$f$;
revoke all on function retail.crear_material(uuid, jsonb, jsonb, uuid) from public, anon;
grant execute on function retail.crear_material(uuid, jsonb, jsonb, uuid) to authenticated;
comment on function retail.crear_material(uuid, jsonb, jsonb, uuid) is
  'ADR-0554/ADR-0580: crea la ficha (tela o avío) y sus colores, todo o nada. La crea quien opera el Taller; el saldo inicial con su costo, solo el líder.';

-- ---------- 9. Editar: la clase y la medida también se corrigen ----------
create or replace function retail.editar_material(p_material_id uuid, p_ubicacion_id uuid, p_material jsonb)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $f$
declare
  m retail.materiales%rowtype;
  v_actor uuid;
  v_version timestamptz;
  v_d jsonb;
  v_existente record;
  v_suelto record;
  v_cambios text[] := '{}';
  v_antes jsonb := '{}'::jsonb;
  v_despues jsonb := '{}'::jsonb;
  v_colores integer;
  v_viejo text;
  v_nuevo text;
  v_medida numeric;
  v_mu text;
  v_que text;
begin
  perform retail.fn_produccion_exigir_operar(p_ubicacion_id);
  perform retail.fn_material_exigir_taller(p_ubicacion_id);
  if jsonb_typeof(p_material) is distinct from 'object' then
    raise exception 'Faltan los datos de la ficha.' using hint = 'material_ilegible';
  end if;
  -- La ficha se lee ANTES de exigir líder: así los mensajes dicen «la tela» o «el avío», no una palabra de sistema. Quien no es líder solo alcanza a tomar un candado que su propia
  -- transacción suelta al rechazarse.
  perform pg_advisory_xact_lock(hashtextextended('materiales:colores:' || p_material_id::text, 0));
  select * into m from retail.materiales where id = p_material_id for update;
  if not found then
    raise exception 'Esa ficha ya no existe. Actualiza la pantalla.' using hint = 'material_no_existe';
  end if;
  v_que := case when m.tipo = 'avio' then 'el avío' else 'la tela' end;
  if not retail.fn_es_lider() then
    raise exception 'Corregir % es del líder.', v_que using errcode = '42501', hint = 'editar_material_sin_lider';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién guarda esto' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  begin
    v_version := nullif(btrim(coalesce(p_material ->> 'version', '')), '')::timestamptz;
  exception when others then
    v_version := null;
  end;
  if v_version is distinct from m.updated_at then
    raise exception 'Otra persona cambió % mientras tanto. Actualiza la pantalla para ver sus cambios.', v_que using errcode = 'PT409', hint = 'version_cambiada';
  end if;
  -- Lo que la hoja no manda queda como está; un null explícito sí lo borra.
  v_d := retail.fn_material_leer(
    jsonb_build_object('nombre', m.nombre, 'tejido_id', m.tejido_id, 'composicion', m.composicion, 'merma_pct', m.merma_pct, 'unidad_compra', m.unidad_compra,
                       'ancho_cm', m.ancho_cm, 'gramaje_gm2', m.gramaje_gm2, 'metros_por_rollo', m.metros_por_rollo,
                       'clase_id', m.clase_id, 'medida_valor', m.medida_valor, 'medida_unidad', m.medida_unidad) || (p_material - 'version'),
    m.tipo, m.unidad_medida);
  v_medida := (v_d ->> 'medida_valor')::numeric;
  v_mu := v_d ->> 'medida_unidad';
  if retail.fn_clave_texto(v_d ->> 'nombre') is distinct from retail.fn_clave_texto(m.nombre)
     or v_medida is distinct from m.medida_valor or v_mu is distinct from m.medida_unidad then
    perform pg_advisory_xact_lock(hashtextextended('materiales:nombre:' || m.tipo || ':' || coalesce(retail.fn_clave_texto(v_d ->> 'nombre'), '') || case when v_medida is null and v_mu is null then '' else ':' || coalesce(trim_scale(v_medida)::text, '') || coalesce(v_mu, '') end, 0));
    for v_existente in select x.codigo, x.nombre, x.id from retail.materiales x
      where x.id <> m.id and x.tipo = m.tipo and retail.fn_clave_texto(x.nombre) = retail.fn_clave_texto(v_d ->> 'nombre')
        and x.medida_valor is not distinct from v_medida and x.medida_unidad is not distinct from v_mu loop
      raise exception 'Ya existe «%» (%): ponle otro nombre o corrige su medida.', v_existente.nombre, v_existente.codigo using hint = 'material_ya_existe', detail = v_existente.id::text;
    end loop;
    for v_suelto in select i.codigo from retail.insumos i where i.material_id is null and i.archivado_at is null and i.tipo = m.tipo and retail.fn_clave_texto(i.nombre) = retail.fn_clave_texto(v_d ->> 'nombre') loop
      raise exception 'Ya hay un insumo suelto con ese nombre (%): primero se convierte en ficha, para no duplicar su stock. Avisa al líder.', v_suelto.codigo using hint = 'insumo_suelto_igual';
    end loop;
  end if;
  if (v_d ->> 'nombre') is distinct from m.nombre then
    v_cambios := array_append(v_cambios, 'nombre «' || m.nombre || '» → «' || (v_d ->> 'nombre') || '»');
    v_antes := v_antes || jsonb_build_object('nombre', m.nombre);
    v_despues := v_despues || jsonb_build_object('nombre', v_d ->> 'nombre');
  end if;
  if v_medida is distinct from m.medida_valor or v_mu is distinct from m.medida_unidad then
    v_viejo := coalesce(retail.fn_medida_texto(m.medida_valor, m.medida_unidad), '(ninguna)');
    v_nuevo := coalesce(retail.fn_medida_texto(v_medida, v_mu), '(ninguna)');
    v_cambios := array_append(v_cambios, 'medida ' || v_viejo || ' → ' || v_nuevo);
    v_antes := v_antes || jsonb_build_object('medida', v_viejo);
    v_despues := v_despues || jsonb_build_object('medida', v_nuevo);
  end if;
  if nullif(v_d ->> 'clase_id', '')::uuid is distinct from m.clase_id then
    v_viejo := coalesce((select c.nombre from retail.avio_clases c where c.id = m.clase_id), '(ninguna)');
    v_nuevo := coalesce((select c.nombre from retail.avio_clases c where c.id = nullif(v_d ->> 'clase_id', '')::uuid), '(ninguna)');
    v_cambios := array_append(v_cambios, 'clase ' || v_viejo || ' → ' || v_nuevo);
    v_antes := v_antes || jsonb_build_object('clase', v_viejo);
    v_despues := v_despues || jsonb_build_object('clase', v_nuevo);
  end if;
  if (v_d ->> 'merma_pct')::numeric is distinct from m.merma_pct then
    v_cambios := array_append(v_cambios, 'merma ' || trim_scale(round(m.merma_pct * 100, 2))::text || ' % → ' || trim_scale(round((v_d ->> 'merma_pct')::numeric * 100, 2))::text || ' %');
    v_antes := v_antes || jsonb_build_object('merma_pct', m.merma_pct);
    v_despues := v_despues || jsonb_build_object('merma_pct', (v_d ->> 'merma_pct')::numeric);
  end if;
  if nullif(v_d ->> 'tejido_id', '')::uuid is distinct from m.tejido_id then
    v_viejo := coalesce((select t.nombre from retail.tejidos t where t.id = m.tejido_id), '(ninguno)');
    v_nuevo := coalesce((select t.nombre from retail.tejidos t where t.id = nullif(v_d ->> 'tejido_id', '')::uuid), '(ninguno)');
    v_cambios := array_append(v_cambios, 'tejido ' || v_viejo || ' → ' || v_nuevo);
    v_antes := v_antes || jsonb_build_object('tejido', v_viejo);
    v_despues := v_despues || jsonb_build_object('tejido', v_nuevo);
  end if;
  if (v_d ->> 'composicion') is distinct from m.composicion then
    v_cambios := array_append(v_cambios, 'composición');
    v_antes := v_antes || jsonb_build_object('composicion', coalesce(m.composicion, '(vacía)'));
    v_despues := v_despues || jsonb_build_object('composicion', coalesce(v_d ->> 'composicion', '(vacía)'));
  end if;
  if (v_d ->> 'unidad_compra') is distinct from m.unidad_compra then
    v_cambios := array_append(v_cambios, 'se compra por ' || m.unidad_compra || ' → ' || (v_d ->> 'unidad_compra'));
    v_antes := v_antes || jsonb_build_object('unidad_compra', m.unidad_compra);
    v_despues := v_despues || jsonb_build_object('unidad_compra', v_d ->> 'unidad_compra');
  end if;
  if (v_d ->> 'ancho_cm')::numeric is distinct from m.ancho_cm or (v_d ->> 'gramaje_gm2')::numeric is distinct from m.gramaje_gm2 or (v_d ->> 'metros_por_rollo')::numeric is distinct from m.metros_por_rollo then
    v_cambios := array_append(v_cambios, 'medidas de compra');
    v_antes := v_antes || jsonb_build_object('ancho_cm', m.ancho_cm, 'gramaje_gm2', m.gramaje_gm2, 'metros_por_rollo', m.metros_por_rollo);
    v_despues := v_despues || jsonb_build_object('ancho_cm', (v_d ->> 'ancho_cm')::numeric, 'gramaje_gm2', (v_d ->> 'gramaje_gm2')::numeric, 'metros_por_rollo', (v_d ->> 'metros_por_rollo')::numeric);
  end if;
  update retail.materiales set
    nombre = v_d ->> 'nombre',
    tejido_id = nullif(v_d ->> 'tejido_id', '')::uuid,
    composicion = v_d ->> 'composicion',
    merma_pct = (v_d ->> 'merma_pct')::numeric,
    unidad_compra = v_d ->> 'unidad_compra',
    ancho_cm = (v_d ->> 'ancho_cm')::numeric,
    gramaje_gm2 = (v_d ->> 'gramaje_gm2')::numeric,
    metros_por_rollo = (v_d ->> 'metros_por_rollo')::numeric,
    clase_id = nullif(v_d ->> 'clase_id', '')::uuid,
    medida_valor = v_medida,
    medida_unidad = v_mu
   where id = m.id;
  v_colores := (select count(*)::integer from retail.insumos i where i.material_id = m.id);
  if cardinality(v_cambios) > 0 then
    perform retail.fn_material_anotar(case when m.tipo = 'avio' then 'avio_editado' else 'tela_editada' end,
      'corrigió ' || v_que || ' «' || (v_d ->> 'nombre') || '» (' || m.codigo || '): ' || array_to_string(v_cambios, ', ')
        || case when v_colores > 0 then ' · les llega a ' || v_colores || case when v_colores = 1 then ' color' else ' colores' end else '' end,
      v_actor, p_ubicacion_id, m.id, jsonb_build_object('material_id', m.id, 'codigo', m.codigo, 'colores', v_colores, 'antes', v_antes, 'despues', v_despues));
  end if;
  return retail.fn_material_como_json(m.id);
end;
$f$;
revoke all on function retail.editar_material(uuid, uuid, jsonb) from public, anon;
grant execute on function retail.editar_material(uuid, uuid, jsonb) to authenticated;
comment on function retail.editar_material(uuid, uuid, jsonb) is
  'ADR-0554/ADR-0580: corrige una ficha de Insumos (nombre, clase, medida, tejido, composición, merma, cómo se compra); sus colores la siguen en la misma transacción. Solo el líder. El tipo y la unidad no se cambian.';

-- ---------- 9 bis. «Agregar colores» habla del avío, y con su medida ----------
-- La dejó `20261028203000` cuando sólo había telas: decía «le sumó 2 colores a la TELA «Botón nácar» (BOT-01)» y leía `materiales.nombre` pelado, sin la medida. Es la puerta que usa la hoja
-- nueva para sumarle colores a un avío ya creado (`NuevoAvioModal`), así que sin esto el PROMETE de este archivo —«el nombre que se lee en todo el ERP lo arma la base»— se incumple justo ahí.
-- Lo único que cambia es el TEXTO que se lee; los permisos y lo que hace son los mismos (sigue delegando en `fn_material_agregar_colores`).
create or replace function retail.agregar_colores_a_material(p_material_id uuid, p_ubicacion_id uuid, p_colores jsonb, p_token uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $f$
declare
  v_actor uuid;
  v_antes integer;
  v_despues integer;
  v_codigo text;
  v_nombre text;
  v_tipo text;
  v_medida text;
  v_que text;
begin
  perform retail.fn_produccion_exigir_operar(p_ubicacion_id);
  perform retail.fn_material_exigir_taller(p_ubicacion_id);
  if jsonb_typeof(coalesce(p_colores, '[]'::jsonb)) is distinct from 'array' then
    raise exception 'Los colores se mandan como una lista.' using hint = 'color_ilegible';
  end if;
  perform retail.fn_intento_con_huella('agregar_colores_a_material', p_token, md5(row(p_material_id, p_ubicacion_id, p_colores)::text));
  if not exists (select 1 from retail.materiales m where m.id = p_material_id and m.archivado_at is null) then
    raise exception 'Esa ficha ya no existe. Actualiza la pantalla.' using hint = 'material_no_existe';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  -- Dos personas sumando colores (o editando) la misma ficha a la vez: una a una.
  perform pg_advisory_xact_lock(hashtextextended('materiales:colores:' || p_material_id::text, 0));
  v_antes := (select count(*)::integer from retail.insumos i where i.material_id = p_material_id);
  perform retail.fn_material_agregar_colores(p_material_id, p_ubicacion_id, p_colores, p_token);
  v_despues := (select count(*)::integer from retail.insumos i where i.material_id = p_material_id);
  -- Un reintento (el mismo token) no suma nada y no anota otra vez.
  if v_despues > v_antes then
    for v_codigo, v_nombre, v_tipo, v_medida in
      select m.codigo, m.nombre, m.tipo, retail.fn_medida_texto(m.medida_valor, m.medida_unidad) from retail.materiales m where m.id = p_material_id loop
      exit;
    end loop;
    v_que := case when v_tipo = 'avio' then 'el avío' else 'la tela' end;
    perform retail.fn_material_anotar('colores_agregados',
      'le sumó ' || (v_despues - v_antes) || case when v_despues - v_antes = 1 then ' color' else ' colores' end
        || ' a ' || v_que || ' «' || v_nombre || coalesce(' ' || v_medida, '') || '» (' || v_codigo || ')',
      v_actor, p_ubicacion_id, p_material_id, jsonb_build_object('material_id', p_material_id, 'codigo', v_codigo, 'tipo', v_tipo, 'colores_nuevos', v_despues - v_antes));
  end if;
  return retail.fn_material_como_json(p_material_id);
end;
$f$;
revoke all on function retail.agregar_colores_a_material(uuid, uuid, jsonb, uuid) from public, anon;
grant execute on function retail.agregar_colores_a_material(uuid, uuid, jsonb, uuid) to authenticated;

-- ============================ FIN DE LA PARTE 1 ============================

-- ---------- 10. La política de `avio_clases` (sola y al final — ADR-0195) ----------
set lock_timeout = '3s';

-- Mismo molde que `tejidos` (`20260917100100`): con sesión se lee y se crea una clase (nace activa, ADR-0534: «lo cree quien lo cree»); corregirla o desactivarla es del líder.
drop policy if exists avio_clases_select on retail.avio_clases;
create policy avio_clases_select on retail.avio_clases for select using (auth.role() = 'authenticated');
drop policy if exists avio_clases_insert_autenticado on retail.avio_clases;
create policy avio_clases_insert_autenticado on retail.avio_clases for insert with check (auth.role() = 'authenticated');
drop policy if exists avio_clases_update_lider on retail.avio_clases;
create policy avio_clases_update_lider on retail.avio_clases for update using (retail.fn_es_lider()) with check (retail.fn_es_lider());

grant select, insert, update on retail.avio_clases to authenticated;
