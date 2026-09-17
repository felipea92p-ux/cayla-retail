-- ============================================================================
-- Proveedores administrables — el directorio deja de ser de solo lectura
--
-- EL PROBLEMA. `retail.proveedores` existe desde 0002_esquema.sql y todo el
-- módulo de Compras depende de ella: `CompraFormV2` pinta un <select> con lo
-- que haya (apps/web/lib/compras.ts:297) y `compras.proveedor_id` es FK dura.
-- Pero NINGUNA pantalla la escribe — el único camino para dar de alta un
-- proveedor era el SQL Editor. Resultado: el día que llega un proveedor nuevo,
-- no se puede registrar su factura hasta que alguien con acceso a Supabase lo
-- inserte a mano. Eso no es ergonomía (principio 10), es un cuello de botella
-- con nombre propio.
--
-- POR QUÉ RPC Y NO ESCRITURA DIRECTA A LA TABLA. La RLS de `proveedores` ya
-- deja escribir al líder (`proveedores_write_lider`), así que el navegador
-- PODRÍA hacer `.from("proveedores").insert(...)` y funcionaría. No se hace:
-- en este repo ningún componente escribe tablas directo, todo pasa por RPC
-- (verificado 2026-09-14: cero `.from(...).insert` en apps/web/components).
-- La razón no es gusto — es que las reglas del negocio (qué es un RUC válido,
-- qué cuenta como nombre repetido) tienen que vivir en UN lugar al que todos
-- los caminos pasen, no repartidas en cada formulario que algún día escriba
-- esta tabla. Es la misma lección del trigger de `variantes` en
-- 20260912235500_vocabulario_cerrado.sql.
--
-- EL CANDADO ES LO IMPORTANTE, NO LA PANTALLA. Sin índice único, "Textiles
-- Andina SAC" y "textiles andina s.a.c." son dos proveedores distintos con
-- facturas repartidas entre ambos, y el "por pagar" de cada uno miente. Es
-- exactamente el bug que V1 pagó carísimo con los colores (ADR-0024) y que
-- 20260912235500 acaba de cerrar para `colores` y `categorias`. Se reusa la
-- misma pieza —`fn_clave_texto`— a propósito: un solo criterio de "esto ya
-- existe" para todo el vocabulario del sistema.
--
-- AL APLICAR EN PRODUCCIÓN: los dos índices únicos FALLAN si allá ya hay
-- duplicados. Eso es lo correcto — hay que fusionarlos a mano antes (mirando
-- qué facturas cuelgan de cada uno), no relajar el candado. Para ver si los
-- hay, antes de pegar esto:
--   select retail.fn_clave_texto(nombre), count(*) from retail.proveedores
--   group by 1 having count(*) > 1;
-- ============================================================================

-- ---------- 1. los candados ----------

-- RUC peruano: 11 dígitos exactos. Se permite null porque hay proveedores
-- informales reales (el taller de la esquina, la señora de los botones) y
-- exigir RUC para poder registrarlos los dejaría fuera del sistema — que es
-- peor que no tener su RUC.
alter table retail.proveedores
  add constraint proveedores_ruc_check check (ruc is null or ruc ~ '^[0-9]{11}$');

-- Dos filas con el mismo RUC son la misma empresa, sin discusión.
create unique index proveedores_ruc_unico on retail.proveedores (ruc) where ruc is not null;

-- Y para los que no tienen RUC, el nombre normalizado hace de identidad.
create unique index proveedores_nombre_clave_unica on retail.proveedores (retail.fn_clave_texto(nombre));

comment on index retail.proveedores_nombre_clave_unica is
  'Impide que "Textiles Andina SAC" y "textiles andina s.a.c." convivan como dos proveedores. Mismo criterio que colores_clave_unica.';

-- ---------- 2. lectura: el directorio con lo que se necesita para decidir ----------
-- Una sola función en vez de que la pantalla arme el conteo de facturas por su
-- cuenta: "¿puedo desactivar a este?" se responde mirando cuántas facturas tiene
-- y cuándo fue la última, y ese cálculo no debe vivir en el navegador.
create or replace function retail.fn_proveedores()
returns table (
  id uuid,
  nombre text,
  ruc text,
  contacto text,
  activo boolean,
  facturas bigint,
  saldo numeric,
  ultima_compra date
)
language sql stable security definer set search_path = retail, public, extensions as $$
  select p.id, p.nombre, p.ruc, p.contacto, p.activo,
         count(c.id) filter (where c.estado <> 'anulada') as facturas,
         coalesce(sum(c.saldo) filter (where c.estado <> 'anulada'), 0) as saldo,
         max(c.fecha_emision) filter (where c.estado <> 'anulada') as ultima_compra
  from retail.proveedores p
  left join retail.compras c on c.proveedor_id = p.id
  where retail.fn_tiene_acceso_retail()
  group by p.id, p.nombre, p.ruc, p.contacto, p.activo
  order by p.activo desc, p.nombre;
$$;

comment on function retail.fn_proveedores() is
  'Directorio de proveedores con cuántas facturas vigentes tiene cada uno, cuánto se le debe y la fecha de la última. Desactivados incluidos, al final.';

