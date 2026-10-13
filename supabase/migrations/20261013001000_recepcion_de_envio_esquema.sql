-- ADR-0362 · fase 4 (Felipe 2026-10-12, «desarrollar de corrido»): recibir en la sede un envío de una orden de compra — el esquema.
-- Contrato con la pantalla: docs/compras/ordenes-de-compra-2026-10/contrato-recepcion-de-envio.md. Las funciones van en
-- 20261013002000_recepcion_de_envio.sql.
--
-- EL PROBLEMA PRIMERO. El envío de la fase 3 (`despachos`, ENV-000001) dice qué SALIÓ hacia una sede, pero no hay dónde anotar qué
-- LLEGÓ: cuántas prendas de cada talla y color se contaron, a qué costo entraron (decisión 18: lo corrige quien recibe), qué faltó y por
-- qué (decisión 14), qué vino de más y qué pasa con eso (15), qué llegó dañado y si tiene arreglo (23 y 27), y lo que vino sin estar en
-- la guía (13). Sin eso, la deuda del proveedor «por reponer» (fase 5) no tiene de dónde salir, y el envío nunca puede mostrar «cómo se
-- cerró». Además, la prenda que llega casi siempre es NUEVA (la orden se pide por categoría y marca, no por prenda), y crearla exige hoy
-- editar el catálogo, que quien recibe en la tienda no tiene (decisión 49: «la crea quien recibe, en la tienda»).
--
-- QUÉ HACE (una sola parte, re-pegable).
--   1. `lotes.despacho_id` (nulo): el lote que abre la recepción de un envío, uno por proveedor (un fardo puede traer dos, decisión
--      11): único en (despacho_id, proveedor_id).
--   2. `despachos` suma `nota_recepcion` (hasta 500), `recepcion_token` (único) y `recepcion_huella`: lo escribe solo el cierre
--      (abierto → cerrado). Un candado lo exige así, y otro impide cambiar quién y cuándo abrió y recibió un envío ya recibido.
--   3. `despacho_recibidos`: lo contado, por variante y por línea del papel a la que se cargó (una variante que cruza el cupo de un
--      comprobante se parte en dos filas). Cada fila dice cuántas llegaron, cuántas dañadas (y si tienen arreglo), a qué costo
--      entraron y con qué movimientos.
--   4. `despacho_diferencias`: un faltante o un sobrante por línea del envío, y un sobrante por cada cosa que no estaba en la guía, con
--      su causa. Es la deuda que la fase 5 resuelve («Nos debe»).
--      Las dos tablas solo se agregan (un disparador impide cambiarlas o borrarlas), solo mientras el envío está abierto y con la
--      línea de ESE envío. RLS encendido y SIN políticas: se leen y escriben solo por funciones `security definer`.
--   5. `crear_producto_con_variantes` (REEMPLAZO ANCLADO sobre su definición viva): su candado de permiso deja pasar también a quien
--      tiene el módulo Recibir cuando la marca de transacción `retail.alta_al_recibir` vale 'si'. Esa marca la pone y la quita SOLO
--      `preparar_prenda_al_recibir` (siguiente migración) después de comprobar el módulo Recibir, la sede del envío y quién hizo la
--      orden. La web no puede ponerla: PostgREST no expone `set_config` (no está en los esquemas expuestos), y aunque alguien la pusiera
--      a mano seguiría haciendo falta el módulo Recibir. La prenda nace `pendiente` si quien la crea no edita el catálogo
--      (`productos_estado_alta_biut`, como la alta al vuelo del conteo y el «Modelo nuevo» del Taller): se usa de inmediato y un líder
--      la revisa en Catálogo ▸ Productos ▸ «Por revisar» (ADR-0371).
--
-- DESCARTÉ:
--   · Guardar lo contado corrigiendo `despacho_items` (cantidad y precio): la guía es el respaldo de lo que salió y la fase 5 necesita
--     comparar lo enviado contra lo que llegó. Lo recibido va aparte y la guía no se reescribe.
--   · Una columna `proveedor_id` en `prendas_danadas` para la dañada que llega del proveedor: el candado
--     `prendas_danadas_proveedor_coherente` la reserva para el estado `devuelta_proveedor`. El proveedor de una dañada que llegó en un
--     envío se lee de su movimiento (`lote_id` → `lotes.proveedor_id`) o de `despacho_recibidos.movimiento_danada_id`.
--   · Exigir que un envío cerrado tenga su huella (un CHECK «cerrado ⇒ recepcion_huella»): la prueba de la fase 3 cierra envíos a mano
--     para probar `anular_envio`, y lo que de verdad dice cómo se cerró son las filas de las dos tablas nuevas, no la huella.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). UNA parte, después de 20261012225000 (las tablas de la fase 3) y antes de
-- 20261013002000. Tablas NUEVAS sin políticas; columnas nuevas en `lotes` (2 filas en producción) y `despachos` (vacía); sin `drop
-- trigger` (los disparadores van con `create or replace trigger`), sin `select … into` dentro de textos entre comillas (ADR-0288). El
-- reemplazo aborta SIN TOCAR NADA si la función viva cambió y no hace nada si ya está aplicado: se puede pegar dos veces. El bloque
-- final comprueba que quedó todo.

