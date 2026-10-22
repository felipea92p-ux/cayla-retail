-- ============================================================================
-- 20261023121500_cierre_mes_chequeos_de_pendientes.sql — CAYLA V2 (ADR provisional «Cierre de mes: cuatro chequeos de pendientes»,
-- Felipe 2026-10-22). VERSIÓN PROVISIONAL: se reserva con `pnpm reservar migracion` antes de abrir el PR.
-- Finanzas ▸ Cierre de mes: cuatro chequeos nuevos, por sede, que AVISAN en octubre de 2026 y BLOQUEAN desde noviembre de 2026.
--
-- EL PROBLEMA PRIMERO. Un mes cerrado no debe reabrirse (es lo que el contador recibe; regla de Felipe, 2026-10-22) y el cierre solo miraba el
-- dinero y el diario.
-- Había cuatro cosas que dejan el mes "a medias" sin que ningún chequeo lo dijera, y que después de cerrar ya no se pueden
-- arreglar sin tocar un mes congelado:
--   · un envío recibido con un faltante que el proveedor nos debe y nadie resolvió («Nos debe», ADR-0362 / ADR-0393);
--   · un conteo de inventario abierto: su ajuste de stock entra con la fecha de CUANDO se cierra, no de cuando se contó;
--   · un sobrante de traslado «por revisar» (ADR-0404): la prenda de más no está en el stock de nadie hasta que un líder decide;
--   · una factura de mercadería registrada cuya mercadería no llegó: el diario ya la debe (201 / 4011 / 421, por la fecha de la
--     factura) pero la prenda no está en el stock.
-- Cerrar con cualquiera de las cuatro congela una diferencia que nadie vio. La regla de Felipe es «nada en silencio».
--
-- LA DECISIÓN (Felipe, 2026-10-22). Cuatro chequeos por sede (alcance `ubicacion`), con la misma forma de los demás
-- (`clave`, `ok`, `bloquea`, `datos`):
--   envios_con_diferencia  n = envíos con faltante sin resolver · unidades · monto al costo
--   conteos_abiertos       n = conteos abiertos · desde (fecha de apertura) · numero
--   sobrantes_traslado     n = traslados con sobrante por revisar · unidades
--   facturas_sin_recibir   n = facturas · unidades por recibir · monto (el total de esas facturas)
-- Cada uno se mide SIEMPRE (con 0 pendientes sale ok = true): un ✓ es la prueba de que se miró. `bloquea` es false si el mes es
-- anterior a la fecha de corte, y true si es ese mes o uno posterior Y la unidad todavía no se cerró (una unidad ya cerrada nunca
-- queda «frenada»: ver «UN MES CERRADO» más abajo). En octubre de 2026 avisan (quedan guardados en `periodo_cierres.avisos`, como
-- `cerrada_sin_prenda`); desde noviembre de 2026 impiden cerrar.
--
-- DECIDÍ:     La fecha de corte vive en `retail.parametros_finanzas.cierre_pendientes_bloquean_desde` (columna nueva, date, NOT NULL,
--             siempre día 1, por defecto 2026-11-01) y la función la lee por `fn_cierre_pendientes_bloquean_desde()`. NO va escrita
--             en `fn_cierre_mes_estado`.
-- DESCARTÉ:   (a) una fila en `parametros_tributarios`: es una tabla de VIGENCIAS (nombre, valor, desde cuándo rige) para cifras que
--             entran al diario con efecto hacia atrás, y tiene el candado de «no alcanzar un mes cerrado»; una fecha de corte de un
--             chequeo no es una cifra tributaria y su historial no se parece al de un IGV. (b) El corte escrito en la función: cambiarlo
--             sería volver a pegar SQL en producción (y el primer cierre real es en noviembre). (c) Una función `guardar_…` y una pantalla
--             en Configuración: hoy cambia a lo más una vez; sería una RPC sin llamador (código muerto, Knip) y un botón que mueve
--             el candado a un clic de distancia. Se cambia con un UPDATE explícito que pega quien lo decide. (d) Un hermano de
--             `inicio_finanzas`: ese corta lo que CUENTA Finanzas; este decide cuándo un chequeo FRENA el cierre. Comparten tabla
--             (una fila, solo funciones de Finanzas la leen), no semántica.
-- SE ROMPE SI: alguien mueve la fecha de corte hacia adelante para "poder cerrar" sin resolver nada (el aviso queda guardado en el
--             cierre, pero ya no frena); o si un envío reabierto (`reabrir_envio` baja sus diferencias de `vigente`) queda abierto sin
--             cerrar: mientras está abierto no tiene diferencias vigentes y este chequeo no lo ve (riesgo anotado, ver abajo).
--
-- QUIÉN VE LA CIFRA (revisión del 2026-10-22).
-- DECIDÍ:     El `monto` de `envios_con_diferencia` (lo que el proveedor nos debe, al costo) y el de `facturas_sin_recibir` (el total de
--             las facturas) sale NULO cuando quien mira no ve la plata de proveedores: `fn_ve_plata_de_proveedores()` (el líder, un
--             módulo de plata de Compras o el módulo Proveedores; ADR-0387). `n` y `unidades` no son plata y se quedan. Es el mismo
--             gesto de la planilla (`fn_planilla_visible()`): el chequeo se mide y se muestra, la cifra se calla. Vale por las tres
--             puertas por donde sale el dato: el chequeo vivo (`fn_cierre_mes_estado`), el aviso GUARDADO en el cierre que esa misma
--             función devuelve (`cierre.avisos`) y la historia del mes de `fn_cierre_panel` (`historia[].avisos`); las dos últimas pasan
--             por `fn_cierre_avisos_sin_plata`, que reescribe el `monto` de esas dos claves y deja intacto todo lo demás.
-- DESCARTÉ:   (a) quitar los dos chequeos a esa cuenta: quien cierra con solo «Cierre de mes» no vería que hay un pendiente, y la regla
--             es «nada en silencio». (b) Una pregunta distinta para cada chequeo (`fn_puede_ver_dinero_de_compras()` para las
--             facturas, la plata de proveedores para los envíos): dos reglas para el mismo dato, y quien tiene Proveedores ya ve el
--             saldo de cada factura (20261012204000). (c) Un `monto` en cero para quien no ve: la pantalla diría «S/ 0».
-- SE ROMPE SI: se agrega a estos chequeos otra cifra de Compras y se olvida de pasarla por `v_ve_plata` Y por la lista de claves de
--             `fn_cierre_avisos_sin_plata` (viven en dos lugares: el chequeo y el filtro del aviso guardado); o una cuenta sin plata
--             CIERRA un mes con avisos: el aviso se guarda con lo que ella ve, es decir sin `monto`, y esa cifra no se recupera
--             después (leerlo filtra, guardarlo no puede completar). Pregunta abierta para Felipe.
--
-- UN MES CERRADO (revisión del 2026-10-22).
-- DECIDÍ:     En una unidad con estado `cerrado`, los cuatro chequeos salen con `bloquea = false`: se siguen midiendo y mostrando (un
--             pendiente que aparece después de cerrar es información), pero ya no impiden nada, porque no hay nada que cerrar. Una
--             unidad `reabierta` vuelve a frenar. Se resuelve en la CTE `pb`, una fila por unidad.
-- DESCARTÉ:   (a) no medirlos en una unidad cerrada: se perdería el ✓ y la señal de que algo apareció después. (b) Dejar `bloquea = true`
--             y arreglarlo en la pantalla: la base diría «1 bloqueante» de un mes que ya no se puede cerrar, y el que lee `bloqueantes`
--             (el semáforo, el pulso) se equivocaría. La base decide, la pantalla solo lo dice.
-- SE ROMPE SI: alguien lee `bloquea` de un chequeo como «este mes tiene un problema grave» en vez de «impide cerrar»; para un mes cerrado
--             solo informa, y lo que importa es `ok`.
--
-- QUÉ ES UN PENDIENTE (lo que cada chequeo cuenta, y por qué así):
--   · envios_con_diferencia — `despacho_diferencias_vigentes` con `tipo = 'faltante'` y causa `no_vino` o `devuelta` cuya cantidad aún
--     supera lo resuelto en `proveedor_deuda_resoluciones` (exactamente la definición de «Nos debe», `fn_nos_debe_resumen`). Un faltante
--     `se_perdio` / `otra_sede` y los sobrantes (regalo, cobra aparte…) ya traen su causa dicha al recibir: no tienen una resolución
--     por hacer (un envío sin aviso no deja diferencias: mide lo que llegó contra sí mismo, ADR-0393). Se mide desde la tabla y no desde
--     `fn_nos_debe_deuda`: esa función une con la orden, el proveedor y la categoría con uniones internas, y una diferencia que no
--     una desaparecería del conteo sin avisar; aquí la definición es la misma y no depende de ninguna unión. Sede = la que recibió.
--   · conteos_abiertos — `conteos.estado = 'abierto'`, sin los de prueba. La base ya impide más de uno abierto por sede.
--   · sobrantes_traslado — `traslado_sobrantes.estado = 'por_revisar'`. Sede = la que recibió (la prenda de más está en su piso).
--   · facturas_sin_recibir — `compras` de MERCADERÍA vigentes con `estado_recepcion` `sin_recibir` o `parcial` (la columna que ya
--     calcula Compras: cuenta las líneas cerradas a propósito como resueltas). Sede = la que GESTIONA la factura, que es donde
--     el diario la registra (`fn_asientos`, `cm`): el pendiente aparece en la misma unidad donde está el asiento.
--   Todos son estado de AHORA, filtrado por la FECHA del hecho (cuándo se abrió el conteo o el envío, cuándo se creó el sobrante, la
--   fecha de emisión de la factura): lo que ocurre después de terminar el mes no frena ese mes (si no, cerrar octubre esperaría a las
--   operaciones de noviembre y nunca cerraría). Pero la fecha del hecho no es la fecha en que se grabó: un envío abierto el 30 de
--   junio y cerrado el 1 de julio, o una factura de junio registrada en julio, aparecen en junio DESPUÉS de terminado. Mientras la
--   unidad siga abierta frenan; cuando ya se cerró, solo se muestran (ver «UN MES CERRADO»).
--   El envío se fecha por `coalesce(abierto_en, creado_en)` y no por cuándo se grabó la diferencia: reabrir y volver a cerrar un
--   envío graba diferencias nuevas con fecha nueva, y con esa fecha un faltante de octubre saldría de octubre.
--
-- ESTADOS QUE NUNCA DEBEN EXISTIR
--   · Un pendiente que bloquea y no frena el cierre: `cerrar_periodo` cuenta `bloqueantes` = chequeos con `bloquea and not ok`
--     (`fn_cierre_mes_estado`), así que un chequeo nuevo con bloquea = true frena solo. Probado en `cierre_diferencias.mjs`.
--   · Un pendiente que avisa y frena: con `bloquea = false` va a `v_avisos` (todo lo que no bloquea, no pasa y no es `huella`).
--   · Un chequeo con `bloquea` nulo: sin fila de parámetros, `coalesce(…, true)` bloquea (lo seguro: un cierre frenado se arregla,
--     una diferencia congelada en un mes que no se reabre, no).
--   · Que un chequeo nuevo mueva la huella: la huella es del DIARIO congelado, y estos chequeos no leen ni escriben el diario.
--   · Una unidad CERRADA con un chequeo que bloquea: sería un mes que dice «falta algo para cerrarlo» cuando ya está cerrado
--     (`bloqueantes` = 1 en un mes cerrado). La CTE `pb` lo impide: cerrado => `bloquea = false`. Probado en `cierre_diferencias.mjs`.
--   · Una cuenta sin plata de proveedores que recibe un `monto` (ni en cero: sería «S/ 0»). Probado con una cuenta que solo tiene
--     «Cierre de mes».
--
-- QUÉ TOCA
--   1. `retail.parametros_finanzas`: columna `cierre_pendientes_bloquean_desde` (una fila, solo la leen funciones de Finanzas; RLS
--      encendido y sin permisos para `authenticated`) y `retail.fn_cierre_pendientes_bloquean_desde()` (de uso interno).
--   2. `retail.fn_cierre_mes_estado(date)`: reemplazos ANCLADOS sobre la definición VIVA (dos variables, `v_pendientes_bloquean` y
--      `v_ve_plata`; cinco CTE —`ed`, `cb`, `sb`, `fs` y `pb`— y cuatro filas de chequeo en los órdenes 9–12; `diario` pasa de 9 a 13 y
--      `huella` de 10 a 14, solo cambia el orden en que se muestran). Los chequeos existentes no cambian en nada. La definición viva ya trae dos parches ajenos que se conservan:
--      la puerta `fn_puede_cerrar_mes()` (20260928220000, ADR-0253) y el chequeo `cerrada_sin_prenda` (20261005130050, ADR-0337).
--   2b. `retail.fn_cierre_avisos_sin_plata(jsonb)` (NUEVA, de uso interno, pura) y `retail.fn_cierre_panel(date)`: la historia del mes
--      pasa sus avisos guardados por ese filtro cuando quien mira no ve la plata de proveedores (un reemplazo anclado); en
--      `fn_cierre_mes_estado`, el `cierre.avisos` de cada unidad, igual.
--   3. `retail.cerrar_periodo(date, text, uuid)`: SOLO el mensaje «falta …» aprende a nombrar los cuatro (sin eso diría la clave en
--      crudo: «falta envios_con_diferencia»). Un reemplazo anclado; conserva el parche de 20261017034000 (llave del cerrojo).
--
-- REQUIERE (ya en producción): `20260928220000` (la puerta delegable `fn_puede_cerrar_mes`), `20261005130050` (el chequeo `cerrada_sin_prenda` y
-- los órdenes 9 y 10 de `diario` y `huella`), la fila de `parametros_finanzas`, y las tablas y la vista que leen los cuatro chequeos
-- (`despacho_diferencias_vigentes`, `proveedor_deuda_resoluciones`, `traslado_sobrantes`, `conteos`, `compras.estado_recepcion`) y la pregunta de la
-- plata de proveedores `fn_ve_plata_de_proveedores()` (20261012204000). Si falta algo de lo primero, el ancla no aparece; si falta algo de lo
-- segundo, el bloque de entrada lo dice (una función plpgsql no valida sus tablas al crearse: sin ese bloque quedaría creada y rota, y la pantalla
-- del Cierre se caería). En los dos casos TODO se aborta sin tocar nada.
--
-- PASOS PARA PEGAR EN PRODUCCIÓN (con el OK de Felipe):
--   1. ANCLA VERIFICABLE. Esta migración reemplaza tres definiciones VIVAS (`fn_cierre_mes_estado`, `fn_cierre_panel` y `cerrar_periodo`)
--      y se apoya en una que no toca (`fn_puede_cerrar_mes`). Antes de pegar, correr en producción:
--        select 'fn_cierre_mes_estado' as f, md5(pg_get_functiondef('retail.fn_cierre_mes_estado(date)'::regprocedure))
--        union all select 'cerrar_periodo', md5(pg_get_functiondef('retail.cerrar_periodo(date, text, uuid)'::regprocedure))
--        union all select 'fn_cierre_panel', md5(pg_get_functiondef('retail.fn_cierre_panel(date)'::regprocedure))
--        union all select 'fn_puede_cerrar_mes', md5(pg_get_functiondef('retail.fn_puede_cerrar_mes()'::regprocedure));
--      Huellas de producción al 22-oct-2026, las que esta migración espera:
--        fn_cierre_mes_estado = ea9dede5a8c7a70191867b31bd1c6f73
--        cerrar_periodo       = 79873c92c0cccfa313f1196ac567b93d
--        fn_cierre_panel      = 2cfa3733629189b5a35523fd4a27e8d6
--        fn_puede_cerrar_mes  = ded0baa119c7b4632ce5011ebdad0d24   (no se toca; es la puerta que las otras conservan)
--      Si alguna no coincide, producción cambió después de esta revisión: NO pegar, comparar la definición viva con la de la base
--      local de la que salió esta migración y revisar los anclajes. (Las anclas también abortan solas si el texto no está una sola
--      vez, pero un cambio que no toca un ancla pasaría sin avisar: la huella lo delata.)
--   2. UNA sola ejecución en el SQL Editor. Un `alter table` de una tabla de una fila con `lock_timeout = 3s`, sin políticas ni
--      `drop trigger` (ADR-0195). Re-ejecutable: cada reemplazo se salta si su texto nuevo ya está; cada ancla debe aparecer
--      EXACTAMENTE una vez o se aborta todo. Ningún texto entre comillas lleva una lectura con destino a variable (CLAUDE.md,
--      «El SQL Editor agrega líneas por su cuenta»). Probada con `pnpm pruebas:cierre-diferencias`.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- 0. Lo que los chequeos leen tiene que existir ANTES de tocar nada.
do $pre$
declare
  v_falta text;
