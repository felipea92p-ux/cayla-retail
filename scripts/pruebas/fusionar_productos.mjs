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

// Una oferta en borrador (no rige: no hay choques que resolver) con sus tallas sueltas y, si se pide, modelos enteros.
const OFERTA_SUELTA = (v, nombre, variantes, productos = "'{}'::uuid[]") =>
  `select retail.guardar_oferta_completa(null, :'camp', '${nombre}', '{"tipo":"pct","porcentaje":20}'::jsonb || jsonb_build_object('variantes', jsonb_build_array(${variantes})),
     retail.fn_hoy_lima(), retail.fn_hoy_lima() + 3, null, '{}'::uuid[], '{}'::uuid[], false, '{}'::uuid[], ${productos}, '{}'::uuid[], false) as ${v} \\gset\n`;
const SUELTAS_DE = (v) => `(select count(*) from retail.campana_regla_variantes where regla_id = :'${v}')`;
const TIENE = (v, cual) => `exists (select 1 from retail.campana_regla_variantes where regla_id = :'${v}' and variante_id = :'${cual}')`;

caso("45 · una oferta por tallas sueltas sigue a la talla que queda: la juntada pasa a la que la absorbe, la que se muda sigue igual y, si la oferta tiene entero el modelo que queda, sus tallas sueltas sobran (ADR-0682)", () => {
  if (correr("select to_regclass('retail.campana_regla_variantes') is null or position('campana_regla_variantes' in pg_get_functiondef('retail.fusionar_productos(uuid, uuid[], jsonb, jsonb)'::regprocedure)) = 0;").salida.trim().endsWith("t")) {
    return "la base local no tiene las ofertas por variante (20261118232000) o su paso en la fusión (20261119010000)";
  }
  return espera(
    correr(`${COMO_POSTGRES}
select pg_temp.duplicado('ZZ Emma bis', '[{"color":"NEG","talla":"M","stock":1},{"color":"NEG","talla":"XL","stock":1}]') as d \\gset
select pg_temp.duplicado('ZZ Emma tris', '[{"color":"NEG","talla":"M","stock":1}]') as d2 \\gset
select pg_temp.variante(:'d', 'NEG', 'M') as j, pg_temp.variante(:'d', 'NEG', 'XL') as x, pg_temp.variante(:'d2', 'NEG', 'M') as j2, pg_temp.variante('${EMMA}', 'NEG', 'M') as w \\gset
${sesion(FELIPE)}
insert into retail.etiquetas (nombre, estilo) values ('ZZ Campaña fusión (prueba)', 'campana') returning id as camp \\gset
select retail.actualizar_campana_etiqueta(:'camp', null, retail.fn_hoy_lima() - 1, retail.fn_hoy_lima() + 10, '{}'::uuid[]);
${OFERTA_SUELTA("r1", "ZZ dos juntadas y una que se muda", ":'j', :'j2', :'x'")}${OFERTA_SUELTA("r2", "ZZ el modelo entero y una suelta", ":'j'", `array['${EMMA}']::uuid[]`)}${OFERTA_SUELTA("r3", "ZZ la juntada y la que queda", ":'j', :'w'")}select retail.fusionar_productos('${EMMA}', array[:'d', :'d2']::uuid[]) as r \\gset
${COMO_POSTGRES}
select 'x', (:'r'::jsonb) ->> 'juntadas',
  ${SUELTAS_DE("r1")}, ${TIENE("r1", "w")}, ${TIENE("r1", "x")}, ${TIENE("r1", "j")} or ${TIENE("r1", "j2")},
  ${SUELTAS_DE("r2")}, exists (select 1 from retail.campana_regla_productos where regla_id = :'r2' and producto_id = '${EMMA}'),
  ${SUELTAS_DE("r3")}, ${TIENE("r3", "w")};`),
    "2|2|t|t|f|0|t|1|t"
  );
});

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
  -- El orden del par sale de los ids (al azar en cada base): se nombra siempre en orden alfabético.
  (select string_agg(least(referencia_a, referencia_b) || '/' || greatest(referencia_a, referencia_b) || ':' || motivo, ',') from retail.fn_productos_posibles_duplicados()
    where :'d' in (producto_a::text, producto_b::text)),
  (select count(*) from retail.fn_productos_posibles_duplicados() where :'v' in (producto_a::text, producto_b::text));
