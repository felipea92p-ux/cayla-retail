#!/usr/bin/env node
/**
 * «Arma el tuyo»: los looks que el cliente guarda desde el probador (ADR-0434, actividad 8) contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. `20261017044000_tienda_looks_guardados.sql`:
 *   1. Permisos: las cuatro funciones son security definer, con su search_path, y solo de `tienda_web`; las tablas no las lee nadie
 *      directo (tampoco la tienda).
 *   2. Guardar: de 2 a 4 prendas (modelo y color, sin repetir modelo); el nombre por omisión es el día de Lima («Look de …»); el mismo
 *      look en otro orden es el mismo (`nuevo: false`, el mismo id, sin escribir); lo que no se ve en la web o un color que no tiene
 *      activo no se guarda; sin cuenta, `sin_cuenta`; con la ficha archivada, `cuenta_inactiva`; el tope de 30.
 *   3. Quitar no borra (marca `quitado_en`), es idempotente y solo alcanza los looks propios; después, el mismo look se guarda de nuevo.
 *   4. Renombrar: 1 a 40 letras sin espacios de más; vacío o largo, `invalido`; el de otra cuenta, `no_esta`.
 *   5. Leer: los vivos, lo más nuevo primero, con sus prendas en su orden y si siguen en la web.
 *   6. Cerrar o eliminar la cuenta (anonimizar su ficha) quita sus looks vivos, como sus favoritos.
 *   7. La migración se puede volver a correr.
 *
 * CÓMO. Cada escenario corre en su transacción con ROLLBACK: nunca se commitea nada en el Postgres local que comparten los worktrees.
 *
 * PROBAR ANTES DE APLICAR. `APLICAR_ANTES=supabase/migrations/20261017044000_tienda_looks_guardados.sql` mete la migración dentro de
 * cada transacción. Sin la variable, prueba lo que la base ya tiene (lo que hace el CI).
 *
 * DA POR SENTADO: el seed («Blusa Emma» en BEI y NEG, «Pantalón Carla», «Falda Renata», «Vestido Sofía»), la tienda (20261014220000),
 * las cuentas web y los favoritos (20261015024000, 20261015055000) y la Vitrina (20261014225000).
 *
 * USO
 *   pnpm pruebas:tienda-looks-guardados    → necesita el stack local (`npx supabase start`)
 *   pnpm pruebas:tienda-looks-guardados -- --contenedor supabase_db_<mi-pila>
 */

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const MIGRACION = "supabase/migrations/20261017044000_tienda_looks_guardados.sql";
const APLICAR_ANTES = process.env.APLICAR_ANTES
  ? process.env.APLICAR_ANTES.split(",")
      .map((f) => f.trim())
      .filter(Boolean)
      .map((f) => readFileSync(f, "utf8"))
      .join("\n")
  : "";
const CORRIDA = randomUUID().slice(0, 8);
const U = { ana: randomUUID(), ceci: randomUUID(), nadie: randomUUID() };
const DNI = { ana: "09980001", ceci: "09980003" };
const CORREO = (quien) => `zz.look.${quien}.${CORRIDA}@ejemplo.com`;

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
    if (detalle) console.log(`    ${String(detalle).trim().split("\n").slice(0, 8).join("\n    ")}`);
  }
}
function esperarValor(nombre, r, esperado) {
  esperar(nombre, r.ok && r.salida === esperado, r.ok ? `dio «${r.salida}», se esperaba «${esperado}»` : r.mensaje);
}

