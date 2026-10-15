#!/usr/bin/env node
/**
 * El Inicio de la tienda online: «Lo nuevo» y «Más vendidos», y los plazos de la ayuda (ADR-0408, actividad 5) contra el Postgres
 * local — CAYLA V2.
 *
 * QUÉ PRUEBA. `20261015013000_tienda_inicio_lo_nuevo_y_mas_vendidos.sql`, lo que `tienda_catalogo` suma a cada prenda:
 *   1. `nuevo`: entra si su PRIMER ingreso a una tienda (`fn_es_llegada`) fue hace 30 días o menos (fecha de Lima), con los días; no
 *      entra si llegó hace 31; reponer una prenda vieja no la hace nueva; lo que solo llegó al Taller no cuenta (hasta que pasa a una
 *      tienda); una devolución no es una llegada; fijada en la Vitrina entra (sin días si llegó hace más de 30); quitada no entra
 *      aunque haya llegado ayer; una familia fuera de los motores (bolsas, ADR-0377) no entra ni fijada.
 *   2. `vendidos`: el puesto por unidades vendidas en 30 días en toda la red, empate por nombre; lo vendido hace 31 días no cuenta;
 *      las familias fuera de los motores no entran; solo el puesto sale, nunca las unidades; solo 20 puestos.
 *   3. `tienda_ayuda`: las horas para confirmar y los días para recoger son los de Configuración ▸ Tienda web (y siguen al cambiarlos;
 *      sin su fila, null), y los días para cambiar, los de la caja (`fn_dias_plazo_cambio`, el número de la boleta).
 *   4. Permisos: las dos piezas nuevas no las llama nadie de afuera; el catálogo y la ayuda son solo de `tienda_web`.
 *   5. La migración se puede volver a correr.
 *
 * CÓMO. Cada escenario corre en su transacción con ROLLBACK, como Felipe (líder). Parte con la vitrina vacía y publica solo prendas de
 * prueba («ZZ …», recién creadas en la misma transacción) con llegadas y ventas a medida: así las del seed (que en el CI llegan y se
 * venden el mismo día) no cambian el resultado. Nunca se commitea nada en el Postgres local que comparten los worktrees.
 *
 * PROBAR ANTES DE APLICAR. `APLICAR_ANTES=supabase/migrations/20261015013000_tienda_inicio_lo_nuevo_y_mas_vendidos.sql` mete la
 * migración dentro de cada transacción (necesita 20261015012000 ya aplicada). Sin la variable, prueba lo que la base ya tiene.
 *
 * MUTANTES. `--mutantes` corre todo otra vez con versiones ROTAS a propósito de la migración (la última llegada, el Taller que cuenta,
 * el quitado que entra, las bolsas que entran, 31 días, las ventas de siempre, los plazos escritos a mano…) y exige que cada una haga
 * fallar algún escenario.
 *
 * DA POR SENTADO: el seed (Felipe líder; «Blusa Emma» con categoría, marca, proveedor y tallas; Tienda Trujillo, Tienda Lima y el Taller),
 * la Vitrina (20261014225000), la ficha y sus piezas (20261015012000) y `fn_categoria_entra_a_motores` (20261010231000).
 *
 * USO
 *   pnpm pruebas:tienda-inicio                    → necesita el stack local (`npx supabase start`)
 *   pnpm pruebas:tienda-inicio -- --mutantes
 *   pnpm pruebas:tienda-inicio -- --contenedor supabase_db_<mi-pila>
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const MIGRACION = "supabase/migrations/20261015013000_tienda_inicio_lo_nuevo_y_mas_vendidos.sql";
const CON_MUTANTES = process.argv.includes("--mutantes");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (y Admin)

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}

// No lanza: un escenario que DEBE fallar no es un error del script, es lo que se está probando.
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

// Las prendas de prueba: una letra cada una, con su nombre («ZZ Inicio A»…, que la base guarda como «Zz Inicio A»), una talla a S/ 50 y publicadas en la Vitrina.
const LETRAS = ["a", "b", "c", "d", "e", "f", "g", "h"];

function escenarios(aplicarAntes) {
  const lista = [];
  const valor = (nombre, sql, esperado) => lista.push({ nombre, sql, esperado });

  const PREPARAR = `
begin;
${aplicarAntes}
set local request.jwt.claim.sub = '${FELIPE}';
update retail.vitrina_productos set publicado = false where publicado;
select categoria_id as cat, marca_id as marca, proveedor_id as prov from retail.productos where referencia = 'Blusa Emma' \\gset
select talla_id as t1, color_codigo as c1 from retail.variantes where producto_id = (select id from retail.productos where referencia = 'Blusa Emma') order by sku limit 1 \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' order by nombre limit 1 \\gset
${LETRAS.map(
  (l) => `insert into retail.productos (referencia, categoria_id, marca_id, proveedor_id) values ('ZZ Inicio ${l.toUpperCase()}', :'cat', :'marca', :'prov') returning id as p_${l} \\gset
insert into retail.variantes (producto_id, sku, precio, talla_id, color_codigo) values (:'p_${l}', 'ZZ-INICIO-${l.toUpperCase()}', 50, :'t1', :'c1') returning id as v_${l} \\gset`,
).join("\n")}
select retail.vitrina_mostrar(array[${LETRAS.map((l) => `:'p_${l}'`).join(", ")}]::uuid[], true) \\gset
`;
  /** Una llegada (`carga_inicial`, una de las que cuenta `fn_es_llegada`) de la prenda `l` a `sede`, hace `dias` días. */
  const llego = (l, sede, dias, { tipo = "entrada", motivo = "carga_inicial" } = {}) =>
    `insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, created_at)
     values (:'v_${l}', :'${sede}', '${tipo}', 1, '${motivo}', now() - interval '${dias} days');\n`;
  /** `unidades` vendidas de la prenda `l` en Lima, hace `dias` días. */
  const vendio = (l, unidades, dias = 2) =>
    `insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, created_at)
     values (:'v_${l}', :'lim', 'salida', ${unidades}, 'venta', now() - interval '${dias} days');\n`;
  const enLoNuevo = (l, modo) => `update retail.vitrina_productos set en_lo_nuevo = '${modo}' where producto_id = :'p_${l}';\n`;
  /** Una familia fuera de los motores con su categoría, y la prenda `l` pasada a ella. */
  const comoBolsa = (l) => `insert into retail.familias (codigo, nombre, entra_a_motores) values ('zzempaque', 'ZZ Empaque', false);
     insert into retail.categorias (nombre, familia, prefijo) values ('ZZ Bolsas', 'zzempaque', 'ZZB') returning id as cat_bolsa \\gset
     update retail.productos set categoria_id = :'cat_bolsa' where id = :'p_${l}';\n`;
  /** Cada prenda de prueba con su dato: «A=5» (nueva hace 5 días), «B=nuevo» (nueva sin días), «C=·» (no está). */
  const NUEVO = `(select string_agg(upper(right(x ->> 'nombre', 1)) || '=' || coalesce(case when x -> 'nuevo' is null or x -> 'nuevo' = 'null'::jsonb then '·'
                    else coalesce(x -> 'nuevo' ->> 'dias', 'nuevo') end, '·'), ' ' order by x ->> 'nombre')
      from jsonb_array_elements(retail.tienda_catalogo() -> 'prendas') x where x ->> 'nombre' ilike 'zz inicio %')`;
  const PUESTOS = `(select string_agg(upper(right(x ->> 'nombre', 1)) || '=' || coalesce(x ->> 'vendidos', '·'), ' ' order by x ->> 'nombre')
      from jsonb_array_elements(retail.tienda_catalogo() -> 'prendas') x where x ->> 'nombre' ilike 'zz inicio %')`;

  // ---------------------------------------------------------------- 1. Lo nuevo
  valor(
    "sin ninguna llegada a una tienda, nada está en Lo nuevo",
    `${PREPARAR}select ${NUEVO};\nrollback;`,
    "A=· B=· C=· D=· E=· F=· G=· H=·",
  );
  valor(
    "llegó hace 5 días: nueva, con sus días; hace 30, nueva; hace 31, no; llegó hoy: 0",
    `${PREPARAR}${llego("a", "tru", 5)}${llego("b", "lim", 30)}${llego("c", "tru", 31)}${llego("d", "tru", 0)}select ${NUEVO};\nrollback;`,
    "A=5 B=30 C=· D=0 E=· F=· G=· H=·",
  );
  valor(
    "cuenta la PRIMERA llegada: una prenda de hace 40 días que se repuso hace 2 no es nueva; una que llegó hace 3 y otra vez hoy, sí (3)",
    `${PREPARAR}${llego("a", "tru", 40)}${llego("a", "lim", 2)}${llego("b", "tru", 3)}${llego("b", "tru", 0)}select ${NUEVO};\nrollback;`,
    "A=· B=3 C=· D=· E=· F=· G=· H=·",
  );
  valor(
    "el Taller no es una tienda: lo que llegó solo al Taller no es nuevo hasta que llega a una tienda",
    `${PREPARAR}${llego("a", "taller", 1)}select ${NUEVO};
      ${llego("a", "lim", 0)}select ${NUEVO};\nrollback;`,
    "A=· B=· C=· D=· E=· F=· G=· H=·\nA=0 B=· C=· D=· E=· F=· G=· H=·",
  );
  valor(
    "una devolución o un cambio que vuelve a la tienda no es una llegada",
    `${PREPARAR}${llego("a", "tru", 1, { motivo: "devolucion" })}${llego("b", "tru", 1, { motivo: "cambio" })}select ${NUEVO};\nrollback;`,
    "A=· B=· C=· D=· E=· F=· G=· H=·",
  );
  valor(
    "fijada en la Vitrina entra aunque haya llegado hace mucho (sin días) o nunca; quitada no entra aunque haya llegado ayer",
    `${PREPARAR}${llego("a", "tru", 60)}${enLoNuevo("a", "fijo")}${enLoNuevo("b", "fijo")}${llego("c", "tru", 1)}${enLoNuevo("c", "quitado")}${llego("d", "tru", 1)}
      select ${NUEVO};\nrollback;`,
    "A=nuevo B=nuevo C=· D=1 E=· F=· G=· H=·",
  );
  valor(
    "una familia fuera de los motores (bolsas) no entra a Lo nuevo, ni recién llegada ni fijada",
    `${PREPARAR}${comoBolsa("a")}${llego("a", "tru", 1)}update retail.productos set categoria_id = :'cat_bolsa' where id = :'p_b';
      ${enLoNuevo("b", "fijo")}${llego("c", "tru", 1)}
      select ${NUEVO};\nrollback;`,
    "A=· B=· C=1 D=· E=· F=· G=· H=·",
  );

  // ---------------------------------------------------------------- 2. Más vendidos
  valor(
    "sin ventas, nadie tiene puesto",
    `${PREPARAR}select ${PUESTOS};\nrollback;`,
    "A=· B=· C=· D=· E=· F=· G=· H=·",
  );
  valor(
    "el puesto por unidades vendidas en 30 días; empate, por nombre; lo de hace 31 días no cuenta",
    `${PREPARAR}${vendio("c", 9)}${vendio("a", 4)}${vendio("b", 4)}${vendio("d", 2, 29)}${vendio("e", 50, 31)}${vendio("f", 1)}${vendio("f", 1, 31)}
      select ${PUESTOS};\nrollback;`,
    "A=2 B=3 C=1 D=4 E=· F=5 G=· H=·",
  );
  valor(
    "las ventas de todas las tiendas suman (Lima y Trujillo)",
    `${PREPARAR}${vendio("a", 3)}${vendio("b", 2)}
      insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, created_at) values (:'v_b', :'tru', 'salida', 2, 'venta', now() - interval '1 day');
      select ${PUESTOS};\nrollback;`,
    "A=2 B=1 C=· D=· E=· F=· G=· H=·",
  );
  valor(
    "una familia fuera de los motores (bolsas) no entra a Más vendidos aunque se venda más que todo",
    `${PREPARAR}${comoBolsa("a")}${vendio("a", 99)}${vendio("b", 1)}select ${PUESTOS};\nrollback;`,
    "A=· B=1 C=· D=· E=· F=· G=· H=·",
  );
  valor(
    "solo 20 puestos: con 22 modelos vendidos, los dos que menos se vendieron no tienen puesto",
    `${PREPARAR}
      insert into retail.productos (referencia, categoria_id, marca_id, proveedor_id)
        select 'ZZ Ranking ' || lpad(n::text, 2, '0'), :'cat', :'marca', :'prov' from generate_series(1, 22) n;
      insert into retail.variantes (producto_id, sku, precio, talla_id, color_codigo)
        select p.id, 'ZZ-RANK-' || right(p.referencia, 2), 50, :'t1', :'c1' from retail.productos p where p.referencia ilike 'zz ranking %';
      select retail.vitrina_mostrar(array(select id from retail.productos where referencia ilike 'zz ranking %'), true) \\gset
      insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, created_at)
        select v.id, :'lim', 'salida', 30 - right(p.referencia, 2)::integer, 'venta', now() - interval '1 day'
          from retail.variantes v join retail.productos p on p.id = v.producto_id where p.referencia ilike 'zz ranking %';
      select concat_ws('|', count(*) filter (where x ->> 'vendidos' is not null), max((x ->> 'vendidos')::integer),
          string_agg(right(x ->> 'nombre', 2), ',' order by x ->> 'nombre') filter (where x ->> 'vendidos' is null))
        from jsonb_array_elements(retail.tienda_catalogo() -> 'prendas') x where x ->> 'nombre' ilike 'zz ranking %';
      rollback;`,
    "20|20|21,22",
  );
  valor(
    "solo sale el puesto (un número de 1 a 20), nunca cuántas se vendieron; nuevo trae solo sus días",
    `${PREPARAR}${vendio("a", 7193)}${llego("a", "tru", 4)}
      select concat_ws('|', (select string_agg(k, ',' order by k) from jsonb_array_elements(retail.tienda_catalogo() -> 'prendas') x, jsonb_object_keys(x) k where x ->> 'id' = :'p_a'),
          (select x ->> 'vendidos' from jsonb_array_elements(retail.tienda_catalogo() -> 'prendas') x where x ->> 'id' = :'p_a'),
          (select string_agg(k, ',') from jsonb_array_elements(retail.tienda_catalogo() -> 'prendas') x, jsonb_object_keys(x -> 'nuevo') k where x ->> 'id' = :'p_a'),
          not jsonb_path_exists(retail.tienda_catalogo(), '$.** ? (@ == 7193)'));
      rollback;`,
    "campana,categoria,codigo,colores,desde,fotos,id,nombre,nuevo,precio,precio_final,stock,vendidos|1|dias|t",
  );

  // ---------------------------------------------------------------- 3. La ayuda
  /** Lo que dice la ayuda: «horas|días para recoger|¿los días para cambiar son los de la caja?», con «·» donde no hay dato. */
  const AYUDA = `(select concat_ws('|', coalesce(a ->> 'horas_para_confirmar', '·'), coalesce(a ->> 'dias_para_recoger', '·'),
      (a ->> 'dias_para_cambiar') = retail.fn_dias_plazo_cambio()::text) from (select retail.tienda_ayuda() as a) s)`;
  const PLAZOS = (horas, sinPagar, dias) =>
    `update retail.configuracion_tienda_web set horas_para_confirmar = ${horas}, horas_aviso_sin_pagar = ${sinPagar}, dias_aviso_sin_recoger = ${dias} where id;\n`;
  valor(
    "la ayuda dice los plazos de Configuración ▸ Tienda web, y los sigue al cambiarlos; el de cambio es el de la caja",
    `begin;\n${aplicarAntes}\n${PLAZOS(12, 30, 5)}select ${AYUDA};\n${PLAZOS(36, 72, 9)}select ${AYUDA};\nrollback;`,
    "12|5|t\n36|9|t",
  );
  valor(
    "sin la fila de Configuración ▸ Tienda web, los plazos del pedido van vacíos (la página los dice sin número) y el de cambio sale igual",
    `begin;\n${aplicarAntes}\ndelete from retail.configuracion_tienda_web;\nselect ${AYUDA};\nrollback;`,
    "·|·|t",
  );

  // ---------------------------------------------------------------- 4. Permisos
  valor(
    "las piezas nuevas no las llama nadie de afuera, tampoco la tienda; el catálogo sigue siendo solo de tienda_web",
    `begin;\n${aplicarAntes}\nselect concat_ws('|',
        (select count(*) from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname in ('fn_tienda_lo_nuevo', 'fn_tienda_mas_vendidos')
            and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE')
                 or has_function_privilege('tienda_web', p.oid, 'EXECUTE'))),
        has_function_privilege('tienda_web', 'retail.tienda_catalogo(uuid)', 'EXECUTE'),
        has_function_privilege('authenticated', 'retail.tienda_catalogo(uuid)', 'EXECUTE'));\nrollback;`,
    "0|t|f",
  );
  valor(
    "la ayuda es solo de tienda_web, y como tienda_web responde",
    `begin;\n${aplicarAntes}\n${PLAZOS(20, 40, 6)}select retail.fn_dias_plazo_cambio() as cambio \\gset
      select concat_ws('|', has_function_privilege('tienda_web', 'retail.tienda_ayuda()', 'EXECUTE'),
          has_function_privilege('authenticated', 'retail.tienda_ayuda()', 'EXECUTE'), has_function_privilege('anon', 'retail.tienda_ayuda()', 'EXECUTE'));
      grant tienda_web to current_user with set true;\nset local role tienda_web;
      select concat_ws('|', a ->> 'horas_para_confirmar', a ->> 'dias_para_recoger', (a ->> 'dias_para_cambiar') = :'cambio') from (select retail.tienda_ayuda() as a) s;
      rollback;`,
    "t|f|f\n20|6|t",
  );
  valor(
    "como tienda_web, el catálogo responde con Lo nuevo y Más vendidos",
    `${PREPARAR}${llego("a", "tru", 2)}${vendio("a", 1)}grant tienda_web to current_user with set true;\nset local role tienda_web;
      select concat_ws('|', x -> 'nuevo' ->> 'dias', x ->> 'vendidos') from jsonb_array_elements(retail.tienda_catalogo() -> 'prendas') x where x ->> 'nombre' ilike 'zz inicio a';
      rollback;`,
    "2|1",
  );

  // ---------------------------------------------------------------- 5. La migración
  const sql = aplicarAntes || readFileSync(MIGRACION, "utf8");
  valor(
    "la migración se puede volver a correr (dos veces seguidas, como un segundo pegado)",
    `begin;\n${sql}\n${sql}\nselect count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname in ('fn_tienda_lo_nuevo', 'fn_tienda_mas_vendidos', 'tienda_catalogo', 'tienda_ayuda');\nrollback;`,
    "4",
  );
  return lista;
}

