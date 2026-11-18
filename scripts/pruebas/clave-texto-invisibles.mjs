/**
 * Un carácter invisible no crea dos veces la misma cosa — migración 20261031200000.
 *
 * EL PROBLEMA. `retail.fn_clave_texto` es la clave con la que la base decide si dos nombres son EL MISMO, y sobre ella
 * cuelgan los 16 índices únicos de todo el vocabulario del catálogo (colores, tallas, marcas, categorías, familias,
 * tejidos, patrones, etiquetas, proveedores, materiales, insumos, clases de avío, looks y el calendario del plan).
 * No quitaba los caracteres que no se ven y que viajan en cualquier copiar y pegar, así que «Verde Sonda» y
 * «Verde<U+200B> Sonda» entraban como dos colores distintos, con el stock partido, y el candado no decía nada.
 * Lo encontró `/chaos` dos veces: en Catálogo ▸ Atributos (2026-10-30) y en «Nuevo avío» (2026-10-31).
 *
 * QUÉ GARANTIZA (cada caso termina en ROLLBACK: no deja rastro en el Postgres local compartido):
 *   A. La clave quita los ocho invisibles que de verdad llegan, estén donde estén, y uno metido entre dos espacios no
 *      deja un espacio doble.
 *   B. Un nombre hecho solo de invisibles es vacío (null), no un nombre nuevo.
 *   C. Lo que la clave ya hacía no cambió: tildes, ñ, mayúsculas y espacios repetidos.
 *   D. EL CANDADO DE VERDAD: la base RECHAZA un segundo color cuyo nombre solo se diferencia por un invisible. Es lo
 *      que pide ADR-0576 («el nombre igual lo frena la base», no solo el aviso de la pantalla).
 *   E. Los índices están reconstruidos con la clave NUEVA. Esto no se ve mirando la función: un índice que se quedó
 *      con las claves viejas deja pasar justo lo que D prueba que no debe. Si alguien repega la migración entera en
 *      una sola corrida (el reindex usaría la función cacheada y no reconstruiría nada), D se pone en rojo.
 *   F. La web dice lo mismo que la base: los casos de `apps/web/lib/invisibles-no-duplican.test.ts`, aquí contra Postgres.
 */
import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";

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

/** Los ocho que de verdad llegan de un copiar y pegar, con su nombre para el mensaje de error. */
const INVISIBLES = [
  ["200B", "espacio de ancho cero (web y WhatsApp)"],
  ["200C", "no-unidor de ancho cero"],
  ["200D", "unidor de ancho cero"],
  ["200E", "marca de izquierda a derecha"],
  ["200F", "marca de derecha a izquierda"],
  ["2060", "unidor de palabras"],
  ["FEFF", "BOM"],
  ["00AD", "guion suave (de un PDF)"],
];

const CASOS = [];

// ---------- A · la clave los quita, estén donde estén ----------
for (const [hex, nombre] of INVISIBLES) {
  const c = `U&'\\${hex}'`;
  CASOS.push({
    nombre: `A · el ${nombre} no cambia la clave`,
    sql: `select
        retail.fn_clave_texto('Verde' || ${c} || ' Olivo') = 'verde olivo',
        retail.fn_clave_texto(${c} || 'Verde Olivo') = 'verde olivo',
        retail.fn_clave_texto('Verde Olivo' || ${c}) = 'verde olivo',
        retail.fn_clave_texto('Ver' || ${c} || 'de Olivo') = 'verde olivo';`,
    verificar: (c2) => c2.every((v) => v === "t"),
  });
}

CASOS.push({
  nombre: "A · uno entre dos espacios no deja un espacio doble (se quita ANTES de juntarlos)",
  sql: `select retail.fn_clave_texto('Verde ' || U&'\\200B' || ' Olivo') = 'verde olivo',
               retail.fn_clave_texto('Verde' || U&'\\00A0' || U&'\\200B' || U&'\\00A0' || 'Olivo') = 'verde olivo';`,
  verificar: (c) => c.every((v) => v === "t"),
});

