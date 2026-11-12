#!/usr/bin/env node
/**
 * Prueba de Catálogo ▸ Productos ▸ Fusionar duplicados (ADR-0650, migraciones 20261112204000, 205000 y 210000).
 *
 * QUÉ CUBRE
 *   · La previsualización (`previsualizar_fusion_productos`): de cada producto, sus ventas y su fecha de alta; qué variante
 *     se muda (talla y color que el que queda no tiene) y cuál se junta (la misma talla y color); los campos que difieren;
 *     y cada bloqueo con su frase: el mismo producto, sin duplicados, la pieza del sistema, una talla y color repetida con
 *     apartados, «Sin color» mezclado con colores, una talla que la categoría final no tiene.
 *   · Permisos: quien edita el catálogo (un Líder, una integrante con Productos) la ve; una integrante sin Productos y
 *     `anon` no; el cálculo interno (`fn_fusion_productos_plan`) no se llama desde la API.
 *
 * CÓMO. Cada escenario en su transacción con ROLLBACK y sesión simulada con `request.jwt.claim.sub`. Nada queda escrito.
 * Los duplicados se crean dentro de la transacción (`pg_temp.duplicado`), con stock cargado por movimientos.
 *
 * USO
 *   pnpm pruebas:fusionar-productos        → con las migraciones ya aplicadas en el local
 *   RETAIL_CONTENEDOR_PG=<contenedor> …    → contra otra base local
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const CONTENEDOR_LOCAL = process.env.RETAIL_CONTENEDOR_PG ?? "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (y Admin en el seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante
const CENTINELA = "11111111-1111-4111-8111-111111111111";

/** Un id del seed por su nombre: el seed los crea al azar en cada base, así que no se escriben a mano. */
function idDe(sql) {
  const id = psql(sql).trim();
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error(`No encontré en la base local: ${sql}`);
  return id;
}

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
  );
}
function correr(sql) {
  try {
    return { ok: true, salida: psql(`begin;\n${AYUDAS}\n${sql}\nrollback;\n`).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
const sesion = (id) => `reset role;
set local request.jwt.claim.sub = '${id}';
set local request.jwt.claims = '{"sub":"${id}","role":"authenticated"}';
set local role authenticated;
`;
const COMO_POSTGRES = "reset role;\n";
const EMMA = idDe("select id from retail.productos where referencia = 'Blusa Emma'"); // NEG y BEI en S, M, L
const VALENTINA = idDe("select id from retail.productos where referencia = 'Blusa Valentina'"); // BLA y ROS en S, M, L
const TRUJILLO = idDe("select id from retail.ubicaciones where nombre = 'Tienda Trujillo'");
const LIMA = idDe("select id from retail.ubicaciones where nombre = 'Tienda Lima'");

const AYUDAS = `
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_msg text; v_hint text; v_estado text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_msg = message_text, v_hint = pg_exception_hint, v_estado = returned_sqlstate;
  return v_estado || '|' || coalesce(nullif(v_hint, ''), '-') || '|' || v_msg;
end;
$f$;

-- Un duplicado de la Blusa Emma (misma categoría, marca y proveedor) con las variantes y el stock que se pidan:
-- p_lineas = '[{"color":"NEG","talla":"M","stock":3}, …]', todo en el piso de Trujillo.
create function pg_temp.duplicado(p_referencia text, p_lineas jsonb, p_de uuid default '${EMMA}') returns uuid language plpgsql as $f$
declare v_p uuid; v_v uuid; l jsonb; v_m uuid; v_piso uuid;
begin
  v_piso := null;
  insert into retail.productos (referencia, estado, categoria_id, marca_id, proveedor_id)
    select p_referencia, 'activo', categoria_id, marca_id, proveedor_id from retail.productos where id = p_de
    returning id into v_p;
  for l in select * from jsonb_array_elements(p_lineas) loop
    insert into retail.variantes (producto_id, color_codigo, talla_id, precio, costo)
      values (v_p, nullif(l->>'color', ''),
              (select id from retail.tallas where valor = l->>'talla'),
              coalesce((l->>'precio')::numeric, 79.90), coalesce((l->>'costo')::numeric, 32))
      returning id into v_v;
    if coalesce((l->>'stock')::integer, 0) > 0 then
      -- «sede»: trujillo (de fábrica) o lima; «empresa»: la clave del dueño en una sede de dos empresas.
      v_piso := (select id from retail.sububicaciones
                  where ubicacion_id = case when l->>'sede' = 'lima' then '${LIMA}'::uuid else '${TRUJILLO}'::uuid end and tipo = 'piso_venta');
      insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, empresa_id)
        values (v_v, case when l->>'sede' = 'lima' then '${LIMA}'::uuid else '${TRUJILLO}'::uuid end, v_piso, 'entrada',
                (l->>'stock')::integer, 'recepcion', (select id from retail.empresas where clave = l->>'empresa'))
        returning id into v_m;
      perform retail.fn_aplicar_movimiento(v_m);
    end if;
  end loop;
  return v_p;
end;
$f$;

create function pg_temp.variante(p_producto uuid, p_color text, p_talla text) returns uuid language sql as $f$
  select v.id from retail.variantes v left join retail.tallas t on t.id = v.talla_id
   where v.producto_id = p_producto and v.color_codigo is not distinct from nullif(p_color, '') and t.valor is not distinct from nullif(p_talla, '')
     and v.fusionada_en_id is null
$f$;

-- Cuántas filas de stock de esos productos no cuadran con su libro de movimientos (principio 4). Se compara antes y
-- después de fusionar: la fusión no puede sumar ni una.
create function pg_temp.descuadres(p_productos uuid[]) returns integer language sql as $f$
  with libro as (
    select m.variante_id, m.ubicacion_id as u, m.sububicacion_id as s,
           case m.tipo when 'entrada' then m.cantidad when 'salida' then -m.cantidad when 'ajuste' then m.cantidad
                       when 'traslado' then -m.cantidad else 0 end as q
      from retail.movimientos m join retail.variantes v on v.id = m.variante_id where v.producto_id = any (p_productos)
    union all
    select m.variante_id, m.ubicacion_destino_id, m.sububicacion_destino_id, m.cantidad
      from retail.movimientos m join retail.variantes v on v.id = m.variante_id
     where m.tipo = 'traslado' and v.producto_id = any (p_productos)
  ), suma as (select variante_id, u, s, sum(q) as q from libro group by 1, 2, 3),
  st as (select st.* from retail.stock st join retail.variantes v on v.id = st.variante_id where v.producto_id = any (p_productos))
  select count(*)::integer from suma a full join st
    on st.variante_id = a.variante_id and st.ubicacion_id = a.u and st.sububicacion_id is not distinct from a.s
   where coalesce(a.q, 0) <> coalesce(st.cantidad, 0)
$f$;

-- Lo que la prenda tiene en total: unidades en stock y unidades vendidas, de todas sus variantes.
create function pg_temp.totales(p_productos uuid[]) returns text language sql as $f$
  select coalesce((select sum(st.cantidad) from retail.stock st join retail.variantes v on v.id = st.variante_id where v.producto_id = any (p_productos)), 0)
         || '/' ||
         coalesce((select sum(vi.cantidad) from retail.venta_items vi join retail.ventas ve on ve.id = vi.venta_id and ve.estado = 'completada'
                     join retail.variantes v on v.id = vi.variante_id where v.producto_id = any (p_productos)), 0)
$f$;

-- Los códigos de los bloqueos de un plan, ordenados: «mismo,centinela».
create function pg_temp.bloqueos(p jsonb) returns text language sql as $f$
  select coalesce(string_agg(b->>'codigo', ',' order by b->>'codigo'), '') from jsonb_array_elements(p->'bloqueos') b
$f$;
`;

const casos = [];
const caso = (nombre, fn) => casos.push({ nombre, fn });

function filaX(r) {
  if (!r.ok) return { error: r.mensaje.split("\n").slice(0, 4).join("\n") };
  const linea = r.salida.split("\n").find((l) => l.startsWith("x|"));
  if (!linea) return { error: `sin fila x:\n${r.salida.slice(0, 600)}` };
  return { campos: linea.split("|").slice(1) };
}
function espera(r, esperado) {
  const f = filaX(r);
  if (f.error) return f.error;
  const obtenido = f.campos.join("|");
  if (obtenido !== esperado) return `esperaba «${esperado}»\nobtuve    «${obtenido}»`;
  return null;
}

// ---------------------------------------------------------------------------------------------- previsualizar

caso("1 · dos productos sin tallas en común: las 6 variantes se mudan, ninguna se junta; ventas y fecha de alta a la vista", () =>
  espera(
    correr(`${sesion(FELIPE)}
select 'x', p->>'ok', p#>>'{resumen,mudan}', p#>>'{resumen,juntan}', pg_temp.bloqueos(p),
       (select count(*) from jsonb_array_elements(p->'productos') e where e ? 'unidades_vendidas' and e ? 'creado_en' and e ? 'ventas'),
       (select string_agg(e->>'queda', ',' order by (e->>'orden')::int) from jsonb_array_elements(p->'productos') e),
       (select count(*) from jsonb_array_elements(p->'variantes') v where v->>'trato' = 'muda')
  from (select retail.previsualizar_fusion_productos('${VALENTINA}', array['${EMMA}']::uuid[]) p) t;`),
    "true|6|0||2|true,false|6"
  )
);

caso("2 · la misma talla y color se junta con la del que queda (y su stock se cuenta); la que no tiene, se muda", () =>
  espera(
    correr(`${COMO_POSTGRES}
select pg_temp.duplicado('ZZ Blusa Emma bis', '[{"color":"NEG","talla":"M","stock":3},{"color":"NEG","talla":"XL","stock":2}]') as d \\gset
select pg_temp.variante('${EMMA}', 'NEG', 'M') as w \\gset
${sesion(FELIPE)}
select 'x', p->>'ok', p#>>'{resumen,mudan}', p#>>'{resumen,juntan}', p#>>'{resumen,unidades_juntadas}', p#>>'{resumen,unidades_que_llegan}',
       (select v->>'con_variante_id' from jsonb_array_elements(p->'variantes') v where v->>'talla' = 'M') = :'w',
       (select string_agg(v->>'talla' || ':' || (v->>'trato'), ',' order by v->>'talla') from jsonb_array_elements(p->'variantes') v),
       p#>>'{avisos,0,codigo}'
  from (select retail.previsualizar_fusion_productos('${EMMA}', array[:'d']::uuid[]) p) t;`),
    "true|1|1|3|5|t|M:junta,XL:muda|se_suman"
  )
);

caso("3 · tres a la vez: si el que queda no tiene una talla, la absorbe el primer duplicado que la trae y el segundo se junta con ella", () =>
  espera(
    correr(`${COMO_POSTGRES}
select pg_temp.duplicado('ZZ Emma 2', '[{"color":"NEG","talla":"XL","stock":1}]') as d1 \\gset
select pg_temp.duplicado('ZZ Emma 3', '[{"color":"NEG","talla":"XL","stock":4}]') as d2 \\gset
select pg_temp.variante(:'d1', 'NEG', 'XL') as w \\gset
${sesion(FELIPE)}
select 'x', p->>'ok',
       (select string_agg(v->>'trato', ',' order by (v->>'stock')::int) from jsonb_array_elements(p->'variantes') v),
       (select v->>'con_variante_id' from jsonb_array_elements(p->'variantes') v where v->>'producto_id' = :'d2') = :'w'
  from (select retail.previsualizar_fusion_productos('${EMMA}', array[:'d1', :'d2']::uuid[]) p) t;`),
    "true|muda,junta|t"
  )
);

caso("4 · los campos que difieren son los únicos que se eligen (nombre, descripción y precio aquí; categoría y marca son iguales)", () =>
  espera(
    correr(`${COMO_POSTGRES}
select pg_temp.duplicado('ZZ Emma distinta', '[{"color":"NEG","talla":"XL","stock":1,"precio":99}]') as d \\gset
${sesion(FELIPE)}
select 'x', (select string_agg(k, ',' order by k) from jsonb_array_elements_text(p->'diferencias') k)
  from (select retail.previsualizar_fusion_productos('${EMMA}', array[:'d']::uuid[]) p) t;`),
    "descripcion,precio,referencia"
  )
);

caso("5 · bloqueos sin fusionar nada: el mismo producto, sin duplicados, la pieza del sistema, un producto que no existe", () =>
  espera(
    correr(`${sesion(FELIPE)}
select 'x',
  pg_temp.bloqueos(retail.previsualizar_fusion_productos('${EMMA}', array['${EMMA}']::uuid[])),
  pg_temp.bloqueos(retail.previsualizar_fusion_productos('${EMMA}', array[]::uuid[])),
  pg_temp.bloqueos(retail.previsualizar_fusion_productos('${EMMA}', array['${CENTINELA}']::uuid[])),
  pg_temp.bloqueos(retail.previsualizar_fusion_productos('${EMMA}', array[gen_random_uuid()]::uuid[]));`),
    "mismo|sin_duplicados|centinela|no_existe"
  )
);

caso("6 · una talla y color que se JUNTA con apartados no deja fusionar, y lo dice con la frase de qué hacer", () =>
  espera(
    correr(`${COMO_POSTGRES}
select pg_temp.duplicado('ZZ Emma apartada', '[{"color":"NEG","talla":"M","stock":3}]') as d \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  select pg_temp.variante(:'d', 'NEG', 'M'), '${TRUJILLO}', id, 'apartado', 1, 'apartado'
    from retail.sububicaciones where ubicacion_id = '${TRUJILLO}' and tipo = 'piso_venta' returning id as m \\gset
select retail.fn_aplicar_movimiento(:'m');
${sesion(FELIPE)}
select 'x', p->>'ok', pg_temp.bloqueos(p), p#>>'{bloqueos,0,mensaje}' like '%apartada(s) para un cliente. Entrégalas o libéralas en Apartados%'
  from (select retail.previsualizar_fusion_productos('${EMMA}', array[:'d']::uuid[]) p) t;`),
    "false|junta_apartada|t"
  )
);

caso("7 · la misma prenda apartada pero en una talla que se MUDA no frena: el apartado viaja con su variante", () =>
  espera(
    correr(`${COMO_POSTGRES}
select pg_temp.duplicado('ZZ Emma apartada XL', '[{"color":"NEG","talla":"XL","stock":3}]') as d \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  select pg_temp.variante(:'d', 'NEG', 'XL'), '${TRUJILLO}', id, 'apartado', 1, 'apartado'
    from retail.sububicaciones where ubicacion_id = '${TRUJILLO}' and tipo = 'piso_venta' returning id as m \\gset
select retail.fn_aplicar_movimiento(:'m');
${sesion(FELIPE)}
select 'x', p->>'ok', pg_temp.bloqueos(p)
  from (select retail.previsualizar_fusion_productos('${EMMA}', array[:'d']::uuid[]) p) t;`),
    "true|"
  )
);

caso("8 · «Sin color» junto a colores quedaría mezclado: frena", () =>
  espera(
    correr(`${COMO_POSTGRES}
select pg_temp.duplicado('ZZ Emma sin color', '[{"color":"","talla":"XL","stock":1}]') as d \\gset
${sesion(FELIPE)}
select 'x', pg_temp.bloqueos(retail.previsualizar_fusion_productos('${EMMA}', array[:'d']::uuid[]));`),
    "mezcla_sin_color"
  )
);

caso("9 · una talla que la categoría final no tiene habilitada frena y nombra la talla", () =>
  espera(
    correr(`${COMO_POSTGRES}
insert into retail.tallas (valor) values ('ZZ9');
select pg_temp.duplicado('ZZ Emma talla rara', '[{"color":"NEG","talla":"ZZ9","stock":1}]') as d \\gset
${sesion(FELIPE)}
select 'x', pg_temp.bloqueos(p), p#>>'{bloqueos,0,mensaje}' like 'La talla ZZ9 no está habilitada en «Camisas y Blusas»%'
  from (select retail.previsualizar_fusion_productos('${EMMA}', array[:'d']::uuid[]) p) t;`),
    "talla_fuera_de_categoria|t"
  )
);

caso("10 · permisos: una integrante con Productos la ve; sin Productos, 42501; el cálculo interno no es de la API", () => {
  const r = correr(`${COMO_POSTGRES}
update retail.roles set limitado_como_hoy = false where clave = 'integrante';
delete from retail.rol_modulos where rol_id = retail.fn_rol_por_clave('integrante');
insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), 'existencias');
${sesion(MICAELA)}
select 'x',
  split_part(pg_temp.intento($q$select retail.previsualizar_fusion_productos('${VALENTINA}', array['${EMMA}']::uuid[])$q$), '|', 1),
  has_function_privilege('authenticated', 'retail.fn_fusion_productos_plan(uuid, uuid[], jsonb)', 'execute'),
  has_function_privilege('anon', 'retail.previsualizar_fusion_productos(uuid, uuid[], jsonb)', 'execute');
${COMO_POSTGRES}
insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), 'productos');
${sesion(MICAELA)}
select 'x', pg_temp.intento($q$select retail.previsualizar_fusion_productos('${VALENTINA}', array['${EMMA}']::uuid[])$q$);`);
  if (!r.ok) return r.mensaje.split("\n").slice(0, 4).join("\n");
  const obtenido = r.salida.split("\n").filter((l) => l.startsWith("x|")).map((l) => l.split("|").slice(1).join("/")).join(" · ");
  return obtenido === "42501/f/f · SIN_ERROR" ? null : `obtuve «${obtenido}»`;
});


// ---------------------------------------------------------------------------------------------- fusionar

caso("11 · fusión sin tallas en común: las variantes cambian de producto con su stock y sus ventas; el duplicado queda fusionado, con rastro y Actividad", () =>
  espera(
    correr(`${COMO_POSTGRES}
select pg_temp.totales(array['${VALENTINA}', '${EMMA}']::uuid[]) as antes, pg_temp.descuadres(array['${VALENTINA}', '${EMMA}']::uuid[]) as desc_antes \\gset
${sesion(FELIPE)}
select (retail.fusionar_productos('${VALENTINA}', array['${EMMA}']::uuid[])) ->> 'mudadas' as mudadas \\gset
${COMO_POSTGRES}
select 'x', :'mudadas',
  pg_temp.totales(array['${VALENTINA}']::uuid[]) = :'antes',
  pg_temp.descuadres(array['${VALENTINA}', '${EMMA}']::uuid[]) = :'desc_antes',
  (select count(*) from retail.variantes where producto_id = '${EMMA}'),
  (select estado || ':' || (fusionado_en_id = '${VALENTINA}') from retail.productos where id = '${EMMA}'),
  (select count(*) from retail.producto_fusiones where producto_queda_id = '${VALENTINA}' and producto_fusionado_id = '${EMMA}'
     and fusionada_por = (select id from public.personas where auth_user_id = '${FELIPE}') and jsonb_array_length(ficha_fusionada -> 'variantes') = 6),
  (select count(*) from retail.actividad where modulo = 'productos' and accion = 'fusionar' and registro_id = '${VALENTINA}' and persona_id = (select id from public.personas where auth_user_id = '${FELIPE}'));`),
    "6|t|t|0|descontinuado:true|1|1"
  )
);

caso("12 · la misma talla y color se junta: sus unidades pasan con salida y entrada (sin pérdida), sus códigos de barras y el de su etiqueta pasan, y ella se apaga", () =>
  espera(
    correr(`${COMO_POSTGRES}
select pg_temp.duplicado('ZZ Emma bis', '[{"color":"NEG","talla":"M","stock":3},{"color":"NEG","talla":"XL","stock":2}]') as d \\gset
select pg_temp.variante(:'d', 'NEG', 'M') as j, pg_temp.variante('${EMMA}', 'NEG', 'M') as w \\gset
insert into retail.codigos_barras (variante_id, codigo, origen) values (:'j', 'ZZ-FUSION-0001', 'fabrica');
select coalesce((select sum(cantidad) from retail.stock where variante_id = :'w'), 0) as w_antes,
       pg_temp.totales(array['${EMMA}', :'d']::uuid[]) as antes, pg_temp.descuadres(array['${EMMA}', :'d']::uuid[]) as desc_antes \\gset
${sesion(FELIPE)}
select retail.fusionar_productos('${EMMA}', array[:'d']::uuid[]) as r \\gset
${COMO_POSTGRES}
select 'x', (:'r'::jsonb) ->> 'juntadas', (:'r'::jsonb) ->> 'unidades_juntadas',
  (select sum(cantidad) from retail.stock where variante_id = :'w') - :'w_antes'::int,
  coalesce((select sum(cantidad) from retail.stock where variante_id = :'j'), 0),
  (select activo || ':' || (fusionada_en_id = :'w') || ':' || (producto_id = '${EMMA}') from retail.variantes where id = :'j'),
  (select variante_id = :'w' from retail.codigos_barras where codigo = 'ZZ-FUSION-0001'),
  (select cb.variante_id = :'w' from retail.codigos_barras cb join retail.variantes j on j.codigo = cb.codigo where j.id = :'j'),
  (select string_agg(tipo || ':' || cantidad, ',' order by tipo) from retail.movimientos where motivo = 'fusion_producto'),
  (select bool_and(retail.fn_perdida_razon(tipo, motivo, cantidad) is null) from retail.movimientos where motivo = 'fusion_producto'),
  pg_temp.totales(array['${EMMA}']::uuid[]) = :'antes',
  pg_temp.descuadres(array['${EMMA}', :'d']::uuid[]) = :'desc_antes',
  (select count(*) from retail.variantes where producto_id = '${EMMA}' and activo and fusionada_en_id is null and talla_id = (select id from retail.tallas where valor = 'XL'));`),
    "1|3|3|0|false:true:true|t|t|entrada:3,salida:3|t|t|t|1"
  )
);

caso("13 · en una sede de dos empresas cada unidad conserva su dueño al juntarse (CLAURE con CLAURE, CAYLA con CAYLA)", () =>
  espera(
    correr(`${COMO_POSTGRES}
insert into retail.empresa_sedes (empresa_id, ubicacion_id)
  select e.id, u from retail.empresas e, unnest(array['${LIMA}', '${TRUJILLO}']::uuid[]) u where e.clave = 'cayla'
  on conflict do nothing;
insert into retail.empresa_sedes (empresa_id, ubicacion_id) select id, '${LIMA}' from retail.empresas where clave = 'claure' on conflict do nothing;
select pg_temp.duplicado('ZZ Emma Lima', '[{"color":"NEG","talla":"M","stock":2,"sede":"lima","empresa":"claure"}]') as d \\gset
select pg_temp.variante(:'d', 'NEG', 'M') as j, pg_temp.variante('${EMMA}', 'NEG', 'M') as w \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, empresa_id)
  select :'j', '${LIMA}', id, 'entrada', 1, 'recepcion', (select id from retail.empresas where clave = 'cayla')
    from retail.sububicaciones where ubicacion_id = '${LIMA}' and tipo = 'piso_venta' returning id as m \\gset
select retail.fn_aplicar_movimiento(:'m');
select coalesce((select cantidad from retail.stock_dueno sd join retail.empresas e on e.id = sd.empresa_id
                  where sd.variante_id = :'w' and sd.ubicacion_id = '${LIMA}' and e.clave = 'claure'), 0) as claure_antes,
       coalesce((select sum(cantidad) from retail.stock where variante_id = :'w' and ubicacion_id = '${LIMA}'), 0) as lima_antes \\gset
${sesion(FELIPE)}
select retail.fusionar_productos('${EMMA}', array[:'d']::uuid[]) is not null as hecho \\gset
${COMO_POSTGRES}
select 'x',
  (select cantidad from retail.stock_dueno sd join retail.empresas e on e.id = sd.empresa_id
    where sd.variante_id = :'w' and sd.ubicacion_id = '${LIMA}' and e.clave = 'claure') - :'claure_antes'::int,
  (select sum(cantidad) from retail.stock where variante_id = :'w' and ubicacion_id = '${LIMA}') - :'lima_antes'::int,
  coalesce((select sum(cantidad) from retail.stock_dueno where variante_id = :'j'), 0),
  (select string_agg(m.tipo || ':' || e.clave || ':' || m.cantidad, ',' order by m.tipo, e.clave)
     from retail.movimientos m join retail.empresas e on e.id = m.empresa_id where m.motivo = 'fusion_producto');`),
    "2|3|0|entrada:cayla:1,entrada:claure:2,salida:cayla:1,salida:claure:2"
  )
);

caso("14 · fotos: quedan las elegidas, en ese orden; la principal es la del que queda si se eligió; las demás se guardan en el duplicado", () =>
  espera(
    correr(`${COMO_POSTGRES}
select pg_temp.duplicado('ZZ Emma fotos', '[{"color":"NEG","talla":"XL","stock":1}]') as d \\gset
insert into retail.producto_fotos (producto_id, url, orden, es_principal) values
  ('${EMMA}', 'https://x/q1.jpg', 0, true), ('${EMMA}', 'https://x/q2.jpg', 1, false),
  (:'d', 'https://x/d1.jpg', 0, true), (:'d', 'https://x/d2.jpg', 1, false);
select (select id from retail.producto_fotos where url = 'https://x/q1.jpg') as q1, (select id from retail.producto_fotos where url = 'https://x/q2.jpg') as q2,
       (select id from retail.producto_fotos where url = 'https://x/d1.jpg') as d1 \\gset
${sesion(FELIPE)}
select retail.fusionar_productos('${EMMA}', array[:'d']::uuid[], jsonb_build_object('fotos', jsonb_build_array(:'d1', :'q1'))) is not null as hecho \\gset
${COMO_POSTGRES}
select 'x',
  (select string_agg(split_part(url, '/', 4) || case when es_principal then '*' else '' end, ',' order by orden) from retail.producto_fotos where producto_id = '${EMMA}'),
  (select string_agg(split_part(url, '/', 4), ',' order by url) from retail.producto_fotos where producto_id = :'d'),
  (select count(*) from retail.producto_fotos where url like 'https://x/%');`),
    "d1.jpg,q1.jpg*|d2.jpg,q2.jpg|4"
  )
);

caso("15 · campo por campo: el nombre y la categoría del duplicado pasan al que queda (el nombre ya quedó libre, sin choque)", () =>
  espera(
    correr(`${COMO_POSTGRES}
select pg_temp.duplicado('Capa Emma', '[{"color":"NEG","talla":"XL","stock":1}]') as d \\gset
update retail.productos set categoria_id = (select id from retail.categorias where nombre = 'Casacas') where id = :'d';
${sesion(FELIPE)}
select retail.fusionar_productos('${EMMA}', array[:'d']::uuid[],
  jsonb_build_object('campos', jsonb_build_object('referencia', :'d', 'categoria', :'d'))) is not null as hecho \\gset
${COMO_POSTGRES}
select 'x', p.referencia, c.nombre, (select referencia from retail.productos where id = :'d')
  from retail.productos p join retail.categorias c on c.id = p.categoria_id where p.id = '${EMMA}';`),
    "Capa Emma|Casacas|Capa Emma"
  )
);

caso("16 · el precio elegido queda en todas las tallas a la venta; el costo elegido solo en las que no tienen costo de compras (las del seed sí)", () =>
  espera(
    correr(`${COMO_POSTGRES}
select pg_temp.duplicado('ZZ Emma precio', '[{"color":"NEG","talla":"XL","stock":1,"precio":99,"costo":41}]') as d \\gset
-- Una talla del que queda ya tiene costo de sus compras: ese no se toca.
select pg_temp.variante('${EMMA}', 'NEG', 'S') as oficial \\gset
insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo) values (:'oficial', '${TRUJILLO}', 'ajuste', 1, 'zz') returning id as m \\gset
insert into retail.costo_historial (variante_id, stock_previo, costo_anterior, cantidad_nueva, costo_unitario_nuevo, costo_resultante, origen, movimiento_id)
  values (:'oficial', 0, 32, 1, 32, 32, 'compra', :'m');
${sesion(FELIPE)}
select retail.fusionar_productos('${EMMA}', array[:'d']::uuid[], jsonb_build_object('precio', 99, 'costo_de', '${EMMA}')) is not null as hecho \\gset
${COMO_POSTGRES}
select 'x',
  (select string_agg(distinct precio::text, ',') from retail.variantes where producto_id = '${EMMA}' and activo),
  (select costo from retail.variantes where id = :'oficial'),
  (select costo from retail.variantes where id = pg_temp.variante('${EMMA}', 'NEG', 'XL')),
  (select count(*) from retail.variantes where producto_id = '${EMMA}' and activo and costo = 41);`),
    "99.00|32.00|32.00|0"
  )
);

caso("17 · sin permiso de dinero, el costo elegido se ignora (el precio sí se aplica)", () =>
  espera(
    correr(`${COMO_POSTGRES}
update retail.roles set limitado_como_hoy = false where clave = 'integrante';
delete from retail.rol_modulos where rol_id = retail.fn_rol_por_clave('integrante');
insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), 'productos');
select pg_temp.duplicado('ZZ Emma sin dinero', '[{"color":"NEG","talla":"XL","stock":1,"costo":41}]') as d \\gset
${sesion(MICAELA)}
select retail.fusionar_productos('${EMMA}', array[:'d']::uuid[], jsonb_build_object('precio', 88, 'costo_de', '${EMMA}')) is not null as hecho \\gset
${COMO_POSTGRES}
select 'x',
  (select count(*) from retail.variantes where producto_id = '${EMMA}' and activo and costo = 41),
  (select string_agg(distinct precio::text, ',') from retail.variantes where producto_id = '${EMMA}' and activo),
  (select fusionada_por = (select id from public.personas where auth_user_id = '${MICAELA}') from retail.producto_fusiones where producto_fusionado_id = :'d');`),
    "1|88.00|t"
  )
);

caso("18 · lo que frena en la previsualización también frena al fusionar, con su frase, y no deja nada a medias", () =>
  espera(
    correr(`${COMO_POSTGRES}
select pg_temp.duplicado('ZZ Emma apartada', '[{"color":"NEG","talla":"M","stock":3}]') as d \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  select pg_temp.variante(:'d', 'NEG', 'M'), '${TRUJILLO}', id, 'apartado', 1, 'apartado'
    from retail.sububicaciones where ubicacion_id = '${TRUJILLO}' and tipo = 'piso_venta' returning id as m \\gset
select retail.fn_aplicar_movimiento(:'m');
${sesion(FELIPE)}
select 'x', split_part(pg_temp.intento(format('select retail.fusionar_productos(%L, array[%L]::uuid[])', '${EMMA}', :'d')), '|', 2),
  (select fusionado_en_id is null from retail.productos where id = :'d');`),
    "fusion_junta_apartada|t"
  )
);

caso("19 · la versión que vio la pantalla manda (PT409); y un duplicado ya fusionado no se fusiona dos veces", () =>
  espera(
    correr(`${COMO_POSTGRES}
select pg_temp.duplicado('ZZ Emma version', '[{"color":"NEG","talla":"XL","stock":1}]') as d \\gset
select version as v from retail.productos where id = '${EMMA}' \\gset
${sesion(FELIPE)}
select 'x',
  split_part(pg_temp.intento(format('select retail.fusionar_productos(%L, array[%L]::uuid[], %L, %L)', '${EMMA}', :'d', '{}',
             jsonb_build_object('${EMMA}', :'v'::int - 1))), '|', 1),
  pg_temp.intento(format('select retail.fusionar_productos(%L, array[%L]::uuid[], %L, %L)', '${EMMA}', :'d', '{}',
             jsonb_build_object('${EMMA}', :'v'::int))),
  split_part(pg_temp.intento(format('select retail.fusionar_productos(%L, array[%L]::uuid[])', '${VALENTINA}', :'d')), '|', 2);`),
    "PT409|SIN_ERROR|fusion_ya_fusionado"
  )
);

caso("20 · sin permiso: una integrante sin Productos no fusiona (42501) y no queda nada escrito", () =>
  espera(
    correr(`${COMO_POSTGRES}
update retail.roles set limitado_como_hoy = false where clave = 'integrante';
delete from retail.rol_modulos where rol_id = retail.fn_rol_por_clave('integrante');
insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), 'existencias');
${sesion(MICAELA)}
select split_part(pg_temp.intento($q$select retail.fusionar_productos('${VALENTINA}', array['${EMMA}']::uuid[])$q$), '|', 1) as error,
  has_function_privilege('anon', 'retail.fusionar_productos(uuid, uuid[], jsonb, jsonb)', 'execute') as anon,
  has_function_privilege('authenticated', 'retail.fn_fusion_pasar_unidades(uuid, uuid, uuid, uuid, integer, uuid, uuid)', 'execute') as pasar \\gset
${COMO_POSTGRES}
select 'x', :'error', :'anon', :'pasar', (select count(*) from retail.producto_fusiones),
  (select fusionado_en_id is null from retail.productos where id = '${EMMA}');`),
    "42501|f|f|0|t"
  )
);

caso("22 · después de fusionar, la alerta de «ya existe uno parecido» no ofrece la ficha fusionada (sí la que quedó)", () =>
  espera(
    correr(`${sesion(FELIPE)}
select retail.fusionar_productos('${VALENTINA}', array['${EMMA}']::uuid[]) is not null as hecho \\gset
select 'x',
  (select count(*) from retail.buscar_productos_parecidos('Blusa Emma') b where b.id = '${EMMA}'),
  (select count(*) from retail.buscar_productos_parecidos('Blusa Valentina') b where b.id = '${VALENTINA}');`),
    "0|1"
  )
);

caso("24 · posibles repetidas: sugiere «una letra» en la misma marca y no confunde el mismo nombre en otra categoría; lo fusionado sale de la lista", () => {
  const r = correr(`${COMO_POSTGRES}
select pg_temp.duplicado('Blusa Ema', '[]') as d \\gset
select pg_temp.duplicado('Vestido Emma', '[]') as v \\gset
update retail.productos set categoria_id = (select id from retail.categorias where nombre = 'Vestidos') where id = :'v';
${sesion(FELIPE)}
select 'x',
  (select string_agg(referencia_a || '/' || referencia_b || ':' || motivo, ',') from retail.fn_productos_posibles_duplicados()
    where :'d' in (producto_a::text, producto_b::text)),
  (select count(*) from retail.fn_productos_posibles_duplicados() where :'v' in (producto_a::text, producto_b::text));
select retail.fusionar_productos('${EMMA}', array[:'d']::uuid[]) is not null as hecho \\gset
select 'x', (select count(*) from retail.fn_productos_posibles_duplicados() where :'d' in (producto_a::text, producto_b::text)),
  has_function_privilege('anon', 'retail.fn_productos_posibles_duplicados(integer)', 'execute');`);
  if (!r.ok) return r.mensaje.split("\n").slice(0, 4).join("\n");
  const obtenido = r.salida.split("\n").filter((l) => l.startsWith("x|")).map((l) => l.split("|").slice(1).join("/")).join(" · ");
  return obtenido === "Blusa Emma/Blusa Ema:una_letra/0 · 0/f" ? null : `obtuve «${obtenido}»`;
});

// ---------------------------------------------------------------------------------------------- deriva

// Toda tabla con una llave a productos o a variantes tiene que estar clasificada: qué le pasa al fusionar. Si nace una
// tabla nueva y nadie decidió, esta prueba falla con su nombre: suma su trato en `fusionar_productos` (20261112210000) y aquí.
const A_PRODUCTOS = {
  // Se mudan con su variante o las maneja la fusión directamente.
  "variantes.producto_id": "las variantes se mudan o se juntan",
  "producto_fotos.producto_id": "las elegidas pasan; las demás se guardan en el duplicado",
  // En curso u operación viva: se repuntan.
  "compra_items.producto_id": "se repunta",
  "producciones.producto_id": "se repunta",
  "pedidos_no_atendidos.producto_id": "se repunta",
  "despacho_salidas.producto_id": "se repunta",
  "producto_consumo_medido.producto_id": "se repunta",
  "precio_propuestas.producto_id": "se repunta",
  "orden_compra_items.producto_id": "se repunta salvo la que ya llegó",
  "favoritos_web.producto_id": "se repunta si el que queda no lo tiene",
  "vitrina_look_piezas.producto_id": "se repunta si el look no lo tiene",
  "look_web_piezas.producto_id": "se repunta si el look no lo tiene",
  // Uno por producto: pasa solo si el que queda no tiene.
  "producto_origen.producto_id": "uno por producto",
  "vitrina_productos.producto_id": "uno por producto",
  "producto_consumos.producto_id": "uno por producto",
  "producto_taller.producto_id": "uno por producto",
  "producto_color_temporadas.producto_id": "uno por producto y color",
  "producto_procesos.producto_id": "uno por producto y proceso",
  "producto_avios.producto_id": "uno por producto, insumo y color",
  // Se escribe una sola vez: queda en el duplicado, que apunta al que quedó.
  "frescura_decisiones.producto_id": "inmutable",
  "trafico_web.producto_id": "inmutable",
  "costo_correcciones.producto_id": "inmutable",
  "pedidos_campana_lineas.producto_id": "inmutable",
  "precios_sede_prenda.producto_id": "inmutable",
  "despacho_pendientes.producto_id": "inmutable; uno pendiente frena",
  // La propia fusión.
  "productos.fusionado_en_id": "la marca de la fusión",
  "producto_fusiones.producto_queda_id": "el rastro",
  "producto_fusiones.producto_fusionado_id": "el rastro",
};
// A una variante: la que se MUDA conserva su id, así que todo la sigue. Solo importa la que se JUNTA.
const A_VARIANTES = {
  "codigos_barras.variante_id": "pasa a la que queda (las etiquetas siguen sonando)",
  "variante_etiquetas.variante_id": "la que queda suma las de la juntada",
  "esperas_web.variante_id": "pasa a la que queda si no esperaba ya esa",
  "variantes.fusionada_en_id": "la marca de la juntada",
  // Lo que frena si toca a una que se junta (apartado, en camino, pedido web, producción, conteo, cuarentena).
  "stock.variante_id": "sus unidades pasan con movimientos",
  "stock_dueno.variante_id": "cada dueño con lo suyo",
  "transferencia_items.variante_id": "en camino frena",
  "pedido_web_lineas.variante_id": "sin entregar frena",
  "produccion_lineas.variante_id": "producción abierta frena",
  "conteo_items.variante_id": "conteo abierto frena",
  "prendas_danadas.variante_id": "en cuarentena frena",
  "apartados.variante_id": "apartada frena (stock.cantidad_apartada)",
  "separacion_items.variante_id": "apartada frena (stock.cantidad_apartada)",
  // Historia: se queda en la juntada, que vive en el producto que queda (sus ventas cuentan en él).
  ...Object.fromEntries(
    [
      "movimientos.variante_id", "venta_items.variante_id", "cambios.variante_nueva_id", "compra_items.variante_id", "costo_historial.variante_id",
      "transferencia_recepciones.variante_id", "prendas_por_regularizar.variante_id", "bajada_piso_items.variante_id",
      "separacion_items_retirados.variante_id", "separacion_pedidos.variante_id", "prendas_para_enviar.variante_id",
      "cuadre_piso_items.variante_id", "pedidos_no_atendidos.variante_id", "precios_sede.variante_id", "despacho_recibidos.variante_id",
      "produccion_salida_lineas.variante_id", "produccion_vuelta_lineas.variante_id", "produccion_avances.variante_id",
      "traslado_sobrantes.variante_id", "produccion_fallas.variante_id", "cambio_salidas.variante_id", "trafico_web.variante_id",
      "costo_correcciones.variante_id", "precios_sede_variante.variante_id", "variantes_nacidas_al_recibir.variante_id",
      "prendas_danadas.corregida_de_variante_id",
    ].map((k) => [k, "historia"])
  ),
};

caso("21 · DERIVA: toda llave a productos y a variantes tiene su trato al fusionar", () => {
  const r = correr(`select 'x', c.confrelid::regclass::text, replace(c.conrelid::regclass::text, 'retail.', '') || '.' || a.attname
  from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
 where c.contype = 'f' and c.confrelid in ('retail.productos'::regclass, 'retail.variantes'::regclass);`);
  if (!r.ok) return r.mensaje;
  const sin = [];
  for (const l of r.salida.split("\n").filter((x) => x.startsWith("x|"))) {
    const [, destino, llave] = l.split("|");
    const lista = destino === "retail.productos" ? A_PRODUCTOS : A_VARIANTES;
    if (!lista[llave]) sin.push(`${llave} → ${destino}`);
  }
  return sin.length ? `Sin trato al fusionar:\n${sin.join("\n")}` : null;
});

caso("23 · ningún UPDATE ni DELETE sin WHERE en las funciones de la fusión (la API carga `safeupdate` y lo rechaza; psql no)", () => {
  const sin = [];
  for (const archivo of ["20261112205000_fusionar_productos_previsualizar.sql", "20261112210000_fusionar_productos.sql"]) {
    const sql = readFileSync(new URL(`../../supabase/migrations/${archivo}`, import.meta.url), "utf8").replace(/--[^\n]*/g, "");
    for (const m of sql.matchAll(/\b(update|delete from)\s+(retail|pg_temp)\.[\s\S]*?;/gi)) {
      if (!/\bwhere\b/i.test(m[0])) sin.push(`${archivo}: ${m[0].replace(/\s+/g, " ").slice(0, 90)}`);
    }
  }
  return sin.length ? sin.join("\n") : null;
});

// ---------------------------------------------------------------------------------------------- correr

let fallas = 0;
for (const { nombre, fn } of casos) {
  let error;
  try {
    error = fn();
  } catch (e) {
    error = String(e?.stack ?? e);
  }
  if (error) {
    fallas++;
    console.log(`✗ ${nombre}\n  ${String(error).replace(/\n/g, "\n  ")}`);
  } else {
    console.log(`✓ ${nombre}`);
  }
}
console.log(`\n${casos.length - fallas}/${casos.length} casos en verde.`);
process.exit(fallas ? 1 : 0);
