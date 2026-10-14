-- ADR-0393 · actividad 3, primer paso: cerrar el conteo de un envío y que lo que no se detalló quede PENDIENTE, sin perderse.
--
-- EL PROBLEMA PRIMERO. Con la cara A (las 10 decisiones de Felipe del 2026-10-13) una sede abre el fardo, cuenta por categoría y separa
-- solo lo que le da tiempo: «40 blusas: 12 Aurora con sus tallas, 18 Aurora sin tallas, 6 nuevas y 4 que no sé qué son». Al cerrar,
-- solo lo que tiene talla y color puede entrar al stock (decisión 1: Vender no puede vender una prenda sin talla). Lo demás está en el
-- almacén y TIENE que seguir a la vista hasta que alguien lo detalle o lo cree; si no, el almacén y el sistema dejan de coincidir sin
-- error visible (el «SE ROMPE SI» del ADR). Y lo que faltó o sobró se mide contra lo CONTADO, no contra lo que ya entró: 40 contadas de 40
-- enviadas no son «faltan 28» aunque solo 12 estén en el stock.
--
-- QUÉ HACE (una sola parte, re-pegable).
--   1. `despacho_pendientes`: lo contado que todavía no está en el stock y SE SABE qué es: «detalle» (la prenda, sin tallas) o «crear»
--      (es nueva). Nace al cerrar; solo se agregan filas y cambia su estado (pendiente → resuelto, o anulado al reabrir). «Separar» (no se
--      sabe qué prendas son) NO es fila: se calcula —lo contado menos lo que entró menos lo pendiente—, así nunca se desfasa.
--   2. `despacho_recibidos.pendiente_id`: qué pendiente resolvió cada entrada (null al cerrar y en lo que se separa después).
--   3. `fn_envio_cuentas` y un candado DIFERIDO por línea (`despacho_recibidos_cuadra`, `despacho_pendientes_cuadra`): en stock +
--      pendientes abiertos + sin separar = contadas, con «sin separar» ≥ 0; y un pendiente resuelto es uno por el que entró todo. Lo
--      revisa la base al confirmar, sea cual sea la función que escribió.
--   4. `fn_recepcion_cerrar` (interna): EL cierre de un envío —la reposición de la fase 5a, lo que entra (fn_recepcion_entrar), los
--      pendientes, el saldo de las deudas, el envío cerrado, la respuesta y la actividad—. La usan `recibir_despacho` (todo detallado, sin
--      pendientes) y `cerrar_conteo_envio`. Los dos bloques de la fase 5a (20261013015000) pasan aquí con su texto exacto.
--   5. `recibir_despacho`: la misma firma y la misma respuesta (más dos datos: `contadas` y `por_detallar`); arma lo de siempre, deja el
--      conteo de cada línea todo detallado y llama al cierre.
--   6. `cerrar_conteo_envio`: cierra lo guardado con `guardar_conteo_envio`. Firma quien cierra (combo «Responsable»); por cada línea
--      decide el costo (decisión 6), qué pasó con lo que faltó o sobró y una nota, y dice qué versión de cada conteo vio.
--   7. `fn_recepcion_resultado` suma `contadas` y `por_detallar`; `fn_recepcion_despacho_fija` deja anotar una entrada en un envío ya
--      cerrado solo a resolver_pendiente_envio (20261013173000); `fn_recepcion_entrar` (REEMPLAZO ANCLADO) escribe el pendiente que
--      resuelve cada entrada.
--
-- LO QUE NUNCA DEBE EXISTIR (y quién lo impide):
--   · En una línea, lo que entró más lo pendiente pasa de lo contado → candado diferido `despacho_*_cuadra` (invariante 1 del ADR).
--   · Un pendiente resuelto sin todas sus entradas, o con todo adentro y sin resolver → el mismo candado (invariante 3).
--   · Una entrada que dice resolver un pendiente de otra línea u otro envío → el mismo candado.
--   · Un pendiente en un envío que no se abrió o que se anuló, o de una línea de otro envío → disparador `despacho_pendientes_fija`.
--   · Un pendiente borrado, que cambia de línea, de cantidad o de prenda, o que vuelve a «pendiente» → `despacho_pendientes_fija`.
--   · Un «detalle» sin prenda o un «crear» con prenda → CHECK `despacho_pendientes_que`.
--
-- CONTRATO de cerrar_conteo_envio
--   PROMETE: con el módulo Recibir, la sede del envío y quien firma (que no hizo ninguna de sus órdenes, decisión 17), cierra el envío:
--            lo separado con tallas y colores entra al stock exactamente como en recibir_despacho; lo separado sin tallas y lo nuevo
--            quedan pendientes; lo que no se separó queda «sin separar»; lo que faltó o sobró (contadas contra enviadas) queda con su
--            causa. Todo o nada. Mismo token y mismos datos: la misma respuesta, sin escribir de nuevo.
--   ASUME:   el envío está abierto, cada línea tiene su conteo (aunque sea 0) y quien cierra manda, por cada conteo, la versión que vio.
--            Si alguien guardó una línea después (PT409 `conteo_cambiado`), no se cierra: firmar es certificar lo que se vio.
--   NO HACE: no resuelve pendientes (resolver_pendiente_envio, 20261013173000) ni reabre (actividad 4).
--
-- DESCARTÉ:
--   · Que cerrar_conteo_envio llame a recibir_despacho con lo detallado: recibir_despacho mide lo que faltó contra lo detallado («faltan
--     28» de 40 contadas) y numera lo de fuera de la guía por su posición en el formulario, no por la del conteo. Habría que enseñarle un
--     modo «desde el conteo» con un `if`: dos funciones en una.
--   · Copiar el cierre (la reposición, el saldo, la actividad) en cerrar_conteo_envio: dos cierres, y la próxima regla de la fase 5
--     corregida en uno solo. El costo: re-pegar 20261013015000 DESPUÉS de esta migración falla a propósito (sus anclas ya no están en
--     recibir_despacho, están aquí): en producción ya está pegada, y las pruebas recargan esta cadena, no aquella.
--   · Guardar «separar» como fila: sería un tercer número que alguien tiene que mantener igual a contadas − stock − pendientes. Calculado
--     no se desfasa nunca.
--   · Cuidar la invariante 1 solo en las funciones (como decía el ADR): son cuatro las que escriben (este cierre, recibir_despacho,
--     resolver_pendiente_envio y, en la actividad 4, reabrir) y la próxima se olvidaría. El candado diferido cuesta unas sumas por fila
--     sobre las entradas de UN envío (cientos de filas como mucho) al confirmar.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). UNA parte, después de 20261013171000. Una tabla NUEVA sin políticas (RLS encendido),
-- una columna nueva en `despacho_recibidos` (0 filas en producción, solo la escriben estas funciones), disparadores con
-- `create or replace trigger` y los diferidos con «si no existe» (`create constraint trigger` no admite `or replace`); sin `drop
-- trigger` ni políticas (ADR-0195) y sin `select … into` dentro de textos entre comillas (ADR-0288). El reemplazo de fn_recepcion_entrar
-- aborta sin tocar nada si su definición viva cambió y no hace nada si ya está. Se puede pegar dos veces. El bloque final comprueba que
-- quedó todo.

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

-- ---------- 1. Lo pendiente de un envío cerrado ----------
create table if not exists retail.despacho_pendientes (
  id uuid primary key default gen_random_uuid(),
  despacho_id uuid not null references retail.despachos (id),
  -- La línea del envío; nula si es algo que no estaba en la guía, y entonces `extra_posicion` dice cuál (la del conteo).
  despacho_item_id uuid references retail.despacho_items (id),
  extra_posicion integer check (extra_posicion is null or extra_posicion > 0),
  -- «detalle»: se sabe la prenda y faltan sus tallas y colores. «crear»: es nueva, todavía no existe en el catálogo.
  tipo text not null check (tipo in ('detalle', 'crear')),
  cantidad integer not null check (cantidad between 1 and 99999),
  producto_id uuid references retail.productos (id),
  -- Lo que se anotó de una nueva al contar («blusa con lazo»), si se anotó.
  descripcion text check (descripcion is null or length(descripcion) between 1 and 200),
  -- pendiente → resuelto (entró todo) | anulado (se reabrió el envío y volvió al borrador de su línea). Nunca vuelve atrás.
  estado text not null default 'pendiente' check (estado in ('pendiente', 'resuelto', 'anulado')),
  anotado_por uuid not null references public.personas (id),
  anotado_en timestamptz not null default now(),
  -- Quién lo sacó de la lista (al resolverlo o al reabrir) y cuándo.
  resuelto_por uuid references public.personas (id),
  resuelto_en timestamptz,
  constraint despacho_pendientes_linea_o_extra check ((despacho_item_id is null) <> (extra_posicion is null)),
  constraint despacho_pendientes_que check (
    (tipo = 'detalle' and producto_id is not null and descripcion is null) or (tipo = 'crear' and producto_id is null)),
  constraint despacho_pendientes_quien_lo_cerro check ((estado = 'pendiente') = (resuelto_por is null and resuelto_en is null))
);
create index if not exists despacho_pendientes_despacho_idx on retail.despacho_pendientes (despacho_id);
comment on table retail.despacho_pendientes is
  'ADR-0393: lo contado de un envío cerrado que todavía no está en el stock y se sabe qué es: detalle (la prenda, sin tallas) o crear '
  '(nueva). Nace al cerrar (o al separar después); solo se agregan filas y cambia su estado. Lo que entra por él lleva su id en '
  'despacho_recibidos.pendiente_id. «Sin separar» no es fila: lo calcula fn_envio_cuentas. Solo se lee y escribe por funciones.';

alter table retail.despacho_pendientes enable row level security;
revoke all on table retail.despacho_pendientes from anon, authenticated;

