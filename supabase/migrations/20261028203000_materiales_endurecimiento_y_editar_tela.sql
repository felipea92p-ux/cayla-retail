-- ============================================================================
-- 20261028203000_materiales_endurecimiento_y_editar_tela.sql — CAYLA V2 (ADR-0554, actividad 3 · 2026-10-28)
--
-- EL PROBLEMA PRIMERO. La PARTE 1 de `20261028175000` ya está en producción (28-oct: `fn_materializar_insumos_sueltos` devolvió 1 y el insumo `MM-01` pasó a ser la tela `MM-01` con su color
-- Arena). Una revisión adversarial de 7 lentes (67 agentes, 30 hallazgos confirmados, ninguno refutado) encontró lo que esa migración dejó flojo, y lo más grave es esto: UNA TELA YA CREADA NO SE
-- PUEDE CORREGIR. El disparador de copias rechaza cambiar el tejido o la merma de un color («son de la tela») y `editar_material` no existía; la «Ficha» de la web vieja falla con él y la web nueva la
-- esconde. Además el conversor aborta entero si UN insumo suelto choca, los lotes con token podían perder un saldo en silencio, y un ancho escrito en metros («1.60») inflaba el saldo ×100.
-- Esta migración NO toca lo ya pegado: cada arreglo es `create or replace` (o un candado nuevo) sobre las mismas firmas, y el archivo `20261028175000` queda como está.
--
-- QUÉ HACE (una sola parte, sin políticas — ADR-0195)
--   1. Medidas con sentido: `materiales_medidas_plausibles` (ancho 20–400 cm, gramaje 30–1500 g/m²) y el kilo pide ancho y gramaje solo para una TELA (un avío a peso no tiene ancho).
--   2. `editar_material(tela, taller, datos)`: corrige nombre, tejido, composición, merma y cómo se compra; los colores siguen a su tela en la misma transacción (`materiales_propaga_a_colores`).
--      El disparador de copias compara contra lo que el UPDATE CAMBIA (no solo contra la tela): un color desfasado se cura en vez de bloquearse. Editar es del LÍDER (como era la ficha de un insumo),
--      firma con el responsable, deja su línea en «Actividad» con el valor de antes y el de después, y rechaza una hoja vieja (`version_cambiada`: otra persona guardó mientras esta estaba abierta).
--      Lo que la hoja no manda queda como está (una llamada con solo el nombre no borra la merma ni el tejido).
--   3. `fn_material_leer`: UNA sola lectura y validación de los datos de una tela, que usan `crear_material` y `editar_material` (antes vivía dentro de `crear_material`).
--   4. Candado de unidad completo: un insumo con historia no cambia de tipo ni de unidad ni por la puerta de «colgarlo de una tela» (`insumo_otra_unidad`; el disparador, ahora sin lista de columnas, vive en 20261028172000).
--   5. `fn_material_agregar_colores`: un color va una vez en la lista; el token incluye la tela; el color inexistente solo se exige al CREAR; el código derivado ocupado por otro insumo se dice.
--   6. `crear_material` y `agregar_colores_a_material`: solo en un Taller activo; un avío lo crea el líder (también al sumarle colores); una tela con el nombre de un insumo suelto avisa; un saldo
--      inicial de cero o mal formado se rechaza en vez de descartarse; las dos dejan su línea en «Actividad» (quién, qué tela, cuántos colores; sin cifras de dinero).
--   7. `fn_codigo_de_material`: el correlativo no se recorta al llegar a 100. `fn_material_como_json`: lista de columnas, no «todo menos…».
--   8. `fn_materializar_insumos_sueltos(aplicar)`: ya no aborta. Por defecto ENSAYA (devuelve qué haría y no escribe; un NULL también ensaya); con `true` aplica. Agrupa los sueltos de una misma tela,
--      adopta a la tela que ya existe, quita el « · Color» que se le agrega al mostrarlo, deja suelto —diciendo por qué— lo que no puede (también un suelto cuya merma o tejido no son los de la
--      tela: la copia se los cambiaría sin avisar), dice en el ensayo lo que cambiaría al adoptar, toma los mismos candados que «agregar colores» y «editar», y no toca avíos ni archivados.
--
-- PROMETE: editar una tela deja a todos sus colores con el mismo nombre, tejido y merma, todo o nada; un color nunca cambia de tipo ni de unidad si ya se usó; ningún saldo se pierde en silencio por un
--   token; el conversor nunca deja un insumo a medias.
-- ASUME:   `20261028172000` (los candados de unidad) y `20261028175000` (PARTE 1 y PARTE 2) ya están aplicadas: sin 172000 esta migración se detiene al principio con un mensaje claro y no cambia
--   nada. Se pega entera, en una sola pegada, y se puede repetir. Lo que NO se puede repetir después de esta es la PARTE 1 de 175000 (volvería a poner seis funciones en su versión anterior):
--   por eso esa parte se detiene sola si esta ya está.
-- NO HACE: no archiva telas (decisión pendiente de Felipe), no deja a un colaborador editar una tela, no toca `recibir_insumo` (otra puerta de lotes: queda fuera de esta migración), no
--   agrega la conversión kilo → metro en «Llegó tela» (act. 4).
--
-- DECIDÍ: editar la tela por una función que escribe `materiales` y deja que un disparador AFTER UPDATE vuelva a escribir sus colores (el BEFORE de cada color recalcula nombre y código). DESCARTÉ que la web
--   actualice cada color uno por uno (N escrituras, y un corte a la mitad dejaba colores con otro tejido que su tela) y DESCARTÉ relajar el candado de «el tejido es de la tela» (la copia es lo que permite que
--   las ~40 funciones de Producción y Compras sigan leyendo `insumos.tejido_id`). DESCARTÉ también un conversor que aborta con un mensaje (el de 175000): una fila rara bloqueaba las demás.
-- SE ROMPE SI: alguien agrega un campo de la tela que los colores copian y no lo suma a `fn_insumos_copias_de_la_tela` y al disparador de propagación; o si se renombra un color en Catálogo (la copia del
--   nombre de cada insumo no se entera hasta que alguien guarde esa fila: `update retail.insumos set material_id = material_id where material_id is not null;` las pone al día todas).
--   Dos personas que editan la misma tela ya no se pisan: la segunda recibe «Otra persona cambió esta tela».
--
-- PRODUCCIÓN. Una sola pegada (sin políticas, sin `drop trigger`: solo `create or replace`), DESPUÉS de 20261028172000. Antes de pegar, el respaldo de la tela y sus colores (ver ADR-0554, «Si hay que volver atrás»).
--   Después de publicar la web nueva: `select * from retail.fn_materializar_insumos_sueltos();` (ensayo) y, si el informe es lo que se espera, `select * from retail.fn_materializar_insumos_sueltos(true);`.
--   Dentro de los textos no hay ningún `select … into` (ADR-0288). Prueba: `pnpm pruebas:materiales`.
-- ============================================================================

