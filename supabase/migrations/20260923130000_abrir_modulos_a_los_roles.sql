-- ============================================================================
-- 20260923130000_abrir_modulos_a_los_roles.sql — CAYLA V2 · ADR-0161 B (roles por módulo), decisión del 2026-09-22
--
-- EL PROBLEMA PRIMERO. Cinco módulos de Roles y accesos salían como «Solo líder por ahora» (`retail.modulos.delegable =
-- false`): Etiquetas, Facturas de compra, Por pagar, Notas de crédito y Análisis. No era una decisión de negocio, era una
-- deuda técnica: sus funciones todavía preguntaban `fn_es_lider()` y encenderlos en un rol abría pantallas que fallaban al
-- guardar. Felipe decidió (2026-09-22) que los cinco se pueden dar a cualquier rol, y que quien tenga el módulo lo usa
-- completo («quien ve un módulo hace todo lo que hay en él»).
--
-- LAS DECISIONES (Felipe, 2026-09-22)
--   1. Los 5 módulos pasan a `delegable = true`.
--   2. Colaboradores, y Roles y accesos, siguen siendo SOLO del líder (`solo_lider`): esta migración no los toca.
--   3. Los MONTOS de Compras (el ADR-0126 decía «solo el líder») los ve quien tenga Facturas de compra, Por pagar o Notas
--      de crédito (esta última sin montos no sirve). «Ver costos, márgenes y montos de Compras» sale de la lista
--      «siempre solo del líder».
--   4. Lo demás de esa lista se queda: anular venta/comprobante y series SUNAT, autorizar descuento sobre el tope, aprobar
--      devoluciones, PONER ETIQUETAS CON DESCUENTO a una prenda (`fn_puede_dar_descuento_por_etiqueta` no cambia),
--      Colaboradores y Roles.
--
-- CÓMO SE HACE (patrón del ADR-0160/0162). Cada función se cambia desde su definición VIVA (`pg_get_functiondef`), nunca
-- copiando cuerpos del repo: en producción se pegan a mano y el repo puede ir atrás o adelante. Cada reemplazo EXIGE el
-- número exacto de ocurrencias; si la función cambió desde que se escribió esto, la migración aborta con un mensaje claro
-- y no deja nada a medias. Re-ejecutable: lo que ya tiene el texto nuevo se salta.
--
-- ─────────────────────────────── CLASIFICACIÓN (inventario de producción, 2026-09-22) ───────────────────────────────
-- Cada `fn_es_lider()` que se encontró en funciones y políticas relacionadas con estos 5 módulos, y QUÉ protegía:
--
-- A. COMPRAS — el dinero y el permiso de registrar (Facturas de compra, Por pagar, Notas de crédito)
--    CAMBIAN:
--    · fn_puede_registrar_compras()        protegía ESCRIBIR en Compras (registrar/anular factura, pagos, notas de
--                                          crédito, reembolsos, adjuntos, reparto) → líder o un rol con cualquiera de
--                                          los 3 módulos. Una sola capacidad para los tres, igual que las del ADR-0161
--                                          C3: las ~15 funciones que la llaman no se tocan (una nota de crédito o un
--                                          pago necesitan registrar sobre la misma factura).
--    · fn_puede_ver_dinero_de_compras()    protegía VER montos (5 tablas, el bucket de escaneos, las 5 funciones del
--                                          ADR-0126 vía fn_exige_dinero_de_compras) → mismo criterio, escrito aparte
--                                          (ADR-0126 D1: la regla del dinero vive en UN lugar y puede separarse).
--    · fn_exige_dinero_de_compras(text)    solo su MENSAJE («Solo un líder puede ver …» ya no es verdad).
--    · fn_puede_ver_compra(uuid)           «líder, o la compra tiene destino en mi sede». El `fn_es_lider()` protegía VER
--                                          TODAS LAS SEDES. Compras es de la empresa, no de una tienda: una factura se
--                                          reparte entre tiendas (ADR-0139) y las tablas ya se le abren enteras a quien
--                                          ve el dinero (compras_select = fn_puede_ver_dinero_de_compras, sin sede). Si
--                                          la función siguiera diciendo «solo tu sede», los totales del tablero y la
--                                          lista dirían cosas distintas. → fn_puede_ver_dinero_de_compras() o su sede.
--    · fn_proveedores() (13), fn_proveedores_resumen() (10), fn_proveedores_serie_12m() (1),
--      fn_proveedor_metricas_compras(uuid) (1), fn_proveedor_costo_evolucion(uuid, integer) (1)
--                                          protegían MONTOS de Compras por proveedor (facturado, saldo, vencido, serie
--                                          de 12 meses, costo por compra) → fn_puede_ver_dinero_de_compras().
--    · registrar_gasto(…) — SOLO EN PRODUCCIÓN, sin pantalla en el repo. Preguntaba fn_puede_registrar_compras() para
--                                          registrar un GASTO (no una compra: sale de caja, sin proveedor obligatorio).
--                                          Abrir Compras no debe abrir gastos, que no son ninguno de los 5 módulos → se
--                                          fija en fn_es_lider(): queda EXACTAMENTE como estaba (solo líder).
--    NO CAMBIAN:
--    · fn_deuda_consolidada(), fn_igv_credito_fiscal(date): suman Compras CON Producción (comprobantes del Taller) y solo
--      las lee Producción ▸ Por pagar, que es del líder. Abrirlas destaparía el dinero del Taller.
--    · fn_proveedor_devoluciones(uuid) (unidades devueltas, no dinero) y fn_proveedor_metricas_insumos(uuid) (Taller):
--      viven en la ficha del proveedor, que sigue siendo del líder.
--    · listar_compras_operativo, lineas_compra_operativo, recibir_envio: el `es_lider` decide la SEDE que se mira al
--      RECIBIR (módulo Recibir mercadería, que no es de estos 5).
--    · registrar/actualizar/desactivar/reactivar_proveedor: módulo Proveedores (ya delegable); no es de estos 5.
--
-- B. ETIQUETAS — crear, editar y archivar etiquetas SIN descuento; lo que lleva descuento sigue siendo del líder
--    Nueva: fn_puede_editar_etiquetas() = líder o un rol con Etiquetas. Nueva: fn_puede_tocar_etiqueta(etiqueta, descuento
--    nuevo) = quien da descuentos (el líder), o quien edita etiquetas si la etiqueta NO tiene descuento y no se le pone uno.
--    CAMBIAN:
--    · fn_etiquetas_estado_trigger()       `if fn_es_lider()` decidía si una etiqueta nueva nace APROBADA o como
--                                          propuesta pendiente → fn_puede_editar_etiquetas() (igual que colores/tallas con
--                                          fn_puede_editar_catalogo).
--    · política etiquetas_update_lider     editar/aprobar/rechazar/archivar → se reemplaza por `etiquetas_update`: el líder
--                                          siempre; con el módulo, solo filas SIN descuento (antes y después del cambio).
--    · actualizar_campana_etiqueta(…)      configurar la campaña → fn_puede_tocar_etiqueta(etiqueta, descuento): fechas y
--                                          categorías de una etiqueta sin descuento sí; poner, cambiar o quitar el
--                                          descuento, solo el líder.
--    · etiquetar_variantes(jsonb)          «Prendas» de una etiqueta → con el módulo; y por cada etiqueta del lote, si
--                                          lleva descuento, solo el líder (poner O quitar: las dos cambian el precio).
--    · actualizar_variantes_etiquetas(jsonb) las etiquetas de una prenda desde su ficha → con el módulo; y la diferencia
--                                          (lo que se pone y lo que se quita) no puede tocar una etiqueta con descuento.
--    NO CAMBIAN:
--    · fn_puede_dar_descuento_por_etiqueta() (sigue = fn_es_lider()), la política etiquetas_insert_autenticado (cualquiera
--      propone una etiqueta SIN descuento; con descuento, solo el líder) y la validación de crear_producto_con_variantes.
--    · Las políticas de escritura directa etiqueta_categorias_write_lider y variante_etiquetas_write_lider: la web escribe
--      esas tablas SOLO por las RPC de arriba (security definer). La puerta es la RPC; la tabla sigue cerrada.
--
-- C. ANÁLISIS — reportes de ventas e inventario de UNA sede
--    Nueva: fn_puede_analizar() = líder o un rol con Análisis.
--    CAMBIAN:
--    · fn_resumen_comparacion(…)           `fn_puede_operar_ubicacion(sede) and fn_es_lider()` → `… and
--                                          fn_puede_analizar()`. Un rol con Análisis analiza SU sede (no elige otra).
--    · fn_resumen_variantes(…)             el CTE `lider` protegía dos columnas: `costo`/`estado_costo` y `en_red` (stock
--                                          de las otras sedes). Son parte del análisis (márgenes, de dónde reponer) →
--                                          fn_puede_analizar(). OJO: esta función también la lee Existencias; quien tenga
--                                          Análisis verá ahí el costo y el stock de la red. Es la regla: quien ve el módulo
--                                          ve lo que el módulo muestra.
--    NO CAMBIAN: fn_ventas_del_dia (sede que se mira, no análisis), fn_costos_producciones / fn_costos_insumos_taller
--    (Producción), el Resumen de Producción (sigue del líder).
--
-- SE ROMPE SI
--   · Se vuelve a pegar 20260923030000 entero: su `insert … on conflict do update` devuelve los 5 a `delegable = false`
--     y los roles que los tengan dejan de recibirlos (falla CERRADO: pierden poder, nunca lo ganan). Volver a pegar esta.
--   · Otra migración recrea una de estas funciones copiando su cuerpo VIEJO: vuelve «solo el líder» (también cerrado).
--     `pnpm pruebas:roles` y `pnpm pruebas:dinero-compras` lo detectan.
--   · Se pega el ADR-0151 (comprador de tienda) con su propio cuerpo de fn_puede_ver_dinero_de_compras: esta regla hay
--     que volver a sumarla allí.
--
-- Re-ejecutable. En el repo SIN prefijo en lo que el search_path resuelve; al pegar en el SQL Editor de producción,
-- empezar con `set search_path to retail, public, extensions;` (todo lo que toca esta migración ya va con `retail.`).
-- Requiere 20260923030000_roles_por_modulo.sql (`fn_capacidad_por_modulos`).
-- ============================================================================

