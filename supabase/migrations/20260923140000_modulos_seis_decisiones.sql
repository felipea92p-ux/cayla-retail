-- ============================================================================
-- 20260923140000_modulos_seis_decisiones.sql — CAYLA V2 · ADR-0161, las 6 decisiones de Felipe (2026-09-22, P1–P6)
--
-- EL PROBLEMA PRIMERO. Las dos migraciones de ayer (20260923130000 y 20260923131000, ya en producción) abrieron los
-- módulos a los roles, pero con cortes gruesos que Felipe revisó y corrigió en seis puntos:
--   P1. Compras usaba UNA sola llave para escribir (`fn_puede_registrar_compras` = Facturas de compra, Por pagar o Notas
--       de crédito). Un rol con solo «Por pagar» podía anular facturas; uno con solo «Notas de crédito», pagar. Cada
--       módulo tiene que hacer SOLO lo suyo.
--   P2. Recibir mercadería le escondía los montos a todo el que no fuera líder, aunque su rol ya viera el dinero de Compras.
--   P3. La ficha de un proveedor y su alta/edición/archivo seguían siendo solo del líder, aunque el rol tuviera el módulo
--       Proveedores (la terminal de almacén lo tiene y no podía ni abrir la ficha).
--   P4. Cambiar las etiquetas SIN descuento desde la ficha de la prenda exigía el módulo Etiquetas; quien edita Productos
--       tenía el botón y la base lo rechazaba.
--   P5. Quien tenía Análisis veía, en Existencias, el costo y el stock de las OTRAS sedes (`fn_resumen_variantes`).
--   P6. Colaboradores y Roles y accesos podían terminar en el rol de una TERMINAL: un aparato compartido de mostrador que
--       da y quita accesos. Esos dos módulos se dan solo a PERSONAS.
--
-- ANALOGÍA CAYLA. Es la caja de llaves del taller: ayer se colgó una llave maestra de «Compras» que abría tres puertas
-- (facturas, pagos, notas). Hoy cada puerta tiene su llave; la de «ver cuánta plata hay» sigue siendo una sola y la
-- tienen los tres. Y la llave de «quién entra» (Colaboradores, Roles) no se cuelga nunca en el mostrador.
--
-- CÓMO SE HACE (patrón del ADR-0160/0162 y de 20260923130000). Cada función se cambia desde su definición VIVA
-- (`pg_get_functiondef`), nunca copiando cuerpos del repo. Cada reemplazo EXIGE el número exacto de ocurrencias
-- (inventario hecho contra producción el 2026-09-22 con `execute_sql` de solo lectura); si una función cambió desde
-- entonces, la migración aborta con un mensaje claro y no deja nada a medias. Re-ejecutable: lo ya aplicado se salta.
-- La política nueva nace con `(select …)` y al final se corre `retail.fn_rls_una_vez_por_consulta()` (ADR-0176,
-- 20260923152300, ya en producción): así ninguna política queda evaluándose fila por fila.
--
-- ─────────────────────────────── CLASIFICACIÓN DE CADA CANDADO ───────────────────────────────
-- P1 · COMPRAS, cada módulo lo suyo. Tres capacidades nuevas, mismo molde que las del ADR-0161 C3 («líder o un rol que
--      ve el módulo»):
--      fn_puede_registrar_facturas_compra()  ← Facturas de compra
--        · registrar_compra (incluye el pago al CONTADO que viene con la factura: es parte de registrarla)
--        · anular_compra · reasignar_reparto_compra (el reparto entre tiendas es de la factura)
--        · registrar_adjunto_compra / archivar_adjunto_compra — o Notas de crédito cuando el adjunto es de una NOTA
--          (el PDF de la nota lo sube quien la registra).
--      fn_puede_pagar_compras()              ← Por pagar
--        · registrar_pago_compras · registrar_pago_compras_medios · registrar_pagos_compra (y su envoltorio
--          registrar_pago_compra, que la llama) · registrar_reembolso_proveedor (el proveedor devuelve plata a favor).
--      fn_puede_registrar_notas_credito()    ← Notas de crédito
--        · registrar_nota_credito_compra (también cuando llega desde recibir_envio / recibir_y_cerrar_compras con un
--          faltante: quien recibe sin Notas de crédito ya no la registra ahí; antes bastaba cualquiera de los tres).
--      fn_puede_registrar_compras() SE QUEDA como «cualquiera de los tres», solo donde de verdad aplica a los tres —
--      LEER lo que los tres necesitan: compras_nota_pendiente (faltantes cerrados sin nota), fn_proveedor_creditos y la
--      política proveedor_creditos_select (el libro del saldo a favor: lo crea una nota, lo consume un pago o una
--      factura al contado). Ninguna ESCRITURA la usa ya.
--      NO CAMBIA el dinero: fn_puede_ver_dinero_de_compras() sigue siendo «cualquiera de los tres» (ADR-0126 D1).
--      NO CAMBIA registrar_gasto (sigue fijo en fn_es_lider, 20260923130000). NO CAMBIAN recibir_compras,
--      cerrar_linea_compra ni recibir_envio: recibir es del módulo Recibir (fn_puede_operar_ubicacion).
--
-- P2 · RECIBIR con montos para quien ya ve el dinero de Compras. EN LA BASE NO HAY NADA QUE CAMBIAR, y se deja escrito
--      por qué: listar_compras_operativo, lineas_compra_operativo y recibir_envio no devuelven un solo monto; su
--      `fn_es_lider()` decide QUÉ SEDE se mira (otra tienda, «otras_tiendas»), y eso NO cambia (Felipe). Los montos de
--      /recibir salen de las vistas compras_resumen / compra_items_resumen (security_invoker, RLS
--      fn_puede_ver_dinero_de_compras) y el costo de /inventario/recibir de recepciones_sin_comprobante, que ya pregunta
--      fn_puede_ver_dinero_de_compras. El cambio es de la web (`verDineroCompras` en vez de «¿es líder?»).
--
-- P3 · PROVEEDORES. Capacidad nueva fn_puede_gestionar_proveedores() ← Proveedores.
--      CAMBIAN: registrar_proveedor, actualizar_proveedor, desactivar_proveedor, reactivar_proveedor (el alta, la
--        edición y el archivo) · la política proveedores_write_lider (escribir la tabla directo) → proveedores_write ·
--        fn_proveedor_devoluciones (unidades devueltas al proveedor: no es dinero).
--      SOLO EL MENSAJE: fn_proveedor_metricas_compras y fn_proveedor_costo_evolucion ya preguntan
--        fn_puede_ver_dinero_de_compras (montos de Compras); su texto decía «Solo un líder».
--      NO CAMBIAN (siguen del líder): fn_proveedor_metricas_insumos (lo comprado por el Taller, en soles),
--        fn_proveedor_produccion_metricas, fn_proveedores_produccion, guardar_proveedor_produccion (Producción).
--
-- P4 · ETIQUETAS desde la ficha de la prenda. actualizar_variantes_etiquetas pasa de fn_puede_editar_etiquetas() a
--      «fn_puede_editar_etiquetas() o fn_puede_editar_catalogo()» (Productos o Categorías y atributos). Lo que lleva
--      descuento NO cambia: la diferencia (poner o quitar) no puede tocar una etiqueta con descuento salvo el líder
--      (fn_puede_dar_descuento_por_etiqueta, ya en la función desde 20260923130000). etiquetar_variantes (la pantalla
--      de Etiquetas) sigue siendo del módulo Etiquetas.
--
-- P5 · ANÁLISIS NO ve costo ni stock de otras sedes en Existencias. ELECCIÓN: en fn_resumen_variantes el costo
--      (`costo`, `estado_costo`) y la red (`en_red`) vuelven a ser SOLO DEL LÍDER (fn_es_lider), como antes de
--      20260923130000. Por qué esta y no «separar»: fn_resumen_variantes NO la lee Análisis —la leen Existencias y la
--      «Nueva orden» de Producción (del líder)—; Análisis lee fn_resumen_comparacion, que ya analiza SOLO su sede
--      (fn_puede_operar_ubicacion) y ahí sí ve el costo de lo vendido en su sede (márgenes). Así «Análisis ve el costo
--      de SU sede» queda cumplido sin inventar un parámetro que el que llama podría falsear. fn_resumen_comparacion no
--      cambia.
--
-- P6 · COLABORADORES Y ROLES SOLO PARA PERSONAS. Tres capas:
--      (a) fn_exigir_rol_de_terminal(rol, modulo) — security definer, bloquea la fila del rol y rechaza: que una
--          terminal quede con un rol que incluye 'colaboradores' o 'roles', y que se encienda uno de esos módulos en un
--          rol que ya tiene terminales (activas o desactivadas: una desactivada se puede reactivar).
--      (b) Se llama desde los DOS disparadores de coherencia que ya existen: fn_terminal_rol_coherente (al crear una
--          terminal o cambiarle el rol: asignar_rol, la pantalla de terminales y `pnpm terminales:crear` pasan por ahí)
--          y fn_rol_modulos_coherente (guardar_modulos_rol, crear_rol «duplicar», y cualquier insert a mano).
--          El candado vive en la TABLA, no en cada RPC: no hay camino que lo esquive.
--      (c) Defensa en profundidad: fn_puede_gestionar_colaboradores() y fn_puede_administrar_roles() son FALSAS para una
--          sesión de terminal (fn_es_terminal()), aunque su rol los tuviera por un dato viejo.
--      Antes de poner el candado se verifica que HOY ninguna terminal tenga un rol así (en producción, el 2026-09-22,
--      ninguna); si alguna lo tiene, aborta y dice cuál: decidir qué rol le queda es de Felipe, no de una migración.
--
-- SE ROMPE SI
--   · Volver a pegar 20260923130000 DESPUÉS de esta NO la deshace: P4 y P5 dejan el texto viejo en un comentario
--     («antes: …») justo para que esa migración lo encuentre, lo dé por aplicado y siga.
--   · Volver a pegar 20260923131000 recrea fn_puede_gestionar_colaboradores / fn_puede_administrar_roles SIN la exclusión
--     de terminales (capa c de P6). Los disparadores (capa b) siguen: una terminal igual no recibe esos módulos. Volver a
--     pegar esta (re-ejecutable).
--   · Volver a pegar 20260923030000 o 20260923040000 recrea fn_rol_modulos_coherente / fn_terminal_rol_coherente SIN el
--     candado de P6 (falla ABIERTO). Volver a pegar esta; `pnpm pruebas:roles` lo detecta.
--   · Otra migración recrea alguna de estas funciones con su cuerpo viejo: vuelve la llave única de Compras o «solo el
--     líder» en Proveedores. `pnpm pruebas:roles` lo detecta.
--   · Se agrega una tabla u otro camino que le dé un rol a una terminal SIN pasar por retail.terminales: tiene que
--     llamar a fn_exigir_rol_de_terminal.
--
-- Re-ejecutable. En el repo SIN prefijo en lo que resuelve el search_path; al pegar en el SQL Editor de producción,
-- empezar con `set search_path to retail, public, extensions;` (todo lo que toca esta migración ya va con `retail.`).
-- Requiere 20260923130000 y 20260923131000.
-- ============================================================================