-- ---------- 2. Qué pendiente resolvió cada entrada ----------
alter table retail.despacho_recibidos add column if not exists pendiente_id uuid references retail.despacho_pendientes (id);
create index if not exists despacho_recibidos_pendiente_idx on retail.despacho_recibidos (pendiente_id) where pendiente_id is not null;
comment on column retail.despacho_recibidos.pendiente_id is
  'ADR-0393: el pendiente que resolvió esta entrada (resolver_pendiente_envio). Null en lo que entró al cerrar y en lo que se separó después.';

-- Un pendiente solo en un envío abierto (al cerrar) o cerrado (al separar después), y de una línea de ESE envío; no se borra, no cambia
-- de línea, de qué es ni de cuánto, y su estado solo avanza.
create or replace function retail.fn_despacho_pendientes_fija()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Un pendiente no se borra: se resuelve, o se anula reabriendo el envío' using errcode = '42501', hint = 'pendiente_inmutable';
  end if;
  if tg_op = 'UPDATE' then
    if (new.despacho_id, new.despacho_item_id, new.extra_posicion, new.tipo, new.cantidad, new.producto_id, new.descripcion,
        new.anotado_por, new.anotado_en)
       is distinct from
       (old.despacho_id, old.despacho_item_id, old.extra_posicion, old.tipo, old.cantidad, old.producto_id, old.descripcion,
        old.anotado_por, old.anotado_en) then
      raise exception 'Un pendiente no cambia: se resuelve, o se anula reabriendo el envío' using errcode = '42501', hint = 'pendiente_inmutable';
    end if;
    if old.estado <> 'pendiente' and (new.estado, new.resuelto_por, new.resuelto_en) is distinct from
                                     (old.estado, old.resuelto_por, old.resuelto_en) then
      raise exception 'Ese pendiente ya salió de la lista: no vuelve' using errcode = '42501', hint = 'pendiente_inmutable';
    end if;
    return new;
  end if;
  if new.estado <> 'pendiente' then
    raise exception 'Un pendiente nace pendiente' using errcode = '23514', hint = 'pendiente_inmutable';
  end if;
  if not exists (select 1 from retail.despachos d where d.id = new.despacho_id and d.estado in ('abierto', 'cerrado')) then
    raise exception 'Solo queda pendiente lo de un envío que se abrió' using errcode = '23514', hint = 'pendiente_envio_no_abierto';
  end if;
  if new.despacho_item_id is not null and not exists (
    select 1 from retail.despacho_items di where di.id = new.despacho_item_id and di.despacho_id = new.despacho_id
  ) then
    raise exception 'Esa línea no es de este envío' using errcode = '23514', hint = 'pendiente_linea_ajena';
  end if;
  return new;
end;
$$;
revoke all on function retail.fn_despacho_pendientes_fija() from public, anon, authenticated;
create or replace trigger despacho_pendientes_fija
  before insert or update or delete on retail.despacho_pendientes
  for each row execute function retail.fn_despacho_pendientes_fija();

-- ---------- 3. Las cuentas de cada línea y el candado que las hace cuadrar ----------
-- Por cada conteo de esos envíos: lo contado, lo que entró al stock, lo que queda pendiente (lo de cada pendiente abierto que todavía no
-- entró) y lo sin separar (el resto). En un envío cerrado, «sin separar» es lo que nadie dijo qué es. Agrupado, no fila por fila: lo lee
-- también el aviso de la sede (decisión 4) sobre todos sus envíos cerrados.
create or replace function retail.fn_envio_cuentas(p_despachos uuid[])
returns table (despacho_id uuid, despacho_item_id uuid, extra_posicion integer, contadas integer, en_stock integer,
               en_pendientes integer, sin_separar integer)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  with r as (
    select r.despacho_id, r.despacho_item_id, r.extra_posicion, sum(r.cantidad)::integer as en_stock
      from retail.despacho_recibidos r
     where r.despacho_id = any (p_despachos)
     group by 1, 2, 3
  ), e as (
    select r.pendiente_id, sum(r.cantidad)::integer as entro
      from retail.despacho_recibidos r
     where r.despacho_id = any (p_despachos) and r.pendiente_id is not null
     group by 1
  ), p as (
    select x.despacho_id, x.despacho_item_id, x.extra_posicion, sum(x.cantidad - coalesce(e.entro, 0))::integer as en_pendientes
      from retail.despacho_pendientes x
      left join e on e.pendiente_id = x.id
     where x.despacho_id = any (p_despachos) and x.estado = 'pendiente'
     group by 1, 2, 3
  )
  select k.despacho_id, k.despacho_item_id, k.extra_posicion, k.contadas, coalesce(r.en_stock, 0), coalesce(p.en_pendientes, 0),
         k.contadas - coalesce(r.en_stock, 0) - coalesce(p.en_pendientes, 0)
    from retail.despacho_conteos k
    left join r on r.despacho_id = k.despacho_id and r.despacho_item_id is not distinct from k.despacho_item_id
               and r.extra_posicion is not distinct from k.extra_posicion
    left join p on p.despacho_id = k.despacho_id and p.despacho_item_id is not distinct from k.despacho_item_id
               and p.extra_posicion is not distinct from k.extra_posicion
   where k.despacho_id = any (p_despachos);
$$;
comment on function retail.fn_envio_cuentas(uuid[]) is
  'ADR-0393: por cada conteo de esos envíos {despacho_id, despacho_item_id, extra_posicion, contadas, en_stock, en_pendientes, '
  'sin_separar}. en_pendientes = lo de cada pendiente abierto que todavía no entró; sin_separar = contadas − en_stock − en_pendientes '
  '(en un envío cerrado, lo que nadie dijo qué es). Interna.';
revoke all on function retail.fn_envio_cuentas(uuid[]) from public, anon, authenticated;

-- Al confirmar, por la línea de cada fila escrita: lo que entró más lo pendiente no pasa de lo contado; lo que entró por un pendiente no
-- pasa de su cantidad y es de su línea; resuelto = entró todo. Diferido: el cierre escribe primero las entradas y después los pendientes.
create or replace function retail.fn_envio_linea_cuadra()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_pendiente uuid := nullif(to_jsonb(new) ->> 'pendiente_id', '')::uuid;
  v_envio text;
  v_c record;
  v_p record;
begin
  v_envio := retail.fn_envio_numero_texto((select d.numero from retail.despachos d where d.id = new.despacho_id));
  if v_pendiente is not null and not exists (
    select 1 from retail.despacho_pendientes x
     where x.id = v_pendiente and x.despacho_id = new.despacho_id
       and x.despacho_item_id is not distinct from new.despacho_item_id and x.extra_posicion is not distinct from new.extra_posicion
  ) then
    raise exception 'En % entró algo por un pendiente de otra línea: recarga la pantalla', v_envio
      using errcode = '23514', hint = 'recepcion_pendiente_ajeno';
  end if;
  for v_c in
    select c.contadas, c.en_stock, c.en_pendientes, c.sin_separar
      from retail.fn_envio_cuentas(array[new.despacho_id]) c
     where c.despacho_item_id is not distinct from new.despacho_item_id and c.extra_posicion is not distinct from new.extra_posicion
  loop
    if v_c.sin_separar < 0 then
      raise exception 'En una línea de % lo que entró al stock (%) y lo pendiente (%) pasan de lo contado (%): recarga la pantalla',
        v_envio, v_c.en_stock, v_c.en_pendientes, v_c.contadas using errcode = '23514', hint = 'recepcion_linea_descuadrada';
    end if;
  end loop;
  for v_p in
    select x.cantidad, x.estado,
           coalesce((select sum(r.cantidad) from retail.despacho_recibidos r where r.pendiente_id = x.id), 0)::integer as entro
      from retail.despacho_pendientes x
     where x.despacho_id = new.despacho_id
       and x.despacho_item_id is not distinct from new.despacho_item_id and x.extra_posicion is not distinct from new.extra_posicion
  loop
    if v_p.entro > v_p.cantidad then
      raise exception 'En % entraron % por un pendiente de %: recarga la pantalla', v_envio, v_p.entro, v_p.cantidad
        using errcode = '23514', hint = 'recepcion_pendiente_descuadrado';
    end if;
    if v_p.estado = 'resuelto' and v_p.entro <> v_p.cantidad then
      raise exception 'En % un pendiente de % quedó resuelto con % adentro: recarga la pantalla', v_envio, v_p.cantidad, v_p.entro
        using errcode = '23514', hint = 'recepcion_pendiente_descuadrado';
    end if;
    if v_p.estado = 'pendiente' and v_p.entro = v_p.cantidad then
      raise exception 'En % un pendiente ya entró entero y sigue en la lista: recarga la pantalla', v_envio
        using errcode = '23514', hint = 'recepcion_pendiente_descuadrado';
    end if;
  end loop;
  return null;
end;
$$;
revoke all on function retail.fn_envio_linea_cuadra() from public, anon, authenticated;
do $do$
begin
  if not exists (select 1 from pg_trigger t
                  where t.tgrelid = 'retail.despacho_recibidos'::regclass and t.tgname = 'despacho_recibidos_cuadra') then
    create constraint trigger despacho_recibidos_cuadra
      after insert on retail.despacho_recibidos
      deferrable initially deferred
      for each row execute function retail.fn_envio_linea_cuadra();
  end if;
  if not exists (select 1 from pg_trigger t
                  where t.tgrelid = 'retail.despacho_pendientes'::regclass and t.tgname = 'despacho_pendientes_cuadra') then
    create constraint trigger despacho_pendientes_cuadra
      after insert or update on retail.despacho_pendientes
      deferrable initially deferred
      for each row execute function retail.fn_envio_linea_cuadra();
  end if;
end;
$do$;

