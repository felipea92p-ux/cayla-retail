-- ============================================================================
-- 20261028175000_materiales_tela_con_colores.sql — CAYLA V2 (ADR-0554, actividad 1 · 2026-10-28)
--
-- EL PROBLEMA PRIMERO. Hoy un insumo es UN color y UNA unidad: «Milano Melange · Arena» y «Milano Melange · Negro» son dos fichas sueltas que repiten tejido, merma y todo lo que es de la
-- TELA, y una tela en cinco colores son cinco altas de diez campos. Felipe (2026-10-28) decidió que la tela pase a ser una ficha con sus colores como líneas de stock, igual que Catálogo
-- guarda un producto y sus variantes (ADR-0554, decisión 1). Esta migración pone la BASE; la hoja «Nueva tela» (act. 2), «Agregar color y editar» (act. 3) y «Llegó tela» (act. 4) vienen después.
--
-- QUÉ HACE
--   PARTE 1 (sin políticas)
--   1. Tabla `materiales` (la tela: qué es y cómo se compra): código y nombre únicos, tejido, composición, unidad de LIBRO (la tela, siempre metro), merma y cómo se compra (metro, kilo con su
--      ancho y gramaje, o rollo con sus metros). Periférica: no toca el núcleo de Catálogo ni `tejidos`.
--   2. `insumos.material_id` + una llave foránea COMPUESTA (material_id, tipo, unidad_medida) → `materiales`: un color no puede tener otro tipo ni otra unidad que su tela. Un solo insumo por
--      (tela, color). Un insumo sin tela sigue siendo válido (`material_id` nulo): nada de lo que ya existe se rompe.
--   3. Disparador `insumos_copias_de_la_tela`: el nombre («Milano Melange · Arena»), el código («MIL-01-ARN»), el tejido, la merma, el tipo y la unidad de un color los pone la base desde su tela;
--      nadie los escribe a mano, y un intento de cambiar el tejido o la merma de UN color se rechaza («son de la tela»).
--   4. `fn_codigo_de_material`: el código de la tela se arma solo (prefijo de 3 letras del nombre + correlativo atómico, ej. `MIL-01`) y no choca con ningún código de tela ni de insumo.
--   5. `crear_material` y `agregar_colores_a_material` (SECURITY DEFINER, firman con el responsable): crean la tela y/o sus colores y, si hace falta, el saldo inicial de cada color, TODO O NADA
--      en una sola transacción; con token, un reintento devuelve lo ya creado y no duplica nada. Quien ve «Producción» en ese Taller crea telas y colores; el saldo inicial (dinero) lo anota
--      solo el líder (ADR-0554, decisión 3). El saldo se abre con `recibir_insumo`, la misma función de siempre: no se reescribe nada de lotes.
--   6. `fn_materializar_insumos_sueltos`: vuelve tela (de un solo color) cada insumo que todavía no tiene. Se ejecuta UNA vez aquí: el insumo `MM-01` de producción pasa a ser la tela `MM-01` con su
--      color Arena (`MM-01-ARN`). Es re-ejecutable y no hace nada si no hay insumos sueltos.
--   PARTE 2 (la política de lectura, sola y al final — ADR-0195)
--   7. `materiales` se puede leer (como `insumos`); escribirla solo se puede por las funciones.
--
-- PROMETE: una tela y sus colores nacen todo o nada; el código nunca lo escribe una persona y nunca se repite (ni ignorando mayúsculas, tildes o espacios); un color no cambia el tipo, la unidad,
--   el tejido ni la merma de su tela; un reintento con el mismo token no duplica la tela, los colores ni los lotes; sin el módulo «Producción» en ese Taller no se crea nada.
-- ASUME:   `20261028172000` (los candados de unidad) ya está aplicada; las tablas `colores`, `tejidos` e `insumos` existen; `recibir_insumo` es la de producción.
-- NO HACE: no cambia ningún lote, movimiento ni costo; no agrega la conversión kilo → metro (act. 4); no edita una tela (act. 3: `editar_material`); no toca `recibir_insumo`.
--
-- DECIDÍ: la tela es una tabla propia y `insumos` queda como su línea por color, con las columnas que otras ~40 funciones ya leen (`tipo`, `unidad_medida`, `tejido_id`, `merma_pct`) como COPIAS que
--   mantiene un disparador: así no se reescribe ninguna función de Producción ni de Compras. DESCARTÉ reescribir esas funciones para que lean la tela (radio de explosión alto, cero beneficio hoy) y
--   DESCARTÉ el «get-or-create» silencioso: si la tela ya existe, `crear_material` AVISA y apunta a la existente en vez de sumarle un saldo (un segundo envío con otro token habría duplicado stock).
-- SE ROMPE SI: alguien pide leer el tejido de un color directo de la tela y deja de leer la copia (la copia sigue ahí, no se rompe); o si se decide llevar el punto en kilos (ADR-0554 lo descartó);
--   o si dos telas distintas necesitan el mismo nombre (hoy el nombre es único por tipo: se les agrega una marca, no un duplicado).
--
-- PRODUCCIÓN. NO está aplicada. Va en DOS PARTES que se pegan por separado y en orden (ADR-0195: una política y un `alter` de una tabla en uso no van juntos), cada una con `lock_timeout = 3s`
--   y re-ejecutable. PARTE 1 = desde el primer `set lock_timeout` hasta la línea «FIN DE LA PARTE 1»; PARTE 2 = lo que sigue. Pegar DESPUÉS de `20261028172000`. Dentro de los textos no hay ningún
--   `select … into` (ADR-0288). Prueba: `pnpm pruebas:materiales`.
-- ============================================================================

