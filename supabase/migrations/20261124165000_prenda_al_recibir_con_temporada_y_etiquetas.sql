-- ============================================================================
-- 20261124165000_prenda_al_recibir_con_temporada_y_etiquetas.sql — CAYLA V2 (2026-11-24, ADR-0699 actividad 4)
-- Recibir mercadería: crear la prenda al recibir también le pone su temporada y sus etiquetas, en la misma transacción
--
-- EL PROBLEMA PRIMERO. Felipe (2026-11-24): crear la prenda desde Recibir tiene que traer «todo de creación de producto». El 2026-11-03 se
-- había decidido lo contrario («temporada e insignias se ponen después en Productos»), y eso obligaba a ir a otro apartado para terminar
-- la prenda: justo lo que este trabajo quita. `preparar_prenda_al_recibir` no recibe temporada y manda `p_etiqueta_ids => null`.
--
-- LA DECISIÓN (Felipe eligió «con migración» frente a un segundo paso desde la pantalla): una función nueva,
-- `preparar_prenda_al_recibir_con_ficha`, que llama a `preparar_prenda_al_recibir` tal cual y, en la MISMA transacción, le pone a la prenda
-- recién creada su temporada (como Nuevo producto, ADR-0246) y sus etiquetas (como `crear_producto_con_variantes`: aprobadas y activas, en
-- todas sus variantes). Si cualquier paso falla, no se crea nada: la prenda nunca queda a medias.
--
-- POR QUÉ UNA FUNCIÓN NUEVA Y NO DOS PARÁMETROS MÁS. Se probó ampliar la firma de `preparar_prenda_al_recibir` (de 14 a 16 parámetros) y
-- rompió el andamiaje de pruebas: once migraciones la reemplazan por ancla usando su firma de 14, y las suites de Postgres las vuelven a
-- cargar sobre una base al día; sin esa firma, todas fallan. La función de siempre no se toca.
--
-- CONTRATO (Liskov)
--   PROMETE: lo mismo que `preparar_prenda_al_recibir` (misma respuesta) y, al CREAR (sin `p_producto_id`), la temporada y las etiquetas
--            elegidas quedan en la prenda. Sin temporada ni etiquetas, es idéntica a llamar a la de siempre.
--   ASUME:   que la de siempre devuelve las variantes de la prenda en `variantes` (de ahí sale cuál es la prenda).
--   FALLA:   `recepcion_temporada` si la temporada no está en la lista; `recepcion_etiqueta` si una etiqueta no está aprobada y activa.
--   NO HACE: al SUMAR a una prenda que ya existe, no toca su temporada ni sus etiquetas (eso es de Productos): las rechaza con
--            `recepcion_ficha_al_sumar` para que la pantalla no crea que se guardaron.
--
-- PRODUCCIÓN. Una sola parte, re-ejecutable (`create or replace`). Sin `alter`, sin políticas ni disparadores (ADR-0195 no aplica).
-- Pegar ANTES de publicar la web: la web nueva la llama al crear. Espera el OK de Felipe.
--
-- VERIFICACIÓN (→ t | f):
--   select has_function_privilege('authenticated', 'retail.preparar_prenda_al_recibir_con_ficha(uuid,uuid,uuid,uuid,uuid,text,jsonb,numeric,text,uuid,uuid,boolean,uuid,uuid,text,uuid[])', 'execute'),
--          has_function_privilege('anon', 'retail.preparar_prenda_al_recibir_con_ficha(uuid,uuid,uuid,uuid,uuid,text,jsonb,numeric,text,uuid,uuid,boolean,uuid,uuid,text,uuid[])', 'execute');
-- CÓMO SE DESHACE: `drop function retail.preparar_prenda_al_recibir_con_ficha(...)`. Las prendas ya creadas conservan su temporada y etiquetas.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