// ---- El punto de partida: Emma, Carla y Renata publicadas; Ana con cuenta (ficha viva) y Ceci con cuenta (ficha archivada) ----
const PREPARAR = `
begin;
${APLICAR_ANTES}
update retail.vitrina_productos set publicado = false where publicado;
select id as emma from retail.productos where referencia = 'Blusa Emma' \\gset
select id as carla from retail.productos where referencia = 'Pantalón Carla' \\gset
select id as falda from retail.productos where referencia = 'Falda Renata' \\gset
select id as vestido from retail.productos where referencia = 'Vestido Sofía' \\gset
insert into retail.vitrina_productos (producto_id, publicado, publicado_en) values (:'emma', true, now()), (:'carla', true, now()), (:'falda', true, now())
on conflict (producto_id) do update set publicado = true, publicado_en = now();
select color_codigo as carla_color from retail.variantes where producto_id = :'carla' and activo order by color_codigo limit 1 \\gset
select color_codigo as falda_color from retail.variantes where producto_id = :'falda' and activo order by color_codigo limit 1 \\gset
insert into retail.clientas (documento_tipo, documento_numero, nombre, telefono_whatsapp, club_desde, codigo_club)
values ('dni', '${DNI.ana}', 'Ana Prueba Look', '987000801', now() - interval '10 days', retail.fn_club_codigo_nuevo())
returning id as ana_c \\gset
insert into retail.clientas (documento_tipo, documento_numero, nombre, archivada_en, motivo_archivo)
values ('dni', '${DNI.ceci}', 'Ceci Prueba Look Archivada', now(), 'prueba de la tienda') returning id as ceci_c \\gset
insert into retail.cuentas_web (usuario_web_id, clienta_id, correo, textos_aceptados) values
  ('${U.ana}', :'ana_c', '${CORREO("ana")}', 'borrador-2026-10-14'),
  ('${U.ceci}', :'ceci_c', '${CORREO("ceci")}', 'borrador-2026-10-14');
select id as ana_w from retail.cuentas_web where usuario_web_id = '${U.ana}' \\gset
`;
const FIN = "rollback;\n";
const COMO_TIENDA = `grant tienda_web to current_user with set true;\nset local role tienda_web;\n`;
/** Las prendas de un look, en su orden: «emma.NEG», «carla», «falda» (con su primer color activo) o un par a mano. */
const PIEZAS = (...lista) =>
  `jsonb_build_array(${lista
    .map((p) => {
      if (p === "emma.NEG") return `jsonb_build_object('producto_id', :'emma', 'color', 'NEG')`;
      if (p === "emma.BEI") return `jsonb_build_object('producto_id', :'emma', 'color', 'BEI')`;
      if (p === "carla") return `jsonb_build_object('producto_id', :'carla', 'color', :'carla_color')`;
      if (p === "falda") return `jsonb_build_object('producto_id', :'falda', 'color', :'falda_color')`;
      if (p === "vestido") return `jsonb_build_object('producto_id', :'vestido', 'color', (select color_codigo from retail.variantes where producto_id = :'vestido' and activo limit 1))`;
      return p;
    })
    .join(", ")})`;
const GUARDAR = (quien, piezas, nombre = "null") => `retail.tienda_guardar_look('${U[quien]}', ${piezas}, ${nombre})`;

const hayFuncion = correr("select to_regprocedure('retail.tienda_guardar_look(uuid, jsonb, text)') is not null;");
if (!APLICAR_ANTES && !(hayFuncion.ok && hayFuncion.salida === "t")) {
  console.error(`Falta retail.tienda_guardar_look: aplica ${MIGRACION} o corre con APLICAR_ANTES=${MIGRACION}`);
  process.exit(1);
}