set search_path = retail, public, extensions;

do $$
begin
  if to_regprocedure('retail.fn_puede_editar_etiquetas()') is null or to_regprocedure('retail.fn_puede_analizar()') is null then
    raise exception 'Falta 20260923130000_abrir_modulos_a_los_roles.sql: pégala antes que esta';
  end if;
  if to_regprocedure('retail.fn_puede_gestionar_colaboradores()') is null or to_regprocedure('retail.fn_puede_administrar_roles()') is null then
    raise exception 'Falta 20260923131000_colaboradores_y_roles_delegables.sql: pégala antes que esta';
  end if;
end $$;

-- ==================== 0. Herramienta temporal (vive en pg_temp, desaparece al cerrar la sesión) ====================
-- Misma que 20260923130000 (nombre propio para no chocar si se pegan en la misma sesión). Reemplaza un texto EXACTO de la
-- definición real exigiendo `p_veces` ocurrencias; si ya tiene el texto nuevo, no hace nada.
create or replace function pg_temp.reemplazar_s6(p_firma text, p_viejo text, p_nuevo text, p_veces integer, p_opcional boolean default false)
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

-- ==================== 1. Capacidades nuevas (P1, P3) ====================
create or replace function retail.fn_puede_registrar_facturas_compra() returns boolean
language sql stable set search_path = retail, public, extensions
as $$ select retail.fn_es_lider() or retail.fn_capacidad_por_modulos(array['facturas_compra']); $$;