set lock_timeout = '3s';

-- ---------- 0. Antes de tocar nada ----------
-- Esta migración usa la función de `20261028172000` (los candados de unidad): sin ella el pegado fallaría a la mitad con un error de Postgres. Se dice claro y no cambia nada.
do $f$
begin
  if to_regprocedure('retail.fn_insumos_unidad_firme()') is null then
    raise exception 'Primero pega 20261028172000 (los candados de unidad): esta migración la necesita. No se cambió nada.' using hint = 'falta_172000';
  end if;
end
$f$;

-- ---------- 1. Medidas con sentido ----------
do $f$
begin
  if not exists (select 1 from pg_constraint where conname = 'materiales_medidas_plausibles' and conrelid = 'retail.materiales'::regclass) then
    -- `numeric` admite NaN e Infinity: NaN es MAYOR que cualquier número, así que `between` también los deja fuera.
    alter table retail.materiales add constraint materiales_medidas_plausibles check (
      (ancho_cm is null or ancho_cm between 20 and 400) and (gramaje_gm2 is null or gramaje_gm2 between 30 and 1500)
    );
  end if;
  -- El kilo pide ancho y gramaje solo para una TELA: con ellos se pasan los kilos a metros. Un avío a peso (relleno, hilo) no tiene ancho.
  if exists (select 1 from pg_constraint where conname = 'materiales_kilo_pide_ancho_y_gramaje' and conrelid = 'retail.materiales'::regclass and pg_get_constraintdef(oid) not like '%avio%') then
    alter table retail.materiales drop constraint materiales_kilo_pide_ancho_y_gramaje;
    alter table retail.materiales add constraint materiales_kilo_pide_ancho_y_gramaje check (tipo = 'avio' or unidad_compra <> 'kilo' or (ancho_cm is not null and gramaje_gm2 is not null));
  end if;
end
$f$;
comment on constraint materiales_medidas_plausibles on retail.materiales is
  'ADR-0554 (revisión 28-oct): el ancho va en centímetros (20–400) y el gramaje en g/m² (30–1500). Un «1.60» escrito en metros inflaba el saldo de una tela por kilo ×100.';

-- Que la web siga leyendo las telas aunque alguien vuelva a pegar la PARTE 1 de 175000 (su `revoke all` quitaba este permiso). Con RLS y la política de la PARTE 2 es lo mismo que ya había.
grant select on retail.materiales to authenticated;

-- ---------- 2. Piezas internas ----------
-- Solo se anota en un Taller activo (las funciones hermanas de Producción ya lo exigen).
create or replace function retail.fn_material_exigir_taller(p_ubicacion_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $f$
begin
  if not exists (select 1 from retail.ubicaciones u where u.id = p_ubicacion_id and u.tipo = 'taller' and u.activo) then
    raise exception 'Las telas y sus colores se anotan en un Taller.' using hint = 'material_sin_taller';
  end if;
end;
$f$;
revoke all on function retail.fn_material_exigir_taller(uuid) from public, anon, authenticated;

-- Lee y valida los datos de una tela UNA sola vez: lo usan `crear_material` y `editar_material`. Devuelve el objeto limpio (nombre, tipo, tejido, composición, merma, unidad, compra y medidas).
-- `p_tipo_fijo` y `p_unidad_fija` son los de una tela que ya existe (no se cambian al editar).
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
begin
  if jsonb_typeof(p_material) is distinct from 'object' then
    raise exception 'Faltan los datos de la tela.' using hint = 'material_ilegible';
  end if;
  v_tipo := coalesce(p_tipo_fijo, nullif(btrim(p_material ->> 'tipo'), ''), 'tela');
  if v_tipo not in ('tela', 'avio') then
    raise exception 'El tipo es «tela» o «avio».' using hint = 'tipo_ilegible';
  end if;
  v_nombre := btrim(coalesce(p_material ->> 'nombre', ''));
  if v_nombre = '' or length(v_nombre) > 120 then
    raise exception 'Ponle a la tela un nombre de hasta 120 letras.' using hint = 'nombre_ilegible';
  end if;
  begin
    v_tejido := case when v_tipo = 'tela' then nullif(btrim(coalesce(p_material ->> 'tejido_id', '')), '')::uuid end;
    v_merma := coalesce(nullif(btrim(coalesce(p_material ->> 'merma_pct', '')), '')::numeric, 0);
    v_ancho := nullif(btrim(coalesce(p_material ->> 'ancho_cm', '')), '')::numeric;
    v_gram := nullif(btrim(coalesce(p_material ->> 'gramaje_gm2', '')), '')::numeric;
    v_mrollo := nullif(btrim(coalesce(p_material ->> 'metros_por_rollo', '')), '')::numeric;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Los números de la tela no se entienden: revisa el ancho, el gramaje, los metros por rollo y la merma.' using hint = 'numero_ilegible';
  end;
  if not (v_merma >= 0 and v_merma < 0.5) then
    raise exception 'La merma va de 0 %% a menos de 50 %%.' using hint = 'merma_ilegible';
  end if;
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
  else
    v_unidad := coalesce(p_unidad_fija, nullif(btrim(p_material ->> 'unidad_medida'), ''), 'unidad');
    if v_unidad not in ('metro', 'unidad', 'kilo', 'cono', 'par', 'docena') then
      raise exception 'La unidad del avío no es una de las conocidas.' using hint = 'unidad_ilegible';
    end if;
    v_compra := v_unidad;
  end if;
  -- Un ancho escrito en metros («1.60») o un gramaje de otro mundo pasaba y el saldo en kilos se inflaba ×100: se rechaza con la regla de la tabla y en castellano.
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
    'unidad_medida', v_unidad, 'unidad_compra', v_compra, 'ancho_cm', v_ancho, 'gramaje_gm2', v_gram, 'metros_por_rollo', v_mrollo
  );