console.log("1. Permisos");
esperarValor(
  "las cuatro funciones: security definer con su search_path, y solo de tienda_web",
  correr(`${PREPARAR}select string_agg(concat_ws('|', p.proname, p.prosecdef, exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'),
      has_function_privilege('anon', p.oid, 'EXECUTE'), has_function_privilege('authenticated', p.oid, 'EXECUTE'),
      has_function_privilege('tienda_web', p.oid, 'EXECUTE')), ',' order by p.proname)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'retail' and p.proname in ('tienda_guardar_look', 'tienda_quitar_look', 'tienda_renombrar_look', 'tienda_mis_looks');\n${FIN}`),
  "tienda_guardar_look|t|t|f|f|t,tienda_mis_looks|t|t|f|f|t,tienda_quitar_look|t|t|f|f|t,tienda_renombrar_look|t|t|f|f|t",
);
esperarValor(
  "como tienda_web: guarda y lee por sus funciones, y las tablas se niegan",
  correr(`${PREPARAR}${COMO_TIENDA}select ${GUARDAR("ana", PIEZAS("emma.NEG", "carla"))} ->> 'estado';
select jsonb_array_length(retail.tienda_mis_looks('${U.ana}') -> 'looks');
do $$ begin perform 1 from retail.looks_web; raise exception 'leyó'; exception when insufficient_privilege then raise notice 'negado'; end $$;
select 'negado';\n${FIN}`),
  "guardado\n1\nnegado",
);

console.log("2. Guardar");
esperarValor(
  "un look nuevo: guardado, con el nombre del día de Lima, y sus prendas en su orden",
  correr(`${PREPARAR}select concat_ws('|', r ->> 'estado', r ->> 'nuevo', (r ->> 'nombre') = retail.fn_look_web_nombre_del_dia(), (r ->> 'nombre') like 'Look de %')
  from (select ${GUARDAR("ana", PIEZAS("emma.NEG", "carla", "falda"))} as r) x;
select string_agg(p.posicion || '=' || pr.referencia, ',' order by p.posicion)
  from retail.look_web_piezas p join retail.looks_web l on l.id = p.look_id join retail.productos pr on pr.id = p.producto_id
 where l.cuenta_web_id = :'ana_w';\n${FIN}`),
  "guardado|true|t|t\n1=Blusa Emma,2=Pantalón Carla,3=Falda Renata",
);
esperarValor(
  "el mismo look en otro orden es el mismo: nuevo false, el mismo id y una sola fila",
  correr(`${PREPARAR}select ${GUARDAR("ana", PIEZAS("emma.NEG", "carla"), "'Mi look'")} ->> 'id' as primero \\gset
select concat_ws('|', r ->> 'estado', r ->> 'nuevo', (r ->> 'id') = :'primero', r ->> 'nombre') from (select ${GUARDAR("ana", PIEZAS("carla", "emma.NEG"), "'Otro nombre'")} as r) x;
select count(*) from retail.looks_web where cuenta_web_id = :'ana_w';
select ${GUARDAR("ana", PIEZAS("emma.BEI", "carla"))} ->> 'nuevo';
select count(*) from retail.looks_web where cuenta_web_id = :'ana_w';\n${FIN}`),
  "guardado|false|t|Mi look\n1\ntrue\n2",
);
esperarValor(
  "lo que no es un look no se guarda: 1 o 5 prendas, un modelo repetido, un id que no es uuid, sin color o no es una lista",
  correr(`${PREPARAR}select string_agg(r ->> 'estado', ',' order by k) from (values
  (1, ${GUARDAR("ana", PIEZAS("emma.NEG"))}),
  (2, ${GUARDAR("ana", PIEZAS("emma.NEG", "carla", "falda", "emma.BEI", "carla"))}),
  (3, ${GUARDAR("ana", PIEZAS("emma.NEG", "emma.BEI"))}),
  (4, ${GUARDAR("ana", PIEZAS("emma.NEG", "jsonb_build_object('producto_id', 'no-es-uuid', 'color', 'NEG')"))}),
  (5, ${GUARDAR("ana", PIEZAS("emma.NEG", "jsonb_build_object('producto_id', :'carla')"))}),
  (6, ${GUARDAR("ana", "'{\"a\": 1}'::jsonb")}),
  (7, ${GUARDAR("ana", "null")})) t(k, r);
select count(*) from retail.looks_web where cuenta_web_id = :'ana_w';\n${FIN}`),
  "invalido,invalido,invalido,invalido,invalido,invalido,invalido\n0",
);
esperarValor(
  "lo que no se ve en la web, o un color que no tiene activo, no se guarda (no_disponible)",
  correr(`${PREPARAR}select ${GUARDAR("ana", PIEZAS("emma.NEG", "vestido"))} ->> 'estado';
select ${GUARDAR("ana", PIEZAS("emma.NEG", "jsonb_build_object('producto_id', :'carla', 'color', 'ZZZ')"))} ->> 'estado';\n${FIN}`),
  "no_disponible\nno_disponible",
);
esperarValor(
  "sin cuenta, sin_cuenta; con la ficha archivada no guarda (cuenta_inactiva)",
  correr(`${PREPARAR}select ${GUARDAR("nadie", PIEZAS("emma.NEG", "carla"))} ->> 'estado';
select ${GUARDAR("ceci", PIEZAS("emma.NEG", "carla"))} ->> 'estado';\n${FIN}`),
  "sin_cuenta\ncuenta_inactiva",
);
esperarValor(
  "el tope: 30 looks vivos por cuenta",
  correr(`${PREPARAR}insert into retail.looks_web (cuenta_web_id, nombre, huella) select :'ana_w', 'Relleno ' || k, 'relleno-' || k from generate_series(1, 30) k;
select concat_ws('|', r ->> 'estado', r ->> 'tope') from (select ${GUARDAR("ana", PIEZAS("emma.NEG", "carla"))} as r) x;
update retail.looks_web set quitado_en = now() where cuenta_web_id = :'ana_w' and huella = 'relleno-1';
select ${GUARDAR("ana", PIEZAS("emma.NEG", "carla"))} ->> 'estado';\n${FIN}`),
  "tope|30\nguardado",
);