comment on function retail.fn_puede_registrar_facturas_compra() is
  'ADR-0161 P1 (20260923140000): líder o un rol que ve Facturas de compra. Registrar (con su pago al contado), anular, reparto entre tiendas y adjuntos de la factura.';

create or replace function retail.fn_puede_pagar_compras() returns boolean
language sql stable set search_path = retail, public, extensions
as $$ select retail.fn_es_lider() or retail.fn_capacidad_por_modulos(array['por_pagar']); $$;

comment on function retail.fn_puede_pagar_compras() is
  'ADR-0161 P1 (20260923140000): líder o un rol que ve Por pagar. Registrar pagos a proveedores (uno, por lote, con varios medios) y reembolsos.';

create or replace function retail.fn_puede_registrar_notas_credito() returns boolean
language sql stable set search_path = retail, public, extensions
as $$ select retail.fn_es_lider() or retail.fn_capacidad_por_modulos(array['notas_credito']); $$;

comment on function retail.fn_puede_registrar_notas_credito() is
  'ADR-0161 P1 (20260923140000): líder o un rol que ve Notas de crédito. Registrar notas de crédito de compra (y adjuntar su PDF).';

create or replace function retail.fn_puede_gestionar_proveedores() returns boolean
language sql stable set search_path = retail, public, extensions
as $$ select retail.fn_es_lider() or retail.fn_capacidad_por_modulos(array['proveedores']); $$;

comment on function retail.fn_puede_gestionar_proveedores() is
  'ADR-0161 P3 (20260923140000): líder o un rol que ve Proveedores. Alta, edición, archivo y la ficha (sin el dinero del Taller; los montos de Compras, con fn_puede_ver_dinero_de_compras).';

do $$
declare
  v_f text;
begin
  foreach v_f in array array['retail.fn_puede_registrar_facturas_compra()', 'retail.fn_puede_pagar_compras()',
                             'retail.fn_puede_registrar_notas_credito()', 'retail.fn_puede_gestionar_proveedores()'] loop
    execute format('revoke all on function %s from public, anon', v_f);
    execute format('grant execute on function %s to authenticated', v_f);
  end loop;
end $$;

comment on function retail.fn_puede_registrar_compras() is
  'Líder, o un rol que ve Facturas de compra, Por pagar o Notas de crédito. Desde 20260923140000 (ADR-0161 P1) solo para LEER lo que los tres usan (faltantes sin nota, libro del saldo a favor); cada escritura pregunta la capacidad de SU módulo.';

