-- ============================================================================
-- 20261004200100_cuadre_piso_funciones.sql — CAYLA V2 · ADR-0328 decisión técnica 4 «Cuadre del piso, una vez por sede»
-- PARTE 4 de 4 (las funciones). Va AL FINAL, después de 20261004200000 (las tablas), 20261004200050 (Frescura) y
-- 20261004200070 (Eliminar con historia): su guarda aborta si Frescura o Eliminar todavía no conocen el cuadre, así
-- `cuadrar_piso` no existe sin esas protecciones.
--
-- EL PROBLEMA PRIMERO. Ver la PARTE 1: el reparto piso/almacén de TRU no es el real (sistema 138 colgadas y 635 guardadas;
-- en la tienda, 600–750 colgadas y más de 200 guardadas). La forma de arreglarlo que eligió Felipe es escanear lo que de
-- verdad está GUARDADO y pasar al piso, de una vez, lo que el sistema tiene en el almacén y nadie escaneó. Hacerlo con
-- «Bajar al piso» y «Subir a almacén» no sirve: topan en 300 prendas, son dos llamadas (se puede quedar a medias),
-- «Bajar» no acepta tallas archivadas, y Frescura leería cientos de «bajadas» de hoy (todo saldría «Nueva»).
--
-- QUÉ HACE. Cuatro funciones de solo lectura o internas y una que escribe:
--   · `fn_cuadre_piso_lista(p_guardado)` (interna): valida y normaliza lo escaneado → [{variante_id, cantidad}] ordenado.
--   · `fn_cuadre_piso_calculo(sede, lista)` (interna): LA cuenta, por prenda, con unidades LIBRES (lo apartado no se
--     mueve). A = almacén libre, P = piso libre, S = escaneado como guardado:
--         pasa al piso       = max(0, A − S)
--         sube al almacén    = min(max(0, S − A), P)
--         no cargada         = max(0, S − A − P)      (se guarda, NO se aplica: el cuadre no crea stock)
--     Cada prenda se mueve en UNA sola dirección (si A > S baja; si S > A sube). Quedan FUERA y nunca se mueven: la
--     «Prenda sin registrar» (centinela), los productos de prueba, la cuarentena (ni piso ni almacén) y las tallas
--     archivadas (se listan como «archivadas: no se movieron»). La previsualización y el cuadre llaman a ESTA función:
--     la pantalla no puede mostrar una cuenta y la base aplicar otra (lo vigila pruebas:cuadrar-piso).
--   · `fn_cuadre_piso_vista(sede, lista)` (interna): el resumen y las líneas que se muestran Y se aplican.
--   · `fn_cuadre_piso_conteo_abierto(sede)` (interna): el conteo abierto de la sede, o null.
--   · `previsualizar_cuadre_piso(sede, guardado)` (lectura, la pantalla «Revisar»): quien ve Existencias en su sede.
--     Trae `conteo_abierto` para avisarlo antes de confirmar.
--   · `fn_cuadre_piso_estado(sede)` (lectura): {cuadrado_en, por, prendas_al_piso, prendas_al_almacen, cuadres,
--     conteo_abierto} del último cuadre (la portada de Existencias, actividad 8).
--   · `cuadrar_piso(sede, guardado, escaneo_desde, nota, token)`: TODO O NADA, solo un LÍDER (fn_es_lider() a la vista,
--     hint `cuadre_solo_lider`; escanear lo puede cualquiera que vea Existencias, confirmar no). Firma el responsable
--     (`fn_actor_persona_id(true)`). Orden: forma → marca del intento (candado + búsqueda; el reintento devuelve lo
--     guardado aunque el piso ya cambió) → candado de la sede → responsable → stock en orden (ADR-0190) → ¿se cuadró
--     después de tu escaneo? → ¿hay un conteo abierto en la sede? → la cuenta bajo candado → ¿se movió algo en el
--     almacén después de tu escaneo? (rechaza y dice QUÉ prendas, para volver a escanear solo esas) → cabecera → un
--     `mover_interno` por línea (nota fija «Cuadre del piso») y su ítem.
--
-- POR QUÉ UN CONTEO ABIERTO FRENA EL CUADRE (revisión adversarial, 2026-10-04). Un conteo guarda «lo que debía haber» al
-- verificar cada prenda (`conteo_contar`) y al cerrarse suma la diferencia sobre el stock de ESE momento
-- (`cerrar_conteo`): todo lo que se movió entre medio lo trata como un movimiento físico. El cuadre no es físico, solo
-- corrige el registro. Con un conteo abierto del piso que ya contó 5 colgadas (el sistema decía 0), un cuadre que baja
-- esas 5 del almacén y el cierre del conteo, la sede queda con 10 en el piso cuando hay 5: los dos corrigen lo mismo.
-- Basta mirarlo DESPUÉS de bloquear el stock: `conteo_contar` lee el stock de la prenda con `for share`, así que una
-- verificación que llega durante el cuadre espera a que termine y cuenta contra el piso ya cuadrado; y un conteo que se
-- abrió antes de que tomáramos el candado ya está confirmado y lo vemos. No hace falta un candado de tabla.
--
-- POR QUÉ `mover_interno` Y NO UN INSERT DIRECTO. Es el único productor de la fila almacén↔piso del libro (la misma que
-- «Reponer» y «Subir a almacén»): Movimientos la muestra como movimiento interno y Actividad escribe sola sus dos líneas
-- («bajó al piso N prendas de M modelos · Cuadre del piso» / «subió al almacén … · Cuadre del piso»), sin tocar un
-- motivo nuevo en tres lugares. Medido en una base desechable (ver «RENDIMIENTO»).
--
-- RENDIMIENTO (medido el 2026-10-04 en un Postgres 17 desechable, como `authenticated` con `statement_timeout = 8s`): una
-- sede con 550 tallas y 750 prendas, 533 pasan al piso y 11 líneas suben al almacén → 0,3 a 0,6 s (≈ 1 ms por línea,
-- con su firma, su fila del libro, su stock y su ítem). TRU hoy: unas 510 tallas y 773 prendas. Cabe más de 10 veces en
-- los 8 s; lo vigila pruebas:cuadrar-piso (C13). Si un día no cupiera, la salida es la versión por conjuntos (insert de
-- todas las filas + fn_aplicar_movimiento), no partir el cuadre en dos llamadas.
--
-- ESTADO QUE DEJA DE SER POSIBLE: un cuadre a medias (unas prendas movidas y otras no), un cuadre que aplica una cuenta
-- distinta de la que se mostró, un cuadre hecho con un escaneo que el almacén ya desmintió, dos cuadres simultáneos de la
-- misma sede, mover lo apartado para un cliente, y un cuadre con un conteo abierto en la sede (los dos corregirían las
-- mismas prendas y la sede ganaría prendas que no existen).
--
-- CÓMO SE PEGA EN PRODUCCIÓN. Sola, tal cual, DESPUÉS de 20261004200000, 20261004200050 y 20261004200070 (las guardas de
-- abajo abortan sin tocar nada si falta algo, también si Frescura o Eliminar no quedaron con su protección). Solo `create or replace function` + `comment` + `revoke` + `grant`: no toma las
-- tablas de auth/storage (ADR-0195), sin políticas, sin `drop trigger`, sin `alter`. Idempotente. VA ANTES de publicar la
-- web que la llama (una web nueva contra una base sin esto falla con «Could not find the function»).
-- Verificación (solo lectura):
--   select proname, pg_get_function_identity_arguments(oid) from pg_proc where pronamespace = 'retail'::regnamespace
--      and proname in ('cuadrar_piso', 'previsualizar_cuadre_piso', 'fn_cuadre_piso_estado') order by 1;   → 3 filas
--
-- SE ROMPE SI `mover_interno` cambia de firma o deja de escribir 'traslado'/'movimiento_interno' (el ítem del cuadre ya
-- no calzaría: lo detiene el disparador de coherencia y no se cuadra nada), si alguien cuadra con la tienda abierta y la
-- caja baja prendas del almacén mientras se escanea (el cuadre se rechaza y pide reescanear esas: es lo correcto, pero
-- molesta; por eso la pantalla recomienda hacerlo antes de abrir), o si un cuadre de una sede grande pasa los 8 s.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------------------------------------------------------------------------
-- Guardas: si falta algo de lo que esto asume, se aborta sin tocar nada.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('retail.cuadres_piso') is null or to_regclass('retail.cuadre_piso_items') is null then
    raise exception 'Faltan las tablas del cuadre: pega antes 20261004200000_cuadre_piso_tablas.sql';
  end if;
  if to_regprocedure('retail.mover_interno(uuid, uuid, integer, uuid, uuid, text, uuid)') is null then
    raise exception 'Falta mover_interno con marca (7 parámetros): pega antes 20260926200100_mover_interno_con_marca.sql';
  end if;
  if to_regprocedure('retail.fn_bloquear_en_orden(uuid, uuid[], boolean, uuid[])') is null then
    raise exception 'Falta fn_bloquear_en_orden (ADR-0190): pega antes 20260924130000_concurrencia_orden_y_doble_clic.sql';
  end if;
  if to_regprocedure('retail.fn_actor_persona_id(boolean)') is null or to_regprocedure('retail.fn_ve_modulo(text)') is null
     or to_regprocedure('retail.fn_es_lider()') is null or to_regprocedure('retail.fn_puede_operar_ubicacion(uuid)') is null then
    raise exception 'Faltan los candados de la casa (fn_actor_persona_id, fn_ve_modulo, fn_es_lider, fn_puede_operar_ubicacion).';
  end if;
  if to_regprocedure('retail.fn_prenda_corta(uuid)') is null or to_regprocedure('retail.fn_actividad_nombre(uuid)') is null then
    raise exception 'Faltan fn_prenda_corta o fn_actividad_nombre: pega antes 20260926000200 y 20261002233000.';
  end if;
  -- Frescura tiene que conocer el cuadre ANTES de que exista cuadrar_piso: sin la PARTE 2, cada prenda que el cuadre baja
  -- sería una «bajada» de hoy (todo «Nueva», confianza inflada, tardías y «corregidas» falsas), y eso ya no se arregla
  -- después porque el cuadre no se edita. Se mira lo que importa (que el cuerpo vivo excluya y marque el cuadre por su
  -- ítem), no un md5: un parche posterior legítimo de Frescura no debe impedir volver a pegar esta parte.
  if position('cuadre_piso_items' in coalesce((select p.prosrc from pg_proc p
        where p.oid = to_regprocedure('retail.fn_bajadas_del_piso_nucleo(uuid, timestamptz, timestamptz, integer)')), '')) = 0
     or position('cuadre_piso_items' in coalesce((select p.prosrc from pg_proc p
        where p.oid = to_regprocedure('retail.fn_frescura_sede(uuid, integer)')), '')) = 0 then
    raise exception 'Frescura todavía no conoce el cuadre del piso: pega antes 20261004200050_cuadre_piso_frescura.sql (si abortó, su mensaje dice qué función cambió en vivo).';
  end if;
  -- Y «Eliminar con historia»: sin la PARTE 3, todo producto que pase por el cuadre ya no se podría eliminar ni purgar.
  if position('cuadre_piso_items' in coalesce((select p.prosrc from pg_proc p
        where p.oid = to_regprocedure('retail.eliminar_producto_con_historia(uuid)')), '')) = 0
     or position('cuadre_piso_items' in coalesce((select p.prosrc from pg_proc p
        where p.oid = to_regprocedure('retail.fn_producto_historia(uuid)')), '')) = 0 then
    raise exception 'Eliminar con historia todavía no conoce el cuadre del piso: pega antes 20261004200070_cuadre_piso_en_eliminar.sql.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Lo escaneado, validado y normalizado.