set lock_timeout = '3s';

-- ---------- 1. La tela ----------
create table if not exists retail.materiales (
  id uuid primary key default gen_random_uuid(),
  codigo text not null,
  nombre text not null,
  tipo text not null check (tipo in ('tela', 'avio')),
  tejido_id uuid references retail.tejidos (id),
  composicion text,
  -- La unidad del LIBRO: la tela siempre en metros; un avío, en la unidad que se elija.
  unidad_medida text not null check (unidad_medida in ('metro', 'unidad', 'kilo', 'cono', 'par', 'docena')),
  merma_pct numeric(5, 4) not null default 0,
  -- Cómo se COMPRA (ADR-0554): la tela por metro, por kilo (con su ancho y gramaje: de ahí salen los metros por kilo) o por rollo (con los metros habituales de un rollo). Un avío se compra en su unidad.
  unidad_compra text not null default 'metro' check (unidad_compra in ('metro', 'kilo', 'rollo', 'unidad', 'cono', 'par', 'docena')),
  ancho_cm numeric(7, 2),
  gramaje_gm2 numeric(7, 2),
  metros_por_rollo numeric(10, 3),
  -- Un reintento de red con el mismo token devuelve la tela ya creada.
  token_cliente uuid unique,
  creado_por uuid references public.personas (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archivado_at timestamptz,
  constraint materiales_id_tipo_unidad_unico unique (id, tipo, unidad_medida),
  constraint materiales_tela_en_metros check (tipo <> 'tela' or unidad_medida = 'metro'),
  constraint materiales_tejido_solo_tela check (tipo = 'tela' or tejido_id is null),
  constraint materiales_codigo_no_vacio check (retail.fn_clave_texto(codigo) is not null),
  constraint materiales_nombre_no_vacio check (retail.fn_clave_texto(nombre) is not null),
  constraint materiales_textos_con_tope check (length(nombre) <= 120 and length(codigo) <= 20 and length(coalesce(composicion, '')) <= 160),
  constraint materiales_merma_pct_check check (merma_pct >= 0 and merma_pct < 0.5),
  constraint materiales_compra_de_la_tela check (tipo = 'avio' or unidad_compra in ('metro', 'kilo', 'rollo')),
  constraint materiales_compra_del_avio check (tipo = 'tela' or unidad_compra = unidad_medida),
  constraint materiales_kilo_pide_ancho_y_gramaje check (unidad_compra <> 'kilo' or (ancho_cm is not null and gramaje_gm2 is not null)),
  constraint materiales_rollo_pide_metros check (unidad_compra <> 'rollo' or metros_por_rollo is not null),
  -- `numeric` admite NaN e Infinity: el tope los deja fuera (NaN no es menor que ningún número).
  constraint materiales_medidas_con_tope check (
    (ancho_cm is null or (ancho_cm > 0 and ancho_cm < 1000))
    and (gramaje_gm2 is null or (gramaje_gm2 > 0 and gramaje_gm2 < 5000))
    and (metros_por_rollo is null or (metros_por_rollo > 0 and metros_por_rollo < 100000))
  )
);
create unique index if not exists materiales_codigo_clave_unico on retail.materiales (retail.fn_clave_texto(codigo));
create unique index if not exists materiales_nombre_tipo_unico on retail.materiales (retail.fn_clave_texto(nombre), tipo);
comment on table retail.materiales is
  'ADR-0554: la TELA (o el avío): qué es y cómo se compra. Sus colores son filas de `insumos` (`material_id`), que son las líneas de stock con su lote, costo y mínimo. Solo se escribe por `crear_material` y las funciones de la tela.';

alter table retail.materiales enable row level security;
revoke all on retail.materiales from anon, authenticated;

create or replace function retail.fn_materiales_set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $f$
begin
  new.updated_at := now();
  return new;
end;
$f$;
revoke all on function retail.fn_materiales_set_updated_at() from public, anon, authenticated;
create or replace trigger materiales_set_updated_at before update on retail.materiales for each row execute function retail.fn_materiales_set_updated_at();

-- El tipo y la unidad de una tela no cambian nunca (los de sus colores dependen de ellos por la llave compuesta).
create or replace function retail.fn_materiales_tipo_firme()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $f$
begin
  if new.tipo is distinct from old.tipo or new.unidad_medida is distinct from old.unidad_medida then
    raise exception 'El tipo y la unidad de una tela no se cambian. Crea otra tela con la unidad correcta.' using errcode = '23514', hint = 'material_tipo_firme';
  end if;
  return new;
end;
$f$;
revoke all on function retail.fn_materiales_tipo_firme() from public, anon, authenticated;
create or replace trigger materiales_tipo_firme before update of tipo, unidad_medida on retail.materiales for each row execute function retail.fn_materiales_tipo_firme();

-- ---------- 2. Los insumos cuelgan de la tela ----------
alter table retail.insumos add column if not exists material_id uuid;
do $f$
begin
  if not exists (select 1 from pg_constraint where conname = 'insumos_material_fk' and conrelid = 'retail.insumos'::regclass) then
    -- Compuesta: un color no puede tener otro tipo ni otra unidad que su tela. Con `material_id` nulo no se exige nada (un insumo suelto sigue siendo válido).
    alter table retail.insumos add constraint insumos_material_fk foreign key (material_id, tipo, unidad_medida) references retail.materiales (id, tipo, unidad_medida);
  end if;
end
$f$;
create unique index if not exists insumos_material_color_unico on retail.insumos (material_id, coalesce(color_codigo, '')) where material_id is not null;
create index if not exists insumos_material_idx on retail.insumos (material_id) where material_id is not null;
comment on column retail.insumos.material_id is 'ADR-0554: la tela de la que este insumo es un color. Nulo = insumo suelto (anterior a las telas). Con tela, el nombre, el código, el tejido, la merma, el tipo y la unidad los pone la base desde la tela.';

-- ---------- 3. Las copias de la tela en cada color ----------
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
  -- El tejido y la merma son de la TELA: no se cambian en un solo color. (Lo que ya coincide, o lo que acaba de fijar la tela, pasa.)
  if tg_op = 'UPDATE' and (new.tejido_id is distinct from m.tejido_id or new.merma_pct is distinct from m.merma_pct) then
    raise exception 'El tejido y la merma son de la tela, no de cada color: cámbialos en la tela.' using errcode = '23514', hint = 'copia_de_la_tela';
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
create or replace trigger insumos_copias_de_la_tela before insert or update on retail.insumos for each row execute function retail.fn_insumos_copias_de_la_tela();

-- ---------- 4. El código de la tela se arma solo ----------
-- Prefijo de 3 letras (la primera palabra del nombre; «TEL» o «AVI» si no hay letras) + correlativo atómico por prefijo, que se salta lo que ya esté en uso por una tela o un insumo.
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
    v_cod := v_p || '-' || lpad(v_n::text, 2, '0');
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

-- La tela y sus colores, tal como los devuelven las funciones de alta.
create or replace function retail.fn_material_como_json(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $f$
  select jsonb_build_object(
    'material', to_jsonb(m) - 'token_cliente' - 'creado_por',
    'insumos', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'codigo', i.codigo, 'nombre', i.nombre, 'color_codigo', i.color_codigo, 'stock_minimo', i.stock_minimo) order by i.created_at, i.codigo)
                          from retail.insumos i where i.material_id = m.id), '[]'::jsonb))
    from retail.materiales m where m.id = p_id;
