-- Órdenes de insumos del Taller, fase 7 · actividad 1 (ADR-0362): crear, editar y anular una orden, la lista y el detalle.
--
-- EL PROBLEMA PRIMERO. Las tablas ya existen (20261013035000), pero nadie puede escribir en ellas ni leerlas. Quien compra para el
-- Taller suele estar en Gamarra o en la fábrica de tela, con su celular y su propia cuenta, lejos del kiosco de asistencia, igual que la
-- compradora de tienda. Y los riesgos son los que la fase 1 ya cerró para la orden de tienda: un doble clic o una señal que se corta no
-- pueden dejar dos órdenes; dos personas con la misma orden abierta no se pisan; lo que la orden decía antes no se pierde; y nadie sin el
-- módulo ve lo que se pidió ni a cuánto.
--
-- QUÉ CREA (las mismas reglas y la misma forma que la fase 1 —20261010223500 a 20261010235800—, cambiando lo que corresponde: el
-- proveedor es del Taller, la línea es el insumo con su unidad y la cantidad lleva hasta tres decimales).
--   1. Las claves `orden_insumo_crear`, `orden_insumo_editar` y `orden_insumo_anular` en `acciones_sin_responsable`: con la cuenta de
--      una PERSONA la orden la firma ella, sin combo ni marca de entrada; desde una TERMINAL, el combo «Responsable», y si una terminal
--      mandara la clave sin elegir a nadie, la firma queda vacía y estas funciones la rechazan (`responsable_requerido`): una orden siempre
--      dice quién la hizo, porque quien la hace no la recibe (decisión 17) [provisional, revisar con Felipe: la decisión 39 se tomó para la
--      orden de tienda y aquí se extiende a la del Taller, por la misma razón: quien compra tela tampoco está en el kiosco].
--   2. `fn_ordenes_insumo_siguiente()`: el número que le tocaría a la próxima orden, sin gastarlo, para mostrarlo bloqueado en el
--      formulario (decisión de Felipe para las órdenes: «correlativo automático y bloqueado»).
--   3. `crear_orden_insumo(p_id, p_proveedor_id, p_destino_id, p_fecha_entrega_estimada, p_nota, p_lineas)` → (id, numero). Valida todo
--      antes de tomar el número. `p_id` lo genera la pantalla una vez por formulario: repetido con el MISMO pedido devuelve la orden que
--      ya existe; con otro pedido avisa «ya se guardó como OI-… con lo de antes» (`orden_insumo_ya_guardada`) y no cambia nada.
--   4. `editar_orden_insumo(p_id, p_version_esperada, …)` → (id, numero, version). Solo una orden «generada»; con la versión que vio la
--      pantalla (PT409 / `version_cambiada` si otra persona guardó antes, con la frase que dice qué pasó); el mismo pedido repetido no
--      choca; sin cambios no escribe; con cambios archiva lo de antes en `orden_insumo_versiones` y reemplaza cabecera y líneas.
--   5. `anular_orden_insumo(p_id, p_version_esperada, p_motivo)` → (id, numero, version). Motivo obligatorio (hasta 300 letras), con la
--      versión que vio la pantalla; el número no se libera; un doble clic no da error.
--   6. `fn_ordenes_insumo(p_estado, p_proveedor_id, p_busqueda, p_limite, p_antes_de)`: la lista, de a 50 (máximo 100), de la más nueva
--      a la más vieja, con líneas, cantidades POR UNIDAD (`{"metro": 120.5, "cono": 4}`: sumar metros con conos no dice nada, por eso no
--      hay «unidades» como en la orden de tienda) y total. Busca por el número («OI-000012», «oi12», «12»), el proveedor o el insumo
--      (nombre o código), sin tildes ni mayúsculas.
--   7. `fn_orden_insumo(p_orden_id)`: el detalle (cabecera, quién la creó, la cambió o la anuló, las líneas con el nombre, el código, el
--      tipo y la unidad del insumo, el total y las versiones archivadas con sus datos). NULL si no existe.
--   Piezas internas, que no llama la web: el número como se dice (`fn_orden_insumo_numero_texto`), el descuento en soles
--   (`fn_orden_insumo_descuento`), la foto de una orden (`fn_orden_insumo_foto`), las reglas (`fn_orden_insumo_validar`, una sola para
--   crear y editar), las huellas que comparan lo pedido con lo guardado, la escritura de las líneas, el «¿es el mismo pedido?» y la sede
--   de la línea de Actividad.
--   Las seis de la web exigen el módulo `ordenes_insumos` (42501, hint `ordenes_insumos_sin_modulo`) y nada más: ni `fn_es_lider` ni el
--   candado de dinero del Taller (decisión 47: quien tiene el módulo ve y hace todo en estas órdenes, con sus precios).
--   «Actividad» (ADR-0207): crear, editar y anular anotan su línea en el módulo `ordenes_insumos`, SIN montos ni cantidades, como la
--   orden de tienda; se ve en la sede desde donde se operó y en el Taller. Un error al anotar nunca detiene el guardado (deja un WARNING).
--
-- REGLAS (en palabras de la pantalla, hint `orden_insumo_*`): un proveedor del Taller activo; el destino, un taller activo y nunca una
-- tienda; la entrega estimada desde hoy y hasta un año (opcional); la nota hasta 500 letras; de 1 a 100 líneas, cada una con un insumo
-- del catálogo sin archivar, una descripción opcional de hasta 200 letras, la cantidad de 0.001 a 99 999.999 en la unidad del insumo con
-- hasta tres decimales, el precio de S/ 0 a S/ 99 999.9999 con hasta cuatro (como el costo de los comprobantes y los lotes del Taller),
-- y un descuento en % (0 a 100) o en soles (con céntimos) que no pase del importe de la línea. Al editar, lo que no se tocó no se vuelve a juzgar: un proveedor o un taller desactivados después, un insumo archivado
-- después o una entrega que ya pasó no impiden corregir la nota; elegirlos de nuevo, sí se rechaza.
-- Lo que se decidió sin Felipe va marcado en su lugar con [provisional, revisar con Felipe]:
--   · Que el insumo NO se restrinja al proveedor de la orden: `insumos.proveedor_id` es el proveedor de costumbre, no un candado (en
--     Gamarra se compra la misma tela a quien la tenga), y tampoco se mira el rubro del proveedor [provisional, revisar con Felipe].
--   · Que la cantidad admita hasta tres decimales en CUALQUIER unidad, también «unidad», «par», «cono» o «docena», como ya lo hace el
--     resto del Taller (`recibir_comprobante_produccion`) [provisional, revisar con Felipe].
--   · Que el mismo insumo pueda ir en dos líneas (por ejemplo, con dos descripciones): la orden de tienda tampoco lo prohíbe
--     [provisional, revisar con Felipe].
--   · Que al EDITAR la línea copie la unidad que el insumo tiene ese día: si alguien cambió la unidad del insumo después de crear la orden,
--     la edición la toma con el mismo número (lo de antes queda en el archivo). Por eso el detalle trae, por línea, `unidad_medida` (la de
--     la orden) y `unidad_actual` (la del insumo hoy): la pantalla puede avisar antes de guardar [provisional, revisar con Felipe].
--
-- LO QUE TODAVÍA NO HACE (espera respuestas de Felipe, contrato `contrato-ordenes-de-insumos.md`): el comprobante de la orden
-- (`comprobantes_produccion` ligado a la orden), la recepción en el Taller contra la orden (con «quien hizo la orden no la recibe»,
-- decisión 17) y el fondo por rendir. Cuando lleguen, editar y anular sumarán el candado «no con un comprobante o una recepción vivos»,
-- como hicieron las fases 2 y 3 con la orden de tienda.
--
-- DESCARTÉ
--   · Llamar a las piezas internas de la orden de tienda (`fn_orden_compra_validar`, `fn_orden_compra_huella`…): hablan de categoría y
--     marca, de `proveedores` y de «por repartir», y unirlas obligaba a cada cambio de la orden de tienda a pensar en el Taller. Las de aquí
--     son sus gemelas, con su propio nombre.
--   · Que el detalle sea también la foto que se archiva (como `fn_orden_compra_detalle`): el detalle trae las versiones, y archivarlo
--     haría que cada versión guarde adentro todas las anteriores. La foto (`fn_orden_insumo_foto`) no las trae; el detalle se arma encima.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Una sola parte, DESPUÉS de 20261013035000: solo funciones y tres filas en
-- `acciones_sin_responsable`; sin tablas, sin políticas, sin `drop trigger` (ADR-0195), sin `select … into` dentro de textos entre
-- comillas (ADR-0288). Idempotente: se puede pegar dos veces.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. Con la cuenta de una persona, sin combo (decisión 39, extendida al Taller) ----------
insert into retail.acciones_sin_responsable (clave, descripcion) values
  ('orden_insumo_crear', 'Crear una orden de insumos del Taller (con la cuenta de una persona firma ella, desde una terminal se elige quién)'),
  ('orden_insumo_editar', 'Editar una orden de insumos del Taller (con la cuenta de una persona firma ella, desde una terminal se elige quién)'),
  ('orden_insumo_anular', 'Anular una orden de insumos del Taller (con la cuenta de una persona firma ella, desde una terminal se elige quién)')
