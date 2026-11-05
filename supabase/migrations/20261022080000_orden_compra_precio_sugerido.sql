-- Órdenes de compra: el precio de venta SUGERIDO viaja con la línea (Felipe, 2026-10-22; ADR-0362 decisión 21; diseño
-- `docs/pantallas/compras-ordenes-precio-y-stock.md` §4.7, actividad 2 de 7). Una sola parte.
--
-- EL PROBLEMA PRIMERO. Hoy el precio de venta que sugiere quien compra nace en el COMPROBANTE (`compra_items.precio_venta_sugerido`,
-- decisión 21): la orden no tiene dónde guardarlo, y el comprobante no bloquea nada (decisión 9), así que puede tardar semanas o no
-- llegar. Una prenda que llega sin comprobante llega sin sugerido, y quien recibe escribe el precio a ciegas: justo lo que la compradora
-- pensó al decidir qué comprar se pierde. Felipe decidió (2026-10-21) que el sugerido sea «una propuesta que viaja con la línea»: nace
-- cuando ella piensa en el precio (al armar la orden), llega a quien recibe aunque no haya comprobante, y NUNCA fija el precio de nadie
-- por sí solo: `variantes.precio` solo cambia por las vías de siempre (el alta de la prenda, o la revisión de un líder).
--
-- QUÉ CREA.
--   1. `orden_compra_items.precio_venta_sugerido` (numeric(12,2), nulo = «sin sugerir») y `sugerido_motivos` (text[], nulo = «sin
--      motivo»). Candados de esquema: el sugerido va de 0 a S/ 5 000 (el tope de `variantes.precio`; un NaN o un infinito no pasan, porque
--      `NaN <= 5000` es falso) y los motivos solo existen con un sugerido (de 1 a 8). Los motivos son CÓDIGOS cortos que define la pantalla
--      (el motivo de un precio alto o bajo, ADR-0362 decisión 21 act.): la base no los enumera, para que cambiar una lista de opciones no
--      pida otra migración; solo cuida su forma.
--   2. `fn_orden_compra_motivos(jsonb)`: los motivos como texto sin espacios de más, en el mismo orden, o NULL si no hay. La usan
--      `fn_orden_compra_huella` (lo que llega) y `fn_orden_compra_escribir_lineas` (lo que se guarda), así «igual» significa lo mismo en los dos.
--   3. `fn_orden_compra_validar_sugerido(línea, categoría)`: las reglas del sugerido (hint `orden_compra_sugerido` y
--      `orden_compra_sugerido_motivos`), que `fn_orden_compra_validar` llama por línea: lo que valida crear, lo valida editar. El 0 solo
--      vale en una categoría que admite precio cero (bolsas, cajas, empaque: `fn_categoria_admite_precio_cero`, ADR-0384).
--   4. REEMPLAZOS ANCLADOS sobre la definición viva de siete funciones, que ya tienen parches de otras fases (ver «DESCARTÉ»):
--      · `fn_orden_compra_validar`: llama a la regla de arriba por línea.
--      · `fn_orden_compra_huella` y `fn_orden_compra_huella_guardada`: el sugerido y sus motivos entran en la huella. SIN ESTO, editar solo
--        el sugerido se leería como «no cambió nada» (no se guardaría), y un reintento con otro sugerido devolvería la orden «tal cual».
--      · `fn_orden_compra_escribir_lineas`: guarda las dos columnas.
--      · `fn_orden_compra_detalle`: cada línea las trae (y con ella el archivo de versiones, que es una foto del detalle).
--      · `registrar_comprobante_orden`: una línea del papel que sale de una línea pedida y no trae sugerido HEREDA el de la orden. El que
--        trae el papel manda (quien registra el papel puede corregirlo).
--      · `fn_envio_detalle` (lo que ve quien recibe): el sugerido del papel manda; si no hay papel o no lo trae, el de la orden. Es el
--        tercer y último escalón: la decisión 21 no cambia en lo que ya decía.
--
-- DECIDÍ: el sugerido de la ORDEN es el origen; el del comprobante lo hereda y puede corregirse; la recepción lee el vigente.
-- DESCARTÉ: (a) dejarlo solo en el comprobante, que es el problema de arriba; (b) guardarlo en la orden Y en el comprobante con «gana el
-- segundo» sin herencia: dos verdades que pueden diferir sin que nadie lo vea; (c) reescribir las siete funciones enteras: cinco ya tienen
-- parches vivos de otras fases (comprobante, envíos, «Por repartir», recepción), y copiar su texto a mano pierde lo que otra fase les puso;
-- por eso cada cambio es un reemplazo anclado, como en `20261012211000`: si el texto vivo ya no tiene el ancla, la migración se detiene y
-- no aplica nada (todo va en una transacción); (d) una lista cerrada de motivos en la base: cada lista nueva pediría una migración.
-- SE ROMPE SI: alguien edita a mano una de esas funciones en producción y cambia el texto que se ancla (el reemplazo lo avisa con el
-- nombre de la función y la cuenta de apariciones, y no escribe nada); o si la pantalla manda un sugerido distinto al que quedó guardado y
-- reintenta con el mismo `p_id`: eso es justo el aviso `orden_compra_ya_guardada` (la huella ya lo cuenta).
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Después de 20261021202000. UNA parte: agrega dos columnas a una tabla que solo leen
-- funciones (0 filas hoy), sin políticas ni `drop trigger` (ADR-0195, no toma `auth`/`storage`), con `set lock_timeout = '3s'` y sin
-- `select … into` dentro de textos entre comillas (ADR-0288). Idempotente: las columnas y los candados se agregan solo si faltan, y un
-- reemplazo cuyo texto nuevo ya está en la función se salta. La web publicada ANTES que esta migración no se rompe: la pantalla todavía
-- no manda el sugerido (actividad 4) y el detalle que no lo trae se lee como «sin sugerir».

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 0. El ayudante de los reemplazos anclados (el mismo de 20261012211000) ----------
-- Reemplaza `p_viejo` por `p_nuevo` en la definición VIVA de una función. Si el texto nuevo ya está, no hace nada (re-pegable). Si el
-- ancla aparece distinto número de veces que `p_veces`, se detiene: la función cambió desde que se escribió esta migración.
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

