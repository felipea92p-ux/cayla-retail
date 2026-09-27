-- ============================================================================
-- 20260928100000_temporadas_como_atributo.sql — CAYLA V2 · ADR-0246 «Temporadas como atributo del producto»
-- (paso 3a del bloque 3 de Frescura del piso, ADR-0208)
--
-- EL PROBLEMA PRIMERO. Frescura compara cuánto lleva cada prenda colgada contra lo normal de su categoría en su sede.
-- Sin saber la temporada, mezcla la blusa de verano con la chompa de invierno, no sabe cuándo terminó la estación de una
-- prenda (para avisar «Temporada pasada») ni qué es clásico. `productos.temporada` existe desde 20260915224500, pero es
-- texto libre («PV 26», «pv2026» y «Verano» serían tres temporadas) y está vacío en producción (13 de 13, 2026-09-26).
--
-- QUÉ PROMETE (decidido con Felipe el 2026-09-26, ver ADR-0246):
--   · Una LISTA CERRADA de 9 temporadas (`retail.temporadas`): Primavera-Verano, Primavera, Verano, Otoño-Invierno,
--     Otoño, Invierno y tres clásicos. Cada una sabe en qué estación empieza y en cuál termina; la mitad del año (PV/OI)
--     se calcula de la estación, no se escribe.
--   · Un CALENDARIO por año (`retail.temporada_fechas`): solo el instante en que empieza cada estación, de SENAMHI (o del
--     Observatorio Naval de EE. UU. mientras SENAMHI no publique). El fin de una estación es el inicio de la siguiente,
--     así que no puede haber huecos ni solapes. El líder corre una fecha solo si todavía no empezó; lo pasado queda fijo.
--   · UNA temporada por prenda, de lo más específico a lo más general: el COLOR (tabla aparte), si no el PRODUCTO
--     (`productos.temporada`, ahora con llave foránea a la lista), si no su CATEGORÍA (`categorias.temporada`, valor por
--     defecto). Opcional: sin ninguna, la prenda va a la lista «Sin temporada». La regla vive en UNA función,
--     `fn_temporada_efectiva`, que usan la pantalla y, después, Frescura.
--   · El AÑO no se escribe en ningún lado: `fn_ocurrencia_temporada` dice a qué aparición de su temporada pertenece una
--     prenda según la fecha en que llegó: la que la contiene o, si llegó fuera, la MÁS CERCANA en el tiempo (así los
--     sobrantes de invierno de la carga inicial de hoy salen como «temporada pasada», y lo que el Taller entrega antes
--     de su invierno cuenta en el que viene).
--
-- ESTADOS QUE DEJAN DE SER POSIBLES:
--   · una temporada fuera de la lista (llave foránea en producto, categoría y color);
--   · dos temporadas en la misma prenda o el mismo color (una columna; llave primaria producto+color);
--   · una excepción para un color que la prenda no tiene (disparador);
--   · una estación que cruza de PV a OI, o una temporada de moda sin estación (checks);
--   · una fecha lejos de su estación, repetida, fuera de orden, o corrida cuando ya empezó (check y disparador).
--
-- POR QUÉ SIN POLÍTICAS. Las tres tablas nuevas tienen RLS encendido y NINGÚN privilegio para `anon`/`authenticated`:
-- se leen por funciones `security definer` de solo lectura (`fn_temporadas`, `fn_calendario_estaciones`,
-- `fn_temporada_efectiva`, `fn_ocurrencia_temporada`) y se escriben por RPC con su permiso. Así la migración de
-- producción no lleva `create policy`, que en el SQL Editor toma las tablas de auth/storage (ADR-0195).
--
-- FUNCIONES VIVAS: no se toca `catalogo_actualizar_producto` (ya recibe y guarda `p_temporada`; la llave foránea la
-- protege) ni `crear_producto_con_variantes`. Sí se recrea `crear_producto_con_stock_inicial` (el alta de la pantalla)
-- con un 14.º parámetro opcional, `p_temporada`, detrás de una guarda md5 de su cuerpo vivo.
--
-- CÓMO SE PEGA EN PRODUCCIÓN: SEIS PARTES, cada una por separado (cada una con `lock_timeout` de 3 s e idempotente; si
-- una choca con el candado, se vuelve a pegar esa misma parte). Primero la sonda de solo lectura del final del ADR-0246.
-- En local y en CI el archivo corre entero. La web va DESPUÉS de las seis partes.
--
-- SE ROMPE SI: alguien escribe una temporada a mano en `productos.temporada` antes de la PARTE 2 (la sonda aborta y lo
-- nombra); o el calendario se acaba (hoy llega a diciembre de 2028: `fn_calendario_estaciones` lo deja ver y el líder
-- agrega el año con `fijar_fechas_temporada`).
-- ============================================================================


-- ============================================================================
-- PARTE 1 de 6 · La lista y el calendario (tablas nuevas: no toma ninguna tabla que la tienda esté usando)
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