set lock_timeout = '3s';

-- Reemplazo anclado (el mismo de 20261012211000): falla si la función viva cambió, y es re-ejecutable.
create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ---------- 1. El lote de un envío: uno por proveedor ----------
alter table retail.lotes add column if not exists despacho_id uuid references retail.despachos (id);
create unique index if not exists lotes_despacho_proveedor_unico on retail.lotes (despacho_id, proveedor_id)
  where despacho_id is not null;
comment on column retail.lotes.despacho_id is
  'ADR-0362 (fase 4): el envío de orden de compra (ENV-…) cuya recepción abrió este lote. Uno por proveedor del envío.';

-- ---------- 2. Cómo se cerró un envío ----------
alter table retail.despachos
  add column if not exists nota_recepcion text
    constraint despachos_nota_recepcion_check check (nota_recepcion is null or (btrim(nota_recepcion) <> '' and length(nota_recepcion) <= 500));
-- Doble clic o reintento sin red al cerrar: el mismo token con la misma huella devuelve la recepción que ya se guardó.
alter table retail.despachos add column if not exists recepcion_token uuid constraint despachos_recepcion_token_key unique;
alter table retail.despachos add column if not exists recepcion_huella text;
comment on column retail.despachos.nota_recepcion is 'ADR-0362 (fase 4): la nota de quien recibió el envío (hasta 500 letras).';
comment on column retail.despachos.recepcion_token is 'ADR-0362 (fase 4): el token del cierre de la recepción (reintento seguro).';
comment on column retail.despachos.recepcion_huella is 'ADR-0362 (fase 4): la huella de lo que se mandó al cerrar (mismo token, otros datos: error).';

-- Lo de la recepción solo existe en un envío recibido (en camino, abierto o anulado no lo tienen).
do $do$
begin
  if not exists (select 1 from pg_constraint c
                  where c.conrelid = 'retail.despachos'::regclass and c.conname = 'despachos_recepcion_solo_al_cerrar') then
    alter table retail.despachos add constraint despachos_recepcion_solo_al_cerrar check (
      estado = 'cerrado' or (nota_recepcion is null and recepcion_token is null and recepcion_huella is null));
  end if;
end;
$do$;

-- Lo de la recepción se escribe al cerrar (abierto → cerrado) y ya no cambia; tampoco quién y cuándo abrió y recibió el envío.
-- (Corre después de `despachos_camino`, que ya impide volver atrás y cambiar lo que identifica al envío.)
create or replace function retail.fn_despachos_recepcion_fija()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  if (new.nota_recepcion is distinct from old.nota_recepcion
      or new.recepcion_token is distinct from old.recepcion_token
      or new.recepcion_huella is distinct from old.recepcion_huella)
     and not (old.estado = 'abierto' and new.estado = 'cerrado') then
    raise exception 'Cómo se recibió un envío se escribe al cerrarlo y ya no se cambia' using errcode = '23514', hint = 'recepcion_inmutable';
  end if;
  if old.estado = 'cerrado'
     and (new.abierto_por is distinct from old.abierto_por or new.abierto_en is distinct from old.abierto_en
          or new.cerrado_por is distinct from old.cerrado_por or new.cerrado_en is distinct from old.cerrado_en) then
    raise exception 'Quién y cuándo abrió y recibió un envío ya recibido no se cambia' using errcode = '23514', hint = 'recepcion_inmutable';
  end if;
  return new;