$f$;
revoke all on function retail.fn_material_como_json(uuid) from public, anon, authenticated;

-- ---------- 5. Altas: la tela y/o sus colores, todo o nada ----------
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
begin
  select * into m from retail.materiales where id = p_material_id;
  if not found then
    raise exception 'Esa tela ya no existe. Actualiza la pantalla.' using hint = 'material_no_existe';
  end if;
  for v_c in select e from jsonb_array_elements(coalesce(p_colores, '[]'::jsonb)) e loop
    if jsonb_typeof(v_c) is distinct from 'object' then
      raise exception 'Cada color se manda como un objeto con su código.' using hint = 'color_ilegible';
    end if;
    v_color := nullif(btrim(v_c ->> 'color_codigo'), '');
    if v_color is not null and not exists (select 1 from retail.colores c where c.codigo = v_color and c.activo) then
      raise exception 'El color «%» no existe o está desactivado.', v_color using hint = 'color_inactivo';
    end if;
    begin
      v_min := nullif(btrim(coalesce(v_c ->> 'stock_minimo', '')), '')::numeric;
      v_cant := nullif(btrim(coalesce(v_c -> 'saldo_inicial' ->> 'cantidad', '')), '')::numeric;
      v_costo := nullif(btrim(coalesce(v_c -> 'saldo_inicial' ->> 'costo_total', '')), '')::numeric;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Los números del color «%» no se entienden: revisa el mínimo, la cantidad y el costo.', coalesce(v_color, '(sin color)') using hint = 'numero_ilegible';
    end;
    v_nota := nullif(btrim(coalesce(v_c -> 'saldo_inicial' ->> 'nota', '')), '');
    v_token := case when p_token is null then null else md5(p_token::text || ':' || coalesce(v_color, ''))::uuid end;

    v_insumo := null;
    for v_insumo in select i.id from retail.insumos i where i.material_id = p_material_id and coalesce(i.color_codigo, '') = coalesce(v_color, '') loop
      exit;
    end loop;
    v_existia := v_insumo is not null;
    if not v_existia then
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
      if v_token is not null and exists (select 1 from retail.insumo_lotes l where l.token_cliente = v_token) then
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
  v_existente record;
  v_codigo text;
