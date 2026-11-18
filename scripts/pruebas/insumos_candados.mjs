/**
 * Prueba de los candados de unidad de Insumos — ADR-0554, actividad 0. Migración 20261028172000.
 *
 * Qué garantiza (cada caso termina en ROLLBACK, así que no deja rastro en el Postgres local compartido):
 *   1. Una tela no se puede medir en kilos, unidades, pares, conos ni docenas (CHECK `insumos_tela_en_metros`).
 *   2. Una tela en metros entra, y un avío entra en cualquiera de las seis unidades (el candado no se pasa de largo).
 *   3. Pasar una tela a otra unidad también se rechaza; un avío SIN historia sí puede cambiar de unidad.
 *   4. Un insumo CON historia (un lote) ya no cambia de unidad ni de tipo, aunque el CHECK lo dejaría pasar (lo detiene el disparador);
 *      y con historia se siguen pudiendo editar el nombre, la merma, el mínimo y la nota.
 *   5. «Historia» se lee del catálogo: una tabla NUEVA que apunte a `insumos` con una llave foránea cuenta sin tocar la función.
 *   6. Un código no se repite aunque cambien mayúsculas o espacios, un código en blanco no entra y dos códigos distintos conviven.
 *   7. Las dos funciones nuevas no se llaman desde fuera (sin EXECUTE para `authenticated`).
 *   8. La migración se puede volver a pegar sin error, y se DETIENE diciendo qué corregir si ya hay una tela en otra unidad o códigos que se leen igual.
 *
 * Los mensajes del servidor salen en el idioma de la base: por eso los casos buscan el NOMBRE de la restricción o el texto propio de la migración, nunca la frase de Postgres.
 *
 * USO
 *   pnpm pruebas:insumos-candados   → necesita el stack local (`npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder — opera cualquier ubicación

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
// Se lee el archivo REAL de la migración: lo que se prueba es lo que se pega.
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20261028172000_insumos_candados_de_unidad.sql"), "utf8");

function psql(sql) {
  return execFileSync("docker", ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"], {
    input: sql,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
}

function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

const PREPARAR = `
begin;
set local request.jwt.claim.sub = '${FELIPE}';
select id as taller from retail.ubicaciones where tipo = 'taller' limit 1 \\gset
`;

/** Un insumo de cada tipo, listo para usar en un caso. */
const UNA_TELA = `insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('ZZ-CAND-T', 'Tela de prueba', 'tela', 'metro') returning id as tela \\gset`;
const UN_AVIO = `insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('ZZ-CAND-A', 'Avío de prueba', 'avio', 'unidad') returning id as avio \\gset`;

const UNIDADES = ["kilo", "unidad", "par", "cono", "docena"];
const SEIS = ["metro", "unidad", "kilo", "cono", "par", "docena"];