-- ==================== 2. P1 · Compras: cada módulo lo suyo ====================
do $$
declare
  c_fact constant text := 'if not retail.fn_puede_registrar_facturas_compra() then';
  c_pagar constant text := 'if not retail.fn_puede_pagar_compras() then';
begin
  -- Facturas de compra
  perform pg_temp.reemplazar_s6('retail.registrar_compra(uuid, text, text, text, uuid, jsonb, text, date, date, numeric, jsonb, text, numeric, uuid, date)',
    'if not fn_puede_registrar_compras() then', c_fact, 1);
  perform pg_temp.reemplazar_s6('retail.registrar_compra(uuid, text, text, text, uuid, jsonb, text, date, date, numeric, jsonb, text, numeric, uuid, date)',
    $v$'No tienes permiso para registrar compras';$v$,
    $v$'Registrar un comprobante de compra necesita el módulo Facturas de compra en tu rol' using errcode = '42501';$v$, 1);

  perform pg_temp.reemplazar_s6('retail.anular_compra(uuid, text)', 'if not fn_puede_registrar_compras() then', c_fact, 1);
  perform pg_temp.reemplazar_s6('retail.anular_compra(uuid, text)',
    $v$'No tienes permiso para anular compras';$v$,
    $v$'Anular un comprobante de compra necesita el módulo Facturas de compra en tu rol' using errcode = '42501';$v$, 1);

  perform pg_temp.reemplazar_s6('retail.reasignar_reparto_compra(uuid, uuid, uuid, integer, text, text)', 'if not fn_puede_registrar_compras() then', c_fact, 1);
  perform pg_temp.reemplazar_s6('retail.reasignar_reparto_compra(uuid, uuid, uuid, integer, text, text)',
    $v$'No tienes permiso para reasignar el reparto de un comprobante';$v$,
    $v$'Reasignar el reparto de un comprobante necesita el módulo Facturas de compra en tu rol' using errcode = '42501';$v$, 1);

  -- Adjuntos: de la factura (Facturas de compra) o de una nota de crédito (Notas de crédito).
  perform pg_temp.reemplazar_s6('retail.registrar_adjunto_compra(uuid, text, text, text, integer, uuid)',
    'if not retail.fn_puede_registrar_compras() then',
    'if not (retail.fn_puede_registrar_facturas_compra() or (p_nota_credito_id is not null and retail.fn_puede_registrar_notas_credito())) then', 1);
  perform pg_temp.reemplazar_s6('retail.registrar_adjunto_compra(uuid, text, text, text, integer, uuid)',
    $v$'No tienes permiso para adjuntar documentos a una factura';$v$,
    $v$'Adjuntar documentos necesita el módulo Facturas de compra en tu rol (o Notas de crédito, si es el PDF de una nota)' using errcode = '42501';$v$, 1);
  perform pg_temp.reemplazar_s6('retail.archivar_adjunto_compra(uuid)',
    'if not retail.fn_puede_registrar_compras() then',
    'if not (retail.fn_puede_registrar_facturas_compra() or (retail.fn_puede_registrar_notas_credito() and exists (select 1 from retail.compra_adjuntos a where a.id = p_adjunto_id and a.nota_credito_id is not null))) then', 1);
  perform pg_temp.reemplazar_s6('retail.archivar_adjunto_compra(uuid)',
    $v$'No tienes permiso para quitar adjuntos de una factura';$v$,
    $v$'Quitar adjuntos necesita el módulo Facturas de compra en tu rol (o Notas de crédito, si es el PDF de una nota)' using errcode = '42501';$v$, 1);

  -- Por pagar
  perform pg_temp.reemplazar_s6('retail.registrar_pago_compras(uuid, text, jsonb, text, date, uuid, numeric)', 'if not fn_puede_registrar_compras() then', c_pagar, 1);
  perform pg_temp.reemplazar_s6('retail.registrar_pago_compras_medios(uuid, jsonb, jsonb, date, uuid, numeric)', 'if not fn_puede_registrar_compras() then', c_pagar, 1);
  perform pg_temp.reemplazar_s6('retail.registrar_pagos_compra(uuid, jsonb, date, uuid)', 'if not fn_puede_registrar_compras() then', c_pagar, 1);
  perform pg_temp.reemplazar_s6('retail.registrar_pago_compras(uuid, text, jsonb, text, date, uuid, numeric)',
    $v$'No tienes permiso para registrar pagos a proveedores';$v$,
    $v$'Registrar pagos a proveedores necesita el módulo Por pagar en tu rol' using errcode = '42501';$v$, 1);
  perform pg_temp.reemplazar_s6('retail.registrar_pago_compras_medios(uuid, jsonb, jsonb, date, uuid, numeric)',
    $v$'No tienes permiso para registrar pagos a proveedores';$v$,
    $v$'Registrar pagos a proveedores necesita el módulo Por pagar en tu rol' using errcode = '42501';$v$, 1);
  perform pg_temp.reemplazar_s6('retail.registrar_pagos_compra(uuid, jsonb, date, uuid)',
    $v$'No tienes permiso para registrar pagos a proveedores';$v$,
    $v$'Registrar pagos a proveedores necesita el módulo Por pagar en tu rol' using errcode = '42501';$v$, 1);
  perform pg_temp.reemplazar_s6('retail.registrar_reembolso_proveedor(uuid, numeric, text, text, date, text)', 'if not fn_puede_registrar_compras() then', c_pagar, 1);
  perform pg_temp.reemplazar_s6('retail.registrar_reembolso_proveedor(uuid, numeric, text, text, date, text)',
    $v$'No tienes permiso para registrar reembolsos de proveedores';$v$,
    $v$'Registrar reembolsos de proveedores necesita el módulo Por pagar en tu rol' using errcode = '42501';$v$, 1);

  -- Notas de crédito
  perform pg_temp.reemplazar_s6('retail.registrar_nota_credito_compra(uuid, text, date, numeric, text, text, uuid, text, text, date, text)',
    '-- Dinero: solo quien puede registrar pagos (líder).',
    '-- ADR-0161 P1 (20260923140000): registrar una nota es del módulo Notas de crédito.', 1);
  perform pg_temp.reemplazar_s6('retail.registrar_nota_credito_compra(uuid, text, date, numeric, text, text, uuid, text, text, date, text)',
    'if not fn_puede_registrar_compras() then', 'if not retail.fn_puede_registrar_notas_credito() then', 1);
  perform pg_temp.reemplazar_s6('retail.registrar_nota_credito_compra(uuid, text, date, numeric, text, text, uuid, text, text, date, text)',
    $v$'No tienes permiso para registrar notas de crédito de proveedores';$v$,
    $v$'Registrar notas de crédito de proveedores necesita el módulo Notas de crédito en tu rol' using errcode = '42501';$v$, 1);