set search_path = retail, public, extensions;

do $$
begin
  if to_regprocedure('retail.fn_capacidad_por_modulos(text[])') is null then
    raise exception 'Falta la migración de roles por módulo (retail.fn_capacidad_por_modulos): pega antes 20260923030000_roles_por_modulo.sql';
  end if;
end $$;

-- ==================== 0. Herramienta temporal (vive en pg_temp, desaparece al cerrar la sesión) ====================
-- Reemplaza un texto EXACTO en la definición real de una función, exigiendo `p_veces` ocurrencias. Si ya tiene el texto
-- nuevo, no hace nada (re-ejecución). `p_opcional`: si la función no existe en esta base, se omite con aviso.
create or replace function pg_temp.reemplazar_vivo(p_firma text, p_viejo text, p_nuevo text, p_veces integer, p_opcional boolean default false)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  if to_regprocedure(p_firma) is null then
    if p_opcional then
      raise notice '% no existe en esta base; se omite.', p_firma;
      return;
    end if;
    raise exception '% no existe en esta base: esta migración se escribió contra producción. Revisa qué cambió.', p_firma;
  end if;
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then
    return; -- ya aplicada
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % ocurrencias de "%" y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ==================== 1. Capacidades nuevas ====================
-- Mismo molde que las 4 del ADR-0161 C3: `language sql stable`, sin definer; «líder o un rol que ve el módulo».
-- `fn_capacidad_por_modulos` respeta rol archivado, rol fijo, rol `limitado_como_hoy` y módulo delegable.
create or replace function retail.fn_puede_editar_etiquetas() returns boolean
language sql stable set search_path = retail, public, extensions
as $$ select retail.fn_es_lider() or retail.fn_capacidad_por_modulos(array['etiquetas']); $$;