begin
  perform retail.fn_produccion_exigir_operar(p_ubicacion_id);
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

  v_nombre := btrim(coalesce(p_material ->> 'nombre', ''));
  v_tipo := coalesce(nullif(btrim(p_material ->> 'tipo'), ''), 'tela');
  if v_tipo not in ('tela', 'avio') then
    raise exception 'El tipo es «tela» o «avio».' using hint = 'tipo_ilegible';
  end if;
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
    v_unidad := coalesce(nullif(btrim(p_material ->> 'unidad_medida'), ''), 'unidad');
    if v_unidad not in ('metro', 'unidad', 'kilo', 'cono', 'par', 'docena') then
      raise exception 'La unidad del avío no es una de las conocidas.' using hint = 'unidad_ilegible';
    end if;
    v_compra := v_unidad;
  end if;
  if v_compra = 'kilo' and not (coalesce(v_ancho, 0) > 0 and coalesce(v_gram, 0) > 0) then
    raise exception 'Para una tela que se compra por kilo hace falta su ancho y su gramaje: con eso se pasan los kilos a metros.' using hint = 'kilo_sin_medidas';
  end if;
  if v_compra = 'rollo' and not (coalesce(v_mrollo, 0) > 0) then
    raise exception 'Para una tela que se compra por rollo hace falta decir cuántos metros trae un rollo (lo habitual).' using hint = 'rollo_sin_metros';
  end if;

  -- Dos personas creando la misma tela a la vez: la segunda espera, ve que ya existe y recibe el aviso (no un error de índice).
  perform pg_advisory_xact_lock(hashtextextended('materiales:nombre:' || v_tipo || ':' || coalesce(retail.fn_clave_texto(v_nombre), ''), 0));
  for v_existente in select m.id, m.codigo, m.nombre from retail.materiales m where retail.fn_clave_texto(m.nombre) = retail.fn_clave_texto(v_nombre) and m.tipo = v_tipo loop
    raise exception 'Ya existe «%» (%): agrégale los colores que faltan a esa.', v_existente.nombre, v_existente.codigo using hint = 'material_ya_existe', detail = v_existente.id::text;
  end loop;

  v_codigo := retail.fn_codigo_de_material(v_nombre, v_tipo);
  insert into retail.materiales (codigo, nombre, tipo, tejido_id, composicion, unidad_medida, merma_pct, unidad_compra, ancho_cm, gramaje_gm2, metros_por_rollo, token_cliente, creado_por)
  values (v_codigo, v_nombre, v_tipo, v_tejido, v_comp, v_unidad, v_merma, v_compra, v_ancho, v_gram, v_mrollo, p_token, retail.fn_actor_persona_id(true))
  returning id into v_id;

  perform retail.fn_material_agregar_colores(v_id, p_ubicacion_id, p_colores, p_token);
  return retail.fn_material_como_json(v_id);
