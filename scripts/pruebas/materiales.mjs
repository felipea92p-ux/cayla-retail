/**
 * Prueba de la base «una tela con sus colores» — ADR-0554, actividad 1. Migración 20261028175000.
 *
 * Qué garantiza (cada caso termina en ROLLBACK, así que no deja rastro en el Postgres local compartido):
 *   A. Crear. `crear_material` arma la tela y sus colores de una vez: el código lo pone la base (`ZAF-01`, y `ZAF-02` para la siguiente con el mismo prefijo), el color queda como
 *      `ZAF-01-<COL>` con el nombre «Tela · Color», y el tipo, la unidad, el tejido y la merma de cada color son los de su tela.
 *   B. Saldo inicial. Con saldo, abre UN lote de saldo inicial por color, con su costo; con el mismo token no se duplica nada; y solo lo anota el líder.
 *   C. Quién. Sin el módulo «Producción» no se crea; quien ve Producción en ese Taller crea telas y colores (sin saldo).
 *   D. Todo o nada. Un color que no existe tumba la creación entera: ni tela, ni colores, ni número de código gastado.
 *   E. Repetidas. La misma tela (aunque cambien mayúsculas o espacios) AVISA y dice cuál es; una tela por kilo pide su ancho y gramaje y una por rollo, sus metros.
 *   F. Agregar. `agregar_colores_a_material` suma los que faltan y deja los que estaban; un saldo en un color que ya existía se rechaza (eso es «Llegó tela»); con el mismo token no se duplica.
 *   G. Copias. El nombre y el código de un color los pone la tela y no se escriben a mano; el tejido y la merma son de la tela; un color no cambia de tela ni se suelta de ella.
 *   H. Estados imposibles. El mismo color dos veces en una tela, una tela por kilo sin medidas, medidas que no son números y el cambio de unidad de una tela no caben.
 *   I. Lo que ya existía. `fn_materializar_insumos_sueltos` ENSAYA por defecto (no escribe) y con `true` vuelve tela cada insumo suelto de tela: agrupa los del mismo nombre, adopta a la tela que ya
 *      existe, quita el « · Color» que se le agrega al mostrarlo, deja suelto —diciendo por qué— lo que choca y no toca avíos ni archivados. Nunca aborta.
 *   J. Puertas. `anon` no llama a nada, `authenticated` solo a las funciones de alta y de edición, y la tabla de telas se lee pero no se escribe desde la API.
 *   K. Editar una tela (revisión de 28-oct). `editar_material` corrige nombre, tejido, composición y merma y los colores la siguen en la misma transacción; es del líder; no cambia el tipo ni la unidad;
 *      un color desfasado se cura en vez de bloquearse, y cambiar el tejido de UN color sigue rechazado.
 *   L. Candado de unidad. Colgar un insumo suelto de una tela de otra clase se rechaza; de la misma clase se puede; el disparador de unidad firme ya no mira columnas.
 *   M. Tokens. Un color repetido en la lista se rechaza con y sin token; el mismo token en otra tela ya no se confunde con un reintento (ningún saldo se pierde en silencio).
 *   N. Dónde y quién. Solo en un Taller activo; un avío lo crea el líder; el código de la tela no se recorta al llegar a 100.
 *   O. Insumos sueltos. El código derivado ocupado por un insumo suelto se dice; una tela con el nombre de un suelto avisa.
 *   P. Medidas. Un ancho en metros («1.60») se rechaza en castellano, al crear y al editar.
 *
 * Los mensajes del servidor salen en el idioma de la base: por eso los casos buscan el NOMBRE de la restricción o el texto propio de la migración.
 *
 * USO
 *   pnpm pruebas:materiales   → necesita el stack local (`npx supabase start`)
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder y Admin (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // Integrante de Tienda Trujillo (seed)

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

const como = (auth) => `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n`;

/** El Taller, tres colores del vocabulario (los que haya, sin suponer cuáles) y a Micaela. */
const PREPARAR = `
begin;
${como(FELIPE)}
select id as taller from retail.ubicaciones where tipo = 'taller' and activo order by nombre limit 1 \\gset
select codigo as c1 from retail.colores where activo order by codigo limit 1 \\gset
select codigo as c2 from retail.colores where activo order by codigo offset 1 limit 1 \\gset
select codigo as c3 from retail.colores where activo order by codigo offset 2 limit 1 \\gset
select p.id as micaela_p from public.personas p where p.auth_user_id = '${MICAELA}' \\gset
`;

/** Los colores como los manda la hoja: `[{color_codigo, stock_minimo?, saldo_inicial?: {cantidad, costo_total}}]`. */
const COLOR = (variable, saldo = null) => `jsonb_build_object('color_codigo', :'${variable}'${saldo ? `, 'saldo_inicial', jsonb_build_object('cantidad', ${saldo[0]}, 'costo_total', ${saldo[1]})` : ""})`;
const COLORES = (...cs) => `jsonb_build_array(${cs.join(", ")})`;
const TELA = (nombre, extra = "") => `jsonb_build_object('nombre', '${nombre}'${extra})`;
const CREAR = (nombre, colores, extra = "", token = "null") => `retail.crear_material(:'taller', ${TELA(nombre, extra)}, ${colores}, ${token})`;

/** Micaela, en el Taller y con el módulo «Producción» (como lo prueba produccion_tela.mjs): ya no es «una persona de Trujillo». */
const MICAELA_EN_EL_TALLER = `
insert into retail.rol_modulos (rol_id, modulo) select c.rol_id, 'produccion' from retail.colaboradores c where c.persona_id = :'micaela_p' on conflict do nothing;
update retail.colaboradores set ubicacion_asignada_id = :'taller' where persona_id = :'micaela_p';
${como(MICAELA)}`;
const MICAELA_SIN_PRODUCCION = `
delete from retail.rol_modulos where modulo = 'produccion' and rol_id = (select c.rol_id from retail.colaboradores c where c.persona_id = :'micaela_p');
${como(MICAELA)}`;

