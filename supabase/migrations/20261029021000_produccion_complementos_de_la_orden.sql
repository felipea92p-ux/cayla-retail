-- ============================================================================
-- 20261029021000_produccion_complementos_de_la_orden.sql — CAYLA V2 (ADR-0563, actividad 1 · 2026-10-29)
--
-- EL PROBLEMA PRIMERO. Una prenda no lleva una sola tela: lleva la tela principal y, además, forro, entretela, una tela de contraste, botones, hilo. La orden de producción ya sabe
-- guardar varios materiales (el candado único de `produccion_insumos` es orden + material + color), pero el sistema distingue «la tela» de «lo demás» SOLO por el tipo del material
-- (`tela` o `avio`). Un forro es una tela comprada por metro, así que hoy no tiene dónde entrar: la hoja arma UNA fila de tela por color y «+ Agregar avío» solo ofrece avíos.
-- Y no basta con dejarla entrar como «otra tela más»: al pasar un lote al stock, `cerrar_produccion` suma TODOS los metros de tela gastados ÷ las prendas buenas y lo guarda como «lo
-- medido» del modelo (`producto_consumo_medido`); tras 3 órdenes cerradas ese número manda sobre lo declarado (`fn_consumo_efectivo`). Con un forro como tela, el modelo aprendería
-- «tela + forro» (1.2 + 0.9 = 2.1 m) como si fuera la tela principal y la orden siguiente propondría 2.1 m por prenda para cada color, un 75 % de más, sin que nadie lo vea.
--
-- QUÉ HACE (una columna, una función chica y cuatro inserciones en funciones vivas)
--   · `produccion_insumos.es_complemento` (boolean, nace en falso): la fila es un complemento de la prenda —forro, otra tela, un avío— y no la tela principal de su color. Una orden
--     que no manda nada queda EXACTAMENTE como estaba: todas sus filas nacen en falso.
--   · `fn_produccion_insumos_marcar_complementos(p_insumos, p_normalizados)`: lee `complemento` (true/false) de la lista que llegó, lo valida y se lo agrega a la lista normalizada. La
--     función que valida y calcula el plan (`fn_produccion_insumos_normalizar`) NO se toca: ya está parchada cuatro veces y no sabe nada de roles.
--   · `abrir_orden_produccion` y `guardar_insumos_orden` llaman a esa función, guardan el rol, y un complemento NO deja declarado el consumo del modelo (`producto_consumos`): la tela
--     del modelo es la principal. Corregir el rol de una fila que ya estaba cuenta como «corregida» y no mueve su plan, que se congeló al abrir.
--   · `cerrar_produccion`: lo medido ignora los metros de los complementos. Su costo SÍ entra a la orden (el costo suma todo lo consumido, sin mirar el rol).
--   · `fn_orden_produccion` devuelve `es_complemento` en cada fila de tela y avío, para que la hoja de editar reconstruya la lista.
--
-- CONTRATO (Liskov)
--   PROMETE: sin `complemento` en la lista todo queda como estaba (mismo plan, mismos rechazos, misma tela del modelo, mismo medido). Un complemento nunca declara ni corrige el
--            consumo del modelo ni suma a lo medido; su costo y su consumo anotado cuentan igual que los de cualquier material. Repetir la misma lista no cambia nada ni anota otra actividad.
--   ASUME:   las cuatro funciones vivas con el texto de hoy (anclas verificadas en una base con las migraciones de `main` hasta 20261028221000). Si alguna cambió, el reemplazo se
--            detiene sin tocar nada y dice cuál. No exige que el complemento sea una tela: en un avío el rol no se lee.
--   NO HACE: no cambia órdenes abiertas ni cerradas (todas quedan con el rol en falso: su tela es la principal), no toca el libro de insumos, stock ni costos, y no hace que la Ficha del
--            modelo recuerde los complementos (eso es otra decisión: toca `producto_avios` y `fn_ficha_consumo`).
--
-- DECIDÍ: una marca por FILA de la orden, no por material. «Es el forro» es un hecho de esta prenda, no del insumo: la misma tela es la principal de un modelo y el forro de otro.
-- DESCARTÉ: (a) una columna en `insumos` (un material tendría el mismo rol en todos los modelos); (b) derivar «el complemento» por forma —la segunda tela de un color, o la de tejido
--   distinto al del modelo—: la pantalla y la base seguirían dos reglas que se pueden desencontrar, y un forro del mismo tejido que la tela contaminaría lo medido en silencio;
--   (c) parchar `fn_produccion_insumos_normalizar` (cuatro parches vivos: otro más sube el riesgo de ancla sin ninguna ganancia, el rol no entra en su cuenta);
--   (d) reescribir las líneas de las funciones vivas: cada cambio de aquí es una INSERCIÓN que deja intacto el texto que otras migraciones anclan, para que cualquiera pueda volver a
--   cargarse sobre esta sin perder su ancla.
-- SE ROMPE SI: la misma tela es la principal de un color y el forro de otro en la misma orden. El consumo se anota por material, no por color, así que no se puede separar lo uno de
--   lo otro: esa orden NO aporta a lo medido (se lo salta en silencio, no bloquea el cierre). O si alguien manda `complemento` escrito de otra forma («si», 1): se rechaza con
--   `insumo_invalido` en vez de adivinar.
--
-- PRODUCCIÓN. NO está aplicada. Una sola parte, re-ejecutable, `lock_timeout = 3s`: un `alter table … add column` con valor de fábrica (sin reescribir filas), una función nueva y
-- reemplazos ANCLADOS (ADR-0288: el texto viejo aparece exactamente una vez; si no, se detiene sin cambiar nada). Sin políticas, así que no choca con el Asesor de seguridad (ADR-0195).
-- Dentro de los textos de reemplazo no hay ningún `select … into` (la asignación va con `:= (select …)`). Va DESPUÉS de 20261028221000. Prueba: `pnpm pruebas:produccion-complementos`.
-- ============================================================================
set lock_timeout = '3s';