end;
$f$;
revoke all on function retail.fn_material_leer(jsonb, text, text) from public, anon, authenticated;

-- La tela y sus colores, tal como los devuelven las funciones de alta. Lista de columnas (no «todo menos…»): una columna nueva de `materiales` no sale por la API sin que alguien lo decida.
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
      'created_at', m.created_at, 'updated_at', m.updated_at, 'archivado_at', m.archivado_at),
    'insumos', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'codigo', i.codigo, 'nombre', i.nombre, 'color_codigo', i.color_codigo, 'stock_minimo', i.stock_minimo) order by i.created_at, i.codigo)
                          from retail.insumos i where i.material_id = m.id), '[]'::jsonb))
    from retail.materiales m where m.id = p_id;
$f$;
revoke all on function retail.fn_material_como_json(uuid) from public, anon, authenticated;

-- ---------- 3. Las copias de la tela en cada color ----------
-- Ahora el disparador compara contra lo que el UPDATE CAMBIA: si el tejido o la merma del color ya estaban desfasados y el UPDATE no los toca (archivar un color, cambiarle el mínimo), se vuelven a copiar
-- de la tela en vez de bloquear. Rechaza solo el intento de poner OTRO tejido o OTRA merma en un color. Y colgar un insumo suelto de una tela exige que sean de la misma clase.
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
    -- Colgar un insumo suelto de una tela: solo si es de la misma clase (un avío con lotes no se vuelve tela, ni al revés). El tipo y la unidad de un color no se escriben: son los de su tela.
    if old.material_id is null and (old.tipo is distinct from m.tipo or old.unidad_medida is distinct from m.unidad_medida) then
      raise exception 'Este insumo es de otra clase que la tela (%, en %): no se le puede colgar de ella.', m.tipo, m.unidad_medida using errcode = '23514', hint = 'insumo_otra_unidad';
    end if;
    -- El tejido y la merma son de la TELA: no se cambian en un solo color. Lo que el UPDATE no toca (o ya coincide con la tela) pasa y se corrige abajo.
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
  new.nombre := m.nombre || coalesce(' · ' || v_color, '');
  new.codigo := m.codigo || coalesce('-' || new.color_codigo, '');
  return new;
end;
$f$;
revoke all on function retail.fn_insumos_copias_de_la_tela() from public, anon, authenticated;

-- (El disparador `insumos_unidad_firme`, sin lista de columnas, vive en `20261028172000`: así 203000 no toca la tabla de insumos y no se cruza con quien guarda un color.)

-- Cuando la tela cambia (nombre, código, tejido o merma), sus colores se ponen al día en la misma transacción: tocarlos basta, el BEFORE de cada color recalcula su nombre y su código.

create or replace function retail.fn_materiales_propagar_a_colores()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $f$
begin
  -- El mismo candado que «agregar colores» y «editar»: un UPDATE directo a la tela (el SQL de un líder) no se cruza con un color que se está sumando en ese instante.
  perform pg_advisory_xact_lock(hashtextextended('materiales:colores:' || new.id::text, 0));
  update retail.insumos set tejido_id = new.tejido_id, merma_pct = new.merma_pct where material_id = new.id;
  return null;
end;
$f$;
revoke all on function retail.fn_materiales_propagar_a_colores() from public, anon, authenticated;
create or replace trigger materiales_propaga_a_colores
  after update of nombre, codigo, tejido_id, merma_pct on retail.materiales
  for each row execute function retail.fn_materiales_propagar_a_colores();