on conflict (clave) do update set descripcion = excluded.descripcion;

-- ---------- 2. Piezas internas ----------

-- «OI-000012»: el número como se dice (el prefijo es presentación; la base guarda el número, decisión 28).
create or replace function retail.fn_orden_insumo_numero_texto(p_numero integer) returns text
language sql
immutable
set search_path = retail, public, extensions
as $$
  select 'OI-' || lpad(p_numero::text, 6, '0');
$$;

-- El descuento de una línea en soles: si viene en %, sobre el IMPORTE de la línea (cantidad × precio redondeado a céntimos, lo que dice
-- el papel); si viene en soles, tal cual. Es la misma cuenta que exige el candado `orden_insumo_items_descuento_cuadra`.
create or replace function retail.fn_orden_insumo_descuento(p_cantidad numeric, p_precio numeric, p_pct numeric, p_descuento numeric)
returns numeric
language sql
immutable
set search_path = retail, public, extensions
as $$
  select case
           when p_pct is not null then round(round(p_cantidad * p_precio, 2) * p_pct / 100, 2)
           else coalesce(p_descuento, 0)
         end;
$$;

-- La orden como está guardada: cabecera, quién la creó, la cambió o la anuló, las líneas con su insumo, las cantidades por unidad y el
-- total. Es lo que se archiva al editar (sin versiones adentro) y la base del detalle. NULL si no existe.
create or replace function retail.fn_orden_insumo_foto(p_orden_id uuid) returns jsonb
language sql
stable
set search_path = retail, public, extensions
as $$
  select jsonb_build_object(
           'id', o.id,
           'numero', o.numero,
           'estado', o.estado,
           'proveedor', jsonb_build_object('id', pr.id, 'nombre', pr.nombre, 'ruc', pr.ruc, 'rubro', pr.rubro),
           'destino', jsonb_build_object('id', u.id, 'nombre', u.nombre),
           'fecha_emision', o.fecha_emision,
           'fecha_entrega_estimada', o.fecha_entrega_estimada,
           'nota', o.nota,
           'creada_por', nullif(btrim(concat_ws(' ', pc.nombres, pc.apellidos)), ''),
           'creada_en', o.creada_en,
           'actualizada_por', nullif(btrim(concat_ws(' ', pa.nombres, pa.apellidos)), ''),
           'actualizada_en', o.actualizada_en,
           'version', o.version,
           'anulada_por', nullif(btrim(concat_ws(' ', pn.nombres, pn.apellidos)), ''),
           'anulada_en', o.anulada_en,
           'motivo_anulacion', o.motivo_anulacion,
           'lineas', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'posicion', i.posicion,
                      'insumo_id', i.insumo_id,
                      'insumo', n.nombre,
                      'codigo', n.codigo,
                      'tipo', n.tipo,
                      -- La unidad de la orden (copiada al guardar) y la del insumo hoy: si difieren, alguien la cambió después.
                      'unidad_medida', i.unidad_medida,
                      'unidad_actual', n.unidad_medida,
                      'descripcion', i.descripcion,
                      'cantidad', i.cantidad,
                      'precio_unitario', i.precio_unitario,
                      'descuento', i.descuento,
                      'descuento_pct', i.descuento_pct,
                      'subtotal', i.subtotal
                    ) order by i.posicion)
               from retail.orden_insumo_items i
               join retail.insumos n on n.id = i.insumo_id
              where i.orden_insumo_id = o.id
           ), '[]'::jsonb),
           'cantidades', coalesce((
             select jsonb_object_agg(x.unidad_medida, x.cantidad)
               from (select i.unidad_medida, sum(i.cantidad) as cantidad
                       from retail.orden_insumo_items i
                      where i.orden_insumo_id = o.id
                      group by i.unidad_medida) x
           ), '{}'::jsonb),
           'total', coalesce((select sum(i.subtotal) from retail.orden_insumo_items i where i.orden_insumo_id = o.id), 0)
         )
    from retail.ordenes_insumo o
    join retail.proveedores_produccion pr on pr.id = o.proveedor_id
    join retail.ubicaciones u on u.id = o.ubicacion_destino_id
    left join public.personas pc on pc.id = o.creada_por
    left join public.personas pa on pa.id = o.actualizada_por
    left join public.personas pn on pn.id = o.anulada_por
   where o.id = p_orden_id;
$$;

