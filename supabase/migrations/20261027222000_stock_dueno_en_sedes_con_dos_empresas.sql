-- ============================================================================
-- 20261027222000_stock_dueno_en_sedes_con_dos_empresas.sql — CAYLA V2 · ADR-0542 (reemplaza la regla por marca de ADR-0532)
--
-- EL PROBLEMA PRIMERO. En Tienda LIM conviven CAYLA y CLAURE (ADR-0463). Hasta ayer, de quién era una prenda en Lima lo decía su
-- ficha (`productos.empresa_id`, ADR-0463) o, desde el 2026-10-26, su MARCA (ADR-0532). Las dos fallan por lo mismo: la prenda no es
-- de nadie, las UNIDADES son de alguien. CAYLA revende 316 prendas con marca ajena (Strend, Krisstell, Miramhe…) y la misma blusa
-- puede estar en Lima como mercadería de CAYLA y como mercadería de CLAURE a la vez. Felipe (2026-10-27): «lo único que indica de
-- quién es es un botón, al crear la prenda o al ingresar o ajustar stock en Tienda LIMA; lo indica la persona que hace la operación».
-- Y eligió que una misma prenda pueda tener a la vez unidades de las dos empresas: el stock de Lima se parte por dueño.
--
-- EL MODELO (decidido para que un descuadre sea IMPOSIBLE de representar, no solo prohibido):
--   · `stock_dueno` guarda SOLO lo que NO es de la casa (hoy, las unidades de CLAURE en Lima). Las de CAYLA son siempre el RESTO:
--     `stock.cantidad − sum(stock_dueno.cantidad)`. Así «los dueños suman el stock» se cumple por construcción: no hay dos cifras que
--     puedan separarse. Y todo el stock que ya existe, o que siembra una prueba directo en `stock`, es de CAYLA por defecto.
--   · `movimientos.empresa_id`: de quién son las unidades de ese movimiento, solo en una sede con dos empresas (en las demás, vacío =
--     CAYLA). Es el libro (append-only, principio 4): de él saldrán Caja, Historial y Movimientos (actividad 8 de la obra).
--   · `stock` y `fn_aplicar_movimiento` NO se tocan (principio 1): ni sus 69 llamadores. El dueño se resuelve en un disparador BEFORE
--     INSERT sobre `movimientos`, el único punto por el que pasa todo cambio de stock (mismo patrón que ADR-0505 y la cuarentena).
--
-- LA REGLA QUE APLICA EL DISPARADOR (solo en una sede donde operan dos empresas: `fn_sede_con_dos_empresas`):
--   · El dueño que traiga el movimiento (`empresa_id`) manda. Si no opera en la sede, o en el destino de un traslado: se rechaza.
--   · ENTRA stock (entrada, ajuste +, traslado que llega): sin dueño elegido, TRANSITORIO: el de la ficha (`fn_dueno_de_entrada_sin_elegir`),
--     hasta que cada pantalla pregunte (actividades 2 a 4 de la obra); un traslado que llega desde otra sede entra como CAYLA.
--   · SALE stock (venta, traslado, apartado, ajuste −): sin dueño elegido, se toma el único dueño que tiene unidades disponibles; si
--     hay de los dos, se rechaza con «elige de cuál es» (hint `elegir_dueno`): la base nunca adivina de quién era lo que sale.
--   · CLAURE no sale de Lima (ADR-0505, ahora por UNIDAD): un traslado a una sede donde su empresa no opera solo puede llevar unidades de
--     las empresas que operan allí; si lo único que alcanza es de CLAURE, se rechaza (hint `empresa_fuera_de_sede`).
--   · Si el stock total no alcanza, el disparador se aparta y habla `fn_aplicar_movimiento` con su mensaje de siempre.
--
-- LA RED AL CERRAR: dos disparadores de restricción, DIFERIDOS, revisan que en cada fila de stock lo de CLAURE no pase del stock (ni lo
-- apartado de lo apartado). Si algún camino futuro —o varias filas de un mismo INSERT— dejara un estado imposible, no hace commit.
--
-- QUÉ NO HACE (cada cosa es una actividad aprobada de la obra):
--   · Ninguna pantalla pregunta todavía el dueño (botón al ingresar o ajustar: actividades 2, 3 y 4).
--   · Vender, Devoluciones, Cambios y Contar no lo piden (actividades 5, 6 y 7): hoy resuelven solos cuando hay un solo dueño.
--   · Caja, Historial y Movimientos siguen con la regla por marca de ADR-0532 hasta la actividad 8.
--   · `recalcular_stock()` (mantenimiento, nadie la llama) no reconstruye `stock_dueno`: si se corriera, el cierre fallaría fuerte.
--
-- CARGA INICIAL. Las unidades que hoy hay en una sede con dos empresas arrancan con el dueño con que se dio de alta cada prenda
-- (`productos.empresa_id`, Felipe 2026-10-27): CAYLA queda como resto (no escribe nada) y las de fichas de CLAURE se escriben en
-- `stock_dueno`. Es idempotente: pegada dos veces no duplica ni pisa lo que ya se movió.
--
-- CÓMO SE PEGA EN PRODUCCIÓN: UNA sola parte, tal cual. Sin políticas ni `drop trigger` (ADR-0195). Empieza tomando TODOS sus candados
-- de una vez y sin esperar (`lock table … nowait`, hasta 15 s de reintentos): nunca espera con algo en la mano, así que no puede abortar
-- una venta en curso por un ciclo de espera (se vio un `deadlock detected` al probarla con otras pruebas corriendo). Si la base no se
-- desocupa, no aplica nada y dice que se vuelva a pegar. Conserva los candados hasta el final, así ningún movimiento se cuela entre la
-- carga inicial y el disparador. La tabla nueva lleva RLS encendido SIN políticas (solo la leen funciones `security definer`). Sin
-- `select … into` dentro de un texto entre comillas (ADR-0288). La última línea dice «QUEDÓ BIEN».
--
-- CÓMO SE DESHACE (solo si hiciera falta; los `drop trigger` toman candados de auth y storage: se pegan solos):
--   drop trigger if exists trg_movimientos_libro_por_dueno on retail.movimientos;
--   drop trigger if exists stock_cuadra_con_dueno on retail.stock;
--   drop trigger if exists stock_dueno_cuadra_con_stock on retail.stock_dueno;
--
-- SE ROMPE SI:
--   · una sede pasa a tener dos empresas (`empresa_sedes`) con stock ya cargado: sin repetir la carga inicial de esa sede, todo su stock
--     cuenta como de CAYLA. La carga de abajo se puede volver a pegar sin riesgo;
--   · una sede deja de tener dos empresas con unidades de CLAURE en `stock_dueno`: el cierre lo rechaza (hay dueños partidos donde ya no
--     se parte). Antes, vender o llevar esas unidades;
--   · alguien edita `stock` a mano bajando una fila por debajo de lo de CLAURE: el cierre de la transacción la rechaza;
--   · dos transacciones mueven en sentidos opuestos las mismas dos filas y alguna función toma `stock` en otro orden que el disparador:
--     Postgres aborta una con `40P01` (falla segura, sin daño).
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- ---------- Los candados, todos juntos y sin esperar ----------
-- Esta migración toca tablas que la tienda usa mientras vende: `movimientos` (columna y disparador), `stock` (disparador) y, por las
-- llaves de la tabla nueva, `variantes`, `ubicaciones`, `empresas` y `sububicaciones`. Si pidiera esos candados uno por uno y esperando,
-- podría quedar con uno en la mano esperando otro que una venta en curso tiene (y la venta esperando el suyo): Postgres cortaría el ciclo
-- abortando a alguien, y podría ser la venta. Se vio al probarla con la batería de pruebas corriendo a la vez: `deadlock detected`.
-- Aquí se piden TODOS a la vez y con NOWAIT (si alguno está ocupado, no espera: suelta lo que había tomado), se reintenta unos segundos
-- y, si la base no se desocupa, no se aplica nada. Nunca espera con algo en la mano, así que no puede formar un ciclo. Los candados duran
-- hasta el final de la transacción: ningún movimiento se cuela entre la carga inicial y el disparador.
do $candados$
declare
  v_intento integer;