end;
$$;
revoke all on function retail.fn_despachos_recepcion_fija() from public, anon, authenticated;
create or replace trigger despachos_recepcion_fija
  before update on retail.despachos
  for each row execute function retail.fn_despachos_recepcion_fija();

-- ---------- 3. Lo que llegó ----------
create table if not exists retail.despacho_recibidos (
  id uuid primary key default gen_random_uuid(),
  despacho_id uuid not null references retail.despachos (id),
  -- La línea del envío; nula si es algo que no estaba en la guía (decisión 13), y entonces `extra_posicion` dice cuál (desde 1, en el
  -- orden en que la pantalla las mandó).
  despacho_item_id uuid references retail.despacho_items (id),
  extra_posicion integer check (extra_posicion is null or extra_posicion > 0),
  proveedor_id uuid not null references retail.proveedores (id),
  categoria_id uuid not null references retail.categorias (id),
  marca_id uuid not null references retail.marcas (id),
  variante_id uuid not null references retail.variantes (id),
  -- Lo contado de esa variante (buenas + dañadas) que se cargó a esa línea del papel (o a ninguna).
  cantidad integer not null check (cantidad > 0),
  danadas integer not null default 0,
  -- Con dañadas: «pendiente» (tiene arreglo, queda en cuarentena) o «sin_solucion» (también en cuarentena, para liquidar, regalar,
  -- desechar o devolver desde Existencias).
  danada_solucion text,
  -- El costo con el que entró (el de la línea o el que corrigió quien recibe, decisión 18).
  costo_unitario numeric(12, 2) not null check (costo_unitario >= 0),
  -- La entrada de lo bueno al almacén (nula si todo vino dañado) y la de lo dañado a la cuarentena (nula si no hubo).
  movimiento_id uuid references retail.movimientos (id),
  movimiento_danada_id uuid references retail.movimientos (id),
  -- La línea del comprobante a la que se cargó (decisión 9: el papel no bloquea; sin papel, o pasado su cupo, queda nula).
  compra_item_id uuid references retail.compra_items (id),
  creado_por uuid not null references public.personas (id),
  creado_en timestamptz not null default now(),
  constraint despacho_recibidos_linea_o_extra check ((despacho_item_id is null) <> (extra_posicion is null)),
  constraint despacho_recibidos_danadas check (danadas >= 0 and danadas <= cantidad),
  constraint despacho_recibidos_solucion check (
    case when danadas = 0 then danada_solucion is null else danada_solucion in ('pendiente', 'sin_solucion') end),
  constraint despacho_recibidos_movimientos check (
    (movimiento_id is not null) = (cantidad > danadas) and (movimiento_danada_id is not null) = (danadas > 0)),
  constraint despacho_recibidos_extra_sin_papel check (despacho_item_id is not null or compra_item_id is null)
);
create index if not exists despacho_recibidos_despacho_idx on retail.despacho_recibidos (despacho_id);
create index if not exists despacho_recibidos_variante_idx on retail.despacho_recibidos (variante_id);
create index if not exists despacho_recibidos_compra_item_idx on retail.despacho_recibidos (compra_item_id) where compra_item_id is not null;
create unique index if not exists despacho_recibidos_movimiento_unico on retail.despacho_recibidos (movimiento_id)
  where movimiento_id is not null;
create unique index if not exists despacho_recibidos_movimiento_danada_unico on retail.despacho_recibidos (movimiento_danada_id)
  where movimiento_danada_id is not null;
comment on table retail.despacho_recibidos is
  'ADR-0362 (fase 4): lo contado al recibir un envío, por variante y por línea del papel a la que se cargó, con sus dañadas, su costo '
  'y sus movimientos. Solo se agrega, mientras el envío está abierto. Solo se lee y escribe por funciones (RLS sin políticas).';