const CASOS = [];
const ok = (nombre, sql, verificar) => CASOS.push({ nombre, tipo: "exito", sql: `${PREPARAR}${sql}\nrollback;`, verificar });
const mal = (nombre, contiene, sql) => CASOS.push({ nombre, tipo: "error", contiene, sql: `${PREPARAR}${sql}\nrollback;` });

// ---------------- A. Crear ----------------
ok(
  "A1 crear una tela con dos colores: código de la base, colores `ZAF-01-<COL>` y nombre «Tela · Color»",
  `select ${CREAR("Zafiro Prueba", COLORES(COLOR("c1"), COLOR("c2")))} as r \\gset
select (:'r'::jsonb -> 'material' ->> 'codigo')
  || '|' || (select string_agg(i.codigo, ',' order by i.codigo) from retail.insumos i where i.material_id = (:'r'::jsonb -> 'material' ->> 'id')::uuid)
  || '|' || (select bool_and(i.nombre like 'Zafiro Prueba · %') from retail.insumos i where i.material_id = (:'r'::jsonb -> 'material' ->> 'id')::uuid);`,
  (c) => c[0] === "ZAF-01" && c[1].split(",").length === 2 && c[1].split(",").every((x) => x.startsWith("ZAF-01-")) && c[2] === "true"
);
ok(
  "A2 el tipo, la unidad, el tejido y la merma de cada color son los de su tela",
  `select id as tej from retail.tejidos where activo order by nombre limit 1 \\gset
select ${CREAR("Zafiro Prueba", COLORES(COLOR("c1"), COLOR("c2")), `, 'tejido_id', :'tej', 'merma_pct', 0.05`)} as r \\gset
select count(*) filter (where i.tipo = 'tela' and i.unidad_medida = 'metro' and i.tejido_id = m.tejido_id and i.merma_pct = 0.05 and m.merma_pct = 0.05 and m.tejido_id = :'tej'), count(*)
  from retail.insumos i join retail.materiales m on m.id = i.material_id where m.id = (:'r'::jsonb -> 'material' ->> 'id')::uuid;`,
  (c) => Number(c[0]) === 2 && Number(c[1]) === 2
);
ok(
  "A3 la segunda tela con el mismo prefijo toma el siguiente número",
  `select ${CREAR("Zafiro Prueba", COLORES(COLOR("c1")))} as r1 \\gset
select ${CREAR("Zafiro Otra", COLORES(COLOR("c1")))} as r2 \\gset
select (:'r1'::jsonb -> 'material' ->> 'codigo') || ',' || (:'r2'::jsonb -> 'material' ->> 'codigo');`,
  (c) => c[0] === "ZAF-01,ZAF-02"
);
ok(
  "A4 una tela sin colores se puede crear (sus colores llegan después); una tela sin color propio también",
  `select ${CREAR("Zafiro Sin Colores", "'[]'::jsonb")} as r1 \\gset
select ${CREAR("Zafiro Lisa", `jsonb_build_array(jsonb_build_object('color_codigo', null))`)} as r2 \\gset
select (select count(*) from retail.insumos where material_id = (:'r1'::jsonb -> 'material' ->> 'id')::uuid), (select codigo || '|' || nombre from retail.insumos where material_id = (:'r2'::jsonb -> 'material' ->> 'id')::uuid);`,
  (c) => Number(c[0]) === 0 && c[1].startsWith("ZAF-") && c[2] === "Zafiro Lisa"
);
ok(
  "A5 una tela se crea siempre en metros, aunque pidan otra unidad",
  `select ${CREAR("Zafiro Prueba", COLORES(COLOR("c1")), `, 'unidad_medida', 'kilo'`)} as r \\gset
select (:'r'::jsonb -> 'material' ->> 'unidad_medida'), (select unidad_medida from retail.insumos where material_id = (:'r'::jsonb -> 'material' ->> 'id')::uuid);`,
  (c) => c[0] === "metro" && c[1] === "metro"
);

// ---------------- B. Saldo inicial ----------------
ok(
  "B1 con saldo inicial (líder): un lote de saldo inicial por color, con su costo",
  `select ${CREAR("Zafiro Prueba", COLORES(COLOR("c1", [9, 90]), COLOR("c2")))} as r \\gset
select count(*), min(l.cantidad_ingresada), min(l.costo_unitario), min(l.origen) from retail.insumo_lotes l join retail.insumos i on i.id = l.insumo_id where i.material_id = (:'r'::jsonb -> 'material' ->> 'id')::uuid;`,
  (c) => Number(c[0]) === 1 && Number(c[1]) === 9 && Number(c[2]) === 10 && c[3] === "saldo_inicial"
);
ok(
  "B2 el mismo token dos veces devuelve la misma tela y deja UN lote",
  `select gen_random_uuid() as tk \\gset
select ${CREAR("Zafiro Prueba", COLORES(COLOR("c1", [9, 90])), "", ":'tk'")} as r1 \\gset
select ${CREAR("Zafiro Prueba", COLORES(COLOR("c1", [9, 90])), "", ":'tk'")} as r2 \\gset
select (:'r1'::jsonb = :'r2'::jsonb)::text, (select count(*) from retail.materiales where nombre = 'Zafiro Prueba'), (select count(*) from retail.insumo_lotes l join retail.insumos i on i.id = l.insumo_id where i.nombre like 'Zafiro Prueba%');`,
  (c) => c[0] === "true" && Number(c[1]) === 1 && Number(c[2]) === 1
);
mal(
  "B3 el mismo token con OTROS datos se rechaza (no se mezcla un envío con otro)",
  "no es lo que se mandó la primera vez",
  `select gen_random_uuid() as tk \\gset
select ${CREAR("Zafiro Prueba", COLORES(COLOR("c1")), "", ":'tk'")} as r1 \\gset
select ${CREAR("Zafiro Distinta", COLORES(COLOR("c1")), "", ":'tk'")};`
);
mal("B4 un saldo sin costo se rechaza (0 si no lo sabes, pero se escribe)", "necesita su costo", `select ${CREAR("Zafiro Prueba", `jsonb_build_array(jsonb_build_object('color_codigo', :'c1', 'saldo_inicial', jsonb_build_object('cantidad', 9)))`)};`);