// ---------- B · solo invisibles = vacío ----------
CASOS.push({
  nombre: "B · un nombre hecho solo de invisibles es null, no un nombre nuevo",
  sql: `select retail.fn_clave_texto(U&'\\200B' || U&'\\FEFF' || U&'\\00AD') is null;`,
  verificar: (c) => c[0] === "t",
});

// ---------- C · lo de siempre no cambió ----------
CASOS.push({
  nombre: "C · tildes, ñ, mayúsculas y espacios repetidos: igual que siempre",
  sql: `select retail.fn_clave_texto('  AÑIL  ') = 'anil',
               retail.fn_clave_texto('Verde   Olivo') = 'verde olivo',
               retail.fn_clave_texto('Façon') = 'façon',
               retail.fn_clave_texto('S.A.C.') = 's.a.c.',
               retail.fn_clave_texto('   ') is null;`,
  verificar: (c) => c.every((v) => v === "t"),
});

// ---------- D · EL CANDADO: la base rechaza el duplicado con invisible ----------
CASOS.push({
  nombre: "D · la base RECHAZA un segundo color que solo se diferencia por un invisible",
  sql: `begin;
insert into retail.colores (codigo, nombre, hex, familia_color) values ('ZI1', 'Verde Invisible', '#00FF00', 'verde');
do $$ begin
  insert into retail.colores (codigo, nombre, hex, familia_color)
    values ('ZI2', 'Verde' || U&'\\200B' || ' Invisible', '#00FF01', 'verde');
  raise exception 'ACEPTO_EL_DUPLICADO';
exception when unique_violation then null;  -- lo que se espera
end $$;
select 'frenado';
rollback;`,
  verificar: (c) => c[0] === "frenado",
});

CASOS.push({
  nombre: "D · y sigue aceptando dos colores que de verdad son distintos",
  sql: `begin;
insert into retail.colores (codigo, nombre, hex, familia_color) values
  ('ZI1', 'Verde Invisible', '#00FF00', 'verde'),
  ('ZI2', 'Verde Invisible 2', '#00FF01', 'verde');
select count(*)::text from retail.colores where codigo in ('ZI1', 'ZI2');
rollback;`,
  verificar: (c) => c[0] === "2",
});

// ---------- E · los índices, reconstruidos con la clave nueva ----------
CASOS.push({
  nombre: "E · hay índices colgando de la clave (si fueran 0, el candado no existiría)",
  sql: `select count(*)::text from pg_index i where pg_get_indexdef(i.indexrelid) like '%fn_clave_texto%';`,
  verificar: (c) => Number(c[0]) >= 10,
});

// ---------- F · la web y la base dicen lo mismo ----------
CASOS.push({
  nombre: "F · los mismos casos que la prueba de la web (invisibles-no-duplican.test.ts)",
  sql: `select retail.fn_clave_texto('Verde' || U&'\\200B' || ' Olivo') = retail.fn_clave_texto('Verde Olivo'),
               retail.fn_clave_texto('Ver' || U&'\\00AD' || 'de Olivo') = retail.fn_clave_texto('Verde Olivo'),
               retail.fn_clave_texto('Verde Olivo' || U&'\\FEFF') = retail.fn_clave_texto('Verde Olivo');`,
  verificar: (c) => c.every((v) => v === "t"),
});

function main() {
  let fallos = 0;
  for (const caso of CASOS) {
    const resultado = correr(caso.sql);
    if (!resultado.ok) {
      fallos++;
      console.log(`✗ ${caso.nombre}\n    falló:\n    ${resultado.mensaje.trim().split("\n").join("\n    ")}`);
      continue;
    }
    const filas = resultado.salida.split("\n").filter((l) => l.trim() !== "" && !["ROLLBACK", "BEGIN", "DO", "INSERT 0 1", "INSERT 0 2"].includes(l.trim().toUpperCase()));
    const columnas = (filas[filas.length - 1] ?? "").split("|");
    if (!caso.verificar(columnas)) {
      fallos++;
      console.log(`✗ ${caso.nombre}\n    valores inesperados: ${JSON.stringify(columnas)}`);
    } else {
      console.log(`✓ ${caso.nombre}`);
    }
  }
  console.log(`\n${CASOS.length - fallos}/${CASOS.length} pruebas en verde.`);
  process.exit(fallos > 0 ? 1 : 0);
}

main();