-- ---------- 4. El código de la tela ----------
-- Igual que antes, pero el correlativo no se recorta al llegar a 100 (`lpad('100', 2, '0')` da '10': el código volvía a uno ya usado y la función fallaba siempre).
create or replace function retail.fn_codigo_de_material(p_nombre text, p_tipo text)
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
  v_p := upper(substr(regexp_replace(coalesce((string_to_array(retail.fn_clave_texto(p_nombre), ' '))[1], ''), '[^a-z]', '', 'g'), 1, 3));
  if length(v_p) < 2 then
    v_p := case when p_tipo = 'avio' then 'AVI' else 'TEL' end;
  end if;
  loop
    v_n := retail.fn_siguiente_correlativo('MAT-' || v_p);
    v_cod := v_p || '-' || lpad(v_n::text, greatest(2, length(v_n::text)), '0');
    exit when not exists (select 1 from retail.materiales m where retail.fn_clave_texto(m.codigo) = retail.fn_clave_texto(v_cod))
      and not exists (select 1 from retail.insumos i where retail.fn_clave_texto(i.codigo) = retail.fn_clave_texto(v_cod));
    v_vuelta := v_vuelta + 1;
    if v_vuelta > 200 then
      raise exception 'No se pudo armar un código libre para esta tela. Avisa al líder.' using hint = 'codigo_sin_libres';
    end if;
  end loop;
  return v_cod;
end;
$f$;
revoke all on function retail.fn_codigo_de_material(text, text) from public, anon, authenticated;

-- ---------- 5. Altas: la tela y/o sus colores, todo o nada ----------
-- Anota en «Actividad» (ADR-0207) lo que se hizo con una tela: quién, cuándo y —en una edición— cómo era antes y cómo quedó. Sin cifras de dinero. Si Actividad falla, lo hecho no se cae
-- (como en las hermanas de Producción): queda un aviso en el log de la base.
create or replace function retail.fn_material_anotar(p_accion text, p_descripcion text, p_actor uuid, p_ubicacion_id uuid, p_material_id uuid, p_detalle jsonb)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $f$
begin
  perform retail.fn_actividad_anotar('produccion', p_accion, p_descripcion, p_actor, retail.fn_actividad_terminal_ahora(), p_ubicacion_id, p_ubicacion_id, 'materiales', p_material_id::text, now(), p_detalle, 'vivo');
exception when others then
  raise warning 'actividad: no se anotó «%» de la tela % (%)', p_accion, p_material_id, sqlerrm;
end;
$f$;
revoke all on function retail.fn_material_anotar(text, text, uuid, uuid, uuid, jsonb) from public, anon, authenticated;

-- Interna: crea lo que falte de cada color de `p_colores` ([{color_codigo, stock_minimo, saldo_inicial: {cantidad, costo_total, nota}}]) y abre el saldo inicial con `recibir_insumo`.
-- Un color que ya estaba se deja como está; si trae saldo, solo se acepta como REINTENTO del mismo envío (su lote ya existe con el token derivado): lo que llega después se anota en «Llegó tela».
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
    raise exception 'Esa tela ya no existe. Actualiza la pantalla.' using hint = 'material_no_existe';
  end if;
  -- Un avío lo crea el líder, también cuando se le suman colores.
  if m.tipo = 'avio' and not retail.fn_es_lider() then
    raise exception 'Los avíos los crea el líder.' using errcode = '42501', hint = 'avio_sin_lider';
  end if;
  -- Un color va UNA vez: con token, el segundo saldo del mismo color se perdía en silencio (el reintento lo daba por ya hecho); sin token fallaba. Ahora pasa lo mismo en los dos casos.
  if exists (select 1 from jsonb_array_elements(coalesce(p_colores, '[]'::jsonb)) e group by coalesce(nullif(btrim(e ->> 'color_codigo'), ''), '') having count(*) > 1) then
    raise exception 'Un color va una sola vez en la tela.' using hint = 'color_repetido';
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
    -- Un saldo mal formado o de cero se rechaza: antes se descartaba en silencio y la persona creía que había anotado lo que ya tenía.
    if jsonb_exists(v_c, 'saldo_inicial') and jsonb_typeof(v_c -> 'saldo_inicial') not in ('object', 'null') then
      raise exception 'El saldo inicial del color «%» se manda como un objeto con su cantidad y su costo.', coalesce(v_color, '(sin color)') using hint = 'saldo_ilegible';
    end if;
    if v_cant is not null and not (v_cant > 0) then
      raise exception 'La cantidad del saldo inicial de «%» tiene que ser mayor que cero (déjala vacía si todavía no llegó nada).', coalesce(v_color, '(sin color)') using hint = 'saldo_ilegible';
    end if;
    v_nota := nullif(btrim(coalesce(v_c -> 'saldo_inicial' ->> 'nota', '')), '');
    -- El token del lote incluye la TELA: el mismo token usado en otra tela (o en otra operación) ya no se confunde con un reintento.
    v_token := case when p_token is null then null else md5(p_token::text || ':' || p_material_id::text || ':' || coalesce(v_color, ''))::uuid end;

    v_insumo := null;
    for v_insumo in select i.id from retail.insumos i where i.material_id = p_material_id and coalesce(i.color_codigo, '') = coalesce(v_color, '') loop
      exit;
    end loop;
    v_existia := v_insumo is not null;
    if not v_existia then
      -- El color tiene que existir y estar activo solo cuando se CREA: un reintento de algo que ya se creó no falla porque después lo desactivaron.
      if v_color is not null and not exists (select 1 from retail.colores c where c.codigo = v_color and c.activo) then
        raise exception 'El color «%» no existe o está desactivado.', v_color using hint = 'color_inactivo';
      end if;
      -- El código de un color es el de la tela + el del color: si otro insumo (uno suelto, de antes de las telas) ya lo usa, se dice cuál en vez de un error de índice.
      v_codigo := m.codigo || coalesce('-' || v_color, '');
      for v_ocupa in select i.codigo, i.nombre from retail.insumos i where retail.fn_clave_texto(i.codigo) = retail.fn_clave_texto(v_codigo) loop
        raise exception 'El código % ya lo usa otro insumo («%»): conviértelo en un color de esta tela (avisa al líder) o cámbiale el código antes de agregar este color.', v_ocupa.codigo, v_ocupa.nombre using hint = 'codigo_ocupado';
      end loop;
      -- Tipo y unidad son los de la tela (la llave compuesta lo exige); el nombre y el código los fija el disparador.
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
      -- Reintento: el lote de ESTE color de ESTA tela ya existe con ese token.
      if v_token is not null and exists (select 1 from retail.insumo_lotes l where l.token_cliente = v_token and l.insumo_id = v_insumo) then
        continue;
      end if;
      if v_existia then
        raise exception 'El color «%» ya estaba en la tela: lo que llegó se anota en «Llegó tela», no como saldo inicial.', coalesce(v_color, '(sin color)') using hint = 'color_ya_existe_con_saldo';
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
  v_existente record;
  v_suelto record;
  v_codigo text;
  v_actor uuid;
  v_n integer;