-- Las reglas de una orden de insumos, para crear y para editar. `p_anterior` es la foto de la orden como estaba (al editar) o NULL (al
-- crear): lo que no cambió no se vuelve a juzgar. Rechaza con el mensaje de la pantalla y su hint.
create or replace function retail.fn_orden_insumo_validar(
  p_proveedor_id uuid,
  p_destino_id uuid,
  p_fecha_entrega_estimada date,
  p_nota text,
  p_lineas jsonb,
  p_anterior jsonb default null
) returns void
language plpgsql
stable
set search_path = retail, public, extensions
as $$
declare
  v_hoy date := retail.fn_hoy_lima();
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_editando boolean := p_anterior is not null;
  v_linea jsonb;
  v_pos integer := 0;
  v_insumo uuid;
  v_unidad text;
  v_descripcion text;
  v_cantidad numeric;
  v_precio numeric;
  v_pct numeric;
  v_descuento numeric;
  v_importe numeric;
begin
  -- Cabecera. Un proveedor del Taller (no uno de tienda: decisión 25); al editar, el que la orden ya tenía vale aunque hoy esté inactivo.
  if p_proveedor_id is null
     or not exists (
       select 1 from retail.proveedores_produccion pr
        where pr.id = p_proveedor_id
          and (pr.activo or (v_editando and pr.id = (p_anterior -> 'proveedor' ->> 'id')::uuid))
     ) then
    raise exception 'Elige un proveedor del Taller activo' using hint = 'orden_insumo_proveedor';
  end if;
  -- El destino: un taller, nunca una tienda ni «por repartir» [provisional, revisar con Felipe: destino obligatorio y de tipo taller].
  if p_destino_id is null
     or not exists (
       select 1 from retail.ubicaciones u
        where u.id = p_destino_id
          and u.tipo = 'taller'
          and (u.activo or (v_editando and u.id = (p_anterior -> 'destino' ->> 'id')::uuid))
     ) then
    raise exception 'Los insumos llegan al Taller: elige un taller activo' using hint = 'orden_insumo_destino';
  end if;
  -- `is not distinct from`: con la fecha anterior vacía, una fecha NUEVA siempre se juzga (lo que corrigió 20261010235800 en la de tienda).
  if p_fecha_entrega_estimada is not null
     and (p_fecha_entrega_estimada < v_hoy or p_fecha_entrega_estimada > v_hoy + 365)
     and not (v_editando and p_fecha_entrega_estimada is not distinct from (p_anterior ->> 'fecha_entrega_estimada')::date) then
    raise exception 'La entrega estimada va desde hoy y hasta dentro de un año' using hint = 'orden_insumo_entrega';
  end if;
  if v_nota is not null and length(v_nota) > 500 then
    raise exception 'La nota es muy larga: hasta 500 letras' using hint = 'orden_insumo_nota';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'Agrega al menos un insumo a la orden' using hint = 'orden_insumo_sin_lineas';
  end if;
  if jsonb_array_length(p_lineas) > 100 then
    raise exception 'Una orden lleva hasta 100 líneas: parte el pedido en dos órdenes' using hint = 'orden_insumo_muchas_lineas';
  end if;

  -- Líneas: TODAS antes de escribir nada (al crear, el número del contador se toma recién si la orden se va a guardar).
  for v_linea in select value from jsonb_array_elements(p_lineas) loop
    v_pos := v_pos + 1;
    if jsonb_typeof(v_linea) <> 'object' then
      raise exception 'La línea % no se entiende', v_pos using hint = 'orden_insumo_linea';
    end if;
    begin
      v_insumo := nullif(btrim(v_linea ->> 'insumo_id'), '')::uuid;
      v_cantidad := nullif(btrim(v_linea ->> 'cantidad'), '')::numeric;
      v_precio := nullif(btrim(v_linea ->> 'precio_unitario'), '')::numeric;
      v_pct := nullif(btrim(v_linea ->> 'descuento_pct'), '')::numeric;
      v_descuento := nullif(btrim(v_linea ->> 'descuento'), '')::numeric;
    exception when others then
      raise exception 'La línea % tiene un número o un dato que no se entiende', v_pos using hint = 'orden_insumo_linea';
    end;
    v_descripcion := nullif(btrim(coalesce(v_linea ->> 'descripcion', '')), '');
    -- El insumo, del catálogo y sin archivar; al editar, uno que la orden ya tenía vale aunque hoy esté archivado. Cualquier insumo con
    -- cualquier proveedor: `insumos.proveedor_id` es el de costumbre, no un candado [provisional, revisar con Felipe].
    v_unidad := (
      select n.unidad_medida from retail.insumos n
       where n.id = v_insumo
         and (n.archivado_at is null
              or (v_editando and exists (
                    select 1 from jsonb_array_elements(p_anterior -> 'lineas') a where (a ->> 'insumo_id')::uuid = v_insumo)))
    );
    if v_insumo is null or v_unidad is null then
      raise exception 'La línea % necesita un insumo del catálogo que no esté archivado', v_pos using hint = 'orden_insumo_insumo';
    end if;
    if v_descripcion is not null and length(v_descripcion) > 200 then
      raise exception 'La descripción de la línea % es muy larga: hasta 200 letras', v_pos using hint = 'orden_insumo_descripcion';
    end if;
    -- Hasta tres decimales en cualquier unidad, como el resto del Taller [provisional, revisar con Felipe].
    if v_cantidad is null or v_cantidad <= 0 or v_cantidad > 99999.999 or v_cantidad <> round(v_cantidad, 3) then
      raise exception 'La cantidad de la línea % va de 0.001 a 99 999.999 %, con hasta tres decimales', v_pos,
        case v_unidad
          when 'metro' then 'metros' when 'unidad' then 'unidades' when 'kilo' then 'kilos'
          when 'cono' then 'conos' when 'par' then 'pares' when 'docena' then 'docenas'
          else v_unidad
        end
        using hint = 'orden_insumo_cantidad';
    end if;
    -- Hasta 4 decimales, como el costo de los comprobantes y los lotes del Taller (un botón de S/ 0.0350).
    if v_precio is null or v_precio < 0 or v_precio > 99999.9999 or v_precio <> round(v_precio, 4) then
      raise exception 'El precio de la línea % va de S/ 0 a S/ 99 999.9999, con hasta cuatro decimales', v_pos
        using hint = 'orden_insumo_precio';
    end if;
    v_importe := round(v_cantidad * v_precio, 2);
    if v_pct is not null and (v_pct < 0 or v_pct > 100 or v_pct <> round(v_pct, 4)) then
      raise exception 'El descuento de la línea % va de 0 %% a 100 %%', v_pos using hint = 'orden_insumo_descuento';
    end if;
    if v_pct is null and v_descuento is not null
       and (v_descuento < 0 or v_descuento <> round(v_descuento, 2) or v_descuento > v_importe) then
      raise exception 'El descuento de la línea % no puede pasar de lo que cuesta la línea', v_pos using hint = 'orden_insumo_descuento';
    end if;
  end loop;