begin
  for v_intento in 1..60 loop
    begin
      lock table retail.movimientos in access exclusive mode nowait;
      lock table retail.stock in share row exclusive mode nowait;
      lock table retail.variantes, retail.ubicaciones, retail.empresas, retail.sububicaciones in share row exclusive mode nowait;
      return;
    exception when lock_not_available then
      perform pg_sleep(0.25);
    end;
  end loop;
  raise exception 'No se aplicó nada: la base está muy ocupada para tomar los candados que esta migración necesita (movimientos, stock). Vuelve a pegarla en un momento más tranquilo.';
end
$candados$;

-- ---------- 0. De quién son las unidades de cada movimiento ----------
alter table retail.movimientos add column if not exists empresa_id uuid;

do $fk$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'retail.movimientos'::regclass and conname = 'movimientos_empresa_id_fkey') then
    alter table retail.movimientos add constraint movimientos_empresa_id_fkey foreign key (empresa_id) references retail.empresas (id) not valid;
  end if;
end
$fk$;
alter table retail.movimientos validate constraint movimientos_empresa_id_fkey;

comment on column retail.movimientos.empresa_id is
  'ADR-0542: de qué empresa son las unidades de este movimiento. Solo se llena en una sede donde operan dos empresas (Tienda LIM); en las demás queda vacío y vale CAYLA. Lo escribe el disparador trg_movimientos_libro_por_dueno. Quien lee: coalesce(m.empresa_id, productos.empresa_id).';

-- ---------- 1. El reparto: solo lo que NO es de la casa ----------
create table if not exists retail.stock_dueno (
  variante_id uuid not null references retail.variantes (id) on delete cascade,
  ubicacion_id uuid not null references retail.ubicaciones (id),
  sububicacion_id uuid,
  empresa_id uuid not null references retail.empresas (id),
  cantidad integer not null default 0,
  cantidad_apartada integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint stock_dueno_clave unique nulls not distinct (variante_id, ubicacion_id, sububicacion_id, empresa_id),
  constraint stock_dueno_cantidad_no_negativa check (cantidad >= 0),
  constraint stock_dueno_apartada_valida check (cantidad_apartada >= 0 and cantidad_apartada <= cantidad),
  -- La casa (CAYLA) nunca se escribe: es el resto. El id es el fijo de `empresas` (ADR-0463, el mismo de `fn_empresas_de_sede`).
  constraint stock_dueno_no_es_la_casa check (empresa_id <> 'ca71a000-0000-4000-8000-000000000001'),
  constraint stock_dueno_sububicacion_pertenece_fk foreign key (sububicacion_id, ubicacion_id) references retail.sububicaciones (id, ubicacion_id)
);

create index if not exists stock_dueno_ubicacion_idx on retail.stock_dueno (ubicacion_id);

alter table retail.stock_dueno enable row level security;
revoke all on retail.stock_dueno from anon, authenticated;