end $$;

-- ==================== 3. P3 · Proveedores: la ficha y la edición, con el módulo ====================
do $$
declare
  c_prov constant text := 'if not retail.fn_puede_gestionar_proveedores() then';
begin
  perform pg_temp.reemplazar_s6('retail.registrar_proveedor(text, text, text, text, integer, text, text, text, text)', 'if not retail.fn_es_lider() then', c_prov, 1);
  perform pg_temp.reemplazar_s6('retail.registrar_proveedor(text, text, text, text, integer, text, text, text, text)',
    $v$'Solo un Líder puede dar de alta proveedores.';$v$,
    $v$'Dar de alta proveedores necesita el módulo Proveedores en tu rol.' using errcode = '42501';$v$, 1);
  perform pg_temp.reemplazar_s6('retail.actualizar_proveedor(uuid, text, text, text, text, integer, text, text, text, text)', 'if not retail.fn_es_lider() then', c_prov, 1);
  perform pg_temp.reemplazar_s6('retail.actualizar_proveedor(uuid, text, text, text, text, integer, text, text, text, text)',
    $v$'Solo un Líder puede editar proveedores.';$v$,
    $v$'Editar proveedores necesita el módulo Proveedores en tu rol.' using errcode = '42501';$v$, 1);
  perform pg_temp.reemplazar_s6('retail.desactivar_proveedor(uuid)', 'if not retail.fn_es_lider() then', c_prov, 1);
  perform pg_temp.reemplazar_s6('retail.desactivar_proveedor(uuid)',
    $v$'Solo un Líder puede desactivar proveedores.';$v$,
    $v$'Desactivar proveedores necesita el módulo Proveedores en tu rol.' using errcode = '42501';$v$, 1);
  perform pg_temp.reemplazar_s6('retail.reactivar_proveedor(uuid)', 'if not retail.fn_es_lider() then', c_prov, 1);
  perform pg_temp.reemplazar_s6('retail.reactivar_proveedor(uuid)',
    $v$'Solo un Líder puede reactivar proveedores.';$v$,
    $v$'Reactivar proveedores necesita el módulo Proveedores en tu rol.' using errcode = '42501';$v$, 1);

  -- La ficha: devoluciones al proveedor (unidades, no dinero).
  perform pg_temp.reemplazar_s6('retail.fn_proveedor_devoluciones(uuid)', 'if not fn_es_lider() then', c_prov, 1);
  perform pg_temp.reemplazar_s6('retail.fn_proveedor_devoluciones(uuid)',
    $v$'Solo un líder puede ver las devoluciones a un proveedor.';$v$,
    $v$'Ver las devoluciones a un proveedor necesita el módulo Proveedores en tu rol.' using errcode = '42501';$v$, 1);
  -- Montos de Compras del proveedor: el candado ya era el del dinero; solo el mensaje decía «solo un líder».
  perform pg_temp.reemplazar_s6('retail.fn_proveedor_metricas_compras(uuid)',
    $v$'Solo un líder puede ver las métricas de un proveedor.';$v$,
    $v$'Los montos de compras de un proveedor necesitan Facturas de compra, Por pagar o Notas de crédito en tu rol.' using errcode = '42501';$v$, 1);
  perform pg_temp.reemplazar_s6('retail.fn_proveedor_costo_evolucion(uuid, integer)',
    $v$'Solo un líder puede ver la evolución del costo de un proveedor.';$v$,
    $v$'La evolución del costo de un proveedor necesita Facturas de compra, Por pagar o Notas de crédito en tu rol.' using errcode = '42501';$v$, 1);
