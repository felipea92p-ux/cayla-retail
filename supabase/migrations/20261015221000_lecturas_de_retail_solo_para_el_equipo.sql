-- ============================================================================
-- 20261015221000_lecturas_de_retail_solo_para_el_equipo.sql — CAYLA V2
-- Las lecturas y altas que preguntaban «¿tiene sesión?» pasan a preguntar «¿es del equipo de retail?».
--
-- EL PROBLEMA PRIMERO. 35 reglas de fila de `retail` (el catálogo, las sedes, los proveedores, los códigos de descuento,
-- las cotizaciones de maquila, los insumos, los activos y el vocabulario de colores, tallas, tejidos y patrones) dejaban
-- pasar a toda cuenta con sesión: `(select auth.role()) = 'authenticated'`, o `using (true)` en `modulos`. Nacieron cuando
-- solo el equipo tenía cuenta. Pero las cuentas son las del proyecto que retail comparte con Dynamic: una cuenta de Dynamic
-- que no trabaja en retail también pasaba, y el día que un cliente tenga cuenta (el módulo de clientes) pasaría igual.
-- «Tener sesión» no es «ser del equipo».
--
-- QUÉ CAMBIA. Esas 35 reglas preguntan `retail.fn_tiene_acceso_retail()`: una persona activa con colaborador activo, o una
-- terminal activa de una sede activa (20260930050000). Es la misma puerta que ya usan las lecturas de Proveedores y
-- Existencias. Va envuelta en `(select …)` para que Postgres la evalúe una vez por consulta y no una por fila.
--   · `etiquetas_insert_autenticado` conserva su segunda condición: una etiqueta con descuento sigue pidiendo
--     `fn_puede_dar_descuento_por_etiqueta()`.
--   · `gastos_legado_2026_09` solo existe en producción (20260924235100 la renombró allá): si la tabla no está, se salta.
--
-- QUÉ NO CAMBIA.
--   · Para el equipo y las terminales, nada: ven lo mismo que ayer. Lo que ve cada cuenta lo sigue decidiendo su rol
--     (ADR-0161) en cada pantalla; esto solo dice quién es «del equipo».
--   · Dynamic no lee ninguna de estas tablas (registros de la API del 2026-10-15): su app sigue igual.
--   · Las funciones `security definer` (el Club, los trabajos programados con la llave de servicio) no pasan por estas
--     reglas, así que tampoco cambian.
--   · Las escrituras de catálogo siguen como estaban (solo líder, por función); aquí solo cambian las ALTAS directas de
--     vocabulario, que ahora también piden ser del equipo.
--
-- ORDEN AL PEGAR. Va sola y es UNA sola parte: solo `alter policy`, ninguna tabla se altera (ADR-0195: no se mezclan
-- políticas con `alter` de tablas en uso). Cada `alter policy` toma la tabla un instante; con `lock_timeout` de 3 s, si la
-- tienda la tiene ocupada, falla limpio sin aplicar nada y se vuelve a pegar. Mejor fuera del horario de tienda.
--
-- GUARDIA. Si falta `fn_tiene_acceso_retail()` se detiene antes de tocar nada. Se puede pegar dos veces: `alter policy`
-- deja el mismo resultado, y una regla o una tabla que no existe se salta.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $$
declare
  -- (tabla, regla, 'using' para leer | 'check' para dar de alta)
  r record;
  v_alteradas integer := 0;
begin
  if to_regprocedure('retail.fn_tiene_acceso_retail()') is null then
    raise exception 'Falta retail.fn_tiene_acceso_retail(): pega antes 20260930050000_terminales_pasan_la_puerta_de_lectura.sql.';
  end if;

  for r in
    select * from (values
      ('activos_fijos',            'activos_fijos_select',            'using'),
      ('categoria_patrones',       'categoria_patrones_select',       'using'),
      ('categoria_tallas',         'categoria_tallas_select',         'using'),
      ('categoria_tejidos',        'categoria_tejidos_select',        'using'),
      ('categorias',               'categorias_select',               'using'),
      ('codigos_barras',           'codigos_barras_select',           'using'),
      ('codigos_correlativos',     'codigos_correlativos_select',     'using'),
      ('codigos_descuento',        'codigos_descuento_select',        'using'),
      ('colores',                  'colores_select',                  'using'),
      ('colores',                  'colores_insert_autenticado',      'check'),
      ('configuracion_empresa',    'configuracion_empresa_select',    'using'),
      ('cotizaciones_maquila',     'cotizaciones_maquila_select',     'using'),
      ('etiqueta_categorias',      'etiqueta_categorias_select',      'using'),
      ('etiquetas',                'etiquetas_select',                'using'),
      ('familias',                 'familias_select',                 'using'),
      ('gastos_legado_2026_09',    'gastos_select',                   'using'),
      ('insumos',                  'insumos_select_autenticado',      'using'),
      ('marca_proveedores',        'marca_proveedores_select',        'using'),
      ('marcas',                   'marcas_select',                   'using'),
      ('modulos',                  'modulos_select',                  'using'),
      ('patrones',                 'patrones_select',                 'using'),
      ('patrones',                 'patrones_insert_autenticado',     'check'),
      ('producto_fotos',           'producto_fotos_select',           'using'),
      ('productos',                'productos_select',                'using'),
      ('proveedores',              'proveedores_select',              'using'),
      ('sububicaciones',           'sububicaciones_select',           'using'),
      ('tallas',                   'tallas_select',                   'using'),
      ('tallas',                   'tallas_insert_autenticado',       'check'),
      ('tejidos',                  'tejidos_select',                  'using'),
      ('tejidos',                  'tejidos_insert_autenticado',      'check'),
      ('ubicacion_datos_fiscales', 'ubicacion_datos_fiscales_select', 'using'),
      ('ubicaciones',              'ubicaciones_select',              'using'),
      ('variante_etiquetas',       'variante_etiquetas_select',       'using'),
      ('variantes',                'variantes_select',                'using')
    ) as t(tabla, regla, tipo)
  loop
    continue when not exists (
      select 1 from pg_policies p where p.schemaname = 'retail' and p.tablename = r.tabla and p.policyname = r.regla
    );
    if r.tipo = 'using' then
      execute format('alter policy %I on retail.%I using ((select retail.fn_tiene_acceso_retail()))', r.regla, r.tabla);
    else
      execute format('alter policy %I on retail.%I with check ((select retail.fn_tiene_acceso_retail()))', r.regla, r.tabla);
    end if;
    v_alteradas := v_alteradas + 1;
  end loop;

  -- La etiqueta con descuento sigue pidiendo su permiso propio (20261001130100).
  if exists (select 1 from pg_policies p where p.schemaname = 'retail' and p.tablename = 'etiquetas'
                                         and p.policyname = 'etiquetas_insert_autenticado') then
    alter policy etiquetas_insert_autenticado on retail.etiquetas
      with check ((select retail.fn_tiene_acceso_retail())
                  and (descuento_pct is null or (select retail.fn_puede_dar_descuento_por_etiqueta())));
    v_alteradas := v_alteradas + 1;
  end if;

  raise notice 'Reglas que ahora piden ser del equipo: %', v_alteradas;
end $$;

reset lock_timeout;