-- ---------- 4. Lo que faltó o sobró: la deuda que resuelve la fase 5 ----------
create table if not exists retail.despacho_diferencias (
  id uuid primary key default gen_random_uuid(),
  despacho_id uuid not null references retail.despachos (id),
  despacho_item_id uuid references retail.despacho_items (id),
  extra_posicion integer check (extra_posicion is null or extra_posicion > 0),
  proveedor_id uuid not null references retail.proveedores (id),
  categoria_id uuid not null references retail.categorias (id),
  marca_id uuid not null references retail.marcas (id),
  tipo text not null,
  -- Faltante: `no_vino` (el proveedor no lo mandó: deuda «por reponer», decisiones 14 y 24), `se_perdio` (en el camino: lo asume
  -- CAYLA) u `otra_sede` (llegó a otra sede: se cruza en el papel) [provisional: la lista]. Sobrante (decisión 15): `regalo`,
  -- `cobra_aparte` o `proxima_compra`.
  causa text not null,
  cantidad integer not null check (cantidad > 0),
  -- El costo de la línea con el que se recibió (para valorizar la deuda).
  costo_unitario numeric(12, 2) not null check (costo_unitario >= 0),
  nota text check (nota is null or (btrim(nota) <> '' and length(nota) <= 300)),
  creado_por uuid not null references public.personas (id),
  creado_en timestamptz not null default now(),
  constraint despacho_diferencias_linea_o_extra check ((despacho_item_id is null) <> (extra_posicion is null)),
  constraint despacho_diferencias_tipo check (tipo in ('faltante', 'sobrante')),
  constraint despacho_diferencias_causa check (
    (tipo = 'faltante' and causa in ('no_vino', 'se_perdio', 'otra_sede'))
    or (tipo = 'sobrante' and causa in ('regalo', 'cobra_aparte', 'proxima_compra'))),
  -- Lo que no estaba en la guía solo puede sobrar: no se puede deber algo que nadie mandó.
  constraint despacho_diferencias_faltante_de_la_guia check (tipo = 'sobrante' or despacho_item_id is not null)
);
-- Una diferencia por línea del envío (falta o sobra, no las dos) y una por cada cosa fuera de la guía.
create unique index if not exists despacho_diferencias_linea_unica on retail.despacho_diferencias (despacho_id, despacho_item_id)
  where despacho_item_id is not null;
create unique index if not exists despacho_diferencias_extra_unica on retail.despacho_diferencias (despacho_id, extra_posicion)
  where extra_posicion is not null;
create index if not exists despacho_diferencias_proveedor_idx on retail.despacho_diferencias (proveedor_id, tipo);
comment on table retail.despacho_diferencias is
  'ADR-0362 (fase 4): lo que faltó o sobró al recibir un envío, con su causa (faltante: no_vino, se_perdio, otra_sede; sobrante: '
  'regalo, cobra_aparte, proxima_compra). La deuda que resuelve la fase 5. Solo se agrega, mientras el envío está abierto. Solo se '
  'lee y escribe por funciones (RLS sin políticas).';

alter table retail.despacho_recibidos enable row level security;
alter table retail.despacho_diferencias enable row level security;
revoke all on table retail.despacho_recibidos from anon, authenticated;
revoke all on table retail.despacho_diferencias from anon, authenticated;

-- Las dos solo se agregan, y solo mientras el envío se está recibiendo (abierto), con una línea de ESE envío.
create or replace function retail.fn_recepcion_despacho_fija()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    raise exception 'Lo que se recibió de un envío no se cambia ni se borra: queda como se cerró'
      using errcode = '42501', hint = 'recepcion_inmutable';
  end if;
  if not exists (select 1 from retail.despachos d where d.id = new.despacho_id and d.estado = 'abierto') then
    raise exception 'Solo se anota lo que llegó de un envío abierto' using errcode = '23514', hint = 'recepcion_envio_no_abierto';
  end if;
  if new.despacho_item_id is not null and not exists (
    select 1 from retail.despacho_items di where di.id = new.despacho_item_id and di.despacho_id = new.despacho_id
  ) then
    raise exception 'Esa línea no es de este envío' using errcode = '23514', hint = 'recepcion_linea_ajena';
  end if;
  return new;
end;
$$;
revoke all on function retail.fn_recepcion_despacho_fija() from public, anon, authenticated;
create or replace trigger despacho_recibidos_fija
  before insert or update or delete on retail.despacho_recibidos
  for each row execute function retail.fn_recepcion_despacho_fija();
create or replace trigger despacho_diferencias_fija
  before insert or update or delete on retail.despacho_diferencias
  for each row execute function retail.fn_recepcion_despacho_fija();

