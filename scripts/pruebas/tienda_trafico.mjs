#!/usr/bin/env node
/**
 * Tienda web ▸ Tráfico: cómo se anotan los pasos (ADR-0495, actividad 1) contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. `20261023230000_trafico_web.sql`:
 *   1. «Entró» guarda el camino y el departamento; un camino fuera de la lista no se anota y un departamento raro queda vacío.
 *   2. «Vio prenda», «eligió talla» y «a la bolsa» solo de una prenda que existe, y la talla tiene que ser de esa prenda.
 *   3. «Separó» solo de un pedido recién creado, y cada pedido una sola vez (un «Separar» reintentado no cuenta dos).
 *   4. La hora la pone la base (ahora − hace_ms); un paso de hace más de 6 horas no se anota.
 *   5. Como mucho 20 pasos por envío; lo que no calza (basura, un paso 7, un id mal formado) se descarta sin error.
 *   6. La tienda (`tienda_web`) no puede leer ni escribir la tabla directo; un visitante del ERP no puede llamar a la función.
 *   7. Lo anotado no se edita, no se borra ni se vacía.
 *   8. La migración se puede pegar dos veces.
 *
 * CÓMO. Cada escenario corre en su transacción con ROLLBACK: nunca se commitea nada en el Postgres local que comparten los worktrees.
 * Para actuar como la tienda, quien corre la prueba se da el rol `tienda_web` dentro de la transacción (se revierte).
 *
 * DA POR SENTADO: al menos dos prendas con variantes, una clienta y una tienda (el seed).
 *
 * USO
 *   pnpm pruebas:tienda-trafico    → necesita el stack local (`npx supabase start`)
 *   pnpm pruebas:tienda-trafico -- --contenedor supabase_db_<mi-pila>   → contra una pila propia
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const MIGRACION = readFileSync("supabase/migrations/20261023230000_trafico_web.sql", "utf8");
const VISITANTE = "0b0b0b0b-0000-4000-8000-000000000001";

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

let fallos = 0;
let total = 0;
function esperar(nombre, ok, detalle) {
  total++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (detalle) console.log(`    ${String(detalle).trim().split("\n").slice(0, 6).join("\n    ")}`);
  }
}
function esperarValor(nombre, r, esperado) {
  esperar(nombre, r.ok && r.salida === esperado, r.ok ? `dio «${r.salida}», se esperaba «${esperado}»` : r.mensaje);
}

// Dos prendas con variantes, para probar «la talla es de otra prenda». Se guardan en variables de la sesión.
const PREPARAR = `
begin;
grant tienda_web to current_user with set true;
select set_config('t.prenda', (select p.id::text from retail.productos p where exists (select 1 from retail.variantes v where v.producto_id = p.id) order by p.codigo nulls last, p.id limit 1), true);
select set_config('t.talla', (select v.id::text from retail.variantes v where v.producto_id = current_setting('t.prenda')::uuid order by v.id limit 1), true);
select set_config('t.otra_talla', (select v.id::text from retail.variantes v where v.producto_id <> current_setting('t.prenda')::uuid order by v.id limit 1), true);
`;
const COMO_TIENDA = "set local role tienda_web;";
const COMO_ADMIN = "reset role;";
const anotar = (pasos, region = "null") => `select retail.tienda_anotar_pasos('${VISITANTE}', ${pasos}, ${region});`;
const pasosJson = (sql) => `jsonb_build_array(${sql})`;
// Lo que la prueba mira al final: solo la salida de la última consulta (las de preparar salen en líneas aparte).
const ultima = (r) => (r.ok ? { ok: true, salida: r.salida.split("\n").at(-1) } : r);

function escenario(cuerpo) {
  return ultima(correr(`${PREPARAR}\n\\o /dev/null\n${cuerpo.antes ?? ""}\n\\o\n${cuerpo.consulta}\nrollback;`));
}

// ---- 1. «Entró» ----
esperarValor(
  "«entró» guarda el camino y el departamento",
  escenario({
    antes: `${COMO_TIENDA} ${anotar(pasosJson(`jsonb_build_object('paso', 0, 'camino', 'instagram')`), "'PE-LAL'")} ${COMO_ADMIN}`,
    consulta: `select string_agg(paso || ':' || camino || ':' || coalesce(region, '-') || ':' || (producto_id is null), ',') from retail.trafico_web where visitante = '${VISITANTE}';`,
  }),
  "0:instagram:PE-LAL:true",
);
esperarValor(
  "un camino fuera de la lista no se anota",
  escenario({
    consulta: `${COMO_TIENDA} ${anotar(pasosJson(`jsonb_build_object('paso', 0, 'camino', 'facebook')`))}`,
  }),
  "0",
);
esperarValor(
  "un departamento raro queda vacío (nunca una ciudad ni texto suelto)",
  escenario({
    antes: `${COMO_TIENDA} ${anotar(pasosJson(`jsonb_build_object('paso', 0, 'camino', 'directo')`), "'Trujillo; drop table x'")} ${COMO_ADMIN}`,
    consulta: `select coalesce(region, 'vacio') from retail.trafico_web where visitante = '${VISITANTE}';`,
  }),
  "vacio",
);

// ---- 2. Prendas y tallas ----
esperarValor(
  "«vio prenda» de una prenda que existe se anota, sin departamento",
  escenario({
    antes: `${COMO_TIENDA} ${anotar(pasosJson(`jsonb_build_object('paso', 1, 'producto', current_setting('t.prenda'))`), "'PE-LIM'")} ${COMO_ADMIN}`,
    consulta: `select count(*) || ':' || count(region) from retail.trafico_web where visitante = '${VISITANTE}' and paso = 1;`,
  }),
  "1:0",
);
esperarValor(
  "una prenda que no existe no se anota",
  escenario({
    consulta: `${COMO_TIENDA} ${anotar(pasosJson(`jsonb_build_object('paso', 1, 'producto', '00000000-0000-4000-8000-00000000abcd')`))}`,
  }),
  "0",
);
esperarValor(
  "«eligió talla» con la talla de otra prenda no se anota; con la suya, sí",
  escenario({
    consulta: `${COMO_TIENDA} ${anotar(
      pasosJson(
        `jsonb_build_object('paso', 2, 'producto', current_setting('t.prenda'), 'variante', current_setting('t.otra_talla')),
         jsonb_build_object('paso', 2, 'producto', current_setting('t.prenda'), 'variante', current_setting('t.talla')),
         jsonb_build_object('paso', 3, 'producto', current_setting('t.prenda'), 'variante', current_setting('t.talla'))`,
      ),
    )}`,
  }),
  "2",
);
esperarValor(
  "«a la bolsa» sin talla no se anota",
  escenario({
    consulta: `${COMO_TIENDA} ${anotar(pasosJson(`jsonb_build_object('paso', 3, 'producto', current_setting('t.prenda'))`))}`,
  }),
  "0",
);

// ---- 3. Separó ----
const PEDIDO_NUEVO = `
insert into retail.pedidos_web (id, clienta_id, ubicacion_id, creado_en)
select '0b0b0b0b-0000-4000-8000-0000000000aa', (select id from retail.clientas order by id limit 1), (select id from retail.ubicaciones order by id limit 1), now();
insert into retail.pedidos_web (id, clienta_id, ubicacion_id, creado_en)
select '0b0b0b0b-0000-4000-8000-0000000000bb', (select id from retail.clientas order by id limit 1), (select id from retail.ubicaciones order by id limit 1), now() - interval '1 hour';
`;
esperarValor(
  "«separó» de un pedido recién creado se anota una sola vez; uno de hace una hora, no",
  escenario({
    antes: PEDIDO_NUEVO,
    consulta: `${COMO_TIENDA}
      select retail.tienda_anotar_pasos('${VISITANTE}', '[{"paso":4,"pedido":"0b0b0b0b-0000-4000-8000-0000000000aa"}]'::jsonb)
        || ',' || retail.tienda_anotar_pasos('${VISITANTE}', '[{"paso":4,"pedido":"0b0b0b0b-0000-4000-8000-0000000000aa"}]'::jsonb)
        || ',' || retail.tienda_anotar_pasos('${VISITANTE}', '[{"paso":4,"pedido":"0b0b0b0b-0000-4000-8000-0000000000bb"}]'::jsonb);`,
  }),
  "1,0,0",
);

// ---- 4. La hora ----
esperarValor(
  "la hora la pone la base: «hace 60 s» queda 60 s antes; más de 6 horas atrás no se anota",
  escenario({
    antes: `${COMO_TIENDA} ${anotar(
      pasosJson(
        `jsonb_build_object('paso', 0, 'camino', 'google', 'hace_ms', 60000),
         jsonb_build_object('paso', 0, 'camino', 'google', 'hace_ms', 30000000)`,
      ),
    )} ${COMO_ADMIN}`,
    consulta: `select count(*) || ':' || extract(epoch from (now() - min(ocurrio_en)))::int from retail.trafico_web where visitante = '${VISITANTE}';`,
  }),
  "1:60",
);

// ---- 5. Topes y basura ----
esperarValor(
  "como mucho 20 pasos por envío",
  escenario({
    consulta: `${COMO_TIENDA} select retail.tienda_anotar_pasos('${VISITANTE}', (select jsonb_agg(jsonb_build_object('paso', 0, 'camino', 'directo')) from generate_series(1, 25)));`,
  }),
  "20",
);
esperarValor(
  "la basura se descarta sin error (no es una lista, un texto, un paso 7, un id mal formado)",
  escenario({
    consulta: `${COMO_TIENDA}
      select retail.tienda_anotar_pasos('${VISITANTE}', '{"paso":0}'::jsonb)
        || ',' || retail.tienda_anotar_pasos('${VISITANTE}', '["hola", {"paso":7,"camino":"directo"}, {"paso":1,"producto":"------------------------------------"}, {"paso":"0","camino":"qr"}]'::jsonb)
        || ',' || retail.tienda_anotar_pasos(null, '[{"paso":0,"camino":"qr"}]'::jsonb);`,
  }),
  "0,1,0",
);

// ---- 6. La puerta ----
const DARSE_EL_ROL = "grant tienda_web to current_user with set true;";
const directo = correr(`begin; ${DARSE_EL_ROL} ${COMO_TIENDA} insert into retail.trafico_web (visitante, paso, camino) values ('${VISITANTE}', 0, 'directo'); rollback;`);
esperar("la tienda no escribe la tabla directo", !directo.ok && /permission denied/.test(directo.mensaje), directo.ok ? "se pudo insertar" : directo.mensaje);
const leer = correr(`begin; ${DARSE_EL_ROL} ${COMO_TIENDA} select count(*) from retail.trafico_web; rollback;`);
esperar("la tienda no lee la tabla directo", !leer.ok && /permission denied/.test(leer.mensaje), leer.ok ? "se pudo leer" : leer.mensaje);
for (const rol of ["anon", "authenticated"]) {
  const r = correr(`begin; set local role ${rol}; select retail.tienda_anotar_pasos('${VISITANTE}', '[]'::jsonb); rollback;`);
  esperar(`${rol} no puede llamar a la función`, !r.ok && /permission denied/.test(r.mensaje), r.ok ? "pudo llamarla" : r.mensaje);
}

// ---- 7. Solo se agrega ----
for (const [nombre, sql] of [
  ["no se edita", `update retail.trafico_web set camino = 'otros' where visitante = '${VISITANTE}';`],
  ["no se borra", `delete from retail.trafico_web where visitante = '${VISITANTE}';`],
  ["no se vacía", `truncate retail.trafico_web;`],
]) {
  const r = correr(`begin; ${DARSE_EL_ROL} ${COMO_TIENDA} ${anotar(pasosJson(`jsonb_build_object('paso', 0, 'camino', 'tiktok')`))} ${COMO_ADMIN} ${sql} rollback;`);
  esperar(`lo anotado ${nombre}`, !r.ok && /no se editan ni se borran/.test(r.mensaje), r.ok ? "se pudo" : r.mensaje);
}

// ---- 8. Se puede pegar dos veces ----
const dosVeces = correr(`begin;\n${MIGRACION}\n${MIGRACION}\nrollback;`);
esperar("la migración se puede pegar dos veces", dosVeces.ok, dosVeces.mensaje);

console.log(`\n${total - fallos} de ${total} bien.`);
if (fallos) process.exit(1);
