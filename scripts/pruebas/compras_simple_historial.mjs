#!/usr/bin/env node
/**
 * Prueba de «Compras solo ve historial» (ADR-0574): la compradora escribe la serie y el número al comprar (20261029193000) y, con eso, el papel
 * pasa solo a los libros (actividades siguientes). Corre sobre la base TAL COMO ESTÁ (con todas las migraciones), sin pegar nada: lo que se
 * hace dentro de cada caso se deshace con ROLLBACK.
 *
 * QUÉ PROMETE (actividad 3)
 *   · Con una boleta o una factura, la serie (en mayúsculas) y el número quedan en el papel; el papel sigue «por completar».
 *   · Las mismas reglas que al completar: serie de letras y números hasta 8; número de solo dígitos hasta 12; si dice uno, dice los dos.
 *   · Una nota de venta lleva solo el número (opcional, con letras o guiones) y su serie queda vacía; sin papel, nada.
 *   · Sin serie ni número (una pantalla de antes) también se guarda, como hasta hoy.
 *   · El mismo comprobante del mismo proveedor no se registra dos veces (`papel_repetido`), ni contra otra compra anotada.
 *   · Un reintento con el mismo id y lo mismo devuelve lo mismo; con otra serie, `compra_rapida_otros_datos`.
 *   · Lo que escribió no cambia (ni como postgres).
 *
 * QUÉ PROMETE (actividad 5: los gastos que no son ropa)
 *   · Un gasto se anota con el papel que le dieron (y su RUC): sin papel solo el taxi y el cargador; el RUC, 11 números; sin papel (una pantalla de
 *     antes) también se anota.
 *   · Al cerrar la ronda, los gastos con papel pasan solos a los gastos del viaje (pagados de su fondo, a su compra del día); los de antes, sin papel,
 *     se quedan para Compras. Si uno no puede pasar (no hay una compra a la que ir), el cierre NO se cae y queda con su motivo.
 *
 * USO
 *   node scripts/pruebas/compras_simple_historial.mjs                        → contra el Postgres local (supabase_db_cayla-retail)
 *   node scripts/pruebas/compras_simple_historial.mjs --contenedor <otro> [--base <nombre>]
 */

import { execFileSync } from "node:child_process";

const arg = (nombre, porDefecto) => {
  const i = process.argv.indexOf(nombre);
  return i > 0 ? process.argv[i + 1] : porDefecto;
};
const CONTENEDOR = arg("--contenedor", process.env.RETAIL_CONTENEDOR_PG ?? "supabase_db_cayla-retail");
const BASE = arg("--base", "postgres");

const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante — Tienda Trujillo

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}
const como = (auth, clave) =>
  `reset role;\nset local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n` +
  `select set_config('request.headers', '${JSON.stringify(clave ? { "x-responsable-omitido": clave } : {})}', true) \\g /dev/null\n` +
  `set local role authenticated;\n`;

const PRELUDIO = `
begin;
set local search_path = retail, public, extensions;
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
grant execute on function pg_temp.intento(text) to authenticated;
-- Cada persona del equipo empieza con su ronda abierta (sin una, la base no deja anotar una compra).
insert into retail.compra_rondas (persona_id, abierta_por)
select distinct c.persona_id, c.persona_id from retail.colaboradores c
 where not exists (select 1 from retail.compra_rondas r where r.persona_id = c.persona_id and r.cerrada_en is null);
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as micaela from public.personas where auth_user_id = '${MICAELA}' \\gset
select p.proveedor_id as prov from retail.productos p where p.proveedor_id is not null and p.estado = 'activo' and not p.es_prueba
 group by p.proveedor_id order by count(*) desc limit 1 \\gset
select p.proveedor_id as otro_prov from retail.productos p where p.proveedor_id is not null and p.estado = 'activo' and not p.es_prueba and p.proveedor_id <> :'prov'
 group by p.proveedor_id order by count(*) desc limit 1 \\gset
select id as p1 from retail.productos where proveedor_id = :'prov' and estado = 'activo' and not es_prueba order by referencia limit 1 \\gset
select set_config('t.prov', :'prov', true), set_config('t.otro', coalesce(:'otro_prov', :'prov'), true), set_config('t.p1', :'p1', true), set_config('t.tru', :'tru', true) \\g /dev/null
`;

