#!/usr/bin/env node
/**
 * Prueba de «Corregir un gasto de otra cosa» (ADR-0572): `20261029171000_mis_compras_corregir_un_gasto.sql`.
 *
 * QUÉ PROMETE
 *   · El módulo es la llave, y solo se corrige un gasto PROPIO (el de otra persona: gasto_corregir_ajeno).
 *   · La plata vuelve: mientras Compras no lo revisa, «tienes para comprar» y el «gastaste» de la ronda salen del monto vivo del gasto, así que
 *     subir o bajar el monto mueve las dos cuentas sin escribir ningún movimiento de dinero.
 *   · Solo mientras el gasto está por completar: uno que Compras ya revisó (o anuló) no se corrige, y si Compras lo revisa a la vez la base los pone en fila.
 *   · Solo con su ronda abierta: la cerrada pide reabrirla (ADR-0569), y ya reabierta se corrige y el cierre nuevo trae la cifra corregida.
 *   · Todo o nada: un dato malo (monto en cero, «Otro» sin nota, foto de otra carpeta) no deja nada escrito. Dos toques con el mismo lote no corrigen dos veces.
 *   · El rastro: una fila por dato (cuál, antes y ahora), quién y cuándo; no se cambia ni se borra. Lo anotado sigue inmutable fuera de la corrección y la
 *     marca de OTRO gasto no sirve.
 *
 * CÓMO. Sesión simulada con `request.jwt.claim.sub`, las migraciones pegadas dos veces y ROLLBACK siempre. Pega antes la de reabrir (20261029150000), que
 * la base local puede no tener todavía: se prueba también corregir tras reabrir.
 *
 * USO
 *   pnpm pruebas:compras-simple-corregir-gasto                                → contra el Postgres local (supabase_db_cayla-retail)
 *   node scripts/pruebas/compras_simple_corregir_gasto.mjs --contenedor <otro> → contra otro contenedor
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
const migracion = (nombre) => readFileSync(join(RAIZ, "supabase", "migrations", nombre), "utf8").replace(/^set lock_timeout.*$/gm, "");
const MIGRACIONES = ["20261029150000_mis_compras_reabrir_la_ultima_ronda.sql", "20261029171000_mis_compras_corregir_un_gasto.sql"].map(migracion);

const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante — Tienda Trujillo
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder

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
${MIGRACIONES.map((m) => `${m}\n${m}`).join("\n")}
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
select id as micaela from public.personas where auth_user_id = '${MICAELA}' \\gset
-- Micaela compra solo con su rol de prueba: «Mi plata para compras».
insert into retail.roles (nombre) values ('ZZ Compradora ADR-0572') returning id as rol \\gset
insert into retail.rol_modulos (rol_id, modulo) values (:'rol', 'ordenes_compra');
update retail.colaboradores set rol_id = :'rol' where persona_id = :'micaela';
-- Su historia de prueba empieza sin rondas: los disparadores de «no se borra» se apagan solo en esta transacción (que siempre se deshace).
alter table retail.compra_rondas disable trigger compra_rondas_fija;
alter table retail.compra_cierres disable trigger compra_cierres_resuelto_fijo;
update retail.compra_rondas set cierre_id = null, cerrada_en = null where persona_id = :'micaela';
delete from retail.compra_cierres where persona_id = :'micaela';
delete from retail.compra_rondas where persona_id = :'micaela' and not exists (select 1 from retail.compra_papeles p where p.ronda_id = compra_rondas.id)
   and not exists (select 1 from retail.compra_gastos g where g.ronda_id = compra_rondas.id) and not exists (select 1 from retail.fondo_plata_anotada a where a.ronda_id = compra_rondas.id);
alter table retail.compra_rondas enable trigger compra_rondas_fija;
alter table retail.compra_cierres enable trigger compra_cierres_resuelto_fijo;
`;
const intento = (sql) => `pg_temp.intento($q$${sql}$q$)`;
const hint = (sql) => `split_part(${intento(sql)}, '|', 2)`;
const ABRIR = `${como(MICAELA, "compra_ronda_abrir")}\nselect retail.abrir_ronda_compras() ->> 'id' as ronda \\gset\n`;
const ID = "aaaaaaaa-0572-4000-8000-0000000000a1";
const OTRO = "aaaaaaaa-0572-4000-8000-0000000000a2";
const GASTO = (id = ID, concepto = "comida", nota = "null", monto = 4, foto = "null") =>
  `${como(MICAELA, "gasto_rapido")}\nselect retail.registrar_gasto_rapido('${id}', '${concepto}', ${nota}, ${monto}, ${foto}) \\g /dev/null\n`;
const PLATA = (monto) => `${como(MICAELA, "plata_anotar")}\nselect retail.anotar_plata_compras('efectivo', ${monto}, null, gen_random_uuid()) \\g /dev/null\n`;
const CERRAR = (decision) => `${como(MICAELA, "compra_terminar_dia")}\nselect retail.terminar_dia_compras('${decision}') \\g /dev/null\n`;
const REABRIR = `${como(MICAELA, "compra_ronda_reabrir")}\nselect retail.reabrir_ronda_compras() \\g /dev/null\n`;
const L = (n) => `bbbbbbbb-0572-4000-8000-0000000000${String(n).padStart(2, "0")}`;
// concepto, nota, monto, foto
const CORREGIR = (concepto, nota, monto, foto = "null", lote = L(1), id = ID) =>
  `select retail.corregir_gasto_rapido('${id}', '${lote}', '${concepto}', ${nota}, ${monto}, ${foto})`;
const FIRMA = `${como(MICAELA, "gasto_corregir")}\n`;
const TIENE = `retail.fn_mi_plata_tiene(:'micaela')`;
const GASTASTE = `(retail.fn_ronda_compras_de(:'micaela') -> 'abierta' ->> 'gastaste')::numeric`;

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
  "sin «Mi plata para compras» no se lee ni se corrige (42501); otra persona no corrige el gasto ajeno",
  `${ABRIR}${PLATA(100)}${GASTO()}reset role;
delete from retail.rol_modulos where rol_id = :'rol';
insert into retail.rol_modulos (rol_id, modulo) values (:'rol', 'existencias');
${FIRMA}
select ${hint(CORREGIR("comida", "null", 9))}, ${hint(`select retail.fn_gasto_para_corregir('${ID}')`)};
reset role;
insert into retail.rol_modulos (rol_id, modulo) values (:'rol', 'ordenes_compra');
-- Felipe también tiene el módulo (es líder), pero el gasto no es suyo.
${como(FELIPE, "gasto_corregir")}
select ${hint(CORREGIR("comida", "null", 9, "null", L(2)))}, ${hint(`select retail.fn_gasto_para_corregir('${ID}')`)};`,
  "ordenes_compra_sin_modulo|ordenes_compra_sin_modulo / gasto_corregir_ajeno|gasto_corregir_ajeno",
);

caso(
  "corregir el monto mueve «tienes para comprar» y el «gastaste» de la ronda sin escribir un movimiento de dinero",
  `${ABRIR}${PLATA(100)}${GASTO()}reset role;
select count(*) as movs_antes from retail.movimientos_dinero \\gset
select ${TIENE} as t0, ${GASTASTE} as g0 \\gset
${FIRMA}
${CORREGIR("comida", "null", 14)} as r \\gset
reset role;
select :'r'::jsonb ->> 'ya_estaba', :'r'::jsonb ->> 'datos', ${TIENE} - :'t0'::numeric, ${GASTASTE} - :'g0'::numeric,
       (select monto from retail.compra_gastos where id = '${ID}'),
       (select count(*) from retail.movimientos_dinero) - :'movs_antes';`,
  "false|1|-10.00|10.00|14.00|0",
);

caso(
  "se corrige también en qué gastó: de «Comida» a «Otro: Saco de piñata», con su nota, y el rastro dice cada dato (antes y ahora)",
  `${ABRIR}${PLATA(100)}${GASTO(ID, "comida", "null", 3)}${FIRMA}
${CORREGIR("otro", "'Saco de piñata'", 3)} as r \\gset
reset role;
select g.concepto, g.nota, g.monto from retail.compra_gastos g where g.id = '${ID}';
select string_agg(c.campo || ':' || coalesce(c.antes, '-') || '>' || coalesce(c.despues, '-'), ',' order by c.campo)
  from retail.compra_gasto_correcciones c where c.gasto_id = '${ID}';
${FIRMA}
select jsonb_array_length(retail.fn_gasto_correcciones('${ID}')), retail.fn_gasto_correcciones('${ID}') -> 0 ->> 'quien' is not null;`,
  "otro|Saco de piñata|3.00 / concepto:comida>otro,nota:->Saco de piñata / 1|t",
);

caso(
  "se puede sumar una foto (o cambiarla), no quitarla; la ruta vieja queda en el rastro, y el rastro de la foto no manda rutas",
  `${ABRIR}${PLATA(100)}${GASTO()}${FIRMA}
${CORREGIR("comida", "null", 4, "'gastos/a.jpg'", L(1))} \\g /dev/null
${CORREGIR("comida", "null", 4, "'gastos/b.jpg'", L(2))} \\g /dev/null
-- Sin foto en la corrección: la que tenía se queda.
${CORREGIR("comida", "null", 5, "null", L(3))} \\g /dev/null
reset role;
select foto_ruta, monto from retail.compra_gastos where id = '${ID}';
select string_agg(coalesce(c.antes, '-') || '>' || coalesce(c.despues, '-'), ',' order by c.lote) from retail.compra_gasto_correcciones c where c.gasto_id = '${ID}' and c.campo = 'foto';
${FIRMA}
select (retail.fn_gasto_correcciones('${ID}')::text like '%gastos/%');`,
  "gastos/b.jpg|5.00 / ->gastos/a.jpg,gastos/a.jpg>gastos/b.jpg / f",
);

caso(
  "todo o nada: monto en cero o con tres decimales, «Otro» sin nota, concepto raro, foto de otra carpeta y «no cambiaste nada» no dejan nada escrito",
  `${ABRIR}${PLATA(100)}${GASTO()}${FIRMA}
select ${hint(CORREGIR("comida", "null", 0, "null", L(1)))}, ${hint(CORREGIR("comida", "null", 5.123, "null", L(2)))},
       ${hint(CORREGIR("otro", "null", 5, "null", L(3)))}, ${hint(CORREGIR("zapatos", "null", 5, "null", L(4)))},
       ${hint(CORREGIR("comida", "null", 5, "'papeles/x.jpg'", L(5)))}, ${hint(CORREGIR("comida", "null", 4, "null", L(6)))};
reset role;
select (select monto from retail.compra_gastos where id = '${ID}'), (select count(*) from retail.compra_gasto_correcciones);`,
  "monto_invalido|monto_invalido|gasto_rapido_sin_nota|gasto_rapido_concepto|gasto_rapido_foto|gasto_corregir_sin_cambios / 4.00|0",
);

caso(
  "dos toques con el mismo lote no corrigen dos veces (devuelve ya_estaba); el mismo lote en otro gasto se rechaza",
  `${ABRIR}${PLATA(100)}${GASTO()}${GASTO(OTRO, "taxi", "null", 6)}${FIRMA}
${CORREGIR("comida", "null", 14, "null", L(1))} \\g /dev/null
${CORREGIR("comida", "null", 99, "null", L(1))} as r2 \\gset
select :'r2'::jsonb ->> 'ya_estaba';
select ${hint(CORREGIR("taxi", "null", 7, "null", L(1), OTRO))};
reset role;
select (select monto from retail.compra_gastos where id = '${ID}');`,
  "true / gasto_corregir_otro_lote / 14.00",
);

caso(
  "uno que Compras ya revisó (o se anuló) no se corrige: gasto_corregir_revisado / gasto_corregir_anulado, y nada cambia",
  `${ABRIR}${PLATA(100)}${GASTO()}${GASTO(OTRO, "taxi", "null", 6)}reset role;
update retail.compra_gastos set estado = 'completado' where id = '${ID}';
update retail.compra_gastos set estado = 'anulado' where id = '${OTRO}';
${FIRMA}
select ${hint(CORREGIR("comida", "null", 9, "null", L(1)))}, ${hint(CORREGIR("taxi", "null", 9, "null", L(2), OTRO))},
       (retail.fn_gasto_para_corregir('${ID}') ->> 'se_puede'), (retail.fn_gasto_para_corregir('${ID}') ->> 'motivo');
reset role;
select (select monto from retail.compra_gastos where id = '${ID}'), (select count(*) from retail.compra_gasto_correcciones);`,
  "gasto_corregir_revisado|gasto_corregir_anulado|false|revisado / 4.00|0",
);

caso(
  "con la ronda cerrada no se corrige (gasto_corregir_ronda_cerrada); reabriéndola sí, y al cerrar de nuevo el monto sale ya corregido",
  `${ABRIR}${PLATA(40)}${GASTO()}${CERRAR("se_queda")}${FIRMA}
select ${hint(CORREGIR("comida", "null", 14))}, (retail.fn_gasto_para_corregir('${ID}') ->> 'motivo');
${REABRIR}${FIRMA}
${CORREGIR("comida", "null", 14)} \\g /dev/null
${CERRAR("devuelve")}reset role;
select k.decision, k.monto from retail.compra_cierres k where k.ronda_id = :'ronda';`,
  "gasto_corregir_ronda_cerrada|ronda_cerrada / devuelve|26.00",
);

caso(
  "un gasto de antes de las rondas (sin ronda) no se corrige (gasto_corregir_sin_ronda)",
  `${ABRIR}${PLATA(100)}${GASTO()}reset role;
alter table retail.compra_gastos disable trigger compra_gastos_ronda_fija;
update retail.compra_gastos set ronda_id = null where id = '${ID}';
alter table retail.compra_gastos enable trigger compra_gastos_ronda_fija;
${FIRMA}
select ${hint(CORREGIR("comida", "null", 9))};`,
  "gasto_corregir_sin_ronda",
);

caso(
  "fuera de la función nada cambia: lo anotado no se edita a mano, no se borra, la marca de OTRO gasto no sirve, y el estado sí lo cambia Compras",
  `${ABRIR}${PLATA(100)}${GASTO()}${GASTO(OTRO, "taxi", "null", 6)}reset role;
select pg_temp.intento($q$update retail.compra_gastos set monto = 99 where id = '${ID}'$q$) like '%Lo que anotó la compradora no cambia%',
       pg_temp.intento($q$update retail.compra_gastos set concepto = 'taxi' where id = '${ID}'$q$) like '%Lo que anotó la compradora no cambia%',
       pg_temp.intento($q$delete from retail.compra_gastos where id = '${ID}'$q$) like '%no se borra%',
       pg_temp.intento($q$update retail.compra_gastos set fecha = fecha + 1 where id = '${ID}'$q$) like '%Lo que anotó la compradora no cambia%';
select set_config('retail.gasto_corrigiendo', '${OTRO}', true) \\g /dev/null
select pg_temp.intento($q$update retail.compra_gastos set monto = 99 where id = '${ID}'$q$) like '%Lo que anotó la compradora no cambia%';
-- Con la marca de SU gasto sí cambia el monto, pero nunca quién lo anotó.
select set_config('retail.gasto_corrigiendo', '${ID}', true) \\g /dev/null
select pg_temp.intento($q$update retail.compra_gastos set monto = 99 where id = '${ID}'$q$), pg_temp.intento($q$update retail.compra_gastos set fecha = fecha + 1 where id = '${ID}'$q$) like '%Lo que anotó la compradora no cambia%';
select set_config('retail.gasto_corrigiendo', '', true) \\g /dev/null
select pg_temp.intento($q$update retail.compra_gastos set estado = 'completado' where id = '${OTRO}'$q$);`,
  "t|t|t|t / t / SIN_ERROR|t / SIN_ERROR",
);

caso(
  "el rastro no se cambia ni se borra, ni siquiera por quien lo escribió, y la API no lo lee ni lo escribe",
  `${ABRIR}${PLATA(100)}${GASTO()}${FIRMA}
${CORREGIR("comida", "null", 14)} \\g /dev/null
reset role;
select pg_temp.intento($q$update retail.compra_gasto_correcciones set despues = '1'$q$) like '%no se cambia ni se borra%',
       pg_temp.intento($q$delete from retail.compra_gasto_correcciones$q$) like '%no se cambia ni se borra%',
       has_table_privilege('authenticated', 'retail.compra_gasto_correcciones', 'select'),
       has_table_privilege('authenticated', 'retail.compra_gasto_correcciones', 'insert');`,
  "t|t|f|f",
);

caso(
  "permisos: las tres funciones son de las cuentas con sesión (no de anon) y la regla interna no se llama desde la API",
  `select has_function_privilege('anon', 'retail.corregir_gasto_rapido(uuid,uuid,text,text,numeric,text)', 'execute'),
       has_function_privilege('authenticated', 'retail.corregir_gasto_rapido(uuid,uuid,text,text,numeric,text)', 'execute'),
       has_function_privilege('authenticated', 'retail.fn_gasto_para_corregir(uuid)', 'execute'),
       has_function_privilege('authenticated', 'retail.fn_gasto_correcciones(uuid)', 'execute'),
       has_function_privilege('authenticated', 'retail.fn_compra_gasto_corregible(uuid)', 'execute');`,
  "f|t|t|t|f",
);

caso(
  "las migraciones se pueden pegar dos veces: una sola clave de firma y un solo disparador de rastro",
  `select (select count(*) from retail.acciones_sin_responsable where clave = 'gasto_corregir'),
       (select count(*) from pg_trigger where tgrelid = 'retail.compra_gasto_correcciones'::regclass and tgname = 'compra_gasto_correcciones_inmutable');`,
  "1|1",
);

console.log(`\n${casos - fallas}/${casos} casos en verde${fallas ? ` — ${fallas} en rojo` : ""} (base: ${BASE})`);
process.exit(fallas ? 1 : 0);