-- Dos reemplazos que solo tienen sentido JUNTOS (una función de lenguaje SQL se valida al crearla: agregar las columnas de un `insert` sin
-- sus valores, o al revés, la rechaza). Mismas reglas que `reemplazar`: re-pegable y se detiene si el texto vivo cambió.
create or replace function pg_temp.reemplazar_dos(p_firma text, p_viejo1 text, p_nuevo1 text, p_viejo2 text, p_nuevo2 text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n1 integer;
  v_n2 integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo1 in v_def) > 0 and position(p_nuevo2 in v_def) > 0 then
    return;
  end if;
  v_n1 := (length(v_def) - length(replace(v_def, p_viejo1, ''))) / length(p_viejo1);
  v_n2 := (length(v_def) - length(replace(v_def, p_viejo2, ''))) / length(p_viejo2);
  if v_n1 <> 1 or v_n2 <> 1 then
    raise exception '% cambió desde que se escribió esta migración: se esperaba 1 aparición de cada ancla y hay % y %. Regenera el reemplazo desde su definición real.',
      p_firma, v_n1, v_n2;
  end if;
  execute replace(replace(v_def, p_viejo1, p_nuevo1), p_viejo2, p_nuevo2);
end;
$f$;

-- ---------- 1. Las dos columnas y sus candados ----------
alter table retail.orden_compra_items add column if not exists precio_venta_sugerido numeric(12, 2);
alter table retail.orden_compra_items add column if not exists sugerido_motivos text[];

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'retail.orden_compra_items'::regclass and conname = 'orden_compra_items_sugerido_tope') then
    alter table retail.orden_compra_items add constraint orden_compra_items_sugerido_tope
      check (precio_venta_sugerido is null or (precio_venta_sugerido >= 0 and precio_venta_sugerido <= 5000));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'retail.orden_compra_items'::regclass and conname = 'orden_compra_items_sugerido_motivos') then
    alter table retail.orden_compra_items add constraint orden_compra_items_sugerido_motivos
      check (sugerido_motivos is null
             or (precio_venta_sugerido is not null
                 and cardinality(sugerido_motivos) between 1 and 8
                 and length(array_to_string(sugerido_motivos, '|')) <= 520));
  end if;
end;
$$;

