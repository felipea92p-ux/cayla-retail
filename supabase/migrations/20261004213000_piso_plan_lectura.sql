-- ============================================================================
-- 20261004213000_piso_plan_lectura.sql — CAYLA V2 · ADR-0328 (actividad 7, «un solo motor del piso») y ADR-0329 act. 2026-10-04
-- Una sola lectura, de solo lectura, con todo lo que el motor del piso (`apps/web/lib/piso-plan.ts`) necesita de UNA sede.
--
-- EL PROBLEMA PRIMERO. La misma pregunta —¿falta o sobra en el piso?— tiene cinco reglas en la web: piso ≤ 4
-- (`politica-operativa-inventario.ts`), 0 en el piso y algo atrás (`inventario-reglas.ts`), 14 días de cobertura, «estancada» a
-- los 14 días y la vara de Frescura. Con piso ≤ 4, Tienda TRU marca «Reponer» en las 510 de sus 510 tallas: ninguna tiene más de
-- 4 colgadas, así que la regla nunca puede decir «Mantener». Y ninguna de las cinco sabe lo que se vendió «sin registrar»: AQP
-- vendió 170 prendas en 14 días y 169 salieron anotadas a mano (ADR-0328). Felipe decidió el reemplazo (ADR-0329 act. 2026-10-04):
-- mínimo de 1 por talla y color solo en las tallas centrales, la lista del día ordenada por lo que se vendió, y la señal para el
-- Taller por categoría × talla × familia de color, contando también lo anotado a mano.
--
-- QUÉ HACE. `retail.fn_piso_plan_lectura(p_ubicacion_id)` devuelve UN jsonb con las entradas crudas, sin decidir nada:
--   · `tallas`: cada talla (variante) con stock o en camino en la sede —lo libre en piso y almacén sale de
--     `fn_existencias_base`, LA fórmula de stock (ADR-0270)— con su categoría, talla, color y familia de color, y cuántas de ESA
--     prenda se vendieron escaneadas hoy, ayer y en los 14 días (días de Lima).
--   · `ventas`: lo vendido en los 14 días por categoría × talla × familia de color: `escaneadas` y `anotadas` (las ventas
--     «sin registrar» que siguen pendientes en `prendas_por_regularizar`).
--   · `anotadas_recientes`: lo anotado a mano «sin registrar» hoy y ayer que sigue pendiente, por categoría × talla × color exacto:
--     el reloj rápido para lo que no tiene prenda (en AQP, 169 de 170 ventas). El motor sube a 1 lo colgado que piden las tallas
--     de la sede con esa llave y las pone primero, sin nombrar un modelo (ADR-0329 act. 9).
--   · `curvas`: las tallas que ofrece cada categoría que aparece arriba (`categoria_tallas`), para decidir las tallas centrales.
--   · `hoy`, `desde`, `dias` (14), `separa_piso` (la sede tiene piso de venta y almacén) y `ubicacion_tipo`.
--   · `cuadrado_en`: cuándo se cuadró el piso de la sede por última vez (`retail.cuadres_piso`, actividad 3); NULL si nunca, o si
--     la base todavía no guarda cuadres. Sin fecha, el motor pausa lo que manda a bajar (ADR-0328, decisión 5): no saber cuenta
--     como no cuadrado, porque publicar «Por colgar» sobre el piso de TRU de hoy (138 colgadas en el sistema, 600–750 reales)
--     mandaría a bajar lo que ya cuelga.
-- La decisión (qué se cuelga, qué falta, en qué orden) la toma la función pura de la web, con su prueba exhaustiva. La base solo
-- junta los hechos: así la regla vive en un solo lugar y se prueba sin red.
--
-- CONTRATO (qué promete y qué asume).
--   PROMETE: una venta cuenta UNA sola vez y en el día en que se vendió. La escaneada cuenta por su línea de venta; la anotada a
--     mano cuenta solo MIENTRAS está pendiente; al regularizarse, su línea de venta pasa a la prenda real y cuenta como escaneada
--     en la fecha de la VENTA (`ventas.created_at`), nunca en la de la regularización. Lo que el cliente se llevó de verdad: un
--     cambio cuenta como la prenda NUEVA (con la fecha de la venta) y lo devuelto con devolución aprobada no cuenta. Sin ventas
--     anuladas ni de prueba, sin productos de prueba, sin liquidaciones de prendas dañadas (no son demanda). Unidades, nunca
--     soles ni costos.
--   ASUME: `regularizar_prenda` reescribe `venta_items.variante_id` de la centinela (2222…) a la prenda real (20260923162300);
--     anular una venta saca su prenda de la cola (`trg_prendas_por_regularizar_al_anular`); `registrar_cambio` NO reescribe la
--     línea (guarda el cambio aparte, en `cambios`); y una liquidación deja su salida con `motivo = 'cuarentena_liquidada'`.
--     La prueba vigila las cuatro cosas.
--   NO HACE: no escribe nada, no guarda una «sugerencia» (ADR-0329: se calcula al abrir), no lee la capacidad ni el mix (las
--     traen las actividades 6 y 12; el motor las recibe como entradas opcionales).
--
-- POR QUÉ LAS VENTAS SALEN DE `ventas`/`venta_items` Y NO DE `movimientos`. La salida de una venta regularizada lleva la fecha de
-- la regularización (`regularizar_prenda` la escribe ese día): contada desde el libro, una venta del lunes regularizada el viernes
-- caería el viernes, y si además se sumara la cola, la misma prenda contaría dos veces esa semana. La línea de venta tiene una sola
-- fecha (la del cobro) y una sola prenda a la vez (la centinela o la real): es la forma que hace imposible contar doble.
--
-- ESTADO QUE DEJA DE SER POSIBLE. Una venta «sin registrar» que suma dos veces (en la cola y como escaneada) o que suma en la
-- semana en que se regularizó en vez de la semana en que se vendió: la lectura no tiene una tercera fuente donde eso pueda pasar.
--
-- QUIÉN LA LEE. Dos puertas: la de todas las lecturas de retail (`fn_tiene_acceso_retail()`: persona activa con colaborador
-- activo, o terminal activa de una sede activa; ADR-0289, y el arreglo de `fn_stock_por_sede` del PR #781) Y la de la sede
-- (`fn_puede_operar_ubicacion`: el líder lee cualquiera; una integrante o una terminal, solo la suya). La segunda la pidió la
-- revisión adversarial: lo vendido por prenda y por día sale de `ventas`, cuyo RLS solo deja ver la sede propia, y una función
-- security definer sin esa puerta lo saltaba (comparar sedes es del líder, 2026-09-26; ADR-0328 lo deja abierto para Análisis).
-- Ninguna pantalla lo necesita: Existencias solo deja cambiar de sede al líder y el Inicio lee la sede de la cuenta. Sin una
-- puerta devuelve NULL —no un jsonb vacío—: la web lo lee como «no se pudo leer» y nunca como «el piso está al día» (que es lo
-- que hizo, en silencio, la copia de la puerta que dejaba afuera a las terminales).
--
-- NÚMEROS. Hoy TRU tiene ~510 tallas con stock y ~100 ventas en 14 días; en 3 años, como techo, ~2.000 tallas por sede y ~1.500
-- líneas de venta en la ventana. La lectura recorre las ventas de UNA sede en 14 días por `ventas_ubicacion_fecha_idx` y su stock
-- por `fn_existencias_base`: milisegundos (medido en la prueba con ~800 unidades y ~150 ventas). Sin caché ni tabla resumen, que
-- serían una copia que se puede desincronizar.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe, ANTES de fusionar la web que la llama). Un solo `create or replace function`
-- con su `comment` y sus permisos: sin políticas ni `alter` de tablas, así que no toma los bloqueos de `auth`/`storage`
-- (ADR-0195) y se pega entero, en una sola parte, en el SQL Editor (ya trae `retail.`). Sin `select … into` dentro de textos
-- entre comillas (ADR-0288). La guarda de arriba aborta, sin tocar nada, si falta algo de lo que asume. Se puede pegar dos veces.
-- Después de pegar, solo lectura:
--   select md5(prosrc) from pg_proc where oid = 'retail.fn_piso_plan_lectura(uuid)'::regprocedure;
--     → `7d9883743dcd3c38ba57f21ac7f99f75` (el cuerpo de este archivo; medido en la base con todas las migraciones).
--   select retail.fn_piso_plan_lectura('<id de TRU>') is null;
--     → `true` en el SQL Editor: ahí no hay sesión, y eso también es la prueba de la puerta. Con sesión (la web) trae el jsonb.
--
-- SE ROMPE SI alguien cambia `regularizar_prenda` para que deje la línea de venta en la centinela (las regularizadas dejarían de
-- contar) o para que cree una línea de venta nueva (contarían dos veces): la prueba `pnpm pruebas:piso-plan` lo vigila. También si
-- una venta se registra con una sede distinta de donde salió la prenda: la velocidad caería en la sede equivocada. Y si la
-- actividad 3 renombra `cuadres_piso` o deja de guardar la fecha en su `created_at`: la sede quedaría «sin cuadrar» para siempre
-- (falla visible —«Cuadra el piso» después de cuadrar—, nunca un «Por colgar» falso); el caso K3 de la prueba compara esta
-- fecha con la de `fn_cuadre_piso_estado` en cuanto las dos viven en la misma base.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- Guarda: lo que esta lectura asume tiene que estar en la base. Si falta, se detiene sin crear nada.
do $$
begin
  if to_regprocedure('retail.fn_existencias_base(uuid, uuid[])') is null then
    raise exception 'Falta retail.fn_existencias_base(uuid, uuid[]): pega antes 20260929010000_fn_existencias_una_sola_cifra.sql.';
  end if;
  if to_regprocedure('retail.fn_tiene_acceso_retail()') is null
     or (select p.prosrc from pg_proc p where p.oid = to_regprocedure('retail.fn_tiene_acceso_retail()')) !~ 'fn_terminal_actual' then
    raise exception 'La puerta retail.fn_tiene_acceso_retail() todavía no reconoce a las terminales: pega antes 20260930050000_terminales_pasan_la_puerta_de_lectura.sql.';
  end if;
  -- La puerta de la sede: una terminal opera la sede donde está (fn_ubicacion_actual_persona la conoce desde 20260923120100).
  if to_regprocedure('retail.fn_puede_operar_ubicacion(uuid)') is null
     or to_regprocedure('retail.fn_ubicacion_actual_persona()') is null
     or (select p.prosrc from pg_proc p where p.oid = to_regprocedure('retail.fn_ubicacion_actual_persona()')) !~ 'fn_terminal_actual' then
    raise exception 'La puerta de la sede (retail.fn_puede_operar_ubicacion) todavía no reconoce a las terminales: pega antes 20260923120100_ubicacion_de_lideres.sql.';
  end if;
  if to_regclass('retail.prendas_por_regularizar') is null then
    raise exception 'Falta retail.prendas_por_regularizar: pega antes 20260923161700_prendas_por_regularizar.sql.';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'retail' and table_name = 'colores' and column_name = 'familia_color') then
    raise exception 'Falta retail.colores.familia_color: la familia de color es parte de la llave de la señal para el Taller.';
  end if;