comment on function retail.fn_puede_editar_etiquetas() is
  'Líder, o un rol que ve Etiquetas (ADR-0161, 20260923130000). Crear, editar, aprobar y archivar etiquetas SIN descuento; etiquetar prendas con ellas. Lo que lleva descuento: fn_puede_dar_descuento_por_etiqueta (solo líder).';

-- ¿Puede tocar ESTA etiqueta? El líder, siempre. Con el módulo, solo si la etiqueta no tiene descuento y no se le pone
-- uno. Security definer: lee `etiquetas` sin depender de la RLS de quien llama.
create or replace function retail.fn_puede_tocar_etiqueta(p_etiqueta_id uuid, p_descuento_nuevo numeric default null)
returns boolean
language sql stable security definer set search_path = retail, public, extensions
as $$
  select coalesce(retail.fn_puede_dar_descuento_por_etiqueta(), false)
      or (retail.fn_puede_editar_etiquetas()
          and p_descuento_nuevo is null
          and not exists (select 1 from retail.etiquetas e where e.id = p_etiqueta_id and e.descuento_pct is not null));
$$;

comment on function retail.fn_puede_tocar_etiqueta(uuid, numeric) is
  'ADR-0161 (20260923130000): quien da descuentos por etiqueta (el líder) toca cualquier etiqueta; quien ve Etiquetas, solo una SIN descuento y sin ponerle uno.';