const CASOS = [
  ...UNIDADES.map((u, i) => ({
    nombre: `1.${i + 1} una tela no se puede medir en ${u}`,
    tipo: "error",
    contiene: "insumos_tela_en_metros",
    sql: `${PREPARAR}
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('ZZ-CAND-K', 'Tela mal medida', 'tela', '${u}');
rollback;`,
  })),
  {
    nombre: "2. una tela en metros entra y un avío entra en cualquiera de las seis unidades",
    tipo: "exito",
    sql: `${PREPARAR}
${UNA_TELA}
${SEIS.map((u, i) => `insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('ZZ-CAND-V${i}', 'Avío ${u}', 'avio', '${u}');`).join("\n")}
select count(*) from retail.insumos where codigo like 'ZZ-CAND-%';
rollback;`,
    verificar: (c) => Number(c[0]) === 7,
  },
  {
    nombre: "3.1 pasar una tela (aunque no tenga historia) a otra unidad se rechaza",
    tipo: "error",
    contiene: "insumos_tela_en_metros",
    sql: `${PREPARAR}
${UNA_TELA}
update retail.insumos set unidad_medida = 'kilo' where id = :'tela';
rollback;`,
  },
  {
    nombre: "3.2 un avío sin historia sí puede cambiar de unidad",
    tipo: "exito",
    sql: `${PREPARAR}
${UN_AVIO}
update retail.insumos set unidad_medida = 'docena' where id = :'avio';
select unidad_medida from retail.insumos where id = :'avio';
rollback;`,
    verificar: (c) => c[0] === "docena",
  },
  {
    nombre: "4.1 un avío con un lote ya no cambia de unidad",
    tipo: "error",
    contiene: "no se le puede cambiar el tipo ni la unidad",
    sql: `${PREPARAR}
${UN_AVIO}
select retail.recibir_insumo(:'avio', :'taller', 10, 50, 'L-A') as _r \\gset
update retail.insumos set unidad_medida = 'docena' where id = :'avio';
rollback;`,
  },
  {
    nombre: "4.2 ni de tipo, aunque el CHECK lo dejaría pasar (lo detiene el disparador)",
    tipo: "error",
    contiene: "no se le puede cambiar el tipo ni la unidad",
    sql: `${PREPARAR}
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('ZZ-CAND-M', 'Avío en metros', 'avio', 'metro') returning id as avio \\gset
select retail.recibir_insumo(:'avio', :'taller', 10, 50, 'L-A') as _r \\gset
update retail.insumos set tipo = 'tela' where id = :'avio';
rollback;`,
  },
  {
    nombre: "4.3 con historia se siguen pudiendo editar el nombre, la merma, el mínimo y la nota",
    tipo: "exito",
    sql: `${PREPARAR}
${UNA_TELA}
select retail.recibir_insumo(:'tela', :'taller', 10, 50, 'L-A') as _r \\gset
update retail.insumos set nombre = 'Otro nombre', merma_pct = 0.05, stock_minimo = 3, nota = 'nota' where id = :'tela';
select nombre, merma_pct, stock_minimo from retail.insumos where id = :'tela';
rollback;`,
    verificar: (c) => c[0] === "Otro nombre" && Number(c[1]) === 0.05 && Number(c[2]) === 3,
  },
  {
    nombre: "5.1 la historia se lee del catálogo: una tabla NUEVA que apunte a insumos cuenta sin tocar la función",
    tipo: "error",
    contiene: "no se le puede cambiar el tipo ni la unidad",
    sql: `${PREPARAR}
${UN_AVIO}
create table retail.zz_candados_ref (insumo_id uuid references retail.insumos (id));
insert into retail.zz_candados_ref values (:'avio');
update retail.insumos set unidad_medida = 'docena' where id = :'avio';
rollback;`,
  },
  {
    nombre: "5.2 y sin ninguna fila que lo apunte, la función dice que no hay historia",
    tipo: "exito",
    sql: `${PREPARAR}
${UN_AVIO}
create table retail.zz_candados_ref (insumo_id uuid references retail.insumos (id));
select retail.fn_insumo_tiene_historia(:'avio');
rollback;`,
    verificar: (c) => c[0] === "f",
  },
  {
    nombre: "6.1 un código no se repite aunque cambien las mayúsculas",
    tipo: "error",
    contiene: "insumos_codigo_clave_unico",
    sql: `${PREPARAR}
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('ZZ-CAND-A1', 'Uno', 'avio', 'unidad');
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('zz-cand-a1', 'Otro', 'avio', 'unidad');
rollback;`,
  },
  {
    nombre: "6.2 ni con espacios de más",
    tipo: "error",
    contiene: "insumos_codigo_clave_unico",
    sql: `${PREPARAR}
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('ZZ-CAND-A1', 'Uno', 'avio', 'unidad');
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values (' ZZ-CAND-A1 ', 'Otro', 'avio', 'unidad');
rollback;`,
  },
  {
    nombre: "6.3 el texto exacto repetido también se rechaza (el candado de siempre sigue)",
    tipo: "error",
    contiene: "insumos_codigo_",
    sql: `${PREPARAR}
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('ZZ-CAND-A1', 'Uno', 'avio', 'unidad');
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('ZZ-CAND-A1', 'Otro', 'avio', 'unidad');
rollback;`,
  },
  {
    nombre: "6.4 un código en blanco no entra",
    tipo: "error",
    contiene: "insumos_codigo_no_vacio",
    sql: `${PREPARAR}
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('   ', 'Sin código', 'avio', 'unidad');
rollback;`,
  },
  {
    nombre: "6.5 dos códigos distintos conviven",
    tipo: "exito",
    sql: `${PREPARAR}
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('ZZ-CAND-A1', 'Uno', 'avio', 'unidad');
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('ZZ-CAND-A2', 'Dos', 'avio', 'unidad');
select count(*) from retail.insumos where codigo like 'ZZ-CAND-A%';
rollback;`,
    verificar: (c) => Number(c[0]) === 2,
  },
  {
    nombre: "7.1 quien no es el dueño no puede llamar a la función de historia",
    tipo: "error",
    contiene: "fn_insumo_tiene_historia",
    sql: `${PREPARAR}
set local role authenticated;
select retail.fn_insumo_tiene_historia(gen_random_uuid());
rollback;`,
  },
  {
    nombre: "7.2 ni a la del disparador",
    tipo: "error",
    contiene: "fn_insumos_unidad_firme",
    sql: `${PREPARAR}
set local role authenticated;
select retail.fn_insumos_unidad_firme();
rollback;`,
  },
  {
    nombre: "8.1 la migración se puede volver a pegar sin error",
    tipo: "exito",
    sql: `${PREPARAR}
${MIGRACION}
${MIGRACION}
select count(*) from pg_constraint where conname in ('insumos_tela_en_metros', 'insumos_codigo_no_vacio') and conrelid = 'retail.insumos'::regclass;
rollback;`,
    verificar: (c) => Number(c[0]) === 2,
  },
  {
    nombre: "8.2 si ya hay una tela en otra unidad, se DETIENE y dice cuál",
    tipo: "error",
    contiene: "Hay telas medidas en otra unidad que metro: ZZ-CAND-KILOS (kilo)",
    sql: `${PREPARAR}
alter table retail.insumos drop constraint insumos_tela_en_metros;
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('ZZ-CAND-KILOS', 'Tela vieja en kilos', 'tela', 'kilo');
${MIGRACION}
rollback;`,
  },
  {
    nombre: "8.3 si ya hay códigos que se leen igual, se DETIENE y dice cuál",
    tipo: "error",
    contiene: "Hay códigos de insumo repetidos o en blanco",
    sql: `${PREPARAR}
drop index retail.insumos_codigo_clave_unico;
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('ZZ-CAND-R1', 'Uno', 'avio', 'unidad');
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('zz-cand-r1', 'Otro', 'avio', 'unidad');
${MIGRACION}
rollback;`,
  },
  {
    nombre: "8.4 si ya hay un código en blanco, se DETIENE y lo dice",
    tipo: "error",
    contiene: "(en blanco)",
    sql: `${PREPARAR}
alter table retail.insumos drop constraint insumos_codigo_no_vacio;
drop index retail.insumos_codigo_clave_unico;
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('   ', 'Sin código', 'avio', 'unidad');
${MIGRACION}
rollback;`,
  },
];