end $$;

-- La política de escritura directa: se verifica que la vieja sea la que se inventarió antes de reemplazarla.
do $$
declare
  v_pol record;
begin
  select qual, with_check into v_pol from pg_policies
   where schemaname = 'retail' and tablename = 'proveedores' and policyname = 'proveedores_write_lider';
  if found then
    -- Dos formas válidas: la original y la de 20260923152300 (ADR-0176, «una vez por consulta»):
    -- `( SELECT retail.fn_es_lider() AS fn_es_lider)`. pg_policies la escribe con o sin `retail.` según el search_path.
    if coalesce(v_pol.qual, '') !~ '^(\( SELECT )?(retail\.)?fn_es_lider\(\)( AS fn_es_lider\))?$'
       or coalesce(v_pol.with_check, '') !~ '^(\( SELECT )?(retail\.)?fn_es_lider\(\)( AS fn_es_lider\))?$' then
      raise exception 'La política proveedores_write_lider cambió desde que se escribió esta migración (using: %, with check: %). Revísala a mano.',
        v_pol.qual, v_pol.with_check;
    end if;
    drop policy proveedores_write_lider on retail.proveedores;
  end if;
end $$;

drop policy if exists proveedores_write on retail.proveedores;
-- Con `(select …)`: la capacidad no depende de la fila, Postgres la calcula UNA vez por consulta (ADR-0176).
create policy proveedores_write on retail.proveedores for all
  using ((select retail.fn_puede_gestionar_proveedores()))
  with check ((select retail.fn_puede_gestionar_proveedores()));

comment on policy proveedores_write on retail.proveedores is
  'ADR-0161 P3 (20260923140000): el líder o un rol con Proveedores. Reemplaza a proveedores_write_lider.';

-- ==================== 4. P4 · Etiquetas SIN descuento desde la ficha de la prenda ====================
do $$
begin
  -- El texto de antes queda en un comentario A PROPÓSITO: 20260923130000 lo busca para saber que ya se aplicó; así volver a
  -- pegarla no aborta ni deshace esto (mismo truco en P5).
  perform pg_temp.reemplazar_s6('retail.actualizar_variantes_etiquetas(jsonb)',
    'if not retail.fn_puede_editar_etiquetas() then',
    'if not (retail.fn_puede_editar_etiquetas() or retail.fn_puede_editar_catalogo()) then -- P4 (20260923140000); antes: if not retail.fn_puede_editar_etiquetas() then', 1);
  perform pg_temp.reemplazar_s6('retail.actualizar_variantes_etiquetas(jsonb)',
    $v$'Aplicar etiquetas a una prenda necesita el módulo Etiquetas en tu rol.' using errcode = '42501';$v$,
    $v$'Cambiar las etiquetas de una prenda necesita el módulo Productos, Categorías y atributos, o Etiquetas en tu rol.' using errcode = '42501';
    -- antes: 'Aplicar etiquetas a una prenda necesita el módulo Etiquetas en tu rol.' using errcode = '42501'$v$, 1);
end $$;

-- ==================== 5. P5 · Existencias: costo y red, solo del líder ====================
do $$
begin
  perform pg_temp.reemplazar_s6('retail.fn_resumen_variantes(uuid, integer, date, date, date, date)',
    'select retail.fn_puede_analizar() as ok',
    'select retail.fn_es_lider() as ok -- 20260923140000 (ADR-0161 P5): costo y red, solo del líder; antes: select retail.fn_puede_analizar() as ok',
    1);
end $$;

-- ==================== 6. P6 · Colaboradores y Roles y accesos, solo para personas ====================
-- Un solo candado para las dos direcciones. `p_modulo` null: se le está dando el rol a una terminal. Con módulo: se está
-- encendiendo ese módulo en el rol. Security definer: bloquea la fila del rol (la misma que toma guardar_modulos_rol con
-- `for update`), así una asignación y una edición del rol al mismo tiempo se esperan y la segunda ve a la primera.
create or replace function retail.fn_exigir_rol_de_terminal(p_rol_id uuid, p_modulo text default null)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  c_solo_personas constant text[] := array['colaboradores', 'roles'];
  v_rol retail.roles;
  v_terminales text;
  v_modulos text;