create or replace function retail.fn_puede_analizar() returns boolean
language sql stable set search_path = retail, public, extensions
as $$ select retail.fn_es_lider() or retail.fn_capacidad_por_modulos(array['analisis']); $$;

comment on function retail.fn_puede_analizar() is
  'Líder, o un rol que ve Análisis (ADR-0161, 20260923130000). Reportes de ventas e inventario de su sede, con costo y stock de la red.';

do $$
declare
  v_f text;
begin
  foreach v_f in array array['retail.fn_puede_editar_etiquetas()', 'retail.fn_puede_tocar_etiqueta(uuid, numeric)', 'retail.fn_puede_analizar()'] loop
    execute format('revoke all on function %s from public, anon', v_f);
    execute format('grant execute on function %s to authenticated', v_f);
  end loop;
end $$;

-- ==================== 2. Compras: registrar y ver el dinero ====================
do $$
begin
  -- Registrar en Compras (y todo lo que cuelga de la factura: pagos, notas, reembolsos, adjuntos, reparto).
  perform pg_temp.reemplazar_vivo('retail.fn_puede_registrar_compras()',
    'select fn_es_lider();',
    $n$select retail.fn_es_lider() or retail.fn_capacidad_por_modulos(array['facturas_compra', 'por_pagar', 'notas_credito']);$n$,
    1);
  -- Ver los montos. Hoy dice lo mismo que registrar, pero se escribe aparte a propósito (ADR-0126 D1).
  perform pg_temp.reemplazar_vivo('retail.fn_puede_ver_dinero_de_compras()',
    'select retail.fn_puede_registrar_compras();',
    $n$select retail.fn_es_lider() or retail.fn_capacidad_por_modulos(array['facturas_compra', 'por_pagar', 'notas_credito']);$n$,
    1);
  -- El mensaje: ya no es «solo un líder».
  perform pg_temp.reemplazar_vivo('retail.fn_exige_dinero_de_compras(text)',
    'Solo un líder puede ver %.',
    'Solo un líder o un rol con Facturas de compra, Por pagar o Notas de crédito puede ver %.',
    1);
  -- Todas las sedes para quien ve el dinero; su sede para el resto (Recibir).
  perform pg_temp.reemplazar_vivo('retail.fn_puede_ver_compra(uuid)',
    'fn_es_lider()',
    'retail.fn_puede_ver_dinero_de_compras()',
    1);
  -- Montos por proveedor.
  perform pg_temp.reemplazar_vivo('retail.fn_proveedores()',
    'when fn_es_lider() then', 'when retail.fn_puede_ver_dinero_de_compras() then', 13);
  perform pg_temp.reemplazar_vivo('retail.fn_proveedores_resumen()',
    'when fn_es_lider()', 'when retail.fn_puede_ver_dinero_de_compras()', 10);
  perform pg_temp.reemplazar_vivo('retail.fn_proveedores_serie_12m()',
    'where retail.fn_es_lider()', 'where retail.fn_puede_ver_dinero_de_compras()', 1);
  perform pg_temp.reemplazar_vivo('retail.fn_proveedor_metricas_compras(uuid)',
    'if not fn_es_lider() then', 'if not retail.fn_puede_ver_dinero_de_compras() then', 1);
  perform pg_temp.reemplazar_vivo('retail.fn_proveedor_costo_evolucion(uuid, integer)',
    'if not fn_es_lider() then', 'if not retail.fn_puede_ver_dinero_de_compras() then', 1);
  -- Gastos: NO es de estos módulos. Se queda solo del líder, exactamente como estaba (solo existe en producción).
  perform pg_temp.reemplazar_vivo('retail.registrar_gasto(uuid, text, numeric, text, uuid, text, text, text, numeric, text, uuid)',
    'if not fn_puede_registrar_compras() then',
    'if not retail.fn_es_lider() then -- 20260923130000: gastos no es de Compras; abrir Compras a un rol no abre gastos',
    1, true);
end $$;

comment on function retail.fn_puede_registrar_compras() is
  'Líder, o un rol que ve Facturas de compra, Por pagar o Notas de crédito (ADR-0161, 20260923130000; antes solo líder). Registrar y anular facturas, pagos, notas de crédito, reembolsos, adjuntos y reparto.';