// ---------------- C. Quién ----------------
mal(
  "C1 sin el módulo «Producción» no se crea nada",
  "módulo «Producción»",
  `${MICAELA_SIN_PRODUCCION}
select ${CREAR("Zafiro Prueba", COLORES(COLOR("c1")))};`
);
ok(
  "C2 quien ve Producción en ese Taller crea telas y colores (sin saldo)",
  `${MICAELA_EN_EL_TALLER}
select ${CREAR("Zafiro Prueba", COLORES(COLOR("c1"), COLOR("c2")))} as r \\gset
select count(*) from retail.insumos where material_id = (:'r'::jsonb -> 'material' ->> 'id')::uuid;`,
  (c) => Number(c[0]) === 2
);
mal(
  "C3 pero el saldo inicial, con su costo, solo lo anota el líder",
  "lo anota el líder",
  `${MICAELA_EN_EL_TALLER}
select ${CREAR("Zafiro Prueba", COLORES(COLOR("c1", [9, 90])))};`
);

// ---------------- D. Todo o nada ----------------
ok(
  "D1 un color que no existe tumba la creación entera: ni tela, ni colores, ni número de código gastado",
  `select set_config('app.taller', :'taller', true) as a, set_config('app.c1', :'c1', true) as b \\gset
do $t$ begin
  begin
    perform retail.crear_material(current_setting('app.taller')::uuid, jsonb_build_object('nombre', 'Zafiro Atomico'),
      jsonb_build_array(jsonb_build_object('color_codigo', current_setting('app.c1')), jsonb_build_object('color_codigo', 'ZZZ')));
  exception when others then null;
  end;
end $t$;
select (select count(*) from retail.materiales where nombre = 'Zafiro Atomico') || ',' || (select count(*) from retail.insumos where nombre like 'Zafiro Atomico%')
  || ',' || coalesce((select ultimo::text from retail.codigos_correlativos where prefijo = 'MAT-ZAF'), 'sin');`,
  (c) => c[0] === "0,0,sin"
);
mal("D2 un color inexistente se dice por su nombre", "no existe o está desactivado", `select ${CREAR("Zafiro Prueba", `jsonb_build_array(jsonb_build_object('color_codigo', 'ZZZ'))`)};`);

// ---------------- E. Repetidas y datos de compra ----------------
mal(
  "E1 la misma tela otra vez AVISA y dice cuál es",
  "Ya existe «Zafiro Prueba» (ZAF-01)",
  `select ${CREAR("Zafiro Prueba", COLORES(COLOR("c1")))} as r \\gset
select ${CREAR("Zafiro Prueba", COLORES(COLOR("c2")))};`
);
mal(
  "E2 ni cambiando mayúsculas, tildes o espacios",
  "Ya existe",
  `select ${CREAR("Zafiro Prueba", COLORES(COLOR("c1")))} as r \\gset
select ${CREAR("  zafíro   PRUEBA ", COLORES(COLOR("c2")))};`
);
mal("E3 una tela por kilo pide su ancho y su gramaje", "ancho y su gramaje", `select ${CREAR("Zafiro Prueba", COLORES(COLOR("c1")), `, 'unidad_compra', 'kilo'`)};`);
mal("E4 una tela por rollo pide cuántos metros trae", "cuántos metros trae un rollo", `select ${CREAR("Zafiro Prueba", COLORES(COLOR("c1")), `, 'unidad_compra', 'rollo'`)};`);
ok(
  "E5 por kilo, con sus medidas, entra y guarda cómo se compra",
  `select ${CREAR("Zafiro Prueba", COLORES(COLOR("c1")), `, 'unidad_compra', 'kilo', 'ancho_cm', 160, 'gramaje_gm2', 180`)} as r \\gset
select (:'r'::jsonb -> 'material' ->> 'unidad_compra'), (:'r'::jsonb -> 'material' ->> 'ancho_cm')::numeric, (:'r'::jsonb -> 'material' ->> 'gramaje_gm2')::numeric;`,
  (c) => c[0] === "kilo" && Number(c[1]) === 160 && Number(c[2]) === 180
);
mal("E6 los números que no se entienden se dicen", "no se entienden", `select ${CREAR("Zafiro Prueba", COLORES(COLOR("c1")), `, 'merma_pct', 'abc'`)};`);
mal("E7 la merma fuera de rango se rechaza", "La merma va de 0", `select ${CREAR("Zafiro Prueba", COLORES(COLOR("c1")), `, 'merma_pct', 0.7`)};`);

