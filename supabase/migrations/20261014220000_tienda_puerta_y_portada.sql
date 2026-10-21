-- ============================================================================
-- 20261014220000_tienda_puerta_y_portada.sql — CAYLA V2 · Tienda online (ADR-0408), actividad 1
--
-- QUÉ HACE. Abre la «puerta angosta» por la que la tienda online (`apps/tienda`) habla con la base del ERP:
--   1. El rol `tienda_web`: sin inicio de sesión propio, sin permiso sobre ninguna tabla; solo USAGE sobre el schema
--      `retail` (para encontrar sus funciones) y EXECUTE sobre las funciones `retail.tienda_*`, una por una.
--      La tienda se conecta con un usuario que lo hereda: en local lo crea `pnpm --filter tienda rol-local`; en
--      producción lo crea Felipe con su contraseña (actividad 13). Nunca con la llave de servicio del ERP.
--   2. `retail.tienda_portada()`: lo que la portada pública muestra sin cuenta. Hoy, la campaña vigente.
--
-- POR QUÉ ASÍ. Las cuentas de los clientes no son `authenticated` (ADR-0408): en producción 34 de las 137 políticas de
-- `retail` solo piden una sesión. Con un rol propio, lo que la tienda puede hacer en la base es exactamente la lista de
-- funciones `tienda_*`, y cada una decide qué devuelve. Postgres le da EXECUTE a PUBLIC a toda función nueva en una
-- base armada desde las migraciones (20260922231700), y `0005_grants.sql` se la da a `authenticated` por defecto: por
-- eso cada `tienda_*` se revoca de public, anon y authenticated. Una cuenta del ERP tampoco debe poder llamarla
-- haciéndose pasar por la tienda.
--
-- QUÉ ES «LA CAMPAÑA» DE LA PORTADA. Una etiqueta con estilo 'campana' —no 'urgencia', como «Para liquidar» o «Últimas
-- unidades», que son descuentos de prenda y no se anuncian en la portada—, aprobada, activa, con descuento, vigente hoy
-- en Lima (`fn_hoy_lima`, la misma regla de `fn_campanas_por_variante`) y puesta al menos a una prenda o una categoría:
-- no se anuncia una campaña vacía. Si hay varias, la que termina primero (las que no tienen fecha de fin, al final);
-- empate, la de mayor descuento y luego el nombre.
--
-- PRODUCCIÓN. NO está aplicada. Se pega en el SQL Editor tal cual: no crea políticas ni dispara nada sobre las tablas
-- en uso (ADR-0195), y se puede volver a correr. El usuario con contraseña que hereda `tienda_web` se crea aparte, con
-- Felipe, en la actividad 13.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'tienda_web') then
    create role tienda_web nologin;
  end if;
end
$$;

comment on role tienda_web is
  'La tienda online (ADR-0408): sin tablas; solo EXECUTE sobre retail.tienda_*. La usan los usuarios con contraseña de la tienda, nunca el ERP.';

grant usage on schema retail to tienda_web;

create or replace function retail.tienda_portada()
returns jsonb
language sql
stable
security definer
set search_path = retail, public
as $$
  select jsonb_build_object(
    'campana', (
      select jsonb_build_object('nombre', e.nombre, 'pct', e.descuento_pct, 'hasta', e.vigente_hasta)
      from retail.etiquetas e
      where e.estilo = 'campana'
        and e.estado = 'aprobado'
        and e.activo
        and e.descuento_pct > 0
        and (e.vigente_desde is null or e.vigente_desde <= retail.fn_hoy_lima())
        and (e.vigente_hasta is null or e.vigente_hasta >= retail.fn_hoy_lima())
        and (
          exists (select 1 from retail.variante_etiquetas ve where ve.etiqueta_id = e.id)
          or exists (select 1 from retail.etiqueta_categorias ec where ec.etiqueta_id = e.id)
        )
      order by e.vigente_hasta nulls last, e.descuento_pct desc, e.nombre
      limit 1
    )
  );
$$;

comment on function retail.tienda_portada() is
  'Tienda online (ADR-0408): la portada sin cuenta. {campana: {nombre, pct, hasta} | null}. Solo la llama tienda_web.';

revoke all on function retail.tienda_portada() from public, anon, authenticated;
grant execute on function retail.tienda_portada() to tienda_web;
