-- ADR-0637, actividad 1: el banco manda. El ERP guarda cada línea del extracto y dice «el banco dice / el ERP dice».
--
-- EL PROBLEMA. El saldo de un banco en el ERP es lo que alguien anotó a mano (`fn_dinero_libro`): nada lo prueba contra el banco. El
-- extracto se leía en el navegador para emparejar los depósitos de las máquinas y se tiraba; al otro día había que subirlo de nuevo y
-- nadie podía decir «al día D el banco tenía X y el ERP Y».
--
-- LO QUE SE AGREGA (solo agrega: ninguna tabla ni función de plata cambia, y nada de esto crea un movimiento de dinero):
--   1. `banco_cortes`: el «partir de hoy» de un banco (el día cuyo cierre es el punto de partida). Aquí nace vacía y solo se lee; la
--      escribe la actividad del corte.
--   2. `banco_cargas`: una subida de extracto (quién, cuándo, de qué fecha a qué fecha, cuántas líneas trajo y qué pasó con ellas).
--   3. `banco_lineas`: cada línea, tal como la dijo el banco. Solo se agregan: una línea que el banco ya confirmó (firme) no cambia
--      jamás; una provisional solo cambia para retirarse cuando una carga posterior la confirma o deja de traerla.
--   4. `cargar_lineas_banco`: guarda un extracto sin duplicar. La identidad de cada línea la calcula la base, no el navegador.
--   5. `fn_banco_cuadre`: lo que dice el banco, lo que dice el ERP al mismo día (la fórmula de siempre, `saldo_inicial + Σ libro`) y la
--      diferencia.
--
-- LA IDENTIDAD DE UNA LÍNEA.
--   · Firme (el banco ya la procesó): `ibk:<AAAAMMDD de proceso>:<correlativo>`. No cambia entre descargas.
--   · No firme (provisional del archivo, o la tabla pegada de la web, que no trae correlativo):
--     `sin:<AAAAMMDD>:<monto en céntimos, con signo>:<glosa en mayúsculas y sin espacios de más>:<operación o ->:<k>`, con k = su número entre
--     las iguales de ese día.
--
-- CÓMO NO SE DUPLICA. Una carga dice la verdad de su rango de fechas: las provisionales vigentes de ese rango se retiran y entra lo que
-- el archivo trae. Una firme repetida se reconoce por su identidad. Una no firme entra solo si FALTA: por cada grupo (día, monto, glosa,
-- operación) se comparan las líneas del archivo contra las firmes que ya hay; así, volver a subir un archivo viejo cuyas provisionales ya
-- se confirmaron no duplica nada, y dos pagos idénticos del mismo día siguen siendo dos.
--
-- LO QUE CUENTA UNA CARGA. Cada línea del archivo es `nueva` (el banco no la había dicho), `repetida` (ya estaba: la misma firme, una no
-- firme que ya está cubierta, o una provisional que vuelve a venir igual y se renueva) o `confirmada` (estaba provisional y ahora viene
-- procesada). Aparte se cuentan las provisionales que el banco dejó de traer (retiradas sin sucesora).
--
-- UNA SOLA CLASE DE FUENTE POR DÍA. La tabla copiada de la web no trae el número de cada línea: sobre un día que ya tiene líneas firmes
-- del archivo no entra (se duplicarían). Al revés sí: el archivo retira las líneas pegadas de su rango y pone las suyas.
--
-- LA TABLA PEGADA SOLO AGREGA O REPITE. Una tabla copiada puede empezar o terminar a mitad de un día (la web del banco la pagina): si
-- retirara lo que no trae, se llevaría líneas que el banco sí tiene y el punto de partida se correría sin que nada lo delate. Por eso, si
-- a lo pegado le falta una línea que ya estaba por confirmar en esos días, no entra nada y se dice. Quitar una línea que el banco dejó de
-- traer solo lo hace el archivo (.txt), que sí trae los días completos.
--
-- DE QUÉ CUENTA ES EL ARCHIVO. Una línea firme no se retira ni se borra jamás: el archivo de OTRA cuenta guardado aquí no tendría vuelta
-- atrás. El .txt dice en cada renglón de qué cuenta es; ese número viaja con la carga (`banco_cargas.cuenta_archivo`) y la carga se
-- rechaza si no es el de las cargas anteriores de esta cuenta o si no termina como el número que la cuenta tiene anotado
-- (`cuentas_dinero.numero`, sus últimas 4 cifras). La primera carga de una cuenta SIN número anotado solo la protege la pantalla, que
-- muestra en qué termina la cuenta del archivo antes de guardar.
--
-- LÍMITE CONOCIDO. La base no sabe cuál de dos descargas es la más nueva: subir un archivo MÁS VIEJO retira las provisionales más nuevas
-- de su rango (y vuelve a poner las suyas). No duplica ni toca las firmes, no cambia el saldo del banco (las provisionales se leen por
-- su día, no por la hora en que se subieron) y se corrige solo al subir el archivo más nuevo.
--
-- Sin políticas: las tres tablas solo se leen y escriben por funciones `security definer` (regla de «Políticas y deadlocks»). Se pega en
-- UNA sola parte: no hay `alter` de tablas en uso, ni `create policy`, ni `drop trigger`.

set lock_timeout = '3s';

-- ---------- 1. La glosa, para comparar ----------
create or replace function retail.fn_banco_glosa(p_descripcion text)
returns text
language sql immutable set search_path = retail, public, extensions as $$
  select upper(btrim(regexp_replace(coalesce(p_descripcion, ''), '\s+', ' ', 'g')));
$$;
comment on function retail.fn_banco_glosa(text) is
  'ADR-0637: la glosa de una línea del banco para compararla con otra: en mayúsculas, con los espacios seguidos vueltos uno y sin espacios al borde.';
revoke all on function retail.fn_banco_glosa(text) from public, anon, authenticated;

-- Un TRUNCATE salta los disparadores por fila: sin esto, vaciar una de las tres tablas borraría lo que dijo el banco sin dejar rastro.
create or replace function retail.fn_banco_sin_truncate() returns trigger
language plpgsql set search_path = retail, public, extensions as $$
begin
  raise exception 'Lo que dijo el banco no se vacía: las líneas, las subidas y los cortes quedan como pasaron.' using errcode = 'P0001';
end $$;
revoke all on function retail.fn_banco_sin_truncate() from public, anon, authenticated;