// ---------------- F. Agregar colores ----------------
ok(
  "F1 agregar colores suma los que faltan y deja los que ya estaban",
  `select ${CREAR("Zafiro Prueba", COLORES(COLOR("c1")))} as r \\gset
select (:'r'::jsonb -> 'material' ->> 'id')::uuid as mid \\gset
select id as id_c1 from retail.insumos where material_id = :'mid' \\gset
select retail.agregar_colores_a_material(:'mid', :'taller', ${COLORES(COLOR("c1"), COLOR("c2"))}) as r2 \\gset
select count(*), bool_or(i.id = :'id_c1') from retail.insumos i where i.material_id = :'mid';`,
  (c) => Number(c[0]) === 2 && c[1] === "t"
);
mal(
  "F2 un saldo en un color que ya existía se rechaza (eso es «Llegó tela»)",
  "Llegó tela",
  `select ${CREAR("Zafiro Prueba", COLORES(COLOR("c1")))} as r \\gset
select retail.agregar_colores_a_material((:'r'::jsonb -> 'material' ->> 'id')::uuid, :'taller', ${COLORES(COLOR("c1", [5, 50]))});`
);
ok(
  "F3 agregar con saldo y el mismo token dos veces: un solo lote",
  `select ${CREAR("Zafiro Prueba", COLORES(COLOR("c1")))} as r \\gset
select (:'r'::jsonb -> 'material' ->> 'id')::uuid as mid, gen_random_uuid() as tk \\gset
select retail.agregar_colores_a_material(:'mid', :'taller', ${COLORES(COLOR("c2", [5, 50]))}, :'tk') as a1 \\gset
select retail.agregar_colores_a_material(:'mid', :'taller', ${COLORES(COLOR("c2", [5, 50]))}, :'tk') as a2 \\gset
select count(*) from retail.insumo_lotes l join retail.insumos i on i.id = l.insumo_id where i.material_id = :'mid';`,
  (c) => Number(c[0]) === 1
);
mal("F4 agregar a una tela que no existe", "ya no existe", `select retail.agregar_colores_a_material(gen_random_uuid(), :'taller', ${COLORES(COLOR("c1"))});`);

// ---------------- G. Copias de la tela ----------------
mal(
  "G1 la merma es de la tela: no se cambia en un solo color",
  "son de la tela",
  `select ${CREAR("Zafiro Prueba", COLORES(COLOR("c1")))} as r \\gset
update retail.insumos set merma_pct = 0.1 where material_id = (:'r'::jsonb -> 'material' ->> 'id')::uuid;`
);
ok(
  "G2 el nombre y el código de un color no se escriben a mano: los pone la tela",
  `select ${CREAR("Zafiro Prueba", COLORES(COLOR("c1")))} as r \\gset
update retail.insumos set nombre = 'Otro', codigo = 'OTRO-1' where material_id = (:'r'::jsonb -> 'material' ->> 'id')::uuid;
select nombre like 'Zafiro Prueba%', codigo = 'ZAF-01-' || :'c1' from retail.insumos where material_id = (:'r'::jsonb -> 'material' ->> 'id')::uuid;`,
  (c) => c[0] === "t" && c[1] === "t"
);
mal(
  "G3 un color no se suelta de su tela",
  "no deja de ser de su tela",
  `select ${CREAR("Zafiro Prueba", COLORES(COLOR("c1")))} as r \\gset
update retail.insumos set material_id = null where material_id = (:'r'::jsonb -> 'material' ->> 'id')::uuid;`
);
mal(
  "G4 ni pasa de una tela a otra",
  "no pasa de una tela a otra",
  `select ${CREAR("Zafiro Prueba", COLORES(COLOR("c1")))} as r1 \\gset
select ${CREAR("Zafiro Otra", COLORES(COLOR("c2")))} as r2 \\gset
update retail.insumos set material_id = (:'r2'::jsonb -> 'material' ->> 'id')::uuid where material_id = (:'r1'::jsonb -> 'material' ->> 'id')::uuid;`
);

// ---------------- H. Estados imposibles ----------------
mal(
  "H1 el mismo color dos veces en una tela no cabe",
  "insumos_material_color_unico",
  // El código de un color es derivado: dos colores iguales darían también el mismo código y chocarían ANTES con el candado del código. Se quitan esos dos para probar este por separado.
  `select ${CREAR("Zafiro Prueba", COLORES(COLOR("c1")))} as r \\gset
alter table retail.insumos drop constraint insumos_codigo_key;
drop index retail.insumos_codigo_clave_unico;
insert into retail.insumos (codigo, nombre, tipo, unidad_medida, material_id, color_codigo) values ('ZZ-DUP', 'Dup', 'tela', 'metro', (:'r'::jsonb -> 'material' ->> 'id')::uuid, :'c1');`
);
mal(
  "H2 una tela por kilo sin medidas no cabe ni insertándola directo",
  "materiales_kilo_pide_ancho_y_gramaje",
  `insert into retail.materiales (codigo, nombre, tipo, unidad_medida, unidad_compra) values ('ZZ-K1', 'Kilo sin medidas', 'tela', 'metro', 'kilo');`
);
mal(
  "H3 una medida que no es un número no entra (NaN)",
  "materiales_medidas_con_tope",
  `insert into retail.materiales (codigo, nombre, tipo, unidad_medida, unidad_compra, ancho_cm, gramaje_gm2) values ('ZZ-N1', 'Nan', 'tela', 'metro', 'kilo', 'NaN', 180);`
);
mal(
  "H4 una tela no se mide en kilos",
  "materiales_tela_en_metros",
  `insert into retail.materiales (codigo, nombre, tipo, unidad_medida, unidad_compra) values ('ZZ-K2', 'Tela en kilos', 'tela', 'kilo', 'metro');`
);
mal(
  "H5 el tipo y la unidad de una tela no se cambian",
  "no se cambian",
  `select ${CREAR("Zafiro Lana", COLORES(COLOR("c1")), `, 'tipo', 'avio', 'unidad_medida', 'unidad'`)} as r \\gset
update retail.materiales set unidad_medida = 'kilo' where id = (:'r'::jsonb -> 'material' ->> 'id')::uuid;`
);
mal(
  "H6 un color no puede tener otra unidad que su tela (llave compuesta)",
  "insumos_material_fk",
  `select ${CREAR("Zafiro Prueba", COLORES(COLOR("c1")))} as r \\gset
alter table retail.insumos disable trigger insumos_copias_de_la_tela;
insert into retail.insumos (codigo, nombre, tipo, unidad_medida, material_id, color_codigo) values ('ZZ-U1', 'Unidad distinta', 'avio', 'unidad', (:'r'::jsonb -> 'material' ->> 'id')::uuid, :'c2');`
);