select retail.fusionar_productos('${EMMA}', array[:'d']::uuid[]) is not null as hecho \\gset
select 'x', (select count(*) from retail.fn_productos_posibles_duplicados() where :'d' in (producto_a::text, producto_b::text)),
  has_function_privilege('anon', 'retail.fn_productos_posibles_duplicados(integer)', 'execute');`);
  if (!r.ok) return r.mensaje.split("\n").slice(0, 4).join("\n");
  const obtenido = r.salida.split("\n").filter((l) => l.startsWith("x|")).map((l) => l.split("|").slice(1).join("/")).join(" · ");
  return obtenido === "Blusa Ema/Blusa Emma:una_letra/0 · 0/f" ? null : `obtuve «${obtenido}»`;
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
  "campana_regla_productos.producto_id": "se repunta si la oferta no lo tiene (ADR-0655)",
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
  "campana_regla_variantes.variante_id": "la oferta gana la que queda y suelta la juntada (ADR-0682)",
  "variantes.fusionada_en_id": "la marca de la juntada",
  // Lo que frena si toca a una que se junta (apartado, en camino, pedido web, producción, conteo, cuarentena).
  "stock.variante_id": "sus unidades pasan con movimientos",
  "stock_dueno.variante_id": "cada dueño con lo suyo",
  "transferencia_items.variante_id": "en camino frena",
  "pedido_web_lineas.variante_id": "sin entregar frena",
  "produccion_lineas.variante_id": "producción abierta frena",
  "conteo_items.variante_id": "conteo abierto frena",
  "prendas_danadas.variante_id": "en cuarentena frena",
  // ADR-0690 (20261122194500): lo escaneado de la juntada en un barrido ABIERTO frena (junta_barrido); lo de uno cerrado es historia.
  "barrido_piso_lecturas.variante_id": "barrido abierto frena; cerrado es historia",
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
      // ADR-0690: lo resuelto de un barrido confirmado (la prenda que era y la no cargada) se queda en la juntada.
      "barrido_piso_resueltos.variante_id", "barrido_piso_resueltos.pendiente_variante_id",
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
  for (const archivo of ["20261112205000_fusionar_productos_previsualizar.sql", "20261112210000_fusionar_productos.sql", "20261113175000_fusionar_productos_tallas_vacias.sql"]) {
    const sql = readFileSync(new URL(`../../supabase/migrations/${archivo}`, import.meta.url), "utf8").replace(/--[^\n]*/g, "");
    for (const m of sql.matchAll(/\b(update|delete from)\s+(retail|pg_temp)\.[\s\S]*?;/gi)) {
      if (!/\bwhere\b/i.test(m[0])) sin.push(`${archivo}: ${m[0].replace(/\s+/g, " ").slice(0, 90)}`);
    }
  }
  return sin.length ? sin.join("\n") : null;
});


// ---------------------------------------------------------------------------------------------- tallas vacías (20261113175000)

caso("25 · tallas vacías: el plan ofrece solo el color × talla sin prendas ni nada en curso, y dice si nunca tuvo prendas", () =>
  espera(
    correr(`${COMO_POSTGRES}
select pg_temp.duplicado('ZZ Emma vacia', '[{"color":"NEG","talla":"XS","stock":0},{"color":"NEG","talla":"M","stock":2}]') as d \\gset
${sesion(FELIPE)}
select 'x', p->>'ok',
       (select string_agg(e->>'talla' || ':' || (e->>'nunca_tuvo') || ':' || (e->>'retirada'), ',' order by e->>'talla')
          from jsonb_array_elements(p->'vacias') e where (e->>'producto_id')::uuid = :'d'),
       (select count(*) from jsonb_array_elements(p->'vacias') e where e->>'talla' = 'M' and e->>'color_codigo' = 'NEG')
  from (select retail.previsualizar_fusion_productos('${EMMA}', array[:'d']::uuid[]) p) t;`),
    "true|XS:true:false|0"
  )
);

caso("26 · sacar de la venta una talla vacía: se muda con su historia y queda apagada; el stock y las ventas no cambian", () =>
  espera(
    correr(`${COMO_POSTGRES}
select pg_temp.duplicado('ZZ Emma vacia', '[{"color":"NEG","talla":"XS","stock":0},{"color":"NEG","talla":"XL","stock":2}]') as d \\gset
select pg_temp.variante(:'d', 'NEG', 'XS') as xs, pg_temp.variante(:'d', 'NEG', 'XL') as xl \\gset
select pg_temp.totales(array['${EMMA}', :'d']::uuid[]) as antes, pg_temp.descuadres(array['${EMMA}', :'d']::uuid[]) as desc_antes \\gset
${sesion(FELIPE)}
select (select v->>'activo' from jsonb_array_elements(p->'variantes') v where (v->>'variante_id')::uuid = :'xs') as en_plan
  from (select retail.previsualizar_fusion_productos('${EMMA}', array[:'d']::uuid[], jsonb_build_object('retirar', jsonb_build_array(:'xs'))) p) t \\gset
select retail.fusionar_productos('${EMMA}', array[:'d']::uuid[], jsonb_build_object('retirar', jsonb_build_array(:'xs'))) is not null as hecho \\gset
${COMO_POSTGRES}
select 'x', :'en_plan', :'hecho',
  (select producto_id = '${EMMA}' and not activo from retail.variantes where id = :'xs'),
  (select producto_id = '${EMMA}' and activo from retail.variantes where id = :'xl'),
  pg_temp.totales(array['${EMMA}']::uuid[]) = :'antes',
  pg_temp.descuadres(array['${EMMA}', :'d']::uuid[]) = :'desc_antes';`),
    "false|t|t|t|t|t"
  )
);

caso("27 · una talla con prendas no se puede sacar: el plan frena con su frase y la fusión no escribe nada", () =>
  espera(
    correr(`${COMO_POSTGRES}
select pg_temp.duplicado('ZZ Emma llena', '[{"color":"NEG","talla":"XL","stock":2}]') as d \\gset
select pg_temp.variante(:'d', 'NEG', 'XL') as xl \\gset
${sesion(FELIPE)}
select pg_temp.bloqueos(retail.previsualizar_fusion_productos('${EMMA}', array[:'d']::uuid[], jsonb_build_object('retirar', jsonb_build_array(:'xl')))) as b \\gset
select split_part(pg_temp.intento(format('select retail.fusionar_productos(%L, array[%L]::uuid[], %L)', '${EMMA}', :'d',
         jsonb_build_object('retirar', jsonb_build_array(:'xl')))), '|', 2) as hint \\gset