comment on table retail.stock_dueno is
  'ADR-0542: las unidades de una sede con dos empresas que NO son de la casa (hoy, las de CLAURE en Tienda LIM). Las de CAYLA son el resto: stock.cantidad − sum(stock_dueno.cantidad). Derivada de movimientos.empresa_id; nadie la edita a mano. Sin políticas: solo la leen funciones security definer.';

-- ---------- 2. Las piezas del disparador ----------
create or replace function retail.fn_sede_con_dos_empresas(p_ubicacion_id uuid)
returns boolean
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select (select count(*) from retail.fn_empresas_de_sede(p_ubicacion_id)) >= 2
$$;

comment on function retail.fn_sede_con_dos_empresas(uuid) is
  'ADR-0542: ¿operan dos o más empresas en esta sede (empresa_sedes)? Solo ahí el stock se parte por dueño. Hoy: Tienda LIM.';

-- TRANSITORIA. Mientras ninguna pantalla pregunta el dueño, una entrada sin elegir toma el de la ficha: todo sigue como antes.
-- Cuando la obra de ADR-0542 llegue a la actividad 9, esta función pasa a RECHAZAR («elige de cuál es»).
create or replace function retail.fn_dueno_de_entrada_sin_elegir(p_variante_id uuid)
returns uuid
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select coalesce(p.empresa_id, retail.fn_empresa_casa_id())
    from retail.variantes v join retail.productos p on p.id = v.producto_id
   where v.id = p_variante_id
$$;

comment on function retail.fn_dueno_de_entrada_sin_elegir(uuid) is
  'ADR-0542, TRANSITORIA: de quién es una entrada que nadie marcó en una sede con dos empresas = la ficha. Se vuelve un rechazo cuando todas las pantallas pregunten.';

