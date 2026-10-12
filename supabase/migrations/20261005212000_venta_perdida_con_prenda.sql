-- Venta perdida con la prenda exacta (ADR-0348): «Anotar que no había» guarda la variante (prenda, talla y color), no solo un texto.
--
-- EL PROBLEMA PRIMERO. Cuando un cliente pide una talla que no hay, Vender y Cambios lo anotan en `pedidos_no_atendidos` (ADR-0152,
-- ADR-0288 D-6). Pero la pantalla manda solo un texto («Blusa Carlita · Blanco») y la talla escrita: ni el producto (la función ya lo
-- aceptaba y nadie se lo pasaba) ni el color. Así, lo que se pidió y no había no puede sumarse a la demanda de su grupo (categoría ×
-- talla × familia de color), y el motor de demanda (ADR-0347) solo ve lo vendido: lo que se agota «deja de venderse» justo cuando más
-- se pide. Felipe decidió el 2026-10-05 guardar la prenda exacta, avisándole a Dany, que planificó el Club (acta D-92 a D-111).
--
-- QUÉ CAMBIA, Y SOLO ESTO.
--   1. `pedidos_no_atendidos.variante_id` (nueva, opcional, FK a `variantes`). Las filas viejas quedan en NULL: siguen siendo un texto.
--   2. `registrar_pedido_no_atendido` gana `p_variante_id` (último, opcional). Con variante: debe existir; el producto sale de ella (si
--      además viene `p_producto_id`, tiene que ser el mismo) y la talla escrita, si no vino, también. Sin variante, hace exactamente lo
--      que hacía. La firma cambia: se suelta la de 7 parámetros y se crea la de 8 (un `create or replace` con otros parámetros crearía
--      una SOBRECARGA y una llamada con nombres no sabría a cuál ir; mismo patrón que 20260930240100).
--   No cambia: los motivos y razones (D-6), el candado de sede, la firma del responsable (`fn_actor_persona_id(true)`), las políticas.
--
-- LO QUE DANY TIENE QUE SABER (Club, D-104 «Llegó tu talla»). Con la variante guardada, «llegó tu talla» puede saber qué prenda llegó
-- sin interpretar el texto. Nada de lo que el Club ya lee cambia: `producto_id`, `descripcion_libre`, `talla`, `clienta_id`, `motivo` y
-- `razon` siguen llenándose igual.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Una sola parte: un `alter table` que agrega una columna opcional (sin reescribir la
-- tabla), un índice, un `drop function` y un `create function`, sin políticas ni `drop trigger` (ADR-0195), así que no choca con el
-- Asesor de seguridad. Se pega ANTES de publicar la web nueva: la web vieja sigue funcionando con la función nueva (el parámetro nuevo es
-- opcional). Se puede pegar dos veces. La guarda aborta sin tocar nada si la función viva no es la de 20260930240100 ni la de este archivo.
-- Antes de pegar (solo lectura): `select md5(prosrc) from pg_proc where oid = to_regprocedure('retail.registrar_pedido_no_atendido(uuid,
-- uuid, text, text, uuid, text, text)');` → `1254793ac2956a751a7345ebf2f825d1` (medido en producción y en local el 2026-10-05).

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $guarda$
declare
  v_vieja text := (select md5(p.prosrc) from pg_proc p
                    where p.oid = to_regprocedure('retail.registrar_pedido_no_atendido(uuid, uuid, text, text, uuid, text, text)'));
  v_nueva boolean := to_regprocedure('retail.registrar_pedido_no_atendido(uuid, uuid, text, text, uuid, text, text, uuid)') is not null;
begin
  if v_vieja is null and not v_nueva then
    raise exception 'Falta registrar_pedido_no_atendido: pega antes 20260930240100_club_paso1d_parte2_se_probo.sql';
  end if;
  if v_vieja is not null and v_vieja <> '1254793ac2956a751a7345ebf2f825d1' then
    raise exception 'registrar_pedido_no_atendido cambió desde que se escribió esta migración (md5 %, se esperaba 1254793ac2956a751a7345ebf2f825d1). No se reemplaza a ciegas: lee su definición viva y rehace este cambio sobre ESA versión.', v_vieja;
  end if;
end
$guarda$;

-- ---------- 1. La columna ----------
alter table retail.pedidos_no_atendidos add column if not exists variante_id uuid references retail.variantes (id);
comment on column retail.pedidos_no_atendidos.variante_id is
  'ADR-0348: la prenda exacta (producto, talla y color) que se pidió y no había, cuando se anotó desde una prenda del catálogo. NULL en '
  'lo anotado antes del 2026-10-05 o con texto libre. La lee el motor de demanda (fn_demanda_sede) para sumar lo perdido a su grupo.';
create index if not exists pedidos_no_atendidos_variante_idx on retail.pedidos_no_atendidos (variante_id) where variante_id is not null;