--    PROMETE: [{variante_id, cantidad}] con una línea por prenda (las repetidas se suman), ordenado por prenda; `[]` si no
--             se escaneó nada (válido: «no hay nada guardado»).
--    ASUME:   nada. Rechaza con P0001 y hint `cuadre_lista_invalida` lo que no tenga esa forma, o un código que no es de
--             ninguna prenda del catálogo (la pantalla solo manda prendas que encontró).
-- ---------------------------------------------------------------------------
create or replace function retail.fn_cuadre_piso_lista(p_guardado jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $fn$
declare
  c_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_lista jsonb;
  v_n integer;
begin
  if jsonb_typeof(p_guardado) is distinct from 'array' then
    raise exception 'La lista de lo escaneado no llegó bien. Recarga la página: lo escaneado sigue guardado en este equipo.'
      using hint = 'cuadre_lista_invalida';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_guardado) e
     where jsonb_typeof(e) <> 'object'
        or coalesce(e ->> 'variante_id', '') !~* c_uuid
        or coalesce(e ->> 'cantidad', '') !~ '^[1-9][0-9]{0,4}$'
  ) then
    raise exception 'Cada prenda escaneada necesita un código válido y entre 1 y 99999 unidades.' using hint = 'cuadre_lista_invalida';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('variante_id', t.v, 'cantidad', t.c) order by t.v), '[]'::jsonb), count(*)
    into v_lista, v_n
    from (select (e ->> 'variante_id')::uuid as v, sum((e ->> 'cantidad')::integer) as c
            from jsonb_array_elements(p_guardado) e group by 1) t;
  if v_n > 5000 then
    raise exception 'Un cuadre admite hasta 5000 prendas distintas escaneadas.' using hint = 'cuadre_lista_invalida';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_lista) x
     where not exists (select 1 from variantes va where va.id = (x ->> 'variante_id')::uuid)
  ) then
    raise exception 'Hay un código escaneado que no es de ninguna prenda del catálogo. Quítalo de la lista y vuelve a revisar.'
      using hint = 'cuadre_lista_invalida';
  end if;
  return v_lista;