const rolDeMicaela = (...modulos) => `
reset role;
insert into retail.roles (nombre) values ('ZZ Compradora ADR-0574') returning id as rol \\gset
${modulos.map((m) => `insert into retail.rol_modulos (rol_id, modulo) values (:'rol', '${m}');`).join("\n")}
update retail.colaboradores set rol_id = :'rol' where persona_id = :'micaela';
`;
const LINEAS = `jsonb_build_array(
  jsonb_build_object('producto_id', current_setting('t.p1')::uuid, 'cantidad', 2, 'costo', 50, 'precio_venta', 129.90, 'destino_id', current_setting('t.tru')::uuid))`;
const ID = (n) => `aaaaaaaa-0574-4000-8000-00000000000${n}`;
// Registra una compra de S/ 100 con su papel, su serie y su número.
const COMPRA = (n, tipo, serie, numero, prov = "current_setting('t.prov')::uuid") =>
  `select retail.registrar_compra_rapida('${ID(n)}', ${prov}, '${tipo}', 100, ${tipo === "sin_comprobante" ? "null" : "'papeles/x.jpg'"}, ${LINEAS}, 100, 'efectivo', ${serie === null ? "null" : `'${serie}'`}, ${numero === null ? "null" : `'${numero}'`})`;
const intento = (sql) => `pg_temp.intento($q$${sql}$q$)`;
const hint = (sql) => `split_part(${intento(sql)}, '|', 2)`;