function evaluar(caso) {
  const r = correr(caso.sql);
  return { ok: r.ok && r.salida === caso.esperado, detalle: r.ok ? `dio «${r.salida}», se esperaba «${caso.esperado}»` : r.mensaje };
}

// Versiones rotas a propósito: cada una tiene que hacer fallar al menos un escenario (cada cambio, en todas sus apariciones).
const MUTANTES = [
  ["Lo nuevo por la ÚLTIMA llegada", [["select v.producto_id, min(m.created_at) as primera", "select v.producto_id, max(m.created_at) as primera"]]],
  ["el Taller cuenta como tienda", [["and u.tipo = 'tienda'", "and u.tipo in ('tienda', 'taller')"]]],
  ["cualquier entrada es una llegada", [["and retail.fn_es_llegada(m.tipo, m.motivo, m.lote_id, m.produccion_id, m.transferencia_recepcion_id)", "and m.tipo = 'entrada'"]]],
  ["31 días en vez de 30", [["or (m.en_lo_nuevo = 'automatico' and m.dias between 0 and 30)", "or (m.en_lo_nuevo = 'automatico' and m.dias between 0 and 31)"]]],
  ["lo quitado a mano entra igual", [["or (m.en_lo_nuevo = 'automatico' and m.dias between 0 and 30)", "or (m.dias between 0 and 30)"]]],
  ["las bolsas entran a Lo nuevo", [["       and retail.fn_categoria_entra_a_motores(p.categoria_id)\n  )\n  select m.id", "  )\n  select m.id"]]],
  ["las bolsas entran a Más vendidos", [["       and retail.fn_categoria_entra_a_motores(p.categoria_id)\n  )\n  select r.producto_id", "  )\n  select r.producto_id"]]],
  ["las ventas de siempre (sin los 30 días)", [["       and m.created_at >= now() - interval '30 days'\n", ""]]],
  ["el ranking al revés", [["row_number() over (order by vd.unidades desc, p.referencia, p.id)", "row_number() over (order by vd.unidades, p.referencia, p.id)"]]],
  ["sin tope de 20 puestos", [["where r.puesto <= 20", "where true"]]],
  ["sale la cifra de lo vendido", [["'vendidos', (select mv.puesto from vendidos mv where mv.producto_id = m.id)", "'vendidos', (select mv.puesto from vendidos mv where mv.producto_id = m.id), 'unidades', 7193"]]],
  ["la ayuda con las 24 horas escritas a mano", [["'horas_para_confirmar', (select c.horas_para_confirmar from retail.configuracion_tienda_web c where c.id)", "'horas_para_confirmar', 24"]]],
  ["recoger con las horas del aviso sin pagar", [["(select c.dias_aviso_sin_recoger from retail.configuracion_tienda_web c where c.id)", "(select c.horas_aviso_sin_pagar from retail.configuracion_tienda_web c where c.id)"]]],
  ["cambiar en 7 días (la maqueta) y no los de la caja", [["'dias_para_cambiar', retail.fn_dias_plazo_cambio())", "'dias_para_cambiar', 7)"]]],
];