begin
  perform retail.fn_produccion_exigir_operar(p_ubicacion_id);
  perform retail.fn_material_exigir_taller(p_ubicacion_id);
  if jsonb_typeof(p_material) is distinct from 'object' then
    raise exception 'Faltan los datos de la tela.' using hint = 'material_ilegible';
  end if;
  if jsonb_typeof(coalesce(p_colores, '[]'::jsonb)) is distinct from 'array' then
    raise exception 'Los colores se mandan como una lista.' using hint = 'color_ilegible';
  end if;
  perform retail.fn_intento_con_huella('crear_material', p_token, md5(row(p_ubicacion_id, p_material, p_colores)::text));
  -- Reintento del mismo envío: devuelve lo que ya se creó.
  if p_token is not null then
    perform pg_advisory_xact_lock(hashtextextended('materiales:' || p_token::text, 0));
    for v_id in select m.id from retail.materiales m where m.token_cliente = p_token loop
      return retail.fn_material_como_json(v_id);
    end loop;
  end if;

  v_d := retail.fn_material_leer(p_material);
  v_nombre := v_d ->> 'nombre';
  v_tipo := v_d ->> 'tipo';
  -- Un avío lo crea el líder, como lo exige la política `insumos_insert_lider`. La tela, en cambio, es de quien la opera (ADR-0554, decisión 3).
  if v_tipo = 'avio' and not retail.fn_es_lider() then
    raise exception 'Los avíos los crea el líder.' using errcode = '42501', hint = 'avio_sin_lider';
  end if;
  v_actor := retail.fn_actor_persona_id(true);

  -- Dos personas creando la misma tela a la vez: la segunda espera, ve que ya existe y recibe el aviso (no un error de índice).
  perform pg_advisory_xact_lock(hashtextextended('materiales:nombre:' || v_tipo || ':' || coalesce(retail.fn_clave_texto(v_nombre), ''), 0));
  for v_existente in select m.id, m.codigo, m.nombre from retail.materiales m where retail.fn_clave_texto(m.nombre) = retail.fn_clave_texto(v_nombre) and m.tipo = v_tipo loop
    raise exception 'Ya existe «%» (%): agrégale los colores que faltan a esa.', v_existente.nombre, v_existente.codigo using hint = 'material_ya_existe', detail = v_existente.id::text;
  end loop;
  -- Un insumo SUELTO (de antes de las telas) con ese nombre: la tela nueva sería la misma sin enterarse y la línea de stock quedaría duplicada. Primero se convierte (fn_materializar_insumos_sueltos).
  for v_suelto in select i.codigo, i.nombre from retail.insumos i where i.material_id is null and i.archivado_at is null and i.tipo = v_tipo and retail.fn_clave_texto(i.nombre) = retail.fn_clave_texto(v_nombre) loop
    raise exception 'Ya hay un insumo suelto con ese nombre (%): primero se convierte en tela, para no duplicar su stock. Avisa al líder.', v_suelto.codigo using hint = 'insumo_suelto_igual';
  end loop;

  v_codigo := retail.fn_codigo_de_material(v_nombre, v_tipo);
  insert into retail.materiales (codigo, nombre, tipo, tejido_id, composicion, unidad_medida, merma_pct, unidad_compra, ancho_cm, gramaje_gm2, metros_por_rollo, token_cliente, creado_por)
  values (v_codigo, v_nombre, v_tipo, nullif(v_d ->> 'tejido_id', '')::uuid, v_d ->> 'composicion', v_d ->> 'unidad_medida', (v_d ->> 'merma_pct')::numeric, v_d ->> 'unidad_compra',
          (v_d ->> 'ancho_cm')::numeric, (v_d ->> 'gramaje_gm2')::numeric, (v_d ->> 'metros_por_rollo')::numeric, p_token, v_actor)
  returning id into v_id;

  perform retail.fn_material_agregar_colores(v_id, p_ubicacion_id, p_colores, p_token);
  v_n := (select count(*)::integer from retail.insumos i where i.material_id = v_id);
  perform retail.fn_material_anotar('tela_creada',
    'creó la tela «' || v_nombre || '» (' || v_codigo || ')' || case when v_n > 0 then ' con ' || v_n || case when v_n = 1 then ' color' else ' colores' end else '' end,
    v_actor, p_ubicacion_id, v_id, jsonb_build_object('material_id', v_id, 'codigo', v_codigo, 'tipo', v_tipo, 'colores', v_n));
  return retail.fn_material_como_json(v_id);