create table if not exists retail.temporadas (
  clave text primary key check (clave ~ '^[a-z][a-z_]*$'),
  nombre text not null unique check (length(btrim(nombre)) between 1 and 40),
  orden smallint not null unique,
  es_clasico boolean not null default false,
  estacion_desde text check (estacion_desde in ('primavera', 'verano', 'otono', 'invierno')),
  estacion_hasta text check (estacion_hasta in ('primavera', 'verano', 'otono', 'invierno')),
  mitad text generated always as (
    case when estacion_desde in ('primavera', 'verano') then 'PV'
         when estacion_desde in ('otono', 'invierno') then 'OI' end
  ) stored,
  constraint temporadas_ventana_completa check ((estacion_desde is null) = (estacion_hasta is null)),
  constraint temporadas_ventana_en_su_mitad check (
    estacion_desde is null or (estacion_desde, estacion_hasta) in (
      ('primavera', 'verano'), ('primavera', 'otono'), ('verano', 'otono'),
      ('otono', 'invierno'), ('otono', 'primavera'), ('invierno', 'primavera'))
  ),
  constraint temporadas_moda_con_ventana check (es_clasico or estacion_desde is not null)
);

comment on table retail.temporadas is
  'ADR-0246: la lista cerrada de temporadas. Una prenda de moda termina su estación al empezar `estacion_hasta`; la mitad del año (PV/OI) se calcula de `estacion_desde`. Los clásicos no pasan a «temporada pasada»; los de verano o invierno usan su ventana para sugerir guardarlos fuera de ella.';

insert into retail.temporadas (clave, nombre, orden, es_clasico, estacion_desde, estacion_hasta) values
  ('primavera_verano', 'Primavera-Verano',      10, false, 'primavera', 'otono'),
  ('primavera',        'Primavera',             20, false, 'primavera', 'verano'),
  ('verano',           'Verano',                30, false, 'verano',    'otono'),
  ('otono_invierno',   'Otoño-Invierno',        40, false, 'otono',     'primavera'),
  ('otono',            'Otoño',                 50, false, 'otono',     'invierno'),
  ('invierno',         'Invierno',              60, false, 'invierno',  'primavera'),
  ('clasico',          'Clásico · todo el año', 70, true,  null,        null),
  ('clasico_verano',   'Clásico · verano',      80, true,  'verano',    'otono'),
  ('clasico_invierno', 'Clásico · invierno',    90, true,  'invierno',  'primavera')
on conflict (clave) do nothing;

create table if not exists retail.temporada_fechas (
  anio smallint not null check (anio between 2024 and 2100),
  estacion text not null check (estacion in ('otono', 'invierno', 'primavera', 'verano')),
  inicio timestamptz not null,
  fuente text not null check (fuente in ('senamhi', 'usno', 'ajustada')),
  actualizado_por uuid references public.personas (id),
  actualizado_en timestamptz not null default now(),
  primary key (anio, estacion),
  constraint temporada_fechas_inicio_unico unique (inicio),
  -- Cerca de su fecha astronómica (el 21 de su mes): el líder puede adelantar el invierno a fines de mayo si el frío
  -- llega antes (ejemplo de Felipe), pero no escribir el otoño en agosto por error.
  constraint temporada_fechas_cerca_de_su_estacion check (
    abs((inicio at time zone 'America/Lima')::date
        - make_date(anio, case estacion when 'otono' then 3 when 'invierno' then 6 when 'primavera' then 9 else 12 end, 21))
    <= 60
  )
);

comment on table retail.temporada_fechas is
  'ADR-0246: el instante en que empieza cada estación, por año (hora de Perú). El fin de una estación es el inicio de la siguiente. Nace de SENAMHI (o del USNO mientras SENAMHI no publique); el líder la corre con `fijar_fechas_temporada` solo si todavía no empezó.';

-- El orden del ciclo: otoño (0) → invierno (1) → primavera (2) → verano (3) → otoño del año siguiente.
create or replace function retail.fn_estacion_posicion(p_anio integer, p_estacion text)
returns integer
language sql
immutable
as $$
  select p_anio * 4 + case p_estacion when 'otono' then 0 when 'invierno' then 1 when 'primavera' then 2 else 3 end;
$$;

create or replace function retail.fn_temporada_fechas_candado()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $fn$
begin
  if tg_op = 'DELETE' then
    raise exception 'El calendario de temporadas no se borra: si una fecha está mal, se corrige.'
      using hint = 'calendario_sin_borrar';
  end if;

  if tg_op = 'UPDATE' then
    if new.anio <> old.anio or new.estacion <> old.estacion then
      raise exception 'El año y la estación de una fecha del calendario no cambian: se corrige la hora de esa misma fila.'
        using hint = 'calendario_llave_fija';
    end if;
    -- Lo que ya empezó queda fijo, venga de donde venga (pantalla o SQL Editor): mover el pasado reclasificaría
    -- prendas que ya se vendieron.
    if old.inicio <= now() or new.inicio <= now() then
      raise exception 'Esa estación ya empezó: su fecha queda fija.' using hint = 'calendario_pasado';
    end if;
  end if;

  return coalesce(new, old);
end;
$fn$;

