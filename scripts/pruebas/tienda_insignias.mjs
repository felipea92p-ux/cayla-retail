#!/usr/bin/env node
/**
 * Pruebas de las insignias en la ficha de la tienda (`20261023182000_tienda_ficha_trae_las_insignias.sql`, ADR-0489, Felipe 2026-10-23)
 * contra el Postgres local.
 *
 * QUÉ PRUEBA. `retail.fn_tienda_insignias(modelo, tienda)` decide qué insignias de Catálogo ▸ Insignias ve el cliente en la ficha de una
 * prenda, y `retail.tienda_ficha` las entrega en `prenda.insignias`:
 *   · una insignia marcada a mano en una variante que se ofrece, o de TODA la categoría del modelo, se ve; una que no lo alcanza, no;
 *   · inactiva, pendiente, o fuera de su vigencia (hoy, Lima; sus dos extremos cuentan) no se ve;
 *   · una insignia con descuento NO se dibuja aparte: con varias, la ficha trae UNA campaña —la de mayor %, que es la que baja el precio—
 *     y ninguna de ellas sale como insignia (el chip del descuento es el de la campaña);
 *   · una insignia de ciertas tiendas se ve en esas (con «Todas», si alguna es de la web) y en ninguna otra;
 *   · el orden es el de los grupos (Rotación, Artesanal, Campaña, General) y después el nombre;
 *   · como `tienda_web` (el único que llama a la ficha) todo funciona aunque la función de adentro no sea suya: la puerta no se abrió;
 *   · la migración se puede pegar dos veces y deja la línea una sola vez.
 *
 * CÓMO. Cada escenario en su propia transacción con ROLLBACK (como `campanas_por_sede.mjs`): la base compartida queda igual. Los datos
 * del modelo elegido (sus marcas de insignias y las de su categoría) se borran DENTRO de la transacción para partir limpio.
 *
 * DA POR SENTADO: el seed («Blusa Emma» con sus tallas y precio, Tienda Trujillo y Tienda Lima, y una sede que no es tienda: el Taller), a Felipe como líder (el seed:
 * sus etiquetas nacen aprobadas) y a Micaela como integrante (sus etiquetas nacen pendientes).
 *
 * PROBAR ANTES DE APLICAR. `APLICAR_ANTES=supabase/migrations/20261023182000_tienda_ficha_trae_las_insignias.sql` mete la migración dentro de
 * cada transacción (que se revierte). Sin la variable, prueba lo que la base ya tiene (lo que hace el CI).
 *
 * USO
 *   pnpm pruebas:tienda-insignias                                  → con las migraciones ya aplicadas en el Postgres local
 *   pnpm pruebas:tienda-insignias -- --contenedor supabase_db_<mi-pila>
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const MIGRACION = "supabase/migrations/20261023182000_tienda_ficha_trae_las_insignias.sql";
const APLICAR_ANTES = process.env.APLICAR_ANTES ? readFileSync(process.env.APLICAR_ANTES, "utf8") : "";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder: sus etiquetas nacen aprobadas
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante: sus etiquetas nacen pendientes

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
const ultimaLinea = (r) => (r.ok ? r.salida.split("\n").filter(Boolean).at(-1) ?? "" : "");
const esperarLinea = (nombre, r, esperado) => esperar(nombre, ultimaLinea(r) === esperado, r.ok ? `dio «${ultimaLinea(r)}», se esperaba «${esperado}»` : r.mensaje);

// El punto de partida de cada escenario, como el de `tienda_ficha.mjs`: la vitrina del seed está VACÍA, así que aquí se publica «Blusa Emma» (con
// Trujillo y Lima en la web, y el resto escondido) y se parte sin marcas de insignias en ella ni en su categoría. Todo dentro de la
// transacción: se revierte.
const PARTIR = (quien = FELIPE) => `begin;
${APLICAR_ANTES}
set local request.jwt.claim.sub = '${FELIPE}';
select retail.fn_hoy_lima() as hoy \\gset
update retail.vitrina_productos set publicado = false where publicado;
update retail.ubicacion_datos_web set mostrar = false where mostrar;
select id as pid from retail.productos where referencia = 'Blusa Emma' \\gset
select categoria_id as cat from retail.productos where id = :'pid' \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
update retail.ubicaciones set whatsapp_numero = '987000001' where id = :'tru';
update retail.ubicaciones set whatsapp_numero = '987000002' where id = :'lim';
insert into retail.ubicacion_datos_web (ubicacion_id, nombre_web, direccion, mostrar)
values (:'tru', 'ZZ Trujillo', 'Av. de prueba 1', true), (:'lim', 'ZZ Lima', 'Av. de prueba 2', true)
on conflict (ubicacion_id) do update set nombre_web = excluded.nombre_web, direccion = excluded.direccion, mostrar = true;
select retail.vitrina_mostrar(array[:'pid']::uuid[], true) \\gset
select id as v from retail.variantes where producto_id = :'pid' and activo order by id limit 1 \\gset
select (retail.fn_tienda_sedes_web())[1] as s1, (retail.fn_tienda_sedes_web())[2] as s2 \\gset
select id as fuera from retail.ubicaciones where id <> all (retail.fn_tienda_sedes_web()) order by id limit 1 \\gset
delete from retail.variante_etiquetas where variante_id in (select id from retail.variantes where producto_id = :'pid');
delete from retail.etiqueta_categorias where categoria_id = :'cat';
-- Todo lo anterior lo prepara Felipe (publicar pide el módulo Vitrina web); lo que sigue lo hace quien se pida.
set local request.jwt.claim.sub = '${quien}';
`;

const dia = (x) => (x === null ? "null" : `(:'hoy'::date + ${x})`);
const SQL_ARRAY = (x) => (x === null ? "null" : `array[${x.map((s) => `:'${s}'`).join(", ")}]::uuid[]`);

/** Una insignia de prueba. `asignar`: 'variante' | 'categoria' | 'ninguna'. Devuelve el SQL que la crea y la deja en `:'e_<clave>'`. */
function insignia(clave, nombre, { estilo = "neutral", activo = true, pct = null, desde = null, hasta = null, sedes = null, asignar = "variante" } = {}) {
  const poner =
    asignar === "variante"
      ? `insert into retail.variante_etiquetas (variante_id, etiqueta_id) values (:'v', :'e_${clave}');`
      : asignar === "categoria"
        ? `insert into retail.etiqueta_categorias (etiqueta_id, categoria_id) values (:'e_${clave}', :'cat');`
        : "";
  return `insert into retail.etiquetas (nombre, estilo, activo, descuento_pct, vigente_desde, vigente_hasta, sedes_permitidas)
  values ('${nombre}', '${estilo}', ${activo}, ${pct ?? "null"}, ${dia(desde)}, ${dia(hasta)}, ${SQL_ARRAY(sedes)}) returning id as e_${clave} \\gset
${poner}
`;
}