${COMO_POSTGRES}
select 'x', :'b', :'hint', (select fusionado_en_id is null from retail.productos where id = :'d'),
  (select activo from retail.variantes where id = :'xl');`),
    "retirar_no_vacia|fusion_retirar_no_vacia|t|t"
  )
);

caso("28 · sacar una talla vacía que la categoría final no tiene destraba la fusión", () =>
  espera(
    correr(`${COMO_POSTGRES}
select t.valor as fuera from retail.tallas t
 where not exists (select 1 from retail.categoria_tallas ct where ct.talla_id = t.id
                    and ct.categoria_id = (select categoria_id from retail.productos where id = '${EMMA}'))
 order by t.valor limit 1 \\gset
select pg_temp.duplicado('ZZ Emma fuera', jsonb_build_array(jsonb_build_object('color', 'NEG', 'talla', :'fuera', 'stock', 0))) as d \\gset
select pg_temp.variante(:'d', 'NEG', :'fuera') as f \\gset
${sesion(FELIPE)}
select 'x',
  pg_temp.bloqueos(retail.previsualizar_fusion_productos('${EMMA}', array[:'d']::uuid[])),
  retail.previsualizar_fusion_productos('${EMMA}', array[:'d']::uuid[], jsonb_build_object('retirar', jsonb_build_array(:'f'))) ->> 'ok';`),
    "talla_fuera_de_categoria|true"
  )
);

// ---------------------------------------------------------------------------------------------- precios por sede (20261115153000)

const TERMINAL_FUSION = "7e5a1a00-0000-4000-8000-0000000000f2";
// Un duplicado de la Blusa Emma con NEG M (se junta) y NEG XL (se muda); se miran NEG M y NEG S de Emma y la XL que se muda.
const PREP_SEDE = `
select id as yo from public.personas where auth_user_id = '${FELIPE}' \\gset
select pg_temp.duplicado('ZZ Emma sede', '[{"color":"NEG","talla":"M","stock":2},{"color":"NEG","talla":"XL","stock":1}]') as d \\gset
select pg_temp.variante('${EMMA}','NEG','M') as em, pg_temp.variante('${EMMA}','NEG','S') as es, pg_temp.variante(:'d','NEG','XL') as dxl \\gset
`;
const precioDeLaPrenda = (producto, precio) =>
  `insert into retail.precios_sede_prenda (producto_id, ubicacion_id, precio, motivo, creado_por) values (${producto}, '${TRUJILLO}', ${precio}, 'prueba', :'yo');\n`;
// Trujillo en M, S y XL (S también: ¿sigue el general?), Lima en M (¿sigue el general?) y el modo que devolvió la fusión.
const PRECIOS_TRAS_FUSION = `
  retail.fn_precio_en_sede(:'em','${TRUJILLO}'), retail.fn_precio_en_sede(:'es','${TRUJILLO}'),
  retail.fn_precio_en_sede(:'es','${TRUJILLO}') = (select precio from retail.variantes where id = :'es'),
  retail.fn_precio_en_sede(:'dxl','${TRUJILLO}'),
  retail.fn_precio_en_sede(:'em','${LIMA}') = (select precio from retail.variantes where id = :'em'),
  jsonb_path_query_first(:'r'::jsonb, 'strict $.**.precios_sede') ->> 'modo'`;

caso("29 · precios por sede, de fábrica: el precio propio de la repetida en Trujillo pasa a TODA la prenda allí (también a la S, que cobraba el general; 20261116020000); Lima sigue el general", () =>
  espera(
    correr(`${COMO_POSTGRES}${PREP_SEDE}${precioDeLaPrenda(":'d'", 169)}
${sesion(FELIPE)}
select retail.previsualizar_fusion_productos('${EMMA}', array[:'d']::uuid[]) as pv \\gset
select retail.fusionar_productos('${EMMA}', array[:'d']::uuid[]) as r \\gset
${COMO_POSTGRES}
select 'x', (:'pv'::jsonb -> 'precios_sede' -> 0 ->> 'conflicto'), (:'pv'::jsonb -> 'precios_sede' -> 0 ->> 'por_defecto') = :'d',
  ${PRECIOS_TRAS_FUSION};`),
    "false|t|169.00|169.00|f|169.00|t|por_sede"
  )
);

caso("30 · conflicto (la que queda a S/ 150, la repetida a S/ 169), sin elegir: TODA la prenda cobra 150 en Trujillo, también la talla que se muda", () =>
  espera(
    correr(`${COMO_POSTGRES}${PREP_SEDE}${precioDeLaPrenda(`'${EMMA}'`, 150)}${precioDeLaPrenda(":'d'", 169)}
${sesion(FELIPE)}
select retail.previsualizar_fusion_productos('${EMMA}', array[:'d']::uuid[]) as pv \\gset
select retail.fusionar_productos('${EMMA}', array[:'d']::uuid[]) as r \\gset
${COMO_POSTGRES}
select 'x', (:'pv'::jsonb -> 'precios_sede' -> 0 ->> 'conflicto'), (:'pv'::jsonb -> 'precios_sede' -> 0 ->> 'por_defecto') = '${EMMA}',
  ${PRECIOS_TRAS_FUSION};`),
    "true|t|150.00|150.00|f|150.00|t|por_sede"
  )
);

caso("31 · conflicto eligiendo la repetida para Trujillo: TODA la prenda cobra 169 allí (también las tallas que solo tenía la que queda)", () =>
  espera(
    correr(`${COMO_POSTGRES}${PREP_SEDE}${precioDeLaPrenda(`'${EMMA}'`, 150)}${precioDeLaPrenda(":'d'", 169)}
