-- ============================================================================
-- 20260928180000_clienta_actividad_y_exportar.sql — CAYLA V2 · Clientas, paso 2 del acta (parte 5/5)
--
-- Lo que le falta a la ficha para dejar de ser un formulario suelto y ser un club: sus compras,
-- cambios, devoluciones y apartados — «LEÍDOS de ventas, cambios, devoluciones y separaciones;
-- nunca una tabla copia» (encargo). También el candado de exportar (D-109/G.4) y que
-- `buscar_clienta` deje de mezclar archivadas con activas por accidente.
--
-- POR QUÉ SON `security definer` Y CRUZAN SEDE. Las políticas de SELECT de `ventas`/`cambios`/
-- `devoluciones`/`separaciones` filtran por la sede de quien mira (una colaboradora de TRU no ve
-- las ventas de AQP). La ficha de clienta es de la MARCA, no de la sede (D-109: «todas las cuentas
-- con el módulo ven a todas las clientas») — si sus compras se leyeran directo por PostgREST,
-- respetando esa RLS, una asesora de TRU vería una clienta "sin compras" que en realidad compró
-- siempre en AQP. Estas cuatro funciones bypasean esa RLS a propósito, filtrando SOLO por
-- `p_id` (la clienta), nunca por sede — mismo criterio que ya usa `buscar_clienta`.
-- DECIDÍ: leer con `security definer`, cruzando las tres sedes.
-- DESCARTÉ: leer directo con PostgREST respetando RLS por sede — costo: rompe el propósito mismo
--   del club («la tienda la recuerda», no "la sede la recuerda"), y D-109 ya decidió que la ficha
--   no distingue sede.
-- SE ROMPE SI: CAYLA le vende el sistema a otra marca (D-50) y cada sede pasa a ser un tenant
--   separado — ese día es un cambio de arquitectura mayor, no un parche a estas cuatro funciones.
--
-- TALLA DEDUCIDA (D-101) Y «TE FALTA N PARA FRECUENTE» (D-103): esta migración solo entrega las
-- FILAS (una por prenda vendida/cambiada/devuelta/apartada, con su fecha, categoría y talla). El
-- cálculo — talla más reciente por categoría, contar compras de los últimos 6 meses — es lógica
-- de negocio en TypeScript puro (`apps/web/lib/clienta-actividad-reglas.ts`), NUNCA guardado en
-- una columna: D-103 lo exige explícito («calculada al leer, jamás guardada»).
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- 1. compras (con categoría y talla, para D-101/D-103) ----------
create or replace function retail.fn_clienta_compras(p_id uuid)
returns table (
  venta_id uuid, fecha timestamptz, ubicacion text, categoria text, talla text,
  cantidad integer, subtotal numeric
)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select v.id, v.created_at, u.nombre, cat.nombre, ta.valor, vi.cantidad, vi.subtotal
  from retail.ventas v
  join retail.ubicaciones u on u.id = v.ubicacion_id
  join retail.venta_items vi on vi.venta_id = v.id
  join retail.variantes va on va.id = vi.variante_id
  join retail.productos pr on pr.id = va.producto_id
  left join retail.categorias cat on cat.id = pr.categoria_id
  left join retail.tallas ta on ta.id = va.talla_id
  where v.cliente_id = p_id and v.estado = 'completada'
  order by v.created_at desc;
$$;

comment on function retail.fn_clienta_compras(uuid) is
  'Una fila por prenda comprada por esta clienta, en cualquier sede (security definer, ver cabecera de la migración). Base de "talla deducida por tipo de prenda" (D-101) y "te falta N para frecuente" (D-103) — el cálculo vive en TypeScript, esta función solo entrega los hechos.';

-- ---------- 2. cambios ----------
create or replace function retail.fn_clienta_cambios(p_id uuid)
returns table (cambio_id uuid, fecha timestamptz, ubicacion text, motivo text, diferencia numeric)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select c.id, c.created_at, u.nombre, c.motivo, c.diferencia
  from retail.cambios c
  join retail.venta_items vi on vi.id = c.venta_item_id
  join retail.ventas v on v.id = vi.venta_id
  join retail.ubicaciones u on u.id = c.ubicacion_id
  where v.cliente_id = p_id
  order by c.created_at desc;
$$;

comment on function retail.fn_clienta_cambios(uuid) is 'Los cambios de prenda de esta clienta (cuelgan de venta_item_id → venta → cliente_id), en cualquier sede.';