create or replace trigger temporada_fechas_candado
  before insert or update or delete on retail.temporada_fechas
  for each row execute function retail.fn_temporada_fechas_candado();

-- Cada estación entre la anterior y la siguiente del ciclo: sin eso, correr una fecha podría saltarse otra. Se revisa
-- DIFERIDO (al terminar la transacción, con todas las filas ya escritas) y no fila por fila: al correr dos estaciones
-- a la vez, o al agregar un año entero, el orden intermedio puede quedar cruzado un instante aunque el final esté bien.
-- `fijar_fechas_temporada` lo adelanta a su propio final (`set constraints … immediate`) para responder con el motivo.
create or replace function retail.fn_temporada_fechas_orden()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $fn$
declare
  v_inicio timestamptz;
  v_pos integer;
  v_antes timestamptz;
  v_despues timestamptz;
begin
  -- La fila como quedó al final (pudo cambiar otra vez después de disparar este aviso).
  select f.inicio into v_inicio from retail.temporada_fechas f where f.anio = new.anio and f.estacion = new.estacion;
  if v_inicio is null then
    return null;
  end if;
  v_pos := retail.fn_estacion_posicion(new.anio, new.estacion);
  select max(f.inicio) filter (where retail.fn_estacion_posicion(f.anio, f.estacion) < v_pos),
         min(f.inicio) filter (where retail.fn_estacion_posicion(f.anio, f.estacion) > v_pos)
    into v_antes, v_despues
    from retail.temporada_fechas f
   where not (f.anio = new.anio and f.estacion = new.estacion);
  if (v_antes is not null and v_inicio <= v_antes) or (v_despues is not null and v_inicio >= v_despues) then
    raise exception 'Esa fecha deja la estación fuera de orden: tiene que quedar entre el inicio de la anterior y el de la siguiente.'
      using hint = 'calendario_orden';
  end if;
  return null;
end;
$fn$;

-- Un disparador de restricción no admite `or replace`: se crea solo si falta (y `create trigger` no toma las tablas de
-- auth/storage, ADR-0195).
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'temporada_fechas_orden'
                  and tgrelid = 'retail.temporada_fechas'::regclass) then
    create constraint trigger temporada_fechas_orden
      after insert or update on retail.temporada_fechas
      deferrable initially deferred
      for each row execute function retail.fn_temporada_fechas_orden();
  end if;
end $$;

create or replace trigger temporada_fechas_sin_truncate
  before truncate on retail.temporada_fechas
  for each statement execute function retail.fn_historial_sin_truncate();

-- Siembra, SIEMPRE con la zona escrita: sin «-05», el SQL Editor la toma como UTC y todo se corre 5 horas.
-- 2026: SENAMHI (el verano, del USNO). 2027 y 2028: USNO, a confirmar con SENAMHI cuando publique (ADR-0246).
-- `on conflict do nothing`: pegarla otra vez no pisa una fecha que el líder ya corrigió.
insert into retail.temporada_fechas (anio, estacion, inicio, fuente) values
  (2026, 'otono',     '2026-03-20 09:46-05', 'senamhi'),
  (2026, 'invierno',  '2026-06-21 03:24-05', 'senamhi'),
  (2026, 'primavera', '2026-09-22 19:05-05', 'senamhi'),
  (2026, 'verano',    '2026-12-21 15:50-05', 'usno'),
  (2027, 'otono',     '2027-03-20 15:25-05', 'usno'),
  (2027, 'invierno',  '2027-06-21 09:11-05', 'usno'),
  (2027, 'primavera', '2027-09-23 01:02-05', 'usno'),
  (2027, 'verano',    '2027-12-21 21:42-05', 'usno'),
  (2028, 'otono',     '2028-03-19 21:17-05', 'usno'),
  (2028, 'invierno',  '2028-06-20 15:02-05', 'usno'),
  (2028, 'primavera', '2028-09-22 06:45-05', 'usno'),
  (2028, 'verano',    '2028-12-21 03:19-05', 'usno')
on conflict (anio, estacion) do nothing;

alter table retail.temporadas enable row level security;
alter table retail.temporada_fechas enable row level security;
revoke all on table retail.temporadas from public, anon, authenticated;
revoke all on table retail.temporada_fechas from public, anon, authenticated;


-- ============================================================================
-- PARTE 2 de 6 · `productos.temporada` pasa a ser una clave de la lista (tabla en uso: va sola)
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $$
declare
  v_malos text;
begin
  if to_regclass('retail.temporadas') is null then
    raise exception 'Falta la lista de temporadas: pega antes la PARTE 1.';
  end if;

  -- Un texto en blanco es lo mismo que «sin temporada»: se deja en null para que la llave foránea no lo rechace.
  update retail.productos set temporada = null where temporada is not null and btrim(temporada) = '';

  -- Cualquier otro texto escrito a mano no se adivina: se nombra y se aborta sin tocar nada.
  select string_agg(distinct p.temporada, ', ') into v_malos
    from retail.productos p
   where p.temporada is not null
     and not exists (select 1 from retail.temporadas t where t.clave = p.temporada);
  if v_malos is not null then
    raise exception 'Hay productos con una temporada escrita a mano que no está en la lista (%). Pásalos a una clave de la lista (o déjalos vacíos) y vuelve a pegar esta parte.', v_malos;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'productos_temporada_fk'
                  and conrelid = 'retail.productos'::regclass) then
    alter table retail.productos
      add constraint productos_temporada_fk foreign key (temporada) references retail.temporadas (clave);
  end if;