end $$;

create or replace function retail.fn_piso_plan_lectura(p_ubicacion_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  -- La prenda centinela de las ventas «sin registrar» (ADR-0179): mientras su línea apunta aquí, la venta cuenta por la cola.
  c_centinela constant uuid := '22222222-2222-4222-8222-222222222222';
  c_dias constant integer := 14;
  v_hoy date;
  v_desde date;
  v_desde_ts timestamptz;
  v_cuadrado_en timestamptz;
begin
  if p_ubicacion_id is null then
    raise exception 'fn_piso_plan_lectura: falta la sede' using errcode = '22004';
  end if;
  -- Dos puertas, y sin cualquiera de ellas NULL (no un jsonb vacío): «no se pudo leer», nunca «al día».
  --   1. La de todas las lecturas de retail (persona activa o terminal activa).
  --   2. La de la SEDE: lo vendido por prenda y por día es de la sede (el RLS de ventas, venta_items y prendas_por_regularizar
  --      solo deja ver la propia, o todas al líder). Esta función es security definer: sin esta puerta, una integrante o una
  --      terminal leería las ventas de otra sede saltándose ese RLS. Comparar sedes es del líder (decidido el 2026-09-26).
  if not retail.fn_tiene_acceso_retail() or not retail.fn_puede_operar_ubicacion(p_ubicacion_id) then
    return null;
  end if;

  v_hoy := retail.fn_hoy_lima();
  v_desde := v_hoy - (c_dias - 1);                                   -- 14 días de Lima, hoy incluido
  v_desde_ts := (v_desde::timestamp at time zone 'America/Lima');    -- medianoche de Lima del primer día

  -- La fecha del último cuadre del piso de la sede (actividad 3, ADR-0328 decisión 4): `retail.cuadres_piso`, cuyo created_at ES
  -- la fecha del cuadre (la misma que lee fn_cuadre_piso_estado). Viaja en ESTA lectura, junto al stock que pausa, para que
  -- ninguna pantalla pueda olvidarse de pasarla. Mientras esa tabla no exista en la base, ninguna sede se cuadró: NULL, y el motor
  -- pausa «Por colgar» (decisión 5). Va dentro de un `if`: PL/pgSQL prepara la consulta recién al ejecutarla, así que la función
  -- se crea y se lee igual con o sin la actividad 3, y empieza a ver los cuadres el mismo día en que su tabla llega, sin tocarla.
  if to_regclass('retail.cuadres_piso') is not null then
    v_cuadrado_en := (select max(c.created_at) from retail.cuadres_piso c where c.ubicacion_id = p_ubicacion_id);
  end if;

  return (
    with existencias as materialized (
      -- LA cifra de stock (ADR-0270): lo libre en piso y almacén, neto de apartadas y sin Cuarentena.
      select e.variante_id, e.producto_id, e.piso_libre, e.almacen_libre, e.en_camino, e.talla_retirada
      from retail.fn_existencias_base(p_ubicacion_id, null) e
    ),
    lineas_cobradas as materialized (
      -- Cada línea de venta de la sede en la ventana, con el día de Lima en que se COBRÓ. Una línea apunta a la centinela
      -- (anotada a mano) o a la prenda real (escaneada, o ya regularizada): nunca a las dos, así que nunca cuenta dos veces.
      select vi.id as venta_item_id,
             vi.variante_id,
             vi.cantidad,
             (v.created_at at time zone 'America/Lima')::date as dia
      from retail.ventas v
      join retail.venta_items vi on vi.venta_id = v.id
      where v.ubicacion_id = p_ubicacion_id
        and v.created_at >= v_desde_ts
        and v.estado = 'completada'
        and not v.es_prueba
        -- Una liquidación de prenda dañada (`liquidar_prenda_danada`) es una venta real para la caja, pero no es demanda: salió
        -- de Cuarentena una prenda rota, no una que un cliente eligió del piso. Contarla pediría colgar otra igual. Se reconoce
        -- por su salida del libro (`motivo = 'cuarentena_liquidada'`), como la reconocen el libro único y Análisis.
        and not exists (select 1 from retail.movimientos m
                         where m.venta_item_id = vi.id and m.motivo = 'cuarentena_liquidada')
    ),
    lineas as materialized (
      -- Lo que el cliente se LLEVÓ, en el día en que se cobró la venta:
      --   · la línea, menos lo que se cambió por otra prenda y menos lo devuelto con la devolución APROBADA (una pendiente o
      --     rechazada todavía no devolvió nada);
      --   · cada cambio, como la prenda nueva. Con la fecha de la VENTA, no la del cambio: el cambio corrige QUÉ se vendió, no
      --     CUÁNDO —igual que `regularizar_prenda`, que pasa la línea a la prenda real y la deja en su día—. Así un cliente que
      --     compra M y a los 8 días la cambia por L deja la señal para el Taller en L, y la M no cuenta.
      -- `registrar_cambio` no deja cambiar más de lo que tiene la línea. Límite conocido (el mismo que asume `registrar_cambio`):
      -- si lo cambiado además se devuelve, la devolución resta de la línea original hasta 0 y el cambio sigue contando.
      select x.venta_item_id, x.variante_id, x.cantidad, x.dia
      from (
        select l.venta_item_id,
               l.variante_id,
               greatest(l.cantidad
                        - coalesce((select sum(c.cantidad) from retail.cambios c where c.venta_item_id = l.venta_item_id), 0)
                        - coalesce((select sum(di.cantidad)
                                      from retail.devolucion_items di
                                      join retail.devoluciones d on d.id = di.devolucion_id
                                     where di.venta_item_id = l.venta_item_id and d.estado = 'aprobada'), 0),
                        0)::integer as cantidad,
               l.dia
        from lineas_cobradas l
        union all
        select l.venta_item_id, c.variante_nueva_id, c.cantidad, l.dia
        from lineas_cobradas l
        join retail.cambios c on c.venta_item_id = l.venta_item_id
      ) x
      where x.cantidad > 0
    ),
    escaneadas as (
      select l.variante_id,
             sum(l.cantidad) filter (where l.dia = v_hoy)     as hoy,
             sum(l.cantidad) filter (where l.dia = v_hoy - 1) as ayer,
             sum(l.cantidad)                                  as total
      from lineas l
      join retail.variantes va on va.id = l.variante_id
      join retail.productos pr on pr.id = va.producto_id
      where l.variante_id <> c_centinela
        and not pr.es_prueba
      group by l.variante_id
    ),
    por_atributo as (
      -- Cada unidad vendida con su llave de la señal para el Taller (categoría × talla × familia de color), de UNA de dos
      -- fuentes que no se pisan: la línea escaneada (o ya regularizada) por su prenda, y la anotada a mano por lo que anotó la
      -- caja, solo mientras sigue pendiente. Una línea de la centinela regularizada no existe: `regularizar_prenda` la movió a
      -- la prenda real y cae en la primera rama.
      select pr.categoria_id, va.talla_id, co.familia_color, l.cantidad as escaneadas, 0 as anotadas
      from lineas l
      join retail.variantes va on va.id = l.variante_id
      join retail.productos pr on pr.id = va.producto_id
      left join retail.colores co on co.codigo = va.color_codigo
      where l.variante_id <> c_centinela
        and not pr.es_prueba
      union all
      select p.categoria_id, p.talla_id, co.familia_color, 0, l.cantidad
      from lineas l
      join retail.prendas_por_regularizar p on p.venta_item_id = l.venta_item_id
      left join retail.colores co on co.codigo = p.color_codigo
      where l.variante_id = c_centinela
        and p.estado = 'pendiente'
    ),
    ventas_atributo as (
      -- `group by` junta los vacíos como iguales (una prenda sin talla o sin familia sigue siendo UNA llave).
      select categoria_id, talla_id, familia_color, sum(escaneadas)::integer as escaneadas, sum(anotadas)::integer as anotadas
      from por_atributo
      group by categoria_id, talla_id, familia_color
    ),
    anotadas_recientes as (
      -- El reloj rápido para lo anotado a mano: lo vendido «sin registrar» HOY y AYER que sigue pendiente, por categoría × talla ×
      -- color EXACTO (lo que anotó la caja; no la familia: el motor lo cruza con las tallas de la sede de ese color). La lista del
      -- día pone primero lo que se vendió ayer, y una anotada no tiene prenda: sin esto, en AQP (169 de 170 ventas anotadas)
      -- «primero lo vendido ayer» no veía casi nada. Una anotada ya regularizada no está aquí: su línea pasó a la prenda real y
      -- cuenta en `vendidas_hoy`/`vendidas_ayer` de esa prenda.
      select p.categoria_id, p.talla_id, p.color_codigo,
             coalesce(sum(l.cantidad) filter (where l.dia = v_hoy), 0)::integer     as hoy,
             coalesce(sum(l.cantidad) filter (where l.dia = v_hoy - 1), 0)::integer as ayer
      from lineas l
      join retail.prendas_por_regularizar p on p.venta_item_id = l.venta_item_id
      where l.variante_id = c_centinela
        and p.estado = 'pendiente'
        and l.dia >= v_hoy - 1
      group by p.categoria_id, p.talla_id, p.color_codigo
    ),
    tallas_sede as (
      select e.variante_id, e.producto_id, pr.referencia, pr.categoria_id, va.talla_id, t.valor as talla,
             va.color_codigo, co.nombre as color, co.familia_color, e.talla_retirada,
             e.piso_libre, e.almacen_libre, e.en_camino,
             coalesce(s.hoy, 0)::integer as vendidas_hoy,
             coalesce(s.ayer, 0)::integer as vendidas_ayer,
             coalesce(s.total, 0)::integer as vendidas_14,
             (select f.url from retail.producto_fotos f where f.producto_id = e.producto_id
               order by f.es_principal desc, f.orden limit 1) as foto_url
      from existencias e
      join retail.variantes va on va.id = e.variante_id
      join retail.productos pr on pr.id = e.producto_id
      left join retail.tallas t on t.id = va.talla_id
      left join retail.colores co on co.codigo = va.color_codigo
      left join escaneadas s on s.variante_id = e.variante_id
    ),
    categorias_vistas as (
      select categoria_id from tallas_sede where categoria_id is not null
      union
      select categoria_id from ventas_atributo where categoria_id is not null
    )
    select jsonb_build_object(
      'ubicacion_id', p_ubicacion_id,
      'ubicacion_tipo', (select u.tipo from retail.ubicaciones u where u.id = p_ubicacion_id),
      'separa_piso',
        exists (select 1 from retail.sububicaciones sb where sb.ubicacion_id = p_ubicacion_id and sb.tipo = 'piso_venta')
        and exists (select 1 from retail.sububicaciones sb where sb.ubicacion_id = p_ubicacion_id and sb.tipo = 'almacen_tienda'),
      'cuadrado_en', v_cuadrado_en,
      'hoy', v_hoy,
      'desde', v_desde,
      'dias', c_dias,
      'tallas', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'variante_id', t.variante_id, 'producto_id', t.producto_id, 'referencia', t.referencia,
                 'categoria_id', t.categoria_id, 'talla_id', t.talla_id, 'talla', t.talla,
                 'color_codigo', t.color_codigo, 'color', t.color, 'familia_color', t.familia_color,
                 'retirada', t.talla_retirada, 'foto_url', t.foto_url,
                 'piso_libre', t.piso_libre, 'almacen_libre', t.almacen_libre, 'en_camino', t.en_camino,
                 'vendidas_hoy', t.vendidas_hoy, 'vendidas_ayer', t.vendidas_ayer, 'vendidas_14', t.vendidas_14)
               order by t.referencia, t.producto_id, t.color_codigo, t.talla, t.variante_id)
        from tallas_sede t), '[]'::jsonb),
      'ventas', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'categoria_id', v.categoria_id, 'talla_id', v.talla_id, 'talla', ta.valor,
                 'familia_color', v.familia_color, 'escaneadas', v.escaneadas, 'anotadas', v.anotadas)
               order by v.categoria_id, ta.valor, v.familia_color)
        from ventas_atributo v left join retail.tallas ta on ta.id = v.talla_id), '[]'::jsonb),
      'anotadas_recientes', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'categoria_id', a.categoria_id, 'talla_id', a.talla_id, 'color_codigo', a.color_codigo, 'hoy', a.hoy, 'ayer', a.ayer)
               order by a.categoria_id, a.talla_id, a.color_codigo)
        from anotadas_recientes a), '[]'::jsonb),
      'curvas', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'categoria_id', c.id, 'categoria', c.nombre,
                 'tallas', coalesce((select jsonb_agg(jsonb_build_object('talla_id', ct.talla_id, 'talla', ta.valor) order by ta.valor)
                                     from retail.categoria_tallas ct join retail.tallas ta on ta.id = ct.talla_id
                                     where ct.categoria_id = c.id), '[]'::jsonb))
               order by c.nombre)
        from retail.categorias c join categorias_vistas cv on cv.categoria_id = c.id), '[]'::jsonb)
    )
  );
end;
$$;

comment on function retail.fn_piso_plan_lectura(uuid) is
  'ADR-0328 act. 7: las entradas crudas del motor del piso de UNA sede, en un jsonb: tallas (lo libre en piso y almacén de '
  'fn_existencias_base, con categoría, talla, color, familia y lo vendido escaneado hoy/ayer/14 días), ventas de 14 días por '
  'categoría × talla × familia de color (escaneadas + anotadas sin registrar PENDIENTES: cada venta cuenta una vez, en el día '
  'en que se cobró) y las tallas de cada categoría. No decide nada (lo decide apps/web/lib/piso-plan.ts). Solo lectura; '
  'unidades, sin soles. Puerta: fn_tiene_acceso_retail(); sin ella devuelve NULL.';

revoke all on function retail.fn_piso_plan_lectura(uuid) from public, anon;
grant execute on function retail.fn_piso_plan_lectura(uuid) to authenticated, service_role;