/** Los nombres que ve el cliente como insignia, en su orden, separados por coma («-» si ninguno). Las que llevan descuento vienen marcadas
 *  (`descuento: true`) y no cuentan: la ficha no las dibuja aparte (su descuento es el chip de la campaña, ADR-0489 y ADR-0490). */
const VISTAS = (sede = "null") => `select coalesce(nullif((select string_agg(x ->> 'nombre', ',' order by o) filter (where x ->> 'descuento' = 'false')
    from jsonb_array_elements(retail.fn_tienda_insignias(:'pid', ${sede})) with ordinality t (x, o)), ''), '-');`;

function main() {
  const base = correr("select 1;");
  if (!base.ok) {
    console.error(`No hay Postgres local en el contenedor ${CONTENEDOR_LOCAL}. Levántalo con: npx supabase start`);
    process.exit(2);
  }
  if (!APLICAR_ANTES) {
    const hay = correr("select to_regprocedure('retail.fn_tienda_insignias(uuid, uuid)') is not null;");
    if (!hay.ok || hay.salida !== "t") {
      console.error(`Falta retail.fn_tienda_insignias: aplica ${MIGRACION} o corre con APLICAR_ANTES=${MIGRACION}`);
      process.exit(2);
    }
  }
  const modelo = correr(`${PARTIR()}select 'ok|' || coalesce(:'pid', '') || coalesce(:'v', '') || coalesce(:'s2', '');\nrollback;`);
  if (!modelo.ok || !ultimaLinea(modelo).startsWith("ok|") || ultimaLinea(modelo) === "ok|") {
    console.error("La prueba necesita el seed: «Blusa Emma» publicable, Tienda Trujillo y Tienda Lima en la web, y una sede fuera de la web.");
    console.error(modelo.ok ? modelo.salida : modelo.mensaje);
    process.exit(2);
  }

  // ---- 1. Sin insignias, no hay nada ----
  esperarLinea("un modelo sin insignias no trae ninguna", correr(`${PARTIR()}${VISTAS()}\nrollback;`), "-");

  // ---- 2. A mano en una variante, o de toda su categoría ----
  esperarLinea(
    "una insignia marcada a mano en una variante se ve",
    correr(`${PARTIR()}${insignia("a", "ZZ Marcada a mano")}${VISTAS()}\nrollback;`),
    "ZZ Marcada a mano",
  );
  esperarLinea(
    "una insignia de toda su categoría se ve, sin marcar variante por variante",
    correr(`${PARTIR()}${insignia("a", "ZZ De la categoría", { asignar: "categoria" })}${VISTAS()}\nrollback;`),
    "ZZ De la categoría",
  );
  esperarLinea(
    "una insignia que no alcanza al modelo no se ve",
    correr(`${PARTIR()}${insignia("a", "ZZ Sin prendas", { asignar: "ninguna" })}${VISTAS()}\nrollback;`),
    "-",
  );
  esperarLinea(
    "la insignia de otra categoría no se ve en este modelo",
    correr(`${PARTIR()}${insignia("a", "ZZ De otra categoría", { asignar: "ninguna" })}
select id as otra from retail.categorias where id <> :'cat' order by id limit 1 \\gset
insert into retail.etiqueta_categorias (etiqueta_id, categoria_id) values (:'e_a', :'otra');
${VISTAS()}\nrollback;`),
    "-",
  );

  // ---- 3. Activa, aprobada y vigente hoy ----
  esperarLinea(
    "una insignia desactivada no se ve",
    correr(`${PARTIR()}${insignia("a", "ZZ Desactivada", { activo: false })}${VISTAS()}\nrollback;`),
    "-",
  );
  esperarLinea(
    "una insignia que propuso una integrante y nadie aprobó no se ve",
    correr(`${PARTIR(MICAELA)}${insignia("a", "ZZ Pendiente")}
select (select estado from retail.etiquetas where id = :'e_a') || '|' || (${VISTAS().replace(/;$/, "")});
rollback;`),
    "pendiente|-",
  );
  esperarLinea(
    "vigencia: ya terminó, todavía no empieza, y los dos extremos (desde hoy, hasta hoy) cuentan",
    correr(`${PARTIR()}${insignia("a", "ZZ Terminó", { hasta: -1 })}${insignia("b", "ZZ Empieza mañana", { desde: 1 })}${insignia("c", "ZZ Hasta hoy", { hasta: 0 })}${insignia("d", "ZZ Desde hoy", { desde: 0 })}${insignia("e", "ZZ En curso", { desde: -3, hasta: 3 })}${VISTAS()}\nrollback;`),
    "ZZ Desde hoy,ZZ En curso,ZZ Hasta hoy",
  );
  esperarLinea(
    "una insignia marcada solo en una variante que ya no se ofrece no se ve",
    correr(`${PARTIR()}${insignia("a", "ZZ Variante apagada")}
-- La base no deja retirar una talla con prendas: el atajo vale solo dentro de esta transacción (se revierte).
set local session_replication_role = replica;
update retail.variantes set activo = false where id = :'v';
set local session_replication_role = origin;
${VISTAS()}\nrollback;`),
    "-",
  );

  // ---- 4. Con descuento no se dibuja aparte: la ficha trae UNA campaña, la que más le conviene al cliente ----
  esperarLinea(
    "una insignia con descuento no sale como insignia aparte",
    correr(`${PARTIR()}${insignia("a", "ZZ Con descuento", { pct: 15, desde: -1, hasta: 5 })}${insignia("b", "ZZ Sin descuento")}${VISTAS()}\nrollback;`),
    "ZZ Sin descuento",
  );
  {
    const r = correr(`${PARTIR()}${insignia("a", "ZZ Descuento 10", { estilo: "campana", pct: 10, desde: -1, hasta: 5 })}${insignia("b", "ZZ Descuento 30", { estilo: "campana", pct: 30, desde: -1, hasta: 5 })}${insignia("c", "ZZ Descuento 20", { estilo: "campana", pct: 20, desde: -1, hasta: 5 })}
select concat_ws('|',
  coalesce(retail.tienda_ficha(:'pid', null) -> 'prenda' -> 'campana' ->> 'nombre', 'sin campaña'),
  (select count(*) from jsonb_array_elements(retail.tienda_ficha(:'pid', null) -> 'prenda' -> 'insignias') x where x ->> 'descuento' = 'false'),
  (select count(*) from jsonb_array_elements(retail.tienda_ficha(:'pid', null) -> 'prenda' -> 'insignias') x where x ->> 'descuento' = 'true'),
  (select count(*) from jsonb_array_elements(retail.tienda_ficha(:'pid', null) -> 'prenda' -> 'variantes') x
    where x -> 'campana' ->> 'nombre' = 'ZZ Descuento 30'));
rollback;`);
    esperar(
      "con tres insignias con descuento, la ficha trae la de 30 % —la que baja el precio—; las tres vienen marcadas (descuento) y ninguna cuenta como insignia aparte",
      ultimaLinea(r).startsWith("ZZ Descuento 30|0|3|"),
      r.ok ? r.salida : r.mensaje,
    );
    // Si la campaña de 30 % llega a alguna talla, la tienda la dibuja con su chip; con más de una talla el número exacto no importa aquí.
    esperar("…y esa campaña de 30 % llega a las tallas del modelo", r.ok && Number(ultimaLinea(r).split("|")[3]) > 0, r.ok ? r.salida : r.mensaje);
  }

  // ---- 5. De ciertas tiendas ----
  {
    const r = correr(`${PARTIR()}${insignia("a", "ZZ Solo tienda 1", { sedes: ["s1"] })}
select concat_ws('|', (${VISTAS(":'s1'").replace(/;$/, "")}), (${VISTAS(":'s2'").replace(/;$/, "")}), (${VISTAS("null").replace(/;$/, "")}));
rollback;`);
    esperarLinea("una insignia de la tienda 1 se ve en ella y con «Todas», pero no en la tienda 2", r, "ZZ Solo tienda 1|-|ZZ Solo tienda 1");
  }
  {
    const r = correr(`${PARTIR()}${insignia("a", "ZZ De una tienda fuera de la web", { sedes: ["fuera"] })}
select concat_ws('|', (${VISTAS(":'s1'").replace(/;$/, "")}), (${VISTAS("null").replace(/;$/, "")}));
rollback;`);
    esperarLinea("una insignia solo de una sede que no está en la web no se ve (ni con «Todas»)", r, "-|-");
  }

  // ---- 6. El orden: Rotación, Artesanal, Campaña, General; dentro de cada grupo, por nombre ----
  esperarLinea(
    "salen por grupo (Rotación, Artesanal, Campaña, General) y por nombre",
    correr(`${PARTIR()}${insignia("a", "ZZ A general", { estilo: "neutral" })}${insignia("b", "ZZ B campaña", { estilo: "campana" })}${insignia("c", "ZZ C artesanal", { estilo: "positivo" })}${insignia("d", "ZZ D rotación", { estilo: "urgencia" })}${insignia("e", "ZZ A rotación", { estilo: "urgencia" })}${VISTAS()}\nrollback;`),
    "ZZ A rotación,ZZ D rotación,ZZ C artesanal,ZZ B campaña,ZZ A general",
  );

  // ---- 7. La ficha las entrega, y como `tienda_web` (lo único que la llama) funciona ----
  {
    const r = correr(`${PARTIR()}${insignia("a", "ZZ En la ficha", { estilo: "campana" })}
select jsonb_build_array(jsonb_build_object('id', :'e_a'::uuid, 'nombre', 'ZZ En la ficha', 'icono', null, 'descuento', false)) = (retail.tienda_ficha(:'pid', null) -> 'prenda' -> 'insignias') as igual \\gset
grant tienda_web to current_user with set true;
set local role tienda_web;
select concat_ws('|', :'igual', (retail.tienda_ficha(:'pid', null) -> 'prenda' -> 'insignias' -> 0 ->> 'nombre'));
rollback;`);
    esperarLinea("la ficha trae {id, nombre, icono, descuento} de la insignia (icono null: no se eligió dibujo; descuento false, ADR-0490), y como tienda_web también", r, "t|ZZ En la ficha");
  }
  {
    const r = correr(`${PARTIR()}${insignia("a", "ZZ Lo ve la tienda", { estilo: "campana" })}
grant tienda_web to current_user with set true;
set local role tienda_web;
select retail.fn_tienda_insignias(:'pid', null);
rollback;`);
    esperar("tienda_web no llama a fn_tienda_insignias directo (es interna)", !r.ok && /permission denied/.test(r.mensaje), r.ok ? `llamó: ${r.salida}` : r.mensaje);
  }
  esperarLinea(
    "ni anon ni authenticated llaman a la función interna, y la ficha sigue siendo solo de tienda_web",
    correr(`${PARTIR()}select concat_ws('|',
  has_function_privilege('anon', 'retail.fn_tienda_insignias(uuid, uuid)', 'EXECUTE'),
  has_function_privilege('authenticated', 'retail.fn_tienda_insignias(uuid, uuid)', 'EXECUTE'),
  has_function_privilege('tienda_web', 'retail.fn_tienda_insignias(uuid, uuid)', 'EXECUTE'),
  has_function_privilege('anon', 'retail.tienda_ficha(uuid, uuid)', 'EXECUTE'),
  has_function_privilege('authenticated', 'retail.tienda_ficha(uuid, uuid)', 'EXECUTE'),
  has_function_privilege('tienda_web', 'retail.tienda_ficha(uuid, uuid)', 'EXECUTE'));
rollback;`),
    "f|f|f|f|f|t",
  );

  // ---- 8. GUARDIÁN: la ficha sigue pidiendo las insignias, una sola vez ----
  esperarLinea(
    "tienda_ficha trae las insignias, una sola vez",
    correr(`${PARTIR()}select (length(def) - length(replace(def, 'retail.fn_tienda_insignias(p.id, v_sede)', ''))) / length('retail.fn_tienda_insignias(p.id, v_sede)')
  from (select pg_get_functiondef('retail.tienda_ficha(uuid, uuid)'::regprocedure) as def) x;
rollback;`),
    "1",
  );

  // ---- 9. La migración se puede pegar dos veces ----
  {
    const sql = readFileSync(MIGRACION, "utf8");
    const r = correr(`begin;\n${sql}\n${sql}\nselect (length(def) - length(replace(def, 'retail.fn_tienda_insignias(p.id, v_sede)', ''))) / length('retail.fn_tienda_insignias(p.id, v_sede)')
  from (select pg_get_functiondef('retail.tienda_ficha(uuid, uuid)'::regprocedure) as def) x;
rollback;`);
    esperarLinea("la migración se puede pegar dos veces y la línea queda una sola vez", r, "1");
  }

  console.log(`\n${total - fallos}/${total} pruebas pasaron`);
  process.exit(fallos ? 1 : 0);
}

main();