-- ---------- 2. El corte: desde qué día manda el banco ----------
create table if not exists retail.banco_cortes (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references retail.cuentas_dinero (id),
  -- El día cuyo CIERRE es el corte: el banco manda desde el día siguiente.
  fecha date not null,
  -- Lo que decía el banco al cierre de ese día.
  saldo_banco numeric(12,2) not null,
  nota text check (nota is null or char_length(nota) <= 300),
  estado text not null default 'vigente' check (estado in ('vigente', 'anulado')),
  motivo_anulacion text check (motivo_anulacion is null or char_length(motivo_anulacion) <= 300),
  anulado_por uuid references public.personas (id),
  anulado_en timestamptz,
  registrado_por uuid not null references public.personas (id),
  token_cliente uuid not null unique,
  created_at timestamptz not null default now(),
  constraint banco_cortes_anulacion check (
    (estado = 'vigente' and motivo_anulacion is null and anulado_por is null and anulado_en is null)
    or (estado = 'anulado' and motivo_anulacion is not null and trim(motivo_anulacion) <> '' and anulado_en is not null)
  ),
  constraint banco_cortes_montos_finitos check (abs(saldo_banco) < 'Infinity')
);
comment on table retail.banco_cortes is
  'ADR-0637: el «partir de hoy» de un banco. Lo anterior al corte es historia: se guarda si viene en un archivo, pero no se cuadra. Se anula con motivo, no se edita ni se borra.';
comment on column retail.banco_cortes.fecha is 'El día cuyo CIERRE es el corte: el banco manda desde el día siguiente.';
comment on column retail.banco_cortes.saldo_banco is 'Lo que decía el banco al cierre de ese día.';
create unique index if not exists banco_cortes_vigente_uq on retail.banco_cortes (cuenta_id, fecha) where estado = 'vigente';
alter table retail.banco_cortes enable row level security;
revoke all on table retail.banco_cortes from anon, authenticated;

create or replace function retail.fn_banco_cortes_solo_anular() returns trigger
language plpgsql set search_path = retail, public, extensions as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Un corte del banco no se borra: se anula con un motivo.' using errcode = 'P0001';
  end if;
  if old.estado = 'anulado' or new.estado <> 'anulado'
     or (new.id, new.cuenta_id, new.fecha, new.saldo_banco, new.nota, new.registrado_por, new.token_cliente, new.created_at)
        is distinct from (old.id, old.cuenta_id, old.fecha, old.saldo_banco, old.nota, old.registrado_por, old.token_cliente, old.created_at) then
    raise exception 'Un corte del banco no se edita: se anula y se anota de nuevo.' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function retail.fn_banco_cortes_solo_anular() from public, anon, authenticated;
create or replace trigger banco_cortes_solo_anular before update or delete on retail.banco_cortes
  for each row execute function retail.fn_banco_cortes_solo_anular();
create or replace trigger banco_cortes_sin_truncate before truncate on retail.banco_cortes
  for each statement execute function retail.fn_banco_sin_truncate();

-- ---------- 3. Una subida de extracto ----------
create table if not exists retail.banco_cargas (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references retail.cuentas_dinero (id),
  -- De dónde salió: el archivo .txt de Interbank o la tabla de movimientos copiada de la web del banco.
  fuente text not null check (fuente in ('ibk_txt', 'tabla_web')),
  -- El rango de fechas de operación que trajo: de ese rango, esta carga dice la verdad.
  desde date not null,
  hasta date not null,
  -- Qué pasó con sus líneas. `nuevas`: el banco no las había dicho antes. `repetidas`: ya estaban. `confirmadas`: estaban como
  -- provisionales y esta carga las trajo ya procesadas. Las tres suman `lineas`.
  lineas integer not null check (lineas between 1 and 5000),
  nuevas integer not null check (nuevas >= 0),
  repetidas integer not null check (repetidas >= 0),
  confirmadas integer not null check (confirmadas >= 0),
  -- La huella (sha-256, en hexadecimal) del texto subido: para decir «este archivo ya lo subiste».
  huella_archivo text not null check (huella_archivo ~ '^[0-9a-f]{64}$'),
  -- El número de cuenta que dice el archivo en cada renglón (solo cifras, sin los ceros de la izquierda). La tabla pegada no lo trae.
  cuenta_archivo text check (cuenta_archivo ~ '^[0-9]{4,34}$'),
  subido_por uuid not null references public.personas (id),
  token_cliente uuid not null unique,
  -- La hora real de la subida (no la de inicio de la transacción): dos cargas siempre tienen un orden.
  created_at timestamptz not null default clock_timestamp(),
  constraint banco_cargas_rango check (desde <= hasta),
  constraint banco_cargas_cuentas check (lineas = nuevas + repetidas + confirmadas),
  constraint banco_cargas_cuenta_del_archivo check ((fuente = 'ibk_txt') = (cuenta_archivo is not null))
);
comment on table retail.banco_cargas is
  'ADR-0637: una subida de extracto de un banco (quién, cuándo, de qué fecha a qué fecha y qué pasó con sus líneas). No se edita ni se borra.';
comment on column retail.banco_cargas.nuevas is 'Líneas que el banco no había dicho antes en esta cuenta.';
comment on column retail.banco_cargas.repetidas is 'Líneas que ya estaban guardadas (la misma firme, o una no firme que ya estaba cubierta o se renovó).';
comment on column retail.banco_cargas.confirmadas is 'Líneas que estaban como provisionales y esta carga trajo ya procesadas por el banco.';
comment on column retail.banco_cargas.huella_archivo is 'sha-256 del texto subido, en hexadecimal (64): para reconocer el mismo archivo.';
comment on column retail.banco_cargas.cuenta_archivo is 'El número de cuenta que dice el archivo (solo cifras, sin ceros a la izquierda): todas las cargas de una cuenta tienen que decir el mismo. Vacío en la tabla pegada, que no lo trae.';
create index if not exists banco_cargas_cuenta_idx on retail.banco_cargas (cuenta_id, created_at desc);
alter table retail.banco_cargas enable row level security;
revoke all on table retail.banco_cargas from anon, authenticated;

create or replace function retail.fn_banco_cargas_inmutable() returns trigger
language plpgsql set search_path = retail, public, extensions as $$
begin
  raise exception 'La subida de un extracto no se edita ni se borra: queda como pasó.' using errcode = 'P0001';
end $$;
revoke all on function retail.fn_banco_cargas_inmutable() from public, anon, authenticated;
create or replace trigger banco_cargas_inmutable before update or delete on retail.banco_cargas
  for each row execute function retail.fn_banco_cargas_inmutable();
create or replace trigger banco_cargas_sin_truncate before truncate on retail.banco_cargas
  for each statement execute function retail.fn_banco_sin_truncate();