end;
$$;

-- Lo que la orden PIDE, en una forma comparable: cabecera y líneas con el descuento ya en soles. Sirve para saber si una edición cambia
-- algo (sin cambios no se escribe) y si un pedido repetido es el mismo que ya se guardó. Solo con líneas ya validadas. La unidad no entra:
-- no la manda la pantalla, sale del insumo.
create or replace function retail.fn_orden_insumo_huella(
  p_proveedor_id uuid,
  p_destino_id uuid,
  p_fecha_entrega_estimada date,
  p_nota text,
  p_lineas jsonb
) returns jsonb
language sql
immutable
set search_path = retail, public, extensions
as $$
  select jsonb_build_object(
    'proveedor', p_proveedor_id,
    'destino', p_destino_id,
    'entrega', p_fecha_entrega_estimada,
    'nota', nullif(btrim(coalesce(p_nota, '')), ''),
    'lineas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'insumo_id', nullif(btrim(l.valor ->> 'insumo_id'), '')::uuid,
               'descripcion', nullif(btrim(coalesce(l.valor ->> 'descripcion', '')), ''),
               'cantidad', nullif(btrim(l.valor ->> 'cantidad'), '')::numeric,
               'precio', nullif(btrim(l.valor ->> 'precio_unitario'), '')::numeric,
               'descuento', retail.fn_orden_insumo_descuento(
                              nullif(btrim(l.valor ->> 'cantidad'), '')::numeric,
                              nullif(btrim(l.valor ->> 'precio_unitario'), '')::numeric,
                              nullif(btrim(l.valor ->> 'descuento_pct'), '')::numeric,
                              nullif(btrim(l.valor ->> 'descuento'), '')::numeric),
               'descuento_pct', nullif(btrim(l.valor ->> 'descuento_pct'), '')::numeric
             ) order by l.posicion)
        from jsonb_array_elements(p_lineas) with ordinality as l(valor, posicion)
    ), '[]'::jsonb)
  );
$$;

-- La huella de la orden como está guardada (mismas claves que `fn_orden_insumo_huella`).
create or replace function retail.fn_orden_insumo_huella_guardada(p_orden_id uuid) returns jsonb
language sql
stable
set search_path = retail, public, extensions
as $$
  select jsonb_build_object(
    'proveedor', o.proveedor_id,
    'destino', o.ubicacion_destino_id,
    'entrega', o.fecha_entrega_estimada,
    'nota', o.nota,
    'lineas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'insumo_id', i.insumo_id,
               'descripcion', i.descripcion,
               'cantidad', i.cantidad,
               'precio', i.precio_unitario,
               'descuento', i.descuento,
               'descuento_pct', i.descuento_pct
             ) order by i.posicion)
        from retail.orden_insumo_items i
       where i.orden_insumo_id = o.id
    ), '[]'::jsonb)
  )
  from retail.ordenes_insumo o
  where o.id = p_orden_id;
$$;

-- Escribe las líneas de una orden (ya validadas). La unidad se COPIA del insumo ese día [provisional, revisar con Felipe]; el descuento
-- en % se convierte a soles con `fn_orden_insumo_descuento`, así el candado del esquema se cumple por construcción.
create or replace function retail.fn_orden_insumo_escribir_lineas(p_orden_id uuid, p_lineas jsonb) returns void
language sql
volatile
set search_path = retail, public, extensions
as $$
  insert into retail.orden_insumo_items
    (orden_insumo_id, posicion, insumo_id, descripcion, cantidad, unidad_medida, precio_unitario, descuento, descuento_pct)
  select p_orden_id,
         l.posicion,
         nullif(btrim(l.valor ->> 'insumo_id'), '')::uuid,
         nullif(btrim(coalesce(l.valor ->> 'descripcion', '')), ''),
         nullif(btrim(l.valor ->> 'cantidad'), '')::numeric,
         -- Una subconsulta y no un join: si el insumo faltara, la columna NOT NULL rechaza la línea en vez de perderla en silencio.
         (select n.unidad_medida from retail.insumos n where n.id = nullif(btrim(l.valor ->> 'insumo_id'), '')::uuid),
         nullif(btrim(l.valor ->> 'precio_unitario'), '')::numeric,
         retail.fn_orden_insumo_descuento(
           nullif(btrim(l.valor ->> 'cantidad'), '')::numeric,
           nullif(btrim(l.valor ->> 'precio_unitario'), '')::numeric,
           nullif(btrim(l.valor ->> 'descuento_pct'), '')::numeric,
           nullif(btrim(l.valor ->> 'descuento'), '')::numeric),
         nullif(btrim(l.valor ->> 'descuento_pct'), '')::numeric
    from jsonb_array_elements(p_lineas) with ordinality as l(valor, posicion);
$$;

-- Dónde se ve una línea de Actividad de una orden: en la sede desde donde se operó (la terminal o la sede elegida; si no, la asignada).
create or replace function retail.fn_orden_insumo_sede_actividad(p_persona_id uuid) returns uuid
language plpgsql
stable
set search_path = retail, public, extensions
as $$
begin
  return retail.fn_actividad_sede_de(p_persona_id, 'vivo');
exception when others then
  return null;
end;
$$;

-- ¿Lo que llega con un `p_id` que ya existe es el MISMO pedido? (un doble clic, o un reintento después de perder la respuesta con la
-- señal). Si lo es, no pasa nada. Si cambió algo, avisa que la orden ya se guardó con lo de antes: devolverla «tal cual» haría que la
-- pantalla dijera «guardada» con datos que la base no tiene (lo vio el escéptico de Formidable en la orden de tienda, 2026-10-10).
create or replace function retail.fn_orden_insumo_exigir_mismo_pedido(
  p_id uuid,
  p_numero integer,
  p_proveedor_id uuid,
  p_destino_id uuid,
  p_fecha_entrega_estimada date,
  p_nota text,
  p_lineas jsonb
) returns void
language plpgsql
stable
set search_path = retail, public, extensions
as $$
declare
  v_pedida jsonb;
begin
  begin
    v_pedida := retail.fn_orden_insumo_huella(p_proveedor_id, p_destino_id, p_fecha_entrega_estimada, p_nota, p_lineas);
  exception when others then
    v_pedida := null; -- lo pedido ni siquiera se puede leer: no es el mismo pedido
  end;
  if v_pedida is null or v_pedida is distinct from retail.fn_orden_insumo_huella_guardada(p_id) then
    raise exception 'Esta orden ya se guardó como % con lo que tenía antes de tu cambio. Ábrela y corrígela ahí.',
      retail.fn_orden_insumo_numero_texto(p_numero)
      using hint = 'orden_insumo_ya_guardada';
  end if;
end;
$$;

