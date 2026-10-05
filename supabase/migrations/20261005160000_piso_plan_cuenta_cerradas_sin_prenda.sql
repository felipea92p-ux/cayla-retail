-- ============================================================================
-- 20261005160000_piso_plan_cuenta_cerradas_sin_prenda.sql — CAYLA V2 · ADR-0328 act. 7 × ADR-0334 («Contrato para quien escriba el
-- motor del piso»). El motor del piso cuenta las ventas «sin registrar» cerradas sin prenda igual que las pendientes: la anotada
-- cuenta mientras no tenga prenda.
--
-- EL PROBLEMA PRIMERO. `retail.fn_piso_plan_lectura` (20261004213000, PR #787, ya en producción) cuenta lo anotado a mano «sin
-- registrar» solo si su fila de `prendas_por_regularizar` está `pendiente`. El PR #800 (ADR-0334), fusionado antes, agregó otro
-- estado: `cerrada_sin_prenda` —un líder cierra en bloque, hasta el 15-oct, las anotadas de arranque de una tienda que ya nadie va a
-- identificar—. La venta fue real: se cobró y el cliente se llevó una prenda de esa categoría, talla y color. Pero con el filtro de
-- 20261004213000, al cerrarla desaparece de la lectura. AQP vende casi todo «sin registrar» (169 de 170 ventas en 14 días; 170
-- anotadas pendientes en producción el 2026-10-04): el día en que cierre su cola, su velocidad caería a la de lo escaneado —casi
-- cero—, la señal para el Taller se apagaría y la lista del día perdería «primero lo vendido ayer». Ninguna pantalla daría error:
-- solo diría, en silencio, que AQP dejó de vender.
--
-- QUÉ CAMBIA. Solo los dos filtros de la cola: `p.estado = 'pendiente'` pasa a `p.estado in ('pendiente', 'cerrada_sin_prenda')`, en
-- `por_atributo` (lo vendido por categoría × talla × familia de color: la señal para el Taller y el ritmo de la lista del día) y en
-- `anotadas_recientes` (el reloj rápido de hoy y ayer). Los comentarios de esos dos CTE y el `comment on function` dicen lo mismo.
-- Todo lo demás es, byte a byte, el cuerpo de 20261004213000, y su cabecera sigue explicando el resto (qué trae cada clave, las dos
-- puertas, los números).
--
-- POR QUÉ NO CUENTA DOS VECES. Una venta anotada cae en UNA de dos ramas según a dónde apunta su línea de venta: a la centinela
-- (rama de las anotadas) o a la prenda real (rama de las escaneadas). `cerrar_cola_arranque` cambia el estado de la fila de la cola y
-- nada más: no toca `venta_items` ni escribe en `movimientos`, así que la línea sigue en la centinela y cae solo en la rama de las
-- anotadas. Una `regularizada` ya pasó a la prenda real (`regularizar_prenda` reescribe la línea) y sigue fuera de este filtro, como
-- antes. Una cerrada que se reabre (`reabrir_prenda_cerrada`) vuelve a `pendiente`: cuenta igual, una vez; si después se regulariza,
-- pasa a escaneada en el día en que se cobró. Una `anulada` sigue sin contar (y su venta ya no está `completada`).
--
-- CONTRATO (qué promete y qué asume).
--   PROMETE lo mismo que 20261004213000, con un cambio: «la anotada a mano cuenta solo MIENTRAS está pendiente» pasa a «la anotada
--     cuenta mientras no tenga prenda» (pendiente o cerrada sin prenda).
--   ASUME, además de lo de 20261004213000, que `cerrar_cola_arranque` no reescribe la línea de venta ni mueve stock (ADR-0334:
--     «sin prenda, sin movimiento de stock») y que reabrir devuelve la fila a `pendiente`. Las pruebas A8 y A10 lo vigilan.
--
-- ESTADO QUE DEJA DE SER POSIBLE. Una tienda que, en la lectura del motor, deja de vender el día en que su líder cierra la cola de
-- arranque, sin que ninguna venta haya cambiado.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe; la web no cambia, así que el orden con el despliegue no importa). Un solo
-- `create or replace function` con su `comment` y sus permisos: sin políticas ni `alter` de tablas, así que no toma los bloqueos de
-- `auth`/`storage` (ADR-0195) y se pega entero, en una sola parte, tal cual (ya trae `retail.`). Sin `select … into` dentro de
-- textos entre comillas (ADR-0288). Se puede pegar dos veces. La guarda de abajo aborta sin tocar nada si falta lo que la lectura
-- asume, o si el cuerpo vivo no es el de 20261004213000 ni el de este archivo: sería un cambio hecho a mano en la función viva, que
-- este `create or replace` borraría en silencio.
-- Antes de pegar, solo lectura:
--   select md5(prosrc) from pg_proc where oid = 'retail.fn_piso_plan_lectura(uuid)'::regprocedure;
--     → `faff73d2a6db4c0692775c1f6d6e284d` (el cuerpo de 20261004213000; medido en producción el 2026-10-04).
-- Después de pegar, la misma consulta:
--     → `33dfc4b19e7ab14410a14b2cb7bc50c5` (el cuerpo de este archivo; medido en la base con todas las migraciones).
--
-- REGLA DE ORDEN (ADR-0334). Mientras esto no esté pegado, ninguna tienda —AQP sobre todo— cierra su cola de arranque desde
-- /inventario/por-regularizar: con el motor ya publicado, su velocidad caería ese mismo día (`select count(*) from
-- retail.cierres_cola_arranque` era 0 el 2026-10-04). Y NUNCA se vuelve a pegar 20261004213000 después de esta: su `create or
-- replace` devolvería el filtro viejo sin ningún error, porque su guarda no conoce este archivo.
--
-- SE ROMPE SI alguien cambia `cerrar_cola_arranque` para que le ponga una prenda a la línea o escriba una salida en el libro (la venta
-- contaría dos veces: en la rama escaneada y en la anotada; A8 lo vigila); si la cola gana otro estado «vendida y sin prenda» (este
-- `in` no lo vería: hay que sumarlo aquí y en la prueba); o si se vuelve a pegar 20261004213000 encima.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- Guarda: lo que esta lectura asume tiene que estar en la base (la misma de 20261004213000) y el cuerpo vivo tiene que ser uno que el
-- repo conoce. Si algo falla, se detiene sin crear nada.
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
  -- El cuerpo vivo es el que este archivo reemplaza (20261004213000) o este mismo (pegado dos veces). Otro cuerpo es un cambio
  -- hecho a mano en la función viva, que el repo no tiene: el `create or replace` de abajo lo borraría sin avisar.
  if to_regprocedure('retail.fn_piso_plan_lectura(uuid)') is not null
     and (select md5(p.prosrc) from pg_proc p where p.oid = to_regprocedure('retail.fn_piso_plan_lectura(uuid)'))
         not in ('faff73d2a6db4c0692775c1f6d6e284d', '33dfc4b19e7ab14410a14b2cb7bc50c5') then
    raise exception 'retail.fn_piso_plan_lectura no es la de 20261004213000 ni la de este archivo: alguien la cambió a mano. Compara el cuerpo vivo con el repo antes de pegar, o ese cambio se pierde.';
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
      -- caja, mientras no tenga prenda: pendiente, o cerrada sin prenda por el cierre de arranque (ADR-0334), que no le pone
      -- prenda ni la saca del libro, así que su línea sigue en la centinela. Una línea de la centinela regularizada no existe:
      -- `regularizar_prenda` la movió a la prenda real y cae en la primera rama.
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
        and p.estado in ('pendiente', 'cerrada_sin_prenda')
    ),
    ventas_atributo as (
      -- `group by` junta los vacíos como iguales (una prenda sin talla o sin familia sigue siendo UNA llave).
      select categoria_id, talla_id, familia_color, sum(escaneadas)::integer as escaneadas, sum(anotadas)::integer as anotadas
      from por_atributo
      group by categoria_id, talla_id, familia_color
    ),
    anotadas_recientes as (
      -- El reloj rápido para lo anotado a mano: lo vendido «sin registrar» HOY y AYER que sigue sin prenda (pendiente o cerrada sin
      -- prenda: cerrar la cola no cambia lo que se vendió ayer), por categoría × talla ×
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
        and p.estado in ('pendiente', 'cerrada_sin_prenda')
        and l.dia >= v_hoy - 1
      group by p.categoria_id, p.talla_id, p.color_codigo
    ),
    tallas_sede as (
      select e.variante_id, e.producto_id, pr.referencia, pr.categoria_id, va.talla_id, t.valor as talla,
             va.color_codigo, co.nombre as color, co.hex as color_hex, co.familia_color, e.talla_retirada,
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
      -- La misma definición que Existencias (`sumarCantidades`): separa la sede que tiene piso de venta O almacén de tienda. Un
      -- stand con solo piso también recibe su «Hoy» («Mantener» o «Sin stock atrás»), nunca una columna en N/D sin aviso.
      'separa_piso',
        exists (select 1 from retail.sububicaciones sb
                where sb.ubicacion_id = p_ubicacion_id and sb.tipo in ('piso_venta', 'almacen_tienda')),
      'cuadrado_en', v_cuadrado_en,
      'hoy', v_hoy,
      'desde', v_desde,
      'dias', c_dias,
      'tallas', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'variante_id', t.variante_id, 'producto_id', t.producto_id, 'referencia', t.referencia,
                 'categoria_id', t.categoria_id, 'talla_id', t.talla_id, 'talla', t.talla,
                 'color_codigo', t.color_codigo, 'color', t.color, 'color_hex', t.color_hex, 'familia_color', t.familia_color,
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
                 'categoria_id', c.id, 'categoria', c.nombre, 'prefijo', c.prefijo, 'familia', c.familia,
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
  'categoría × talla × familia de color (escaneadas + anotadas sin registrar: la anotada cuenta mientras no tenga prenda, '
  'pendiente o cerrada sin prenda por ADR-0334; cada venta cuenta una vez, en el día en que se cobró) y las tallas de cada '
  'categoría. No decide nada (lo decide apps/web/lib/piso-plan.ts). Solo lectura; unidades, sin soles. Puerta: '
  'fn_tiene_acceso_retail(); sin ella devuelve NULL.';

revoke all on function retail.fn_piso_plan_lectura(uuid) from public, anon;
grant execute on function retail.fn_piso_plan_lectura(uuid) to authenticated, service_role;