-- ---------- 4. Las líneas, tal como las dijo el banco ----------
create table if not exists retail.banco_lineas (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references retail.cuentas_dinero (id),
  carga_id uuid not null references retail.banco_cargas (id),
  identidad text not null check (char_length(identidad) <= 300),
  -- Fecha de operación (el día que pasó). `fecha_proceso` es el día que el banco la procesó: un sábado se procesa el lunes.
  fecha date not null,
  fecha_proceso date,
  correlativo text check (correlativo is null or char_length(correlativo) <= 30),
  codigo text check (codigo is null or char_length(codigo) <= 20),
  operacion text check (operacion is null or char_length(operacion) <= 40),
  descripcion text not null check (trim(descripcion) <> '' and char_length(descripcion) <= 120),
  -- Con signo: lo que entra es positivo y lo que sale, negativo.
  monto numeric(12,2) not null check (monto <> 0),
  -- El saldo después de la línea; nulo si la forma de traerla no lo dice.
  saldo numeric(12,2),
  -- Su posición dentro de su carga (0 = la más vieja).
  orden integer not null check (orden >= 0),
  -- Verdadero si la identidad la dio el banco (correlativo definitivo). Una firme no cambia jamás.
  firme boolean not null,
  -- Una provisional se retira cuando una carga posterior la confirma (apunta a su sucesora) o deja de traerla (sin sucesora).
  retirada_en timestamptz,
  retirada_por_carga uuid references retail.banco_cargas (id),
  reemplazada_por uuid references retail.banco_lineas (id),
  created_at timestamptz not null default now(),
  constraint banco_lineas_firme_con_identidad check (firme = false or (fecha_proceso is not null and correlativo is not null)),
  constraint banco_lineas_firme_no_se_retira check (not (firme and retirada_en is not null)),
  -- El banco procesa una línea el día que pasó o después (un sábado, el lunes): nunca antes.
  constraint banco_lineas_proceso_tras_operacion check (not firme or fecha_proceso >= fecha),
  constraint banco_lineas_retiro_completo check ((retirada_en is null) = (retirada_por_carga is null)),
  constraint banco_lineas_sucesora_de_retirada check (reemplazada_por is null or (retirada_en is not null and reemplazada_por <> id)),
  -- Mismo par que `movimientos_dinero` (20261015002000): `NaN` es mayor que todo y pasaría el tope; Postgres mira los candados por
  -- nombre y `_monto_con_tope` va antes que `_montos_finitos`, así que el tope lo deja pasar y el de finitos lo frena.
  constraint banco_lineas_monto_con_tope check (abs(monto) <= 1000000 or monto = 'NaN'),
  constraint banco_lineas_montos_finitos check (abs(monto) < 'Infinity' and (saldo is null or abs(saldo) < 'Infinity'))
);
comment on table retail.banco_lineas is
  'ADR-0637: cada línea del extracto de un banco, tal como la dijo el banco. Solo se agregan: una firme no cambia jamás y una provisional solo cambia para retirarse. No es el libro: el saldo del ERP sigue saliendo de fn_dinero_libro.';
comment on column retail.banco_lineas.identidad is
  'Lo que hace única a la línea en su cuenta. Firme: ibk:<proceso>:<correlativo>. No firme: sin:<fecha>:<céntimos>:<glosa>:<operación>:<k>. La calcula cargar_lineas_banco.';
comment on column retail.banco_lineas.fecha is 'Fecha de operación (el día que pasó).';
comment on column retail.banco_lineas.fecha_proceso is 'El día que el banco la procesó: un sábado se procesa el lunes.';
comment on column retail.banco_lineas.monto is 'Con signo: lo que entra es positivo, lo que sale es negativo.';
comment on column retail.banco_lineas.saldo is 'El saldo del banco después de la línea; nulo si la forma de traerla no lo dice.';
comment on column retail.banco_lineas.orden is 'Posición dentro de su carga (0 = la más vieja).';
comment on column retail.banco_lineas.firme is 'Verdadero si el banco ya la procesó y su correlativo es definitivo. Una firme no cambia jamás.';
comment on column retail.banco_lineas.reemplazada_por is 'La línea de la carga posterior que ocupa su lugar (la misma, ya confirmada o renovada). Vacío si el banco dejó de traerla.';
create unique index if not exists banco_lineas_identidad_uq on retail.banco_lineas (cuenta_id, identidad) where retirada_en is null;
create index if not exists banco_lineas_cuenta_fecha_idx on retail.banco_lineas (cuenta_id, fecha) where retirada_en is null;
create index if not exists banco_lineas_carga_idx on retail.banco_lineas (carga_id);
create index if not exists banco_lineas_retirada_por_idx on retail.banco_lineas (retirada_por_carga) where retirada_por_carga is not null;
alter table retail.banco_lineas enable row level security;
revoke all on table retail.banco_lineas from anon, authenticated;

create or replace function retail.fn_banco_lineas_solo_agrega() returns trigger
language plpgsql set search_path = retail, public, extensions as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Una línea del extracto no se borra: es lo que dijo el banco.' using errcode = 'P0001';
  end if;
  if old.firme then
    raise exception 'Una línea que el banco ya confirmó no cambia.' using errcode = 'P0001';
  end if;
  -- Lo único que puede pasarle a una provisional: retirarse (y, ya retirada, apuntar a su sucesora). Cada dato se fija una sola vez.
  if (new.id, new.cuenta_id, new.carga_id, new.identidad, new.fecha, new.fecha_proceso, new.correlativo, new.codigo, new.operacion,
      new.descripcion, new.monto, new.saldo, new.orden, new.firme, new.created_at)
       is distinct from
     (old.id, old.cuenta_id, old.carga_id, old.identidad, old.fecha, old.fecha_proceso, old.correlativo, old.codigo, old.operacion,
      old.descripcion, old.monto, old.saldo, old.orden, old.firme, old.created_at)
     or new.retirada_en is null
     or (old.retirada_en is not null and new.retirada_en is distinct from old.retirada_en)
     or (old.retirada_por_carga is not null and new.retirada_por_carga is distinct from old.retirada_por_carga)
     or (old.reemplazada_por is not null and new.reemplazada_por is distinct from old.reemplazada_por) then
    raise exception 'Una línea del extracto solo cambia para retirarse, cuando el banco la confirma o deja de traerla.' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function retail.fn_banco_lineas_solo_agrega() from public, anon, authenticated;
create or replace trigger banco_lineas_solo_agrega before update or delete on retail.banco_lineas
  for each row execute function retail.fn_banco_lineas_solo_agrega();
create or replace trigger banco_lineas_sin_truncate before truncate on retail.banco_lineas
  for each statement execute function retail.fn_banco_sin_truncate();

-- ---------- 5. Lo que devuelve una carga (la misma respuesta la primera vez y en un reintento) ----------
create or replace function retail.fn_banco_carga_resultado(p_carga_id uuid)
returns jsonb
language sql stable set search_path = retail, public, extensions as $$
  select jsonb_build_object(
    'carga_id', k.id, 'lineas', k.lineas, 'nuevas', k.nuevas, 'repetidas', k.repetidas, 'confirmadas', k.confirmadas,
    'retiradas_sin_sucesora', (select count(*) from retail.banco_lineas l where l.retirada_por_carga = k.id and l.reemplazada_por is null),
    'desde', k.desde, 'hasta', k.hasta)
    from retail.banco_cargas k where k.id = p_carga_id;