comment on column retail.orden_compra_items.precio_venta_sugerido is
  'ADR-0362 decisión 21 (2026-10-22): el precio de venta que SUGIERE quien compra, con IGV, para esta línea. Nulo = sin sugerir. Es una propuesta: '
  'no fija el precio de nadie; el comprobante lo hereda (y puede corregirlo) y quien recibe lo ve «sugerido por Compras».';
comment on column retail.orden_compra_items.sugerido_motivos is
  'Los motivos que quien compra dio para ese precio (códigos cortos que define la pantalla: «diseño propio», «rotar rápido»…). Solo con un sugerido. '
  'Se ven en el detalle de la orden y por quien confirma el precio; nunca se suman por persona.';

-- ---------- 2. Los motivos, en una forma comparable ----------
create or replace function retail.fn_orden_compra_motivos(p_valor jsonb) returns text[]
language sql
immutable
as $$
  select case
           when jsonb_typeof(p_valor) = 'array' and jsonb_array_length(p_valor) > 0
             then array(select btrim(m.t) from jsonb_array_elements_text(p_valor) with ordinality as m(t, o) order by m.o)
         end;
$$;
comment on function retail.fn_orden_compra_motivos(jsonb) is
  'Los motivos de un sugerido (arreglo JSON de textos) como text[] sin espacios de más y en el mismo orden; NULL si no hay. Interna.';
revoke all on function retail.fn_orden_compra_motivos(jsonb) from public, anon, authenticated;

-- ---------- 3. Las reglas del sugerido, en UN lugar ----------
-- `p_pos` es el lugar de la línea (para decirlo en el mensaje) y `p_categoria_id` la categoría ya validada de esa línea.
create or replace function retail.fn_orden_compra_validar_sugerido(p_pos integer, p_linea jsonb, p_categoria_id uuid) returns void
language plpgsql
stable
set search_path = retail, public, extensions
as $$
declare
  v_precio numeric;
  v_motivos jsonb := p_linea -> 'sugerido_motivos';
  v_m jsonb;
  v_vistos text[] := '{}';
  v_t text;