begin
  v_falta := (select string_agg(r, ', ' order by r)
                from unnest(array['retail.parametros_finanzas', 'retail.despachos', 'retail.despacho_diferencias_vigentes',
                                  'retail.proveedor_deuda_resoluciones', 'retail.conteos', 'retail.traslado_sobrantes', 'retail.compras']) r
               where to_regclass(r) is null);
  if v_falta is not null then
    raise exception 'Falta en esta base: % (pega antes las migraciones de las que depende esta)', v_falta;
  end if;
  if not exists (select 1 from pg_attribute where attrelid = 'retail.compras'::regclass and attname = 'estado_recepcion' and not attisdropped) then
    raise exception 'Falta en esta base: retail.compras.estado_recepcion (pega antes las migraciones de Compras)';
  end if;
  if to_regprocedure('retail.fn_ve_plata_de_proveedores()') is null then
    raise exception 'Falta en esta base: retail.fn_ve_plata_de_proveedores() (pega antes 20261012204000_compras_todas_las_tiendas)';
  end if;
  if not exists (select 1 from retail.parametros_finanzas p where p.id) then
    raise exception 'Falta la fila de retail.parametros_finanzas: sin ella no hay dónde guardar la fecha de corte';
  end if;
end
$pre$;

-- 1. El parámetro --------------------------------------------------------------------------------------------------------
alter table retail.parametros_finanzas
  add column if not exists cierre_pendientes_bloquean_desde date not null default date '2026-11-01'
    constraint parametros_finanzas_pendientes_primer_dia check (extract(day from cierre_pendientes_bloquean_desde) = 1);