-- ---------- 2. La función, con la variante ----------
drop function if exists retail.registrar_pedido_no_atendido(uuid, uuid, text, text, uuid, text, text);

create or replace function retail.registrar_pedido_no_atendido(
  p_ubicacion_id uuid,
  p_producto_id uuid default null,
  p_descripcion_libre text default null,
  p_talla text default null,
  p_clienta_id uuid default null,
  p_motivo text default 'no_habia_talla',
  p_razon text default null,
  p_variante_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_descripcion text := nullif(btrim(coalesce(p_descripcion_libre, '')), '');
  v_talla text := nullif(btrim(coalesce(p_talla, '')), '');
  -- Vacío o nulo = el motivo de siempre: la llamada vieja (sin motivo) sigue anotando «buscó y no había».
  v_motivo text := coalesce(nullif(btrim(coalesce(p_motivo, '')), ''), 'no_habia_talla');
  v_razon text := nullif(btrim(coalesce(p_razon, '')), '');
  v_producto uuid := p_producto_id;
  v_de_variante uuid;
  v_talla_variante text;
  v_persona uuid;
  v_id uuid;
begin
  -- CANDADO DE UBICACIÓN PRIMERO (mismo criterio que la ronda de candados del 20260921).
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para anotar pedidos en esa ubicación';
  end if;
  -- ADR-0288 D-6: dos motivos, y la razón solo cuando se la probó y no la llevó.
  if v_motivo not in ('no_habia_talla', 'se_probo_no_llevo') then
    raise exception 'Ese motivo no existe: se anota «buscó y no había» o «se la probó y no la llevó».'
      using hint = 'pedido_motivo_invalido';
  end if;
  if v_razon is not null and v_motivo <> 'se_probo_no_llevo' then
    raise exception 'La razón solo se anota cuando se la probó y no la llevó.'
      using hint = 'pedido_razon_sin_se_probo';
  end if;
  if v_razon is not null and v_razon not in ('no_le_quedo', 'precio', 'color', 'lo_piensa') then
    raise exception 'Esa razón no existe: no le quedó, el precio, el color o lo va a pensar.'
      using hint = 'pedido_razon_invalida';
  end if;
  -- ADR-0348: con la variante, el producto y la talla salen de ella (una sola verdad: la prenda del catálogo).
  if p_variante_id is not null then
    for v_de_variante, v_talla_variante in
      select va.producto_id, ta.valor
        from variantes va left join tallas ta on ta.id = va.talla_id
       where va.id = p_variante_id
    loop
      exit;
    end loop;
    if v_de_variante is null then
      raise exception 'Esa prenda no existe en el catálogo' using hint = 'pedido_variante_inexistente';
    end if;
    if p_producto_id is not null and p_producto_id <> v_de_variante then
      raise exception 'La talla elegida no es de ese modelo' using hint = 'pedido_variante_de_otro_producto';
    end if;
    v_producto := v_de_variante;
    v_talla := coalesce(v_talla, v_talla_variante);
  end if;
  if v_producto is null and v_descripcion is null then
    raise exception 'Anota el modelo del catálogo o describe lo que pidió la clienta';
  end if;
  if v_producto is not null and not exists (select 1 from productos where id = v_producto) then
    raise exception 'Ese producto no existe en el catálogo';
  end if;
  v_persona := retail.fn_actor_persona_id(true);
  if v_persona is null then
    raise exception 'No se encontró tu ficha de colaborador';
  end if;

  insert into pedidos_no_atendidos (ubicacion_id, producto_id, variante_id, descripcion_libre, talla, clienta_id, atendido_por, motivo, razon)
    values (p_ubicacion_id, v_producto, p_variante_id, v_descripcion, v_talla, p_clienta_id, v_persona, v_motivo, v_razon)
    returning id into v_id;
  return v_id;
end;
$$;

comment on function retail.registrar_pedido_no_atendido(uuid, uuid, text, text, uuid, text, text, uuid) is
  'ADR-0152 + ADR-0288 D-6 + ADR-0348: anota lo que un cliente quería y no se llevó. p_motivo = no_habia_talla (default) o '
  'se_probo_no_llevo (con p_razon opcional: no_le_quedo, precio, color, lo_piensa). p_variante_id (opcional): la prenda exacta; de ella '
  'salen el producto y la talla. Firma el responsable del combo (fn_actor_persona_id(true)); exige poder operar la sede, no un módulo.';

revoke all on function retail.registrar_pedido_no_atendido(uuid, uuid, text, text, uuid, text, text, uuid) from public, anon;
grant execute on function retail.registrar_pedido_no_atendido(uuid, uuid, text, text, uuid, text, text, uuid) to authenticated;

reset lock_timeout;
notify pgrst, 'reload schema';