-- ---------- 4. Lo recibido y lo que faltó o sobró se anotan al cerrar; lo de un pendiente, también después ----------
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
  -- Al cerrar, con el envío abierto. ADR-0393: lo que entra por un pendiente (o lo que se separa después) se anota con el envío ya
  -- cerrado, y solo desde resolver_pendiente_envio, que lo avisa con `retail.resolviendo_pendiente`. Lo que faltó o sobró, nunca después.
  if not exists (select 1 from retail.despachos d
                  where d.id = new.despacho_id
                    and (d.estado = 'abierto'
                         or (d.estado = 'cerrado' and tg_table_name = 'despacho_recibidos'
                             and current_setting('retail.resolviendo_pendiente', true) = 'si'))) then
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

-- ---------- 5. La puerta única al stock anota qué pendiente resuelve cada entrada (reemplazo anclado sobre 20261013170000) ----------
select pg_temp.reemplazar(
  'retail.fn_recepcion_entrar(uuid,uuid,text,text,uuid,jsonb,uuid[],text)',
  $v$                                               movimiento_danada_id, compra_item_id, creado_por)
        values (p_despacho_id, (v_u ->> 'despacho_item_id')::uuid, (v_u ->> 'extra')::integer, (v_u ->> 'proveedor_id')::uuid,
                (v_u ->> 'categoria_id')::uuid, (v_u ->> 'marca_id')::uuid, v_var, v_ch_b[v_i] + v_ch_d[v_i], v_ch_d[v_i],
                case when v_ch_d[v_i] > 0 then v_v ->> 'solucion' end, v_costo, v_mov_b, v_mov_d, v_ch_ci[v_i], p_actor);$v$,
  $v$                                               movimiento_danada_id, compra_item_id, creado_por, pendiente_id)
        values (p_despacho_id, (v_u ->> 'despacho_item_id')::uuid, (v_u ->> 'extra')::integer, (v_u ->> 'proveedor_id')::uuid,
                (v_u ->> 'categoria_id')::uuid, (v_u ->> 'marca_id')::uuid, v_var, v_ch_b[v_i] + v_ch_d[v_i], v_ch_d[v_i],
                case when v_ch_d[v_i] > 0 then v_v ->> 'solucion' end, v_costo, v_mov_b, v_mov_d, v_ch_ci[v_i], p_actor,
                -- ADR-0393: el pendiente que resuelve esta entrada (null al cerrar y en lo que se separa después).
                (v_u ->> 'pendiente_id')::uuid);$v$,
  1);