end;
$fn$;

comment on function retail.fn_cuadre_piso_lista(jsonb) is
  'ADR-0328: valida y normaliza lo escaneado en un cuadre del piso → [{variante_id, cantidad}] ordenado por prenda (repetidas sumadas). Interna.';

-- ---------------------------------------------------------------------------
-- 2. LA cuenta del cuadre, por prenda. Una sola definición para la previsualización y para el cuadre.
--    PROMETE: una fila por prenda con algo en el piso o el almacén de la sede (libre o apartado) o escaneada, con
--             `motivo` 'cuadra' (se mueve según la fórmula), 'archivada' (talla archivada: no se mueve) o
--             'no_es_inventario' (centinela o producto de prueba: no se mueve). En las dos últimas, los movimientos son 0.
--             La cuarentena no entra (no es piso ni almacén). Lo apartado no se mueve: se cuenta aparte.
--    ASUME:   p_guardado ya pasó por fn_cuadre_piso_lista. Sin candado: quien escribe la llama con el stock ya
--             bloqueado (en READ COMMITTED cada sentencia ve lo último confirmado).
-- ---------------------------------------------------------------------------
create or replace function retail.fn_cuadre_piso_calculo(p_ubicacion_id uuid, p_guardado jsonb)
returns table (
  variante_id   uuid,
  motivo        text,
  almacen_libre integer,
  piso_libre    integer,
  apartadas     integer,
  escaneadas    integer,
  al_piso       integer,
  al_almacen    integer,
  no_cargadas   integer
)
language sql
stable
security definer
set search_path = retail, public, extensions
as $fn$
  with lugares as (
    select (select s.id from retail.sububicaciones s where s.ubicacion_id = p_ubicacion_id and s.tipo = 'piso_venta') as piso,
           (select s.id from retail.sububicaciones s where s.ubicacion_id = p_ubicacion_id and s.tipo = 'almacen_tienda') as almacen
  ),
  escaneo as (
    select (x ->> 'variante_id')::uuid as variante_id, sum((x ->> 'cantidad')::integer) as s
      from jsonb_array_elements(coalesce(p_guardado, '[]'::jsonb)) x
     group by 1
  ),
  en_stock as (
    select st.variante_id,
           coalesce(sum(st.cantidad - st.cantidad_apartada) filter (where st.sububicacion_id = l.almacen), 0) as a,
           coalesce(sum(st.cantidad - st.cantidad_apartada) filter (where st.sububicacion_id = l.piso), 0) as p,
           coalesce(sum(st.cantidad_apartada), 0) as ap
      from retail.stock st
      cross join lugares l
     where st.ubicacion_id = p_ubicacion_id
       and st.sububicacion_id in (l.piso, l.almacen)
     group by st.variante_id
  ),
  juntos as (
    select coalesce(k.variante_id, e.variante_id) as variante_id,
           greatest(coalesce(k.a, 0), 0)::integer as a,
           greatest(coalesce(k.p, 0), 0)::integer as p,
           coalesce(k.ap, 0)::integer as ap,
           coalesce(e.s, 0)::integer as s
      from en_stock k
      full join escaneo e on e.variante_id = k.variante_id
  ),
  clasificadas as (
    select j.variante_id, j.a, j.p, j.ap, j.s,
           case when j.variante_id = '22222222-2222-4222-8222-222222222222'
                  or pr.id = '11111111-1111-4111-8111-111111111111'
                  or pr.es_prueba then 'no_es_inventario'
                when not va.activo then 'archivada'
                else 'cuadra' end as motivo
      from juntos j
      join retail.variantes va on va.id = j.variante_id
      join retail.productos pr on pr.id = va.producto_id
     where j.a > 0 or j.p > 0 or j.ap > 0 or j.s > 0
  )
  select c.variante_id, c.motivo, c.a, c.p, c.ap, c.s,
         (case when c.motivo = 'cuadra' then greatest(0, c.a - c.s) else 0 end)::integer,
         (case when c.motivo = 'cuadra' then least(greatest(0, c.s - c.a), c.p) else 0 end)::integer,
         (case when c.motivo = 'cuadra' then greatest(0, c.s - c.a - c.p) else 0 end)::integer
    from clasificadas c;