console.log("3. Quitar");
esperarValor(
  "quitar marca la fila (no la borra), es idempotente, y después el mismo look se guarda de nuevo",
  correr(`${PREPARAR}select ${GUARDAR("ana", PIEZAS("emma.NEG", "carla"))} ->> 'id' as look \\gset
select retail.tienda_quitar_look('${U.ana}', :'look') ->> 'estado';
select retail.tienda_quitar_look('${U.ana}', :'look') ->> 'estado';
select concat_ws('|', count(*), count(*) filter (where quitado_en is not null)) from retail.looks_web where cuenta_web_id = :'ana_w';
select concat_ws('|', r ->> 'nuevo', (r ->> 'id') <> :'look') from (select ${GUARDAR("ana", PIEZAS("emma.NEG", "carla"))} as r) x;\n${FIN}`),
  "quitado\nquitado\n1|1\ntrue|t",
);
esperarValor(
  "solo alcanza los looks propios: quitar el de otra cuenta no lo toca",
  correr(`${PREPARAR}select ${GUARDAR("ana", PIEZAS("emma.NEG", "carla"))} ->> 'id' as look \\gset
insert into retail.clientas (documento_tipo, documento_numero, nombre) values ('dni', '09980009', 'Otra Prueba Look') returning id as otra_c \\gset
insert into retail.cuentas_web (usuario_web_id, clienta_id, correo, textos_aceptados) values ('${U.nadie}', :'otra_c', '${CORREO("otra")}', 'borrador-2026-10-14');
select retail.tienda_quitar_look('${U.nadie}', :'look') ->> 'estado';
select count(*) from retail.looks_web where id = :'look' and quitado_en is null;\n${FIN}`),
  "quitado\n1",
);