alter table retail.produccion_insumos add column if not exists es_complemento boolean not null default false;
comment on column retail.produccion_insumos.es_complemento is
  'ADR-0563: la fila es un complemento de la prenda (forro, otra tela, un avío) y no la tela principal de su color. Un complemento no declara el consumo del modelo ni suma a lo medido; su costo sí entra a la orden. Falso = la de siempre.';

-- Reemplaza `p_viejo` por `p_nuevo` en la función viva; `p_viejo` tiene que aparecer exactamente una vez. Si `p_nuevo` ya está, no hace nada.
create or replace function pg_temp.reemplazar_anclado(p_firma text, p_viejo text, p_nuevo text)
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
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición real.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- 0. Quién es complemento: lee `complemento` de la lista que llegó y se lo pone a cada fila normalizada (se unen por material + color, la llave única de la orden).
create or replace function retail.fn_produccion_insumos_marcar_complementos(p_insumos jsonb, p_normalizados jsonb)
returns jsonb
language plpgsql
stable
set search_path = retail, public, extensions
as $$
declare
  v_x jsonb; v_n jsonb; v_flag boolean; v_salida jsonb := '[]'::jsonb;
begin
  if p_insumos is null or jsonb_typeof(p_insumos) <> 'array' or p_normalizados is null or jsonb_typeof(p_normalizados) <> 'array' then
    return coalesce(p_normalizados, '[]'::jsonb);
  end if;
  -- Un valor que no es true/false no se adivina: se rechaza (como `fn_produccion_insumos_normalizar` con un consumo ilegible).
  for v_x in select * from jsonb_array_elements(p_insumos) loop
    begin
      v_flag := coalesce((v_x ->> 'complemento')::boolean, false);
    exception when others then
      raise exception 'Una de las telas o avíos de la orden no dice bien si es un complemento' using hint = 'insumo_invalido';
    end;
  end loop;
  for v_n in select * from jsonb_array_elements(p_normalizados) loop
    v_flag := coalesce((
      select bool_or(coalesce((x ->> 'complemento')::boolean, false))
        from jsonb_array_elements(p_insumos) x
       where nullif(x ->> 'insumo_id', '')::uuid = (v_n ->> 'insumo_id')::uuid
         and nullif(btrim(coalesce(x ->> 'color_codigo', '')), '') is not distinct from (v_n ->> 'color_codigo')), false);
    v_salida := v_salida || jsonb_set(v_n, '{complemento}', to_jsonb(v_flag));
  end loop;
  return v_salida;