${sesion(FELIPE)}
select retail.fusionar_productos('${EMMA}', array[:'d']::uuid[], jsonb_build_object('precios_sede', jsonb_build_object('${TRUJILLO}', :'d'))) as r \\gset
${COMO_POSTGRES}
select 'x', ${PRECIOS_TRAS_FUSION},
  (select count(distinct retail.fn_precio_en_sede(v.id, '${TRUJILLO}')) from retail.variantes v where v.producto_id = '${EMMA}' and v.activo);`),
    "169.00|169.00|f|169.00|t|por_sede|1"
  )
);

caso("32 · elegir una ficha que no tenía precio propio en esa sede no vale: gana la de por defecto", () =>
  espera(
    correr(`${COMO_POSTGRES}${PREP_SEDE}${precioDeLaPrenda(`'${EMMA}'`, 150)}${precioDeLaPrenda(":'d'", 169)}
${sesion(FELIPE)}
select retail.fusionar_productos('${EMMA}', array[:'d']::uuid[], jsonb_build_object('precios_sede', jsonb_build_object('${TRUJILLO}', '${VALENTINA}'))) as r \\gset
${COMO_POSTGRES}
select 'x', ${PRECIOS_TRAS_FUSION};`),
    "150.00|150.00|f|150.00|t|por_sede"
  )
);

caso("33 · «un solo precio»: todo cobra el general y los precios de sede se archivan (ninguno se borra)", () =>
  espera(
    correr(`${COMO_POSTGRES}${PREP_SEDE}${precioDeLaPrenda(`'${EMMA}'`, 150)}${precioDeLaPrenda(":'d'", 169)}
select count(*) as filas_antes from retail.precios_sede_prenda \\gset
${sesion(FELIPE)}
select retail.fusionar_productos('${EMMA}', array[:'d']::uuid[], '{"precio_modo":"uno"}') as r \\gset
${COMO_POSTGRES}
select 'x', ${PRECIOS_TRAS_FUSION},
  (select count(*) from retail.precios_sede_prenda) = :filas_antes,
  (select count(*) from retail.precios_sede_prenda where producto_id = '${EMMA}' and archivado_en is null);`),
    "79.90|79.90|t|79.90|t|uno|t|0"
  )
);

caso("34 · un modo de precio inválido frena con su hint y no deja nada a medias", () =>
  espera(
    correr(`${COMO_POSTGRES}${PREP_SEDE}
${sesion(FELIPE)}
select 'x', split_part(pg_temp.intento($$select retail.fusionar_productos('${EMMA}', array['$$ || :'d' || $$']::uuid[], '{"precio_modo":"raro"}')$$), '|', 2),
  (select estado from retail.productos where id = :'d');`),
    "precio_modo|activo"
  )
);

const TERMINAL_EN_TRUJILLO = `insert into auth.users (id, aud, role, email) values ('${TERMINAL_FUSION}', 'authenticated', 'authenticated', 'terminal-fusion@prueba.local');
select id as respaldo from public.personas where auth_user_id = '${MICAELA}' \\gset
insert into retail.terminales (ubicacion_id, nombre, rol_id, auth_user_id, firma_respaldo_id)
  values ('${TRUJILLO}', 'ZZ Terminal fusión', retail.fn_rol_por_clave('terminal_administrativa'), '${TERMINAL_FUSION}', :'respaldo');`;

caso("35 · una terminal fusiona aunque cambie el precio general (de fábrica y con «uno»); fuera de la fusión su candado sigue", () => {
  const fusiona = (elecciones) =>
    espera(
      correr(`${COMO_POSTGRES}${PREP_SEDE}${precioDeLaPrenda(":'d'", 169)}
update retail.variantes set precio = 99 where producto_id = :'d';
${TERMINAL_EN_TRUJILLO}
${sesion(TERMINAL_FUSION)}
select 'x', retail.fn_es_terminal()::text, pg_temp.intento($$select retail.fusionar_productos('${EMMA}', array['$$ || :'d' || $$']::uuid[], '${elecciones}')$$);`),
      "true|SIN_ERROR"
    );
  // Con `precio` el disparador del candado SÍ se dispara sobre las tallas de Emma (79.90 → 99): sin el parche (c) de 20261115153000, 42501.
  const e1 = fusiona("{}") ?? fusiona('{"precio_modo":"uno"}') ?? fusiona('{"precio":99}');
  if (e1) return e1;
  return espera(
    correr(`${COMO_POSTGRES}${PREP_SEDE}${TERMINAL_EN_TRUJILLO}
