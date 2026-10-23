#!/usr/bin/env node
/**
 * Prueba del resto del día de compras (ADR-0480, actividad 5): `20261023114000_compras_simple_gasto_envio_y_cierre.sql`.
 *
 * QUÉ PROMETE
 *   · El módulo es la llave: anotar un gasto, mandar a la tienda y terminar el día piden «Mi plata para compras» (`ordenes_compra`).
 *   · «Gasté en otra cosa» queda por completar, no mueve plata en los libros y baja «tienes para comprar». Con «Otro», dice qué fue.
 *     Repetir lo mismo devuelve lo mismo; con otros datos, `gasto_rapido_otros_datos`. No se borra ni cambia lo anotado.
 *   · «Mandar a la tienda» manda en un envío todo lo que compró para esa tienda y no salió, con sus fardos; la otra tienda queda por
 *     mandar. Repetir con la misma marca devuelve el mismo envío; sin nada pendiente, `compra_mandar_nada`.
 *   · «Terminé de comprar hoy» guarda lo que tenía (lo calcula la base) y qué hace con eso. Con plata, hay que elegir; en negativo, CAYLA le
 *     debe. Volver a cerrar el mismo día lo reemplaza, hasta que Compras lo resuelve.
 *   · `anon` no ejecuta nada y las tablas no se leen directo.
 *
 * CÓMO. Sesión simulada con `request.jwt.claim.sub`, la migración pegada dos veces y ROLLBACK siempre. Usa «Compré ropa» (actividad 3),
 * que ya tiene que estar en la base.
 *
 * USO
 *   pnpm pruebas:compras-simple-dia                                  → contra el Postgres local (supabase_db_cayla-retail)
 *   node scripts/pruebas/compras_simple_dia.mjs --contenedor <otro>  → contra otro contenedor
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const arg = (nombre, porDefecto) => {
  const i = process.argv.indexOf(nombre);
  return i > 0 ? process.argv[i + 1] : porDefecto;
};
const CONTENEDOR = arg("--contenedor", process.env.RETAIL_CONTENEDOR_PG ?? "supabase_db_cayla-retail");
const BASE = arg("--base", "postgres");
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20261023114000_compras_simple_gasto_envio_y_cierre.sql"), "utf8").replace(
  /^set lock_timeout.*$/gm,
  "",
);

const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante — Tienda Trujillo

// La ronda de compras (20261023183000): sin una abierta, la base no deja anotar una compra ni un gasto. Se vuelve a pegar después de la
// migración de este archivo (que deja funciones de antes) y cada persona de la semilla empieza con su ronda abierta.
const RONDA = readFileSync(join(RAIZ, "supabase", "migrations", "20261023183000_compras_simple_ronda_de_compras.sql"), "utf8").replace(
  /^set lock_timeout.*$/gm,
  "",
);
const RONDAS_ABIERTAS = `
insert into retail.compra_rondas (persona_id, abierta_por)
select distinct c.persona_id, c.persona_id from retail.colaboradores c
 where not exists (select 1 from retail.compra_rondas r where r.persona_id = c.persona_id and r.cerrada_en is null);`;

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
${MIGRACION}
${MIGRACION}
${RONDA}
${RONDA}
${RONDAS_ABIERTAS}
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
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as micaela from public.personas where auth_user_id = '${MICAELA}' \\gset
select p.proveedor_id as prov from retail.productos p where p.proveedor_id is not null and p.estado = 'activo' and not p.es_prueba
 group by p.proveedor_id order by count(*) desc limit 1 \\gset
select id as p1 from retail.productos where proveedor_id = :'prov' and estado = 'activo' and not es_prueba order by referencia limit 1 \\gset
select id as p2 from retail.productos where proveedor_id = :'prov' and estado = 'activo' and not es_prueba order by referencia offset 1 limit 1 \\gset
select set_config('t.prov', :'prov', true), set_config('t.p1', :'p1', true), set_config('t.p2', :'p2', true), set_config('t.tru', :'tru', true),
       set_config('t.lima', :'lima', true) \\g /dev/null
-- Micaela compra solo con su rol de prueba: «Mi plata para compras».
insert into retail.roles (nombre) values ('ZZ Compradora ADR-0480 dia') returning id as rol \\gset
insert into retail.rol_modulos (rol_id, modulo) values (:'rol', 'ordenes_compra');
update retail.colaboradores set rol_id = :'rol' where persona_id = :'micaela';
`;

// Una compra: seis de p1 a Trujillo y cuatro de p2 a Lima, en boleta de S/ 500.
const COMPRA = `${como(MICAELA, "compra_rapida")}
select retail.registrar_compra_rapida('aaaaaaaa-0480-4000-8000-0000000000d1', current_setting('t.prov')::uuid, 'boleta', 500, 'papeles/x.jpg', jsonb_build_array(
  jsonb_build_object('producto_id', current_setting('t.p1')::uuid, 'cantidad', 6, 'costo', 50, 'precio_venta', 129.90, 'destino_id', current_setting('t.tru')::uuid),
  jsonb_build_object('producto_id', current_setting('t.p2')::uuid, 'cantidad', 4, 'costo', 45, 'precio_venta', 149.90, 'destino_id', current_setting('t.lima')::uuid))) \\g /dev/null
`;
const GID = "aaaaaaaa-0480-4000-8000-0000000000e1";
const GASTO = (id = GID, concepto = "taxi", nota = "null", monto = 18) =>
  `select retail.registrar_gasto_rapido('${id}', '${concepto}', ${nota}, ${monto}, null)`;
const TOKEN = "aaaaaaaa-0480-4000-8000-0000000000f1";
const MANDAR = (destino = "t.tru", bultos = 2, token = TOKEN) =>
  `select retail.mandar_compras_a_tienda(current_setting('${destino}')::uuid, ${bultos}, '${token}')`;
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
  "sin «Mi plata para compras» no se anota un gasto, no se manda ni se termina el día (42501)",
  `reset role;
delete from retail.rol_modulos where rol_id = :'rol';
insert into retail.rol_modulos (rol_id, modulo) values (:'rol', 'existencias');
${como(MICAELA, "gasto_rapido")}
select left(${intento(GASTO())}, 5), left(${intento(MANDAR())}, 5), left(${intento("select retail.terminar_dia_compras('se_queda')")}, 5);`,
  "42501|42501|42501",
);

caso(
  "un gasto queda por completar, no mueve plata en los libros y baja lo que tiene para comprar",
  `reset role;
select count(*) as movs from retail.movimientos_dinero \\gset
select retail.fn_mi_plata_tiene(:'micaela') as antes \\gset
${como(MICAELA, "gasto_rapido")}
${GASTO()} \\g /dev/null
select (retail.fn_mi_plata_compras() ->> 'gastos_por_completar')::numeric, retail.fn_mi_plata_compras() -> 'gastos' -> 0 ->> 'concepto',
       (retail.fn_mi_plata_compras() -> 'hoy' ->> 'gastaste')::numeric;
reset role;
select (select count(*) from retail.movimientos_dinero) - :'movs', :'antes'::numeric - retail.fn_mi_plata_tiene(:'micaela'),
       (select estado from retail.compra_gastos where id = '${GID}');`,
  "18.00|taxi|18.00 / 0|18.00|por_completar",
);

caso(
  "validaciones del gasto: concepto, «Otro» sin decir qué, monto, decimales, foto de otra carpeta; lo rechazado no deja nada",
  `${como(MICAELA, "gasto_rapido")}
select ${hint("select retail.registrar_gasto_rapido(gen_random_uuid(), 'pasaje', null, 10, null)")},
       ${hint("select retail.registrar_gasto_rapido(gen_random_uuid(), 'otro', '  ', 10, null)")},
       ${hint("select retail.registrar_gasto_rapido(gen_random_uuid(), 'taxi', null, 0, null)")},
       ${hint("select retail.registrar_gasto_rapido(gen_random_uuid(), 'taxi', null, 10.555, null)")},
       ${hint("select retail.registrar_gasto_rapido(gen_random_uuid(), 'taxi', null, 10, 'papeles/x.jpg')")},
       ${intento("select retail.registrar_gasto_rapido(gen_random_uuid(), 'otro', 'Candado para el fardo', 10, 'gastos/x.jpg')")};
reset role;
select count(*) from retail.compra_gastos where persona_id = :'micaela';`,
  "gasto_rapido_concepto|gasto_rapido_sin_nota|monto_invalido|monto_invalido|gasto_rapido_foto|SIN_ERROR / 1",
);

caso(
  "repetir el mismo gasto devuelve lo mismo; con otro monto, gasto_rapido_otros_datos",
  `${como(MICAELA, "gasto_rapido")}
${GASTO()} \\g /dev/null
${GASTO()} \\g /dev/null
select ${hint(GASTO(GID, "taxi", "null", 20))};
reset role;
select count(*) from retail.compra_gastos where persona_id = :'micaela';`,
  "gasto_rapido_otros_datos / 1",
);

caso(
  "el gasto no se borra ni cambia lo anotado (ni como postgres); su estado sí",
  `${como(MICAELA, "gasto_rapido")}
${GASTO()} \\g /dev/null
reset role;
select split_part(${intento(`update retail.compra_gastos set monto = 1 where id = '${GID}'`)}, '|', 3),
       split_part(${intento(`delete from retail.compra_gastos where id = '${GID}'`)}, '|', 3),
       ${intento(`update retail.compra_gastos set estado = 'completado' where id = '${GID}'`)};`,
  "Lo que anotó la compradora no cambia: Compras lo corrige al revisarlo.|Un gasto anotado no se borra.|SIN_ERROR",
);

caso(
  "lo comprado sale por mandar en cada tienda; mandar a Trujillo arma un envío en camino con sus fardos y Lima queda por mandar",
  `${COMPRA}
select string_agg((t ->> 'tienda') || '=' || (t ->> 'unidades'), ',' order by t ->> 'tienda') from jsonb_array_elements(retail.fn_mi_plata_compras() -> 'por_mandar') t;
${como(MICAELA, "compra_mandar")}
select (${MANDAR().slice(7)}) ->> 'unidades';
${como(MICAELA, "compra_rapida")}
select string_agg(t ->> 'tienda', ',') from jsonb_array_elements(retail.fn_mi_plata_compras() -> 'por_mandar') t;
select retail.fn_mi_plata_compras() -> 'compras' -> 0 -> 'por_mandar';
reset role;
select d.estado || ':' || d.bultos || ':' || (select sum(cantidad) from retail.despacho_items where despacho_id = d.id) || ':' || (d.despachado_por = :'micaela')
  from retail.despachos d where d.token_cliente = '${TOKEN}';`,
  `Tienda Lima=4,Tienda Trujillo=6 / 6 / Tienda Lima / ["Tienda Lima"] / en_camino:2:6:true`,
);

caso(
  "repetir con la misma marca devuelve el mismo envío; otra vez a Trujillo ya no hay nada; los fardos van de 1 a 99",
  `${COMPRA}
${como(MICAELA, "compra_mandar")}
${MANDAR()} \\g /dev/null
select (${MANDAR().slice(7)}) ->> 'bultos';
select ${hint(MANDAR("t.tru", 1, "aaaaaaaa-0480-4000-8000-0000000000f2"))}, ${hint(MANDAR("t.lima", 0, "aaaaaaaa-0480-4000-8000-0000000000f3"))};
reset role;
select count(*) from retail.despachos where despachado_por = :'micaela' and token_cliente::text like 'aaaaaaaa-0480%';`,
  "2 / compra_mandar_nada|compra_mandar_bultos / 1",
);

caso(
  "cerrar la ronda con plata pide elegir; «devuelve» guarda lo que tenía y cierra la ronda; sin ronda abierta no se cierra otra vez",
  `reset role;
-- Le damos plata por confirmar, para que tenga.
insert into retail.fondo_plata_anotada (persona_id, medio, monto, fecha, anotada_por)
values (:'micaela', 'efectivo', 300, retail.fn_hoy_lima(), :'micaela');
select retail.fn_mi_plata_tiene(:'micaela') as tiene \\gset
${como(MICAELA, "compra_terminar_dia")}
select ${hint("select retail.terminar_dia_compras(null)")};
select (retail.terminar_dia_compras('devuelve') ->> 'monto')::numeric = :'tiene'::numeric;
select ${hint("select retail.terminar_dia_compras('se_queda')")};
select retail.fn_mi_plata_compras() -> 'ronda' -> 'ultima_cerrada' ->> 'decision', retail.fn_mi_plata_compras() -> 'ronda' ->> 'abierta';
reset role;
select count(*), count(*) filter (where k.ronda_id is not null and r.cierre_id = k.id) from retail.compra_cierres k
  left join retail.compra_rondas r on r.id = k.ronda_id where k.persona_id = :'micaela';`,
  "compra_cierre_decision / t / compra_ronda_sin_abrir / devuelve| / 1|1",
);

caso(
  "en negativo, CAYLA le debe (sin elegir); después abre otra ronda, con otro número, y abrir otra vez devuelve la misma",
  `reset role;
select greatest(retail.fn_mi_plata_tiene(:'micaela'), 0) + 50 as gasto \\gset
${como(MICAELA, "gasto_rapido")}
select retail.registrar_gasto_rapido(gen_random_uuid(), 'otro', 'Más de lo que tenía', :'gasto', null) \\g /dev/null
${como(MICAELA, "compra_terminar_dia")}
select retail.terminar_dia_compras(null) ->> 'decision';
${como(MICAELA, "compra_ronda_abrir")}
select retail.abrir_ronda_compras() as r1 \\gset
select (:'r1'::jsonb ->> 'ya_estaba'), (:'r1'::jsonb ->> 'texto') ~ '^RC-[0-9]{6}$',
       (retail.abrir_ronda_compras() ->> 'id') = (:'r1'::jsonb ->> 'id');
reset role;
select count(*) from retail.compra_rondas where persona_id = :'micaela' and cerrada_en is null;`,
  "le_deben / false|t|t / 1",
);

caso(
  "sin ronda abierta no se anota un gasto (compra_ronda_sin_abrir) pero sí la plata, que queda sin ronda; con ronda, el gasto queda en ella",
  `reset role;
${como(MICAELA, "compra_terminar_dia")}
select retail.terminar_dia_compras('se_queda') \\g /dev/null
${como(MICAELA, "gasto_rapido")}
select ${hint(GASTO())};
${como(MICAELA, "plata_anotar")}
select retail.anotar_plata_compras('efectivo', 20, null, gen_random_uuid()) \\g /dev/null
${como(MICAELA, "compra_ronda_abrir")}
select retail.abrir_ronda_compras() ->> 'id' as ronda \\gset
${como(MICAELA, "gasto_rapido")}
${GASTO("aaaaaaaa-0480-4000-8000-0000000000e9")} \\g /dev/null
reset role;
select (select count(*) from retail.fondo_plata_anotada where persona_id = :'micaela' and ronda_id is null and monto = 20),
       (select ronda_id::text = :'ronda' from retail.compra_gastos where id = 'aaaaaaaa-0480-4000-8000-0000000000e9');`,
  "compra_ronda_sin_abrir / 1|t",
);

caso(
  "una sola ronda abierta por persona; cerrada dice su número RC y no cambia ni se borra; la ronda de un gasto no cambia",
  `reset role;
select split_part(pg_temp.intento(format($q$insert into retail.compra_rondas (persona_id, abierta_por) values (%L, %L)$q$, :'micaela', :'micaela')), '|', 1);
${como(MICAELA, "gasto_rapido")}
${GASTO()} \\g /dev/null
${como(MICAELA, "compra_terminar_dia")}
select (retail.terminar_dia_compras('se_queda') ->> 'ronda') ~ '^RC-[0-9]{6}$';
reset role;
select id as cerrada from retail.compra_rondas where persona_id = :'micaela' and cerrada_en is not null order by cerrada_en desc limit 1 \\gset
select split_part(pg_temp.intento(format($q$update retail.compra_rondas set cerrada_en = now() where id = %L$q$, :'cerrada')), '|', 2),
       split_part(pg_temp.intento(format($q$delete from retail.compra_rondas where id = %L$q$, :'cerrada')), '|', 1),
       split_part(pg_temp.intento(format($q$update retail.compra_gastos set ronda_id = null where id = %L$q$, '${GID}')), '|', 1);`,
  "23505 / t / compra_ronda_cerrada|P0001|P0001",
);

caso(
  "dos rondas cerradas el mismo día: cada una con su cierre, y Mi plata se sigue leyendo (lee el último)",
  `${como(MICAELA, "compra_terminar_dia")}
select retail.terminar_dia_compras('se_queda') \\g /dev/null
${como(MICAELA, "compra_ronda_abrir")}
select retail.abrir_ronda_compras() \\g /dev/null
${como(MICAELA, "compra_terminar_dia")}
select retail.terminar_dia_compras('se_queda') \\g /dev/null
select (retail.fn_mi_plata_compras() -> 'hoy' -> 'cierre' ->> 'decision') is not null, retail.fn_mi_plata_compras() -> 'ronda' ->> 'abierta';
reset role;
select count(*) from retail.compra_cierres where persona_id = :'micaela' and fecha = retail.fn_hoy_lima() and ronda_id is not null;`,
  "t| / 2",
);

caso(
  "anon no ejecuta ninguna; las tablas nuevas no se leen directo; las ayudas internas no se llaman desde afuera",
  `reset role;
select has_function_privilege('anon', 'retail.registrar_gasto_rapido(uuid, text, text, numeric, text)', 'execute'),
       has_function_privilege('anon', 'retail.mandar_compras_a_tienda(uuid, integer, uuid)', 'execute'),
       has_function_privilege('anon', 'retail.terminar_dia_compras(text)', 'execute'),
       has_function_privilege('authenticated', 'retail.fn_mi_plata_tiene(uuid)', 'execute'),
       has_table_privilege('authenticated', 'retail.compra_gastos', 'select'),
       has_table_privilege('authenticated', 'retail.compra_cierres', 'select');`,
  "f|f|f|f|f|f",
);

caso(
  "la actividad anota el gasto y el cierre sin montos",
  `${como(MICAELA, "gasto_rapido")}
${GASTO()} \\g /dev/null
${como(MICAELA, "compra_terminar_dia")}
select retail.terminar_dia_compras('se_queda') \\g /dev/null
reset role;
select string_agg(accion || ':' || (descripcion ~ 'S/'), ',' order by accion) from retail.actividad
 where accion in ('gasto_rapido_anotado', 'dia_compras_terminado') and persona_id = :'micaela';`,
  "dia_compras_terminado:false,gasto_rapido_anotado:false",
);

console.log(`\n${casos - fallas}/${casos} casos en verde`);
if (fallas) process.exit(1);