-- ---------- 3. devoluciones ----------
create or replace function retail.fn_clienta_devoluciones(p_id uuid)
returns table (devolucion_id uuid, fecha timestamptz, estado text, motivo text, reembolso_monto numeric)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select d.id, d.created_at, d.estado, d.motivo, d.reembolso_monto
  from retail.devoluciones d
  join retail.ventas v on v.id = d.venta_id
  where v.cliente_id = p_id
  order by d.created_at desc;
$$;

comment on function retail.fn_clienta_devoluciones(uuid) is 'Las devoluciones de esta clienta (cuelgan de venta_id), en cualquier sede.';

-- ---------- 4. separaciones (apartados) ----------
create or replace function retail.fn_clienta_separaciones(p_id uuid)
returns table (separacion_id uuid, codigo text, fecha timestamptz, estado text, total numeric, vence_el date)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select s.id, s.codigo, s.created_at, s.estado, s.total, s.vence_el
  from retail.separaciones s
  where s.clienta_id = p_id
  order by s.created_at desc;
$$;

comment on function retail.fn_clienta_separaciones(uuid) is 'Los apartados de esta clienta (clienta_id directo), en cualquier sede.';

revoke execute on function
  retail.fn_clienta_compras(uuid), retail.fn_clienta_cambios(uuid),
  retail.fn_clienta_devoluciones(uuid), retail.fn_clienta_separaciones(uuid)
from public, anon;
grant execute on function
  retail.fn_clienta_compras(uuid), retail.fn_clienta_cambios(uuid),
  retail.fn_clienta_devoluciones(uuid), retail.fn_clienta_separaciones(uuid)
to authenticated;

-- ---------- 5. buscar_clienta: no mezclar archivadas con activas por accidente ----------
-- Cambia la firma (agrega un parámetro): se DROPEA la vieja de un solo argumento antes de crear la
-- nueva — dejar las dos vivas a la vez deja `buscar_clienta('...')` ambiguo para Postgres (probado:
-- "function retail.buscar_clienta(unknown) is not unique" hasta agregar este drop), aunque el
-- parámetro nuevo tenga DEFAULT. Mismo criterio que ADR-0193 al cambiar una firma existente.
drop function if exists retail.buscar_clienta(text);

create or replace function retail.buscar_clienta(p_termino text, p_incluir_archivadas boolean default false)
returns setof retail.clientas
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select *
  from retail.clientas
  where nullif(btrim(p_termino), '') is not null
    and (p_incluir_archivadas or archivada_en is null)
    and (
      dni = btrim(p_termino)
      or telefono_whatsapp = btrim(p_termino)
      or nombre ilike '%' || btrim(p_termino) || '%'
    )
  order by nombre nulls last, created_at desc
  limit 20;
$$;

comment on function retail.buscar_clienta(text, boolean) is
  'Busca por DNI o WhatsApp exactos, o por nombre (ILIKE). p_incluir_archivadas=false por defecto: una búsqueda normal no reaparece una ficha anonimizada o fusionada — para eso está el buscador con "incluir archivadas" en la pantalla (reactivar, o revisar antes de unir).';

revoke execute on function retail.buscar_clienta(text, boolean) from public, anon;
grant execute on function retail.buscar_clienta(text, boolean) to authenticated;

-- ---------- 6. exportar_clientas: solo Admin, y queda registrado quién abrió la lista ----------
-- D-109/G.4: cualquier cuenta con el módulo VE y BUSCA a todas las clientas (sin candado ni
-- rastro — es la lectura normal de la pantalla). EXPORTAR la lista completa es otra cosa: por eso
-- tiene su propio candado (solo Admin) y su propio rastro (fn_actividad_anotar) — la Ley 29733
-- pide proteger la base, no solo pedir el permiso de contacto.
create or replace function retail.exportar_clientas()
returns setof retail.clientas
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
  v_total integer;
begin
  if not retail.fn_es_admin() then
    raise exception 'Solo un Admin puede exportar la lista completa de clientas.';
  end if;
  v_persona := retail.fn_actor_persona_id(true);

  select count(*) into v_total from retail.clientas;

  perform retail.fn_actividad_anotar(
    'clientas', 'exportar', 'Exportó la lista completa de clientas (' || v_total || ')',
    v_persona, null, null, null, 'clientas', 'lista', now(),
    jsonb_build_object('filas', v_total), 'vivo'
  );

  return query select * from retail.clientas order by created_at desc;
end;
$$;

comment on function retail.exportar_clientas() is
  'D-109/G.4: solo un Admin puede exportar la lista completa (activas Y archivadas — Admin ve todo). Cada exportación queda anotada en retail.actividad: quién, cuándo y cuántas filas.';

revoke execute on function retail.exportar_clientas() from public, anon;
grant execute on function retail.exportar_clientas() to authenticated;

notify pgrst, 'reload schema';