end;
$f$;
revoke all on function retail.crear_material(uuid, jsonb, jsonb, uuid) from public, anon;
grant execute on function retail.crear_material(uuid, jsonb, jsonb, uuid) to authenticated;


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
begin
  perform retail.fn_produccion_exigir_operar(p_ubicacion_id);
  perform retail.fn_material_exigir_taller(p_ubicacion_id);
  if jsonb_typeof(coalesce(p_colores, '[]'::jsonb)) is distinct from 'array' then
    raise exception 'Los colores se mandan como una lista.' using hint = 'color_ilegible';
  end if;
  perform retail.fn_intento_con_huella('agregar_colores_a_material', p_token, md5(row(p_material_id, p_ubicacion_id, p_colores)::text));
  if not exists (select 1 from retail.materiales m where m.id = p_material_id and m.archivado_at is null) then
    raise exception 'Esa tela ya no existe. Actualiza la pantalla.' using hint = 'material_no_existe';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  -- Dos personas sumando colores (o editando) la misma tela a la vez: una a una.
  perform pg_advisory_xact_lock(hashtextextended('materiales:colores:' || p_material_id::text, 0));
  v_antes := (select count(*)::integer from retail.insumos i where i.material_id = p_material_id);
  perform retail.fn_material_agregar_colores(p_material_id, p_ubicacion_id, p_colores, p_token);
  v_despues := (select count(*)::integer from retail.insumos i where i.material_id = p_material_id);
  -- Un reintento (el mismo token) no suma nada y no anota otra vez.
  if v_despues > v_antes then
    select m.codigo, m.nombre into v_codigo, v_nombre from retail.materiales m where m.id = p_material_id;
    perform retail.fn_material_anotar('colores_agregados',
      'le sumó ' || (v_despues - v_antes) || case when v_despues - v_antes = 1 then ' color' else ' colores' end || ' a la tela «' || v_nombre || '» (' || v_codigo || ')',
      v_actor, p_ubicacion_id, p_material_id, jsonb_build_object('material_id', p_material_id, 'codigo', v_codigo, 'colores_nuevos', v_despues - v_antes));
  end if;
  return retail.fn_material_como_json(p_material_id);
end;
$f$;
revoke all on function retail.agregar_colores_a_material(uuid, uuid, jsonb, uuid) from public, anon;
grant execute on function retail.agregar_colores_a_material(uuid, uuid, jsonb, uuid) to authenticated;

-- ---------- 6. Editar una tela (ADR-0554, actividad 3) ----------
-- Corrige lo que se escribió mal o lo que cambió: nombre, tejido, composición, merma y cómo se compra (con su ancho, gramaje o metros por rollo). El tipo y la unidad NO se cambian (los de sus colores dependen
-- de ellos). Es del LÍDER, como lo era la ficha de un insumo (`insumos_update_lider`): corregir la merma o el tejido de una tela cambia lo que Nueva orden propone y cuánta tela se pide.

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
begin
  perform retail.fn_produccion_exigir_operar(p_ubicacion_id);
  perform retail.fn_material_exigir_taller(p_ubicacion_id);
  if not retail.fn_es_lider() then
    raise exception 'Editar una tela es del líder.' using errcode = '42501', hint = 'editar_material_sin_lider';
  end if;
  -- Firma con el responsable (como las hermanas de Producción): sin él no queda dicho quién la cambió.
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién guarda esto' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  if jsonb_typeof(p_material) is distinct from 'object' then
    raise exception 'Faltan los datos de la tela.' using hint = 'material_ilegible';
  end if;
  -- El mismo candado que «agregar colores»: mientras se edita una tela no se le suman colores (y al revés).
  perform pg_advisory_xact_lock(hashtextextended('materiales:colores:' || p_material_id::text, 0));
  select * into m from retail.materiales where id = p_material_id for update;
  if not found then
    raise exception 'Esa tela ya no existe. Actualiza la pantalla.' using hint = 'material_no_existe';
  end if;
  -- Control de versión (ADR-0193): la hoja manda el `updated_at` que leyó al abrirse. Si otra persona guardó entretanto, o si no manda ninguno, no se pisa nada en silencio.
  begin
    v_version := nullif(btrim(coalesce(p_material ->> 'version', '')), '')::timestamptz;
  exception when others then
    v_version := null;
  end;
  if v_version is distinct from m.updated_at then
    raise exception 'Otra persona cambió esta tela mientras la editabas. Actualiza la pantalla para ver sus cambios.' using errcode = 'PT409', hint = 'version_cambiada';
  end if;
  -- Lo que la hoja no manda queda como está (con solo el nombre no se borra la merma ni el tejido); un null explícito sí lo borra.
  v_d := retail.fn_material_leer(
    jsonb_build_object('nombre', m.nombre, 'tejido_id', m.tejido_id, 'composicion', m.composicion, 'merma_pct', m.merma_pct, 'unidad_compra', m.unidad_compra,
                       'ancho_cm', m.ancho_cm, 'gramaje_gm2', m.gramaje_gm2, 'metros_por_rollo', m.metros_por_rollo) || (p_material - 'version'),
    m.tipo, m.unidad_medida);
  if retail.fn_clave_texto(v_d ->> 'nombre') is distinct from retail.fn_clave_texto(m.nombre) then
    perform pg_advisory_xact_lock(hashtextextended('materiales:nombre:' || m.tipo || ':' || coalesce(retail.fn_clave_texto(v_d ->> 'nombre'), ''), 0));
    for v_existente in select x.codigo, x.nombre, x.id from retail.materiales x where x.id <> m.id and x.tipo = m.tipo and retail.fn_clave_texto(x.nombre) = retail.fn_clave_texto(v_d ->> 'nombre') loop
      raise exception 'Ya existe «%» (%): ponle otro nombre a esta tela.', v_existente.nombre, v_existente.codigo using hint = 'material_ya_existe', detail = v_existente.id::text;
    end loop;
    for v_suelto in select i.codigo from retail.insumos i where i.material_id is null and i.archivado_at is null and i.tipo = m.tipo and retail.fn_clave_texto(i.nombre) = retail.fn_clave_texto(v_d ->> 'nombre') loop
      raise exception 'Ya hay un insumo suelto con ese nombre (%): primero se convierte en tela, para no duplicar su stock. Avisa al líder.', v_suelto.codigo using hint = 'insumo_suelto_igual';
    end loop;
  end if;
  -- Qué cambia (para «Actividad»): el valor de antes y el de después, sin cifras de dinero.
  if (v_d ->> 'nombre') is distinct from m.nombre then
    v_cambios := array_append(v_cambios, 'nombre «' || m.nombre || '» → «' || (v_d ->> 'nombre') || '»');
    v_antes := v_antes || jsonb_build_object('nombre', m.nombre);
    v_despues := v_despues || jsonb_build_object('nombre', v_d ->> 'nombre');
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
  -- Los colores siguen a su tela: el AFTER UPDATE (`materiales_propaga_a_colores`) los pone al día en esta misma transacción (también si nada cambió: así se corrige un nombre de color desfasado).
  update retail.materiales set
    nombre = v_d ->> 'nombre',
    tejido_id = nullif(v_d ->> 'tejido_id', '')::uuid,
    composicion = v_d ->> 'composicion',
    merma_pct = (v_d ->> 'merma_pct')::numeric,
    unidad_compra = v_d ->> 'unidad_compra',
    ancho_cm = (v_d ->> 'ancho_cm')::numeric,
    gramaje_gm2 = (v_d ->> 'gramaje_gm2')::numeric,
    metros_por_rollo = (v_d ->> 'metros_por_rollo')::numeric
   where id = m.id;
  v_colores := (select count(*)::integer from retail.insumos i where i.material_id = m.id);
  if cardinality(v_cambios) > 0 then
    perform retail.fn_material_anotar('tela_editada',
      'corrigió la tela «' || (v_d ->> 'nombre') || '» (' || m.codigo || '): ' || array_to_string(v_cambios, ', ')
        || case when v_colores > 0 then ' · les llega a ' || v_colores || case when v_colores = 1 then ' color' else ' colores' end else '' end,
      v_actor, p_ubicacion_id, m.id, jsonb_build_object('material_id', m.id, 'codigo', m.codigo, 'colores', v_colores, 'antes', v_antes, 'despues', v_despues));
  end if;
  return retail.fn_material_como_json(m.id);
