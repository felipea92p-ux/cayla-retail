#!/usr/bin/env node
/**
 * Tienda web ▸ el aviso en el celular de la sede cuando llega un pedido web (ADR-0582) contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. `20261030150000_pedidos_web_push_aparatos.sql`:
 *   A. Cada pedido que nace deja UNA ficha en la cola, y si la cola no se puede escribir el pedido nace igual.
 *   B. Activar pide lo mismo que atender un pedido: sesión, el módulo «Pedidos web» y operar esa sede; una dirección mala no entra.
 *   C. El envío solo lleva los teléfonos de la sede del pedido, con su número, su sede, cuántas prendas, su total y su foto; marcada
 *      como enviada, la ficha no vuelve a salir.
 *   D. A quien le quitan el módulo, su teléfono deja de sonar sin que nadie lo apague, y la sesión queda como estaba.
 *   E. Una ficha de más de dos horas, o de un pedido anulado, se cierra sin enviar; una que falla cinco veces no vuelve.
 *   F. El mismo teléfono activado de nuevo se mueve de sede (una sola fila); apagado, deja de estar.
 *   G. La migración se puede pegar dos veces.
 *
 * CÓMO. Como `pedidos_web_erp.mjs`: cada escenario en su transacción y ROLLBACK (el Postgres local lo comparten los worktrees), con
 * prendas y un cliente «ZZ» nuevos. Los errores esperados se reconocen por su HINT. `APLICAR_ANTES=<migración>` la mete dentro de
 * cada transacción (probar antes de aplicar); sin la variable, prueba lo que la base ya tiene (lo que hace el CI).
 *
 * DA POR SENTADO: `Tienda Trujillo` y `Tienda Lima`, a Felipe como líder y a Micaela como integrante de Trujillo sin «Pedidos web»
 * (el seed), y el motor del pedido web aplicado.
 *
 * USO
 *   pnpm pruebas:pedidos-web-push
 *   pnpm pruebas:pedidos-web-push -- --contenedor supabase_db_<mi-pila>
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const MIGRACION = "supabase/migrations/20261030150000_pedidos_web_push_aparatos.sql";
const APLICAR_ANTES = process.env.APLICAR_ANTES
  ? process.env.APLICAR_ANTES.split(",").map((f) => readFileSync(f.trim(), "utf8")).join("\n")
  : "";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder: ve todos los módulos y opera todas las tiendas
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Trujillo, sin el módulo «Pedidos web»

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}

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
    if (detalle) console.log(`    ${String(detalle).trim().split("\n").slice(0, 8).join("\n    ")}`);
  }
}
// La ÚLTIMA línea de la salida es el veredicto del escenario.
function esperarValor(nombre, r, esperado) {
  const ultima = r.ok ? r.salida.split("\n").pop() : null;
  esperar(nombre, r.ok && ultima === esperado, r.ok ? `dio «${ultima}», se esperaba «${esperado}»` : r.mensaje);
}

// Una dirección de avisos inventada pero con la forma de las de verdad (y sus dos claves).
const aparato = (n) => [`https://fcm.googleapis.com/fcm/send/zz-prueba-${n}-${"x".repeat(40)}`, "B".repeat(87), "a".repeat(22)];
const activar = (ubic, n) => {
  const [e, p, a] = aparato(n);
  return `retail.pedidos_web_push_activar(:'${ubic}', '${e}', '${p}', '${a}')`;
};
const activarSql = (ubic, n) => {
  const [e, p, a] = aparato(n);
  return `format('select retail.pedidos_web_push_activar(%L, %L, %L, %L)', :'${ubic}', '${e}', '${p}', '${a}')`;
};

const PREPARAR = `
begin;
${APLICAR_ANTES}
set local request.jwt.claim.sub = '${FELIPE}';
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
insert into retail.productos (referencia, estado, marca_id, proveedor_id)
  select 'ZZ Pedido web push', 'activo', mp.marca_id, mp.proveedor_id from retail.marca_proveedores mp order by mp.created_at limit 1
  returning id as p1 \\gset
insert into retail.variantes (producto_id, sku, precio, costo, activo) values (:'p1', 'ZZ-PWP-1', 100, 40, true) returning id as v1 \\gset
insert into retail.clientas (nombre, telefono_whatsapp) values ('ZZ Cliente pedidos web push', '999888772') returning id as cli \\gset
create function pg_temp.probar(p_sql text) returns text language plpgsql as $f$
declare v_hint text; v_msg text;
begin
  begin
    execute p_sql;
    raise exception 'PROBAR_OK';
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint, v_msg = message_text;
    if v_msg = 'PROBAR_OK' then return 'ok'; end if;
    return 'error|' || coalesce(v_hint, '') || '|' || v_msg;
  end;
end $f$;
-- Lo que el envío devuelve para UN pedido (o null si no salió).
create function pg_temp.aviso(p_avisos jsonb, p_pedido uuid) returns jsonb language sql as $f$
  select a from jsonb_array_elements(p_avisos -> 'avisos') a where (a ->> 'pedido_id')::uuid = p_pedido
$f$;
-- Micaela con «Pedidos web» en su rol (solo en esta transacción).
create function pg_temp.dar_modulo_a_micaela() returns void language sql as $f$
  insert into retail.rol_modulos (rol_id, modulo)
  select c.rol_id, 'pedidos_web' from retail.colaboradores c join public.personas p on p.id = c.persona_id
   where p.auth_user_id = '${MICAELA}' on conflict do nothing
$f$;
`;
const separar = (alias, ubic = "tru") => `
select (retail.crear_pedido_web(:'cli', :'${ubic}', jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'precio_lista', 100))) ->> 'pedido_id') as ${alias} \\gset
`;
const escenario = (cuerpo) => correr(`${PREPARAR}\n${cuerpo}\nrollback;`);

// ---- A. La ficha ------------------------------------------------------------------------------------------------------------------
esperarValor(
  "A1 · un pedido nuevo deja una sola ficha, pendiente y sin intentos",
  escenario(`${separar("w1")}
select count(*) || '|' || bool_and(enviado_en is null) || '|' || sum(intentos) from retail.pedidos_web_push_envios where pedido_id = :'w1';`),
  "1|true|0",
);
esperarValor(
  "A2 · sin la cola, el pedido nace igual (el aviso no lo tumba)",
  escenario(`alter table retail.pedidos_web_push_envios rename to pedidos_web_push_envios_fuera;
${separar("w1")}
select (select count(*) from retail.pedidos_web where id = :'w1')::text;`),
  "1",
);

// ---- B. Activar -------------------------------------------------------------------------------------------------------------------
esperarValor(
  "B1 · el líder activa su teléfono para Trujillo",
  escenario(`select ${activar("tru", 1)} ->> 'estado' as e \\gset
select :'e' || '|' || (select count(*) from retail.pedidos_web_push_aparatos where ubicacion_id = :'tru' and auth_user_id = '${FELIPE}');`),
  "ok|1",
);
esperarValor(
  "B2 · sin «Pedidos web» no se activa; con el módulo, su sede sí y otra no; sin sesión ni con una dirección mala, tampoco",
  escenario(`set local request.jwt.claim.sub = '${MICAELA}';
select split_part(pg_temp.probar(${activarSql("tru", 2)}), '|', 2) as sin_modulo \\gset
select pg_temp.dar_modulo_a_micaela();
select pg_temp.probar(${activarSql("tru", 2)}) as su_sede \\gset
select split_part(pg_temp.probar(${activarSql("lim", 3)}), '|', 2) as otra \\gset
select split_part(pg_temp.probar(format('select retail.pedidos_web_push_activar(%L, %L, %L, %L)', :'tru', 'http://no-segura', 'x', 'y')), '|', 2) as mala \\gset
set local request.jwt.claim.sub = '';
select split_part(pg_temp.probar(${activarSql("tru", 4)}), '|', 2) as anonimo \\gset
select :'sin_modulo' || '|' || :'su_sede' || '|' || :'otra' || '|' || :'mala' || '|' || :'anonimo';`),
  "pedido_web_sin_modulo|ok|pedido_web_otra_tienda|push_invalido|push_sin_sesion",
);

// ---- C. El envío ------------------------------------------------------------------------------------------------------------------
esperarValor(
  "C1 · el aviso de un pedido de Trujillo va solo al teléfono de Trujillo, con número, sede, prendas, total y un intento",
  escenario(`select ${activar("tru", 1)} is not null as _a \\gset
select ${activar("lim", 2)} is not null as _b \\gset
${separar("w1")}
select pg_temp.aviso(retail.fn_pedidos_web_push_reclamar(50), :'w1') as av \\gset
select jsonb_array_length(:'av'::jsonb -> 'aparatos') || '|' || ((:'av'::jsonb -> 'aparatos' -> 0 ->> 'endpoint') like '%zz-prueba-1-%')
    || '|' || (:'av'::jsonb ->> 'codigo' like 'W-%') || '|' || (:'av'::jsonb ->> 'sede') || '|' || (:'av'::jsonb ->> 'prendas')
    || '|' || (:'av'::jsonb ->> 'total') || '|' || (:'av'::jsonb ->> 'intentos') || '|' || (:'av'::jsonb ? 'foto');`),
  "1|true|true|Tienda Trujillo|1|100.00|1|true",
);
esperarValor(
  "C2 · marcada como enviada, la ficha no vuelve a salir",
  escenario(`select ${activar("tru", 1)} is not null as _a \\gset
${separar("w1")}
select pg_temp.aviso(retail.fn_pedidos_web_push_reclamar(50), :'w1') ->> 'id' as envio \\gset
select retail.fn_pedidos_web_push_marcar_enviado(:'envio') is not null as _m \\gset
select (pg_temp.aviso(retail.fn_pedidos_web_push_reclamar(50), :'w1') is null)::text;`),
  "true",
);

// ---- D. Quien pierde el acceso deja de recibir ------------------------------------------------------------------------------------
esperarValor(
  "D1 · sin el módulo, el teléfono de Micaela ya no recibe, y la sesión vuelve a ser la de antes",
  escenario(`set local request.jwt.claim.sub = '${MICAELA}';
select pg_temp.dar_modulo_a_micaela();
select ${activar("tru", 5)} is not null as _a \\gset
set local request.jwt.claim.sub = '${FELIPE}';
${separar("w1")}
delete from retail.rol_modulos rm using retail.colaboradores c, public.personas p
 where p.auth_user_id = '${MICAELA}' and c.persona_id = p.id and rm.rol_id = c.rol_id and rm.modulo = 'pedidos_web';
select jsonb_array_length(pg_temp.aviso(retail.fn_pedidos_web_push_reclamar(50), :'w1') -> 'aparatos') || '|' || (auth.uid() = '${FELIPE}');`),
  "0|true",
);

// ---- E. Lo viejo, lo cerrado y lo que falla siempre -------------------------------------------------------------------------------
esperarValor(
  "E1 · una ficha de más de dos horas y la de un pedido que no se pudo confirmar (anulado) se cierran sin enviar",
  escenario(`select ${activar("tru", 1)} is not null as _a \\gset
${separar("w1")}
${separar("w2")}
update retail.pedidos_web_push_envios set creado_en = now() - interval '3 hours' where pedido_id = :'w1';
select retail.no_confirmar_pedido_web(:'w2', 'cliente_desistio') is not null as _x \\gset
select retail.fn_pedidos_web_push_reclamar(50) as r \\gset
select (pg_temp.aviso(:'r'::jsonb, :'w1') is null) || '|' || (pg_temp.aviso(:'r'::jsonb, :'w2') is null)
    || '|' || (select count(*) from retail.pedidos_web_push_envios where pedido_id in (:'w1', :'w2') and enviado_en is not null);`),
  "true|true|2",
);
esperarValor(
  "E2 · una ficha que falla cinco veces no vuelve a salir",
  escenario(`select ${activar("tru", 1)} is not null as _a \\gset
${separar("w1")}
select retail.fn_pedidos_web_push_reclamar(50) is not null from generate_series(1, 5);
select (pg_temp.aviso(retail.fn_pedidos_web_push_reclamar(50), :'w1') is null) || '|'
    || (select intentos from retail.pedidos_web_push_envios where pedido_id = :'w1');`),
  "true|5",
);

// ---- F. El mismo teléfono ---------------------------------------------------------------------------------------------------------
esperarValor(
  "F1 · el mismo teléfono activado otra vez se muda de sede; su estado lo dice; apagado, deja de estar",
  escenario(`select ${activar("tru", 1)} is not null as _a \\gset
select ${activar("lim", 1)} is not null as _b \\gset
select retail.fn_pedidos_web_push_estado('${aparato(1)[0]}') as est \\gset
select count(*) as filas from retail.pedidos_web_push_aparatos where endpoint like '%zz-prueba-1-%' \\gset
select retail.pedidos_web_push_apagar('${aparato(1)[0]}') ->> 'quitados' as q \\gset
select :'filas' || '|' || (:'est'::jsonb ->> 'activo')
    || '|' || ((:'est'::jsonb ->> 'ubicacion_id') = :'lim') || '|' || :'q'
    || '|' || (retail.fn_pedidos_web_push_estado('${aparato(1)[0]}') ->> 'activo')
    || '|' || (select count(*) from retail.pedidos_web_push_aparatos where endpoint like '%zz-prueba-1-%');`),
  "1|true|true|1|false|0",
);

// ---- G. Pegarla dos veces ---------------------------------------------------------------------------------------------------------
const sql = readFileSync(MIGRACION, "utf8");
const dosVeces = correr(`begin;\n${sql}\n${sql}\nselect 'ok';\nrollback;`);
esperarValor("G1 · la migración se puede pegar dos veces", dosVeces, "ok");

console.log(`\n${total - fallos} de ${total} pruebas pasan.`);
if (fallos) process.exit(1);