// ---------------- I. Lo que ya existía ----------------
const SUELTO = (codigo, nombre, extra = "") => `insert into retail.insumos (codigo, nombre, tipo, unidad_medida${extra ? ", color_codigo" : ""}) values ('${codigo}', '${nombre}', 'tela', 'metro'${extra ? `, ${extra}` : ""});`;
ok(
  "I1 un insumo suelto se vuelve tela: su código pasa a ser el de la tela y su color, `CÓDIGO-COL`",
  `${SUELTO("ZZ-VIEJO", "Tela vieja", ":'c1'")}
select count(*) filter (where resultado = 'convertido') as n from retail.fn_materializar_insumos_sueltos(true) \\gset
select :'n', m.codigo, i.codigo, i.nombre like 'Tela vieja · %' from retail.insumos i join retail.materiales m on m.id = i.material_id where i.nombre like 'Tela vieja%';`,
  (c) => Number(c[0]) >= 1 && c[1] === "ZZ-VIEJO" && c[2] === `ZZ-VIEJO-${c[2].split("-").at(-1)}` && c[3] === "t"
);
ok(
  "I2 por defecto ENSAYA: dice qué haría y no escribe nada",
  `${SUELTO("ZZ-E1", "Ensayada", ":'c1'")}
select count(*) filter (where resultado = 'se convertiría') as n from retail.fn_materializar_insumos_sueltos() \\gset
select :'n', (select count(*) from retail.insumos where codigo = 'ZZ-E1' and material_id is null), (select count(*) from retail.materiales where nombre = 'Ensayada');`,
  (c) => Number(c[0]) >= 1 && Number(c[1]) === 1 && Number(c[2]) === 0
);
ok(
  "I3 dos sueltos con el mismo nombre y distinto color son UNA tela con dos colores (ya no se detiene)",
  `${SUELTO("ZZ-R1", "Repetida", ":'c1'")}
${SUELTO("ZZ-R2", "repetida", ":'c2'")}
select count(*) as n from retail.fn_materializar_insumos_sueltos(true) \\gset
select (select count(*) from retail.materiales where lower(nombre) = 'repetida'), (select count(*) from retail.insumos where material_id is not null and lower(nombre) like 'repetida%'),
  (select bool_and(codigo like 'ZZ-R1-%') from retail.insumos where material_id is not null and lower(nombre) like 'repetida%');`,
  (c) => Number(c[0]) === 1 && Number(c[1]) === 2 && c[2] === "t"
);
ok(
  "I4 el mismo nombre y el MISMO color: el segundo se queda suelto, dice por qué y el primero sí se convierte",
  `${SUELTO("ZZ-S1", "Choque", ":'c1'")}
${SUELTO("ZZ-S2", "choque", ":'c1'")}
select count(*) as n from retail.fn_materializar_insumos_sueltos(true) \\gset
select (select count(*) from retail.insumos where codigo like 'ZZ-S1-%'), (select count(*) from retail.insumos where codigo = 'ZZ-S2' and material_id is null),
  (select detalle from retail.fn_materializar_insumos_sueltos() where insumo_codigo = 'ZZ-S2');`,
  (c) => Number(c[0]) === 1 && Number(c[1]) === 1 && c[2].includes("ya tiene ese color")
);
ok(
  "I5 los avíos sueltos y los archivados no se tocan",
  `insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('ZZ-A1', 'Botón suelto', 'avio', 'unidad');
insert into retail.insumos (codigo, nombre, tipo, unidad_medida, archivado_at) values ('ZZ-A2', 'Archivada vieja', 'tela', 'metro', now());
select count(*) as n from retail.fn_materializar_insumos_sueltos(true) \\gset
select (select material_id is null from retail.insumos where codigo = 'ZZ-A1'), (select material_id is null from retail.insumos where codigo = 'ZZ-A2');`,
  (c) => c[0] === "t" && c[1] === "t"
);
ok(
  "I6 el nombre que ya trae « · Color» (lo que se ve en la lista) no crea otra tela ni duplica el color",
  `select nombre as cn from retail.colores where codigo = :'c1' \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida, color_codigo) values ('ZZ-L1', 'Lana vieja · ' || :'cn', 'tela', 'metro', :'c1');
select count(*) as n from retail.fn_materializar_insumos_sueltos(true) \\gset
select m.nombre, i.nombre = 'Lana vieja · ' || :'cn' from retail.insumos i join retail.materiales m on m.id = i.material_id where i.codigo like 'ZZ-L1%';`,
  (c) => c[0] === "Lana vieja" && c[1] === "t"
);
ok(
  "I7 un código de más de 20 letras no abortaría nada: la tela recibe uno de la base y el resto se convierte",
  `insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('ZZ-CODIGO-MUY-LARGO-PARA-UNA-TELA', 'Larga', 'tela', 'metro');
${SUELTO("ZZ-OK1", "Normalita")}
select count(*) as n from retail.fn_materializar_insumos_sueltos(true) \\gset
select (select count(*) from retail.materiales where nombre = 'Larga' and length(codigo) <= 20), (select count(*) from retail.materiales where nombre = 'Normalita');`,
  (c) => Number(c[0]) === 1 && Number(c[1]) === 1
);

