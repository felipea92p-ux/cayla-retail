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

const CONTENEDOR_LOCAL = process.env.RETAIL_CONTENEDOR_PG ?? "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (y Admin en el seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante
const EMMA = "78a48ab9-2fae-4d52-96e9-d06d821d9fbe"; // Blusa Emma: NEG y BEI en S, M, L
const VALENTINA = "7b6c682a-f535-423c-8776-345abd87f33f"; // Blusa Valentina: BLA y ROS en S, M, L
const CENTINELA = "11111111-1111-4111-8111-111111111111";
const TRUJILLO = "61412823-3060-4440-8ce6-467a16f0539e";

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
  v_piso := (select id from retail.sububicaciones where ubicacion_id = '${TRUJILLO}' and tipo = 'piso_venta');
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
      insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
        values (v_v, '${TRUJILLO}', v_piso, 'entrada', (l->>'stock')::integer, 'recepcion') returning id into v_m;
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
