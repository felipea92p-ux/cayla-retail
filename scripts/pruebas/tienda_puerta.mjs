#!/usr/bin/env node
/**
 * La puerta angosta de la tienda online (ADR-0408, actividad 1) contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. `20261014220000_tienda_puerta_y_portada.sql`:
 *   1. El rol `tienda_web` no inicia sesión, no salta RLS ni crea nada, y no hereda ningún otro rol.
 *   2. No tiene permiso sobre ninguna tabla, vista ni secuencia de `retail`, y en el resto de la base no tiene nada que
 *      PUBLIC no tenga ya.
 *   3. Lo que `tienda_web` puede ejecutar y `anon` no son EXACTAMENTE las funciones `retail.tienda_*`: darle la conexión a
 *      la tienda no abre nada que un visitante anónimo del ERP no tenga ya, salvo su propia puerta.
 *   4. Cada `retail.tienda_*` es security definer, con su search_path fijo, y ni public, ni anon, ni authenticated la
 *      pueden llamar (una cuenta del ERP no se hace pasar por la tienda).
 *   5. `tienda_portada()` elige bien la campaña: solo estilo 'campana', activa, con descuento, vigente hoy en Lima y
 *      puesta a alguna prenda o categoría; la que termina primero; empate, mayor % y luego el nombre.
 *   6. Como `tienda_web`, la portada responde y las tablas se niegan.
 *
 * CÓMO. Las de permisos solo leen el catálogo. Las de la portada corren cada una en su transacción con ROLLBACK: apagan
 * las campañas que haya y crean las suyas («ZZ …»). Nunca se commitea nada en el Postgres local que comparten los
 * worktrees. Para actuar como `tienda_web`, quien corre la prueba se da ese rol dentro de la transacción (se revierte).
 * Si falla un permiso, la salida dice cuántos y de qué tipo, sin listar funciones ajenas a la tienda (el CI es público).
 *
 * PROBAR ANTES DE APLICAR. `APLICAR_ANTES=supabase/migrations/20261014220000_tienda_puerta_y_portada.sql` mete la migración
 * dentro de cada transacción de la portada (que se revierte). Sin la variable, prueba lo que la base ya tiene (lo que hace
 * el CI). El escenario «se puede volver a correr» la aplica dos veces seguidas.
 *
 * DA POR SENTADO: al menos una variante y una categoría, y a Felipe como líder (el seed): las campañas se crean a su nombre,
 * porque la base aprueba sola la etiqueta que crea un líder y una campaña pendiente no puede llevar descuento.
 *
 * USO
 *   pnpm pruebas:tienda-puerta    → necesita el stack local (`npx supabase start`)
 *   pnpm pruebas:tienda-puerta -- --contenedor supabase_db_<mi-pila>   → contra una pila propia
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const MIGRACION = "supabase/migrations/20261014220000_tienda_puerta_y_portada.sql";
const APLICAR_ANTES = process.env.APLICAR_ANTES ? readFileSync(process.env.APLICAR_ANTES, "utf8") : "";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder: sus etiquetas nacen aprobadas

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

// Los schemas del sistema quedan fuera: el catálogo de Postgres lo lee cualquiera, por diseño.
const FUERA_DEL_SISTEMA = `n.nspname not in ('pg_catalog', 'information_schema') and n.nspname not like 'pg\\_toast%' and n.nspname not like 'pg\\_temp%'`;

// ---- La portada: cada escenario parte sin campañas, con una prenda y una categoría a mano ----
const PREPARAR = `
begin;
${APLICAR_ANTES}
set local request.jwt.claim.sub = '${FELIPE}';
update retail.etiquetas set activo = false where estilo = 'campana' and activo;
select id as v from retail.variantes order by id limit 1 \\gset
select id as cat from retail.categorias order by id limit 1 \\gset
select retail.fn_hoy_lima() as hoy \\gset
`;
// Una campaña de prueba. `prenda`: 'variante' | 'categoria' | 'ninguna'.
// La base no deja que una etiqueta pendiente lleve descuento (etiquetas_descuento_solo_aprobada): ese caso no existe.
function campana(nombre, { estilo = "campana", activo = true, pct = 10, desde = "null", hasta = "null", prenda = "variante" } = {}) {
  const fecha = (x) => (x === "null" ? "null" : `(:'hoy'::date + ${x})`);
  const insertar = `insert into retail.etiquetas (nombre, estilo, activo, descuento_pct, vigente_desde, vigente_hasta)
  values ('${nombre}', '${estilo}', ${activo}, ${pct}, ${fecha(desde)}, ${fecha(hasta)}) returning id as etq \\gset`;
  const poner =
    prenda === "variante"
      ? `insert into retail.variante_etiquetas (variante_id, etiqueta_id) values (:'v', :'etq');`
      : prenda === "categoria"
        ? `insert into retail.etiqueta_categorias (etiqueta_id, categoria_id) values (:'etq', :'cat');`
        : "";
  return `${insertar}\n${poner}\n`;
}
const PORTADA = `select retail.tienda_portada()::text;\nrollback;`;
const NOMBRE = `select coalesce(retail.tienda_portada() -> 'campana' ->> 'nombre', 'ninguna');\nrollback;`;

function main() {
  const base = correr("select 1;");
  if (!base.ok) {
    console.error(`No hay Postgres local en el contenedor ${CONTENEDOR_LOCAL}. Levántalo con: npx supabase start`);
    process.exit(2);
  }
  if (!APLICAR_ANTES) {
    const hay = correr("select count(*) from pg_roles where rolname = 'tienda_web';");
    if (hay.salida !== "1") {
      console.error(`Falta el rol tienda_web: aplica ${MIGRACION} o corre con APLICAR_ANTES=${MIGRACION}`);
      process.exit(2);
    }
  }

  console.log("— El rol tienda_web —");
  if (APLICAR_ANTES) {
    console.log("  (con APLICAR_ANTES solo se prueba la portada: los permisos se miran en una base con la migración aplicada)");
  } else {
    esperarValor(
      "no inicia sesión, no es superusuario, no salta RLS ni crea roles, bases o réplicas",
      correr(`select rolcanlogin or rolsuper or rolcreaterole or rolcreatedb or rolbypassrls or rolreplication from pg_roles where rolname = 'tienda_web';`),
      "f",
    );
    esperarValor("no hereda ningún otro rol", correr(`select count(*) from pg_auth_members where member = 'tienda_web'::regrole;`), "0");
    esperarValor(
      "puede entrar a retail (para encontrar sus funciones) pero no crear nada ahí",
      correr(`select has_schema_privilege('tienda_web', 'retail', 'USAGE')::text || '|' || has_schema_privilege('tienda_web', 'retail', 'CREATE')::text;`),
      "true|false",
    );

    esperarValor(
      "ningún permiso sobre tablas, vistas ni secuencias de retail",
      correr(`
        select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'retail' and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
          and (case when c.relkind = 'S' then has_sequence_privilege('tienda_web', c.oid, 'USAGE, SELECT, UPDATE')
                    else has_table_privilege('tienda_web', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
                      or has_any_column_privilege('tienda_web', c.oid, 'SELECT, INSERT, UPDATE, REFERENCES') end);`),
      "0",
    );
    esperarValor(
      "en el resto de la base no tiene ningún permiso de tabla que PUBLIC no tenga",
      correr(`
        select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where ${FUERA_DEL_SISTEMA} and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
          and (case when c.relkind = 'S'
                 then has_sequence_privilege('tienda_web', c.oid, 'USAGE, SELECT, UPDATE') and not has_sequence_privilege('public', c.oid, 'USAGE, SELECT, UPDATE')
                 else (has_table_privilege('tienda_web', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
                       and not has_table_privilege('public', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'))
                   or (has_any_column_privilege('tienda_web', c.oid, 'SELECT, INSERT, UPDATE, REFERENCES')
                       and not has_any_column_privilege('public', c.oid, 'SELECT, INSERT, UPDATE, REFERENCES')) end);`),
      "0",
    );

    // Lo que tienda_web ejecuta y anon no: debe ser exactamente la lista de retail.tienda_*. Se cuenta, no se lista.
    const sobra = correr(`
      select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where ${FUERA_DEL_SISTEMA}
        and has_function_privilege('tienda_web', p.oid, 'EXECUTE') and not has_function_privilege('anon', p.oid, 'EXECUTE')
        and not (n.nspname = 'retail' and p.proname like 'tienda\\_%');`);
    esperarValor("no ejecuta ninguna función fuera de retail.tienda_* que anon no pueda ejecutar ya", sobra, "0");
    const falta = correr(`
      select coalesce(string_agg(p.oid::regprocedure::text, ', ' order by p.proname), '')
      from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname like 'tienda\\_%'
        and not has_function_privilege('tienda_web', p.oid, 'EXECUTE');`);
    esperarValor("ejecuta todas las retail.tienda_*", falta, "");

    const funciones = correr(`select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname like 'tienda\\_%';`);
    esperar("hay al menos una función de la tienda (tienda_portada)", funciones.ok && Number(funciones.salida) >= 1, funciones.mensaje ?? funciones.salida);
    esperarValor(
      "cada retail.tienda_* es security definer y fija su search_path",
      correr(`
        select coalesce(string_agg(p.oid::regprocedure::text, ', '), '') from pg_proc p
        where p.pronamespace = 'retail'::regnamespace and p.proname like 'tienda\\_%'
          and not (p.prosecdef and exists (select 1 from unnest(coalesce(p.proconfig, '{}')) x where x like 'search\\_path=%'));`),
      "",
    );
    esperarValor(
      "ni public, ni anon, ni authenticated llaman a una retail.tienda_*",
      correr(`
        select coalesce(string_agg(p.oid::regprocedure::text, ', '), '') from pg_proc p
        where p.pronamespace = 'retail'::regnamespace and p.proname like 'tienda\\_%'
          and (has_function_privilege('public', p.oid, 'EXECUTE') or has_function_privilege('anon', p.oid, 'EXECUTE')
               or has_function_privilege('authenticated', p.oid, 'EXECUTE'));`),
      "",
    );

    // Los usuarios con contraseña que heredan tienda_web (en local, tienda_web_local; en el CI, ninguno). Quien creó el rol
    // queda anotado como su administrador, sin heredarlo ni poder asumirlo (Postgres 16+): ese no cuenta.
    esperarValor(
      "quien hereda tienda_web no tiene poderes ni otros roles",
      correr(`
        select count(*) from pg_auth_members m join pg_roles r on r.oid = m.member
        where m.roleid = 'tienda_web'::regrole and (m.inherit_option or m.set_option)
          and (r.rolsuper or r.rolcreaterole or r.rolcreatedb or r.rolbypassrls or r.rolreplication
               or exists (select 1 from pg_auth_members o
                          where o.member = m.member and o.roleid <> 'tienda_web'::regrole and (o.inherit_option or o.set_option)));`),
      "0",
    );

    // Actuar como tienda_web de verdad: quien corre la prueba se da el rol dentro de la transacción.
    const COMO_TIENDA = `begin;\ngrant tienda_web to current_user with set true;\nset local role tienda_web;\n`;
    const portadaComoTienda = correr(`${COMO_TIENDA}select (retail.tienda_portada() ? 'campana')::text;\nrollback;`);
    esperarValor("como tienda_web, la portada responde", portadaComoTienda, "true");
    // Con las tablas que la tienda llena por sus funciones (las cuentas, y las recomendaciones de 20261015134000): ni esas las toca directo.
    for (const tabla of ["etiquetas", "variantes", "movimientos", "clientas", "cuentas_web", "recomendaciones_web"]) {
      const r = correr(`${COMO_TIENDA}select count(*) from retail.${tabla};\nrollback;`);
      esperar(`como tienda_web, leer retail.${tabla} se niega`, !r.ok && /permission denied/.test(r.mensaje), r.ok ? `leyó: ${r.salida}` : r.mensaje);
    }
    const escribir = correr(`${COMO_TIENDA}update retail.etiquetas set activo = activo where false;\nrollback;`);
    esperar("como tienda_web, escribir en retail.etiquetas se niega", !escribir.ok && /permission denied/.test(escribir.mensaje), escribir.ok ? "escribió" : escribir.mensaje);
    const recomendar = correr(`${COMO_TIENDA}insert into retail.recomendaciones_web (cuenta_web_id, clienta_id, texto, marca) values (gen_random_uuid(), gen_random_uuid(), 'Escrita a mano, sin su función', gen_random_uuid());\nrollback;`);
    esperar(
      "como tienda_web, escribir una recomendación a mano (sin tienda_recomendar) se niega",
      !recomendar.ok && /permission denied/.test(recomendar.mensaje),
      recomendar.ok ? "escribió" : recomendar.mensaje,
    );
  }

  console.log("— La campaña de la portada —");
  esperarValor("sin campañas vigentes, la portada no anuncia ninguna", correr(`${PREPARAR}${PORTADA}`), '{"campana": null}');
  esperarValor(
    "con una campaña: nombre, % y último día (fecha de Lima)",
    correr(`${PREPARAR}${campana("ZZ Aniversario (prueba)", { pct: 12, hasta: 7 })}
      select (retail.tienda_portada() -> 'campana') = jsonb_build_object('nombre', 'ZZ Aniversario (prueba)', 'pct', 12, 'hasta', (:'hoy'::date + 7)::text);
      rollback;`),
    "t",
  );
  esperarValor(
    "entre dos, la que termina primero (aunque descuente menos)",
    correr(`${PREPARAR}${campana("ZZ Larga", { pct: 30, hasta: 10 })}${campana("ZZ Corta", { pct: 10, hasta: 3 })}${NOMBRE}`),
    "ZZ Corta",
  );
  esperarValor(
    "una de urgencia («Para liquidar») no se anuncia aunque termine antes",
    correr(`${PREPARAR}${campana("ZZ Corta", { hasta: 3 })}${campana("ZZ Liquidar", { estilo: "urgencia", pct: 40, hasta: 1 })}${NOMBRE}`),
    "ZZ Corta",
  );
  for (const [caso, opciones] of [
    ["apagada", { activo: false }],
    ["sin descuento", { pct: "null" }],
    ["que empieza mañana", { desde: 1 }],
    ["que terminó ayer", { hasta: -1 }],
    ["sin ninguna prenda ni categoría", { prenda: "ninguna" }],
  ]) {
    esperarValor(
      `no se anuncia una campaña ${caso}`,
      correr(`${PREPARAR}${campana("ZZ Corta", { hasta: 5 })}${campana("ZZ Descartada", { hasta: 1, ...opciones })}${NOMBRE}`),
      "ZZ Corta",
    );
  }
  esperarValor(
    "una campaña puesta solo a una categoría sí se anuncia",
    correr(`${PREPARAR}${campana("ZZ Corta", { hasta: 5 })}${campana("ZZ Por categoría", { hasta: 2, prenda: "categoria" })}${NOMBRE}`),
    "ZZ Por categoría",
  );
  esperarValor(
    "la que termina hoy se anuncia todo el día",
    correr(`${PREPARAR}${campana("ZZ Corta", { hasta: 5 })}${campana("ZZ Hoy", { hasta: 0 })}${NOMBRE}`),
    "ZZ Hoy",
  );
  esperarValor(
    "una sin fecha de fin va después de las que tienen fecha",
    correr(`${PREPARAR}${campana("ZZ Sin fin", { pct: 50 })}${campana("ZZ Con fin", { hasta: 30 })}${NOMBRE}`),
    "ZZ Con fin",
  );
  esperarValor(
    "si solo hay una sin fecha de fin, se anuncia sin «hasta»",
    correr(`${PREPARAR}${campana("ZZ Sin fin")}
      select (retail.tienda_portada() -> 'campana' ->> 'nombre') || '|' || jsonb_typeof(retail.tienda_portada() -> 'campana' -> 'hasta');
      rollback;`),
    "ZZ Sin fin|null",
  );
  esperarValor(
    "empate de fecha: la de mayor descuento",
    correr(`${PREPARAR}${campana("ZZ A", { pct: 10, hasta: 4 })}${campana("ZZ B", { pct: 15, hasta: 4 })}${NOMBRE}`),
    "ZZ B",
  );
  esperarValor(
    "empate de fecha y descuento: por nombre",
    correr(`${PREPARAR}${campana("ZZ B", { pct: 10, hasta: 4 })}${campana("ZZ A", { pct: 10, hasta: 4 })}${NOMBRE}`),
    "ZZ A",
  );

  console.log("— La migración —");
  const sql = readFileSync(MIGRACION, "utf8");
  const dosVeces = correr(`begin;\n${sql}\n${sql}\nselect (retail.tienda_portada() ? 'campana')::text;\nrollback;`);
  esperarValor("se puede volver a correr (dos veces seguidas, como un segundo pegado)", dosVeces, "true");

  console.log(`\n${total - fallos}/${total} escenarios en verde.`);
  if (fallos > 0) process.exit(1);
}

main();
