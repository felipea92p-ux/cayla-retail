#!/usr/bin/env node
/**
 * Prueba de la plata que anota la compradora y confirma Compras (ADR-0480, actividad 2): `20261022235000_compras_simple_plata_anotada.sql`.
 *
 * QUÉ PROMETE
 *   · El módulo es la llave: anotar pide «Mi plata para compras» (`ordenes_compra`); confirmar y ver lo por confirmar, «Revisar compras»
 *     (`fondos`). Sin él, 42501.
 *   · Anotar no mueve plata: queda «por confirmar» y se ve en `fn_mi_plata_compras` (lo que tiene = su fondo + lo por confirmar).
 *   · El token sigue al contenido: el mismo token con lo mismo devuelve la misma fila; con otro monto, `token_reusado`; «Revisar si se
 *     guardó» (`fn_resolver_intento`) responde `hecho` por un envío guardado y `no_llego` por uno que no llegó.
 *   · «Ya tenía plata» solo la primera vez: antes de cualquier fondo y de cualquier otra plata anotada.
 *   · Confirmar una plata que le llegó la entrega a su fondo desde la cuenta elegida (el banco baja lo mismo que el fondo sube), con el
 *     monto que confirmó Compras; volver a confirmar lo mismo no duplica; con otros datos, `plata_ya_confirmada`.
 *   · Confirmar «ya tenía» es el saldo inicial de su fondo, con su fecha: no le resta a ningún banco, y «Quién tiene plata» (`fn_fondos`)
 *     cuadra (le entregaste − devolvió − gastó = tiene).
 *   · Nadie confirma su propia plata. Una plata anotada no se edita ni se borra.
 *   · «¿De qué banco salió?» (Felipe 2026-10-26, `20261026165000` y `20261026170000`): con una transferencia, la compradora indica el banco de
 *     la empresa; con otro medio o con algo que no es un banco que se usa, se rechaza (`banco_solo_transferencia`, `banco_invalido`); el
 *     banco viaja con el token (`token_reusado` si cambia); «Revisar compras» lo ve ya elegido; confirmar sigue eligiendo la cuenta de la que
 *     sale la plata (la indicación no mueve nada) y no cambia lo que dijo la compradora; los bancos los ve quien tiene «Mis compras» o
 *     «Revisar compras».
 *   · `anon` no ejecuta nada.
 *
 * CÓMO. Sesión simulada con `request.jwt.claim.sub`, la migración pegada dos veces (se puede pegar dos veces) y ROLLBACK siempre.
 *
 * USO
 *   pnpm pruebas:compras-simple-plata                                  → contra el Postgres local (supabase_db_cayla-retail)
 *   node scripts/pruebas/compras_simple_plata.mjs --contenedor <otro>  → contra otro contenedor
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
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20261022235000_compras_simple_plata_anotada.sql"), "utf8").replace(
  /^set lock_timeout.*$/gm,
  "",
);

// Las dos partes del banco (columna y funciones), tal como se pegan en producción: tras la migración de arriba, que recrea la anotar de 4
// parámetros, la parte 2 la retira. Pegadas dos veces, como todo lo demás.
const PARTES_DEL_BANCO = ["20261026165000_mis_compras_banco_de_la_plata_parte1_columna.sql", "20261026170000_mis_compras_banco_de_la_plata_parte2_funciones.sql"]
  .map((f) => readFileSync(join(RAIZ, "supabase", "migrations", f), "utf8").replace(/^set lock_timeout.*$/gm, ""))
  .join("\n");

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante — Tienda Trujillo

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}
// Con su cuenta firma ella: la clave de la acción va en el encabezado, como la manda la pantalla (decisión 39).
const como = (auth, clave) =>
  `reset role;\nset local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n` +
  `select set_config('request.headers', '${JSON.stringify(clave ? { "x-responsable-omitido": clave } : {})}', true) \\g /dev/null\n` +
  `set local role authenticated;\n`;

const PRELUDIO = `
begin;
${MIGRACION}
${MIGRACION}
${PARTES_DEL_BANCO}
${PARTES_DEL_BANCO}
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
select id as banco from retail.cuentas_dinero where tipo = 'banco' and archivada_en is null order by nombre limit 1 \\gset
select id as cajon from retail.cuentas_dinero where tipo = 'cajon' order by nombre limit 1 \\gset
select id as micaela from public.personas where auth_user_id = '${MICAELA}' \\gset
-- Lo que tiene una cuenta hoy, del mismo libro que «Cuentas y dinero».
create function pg_temp.saldo(p_id uuid) returns numeric language sql as $f$
  select coalesce((select c.saldo_inicial from retail.cuentas_dinero c where c.id = p_id), 0)
       + coalesce((select sum(l.monto) from retail.fn_dinero_libro(retail.fn_hoy_lima()) l where l.cuenta_id = p_id), 0);
$f$;
`;

// Micaela compra (y, si se pide, también revisa): un rol de prueba con esos módulos. Se va con el ROLLBACK.
const rolDeMicaela = (...modulos) => `
reset role;
insert into retail.roles (nombre) values ('ZZ Compradora ADR-0480') returning id as rol \\gset
${modulos.map((m) => `insert into retail.rol_modulos (rol_id, modulo) values (:'rol', '${m}');`).join("\n")}
update retail.colaboradores set rol_id = :'rol' where persona_id = :'micaela';
`;
// Micaela anota (con su token). Deja `:<nombre>` con el id.
const anota = (nombre, medio, monto, token) =>
  `${como(MICAELA, "plata_anotar")}select retail.anotar_plata_compras('${medio}', ${monto}, null, '${token}') as ${nombre} \\gset\n`;

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

const T1 = "aaaaaaaa-0480-4000-8000-000000000001";
const T2 = "aaaaaaaa-0480-4000-8000-000000000002";
const T3 = "aaaaaaaa-0480-4000-8000-000000000003";

caso(
  "sin «Mi plata para compras» no se anota ni se lee (42501); sin «Revisar compras» no se ve lo por confirmar",
  `${rolDeMicaela("existencias")}${como(MICAELA, "plata_anotar")}
select left(pg_temp.intento($q$select retail.anotar_plata_compras('yape_plin', 100, null, null)$q$), 5),
       left(pg_temp.intento('select retail.fn_mi_plata_compras()'), 5),
       left(pg_temp.intento('select retail.fn_plata_por_confirmar()'), 5);`,
  "42501|42501|42501",
);

caso(
  "anotar no mueve plata: queda por confirmar y su plata dice 0 en el fondo + 300 por confirmar; el mismo token no duplica",
  `${rolDeMicaela("ordenes_compra")}${anota("a", "yape_plin", 300, T1)}
select retail.anotar_plata_compras('yape_plin', 300, null, '${T1}') = :'a' as mismo \\gset
reset role;
select :'mismo', (select estado from retail.fondo_plata_anotada where id = :'a'),
       (select count(*) from retail.movimientos_dinero where cuenta_destino_id in (select id from retail.cuentas_dinero where persona_id = :'micaela')),
       (select count(*) from retail.cuentas_dinero where tipo = 'fondo' and persona_id = :'micaela');
${como(MICAELA, "plata_anotar")}
select (retail.fn_mi_plata_compras() ->> 'saldo')::numeric, (retail.fn_mi_plata_compras() ->> 'por_confirmar')::numeric,
       retail.fn_mi_plata_compras() ->> 'puede_ya_tenia', jsonb_array_length(retail.fn_mi_plata_compras() -> 'anotada');`,
  "t|por_confirmar|0|0 / 0|300.00|false|1",
);

caso(
  "el token sigue al contenido: el mismo token con otro monto es token_reusado; «Revisar si se guardó» dice hecho o no_llego",
  `${rolDeMicaela("ordenes_compra")}${anota("a", "efectivo", 50, T1)}
select split_part(pg_temp.intento($q$select retail.anotar_plata_compras('efectivo', 80, null, '${T1}')$q$), '|', 2);
select retail.fn_resolver_intento('anotar_plata_compras', '${T1}') ->> 'estado',
       retail.fn_resolver_intento('anotar_plata_compras', '${T2}') ->> 'estado';`,
  "token_reusado / hecho|no_llego",
);

caso(
  "validaciones: sin medio, monto cero o negativo, monto enorme, foto fuera de su carpeta",
  `${rolDeMicaela("ordenes_compra")}${como(MICAELA, "plata_anotar")}
select split_part(pg_temp.intento($q$select retail.anotar_plata_compras('cheque', 10, null, null)$q$), '|', 3),
       split_part(pg_temp.intento($q$select retail.anotar_plata_compras('yape_plin', 0, null, null)$q$), '|', 2),
       split_part(pg_temp.intento($q$select retail.anotar_plata_compras('yape_plin', -5, null, null)$q$), '|', 2),
       split_part(pg_temp.intento($q$select retail.anotar_plata_compras('yape_plin', 'NaN', null, null)$q$), '|', 2),
       split_part(pg_temp.intento($q$select retail.anotar_plata_compras('yape_plin', 2000000, null, null)$q$), '|', 2),
       split_part(pg_temp.intento($q$select retail.anotar_plata_compras('yape_plin', 10, 'otra/x.jpg', null)$q$), '|', 3);`,
  "Elige cómo te llegó la plata.|monto_invalido|monto_invalido|monto_invalido|monto_invalido|La foto del voucher no se subió bien: vuelve a elegirla.",
);

caso(
  "«ya tenía» solo la primera vez: primero sí; después, ni otro «ya tenía» ni tras otra plata",
  `${rolDeMicaela("ordenes_compra")}${anota("a", "ya_tenia", 150, T1)}
select split_part(pg_temp.intento($q$select retail.anotar_plata_compras('ya_tenia', 20, null, null)$q$), '|', 2),
       retail.fn_mi_plata_compras() ->> 'puede_ya_tenia';`,
  "ya_tenia_solo_primera_vez|false",
);

caso(
  "con otra plata ya anotada, «ya tenía» no se puede (no es la primera vez)",
  `${rolDeMicaela("ordenes_compra")}${anota("a", "transferencia", 100, T1)}
select split_part(pg_temp.intento($q$select retail.anotar_plata_compras('ya_tenia', 20, null, null)$q$), '|', 2);`,
  "ya_tenia_solo_primera_vez",
);

caso(
  "Compras confirma con otro monto desde el banco: el fondo nace con 280, el banco baja 280, la fila queda confirmada; repetir no duplica",
  `${rolDeMicaela("ordenes_compra")}${anota("a", "yape_plin", 300, T1)}
reset role;
select pg_temp.saldo(:'banco') as banco_antes \\gset
${como(FELIPE, "plata_confirmar")}
select (retail.confirmar_plata_compras(:'a', 280, :'banco') ->> 'monto')::numeric;
select (retail.confirmar_plata_compras(:'a', 280, :'banco') ->> 'monto')::numeric;
reset role;
select (select estado || ':' || monto || ':' || monto_confirmado from retail.fondo_plata_anotada where id = :'a'),
       pg_temp.saldo((select id from retail.cuentas_dinero where tipo = 'fondo' and persona_id = :'micaela')),
       :'banco_antes'::numeric - pg_temp.saldo(:'banco'),
       (select count(*) from retail.movimientos_dinero where tipo = 'entrega_fondo'
         and cuenta_destino_id = (select id from retail.cuentas_dinero where tipo = 'fondo' and persona_id = :'micaela'));`,
  "280.00 / 280.00 / confirmada:300.00:280.00|280.00|280.00|1",
);

caso(
  "confirmar de nuevo con otros datos dice plata_ya_confirmada; sin cuenta o desde un cajón, no se confirma",
  `${rolDeMicaela("ordenes_compra")}${anota("a", "yape_plin", 300, T1)}${anota("b", "efectivo", 40, T2)}
${como(FELIPE, "plata_confirmar")}
select retail.confirmar_plata_compras(:'a', null, :'banco') \\g /dev/null
-- Como postgres con la misma sesión simulada (la tabla no se lee directo con «authenticated»).
reset role;
select split_part(pg_temp.intento(format('select retail.confirmar_plata_compras(%L, 250, %L)', :'a', :'banco')), '|', 2),
       split_part(pg_temp.intento(format('select retail.confirmar_plata_compras(%L, null, null)', :'b')), '|', 3),
       left(pg_temp.intento(format('select retail.confirmar_plata_compras(%L, null, %L)', :'b', :'cajon')), 5),
       (select estado from retail.fondo_plata_anotada where id = :'b');`,
  "plata_ya_confirmada|Elige de qué cuenta salió la plata.|P0001|por_confirmar",
);

caso(
  "confirmar «ya tenía» es el saldo inicial de su fondo: no toca el banco, y «Quién tiene plata» cuadra (entregado 150 + 280, gastó 0)",
  `${rolDeMicaela("ordenes_compra")}${anota("a", "ya_tenia", 150, T1)}${anota("b", "transferencia", 280, T2)}
reset role;
select pg_temp.saldo(:'banco') as banco_antes \\gset
${como(FELIPE, "plata_confirmar")}
select retail.confirmar_plata_compras(:'b', null, :'banco') \\g /dev/null
select retail.confirmar_plata_compras(:'a', null, null) \\g /dev/null
select f.saldo || ':' || f.entregado || ':' || f.gastado from retail.fn_fondos() f where f.persona_id = :'micaela';
reset role;
select (select saldo_inicial || ':' || (saldo_desde = retail.fn_hoy_lima()) from retail.cuentas_dinero where tipo = 'fondo' and persona_id = :'micaela'),
       :'banco_antes'::numeric - pg_temp.saldo(:'banco'),
       (select movimiento_id is null and cuenta_origen_id is null from retail.fondo_plata_anotada where id = :'a');`,
  "430.00:430.00:0.00 / 150.00:true|280.00|t",
);

caso(
  "lo por confirmar se suma a lo que tiene para comprar; al confirmar pasa al fondo (sin contar dos veces)",
  `${rolDeMicaela("ordenes_compra")}${anota("a", "yape_plin", 300, T1)}${anota("b", "efectivo", 50, T2)}
${como(FELIPE, "plata_confirmar")}
select retail.confirmar_plata_compras(:'a', null, :'banco') \\g /dev/null
${como(MICAELA, null)}
select (retail.fn_mi_plata_compras() ->> 'saldo')::numeric + (retail.fn_mi_plata_compras() ->> 'por_confirmar')::numeric;`,
  "350.00",
);

caso(
  "nadie confirma su propia plata, aunque tenga «Revisar compras»",
  `${rolDeMicaela("ordenes_compra", "fondos")}${anota("a", "yape_plin", 300, T1)}
${como(MICAELA, "plata_confirmar")}
select split_part(pg_temp.intento(format('select retail.confirmar_plata_compras(%L, null, %L)', :'a', :'banco')), '|', 2);`,
  "fondo_propio",
);

caso(
  "Compras ve lo por confirmar con el nombre de la compradora; lo confirmado ya no aparece",
  `${rolDeMicaela("ordenes_compra")}${anota("a", "yape_plin", 300, T1)}${anota("b", "efectivo", 50, T2)}
${como(FELIPE, "plata_confirmar")}
select jsonb_array_length(retail.fn_plata_por_confirmar()), retail.fn_plata_por_confirmar() -> 0 ->> 'persona';
select retail.confirmar_plata_compras(:'a', null, :'banco') \\g /dev/null
select jsonb_array_length(retail.fn_plata_por_confirmar()), retail.fn_plata_por_confirmar() -> 0 ->> 'medio';`,
  (s) => /^2\|Micaela.* \/ 1\|efectivo$/.test(s),
);

caso(
  "una plata anotada no se edita ni se borra (ni como postgres)",
  `${rolDeMicaela("ordenes_compra")}${anota("a", "yape_plin", 300, T1)}
reset role;
select split_part(pg_temp.intento(format('update retail.fondo_plata_anotada set monto = 1 where id = %L', :'a')), '|', 3),
       split_part(pg_temp.intento(format('delete from retail.fondo_plata_anotada where id = %L', :'a')), '|', 3);`,
  "La plata anotada solo cambia al confirmarla, una vez.|La plata anotada no se borra.",
);

caso(
  "anon no ejecuta ninguna de las cinco; la tabla no se lee directo",
  `reset role;
select has_function_privilege('anon', 'retail.anotar_plata_compras(text, numeric, text, uuid, uuid)', 'execute'),
       has_function_privilege('anon', 'retail.fn_bancos_para_plata_compras()', 'execute'),
       has_function_privilege('anon', 'retail.confirmar_plata_compras(uuid, numeric, uuid)', 'execute'),
       has_function_privilege('anon', 'retail.fn_mi_plata_compras()', 'execute'),
       has_function_privilege('anon', 'retail.fn_plata_por_confirmar()', 'execute'),
       has_table_privilege('authenticated', 'retail.fondo_plata_anotada', 'select');`,
  "f|f|f|f|f|f",
);

// ---------- «¿De qué banco salió?» ----------
const anotaConBanco = (nombre, medio, monto, token, banco) =>
  `${como(MICAELA, "plata_anotar")}select retail.anotar_plata_compras('${medio}', ${monto}, null, '${token}', ${banco}) as ${nombre} \\gset\n`;

caso(
  "con una transferencia, el banco queda indicado y «Revisar compras» lo ve con su nombre; la plata sigue por confirmar y sin mover nada",
  `${rolDeMicaela("ordenes_compra")}${anotaConBanco("a", "transferencia", 500, T1, ":'banco'")}
reset role;
select nombre as nombre_banco from retail.cuentas_dinero where id = :'banco' \\gset
select (select cuenta_indicada_id = :'banco' from retail.fondo_plata_anotada where id = :'a'),
       (select estado || ':' || coalesce(cuenta_origen_id::text, 'sin') from retail.fondo_plata_anotada where id = :'a');
${como(FELIPE, "plata_confirmar")}
select x ->> 'cuenta_indicada' = :'nombre_banco', x ->> 'cuenta_indicada_id' = :'banco'::text
  from jsonb_array_elements(retail.fn_plata_por_confirmar()) x where x ->> 'id' = :'a'::text;`,
  "t|por_confirmar:sin / t|t",
);

caso(
  "sin banco (como antes, con 4 argumentos) también se anota: la indicación es opcional y «Revisar compras» la ve vacía",
  `${rolDeMicaela("ordenes_compra")}${anota("a", "transferencia", 90, T1)}
${como(FELIPE, "plata_confirmar")}
select x ->> 'cuenta_indicada_id' is null, x ->> 'cuenta_indicada' is null
  from jsonb_array_elements(retail.fn_plata_por_confirmar()) x where x ->> 'id' = :'a'::text;`,
  "t|t",
);

caso(
  "el banco solo con una transferencia; no vale una cuenta que no es un banco, una que no existe ni un banco archivado",
  `${rolDeMicaela("ordenes_compra")}${como(MICAELA, "plata_anotar")}
select split_part(pg_temp.intento(format($q$select retail.anotar_plata_compras('yape_plin', 10, null, null, %L)$q$, :'banco')), '|', 2),
       split_part(pg_temp.intento(format($q$select retail.anotar_plata_compras('efectivo', 10, null, null, %L)$q$, :'banco')), '|', 2),
       split_part(pg_temp.intento(format($q$select retail.anotar_plata_compras('transferencia', 10, null, null, %L)$q$, :'cajon')), '|', 2),
       split_part(pg_temp.intento($q$select retail.anotar_plata_compras('transferencia', 10, null, null, '00000000-0000-4000-8000-000000000000')$q$), '|', 2);
reset role;
update retail.cuentas_dinero set archivada_en = now() where id = :'banco';
${como(MICAELA, "plata_anotar")}
select split_part(pg_temp.intento(format($q$select retail.anotar_plata_compras('transferencia', 10, null, null, %L)$q$, :'banco')), '|', 2);`,
  "banco_solo_transferencia|banco_solo_transferencia|banco_invalido|banco_invalido / banco_invalido",
);

caso(
  "el banco viaja con el token: el mismo token con otro banco es token_reusado; con el mismo, devuelve la misma fila",
  `${rolDeMicaela("ordenes_compra")}${anotaConBanco("a", "transferencia", 70, T1, ":'banco'")}
select retail.anotar_plata_compras('transferencia', 70, null, '${T1}', :'banco') = :'a',
       split_part(pg_temp.intento(format($q$select retail.anotar_plata_compras('transferencia', 70, null, %L, null)$q$, '${T1}')), '|', 2);`,
  "t|token_reusado",
);

caso(
  "confirmar elige la cuenta de la que sale la plata (la indicación no manda) y lo que indicó la compradora queda tal cual",
  `${rolDeMicaela("ordenes_compra")}${anotaConBanco("a", "transferencia", 300, T1, ":'banco'")}
${como(FELIPE, "plata_confirmar")}
select retail.confirmar_plata_compras(:'a', null, :'banco') \\g /dev/null
reset role;
select (select cuenta_indicada_id = :'banco' and cuenta_origen_id = :'banco' and estado = 'confirmada' from retail.fondo_plata_anotada where id = :'a'),
       split_part(pg_temp.intento(format('update retail.fondo_plata_anotada set cuenta_indicada_id = null where id = %L', :'a')), '|', 3);`,
  "t|La plata anotada solo cambia al confirmarla, una vez.",
);

caso(
  "los bancos de la empresa los ve quien tiene «Mis compras» o «Revisar compras»; sin ninguno, 42501",
  `${rolDeMicaela("ordenes_compra")}${como(MICAELA, "plata_anotar")}
select jsonb_array_length(retail.fn_bancos_para_plata_compras()) >= 1,
       (select (x ->> 'id') = :'banco' from jsonb_array_elements(retail.fn_bancos_para_plata_compras()) x limit 1);`,
  "t|t",
);

caso(
  "sin «Mis compras» ni «Revisar compras», los bancos no se ven (42501)",
  `${rolDeMicaela("existencias")}${como(MICAELA, "plata_anotar")}
select left(pg_temp.intento('select retail.fn_bancos_para_plata_compras()'), 5);`,
  "42501",
);

console.log(`\n${casos - fallas}/${casos} casos en verde`);
if (fallas) process.exit(1);