-- ---------- 3. El número que le tocaría a la próxima orden ----------
create or replace function retail.fn_ordenes_insumo_siguiente()
returns integer
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_ultimo bigint;
  v_llamado boolean;
begin
  if retail.fn_ve_modulo('ordenes_insumos') is not true then
    raise exception 'Crear una orden de insumos necesita el módulo «Órdenes de insumos» en tu rol'
      using errcode = '42501', hint = 'ordenes_insumos_sin_modulo';
  end if;
  -- Leer el contador no lo gasta: `last_value` y `is_called` dicen cuál fue el último entregado.
  for v_ultimo, v_llamado in select s.last_value, s.is_called from retail.ordenes_insumo_numero_seq s loop
    exit;
  end loop;
  return case when v_llamado then v_ultimo + 1 else v_ultimo end;
end;
$$;
comment on function retail.fn_ordenes_insumo_siguiente() is
  'ADR-0362 fase 7: el número que le tocaría a la próxima orden de insumos, sin gastarlo (vista previa del formulario). Exige el módulo.';

-- ---------- 4. Crear ----------
create or replace function retail.crear_orden_insumo(
  p_id uuid,
  p_proveedor_id uuid,
  p_destino_id uuid,
  p_fecha_entrega_estimada date,
  p_nota text,
  p_lineas jsonb
)
returns table (id uuid, numero integer)
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_existente record;
  v_id uuid;
  v_numero integer;
  v_lineas integer;
begin
  if retail.fn_ve_modulo('ordenes_insumos') is not true then
    raise exception 'Crear una orden de insumos necesita el módulo «Órdenes de insumos» en tu rol'
      using errcode = '42501', hint = 'ordenes_insumos_sin_modulo';
  end if;
  -- Quién la crea: con la cuenta de una persona, ella (`orden_insumo_crear` está soltada del combo); desde una terminal, el responsable
  -- elegido, presente en la tienda. NULL solo pasa si una terminal manda la clave sin elegir a nadie: una orden sin autor no se guarda.
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  if p_id is null then
    raise exception 'Falta el identificador de la orden: vuelve a abrir el formulario' using hint = 'orden_insumo_sin_id';
  end if;

  -- Doble clic o reintento: la orden ya se guardó. Si es el mismo pedido se devuelve tal cual; si la persona cambió algo entre un
  -- intento y otro, se le avisa que quedó con lo de antes. Nunca se crea otra ni se cambia nada.
  for v_existente in select o.id, o.numero, o.creada_por from retail.ordenes_insumo o where o.id = p_id loop
    if v_existente.creada_por is distinct from v_actor then
      raise exception 'Esa orden ya existe' using hint = 'orden_insumo_ya_existe';
    end if;
    perform retail.fn_orden_insumo_exigir_mismo_pedido(
      v_existente.id, v_existente.numero, p_proveedor_id, p_destino_id, p_fecha_entrega_estimada, v_nota, p_lineas);
    return query select v_existente.id, v_existente.numero;
    return;
  end loop;

  perform retail.fn_orden_insumo_validar(p_proveedor_id, p_destino_id, p_fecha_entrega_estimada, v_nota, p_lineas, null);

  -- Todo bien: recién ahora se toma el número.
  insert into retail.ordenes_insumo (id, proveedor_id, ubicacion_destino_id, fecha_entrega_estimada, nota, creada_por)
  values (p_id, p_proveedor_id, p_destino_id, p_fecha_entrega_estimada, v_nota, v_actor)
  on conflict on constraint ordenes_insumo_pkey do nothing
  returning ordenes_insumo.id, ordenes_insumo.numero into v_id, v_numero;
  -- Dos pedidos con el mismo `p_id` al mismo tiempo: el segundo espera al primero, no inserta y devuelve su orden (si pedía lo mismo).
  if v_id is null then
    for v_existente in select o.id, o.numero, o.creada_por from retail.ordenes_insumo o where o.id = p_id loop
      if v_existente.creada_por is distinct from v_actor then
        raise exception 'Esa orden ya existe' using hint = 'orden_insumo_ya_existe';
      end if;
      perform retail.fn_orden_insumo_exigir_mismo_pedido(
        v_existente.id, v_existente.numero, p_proveedor_id, p_destino_id, p_fecha_entrega_estimada, v_nota, p_lineas);
      return query select v_existente.id, v_existente.numero;
      return;
    end loop;
  end if;

  perform retail.fn_orden_insumo_escribir_lineas(v_id, p_lineas);

  -- Actividad (ADR-0207): sin montos ni cantidades. Si falla, la orden igual queda guardada.
  begin
    v_lineas := jsonb_array_length(p_lineas);
    perform retail.fn_actividad_anotar(
      'ordenes_insumos', 'orden_insumo_creada',
      'creó la ' || retail.fn_orden_insumo_numero_texto(v_numero) || ' para '
        || (select pr.nombre from retail.proveedores_produccion pr where pr.id = p_proveedor_id) || ': '
        || retail.fn_actividad_cuantas(v_lineas, 'línea', 'líneas') || ' · llega a '
        || (select u.nombre from retail.ubicaciones u where u.id = p_destino_id),
      v_actor, retail.fn_actividad_terminal_ahora(), retail.fn_orden_insumo_sede_actividad(v_actor), p_destino_id,
      'ordenes_insumo', v_id::text, now(),
      jsonb_build_object('orden_id', v_id, 'numero', v_numero, 'lineas', v_lineas, 'destino_id', p_destino_id),
      'vivo');
  exception when others then
    raise warning 'actividad: no se anotó la orden de insumos % (%)', v_numero, sqlerrm;
  end;

  return query select v_id, v_numero;
end;
$$;
comment on function retail.crear_orden_insumo(uuid, uuid, uuid, date, text, jsonb) is
  'ADR-0362 fase 7: crea una orden de insumos del Taller con sus líneas (generada). p_id lo genera la pantalla: repetido con el mismo '
  'pedido devuelve la misma orden; con otro, orden_insumo_ya_guardada. Exige el módulo ordenes_insumos. Firma el actor de tienda '
  '(orden_insumo_crear: persona sin combo, terminal con combo).';

-- ---------- 5. Editar ----------
create or replace function retail.editar_orden_insumo(
  p_id uuid,
  p_version_esperada integer,
  p_proveedor_id uuid,
  p_destino_id uuid,
  p_fecha_entrega_estimada date,
  p_nota text,
  p_lineas jsonb
)
returns table (id uuid, numero integer, version integer)
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_orden retail.ordenes_insumo;
  v_anterior jsonb;
  v_guardada jsonb;
  v_pedida jsonb;
  v_version integer;
  v_cambios text[] := '{}';
  v_claves text[] := '{}';
  v_antes jsonb;
  v_despues jsonb;
  v_n_antes integer;
  v_n_despues integer;
  v_agregadas integer := 0;
  v_quitadas integer := 0;
  v_cambiadas integer := 0;
  v_i integer;
