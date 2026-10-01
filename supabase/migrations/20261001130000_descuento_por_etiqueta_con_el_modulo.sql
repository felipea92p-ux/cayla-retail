-- ============================================================================
-- 20261001130000_descuento_por_etiqueta_con_el_modulo.sql — CAYLA V2 · ADR-0293 (PARTE 1 de 2: funciones y catálogo)
--
-- EL PROBLEMA PRIMERO. Las etiquetas «Para liquidar» (20 %) y «Últimas unidades» (15 %) llevan descuento, y desde el
-- ADR-0160 poner o configurar un descuento por etiqueta era SOLO del líder (`fn_puede_dar_descuento_por_etiqueta() =
-- fn_es_lider()`). Consecuencia que nadie había dicho en voz alta: una terminal como «Almacén Trujillo» creaba una prenda y
-- esas dos etiquetas NO aparecían en el campo (el formulario las escondía: la base las iba a rechazar), y en Catálogo ▸
-- Atributos ▸ Etiquetas sus tarjetas salían sin «Prendas» ni «Configurar campaña». La gente concluía que faltaban.
--
-- LA DECISIÓN (Felipe, 2026-09-30, sobre el ADR-0161 y el ADR-0160):
--   1. AL CREAR UNA PRENDA, cualquiera que pueda dar de alta un producto (`fn_puede_editar_catalogo()`, el candado de la
--      primera línea de `crear_producto_con_variantes`) puede ponerle CUALQUIER etiqueta aprobada, con descuento o sin él.
--   2. LA CONFIGURACIÓN (descuento, fechas, categorías, aprobar/archivar, «Prendas» de una etiqueta con descuento, crear una
--      etiqueta ya con descuento) es de quien tenga el módulo Etiquetas (`fn_puede_editar_etiquetas()`), sea líder o no.
--   Sale de la lista «siempre solo del líder» (`SIEMPRE_SOLO_LIDER` en `lib/modulos.ts`): quien ve el módulo hace todo lo que
--   hay en él, que es la regla general del ADR-0161.
--
-- QUÉ CAMBIA (todo desde la definición VIVA de cada función; en producción el repo puede ir atrás o adelante)
--   · fn_puede_dar_descuento_por_etiqueta()  de `fn_es_lider()` a `fn_puede_editar_etiquetas()` (líder o rol con Etiquetas).
--     Es el punto único que sus llamadores ya usaban: la política `etiquetas_update` (esta parte) y, en la PARTE 2, el
--     `with check` de `etiquetas_insert_autenticado`.
--   · fn_puede_tocar_etiqueta(uuid, numeric) queda en lo mismo que esa capacidad (ya no distingue etiquetas con descuento).
--     La llaman `actualizar_campana_etiqueta` y `etiquetar_variantes` (las dos exigen además `fn_puede_editar_etiquetas`).
--   · crear_producto_con_variantes: se QUITA la guardia «solo un líder puede asignar una etiqueta con descuento».
--   · actualizar_variantes_etiquetas (la ficha de la prenda): se QUITA la guardia que impedía poner o quitar una etiqueta con
--     descuento. Su puerta (`fn_puede_editar_etiquetas() or fn_puede_editar_catalogo()`) no cambia: si la persona llegó
--     hasta ahí, cambia las etiquetas de la prenda que tiene delante, con descuento o sin él.
--   · Los mensajes de error que decían «solo un líder» (configurar campaña, etiquetar prendas) dicen lo que es cierto.
--   · `retail.modulos.incluye` de «Etiquetas» ya no dice «sin descuento».
--
-- LO QUE NO CAMBIA
--   · `fn_puede_editar_etiquetas()`, las tablas y sus datos, la vigencia de una campaña, `fn_es_lider()`.
--   · El COSTO sigue detrás de `fn_puede_ver_dinero_de_compras()` (`fn_costos_variantes_json`): quien configura una campaña
--     sin ese permiso la guarda sin el aviso de «por debajo del costo» (no se le pasa ningún costo).
--   · Las políticas `etiqueta_categorias_write_lider` y `variante_etiquetas_write_lider`: la web escribe esas tablas SOLO por
--     las RPC (security definer); la puerta es la RPC.
--
-- CONSECUENCIA QUE SE ACEPTA A PROPÓSITO. Una etiqueta con descuento cambia el precio en caja de las prendas que la llevan,
-- dentro de su vigencia. Ahora lo puede provocar quien crea una prenda (al marcarla) y quien tiene Etiquetas (al
-- configurarla). El límite que sigue en pie es la VIGENCIA (fechas y categorías de la campaña) y el tope de descuento que ya
-- aplica la caja; no se agrega otro candado acá.
--
-- SE ROMPE SI
--   · Se vuelve a pegar 20260923130000 o 20260923140000: sus verificaciones finales exigen «fn_puede_dar_descuento_por_etiqueta
--     es solo del líder» y abortan (falla CERRADO, no aplican nada). No se vuelven a pegar; esta las reemplaza.
--   · Otra migración recrea `crear_producto_con_variantes` o `actualizar_variantes_etiquetas` copiando su cuerpo viejo: la
--     guardia vuelve. La verificación del final de esta parte y `pnpm pruebas:roles` lo detectan.
--
-- PARTES (ADR-0195: el SQL Editor corre todo en UNA transacción y cada `create policy` toma en exclusiva las tablas de
-- `auth` y `storage`). Esta parte NO toca políticas ni tablas en uso: va primero y sola. La PARTE 2
-- (`20261001130100_descuento_por_etiqueta_con_el_modulo_politica.sql`) va después y sola.
-- Re-ejecutable. Se pega en producción tal cual (todo lleva `retail.` o el `set search_path`).
-- Requiere 20260923130000 (`fn_puede_editar_etiquetas`).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ==================== 1. La capacidad: líder, o un rol que ve Etiquetas ====================
create or replace function retail.fn_puede_dar_descuento_por_etiqueta() returns boolean
language sql stable set search_path = retail, public, extensions
as $$ select retail.fn_puede_editar_etiquetas(); $$;