end $$;

comment on column retail.productos.temporada is
  'ADR-0246: clave de `retail.temporadas` (verano, otono_invierno, clasico…). Vacía = hereda la de su categoría; si tampoco tiene, la prenda está «sin temporada». Un color puede tener la suya en `producto_color_temporadas`.';

-- Un cambio de temporada reclasifica la prenda en Frescura: deja rastro, como el precio o la categoría. Disparador
-- propio (no se toca el parche vivo de `fn_registrar_cambio_producto`). Si no hay responsable (una migración, el SQL
-- Editor), se registra sin firma en vez de fallar.
create or replace function retail.fn_historial_temporada_producto()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_actor uuid;
begin
  begin
    v_actor := retail.fn_actor_persona_id(true);
  exception when others then
    v_actor := null;
  end;
  insert into retail.historial_producto_cambios (entidad, entidad_id, campo, valor_anterior, valor_nuevo, usuario_id)
  values ('producto', new.id, 'temporada', old.temporada, new.temporada, v_actor);
  return new;
end;
$fn$;

revoke all on function retail.fn_historial_temporada_producto() from public;

create or replace trigger productos_temporada_historial
  after update of temporada on retail.productos
  for each row when (old.temporada is distinct from new.temporada)
  execute function retail.fn_historial_temporada_producto();


-- ============================================================================
-- PARTE 3 de 6 · La temporada por defecto de cada categoría (tabla en uso: va sola)
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

alter table retail.categorias add column if not exists temporada text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'categorias_temporada_fk'
                  and conrelid = 'retail.categorias'::regclass) then
    alter table retail.categorias
      add constraint categorias_temporada_fk foreign key (temporada) references retail.temporadas (clave);
  end if;
end $$;

comment on column retail.categorias.temporada is
  'ADR-0246: temporada por defecto de las prendas de esta categoría («Ropa de baño» → verano). La de la prenda (o la de su color) manda. Una subcategoría no hereda la de su categoría padre.';


-- ============================================================================
-- PARTE 4 de 6 · La excepción por color (tabla nueva con llaves hacia productos, colores y temporadas)
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- Por modelo+color y no por variante: una variante es talla×color, y la M y la L del mismo color no pueden ser de
-- temporadas distintas; además, una talla nueva nacería sin la excepción.
create table if not exists retail.producto_color_temporadas (
  producto_id uuid not null references retail.productos (id) on delete cascade,
  color_codigo text not null references retail.colores (codigo),
  temporada text not null references retail.temporadas (clave),
  asignado_por uuid references public.personas (id),
  asignado_en timestamptz not null default now(),
  primary key (producto_id, color_codigo)
);

comment on table retail.producto_color_temporadas is
  'ADR-0246: un color con otra temporada que la de su modelo (un color de invierno en un modelo de verano). Una fila por modelo+color; se escribe con `asignar_temporadas`.';

create or replace function retail.fn_producto_color_temporada_valida()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $fn$
begin
  if not exists (select 1 from retail.variantes v where v.producto_id = new.producto_id and v.color_codigo = new.color_codigo) then
    raise exception 'Ese color no es de esta prenda.' using hint = 'color_no_es_de_la_prenda';
  end if;
  return new;
end;
$fn$;

create or replace trigger producto_color_temporadas_valida
  before insert or update on retail.producto_color_temporadas
  for each row execute function retail.fn_producto_color_temporada_valida();

-- Como el resto del catálogo: la copia sin conexión sabe que algo cambió.
create or replace trigger catalogo_version_cambio
  after insert or update or delete or truncate on retail.producto_color_temporadas
  for each statement execute function retail.fn_catalogo_cambio();

alter table retail.producto_color_temporadas enable row level security;
revoke all on table retail.producto_color_temporadas from public, anon, authenticated;


-- ============================================================================
-- PARTE 5 de 6 · Las funciones (no toman candados de tablas en uso)
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- La lista, en su orden. La pantalla la usa para el desplegable y para mostrar el nombre de cada clave.
create or replace function retail.fn_temporadas()
returns table (clave text, nombre text, orden smallint, es_clasico boolean, estacion_desde text, estacion_hasta text, mitad text)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select t.clave, t.nombre, t.orden, t.es_clasico, t.estacion_desde, t.estacion_hasta, t.mitad
    from retail.temporadas t
   order by t.orden;
$$;