begin
  begin
    v_precio := nullif(btrim(p_linea ->> 'precio_venta_sugerido'), '')::numeric;
  exception when others then
    raise exception 'El precio de venta sugerido de la línea % no se entiende: escribe solo el monto, con hasta dos decimales', p_pos
      using hint = 'orden_compra_sugerido';
  end;
  if v_precio is not null then
    -- `NaN` es mayor que cualquier número en Postgres, y un infinito también: los dos caen en el tope.
    if v_precio < 0 or v_precio > 5000 or v_precio <> round(v_precio, 2) then
      raise exception 'El precio de venta sugerido de la línea % va de S/ 0 a S/ 5 000, con hasta dos decimales', p_pos
        using hint = 'orden_compra_sugerido';
    end if;
    -- El 0 solo vale donde el catálogo lo admite (ADR-0384): bolsas, cajas y empaque. Sin dato, no.
    if v_precio = 0 and not coalesce(retail.fn_categoria_admite_precio_cero(p_categoria_id), false) then
      raise exception 'El precio de venta sugerido de la línea % no puede ser 0: solo las bolsas, cajas y empaque se regalan', p_pos
        using hint = 'orden_compra_sugerido';
    end if;
  end if;

  -- Los motivos: nulo o vacío es «sin motivo»; con motivo hace falta el precio.
  if v_motivos is null or jsonb_typeof(v_motivos) = 'null' then
    return;
  end if;
  if jsonb_typeof(v_motivos) <> 'array' then
    raise exception 'Los motivos del precio de la línea % no se entienden', p_pos using hint = 'orden_compra_sugerido_motivos';
  end if;
  if jsonb_array_length(v_motivos) = 0 then
    return;
  end if;
  if v_precio is null then
    raise exception 'La línea % tiene motivos pero no tiene precio sugerido: escribe el precio o quita los motivos', p_pos
      using hint = 'orden_compra_sugerido_motivos';
  end if;
  if jsonb_array_length(v_motivos) > 8 then
    raise exception 'La línea % tiene demasiados motivos: hasta 8', p_pos using hint = 'orden_compra_sugerido_motivos';
  end if;
  for v_m in select e.value from jsonb_array_elements(v_motivos) e loop
    if jsonb_typeof(v_m) <> 'string' then
      raise exception 'Un motivo del precio de la línea % no se entiende', p_pos using hint = 'orden_compra_sugerido_motivos';
    end if;
    v_t := btrim(v_m #>> '{}');
    if v_t = '' or length(v_t) > 60 then
      raise exception 'Cada motivo del precio de la línea % va de 1 a 60 letras', p_pos using hint = 'orden_compra_sugerido_motivos';
    end if;
    if v_t = any (v_vistos) then
      raise exception 'La línea % repite un motivo del precio', p_pos using hint = 'orden_compra_sugerido_motivos';
    end if;
    v_vistos := v_vistos || v_t;
  end loop;
end;
$$;
comment on function retail.fn_orden_compra_validar_sugerido(integer, jsonb, uuid) is
  'ADR-0362 decisión 21: las reglas del precio de venta sugerido y sus motivos de una línea (orden_compra_sugerido / orden_compra_sugerido_motivos). '
  'La llama fn_orden_compra_validar por línea. Interna.';
revoke all on function retail.fn_orden_compra_validar_sugerido(integer, jsonb, uuid) from public, anon, authenticated;

-- ---------- 4. Lo que ya existe, parchado en su lugar ----------
-- 4a. Validar: cada línea pasa por las reglas del sugerido (al final de su turno, con su categoría ya validada).
select pg_temp.reemplazar(
  'retail.fn_orden_compra_validar(uuid,uuid,date,text,jsonb,jsonb)',
  $v$    end if;
  end loop;
end;$v$,
  $v$    end if;
    -- ADR-0362 decisión 21 (2026-10-22): el precio de venta sugerido de la línea y sus motivos.
    perform retail.fn_orden_compra_validar_sugerido(v_pos, v_linea, v_categoria);
  end loop;
end;$v$,
  1);

-- 4b. La huella de lo que llega: el sugerido y sus motivos cuentan como parte del pedido.
select pg_temp.reemplazar(
  'retail.fn_orden_compra_huella(uuid,uuid,date,text,jsonb)',
  $v$'descuento_pct', nullif(btrim(l.valor ->> 'descuento_pct'), '')::numeric$v$,
  $v$'descuento_pct', nullif(btrim(l.valor ->> 'descuento_pct'), '')::numeric,
               'sugerido', nullif(btrim(l.valor ->> 'precio_venta_sugerido'), '')::numeric,
               'sugerido_motivos', to_jsonb(retail.fn_orden_compra_motivos(l.valor -> 'sugerido_motivos'))$v$,
  1);

-- 4c. La huella de lo guardado: las mismas claves.
select pg_temp.reemplazar(
  'retail.fn_orden_compra_huella_guardada(uuid)',
  $v$'descuento_pct', i.descuento_pct$v$,
  $v$'descuento_pct', i.descuento_pct,
               'sugerido', i.precio_venta_sugerido,
               'sugerido_motivos', to_jsonb(i.sugerido_motivos)$v$,
  1);

-- 4d. Escribir las líneas: las dos columnas (la lista de columnas y la de valores se cambian juntas).
select pg_temp.reemplazar_dos(
  'retail.fn_orden_compra_escribir_lineas(uuid,jsonb)',
  $v$precio_unitario, descuento, descuento_pct)$v$,
  $v$precio_unitario, descuento, descuento_pct,
                                       precio_venta_sugerido, sugerido_motivos)$v$,
  $v$nullif(btrim(l.valor ->> 'descuento_pct'), '')::numeric
    from jsonb_array_elements(p_lineas)$v$,
  $v$nullif(btrim(l.valor ->> 'descuento_pct'), '')::numeric,
         nullif(btrim(l.valor ->> 'precio_venta_sugerido'), '')::numeric,
         retail.fn_orden_compra_motivos(l.valor -> 'sugerido_motivos')
    from jsonb_array_elements(p_lineas)$v$);

-- 4e. El detalle: cada línea trae su sugerido y sus motivos (y con él, el archivo de versiones).
select pg_temp.reemplazar(
  'retail.fn_orden_compra_detalle(uuid)',
  $v$'descuento_pct', i.descuento_pct,$v$,
  $v$'descuento_pct', i.descuento_pct,
                      'precio_venta_sugerido', i.precio_venta_sugerido,
                      'sugerido_motivos', to_jsonb(i.sugerido_motivos),$v$,
  1);

