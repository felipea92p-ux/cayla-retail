-- ADR-0253, parte A (Felipe, 2026-09-28): «ningún módulo debería estar limitado a solo el líder».
--
-- Configuración, Impuestos y Cierre de mes nacieron «solo líder por ahora» (ADR-0195: F1, F8 y F9): sus funciones
-- preguntaban `fn_es_lider()` y la base rechazaba dárselos a un rol (`retail.modulos.delegable = false`). Desde aquí
-- se dan como cualquier otro módulo, y quien los tiene hace TODO lo que hace el líder dentro de ellos (decisión de
-- Felipe: «todo, como el líder», no «solo su tienda»):
--   · Configuración: las 7 pestañas (metas y fondo, cuentas y cobros, caja y avisos, gastos fijos de todas las tiendas
--     y de la empresa, presupuesto, parámetros tributarios). Las series de SUNAT siguen siendo del líder (lista
--     «siempre solo del líder»): la pestaña Empresa las muestra por la política de `series_comprobantes`, que no cambia.
--   · Impuestos: el IGV del mes de CAYLA entera y los registros para el contador (es del RUC: no se parte por tienda).
--   · Cierre de mes: cerrar y REABRIR (con motivo) cada tienda, la empresa y el consolidado, viendo el diario entero.
--
-- CÓMO. Cuatro preguntas nuevas, iguales a las `fn_puede_*` que ya existen (líder, o el módulo en un rol a medida):
--   fn_puede_configurar(), fn_puede_ver_impuestos(), fn_puede_cerrar_mes(), y fn_ve_finanzas_de_todo() — esta última
--   para el ALCANCE: donde una función de Finanzas decía «el líder ve todas las tiendas y lo de la empresa», ahora
--   también lo ve quien tiene Configuración o Cierre de mes (sin eso, cerrar la empresa congelaría un diario a medias).
-- Cada función se reescribe desde SU definición en la base (`pg_get_functiondef`), cambiando solo la línea del candado
-- y su mensaje, como `fn_aplicar_candado_de_dinero()` (ADR-0126). Antes de escribir esto se comparó la huella md5 de
-- las 41 funciones que tocan esta migración y la B: el repo y producción eran idénticos (2026-09-28). Si alguna no
-- trae el texto esperado exactamente una vez, la migración ABORTA entera (la base no es la que se revisó). Pegarla
-- dos veces no hace nada la segunda: una función ya reescrita se salta.
--
-- CUIDADO para quien venga después: si una migración futura vuelve a crear una de estas funciones copiando su texto
-- de un archivo VIEJO del repo, le devuelve el candado de líder. Parte de la definición real (memoria del proyecto:
-- «reescribir una función de producción») o vuelve a pasar la reescritura. `scripts/pruebas/roles_lider_editable.mjs`
-- lo vigila.
--
-- Producción: sin `alter` de tablas en uso y sin políticas (ADR-0195, «Políticas y deadlocks»): se pega entera.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- 1. Las preguntas ----------------------------------------------------------------------------------------------------

create or replace function retail.fn_puede_configurar()
returns boolean
language sql
stable
security definer
set search_path = retail, public, extensions
as $$ select retail.fn_es_lider() or retail.fn_capacidad_por_modulos(array['configuracion']); $$;

create or replace function retail.fn_puede_ver_impuestos()
returns boolean
language sql
stable
security definer
set search_path = retail, public, extensions
as $$ select retail.fn_es_lider() or retail.fn_capacidad_por_modulos(array['impuestos']); $$;

create or replace function retail.fn_puede_cerrar_mes()
returns boolean
language sql
stable
security definer
set search_path = retail, public, extensions
as $$ select retail.fn_es_lider() or retail.fn_capacidad_por_modulos(array['cierre_mes']); $$;

-- El alcance «todas las tiendas y lo de la empresa» en Finanzas: el líder, y quien configura o cierra el mes.
create or replace function retail.fn_ve_finanzas_de_todo()
returns boolean
language sql
stable
security definer
set search_path = retail, public, extensions
as $$ select retail.fn_es_lider() or retail.fn_capacidad_por_modulos(array['configuracion', 'cierre_mes']); $$;

revoke all on function retail.fn_puede_configurar(), retail.fn_puede_ver_impuestos(), retail.fn_puede_cerrar_mes(),
  retail.fn_ve_finanzas_de_todo() from public, anon;
grant execute on function retail.fn_puede_configurar(), retail.fn_puede_ver_impuestos(), retail.fn_puede_cerrar_mes(),
  retail.fn_ve_finanzas_de_todo() to authenticated, service_role;

-- 2. La reescritura ---------------------------------------------------------------------------------------------------