-- El calendario con el fin de cada estación (el inicio de la siguiente) y si el líder todavía puede correrla: la
-- regla de edición vive aquí y la pantalla solo la lee.
create or replace function retail.fn_calendario_estaciones()
returns table (anio smallint, estacion text, inicio timestamptz, hasta timestamptz, fuente text, editable boolean, en_curso boolean)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select f.anio, f.estacion, f.inicio,
         lead(f.inicio) over (order by f.inicio) as hasta,
         f.fuente,
         f.inicio > now()
           and f.anio between extract(year from now() at time zone 'America/Lima')::integer
                          and extract(year from now() at time zone 'America/Lima')::integer + 1 as editable,
         f.inicio <= now() and coalesce(lead(f.inicio) over (order by f.inicio) > now(), true) as en_curso
    from retail.temporada_fechas f
   order by f.inicio;
$$;

-- LA regla de qué temporada tiene cada prenda (modelo+color): el color manda, luego el producto, luego su categoría.
-- Una sola definición, para la pantalla, la lista «Sin temporada» y Frescura. Excluye la «Prenda sin registrar».
create or replace function retail.fn_temporada_efectiva(p_producto_id uuid default null)
returns table (producto_id uuid, color_codigo text, estado text, temporada text, origen text)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select pc.producto_id,
         pc.color_codigo,
         p.estado,
         coalesce(pct.temporada, p.temporada, c.temporada) as temporada,
         case when pct.temporada is not null then 'color'
              when p.temporada is not null then 'producto'
              when c.temporada is not null then 'categoria' end as origen
    from (select distinct v.producto_id, v.color_codigo
            from retail.variantes v
           where v.activo
             and (p_producto_id is null or v.producto_id = p_producto_id)) pc
    join retail.productos p on p.id = pc.producto_id
    left join retail.categorias c on c.id = p.categoria_id
    left join retail.producto_color_temporadas pct
           on pct.producto_id = pc.producto_id and pct.color_codigo = pc.color_codigo
   where p.id <> '11111111-1111-4111-8111-111111111111'::uuid;
$$;

-- A qué aparición de su temporada pertenece una prenda que llegó en `p_fecha`: la que la contiene; si llegó fuera, la
-- más cercana en el tiempo (a igual distancia, la anterior). Sin filas para «Clásico · todo el año» o si el calendario
-- no alcanza. `hasta` null = la aparición sigue abierta más allá del calendario.
create or replace function retail.fn_ocurrencia_temporada(p_temporada text, p_fecha timestamptz)
returns table (desde timestamptz, hasta timestamptz)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  with t as (
    select estacion_desde, estacion_hasta from retail.temporadas where clave = p_temporada and estacion_desde is not null
  ), apariciones as (
    select f.inicio as desde,
           (select min(f2.inicio) from retail.temporada_fechas f2
             where f2.estacion = t.estacion_hasta and f2.inicio > f.inicio) as hasta
      from retail.temporada_fechas f, t
     where f.estacion = t.estacion_desde
  )
  select a.desde, a.hasta
    from apariciones a
   order by greatest(extract(epoch from (a.desde - p_fecha)),
                     case when a.hasta is null then 0 else extract(epoch from (p_fecha - a.hasta)) end,
                     0),
            a.desde
   limit 1;
$$;

-- Correr la fecha de una o más estaciones que todavía no empezaron, o agregar el año siguiente entero: TODO O NADA.
-- `p_fechas`: [{anio, estacion, inicio, fuente?}] (1 a 8). Solo el líder: esas fechas cambian los avisos de las 3 sedes
-- (Felipe: «líder y administradores»; un Admin es Líder aquí, ADR-0178). El orden del ciclo se revisa con todas las
-- fechas ya escritas (disparador diferido), así que correr dos estaciones juntas no choca a mitad de camino.
create or replace function retail.fijar_fechas_temporada(p_fechas jsonb)
returns integer
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_anio_hoy integer := extract(year from now() at time zone 'America/Lima')::integer;
  v_actor uuid;
  v_f record;
  v_n integer := 0;
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo el líder puede cambiar el calendario de temporadas.' using errcode = '42501', hint = 'calendario_sin_permiso';
  end if;
  if jsonb_typeof(p_fechas) is distinct from 'array' or jsonb_array_length(p_fechas) not between 1 and 8 then
    raise exception 'Faltan las fechas (de 1 a 8).' using hint = 'calendario_sin_fechas';
  end if;

  v_actor := retail.fn_actor_persona_id(true);

  for v_f in
    select (x ->> 'anio')::integer as anio,
           x ->> 'estacion' as estacion,
           (x ->> 'inicio')::timestamptz as inicio,
           coalesce(nullif(x ->> 'fuente', ''), 'ajustada') as fuente
      from jsonb_array_elements(p_fechas) x
     order by (x ->> 'inicio')::timestamptz
  loop
    if v_f.anio is null or v_f.anio < v_anio_hoy or v_f.anio > v_anio_hoy + 1 then
      raise exception 'Solo se ajusta el calendario de este año o del siguiente.' using hint = 'calendario_fuera_de_rango';
    end if;
    if v_f.inicio is null or v_f.inicio <= now() then
      raise exception 'La nueva fecha tiene que ser futura: lo que ya empezó queda fijo.' using hint = 'calendario_pasado';
    end if;
    if v_f.fuente not in ('senamhi', 'usno', 'ajustada') then
      raise exception 'Fuente desconocida: senamhi, usno o ajustada.' using hint = 'calendario_fuente';
    end if;

    insert into retail.temporada_fechas (anio, estacion, inicio, fuente, actualizado_por, actualizado_en)
    values (v_f.anio, v_f.estacion, v_f.inicio, v_f.fuente, v_actor, now())
    on conflict (anio, estacion) do update
      set inicio = excluded.inicio, fuente = excluded.fuente,
          actualizado_por = excluded.actualizado_por, actualizado_en = excluded.actualizado_en;
    v_n := v_n + 1;
  end loop;

  -- El orden, ahora (con todas las fechas escritas), para responder con su motivo en vez de fallar al confirmar.
  set constraints retail.temporada_fechas_orden immediate;
  return v_n;