${sesion(TERMINAL_FUSION)}
select 'x', split_part(pg_temp.intento($$update retail.variantes set precio = precio + 1 where id = '$$ || :'em' || $$'$$), '|', 2);`),
    "terminal_precio_de_la_prenda"
  );
});

// ---------------------------------------------------------------------------------------------- un precio por sede (20261116020000)

// Cuántos precios distintos cobra la prenda final en una sede: tras fusionar, uno.
const PRECIOS_DISTINTOS_EN = (sede) =>
  `(select count(distinct retail.fn_precio_en_sede(v.id, '${sede}')) from retail.variantes v where v.producto_id = '${EMMA}' and v.activo and v.fusionada_en_id is null)`;
const excepcionDeTalla = (variante, precio) =>
  `insert into retail.precios_sede_variante (variante_id, ubicacion_id, precio, motivo, creado_por) values (${variante}, '${TRUJILLO}', ${precio}, 'prueba de talla', :'yo');\n`;

caso("36 · la que queda solo tenía una EXCEPCIÓN de talla (M a S/ 150), la repetida precio de prenda 169 en Trujillo: la hoja dice «conserva 169» sin conflicto; toda la prenda pasa a 169 y la M conserva su 150", () =>
  espera(
    correr(`${COMO_POSTGRES}${PREP_SEDE}${excepcionDeTalla(":'em'", 150)}${precioDeLaPrenda(":'d'", 169)}
${sesion(FELIPE)}
select retail.previsualizar_fusion_productos('${EMMA}', array[:'d']::uuid[]) as pv \\gset
select retail.fusionar_productos('${EMMA}', array[:'d']::uuid[]) as r \\gset
${COMO_POSTGRES}
select 'x', (:'pv'::jsonb -> 'precios_sede' -> 0 ->> 'conflicto'), (:'pv'::jsonb -> 'precios_sede' -> 0 ->> 'por_defecto') = :'d',
  ${PRECIOS_TRAS_FUSION}, ${PRECIOS_DISTINTOS_EN(TRUJILLO)};`),
    "false|t|150.00|169.00|f|169.00|t|por_sede|2"
  )
);

caso("37 · la lista de sedes mira el precio general ELEGIDO: eligiendo S/ 99 con la repetida a 79.90 en Trujillo, Trujillo sale en la hoja y toda la prenda cobra 79.90 allí; Lima, 99", () =>
  espera(
    correr(`${COMO_POSTGRES}${PREP_SEDE}${precioDeLaPrenda(":'d'", 79.90)}
update retail.variantes set precio = 99 where producto_id = :'d';
${sesion(FELIPE)}
select retail.previsualizar_fusion_productos('${EMMA}', array[:'d']::uuid[]) as pv0 \\gset
select retail.previsualizar_fusion_productos('${EMMA}', array[:'d']::uuid[], '{"precio":99}') as pv \\gset
select retail.fusionar_productos('${EMMA}', array[:'d']::uuid[], '{"precio":99}') as r \\gset
${COMO_POSTGRES}
select 'x', coalesce(jsonb_array_length(:'pv0'::jsonb -> 'precios_sede'), 0), jsonb_array_length(:'pv'::jsonb -> 'precios_sede'),
  retail.fn_precio_en_sede(:'em','${TRUJILLO}'), retail.fn_precio_en_sede(:'es','${TRUJILLO}'), retail.fn_precio_en_sede(:'dxl','${TRUJILLO}'),
  retail.fn_precio_en_sede(:'em','${LIMA}'), ${PRECIOS_DISTINTOS_EN(TRUJILLO)};`),
    "0|1|79.90|79.90|79.90|99.00|1"
  )
);

caso("38 · la ficha ganadora conserva la excepción que ya tenía en UNA talla (M a S/ 155 sobre su 150 de Trujillo); lo demás cobra 150", () =>
  espera(
    correr(`${COMO_POSTGRES}${PREP_SEDE}${precioDeLaPrenda(`'${EMMA}'`, 150)}${excepcionDeTalla(":'em'", 155)}${precioDeLaPrenda(":'d'", 169)}
${sesion(FELIPE)}
select retail.fusionar_productos('${EMMA}', array[:'d']::uuid[]) as r \\gset
${COMO_POSTGRES}
select 'x', retail.fn_precio_en_sede(:'em','${TRUJILLO}'), retail.fn_precio_en_sede(:'es','${TRUJILLO}'), retail.fn_precio_en_sede(:'dxl','${TRUJILLO}');`),
    "155.00|150.00|150.00"
  )
);

caso("39 · sin precios propios en ninguna sede la fusión no escribe ningún precio de sede", () =>
  espera(
    correr(`${COMO_POSTGRES}${PREP_SEDE}
select count(*) as antes from retail.precios_sede_variante \\gset
${sesion(FELIPE)}
select retail.fusionar_productos('${EMMA}', array[:'d']::uuid[]) as r \\gset
${COMO_POSTGRES}
select 'x', jsonb_path_query_first(:'r'::jsonb, 'strict $.**.precios_sede') ->> 'fijados', (select count(*) from retail.precios_sede_variante) = :antes;`),
    "0|t"
  )
);

caso("40 · una excepción de talla IGUAL al precio general («esta talla no sube») también se conserva: no se archiva", () =>
  espera(
    correr(`${COMO_POSTGRES}${PREP_SEDE}${precioDeLaPrenda(`'${EMMA}'`, 150)}${excepcionDeTalla(":'es'", 79.90)}${precioDeLaPrenda(":'d'", 169)}