create or replace function retail.preparar_prenda_al_recibir_con_ficha(
  p_despacho_id uuid,
  p_despacho_item_id uuid,
  p_categoria_id uuid,
  p_marca_id uuid,
  p_producto_id uuid,
  p_referencia text,
  p_variantes jsonb,
  p_precio numeric,
  p_descripcion text,
  p_tejido_id uuid,
  p_patron_id uuid,
  p_confirmo_distinto boolean,
  p_token uuid,
  p_proveedor_id uuid default null,
  p_temporada text default null,
  p_etiqueta_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_temporada text := nullif(btrim(coalesce(p_temporada, '')), '');
  v_etiquetas uuid[];
  v_respuesta jsonb;
  v_producto_id uuid;
begin
  select coalesce(array_agg(distinct e), '{}'::uuid[]) into v_etiquetas from unnest(coalesce(p_etiqueta_ids, '{}'::uuid[])) e;
  if p_producto_id is not null and (v_temporada is not null or array_length(v_etiquetas, 1) > 0) then
    raise exception 'La temporada y las etiquetas de una prenda que ya existe se cambian en Productos' using hint = 'recepcion_ficha_al_sumar';
  end if;
  -- Antes de crear nada: lo que se eligió existe. Así un error no deja una prenda creada a medias (todo va en esta misma transacción).
  if v_temporada is not null and not exists (select 1 from retail.temporadas t where t.clave = v_temporada) then
    raise exception 'Esa temporada ya no está en la lista. Recarga la pantalla.' using hint = 'recepcion_temporada';
  end if;
  if exists (
    select 1 from unnest(v_etiquetas) e
    where not exists (select 1 from retail.etiquetas x where x.id = e and x.activo and x.estado = 'aprobado')
  ) then
    raise exception 'Una de las etiquetas elegidas ya no está disponible en el catálogo. Recarga la pantalla.' using hint = 'recepcion_etiqueta';
  end if;

  -- La de siempre, con sus candados y sus permisos (quien firma, la sede, el módulo): esta función no salta ninguno.
  v_respuesta := retail.preparar_prenda_al_recibir(
    p_despacho_id, p_despacho_item_id, p_categoria_id, p_marca_id, p_producto_id, p_referencia, p_variantes, p_precio, p_descripcion,
    p_tejido_id, p_patron_id, p_confirmo_distinto, p_token, p_proveedor_id);

  if p_producto_id is null and (v_temporada is not null or array_length(v_etiquetas, 1) > 0) then
    select v.producto_id into v_producto_id
      from retail.variantes v
     where v.id = (v_respuesta -> 'variantes' -> 0 ->> 'id')::uuid;
    if v_producto_id is null then
      raise exception 'No se encontró la prenda recién creada' using hint = 'recepcion_ficha_sin_prenda';
    end if;
    -- ADR-0246: la temporada elegida (vacía = hereda la de su categoría).
    if v_temporada is not null then
      update retail.productos set temporada = v_temporada where id = v_producto_id;
    end if;
    -- Las etiquetas, en todas sus variantes, como `crear_producto_con_variantes`. Un reintento con el mismo token no las duplica.
    if array_length(v_etiquetas, 1) > 0 then
      insert into retail.variante_etiquetas (variante_id, etiqueta_id)
      select v.id, e from retail.variantes v cross join unnest(v_etiquetas) e where v.producto_id = v_producto_id
      on conflict do nothing;
    end if;
  end if;
  return v_respuesta;
end;
$$;

revoke all on function retail.preparar_prenda_al_recibir_con_ficha(uuid,uuid,uuid,uuid,uuid,text,jsonb,numeric,text,uuid,uuid,boolean,uuid,uuid,text,uuid[]) from public, anon;
grant execute on function retail.preparar_prenda_al_recibir_con_ficha(uuid,uuid,uuid,uuid,uuid,text,jsonb,numeric,text,uuid,uuid,boolean,uuid,uuid,text,uuid[]) to authenticated, service_role;
comment on function retail.preparar_prenda_al_recibir_con_ficha(uuid,uuid,uuid,uuid,uuid,text,jsonb,numeric,text,uuid,uuid,boolean,uuid,uuid,text,uuid[]) is
  'ADR-0699: preparar_prenda_al_recibir + la temporada y las etiquetas de la prenda nueva, en la misma transacción.';

reset lock_timeout;
