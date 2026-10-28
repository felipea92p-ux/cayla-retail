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
 *   I. Lo que ya existía. `fn_materializar_insumos_sueltos` vuelve tela cada insumo suelto, y se detiene si hay dos con el mismo nombre.
 *   J. Puertas. `anon` no llama a nada, `authenticated` solo a las dos funciones de alta, y la tabla de telas se lee pero no se escribe desde la API.
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
ok(
  "I1 un insumo suelto se vuelve tela: su código pasa a ser el de la tela y su color, `CÓDIGO-COL`",
  `insert into retail.insumos (codigo, nombre, tipo, unidad_medida, color_codigo) values ('ZZ-VIEJO', 'Tela vieja', 'tela', 'metro', :'c1');
select retail.fn_materializar_insumos_sueltos() as n \\gset
select :'n', m.codigo, i.codigo, i.nombre like 'Tela vieja · %' from retail.insumos i join retail.materiales m on m.id = i.material_id where i.nombre like 'Tela vieja%';`,
  (c) => Number(c[0]) >= 1 && c[1] === "ZZ-VIEJO" && c[2] === `ZZ-VIEJO-${c[2].split("-").at(-1)}` && c[3] === "t"
);
mal(
  "I2 dos insumos sueltos con el mismo nombre no se vuelven telas: dice cuáles y no cambia nada",
  "Hay insumos sueltos con el mismo nombre",
  `insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('ZZ-R1', 'Repetida', 'tela', 'metro');
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('ZZ-R2', 'repetida', 'tela', 'metro');
select retail.fn_materializar_insumos_sueltos();`
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
    has_function_privilege('authenticated', 'retail.fn_materializar_insumos_sueltos()', 'execute'));`,
  (c) => c[0] === "f,t,t,f,f,f"
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