$fn$;

comment on function retail.fn_cuadre_piso_calculo(uuid, jsonb) is
  'ADR-0328: la cuenta del cuadre del piso por prenda, con unidades libres (A almacén, P piso, S escaneado): al_piso = max(0, A−S), al_almacen = min(max(0, S−A), P), no_cargadas = max(0, S−A−P). Archivadas, centinela y productos de prueba no se mueven; la cuarentena no entra; lo apartado no se mueve. La usan previsualizar_cuadre_piso y cuadrar_piso: una sola cuenta. Interna.';

-- ---------------------------------------------------------------------------
-- 3. Lo que se muestra Y se aplica: el resumen y las líneas con algo que decir.
--    PROMETE: {resumen: {...}, lineas: [...]} donde `lineas` trae cada prenda que se mueve, que quedó «no cargada», que
--             está archivada con prendas o escaneada, o que se escaneó sin ser inventario; en orden de prenda.
--             resumen.total = antes.piso + antes.almacen = despues.piso + despues.almacen (el total no cambia).
--    ASUME:   lo mismo que fn_cuadre_piso_calculo.
-- ---------------------------------------------------------------------------
create or replace function retail.fn_cuadre_piso_vista(p_ubicacion_id uuid, p_guardado jsonb)
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $fn$
  with c as materialized (
    select * from retail.fn_cuadre_piso_calculo(p_ubicacion_id, p_guardado)
  ),
  cuadra as (
    select * from c where c.motivo = 'cuadra'
  )
  select jsonb_build_object(
    'resumen', jsonb_build_object(
      'lineas_al_piso',       (select count(*) from cuadra where al_piso > 0),
      'prendas_al_piso',      (select coalesce(sum(al_piso), 0) from cuadra),
      'lineas_al_almacen',    (select count(*) from cuadra where al_almacen > 0),
      'prendas_al_almacen',   (select coalesce(sum(al_almacen), 0) from cuadra),
      'lineas_no_cargadas',   (select count(*) from cuadra where no_cargadas > 0),
      'prendas_no_cargadas',  (select coalesce(sum(no_cargadas), 0) from cuadra),
      'prendas_escaneadas',   (select coalesce(sum(escaneadas), 0) from c),
      'antes',   jsonb_build_object('piso',    (select coalesce(sum(piso_libre), 0) from cuadra),
                                    'almacen', (select coalesce(sum(almacen_libre), 0) from cuadra)),
      'despues', jsonb_build_object('piso',    (select coalesce(sum(piso_libre + al_piso - al_almacen), 0) from cuadra),
                                    'almacen', (select coalesce(sum(almacen_libre - al_piso + al_almacen), 0) from cuadra)),
      'total',                (select coalesce(sum(piso_libre + almacen_libre), 0) from cuadra),
      'apartadas',            (select coalesce(sum(apartadas), 0) from cuadra),
      'archivadas',           jsonb_build_object('lineas',  (select count(*) from c where motivo = 'archivada'),
                                                 'almacen', (select coalesce(sum(almacen_libre), 0) from c where motivo = 'archivada'),
                                                 'piso',    (select coalesce(sum(piso_libre), 0) from c where motivo = 'archivada')),
      'escaneadas_fuera',     (select coalesce(sum(escaneadas), 0) from c where motivo <> 'cuadra'),
      'danadas',              (select coalesce(sum(st.cantidad), 0)::integer
                                 from retail.stock st
                                 join retail.sububicaciones sb on sb.id = st.sububicacion_id and sb.tipo = 'cuarentena'
                                where st.ubicacion_id = p_ubicacion_id)
    ),
    'lineas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'variante_id', c.variante_id,
               'prenda', coalesce(retail.fn_prenda_corta(c.variante_id), 'Una prenda'),
               'motivo', c.motivo,
               'almacen', c.almacen_libre,
               'piso', c.piso_libre,
               'apartadas', c.apartadas,
               'escaneadas', c.escaneadas,
               'al_piso', c.al_piso,
               'al_almacen', c.al_almacen,
               'no_cargadas', c.no_cargadas) order by c.variante_id)
        from c
       where c.al_piso > 0 or c.al_almacen > 0 or c.no_cargadas > 0
          or (c.motivo = 'archivada')
          or (c.motivo = 'no_es_inventario' and c.escaneadas > 0)
    ), '[]'::jsonb)
  );
$fn$;

comment on function retail.fn_cuadre_piso_vista(uuid, jsonb) is
  'ADR-0328: el resumen y las líneas del cuadre del piso (lo que la pantalla muestra y cuadrar_piso aplica), sobre fn_cuadre_piso_calculo. Interna.';