-- ---------- 3. escritura ----------
-- Normalizador de entrada compartido por alta y edición: vacío es null, nunca
-- cadena vacía. Una cadena vacía en `ruc` pasaría el check (no, no lo pasa) y
-- ensuciaría el índice único; en `contacto` haría que la pantalla pinte un
-- espacio en vez de un guión.
create or replace function retail.fn_texto_o_null(p text)
returns text language sql immutable as $$ select nullif(btrim(coalesce(p, '')), ''); $$;

create or replace function retail.registrar_proveedor(
  p_nombre text,
  p_ruc text default null,
  p_contacto text default null
) returns uuid
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_nombre text := retail.fn_texto_o_null(p_nombre);
  v_ruc text := retail.fn_texto_o_null(p_ruc);
  v_contacto text := retail.fn_texto_o_null(p_contacto);
  v_id uuid;
  v_existente text;
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un Líder puede dar de alta proveedores.';
  end if;
  if v_nombre is null then
    raise exception 'El proveedor necesita un nombre.';
  end if;
  if v_ruc is not null and v_ruc !~ '^[0-9]{11}$' then
    raise exception 'El RUC tiene que ser de 11 dígitos. Si el proveedor no tiene RUC, déjalo en blanco.';
  end if;

  -- El índice único es el candado de verdad; esto solo existe para que el
  -- mensaje diga CON QUIÉN choca en vez de "violates unique constraint".
  select nombre into v_existente from retail.proveedores
   where retail.fn_clave_texto(nombre) = retail.fn_clave_texto(v_nombre) limit 1;
  if v_existente is not null then
    raise exception 'Ya existe un proveedor llamado "%". Búscalo en la lista en vez de crear otro.', v_existente;
  end if;
  if v_ruc is not null then
    select nombre into v_existente from retail.proveedores where ruc = v_ruc limit 1;
    if v_existente is not null then
      raise exception 'Ese RUC ya está registrado como "%".', v_existente;
    end if;
  end if;

  insert into retail.proveedores (nombre, ruc, contacto)
  values (v_nombre, v_ruc, v_contacto)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function retail.actualizar_proveedor(
  p_proveedor_id uuid,
  p_nombre text,
  p_ruc text default null,
  p_contacto text default null
) returns void
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_nombre text := retail.fn_texto_o_null(p_nombre);
  v_ruc text := retail.fn_texto_o_null(p_ruc);
  v_contacto text := retail.fn_texto_o_null(p_contacto);
  v_existente text;
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un Líder puede editar proveedores.';
  end if;
  if v_nombre is null then
    raise exception 'El proveedor necesita un nombre.';
  end if;
  if v_ruc is not null and v_ruc !~ '^[0-9]{11}$' then
    raise exception 'El RUC tiene que ser de 11 dígitos. Si el proveedor no tiene RUC, déjalo en blanco.';
  end if;
  if not exists (select 1 from retail.proveedores where id = p_proveedor_id) then
    raise exception 'Ese proveedor ya no existe. Recarga la pantalla.';
  end if;

  select nombre into v_existente from retail.proveedores
   where retail.fn_clave_texto(nombre) = retail.fn_clave_texto(v_nombre)
     and id <> p_proveedor_id limit 1;
  if v_existente is not null then
    raise exception 'Ya existe otro proveedor llamado "%".', v_existente;
  end if;
  if v_ruc is not null then
    select nombre into v_existente from retail.proveedores
     where ruc = v_ruc and id <> p_proveedor_id limit 1;
    if v_existente is not null then
      raise exception 'Ese RUC ya está registrado como "%".', v_existente;
    end if;
  end if;

  update retail.proveedores
     set nombre = v_nombre, ruc = v_ruc, contacto = v_contacto
   where id = p_proveedor_id;
end;
$$;

-- Desactivar, NUNCA borrar (regla del repo): `compras` y `lotes` referencian
-- proveedores con FK dura, así que un delete o rompe por FK o —si algún día
-- alguien pone cascade— se lleva por delante facturas históricas. Desactivado
-- = deja de aparecer en el <select> de facturas nuevas, y todo lo viejo sigue
-- diciendo de quién fue. Son dos funciones sin bandera a propósito: cada una
-- dice exactamente lo que hace (principio 3).
create or replace function retail.desactivar_proveedor(p_proveedor_id uuid)
returns void
language plpgsql security definer set search_path = retail, public, extensions as $$
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un Líder puede desactivar proveedores.';
  end if;
  if not exists (select 1 from retail.proveedores where id = p_proveedor_id) then
    raise exception 'Ese proveedor ya no existe. Recarga la pantalla.';
  end if;
  update retail.proveedores set activo = false where id = p_proveedor_id;
end;
$$;

create or replace function retail.reactivar_proveedor(p_proveedor_id uuid)
returns void
language plpgsql security definer set search_path = retail, public, extensions as $$
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un Líder puede reactivar proveedores.';
  end if;
  if not exists (select 1 from retail.proveedores where id = p_proveedor_id) then
    raise exception 'Ese proveedor ya no existe. Recarga la pantalla.';
  end if;
  update retail.proveedores set activo = true where id = p_proveedor_id;
end;
$$;

-- ---------- 4. permisos ----------
grant execute on function retail.fn_proveedores() to authenticated;
grant execute on function retail.registrar_proveedor(text, text, text) to authenticated;
grant execute on function retail.actualizar_proveedor(uuid, text, text, text) to authenticated;
grant execute on function retail.desactivar_proveedor(uuid) to authenticated;
grant execute on function retail.reactivar_proveedor(uuid) to authenticated;
