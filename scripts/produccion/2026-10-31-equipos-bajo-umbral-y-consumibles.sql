-- ============================================================================
-- scripts/produccion/2026-10-31-equipos-bajo-umbral-y-consumibles.sql — ADR-0594 (actividad 3, Felipe 2026-10-31)
--
-- Dos limpiezas en producción, en UNA sola transacción (todo o nada). Se pega a mano en el SQL Editor de producción
-- (proyecto cayla-dynamic): ninguna sesión de Claude escribe en producción.
--
--   A. 10 equipos pasan a gasto: se ANULA su carga inicial. Son los equipos de tienda, oficina y cómputo que cuestan menos de
--      ¼ de la UIT (S/ 1,375) y que Felipe decidió no depreciar. La maquinaria del Taller (2 remalladoras SIRUBA y la cortadora de
--      tela) y los muebles y mejoras (maniquí, infraestructura y oficina de Lima) se QUEDAN como activo.
--      NO se registra ningún gasto nuevo: las 10 compras son anteriores al 1-oct-2026 (arranque del Balance), así que su gasto
--      ya quedó fuera de Finanzas; lo único que cambia es que dejan de estar en el Balance y de depreciarse.
--   B. Las 2 entradas del 31-oct que son consumibles y no insumos (Aguja Clase B +12 unid, Hilo General +24 conos) se ELIMINAN con
--      motivo y rastro (`eliminar_ingreso_insumo`, ADR-0570 act. 6a). Nada se borra: el lote queda en cero y «Restaurar» lo devuelve.
--      Desde ahora esos consumibles se anotan como gasto del Taller, categoría «Consumibles del Taller» (20261031195000).
--
-- ANTES DE PEGAR (en este orden):
--   1. Que la migración 20261031195000 (categoría «Consumibles del Taller») y la 20261030134000 (corregir y eliminar un ingreso)
--      estén en producción. La segunda es la que da `eliminar_ingreso_insumo`: sin ella este script se detiene con un error claro.
--   2. Pégalo TAL CUAL, con el MODO en 'ensayo' (la primera línea de código). Hace todo, te dice qué habría hecho y se DESHACE solo:
--      termina en un error que empieza con «ENSAYO TERMINADO». Eso es lo esperado, no una falla.
--   3. Si el ensayo dice 10 equipos por S/ 8,388.16 y 2 ingresos, cambia 'ensayo' por 'aplicar' y pégalo otra vez.
--
-- LOS CANDADOS (el script se detiene y NO cambia nada si algo no cuadra):
--   · los 10 equipos tienen que haber sido cargados por UNA sola persona, hoy Admin y Líder activa (ella firma las anulaciones, como firmó las cargas de ADR-0335);
--   · tienen que aparecer exactamente los 10 equipos de la lista, en su sede, con su costo y su fecha, en uso y de carga inicial;
--     y sumar S/ 8,388.16. Si alguien ya anuló uno, o cambió un costo, se detiene;
--   · tienen que aparecer exactamente los 2 ingresos, sin anular. Si alguien ya consumió de uno, `eliminar_ingreso_insumo` lo rechaza
--     (De este lote ya salió material…) y todo se revierte.
--
-- CÓMO SE VUELVE ATRÁS (con el resultado del final guardado):
--   · Un ingreso:  select retail.restaurar_ingreso_insumo('<lote_id>', 'Se restaura: <por qué>');   (con la sesión de un Líder; el lote vuelve a su cantidad)
--   · Un equipo:   un activo anulado NO se modifica (lo prohíbe la base: `fn_activos_validar`). Se vuelve a CARGAR, como dice ADR-0335 («corregir una carga es
--       anularla y volver a cargarla»): al aplicar, el script imprime para cada equipo su instrucción `cargar_activo_inicial(...)` ya escrita, con un token nuevo,
--       en la columna «deshacer». Se pega con la sesión del mismo Admin. El equipo vuelve como una fila NUEVA (la anulada queda como historia).
--       Se probó en una base local: anular los 10, ejecutar esas instrucciones y encontrar los 10 de nuevo en uso.
--
-- Qué NO hace: no toca ningún otro activo, ni gastos, ni stock de prendas, ni el costo de nada.
-- ============================================================================

set local lock_timeout = '3s';
set local search_path = retail, public, extensions;

-- ► MODO: 'ensayo' (por defecto: hace todo y se deshace) o 'aplicar' (guarda de verdad).
select set_config('zz.modo', 'ensayo', true);

-- ---------- A. Los 10 equipos: se buscan por sede, nombre, costo y fecha (no por id: el id solo lo conoce producción) ----------
create temp table zz_equipos on commit drop as
select a.id, a.ubicacion_id, u.nombre as sede, a.tipo, a.nombre, a.costo, a.fecha_adquisicion, a.vida_util_meses, a.serie, a.nota
  from retail.activos_fijos a
  join retail.ubicaciones u on u.id = a.ubicacion_id
  join (values
         ('Tienda TRU', 'Parlante JBL Authentics 300',        1289.00, date '2026-05-11'),
         ('Tienda TRU', 'iPhone 12',                          1200.00, date '2023-10-04'),
         ('Taller',     'Aspiradora Xiaomi G20 Max',         1044.00, date '2026-01-14'),
         ('Taller',     'Monitor de diseño (Lima)',           979.00, date '2025-08-22'),
         ('Tienda AQP', 'Parlante JBL Authentics 200',        959.00, date '2026-05-19'),
         ('Tienda TRU', 'Smartphone Xiaomi Redmi Note 12',    799.33, date '2025-07-14'),
         ('Tienda AQP', 'Smartphone Xiaomi Redmi 13X',        728.96, date '2024-04-24'),
         ('Taller',     'Ventilador',                         259.67, date '2026-02-11'),
         ('Taller',     'Cámara y tarjeta (Lima)',            170.20, date '2025-10-11')
       ) as v(sede, nombre, costo, fecha)
    on u.nombre = v.sede and a.nombre = v.nombre and a.costo = v.costo and a.fecha_adquisicion = v.fecha
 where a.estado = 'activo' and a.carga_inicial and a.anulado_en is null;