function main() {
  const base = correr("select 1;");
  if (!base.ok) {
    console.error(`No hay Postgres local en el contenedor ${CONTENEDOR_LOCAL}. Levántalo con: npx supabase start`);
    process.exit(2);
  }
  const aplicarAntes = process.env.APLICAR_ANTES ? readFileSync(process.env.APLICAR_ANTES, "utf8") : "";
  if (!aplicarAntes) {
    const hay = correr("select to_regprocedure('retail.fn_tienda_lo_nuevo(uuid[])') is not null;");
    if (hay.salida !== "t") {
      console.error(`Falta Lo nuevo de la tienda: aplica ${MIGRACION} o corre con APLICAR_ANTES=${MIGRACION}`);
      process.exit(2);
    }
  }

  let fallos = 0;
  const casos = escenarios(aplicarAntes);
  for (const caso of casos) {
    const { ok, detalle } = evaluar(caso);
    console.log(`${ok ? "✓" : "✗"} ${caso.nombre}`);
    if (!ok) {
      fallos++;
      console.log(`    ${String(detalle).trim().split("\n").slice(0, 8).join("\n    ")}`);
    }
  }
  console.log(`\n${casos.length - fallos}/${casos.length} escenarios en verde.`);

  if (CON_MUTANTES) {
    console.log("\n— Mutantes: cada versión rota tiene que hacer fallar al menos un escenario —");
    const original = readFileSync(MIGRACION, "utf8");
    let vivos = 0;
    for (const [nombre, cambios] of MUTANTES) {
      const falta = cambios.find(([de]) => !original.includes(de));
      if (falta) {
        console.log(`✗ ${nombre}: el texto a mutar ya no está en la migración (actualiza el mutante): ${falta[0].trim()}`);
        vivos++;
        continue;
      }
      const mutada = cambios.reduce((sql, [de, a]) => sql.split(de).join(a), original);
      const muertos = escenarios(mutada).filter((c) => !evaluar(c).ok).length;
      console.log(`${muertos > 0 ? "✓" : "✗"} ${nombre}: ${muertos > 0 ? `lo detectan ${muertos} escenario(s)` : "VIVO, ningún escenario lo detecta"}`);
      if (muertos === 0) vivos++;
    }
    if (vivos > 0) fallos++;
  }
  if (fallos > 0) process.exit(1);
}

main();