begin
  if p_modulo is not null and not (p_modulo = any (c_solo_personas)) then
    return;
  end if;
  select * into v_rol from retail.roles where id = p_rol_id for update;
  if v_rol.id is null then
    return; -- el disparador de coherencia ya dice «ese rol no existe»
  end if;

  if p_modulo is null then
    -- Se le da este rol a una terminal: el rol no puede incluir los módulos de personas.
    select string_agg(m.nombre, ' y ' order by m.orden) into v_modulos
      from retail.rol_modulos rm join retail.modulos m on m.clave = rm.modulo
     where rm.rol_id = p_rol_id and rm.modulo = any (c_solo_personas);
    if v_modulos is not null then
      raise exception 'Una terminal no puede tener el rol «%»: incluye %, que solo se dan a personas. Elige otro rol o quítale esos módulos.', v_rol.nombre, v_modulos
        using errcode = '23514', hint = 'rol_solo_personas';
    end if;
  else
    -- Se enciende Colaboradores o Roles y accesos en un rol: no puede tenerlo ninguna terminal.
    select string_agg(t.nombre, ', ' order by t.nombre) into v_terminales from retail.terminales t where t.rol_id = p_rol_id;
    if v_terminales is not null then
      raise exception '«%» solo se da a personas, y el rol «%» lo tienen terminales (%). Dales otro rol antes de encenderlo.',
        (select nombre from retail.modulos where clave = p_modulo), v_rol.nombre, v_terminales
        using errcode = '23514', hint = 'rol_solo_personas';
    end if;
  end if;
end;
$fn$;

comment on function retail.fn_exigir_rol_de_terminal(uuid, text) is
  'ADR-0161 P6 (20260923140000): Colaboradores y Roles y accesos solo se dan a personas. Rechaza que una terminal quede con un rol que los incluye y que se enciendan en un rol con terminales. La llaman los disparadores de retail.terminales y retail.rol_modulos.';

revoke all on function retail.fn_exigir_rol_de_terminal(uuid, text) from public, anon;
grant execute on function retail.fn_exigir_rol_de_terminal(uuid, text) to authenticated, service_role;

-- Antes de poner el candado: que HOY no haya ninguna terminal con un rol así (producción, 2026-09-22: ninguna).
do $$
declare
  v_malas text;
begin
  select string_agg(t.nombre || ' (rol «' || r.nombre || '»)', ', ') into v_malas
    from retail.terminales t join retail.roles r on r.id = t.rol_id
   where exists (select 1 from retail.rol_modulos rm where rm.rol_id = t.rol_id and rm.modulo in ('colaboradores', 'roles'));
  if v_malas is not null then
    raise exception 'Hay terminales con Colaboradores o Roles y accesos: %. Decide qué rol les queda (o quítale esos módulos al rol) y vuelve a pegar esta migración.', v_malas;
  end if;
end $$;

do $$
begin
  -- (b) En los dos disparadores de coherencia que ya existen.
  perform pg_temp.reemplazar_s6('retail.fn_terminal_rol_coherente()',
    '  -- La tienda: solo al crear o al mudarla.',
    $v$  -- ADR-0161 P6 (20260923140000): Colaboradores y Roles y accesos solo se dan a personas.
  if tg_op = 'INSERT' or new.rol_id is distinct from old.rol_id then
    perform retail.fn_exigir_rol_de_terminal(new.rol_id);
  end if;

  -- La tienda: solo al crear o al mudarla.$v$, 1);
  perform pg_temp.reemplazar_s6('retail.fn_rol_modulos_coherente()',
    '  return new;',
    $v$  -- ADR-0161 P6 (20260923140000): Colaboradores y Roles y accesos no se encienden en un rol que tenga terminales.
  perform retail.fn_exigir_rol_de_terminal(new.rol_id, new.modulo);
  return new;$v$, 1);

  -- (c) Defensa en profundidad: una sesión de terminal nunca gestiona colaboradores ni administra roles.
  perform pg_temp.reemplazar_s6('retail.fn_puede_gestionar_colaboradores()',
    $v$select retail.fn_es_lider() or retail.fn_capacidad_por_modulos(array['colaboradores']);$v$,
    $v$select not retail.fn_es_terminal() and (retail.fn_es_lider() or retail.fn_capacidad_por_modulos(array['colaboradores']));$v$, 1);
  perform pg_temp.reemplazar_s6('retail.fn_puede_administrar_roles()',
    $v$select retail.fn_es_lider() or retail.fn_capacidad_por_modulos(array['roles']);$v$,
    $v$select not retail.fn_es_terminal() and (retail.fn_es_lider() or retail.fn_capacidad_por_modulos(array['roles']));$v$, 1);
end $$;

comment on function retail.fn_puede_gestionar_colaboradores() is
  'Líder, o una PERSONA con un rol que ve Colaboradores (ADR-0161, 20260923131000; P6 20260923140000: nunca una terminal). A un líder solo lo toca un líder (fn_exigir_puede_tocar_colaborador).';
comment on function retail.fn_puede_administrar_roles() is
  'Líder, o una PERSONA con un rol que ve Roles y accesos (ADR-0161, 20260923131000; P6 20260923140000: nunca una terminal). El rol Líder no se toca (fijo) ni se asigna sin ser líder.';

-- ==================== 7. Verificación: ningún candado quedó a medias ====================
do $$
declare
  v_malas text[];
