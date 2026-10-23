-- ============================================================================
-- 20261023210000_revisar_compras_rondas.sql — CAYLA V2 · ADR-0480 (Compras simple), Revisar compras con el diseño «A · Bandeja serena»
-- Lo que Revisar compras necesita saber de las rondas de compras para dibujar el diseño que eligió Felipe (2026-10-23).
--
-- EL PROBLEMA PRIMERO. El diseño A muestra, bajo la lista, las RONDAS ABIERTAS (quién está comprando ahora, desde cuándo, cuántas compras
-- y prendas lleva); el detalle de una ronda cerrada muestra su CUADERNO (le dieron, compró, gastó → devuelve o le debemos) y de qué tienda
-- es quien compró; y la plata por confirmar dice de qué ronda es. La lectura de la pantalla no traía nada de eso: la pantalla solo podía
-- mostrar el renglón final («Devuelve S/ 85»), sin de dónde salía.
--
-- QUÉ HACE (solo lecturas: nada se escribe ni se borra)
--   1. `fn_ronda_compras_cuenta(ronda)`: lo que pasó en una ronda (le dieron, compró —lo pagado de su plata—, cuántas compras y prendas,
--      gastó), con la misma cuenta que «Mi plata» (`fn_ronda_compras_de`).
--   2. `fn_revisar_compras()` suma `rondas_abiertas` (todas las de todas las compradoras, con su tienda y lo que llevan) y, en cada cierre,
--      la tienda de quien compró y el cuaderno de su ronda. Un cierre de antes de las rondas (sin ronda) no trae cuaderno.
--   3. `fn_plata_por_confirmar()` dice la ronda de cada plata anotada.
-- La tienda de una persona es la de su ficha de colaborador (`colaboradores.ubicacion_asignada_id`).
--
-- Se pega tal cual en producción: idempotente (los reemplazos anclados no hacen nada si ya se hicieron), sin políticas ni tablas nuevas.
-- ============================================================================
set lock_timeout = '3s';
set search_path = retail, public, extensions;

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

-- ---------- 1. Lo que pasó en una ronda ----------
create or replace function retail.fn_ronda_compras_cuenta(p_ronda uuid)
returns jsonb
language sql stable security definer set search_path = retail, public, extensions as $$
  select jsonb_build_object(
    'dieron', coalesce((select sum(a.monto) from retail.fondo_plata_anotada a where a.ronda_id = p_ronda), 0),
    'compras', (select count(*) from retail.compra_papeles c where c.ronda_id = p_ronda and c.estado <> 'anulado'),
    'compraste', coalesce((select sum(c.pagado) from retail.compra_papeles c where c.ronda_id = p_ronda and c.estado <> 'anulado'), 0),
    'gastos', (select count(*) from retail.compra_gastos g where g.ronda_id = p_ronda and g.estado <> 'anulado'),
    'gastaste', coalesce((select sum(g.monto) from retail.compra_gastos g where g.ronda_id = p_ronda and g.estado <> 'anulado'), 0),
    'prendas', coalesce((select sum(i.cantidad) from retail.compra_papeles c join retail.ordenes_compra o on o.papel_id = c.id
                          join retail.orden_compra_items i on i.orden_compra_id = o.id
                         where c.ronda_id = p_ronda and c.estado <> 'anulado'), 0));
$$;
revoke all on function retail.fn_ronda_compras_cuenta(uuid) from public, anon, authenticated;

-- La tienda de una persona: la de su ficha de colaborador.
create or replace function retail.fn_tienda_de_persona(p_persona uuid)
returns text
language sql stable security definer set search_path = retail, public, extensions as $$
  select u.nombre from retail.colaboradores c join retail.ubicaciones u on u.id = c.ubicacion_asignada_id
   where c.persona_id = p_persona order by (c.estado = 'activo') desc, c.created_at desc limit 1;
$$;
revoke all on function retail.fn_tienda_de_persona(uuid) from public, anon, authenticated;

-- ---------- 2. Revisar compras: las rondas abiertas y el cuaderno de cada cierre ----------
select pg_temp.reemplazar('retail.fn_revisar_compras()',
$v$    'proveedores', coalesce((select jsonb_agg($v$,
$v$    -- Las rondas abiertas de todas las compradoras, la más antigua primero (20261023210000).
    'rondas_abiertas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'texto', retail.fn_ronda_compras_numero_texto(r.numero), 'persona_id', r.persona_id,
               'persona', nullif(btrim(concat_ws(' ', pe.nombres, pe.apellidos)), ''), 'tienda', retail.fn_tienda_de_persona(r.persona_id),
               'abierta_en', r.abierta_en, 'cuenta', retail.fn_ronda_compras_cuenta(r.id))
             order by r.abierta_en)
        from retail.compra_rondas r join public.personas pe on pe.id = r.persona_id
       where r.cerrada_en is null), '[]'::jsonb),
    'proveedores', coalesce((select jsonb_agg($v$, 1);

select pg_temp.reemplazar('retail.fn_revisar_compras()',
$v$'id', k.id, 'persona_id', k.persona_id, 'ronda', retail.fn_ronda_compras_texto(k.ronda_id),$v$,
$v$'id', k.id, 'persona_id', k.persona_id, 'ronda', retail.fn_ronda_compras_texto(k.ronda_id),
               'tienda', retail.fn_tienda_de_persona(k.persona_id),
               'cuaderno', case when k.ronda_id is null then null else retail.fn_ronda_compras_cuenta(k.ronda_id) end,$v$, 1);

-- ---------- 3. La plata por confirmar dice su ronda ----------
select pg_temp.reemplazar('retail.fn_plata_por_confirmar()',
$v$jsonb_build_object('id', a.id, 'persona_id', a.persona_id,$v$,
$v$jsonb_build_object('id', a.id, 'persona_id', a.persona_id, 'ronda', retail.fn_ronda_compras_texto(a.ronda_id),$v$, 1);

-- ---------- 4. «Mi plata para compras» pasa a llamarse «Mis compras» (Felipe 2026-10-23: «un nombre más entendible») ----------
-- La clave `ordenes_compra` no cambia (la usan los permisos de unas 40 funciones); cambian el nombre y lo que incluye, que dicen en Roles
-- y accesos qué da el módulo. Lo mismo en `apps/web/lib/modulos.ts` (lo vigila `lib/modulos.test.ts`).
update retail.modulos
   set nombre = 'Mis compras',
       incluye = 'En el celular: abrir y cerrar tu ronda de compras, anotar la plata que te dieron, lo que compraste (proveedor, prendas y el papel) y otros gastos, y mandar lo comprado a cada tienda'
 where clave = 'ordenes_compra';

update retail.modulos
   set incluye = 'Confirmar la plata que anotaron las compradoras, completar las compras que llegaron a la tienda (serie y número del papel, y qué hacer si algo no cuadró), revisar sus gastos y recibir sus rondas cerradas'
 where clave = 'fondos';
