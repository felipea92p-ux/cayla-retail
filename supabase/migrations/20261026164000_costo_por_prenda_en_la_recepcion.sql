-- ============================================================================
-- 20261026164000_costo_por_prenda_en_la_recepcion.sql — CAYLA V2 · ADR-0519
-- Quien cierra un envío puede ponerle un costo propio a cada prenda que separó, no solo a la línea entera.
--
-- EL PROBLEMA PRIMERO. Al cerrar un conteo, el costo de compra es UNO por línea (una categoría y una marca de una orden): ADR-0393 lo
-- guarda en `despacho_conteos.costo_unitario` y todo lo que entra de esa línea —y lo que se detalle después— entra con él. Pero quien cuenta
-- separa esa línea en prendas distintas (12 vestidos → Sofía 6, Antonella 4, otra por crear), y cada una puede haber costado distinto:
-- Felipe lo notó el 2026-10-26 al ver que la compra sí guarda el costo de cada prenda y la recepción no lo muestra ni deja corregirlo (un
-- error al comprar, o un precio que cambió). Hoy solo se puede corregir la línea entera, o la prenda ya recibida desde Catálogo.
--
-- QUÉ CAMBIA (todo con reemplazos ANCLADOS sobre la definición viva: si el texto no es el esperado, se detiene sin cambiar nada)
--   1. `despacho_conteos.costos_prendas` (jsonb, `{ "<producto_id>": 55.5, "nueva:<descripción>": 41.5 }`, nace vacío): el costo propio de las
--      prendas separadas de esa línea que NO cuestan lo que la línea; una prenda nueva que todavía no existe (se crea después) se nombra por su
--      descripción, tal cual quedó en el conteo. Una prenda que no está aquí cuesta lo de su línea. Se escribe solo al cerrar y se queda: lo que
--      se detalle después («Hacer ahora») entra con él, igual que con el costo de la línea (decisión 6 de ADR-0393).
--   2. `cerrar_conteo_envio`: acepta en cada línea de `p_lineas` `costos_prendas` (un objeto producto → costo). Lo valida con las reglas del
--      costo de la línea (0 a 99 999.99, dos decimales; solo las prendas separadas en ESA línea; vacío = el de la línea), lo guarda en el
--      conteo y lo pone en cada variante que entra hoy. En un envío sin aviso, una línea de fuera de la guía solo lo escribe quien ve el
--      dinero de Compras, como el costo de la línea.
--   3. `fn_recepcion_entrar` (la puerta única al stock): cada variante lleva `costo` si su prenda tiene uno propio; el promedio de la
--      variante (`fn_recalcular_costo_variante`), su fila de lo recibido y la revisión del costo atípico usan ESE costo. Lo que no lo trae
--      sigue con el de la línea, así `recibir_despacho` (el formulario de la fase 4) no cambia.
--   4. `resolver_pendiente_envio` («Hacer ahora»): las tallas que se detallan después entran con el costo propio de su prenda; si lo que se
--      resuelve es una prenda NUEVA que se acaba de crear, entra con el costo que se le puso a su descripción.
--   5. `fn_envio_conteo_json`: el conteo trae `costos_prendas`, para que la pantalla, al reabrir o recargar, muestre lo que se escribió.
--
-- LO QUE NO CAMBIA
--   · Con `costos_prendas` vacío o ausente todo es idéntico a hoy: ninguna línea cambia de costo por esta migración.
--   · El comprobante y el pago (Compras): `completar_papel_compra` sigue con el costo de cada línea de la orden. Lo que entró a la tienda a
--     otro costo no se toca (decisión de ADR-0480, actividad 7): Compras ve el papel; la tienda, la mercadería.
--   · Quién puede corregir un costo: el mismo que hoy corrige el de la línea (decisión 18 de ADR-0362: todo el que recibe ve y corrige).
--
-- DESCARTÉ
--   · Partir la línea en una por prenda al cerrar: cambia los números de la guía («dijeron 12»), las diferencias y el papel del proveedor.
--   · Guardar el costo dentro de `separado` (el jsonb de lo contado): lo reescribe cada guardado del conteo, que no conoce el costo.
--   · Una tabla nueva por costo: es un dato por (línea, prenda) que solo se lee junto con el conteo; una columna jsonb lo deja con su dueño.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe, después de 20261026161000). UNA parte, sin políticas ni `drop trigger` (ADR-0195): un
-- `alter table … add column` (lleva un valor por defecto, que Postgres guarda sin reescribir la tabla), funciones y reemplazos anclados,
-- con `lock_timeout`. Idempotente. Sin `select … into` dentro de textos entre comillas (ADR-0288). El bloque final comprueba que quedó todo.
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