end;
$$;
comment on function retail.fn_produccion_insumos_marcar_complementos(jsonb, jsonb) is
  'ADR-0563: agrega `complemento` (true/false) a cada fila de la lista normalizada, leyéndolo de la lista que llegó. Un valor que no es true/false se rechaza (insumo_invalido).';
revoke all on function retail.fn_produccion_insumos_marcar_complementos(jsonb, jsonb) from public, anon, authenticated;

-- 1. Abrir la orden: marca el rol y un complemento no declara el consumo del modelo.
select pg_temp.reemplazar_anclado(
  'retail.abrir_orden_produccion(jsonb, jsonb, jsonb)',
  $v$v_insumos := retail.fn_produccion_insumos_normalizar(p_insumos, v_lineas, v_producto);$v$,
  $v$v_insumos := retail.fn_produccion_insumos_normalizar(p_insumos, v_lineas, v_producto);
  v_insumos := retail.fn_produccion_insumos_marcar_complementos(p_insumos, v_insumos);$v$
);
select pg_temp.reemplazar_anclado(
  'retail.abrir_orden_produccion(jsonb, jsonb, jsonb)',
  $v$nullif(v_i -> 'consumo_por_talla', 'null'::jsonb), (v_i ->> 'cantidad_plan')::numeric, v_i ->> 'nota');$v$,
  $v$nullif(v_i -> 'consumo_por_talla', 'null'::jsonb), (v_i ->> 'cantidad_plan')::numeric, v_i ->> 'nota');
    -- ADR-0563: un complemento (forro, otra tela) no es la tela del modelo: se marca y no declara el consumo del modelo.
    if coalesce((v_i ->> 'complemento')::boolean, false) then
      update retail.produccion_insumos set es_complemento = true
       where produccion_id = v_id and insumo_id = (v_i ->> 'insumo_id')::uuid and color_codigo is not distinct from (v_i ->> 'color_codigo');
      continue;
    end if;$v$
);

-- 2. Editar la tela de una orden abierta: lo mismo, y corregir el rol de una fila que ya estaba cuenta como «corregida» sin mover su plan.
select pg_temp.reemplazar_anclado(
  'retail.guardar_insumos_orden(uuid, jsonb)',
  $v$v_agregadas integer := 0; v_corregidas integer := 0; v_quitadas integer := 0;$v$,
  $v$v_agregadas integer := 0; v_corregidas integer := 0; v_quitadas integer := 0;
  v_rol integer; v_c0 integer;$v$
);
select pg_temp.reemplazar_anclado(
  'retail.guardar_insumos_orden(uuid, jsonb)',
  $v$v_nuevas := retail.fn_produccion_insumos_normalizar(p_insumos, v_lineas, v_o.producto_id);$v$,
  $v$v_nuevas := retail.fn_produccion_insumos_normalizar(p_insumos, v_lineas, v_o.producto_id);
  v_nuevas := retail.fn_produccion_insumos_marcar_complementos(p_insumos, v_nuevas);$v$
);
select pg_temp.reemplazar_anclado(
  'retail.guardar_insumos_orden(uuid, jsonb)',
  $v$for v_n in select * from jsonb_array_elements(v_nuevas) loop$v$,
  $v$for v_n in select * from jsonb_array_elements(v_nuevas) loop
    -- ADR-0563: el rol de una fila que ya estaba (tela del color ↔ complemento) se corrige sin tocar su plan.
    v_rol := 0;
    update retail.produccion_insumos set es_complemento = coalesce((v_n ->> 'complemento')::boolean, false)
     where produccion_id = p_produccion_id and insumo_id = (v_n ->> 'insumo_id')::uuid and color_codigo is not distinct from (v_n ->> 'color_codigo')
       and es_complemento is distinct from coalesce((v_n ->> 'complemento')::boolean, false);
    get diagnostics v_rol = row_count;
    v_c0 := v_corregidas;$v$
);
select pg_temp.reemplazar_anclado(
  'retail.guardar_insumos_orden(uuid, jsonb)',
  $v$v_agregadas := v_agregadas + 1;$v$,
  $v$v_agregadas := v_agregadas + 1;
      -- ADR-0563: una fila nueva que es complemento se marca y no declara el consumo del modelo.
      if coalesce((v_n ->> 'complemento')::boolean, false) then
        update retail.produccion_insumos set es_complemento = true
         where produccion_id = p_produccion_id and insumo_id = (v_n ->> 'insumo_id')::uuid and color_codigo is not distinct from (v_n ->> 'color_codigo');
        continue;
      end if;$v$
);
select pg_temp.reemplazar_anclado(
  'retail.guardar_insumos_orden(uuid, jsonb)',
  $v$      where id = v_fila.id;
      v_corregidas := v_corregidas + 1;
    end if;
  end loop;$v$,
  $v$      where id = v_fila.id;
      v_corregidas := v_corregidas + 1;
    end if;
    -- ADR-0563: si solo cambió el rol de la fila, cuenta como una corrección (una sola vez por fila).
    if v_rol > 0 and v_corregidas = v_c0 then
      v_corregidas := v_corregidas + 1;
    end if;
  end loop;$v$
);