let casos = 0;
let fallas = 0;
function caso(nombre, sql, esperado) {
  casos++;
  let obtenido;
  try {
    obtenido = psql(`${PRELUDIO}${sql}\nrollback;`).trim().split("\n").filter(Boolean).join(" / ");
  } catch (e) {
    obtenido = `ERROR: ${String(e.stderr ?? e.message).split("\n").filter((l) => !l.includes("NOTICE")).slice(0, 4).join(" ")}`;
  }
  const ok = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  if (ok) console.log(`✓ ${nombre}`);
  else {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${typeof esperado === "function" ? "(ver la condición)" : esperado}\n    obtenido: ${obtenido}`);
  }
}

caso(
  "una boleta guarda su serie (en mayúsculas) y su número en el papel, y sigue por completar",
  `${rolDeMicaela("ordenes_compra")}${como(MICAELA, "compra_rapida")}
${COMPRA(1, "boleta", "b001", "000123")} \\g /dev/null
reset role;
select serie || '-' || numero || ':' || estado || ':' || tipo from retail.compra_papeles where id = '${ID(1)}';`,
  "B001-000123:por_completar:boleta",
);

caso(
  "serie y número con las mismas reglas que al completar: serie de letras y números hasta 8, número de solo dígitos hasta 12, los dos juntos",
  `${rolDeMicaela("ordenes_compra")}${como(MICAELA, "compra_rapida")}
select ${hint(COMPRA(2, "factura", "F-001", "123"))}, ${hint(COMPRA(3, "factura", "F0000000001", "123"))},
       ${hint(COMPRA(4, "factura", "F001", "12A"))}, ${hint(COMPRA(5, "factura", "F001", "1234567890123"))},
       ${hint(COMPRA(6, "boleta", "B001", null))}, ${hint(COMPRA(7, "boleta", null, "55"))};
reset role;
select count(*) from retail.compra_papeles where id in ('${ID(2)}', '${ID(3)}', '${ID(4)}', '${ID(5)}', '${ID(6)}', '${ID(7)}');`,
  "papel_serie|papel_serie|papel_numero|papel_numero|papel_numero|papel_serie / 0",
);

caso(
  "sin serie ni número (una pantalla de antes) también se guarda: Compras los copia al completar, como hasta hoy",
  `${rolDeMicaela("ordenes_compra")}${como(MICAELA, "compra_rapida")}
${COMPRA(1, "factura", null, null)} \\g /dev/null
reset role;
select serie is null, numero is null from retail.compra_papeles where id = '${ID(1)}';`,
  "t|t",
);

caso(
  "una nota de venta lleva solo el número (opcional, con letras o guiones) y sin serie; sin papel, lo que venga se ignora",
  `${rolDeMicaela("ordenes_compra")}${como(MICAELA, "compra_rapida")}
${COMPRA(1, "nota_venta", "ZZ", "NV-12")} \\g /dev/null
${COMPRA(2, "nota_venta", null, null)} \\g /dev/null
${COMPRA(3, "sin_comprobante", "F001", "99")} \\g /dev/null
select ${hint(COMPRA(4, "nota_venta", null, "12 34"))};
reset role;
select (select coalesce(serie, '-') || ':' || coalesce(numero, '-') from retail.compra_papeles where id = '${ID(1)}'),
       (select coalesce(serie, '-') || ':' || coalesce(numero, '-') from retail.compra_papeles where id = '${ID(2)}'),
       (select coalesce(serie, '-') || ':' || coalesce(numero, '-') from retail.compra_papeles where id = '${ID(3)}');`,
  "papel_numero / -:NV-12|-:-|-:-",
);

caso(
  "el mismo comprobante del mismo proveedor no se registra dos veces (papel_repetido); en otro proveedor, sí",
  `${rolDeMicaela("ordenes_compra")}${como(MICAELA, "compra_rapida")}
${COMPRA(1, "factura", "F001", "500")} \\g /dev/null
select ${hint(COMPRA(2, "factura", "F001", "500"))}, ${intento(COMPRA(3, "factura", "F001", "501"))},
       ${intento(COMPRA(4, "factura", "F001", "500", "current_setting('t.otro')::uuid"))};`,
  "papel_repetido|SIN_ERROR|SIN_ERROR",
);

caso(
  "repetir el mismo envío devuelve lo mismo y no duplica; con otra serie, compra_rapida_otros_datos",
  `${rolDeMicaela("ordenes_compra")}${como(MICAELA, "compra_rapida")}
${COMPRA(1, "boleta", "B001", "77")} \\g /dev/null
${COMPRA(1, "boleta", "B001", "77")} \\g /dev/null
select ${hint(COMPRA(1, "boleta", "B002", "77"))};
reset role;
select count(*) from retail.compra_papeles where id = '${ID(1)}';`,
  "compra_rapida_otros_datos / 1",
);

caso(
  "lo que escribió no cambia: ni la serie ni el número, ni como postgres",
  `${rolDeMicaela("ordenes_compra")}${como(MICAELA, "compra_rapida")}
${COMPRA(1, "boleta", "B001", "88")} \\g /dev/null
reset role;
select split_part(pg_temp.intento($q$update retail.compra_papeles set numero = '99' where id = '${ID(1)}'$q$), '|', 3),
       split_part(pg_temp.intento($q$update retail.compra_papeles set serie = 'B009' where id = '${ID(1)}'$q$), '|', 3);`,
  "Lo que anotó la compradora no cambia: Compras lo corrige al completar el papel.|Lo que anotó la compradora no cambia: Compras lo corrige al completar el papel.",
);

caso(
  "anon no ejecuta la compra; la firma de ocho parámetros ya no existe (una sola, sin ambigüedad)",
  `reset role;
select has_function_privilege('anon', 'retail.registrar_compra_rapida(uuid, uuid, text, numeric, text, jsonb, numeric, text, text, text)', 'execute'),
       to_regprocedure('retail.registrar_compra_rapida(uuid,uuid,text,numeric,text,jsonb,numeric,text)') is null,
       (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'registrar_compra_rapida');`,
  "f|t|1",
);

// ---------- Los gastos (actividad 5) ----------
const GASTO = (n, concepto, papel, ruc = null, foto = null) =>
  `select retail.registrar_gasto_rapido('${ID(n)}', '${concepto}', null, 18.50, ${foto === null ? "null" : `'${foto}'`}, ${papel === null ? "null" : `'${papel}'`}, ${ruc === null ? "null" : `'${ruc}'`})`;

caso(
  "un gasto se anota con su papel y su RUC; sin papel solo el taxi y el cargador; el RUC, 11 números; sin papel dicho (una pantalla de antes) también se anota",
  `${rolDeMicaela("ordenes_compra")}${como(MICAELA, "gasto_rapido")}
${GASTO(1, "taxi", "planilla_movilidad")} \\g /dev/null
${GASTO(2, "envio", "factura", "20123456789", "gastos/f.jpg")} \\g /dev/null
${GASTO(3, "comida", null)} \\g /dev/null
select ${hint(GASTO(4, "comida", "planilla_movilidad"))}, ${hint(GASTO(5, "taxi", "recibo"))}, ${hint(GASTO(6, "envio", "factura", "123", "gastos/f.jpg"))},
       ${hint(GASTO(7, "taxi", "planilla_movilidad", "20123456789"))};
reset role;
select (select papel from retail.compra_gastos where id = '${ID(1)}'), (select papel || ':' || ruc from retail.compra_gastos where id = '${ID(2)}'),
       (select papel is null from retail.compra_gastos where id = '${ID(3)}'), (select count(*) from retail.compra_gastos where id in ('${ID(4)}', '${ID(5)}', '${ID(6)}', '${ID(7)}'));`,
  "gasto_rapido_papel|gasto_rapido_papel|gasto_rapido_ruc|gasto_rapido_ruc / planilla_movilidad|factura:20123456789|t|0",
);

caso(
  "repetir el mismo gasto devuelve lo mismo; con otro papel, gasto_rapido_otros_datos; lo que dijo no cambia ni como postgres",
  `${rolDeMicaela("ordenes_compra")}${como(MICAELA, "gasto_rapido")}
${GASTO(1, "taxi", "planilla_movilidad")} \\g /dev/null
${GASTO(1, "taxi", "planilla_movilidad")} \\g /dev/null
select ${hint(GASTO(1, "taxi", "boleta", null, "gastos/b.jpg"))};
reset role;
select split_part(pg_temp.intento($q$update retail.compra_gastos set papel = 'ticket' where id = '${ID(1)}'$q$), '|', 3), (select count(*) from retail.compra_gastos where id = '${ID(1)}');`,
  "gasto_rapido_otros_datos / Lo que anotó la compradora no cambia: Compras lo corrige al revisarlo.|1",
);

// Cierra la ronda de Micaela: con lo que tenga decide solo (negativo: le deben).
const CIERRA = `${como(MICAELA, "compra_terminar_dia")}select retail.terminar_dia_compras('se_queda') ->> 'ronda' is not null;`;

caso(
  "al cerrar la ronda, los gastos con papel pasan solos a los gastos del viaje (de su fondo, a su compra del día); el de antes se queda para Compras",
  `${rolDeMicaela("ordenes_compra")}${como(MICAELA, "compra_rapida")}
${COMPRA(1, "boleta", "B001", "4001")} \\g /dev/null
${como(MICAELA, "gasto_rapido")}
${GASTO(1, "taxi", "planilla_movilidad")} \\g /dev/null
${GASTO(2, "cargador", "ticket", null, "gastos/t.jpg")} \\g /dev/null
${GASTO(3, "comida", null)} \\g /dev/null
${CIERRA}
reset role;
select g.id = '${ID(1)}' and g.estado = 'completado', count(*) filter (where g.estado = 'completado'), count(*) filter (where g.estado = 'por_completar'),
       count(*) filter (where g.pasa_sola_error is not null)
  from retail.compra_gastos g where g.persona_id = :'micaela' and g.id in ('${ID(1)}', '${ID(2)}', '${ID(3)}') group by g.id = '${ID(1)}' and g.estado = 'completado' order by 1 desc;
select (select count(*) from retail.gastos x where x.token_cliente in ('${ID(1)}', '${ID(2)}')), (select count(*) from retail.gastos x where x.token_cliente = '${ID(3)}');`,
  "t / t|1|0|0 / f|1|1|0 / 2|0",
);

caso(
  "si un gasto no puede pasar (todavía no hay una compra a la que ir), cerrar la ronda NO se cae: queda por revisar con su motivo",
  `${rolDeMicaela("ordenes_compra")}${como(MICAELA, "gasto_rapido")}
${GASTO(1, "taxi", "planilla_movilidad")} \\g /dev/null
${CIERRA}
reset role;
select estado, pasa_sola_error ~ 'compra' from retail.compra_gastos where id = '${ID(1)}';
select (select count(*) from retail.compra_rondas where persona_id = :'micaela' and cerrada_en is not null) >= 1;`,
  "t / por_completar|t / t",
);

console.log(`\n${casos - fallas}/${casos} casos en verde`);
if (fallas) process.exit(1);