${sesion(FELIPE)}
select retail.fusionar_productos('${EMMA}', array[:'d']::uuid[]) as r \\gset
${COMO_POSTGRES}
select 'x', retail.fn_precio_en_sede(:'es','${TRUJILLO}'), retail.fn_precio_en_sede(:'em','${TRUJILLO}'), retail.fn_precio_en_sede(:'dxl','${TRUJILLO}'),
  (select count(*) from retail.precios_sede_variante where variante_id = :'es' and archivado_en is not null);`),
    "79.90|150.00|150.00|0"
  )
);

caso("41 · una talla APAGADA de la que queda con una excepción vieja (XL a S/ 120 en Lima) que la fusión vuelve a poner a la venta no trae ese precio: cobra lo de la prenda", () =>
  espera(
    correr(`${COMO_POSTGRES}${PREP_SEDE}
insert into retail.variantes (producto_id, color_codigo, talla_id, precio, costo, activo)
  values ('${EMMA}', 'NEG', (select id from retail.tallas where valor = 'XL'), 79.90, 32, false) returning id as qxl \\gset
insert into retail.precios_sede_variante (variante_id, ubicacion_id, precio, motivo, creado_por) values (:'qxl', '${LIMA}', 120, 'precio viejo', :'yo');
${sesion(FELIPE)}
select retail.fusionar_productos('${EMMA}', array[:'d']::uuid[]) as r \\gset
${COMO_POSTGRES}
select 'x', (select activo from retail.variantes where id = :'qxl'), retail.fn_precio_en_sede(:'qxl','${LIMA}'), ${PRECIOS_DISTINTOS_EN(LIMA)},
  (select count(*) from retail.precios_sede_variante where variante_id = :'qxl' and archivado_en is null);`),
    "t|79.90|1|0"
  )
);

caso("42 · eligiendo la repetida, el precio de la PRENDA de la que queda en Trujillo pasa a 169 (la ficha dice lo que se cobra) y una talla agregada después también cobra 169", () =>
  espera(
    correr(`${COMO_POSTGRES}${PREP_SEDE}${precioDeLaPrenda(`'${EMMA}'`, 150)}${precioDeLaPrenda(":'d'", 169)}
${sesion(FELIPE)}
select retail.fusionar_productos('${EMMA}', array[:'d']::uuid[], jsonb_build_object('precios_sede', jsonb_build_object('${TRUJILLO}', :'d'))) as r \\gset
${COMO_POSTGRES}
insert into retail.variantes (producto_id, color_codigo, talla_id, precio, costo)
  values ('${EMMA}', 'BEI', (select id from retail.tallas where valor = 'XL'), 79.90, 32) returning id as nueva \\gset
select 'x', (select precio from retail.precios_sede_prenda where producto_id = '${EMMA}' and ubicacion_id = '${TRUJILLO}' and archivado_en is null),
  retail.fn_precio_en_sede(:'nueva','${TRUJILLO}'), ${PRECIOS_DISTINTOS_EN(TRUJILLO)},
  (select count(*) from retail.precios_sede_prenda where producto_id = '${EMMA}' and ubicacion_id = '${TRUJILLO}' and archivado_en is not null);`),
    "169.00|169.00|1|1"
  )
);

caso("43 · la talla de OBSEQUIO (S/ 0 en una categoría que lo admite) sigue en 0 aunque la fusión fije el precio general, en toda tienda", () =>
  espera(
    correr(`${COMO_POSTGRES}${PREP_SEDE}${precioDeLaPrenda(":'d'", 169)}
update retail.familias set entra_a_motores = false
 where codigo = (select c.familia from retail.categorias c join retail.productos p on p.categoria_id = c.id where p.id = '${EMMA}');
update retail.variantes set precio = 0 where id = :'es';
${sesion(FELIPE)}
select retail.fusionar_productos('${EMMA}', array[:'d']::uuid[], '{"precio":79.90}') as r \\gset
${COMO_POSTGRES}
select 'x', retail.fn_categoria_admite_precio_cero((select categoria_id from retail.productos where id = '${EMMA}')),
  (select precio from retail.variantes where id = :'es'), retail.fn_precio_en_sede(:'es','${TRUJILLO}'), retail.fn_precio_en_sede(:'es','${LIMA}'),
  retail.fn_precio_en_sede(:'em','${TRUJILLO}');`),
    "t|0.00|0.00|0.00|169.00"
  )
);

caso("44 · si el precio de tienda que quedaría está bajo el costo de una talla, la fusión frena con su frase y no deja nada a medias", () =>
  espera(
    correr(`${COMO_POSTGRES}${PREP_SEDE}${precioDeLaPrenda(":'d'", 79.90)}
update retail.variantes set costo = 90, precio = 120 where producto_id = '${EMMA}' and activo;
${sesion(FELIPE)}
select split_part(pg_temp.intento($$select retail.fusionar_productos('${EMMA}', array['$$ || :'d' || $$']::uuid[], '{"precio":120}')$$), '|', 2) as hint \\gset
${COMO_POSTGRES}
select 'x', :'hint', (select estado from retail.productos where id = :'d'),
  (select count(*) from retail.precios_sede_prenda where producto_id = '${EMMA}' and archivado_en is null);`),
    "precio_sede_bajo_costo|activo|0"
  )
);

caso("45 · una excepción de talla que se conserva vuelve con su motivo y su autor, aunque cambie el precio de la prenda en esa tienda", () =>
  espera(
    correr(`${COMO_POSTGRES}${PREP_SEDE}${precioDeLaPrenda(`'${EMMA}'`, 150)}${precioDeLaPrenda(":'d'", 169)}