-- 3. Pasar al stock: lo medido es de la tela del modelo, no de sus complementos.
select pg_temp.reemplazar_anclado(
  'retail.cerrar_produccion(uuid, jsonb, numeric, numeric, numeric, boolean)',
  $v$     where mi.produccion_id = p_produccion_id and mi.tipo in ('consumo', 'devolucion') and i.tipo = 'tela' and i.unidad_medida = 'metro';$v$,
  $v$     where mi.produccion_id = p_produccion_id and mi.tipo in ('consumo', 'devolucion') and i.tipo = 'tela' and i.unidad_medida = 'metro';
    -- ADR-0563: lo medido es de la TELA del modelo, no de sus complementos (forro, otra tela). Sin complementos nada cambia. Si una misma tela es la principal de un color y
    -- complemento de otro, sus metros no se pueden separar (el consumo se anota por material): esa orden no aporta a lo medido.
    if exists (select 1 from retail.produccion_insumos pc where pc.produccion_id = p_produccion_id and pc.es_complemento) then
      if exists (select 1 from retail.produccion_insumos pa join retail.produccion_insumos pb on pb.produccion_id = pa.produccion_id and pb.insumo_id = pa.insumo_id and pb.es_complemento
                  where pa.produccion_id = p_produccion_id and not pa.es_complemento) then
        v_usado := 0;
      else
        v_usado := coalesce((select sum(case when mi.tipo = 'consumo' then mi.cantidad else -mi.cantidad end)
                               from retail.movimientos_insumo mi join retail.insumos i on i.id = mi.insumo_id
                              where mi.produccion_id = p_produccion_id and mi.tipo in ('consumo', 'devolucion') and i.tipo = 'tela' and i.unidad_medida = 'metro'
                                and not exists (select 1 from retail.produccion_insumos pc where pc.produccion_id = mi.produccion_id and pc.insumo_id = mi.insumo_id and pc.es_complemento)), 0);
      end if;
    end if;$v$
);

-- 4. La orden en una sola lectura devuelve el rol de cada fila de tela y avío.
select pg_temp.reemplazar_anclado(
  'retail.fn_orden_produccion(uuid)',
  $v$'consumo_por_talla', pi.consumo_por_talla, 'cantidad_plan', pi.cantidad_plan,$v$,
  $v$'consumo_por_talla', pi.consumo_por_talla, 'cantidad_plan', pi.cantidad_plan, 'es_complemento', pi.es_complemento,$v$
);

reset lock_timeout;