$$;
comment on function retail.fn_banco_carga_resultado(uuid) is
  'ADR-0637: la respuesta de cargar_lineas_banco para una carga ya guardada. Interna: la usa la carga y su reintento con el mismo token.';
revoke all on function retail.fn_banco_carga_resultado(uuid) from public, anon, authenticated;

-- ---------- 6. Guardar un extracto ----------
create or replace function retail.cargar_lineas_banco(
  p_cuenta_id uuid,
  p_fuente text,
  p_lineas jsonb,
  p_huella_archivo text,
  p_token uuid,
  p_cuenta_archivo text default null
) returns jsonb
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_c retail.cuentas_dinero%rowtype;
  v_previa retail.banco_cargas%rowtype;
  v_actor uuid;
  v_hoy date := retail.fn_hoy_lima();
  v_huella text := lower(btrim(coalesce(p_huella_archivo, '')));
  v_n integer := case when jsonb_typeof(p_lineas) = 'array' then jsonb_array_length(p_lineas) end;
  v_mal text;
  v_desde date;
  v_hasta date;
  -- La cuenta que dice el archivo: solo cifras y sin los ceros de la izquierda, para que dos formas de escribirla sean la misma.
  v_cuenta_archivo text := nullif(ltrim(regexp_replace(coalesce(p_cuenta_archivo, ''), '[^0-9]', '', 'g'), '0'), '');
  v_otra_cuenta text;
  v_numero text;
  v_carga uuid := gen_random_uuid();
  v_ahora timestamptz;
  v_sueltas integer;
  v_entran integer;
  v_confirmadas integer;
  v_renovadas integer;
  v_nuevas integer;