comment on column retail.parametros_finanzas.cierre_pendientes_bloquean_desde is
  'Desde qué mes los cuatro chequeos de pendientes del Cierre de mes (envíos con diferencia, conteos abiertos, sobrantes de traslado, facturas sin recibir) FRENAN el cierre; antes de ese mes solo avisan y el aviso queda guardado en el cierre. Siempre día 1. Se cambia con un UPDATE explícito (no hay pantalla).';

create or replace function retail.fn_cierre_pendientes_bloquean_desde()
returns date
language sql
stable
security definer
set search_path = retail, public, extensions
as $$ select p.cierre_pendientes_bloquean_desde from retail.parametros_finanzas p where p.id; $$;
comment on function retail.fn_cierre_pendientes_bloquean_desde() is
  'USO INTERNO: el primer mes en que los chequeos de pendientes del Cierre de mes bloquean. Nulo si falta la fila de parámetros (quien la llama trata eso como «bloquea»).';
revoke all on function retail.fn_cierre_pendientes_bloquean_desde() from public, anon, authenticated;

-- El aviso GUARDADO al cerrar lleva el `monto` que veía quien cerró. Quien lo lee después y no ve la plata de proveedores no debe verlo:
-- esta función pura reescribe a nulo el `monto` de las dos claves con plata de Compras y deja intacto todo lo demás (por ejemplo el
-- `monto` de `cerrada_sin_prenda`, que es plata de VENTAS) y el orden. Solo la llaman las funciones del Cierre (de uso interno).
create or replace function retail.fn_cierre_avisos_sin_plata(p_avisos jsonb)
returns jsonb
language sql
immutable
set search_path = retail, public, extensions
as $$
  select case when p_avisos is null or jsonb_typeof(p_avisos) <> 'array' then p_avisos
         else coalesce((select jsonb_agg(case when a ->> 'clave' in ('envios_con_diferencia', 'facturas_sin_recibir')
                                                 and jsonb_typeof(a -> 'datos') = 'object' and (a -> 'datos' -> 'monto') is not null
                                              then jsonb_set(a, '{datos,monto}', 'null'::jsonb) else a end order by t.i)
                          from jsonb_array_elements(p_avisos) with ordinality t(a, i)), '[]'::jsonb) end;