begin
  if retail.fn_ve_modulo('ordenes_insumos') is not true then
    raise exception 'Editar una orden de insumos necesita el módulo «Órdenes de insumos» en tu rol'
      using errcode = '42501', hint = 'ordenes_insumos_sin_modulo';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  if p_id is null or p_version_esperada is null then
    raise exception 'Falta saber qué orden y qué versión estás editando: vuelve a abrirla' using hint = 'orden_insumo_sin_version';
  end if;

  -- La fila se bloquea: dos guardados a la vez se ponen en fila, y el segundo, al despertar, ve la versión que dejó el primero.
  select o.* into v_orden from retail.ordenes_insumo o where o.id = p_id for update;
  if not found then
    raise exception 'Esa orden de insumos no existe' using hint = 'orden_insumo_no_existe';
  end if;

  if v_orden.version <> p_version_esperada then
    -- ¿Es el mismo pedido que ya se guardó (doble clic, reintento sin red)? Entonces no hay choque: se devuelve la orden como está.
    begin
      v_pedida := retail.fn_orden_insumo_huella(p_proveedor_id, p_destino_id, p_fecha_entrega_estimada, v_nota, p_lineas);
    exception when others then
      v_pedida := null;
    end;
    if v_pedida is not null and v_pedida = retail.fn_orden_insumo_huella_guardada(p_id) and v_orden.estado = 'generada' then
      return query select v_orden.id, v_orden.numero, v_orden.version;
      return;
    end if;
    -- El choque dice la verdad sobre QUÉ pasó: siempre PT409 (la pantalla ofrece «Recargar»), con la frase que corresponde.
    if v_orden.estado = 'anulada' then
      raise exception 'Esta orden se anuló mientras la editabas. Recarga para verla.'
        using errcode = 'PT409', hint = 'version_cambiada';
    end if;
    if v_orden.actualizada_por = v_actor then
      -- Su guardado anterior SÍ llegó (la respuesta se perdió con la señal, u otra pestaña suya): no fue «otra persona».
      raise exception 'Tu cambio anterior sí se guardó, pero esta pantalla todavía no lo muestra. Recarga para ver cómo quedó.'
        using errcode = 'PT409', hint = 'version_cambiada';
    end if;
    raise exception 'Otra persona cambió esta orden mientras la editabas. Recarga para ver sus cambios.'
      using errcode = 'PT409', hint = 'version_cambiada';
  end if;

  if v_orden.estado <> 'generada' then
    raise exception 'Esta orden está anulada: ya no se puede editar' using hint = 'orden_insumo_anulada';
  end if;

  v_anterior := retail.fn_orden_insumo_foto(p_id);
  perform retail.fn_orden_insumo_validar(p_proveedor_id, p_destino_id, p_fecha_entrega_estimada, v_nota, p_lineas, v_anterior);

  v_guardada := retail.fn_orden_insumo_huella_guardada(p_id);
  v_pedida := retail.fn_orden_insumo_huella(p_proveedor_id, p_destino_id, p_fecha_entrega_estimada, v_nota, p_lineas);
  if v_pedida = v_guardada then
    -- Sin cambios: nada que guardar, ni versión que subir.
    return query select v_orden.id, v_orden.numero, v_orden.version;
    return;
  end if;

  -- Lo que la orden decía, al archivo (con precios y unidades): las líneas se reemplazan, pero lo de antes no se pierde.
  insert into retail.orden_insumo_versiones (orden_insumo_id, version, datos, reemplazada_por)
  values (p_id, v_orden.version, v_anterior, v_actor);

  update retail.ordenes_insumo o
     set proveedor_id = p_proveedor_id,
         ubicacion_destino_id = p_destino_id,
         fecha_entrega_estimada = p_fecha_entrega_estimada,
         nota = v_nota,
         actualizada_por = v_actor,
         actualizada_en = now()
   where o.id = p_id
  returning o.version into v_version;

  delete from retail.orden_insumo_items i where i.orden_insumo_id = p_id;
  perform retail.fn_orden_insumo_escribir_lineas(p_id, p_lineas);

  -- Actividad (ADR-0207): qué cambió, sin montos ni cantidades. Las líneas se comparan por su lugar en la orden (la 1 con la 1): basta
  -- para decir cuántas se agregaron, quitaron o cambiaron. Si falla, la edición igual queda guardada.
  begin
    if v_pedida -> 'proveedor' is distinct from v_guardada -> 'proveedor' then
      v_claves := v_claves || 'proveedor'::text;
      v_cambios := v_cambios || ('proveedor '
        || (select pr.nombre from retail.proveedores_produccion pr where pr.id = v_orden.proveedor_id) || ' → '
        || (select pr.nombre from retail.proveedores_produccion pr where pr.id = p_proveedor_id));
    end if;
    if v_pedida -> 'destino' is distinct from v_guardada -> 'destino' then
      v_claves := v_claves || 'destino'::text;
      v_cambios := v_cambios || ('llega a '
        || (select u.nombre from retail.ubicaciones u where u.id = v_orden.ubicacion_destino_id) || ' → '
        || (select u.nombre from retail.ubicaciones u where u.id = p_destino_id));
    end if;
    if v_pedida -> 'entrega' is distinct from v_guardada -> 'entrega' then
      v_claves := v_claves || 'entrega'::text;
      v_cambios := v_cambios || ('entrega ' || coalesce(to_char(v_orden.fecha_entrega_estimada, 'DD/MM'), 'sin fecha') || ' → '
                                 || coalesce(to_char(p_fecha_entrega_estimada, 'DD/MM'), 'sin fecha'));
    end if;
    if v_pedida -> 'nota' is distinct from v_guardada -> 'nota' then
      v_claves := v_claves || 'nota'::text;
      v_cambios := v_cambios || 'la nota'::text;
    end if;
    v_n_antes := jsonb_array_length(v_guardada -> 'lineas');
    v_n_despues := jsonb_array_length(v_pedida -> 'lineas');
    for v_i in 0 .. greatest(v_n_antes, v_n_despues) - 1 loop
      v_antes := v_guardada -> 'lineas' -> v_i;
      v_despues := v_pedida -> 'lineas' -> v_i;
      if v_antes is null then
        v_agregadas := v_agregadas + 1;
      elsif v_despues is null then
        v_quitadas := v_quitadas + 1;
      elsif v_antes <> v_despues then
        v_cambiadas := v_cambiadas + 1;
      end if;
    end loop;
    if v_agregadas > 0 then v_cambios := v_cambios || retail.fn_actividad_cuantas(v_agregadas, 'línea agregada', 'líneas agregadas'); end if;
    if v_quitadas > 0 then v_cambios := v_cambios || retail.fn_actividad_cuantas(v_quitadas, 'línea quitada', 'líneas quitadas'); end if;
    if v_cambiadas > 0 then v_cambios := v_cambios || retail.fn_actividad_cuantas(v_cambiadas, 'línea cambiada', 'líneas cambiadas'); end if;

    perform retail.fn_actividad_anotar(
      'ordenes_insumos', 'orden_insumo_editada',
      'editó la ' || retail.fn_orden_insumo_numero_texto(v_orden.numero)
        || coalesce(': ' || nullif(array_to_string(v_cambios, ' · '), ''), ''),
      v_actor, retail.fn_actividad_terminal_ahora(), retail.fn_orden_insumo_sede_actividad(v_actor), p_destino_id,
      'ordenes_insumo', p_id::text, now(),
      jsonb_build_object('orden_id', p_id, 'numero', v_orden.numero, 'version_anterior', v_orden.version, 'version', v_version,
                         'campos', to_jsonb(v_claves),
                         'lineas', jsonb_build_object('agregadas', v_agregadas, 'quitadas', v_quitadas, 'cambiadas', v_cambiadas)),
      'vivo');
  exception when others then
    raise warning 'actividad: no se anotó la edición de la orden de insumos % (%)', v_orden.numero, sqlerrm;
  end;

  return query select v_orden.id, v_orden.numero, v_version;
