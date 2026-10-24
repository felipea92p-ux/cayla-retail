-- ============================================================================
-- 20261024214000_compras_marca_nueva_desde_la_compra.sql — CAYLA V2 · ADR-0480 (Compras simple)
-- La compradora crea una marca nueva desde «Algo nuevo», sin pedírsela a nadie, y queda unida al proveedor de la compra.
--
-- EL PROBLEMA PRIMERO. En «Algo nuevo» la compradora elige la marca de la prenda de una lista. Si la marca todavía no está en el
-- catálogo, no tenía cómo seguir: `crear_marca` es de quien edita el Catálogo (`fn_puede_editar_catalogo`), y quien compra con
-- «Mis compras» no lo tiene. Felipe (2026-10-24): «quien tiene el módulo puede crear una marca y esta marca se relaciona con el
-- proveedor».
--
-- QUÉ HACE
--   `registrar_marca_de_compra(nombre, proveedor)`: con «Mis compras» (o con el Catálogo), crea la marca y la une al proveedor
--   (`marca_proveedores`). Si ya hay una marca que se escribe igual (sin tildes, mayúsculas ni espacios de más: `fn_clave_texto`),
--   no crea otra: le suma el proveedor y devuelve esa, con su nombre de verdad. Una marca desactivada no se reactiva desde aquí.
--   Firma quien hace la compra (el combo «Responsable», ADR-0162) en la Actividad.
--
-- DESCARTÉ
--   · Abrirle `crear_marca` a «Mis compras»: esa función es la de Catálogo ▸ Marcas, y su permiso es el del Catálogo. Una función
--     propia deja el permiso de Compras escrito donde se usa.
--   · Crear la marca al recibir la prenda (como la prenda nueva): la compra quedaba sin marca hasta que llegara, y la línea de la
--     orden necesita una marca de verdad.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Una sola parte, sin tablas ni políticas. Idempotente (`create or replace`).
-- ============================================================================
set lock_timeout = '3s';
set search_path = retail, public, extensions;

create or replace function retail.registrar_marca_de_compra(p_nombre text, p_proveedor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_nombre text := btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g'));
  v_actor uuid;
  v_marca uuid;
  v_activa boolean;
  v_real text;
  v_nueva boolean := false;
begin
  if retail.fn_ve_modulo('ordenes_compra') is not true and not retail.fn_puede_editar_catalogo() then
    raise exception 'Crear una marca desde una compra necesita el módulo «Mis compras» en tu rol' using errcode = '42501', hint = 'ordenes_compra_sin_modulo';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace la compra' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  if char_length(v_nombre) < 2 or char_length(v_nombre) > 60 then
    raise exception 'Escribe el nombre de la marca, como dice su etiqueta' using errcode = 'P0001', hint = 'marca_nombre';
  end if;
  if p_proveedor_id is null or not exists (select 1 from retail.proveedores where id = p_proveedor_id and activo) then
    raise exception 'Ese proveedor no existe o está desactivado' using errcode = 'P0001', hint = 'marca_sin_proveedor';
  end if;

  -- Dos compradoras escribiendo la misma marca a la vez se turnan: la segunda encuentra la de la primera.
  perform pg_advisory_xact_lock(hashtextextended('marca:' || retail.fn_clave_texto(v_nombre), 0));
  for v_marca, v_activa, v_real in
    select m.id, m.activo, m.nombre from retail.marcas m where retail.fn_clave_texto(m.nombre) = retail.fn_clave_texto(v_nombre)
  loop
    exit;
  end loop;
  if v_marca is null then
    insert into retail.marcas (nombre) values (v_nombre) returning id, nombre into v_marca, v_real;
    v_nueva := true;
  elsif not v_activa then
    raise exception 'La marca «%» existe pero está desactivada: pide que la reactiven en Catálogo ▸ Marcas', v_real
      using errcode = 'P0001', hint = 'marca_desactivada';
  end if;

  insert into retail.marca_proveedores (marca_id, proveedor_id) values (v_marca, p_proveedor_id) on conflict do nothing;

  if v_nueva then
    begin
      perform retail.fn_actividad_anotar('ordenes_compra', 'marca_creada', 'agregó la marca «' || v_real || '» desde una compra',
        v_actor, retail.fn_actividad_terminal_ahora(), null, null, 'marcas', v_marca::text, now(),
        jsonb_build_object('proveedor_id', p_proveedor_id), 'vivo');
    exception when others then
      raise warning 'actividad: no se anotó la marca nueva: %', sqlerrm;
    end;
  end if;

  return jsonb_build_object('id', v_marca, 'nombre', v_real, 'nueva', v_nueva);
end;
$$;
comment on function retail.registrar_marca_de_compra(text, uuid) is
  'Compras simple (ADR-0480): la compradora crea una marca desde «Algo nuevo» y queda unida al proveedor. Si ya existe, le suma el proveedor y la devuelve. Con «Mis compras» o el Catálogo.';
revoke all on function retail.registrar_marca_de_compra(text, uuid) from public, anon;
grant execute on function retail.registrar_marca_de_compra(text, uuid) to authenticated;