$$;
comment on function retail.fn_cierre_avisos_sin_plata(jsonb) is
  'USO INTERNO: los avisos guardados de un cierre sin el `monto` de envios_con_diferencia y facturas_sin_recibir (plata de proveedores). Lo usan fn_cierre_mes_estado y fn_cierre_panel para quien no ve esa plata.';
revoke all on function retail.fn_cierre_avisos_sin_plata(jsonb) from public, anon, authenticated;

-- 2. Reemplazos anclados sobre la definición viva ------------------------------------------------------------------------
-- Cambia `p_viejo` por `p_nuevo` en la función `p_firma`. Si `p_nuevo` ya está, no hace nada (se aplicó antes); si no, `p_viejo`
-- debe aparecer exactamente una vez, o se aborta sin tocar nada. Se mira primero `p_nuevo` porque varios textos nuevos CONTIENEN a
-- su ancla: al revés se duplicarían al re-ejecutar.
create function pg_temp.anclar_cierre_pendientes(p_firma text, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $$
declare
  v_def text;
  v_veces int;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_veces := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_veces <> 1 then
    raise exception '% trae % veces el ancla «%» (se esperaba 1): la base no es la que se revisó, no se toca nada',
      p_firma, v_veces, left(p_viejo, 70);
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$$;

-- 2a. Las dos variables: ¿frenan estos chequeos en el mes que se mira?, y ¿quien mira ve la plata de proveedores?
select pg_temp.anclar_cierre_pendientes(
  'retail.fn_cierre_mes_estado(date)',
  E'  c_cargo_especial constant uuid := ''22222222-2222-4222-8222-222222222222'';\nbegin\n',
  $n$  c_cargo_especial constant uuid := '22222222-2222-4222-8222-222222222222';
  -- Los chequeos de pendientes (envíos con diferencia, conteos abiertos, sobrantes, facturas sin recibir) avisan antes de la fecha de
  -- corte de Finanzas y frenan desde ella. Sin fila de parámetros: frenan (una diferencia congelada en un mes cerrado no se arregla).
  v_pendientes_bloquean boolean := coalesce(v_mes >= retail.fn_cierre_pendientes_bloquean_desde(), true);
  -- La plata de proveedores (ADR-0387): quien solo tiene el módulo «Cierre de mes» cierra el mes pero no ve lo que cuestan las
  -- facturas ni lo que un proveedor nos debe. Para esa cuenta, `monto` de los dos chequeos con plata sale nulo (como la planilla).
  v_ve_plata boolean := coalesce(retail.fn_ve_plata_de_proveedores(), false);
begin
$n$);

-- 2b. Las cuatro CTE de lo pendiente y la que dice si frenan, justo antes de `pm`.
select pg_temp.anclar_cierre_pendientes(
  'retail.fn_cierre_mes_estado(date)',
  E'  pm as (\n    select p.ubicacion_id as uid,\n',
  $n$  -- Faltantes que el proveedor nos debe y nadie resolvió (los mismos que «Nos debe»), por la sede que recibió el envío. Se lee de la
  -- tabla y no de fn_nos_debe_deuda: esa función une con la orden, el proveedor y la categoría, y una unión que falle quitaría la fila.
  ed as (
    select d.ubicacion_destino_id as uid, count(distinct x.despacho_id) as n,
           sum(x.cantidad - s.resuelto)::integer as unidades,
           sum((x.cantidad - s.resuelto) * x.costo_unitario) as monto
      from retail.despacho_diferencias_vigentes x
      join retail.despachos d on d.id = x.despacho_id
     cross join lateral (select coalesce(sum(r.cantidad), 0)::integer as resuelto
                           from retail.proveedor_deuda_resoluciones r
                          where r.diferencia_id = x.id) s
     where x.tipo = 'faltante' and x.causa in ('no_vino', 'devuelta')
       and x.cantidad > s.resuelto
       and coalesce(d.abierto_en, x.creado_en) < v_fin_ts
     group by d.ubicacion_destino_id
  ),
  -- Conteos de inventario sin cerrar que ya existían al terminar el mes.
  cb as (
    select c.ubicacion_id as uid, count(*) as n,
           min((c.created_at at time zone 'America/Lima')::date) as desde,
           (array_agg(c.numero order by c.created_at))[1] as numero
      from retail.conteos c
     where c.estado = 'abierto' and not coalesce(c.es_prueba, false) and c.created_at < v_fin_ts
     group by c.ubicacion_id
  ),
  -- Prendas de más de un traslado que un líder todavía no revisó (ADR-0404), por la sede que las recibió.
  sb as (
    select s.ubicacion_id as uid, count(distinct s.transferencia_id) as n, sum(s.cantidad)::integer as unidades
      from retail.traslado_sobrantes s
     where s.estado = 'por_revisar' and s.creado_en < v_fin_ts
     group by s.ubicacion_id
  ),
  -- Facturas de mercadería vigentes a las que aún les falta mercadería por recibir (las líneas cerradas a propósito ya cuentan como
  -- resueltas en estado_recepcion), por la sede que las gestiona: donde el diario registra la factura.
  fs as (
    select c.ubicacion_gestion_id as uid, count(*) as n,
           sum(c.facturado_cantidad - c.recibido_cantidad - c.cerrado_cantidad)::integer as unidades,
           sum(c.total) as monto
      from retail.compras c
     where c.naturaleza = 'mercaderia' and c.estado = 'vigente' and c.estado_recepcion in ('sin_recibir', 'parcial')
       and c.fecha_emision <= v_fin
     group by c.ubicacion_gestion_id
  ),
  -- ¿Frenan los pendientes en cada unidad? Solo si el mes llegó a la fecha de corte Y la unidad todavía no se cerró. Una unidad
  -- cerrada es una foto que no cambia: un pendiente que aparece después (un envío abierto el último día del mes y cerrado al siguiente)
  -- se sigue mostrando, pero ya no impide nada porque no hay nada que cerrar. Una unidad reabierta sí frena: vuelve a ser un mes por cerrar.
  pb as (
    select uni.alc, uni.uid, v_pendientes_bloquean and coalesce(per.est, 'abierto') <> 'cerrado' as bloquea
      from uni left join per on per.alc = uni.alc and per.uid is not distinct from uni.uid
  ),
  pm as (
    select p.ubicacion_id as uid,
$n$);

-- 2c. `huella` pasa de orden 10 a 14 (primero, para no pisar el 13 de `diario`).
select pg_temp.anclar_cierre_pendientes(
  'retail.fn_cierre_mes_estado(date)',
  E'    select uni.alc, uni.uid, 10, ''huella'', hv.h = (per.cie ->> ''huella''), false,',
  E'    select uni.alc, uni.uid, 14, ''huella'', hv.h = (per.cie ->> ''huella''), false,');

-- 2d. Las cuatro filas de chequeo, antes de `diario`, que pasa de orden 9 a 13 en el mismo reemplazo.
select pg_temp.anclar_cierre_pendientes(
  'retail.fn_cierre_mes_estado(date)',
  E'    select uni.alc, uni.uid, 9, ''diario'', coalesce(dz.n, 0) = 0, true,\n',
  $n$    select uni.alc, uni.uid, 9, 'envios_con_diferencia', coalesce(ed.n, 0) = 0, pb.bloquea,
           jsonb_build_object('n', coalesce(ed.n, 0), 'unidades', coalesce(ed.unidades, 0),
                              'monto', case when v_ve_plata then coalesce(round(ed.monto, 2), 0) end)
      from uni left join ed on ed.uid = uni.uid
      join pb on pb.alc = uni.alc and pb.uid is not distinct from uni.uid
     where uni.alc = 'ubicacion'
    union all
    select uni.alc, uni.uid, 10, 'conteos_abiertos', coalesce(cb.n, 0) = 0, pb.bloquea,
           jsonb_build_object('n', coalesce(cb.n, 0), 'desde', cb.desde, 'numero', cb.numero)
      from uni left join cb on cb.uid = uni.uid
      join pb on pb.alc = uni.alc and pb.uid is not distinct from uni.uid
     where uni.alc = 'ubicacion'
    union all
    select uni.alc, uni.uid, 11, 'sobrantes_traslado', coalesce(sb.n, 0) = 0, pb.bloquea,
           jsonb_build_object('n', coalesce(sb.n, 0), 'unidades', coalesce(sb.unidades, 0))
      from uni left join sb on sb.uid = uni.uid
      join pb on pb.alc = uni.alc and pb.uid is not distinct from uni.uid
     where uni.alc = 'ubicacion'
    union all
    select uni.alc, uni.uid, 12, 'facturas_sin_recibir', coalesce(fs.n, 0) = 0, pb.bloquea,
           jsonb_build_object('n', coalesce(fs.n, 0), 'unidades', coalesce(fs.unidades, 0),
                              'monto', case when v_ve_plata then coalesce(fs.monto, 0) end)
      from uni left join fs on fs.uid = uni.uid
      join pb on pb.alc = uni.alc and pb.uid is not distinct from uni.uid
     where uni.alc = 'ubicacion'
    union all
    select uni.alc, uni.uid, 13, 'diario', coalesce(dz.n, 0) = 0, true,
$n$);

-- 2e. El aviso guardado de cada unidad (`cierre.avisos`), filtrado para quien no ve la plata de proveedores.
select pg_temp.anclar_cierre_pendientes(
  'retail.fn_cierre_mes_estado(date)',
  E'''motivo_reapertura'', c.motivo_reapertura, ''avisos'', c.avisos)\n',
  $n$'motivo_reapertura', c.motivo_reapertura,
                     'avisos', case when v_ve_plata then c.avisos else retail.fn_cierre_avisos_sin_plata(c.avisos) end)
$n$);

-- 2f. La historia del mes de la pantalla (`historia[].avisos`), igual. Se pregunta UNA vez por consulta, como el resto del repo.
select pg_temp.anclar_cierre_pendientes(
  'retail.fn_cierre_panel(date)',
  E'''motivo_reapertura'', c.motivo_reapertura, ''avisos'', c.avisos) order by c.cerrado_en)',
  $n$'motivo_reapertura', c.motivo_reapertura,
        'avisos', case when (select retail.fn_ve_plata_de_proveedores()) then c.avisos else retail.fn_cierre_avisos_sin_plata(c.avisos) end)
        order by c.cerrado_en)$n$);