function main() {
  try {
    execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]);
  } catch {
    console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\` y vuelve a intentar.`);
    process.exit(1);
  }

  let fallos = 0;
  for (const caso of CASOS) {
    const resultado = correr(caso.sql);
    if (caso.tipo === "error") {
      if (resultado.ok) {
        fallos++;
        console.log(`✗ ${caso.nombre}\n    se esperaba un error ("${caso.contiene}") y no hubo ninguno`);
      } else if (!resultado.mensaje.includes(caso.contiene)) {
        fallos++;
        console.log(`✗ ${caso.nombre}\n    se esperaba un error con "${caso.contiene}", salió:\n    ${resultado.mensaje.trim().split("\n").join("\n    ")}`);
      } else {
        console.log(`✓ ${caso.nombre}`);
      }
    } else if (!resultado.ok) {
      fallos++;
      console.log(`✗ ${caso.nombre}\n    se esperaba éxito, falló:\n    ${resultado.mensaje.trim().split("\n").join("\n    ")}`);
    } else {
      // La última línea con datos es la del select final; `rollback` no imprime filas.
      const filas = resultado.salida.split("\n").filter((l) => l.trim() !== "" && l.trim().toUpperCase() !== "ROLLBACK");
      const columnas = (filas[filas.length - 1] ?? "").split("|");
      if (!caso.verificar(columnas)) {
        fallos++;
        console.log(`✗ ${caso.nombre}\n    valores inesperados: ${JSON.stringify(columnas)}`);
      } else {
        console.log(`✓ ${caso.nombre}`);
      }
    }
  }

  console.log(`\n${CASOS.length - fallos}/${CASOS.length} pruebas en verde.`);
  process.exit(fallos > 0 ? 1 : 0);
}

main();