-- ---------------------------------------------------------------------------
-- 4. La respuesta de un cuadre guardado (la misma forma la primera vez y en cada reintento).
-- ---------------------------------------------------------------------------
create or replace function retail.fn_cuadre_piso_respuesta(p_cuadre_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $fn$
  select c.resumen || jsonb_build_object(
           'cuadre_id', c.id,
           'ubicacion_id', c.ubicacion_id,
           'cuadrado_en', c.created_at,
           'por', retail.fn_actividad_nombre(c.persona_id),
           'nota', c.nota,
           'no_cargado', c.no_cargado)
    from retail.cuadres_piso c
   where c.id = p_cuadre_id;
$fn$;

comment on function retail.fn_cuadre_piso_respuesta(uuid) is
  'ADR-0328: lo que devuelve cuadrar_piso de un cuadre guardado (resumen + cuadre_id, cuadrado_en, por, nota, no_cargado). Interna.';

-- ---------------------------------------------------------------------------
-- 4b. El conteo abierto de la sede (si hay): lo que frena el cuadre y lo que la pantalla avisa antes.
--    PROMETE: {conteo_id, numero, abierto_en, lugar ('piso' | 'almacen' | null), por} del conteo abierto de la sede, o
--             null. La base admite uno solo por sede (`conteos_un_abierto_por_ubicacion`).
--    ASUME:   nada; lee lo confirmado. Quien escribe la llama con el stock ya bloqueado (ver «POR QUÉ UN CONTEO…»).
-- ---------------------------------------------------------------------------
create or replace function retail.fn_cuadre_piso_conteo_abierto(p_ubicacion_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $fn$
  select jsonb_build_object(
           'conteo_id', c.id,
           'numero', c.numero,
           'abierto_en', c.created_at,
           'lugar', case s.tipo when 'piso_venta' then 'piso' when 'almacen_tienda' then 'almacen' end,
           'por', case when c.abierto_por is null then null else retail.fn_actividad_nombre(c.abierto_por) end)
    from retail.conteos c
    left join retail.sububicaciones s on s.id = c.sububicacion_id
   where c.ubicacion_id = p_ubicacion_id and c.estado = 'abierto'
   order by c.created_at desc
   limit 1;
$fn$;

comment on function retail.fn_cuadre_piso_conteo_abierto(uuid) is
  'ADR-0328: el conteo abierto de la sede ({conteo_id, numero, abierto_en, lugar, por}) o null. Un conteo abierto frena el cuadre del piso: los dos corregirían las mismas prendas. Interna.';

-- ---------------------------------------------------------------------------
-- 5. Previsualizar (la pantalla «Revisar»). Solo lectura.
--    PROMETE: la vista del cuadre con el stock de AHORA, más el último cuadre de la sede, el conteo abierto (si hay: el
--             cuadre no se podrá confirmar hasta cerrarlo o cancelarlo) y la hora de la lectura.
--    ASUME:   quien la llama ve Existencias (o es líder) y opera esa sede. Escanear y revisar no es confirmar.
-- ---------------------------------------------------------------------------
create or replace function retail.previsualizar_cuadre_piso(p_ubicacion_id uuid, p_guardado jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_lista jsonb;
  v_ultimo uuid;
begin
  if not ((fn_es_lider() or fn_ve_modulo('existencias')) and fn_puede_operar_ubicacion(p_ubicacion_id)) then
    raise exception 'Para revisar el cuadre del piso hace falta ver Existencias en tu rol y que sea tu sede.'
      using hint = 'cuadre_sin_permiso';
  end if;
  if not exists (select 1 from sububicaciones s where s.ubicacion_id = p_ubicacion_id and s.tipo = 'piso_venta')
     or not exists (select 1 from sububicaciones s where s.ubicacion_id = p_ubicacion_id and s.tipo = 'almacen_tienda') then
    raise exception 'Esta sede todavía no separa piso y almacén: no hay piso que cuadrar.' using hint = 'cuadre_tienda_sin_piso';
  end if;
  v_lista := fn_cuadre_piso_lista(p_guardado);
  v_ultimo := (select c.id from cuadres_piso c where c.ubicacion_id = p_ubicacion_id order by c.created_at desc, c.id limit 1);

  return fn_cuadre_piso_vista(p_ubicacion_id, v_lista) || jsonb_build_object(
    'ubicacion_id', p_ubicacion_id,
    'revisado_en', clock_timestamp(),
    'ultimo_cuadre', case when v_ultimo is null then null else fn_cuadre_piso_respuesta(v_ultimo) end,
    'conteo_abierto', fn_cuadre_piso_conteo_abierto(p_ubicacion_id));
end;
$fn$;

comment on function retail.previsualizar_cuadre_piso(uuid, jsonb) is
  'ADR-0328: lo que haría el cuadre del piso con lo escaneado (p_guardado = [{variante_id, cantidad}]), con el stock de ahora: {resumen, lineas, ultimo_cuadre, conteo_abierto, revisado_en}. Solo lectura; quien ve Existencias en su sede.';

-- ---------------------------------------------------------------------------
-- 6. La fecha del último cuadre de una sede (la portada de Existencias, actividad 8). Solo lectura.
--    PROMETE: {cuadrado_en, por, prendas_al_piso, prendas_al_almacen, cuadres, conteo_abierto}; sin cuadre, cuadrado_en
--             nulo y cuadres 0. `conteo_abierto` (o null): la pantalla avisa ANTES de escanear que no se podrá confirmar.
-- ---------------------------------------------------------------------------
create or replace function retail.fn_cuadre_piso_estado(p_ubicacion_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_ultimo cuadres_piso%rowtype;
  v_cuadres integer;
  v_conteo jsonb;
begin
  if not ((fn_es_lider() or fn_ve_modulo('existencias')) and fn_puede_operar_ubicacion(p_ubicacion_id)) then
    raise exception 'Para ver el cuadre del piso hace falta ver Existencias en tu rol y que sea tu sede.'
      using hint = 'cuadre_sin_permiso';
  end if;
  v_cuadres := (select count(*) from cuadres_piso c where c.ubicacion_id = p_ubicacion_id);
  v_conteo := fn_cuadre_piso_conteo_abierto(p_ubicacion_id);
  for v_ultimo in
    select * from cuadres_piso c where c.ubicacion_id = p_ubicacion_id order by c.created_at desc, c.id limit 1
  loop
    return jsonb_build_object(
      'cuadrado_en', v_ultimo.created_at,
      'por', fn_actividad_nombre(v_ultimo.persona_id),
      'prendas_al_piso', coalesce((v_ultimo.resumen ->> 'prendas_al_piso')::integer, 0),
      'prendas_al_almacen', coalesce((v_ultimo.resumen ->> 'prendas_al_almacen')::integer, 0),
      'cuadres', v_cuadres,
      'conteo_abierto', v_conteo);
  end loop;
  return jsonb_build_object('cuadrado_en', null, 'por', null, 'prendas_al_piso', 0, 'prendas_al_almacen', 0, 'cuadres', 0,
                            'conteo_abierto', v_conteo);
end;
$fn$;

comment on function retail.fn_cuadre_piso_estado(uuid) is
  'ADR-0328: el último cuadre del piso de una sede: {cuadrado_en, por, prendas_al_piso, prendas_al_almacen, cuadres, conteo_abierto}. Sin cuadre, cuadrado_en nulo; sin conteo abierto, conteo_abierto nulo. Quien ve Existencias en su sede.';

-- ---------------------------------------------------------------------------
-- 7. Cuadrar el piso: todo o nada.
--    PROMETE: o se mueven todas las líneas de la cuenta (y quedan su cabecera y sus ítems), o nada. El mismo intento
--             reenviado devuelve el MISMO cuadre (ya_registrado) sin mover nada; con otros datos, no repite nada.
--    ASUME:   la sede separa piso y almacén y no tiene un conteo abierto; lo escaneado es lo GUARDADO del almacén de la
--             sede desde p_escaneo_desde (hora del servidor; no futura ni de hace más de 3 días); confirma un LÍDER.
-- ---------------------------------------------------------------------------
create or replace function retail.cuadrar_piso(
  p_ubicacion_id uuid,
  p_guardado jsonb,
  p_escaneo_desde timestamptz,
  p_nota text default null,
  p_token uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  c_centinela constant uuid := '22222222-2222-4222-8222-222222222222';
  c_nota_mov constant text := 'Cuadre del piso';
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_lista jsonb;
  v_huella text;
  v_prev cuadres_piso%rowtype;
  v_actor uuid;
  v_piso uuid;
  v_almacen uuid;
  v_otro cuadres_piso%rowtype;
  v_conteo jsonb;
  v_movidas jsonb;
  v_vista jsonb;
  v_id uuid;
  v_mov uuid;
  r record;
begin
  if p_token is null then
    raise exception 'Falta la marca de este intento. Recarga la página: lo escaneado sigue guardado en este equipo.'
      using hint = 'cuadre_sin_token';
  end if;
  -- Confirmar el cuadre es del líder, a la vista (escanear y revisar lo puede quien ve Existencias). Se le pregunta a la
  -- CUENTA, no al responsable: en una terminal, el líder entra con su cuenta en el mismo equipo (el borrador es por sede).
  if not fn_es_lider() then
    raise exception 'Solo un líder confirma el cuadre del piso. Escanea todo y pídele que entre con su cuenta en este mismo equipo y elija esta tienda arriba: lo escaneado no se pierde.'
      using hint = 'cuadre_solo_lider';
  end if;
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para mover mercadería en esa sede.' using hint = 'cuadre_sin_tienda';
  end if;
  -- No futura (el esquema exige escaneo_desde <= created_at, que es now()): la pantalla la pide en el reloj del servidor con
  -- un minuto de margen hacia atrás, así que una hora futura no es un desfase, es un dato que no vale.
  if p_escaneo_desde is null or p_escaneo_desde > now() or p_escaneo_desde < now() - interval '3 days' then
    raise exception 'La hora del escaneo no es válida (más de 3 días o en el futuro). Empieza el escaneo de nuevo.'
      using hint = 'cuadre_escaneo_invalido';
  end if;
  if char_length(coalesce(v_nota, '')) > 300 then
    raise exception 'La nota admite hasta 300 caracteres.' using hint = 'cuadre_nota_larga';
  end if;
  v_lista := fn_cuadre_piso_lista(p_guardado);
  v_huella := md5(concat_ws('|', p_ubicacion_id::text,
                            to_char(p_escaneo_desde at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
                            coalesce(v_nota, ''), v_lista::text));

  -- Candado 1: la marca. Un segundo clic espera aquí y, al soltarse, encuentra el cuadre ya guardado. Se mira ANTES del
  -- responsable y del stock: comprobar algo ya guardado no escribe nada, y el piso pudo cambiar desde entonces.
  perform pg_advisory_xact_lock(hashtextextended('cuadre_piso:' || p_token::text, 0));
  for v_prev in select * from cuadres_piso c where c.token_cliente = p_token loop
    if v_prev.ubicacion_id is distinct from p_ubicacion_id or v_prev.huella <> v_huella then
      raise exception 'Ese intento ya se guardó con otros datos: no se repitió nada. Recarga la página para ver el cuadre guardado.'
        using hint = 'cuadre_token_reusado';
    end if;
    return fn_cuadre_piso_respuesta(v_prev.id) || jsonb_build_object('ya_registrado', true);
  end loop;

  -- Candado 2: la sede. Dos líderes que confirman a la vez se forman en fila; el segundo, al pasar, ve que su escaneo es
  -- anterior al cuadre del primero y se rechaza con su propio aviso (no con un choque crudo).
  perform pg_advisory_xact_lock(hashtextextended('cuadre_piso_sede:' || p_ubicacion_id::text, 0));

  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación.' using hint = 'responsable_requerido';
  end if;

  v_piso := (select s.id from sububicaciones s where s.ubicacion_id = p_ubicacion_id and s.tipo = 'piso_venta');
  v_almacen := (select s.id from sububicaciones s where s.ubicacion_id = p_ubicacion_id and s.tipo = 'almacen_tienda');
  if v_piso is null or v_almacen is null then
    raise exception 'Esta sede todavía no separa piso y almacén: no hay piso que cuadrar.' using hint = 'cuadre_tienda_sin_piso';
  end if;

  -- Candado 3 (ADR-0190): las prendas y el stock del piso y del almacén de la sede, en orden de prenda: las que ya tienen
  -- stock en la sede y las escaneadas. Todo lo que estaba a medio escribir sobre esas filas termina antes de que miremos
  -- el libro. Una prenda NUEVA para la sede (sin stock ni escaneo) no queda bloqueada: por eso la cuenta va antes del
  -- chequeo del almacén (abajo), y lo que llegue de ella después no entra a la cuenta.
  perform fn_bloquear_en_orden(
    p_ubicacion_id,
    array(select st.variante_id from stock st
           where st.ubicacion_id = p_ubicacion_id and st.sububicacion_id in (v_piso, v_almacen)
          union
          select (x ->> 'variante_id')::uuid from jsonb_array_elements(v_lista) x),
    true);

  -- ¿Alguien cuadró esta sede después de que empezaste a escanear? Tu escaneo ya no vale.
  for v_otro in
    select * from cuadres_piso c
     where c.ubicacion_id = p_ubicacion_id and c.created_at > p_escaneo_desde
     order by c.created_at desc limit 1
  loop
    raise exception 'El piso de esta sede ya se cuadró a las % (%), después de que empezaste a escanear. No se movió nada.',
      to_char(v_otro.created_at at time zone 'America/Lima', 'HH24:MI'), fn_actividad_nombre(v_otro.persona_id)
      using hint = 'cuadre_ya_hecho',
            detail = fn_cuadre_piso_respuesta(v_otro.id)::text;
  end loop;

  -- ¿Hay un conteo abierto en la sede? Su cierre sumaría otra vez lo que el cuadre corrige (ver «POR QUÉ UN CONTEO…» en
  -- la cabecera). Se mira con el stock ya bloqueado: una verificación en curso espera al cuadre, y un conteo abierto
  -- antes ya está confirmado y se ve aquí.
  v_conteo := fn_cuadre_piso_conteo_abierto(p_ubicacion_id);
  if v_conteo is not null then
    raise exception 'Hay un conteo abierto en esta sede (Conteo %, abierto el %). Ciérralo o cancélalo en Conteo antes de cuadrar: si no, el conteo y el cuadre corregirían las mismas prendas dos veces. No se movió nada.',
      concat_ws(' ', v_conteo ->> 'numero',
                case v_conteo ->> 'lugar' when 'piso' then 'del piso' when 'almacen' then 'del almacén' end),
      to_char((v_conteo ->> 'abierto_en')::timestamptz at time zone 'America/Lima', 'DD/MM "a las" HH24:MI')
      using hint = 'cuadre_conteo_abierto',
            detail = v_conteo::text;
  end if;

  -- La cuenta, bajo candado: la MISMA que mostró «Revisar» (fn_cuadre_piso_vista), con el stock de este instante. Va
  -- ANTES de mirar el libro (revisión adversarial): lo que se confirme después de la cuenta lo atrapa el chequeo de abajo,
  -- y lo que se confirme después del chequeo no estaba en la cuenta, así que no se mueve. Al revés quedaba una rendija:
  -- una recepción de una prenda SIN stock en la sede (fuera de los candados) confirmada entre el chequeo y la cuenta
  -- pasaba al piso sin que nadie la hubiera escaneado.
  v_vista := fn_cuadre_piso_vista(p_ubicacion_id, v_lista);

  -- ¿Se movió algo en el ALMACÉN de la sede después de que empezaste a escanear (una reposición, una bajada desde la
  -- caja, una recepción, un apartado)? Entonces lo escaneado ya no se puede comparar con lo que el sistema tiene: se
  -- rechaza TODO y se dice qué prendas cambiaron, para volver a escanear solo esas. `revisado_hasta` es la hora desde la
  -- que vale el reescaneo, tomada con el stock ya bloqueado. Lo que NO cubre: una operación que EMPEZÓ antes de esa hora
  -- y quedó esperando nuestros candados se confirma después con su hora de inicio (movimientos.created_at = now()), y el
  -- siguiente intento no la ve. Restarle un margen a revisado_hasta no sirve: volvería a encontrar las mismas prendas
  -- que acaba de pedir reescanear y rechazaría otra vez. Queda escrito en el PR (cuadrar con la tienda cerrada lo evita).
  select jsonb_agg(jsonb_build_object('variante_id', q.variante_id,
                                      'prenda', coalesce(fn_prenda_corta(q.variante_id), 'Una prenda'))
                   order by q.variante_id)
    into v_movidas
    from (select distinct m.variante_id
            from movimientos m
            join variantes va on va.id = m.variante_id
            join productos pr on pr.id = va.producto_id
           where m.created_at > p_escaneo_desde
             and ((m.ubicacion_id = p_ubicacion_id and m.sububicacion_id = v_almacen)
               or (m.ubicacion_destino_id = p_ubicacion_id and m.sububicacion_destino_id = v_almacen))
             and m.variante_id <> c_centinela
             and not pr.es_prueba) q;
  if v_movidas is not null then
    raise exception 'Mientras escaneabas se % en el almacén. No se cuadró nada: vuelve a escanear solo %.',
      case when jsonb_array_length(v_movidas) = 1 then 'movió 1 prenda'
           else 'movieron ' || jsonb_array_length(v_movidas) || ' prendas' end,
      case when jsonb_array_length(v_movidas) = 1 then 'esa' else 'esas' end
      using hint = 'cuadre_almacen_movido',
            detail = jsonb_build_object('revisado_hasta', clock_timestamp(), 'prendas', v_movidas)::text;
  end if;

  -- La cabecera primero (los ítems la necesitan). El disparador exige la nota si la sede ya se había cuadrado.
  insert into cuadres_piso (ubicacion_id, persona_id, token_cliente, huella, escaneo_desde, resumen, no_cargado, nota)
    values (p_ubicacion_id, v_actor, p_token, v_huella, p_escaneo_desde, v_vista -> 'resumen',
            coalesce((select jsonb_agg(jsonb_build_object('variante_id', l -> 'variante_id', 'prenda', l -> 'prenda',
                                                          'escaneadas', l -> 'escaneadas', 'almacen', l -> 'almacen',
                                                          'piso', l -> 'piso', 'no_cargadas', l -> 'no_cargadas')
                                       order by l ->> 'variante_id')
                        from jsonb_array_elements(v_vista -> 'lineas') l
                       where (l ->> 'no_cargadas')::integer > 0), '[]'::jsonb),
            v_nota)
    returning id into v_id;

  -- Cada línea, en orden de prenda (el mismo orden de los candados), con el productor de siempre de la fila interna.
  -- Una prenda se mueve en UNA dirección: lo garantiza la cuenta y lo hace cumplir unique (cuadre_id, variante_id).
  for r in
    select (l ->> 'variante_id')::uuid as v, (l ->> 'al_piso')::integer as baja, (l ->> 'al_almacen')::integer as sube
      from jsonb_array_elements(v_vista -> 'lineas') l
     where (l ->> 'al_piso')::integer > 0 or (l ->> 'al_almacen')::integer > 0
     order by 1
  loop
    if r.baja > 0 then
      v_mov := mover_interno(p_ubicacion_id, r.v, r.baja, v_almacen, v_piso, c_nota_mov, null);
      insert into cuadre_piso_items (movimiento_id, cuadre_id, variante_id, sentido, cantidad) values (v_mov, v_id, r.v, 'al_piso', r.baja);
    else
      v_mov := mover_interno(p_ubicacion_id, r.v, r.sube, v_piso, v_almacen, c_nota_mov, null);
      insert into cuadre_piso_items (movimiento_id, cuadre_id, variante_id, sentido, cantidad) values (v_mov, v_id, r.v, 'al_almacen', r.sube);
    end if;
  end loop;

  return fn_cuadre_piso_respuesta(v_id) || jsonb_build_object('ya_registrado', false);
end;
$fn$;

comment on function retail.cuadrar_piso(uuid, jsonb, timestamptz, text, uuid) is
  'ADR-0328: cuadra el piso de una sede de una vez y todo o nada. p_guardado = lo escaneado como GUARDADO [{variante_id, cantidad}]; lo que el almacén tiene libre y nadie escaneó pasa al piso, lo escaneado que el sistema creía colgado sube al almacén y lo que excede lo guardado en no_cargado (no se aplica). Solo un líder (hint cuadre_solo_lider); firma el responsable. p_token obligatorio: el mismo intento devuelve el mismo cuadre (ya_registrado). Rechaza si el almacén se movió después de p_escaneo_desde (hint cuadre_almacen_movido, detail con las prendas y revisado_hasta), si la sede se cuadró después (cuadre_ya_hecho) o si tiene un conteo abierto (cuadre_conteo_abierto, detail con el conteo). Desde el segundo cuadre, la nota es obligatoria.';

-- Las internas: nadie de afuera. Las tres puertas: solo authenticated.
revoke all on function retail.fn_cuadre_piso_lista(jsonb) from public, anon, authenticated;
revoke all on function retail.fn_cuadre_piso_calculo(uuid, jsonb) from public, anon, authenticated;
revoke all on function retail.fn_cuadre_piso_vista(uuid, jsonb) from public, anon, authenticated;
revoke all on function retail.fn_cuadre_piso_respuesta(uuid) from public, anon, authenticated;
revoke all on function retail.fn_cuadre_piso_conteo_abierto(uuid) from public, anon, authenticated;
revoke all on function retail.previsualizar_cuadre_piso(uuid, jsonb) from public, anon;
grant execute on function retail.previsualizar_cuadre_piso(uuid, jsonb) to authenticated;
revoke all on function retail.fn_cuadre_piso_estado(uuid) from public, anon;
grant execute on function retail.fn_cuadre_piso_estado(uuid) to authenticated;
revoke all on function retail.cuadrar_piso(uuid, jsonb, timestamptz, text, uuid) from public, anon;
grant execute on function retail.cuadrar_piso(uuid, jsonb, timestamptz, text, uuid) to authenticated;

notify pgrst, 'reload schema';

reset lock_timeout;