begin
  select array_agg(f || ' → ' || texto) into v_malas from (values
    ('retail.registrar_compra(uuid, text, text, text, uuid, jsonb, text, date, date, numeric, jsonb, text, numeric, uuid, date)', 'fn_puede_registrar_facturas_compra()'),
    ('retail.anular_compra(uuid, text)', 'fn_puede_registrar_facturas_compra()'),
    ('retail.reasignar_reparto_compra(uuid, uuid, uuid, integer, text, text)', 'fn_puede_registrar_facturas_compra()'),
    ('retail.registrar_adjunto_compra(uuid, text, text, text, integer, uuid)', 'fn_puede_registrar_notas_credito()'),
    ('retail.archivar_adjunto_compra(uuid)', 'fn_puede_registrar_notas_credito()'),
    ('retail.registrar_pago_compras(uuid, text, jsonb, text, date, uuid, numeric)', 'fn_puede_pagar_compras()'),
    ('retail.registrar_pago_compras_medios(uuid, jsonb, jsonb, date, uuid, numeric)', 'fn_puede_pagar_compras()'),
    ('retail.registrar_pagos_compra(uuid, jsonb, date, uuid)', 'fn_puede_pagar_compras()'),
    ('retail.registrar_reembolso_proveedor(uuid, numeric, text, text, date, text)', 'fn_puede_pagar_compras()'),
    ('retail.registrar_nota_credito_compra(uuid, text, date, numeric, text, text, uuid, text, text, date, text)', 'fn_puede_registrar_notas_credito()'),
    ('retail.registrar_proveedor(text, text, text, text, integer, text, text, text, text)', 'fn_puede_gestionar_proveedores()'),
    ('retail.actualizar_proveedor(uuid, text, text, text, text, integer, text, text, text, text)', 'fn_puede_gestionar_proveedores()'),
    ('retail.desactivar_proveedor(uuid)', 'fn_puede_gestionar_proveedores()'),
    ('retail.reactivar_proveedor(uuid)', 'fn_puede_gestionar_proveedores()'),
    ('retail.fn_proveedor_devoluciones(uuid)', 'fn_puede_gestionar_proveedores()'),
    ('retail.actualizar_variantes_etiquetas(jsonb)', 'fn_puede_editar_catalogo()'),
    ('retail.fn_resumen_variantes(uuid, integer, date, date, date, date)', 'select retail.fn_es_lider() as ok'),
    ('retail.fn_terminal_rol_coherente()', 'fn_exigir_rol_de_terminal(new.rol_id)'),
    ('retail.fn_rol_modulos_coherente()', 'fn_exigir_rol_de_terminal(new.rol_id, new.modulo)'),
    ('retail.fn_puede_gestionar_colaboradores()', 'not retail.fn_es_terminal()'),
    ('retail.fn_puede_administrar_roles()', 'not retail.fn_es_terminal()')
  ) x(f, texto)
  where position(texto in pg_get_functiondef(f::regprocedure)) = 0;
  if v_malas is not null then
    raise exception 'Quedaron sin el candado nuevo: %', v_malas;
  end if;

  -- Ninguna ESCRITURA de Compras sigue con la llave de los tres.
  select array_agg(p.oid::regprocedure::text) into v_malas
    from pg_proc p
   where p.pronamespace = 'retail'::regnamespace
     and p.proname in ('registrar_compra', 'anular_compra', 'reasignar_reparto_compra', 'registrar_adjunto_compra', 'archivar_adjunto_compra',
                       'registrar_pago_compras', 'registrar_pago_compras_medios', 'registrar_pagos_compra', 'registrar_reembolso_proveedor',
                       'registrar_nota_credito_compra')
     and pg_get_functiondef(p.oid) like '%fn_puede_registrar_compras()%';
  if v_malas is not null then
    raise exception 'Estas escrituras de Compras siguen con la llave de los tres módulos: %', v_malas;
  end if;

  -- Lo que NO debía abrirse sigue del líder.
  if pg_get_functiondef('retail.fn_proveedor_metricas_insumos(uuid)'::regprocedure) not like '%fn_es_lider()%' then
    raise exception 'fn_proveedor_metricas_insumos dejó de ser solo del líder: es dinero del Taller';
  end if;
  if pg_get_functiondef('retail.fn_puede_ver_dinero_de_compras()'::regprocedure) not like '%''facturas_compra'', ''por_pagar'', ''notas_credito''%' then
    raise exception 'fn_puede_ver_dinero_de_compras dejó de ser «cualquiera de los tres»: no es lo que decidió Felipe';
  end if;
  if pg_get_functiondef('retail.fn_puede_dar_descuento_por_etiqueta()'::regprocedure) not like '%fn_es_lider()%' then
    raise exception 'fn_puede_dar_descuento_por_etiqueta dejó de ser solo del líder';
  end if;
end $$;

-- ==================== 8. Políticas «una vez por consulta» (ADR-0176) ====================
-- 20260923152300 pide volver a correr esto al final de toda migración que cree o cambie políticas. Es idempotente: solo
-- reescribe la FORMA de llamar a las funciones de permisos, nunca qué permite cada política. Una base sin esa migración
-- (el Postgres local viejo) la salta.
do $$
begin
  if to_regprocedure('retail.fn_rls_una_vez_por_consulta()') is not null then
    perform retail.fn_rls_una_vez_por_consulta();
  end if;
end $$;