console.log("4. Renombrar");
esperarValor(
  "1 a 40 letras sin espacios de más; vacío o largo, invalido; el de otra cuenta, no_esta",
  correr(`${PREPARAR}select ${GUARDAR("ana", PIEZAS("emma.NEG", "carla"))} ->> 'id' as look \\gset
select concat_ws('|', r ->> 'estado', r ->> 'nombre') from (select retail.tienda_renombrar_look('${U.ana}', :'look', '  Look   de   domingo  ') as r) x;
select retail.tienda_renombrar_look('${U.ana}', :'look', '   ') ->> 'estado';
select retail.tienda_renombrar_look('${U.ana}', :'look', repeat('a', 41)) ->> 'estado';
select retail.tienda_renombrar_look('${U.ceci}', :'look', 'Robado') ->> 'estado';
select nombre from retail.looks_web where id = :'look';\n${FIN}`),
  "renombrado|Look de domingo\ninvalido\ninvalido\nno_esta\nLook de domingo",
);

console.log("5. Leer");
esperarValor(
  "los vivos, lo más nuevo primero, con sus prendas en su orden y si siguen en la web; sin cuenta, null",
  correr(`${PREPARAR}select ${GUARDAR("ana", PIEZAS("emma.NEG", "carla"), "'Primero'")} ->> 'id' as uno \\gset
update retail.looks_web set guardado_en = now() - interval '1 day' where id = :'uno';
select ${GUARDAR("ana", PIEZAS("falda", "emma.BEI"), "'Segundo'")} ->> 'id' as dos \\gset
select ${GUARDAR("ana", PIEZAS("falda", "carla"), "'Tercero'")} ->> 'id' as tres \\gset
select retail.tienda_quitar_look('${U.ana}', :'tres') ->> 'estado' as _q \\gset
update retail.vitrina_productos set publicado = false where producto_id = :'carla';
select string_agg(l ->> 'nombre' || ':' || (select string_agg((p ->> 'posicion') || (case when (p ->> 'se_ve')::boolean then '' else '(no)' end), ' ' order by (p ->> 'posicion')::int)
                                             from jsonb_array_elements(l -> 'piezas') p), ',' order by n)
  from jsonb_array_elements(retail.tienda_mis_looks('${U.ana}') -> 'looks') with ordinality as t (l, n);
select coalesce(retail.tienda_mis_looks('${U.nadie}')::text, 'null');\n${FIN}`),
  "Segundo:1 2,Primero:1 2(no)\nnull",
);

console.log("6. Cerrar o eliminar la cuenta");
esperarValor(
  "al anonimizar la ficha, sus looks vivos se quitan (como sus favoritos) y no se borran",
  correr(`${PREPARAR}select ${GUARDAR("ana", PIEZAS("emma.NEG", "carla"))} ->> 'estado' as _g \\gset
select retail.tienda_favorito('${U.ana}', :'emma', true) ->> 'estado' as _f \\gset
select retail.fn_clienta_anonimizar(:'ana_c', null, false, 'tienda_web') is null as _a \\gset
select concat_ws('|', (select count(*) from retail.looks_web where cuenta_web_id = :'ana_w'),
                 (select count(*) from retail.looks_web where cuenta_web_id = :'ana_w' and quitado_en is null),
                 (select count(*) from retail.favoritos_web where cuenta_web_id = :'ana_w' and quitado_en is null),
                 (select cerrada_en is not null from retail.cuentas_web where id = :'ana_w'));\n${FIN}`),
  "1|0|0|t",
);

console.log("7. La migración se puede volver a correr");
{
  const texto = readFileSync(MIGRACION, "utf8");
  esperarValor(
    "aplicada dos veces seguidas, el cierre tiene una sola línea de los looks y guardar sigue igual",
    correr(`${PREPARAR}${texto}\n${texto}\nselect (length(d) - length(replace(d, 'update retail.looks_web l set quitado_en', ''))) / length('update retail.looks_web l set quitado_en')
  from (select pg_get_functiondef('retail.fn_cuentas_web_cerrar_al_anonimizar()'::regprocedure) as d) x;
select ${GUARDAR("ana", PIEZAS("emma.NEG", "carla"))} ->> 'estado';\n${FIN}`),
    "1\nguardado",
  );
}

console.log(`\n${total - fallos}/${total} escenarios`);
process.exit(fallos ? 1 : 0);