// ---------------- J. Puertas ----------------
ok(
  "J1 anon no llama a nada; authenticated solo a las dos funciones de alta, no a las internas",
  `select concat_ws(',',
    has_function_privilege('anon', 'retail.crear_material(uuid,jsonb,jsonb,uuid)', 'execute'),
    has_function_privilege('authenticated', 'retail.crear_material(uuid,jsonb,jsonb,uuid)', 'execute'),
    has_function_privilege('authenticated', 'retail.agregar_colores_a_material(uuid,uuid,jsonb,uuid)', 'execute'),
    has_function_privilege('authenticated', 'retail.fn_material_agregar_colores(uuid,uuid,jsonb,uuid)', 'execute'),
    has_function_privilege('authenticated', 'retail.fn_codigo_de_material(text,text)', 'execute'),
    has_function_privilege('authenticated', 'retail.fn_materializar_insumos_sueltos(boolean)', 'execute'),
    has_function_privilege('authenticated', 'retail.editar_material(uuid,uuid,jsonb)', 'execute'),
    has_function_privilege('anon', 'retail.editar_material(uuid,uuid,jsonb)', 'execute'),
    has_function_privilege('authenticated', 'retail.fn_material_leer(jsonb,text,text)', 'execute'),
    has_function_privilege('authenticated', 'retail.fn_materiales_propagar_a_colores()', 'execute'));`,
  (c) => c[0] === "f,t,t,f,f,f,t,f,f,f"
);
mal(
  "J2 la tabla de telas no se escribe desde la API",
  "materiales",
  `set local role authenticated;
insert into retail.materiales (codigo, nombre, tipo, unidad_medida) values ('ZZ-API', 'Desde la API', 'tela', 'metro');`
);
ok(
  "J3 pero sí se lee",
  `select ${CREAR("Zafiro Prueba", COLORES(COLOR("c1")))} as r \\gset
set local role authenticated;
select count(*) from retail.materiales where nombre = 'Zafiro Prueba';`,
  (c) => Number(c[0]) === 1
);

// ---------------- K. Editar una tela (revisión del 28-oct: una tela ya creada no se podía corregir) ----------------
const EDITAR = (mid, datos) => `retail.editar_material(${mid}, :'taller', ${datos})`;
const TELA_DOS_COLORES = `select ${CREAR("Zafiro Prueba", COLORES(COLOR("c1"), COLOR("c2")))} as r \\gset
select (:'r'::jsonb -> 'material' ->> 'id')::uuid as mid \\gset`;
ok(
  "K1 el líder corrige una tela y TODOS sus colores la siguen (nombre, tejido, merma), con el código intacto",
  `${TELA_DOS_COLORES}
select id as tej from retail.tejidos where activo order by nombre limit 1 \\gset
select ${EDITAR(":'mid'", `jsonb_build_object('nombre', 'Zafiro Renombrado', 'tejido_id', :'tej', 'merma_pct', 0.08, 'composicion', '100 % algodón')`)} as r2 \\gset
select count(*) filter (where i.nombre like 'Zafiro Renombrado · %' and i.tejido_id = :'tej' and i.merma_pct = 0.08 and i.codigo like 'ZAF-01-%'), count(*), (select composicion from retail.materiales where id = :'mid') from retail.insumos i where i.material_id = :'mid';`,
  (c) => Number(c[0]) === 2 && Number(c[1]) === 2 && c[2] === "100 % algodón"
);
mal(
  "K2 editar una tela es del líder: un colaborador, aunque vea Producción en ese Taller, no la edita",
  "Editar una tela es del líder",
  `${TELA_DOS_COLORES}
${MICAELA_EN_EL_TALLER}
select ${EDITAR(":'mid'", `jsonb_build_object('nombre', 'Zafiro Otro')`)};`
);
mal(
  "K3 renombrar a un nombre que ya tiene otra tela AVISA y dice cuál (aunque cambien mayúsculas, tildes o espacios)",
  "Ya existe «Zafiro Otra»",
  `select ${CREAR("Zafiro Prueba", COLORES(COLOR("c1")))} as r1 \\gset
select ${CREAR("Zafiro Otra", COLORES(COLOR("c2")))} as r2 \\gset
select ${EDITAR("(:'r1'::jsonb -> 'material' ->> 'id')::uuid", `jsonb_build_object('nombre', ' zafíro  OTRA ')`)};`
);
ok(
  "K4 el tipo y la unidad no se cambian al editar, aunque los manden",
  `${TELA_DOS_COLORES}
select ${EDITAR(":'mid'", `jsonb_build_object('nombre', 'Zafiro Prueba', 'tipo', 'avio', 'unidad_medida', 'kilo')`)} as r2 \\gset
select (:'r2'::jsonb -> 'material' ->> 'tipo'), (:'r2'::jsonb -> 'material' ->> 'unidad_medida'), (select count(*) from retail.insumos where material_id = :'mid' and tipo = 'tela' and unidad_medida = 'metro');`,
  (c) => c[0] === "tela" && c[1] === "metro" && Number(c[2]) === 2
);
ok(
  "K5 después de editar la tela, un color se puede archivar (el desfase ya no lo bloquea)",
  `${TELA_DOS_COLORES}
select id as tej from retail.tejidos where activo order by nombre limit 1 \\gset
select ${EDITAR(":'mid'", `jsonb_build_object('nombre', 'Zafiro Prueba', 'tejido_id', :'tej')`)} as r2 \\gset
update retail.insumos set archivado_at = now() where material_id = :'mid' and color_codigo = :'c1';
select count(*) filter (where archivado_at is not null), count(*) from retail.insumos where material_id = :'mid';`,
  (c) => Number(c[0]) === 1 && Number(c[1]) === 2
);
ok(
  "K6 un color que quedó desfasado se CURA al tocarlo (antes se bloqueaba con «son de la tela»)",
  `${TELA_DOS_COLORES}
alter table retail.insumos disable trigger insumos_copias_de_la_tela;
update retail.insumos set merma_pct = 0.2 where material_id = :'mid';
alter table retail.insumos enable trigger insumos_copias_de_la_tela;
update retail.insumos set stock_minimo = 5 where material_id = :'mid';
select max(merma_pct), min(stock_minimo) from retail.insumos where material_id = :'mid';`,
  (c) => Number(c[0]) === 0 && Number(c[1]) === 5
);
mal(
  "K7 cambiar el tejido de UN color sigue rechazado: es de la tela",
  "son de la tela",
  `select ${CREAR("Zafiro Prueba", COLORES(COLOR("c1")))} as r \\gset
select id as tej from retail.tejidos where activo order by nombre limit 1 \\gset
update retail.insumos set tejido_id = :'tej' where material_id = (:'r'::jsonb -> 'material' ->> 'id')::uuid;`
);
ok(
  "K8 un UPDATE directo de la tela (SQL del líder) también arrastra a sus colores",
  `${TELA_DOS_COLORES}
select id as tej from retail.tejidos where activo order by nombre limit 1 \\gset
update retail.materiales set tejido_id = :'tej', nombre = 'Zafiro Corregido' where id = :'mid';
select count(*) filter (where tejido_id = :'tej' and nombre like 'Zafiro Corregido · %'), count(*) from retail.insumos where material_id = :'mid';`,
  (c) => Number(c[0]) === 2 && Number(c[1]) === 2
);
ok(
  "K9 se puede pasar a comprar por kilo (con sus medidas) y volver a metro",
  `${TELA_DOS_COLORES}
select ${EDITAR(":'mid'", `jsonb_build_object('nombre', 'Zafiro Prueba', 'unidad_compra', 'kilo', 'ancho_cm', 160, 'gramaje_gm2', 180)`)} as r2 \\gset
select ${EDITAR(":'mid'", `jsonb_build_object('nombre', 'Zafiro Prueba', 'unidad_compra', 'metro')`)} as r3 \\gset
select (:'r2'::jsonb -> 'material' ->> 'unidad_compra'), (:'r2'::jsonb -> 'material' ->> 'ancho_cm')::numeric, (:'r3'::jsonb -> 'material' ->> 'unidad_compra'), (:'r3'::jsonb -> 'material' ->> 'ancho_cm');`,
  (c) => c[0] === "kilo" && Number(c[1]) === 160 && c[2] === "metro" && c[3] === ""
);