end;
$f$;
revoke all on function retail.editar_material(uuid, uuid, jsonb) from public, anon;
grant execute on function retail.editar_material(uuid, uuid, jsonb) to authenticated;
comment on function retail.editar_material(uuid, uuid, jsonb) is
  'ADR-0554: corrige una tela (nombre, tejido, composición, merma, cómo se compra); sus colores la siguen en la misma transacción. Solo el líder. El tipo y la unidad no se cambian.';

-- ---------- 7. Lo que ya existe se vuelve tela (sin abortar) ----------
-- Antes devolvía un número y se detenía con un error si UN insumo chocaba. Ahora cada insumo suelto de TELA va por su cuenta: el informe dice qué pasó con cada uno y lo que no se puede queda suelto.
-- Por defecto ENSAYA (no escribe nada, devuelve qué haría); con `true` aplica, y antes de tocar cada insumo guarda su fila en `respaldo_purgas.filas` (purga `materializar-insumos-AAAA-MM-DD-HHMM`).
-- Los avíos se quedan sueltos a propósito y los archivados no se tocan.
drop function if exists retail.fn_materializar_insumos_sueltos();

create or replace function retail.fn_materializar_insumos_sueltos(p_aplicar boolean default false)
returns table (insumo_codigo text, insumo_nombre text, resultado text, detalle text)
language plpgsql
security definer
set search_path = retail, public, extensions
as $f$
declare
  r record;
  m retail.materiales%rowtype;
  -- Un NULL también ensaya: solo un `true` escribe.
  v_aplicar boolean := coalesce(p_aplicar, false);
  v_res jsonb := '[]'::jsonb;
  v_base text;
  v_color text;
  v_sufijo text;
  v_cod text;
  v_derivado text;
  v_nota text;
  -- Cada corrida que APLICA guarda cómo era cada insumo ANTES de colgarlo de su tela, en el respaldo de siempre (`respaldo_purgas.filas`): es lo que usa el deshacer.
  v_purga text := 'materializar-insumos-' || to_char(timezone('America/Lima', now()), 'YYYY-MM-DD-HH24MI');