-- 3. El mensaje de «todavía no se puede cerrar»: los cuatro nombres, en palabras de tienda.
select pg_temp.anclar_cierre_pendientes(
  'retail.cerrar_periodo(date, text, uuid)',
  $v$when 'planilla' then 'cerrarlo con una cuenta que vea la planilla en Dynamic'$v$,
  $n$when 'planilla' then 'cerrarlo con una cuenta que vea la planilla en Dynamic'
               when 'envios_con_diferencia' then 'resolver con el proveedor lo que faltó en los envíos'
               when 'conteos_abiertos' then 'cerrar el conteo de inventario abierto'
               when 'sobrantes_traslado' then 'revisar los sobrantes de traslado'
               when 'facturas_sin_recibir' then 'recibir la mercadería de las facturas'$n$);

drop function pg_temp.anclar_cierre_pendientes(text, text, text);

-- 4. Validación final: si algo no quedó, se deshace todo (la migración corre en una sola transacción).
do $v$
declare
  v_est text := pg_get_functiondef('retail.fn_cierre_mes_estado(date)'::regprocedure);
  v_cer text := pg_get_functiondef('retail.cerrar_periodo(date, text, uuid)'::regprocedure);
  v_pan text := pg_get_functiondef('retail.fn_cierre_panel(date)'::regprocedure);
  v_clave text;