-- El dueño que la pantalla eligió para esta llamada, leído de los encabezados de la petición (el mismo camino de `x-responsable`, ADR-0162):
-- `x-dueno-lineas` = {"<variante_id>": "<empresa_id>"} para una venta con prendas de dueños distintos, o `x-dueno` = "<empresa_id>" para todo lo
-- que mueva la llamada. Así la elección viaja hasta el disparador sin reescribir ninguna de las funciones que escriben movimientos.
create or replace function retail.fn_dueno_de_la_llamada(p_variante_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_headers json;
  v_texto text;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    return null;
  end;
  if v_headers is null then
    return null;
  end if;
  begin
    v_texto := nullif(trim((v_headers ->> 'x-dueno-lineas')::json ->> p_variante_id::text), '');
    if v_texto is null then
      v_texto := nullif(trim(v_headers ->> 'x-dueno'), '');
    end if;
    return v_texto::uuid;
  exception when others then
    raise exception 'El dueño enviado no es válido' using errcode = '22P02';
  end;
end
$$;

comment on function retail.fn_dueno_de_la_llamada(uuid) is
  'ADR-0542: la empresa que la pantalla eligió para esta llamada (encabezados x-dueno-lineas / x-dueno), o null. El disparador de movimientos la usa cuando el movimiento no trae dueño.';

-- De quién era lo que se vendió, para que lo devuelto o cambiado vuelva a su dueño sin que nadie lo marque (ADR-0542, Felipe 2026-10-27:
-- «una devolución vuelve al dueño de la venta original»). Sale del movimiento de la venta de esa línea; si la venta es anterior al libro
-- (`empresa_id` vacío) vale la ficha, que es lo que Felipe eligió para el historial.
create or replace function retail.fn_dueno_de_lo_vendido(p_devolucion_item_id uuid, p_cambio_id uuid)
returns uuid
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select coalesce(m.empresa_id, p.empresa_id)
    from retail.movimientos m
    join retail.variantes v on v.id = m.variante_id
    join retail.productos p on p.id = v.producto_id
   where m.tipo = 'salida'
     and m.venta_item_id = coalesce(
           (select di.venta_item_id from retail.devolucion_items di where di.id = p_devolucion_item_id),
           (select c.venta_item_id from retail.cambios c where c.id = p_cambio_id))
   limit 1
$$;

comment on function retail.fn_dueno_de_lo_vendido(uuid, uuid) is
  'ADR-0542: la empresa de la línea que se vendió, para que una devolución o un cambio vuelvan a su dueño. Vacío si el movimiento no viene de una devolución ni de un cambio.';

-- Los candados de una fila de stock y de sus dueños, en el mismo orden que usa fn_aplicar_movimiento (primero stock).
create or replace function retail.fn_bloquear_libro(p_variante_id uuid, p_ubicacion_id uuid, p_sububicacion_id uuid)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  perform 1 from retail.stock s
    where s.variante_id = p_variante_id and s.ubicacion_id = p_ubicacion_id and s.sububicacion_id is not distinct from p_sububicacion_id
    for update;
  perform 1 from retail.stock_dueno d
    where d.variante_id = p_variante_id and d.ubicacion_id = p_ubicacion_id and d.sububicacion_id is not distinct from p_sububicacion_id
    order by d.empresa_id
    for update;
end
$$;

-- Lo que lee el reparto de una fila de stock: la casa es el resto. Devuelve una fila por dueño con unidades en esa fila.
create or replace function retail.fn_reparto_de_la_fila(p_variante_id uuid, p_ubicacion_id uuid, p_sububicacion_id uuid)
returns table (empresa_id uuid, cantidad integer, cantidad_apartada integer)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  with fila as (
    select coalesce(sum(s.cantidad), 0)::integer as cant, coalesce(sum(s.cantidad_apartada), 0)::integer as apart
      from retail.stock s
     where s.variante_id = p_variante_id and s.ubicacion_id = p_ubicacion_id and s.sububicacion_id is not distinct from p_sububicacion_id),
  otros as (
    select d.empresa_id, d.cantidad, d.cantidad_apartada
      from retail.stock_dueno d
     where d.variante_id = p_variante_id and d.ubicacion_id = p_ubicacion_id and d.sububicacion_id is not distinct from p_sububicacion_id),
  suma as (select coalesce(sum(cantidad), 0)::integer as c, coalesce(sum(cantidad_apartada), 0)::integer as a from otros)
  select retail.fn_empresa_casa_id(), f.cant - s.c, f.apart - s.a from fila f, suma s
  union all
  select o.empresa_id, o.cantidad, o.cantidad_apartada from otros o
$$;

comment on function retail.fn_reparto_de_la_fila(uuid, uuid, uuid) is
  'ADR-0542: cuántas unidades (y cuántas apartadas) tiene cada dueño en UNA fila de stock. La casa (CAYLA) es stock − lo de los demás.';

-- Quién pone la salida: el dueño elegido, o el único que tiene con qué. Devuelve `null`-equivalente (la casa) si el stock no alcanza
-- (entonces habla fn_aplicar_movimiento); rechaza si hay duda («elige de cuál es») o si lo único que alcanza no puede ir al destino.
-- (una base que ya tuviera la versión de siete argumentos la suelta: `drop function` no toma candados de auth)
drop function if exists retail.fn_dueno_de_una_salida(uuid, uuid, uuid, text, integer, uuid, uuid);

create or replace function retail.fn_dueno_de_una_salida(
  p_variante_id uuid, p_ubicacion_id uuid, p_sububicacion_id uuid,
  p_tipo text, p_cantidad integer, p_explicito uuid, p_destino_id uuid, p_preferido uuid default null)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_casa uuid := retail.fn_empresa_casa_id();
  r record;
  v_pool integer;
  v_total integer := 0;         -- lo que hay para esta salida, de todos los dueños
  v_viajan integer := 0;        -- lo que puede ir al destino (dueños que operan allí)
  v_con integer := 0;           -- cuántos dueños que pueden ir tienen algo
  v_elegido uuid;
  v_del_elegido integer := 0;
  v_pool_explicito integer := 0;
  v_pool_casa integer := 0;
  v_pool_preferido integer := 0;
  v_que_hay text := '';         -- «3 de CAYLA y 2 de CLAURE»
  v_que_no_viaja text := '';    -- dueños con unidades que no pueden ir al destino
  v_nombre text;
  v_ref text;
  v_sede text;
begin
  perform retail.fn_bloquear_libro(p_variante_id, p_ubicacion_id, p_sububicacion_id);
  v_ref := (select p.referencia from retail.variantes v join retail.productos p on p.id = v.producto_id where v.id = p_variante_id);
  v_sede := (select nombre from retail.ubicaciones where id = p_ubicacion_id);

  for r in select * from retail.fn_reparto_de_la_fila(p_variante_id, p_ubicacion_id, p_sububicacion_id) loop
    if r.cantidad < 0 or r.cantidad_apartada < 0 or r.cantidad_apartada > r.cantidad then
      raise exception '%', format('El reparto por dueño de %s en %s no cuadra con su stock. No se movió nada: avisa a Felipe.', v_ref, v_sede)
        using hint = 'stock_dueno_descuadre';
    end if;
    -- Liberar un apartado usa lo apartado; todo lo demás, lo disponible (lo apartado ya tiene destino).
    v_pool := case when p_tipo = 'liberacion_apartado' then r.cantidad_apartada else r.cantidad - r.cantidad_apartada end;
    v_total := v_total + v_pool;
    v_nombre := (select nombre from retail.empresas where id = r.empresa_id);
    if v_pool > 0 then
      v_que_hay := v_que_hay || case when v_que_hay = '' then '' else ' y ' end || v_pool || ' de ' || v_nombre;
    end if;
    if p_explicito is not null and r.empresa_id = p_explicito then
      v_pool_explicito := v_pool;
    end if;
    if r.empresa_id = v_casa then
      v_pool_casa := v_pool;
    end if;
    if p_preferido is not null and r.empresa_id = p_preferido then
      v_pool_preferido := v_pool;
    end if;
    if p_destino_id is null or exists (select 1 from retail.fn_empresas_de_sede(p_destino_id) e where e.id = r.empresa_id) then
      v_viajan := v_viajan + v_pool;
      if v_pool > 0 then
        v_con := v_con + 1;
        v_elegido := r.empresa_id;
        v_del_elegido := v_pool;
      end if;
    elsif v_pool > 0 then
      v_que_no_viaja := v_que_no_viaja || case when v_que_no_viaja = '' then '' else ' y ' end || v_nombre;
    end if;
  end loop;

  -- El dueño lo eligió la persona.
  if p_explicito is not null then
    if v_pool_explicito >= p_cantidad or v_total < p_cantidad then
      return p_explicito;   -- (si el total no alcanza, habla fn_aplicar_movimiento)
    end if;
    raise exception '%', format('De %s en %s hay %s, y de %s solo %s: no alcanza para %s. Elige otro dueño o baja la cantidad.',
        v_ref, v_sede, coalesce(nullif(v_que_hay, ''), 'nada'), (select nombre from retail.empresas where id = p_explicito), v_pool_explicito, p_cantidad)
      using hint = 'dueno_sin_unidades';
  end if;

  -- Nadie eligió: hay duda si dos dueños (que pueden ir) tienen unidades.
  if v_con > 1 then
    -- Hay tres casos en que nadie puede elegir, y la duda se resuelve sola, sin adivinar a escondidas:
    --  · lo que se entrega de un apartado: sale del dueño al que se le acaba de liberar esa unidad (`p_preferido`, misma transacción);
    --  · soltar un apartado (vencido, anulado): sale de la casa si tiene apartadas, y si no, del otro;
    --  · quien llama no es personal de la tienda (la tienda online, una persona que compra): sale de la casa, si le alcanza.
    if p_preferido is not null and v_pool_preferido >= p_cantidad then
      return p_preferido;
    end if;
    if p_tipo = 'liberacion_apartado' then
      return case when v_pool_casa > 0 then v_casa else v_elegido end;
    end if;
    if not retail.fn_tiene_acceso_retail() and v_pool_casa >= p_cantidad then
      return v_casa;
    end if;
    raise exception '%', format('%s tiene %s en %s: elige de cuál es.', v_ref, v_que_hay, v_sede)
      using hint = 'elegir_dueno';
  end if;
  if v_con = 1 and v_del_elegido >= p_cantidad then
    return v_elegido;
  end if;
  -- Hay unidades, pero las que alcanzan son de un dueño que no opera en el destino (CLAURE no sale de Lima).
  if p_destino_id is not null and v_viajan < p_cantidad and v_total >= p_cantidad then
    raise exception '%', format('%s en %s: solo %s pueden ir a %s. El resto es de %s, que no opera allí: esas unidades solo se venden, se reciben y se trasladan donde %s opera.',
        v_ref, v_sede, v_viajan, (select nombre from retail.ubicaciones where id = p_destino_id), v_que_no_viaja, v_que_no_viaja)
      using hint = 'empresa_fuera_de_sede';
  end if;
  -- El stock no alcanza: que hable fn_aplicar_movimiento.
  return coalesce(v_elegido, v_casa);
end
$$;

comment on function retail.fn_dueno_de_una_salida(uuid, uuid, uuid, text, integer, uuid, uuid, uuid) is
  'ADR-0542: de quién son las unidades que SALEN (venta, traslado, apartado, ajuste −): el dueño elegido, o el único que tiene con qué. Rechaza si hay duda (elegir_dueno) o si lo único que alcanza no puede ir al destino (empresa_fuera_de_sede).';

-- ---------- 3. El disparador: resuelve el dueño y mueve el reparto ----------
create or replace function retail.fn_movimiento_libro_por_dueno()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_casa uuid := retail.fn_empresa_casa_id();
  v_nulo constant uuid := '00000000-0000-0000-0000-000000000000';
  v_n integer := abs(new.cantidad);
  v_dual_origen boolean;
  v_dual_destino boolean := false;
  v_sale boolean;
  v_entra boolean;
  v_dueno uuid;
  v_ubic_entra uuid;
  v_sub_entra uuid;
  v_memoria text;
  v_preferido uuid;
begin
  -- Sin dueño en el movimiento, el que la pantalla eligió para la llamada (encabezado), si lo hay.
  new.empresa_id := coalesce(new.empresa_id, retail.fn_dueno_de_la_llamada(new.variante_id));
  -- El dueño que viene elegido tiene que operar donde se mueve (y, en un traslado, donde llega).
  if new.empresa_id is not null then
    if not exists (select 1 from retail.fn_empresas_de_sede(new.ubicacion_id) e where e.id = new.empresa_id)
       or (new.tipo = 'traslado' and new.ubicacion_destino_id is not null
           and not exists (select 1 from retail.fn_empresas_de_sede(new.ubicacion_destino_id) e where e.id = new.empresa_id)) then
      raise exception '%', format('%s no opera en %s: sus unidades solo se venden, se reciben y se trasladan en %s.',
          (select nombre from retail.empresas where id = new.empresa_id),
          (select nombre from retail.ubicaciones where id = case when exists (select 1 from retail.fn_empresas_de_sede(new.ubicacion_id) e where e.id = new.empresa_id)
                                                           then new.ubicacion_destino_id else new.ubicacion_id end),
          coalesce((select string_agg(u.nombre, ', ' order by u.nombre) from retail.empresa_sedes es join retail.ubicaciones u on u.id = es.ubicacion_id
                     where es.empresa_id = new.empresa_id), 'ninguna sede todavía'))
        using hint = 'empresa_fuera_de_sede';
    end if;
  end if;

  v_dual_origen := retail.fn_sede_con_dos_empresas(new.ubicacion_id);
  if new.tipo = 'traslado' and new.ubicacion_destino_id is not null then
    v_dual_destino := retail.fn_sede_con_dos_empresas(new.ubicacion_destino_id);
  end if;
  -- Ninguna sede con dos empresas, o nada que mover: no hay nada que repartir.
  if (not v_dual_origen and not v_dual_destino) or new.cantidad = 0 then
    return new;
  end if;

  v_sale := v_dual_origen and (new.tipo in ('salida', 'traslado', 'apartado', 'liberacion_apartado') or (new.tipo = 'ajuste' and new.cantidad < 0));
  v_entra := (v_dual_origen and (new.tipo = 'entrada' or (new.tipo = 'ajuste' and new.cantidad > 0))) or (v_dual_destino and new.tipo = 'traslado');
  v_ubic_entra := case when new.tipo = 'traslado' then new.ubicacion_destino_id else new.ubicacion_id end;
  v_sub_entra := case when new.tipo = 'traslado' then new.sububicacion_destino_id else new.sububicacion_id end;

  -- Un traslado entre dos filas con reparto toma sus candados en un orden fijo (el de fn_aplicar_movimiento): sin ciclos de espera.
  if new.tipo = 'traslado' and v_dual_origen and v_dual_destino then
    if (new.ubicacion_id, coalesce(new.sububicacion_id, v_nulo)) <= (new.ubicacion_destino_id, coalesce(new.sububicacion_destino_id, v_nulo)) then
      perform retail.fn_bloquear_libro(new.variante_id, new.ubicacion_id, new.sububicacion_id);
      perform retail.fn_bloquear_libro(new.variante_id, new.ubicacion_destino_id, new.sububicacion_destino_id);
    else
      perform retail.fn_bloquear_libro(new.variante_id, new.ubicacion_destino_id, new.sububicacion_destino_id);
      perform retail.fn_bloquear_libro(new.variante_id, new.ubicacion_id, new.sububicacion_id);
    end if;
  end if;

  if v_sale then
    -- Lo que se entrega de un apartado se libera y se vende en la misma transacción: la venta hereda el dueño de lo que se liberó.
    v_memoria := 'cayla.liberado_v' || replace(new.variante_id::text, '-', '_');
    if new.tipo = 'salida' and new.empresa_id is null then
      v_preferido := coalesce(nullif(current_setting(v_memoria, true), '')::uuid,
                              -- la prenda nueva de un cambio sale, si hay duda, del dueño de lo que el cliente devolvió
                              case when new.cambio_id is not null then retail.fn_dueno_de_lo_vendido(null, new.cambio_id) end);
    end if;
    v_dueno := retail.fn_dueno_de_una_salida(new.variante_id, new.ubicacion_id, new.sububicacion_id, new.tipo, v_n, new.empresa_id,
                 case when new.tipo = 'traslado' then new.ubicacion_destino_id end, v_preferido);
    if new.tipo = 'liberacion_apartado' then
      perform set_config(v_memoria, v_dueno::text, true);
    end if;
  elsif v_entra then
    -- Un traslado que llega desde una sede sin reparto (Trujillo, el Taller) es de CAYLA: CLAURE no existe allá.
    v_dueno := coalesce(
      new.empresa_id,
      case when new.tipo = 'traslado' then v_casa
           -- una devolución o un cambio vuelve al dueño de la venta original; lo demás, el transitorio de la ficha
           else coalesce(retail.fn_dueno_de_lo_vendido(new.devolucion_item_id, new.cambio_id), retail.fn_dueno_de_entrada_sin_elegir(new.variante_id)) end);
  end if;

  new.empresa_id := v_dueno;
  -- La casa no se escribe: es el resto. Solo se mueve el reparto de quien NO es la casa.
  if v_dueno is null or v_dueno = v_casa then
    return new;
  end if;

  if v_sale then
    if new.tipo = 'apartado' then
      update retail.stock_dueno set cantidad_apartada = cantidad_apartada + v_n, updated_at = now()
       where variante_id = new.variante_id and ubicacion_id = new.ubicacion_id and sububicacion_id is not distinct from new.sububicacion_id
         and empresa_id = v_dueno and cantidad - cantidad_apartada >= v_n;
    elsif new.tipo = 'liberacion_apartado' then
      update retail.stock_dueno set cantidad_apartada = cantidad_apartada - v_n, updated_at = now()
       where variante_id = new.variante_id and ubicacion_id = new.ubicacion_id and sububicacion_id is not distinct from new.sububicacion_id
         and empresa_id = v_dueno and cantidad_apartada >= v_n;
    else
      update retail.stock_dueno set cantidad = cantidad - v_n, updated_at = now()
       where variante_id = new.variante_id and ubicacion_id = new.ubicacion_id and sububicacion_id is not distinct from new.sububicacion_id
         and empresa_id = v_dueno and cantidad - cantidad_apartada >= v_n;
    end if;
    -- Sin fila que alcance es que el stock total no alcanza: se aparta, y habla fn_aplicar_movimiento.
    if not found then
      return new;
    end if;
  end if;

  if v_entra then
    perform retail.fn_bloquear_libro(new.variante_id, v_ubic_entra, v_sub_entra);
    insert into retail.stock_dueno (variante_id, ubicacion_id, sububicacion_id, empresa_id, cantidad)
      values (new.variante_id, v_ubic_entra, v_sub_entra, v_dueno, v_n)
      on conflict (variante_id, ubicacion_id, sububicacion_id, empresa_id) do update
        set cantidad = stock_dueno.cantidad + excluded.cantidad, updated_at = now();
  end if;

  return new;
end
$$;

comment on function retail.fn_movimiento_libro_por_dueno() is
  'ADR-0542: en una sede con dos empresas resuelve de quién son las unidades de cada movimiento (movimientos.empresa_id) y mueve stock_dueno. CAYLA es el resto: no se escribe. Rechaza lo dudoso (elegir_dueno) y lo que CLAURE no puede hacer fuera de Lima (empresa_fuera_de_sede).';

-- Solo las usan los disparadores (que no necesitan EXECUTE para dispararse): nadie las llama por la API.
revoke all on function retail.fn_sede_con_dos_empresas(uuid) from public, anon, authenticated;
revoke all on function retail.fn_dueno_de_la_llamada(uuid) from public, anon, authenticated;
revoke all on function retail.fn_dueno_de_lo_vendido(uuid, uuid) from public, anon, authenticated;
revoke all on function retail.fn_dueno_de_entrada_sin_elegir(uuid) from public, anon, authenticated;
revoke all on function retail.fn_bloquear_libro(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function retail.fn_reparto_de_la_fila(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function retail.fn_dueno_de_una_salida(uuid, uuid, uuid, text, integer, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function retail.fn_movimiento_libro_por_dueno() from public, anon, authenticated;

create or replace trigger trg_movimientos_libro_por_dueno
  before insert on retail.movimientos
  for each row execute function retail.fn_movimiento_libro_por_dueno();

-- ---------- 4. La red al cerrar la transacción ----------
create or replace function retail.fn_stock_dueno_cuadra()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  r record;
  v_hay_otros boolean := false;
begin
  -- Se mira la fila tal como TERMINA la transacción (puede haber cambiado otra vez después de esta escritura).
  for r in select * from retail.fn_reparto_de_la_fila(new.variante_id, new.ubicacion_id, new.sububicacion_id) loop
    if r.cantidad < 0 or r.cantidad_apartada < 0 or r.cantidad_apartada > r.cantidad then
      raise exception '%', format('El reparto por dueño de %s en %s no cuadra con su stock: %s de %s con %s apartadas. Se deshizo todo.',
          (select p.referencia from retail.variantes v join retail.productos p on p.id = v.producto_id where v.id = new.variante_id),
          (select nombre from retail.ubicaciones where id = new.ubicacion_id),
          r.cantidad, (select nombre from retail.empresas where id = r.empresa_id), r.cantidad_apartada)
        using hint = 'stock_dueno_descuadre';
    end if;
    if r.empresa_id <> retail.fn_empresa_casa_id() and (r.cantidad <> 0 or r.cantidad_apartada <> 0) then
      v_hay_otros := true;
    end if;
  end loop;
  if v_hay_otros and not retail.fn_sede_con_dos_empresas(new.ubicacion_id) then
    raise exception '%', format('%s tiene unidades repartidas por dueño en %s, donde ya no operan dos empresas. Primero véndelas o llévalas a otra sede. Se deshizo todo.',
        (select p.referencia from retail.variantes v join retail.productos p on p.id = v.producto_id where v.id = new.variante_id),
        (select nombre from retail.ubicaciones where id = new.ubicacion_id))
      using hint = 'stock_dueno_descuadre';
  end if;
  return null;
end
$$;

revoke all on function retail.fn_stock_dueno_cuadra() from public, anon, authenticated;

comment on function retail.fn_stock_dueno_cuadra() is
  'ADR-0542: al cerrar la transacción, lo de los demás dueños no pasa del stock de su fila (ni lo apartado de lo apartado) y solo hay reparto donde operan dos empresas.';

-- Los disparadores de restricción no tienen `or replace`: se crean solo si faltan (crear un disparador no toma candados de auth).
do $red$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'retail.stock'::regclass and tgname = 'stock_cuadra_con_dueno' and not tgisinternal) then
    create constraint trigger stock_cuadra_con_dueno
      after insert or update of cantidad, cantidad_apartada on retail.stock
      deferrable initially deferred
      for each row when (retail.fn_sede_con_dos_empresas(new.ubicacion_id))
      execute function retail.fn_stock_dueno_cuadra();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'retail.stock_dueno'::regclass and tgname = 'stock_dueno_cuadra_con_stock' and not tgisinternal) then
    create constraint trigger stock_dueno_cuadra_con_stock
      after insert or update on retail.stock_dueno
      deferrable initially deferred
      for each row execute function retail.fn_stock_dueno_cuadra();
  end if;
end
$red$;

-- ---------- 5. Las lecturas ----------
-- Para Existencias: cuántas unidades de cada dueño hay de cada prenda en una sede con dos empresas. SOLO devuelve las prendas que tienen
-- unidades de alguien que no es la casa: en una toda de CAYLA no hay nada que repartir ni que decir. Eso también la mantiene corta
-- (PostgREST corta en 1.000 filas sin avisar: ya mordió a `fn_stock_por_sede`, 2026-09-23).
create or replace function retail.fn_stock_por_dueno(p_ubicacion_id uuid)
returns table (variante_id uuid, empresa_id uuid, clave text, cantidad integer, cantidad_apartada integer)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  -- Sin la cuarentena (prendas dañadas): `fn_existencias` tampoco la cuenta, y la línea tiene que sumar con los números de al lado.
  with total as (
    select s.variante_id, sum(s.cantidad)::integer as cant, sum(s.cantidad_apartada)::integer as apart
      from retail.stock s
      left join retail.sububicaciones sb on sb.id = s.sububicacion_id
     where s.ubicacion_id = p_ubicacion_id
       and coalesce(sb.tipo, '') <> 'cuarentena'
       and exists (select 1 from retail.stock_dueno d where d.variante_id = s.variante_id and d.ubicacion_id = s.ubicacion_id)
     group by s.variante_id),
  otros as (
    select d.variante_id, d.empresa_id, sum(d.cantidad)::integer as cant, sum(d.cantidad_apartada)::integer as apart
      from retail.stock_dueno d
      left join retail.sububicaciones sb on sb.id = d.sububicacion_id
     where d.ubicacion_id = p_ubicacion_id and coalesce(sb.tipo, '') <> 'cuarentena'
     group by d.variante_id, d.empresa_id),
  filas as (
    select t.variante_id, retail.fn_empresa_casa_id() as empresa_id,
           t.cant - coalesce((select sum(o.cant) from otros o where o.variante_id = t.variante_id), 0)::integer as cant,
           t.apart - coalesce((select sum(o.apart) from otros o where o.variante_id = t.variante_id), 0)::integer as apart
      from total t
    union all
    select o.variante_id, o.empresa_id, o.cant, o.apart from otros o)
  select f.variante_id, f.empresa_id, e.clave, f.cant, f.apart
    from filas f join retail.empresas e on e.id = f.empresa_id
   where retail.fn_sede_con_dos_empresas(p_ubicacion_id)
     and retail.fn_tiene_acceso_retail()
     and (f.cant <> 0 or f.apart <> 0)
$$;

revoke all on function retail.fn_stock_por_dueno(uuid) from public, anon;
grant execute on function retail.fn_stock_por_dueno(uuid) to authenticated;

comment on function retail.fn_stock_por_dueno(uuid) is
  'ADR-0542: unidades (y apartadas) de cada dueño, SOLO de las prendas que tienen unidades de alguien que no es la casa, en una sede con dos empresas; vacío en las demás. Una prenda toda de CAYLA no sale. Misma puerta que fn_stock_por_sede (fn_tiene_acceso_retail).';

-- Para las pruebas y para /chaos: filas donde el reparto no cuadra. Debe devolver CERO filas siempre.
create or replace function retail.fn_stock_dueno_descuadres()
returns table (variante_id uuid, ubicacion_id uuid, sububicacion_id uuid, motivo text)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  with claves as (
    select s.variante_id, s.ubicacion_id, s.sububicacion_id from retail.stock s
    union
    select d.variante_id, d.ubicacion_id, d.sububicacion_id from retail.stock_dueno d)
  select k.variante_id, k.ubicacion_id, k.sububicacion_id,
         case when exists (select 1 from retail.fn_reparto_de_la_fila(k.variante_id, k.ubicacion_id, k.sububicacion_id) r
                            where r.cantidad < 0 or r.cantidad_apartada < 0 or r.cantidad_apartada > r.cantidad)
              then 'lo de los dueños pasa del stock de la fila'
              else 'hay reparto por dueño en una sede donde no operan dos empresas' end
    from claves k
   where exists (select 1 from retail.fn_reparto_de_la_fila(k.variante_id, k.ubicacion_id, k.sububicacion_id) r
                  where r.cantidad < 0 or r.cantidad_apartada < 0 or r.cantidad_apartada > r.cantidad)
      or (not retail.fn_sede_con_dos_empresas(k.ubicacion_id)
          and exists (select 1 from retail.stock_dueno d where d.variante_id = k.variante_id and d.ubicacion_id = k.ubicacion_id
                       and d.sububicacion_id is not distinct from k.sububicacion_id and (d.cantidad <> 0 or d.cantidad_apartada <> 0)))
$$;

revoke all on function retail.fn_stock_dueno_descuadres() from public, anon, authenticated;

comment on function retail.fn_stock_dueno_descuadres() is
  'ADR-0542: filas de stock cuyo reparto por dueño no cuadra. Siempre cero filas; la usan las pruebas y /chaos.';

-- ---------- 6. La carga inicial: cada prenda con el dueño con que se dio de alta ----------
-- Solo las unidades que no son de la casa se escriben (CAYLA es el resto). Idempotente: no pisa lo que ya se movió.
insert into retail.stock_dueno (variante_id, ubicacion_id, sububicacion_id, empresa_id, cantidad, cantidad_apartada)
select s.variante_id, s.ubicacion_id, s.sububicacion_id, p.empresa_id, s.cantidad, s.cantidad_apartada
  from retail.stock s
  join retail.variantes v on v.id = s.variante_id
  join retail.productos p on p.id = v.producto_id
 where p.empresa_id <> retail.fn_empresa_casa_id()
   and (s.cantidad <> 0 or s.cantidad_apartada <> 0)
   and retail.fn_sede_con_dos_empresas(s.ubicacion_id)
on conflict (variante_id, ubicacion_id, sububicacion_id, empresa_id) do nothing;

-- Si algo quedó sin cuadrar, no se aplica nada.
do $sonda$
declare
  v_mal integer;
begin
  v_mal := (select count(*) from retail.fn_stock_dueno_descuadres());
  if v_mal > 0 then
    raise exception 'No se aplicó nada: después de la carga inicial hay % filas de stock cuyo reparto por dueño no cuadra.', v_mal;
  end if;
end
$sonda$;

-- ¿SE PEGÓ ENTERO? Esta es la ÚLTIMA instrucción del archivo. Si no ves «QUEDÓ BIEN», el texto se pegó cortado o falta algo:
-- es seguro volver a pegarlo completo.
select '20261027222000 · stock por dueño en sedes con dos empresas' as parte,
       case when exists (select 1 from pg_trigger where tgrelid = 'retail.movimientos'::regclass and tgname = 'trg_movimientos_libro_por_dueno' and not tgisinternal)
             and exists (select 1 from pg_trigger where tgrelid = 'retail.stock'::regclass and tgname = 'stock_cuadra_con_dueno' and not tgisinternal)
             and exists (select 1 from pg_trigger where tgrelid = 'retail.stock_dueno'::regclass and tgname = 'stock_dueno_cuadra_con_stock' and not tgisinternal)
             and exists (select 1 from information_schema.columns where table_schema = 'retail' and table_name = 'movimientos' and column_name = 'empresa_id')
             and not has_function_privilege('authenticated', 'retail.fn_movimiento_libro_por_dueno()', 'execute')
             and not has_function_privilege('anon', 'retail.fn_movimiento_libro_por_dueno()', 'execute')
             and not has_function_privilege('anon', 'retail.fn_stock_por_dueno(uuid)', 'execute')
             and has_function_privilege('authenticated', 'retail.fn_stock_por_dueno(uuid)', 'execute')
             and not has_table_privilege('authenticated', 'retail.stock_dueno', 'select')
            then 'QUEDÓ BIEN' else 'REVISAR: falta un disparador, una columna, o algo quedó a la vista de la API' end as resultado;