// ---------------- L. Candado de unidad ----------------
mal(
  "L1 colgar un insumo suelto de una tela de OTRA clase se rechaza (un avío no se vuelve tela)",
  "es de otra clase que la tela",
  `${TELA_DOS_COLORES}
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('ZZ-BOT', 'Botón suelto', 'avio', 'unidad');
update retail.insumos set material_id = :'mid' where codigo = 'ZZ-BOT';`
);
ok(
  "L2 colgar de la tela un suelto de la misma clase sí se puede: toma el nombre y el código de su color",
  `${TELA_DOS_COLORES}
insert into retail.insumos (codigo, nombre, tipo, unidad_medida, color_codigo) values ('ZZ-SUELTA', 'Tela suelta', 'tela', 'metro', :'c3');
select id as sid from retail.insumos where codigo = 'ZZ-SUELTA' \\gset
update retail.insumos set material_id = :'mid' where id = :'sid';
select codigo like 'ZAF-01-%', nombre like 'Zafiro Prueba · %' from retail.insumos where id = :'sid';`,
  (c) => c[0] === "t" && c[1] === "t"
);
ok(
  "L3 el candado de unidad ya no mira columnas: se dispara en todo UPDATE (el de antes no veía lo que otro disparador reescribía)",
  `select pg_get_triggerdef(t.oid) not like '%UPDATE OF%' from pg_trigger t where t.tgname = 'insumos_unidad_firme' and t.tgrelid = 'retail.insumos'::regclass;`,
  (c) => c[0] === "t"
);

// ---------------- M. Tokens: ningún saldo se pierde en silencio ----------------
mal(
  "M1 un color repetido en la lista se rechaza (sin token)",
  "Un color va una sola vez",
  `select ${CREAR("Zafiro Prueba", COLORES(COLOR("c1", [5, 50]), COLOR("c1", [3, 30])))};`
);
mal(
  "M2 y con token pasa lo MISMO (antes el segundo saldo se perdía en silencio y respondía bien)",
  "Un color va una sola vez",
  `select gen_random_uuid() as tk \\gset
select ${CREAR("Zafiro Prueba", COLORES(COLOR("c1", [5, 50]), COLOR("c1", [3, 30])), "", ":'tk'")};`
);
ok(
  "M3 el mismo token usado en OTRA tela ya no se toma por un reintento: los dos saldos se escriben",
  `select gen_random_uuid() as tk \\gset
select ${CREAR("Zafiro Prueba", COLORES(COLOR("c1", [5, 50])), "", ":'tk'")} as r1 \\gset
select ${CREAR("Zafiro Otra", COLORES(COLOR("c2")))} as r2 \\gset
select retail.agregar_colores_a_material((:'r2'::jsonb -> 'material' ->> 'id')::uuid, :'taller', ${COLORES(COLOR("c1", [3, 30]))}, :'tk') as a \\gset
select count(*), sum(l.cantidad_ingresada) from retail.insumo_lotes l join retail.insumos i on i.id = l.insumo_id where i.nombre like 'Zafiro %';`,
  (c) => Number(c[0]) === 2 && Number(c[1]) === 8
);