begin
  foreach v_clave in array array['envios_con_diferencia', 'conteos_abiertos', 'sobrantes_traslado', 'facturas_sin_recibir'] loop
    if position('''' || v_clave || '''' in v_est) = 0 then
      raise exception 'fn_cierre_mes_estado no quedó con el chequeo %', v_clave;
    end if;
    if position('when ''' || v_clave || ''' then' in v_cer) = 0 then
      raise exception 'cerrar_periodo no nombra el chequeo % en su mensaje', v_clave;
    end if;
  end loop;
  if position('fn_cierre_pendientes_bloquean_desde' in v_est) = 0 then
    raise exception 'fn_cierre_mes_estado no lee la fecha de corte de los chequeos de pendientes';
  end if;
  -- La plata de proveedores se pregunta, y una unidad cerrada no se frena.
  if position('fn_ve_plata_de_proveedores' in v_est) = 0 or position('case when v_ve_plata then' in v_est) = 0 then
    raise exception 'fn_cierre_mes_estado no calla el monto de quien no ve la plata de proveedores';
  end if;
  if position('<> ''cerrado'' as bloquea' in v_est) = 0 or position('pb.bloquea' in v_est) = 0 then
    raise exception 'fn_cierre_mes_estado no deja de frenar una unidad ya cerrada';
  end if;
  if position('fn_cierre_avisos_sin_plata' in v_est) = 0 or position('fn_cierre_avisos_sin_plata' in v_pan) = 0
     or position('fn_ve_plata_de_proveedores' in v_pan) = 0 then
    raise exception 'el aviso guardado del cierre no se filtra para quien no ve la plata de proveedores';
  end if;
  -- Los parches ajenos tienen que seguir en pie: no se recreó ninguna función desde un archivo viejo.
  if position('fn_puede_cerrar_mes' in v_est) = 0 or position('''cerrada_sin_prenda''' in v_est) = 0 then
    raise exception 'fn_cierre_mes_estado perdió un parche anterior (la puerta fn_puede_cerrar_mes o cerrada_sin_prenda)';
  end if;
  if position('fn_puede_cerrar_mes' in v_pan) = 0 or position('''meses''' in v_pan) = 0 then
    raise exception 'fn_cierre_panel perdió un parche anterior (la puerta fn_puede_cerrar_mes o la lista de meses)';
  end if;
  if position('fn_puede_cerrar_mes' in v_cer) = 0 or position('to_char(v_mes, ''YYYY-MM-DD'')' in v_cer) = 0 then
    raise exception 'cerrar_periodo perdió un parche anterior (la puerta fn_puede_cerrar_mes o la llave del cerrojo)';
  end if;
  -- Los órdenes no se repiten: cerrada_sin_prenda 8, los cuatro nuevos 9 a 12, diario 13, huella 14.
  if position('uni.uid, 13, ''diario''' in v_est) = 0 or position('uni.uid, 14, ''huella''' in v_est) = 0 then
    raise exception 'el orden de diario y huella no quedó';
  end if;
end
$v$;