-- Cambia `p_viejo` por `p_nuevo` en la única función `retail.<p_nombre>`. Exige que `p_viejo` aparezca exactamente una
-- vez; si ya no está y `p_nuevo` sí, la función ya se reescribió (se salta).
create function pg_temp.reemplazar(p_nombre text, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $$
declare
  v_oids oid[];
  v_def text;
  v_veces int;
begin
  select array_agg(p.oid) into v_oids from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = p_nombre;
  if coalesce(cardinality(v_oids), 0) <> 1 then
    raise exception 'ADR-0253: se esperaba una sola función retail.% y hay %', p_nombre, coalesce(cardinality(v_oids), 0);
  end if;
  v_def := pg_get_functiondef(v_oids[1]);
  v_veces := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_veces = 0 and position(p_nuevo in v_def) > 0 then
    return;
  end if;
  if v_veces <> 1 then
    raise exception 'ADR-0253: retail.% trae % veces «%» (se esperaba 1): la base no es la que se revisó, no se toca nada',
      p_nombre, v_veces, p_viejo;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$$;

-- 2a. Configuración: la puerta de cada función de sus pestañas.
select pg_temp.reemplazar(f, 'if not retail.fn_es_lider() then', 'if not retail.fn_puede_configurar() then')
from unnest(array['fn_configuracion_tiendas', 'guardar_efecto_campana', 'guardar_hora_cierre_tienda', 'guardar_metas_tienda',
  'fn_presupuesto_configuracion', 'fn_presupuesto_propuesta', 'guardar_presupuesto', 'guardar_presupuesto_lote',
  'guardar_parametros_finanzas', 'fn_exigir_lider_dinero']) f;
select pg_temp.reemplazar(f, 'if not coalesce(retail.fn_es_lider(), false) then', 'if not retail.fn_puede_configurar() then')
from unnest(array['fn_parametros_tributarios_lista', 'guardar_parametro_tributario']) f;

select pg_temp.reemplazar('fn_configuracion_tiendas', '''Solo el líder ve la configuración.''',
  '''Ver la configuración necesita el módulo «Configuración» en tu rol.''');
select pg_temp.reemplazar('fn_presupuesto_configuracion', '''Solo el líder ve la configuración.''',
  '''Ver la configuración necesita el módulo «Configuración» en tu rol.''');
select pg_temp.reemplazar('guardar_efecto_campana', '''Solo el líder cambia lo que una campaña hace en la caja.''',
  '''Cambiar lo que una campaña hace en la caja necesita el módulo «Configuración» en tu rol.''');
select pg_temp.reemplazar('guardar_hora_cierre_tienda', '''Solo el líder cambia la hora de cierre de una tienda.''',
  '''Cambiar la hora de cierre de una tienda necesita el módulo «Configuración» en tu rol.''');
select pg_temp.reemplazar('guardar_metas_tienda', '''Solo el líder cambia las metas y el fondo de caja.''',
  '''Cambiar las metas y el fondo de caja necesita el módulo «Configuración» en tu rol.''');
select pg_temp.reemplazar(f, '''Solo el líder pone el presupuesto.''',
  '''Poner el presupuesto necesita el módulo «Configuración» en tu rol.''')
from unnest(array['fn_presupuesto_propuesta', 'guardar_presupuesto', 'guardar_presupuesto_lote']) f;
select pg_temp.reemplazar('guardar_parametros_finanzas', '''Solo el líder cambia el mínimo de caja y los avisos.''',
  '''Cambiar el mínimo de caja y los avisos necesita el módulo «Configuración» en tu rol.''');
select pg_temp.reemplazar('fn_parametros_tributarios_lista', '''Solo el líder ve los parámetros tributarios.''',
  '''Ver los parámetros tributarios necesita el módulo «Configuración» en tu rol.''');
select pg_temp.reemplazar('guardar_parametro_tributario', '''Solo el líder cambia los parámetros tributarios.''',
  '''Cambiar los parámetros tributarios necesita el módulo «Configuración» en tu rol.''');
-- Crear, editar y archivar cuentas, a qué cuenta entra cada cobro, conciliar y los saldos de arranque (Cuentas y cobros).
select pg_temp.reemplazar('fn_exigir_lider_dinero', '''% es solo del líder.''',
  '''% es del líder o de quien tiene el módulo «Configuración».''');
-- «Caja y avisos» se lee con cualquier módulo de Finanzas; ahora también con Configuración, que es donde se cambia.
select pg_temp.reemplazar('fn_parametros_finanzas', 'array[''gastos'', ''cuentas_dinero'', ''reportes_financieros'']',
  'array[''gastos'', ''cuentas_dinero'', ''reportes_financieros'', ''configuracion'']');

-- 2b. Impuestos.
select pg_temp.reemplazar(f, 'if not coalesce(retail.fn_es_lider(), false) then', 'if not retail.fn_puede_ver_impuestos() then')
from unnest(array['fn_impuestos_panel', 'fn_impuestos_igv_meses', 'fn_impuestos_registro_compras', 'fn_impuestos_registro_ventas']) f;
select pg_temp.reemplazar('fn_impuestos_panel', '''Solo el líder ve los impuestos (módulo Impuestos, «solo líder por ahora»).''',
  '''Ver los impuestos necesita el módulo «Impuestos» en tu rol.''');
select pg_temp.reemplazar('fn_impuestos_igv_meses', '''Solo el líder ve los impuestos.''',
  '''Ver los impuestos necesita el módulo «Impuestos» en tu rol.''');
select pg_temp.reemplazar(f, '''Solo el líder baja los registros para el contador.''',
  '''Bajar los registros para el contador necesita el módulo «Impuestos» en tu rol.''')
from unnest(array['fn_impuestos_registro_compras', 'fn_impuestos_registro_ventas']) f;

-- 2c. Cierre de mes (cerrar y reabrir: los dos con el módulo, decisión de Felipe).
select pg_temp.reemplazar(f, 'if not retail.fn_es_lider() then', 'if not retail.fn_puede_cerrar_mes() then')
from unnest(array['cerrar_periodo', 'fn_cierre_mes_estado', 'fn_cierre_panel', 'reabrir_periodo']) f;
select pg_temp.reemplazar('cerrar_periodo', '''Cerrar el mes es solo del líder.''',
  '''Cerrar el mes necesita el módulo «Cierre de mes» en tu rol.''');
select pg_temp.reemplazar(f, '''El cierre de mes es solo del líder.''',
  '''El cierre de mes necesita el módulo «Cierre de mes» en tu rol.''')
from unnest(array['fn_cierre_mes_estado', 'fn_cierre_panel']) f;
select pg_temp.reemplazar('reabrir_periodo', '''Reabrir el mes es solo del líder.''',
  '''Reabrir el mes necesita el módulo «Cierre de mes» en tu rol.''');

-- 2d. El alcance: «el líder ve todas las tiendas y lo de la empresa» pasa a ser `fn_ve_finanzas_de_todo()`. Son las
-- lecturas que usan esas tres pantallas (el diario que se congela al cerrar, los gastos fijos, las cuentas con su saldo)
-- y las que comparten sus ayudantes de alcance, para que una misma persona no vea una cosa en una pantalla y otra en la
-- de al lado. Consecuencia buscada («todo, como el líder»): `fn_gastos_puede` es también la puerta de `registrar_gasto`
-- y de los gastos fijos, así que quien configura o cierra el mes puede, como el líder, registrar un gasto de cualquier
-- tienda o de la empresa. Las PANTALLAS de Gastos y de Cuentas y dinero siguen pidiendo su propio módulo.
select pg_temp.reemplazar(f, 'v_lider boolean := retail.fn_es_lider();', 'v_lider boolean := retail.fn_ve_finanzas_de_todo();')
from unnest(array['fn_asientos', 'fn_periodos_mes', 'fn_gastos_fijos_mes', 'fn_gastos_fijos_sugeridos', 'fn_gastos_lista',
  'fn_gastos_panel', 'fn_cuentas_dinero_saldos', 'fn_cuentas_para_elegir', 'fn_movimientos_dinero', 'fn_presupuesto_vs_real',
  'fn_campanas_reporte']) f;
select pg_temp.reemplazar(f, 'when retail.fn_es_lider() then', 'when retail.fn_ve_finanzas_de_todo() then')
from unnest(array['fn_diario_ubicaciones', 'fn_gastos_ubicaciones', 'fn_cuentas_dinero_ubicaciones']) f;
select pg_temp.reemplazar('fn_gastos_puede', 'then retail.fn_es_lider()', 'then retail.fn_ve_finanzas_de_todo()');
-- «No es fijo» en un sugerido de la empresa: la misma regla que registrar un gasto de la empresa (`fn_gastos_puede`).
select pg_temp.reemplazar('descartar_fijo_sugerido', 'if not retail.fn_es_lider() then', 'if not retail.fn_ve_finanzas_de_todo() then');
select pg_temp.reemplazar('descartar_fijo_sugerido', '''Solo el líder decide sobre los gastos de la empresa.''',
  '''Decidir sobre los gastos de la empresa necesita el módulo «Configuración» o «Cierre de mes» en tu rol.''');

-- 3. El catálogo: los tres se pueden dar. Siguen naciendo sin rol (ninguna migración escribe en `rol_modulos`): el
-- líder decide a quién se los da en Roles y accesos.
update retail.modulos set delegable = true where clave in ('configuracion', 'impuestos', 'cierre_mes');

do $$
begin
  if exists (select 1 from retail.modulos where not delegable or solo_lider) then
    raise exception 'ADR-0253: quedó un módulo «solo del líder»';
  end if;
end;
$$;