do $$
declare
  v_n integer;
  v_suma numeric;
begin
  select count(*), coalesce(sum(costo), 0) into v_n, v_suma from zz_equipos;
  -- 9 filas de la lista, pero los dos parlantes JBL 200 de Arequipa son dos activos idénticos: salen 10.
  if v_n <> 10 or v_suma <> 8388.16 then
    raise exception 'REVISAR: se esperaban 10 equipos por S/ 8388.16 y hay % por S/ %. No se cambió nada.', v_n, v_suma;
  end if;
end $$;

-- Quién firma: quien cargó esos mismos equipos (ADR-0335: los firmó Felipe). Si no es UNA sola persona, con rol de Admin y Líder activo, se detiene.
do $$
declare
  v_n integer;
  v_sub text;
begin
  select count(distinct a.registrado_por), min(p.auth_user_id::text)
    into v_n, v_sub
    from retail.activos_fijos a
    join zz_equipos z on z.id = a.id
    join public.personas p on p.id = a.registrado_por
    join retail.colaboradores c on c.persona_id = p.id
   where p.estado = 'activo' and p.rol = 'admin' and c.rol = 'lider' and c.estado = 'activo';
  if v_n <> 1 or v_sub is null then
    raise exception 'REVISAR: los 10 equipos debían estar cargados por UNA sola persona, hoy Admin y Líder activa, y hay %. No se cambió nada.', v_n;
  end if;
  perform set_config('request.jwt.claim.sub', v_sub, true);
end $$;

do $$
declare
  r record;
begin
  for r in select id from zz_equipos order by id loop
    perform retail.anular_activo(
      r.id,
      'Cuesta menos de ¼ de la UIT: se lleva a gasto, no se deprecia (ADR-0594). Compra anterior al 1-oct-2026, ya fuera de Finanzas.'
    );
  end loop;
end $$;

-- ---------- B. Las 2 entradas del 31-oct que son consumibles ----------
create temp table zz_ingresos on commit drop as
select l.id, i.nombre, l.cantidad_ingresada, l.fecha_ingreso
  from retail.insumo_lotes l
  join retail.insumos i on i.id = l.insumo_id
 where l.anulado_at is null
   and l.fecha_ingreso = date '2026-10-31'
   and ((i.nombre ilike 'Aguja Clase B%' and l.cantidad_ingresada = 12)
     or (i.nombre ilike 'Hilo General%'  and l.cantidad_ingresada = 24));

do $$
declare
  v_n integer;
  r record;
begin
  select count(*) into v_n from zz_ingresos;
  if v_n <> 2 then
    raise exception 'REVISAR: se esperaban 2 ingresos (la aguja de 12 y el hilo de 24, del 31-oct) y hay %. No se cambió nada.', v_n;
  end if;
  for r in select id, cantidad_ingresada from zz_ingresos order by id loop
    perform retail.eliminar_ingreso_insumo(
      r.id,
      r.cantidad_ingresada,
      'Es un consumible del Taller: se anota como gasto, no como insumo (ADR-0594).'
    );
  end loop;
end $$;

-- ---------- Cierre: en ensayo se deshace todo; al aplicar, se muestra lo que quedó ----------
do $$
declare
  v_equipos integer;
  v_suma numeric;
  v_ingresos integer;
begin
  select count(*), coalesce(sum(costo), 0) into v_equipos, v_suma from zz_equipos;
  select count(*) into v_ingresos from zz_ingresos;
  if (select count(*) from retail.activos_fijos a join zz_equipos z on z.id = a.id where a.estado = 'anulado') <> v_equipos then
    raise exception 'REVISAR: no todos los equipos quedaron anulados. No se cambió nada.';
  end if;
  if current_setting('zz.modo', true) is distinct from 'aplicar' then
    raise exception 'ENSAYO TERMINADO — nada se guardó. Habría anulado % equipos por S/ % y eliminado % ingresos. Si es lo esperado, cambia ''ensayo'' por ''aplicar'' en la línea del MODO y pégalo otra vez.', v_equipos, v_suma, v_ingresos;
  end if;
end $$;

-- Solo llega aquí al aplicar de verdad. GUARDA esta tabla: la columna «deshacer» es la instrucción exacta para volver atrás.
select 'equipo anulado' as que, z.id, z.sede, z.nombre, z.costo::text as detalle,
       format('select retail.cargar_activo_inicial(%L, %L, %L, %L, %s, %s, %L, %L, gen_random_uuid());',
              z.ubicacion_id, z.tipo, z.nombre, z.fecha_adquisicion, z.costo,
              coalesce(z.vida_util_meses::text, 'null'), z.serie, z.nota) as deshacer
  from zz_equipos z
union all
select 'ingreso eliminado', g.id, null, g.nombre, g.cantidad_ingresada::text,
       format('select retail.restaurar_ingreso_insumo(%L, %L);', g.id, 'Se restaura: ')
  from zz_ingresos g
order by 1, 4;