insert into retail.precios_sede_variante (variante_id, ubicacion_id, precio, motivo, creado_por, vigente_desde)
  values (:'es', '${TRUJILLO}', 120, 'la S se liquida en Trujillo', :'yo', '2026-09-01');
${sesion(FELIPE)}
select retail.fusionar_productos('${EMMA}', array[:'d']::uuid[], jsonb_build_object('precios_sede', jsonb_build_object('${TRUJILLO}', :'d'))) as r \\gset
${COMO_POSTGRES}
select 'x', retail.fn_precio_en_sede(:'es','${TRUJILLO}'), retail.fn_precio_en_sede(:'em','${TRUJILLO}'), pv.motivo, pv.creado_por = :'yo', pv.vigente_desde::date
  from retail.precios_sede_variante pv where pv.variante_id = :'es' and pv.ubicacion_id = '${TRUJILLO}' and pv.archivado_en is null;`),
    "120.00|169.00|la S se liquida en Trujillo|t|2026-09-01"
  )
);

caso("46 · una talla que se MUDA a una sede que la hoja no muestra tampoco queda bajo su costo (Emma a S/ 50 en Lima, la XL de la repetida cuesta 60): frena", () =>
  espera(
    correr(`${COMO_POSTGRES}${PREP_SEDE}
insert into retail.precios_sede_prenda (producto_id, ubicacion_id, precio, motivo, creado_por) values ('${EMMA}', '${LIMA}', 50, 'prueba', :'yo');
update retail.variantes set costo = 30 where producto_id = '${EMMA}' and activo;
update retail.variantes set costo = 60 where id = :'dxl';
${sesion(FELIPE)}
select split_part(pg_temp.intento($$select retail.fusionar_productos('${EMMA}', array['$$ || :'d' || $$']::uuid[])$$), '|', 2) as hint \\gset
${COMO_POSTGRES}
select 'x', :'hint', (select producto_id = :'d' from retail.variantes where id = :'dxl');`),
    "precio_sede_bajo_costo|t"
  )
);

caso("47 · el control mide lo que COBRA cada talla: la S conserva su excepción de 200 sobre su costo de 180 y la prenda pasa a 169; no frena", () =>
  espera(
    correr(`${COMO_POSTGRES}${PREP_SEDE}${precioDeLaPrenda(":'d'", 169)}${excepcionDeTalla(":'es'", 200)}
update retail.variantes set costo = 180 where id = :'es';
${sesion(FELIPE)}
select pg_temp.intento($$select retail.fusionar_productos('${EMMA}', array['$$ || :'d' || $$']::uuid[])$$) as res \\gset
${COMO_POSTGRES}
select 'x', :'res', retail.fn_precio_en_sede(:'es','${TRUJILLO}'), retail.fn_precio_en_sede(:'em','${TRUJILLO}');`),
    "SIN_ERROR|200.00|169.00"
  )
);

caso("48 · una excepción de talla que se JUNTA con una talla más cara no la deja bajo su costo (C liquida su M a 50; la M de A cuesta 70): frena", () =>
  espera(
    correr(`${COMO_POSTGRES}select id as yo from public.personas where auth_user_id = '${FELIPE}' \\gset
select pg_temp.duplicado('ZZ A', '[{"color":"NEG","talla":"M","precio":150,"costo":70,"stock":1}]') as a \\gset
select pg_temp.duplicado('ZZ B', '[{"color":"NEG","talla":"S","precio":150,"costo":32,"stock":1}]') as b \\gset
select pg_temp.duplicado('ZZ C', '[{"color":"NEG","talla":"M","precio":150,"costo":32,"stock":1}]') as c \\gset
select pg_temp.variante(:'c','NEG','M') as cm \\gset
insert into retail.precios_sede_variante (variante_id, ubicacion_id, precio, motivo, creado_por) values (:'cm', '${TRUJILLO}', 50, 'liquida', :'yo');
${sesion(FELIPE)}
select split_part(pg_temp.intento($$select retail.fusionar_productos('$$ || :'a' || $$', array['$$ || :'b' || $$','$$ || :'c' || $$']::uuid[])$$), '|', 2) as hint \\gset
${COMO_POSTGRES}
select 'x', :'hint', (select estado from retail.productos where id = :'c');`),
    "precio_sede_bajo_costo|activo"
  )
);

caso("49 · el control de costo mira el costo ELEGIDO: con el costo de la repetida (32), su precio de 100 en Trujillo pasa aunque la que queda costaba 120", () =>
  espera(
    correr(`${COMO_POSTGRES}select id as yo from public.personas where auth_user_id = '${FELIPE}' \\gset