begin
  if not retail.fn_es_lider() then
    raise exception 'Guardar el extracto del banco es solo del líder.' using errcode = 'P0001', hint = 'banco_solo_lider';
  end if;
  if p_token is null then
    raise exception 'Falta la marca del envío: vuelve a leer el archivo y guárdalo de nuevo.' using errcode = 'P0001';
  end if;

  -- Doble clic / reintento: el mismo token devuelve la misma respuesta sin tocar nada. El token sigue al contenido: con otra cuenta u
  -- otro archivo se rechaza.
  perform pg_advisory_xact_lock(hashtextextended('banco_cargas:' || p_token::text, 0));
  select * into v_previa from retail.banco_cargas k where k.token_cliente = p_token;
  if found then
    if (v_previa.cuenta_id, v_previa.fuente, v_previa.huella_archivo, v_previa.lineas) is distinct from (p_cuenta_id, p_fuente, v_huella, v_n) then
      raise exception 'Ese envío ya guardó otro extracto. Vuelve a leer el archivo y guárdalo de nuevo.' using errcode = 'P0001', hint = 'token_reusado';
    end if;
    return retail.fn_banco_carga_resultado(v_previa.id);
  end if;

  select * into v_c from retail.cuentas_dinero where id = p_cuenta_id;
  if not found or v_c.tipo <> 'banco' then
    raise exception 'El extracto se guarda en un banco: elige la cuenta del banco.' using errcode = 'P0001';
  end if;
  if v_c.archivada_en is not null then
    raise exception 'Esa cuenta está archivada: no recibe extractos.' using errcode = 'P0001';
  end if;
  if p_fuente is null or p_fuente not in ('ibk_txt', 'tabla_web') then
    raise exception 'No reconozco de dónde viene ese extracto.' using errcode = 'P0001';
  end if;
  if v_huella !~ '^[0-9a-f]{64}$' then
    raise exception 'Falta la huella del archivo: vuelve a leerlo y guárdalo de nuevo.' using errcode = 'P0001';
  end if;
  -- El .txt dice de qué cuenta es en cada renglón; la tabla pegada no.
  if p_fuente = 'ibk_txt' and (v_cuenta_archivo is null or v_cuenta_archivo !~ '^[0-9]{4,34}$') then
    raise exception 'El archivo no dice de qué cuenta es: descárgalo de nuevo de la banca por internet.' using errcode = 'P0001', hint = 'banco_sin_cuenta_del_archivo';
  end if;
  if p_fuente = 'tabla_web' and v_cuenta_archivo is not null then
    raise exception 'La tabla copiada de la web no dice de qué cuenta es: eso solo lo trae el archivo (.txt).' using errcode = 'P0001';
  end if;
  if v_n is null or v_n = 0 then
    raise exception 'El extracto no trae ninguna línea.' using errcode = 'P0001';
  end if;
  if v_n > 5000 then
    raise exception 'El extracto trae % líneas y se guardan hasta 5,000 a la vez: súbelo por partes (un mes por archivo).', v_n using errcode = 'P0001';
  end if;

  -- Cada línea se revisa como TEXTO antes de convertirla: un monto mal copiado o un `NaN` no se adivina, se rechaza.
  v_mal := (
    select 'La línea ' || t.n || ' del extracto ' || t.motivo || '. Vuelve a leer el archivo.'
      from (
        select e.n, case
            when jsonb_typeof(e.x) <> 'object' then 'no se entiende'
            when coalesce(e.x ->> 'orden', '') !~ '^[0-9]{1,6}$' then 'no trae su posición'
            when coalesce(e.x ->> 'fecha', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then 'no trae una fecha legible'
            when e.x ->> 'fecha_proceso' is not null and e.x ->> 'fecha_proceso' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then 'trae una fecha de proceso ilegible'
            when coalesce(e.x ->> 'monto', '') !~ '^-?[0-9]{1,9}(\.[0-9]{1,2})?$' then 'no trae un monto legible'
            when e.x ->> 'saldo' is not null and e.x ->> 'saldo' !~ '^-?[0-9]{1,10}(\.[0-9]{1,2})?$' then 'trae un saldo ilegible'
            when jsonb_typeof(e.x -> 'firme') is distinct from 'boolean' then 'no dice si el banco ya la procesó'
            when btrim(coalesce(e.x ->> 'descripcion', '')) = '' then 'no trae descripción'
            when char_length(btrim(e.x ->> 'descripcion')) > 120 then 'trae una descripción de más de 120 letras'
            -- El número de operación va dentro de la identidad de la línea, separado por «:»: con un «:» o un blanco adentro, dos líneas
            -- distintas podrían salir con la misma identidad.
            when nullif(nullif(btrim(e.x ->> 'operacion'), ''), '-') ~ '[:[:space:]]' then 'trae un número de operación ilegible'
            when char_length(coalesce(e.x ->> 'correlativo', '')) > 30 or char_length(coalesce(e.x ->> 'codigo', '')) > 20
                 or char_length(coalesce(e.x ->> 'operacion', '')) > 40 then 'trae un código demasiado largo'
          end as motivo
          from jsonb_array_elements(p_lineas) with ordinality e(x, n)
      ) t
     where t.motivo is not null
     order by t.n limit 1);
  if v_mal is not null then
    raise exception '%', v_mal using errcode = 'P0001';
  end if;

  create temporary table if not exists pg_temp.banco_por_cargar (
    orden integer, fecha date, fecha_proceso date, correlativo text, codigo text, operacion text, descripcion text,
    monto numeric, saldo numeric, firme boolean,
    glosa text, op text, identidad text, id uuid, entra boolean, pos integer, firmes_ya integer) on commit drop;
  truncate pg_temp.banco_por_cargar;
  begin
    insert into pg_temp.banco_por_cargar (orden, fecha, fecha_proceso, correlativo, codigo, operacion, descripcion, monto, saldo, firme, glosa, op, entra, firmes_ya)
    select (e.x ->> 'orden')::integer, (e.x ->> 'fecha')::date, (e.x ->> 'fecha_proceso')::date,
           nullif(btrim(e.x ->> 'correlativo'), ''), nullif(btrim(e.x ->> 'codigo'), ''), nullif(nullif(btrim(e.x ->> 'operacion'), ''), '-'),
           btrim(e.x ->> 'descripcion'), (e.x ->> 'monto')::numeric, (e.x ->> 'saldo')::numeric, (e.x ->> 'firme')::boolean,
           retail.fn_banco_glosa(e.x ->> 'descripcion'), coalesce(nullif(nullif(btrim(e.x ->> 'operacion'), ''), '-'), '-'), false, 0
      from jsonb_array_elements(p_lineas) e(x);
  exception when data_exception then
    raise exception 'El extracto trae una fecha o un monto que no existe. Vuelve a leer el archivo.' using errcode = 'P0001';
  end;

  if (select count(distinct t.orden) from pg_temp.banco_por_cargar t) <> v_n then
    raise exception 'El extracto trae dos líneas en la misma posición. Vuelve a leer el archivo.' using errcode = 'P0001';
  end if;
  if exists (select 1 from pg_temp.banco_por_cargar t where t.monto = 0) then
    raise exception 'El extracto trae una línea sin monto: una línea del banco siempre mueve plata.' using errcode = 'P0001';
  end if;
  if exists (select 1 from pg_temp.banco_por_cargar t where abs(t.monto) > 1000000) then
    raise exception 'El extracto trae una línea de más de S/ 1,000,000: revisa que el archivo sea de esta cuenta.' using errcode = 'P0001';
  end if;
  if exists (select 1 from pg_temp.banco_por_cargar t where t.fecha > v_hoy) then
    raise exception 'El extracto trae una línea con fecha futura (hoy es %).', to_char(v_hoy, 'DD/MM/YYYY') using errcode = 'P0001';
  end if;
  if exists (select 1 from pg_temp.banco_por_cargar t where t.fecha < date '2000-01-01') then
    raise exception 'El extracto trae una línea con una fecha imposible. Vuelve a leer el archivo.' using errcode = 'P0001';
  end if;
  if exists (select 1 from pg_temp.banco_por_cargar t where t.firme and (t.fecha_proceso is null or t.correlativo is null)) then
    raise exception 'Una línea que el banco ya procesó tiene que traer su fecha de proceso y su número del banco.' using errcode = 'P0001';
  end if;
  -- La fecha de proceso ordena las líneas: una del futuro quedaría última para siempre y su saldo pasaría por el saldo del banco.
  if exists (select 1 from pg_temp.banco_por_cargar t where t.fecha_proceso > v_hoy) then
    raise exception 'El extracto trae una línea con fecha de proceso futura (hoy es %).', to_char(v_hoy, 'DD/MM/YYYY') using errcode = 'P0001';
  end if;
  if exists (select 1 from pg_temp.banco_por_cargar t where t.firme and t.fecha_proceso < t.fecha) then
    raise exception 'El extracto trae una línea que el banco habría procesado antes de que pasara. Vuelve a leer el archivo.' using errcode = 'P0001';
  end if;
  -- El número de una línea ya procesada es el definitivo del banco (solo cifras). El provisional empieza con «0000»: una provisional
  -- guardada como firme no se podría corregir nunca más.
  if exists (select 1 from pg_temp.banco_por_cargar t where t.firme and (t.correlativo !~ '^[0-9]{6,20}$' or t.correlativo like '0000%')) then
    raise exception 'Una línea viene marcada como ya procesada con un número provisional del banco. Vuelve a leer el archivo.' using errcode = 'P0001';
  end if;
  if p_fuente = 'tabla_web' and exists (select 1 from pg_temp.banco_por_cargar t where t.firme) then
    raise exception 'La tabla copiada de la web del banco no trae el número de cada línea: no puede marcarlas como ya procesadas.' using errcode = 'P0001';
  end if;
  -- De dónde viene se reconoce por lo que trae, no solo por lo que dice el envío (la misma regla que `fuenteDe` en la web): el archivo
  -- trae el número del banco en sus líneas; la tabla pegada, en ninguna. Un pegado enviado como archivo saltaría el freno de «una sola
  -- clase de fuente por día» y duplicaría una línea ya confirmada.
  if p_fuente = 'tabla_web' and exists (select 1 from pg_temp.banco_por_cargar t where t.correlativo is not null or t.fecha_proceso is not null) then
    raise exception 'La tabla copiada de la web no trae el número del banco ni la fecha de proceso de cada línea: eso es del archivo (.txt).' using errcode = 'P0001';
  end if;
  if p_fuente = 'ibk_txt' and not exists (select 1 from pg_temp.banco_por_cargar t where t.correlativo is not null) then
    raise exception 'Eso no es el archivo (.txt) del banco: ninguna línea trae su número del banco.' using errcode = 'P0001';
  end if;

  update pg_temp.banco_por_cargar t
     set identidad = 'ibk:' || to_char(t.fecha_proceso, 'YYYYMMDD') || ':' || t.correlativo
   where t.firme;
  if (select count(distinct t.identidad) from pg_temp.banco_por_cargar t where t.firme) <> (select count(*) from pg_temp.banco_por_cargar t where t.firme) then
    raise exception 'El extracto trae dos veces la misma línea del banco. Vuelve a leer el archivo.' using errcode = 'P0001';
  end if;

  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién guarda el extracto.' using errcode = 'P0001';
  end if;

  -- Un extracto a la vez por cuenta: dos subidas simultáneas no se cruzan.
  perform pg_advisory_xact_lock(hashtextextended('banco_lineas:' || p_cuenta_id::text, 0));
  -- La hora de la carga se toma DESPUÉS de esperar el candado: dos subidas a la misma cuenta quedan en el orden en que entraron.
  v_ahora := clock_timestamp();

  v_desde := (select min(t.fecha) from pg_temp.banco_por_cargar t);
  v_hasta := (select max(t.fecha) from pg_temp.banco_por_cargar t);

  -- ¿Es de esta cuenta? Una línea firme no se retira jamás: el archivo de otra cuenta no tendría vuelta atrás. Tiene que decir la
  -- misma cuenta que las cargas anteriores y, si la cuenta tiene su número anotado, terminar en las mismas 4 cifras.
  if v_cuenta_archivo is not null then
    v_otra_cuenta := (select k.cuenta_archivo from retail.banco_cargas k
                       where k.cuenta_id = p_cuenta_id and k.cuenta_archivo is not null and k.cuenta_archivo <> v_cuenta_archivo
                       order by k.created_at desc limit 1);
    if v_otra_cuenta is not null then
      raise exception 'Este archivo es de la cuenta terminada en % y lo que ya está guardado en % es de la terminada en %: revisa que hayas elegido el banco correcto.',
        right(v_cuenta_archivo, 4), v_c.nombre, right(v_otra_cuenta, 4) using errcode = 'P0001', hint = 'banco_otra_cuenta';
    end if;
    v_numero := regexp_replace(coalesce(v_c.numero, ''), '[^0-9]', '', 'g');
    if char_length(v_numero) >= 4 and right(v_numero, 4) <> right(v_cuenta_archivo, 4) then
      raise exception 'Este archivo es de la cuenta terminada en % y % tiene anotado un número terminado en %. Si elegiste bien el banco, corrige su número en «Editar cuenta» y vuelve a guardar.',
        right(v_cuenta_archivo, 4), v_c.nombre, right(v_numero, 4) using errcode = 'P0001', hint = 'banco_otra_cuenta';
    end if;
  end if;

  -- La misma línea firme con otro día, otro monto u otro saldo: el archivo no es de esta cuenta (o el banco cambió algo que juró no
  -- cambiar). La descripción no se compara: son palabras, no plata, y el banco puede recortarla sin que la línea sea otra.
  if exists (
    select 1 from pg_temp.banco_por_cargar t
      join retail.banco_lineas l on l.cuenta_id = p_cuenta_id and l.retirada_en is null and l.identidad = t.identidad
     where t.firme and (l.fecha <> t.fecha or l.monto <> t.monto or (l.saldo is not null and t.saldo is not null and l.saldo <> t.saldo))
  ) then
    raise exception 'Este archivo trae una línea que ya está guardada en esta cuenta con otro monto, otra fecha u otro saldo: revisa que sea el extracto de %.', v_c.nombre
      using errcode = 'P0001', hint = 'banco_linea_distinta';
  end if;
  -- Una sola clase de fuente por día: la tabla de la web no trae el número de operación, así que sobre un día que ya tiene líneas del
  -- archivo no se podría saber cuáles son las mismas y se duplicarían.
  if p_fuente = 'tabla_web' and exists (
    select 1 from retail.banco_lineas l
     where l.cuenta_id = p_cuenta_id and l.retirada_en is null and l.firme and l.fecha in (select t.fecha from pg_temp.banco_por_cargar t)
  ) then
    raise exception 'Esos días ya están guardados con el archivo del banco. Para actualizarlos, descarga el archivo (.txt) y súbelo.'
      using errcode = 'P0001', hint = 'banco_dia_con_archivo';
  end if;

  -- (a) Las firmes: entra la que no está (por su identidad).
  update pg_temp.banco_por_cargar t
     set entra = not exists (select 1 from retail.banco_lineas l
                              where l.cuenta_id = p_cuenta_id and l.retirada_en is null and l.identidad = t.identidad)
   where t.firme;

  -- Cuántas firmes vigentes hay ya de cada grupo (día, monto, glosa, operación). Se cuentan UNA vez para todo el archivo: contarlas
  -- grupo por grupo recorría las líneas del día una vez por línea (5,000 líneas de un mismo día tardaban más de 5 segundos).
  with ya as (
    select l.fecha, l.monto, retail.fn_banco_glosa(l.descripcion) as glosa, coalesce(l.operacion, '-') as op, count(*) as n
      from retail.banco_lineas l
     where l.cuenta_id = p_cuenta_id and l.retirada_en is null and l.firme and l.fecha between v_desde and v_hasta
     group by 1, 2, 3, 4
  )
  update pg_temp.banco_por_cargar t
     set firmes_ya = ya.n
    from ya
   where ya.fecha = t.fecha and ya.monto = t.monto and ya.glosa = t.glosa and ya.op = t.op;

  -- (b) Las provisionales vigentes del rango se retiran: esta carga dice la verdad de esos días.
  create temporary table if not exists pg_temp.banco_por_retirar (
    id uuid, fecha date, monto numeric, glosa text, op text, pos integer, sucesora uuid, sucesora_firme boolean) on commit drop;
  truncate pg_temp.banco_por_retirar;
  insert into pg_temp.banco_por_retirar (id, fecha, monto, glosa, op, pos)
  select l.id, l.fecha, l.monto, retail.fn_banco_glosa(l.descripcion), coalesce(l.operacion, '-'),
         row_number() over (partition by l.fecha, l.monto, retail.fn_banco_glosa(l.descripcion), coalesce(l.operacion, '-')
                            order by k.created_at, l.orden, l.id)
    from retail.banco_lineas l join retail.banco_cargas k on k.id = l.carga_id
   where l.cuenta_id = p_cuenta_id and l.retirada_en is null
     and not l.firme and l.fecha between v_desde and v_hasta;

  -- (c) Las no firmes: de cada grupo (día, monto, glosa, operación) entran solo las que FALTAN. El archivo dice cuántas hay en total;
  --     se descuentan las firmes que ya están (las de antes y las que entran con esta carga). Entran las últimas del grupo: lo que
  --     falta por confirmar es lo más nuevo.
  with cuentas as (
    select t.fecha, t.monto, t.glosa, t.op,
           count(*) - count(*) filter (where t.firme and t.entra) - max(t.firmes_ya) as faltan
      from pg_temp.banco_por_cargar t
     group by t.fecha, t.monto, t.glosa, t.op
  ),
  filas as (
    select t.orden, c.faltan,
           row_number() over (partition by t.fecha, t.monto, t.glosa, t.op order by t.orden desc) as desde_el_final
      from pg_temp.banco_por_cargar t
      join cuentas c on c.fecha = t.fecha and c.monto = t.monto and c.glosa = t.glosa and c.op = t.op
     where not t.firme
  )
  update pg_temp.banco_por_cargar t
     set entra = f.desde_el_final <= f.faltan
    from filas f
   where f.orden = t.orden;

  -- (d) Cada línea que entra: su id, su lugar en el grupo (las firmes primero) y, si no es firme, su identidad con el ordinal k
  --     (después de las firmes vigentes del grupo, que ya cuentan).
  with numeradas as (
    select t.orden, t.firmes_ya as firmes_antes,
           row_number() over (partition by t.fecha, t.monto, t.glosa, t.op order by (not t.firme), t.orden) as pos
      from pg_temp.banco_por_cargar t
     where t.entra
  )
  update pg_temp.banco_por_cargar t
     set id = gen_random_uuid(),
         pos = n.pos,
         identidad = case when t.firme then t.identidad
                          else 'sin:' || to_char(t.fecha, 'YYYYMMDD') || ':' || (t.monto * 100)::bigint::text || ':' || t.glosa || ':' || t.op || ':'
                               || (n.firmes_antes + n.pos)::text end
    from numeradas n
   where n.orden = t.orden;

  -- (e) La sucesora de cada retirada: la que ocupa su mismo lugar en el grupo entre las que entran.
  update pg_temp.banco_por_retirar r
     set sucesora = t.id, sucesora_firme = t.firme
    from pg_temp.banco_por_cargar t
   where t.entra and t.fecha = r.fecha and t.monto = r.monto and t.glosa = r.glosa and t.op = r.op and t.pos = r.pos;

  -- La tabla pegada solo agrega o repite: si no trae una línea que ya estaba por confirmar en esos días, lo más probable es que venga
  -- cortada (la web del banco la pagina), no que el banco la haya quitado. Retirarla se llevaría plata que el banco sí tiene.
  if p_fuente = 'tabla_web' then
    v_sueltas := (select count(*) from pg_temp.banco_por_retirar r where r.sucesora is null);
    if v_sueltas > 0 then
      raise exception 'A lo que pegaste le % de las que ya estaban guardadas entre el % y el %. Copia la tabla con esos días completos, o sube el archivo (.txt) del banco: lo pegado no quita líneas.',
        case when v_sueltas = 1 then 'falta 1 línea' else 'faltan ' || v_sueltas || ' líneas' end, to_char(v_desde, 'DD/MM/YYYY'), to_char(v_hasta, 'DD/MM/YYYY')
        using errcode = 'P0001', hint = 'banco_pegado_incompleto';
    end if;
  end if;

  v_entran := (select count(*) from pg_temp.banco_por_cargar t where t.entra);
  v_confirmadas := (select count(*) from pg_temp.banco_por_retirar r where r.sucesora is not null and r.sucesora_firme);
  v_renovadas := (select count(*) from pg_temp.banco_por_retirar r where r.sucesora is not null and not r.sucesora_firme);
  -- Nueva = el banco no la había dicho. Una provisional que vuelve a venir igual (renovada) ya estaba: cuenta como repetida.
  v_nuevas := v_entran - v_confirmadas - v_renovadas;

  insert into retail.banco_cargas (id, cuenta_id, fuente, desde, hasta, lineas, nuevas, repetidas, confirmadas, huella_archivo, cuenta_archivo, subido_por, token_cliente, created_at)
  values (v_carga, p_cuenta_id, p_fuente, v_desde, v_hasta, v_n, v_nuevas, v_n - v_nuevas - v_confirmadas, v_confirmadas, v_huella, v_cuenta_archivo, v_actor, p_token, v_ahora);

  update retail.banco_lineas l
     set retirada_en = v_ahora, retirada_por_carga = v_carga
    from pg_temp.banco_por_retirar r
   where l.id = r.id;

  insert into retail.banco_lineas (id, cuenta_id, carga_id, identidad, fecha, fecha_proceso, correlativo, codigo, operacion, descripcion, monto, saldo, orden, firme)
  select t.id, p_cuenta_id, v_carga, t.identidad, t.fecha, t.fecha_proceso, t.correlativo, t.codigo, t.operacion, t.descripcion, t.monto, t.saldo, t.orden, t.firme
    from pg_temp.banco_por_cargar t
   where t.entra;

  update retail.banco_lineas l
     set reemplazada_por = r.sucesora
    from pg_temp.banco_por_retirar r
   where l.id = r.id and r.sucesora is not null;

  return retail.fn_banco_carga_resultado(v_carga);
end $$;
comment on function retail.cargar_lineas_banco(uuid, text, jsonb, text, uuid, text) is
  'ADR-0637: guarda las líneas del extracto de un banco sin duplicar (las firmes por su identidad; las no firmes, solo las que faltan) y retira las provisionales que esta carga confirma o, si es el archivo, ya no trae. El archivo tiene que ser de la misma cuenta que las cargas anteriores (p_cuenta_archivo). No mueve plata. Solo el líder; todo o nada; idempotente por token.';
revoke all on function retail.cargar_lineas_banco(uuid, text, jsonb, text, uuid, text) from public, anon;
grant execute on function retail.cargar_lineas_banco(uuid, text, jsonb, text, uuid, text) to authenticated;

-- ---------- 7. El banco dice / el ERP dice ----------
create or replace function retail.fn_banco_cuadre(p_cuenta_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = retail, public, extensions as $$
declare
  v_c retail.cuentas_dinero%rowtype;
  v_corte_fecha date;
  v_corte_saldo numeric;
  v_piso date;
  v_al date;
  v_libro_al numeric;
  v_libro_antes numeric;
  v_erp numeric;
  v_res jsonb;
begin
  if not retail.fn_es_lider() then
    raise exception 'Ver lo que dice el banco es solo del líder.' using errcode = 'P0001', hint = 'banco_solo_lider';
  end if;
  select * into v_c from retail.cuentas_dinero where id = p_cuenta_id;
  if not found or v_c.tipo <> 'banco' then
    raise exception 'Elige un banco.' using errcode = 'P0001';
  end if;

  for v_corte_fecha, v_corte_saldo in
    select k.fecha, k.saldo_banco from retail.banco_cortes k
     where k.cuenta_id = p_cuenta_id and k.estado = 'vigente'
     order by k.fecha desc limit 1
  loop
    exit;
  end loop;
  -- El piso: desde qué día se cuadra. Lo anterior es historia (se guarda, no se cuadra).
  v_piso := greatest(v_c.saldo_desde, v_corte_fecha + 1);
  v_al := (select max(l.fecha) from retail.banco_lineas l where l.cuenta_id = p_cuenta_id and l.retirada_en is null);

  if v_al is null then
    return jsonb_build_object(
      'hay_extracto', false, 'cuenta_id', p_cuenta_id, 'piso', v_piso,
      'corte', case when v_corte_fecha is not null then jsonb_build_object('fecha', v_corte_fecha, 'saldo_banco', v_corte_saldo) end,
      'banco', null, 'erp', null, 'diferencia', null, 'ancla', null,
      'lineas_desde_piso', null, 'lineas_historia', null, 'por_confirmar', null, 'huecos', null, 'entra', null, 'sale', null,
      'por_codigo', null, 'ultima_carga', null);
  end if;

  -- El ERP, con la fórmula de siempre (`fn_bal_dinero`, `fn_cuentas_dinero_saldos`): saldo inicial + el libro desde `saldo_desde`.
  -- El libro se arma UNA vez: hasta el día de la última línea del banco (o hasta la víspera del piso, si el corte es posterior a todo
  -- lo guardado, para poder decir de dónde parte el ERP).
  select coalesce(sum(l.monto) filter (where l.fecha <= v_al), 0), coalesce(sum(l.monto) filter (where l.fecha < v_piso), 0)
    into v_libro_al, v_libro_antes
    from retail.fn_dinero_libro(greatest(v_al, v_piso - 1)) l
   where l.cuenta_id = p_cuenta_id and (v_c.saldo_desde is null or l.fecha >= v_c.saldo_desde);
  -- Antes de su `saldo_desde` la cuenta no tiene saldo en el ERP: no hay con qué comparar.
  v_erp := case when v_c.saldo_desde is not null and v_al + 1 < v_c.saldo_desde then null else v_c.saldo_inicial + v_libro_al end;

  with lineas as materialized (
    -- El orden del banco: por día de proceso; dentro del día, primero las que ya procesó (por su número) y después las provisionales,
    -- por su día de operación y, dentro del día, en el orden de su carga. El día va ANTES que la carga: si se sube un archivo más viejo
    -- después del nuevo, sus provisionales se renuevan con la hora de hoy y, ordenadas por carga, quedarían detrás de las del último
    -- día, que siguen vigentes; el saldo del banco pasaría a ser uno atrasado. Una línea sin fecha de proceso (la tabla de la web) va
    -- por su día de operación.
    select l.fecha, l.monto, l.saldo, l.firme, l.codigo, l.descripcion,
           row_number() over (order by coalesce(l.fecha_proceso, l.fecha), (not l.firme), case when l.firme then l.correlativo end,
                                       l.fecha, k.created_at, l.orden, l.id) as pos,
           (v_piso is null or l.fecha >= v_piso) as desde_piso
      from retail.banco_lineas l join retail.banco_cargas k on k.id = l.carga_id
     where l.cuenta_id = p_cuenta_id and l.retirada_en is null
  ),
  eslabones as (
    select l.*, lag(l.saldo) over (order by l.pos) as saldo_antes from lineas l
  ),
  ultimo_saldo as (
    select e.pos, e.saldo from eslabones e where e.saldo is not null order by e.pos desc limit 1
  ),
  totales as (
    select count(*) filter (where e.desde_piso) as lineas_desde_piso,
           count(*) filter (where not e.desde_piso) as lineas_historia,
           count(*) filter (where not e.firme) as por_confirmar,
           -- Un hueco: entre dos líneas seguidas con saldo, el saldo de antes más el monto no da el saldo. Falta (o sobra) una línea.
           count(*) filter (where e.desde_piso and e.saldo is not null and e.saldo_antes is not null and e.saldo_antes + e.monto <> e.saldo) as huecos,
           coalesce(sum(e.monto) filter (where e.desde_piso and e.monto > 0), 0) as entra,
           coalesce(-sum(e.monto) filter (where e.desde_piso and e.monto < 0), 0) as sale,
           -- El saldo del banco es el último saldo que dijo; si las últimas líneas no lo traen, se le suman sus montos.
           (select u.saldo from ultimo_saldo u)
             + coalesce(sum(e.monto) filter (where e.pos > (select u.pos from ultimo_saldo u)), 0) as saldo
      from eslabones e
  )
  select jsonb_build_object(
    'hay_extracto', true,
    'cuenta_id', p_cuenta_id,
    'piso', v_piso,
    'corte', case when v_corte_fecha is not null then jsonb_build_object('fecha', v_corte_fecha, 'saldo_banco', v_corte_saldo) end,
    'banco', jsonb_build_object('saldo', t.saldo, 'al', v_al),
    'erp', jsonb_build_object('saldo', v_erp),
    'diferencia', t.saldo - v_erp,
    -- Al ABRIR el piso: de dónde parte el banco (su saldo menos todo lo que pasó desde el piso) y de dónde parte el ERP. Si lo guardado
    -- no llega ni a la víspera del piso, el último saldo del banco es de antes y no dice con cuánto abrió ese día: no se afirma nada.
    'ancla', case when v_piso is not null and v_al >= v_piso - 1 then jsonb_build_object(
               'banco', t.saldo - (t.entra - t.sale),
               'erp', v_c.saldo_inicial + v_libro_antes,
               'diferencia', t.saldo - (t.entra - t.sale) - (v_c.saldo_inicial + v_libro_antes)) end,
    'lineas_desde_piso', t.lineas_desde_piso,
    'lineas_historia', t.lineas_historia,
    'por_confirmar', t.por_confirmar,
    'huecos', t.huecos,
    'entra', t.entra,
    'sale', t.sale,
    'por_codigo', coalesce((
      select jsonb_agg(jsonb_build_object('codigo', g.codigo, 'glosa', g.glosa, 'n', g.n, 'entra', g.entra, 'sale', g.sale)
                       order by g.n desc, g.codigo nulls last)
        from (
          select e.codigo, mode() within group (order by retail.fn_banco_glosa(e.descripcion)) as glosa, count(*) as n,
                 coalesce(sum(e.monto) filter (where e.monto > 0), 0) as entra, coalesce(-sum(e.monto) filter (where e.monto < 0), 0) as sale
            from lineas e where e.desde_piso
           group by e.codigo
        ) g), '[]'::jsonb),
    'ultima_carga', (
      select jsonb_build_object('id', k.id, 'cuando', k.created_at, 'por', trim(concat_ws(' ', pe.nombres, pe.apellidos)), 'fuente', k.fuente,
                                'desde', k.desde, 'hasta', k.hasta, 'lineas', k.lineas, 'nuevas', k.nuevas, 'repetidas', k.repetidas,
                                'confirmadas', k.confirmadas)
        from retail.banco_cargas k left join public.personas pe on pe.id = k.subido_por
       where k.cuenta_id = p_cuenta_id
       order by k.created_at desc, k.id limit 1)
  ) into v_res
    from totales t;
  return v_res;
end $$;
comment on function retail.fn_banco_cuadre(uuid) is
  'ADR-0637: lo que dice el banco (el último saldo de sus líneas guardadas y a qué día), lo que dice el ERP a ese mismo día (saldo inicial + libro, la fórmula de siempre) y la diferencia; cuántas líneas hay, cuántas siguen por confirmar, si a la cadena de saldos le falta alguna y de qué carga salió. Solo lectura; solo el líder.';
revoke all on function retail.fn_banco_cuadre(uuid) from public, anon;
grant execute on function retail.fn_banco_cuadre(uuid) to authenticated;

reset lock_timeout;