begin
  perform pg_advisory_xact_lock(hashtextextended('materiales:conversor', 0));
  begin
    for r in select i.* from retail.insumos i where i.material_id is null and i.tipo = 'tela' and i.archivado_at is null order by i.created_at, i.codigo loop
      begin
        -- El nombre de la tela es el del insumo, sin el « · Color» que la pantalla le agrega al mostrarlo (quien copia lo que ve en la lista no crea otra tela).
        v_base := r.nombre;
        v_color := (select c.nombre from retail.colores c where c.codigo = r.color_codigo);
        if v_color is not null then
          v_sufijo := ' · ' || v_color;
          if length(r.nombre) > length(v_sufijo) and right(r.nombre, length(v_sufijo)) = v_sufijo then
            v_base := btrim(left(r.nombre, length(r.nombre) - length(v_sufijo)));
          end if;
        end if;
        -- Los mismos candados que `crear_material`, «agregar colores» y «editar»: el conversor no se cruza con quien está creando o corrigiendo esa tela.
        perform pg_advisory_xact_lock(hashtextextended('materiales:nombre:' || r.tipo || ':' || coalesce(retail.fn_clave_texto(v_base), ''), 0));
        -- ¿Ya hay una tela con ese nombre (aunque cambien mayúsculas o tildes)? Entonces este insumo es otro color de ella.
        m := null;
        for m in select x.* from retail.materiales x where x.tipo = r.tipo and retail.fn_clave_texto(x.nombre) = retail.fn_clave_texto(v_base) loop
          exit;
        end loop;
        v_nota := '';
        if m.id is null then
          v_cod := r.codigo;
          -- Un código de más de 20 letras (la tela no los admite) o que ya usa otra tela se reemplaza por uno armado por la base.
          if length(v_cod) > 20 or exists (select 1 from retail.materiales x where retail.fn_clave_texto(x.codigo) = retail.fn_clave_texto(v_cod)) then
            v_cod := retail.fn_codigo_de_material(v_base, r.tipo);
          end if;
          insert into retail.materiales (codigo, nombre, tipo, tejido_id, unidad_medida, merma_pct, unidad_compra, creado_por)
          values (v_cod, v_base, r.tipo, r.tejido_id, r.unidad_medida, r.merma_pct, r.unidad_medida, r.creado_por)
          returning * into m;
        else
          perform pg_advisory_xact_lock(hashtextextended('materiales:colores:' || m.id::text, 0));
          select * into m from retail.materiales x where x.id = m.id;
          if m.unidad_medida is distinct from r.unidad_medida then
            raise exception 'La tela «%» (%) se lleva en otra unidad.', m.nombre, m.codigo;
          end if;
          if exists (select 1 from retail.insumos x where x.material_id = m.id and coalesce(x.color_codigo, '') = coalesce(r.color_codigo, '')) then
            raise exception 'La tela «%» (%) ya tiene ese color.', m.nombre, m.codigo;
          end if;
          -- La merma y el tejido son de la TELA: la copia se los pondría al color sin avisar y «Nueva orden» pediría otra cantidad de tela sin explicación. Si el suelto trae OTROS, se queda suelto.
          if r.merma_pct > 0 and r.merma_pct is distinct from m.merma_pct then
            raise exception 'Su merma (% %%) no es la de la tela (% %%): iguálala y vuelve a convertir.', trim_scale(round(r.merma_pct * 100, 2)), trim_scale(round(m.merma_pct * 100, 2));
          end if;
          if r.tejido_id is not null and r.tejido_id is distinct from m.tejido_id and (m.tejido_id is not null or exists (select 1 from retail.insumos x where x.material_id = m.id)) then
            raise exception 'Su tejido no es el de la tela: iguálalo y vuelve a convertir.';
          end if;
          -- Una tela todavía sin colores y sin tejido toma el del suelto; con colores, nunca (se lo arrastraría a todos).
          if m.tejido_id is null and r.tejido_id is not null then
            update retail.materiales set tejido_id = r.tejido_id where id = m.id;
            select * into m from retail.materiales x where x.id = m.id;
          end if;
          -- Lo que sí cambia al colgarlo (merma 0 o tejido vacío del suelto pasan a ser los de la tela): el ensayo lo dice.
          if r.merma_pct is distinct from m.merma_pct then
            v_nota := v_nota || ' · merma ' || trim_scale(round(r.merma_pct * 100, 2))::text || ' % → ' || trim_scale(round(m.merma_pct * 100, 2))::text || ' %';
          end if;
          if r.tejido_id is distinct from m.tejido_id then
            v_nota := v_nota || ' · tejido ' || coalesce((select t.nombre from retail.tejidos t where t.id = r.tejido_id), '(ninguno)') || ' → ' || coalesce((select t.nombre from retail.tejidos t where t.id = m.tejido_id), '(ninguno)');
          end if;
        end if;
        v_derivado := m.codigo || coalesce('-' || r.color_codigo, '');
        if exists (select 1 from retail.insumos x where x.id <> r.id and retail.fn_clave_texto(x.codigo) = retail.fn_clave_texto(v_derivado)) then
          raise exception 'El código % ya lo usa otro insumo.', v_derivado;
        end if;
        insert into respaldo_purgas.filas (purga, tabla, fila) values (v_purga, 'insumos', to_jsonb(r));
        update retail.insumos set material_id = m.id where id = r.id;
        v_res := v_res || jsonb_build_array(jsonb_build_object(
          'c', r.codigo, 'n', r.nombre, 'r', case when v_aplicar then 'convertido' else 'se convertiría' end,
          'd', 'color de «' || m.nombre || '» (' || m.codigo || '), queda como ' || v_derivado || v_nota));
      exception when others then
        v_res := v_res || jsonb_build_array(jsonb_build_object('c', r.codigo, 'n', r.nombre, 'r', 'se queda suelto', 'd', sqlerrm));
      end;
    end loop;
    if not v_aplicar then
      -- Ensayo: se deshace todo lo hecho dentro de este bloque. Lo contado queda en `v_res` (las variables no se deshacen).
      raise exception 'ensayo' using errcode = 'ENSAY';
    end if;
  exception when sqlstate 'ENSAY' then
    null;
  end;
  return query select e ->> 'c', e ->> 'n', e ->> 'r', e ->> 'd' from jsonb_array_elements(v_res) e;
end;
$f$;
revoke all on function retail.fn_materializar_insumos_sueltos(boolean) from public, anon, authenticated;
comment on function retail.fn_materializar_insumos_sueltos(boolean) is
  'ADR-0554: vuelve tela cada insumo suelto de TELA (los avíos y los archivados no). Sin argumento ENSAYA y no escribe; con true aplica. Nunca aborta: lo que no puede queda suelto y el informe dice por qué.';