select pg_temp.duplicado('ZZ A', '[{"color":"NEG","talla":"S","precio":150,"costo":120},{"color":"NEG","talla":"M","precio":150,"costo":120}]') as a \\gset
select pg_temp.duplicado('ZZ B', '[{"color":"NEG","talla":"M","precio":150,"costo":32},{"color":"NEG","talla":"XL","precio":150,"costo":32}]') as b \\gset
insert into retail.precios_sede_prenda (producto_id, ubicacion_id, precio, motivo, creado_por) values (:'b', '${TRUJILLO}', 100, 'prueba', :'yo');
${sesion(FELIPE)}
select pg_temp.intento($$select retail.fusionar_productos('$$ || :'a' || $$', array['$$ || :'b' || $$']::uuid[], '{"costo_de":"$$ || :'b' || $$"}')$$) as res \\gset
${COMO_POSTGRES}
select 'x', :'res', (select max(costo) from retail.variantes where producto_id = :'a' and activo),
  (select count(distinct retail.fn_precio_en_sede(v.id, '${TRUJILLO}')) from retail.variantes v where v.producto_id = :'a' and v.activo),
  (select min(retail.fn_precio_en_sede(v.id, '${TRUJILLO}')) from retail.variantes v where v.producto_id = :'a' and v.activo);`),
    "SIN_ERROR|32.00|1|100.00"
  )
);

// 50-54 · Lo que se ve es lo que se cobra (20261116203000): la huella de los precios por sede que vio la persona y el aviso de costo.
const VISTA_PREVIA_TRU = `${sesion(FELIPE)}
select retail.previsualizar_fusion_productos('${EMMA}', array[:'d']::uuid[], '{}'::jsonb) -> 'precios_sede' as vistos \\gset
${COMO_POSTGRES}`;

caso("50 · si alguien pone precio de tienda a una ficha DESPUÉS de la vista previa, la fusión frena (PT409) y no escribe nada", () =>
  espera(
    correr(`${COMO_POSTGRES}${PREP_SEDE}${precioDeLaPrenda(":'d'", 169)}${VISTA_PREVIA_TRU}
${precioDeLaPrenda(`'${EMMA}'`, 150)}${sesion(FELIPE)}
select pg_temp.intento($$select retail.fusionar_productos('${EMMA}', array['$$ || :'d' || $$']::uuid[], jsonb_build_object('precios_sede_vistos', '$$ || :'vistos' || $$'::jsonb))$$) as res \\gset
${COMO_POSTGRES}
select 'x', split_part(:'res', '|', 1), split_part(:'res', '|', 2), (select estado from retail.productos where id = :'d'),
  retail.fn_precio_en_sede(:'em', '${TRUJILLO}');`),
    "PT409|version_cambiada|activo|150.00"
  )
);

caso("51 · con la misma lista que vio la persona, la fusión sigue y cobra lo que la hoja mostró", () =>
  espera(
    correr(`${COMO_POSTGRES}${PREP_SEDE}${precioDeLaPrenda(":'d'", 169)}${VISTA_PREVIA_TRU}
${sesion(FELIPE)}
select pg_temp.intento($$select retail.fusionar_productos('${EMMA}', array['$$ || :'d' || $$']::uuid[], jsonb_build_object('precios_sede_vistos', '$$ || :'vistos' || $$'::jsonb))$$) as res \\gset
${COMO_POSTGRES}
select 'x', :'res', retail.fn_precio_en_sede(:'em', '${TRUJILLO}'), retail.fn_precio_en_sede(:'es', '${TRUJILLO}');`),
    "SIN_ERROR|169.00|169.00"
  )
);

caso("52 · una pantalla de antes (sin `precios_sede_vistos`) fusiona como siempre, aunque los precios hayan cambiado", () =>
  espera(
    correr(`${COMO_POSTGRES}${PREP_SEDE}${precioDeLaPrenda(":'d'", 169)}${precioDeLaPrenda(`'${EMMA}'`, 150)}${sesion(FELIPE)}
select pg_temp.intento($$select retail.fusionar_productos('${EMMA}', array['$$ || :'d' || $$']::uuid[])$$) as res \\gset
${COMO_POSTGRES}
select 'x', :'res', (select estado from retail.productos where id = :'d');`),
    "SIN_ERROR|descontinuado"
  )
);

caso("53 · la huella no frena por la forma: «169.0» contra «169.00», claves en otro orden y el aviso de costo no cuentan", () =>
  espera(
    correr(`${COMO_POSTGRES}${PREP_SEDE}${precioDeLaPrenda(":'d'", 169)}${VISTA_PREVIA_TRU}
select jsonb_agg(jsonb_set(s, '{productos}', (select jsonb_agg(p || jsonb_build_object('precio', ((p ->> 'precio')::numeric(12,1))::text::jsonb, 'bajo_costo', true))
                                                  from jsonb_array_elements(s -> 'productos') p))) as otra
  from jsonb_array_elements(:'vistos'::jsonb) s \\gset
${sesion(FELIPE)}
select pg_temp.intento($$select retail.fusionar_productos('${EMMA}', array['$$ || :'d' || $$']::uuid[], jsonb_build_object('precios_sede_vistos', '$$ || :'otra' || $$'::jsonb))$$) as res \\gset
${COMO_POSTGRES}
select 'x', :'res';`),
    "SIN_ERROR"
  )
);

caso("54 · la vista previa marca la ficha cuyo precio de tienda quedaría bajo el costo de una talla (y no la que no)", () =>
  espera(
    correr(`${COMO_POSTGRES}${PREP_SEDE}${precioDeLaPrenda(":'d'", 20)}
update retail.variantes set costo = 32 where producto_id = '${EMMA}' and activo;
${VISTA_PREVIA_TRU}
select 'x', (select string_agg(case when (p ->> 'id') = :'d' then 'repetida' else 'queda' end || '=' || (p ->> 'bajo_costo'), ',' order by p ->> 'queda')
               from jsonb_array_elements(:'vistos'::jsonb -> 0 -> 'productos') p);`),
    "repetida=true,queda=false"
  )
);

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