end;
$$;
comment on function retail.editar_orden_insumo(uuid, integer, uuid, uuid, date, text, jsonb) is
  'ADR-0362 fase 7: edita una orden de insumos generada con la versión que vio la pantalla (PT409 / version_cambiada si otra persona '
  'guardó antes; el mismo pedido repetido devuelve la orden sin choque). Archiva lo de antes en orden_insumo_versiones y anota en '
  'Actividad, sin montos. Exige el módulo ordenes_insumos. Firma el actor de tienda (orden_insumo_editar).';

-- ---------- 6. Anular ----------
create or replace function retail.anular_orden_insumo(
  p_id uuid,
  p_version_esperada integer,
  p_motivo text
)
returns table (id uuid, numero integer, version integer)
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_orden retail.ordenes_insumo;
  v_version integer;
begin
  if retail.fn_ve_modulo('ordenes_insumos') is not true then
    raise exception 'Anular una orden de insumos necesita el módulo «Órdenes de insumos» en tu rol'
      using errcode = '42501', hint = 'ordenes_insumos_sin_modulo';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  if p_id is null or p_version_esperada is null then
    raise exception 'Falta saber qué orden y qué versión estás anulando: vuelve a abrirla' using hint = 'orden_insumo_sin_version';
  end if;
  if v_motivo is null then
    raise exception 'Escribe por qué se anula la orden' using hint = 'orden_insumo_motivo';
  end if;
  if length(v_motivo) > 300 then
    raise exception 'El motivo es muy largo: hasta 300 letras' using hint = 'orden_insumo_motivo';
  end if;

  -- La fila se bloquea: un anular y un editar a la vez se ponen en fila, y el segundo ve lo que dejó el primero.
  select o.* into v_orden from retail.ordenes_insumo o where o.id = p_id for update;
  if not found then
    raise exception 'Esa orden de insumos no existe' using hint = 'orden_insumo_no_existe';
  end if;

  if v_orden.estado = 'anulada' then
    -- El mismo pedido otra vez (doble clic, reintento): ya está hecho, se devuelve como quedó.
    if v_orden.motivo_anulacion = v_motivo and v_orden.anulada_por = v_actor then
      return query select v_orden.id, v_orden.numero, v_orden.version;
      return;
    end if;
    raise exception 'Esta orden ya estaba anulada' using hint = 'orden_insumo_ya_anulada';
  end if;
  if v_orden.version <> p_version_esperada then
    raise exception 'Otra persona cambió esta orden mientras la mirabas. Recarga para ver sus cambios antes de anularla.'
      using errcode = 'PT409', hint = 'version_cambiada';
  end if;

  update retail.ordenes_insumo o
     set estado = 'anulada',
         anulada_por = v_actor,
         anulada_en = now(),
         motivo_anulacion = v_motivo
   where o.id = p_id
  returning o.version into v_version;

  -- Actividad (ADR-0207): sin montos. Si falla, la anulación igual queda guardada.
  begin
    perform retail.fn_actividad_anotar(
      'ordenes_insumos', 'orden_insumo_anulada',
      'anuló la ' || retail.fn_orden_insumo_numero_texto(v_orden.numero) || ' para '
        || (select pr.nombre from retail.proveedores_produccion pr where pr.id = v_orden.proveedor_id) || ': «' || v_motivo || '»',
      v_actor, retail.fn_actividad_terminal_ahora(), retail.fn_orden_insumo_sede_actividad(v_actor), v_orden.ubicacion_destino_id,
      'ordenes_insumo', p_id::text, now(),
      jsonb_build_object('orden_id', p_id, 'numero', v_orden.numero, 'version', v_version, 'motivo', v_motivo),
      'vivo');
  exception when others then
    raise warning 'actividad: no se anotó la anulación de la orden de insumos % (%)', v_orden.numero, sqlerrm;
  end;

  return query select v_orden.id, v_orden.numero, v_version;
end;
$$;
comment on function retail.anular_orden_insumo(uuid, integer, text) is
  'ADR-0362 fase 7: anula una orden de insumos generada con su motivo (PT409 / version_cambiada si otra persona la cambió antes; el '
  'mismo pedido repetido devuelve la orden sin error). El número no se libera. Anota en Actividad, sin montos. Exige el módulo '
  'ordenes_insumos. Firma el actor de tienda (orden_insumo_anular).';

-- ---------- 7. La lista (lectura) ----------
-- `p_busqueda`: el número («12», «OI-000012», «oi 12»), el nombre del proveedor o el insumo (nombre o código), sin importar tildes ni
-- mayúsculas. De a `p_limite` (máximo 100), de la más nueva a la más vieja; `p_antes_de` pide las de número menor (la página siguiente).
create or replace function retail.fn_ordenes_insumo(
  p_estado text default null,
  p_proveedor_id uuid default null,
  p_busqueda text default null,
  p_limite integer default 50,
  p_antes_de integer default null
)
returns table (
  id uuid,
  numero integer,
  estado text,
  proveedor_id uuid,
  proveedor_nombre text,
  ubicacion_destino_id uuid,
  destino_nombre text,
  fecha_emision date,
  fecha_entrega_estimada date,
  lineas integer,
  cantidades jsonb,
  total numeric,
  creada_por_nombre text,
  creada_en timestamptz
)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_q text := nullif(btrim(coalesce(p_busqueda, '')), '');
  v_numero integer;
  v_patron text;