comment on function retail.fn_puede_dar_descuento_por_etiqueta() is
  'Líder, o un rol que ve Etiquetas (ADR-0293, 20261001130000; antes solo el líder, ADR-0160). Configurar el descuento de una etiqueta, crear una ya con descuento y tocar las que lo llevan. Ponerla a una prenda al CREARLA no pasa por aquí: lo puede hacer quien da de alta el producto.';

-- Sin la distinción «etiqueta con o sin descuento»: es lo mismo que la capacidad de editar etiquetas. Se conserva la firma
-- (y `security definer`) porque la llaman `actualizar_campana_etiqueta` y `etiquetar_variantes`.
create or replace function retail.fn_puede_tocar_etiqueta(p_etiqueta_id uuid, p_descuento_nuevo numeric default null)
returns boolean
language sql stable security definer set search_path = retail, public, extensions
as $$ select retail.fn_puede_editar_etiquetas(); $$;

comment on function retail.fn_puede_tocar_etiqueta(uuid, numeric) is
  'ADR-0293 (20261001130000): quien ve Etiquetas (o el líder) toca cualquier etiqueta, con descuento o sin él. Antes, una con descuento era solo del líder (ADR-0161).';

comment on function retail.fn_puede_editar_etiquetas() is
  'Líder, o un rol que ve Etiquetas (ADR-0161, 20260923130000; ADR-0293, 20261001130000). Crear, editar, aprobar y archivar etiquetas, con descuento o sin él; configurar su campaña; etiquetar prendas con ellas.';

-- ==================== 2. Reemplazos sobre la definición VIVA ====================
-- Quita un bloque que coincide EXACTAMENTE una vez con un patrón (regex) de la definición real de una función. Si ya no
-- tiene la marca, no hace nada (re-ejecución). Si el bloque cambió, aborta con un mensaje claro y no deja nada a medias.
create or replace function pg_temp.quitar_guardia(p_firma text, p_marca text, p_patron text, p_reemplazo text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  if to_regprocedure(p_firma) is null then
    raise exception '% no existe en esta base: esta migración se escribió contra producción. Revisa qué cambió.', p_firma;
  end if;
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_marca in v_def) = 0 then
    return; -- ya aplicada
  end if;
  v_n := coalesce((select count(*) from regexp_matches(v_def, p_patron, 'g')), 0);
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: se esperaba 1 guardia de descuento y hay %. Regenera el reemplazo desde su definición real.', p_firma, v_n;
  end if;
  execute regexp_replace(v_def, p_patron, p_reemplazo);
end;
$f$;