-- ---------- 5. Crear la prenda al recibir (decisión 49) ----------
-- El candado de permiso de crear_producto_con_variantes, sobre su línea de código (no un comentario). Quien edita el catálogo pasa
-- como siempre; quien no, solo con la marca de transacción que pone preparar_prenda_al_recibir Y el módulo Recibir.
select pg_temp.reemplazar(
  'retail.crear_producto_con_variantes(text,uuid,jsonb,text,uuid,uuid,uuid,boolean,uuid[],uuid,uuid)',
  $v$  if not fn_puede_editar_catalogo() then
    raise exception 'Solo un líder puede dar de alta un producto nuevo';$v$,
  $v$  -- ADR-0362 (decisión 49): quien recibe un envío de una orden crea ahí la prenda que llegó, aunque no edite el catálogo. Solo con
  -- la marca de transacción `retail.alta_al_recibir` = 'si' (la pone y la quita preparar_prenda_al_recibir tras comprobar el módulo
  -- Recibir y la sede) y con el módulo Recibir. La prenda nace pendiente si quien la crea no edita el catálogo (productos_estado_alta_biut).
  if not fn_puede_editar_catalogo()
     and not (coalesce(current_setting('retail.alta_al_recibir', true), '') = 'si' and retail.fn_ve_modulo('recibir')) then
    raise exception 'Solo un líder puede dar de alta un producto nuevo';$v$,
  1);

-- ---------- 6. Comprobación: si algo no quedó, la migración no se da por aplicada ----------
do $$
declare
  v_tabla text;
  v_def text;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'retail' and table_name = 'lotes' and column_name = 'despacho_id') then
    raise exception 'falta lotes.despacho_id';
  end if;
  if to_regclass('retail.lotes_despacho_proveedor_unico') is null then
    raise exception 'falta el único (despacho_id, proveedor_id) de lotes';
  end if;
  if (select count(*) from information_schema.columns
       where table_schema = 'retail' and table_name = 'despachos'
         and column_name in ('nota_recepcion', 'recepcion_token', 'recepcion_huella')) <> 3 then
    raise exception 'faltan columnas de la recepción en despachos';
  end if;
  if not exists (select 1 from pg_constraint c
                  where c.conrelid = 'retail.despachos'::regclass and c.conname = 'despachos_recepcion_solo_al_cerrar') then
    raise exception 'falta el candado despachos_recepcion_solo_al_cerrar';
  end if;
  if not exists (select 1 from pg_trigger t where t.tgrelid = 'retail.despachos'::regclass and t.tgname = 'despachos_recepcion_fija') then
    raise exception 'falta el disparador despachos_recepcion_fija';
  end if;
  foreach v_tabla in array array['despacho_recibidos', 'despacho_diferencias'] loop
    if not coalesce((select c.relrowsecurity from pg_class c where c.oid = ('retail.' || v_tabla)::regclass), false) then
      raise exception 'retail.% tiene que tener RLS encendido', v_tabla;
    end if;
    if exists (select 1 from pg_policies p where p.schemaname = 'retail' and p.tablename = v_tabla) then
      raise exception 'retail.% no lleva políticas: solo se lee y escribe por funciones', v_tabla;
    end if;
    if has_table_privilege('authenticated', 'retail.' || v_tabla, 'select')
       or has_table_privilege('anon', 'retail.' || v_tabla, 'select') then
      raise exception 'retail.%: ni anon ni authenticated la leen directo', v_tabla;
    end if;
    if not exists (select 1 from pg_trigger t
                    where t.tgrelid = ('retail.' || v_tabla)::regclass and t.tgname = v_tabla || '_fija') then
      raise exception 'falta el disparador %_fija (solo se agrega)', v_tabla;
    end if;
  end loop;
  v_def := pg_get_functiondef('retail.crear_producto_con_variantes(text,uuid,jsonb,text,uuid,uuid,uuid,boolean,uuid[],uuid,uuid)'::regprocedure);
  if position($t$current_setting('retail.alta_al_recibir', true)$t$ in v_def) = 0
     or position($t$retail.fn_ve_modulo('recibir')$t$ in v_def) = 0 then
    raise exception 'crear_producto_con_variantes no quedó con el alta al recibir';
  end if;
end;
$$;

reset lock_timeout;