comment on function retail.fn_puede_ver_dinero_de_compras() is
  'ADR-0126 D1, cambiada por ADR-0161 (20260923130000): líder, o un rol que ve Facturas de compra, Por pagar o Notas de crédito. La regla del dinero de Compras vive SOLO aquí.';

-- ==================== 3. Etiquetas: con el módulo, lo que no lleva descuento ====================
do $$
begin
  -- Una etiqueta que crea quien tiene el módulo nace aprobada (como la de un líder); la de cualquier otro, propuesta.
  perform pg_temp.reemplazar_vivo('retail.fn_etiquetas_estado_trigger()',
    'if retail.fn_es_lider() then', 'if retail.fn_puede_editar_etiquetas() then', 1);

  -- Configurar la campaña.
  perform pg_temp.reemplazar_vivo('retail.actualizar_campana_etiqueta(uuid, numeric, date, date, uuid[])',
    'if not retail.fn_es_lider() then',
    'if not retail.fn_puede_tocar_etiqueta(p_etiqueta_id, p_descuento_pct) then',
    1);
  perform pg_temp.reemplazar_vivo('retail.actualizar_campana_etiqueta(uuid, numeric, date, date, uuid[])',
    $v$'Solo un Líder puede configurar una campaña.'$v$,
    $v$'Poner, cambiar o quitar el descuento de una etiqueta es solo de un líder. Sin descuento, hace falta el módulo Etiquetas en tu rol.' using errcode = '42501'$v$,
    1);

  -- «Prendas» de una etiqueta.
  perform pg_temp.reemplazar_vivo('retail.etiquetar_variantes(jsonb)',
    'if not retail.fn_es_lider() then', 'if not retail.fn_puede_editar_etiquetas() then', 1);
  perform pg_temp.reemplazar_vivo('retail.etiquetar_variantes(jsonb)',
    $v$'Solo un Líder puede etiquetar prendas.'$v$,
    $v$'Etiquetar prendas necesita el módulo Etiquetas en tu rol.' using errcode = '42501'$v$,
    1);
  perform pg_temp.reemplazar_vivo('retail.etiquetar_variantes(jsonb)',
    'if coalesce(array_length(v_agregar, 1), 0) > 0 then',
    $v$-- ADR-0161 (20260923130000): poner o quitar una etiqueta CON descuento cambia el precio en caja: solo el líder.
    if not retail.fn_puede_tocar_etiqueta(v_etiqueta_id) then
      raise exception 'Solo un líder puede poner o quitar una etiqueta con descuento.' using errcode = '42501';
    end if;

    if coalesce(array_length(v_agregar, 1), 0) > 0 then$v$,
    1);

  -- Las etiquetas de una prenda desde su ficha.
  perform pg_temp.reemplazar_vivo('retail.actualizar_variantes_etiquetas(jsonb)',
    'if not retail.fn_es_lider() then', 'if not retail.fn_puede_editar_etiquetas() then', 1);
  perform pg_temp.reemplazar_vivo('retail.actualizar_variantes_etiquetas(jsonb)',
    $v$'Solo un Líder puede aplicar etiquetas a una variante.'$v$,
    $v$'Aplicar etiquetas a una prenda necesita el módulo Etiquetas en tu rol.' using errcode = '42501'$v$,
    1);
  perform pg_temp.reemplazar_vivo('retail.actualizar_variantes_etiquetas(jsonb)',
    'delete from retail.variante_etiquetas where variante_id = v_variante_id;',
    $v$-- ADR-0161 (20260923130000): lo que CAMBIA (se pone o se quita) no puede ser una etiqueta con descuento, salvo el líder.
    if not coalesce(retail.fn_puede_dar_descuento_por_etiqueta(), false) and exists (
      select 1 from retail.etiquetas e
       where e.descuento_pct is not null
         and (e.id = any (coalesce(v_etiqueta_ids, '{}'::uuid[])))
             is distinct from exists (select 1 from retail.variante_etiquetas ve where ve.variante_id = v_variante_id and ve.etiqueta_id = e.id)
    ) then
      raise exception 'Solo un líder puede poner o quitar una etiqueta con descuento.' using errcode = '42501';
    end if;
    delete from retail.variante_etiquetas where variante_id = v_variante_id;$v$,
    1);
end $$;

-- La política de edición: se verifica que la vieja sea la que se inventarió antes de reemplazarla.
do $$
declare
  v_pol record;
