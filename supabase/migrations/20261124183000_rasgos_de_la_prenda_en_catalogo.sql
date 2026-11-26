-- Margen por rasgos (ADR-0700), actividad 5 de 6 (Catálogo): lo que la prenda tiene se marca y se cambia desde Nuevo y Editar producto.
-- Una sola parte.
--
-- EL PROBLEMA PRIMERO. Las casillas nacen en «Compré ropa» y pasan a la prenda al recibirla (20261124180000), pero una prenda que se da
-- de alta en Catálogo (sin compra) no tenía dónde marcarlas, y una que llegó con una casilla equivocada no tenía cómo corregirse: su
-- margen objetivo quedaba para siempre con lo que dijo la compra.
--
-- QUÉ CREA (la tabla `producto_rasgos` ya existe, sin políticas: se lee y escribe solo por estas funciones):
--   1. `fn_producto_rasgos(uuid)`: lo que la prenda tiene GUARDADO, tal cual (la tela puede venir nula = «por su tejido»), para que la
--      pantalla muestre las casillas y sepa si la tela la dijo alguien. Lo que tiene en efecto sigue siendo `fn_rasgos_de_producto`.
--   2. `guardar_rasgos_de_producto(uuid, boolean, boolean, boolean)`: deja las tres casillas de la prenda (la tela nula vuelve a «por su
--      tejido»). Quien ve Productos hace todo lo de Productos (ADR-0306); firma el responsable (`fn_actor_persona_id(true)`), como
--      `fijar_nombre_proveedor`. Devuelve lo que la prenda tiene en efecto, para que la pantalla mida el objetivo con lo guardado.
--
-- DECIDÍ: una función aparte, que se llama después de crear o guardar la prenda (como «cómo la llama el proveedor»).
-- DESCARTÉ: sumar las casillas a las cuatro funciones que crean una prenda (`crear_producto_con_variantes`, `_con_stock_inicial`,
-- `_con_empresa`, `_con_llegada`) y a la cola sin conexión: son cuatro reemplazos anclados de funciones de dinero y stock por un dato que no
-- mueve ni dinero ni stock.
-- SE ROMPE SI: la prenda se crea y la segunda llamada no llega (o la prenda se creó sin conexión): nace sin casillas y se mide con la base.
-- La pantalla lo dice («márcalas en Editar producto»); no se pierde stock ni dinero, y ningún estado es imposible (sin fila = sin casillas).
--
-- CÓMO SE PEGA EN PRODUCCIÓN (solo con el OK de Felipe). Después de 20261124180000 (usa su tabla). Una parte: dos funciones nuevas.
-- Idempotente.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. Lo guardado, tal cual ----------

create or replace function retail.fn_producto_rasgos(p_producto_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = retail, public, extensions as $$
declare
  v jsonb;
begin
  if not coalesce(retail.fn_tiene_acceso_retail(), false) then
    raise exception 'Tu cuenta no tiene acceso al ERP.' using errcode = '42501';
  end if;
  select jsonb_build_object('nadie_la_tiene', coalesce(r.nadie_la_tiene, false), 'en_tendencia', coalesce(r.en_tendencia, false),
                            'tela_que_se_nota', r.tela_que_se_nota)
    into v
    from retail.productos p
    left join retail.producto_rasgos r on r.producto_id = p.id
   where p.id = p_producto_id;
  return v;
end $$;

comment on function retail.fn_producto_rasgos(uuid) is
  'ADR-0700: las casillas guardadas de una prenda, tal cual (tela nula = por su tejido). Sin la prenda, nulo.';
revoke all on function retail.fn_producto_rasgos(uuid) from public, anon;
grant execute on function retail.fn_producto_rasgos(uuid) to authenticated;

-- ---------- 2. Guardarlas ----------

create or replace function retail.guardar_rasgos_de_producto(p_producto_id uuid, p_nadie_la_tiene boolean, p_en_tendencia boolean,
                                                             p_tela_que_se_nota boolean default null)
returns text[]
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_actor uuid;
begin
  if retail.fn_ve_modulo('productos') is not true then
    raise exception 'No tienes acceso a Productos.' using errcode = '42501', hint = 'sin_permiso';
  end if;
  v_actor := retail.fn_actor_persona_id(true);

  if p_producto_id is null or not exists (select 1 from retail.productos p where p.id = p_producto_id) then
    raise exception 'Esa prenda ya no existe. Recarga la pantalla.' using hint = 'producto_no_existe';
  end if;

  -- Dos personas guardando la misma prenda a la vez: la fila se bloquea y gana la última, entera (nunca una mezcla de las dos).
  insert into retail.producto_rasgos (producto_id, nadie_la_tiene, en_tendencia, tela_que_se_nota, actualizado_por, actualizado_en)
  values (p_producto_id, coalesce(p_nadie_la_tiene, false), coalesce(p_en_tendencia, false), p_tela_que_se_nota, v_actor, now())
  on conflict (producto_id) do update
     set nadie_la_tiene = excluded.nadie_la_tiene,
         en_tendencia = excluded.en_tendencia,
         tela_que_se_nota = excluded.tela_que_se_nota,
         actualizado_por = excluded.actualizado_por,
         actualizado_en = excluded.actualizado_en;

  return retail.fn_rasgos_de_producto(p_producto_id);
end $$;

comment on function retail.guardar_rasgos_de_producto(uuid, boolean, boolean, boolean) is
  'ADR-0700: deja las casillas de una prenda (tela nula = por su tejido) y devuelve lo que tiene en efecto. Quien ve Productos.';
revoke all on function retail.guardar_rasgos_de_producto(uuid, boolean, boolean, boolean) from public, anon;
grant execute on function retail.guardar_rasgos_de_producto(uuid, boolean, boolean, boolean) to authenticated;

reset lock_timeout;