-- Cambia un texto cosmético (un mensaje). Si el texto no está (ya cambiado, o producción lo tiene distinto), se salta: un
-- mensaje no justifica abortar el cambio de permisos.
create or replace function pg_temp.cambiar_mensaje(p_firma text, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $f$
declare
  v_def text;
begin
  if to_regprocedure(p_firma) is null then
    raise notice '% no existe en esta base; se omite.', p_firma;
    return;
  end if;
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_viejo in v_def) = 0 then
    return;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

do $$
begin
  -- Al CREAR la prenda: quien pasó el candado de la primera línea (`fn_puede_editar_catalogo`) la etiqueta como quiera.
  perform pg_temp.quitar_guardia(
    'retail.crear_producto_con_variantes(text, uuid, jsonb, text, uuid, uuid, uuid, boolean, uuid[], uuid, uuid)',
    'fn_puede_dar_descuento_por_etiqueta',
    $re$[ \t]*if not (?:retail\.)?fn_puede_dar_descuento_por_etiqueta\(\)\s+and exists \(select 1 from (?:retail\.)?etiquetas x where x\.id = any\(coalesce\(p_etiqueta_ids, '\{\}'::uuid\[\]\)\) and x\.descuento_pct is not null\) then\s+raise exception 'Solo un líder puede asignar una etiqueta con descuento\.';\s+end if;\n$re$,
    '  -- ADR-0293 (20261001130000): quien puede dar de alta un producto le pone cualquier etiqueta aprobada, con descuento o sin él.' || chr(10));

  -- Desde la ficha de la prenda: quien llegó hasta aquí (Productos, Categorías y atributos, o Etiquetas) cambia sus etiquetas.
  perform pg_temp.quitar_guardia(
    'retail.actualizar_variantes_etiquetas(jsonb)',
    'fn_puede_dar_descuento_por_etiqueta',
    $re$[ \t]*-- ADR-0161 \(20260923130000\): lo que CAMBIA[^\n]*\n[ \t]*if not coalesce\(retail\.fn_puede_dar_descuento_por_etiqueta\(\), false\) and exists \([^;]*using errcode = '42501';\s+end if;\n$re$,
    '    -- ADR-0293 (20261001130000): poner o quitar una etiqueta con descuento ya no es solo del líder.' || chr(10));

  -- Mensajes que dejaron de ser ciertos.
  perform pg_temp.cambiar_mensaje('retail.actualizar_campana_etiqueta(uuid, numeric, date, date, uuid[])',
    'Poner, cambiar o quitar el descuento de una etiqueta es solo de un líder. Sin descuento, hace falta el módulo Etiquetas en tu rol.',
    'Configurar una campaña necesita el módulo Etiquetas en tu rol.');
  perform pg_temp.cambiar_mensaje('retail.etiquetar_variantes(jsonb)',
    'Solo un líder puede poner o quitar una etiqueta con descuento.',
    'Etiquetar prendas necesita el módulo Etiquetas en tu rol.');
end $$;

-- ==================== 3. El catálogo de módulos ====================
-- «Incluye» es lo que lee la pantalla Roles y accesos: que no diga «sin descuento» cuando ya lo incluye.
update retail.modulos
   set incluye = 'Crear, editar, aprobar y archivar etiquetas, configurar su campaña y descuento, y ponérselas a las prendas'
 where clave = 'etiquetas'
   and incluye is distinct from 'Crear, editar, aprobar y archivar etiquetas, configurar su campaña y descuento, y ponérselas a las prendas';

-- ==================== 4. Verificación: ningún candado de descuento quedó a medias ====================
do $$
begin
  if pg_get_functiondef('retail.fn_puede_dar_descuento_por_etiqueta()'::regprocedure) not like '%fn_puede_editar_etiquetas()%' then
    raise exception 'fn_puede_dar_descuento_por_etiqueta no quedó en «líder o Etiquetas»';
  end if;
  if position('fn_puede_dar_descuento_por_etiqueta' in pg_get_functiondef('retail.crear_producto_con_variantes(text, uuid, jsonb, text, uuid, uuid, uuid, boolean, uuid[], uuid, uuid)'::regprocedure)) > 0 then
    raise exception 'crear_producto_con_variantes sigue con la guardia de descuento';
  end if;
  if position('fn_puede_dar_descuento_por_etiqueta' in pg_get_functiondef('retail.actualizar_variantes_etiquetas(jsonb)'::regprocedure)) > 0 then
    raise exception 'actualizar_variantes_etiquetas sigue con la guardia de descuento';
  end if;
end $$;