begin
  select qual, with_check into v_pol from pg_policies
   where schemaname = 'retail' and tablename = 'etiquetas' and policyname = 'etiquetas_update_lider';
  if found then
    -- pg_policies escribe la expresión según el search_path de la sesión: con `retail` primero sale sin prefijo.
    if coalesce(v_pol.qual, '') !~ '^(retail\.)?fn_es_lider\(\)$' or coalesce(v_pol.with_check, '') !~ '^(retail\.)?fn_es_lider\(\)$' then
      raise exception 'La política etiquetas_update_lider cambió desde que se escribió esta migración (using: %, with check: %). Revísala a mano.',
        v_pol.qual, v_pol.with_check;
    end if;
    drop policy etiquetas_update_lider on retail.etiquetas;
  end if;
end $$;

drop policy if exists etiquetas_update on retail.etiquetas;
create policy etiquetas_update on retail.etiquetas for update
  using (retail.fn_puede_dar_descuento_por_etiqueta() or (retail.fn_puede_editar_etiquetas() and descuento_pct is null))
  with check (retail.fn_puede_dar_descuento_por_etiqueta() or (retail.fn_puede_editar_etiquetas() and descuento_pct is null));

comment on policy etiquetas_update on retail.etiquetas is
  'ADR-0161 (20260923130000): el líder edita cualquier etiqueta; un rol con Etiquetas, solo las que no tienen descuento (y no puede ponerles uno). Reemplaza a etiquetas_update_lider.';

-- ==================== 4. Análisis ====================
do $$
begin
  perform pg_temp.reemplazar_vivo('retail.fn_resumen_comparacion(uuid, date, date, date, date)',
    'fn_puede_operar_ubicacion(p_ubicacion_id) and fn_es_lider() as ok',
    'fn_puede_operar_ubicacion(p_ubicacion_id) and retail.fn_puede_analizar() as ok',
    1);
  perform pg_temp.reemplazar_vivo('retail.fn_resumen_variantes(uuid, integer, date, date, date, date)',
    'select fn_es_lider() as ok',
    'select retail.fn_puede_analizar() as ok',
    1);
end $$;

-- ==================== 5. Verificación: ningún candado de la lista quedó a medias ====================
do $$
declare
  v_malas text[];
begin
  select array_agg(f) into v_malas from (values
    ('retail.fn_puede_registrar_compras()', 'fn_capacidad_por_modulos'),
    ('retail.fn_puede_ver_dinero_de_compras()', 'fn_capacidad_por_modulos'),
    ('retail.fn_puede_ver_compra(uuid)', 'fn_puede_ver_dinero_de_compras()'),
    ('retail.fn_proveedores()', 'fn_puede_ver_dinero_de_compras()'),
    ('retail.fn_proveedores_resumen()', 'fn_puede_ver_dinero_de_compras()'),
    ('retail.fn_etiquetas_estado_trigger()', 'fn_puede_editar_etiquetas()'),
    ('retail.actualizar_campana_etiqueta(uuid, numeric, date, date, uuid[])', 'fn_puede_tocar_etiqueta('),
    ('retail.etiquetar_variantes(jsonb)', 'fn_puede_tocar_etiqueta('),
    ('retail.actualizar_variantes_etiquetas(jsonb)', 'fn_puede_dar_descuento_por_etiqueta()'),
    ('retail.fn_resumen_comparacion(uuid, date, date, date, date)', 'fn_puede_analizar()'),
    ('retail.fn_resumen_variantes(uuid, integer, date, date, date, date)', 'fn_puede_analizar()')
  ) x(f, texto)
  where position(texto in pg_get_functiondef(f::regprocedure)) = 0;
  if v_malas is not null then
    raise exception 'Quedaron sin el candado nuevo: %', v_malas;
  end if;
  -- Lo que NO debía abrirse sigue diciendo solo el líder.
  if pg_get_functiondef('retail.fn_puede_dar_descuento_por_etiqueta()'::regprocedure) not like '%fn_es_lider()%' then
    raise exception 'fn_puede_dar_descuento_por_etiqueta dejó de ser solo del líder: no es lo que decidió Felipe';
  end if;
end $$;

-- ==================== 6. Los 5 módulos se pueden dar a un rol ====================
-- AL FINAL a propósito: si algo de arriba abortó, los módulos siguen «Solo líder por ahora» (falla cerrado).
update retail.modulos set delegable = true
 where clave in ('etiquetas', 'facturas_compra', 'por_pagar', 'notas_credito', 'analisis') and not delegable;
