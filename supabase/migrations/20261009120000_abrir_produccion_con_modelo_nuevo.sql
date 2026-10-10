-- ============================================================================
-- 20261009120000_abrir_produccion_con_modelo_nuevo.sql — ADR-0361 (segunda parte)
--
-- EL PROBLEMA PRIMERO. `abrir_produccion` solo acepta variantes que YA existen (ADR-0051, punto 5: las variantes nacen en Productos, nunca desde
-- una orden). Pero el Taller crea modelos nuevos como parte normal de su trabajo: una Muestra (patronaje → muestra → escalado) es el desarrollo de un
-- modelo que todavía no existe, y el escalado es lo que define sus tallas. Crear el modelo exige `fn_puede_editar_catalogo()`, que el Taller no tiene,
-- así que cada modelo nuevo dependía de un líder y de salir de la orden a otra pantalla (Felipe, 2026-10-07: «el Taller no necesariamente crea productos
-- ya existentes»).
--
-- Lo que prohibió el ADR-0051 eran tres problemas reales de V1: prendas SIN PRECIO, colores DUPLICADOS («Negro»/«negro») y SKUs a ciegas. Todos venían del
-- TEXTO LIBRE de tallas y colores, no de crear el modelo desde la orden. Esta función quita el texto libre y deja el momento:
--   · tallas y colores salen del vocabulario (`tallas`, `colores`), y cada talla tiene que estar habilitada para la categoría (`categoria_tallas`);
--   · el precio a tienda es obligatorio en una producción (una muestra puede ir sin precio y se completa al aprobarla);
--   · el código lo asigna la base (`variantes_asignar_codigo`), nunca el navegador.
--
-- LA DECISIÓN. Mismo patrón proponer/aprobar que la alta al vuelo del censo (`20260918020000_censo_alta_al_vuelo.sql`, Felipe 2026-09-18): una función
-- `security definer` SIN el candado del líder, abierta a quien opera el Taller. El producto nace como lo decide `productos_estado_alta_biut`: `pendiente`
-- si quien lo crea no es líder (se puede usar de inmediato; hoy ninguna pantalla lo revisa, ADR-0361) y `aprobado` si lo es. Sin tejido ni patrón (el censo tampoco los pide):
-- quedan en «Para completar» de Editar producto. `trg_producto_anota_origen` anota solo que nació en el Taller.
--
-- UNA TRANSACCIÓN, UN TOKEN. Crear el modelo y abrir la orden es UNA llamada: o pasa todo o no queda nada (ni un modelo sin orden). El mismo `p_token` va a
-- `productos.token_cliente` y a `producciones.token_cliente` (dos tablas distintas, un índice único cada una): reintentar tras perder la red devuelve la
-- orden que ya se abrió, sin duplicar el modelo. Antes de este cambio la alternativa era crear el modelo y abrir la orden en dos pasos, con el riesgo de
-- dejar un modelo huérfano a medias.
--
-- NO COPIA `abrir_produccion`: la llama al final, y ella vuelve a validar el permiso, que sea el Taller, las líneas y el token. Las dos primeras
-- comprobaciones se repiten acá a propósito, ANTES de tocar el catálogo, para que quien no puede abrir órdenes no averigüe nombres ni vocabulario.
--
-- VALIDACIÓN POR CONJUNTOS (no fila por fila). Las tallas pedidas EXCEPT las habilitadas para la categoría; los colores pedidos EXCEPT los activos; y
-- «una celda dos veces» se detecta contando filas contra filas distintas, antes de que el índice `variantes_identidad_unica` lo rechace con un error feo.
--
-- QUÉ NO HACE. No toca ninguna función existente (aditiva). No crea tablas ni columnas. No devuelve costos. `variantes.costo` nace en 0: el costo real se
-- pega al cerrar la orden (D-31), como hoy. No pide marca, proveedor, tejido, patrón ni fotos.
--
-- PARA PEGAR EN PRODUCCIÓN: una sola parte (solo una función y sus permisos: ni `alter table` ni políticas, ver «Políticas y deadlocks» de CLAUDE.md). Es
-- idempotente. Antes, ensayo con `begin; …; rollback;`. ORDEN: la base va PRIMERO y la web después; si se publica la web antes, el botón «Modelo nuevo» falla con
-- «la función no existe» (la pantalla lo dice en una frase, no se cae).
--
-- SE ROMPE SI: `abrir_produccion` cambia de firma (el chequeo del principio aborta antes de crear nada); alguien agrega una talla o un color sin
-- vocabulario (la validación lo frena); `productos_estado_alta_biut` deja de marcar `pendiente` a quien no es líder (el modelo del Taller nacería aprobado
-- sin que nadie lo revise); o el Taller deja de ser `ubicaciones.tipo = 'taller'`.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- Ancla: la función que se envuelve tiene que existir con esta firma exacta. En producción las versiones vivas no siempre son las de un archivo.
do $$
begin
  if to_regprocedure('retail.abrir_produccion(uuid,uuid,jsonb,numeric,numeric,numeric,boolean,date,text,uuid)') is null then
    raise exception 'retail.abrir_produccion(uuid, uuid, jsonb, numeric, numeric, numeric, boolean, date, text, uuid) no existe con esa firma: esta migración la envuelve y no la reescribe. Revisa la versión viva antes de seguir.';
  end if;