end;
$f$;
revoke all on function retail.crear_material(uuid, jsonb, jsonb, uuid) from public, anon;
grant execute on function retail.crear_material(uuid, jsonb, jsonb, uuid) to authenticated;
comment on function retail.crear_material(uuid, jsonb, jsonb, uuid) is
  'ADR-0554: crea una tela y, de una vez, sus colores (y el saldo inicial de cada uno si lo trae: eso solo lo anota el líder). Todo o nada; con token, un reintento devuelve lo ya creado. Si la tela ya existe, AVISA (hint material_ya_existe, detail = su id).';

create or replace function retail.agregar_colores_a_material(p_material_id uuid, p_ubicacion_id uuid, p_colores jsonb, p_token uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $f$
begin
  perform retail.fn_produccion_exigir_operar(p_ubicacion_id);
  if jsonb_typeof(coalesce(p_colores, '[]'::jsonb)) is distinct from 'array' then
    raise exception 'Los colores se mandan como una lista.' using hint = 'color_ilegible';
  end if;
  perform retail.fn_intento_con_huella('agregar_colores_a_material', p_token, md5(row(p_material_id, p_ubicacion_id, p_colores)::text));
  if not exists (select 1 from retail.materiales m where m.id = p_material_id and m.archivado_at is null) then
    raise exception 'Esa tela ya no existe. Actualiza la pantalla.' using hint = 'material_no_existe';
  end if;
  -- Dos personas sumando colores a la misma tela a la vez: una a una.
  perform pg_advisory_xact_lock(hashtextextended('materiales:colores:' || p_material_id::text, 0));
  perform retail.fn_material_agregar_colores(p_material_id, p_ubicacion_id, p_colores, p_token);
  return retail.fn_material_como_json(p_material_id);
end;
$f$;
revoke all on function retail.agregar_colores_a_material(uuid, uuid, jsonb, uuid) from public, anon;
grant execute on function retail.agregar_colores_a_material(uuid, uuid, jsonb, uuid) to authenticated;
comment on function retail.agregar_colores_a_material(uuid, uuid, jsonb, uuid) is
  'ADR-0554: suma colores a una tela que ya existe (los que ya estaban se dejan como están). Todo o nada; con token es reintentable.';

-- ---------- 6. Lo que ya existe se vuelve tela ----------
-- Cada insumo suelto pasa a ser una tela de un solo color (con su mismo código y nombre); el disparador le pone a su color el nombre «Tela · Color» y el código «CÓDIGO-COL».
-- Si dos insumos sueltos llevan el mismo nombre no se pueden volver telas separadas (el nombre de la tela es único por tipo): se dice cuáles y no se cambia nada.
create or replace function retail.fn_materializar_insumos_sueltos()
returns integer
language plpgsql
security definer
set search_path = retail, public, extensions
as $f$
declare
  r record;
  v_id uuid;
  v_n integer := 0;
  v_repetidos text;
begin
  v_repetidos := (select string_agg(nombre_repetido, ', ' order by nombre_repetido) from (
                    select min(i.nombre) as nombre_repetido from retail.insumos i where i.material_id is null group by retail.fn_clave_texto(i.nombre), i.tipo having count(*) > 1) d);
  if v_repetidos is not null then
    raise exception 'Hay insumos sueltos con el mismo nombre (%): no se pueden volver telas separadas. Cámbiales el nombre o archiva el que sobra y vuelve a pegar esta migración.', v_repetidos using errcode = 'P0001';
  end if;
  for r in select * from retail.insumos i where i.material_id is null order by i.created_at, i.codigo loop
    insert into retail.materiales (codigo, nombre, tipo, tejido_id, unidad_medida, merma_pct, unidad_compra, creado_por)
    values (r.codigo, r.nombre, r.tipo, case when r.tipo = 'tela' then r.tejido_id end, r.unidad_medida, r.merma_pct, r.unidad_medida, r.creado_por)
    returning id into v_id;
    -- Un avío no lleva tejido (la tela tampoco se lo guarda): si por la API directa traía uno, se limpia para que su copia coincida.
    update retail.insumos set material_id = v_id, tejido_id = case when tipo = 'tela' then tejido_id end where id = r.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$f$;
revoke all on function retail.fn_materializar_insumos_sueltos() from public, anon, authenticated;
select retail.fn_materializar_insumos_sueltos();

-- FIN DE LA PARTE 1 (pega hasta aquí; la PARTE 2 va aparte, después) ---------------------------------------------------------------------------------------------------------

-- ---------- 7. PARTE 2 · Leer las telas ----------
set lock_timeout = '3s';
do $f$
begin
  if not exists (select 1 from pg_policies where schemaname = 'retail' and tablename = 'materiales' and policyname = 'materiales_select_autenticado') then
    create policy materiales_select_autenticado on retail.materiales for select using ((select retail.fn_tiene_acceso_retail()));
  end if;
end
$f$;
grant select on retail.materiales to authenticated;