-- 4f. El comprobante: una línea que sale de una línea pedida y no trae sugerido hereda el de la orden.
select pg_temp.reemplazar(
  'retail.registrar_comprobante_orden(uuid,text,text,text,jsonb,date,text,date,boolean,numeric,jsonb,text,uuid)',
  $v$      v_descripcion := coalesce(v_descripcion, v_item.descripcion);$v$,
  $v$      v_descripcion := coalesce(v_descripcion, v_item.descripcion);
      -- ADR-0362 decisión 21 (2026-10-22): el precio sugerido de la orden es el origen; el papel puede corregirlo, pero si no trae uno, hereda.
      v_sugerido := coalesce(v_sugerido, v_item.precio_venta_sugerido);$v$,
  1);

-- 4g. Quien recibe: el sugerido del papel manda; si no hay papel o no lo trae, el de la orden (el tercer escalón).
select pg_temp.reemplazar(
  'retail.fn_envio_detalle(uuid)',
  $v$                          limit 1)),$v$,
  $v$                          limit 1),
                        -- ADR-0362 decisión 21 (2026-10-22): sin papel que lo traiga, el que sugirió la compradora al armar la orden.
                        i.precio_venta_sugerido),$v$,
  1);

-- ---------- 5. Comprobación: si algo no quedó, la migración no se da por aplicada ----------
do $$
begin
  if (select count(*) from information_schema.columns
       where table_schema = 'retail' and table_name = 'orden_compra_items'
         and column_name in ('precio_venta_sugerido', 'sugerido_motivos')) <> 2 then
    raise exception 'orden_compra_items no quedó con precio_venta_sugerido y sugerido_motivos';
  end if;
  if (select count(*) from pg_constraint
       where conrelid = 'retail.orden_compra_items'::regclass
         and conname in ('orden_compra_items_sugerido_tope', 'orden_compra_items_sugerido_motivos')) <> 2 then
    raise exception 'orden_compra_items no quedó con los dos candados del sugerido';
  end if;
  if position('fn_orden_compra_validar_sugerido' in pg_get_functiondef('retail.fn_orden_compra_validar(uuid,uuid,date,text,jsonb,jsonb)'::regprocedure)) = 0 then
    raise exception 'fn_orden_compra_validar no quedó con las reglas del sugerido';
  end if;
  if position('sugerido_motivos' in pg_get_functiondef('retail.fn_orden_compra_huella(uuid,uuid,date,text,jsonb)'::regprocedure)) = 0
     or position('sugerido_motivos' in pg_get_functiondef('retail.fn_orden_compra_huella_guardada(uuid)'::regprocedure)) = 0 then
    raise exception 'las dos huellas de la orden no quedaron con el sugerido y sus motivos';
  end if;
  if position('precio_venta_sugerido' in pg_get_functiondef('retail.fn_orden_compra_escribir_lineas(uuid,jsonb)'::regprocedure)) = 0 then
    raise exception 'fn_orden_compra_escribir_lineas no guarda el sugerido';
  end if;
  if position('sugerido_motivos' in pg_get_functiondef('retail.fn_orden_compra_detalle(uuid)'::regprocedure)) = 0 then
    raise exception 'fn_orden_compra_detalle no trae el sugerido ni sus motivos';
  end if;
  if position('v_item.precio_venta_sugerido' in pg_get_functiondef('retail.registrar_comprobante_orden(uuid,text,text,text,jsonb,date,text,date,boolean,numeric,jsonb,text,uuid)'::regprocedure)) = 0 then
    raise exception 'registrar_comprobante_orden no hereda el sugerido de la orden';
  end if;
  if position('i.precio_venta_sugerido)' in pg_get_functiondef('retail.fn_envio_detalle(uuid)'::regprocedure)) = 0 then
    raise exception 'fn_envio_detalle no cae al sugerido de la orden';
  end if;
  if has_function_privilege('authenticated', 'retail.fn_orden_compra_validar_sugerido(integer,jsonb,uuid)', 'execute')
     or has_function_privilege('authenticated', 'retail.fn_orden_compra_motivos(jsonb)', 'execute') then
    raise exception 'las piezas internas del sugerido no las ejecuta authenticated';
  end if;
end;
$$;

reset lock_timeout;