end;
$$;

-- Asignar temporada a prendas (y a sus colores), todo o nada. Cada ítem: {producto_id, temporada?, colores?}.
--   · Sin la clave «temporada», no toca la del producto; «temporada»: null o "" la deja vacía (hereda su categoría).
--   · «colores»: {CODIGO: clave} pone la excepción de ese color; {CODIGO: null} la quita (vuelve a la del producto).
--   · `p_solo_sin_temporada`: la asignación en lote de la lista «Sin temporada». Una prenda que desde que se cargó la
--     lista recibió temporada (propia o de su categoría) se salta en vez de pisarse; lo decide la base con la fila ya
--     bloqueada, así que no hay ventana entre mirar y escribir. Las saltadas no suman al resultado.
-- Permiso: quien edita el catálogo (Felipe, 2026-09-26). Firma el responsable del combo (ADR-0161/0162).
create or replace function retail.asignar_temporadas(p_items jsonb, p_solo_sin_temporada boolean default false)
returns integer
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_item jsonb;
  v_producto uuid;
  v_temporada text;
  v_color record;
  v_anterior text;
  v_cambios integer := 0;
  v_filas integer;
  v_actor uuid;
begin
  if not retail.fn_puede_editar_catalogo() then
    raise exception 'No tienes permiso para cambiar la temporada de las prendas.' using errcode = '42501', hint = 'temporada_sin_permiso';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'No hay prendas para asignar.' using hint = 'temporada_sin_items';
  end if;
  if jsonb_array_length(p_items) > 500 then
    raise exception 'Son demasiadas prendas de una vez (máximo 500).' using hint = 'temporada_demasiadas';
  end if;

  v_actor := retail.fn_actor_persona_id(true);

  -- Candados en orden de id: dos asignaciones en lote que se cruzan se ponen en fila, no se traban.
  perform 1 from retail.productos p
   where p.id in (select (i ->> 'producto_id')::uuid from jsonb_array_elements(p_items) i)
   order by p.id
   for update;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_producto := (v_item ->> 'producto_id')::uuid;
    if v_producto is null or not exists (select 1 from retail.productos where id = v_producto) then
      raise exception 'Una de las prendas ya no existe. No se cambió nada.' using hint = 'temporada_producto_inexistente';
    end if;

    if v_item ? 'temporada' then
      v_temporada := nullif(btrim(coalesce(v_item ->> 'temporada', '')), '');
      update retail.productos p set temporada = v_temporada
       where p.id = v_producto and p.temporada is distinct from v_temporada
         and (not p_solo_sin_temporada or (
               p.temporada is null
               and not exists (select 1 from retail.categorias c where c.id = p.categoria_id and c.temporada is not null)));
      get diagnostics v_filas = row_count;
      v_cambios := v_cambios + v_filas;
    end if;

    if jsonb_typeof(v_item -> 'colores') = 'object' then
      for v_color in select key as codigo, nullif(btrim(coalesce(value #>> '{}', '')), '') as temporada
                       from jsonb_each(v_item -> 'colores') loop
        select pct.temporada into v_anterior
          from retail.producto_color_temporadas pct
         where pct.producto_id = v_producto and pct.color_codigo = v_color.codigo;

        if v_color.temporada is null then
          delete from retail.producto_color_temporadas
           where producto_id = v_producto and color_codigo = v_color.codigo;
        else
          insert into retail.producto_color_temporadas (producto_id, color_codigo, temporada, asignado_por, asignado_en)
          values (v_producto, v_color.codigo, v_color.temporada, v_actor, now())
          on conflict (producto_id, color_codigo) do update
            set temporada = excluded.temporada, asignado_por = excluded.asignado_por, asignado_en = excluded.asignado_en
            where retail.producto_color_temporadas.temporada is distinct from excluded.temporada;
        end if;

        if v_anterior is distinct from v_color.temporada then
          insert into retail.historial_producto_cambios (entidad, entidad_id, campo, valor_anterior, valor_nuevo, usuario_id)
          values ('producto', v_producto, 'temporada:' || v_color.codigo, v_anterior, v_color.temporada, v_actor);
          v_cambios := v_cambios + 1;
        end if;
      end loop;
    end if;
  end loop;

  return v_cambios;
end;
$$;

-- La temporada por defecto de una categoría. Mismo permiso que el resto del catálogo.
create or replace function retail.asignar_temporada_categoria(p_categoria_id uuid, p_temporada text)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_temporada text := nullif(btrim(coalesce(p_temporada, '')), '');
begin
  if not retail.fn_puede_editar_catalogo() then
    raise exception 'No tienes permiso para cambiar la temporada de las categorías.' using errcode = '42501', hint = 'temporada_sin_permiso';
  end if;
  perform retail.fn_actor_persona_id(true);
  update retail.categorias set temporada = v_temporada
   where id = p_categoria_id and temporada is distinct from v_temporada;
  if not found and not exists (select 1 from retail.categorias where id = p_categoria_id) then
    raise exception 'Esa categoría ya no existe.' using hint = 'temporada_categoria_inexistente';
  end if;
end;
$$;

-- El alta de la pantalla (ADR-0212) suma `p_temporada` al final. Guarda: su cuerpo vivo tiene que ser el de
-- 20260926130000 (sin parches en vivo); si no, se aborta sin tocar nada.
do $$
declare
  v_md5 text;
begin
  if to_regprocedure('retail.crear_producto_con_stock_inicial(text, uuid, jsonb, text, uuid, uuid, uuid, boolean, uuid[], uuid, uuid, uuid, boolean, text)') is not null then
    return;  -- ya se pegó: pegarla otra vez no cambia nada
  end if;
  select md5(p.prosrc) into v_md5 from pg_proc p
   where p.oid = to_regprocedure('retail.crear_producto_con_stock_inicial(text, uuid, jsonb, text, uuid, uuid, uuid, boolean, uuid[], uuid, uuid, uuid, boolean)');
  if v_md5 is null then
    raise exception 'Falta crear_producto_con_stock_inicial: pega antes 20260926130000_alta_producto_con_stock_inicial.sql';
  end if;
  if v_md5 <> '5eb22cb78bc5574e6a28d3c60879d93f' then
    raise exception 'crear_producto_con_stock_inicial cambió desde que se escribió esta migración (md5 %). Alguien la parchó en vivo: reescribe esta parte desde su definición real.', v_md5;
  end if;
  drop function retail.crear_producto_con_stock_inicial(text, uuid, jsonb, text, uuid, uuid, uuid, boolean, uuid[], uuid, uuid, uuid, boolean);
end $$;

create or replace function retail.crear_producto_con_stock_inicial(
  p_referencia text,
  p_categoria_id uuid,
  p_variantes jsonb,
  p_descripcion text default null,
  p_token uuid default null,
  p_tejido_id uuid default null,
  p_patron_id uuid default null,
  p_confirmo_distinto boolean default false,
  p_etiqueta_ids uuid[] default null,
  p_marca_id uuid default null,
  p_proveedor_id uuid default null,
  p_ubicacion_id uuid default null,
  p_al_piso boolean default false,
  p_temporada text default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_reintento boolean;
  v_producto uuid;
  v_items jsonb;
  v_con_cantidad integer;
begin
  -- 1. Las cantidades bien escritas ANTES de crear nada: el mensaje habla de cantidades, no de otra cosa.
  --    Sin la clave, null, "" o 0 = sin stock en esa celda (la variante se crea igual).
  if jsonb_typeof(p_variantes) = 'array' and exists (
    select 1 from jsonb_array_elements(p_variantes) i
     where jsonb_typeof(i) = 'object'
       and coalesce(i ->> 'cantidad', '') !~ '^[0-9]{0,4}$'
  ) then
    raise exception 'Cada cantidad tiene que ser un número entero de 0 a 9999.' using hint = 'carga_cantidad_invalida';
  end if;

  -- 2. ¿Es un reintento del mismo intento? Si el producto de este token ya existe, su stock entró con él en la misma
  --    transacción: se devuelve sin volver a cargar (un doble clic no duplica las unidades). Dos llegadas SIMULTÁNEAS
  --    del mismo intento (la red reintenta) se ponen en fila con el candado del token (ADR-0190): la segunda espera a la
  --    primera y encuentra su producto, en vez de chocar con el índice único y mostrar un error de algo que sí se guardó.
  if p_token is not null then
    perform pg_advisory_xact_lock(hashtextextended('productos:' || p_token::text, 0));
  end if;
  v_reintento := p_token is not null and exists (select 1 from productos where token_cliente = p_token);

  -- 3. El producto y sus variantes, con la función de siempre (sus candados: nombre único, marca y proveedor, tallas de
  --    la categoría, tejido y patrón, permisos de catálogo). Si algo de eso falla, no se carga nada.
  v_producto := crear_producto_con_variantes(p_referencia, p_categoria_id, p_variantes, p_descripcion, p_token,
    p_tejido_id, p_patron_id, p_confirmo_distinto, p_etiqueta_ids, p_marca_id, p_proveedor_id);
  if v_reintento then
    return v_producto;
  end if;

  -- 3b. ADR-0246: la temporada elegida en el alta (opcional; vacía = hereda la de su categoría). Una clave que no está
  --     en la lista la rechaza la llave foránea y no se crea nada.
  if nullif(btrim(coalesce(p_temporada, '')), '') is not null then
    update productos set temporada = btrim(p_temporada) where id = v_producto;
  end if;

  -- 4. Cada cantidad con el id de la variante que acaba de nacer (la celda se reconoce por su talla y su color).
  select jsonb_agg(jsonb_build_object('variante_id', v.id, 'cantidad', (i ->> 'cantidad')::integer) order by v.id)
    into v_items
    from jsonb_array_elements(p_variantes) i
    join variantes v
      on v.producto_id = v_producto
     and v.talla_id is not distinct from nullif(i ->> 'talla_id', '')::uuid
     and v.color_codigo is not distinct from nullif(btrim(i ->> 'color_codigo'), '')
   where coalesce(nullif(i ->> 'cantidad', ''), '0')::integer > 0;

  select count(*) into v_con_cantidad
    from jsonb_array_elements(p_variantes) i
   where coalesce(nullif(i ->> 'cantidad', ''), '0')::integer > 0;
  if coalesce(jsonb_array_length(v_items), 0) <> v_con_cantidad then
    -- Nunca debería pasar (las variantes se acaban de crear con esas mismas tallas y colores); si pasa, no se pierde
    -- una cantidad en silencio: no se crea nada.
    raise exception 'No se encontró la variante de una de las cantidades. No se creó el producto: vuelve a intentarlo.'
      using hint = 'carga_sin_variante';
  end if;

  if v_items is null then
    return v_producto;  -- «todavía no tengo unidades»: el alta de siempre
  end if;

  -- 5. La carga al almacén de la tienda y, si ya están colgadas, su bajada al piso (misma transacción).
  perform fn_cargar_stock_inicial(p_ubicacion_id, v_items, 'Lo que ya había en tienda, cargado al crear el producto');
  if p_al_piso then
    perform bajar_al_piso(p_ubicacion_id, v_items, coalesce(p_token, gen_random_uuid()));
  end if;

  return v_producto;
end;
$$;

comment on function retail.crear_producto_con_stock_inicial(text, uuid, jsonb, text, uuid, uuid, uuid, boolean, uuid[], uuid, uuid, uuid, boolean, text) is
  'ADR-0212: crear_producto_con_variantes + la carga inicial de lo que ya hay en tienda, todo o nada. Cada ítem de p_variantes acepta «cantidad» (0..9999, vacío = 0). Con cantidades: p_ubicacion_id obligatorio (la tienda donde está el stock); p_al_piso = true las deja en el piso con una bajada (pide el módulo «Bajada al piso»). Mismo token = mismo producto y su stock no se vuelve a cargar. ADR-0246: p_temporada (opcional) es una clave de `retail.temporadas`.';

revoke all on function retail.fn_temporadas() from public, anon;
revoke all on function retail.fn_calendario_estaciones() from public, anon;
revoke all on function retail.fn_temporada_efectiva(uuid) from public, anon;
revoke all on function retail.fn_ocurrencia_temporada(text, timestamptz) from public, anon;
revoke all on function retail.fijar_fechas_temporada(jsonb) from public, anon;
revoke all on function retail.asignar_temporadas(jsonb, boolean) from public, anon;
revoke all on function retail.asignar_temporada_categoria(uuid, text) from public, anon;
revoke all on function retail.crear_producto_con_stock_inicial(text, uuid, jsonb, text, uuid, uuid, uuid, boolean, uuid[], uuid, uuid, uuid, boolean, text) from public, anon;
grant execute on function retail.fn_temporadas() to authenticated;
grant execute on function retail.fn_calendario_estaciones() to authenticated;
grant execute on function retail.fn_temporada_efectiva(uuid) to authenticated;
grant execute on function retail.fn_ocurrencia_temporada(text, timestamptz) to authenticated;
grant execute on function retail.fijar_fechas_temporada(jsonb) to authenticated;
grant execute on function retail.asignar_temporadas(jsonb, boolean) to authenticated;
grant execute on function retail.asignar_temporada_categoria(uuid, text) to authenticated;
grant execute on function retail.crear_producto_con_stock_inicial(text, uuid, jsonb, text, uuid, uuid, uuid, boolean, uuid[], uuid, uuid, uuid, boolean, text) to authenticated;

notify pgrst, 'reload schema';


-- ============================================================================
-- PARTE 6 de 6 · Verificación (solo lectura): debe decir 9 temporadas, 12 fechas, 3 llaves hacia la lista (producto,
-- categoría y color) y 1 sola versión del alta.
-- ============================================================================
select (select count(*) from retail.temporadas) as temporadas,
       (select count(*) from retail.temporada_fechas) as fechas,
       (select count(*) from pg_constraint
         where contype = 'f' and confrelid = 'retail.temporadas'::regclass) as llaves_a_la_lista,
       (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace
           and proname = 'crear_producto_con_stock_inicial') as firmas_del_alta;