end
$$;

create or replace function retail.abrir_produccion_con_modelo_nuevo(
  p_ubicacion_id uuid,
  p_referencia text,
  p_categoria_id uuid,
  p_variantes jsonb,
  p_precio numeric default 0,
  p_costo_tela numeric default 0,
  p_costo_avios numeric default 0,
  p_costo_maquila numeric default 0,
  p_es_muestra boolean default false,
  p_fecha_entrega date default null,
  p_nota text default null,
  p_confirmo_distinto boolean default false,
  p_token uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_tipo text;
  v_orden_id uuid;
  v_ref text;
  v_producto_id uuid;
  v_lineas jsonb;
  v_par_id uuid;
  v_par_ref text;
  v_par_nivel text;
  v_precio numeric;
  v_costo numeric;
  v_i integer;
  v_costos numeric[] := array[0, 0, 0];
  v_cual text;
begin
  -- 1. Quién y dónde: la misma puerta que abrir_produccion, antes de tocar el catálogo.
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para abrir órdenes en esa ubicación';
  end if;
  select tipo into v_tipo from ubicaciones where id = p_ubicacion_id and activo;
  if v_tipo is distinct from 'taller' then
    raise exception 'Solo el Taller abre órdenes de producción';
  end if;

  -- 2. Reintento con el mismo token: devuelve la orden que ya se abrió. Va ANTES del chequeo de nombre: si no, el reintento se toparía con su propio
  --    modelo y fallaría como «duplicado».
  if p_token is not null then
    select id into v_orden_id from producciones where token_cliente = p_token;
    if found then return v_orden_id; end if;
  end if;

  -- 3. Lo que se pide.
  if coalesce(trim(p_referencia), '') = '' then
    raise exception 'Falta el nombre del modelo';
  end if;
  v_ref := fn_titulo_referencia(p_referencia);
  if fn_clave_referencia(v_ref) is null then
    raise exception 'El nombre del modelo necesita al menos una letra o un número.';
  end if;
  -- Tope de largo (/chaos 2026-10-10, hallazgo #1): `referencia` es `text` sin límite y un nombre de 5.000 letras dejaba la tarjeta de la orden en 9.383 px. Los reales miden ≤ 31.
  if char_length(v_ref) > 80 then
    raise exception 'El nombre del modelo es demasiado largo: máximo 80 letras.' using hint = 'nombre_largo';
  end if;
  if char_length(btrim(coalesce(p_nota, ''))) > 200 then
    raise exception 'La nota es demasiado larga: máximo 200 caracteres.' using hint = 'nota_larga';
  end if;
  if not exists (select 1 from categorias where id = p_categoria_id and activo) then
    raise exception 'Elige una categoría activa del catálogo';
  end if;
  if p_variantes is null or jsonb_typeof(p_variantes) <> 'array' or jsonb_array_length(p_variantes) = 0 then
    raise exception 'La orden necesita al menos una talla o color con su cantidad';
  end if;
  -- Dinero (/chaos 2026-10-10, hallazgos #2 y #3). Los CHECK `>= 0` de `variantes` y `producciones` DEJAN PASAR `NaN` (`NaN >= 0` es verdadero en Postgres), y `0.001`
  -- pasaba «precio > 0» para guardarse como 0,00. Se valida AQUÍ, en la puerta nueva; los CHECK de las tablas son del núcleo y no se tocan en esta migración.
  if p_precio is null or p_precio = 'NaN'::numeric then
    raise exception 'El precio a tienda no es un número válido' using hint = 'precio_invalido';
  end if;
  v_precio := round(p_precio, 2);
  if v_precio < 0 then
    raise exception 'El precio a tienda no puede ser negativo' using hint = 'precio_invalido';
  end if;
  if v_precio > 99999.99 then
    raise exception 'El precio a tienda no puede pasar de S/ 99,999.99' using hint = 'precio_invalido';
  end if;
  if not coalesce(p_es_muestra, false) and v_precio < 0.01 then
    raise exception 'Una producción necesita el precio a tienda: sin precio no hay margen que calcular ni se puede vender. Una muestra sí puede ir sin precio.'
      using hint = 'precio_obligatorio';
  end if;
  for v_i in 1..3 loop
    v_costo := coalesce(case v_i when 1 then p_costo_tela when 2 then p_costo_avios else p_costo_maquila end, 0);
    v_cual := case v_i when 1 then 'la tela' when 2 then 'los avíos' else 'la maquila' end;
    if v_costo = 'NaN'::numeric then
      raise exception 'El costo de % no es un número válido', v_cual using hint = 'costo_invalido';
    end if;
    v_costo := round(v_costo, 2);
    if v_costo < 0 then
      raise exception 'El costo de % no puede ser negativo', v_cual using hint = 'costo_invalido';
    end if;
    if v_costo > 999999.99 then
      raise exception 'El costo de % no puede pasar de S/ 999,999.99', v_cual using hint = 'costo_invalido';
    end if;
    v_costos[v_i] := v_costo;
  end loop;

  -- 4. Las celdas de la matriz, validadas como conjuntos.
  if exists (
    select 1 from jsonb_array_elements(p_variantes) e
    where case when (e ->> 'cantidad') is null or (e ->> 'cantidad') !~ '^[0-9]{1,6}$' then true else (e ->> 'cantidad')::integer <= 0 end
  ) then
    raise exception 'Cada talla y color necesita una cantidad entera mayor que cero';
  end if;
  if (select count(*) from jsonb_array_elements(p_variantes)) <> (
    select count(*) from (
      select distinct nullif(e ->> 'talla_id', ''), nullif(trim(e ->> 'color_codigo'), '') from jsonb_array_elements(p_variantes) e
    ) d
  ) then
    raise exception 'Repetiste la misma combinación de talla y color — cada celda de la matriz va una sola vez' using hint = 'celda_repetida';
  end if;
  -- Una talla que no tiene forma de uuid se dice con la frase del vocabulario, no con «invalid input syntax for type uuid» (/chaos #5).
  if exists (
    select 1 from jsonb_array_elements(p_variantes) e
    where nullif(e ->> 'talla_id', '') is not null
      and (e ->> 'talla_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) then
    raise exception 'Una de las tallas elegidas no está habilitada para esta categoría, o ya no está activa en el vocabulario' using hint = 'talla_no_habilitada';
  end if;
  if exists (
    select nullif(e ->> 'talla_id', '')::uuid from jsonb_array_elements(p_variantes) e where nullif(e ->> 'talla_id', '') is not null
    except
    select t.id from tallas t join categoria_tallas ct on ct.talla_id = t.id and ct.categoria_id = p_categoria_id where t.activo
  ) then
    raise exception 'Una de las tallas elegidas no está habilitada para esta categoría, o ya no está activa en el vocabulario' using hint = 'talla_no_habilitada';
  end if;
  -- /chaos #4: la comparación por conjuntos ignora los `null`, y una línea sin talla en una categoría que SÍ tiene tallas creaba una variante «…-U» sin talla.
  if exists (select 1 from categoria_tallas ct join tallas t on t.id = ct.talla_id and t.activo where ct.categoria_id = p_categoria_id)
     and exists (select 1 from jsonb_array_elements(p_variantes) e where nullif(e ->> 'talla_id', '') is null) then
    raise exception 'Esta categoría tiene tallas: cada línea necesita su talla' using hint = 'talla_obligatoria';
  end if;
  if exists (
    select nullif(trim(e ->> 'color_codigo'), '') from jsonb_array_elements(p_variantes) e where nullif(trim(e ->> 'color_codigo'), '') is not null
    except
    select c.codigo from colores c where c.activo
  ) then
    raise exception 'Uno de los colores elegidos ya no está activo en el vocabulario' using hint = 'color_inactivo';
  end if;

  -- 5. Un nombre, un producto (ADR-0294, mismas reglas que crear_producto_con_variantes; un modelo del Taller nace sin marca, así que solo choca con los sin marca):
  --    idéntico bloquea siempre; una letra de diferencia bloquea salvo confirmación. `detail` trae el id del existente para que la pantalla lo elija.
  select b.id, b.referencia, b.nivel into v_par_id, v_par_ref, v_par_nivel
    from buscar_productos_parecidos(v_ref) b join productos pm on pm.id = b.id and pm.marca_id is null
    where b.nivel in ('identico', 'una_letra')
    order by (b.nivel = 'identico') desc
    limit 1;
  if v_par_nivel = 'identico' then
    raise exception 'Ya existe un modelo llamado "%". Elígelo en la lista en vez de crearlo otra vez.', v_par_ref
      using hint = 'nombre_duplicado', detail = v_par_id::text;
  end if;
  if v_par_nivel = 'una_letra' and not coalesce(p_confirmo_distinto, false) then
    raise exception 'Ya existe "%", que se escribe casi igual. Si es el mismo modelo, elígelo; si es otro de verdad, confírmalo.', v_par_ref
      using hint = 'nombre_casi_igual', detail = v_par_id::text;
  end if;

  -- 6. El modelo y sus variantes. El código de cada variante lo asigna `variantes_asignar_codigo`; el estado de alta, `productos_estado_alta_biut`.
  begin
    insert into productos (categoria_id, referencia, token_cliente)
      values (p_categoria_id, v_ref, p_token)
      returning id into v_producto_id;
  exception when unique_violation then
    -- Otra sede creó el mismo nombre un instante antes (ADR-0294, carrera entre sedes): no es un error de quien guarda; se le dice cuál ganó.
    v_par_id := null;
    for v_par_id, v_par_ref in
      select pr.id, pr.referencia from productos pr
      where fn_clave_referencia(pr.referencia) = fn_clave_referencia(v_ref) and pr.marca_id is null and pr.estado_alta <> 'rechazado'
    loop
      exit;
    end loop;
    if v_par_id is null then
      raise;
    end if;
    raise exception 'Ya existe un modelo llamado "%". Elígelo en la lista en vez de crearlo otra vez.', v_par_ref
      using hint = 'nombre_duplicado', detail = v_par_id::text;
  end;

  insert into variantes (producto_id, talla_id, color_codigo, precio, costo)
  select v_producto_id, nullif(e ->> 'talla_id', '')::uuid, nullif(trim(e ->> 'color_codigo'), ''), v_precio, 0
  from jsonb_array_elements(p_variantes) e;

  -- 7. Las líneas de la orden: cada celda pedida con el id de la variante recién creada.
  select jsonb_agg(jsonb_build_object('variante_id', v.id, 'cantidad', (q.e ->> 'cantidad')::integer))
    into v_lineas
    from jsonb_array_elements(p_variantes) q(e)
    join variantes v on v.producto_id = v_producto_id
     and v.talla_id is not distinct from nullif(q.e ->> 'talla_id', '')::uuid
     and v.color_codigo is not distinct from nullif(trim(q.e ->> 'color_codigo'), '');

  -- 8. La orden: abrir_produccion vuelve a validar permiso, Taller, líneas y token. Si algo falla aquí, el modelo tampoco queda.
  return retail.abrir_produccion(p_ubicacion_id, v_producto_id, v_lineas, v_costos[1], v_costos[2], v_costos[3],
                                 coalesce(p_es_muestra, false), p_fecha_entrega, p_nota, p_token);
end;
$$;

revoke execute on function retail.abrir_produccion_con_modelo_nuevo(uuid, text, uuid, jsonb, numeric, numeric, numeric, numeric, boolean, date, text, boolean, uuid) from public, anon;
grant execute on function retail.abrir_produccion_con_modelo_nuevo(uuid, text, uuid, jsonb, numeric, numeric, numeric, numeric, boolean, date, text, boolean, uuid) to authenticated;

comment on function retail.abrir_produccion_con_modelo_nuevo(uuid, text, uuid, jsonb, numeric, numeric, numeric, numeric, boolean, date, text, boolean, uuid) is
  'Crea un modelo nuevo (con tallas y colores del vocabulario) y abre su orden de producción en UNA transacción y con UN token (ADR-0361). Abierta a quien opera el Taller; el modelo nace marcado pendiente si quien lo crea no es líder (hoy ninguna pantalla lo revisa). Valida nombre (≤ 80), nota (≤ 200), precio y costos (sin NaN ni valores absurdos, a céntimos) y talla. Envuelve abrir_produccion sin reescribirla.';