-- ---------- 6. La respuesta de una recepción: también cuánto se contó y cuánto queda por detallar ----------
create or replace function retail.fn_recepcion_resultado(p_despacho_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select jsonb_build_object(
           'despacho_id', d.id,
           'numero', retail.fn_envio_numero_texto(d.numero),
           'lotes', coalesce((select jsonb_agg(l.id order by l.proveedor_id) from retail.lotes l where l.despacho_id = d.id), '[]'::jsonb),
           'unidades', coalesce((select sum(r.cantidad) from retail.despacho_recibidos r where r.despacho_id = d.id), 0)::integer,
           'buenas', coalesce((select sum(r.cantidad - r.danadas) from retail.despacho_recibidos r where r.despacho_id = d.id), 0)::integer,
           'danadas', coalesce((select sum(r.danadas) from retail.despacho_recibidos r where r.despacho_id = d.id), 0)::integer,
           'faltan', coalesce((select sum(x.cantidad) from retail.despacho_diferencias x
                                where x.despacho_id = d.id and x.tipo = 'faltante'), 0)::integer,
           'sobran', coalesce((select sum(x.cantidad) from retail.despacho_diferencias x
                                where x.despacho_id = d.id and x.tipo = 'sobrante'), 0)::integer,
           -- ADR-0393: lo contado (la cara A cuenta por categoría) y lo que de eso todavía no está en el stock (pendiente o sin separar).
           'contadas', coalesce((select sum(c.contadas) from retail.fn_envio_cuentas(array[d.id]) c), 0)::integer,
           'por_detallar', coalesce((select sum(c.contadas - c.en_stock) from retail.fn_envio_cuentas(array[d.id]) c), 0)::integer
         )
    from retail.despachos d
   where d.id = p_despacho_id;
$$;
comment on function retail.fn_recepcion_resultado(uuid) is
  'ADR-0362 (fase 4) y ADR-0393: la respuesta de una recepción {despacho_id, numero, lotes, unidades, buenas, danadas, faltan, sobran, '
  'contadas, por_detallar}. unidades = lo que entró al stock; por_detallar = lo contado que todavía no (pendiente o sin separar). Interna.';
revoke all on function retail.fn_recepcion_resultado(uuid) from public, anon, authenticated;

-- ---------- 7. EL cierre de un envío (interno): lo usan recibir_despacho y cerrar_conteo_envio ----------
-- CONTRATO
--   PROMETE: con el envío abierto y ya validado, valida y salda la reposición (fase 5a), deja entrar lo detallado por la puerta única
--            (fn_recepcion_entrar), anota los pendientes, cierra el envío con quién, cuándo, la nota, el token y la huella, anota la
--            actividad y responde como fn_recepcion_resultado. Todo o nada (la transacción es de quien llama).
--   ASUME:   quien llama comprobó el módulo, la sede, quién firma, la versión y la forma de cada unidad y de cada pendiente, y bloqueó el
--            envío (FOR UPDATE), sus órdenes y sus líneas pedidas. `p_unidades` como las arma recibir_despacho («contado» es lo
--            contado, aunque no todo traiga tallas); `p_pendientes` = [{despacho_item_id, extra_posicion, tipo, cantidad,
--            producto_id, descripcion}].
create or replace function retail.fn_recepcion_cerrar(
  p_despacho_id uuid,
  p_actor uuid,
  p_unidades jsonb,
  p_pendientes jsonb,
  p_nota text,
  p_token uuid,
  p_huella text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_despacho retail.despachos;
  v_envio text;
  v_actor uuid := p_actor;
  v_unidades jsonb := coalesce(p_unidades, '[]'::jsonb);
  v_nota text := p_nota;
  v_huella text := p_huella;
  v_variantes uuid[];
  v_res jsonb;
  v_desc text;
begin
  select d.* into v_despacho from retail.despachos d where d.id = p_despacho_id;
  v_envio := retail.fn_envio_numero_texto(v_despacho.numero);

  -- ---- Los comprobantes de esas líneas y sus líneas (el papel), las variantes y el stock: en orden. ----
  -- ---- ADR-0362 (fase 5, decisión 14): «Es la reposición de lo que faltó». Lo de más marcado así salda lo que ese proveedor debe
  -- de esa categoría y marca por envíos ANTERIORES (no por este). Sus deudas se bloquean aquí (en orden de id), antes que el papel y el
  -- stock: dos recepciones del mismo proveedor, o una reposición marcada a mano, se ponen en fila y la segunda ve lo que la primera ya
  -- saldó. Lo que pase de lo debido no es reposición: es un sobrante con otra causa. El reparto se escribe al final. ----
  declare
    v_rep record;
  begin
    perform 1
       from retail.despacho_diferencias x
      where x.tipo = 'faltante' and x.causa = 'no_vino' and x.despacho_id <> p_despacho_id
        and (x.proveedor_id, x.categoria_id, x.marca_id) in (
              select (u ->> 'proveedor_id')::uuid, (u ->> 'categoria_id')::uuid, (u ->> 'marca_id')::uuid
                from jsonb_array_elements(v_unidades) u
               where u ->> 'sobrante_causa' = 'reposicion_faltante')
      order by x.id
        for update;
    for v_rep in
      select g.repuesto, pr.nombre as proveedor, concat_ws(' · ', c.nombre, m.nombre) as que,
             retail.fn_nos_debe_pendiente(g.proveedor_id, g.categoria_id, g.marca_id, p_despacho_id) as debe
        from (select (u ->> 'proveedor_id')::uuid as proveedor_id, (u ->> 'categoria_id')::uuid as categoria_id,
                     (u ->> 'marca_id')::uuid as marca_id,
                     sum((u ->> 'contado')::integer - (u ->> 'enviado')::integer)::integer as repuesto
                from jsonb_array_elements(v_unidades) u
               where u ->> 'sobrante_causa' = 'reposicion_faltante'
               group by 1, 2, 3) g
        join retail.proveedores pr on pr.id = g.proveedor_id
        join retail.categorias c on c.id = g.categoria_id
        join retail.marcas m on m.id = g.marca_id
       order by pr.nombre, c.nombre, m.nombre
    loop
      if v_rep.debe = 0 then
        raise exception '% no debe nada de %: elige otra causa para lo de más', v_rep.proveedor, v_rep.que
          using hint = 'recepcion_reposicion_sin_deuda';
      end if;
      if v_rep.repuesto > v_rep.debe then
        raise exception 'Marcaste % como reposición de %, pero % solo debe %: lo que pase de eso es un sobrante con otra causa',
          v_rep.repuesto, v_rep.que, v_rep.proveedor, v_rep.debe using hint = 'recepcion_reposicion_de_mas';
      end if;
    end loop;
  end;

  v_variantes := array(select distinct (v ->> 'variante_id')::uuid
                         from jsonb_array_elements(v_unidades) u
                        cross join lateral jsonb_array_elements(u -> 'variantes') v);
  -- ---- Lo que entra (ADR-0393): el papel, las prendas, el costo atípico, los lotes, el stock y lo que faltó o sobró. Es el ÚNICO
  -- camino que escribe stock de un envío. ----
  perform retail.fn_recepcion_entrar(p_despacho_id, v_despacho.ubicacion_destino_id, v_despacho.numero_guia, v_envio, v_actor,
                                     v_unidades, v_variantes, v_nota);

  -- ---- ADR-0393: lo contado que no entró y se sabe qué es queda pendiente (decisiones 1 y 8). Lo que no se separó no es fila: es
  -- «sin separar», y lo calcula fn_envio_cuentas. ----
  insert into retail.despacho_pendientes (despacho_id, despacho_item_id, extra_posicion, tipo, cantidad, producto_id, descripcion,
                                          anotado_por)
  select p_despacho_id, (x ->> 'despacho_item_id')::uuid, (x ->> 'extra_posicion')::integer, x ->> 'tipo', (x ->> 'cantidad')::integer,
         (x ->> 'producto_id')::uuid, nullif(btrim(coalesce(x ->> 'descripcion', '')), ''), v_actor
    from jsonb_array_elements(coalesce(p_pendientes, '[]'::jsonb)) with ordinality t(x, ord)
   order by ord;

  -- ---- El envío queda recibido (decisión 13: y muestra cómo se cerró). ----
  -- ---- ADR-0362 (fase 5, decisión 14): lo de más marcado como reposición salda las deudas de ese proveedor, de esa categoría y
  -- marca, de la más antigua a la más nueva (por cuándo se anotó el faltante; a igual fecha, el envío de menor número), con el envío de
  -- esta recepción y su sobrante. Las deudas ya están bloqueadas y lo marcado cabe en lo debido (arriba). ----
  declare
    v_sob record;
    v_deu record;
    v_resto integer;
    v_toma integer;
  begin
    for v_sob in
      select x.id, x.proveedor_id, x.categoria_id, x.marca_id, x.cantidad
        from retail.despacho_diferencias x
        left join retail.despacho_items xd on xd.id = x.despacho_item_id
        left join retail.orden_compra_items xi on xi.id = xd.orden_compra_item_id
        left join retail.ordenes_compra xo on xo.id = xi.orden_compra_id
       where x.despacho_id = p_despacho_id and x.tipo = 'sobrante' and x.causa = 'reposicion_faltante'
       order by x.extra_posicion nulls first, xo.numero, xi.posicion
    loop
      v_resto := v_sob.cantidad;
      for v_deu in
        select x.id, x.cantidad - s.resuelto as pendiente
          from retail.despacho_diferencias x
          join retail.despachos dd on dd.id = x.despacho_id
         cross join lateral (select coalesce(sum(r.cantidad), 0)::integer as resuelto
                               from retail.proveedor_deuda_resoluciones r
                              where r.diferencia_id = x.id) s
         where x.tipo = 'faltante' and x.causa = 'no_vino' and x.despacho_id <> p_despacho_id
           and x.proveedor_id = v_sob.proveedor_id and x.categoria_id = v_sob.categoria_id and x.marca_id = v_sob.marca_id
           and x.cantidad > s.resuelto
         order by x.creado_en, dd.numero, x.id
      loop
        exit when v_resto = 0;
        v_toma := least(v_resto, v_deu.pendiente);
        insert into retail.proveedor_deuda_resoluciones (diferencia_id, forma, cantidad, despacho_id, sobrante_id, creado_por)
        values (v_deu.id, 'repuesta', v_toma, p_despacho_id, v_sob.id, v_actor);
        v_resto := v_resto - v_toma;
      end loop;
      if v_resto > 0 then
        raise exception 'Lo marcado como reposición en % ya no cabe en lo que el proveedor debe: recarga la pantalla', v_envio
          using hint = 'recepcion_reposicion_de_mas';
      end if;
    end loop;
  end;

  update retail.despachos d
     set estado = 'cerrado',
         cerrado_por = v_actor,
         cerrado_en = now(),
         nota_recepcion = v_nota,
         recepcion_token = p_token,
         recepcion_huella = v_huella
   where d.id = p_despacho_id;

  v_res := retail.fn_recepcion_resultado(p_despacho_id);

  -- Actividad (ADR-0207), sin montos: «recibió ENV-000061 (32 prendas: 30 buenas, 2 dañadas; 8 por detallar; faltan 2)». Si falla, igual
  -- queda.
  begin
    if (v_res ->> 'unidades')::integer = 0 and (v_res ->> 'por_detallar')::integer = 0 then
      v_desc := 'cerró la ' || v_envio || ' sin prendas';
    elsif (v_res ->> 'unidades')::integer = 0 then
      v_desc := 'recibió ' || v_envio || ' (' || (v_res ->> 'por_detallar')
        || case when (v_res ->> 'por_detallar')::integer = 1 then ' prenda, por detallar' else ' prendas, todas por detallar' end;
    else
      v_desc := 'recibió ' || v_envio || ' (' || (v_res ->> 'unidades')
        || case when (v_res ->> 'unidades')::integer = 1 then ' prenda' else ' prendas' end
        || case when (v_res ->> 'danadas')::integer > 0
                then ': ' || (v_res ->> 'buenas') || case when (v_res ->> 'buenas')::integer = 1 then ' buena, ' else ' buenas, ' end
                     || (v_res ->> 'danadas') || case when (v_res ->> 'danadas')::integer = 1 then ' dañada' else ' dañadas' end
                else '' end
        || case when (v_res ->> 'por_detallar')::integer > 0 then '; ' || (v_res ->> 'por_detallar') || ' por detallar' else '' end;
    end if;
    v_desc := v_desc
      || case when (v_res ->> 'faltan')::integer = 1 then '; falta 1'
              when (v_res ->> 'faltan')::integer > 1 then '; faltan ' || (v_res ->> 'faltan') else '' end
      || case when (v_res ->> 'sobran')::integer = 1 then '; sobra 1'
              when (v_res ->> 'sobran')::integer > 1 then '; sobran ' || (v_res ->> 'sobran') else '' end
      || case when (v_res ->> 'unidades')::integer = 0 and (v_res ->> 'por_detallar')::integer = 0 then '' else ')' end;
    perform retail.fn_actividad_anotar(
      'recibir', 'despacho_recibido', v_desc,
      v_actor, retail.fn_actividad_terminal_ahora(), v_despacho.ubicacion_destino_id, null,
      'despachos', p_despacho_id::text, now(),
      jsonb_build_object('despacho_id', p_despacho_id, 'envio', v_envio, 'unidades', (v_res ->> 'unidades')::integer,
                         'buenas', (v_res ->> 'buenas')::integer, 'danadas', (v_res ->> 'danadas')::integer,
                         'faltan', (v_res ->> 'faltan')::integer, 'sobran', (v_res ->> 'sobran')::integer,
                         'por_detallar', (v_res ->> 'por_detallar')::integer,
                         'ordenes', (select jsonb_agg(distinct retail.fn_orden_compra_numero_texto(o.numero))
                                       from retail.despacho_items di
                                       join retail.orden_compra_items i on i.id = di.orden_compra_item_id
                                       join retail.ordenes_compra o on o.id = i.orden_compra_id
                                      where di.despacho_id = p_despacho_id)),
      'vivo');
  exception when others then
    raise warning 'actividad: no se anotó la recepción del envío % (%)', v_envio, sqlerrm;
  end;

  return v_res;
end;
$$;
comment on function retail.fn_recepcion_cerrar(uuid, uuid, jsonb, jsonb, text, uuid, text) is
  'ADR-0393: el cierre de un envío abierto y ya validado —reposición de la fase 5a, lo que entra (fn_recepcion_entrar), los pendientes, '
  'el saldo de las deudas, el envío cerrado y la actividad—. Lo usan recibir_despacho y cerrar_conteo_envio. Interna.';
revoke all on function retail.fn_recepcion_cerrar(uuid, uuid, jsonb, jsonb, text, uuid, text) from public, anon, authenticated;

-- ---------- 8. recibir_despacho: la misma firma y la misma respuesta, sobre el cierre único ----------
create or replace function retail.recibir_despacho(
  p_despacho_id uuid,
  p_version integer,
  p_lineas jsonb,
  p_extras jsonb default '[]'::jsonb,
  p_nota text default null,
  p_token uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_despacho retail.despachos;
  v_envio text;
  v_extras jsonb := coalesce(p_extras, '[]'::jsonb);
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_huella text;
  v_proveedores uuid[];
  v_unidades jsonb := '[]'::jsonb;
  v_vistas uuid[] := '{}';
  v_e jsonb;
  v_pos integer;
  v_item record;
  v_id uuid;
  v_costo numeric;
  v_vars jsonb;
  v_contado integer;
  v_falt text;
  v_sobr text;
  v_nota_u text;
  v_donde text;
  v_prov uuid;
  v_cat uuid;
  v_marca uuid;
begin
  if retail.fn_ve_modulo('recibir') is not true then
    raise exception 'Recibir un envío necesita el módulo «Recibir mercadería» en tu rol'
      using errcode = '42501', hint = 'recibir_sin_modulo';
  end if;

  -- Candados, siempre en el mismo orden (ADR-0190): el envío → sus órdenes → sus líneas pedidas → los comprobantes y sus líneas →
  -- las variantes → el stock. Primero el envío: dos personas cerrando a la vez se ponen en fila y la segunda ve lo que dejó la primera.
  select d.* into v_despacho from retail.despachos d where d.id = p_despacho_id for update;
  if not found then
    raise exception 'Ese envío no existe' using hint = 'envio_no_existe';
  end if;
  v_envio := retail.fn_envio_numero_texto(v_despacho.numero);

  -- Doble clic o reintento sin red: la misma recepción (mismo token, misma huella) ya se guardó y se devuelve lo mismo, aunque quien
  -- la hizo ya no esté de turno (comprobar algo guardado no escribe nada). El mismo token con otros datos no es un reintento.
  v_huella := md5(jsonb_build_object('lineas', p_lineas, 'extras', v_extras, 'nota', p_nota)::text);
  if p_token is not null then
    if v_despacho.recepcion_token = p_token then
      if v_despacho.recepcion_huella = v_huella then
        return retail.fn_recepcion_resultado(v_despacho.id);
      end if;
      raise exception 'Esa recepción ya se guardó con otros datos: recarga la pantalla' using hint = 'recepcion_otros_datos';
    end if;
    if exists (select 1 from retail.despachos d where d.recepcion_token = p_token and d.id <> p_despacho_id) then
      raise exception 'Esa recepción ya se guardó con otros datos: recarga la pantalla' using hint = 'recepcion_otros_datos';
    end if;
  end if;

  if v_despacho.estado = 'cerrado' then
    raise exception 'Este envío ya se recibió' using hint = 'envio_ya_recibido';
  end if;
  if v_despacho.estado = 'anulado' then
    raise exception 'Este envío se anuló: ya no llega' using hint = 'envio_anulado';
  end if;
  if v_despacho.estado = 'en_camino' then
    raise exception 'Este envío todavía no se abrió: pulsa «Empezar a recibir»' using hint = 'envio_sin_abrir';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  perform retail.fn_recepcion_exigir(v_despacho.id, v_despacho.ubicacion_destino_id, v_actor);
  if p_version is null then
    raise exception 'Falta saber qué versión del envío viste: recarga la pantalla' using hint = 'envio_sin_version';
  end if;
  if v_despacho.version <> p_version then
    raise exception 'Alguien cambió este envío: recarga' using errcode = 'PT409', hint = 'version_cambiada';
  end if;
  if v_nota is not null and length(v_nota) > 500 then
    raise exception 'La nota es muy larga: hasta 500 letras' using hint = 'recepcion_nota';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' then
    raise exception 'Falta lo que se contó de cada línea: recarga la pantalla' using hint = 'recepcion_lineas';
  end if;
  if jsonb_typeof(v_extras) <> 'array' then
    raise exception 'Lo que no estaba en la guía no se entiende: recarga la pantalla' using hint = 'recepcion_extra';
  end if;

  -- Las órdenes del envío (nadie las anula, edita ni les registra papel mientras se recibe) y sus líneas pedidas.
  perform 1
     from retail.ordenes_compra o
    where o.id in (select i.orden_compra_id
                     from retail.despacho_items di
                     join retail.orden_compra_items i on i.id = di.orden_compra_item_id
                    where di.despacho_id = p_despacho_id)
    order by o.id
      for share;
  perform 1
     from retail.orden_compra_items i
    where i.id in (select di.orden_compra_item_id from retail.despacho_items di where di.despacho_id = p_despacho_id)
    order by i.id
      for update;
  v_proveedores := array(select distinct o.proveedor_id
                           from retail.despacho_items di
                           join retail.orden_compra_items i on i.id = di.orden_compra_item_id
                           join retail.ordenes_compra o on o.id = i.orden_compra_id
                          where di.despacho_id = p_despacho_id);

  -- ---- Las líneas del envío: todas, una sola vez. Solo la forma y las cuentas; las prendas se miran con los candados tomados. ----
  v_pos := 0;
  for v_e in select e.value from jsonb_array_elements(p_lineas) e loop
    v_pos := v_pos + 1;
    if jsonb_typeof(v_e) <> 'object' then
      raise exception 'La línea % no se entiende: recarga la pantalla', v_pos using hint = 'recepcion_lineas';
    end if;
    begin
      v_id := nullif(btrim(v_e ->> 'despacho_item_id'), '')::uuid;
    exception when others then
      raise exception 'La línea % no se entiende: recarga la pantalla', v_pos using hint = 'recepcion_lineas';
    end;
    select di.id, di.cantidad, di.precio_unitario, di.categoria_id, di.marca_id, di.compra_item_id, di.orden_compra_item_id,
           i.posicion, o.numero as orden_numero, o.proveedor_id,
           concat_ws(' · ', c.nombre, m.nombre, di.descripcion) as etiqueta
      into v_item
      from retail.despacho_items di
      join retail.orden_compra_items i on i.id = di.orden_compra_item_id
      join retail.ordenes_compra o on o.id = i.orden_compra_id
      join retail.categorias c on c.id = di.categoria_id
      join retail.marcas m on m.id = di.marca_id
     where di.id = v_id and di.despacho_id = p_despacho_id;
    if not found then
      raise exception 'La línea % no es de este envío: recarga la pantalla', v_pos using hint = 'recepcion_linea_ajena';
    end if;
    if v_id = any(v_vistas) then
      raise exception 'La línea % se repite: cada línea del envío va una sola vez', v_pos using hint = 'recepcion_linea_repetida';
    end if;
    v_vistas := v_vistas || v_id;
    v_donde := v_item.etiqueta;

    begin
      v_costo := nullif(btrim(v_e ->> 'costo_unitario'), '')::numeric;
    exception when others then
      raise exception 'El costo de % no se entiende: escribe solo números', v_donde using hint = 'recepcion_costo';
    end;
    v_costo := coalesce(v_costo, v_item.precio_unitario);
    if v_costo < 0 or v_costo > 99999.99 or v_costo <> round(v_costo, 2) then
      raise exception 'El costo de % va de S/ 0 a S/ 99 999.99, con hasta dos decimales', v_donde using hint = 'recepcion_costo';
    end if;
    v_vars := retail.fn_recepcion_leer_variantes(v_e -> 'variantes', v_donde);
    v_contado := coalesce((select sum((x ->> 'cantidad')::integer) from jsonb_array_elements(v_vars) x), 0);
    v_falt := nullif(btrim(coalesce(v_e ->> 'faltante_causa', '')), '');
    v_sobr := nullif(btrim(coalesce(v_e ->> 'sobrante_causa', '')), '');
    v_nota_u := nullif(btrim(coalesce(v_e ->> 'nota', '')), '');

    -- Lo que faltó (decisión 14) o sobró (decisión 15): la causa la elige quien recibe, y solo cuando hace falta.
    if v_contado < v_item.cantidad then
      if v_falt is null then
        raise exception 'Faltan % de %: elige qué pasó', v_item.cantidad - v_contado, v_donde using hint = 'recepcion_faltante_causa';
      end if;
      if v_falt not in ('no_vino', 'se_perdio', 'otra_sede') then
        raise exception 'No se entiende qué pasó con lo que falta de %: elige una opción', v_donde using hint = 'recepcion_faltante_causa';
      end if;
    elsif v_falt is not null then
      raise exception 'De % no falta nada: quita «qué pasó»', v_donde using hint = 'recepcion_faltante_causa';
    end if;
    if v_contado > v_item.cantidad then
      if v_sobr is null then
        raise exception 'Vinieron % de más de %: elige qué pasa con ellas', v_contado - v_item.cantidad, v_donde
          using hint = 'recepcion_sobrante_causa';
      end if;
      if v_sobr not in ('regalo', 'cobra_aparte', 'proxima_compra', 'reposicion_faltante') then
        raise exception 'No se entiende qué pasa con lo de más de %: elige una opción', v_donde using hint = 'recepcion_sobrante_causa';
      end if;
    elsif v_sobr is not null then
      raise exception 'De % no vino nada de más: quita «qué pasa con lo de más»', v_donde using hint = 'recepcion_sobrante_causa';
    end if;
    if v_nota_u is not null and length(v_nota_u) > 300 then
      raise exception 'La nota de % es muy larga: hasta 300 letras', v_donde using hint = 'recepcion_nota';
    end if;

    v_unidades := v_unidades || jsonb_build_object(
      'tipo', 'linea', 'despacho_item_id', v_item.id, 'extra', null, 'orden_numero', v_item.orden_numero, 'posicion', v_item.posicion,
      'orden_compra_item_id', v_item.orden_compra_item_id, 'compra_item_id', v_item.compra_item_id,
      'proveedor_id', v_item.proveedor_id, 'categoria_id', v_item.categoria_id, 'marca_id', v_item.marca_id,
      'enviado', v_item.cantidad, 'costo', v_costo,
      'confirma', coalesce(lower(v_e ->> 'confirma_costo') = 'true', false),
      'variantes', v_vars, 'contado', v_contado, 'faltante_causa', v_falt, 'sobrante_causa', v_sobr, 'nota', v_nota_u,
      'donde', v_donde);
  end loop;
  for v_item in
    select di.id, i.posicion, o.numero as orden_numero, concat_ws(' · ', c.nombre, m.nombre, di.descripcion) as etiqueta
      from retail.despacho_items di
      join retail.orden_compra_items i on i.id = di.orden_compra_item_id
      join retail.ordenes_compra o on o.id = i.orden_compra_id
      join retail.categorias c on c.id = di.categoria_id
      join retail.marcas m on m.id = di.marca_id
     where di.despacho_id = p_despacho_id and not (di.id = any(v_vistas))
     order by o.numero, i.posicion
     limit 1
  loop
    raise exception 'Falta contar % (línea % de la %): cuéntala, aunque no haya llegado nada', v_item.etiqueta, v_item.posicion,
      retail.fn_orden_compra_numero_texto(v_item.orden_numero) using hint = 'recepcion_falta_linea';
  end loop;

  -- ---- Lo que no estaba en la guía (decisión 13): todo sobra, con su causa. ----
  v_pos := 0;
  for v_e in select e.value from jsonb_array_elements(v_extras) e loop
    v_pos := v_pos + 1;
    v_donde := 'lo que no estaba en la guía (fila ' || v_pos || ')';
    if jsonb_typeof(v_e) <> 'object' then
      raise exception 'No se entiende %: recarga la pantalla', v_donde using hint = 'recepcion_extra';
    end if;
    begin
      v_prov := nullif(btrim(v_e ->> 'proveedor_id'), '')::uuid;
      v_cat := nullif(btrim(v_e ->> 'categoria_id'), '')::uuid;
      v_marca := nullif(btrim(v_e ->> 'marca_id'), '')::uuid;
    exception when others then
      raise exception 'No se entiende %: recarga la pantalla', v_donde using hint = 'recepcion_extra';
    end;
    if v_prov is null then
      if cardinality(v_proveedores) <> 1 then
        raise exception 'Este envío trae varios proveedores: elige de cuál es %', v_donde using hint = 'recepcion_extra_proveedor';
      end if;
      v_prov := v_proveedores[1];
    elsif not (v_prov = any(v_proveedores)) then
      raise exception 'El proveedor de % no viene en este envío: elige uno de los del envío', v_donde using hint = 'recepcion_extra_proveedor';
    end if;
    if v_cat is null or not exists (select 1 from retail.categorias c where c.id = v_cat and c.activo) then
      raise exception 'Elige una categoría activa para %', v_donde using hint = 'recepcion_extra_categoria';
    end if;
    if v_marca is null or not exists (select 1 from retail.marcas m where m.id = v_marca and m.activo) then
      raise exception 'Elige una marca activa para %', v_donde using hint = 'recepcion_extra_marca';
    end if;
    v_donde := concat_ws(' · ', (select c.nombre from retail.categorias c where c.id = v_cat),
                         (select m.nombre from retail.marcas m where m.id = v_marca)) || ' (fuera de la guía)';
    begin
      v_costo := nullif(btrim(v_e ->> 'costo_unitario'), '')::numeric;
    exception when others then
      raise exception 'El costo de % no se entiende: escribe solo números', v_donde using hint = 'recepcion_costo';
    end;
    if v_costo is null then
      raise exception 'Escribe el costo de %', v_donde using hint = 'recepcion_costo';
    end if;
    if v_costo < 0 or v_costo > 99999.99 or v_costo <> round(v_costo, 2) then
      raise exception 'El costo de % va de S/ 0 a S/ 99 999.99, con hasta dos decimales', v_donde using hint = 'recepcion_costo';
    end if;
    v_vars := retail.fn_recepcion_leer_variantes(v_e -> 'variantes', v_donde);
    v_contado := coalesce((select sum((x ->> 'cantidad')::integer) from jsonb_array_elements(v_vars) x), 0);
    if v_contado = 0 then
      raise exception 'Cuenta lo que llegó de % o quítalo', v_donde using hint = 'recepcion_extra_vacio';
    end if;
    v_sobr := nullif(btrim(coalesce(v_e ->> 'sobrante_causa', '')), '');
    if v_sobr is null or v_sobr not in ('regalo', 'cobra_aparte', 'proxima_compra', 'reposicion_faltante') then
      raise exception 'Elige qué pasa con %', v_donde using hint = 'recepcion_sobrante_causa';
    end if;
    v_nota_u := nullif(btrim(coalesce(v_e ->> 'nota', '')), '');
    if v_nota_u is not null and length(v_nota_u) > 300 then
      raise exception 'La nota de % es muy larga: hasta 300 letras', v_donde using hint = 'recepcion_nota';
    end if;
    v_unidades := v_unidades || jsonb_build_object(
      'tipo', 'extra', 'despacho_item_id', null, 'extra', v_pos, 'orden_numero', null, 'posicion', null,
      'orden_compra_item_id', null, 'compra_item_id', null,
      'proveedor_id', v_prov, 'categoria_id', v_cat, 'marca_id', v_marca,
      'enviado', 0, 'costo', v_costo,
      'confirma', coalesce(lower(v_e ->> 'confirma_costo') = 'true', false),
      'variantes', v_vars, 'contado', v_contado, 'faltante_causa', null, 'sobrante_causa', v_sobr, 'nota', v_nota_u,
      'donde', v_donde);
  end loop;

  -- ADR-0393: lo recibido con este formulario queda también como el conteo de cada línea (todo detallado, con su costo), igual que
  -- si se hubiera contado con la cara A: todo envío cerrado se lee de la misma forma.
  perform retail.fn_recepcion_conteos_detallados(p_despacho_id, v_unidades, v_actor);

  -- ---- El cierre (ADR-0393): el mismo que el del conteo guardado. Con este formulario todo llega detallado: no deja pendientes. ----
  return retail.fn_recepcion_cerrar(p_despacho_id, v_actor, v_unidades, '[]'::jsonb, v_nota, p_token, v_huella);
end;
$$;
comment on function retail.recibir_despacho(uuid, integer, jsonb, jsonb, text, uuid) is
  'ADR-0362 (fases 4 y 5) y ADR-0393: cierra la recepción de un envío abierto con todo detallado. Por línea (todas, una vez): lo contado '
  'talla por talla (buenas al almacén, dañadas a la cuarentena con su fila en prendas_danadas), el costo corregido (promedio '
  'ponderado), lo que faltó o sobró con su causa; y lo que no estaba en la guía. Un sobrante «reposicion_faltante» (fase 5) solo vale si '
  'ese proveedor debe eso de esa categoría y marca por envíos anteriores, y salda sus deudas de la más antigua a la más nueva. Deja el '
  'conteo de cada línea todo detallado y cierra con fn_recepcion_cerrar (el mismo cierre de cerrar_conteo_envio). Costo atípico: hint '
  'recepcion_costo_atipico con el detalle en JSON. Módulo Recibir, su sede y la decisión 17. Token + huella; versión vieja: PT409. '
  'Devuelve fn_recepcion_resultado: {despacho_id, numero, lotes, unidades, buenas, danadas, faltan, sobran, contadas, por_detallar}.';
revoke all on function retail.recibir_despacho(uuid, integer, jsonb, jsonb, text, uuid) from public, anon;
grant execute on function retail.recibir_despacho(uuid, integer, jsonb, jsonb, text, uuid) to authenticated, service_role;

-- ---------- 9. Cerrar lo contado con la cara A ----------
create or replace function retail.cerrar_conteo_envio(
  p_despacho_id uuid,
  p_version integer,
  p_lineas jsonb,
  p_nota text default null,
  p_token uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_despacho retail.despachos;
  v_envio text;
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_huella text;
  v_decide jsonb := '{}'::jsonb;
  v_unidades jsonb := '[]'::jsonb;
  v_pendientes jsonb := '[]'::jsonb;
  v_e jsonb;
  v_pos integer;
  v_id uuid;
  v_extra integer;
  v_version integer;
  v_k record;
  v_d jsonb;
  v_costo numeric;
  v_falt text;
  v_sobr text;
  v_nota_u text;
  v_sep jsonb;
  v_vars jsonb;
  v_p jsonb;
  v_prenda record;
begin
  if retail.fn_ve_modulo('recibir') is not true then
    raise exception 'Cerrar el conteo de un envío necesita el módulo «Recibir mercadería» en tu rol'
      using errcode = '42501', hint = 'recibir_sin_modulo';
  end if;

  -- Candados, siempre en el mismo orden (ADR-0190): el envío → sus órdenes → sus líneas pedidas → (en el cierre) el papel, las
  -- variantes y el stock. Con el envío tomado así, nadie guarda una línea mientras se cierra (guardar_conteo_envio lo toma compartido).
  select d.* into v_despacho from retail.despachos d where d.id = p_despacho_id for update;
  if not found then
    raise exception 'Ese envío no existe' using hint = 'envio_no_existe';
  end if;
  v_envio := retail.fn_envio_numero_texto(v_despacho.numero);

  -- Doble clic o reintento sin red: el mismo cierre (mismo token, misma huella) devuelve lo mismo, aunque quien lo hizo ya no esté de
  -- turno. El mismo token con otros datos no es un reintento.
  v_huella := md5(jsonb_build_object('cierre', 'conteo', 'lineas', p_lineas, 'nota', p_nota)::text);
  if p_token is not null then
    if v_despacho.recepcion_token = p_token then
      if v_despacho.recepcion_huella = v_huella then
        return retail.fn_recepcion_resultado(v_despacho.id);
      end if;
      raise exception 'Ese cierre ya se guardó con otros datos: recarga la pantalla' using hint = 'recepcion_otros_datos';
    end if;
    if exists (select 1 from retail.despachos d where d.recepcion_token = p_token and d.id <> p_despacho_id) then
      raise exception 'Ese cierre ya se guardó con otros datos: recarga la pantalla' using hint = 'recepcion_otros_datos';
    end if;
  end if;

  if v_despacho.estado = 'cerrado' then
    raise exception 'Este envío ya se recibió' using hint = 'envio_ya_recibido';
  end if;
  if v_despacho.estado = 'anulado' then
    raise exception 'Este envío se anuló: ya no llega' using hint = 'envio_anulado';
  end if;
  if v_despacho.estado = 'en_camino' then
    raise exception 'Este envío todavía no se abrió: pulsa «Empezar a recibir»' using hint = 'envio_sin_abrir';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  perform retail.fn_recepcion_exigir(v_despacho.id, v_despacho.ubicacion_destino_id, v_actor);
  if p_version is null then
    raise exception 'Falta saber qué versión del envío viste: recarga la pantalla' using hint = 'envio_sin_version';
  end if;
  if v_despacho.version <> p_version then
    raise exception 'Alguien cambió este envío: recarga' using errcode = 'PT409', hint = 'version_cambiada';
  end if;
  if v_nota is not null and length(v_nota) > 500 then
    raise exception 'La nota es muy larga: hasta 500 letras' using hint = 'recepcion_nota';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' then
    raise exception 'Falta lo que decidiste de cada línea: recarga la pantalla' using hint = 'recepcion_lineas';
  end if;

  -- Las órdenes del envío (nadie las anula, edita ni les registra papel mientras se recibe) y sus líneas pedidas.
  perform 1
     from retail.ordenes_compra o
    where o.id in (select i.orden_compra_id
                     from retail.despacho_items di
                     join retail.orden_compra_items i on i.id = di.orden_compra_item_id
                    where di.despacho_id = p_despacho_id)
    order by o.id
      for share;
  perform 1
     from retail.orden_compra_items i
    where i.id in (select di.orden_compra_item_id from retail.despacho_items di where di.despacho_id = p_despacho_id)
    order by i.id
      for update;

  -- Toda línea del envío se contó, aunque sea en 0 («no llegó nada» también es un número).
  for v_k in
    select concat_ws(' · ', c.nombre, m.nombre, di.descripcion) as etiqueta, i.posicion, o.numero as orden_numero
      from retail.despacho_items di
      join retail.orden_compra_items i on i.id = di.orden_compra_item_id
      join retail.ordenes_compra o on o.id = i.orden_compra_id
      join retail.categorias c on c.id = di.categoria_id
      join retail.marcas m on m.id = di.marca_id
     where di.despacho_id = p_despacho_id
       and not exists (select 1 from retail.despacho_conteos k where k.despacho_id = p_despacho_id and k.despacho_item_id = di.id)
     order by o.numero, i.posicion
     limit 1
  loop
    raise exception 'Falta contar % (línea % de la %): cuéntala, aunque no haya llegado nada', v_k.etiqueta, v_k.posicion,
      retail.fn_orden_compra_numero_texto(v_k.orden_numero) using hint = 'recepcion_falta_linea';
  end loop;

  -- Lo que decidió quien cierra, por conteo: cada uno una vez y con la versión que vio. Si alguien guardó una línea después, no se
  -- cierra (firmar es certificar lo que se vio, decisión 9).
  v_pos := 0;
  for v_e in select e.value from jsonb_array_elements(p_lineas) e loop
    v_pos := v_pos + 1;
    if jsonb_typeof(v_e) <> 'object' then
      raise exception 'La línea % no se entiende: recarga la pantalla', v_pos using hint = 'recepcion_lineas';
    end if;
    begin
      v_id := nullif(btrim(v_e ->> 'despacho_item_id'), '')::uuid;
      v_extra := nullif(btrim(v_e ->> 'extra_posicion'), '')::integer;
      v_version := nullif(btrim(v_e ->> 'version'), '')::integer;
    exception when others then
      raise exception 'La línea % no se entiende: recarga la pantalla', v_pos using hint = 'recepcion_lineas';
    end;
    if (v_id is null) = (v_extra is null) or v_version is null then
      raise exception 'La línea % no se entiende: recarga la pantalla', v_pos using hint = 'recepcion_lineas';
    end if;
    select k.id, k.version, retail.fn_envio_persona(k.contado_por) ->> 'nombre' as quien,
           concat_ws(' · ', c.nombre, m.nombre, di.descripcion) as etiqueta
      into v_k
      from retail.despacho_conteos k
      left join retail.despacho_items di on di.id = k.despacho_item_id
      join retail.categorias c on c.id = coalesce(di.categoria_id, k.categoria_id)
      join retail.marcas m on m.id = coalesce(di.marca_id, k.marca_id)
     where k.despacho_id = p_despacho_id
       and (k.despacho_item_id = v_id or k.extra_posicion = v_extra);
    if not found then
      raise exception 'La línea % no es de este envío: recarga la pantalla', v_pos using hint = 'recepcion_linea_ajena';
    end if;
    if v_decide ? (v_k.id::text) then
      raise exception 'La línea % se repite: cada línea del envío va una sola vez', v_pos using hint = 'recepcion_linea_repetida';
    end if;
    if v_k.version <> v_version then
      raise exception '% cambió mientras cerrabas (lo guardó %): revisa y vuelve a cerrar', v_k.etiqueta, coalesce(v_k.quien, 'otra persona')
        using errcode = 'PT409', hint = 'conteo_cambiado';
    end if;
    v_decide := v_decide || jsonb_build_object(v_k.id::text, v_e);
  end loop;
  for v_k in
    select retail.fn_envio_persona(k.contado_por) ->> 'nombre' as quien, concat_ws(' · ', c.nombre, m.nombre, di.descripcion) as etiqueta
      from retail.despacho_conteos k
      left join retail.despacho_items di on di.id = k.despacho_item_id
      join retail.categorias c on c.id = coalesce(di.categoria_id, k.categoria_id)
      join retail.marcas m on m.id = coalesce(di.marca_id, k.marca_id)
     where k.despacho_id = p_despacho_id and not (v_decide ? (k.id::text))
     order by k.extra_posicion nulls first, k.contado_en
     limit 1
  loop
    raise exception '% se contó mientras cerrabas (lo guardó %): revisa y vuelve a cerrar', v_k.etiqueta, coalesce(v_k.quien, 'otra persona')
      using errcode = 'PT409', hint = 'conteo_cambiado';
  end loop;

  -- ---- Cada conteo, en el orden del envío: lo detallado entra, lo demás queda pendiente, y lo contado se mide contra lo enviado. ----
  for v_k in
    select k.id, k.despacho_item_id, k.extra_posicion, k.contadas, k.separado, k.costo_unitario,
           di.cantidad as enviado, di.precio_unitario, di.compra_item_id, di.orden_compra_item_id, i.posicion, o.numero as orden_numero,
           coalesce(o.proveedor_id, k.proveedor_id) as proveedor_id, coalesce(di.categoria_id, k.categoria_id) as categoria_id,
           coalesce(di.marca_id, k.marca_id) as marca_id,
           case when k.despacho_item_id is not null then concat_ws(' · ', c.nombre, m.nombre, di.descripcion)
                else concat_ws(' · ', c.nombre, m.nombre) || ' (fuera de la guía)' end as donde
      from retail.despacho_conteos k
      left join retail.despacho_items di on di.id = k.despacho_item_id
      left join retail.orden_compra_items i on i.id = di.orden_compra_item_id
      left join retail.ordenes_compra o on o.id = i.orden_compra_id
      join retail.categorias c on c.id = coalesce(di.categoria_id, k.categoria_id)
      join retail.marcas m on m.id = coalesce(di.marca_id, k.marca_id)
     where k.despacho_id = p_despacho_id
     order by k.extra_posicion nulls first, o.numero, i.posicion
  loop
    v_d := v_decide -> (v_k.id::text);
    -- Lo de fuera de la guía que quedó en 0 se quitó al contar: ni entra ni sobra.
    if v_k.extra_posicion is not null and v_k.contadas = 0 then
      continue;
    end if;

    -- El costo (decisión 6 de Felipe y 18 de ADR-0362): lo ve y lo corrige quien cierra; una línea pedida trae el de su orden.
    begin
      v_costo := nullif(btrim(v_d ->> 'costo_unitario'), '')::numeric;
    exception when others then
      raise exception 'El costo de % no se entiende: escribe solo números', v_k.donde using hint = 'recepcion_costo';
    end;
    if v_k.despacho_item_id is not null then
      v_costo := coalesce(v_costo, v_k.precio_unitario);
    elsif v_costo is null then
      raise exception 'Escribe el costo de %', v_k.donde using hint = 'recepcion_costo';
    end if;
    if v_costo < 0 or v_costo > 99999.99 or v_costo <> round(v_costo, 2) then
      raise exception 'El costo de % va de S/ 0 a S/ 99 999.99, con hasta dos decimales', v_k.donde using hint = 'recepcion_costo';
    end if;

    -- Lo que faltó (decisión 14) o sobró (decisión 15) se mide con lo CONTADO, no con lo que ya tiene tallas.
    v_falt := nullif(btrim(coalesce(v_d ->> 'faltante_causa', '')), '');
    v_sobr := nullif(btrim(coalesce(v_d ->> 'sobrante_causa', '')), '');
    v_nota_u := nullif(btrim(coalesce(v_d ->> 'nota', '')), '');
    if v_k.contadas < coalesce(v_k.enviado, 0) then
      if v_falt is null then
        raise exception 'Faltan % de %: elige qué pasó', v_k.enviado - v_k.contadas, v_k.donde using hint = 'recepcion_faltante_causa';
      end if;
      if v_falt not in ('no_vino', 'se_perdio', 'otra_sede') then
        raise exception 'No se entiende qué pasó con lo que falta de %: elige una opción', v_k.donde using hint = 'recepcion_faltante_causa';
      end if;
    elsif v_falt is not null then
      raise exception 'De % no falta nada: quita «qué pasó»', v_k.donde using hint = 'recepcion_faltante_causa';
    end if;
    if v_k.contadas > coalesce(v_k.enviado, 0) then
      if v_sobr is null then
        raise exception 'Vinieron % de más de %: elige qué pasa con ellas', v_k.contadas - coalesce(v_k.enviado, 0), v_k.donde
          using hint = 'recepcion_sobrante_causa';
      end if;
      if v_sobr not in ('regalo', 'cobra_aparte', 'proxima_compra', 'reposicion_faltante') then
        raise exception 'No se entiende qué pasa con lo de más de %: elige una opción', v_k.donde using hint = 'recepcion_sobrante_causa';
      end if;
    elsif v_sobr is not null then
      raise exception 'De % no vino nada de más: quita «qué pasa con lo de más»', v_k.donde using hint = 'recepcion_sobrante_causa';
    end if;
    if v_nota_u is not null and length(v_nota_u) > 300 then
      raise exception 'La nota de % es muy larga: hasta 300 letras', v_k.donde using hint = 'recepcion_nota';
    end if;

    -- Lo separado: lo que trae tallas y colores entra (decisión 1); una prenda sin tallas queda «por detallar» y lo nuevo «por crear»
    -- (decisión 8). Lo que no se separó queda «sin separar» (no es fila: es lo que sobra de lo contado).
    v_sep := retail.fn_envio_leer_separado(v_k.separado, v_k.donde);
    v_vars := retail.fn_recepcion_leer_variantes(
      coalesce((select jsonb_agg(w.v order by p.po, w.vo)
                  from jsonb_array_elements(v_sep -> 'prendas') with ordinality p(x, po)
                 cross join lateral jsonb_array_elements(case when jsonb_typeof(p.x -> 'variantes') = 'array' then p.x -> 'variantes'
                                                              else '[]'::jsonb end) with ordinality w(v, vo)), '[]'::jsonb),
      v_k.donde);
    for v_p in
      select p.x from jsonb_array_elements(v_sep -> 'prendas') with ordinality p(x, po)
       where jsonb_typeof(p.x -> 'variantes') is distinct from 'array'
       order by p.po
    loop
      select pr.estado, pr.estado_alta,
             (pr.categoria_id is not distinct from v_k.categoria_id and pr.marca_id is not distinct from v_k.marca_id) as de_la_linea
        into v_prenda
        from retail.productos pr
       where pr.id = (v_p ->> 'producto_id')::uuid;
      if not found then
        raise exception 'Una de las prendas de % ya no existe: recarga la pantalla', v_k.donde using hint = 'recepcion_prenda_no_existe';
      end if;
      if not v_prenda.de_la_linea then
        raise exception 'Una de las prendas de % es de otra categoría o marca: elígela de nuevo', v_k.donde
          using hint = 'recepcion_prenda_ajena';
      end if;
      if v_prenda.estado <> 'activo' or v_prenda.estado_alta = 'rechazado' then
        raise exception 'Una de las prendas de % no está activa: elígela de nuevo', v_k.donde using hint = 'recepcion_prenda_inactiva';
      end if;
      v_pendientes := v_pendientes || jsonb_build_object(
        'despacho_item_id', v_k.despacho_item_id, 'extra_posicion', v_k.extra_posicion, 'tipo', 'detalle',
        'cantidad', (v_p ->> 'cantidad')::integer, 'producto_id', v_p ->> 'producto_id', 'descripcion', null);
    end loop;
    v_pendientes := v_pendientes || coalesce((
      select jsonb_agg(jsonb_build_object(
               'despacho_item_id', v_k.despacho_item_id, 'extra_posicion', v_k.extra_posicion, 'tipo', 'crear',
               'cantidad', (n.x ->> 'cantidad')::integer, 'producto_id', null, 'descripcion', n.x ->> 'descripcion') order by n.no)
        from jsonb_array_elements(v_sep -> 'nuevas') with ordinality n(x, no)), '[]'::jsonb);

    -- El costo con el que cierra la línea queda en su conteo: lo que se detalle después entra con él (decisión 6).
    if v_k.costo_unitario is distinct from v_costo then
      update retail.despacho_conteos k set costo_unitario = v_costo where k.id = v_k.id;
    end if;

    v_unidades := v_unidades || jsonb_build_object(
      'tipo', case when v_k.despacho_item_id is null then 'extra' else 'linea' end,
      'despacho_item_id', v_k.despacho_item_id, 'extra', v_k.extra_posicion, 'orden_numero', v_k.orden_numero, 'posicion', v_k.posicion,
      'orden_compra_item_id', v_k.orden_compra_item_id, 'compra_item_id', v_k.compra_item_id,
      'proveedor_id', v_k.proveedor_id, 'categoria_id', v_k.categoria_id, 'marca_id', v_k.marca_id,
      'enviado', coalesce(v_k.enviado, 0), 'costo', v_costo,
      'confirma', coalesce(lower(v_d ->> 'confirma_costo') = 'true', false),
      'variantes', v_vars, 'contado', v_k.contadas, 'faltante_causa', v_falt, 'sobrante_causa', v_sobr, 'nota', v_nota_u,
      'donde', v_k.donde);
  end loop;

  return retail.fn_recepcion_cerrar(p_despacho_id, v_actor, v_unidades, v_pendientes, v_nota, p_token, v_huella);
end;
$$;
comment on function retail.cerrar_conteo_envio(uuid, integer, jsonb, text, uuid) is
  'ADR-0393: cierra un envío abierto con lo guardado por guardar_conteo_envio. p_lineas = [{despacho_item_id | extra_posicion, version '
  '(la del conteo que viste), costo_unitario (una línea pedida trae el de su orden), confirma_costo, faltante_causa, sobrante_causa, '
  'nota}], uno por conteo. Lo separado con tallas entra al stock como en recibir_despacho; sin tallas queda pendiente «detalle», lo nuevo '
  '«crear» y lo no separado, «sin separar». Lo que faltó o sobró se mide con lo contado. Un conteo que cambió o apareció después de lo '
  'que viste: PT409 conteo_cambiado. Módulo Recibir, su sede y la decisión 17; firma el responsable. Token + huella. Devuelve '
  'fn_recepcion_resultado.';
revoke all on function retail.cerrar_conteo_envio(uuid, integer, jsonb, text, uuid) from public, anon;
grant execute on function retail.cerrar_conteo_envio(uuid, integer, jsonb, text, uuid) to authenticated, service_role;

-- ---------- 10. Comprobación: si algo no quedó, la migración no se da por aplicada ----------
do $$
declare
  v_funcion text;
  v_def text;
  v_marca text;
begin
  if to_regclass('retail.despacho_pendientes') is null then
    raise exception 'falta retail.despacho_pendientes';
  end if;
  if not coalesce((select c.relrowsecurity from pg_class c where c.oid = 'retail.despacho_pendientes'::regclass), false) then
    raise exception 'retail.despacho_pendientes tiene que tener RLS encendido';
  end if;
  if exists (select 1 from pg_policies p where p.schemaname = 'retail' and p.tablename = 'despacho_pendientes') then
    raise exception 'retail.despacho_pendientes no lleva políticas: solo se lee y escribe por funciones';
  end if;
  if has_table_privilege('authenticated', 'retail.despacho_pendientes', 'select')
     or has_table_privilege('anon', 'retail.despacho_pendientes', 'select') then
    raise exception 'retail.despacho_pendientes: ni anon ni authenticated la leen directo';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'retail' and table_name = 'despacho_recibidos' and column_name = 'pendiente_id') then
    raise exception 'falta despacho_recibidos.pendiente_id';
  end if;
  if not exists (select 1 from pg_trigger t where t.tgrelid = 'retail.despacho_pendientes'::regclass and t.tgname = 'despacho_pendientes_fija') then
    raise exception 'falta el disparador despacho_pendientes_fija';
  end if;
  if not exists (select 1 from pg_trigger t where t.tgrelid = 'retail.despacho_recibidos'::regclass and t.tgname = 'despacho_recibidos_cuadra'
                    and t.tgdeferrable and t.tginitdeferred)
     or not exists (select 1 from pg_trigger t where t.tgrelid = 'retail.despacho_pendientes'::regclass
                       and t.tgname = 'despacho_pendientes_cuadra' and t.tgdeferrable and t.tginitdeferred) then
    raise exception 'faltan los candados diferidos despacho_recibidos_cuadra y despacho_pendientes_cuadra';
  end if;
  v_funcion := 'retail.cerrar_conteo_envio(uuid,integer,jsonb,text,uuid)';
  if not (select p.prosecdef from pg_proc p where p.oid = v_funcion::regprocedure) then
    raise exception '% tiene que ser security definer', v_funcion;
  end if;
  if has_function_privilege('anon', v_funcion, 'execute') or not has_function_privilege('authenticated', v_funcion, 'execute') then
    raise exception '%: la ejecuta authenticated y no anon', v_funcion;
  end if;
  foreach v_funcion in array array[
    'retail.fn_recepcion_cerrar(uuid,uuid,jsonb,jsonb,text,uuid,text)', 'retail.fn_envio_cuentas(uuid[])',
    'retail.fn_envio_linea_cuadra()', 'retail.fn_despacho_pendientes_fija()', 'retail.fn_recepcion_despacho_fija()',
    'retail.fn_recepcion_resultado(uuid)'] loop
    if has_function_privilege('authenticated', v_funcion, 'execute') or has_function_privilege('anon', v_funcion, 'execute') then
      raise exception '% es interna: ni authenticated ni anon la ejecutan', v_funcion;
    end if;
  end loop;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'retail' and p.proname in ('cerrar_conteo_envio', 'fn_recepcion_cerrar', 'recibir_despacho', 'fn_envio_cuentas')
              group by p.proname having count(*) > 1) then
    raise exception 'cerrar_conteo_envio, fn_recepcion_cerrar, recibir_despacho o fn_envio_cuentas quedó con dos versiones';
  end if;
  -- recibir_despacho ya no cierra por su cuenta: deja el conteo y llama al cierre único.
  v_def := pg_get_functiondef('retail.recibir_despacho(uuid,integer,jsonb,jsonb,text,uuid)'::regprocedure);
  if position('return retail.fn_recepcion_cerrar(' in v_def) = 0 or position('perform retail.fn_recepcion_conteos_detallados(' in v_def) = 0 then
    raise exception 'recibir_despacho no deja el conteo y cierra con fn_recepcion_cerrar';
  end if;
  if position('fn_recepcion_entrar(' in v_def) > 0 or position('insert into retail.movimientos' in v_def) > 0
     or position('insert into retail.proveedor_deuda_resoluciones' in v_def) > 0 or position('update retail.despachos' in v_def) > 0 then
    raise exception 'recibir_despacho todavía cierra por su cuenta: el cierre único es fn_recepcion_cerrar';
  end if;
  v_marca := $t$'proxima_compra', 'reposicion_faltante')$t$;
  if (length(v_def) - length(replace(v_def, v_marca, ''))) / length(v_marca) <> 2 then
    raise exception 'recibir_despacho perdió la causa «reposicion_faltante» de la fase 5a';
  end if;
  -- El cierre único lleva la reposición de la fase 5a con su texto.
  v_def := pg_get_functiondef('retail.fn_recepcion_cerrar(uuid,uuid,jsonb,jsonb,text,uuid,text)'::regprocedure);
  if position('retail.fn_nos_debe_pendiente(g.proveedor_id' in v_def) = 0
     or position('insert into retail.proveedor_deuda_resoluciones' in v_def) = 0
     or position('perform retail.fn_recepcion_entrar(' in v_def) = 0
     or position('insert into retail.despacho_pendientes' in v_def) = 0 then
    raise exception 'fn_recepcion_cerrar no quedó con la reposición, la entrada y los pendientes';
  end if;
  if position($t$(v_u ->> 'pendiente_id')::uuid$t$ in
              pg_get_functiondef('retail.fn_recepcion_entrar(uuid,uuid,text,text,uuid,jsonb,uuid[],text)'::regprocedure)) = 0 then
    raise exception 'fn_recepcion_entrar no anota el pendiente que resuelve cada entrada';
  end if;
end;
$$;

reset lock_timeout;