begin
  if retail.fn_ve_modulo('ordenes_insumos') is not true then
    raise exception 'Ver las órdenes de insumos necesita el módulo «Órdenes de insumos» en tu rol'
      using errcode = '42501', hint = 'ordenes_insumos_sin_modulo';
  end if;
  -- «OI-000012», «oi12» o «12» buscan también por número.
  if v_q is not null and regexp_replace(v_q, '^(oi)?[\s-]*', '', 'i') ~ '^\d{1,9}$' then
    v_numero := regexp_replace(v_q, '^(oi)?[\s-]*', '', 'i')::integer;
  end if;
  v_patron := '%' || lower(translate(v_q, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun')) || '%';

  return query
  select o.id, o.numero, o.estado, o.proveedor_id, pr.nombre, o.ubicacion_destino_id, u.nombre,
         o.fecha_emision, o.fecha_entrega_estimada,
         coalesce(t.lineas, 0)::integer, coalesce(t.cantidades, '{}'::jsonb), coalesce(t.total, 0)::numeric,
         nullif(btrim(concat_ws(' ', pe.nombres, pe.apellidos)), ''), o.creada_en
    from retail.ordenes_insumo o
    join retail.proveedores_produccion pr on pr.id = o.proveedor_id
    join retail.ubicaciones u on u.id = o.ubicacion_destino_id
    left join public.personas pe on pe.id = o.creada_por
    left join lateral (
      -- Por unidad: los metros con los metros y los conos con los conos.
      select sum(x.lineas) as lineas, sum(x.total) as total, jsonb_object_agg(x.unidad_medida, x.cantidad) as cantidades
        from (select i.unidad_medida, count(*) as lineas, sum(i.cantidad) as cantidad, sum(i.subtotal) as total
                from retail.orden_insumo_items i
               where i.orden_insumo_id = o.id
               group by i.unidad_medida) x
    ) t on true
   where (p_estado is null or o.estado = p_estado)
     and (p_proveedor_id is null or o.proveedor_id = p_proveedor_id)
     and (v_q is null
          or o.numero = v_numero
          or lower(translate(pr.nombre, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun')) like v_patron
          or exists (
               select 1
                 from retail.orden_insumo_items i
                 join retail.insumos n on n.id = i.insumo_id
                where i.orden_insumo_id = o.id
                  and (lower(translate(n.nombre, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun')) like v_patron
                       or lower(n.codigo) like v_patron)))
     and (p_antes_de is null or o.numero < p_antes_de)
   order by o.numero desc
   limit least(greatest(coalesce(p_limite, 50), 1), 100);
end;
$$;
comment on function retail.fn_ordenes_insumo(text, uuid, text, integer, integer) is
  'ADR-0362 fase 7: la lista de órdenes de insumos, con líneas, cantidades por unidad y total, filtrable por estado, proveedor y texto '
  '(número, proveedor o insumo), de a 50. Exige el módulo ordenes_insumos; quien lo tiene ve los precios (decisión 47).';

-- ---------- 8. Una orden (lectura) ----------
create or replace function retail.fn_orden_insumo(p_orden_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_foto jsonb;
begin
  if retail.fn_ve_modulo('ordenes_insumos') is not true then
    raise exception 'Ver una orden de insumos necesita el módulo «Órdenes de insumos» en tu rol'
      using errcode = '42501', hint = 'ordenes_insumos_sin_modulo';
  end if;
  v_foto := retail.fn_orden_insumo_foto(p_orden_id);
  if v_foto is null then
    return null; -- la pantalla dice «no encontrada»
  end if;
  -- Las versiones archivadas, de la más vieja a la más nueva, con lo que la orden decía en cada una (con precios).
  return v_foto || jsonb_build_object('versiones', coalesce((
    select jsonb_agg(jsonb_build_object(
             'version', v.version,
             'reemplazada_por', nullif(btrim(concat_ws(' ', p.nombres, p.apellidos)), ''),
             'reemplazada_en', v.reemplazada_en,
             'datos', v.datos
           ) order by v.version)
      from retail.orden_insumo_versiones v
      left join public.personas p on p.id = v.reemplazada_por
     where v.orden_insumo_id = p_orden_id
  ), '[]'::jsonb));
end;
$$;
comment on function retail.fn_orden_insumo(uuid) is
  'ADR-0362 fase 7: una orden de insumos con sus líneas (nombre, código, tipo y unidad del insumo), quién la creó, la cambió o la '
  'anuló, el total y las versiones archivadas. NULL si no existe. Exige el módulo ordenes_insumos.';

-- ---------- 9. Permisos ----------
-- Las seis de la web: `authenticated` (con el módulo, que cada una exige) y `service_role`; nunca `anon`.
revoke all on function retail.fn_ordenes_insumo_siguiente() from public, anon;
revoke all on function retail.crear_orden_insumo(uuid, uuid, uuid, date, text, jsonb) from public, anon;
revoke all on function retail.editar_orden_insumo(uuid, integer, uuid, uuid, date, text, jsonb) from public, anon;
revoke all on function retail.anular_orden_insumo(uuid, integer, text) from public, anon;
revoke all on function retail.fn_ordenes_insumo(text, uuid, text, integer, integer) from public, anon;
revoke all on function retail.fn_orden_insumo(uuid) from public, anon;
grant execute on function retail.fn_ordenes_insumo_siguiente() to authenticated, service_role;
grant execute on function retail.crear_orden_insumo(uuid, uuid, uuid, date, text, jsonb) to authenticated, service_role;
grant execute on function retail.editar_orden_insumo(uuid, integer, uuid, uuid, date, text, jsonb) to authenticated, service_role;
grant execute on function retail.anular_orden_insumo(uuid, integer, text) to authenticated, service_role;
grant execute on function retail.fn_ordenes_insumo(text, uuid, text, integer, integer) to authenticated, service_role;
grant execute on function retail.fn_orden_insumo(uuid) to authenticated, service_role;

-- Las piezas internas no se llaman desde la web.
revoke all on function retail.fn_orden_insumo_numero_texto(integer) from public, anon, authenticated;
revoke all on function retail.fn_orden_insumo_descuento(numeric, numeric, numeric, numeric) from public, anon, authenticated;
revoke all on function retail.fn_orden_insumo_foto(uuid) from public, anon, authenticated;
revoke all on function retail.fn_orden_insumo_validar(uuid, uuid, date, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function retail.fn_orden_insumo_huella(uuid, uuid, date, text, jsonb) from public, anon, authenticated;
revoke all on function retail.fn_orden_insumo_huella_guardada(uuid) from public, anon, authenticated;
revoke all on function retail.fn_orden_insumo_escribir_lineas(uuid, jsonb) from public, anon, authenticated;
revoke all on function retail.fn_orden_insumo_sede_actividad(uuid) from public, anon, authenticated;
revoke all on function retail.fn_orden_insumo_exigir_mismo_pedido(uuid, integer, uuid, uuid, date, text, jsonb) from public, anon, authenticated;

reset lock_timeout;