-- ---------- 1. Dónde se guarda ----------
alter table retail.despacho_conteos
  add column if not exists costos_prendas jsonb not null default '{}'::jsonb
  constraint despacho_conteos_costos_prendas_objeto check (jsonb_typeof(costos_prendas) = 'object');
comment on column retail.despacho_conteos.costos_prendas is
  'ADR-0519: el costo propio de las prendas separadas en esta línea que no cuestan lo que la línea, como {"<producto_id>": 55.5}. Una prenda que no '
  'está aquí cuesta costo_unitario. Lo escribe cerrar_conteo_envio; lo que se detalle después entra con él.';

-- ---------- 2. Piezas internas ----------
-- Lee y limpia lo que quien cierra escribió para las prendas de UNA línea. Solo cuentan las prendas separadas en esa línea (una prenda que
-- ya no está se ignora: la pantalla pudo quedarse vieja); un costo vacío es «el de la línea».
create or replace function retail.fn_envio_costos_prendas(p_decision jsonb, p_separado jsonb, p_donde text)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_in jsonb := p_decision -> 'costos_prendas';
  v_out jsonb := '{}'::jsonb;
  v_e record;
  v_c numeric;
  v_clave text;
begin
  if v_in is null or jsonb_typeof(v_in) <> 'object' then
    return v_out;
  end if;
  for v_e in select e.key, e.value from jsonb_each(v_in) e loop
    if left(v_e.key, 6) = 'nueva:' then
      -- Una prenda nueva todavía sin crear: se nombra por su descripción, igual a la que quedó en el conteo.
      if not exists (select 1 from jsonb_array_elements(coalesce(p_separado -> 'nuevas', '[]'::jsonb)) x
                      where x ->> 'descripcion' = substr(v_e.key, 7)) then
        continue;
      end if;
      v_clave := v_e.key;
    else
      if not exists (select 1 from jsonb_array_elements(coalesce(p_separado -> 'prendas', '[]'::jsonb)) x
                      where lower(x ->> 'producto_id') = lower(v_e.key)) then
        continue;
      end if;
      v_clave := lower(v_e.key);
    end if;
    if jsonb_typeof(v_e.value) = 'null' or (jsonb_typeof(v_e.value) = 'string' and btrim(v_e.value #>> '{}') = '') then
      continue;
    end if;
    begin
      v_c := (v_e.value #>> '{}')::numeric;
    exception when others then
      raise exception 'El costo de una prenda de % no se entiende: escribe solo números', p_donde using hint = 'recepcion_costo';
    end;
    if v_c < 0 or v_c > 99999.99 or v_c <> round(v_c, 2) then
      raise exception 'El costo de una prenda de % va de S/ 0 a S/ 99 999.99, con hasta dos decimales', p_donde using hint = 'recepcion_costo';
    end if;
    v_out := v_out || jsonb_build_object(v_clave, v_c);
  end loop;
  return v_out;
end;
$$;
comment on function retail.fn_envio_costos_prendas(jsonb, jsonb, text) is
  'ADR-0519: los costos propios de las prendas de una línea, limpios ({producto_id: costo, "nueva:<descripción>": costo}): solo prendas '
  'separadas (o nuevas descritas) en esa línea, de 0 a 99 999.99 con dos decimales, vacío = el de la línea. Interna.';
revoke all on function retail.fn_envio_costos_prendas(jsonb, jsonb, text) from public, anon, authenticated;

-- Pone `costo` en cada variante cuya prenda tiene un costo propio (las demás siguen con el de la línea). `p_costo_resto`: el costo que se le
-- pone a las variantes SIN costo propio (la prenda nueva que se acaba de crear no tiene producto en `p_costos`: lo trae su descripción).
drop function if exists retail.fn_recepcion_costos_a_variantes(jsonb, jsonb);
create or replace function retail.fn_recepcion_costos_a_variantes(p_variantes jsonb, p_costos jsonb, p_costo_resto numeric default null)
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select case
    when (p_costos is null or p_costos = '{}'::jsonb) and p_costo_resto is null or jsonb_typeof(p_variantes) is distinct from 'array' then p_variantes
    else coalesce((
      select jsonb_agg(case when p_costos ? lower(vr.producto_id::text) then w.v || jsonb_build_object('costo', p_costos -> lower(vr.producto_id::text))
                            when p_costo_resto is not null then w.v || jsonb_build_object('costo', p_costo_resto)
                            else w.v end
                       order by w.o)
        from jsonb_array_elements(p_variantes) with ordinality w(v, o)
        left join retail.variantes vr on vr.id = (w.v ->> 'variante_id')::uuid), '[]'::jsonb)
  end;
$$;
comment on function retail.fn_recepcion_costos_a_variantes(jsonb, jsonb, numeric) is
  'ADR-0519: a cada variante de la lista le pone `costo` si su prenda tiene un costo propio en {producto_id: costo}; a las demás, `p_costo_resto` '
  'si lo hay. Interna.';
revoke all on function retail.fn_recepcion_costos_a_variantes(jsonb, jsonb, numeric) from public, anon, authenticated;

-- ---------- 3. La puerta única al stock: el costo de cada variante ----------
-- La revisión del costo atípico compara el costo con el vigente de ESA variante, así que mira el propio de su prenda.
select pg_temp.reemplazar('retail.fn_recepcion_entrar(uuid,uuid,text,text,uuid,jsonb,uuid[],text)',
$v$'costo', (u ->> 'costo')::numeric, 'vigente', vr.costo, 'precio', vr.precio, 'sku', vr.codigo,$v$,
$n$'costo', coalesce((v ->> 'costo')::numeric, (u ->> 'costo')::numeric), 'vigente', vr.costo, 'precio', vr.precio, 'sku', vr.codigo,$n$,
1);
select pg_temp.reemplazar('retail.fn_recepcion_entrar(uuid,uuid,text,text,uuid,jsonb,uuid[],text)',
$v$'costo_unitario', (u ->> 'costo')::numeric, 'costo_vigente', vr.costo,$v$,
$n$'costo_unitario', coalesce((v ->> 'costo')::numeric, (u ->> 'costo')::numeric), 'costo_vigente', vr.costo,$n$,
1);
select pg_temp.reemplazar('retail.fn_recepcion_entrar(uuid,uuid,text,text,uuid,jsonb,uuid[],text)',
$v$fn_costo_fuera_de_banda((u ->> 'costo')::numeric, vr.costo, vr.precio)$v$,
$n$fn_costo_fuera_de_banda(coalesce((v ->> 'costo')::numeric, (u ->> 'costo')::numeric), vr.costo, vr.precio)$n$,
1);
-- Lo que entra: el costo de la variante es el de su prenda si tiene uno propio; si no, el de la línea. Al terminar las variantes, el costo
-- vuelve a ser el de la línea (lo usan el faltante y el sobrante).
select pg_temp.reemplazar('retail.fn_recepcion_entrar(uuid,uuid,text,text,uuid,jsonb,uuid[],text)',
$v$      v_var := (v_v ->> 'variante_id')::uuid;
$v$,
$n$      v_var := (v_v ->> 'variante_id')::uuid;
      -- ADR-0519: el costo propio de esta prenda, si quien cerró escribió uno; si no, el de la línea.
      v_costo := coalesce((v_v ->> 'costo')::numeric, (v_u ->> 'costo')::numeric);
$n$,
1);
select pg_temp.reemplazar('retail.fn_recepcion_entrar(uuid,uuid,text,text,uuid,jsonb,uuid[],text)',
$v$    -- Lo que faltó o sobró: la deuda que resuelve la fase 5.
$v$,
$n$    v_costo := (v_u ->> 'costo')::numeric; -- ADR-0519: el de la línea, no el de la última prenda
    -- Lo que faltó o sobró: la deuda que resuelve la fase 5.
$n$,
1);

-- ---------- 4. Cerrar el conteo ----------
select pg_temp.reemplazar('retail.cerrar_conteo_envio(uuid,integer,jsonb,text,uuid)',
$v$  v_costo numeric;
  v_falt text;
$v$,
$n$  v_costo numeric;
  v_cp jsonb;
  v_falt text;
$n$,
1);
select pg_temp.reemplazar('retail.cerrar_conteo_envio(uuid,integer,jsonb,text,uuid)',
$v$    select k.id, k.despacho_item_id, k.extra_posicion, k.contadas, k.separado, k.costo_unitario,
$v$,
$n$    select k.id, k.despacho_item_id, k.extra_posicion, k.contadas, k.separado, k.costo_unitario, k.costos_prendas,
$n$,
1);
select pg_temp.reemplazar('retail.cerrar_conteo_envio(uuid,integer,jsonb,text,uuid)',
$v$    -- El costo con el que cierra la línea queda en su conteo: lo que se detalle después entra con él (decisión 6).
    if v_k.costo_unitario is distinct from v_costo then
      update retail.despacho_conteos k set costo_unitario = v_costo where k.id = v_k.id;
    end if;
$v$,
$n$    -- ADR-0519: el costo propio de las prendas separadas en esta línea. En un envío sin aviso, lo de fuera de la guía lo escribe solo quien
    -- ve el dinero de Compras, como el costo de la línea.
    v_cp := retail.fn_envio_costos_prendas(v_d, v_sep, v_k.donde);
    if v_cp <> '{}'::jsonb and v_k.despacho_item_id is null and not retail.fn_puede_ver_dinero_de_compras()
       and exists (select 1 from retail.despachos_sin_aviso s where s.despacho_id = p_despacho_id) then
      raise exception 'Tu rol no ve el dinero de Compras: recibe sin costo, llega con la factura' using hint = 'recepcion_costo_sin_permiso';
    end if;
    -- El costo con el que cierra la línea (y el de cada prenda) queda en su conteo: lo que se detalle después entra con él (decisión 6).
    if v_k.costo_unitario is distinct from v_costo or v_k.costos_prendas is distinct from v_cp then
      update retail.despacho_conteos k set costo_unitario = v_costo, costos_prendas = v_cp where k.id = v_k.id;
    end if;
$n$,
1);
select pg_temp.reemplazar('retail.cerrar_conteo_envio(uuid,integer,jsonb,text,uuid)',
$v$'variantes', v_vars, 'contado', v_k.contadas,$v$,
$n$'variantes', retail.fn_recepcion_costos_a_variantes(v_vars, v_cp), 'contado', v_k.contadas,$n$,
1);

-- ---------- 5. «Hacer ahora»: lo que se detalla después entra con el costo de su prenda ----------
select pg_temp.reemplazar('retail.resolver_pendiente_envio(uuid,uuid,integer,uuid,jsonb,boolean,uuid)',
$v$  select k.id, k.despacho_item_id, k.extra_posicion, k.costo_unitario,
$v$,
$n$  select k.id, k.despacho_item_id, k.extra_posicion, k.costo_unitario, k.costos_prendas,
$n$,
1);
select pg_temp.reemplazar('retail.resolver_pendiente_envio(uuid,uuid,integer,uuid,jsonb,boolean,uuid)',
$v$'confirma', coalesce(p_confirma_costo, false), 'variantes', v_vars, 'contado', 0,$v$,
$n$'confirma', coalesce(p_confirma_costo, false), 'variantes',
          -- ADR-0519: el costo propio de cada prenda; y si lo que se resuelve es una prenda NUEVA ya creada («por crear»), el que se le puso a su descripción.
          retail.fn_recepcion_costos_a_variantes(v_vars, v_k.costos_prendas,
                                                 case when v_pend.tipo = 'crear' and v_k.costos_prendas ? ('nueva:' || coalesce(v_pend.descripcion, ''))
                                                      then (v_k.costos_prendas ->> ('nueva:' || v_pend.descripcion))::numeric end),
          'contado', 0,$n$,
1);

-- ---------- 6. La pantalla ve lo que se escribió ----------
select pg_temp.reemplazar('retail.fn_envio_conteo_json(retail.despacho_conteos)',
$v$    'costo_unitario', p_fila.costo_unitario,
$v$,
$n$    'costo_unitario', p_fila.costo_unitario,
    -- ADR-0519: el costo propio de las prendas de esta línea ({producto_id: costo}); las que no están cuestan el de la línea.
    'costos_prendas', p_fila.costos_prendas,
$n$,
1);

-- ---------- 7. Comprobación ----------
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'retail' and table_name = 'despacho_conteos' and column_name = 'costos_prendas') then
    raise exception 'falta despacho_conteos.costos_prendas';
  end if;
  if position('fn_recepcion_costos_a_variantes' in pg_get_functiondef('retail.cerrar_conteo_envio(uuid,integer,jsonb,text,uuid)'::regprocedure)) = 0
     or position('fn_envio_costos_prendas' in pg_get_functiondef('retail.cerrar_conteo_envio(uuid,integer,jsonb,text,uuid)'::regprocedure)) = 0 then
    raise exception 'cerrar_conteo_envio no quedó con el costo por prenda';
  end if;
  if position('''nueva:''' in pg_get_functiondef('retail.resolver_pendiente_envio(uuid,uuid,integer,uuid,jsonb,boolean,uuid)'::regprocedure)) = 0 then
    raise exception 'resolver_pendiente_envio no quedó con el costo por prenda';
  end if;
  if position('coalesce((v_v ->> ''costo'')::numeric' in pg_get_functiondef('retail.fn_recepcion_entrar(uuid,uuid,text,text,uuid,jsonb,uuid[],text)'::regprocedure)) = 0 then
    raise exception 'fn_recepcion_entrar no quedó con el costo por variante';
  end if;
  if position('costos_prendas' in pg_get_functiondef('retail.fn_envio_conteo_json(retail.despacho_conteos)'::regprocedure)) = 0 then
    raise exception 'fn_envio_conteo_json no trae costos_prendas';
  end if;
end;
$$;

reset lock_timeout;