// ---------------- N. Dónde y quién ----------------
mal(
  "N1 una tela se anota solo en un Taller",
  "se anotan en un Taller",
  `select id as tienda from retail.ubicaciones where tipo <> 'taller' and activo order by nombre limit 1 \\gset
select retail.crear_material(:'tienda', jsonb_build_object('nombre', 'Zafiro Prueba'), '[]'::jsonb, null);`
);
mal(
  "N2 un avío lo crea el líder",
  "Los avíos los crea el líder",
  `${MICAELA_EN_EL_TALLER}
select retail.crear_material(:'taller', jsonb_build_object('nombre', 'Botón Prueba', 'tipo', 'avio', 'unidad_medida', 'unidad'), '[]'::jsonb, null);`
);
ok(
  "N3 el líder sí crea un avío",
  `select retail.crear_material(:'taller', jsonb_build_object('nombre', 'Botón Prueba', 'tipo', 'avio', 'unidad_medida', 'unidad'), jsonb_build_array(jsonb_build_object('color_codigo', :'c1')), null) as r \\gset
select (:'r'::jsonb -> 'material' ->> 'tipo'), (:'r'::jsonb -> 'material' ->> 'codigo') like 'BOT-%', (:'r'::jsonb -> 'material' ->> 'unidad_medida');`,
  (c) => c[0] === "avio" && c[1] === "t" && c[2] === "unidad"
);
ok(
  "N4 el correlativo no se recorta al llegar a 100 (ZAF-99, ZAF-100)",
  `insert into retail.codigos_correlativos (prefijo, ultimo) values ('MAT-ZAF', 98) on conflict (prefijo) do update set ultimo = 98;
select ${CREAR("Zafiro Uno", COLORES(COLOR("c1")))} as r1 \\gset
select ${CREAR("Zafiro Dos", COLORES(COLOR("c1")))} as r2 \\gset
select (:'r1'::jsonb -> 'material' ->> 'codigo') || ',' || (:'r2'::jsonb -> 'material' ->> 'codigo');`,
  (c) => c[0] === "ZAF-99,ZAF-100"
);

// ---------------- O. Insumos sueltos ----------------
mal(
  "O1 el código de un color ya usado por un insumo suelto se dice (no un error de índice)",
  "ya lo usa otro insumo",
  `select ${CREAR("Zafiro Prueba", COLORES(COLOR("c1")))} as r \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('ZAF-01-' || :'c2', 'Ocupa el código', 'avio', 'unidad');
select retail.agregar_colores_a_material((:'r'::jsonb -> 'material' ->> 'id')::uuid, :'taller', ${COLORES(COLOR("c2"))});`
);
mal(
  "O2 una tela con el nombre de un insumo suelto avisa (su línea de stock quedaría duplicada)",
  "insumo suelto con ese nombre",
  `insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('ZZ-SU', 'Zafiro Suelta', 'tela', 'metro');
select ${CREAR("zafiro suelta", COLORES(COLOR("c1")))};`
);

// ---------------- P. Medidas con sentido ----------------
mal(
  "P1 un ancho escrito en metros («1.60») se rechaza en castellano al crear (inflaba el saldo en kilos ×100)",
  "El ancho va en centímetros",
  `select ${CREAR("Zafiro Prueba", COLORES(COLOR("c1")), `, 'unidad_compra', 'kilo', 'ancho_cm', 1.6, 'gramaje_gm2', 180`)};`
);
mal(
  "P2 y al editar",
  "El ancho va en centímetros",
  `${TELA_DOS_COLORES}
select ${EDITAR(":'mid'", `jsonb_build_object('nombre', 'Zafiro Prueba', 'unidad_compra', 'kilo', 'ancho_cm', 1.6, 'gramaje_gm2', 180)`)};`
);
mal(
  "P3 la tabla también lo impide, insertándola directo",
  "materiales_medidas_plausibles",
  `insert into retail.materiales (codigo, nombre, tipo, unidad_medida, unidad_compra, ancho_cm, gramaje_gm2) values ('ZZ-P3', 'Ancho en metros', 'tela', 'metro', 'kilo', 1.6, 180);`
);
ok(
  "P4 un avío a peso (relleno) no necesita ancho ni gramaje; una tela por kilo sí",
  `insert into retail.materiales (codigo, nombre, tipo, unidad_medida, unidad_compra) values ('ZZ-AK', 'Relleno', 'avio', 'kilo', 'kilo');
select count(*) from retail.materiales where codigo = 'ZZ-AK';`,
  (c) => Number(c[0]) === 1
);
ok(
  "Q1 la respuesta de las funciones de alta no trae el token ni quién creó la tela",
  `select ${CREAR("Zafiro Prueba", COLORES(COLOR("c1")))} as r \\gset
select (:'r'::jsonb -> 'material') ? 'token_cliente', (:'r'::jsonb -> 'material') ? 'creado_por', (:'r'::jsonb -> 'material') ? 'codigo';`,
  (c) => c[0] === "f" && c[1] === "f" && c[2] === "t"
);

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
