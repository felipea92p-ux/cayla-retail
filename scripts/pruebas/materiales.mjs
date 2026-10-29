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
 *   K (cont.) Editar sin pisar a nadie: una hoja vieja o sin versión se rechaza (PT409); lo que no se manda queda como está; «Actividad» sabe quién y qué había antes; kilo → metro conserva las medidas.
 *   M (cont.) / N (cont.) / I (cont.) Un saldo de cero o mal formado se rechaza; sumar colores a un avío es del líder; el conversor frena a un suelto con otra merma u otro tejido y dice lo que cambiaría; un NULL ensaya.
 *   S. Las copias de cada color son las de su tela tras toda la batería; el detector ve un color renombrado en Catálogo y la cura documentada lo arregla.
 *   T. El orden: 203000 sin 172000 se detiene con un mensaje claro; repegar la PARTE 1 de 175000 después de 203000 se detiene; 203000 se pega dos veces.
 *   R. El camino de vuelta. El script de producción `pegar-en-produccion-deshacer-materiales-2026-10-28.sql` ENSAYA por defecto y no cambia nada; al aplicar, devuelve cada color a insumo suelto con
 *      su nombre y su código de antes (del respaldo del conversor, o de su tela si nació de él), deja libre a la web vieja y le quita las funciones de telas a `authenticated`; y su PARTE B (abandonar
 *      el diseño) corre tal cual, en su orden, sin romper ningún INSERT ni UPDATE de insumos.
 *
 *   U. Retirar un color (migración 20261029014000). `retirar_color_de_material` esconde un color de su tela sin borrar nada; es del líder; retirar dos veces no falla ni anota dos veces; se niega ante
 *      saldo, una orden de producción en proceso, una orden de insumos o una factura por recibir y la receta de un modelo (y lo anulado o archivado no lo retiene); y a un color retirado no le entra tela.
 *
 * Los mensajes del servidor salen en el idioma de la base: por eso los casos buscan el NOMBRE de la restricción o el texto propio de la migración.
 *
 * USO
 *   pnpm pruebas:materiales   → necesita el stack local (`npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
// Las dos migraciones que las pruebas de orden y de repegado corren tal cual.
const M203 = readFileSync(new URL("../../supabase/migrations/20261028203000_materiales_endurecimiento_y_editar_tela.sql", import.meta.url), "utf8");
const M175 = readFileSync(new URL("../../supabase/migrations/20261028175000_materiales_tela_con_colores.sql", import.meta.url), "utf8");
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
  "I8 al aplicar, cada insumo deja su fila de ANTES en el respaldo (es lo que usa el deshacer); al ensayar no queda nada",
  `${SUELTO("ZZ-RESP", "Tela con respaldo", ":'c1'")}
select count(*) as n from retail.fn_materializar_insumos_sueltos() \\gset
select count(*) as ensayo from respaldo_purgas.filas where tabla = 'insumos' and purga like 'materializar-insumos-%' and fila ->> 'codigo' = 'ZZ-RESP' \\gset
select count(*) as n2 from retail.fn_materializar_insumos_sueltos(true) \\gset
select :'ensayo', (select count(*) from respaldo_purgas.filas where tabla = 'insumos' and purga like 'materializar-insumos-%' and fila ->> 'codigo' = 'ZZ-RESP' and fila ->> 'nombre' = 'Tela con respaldo' and fila ->> 'material_id' is null);`,
  (c) => Number(c[0]) === 0 && Number(c[1]) === 1
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
// La hoja manda el `updated_at` que leyó al abrirse (control de versión, ADR-0193): el ayudante lo lee en el momento de llamar.
const EDITAR = (mid, datos) => `retail.editar_material(${mid}, :'taller', (${datos}) || jsonb_build_object('version', (select m.updated_at::text from retail.materiales m where m.id = ${mid})))`;
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
  "K9 se puede pasar a comprar por kilo (con sus medidas) y volver a metro (las medidas quedan guardadas por si vuelve al kilo)",
  `${TELA_DOS_COLORES}
select ${EDITAR(":'mid'", `jsonb_build_object('nombre', 'Zafiro Prueba', 'unidad_compra', 'kilo', 'ancho_cm', 160, 'gramaje_gm2', 180)`)} as r2 \\gset
select ${EDITAR(":'mid'", `jsonb_build_object('nombre', 'Zafiro Prueba', 'unidad_compra', 'metro')`)} as r3 \\gset
select (:'r2'::jsonb -> 'material' ->> 'unidad_compra'), (:'r2'::jsonb -> 'material' ->> 'ancho_cm')::numeric, (:'r3'::jsonb -> 'material' ->> 'unidad_compra'), (:'r3'::jsonb -> 'material' ->> 'ancho_cm');`,
  (c) => c[0] === "kilo" && Number(c[1]) === 160 && c[2] === "metro" && Number(c[3]) === 160
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

// ---------------- K (continuación). Editar sin pisar a nadie y dejando rastro ----------------
mal(
  "K10 una hoja VIEJA no pisa lo que otra persona guardó: la base rechaza una versión que ya no es la de la tela (PT409)",
  "Otra persona cambió esta tela",
  `${TELA_DOS_COLORES}
select retail.editar_material(:'mid', :'taller', jsonb_build_object('nombre', 'Zafiro Vieja', 'version', '2000-01-01T00:00:00+00:00'));`
);
mal(
  "K11 y una llamada sin versión tampoco pasa (no se puede pisar en silencio)",
  "Otra persona cambió esta tela",
  `${TELA_DOS_COLORES}
select retail.editar_material(:'mid', :'taller', jsonb_build_object('nombre', 'Zafiro Sin Version'));`
);
ok(
  "K12 lo que la hoja no manda queda como está: con solo el nombre no se borran la merma, el tejido ni la composición",
  `select id as tej from retail.tejidos where activo order by nombre limit 1 \\gset
select ${CREAR("Zafiro Prueba", COLORES(COLOR("c1")), `, 'tejido_id', :'tej', 'merma_pct', 0.05, 'composicion', 'Algodón'`)} as r \\gset
select (:'r'::jsonb -> 'material' ->> 'id')::uuid as mid \\gset
select ${EDITAR(":'mid'", `jsonb_build_object('nombre', 'Zafiro Solo Nombre')`)} as r2 \\gset
select (:'r2'::jsonb -> 'material' ->> 'nombre'), (:'r2'::jsonb -> 'material' ->> 'merma_pct')::numeric, (:'r2'::jsonb -> 'material' ->> 'tejido_id') = :'tej', (:'r2'::jsonb -> 'material' ->> 'composicion');`,
  (c) => c[0] === "Zafiro Solo Nombre" && Number(c[1]) === 0.05 && c[2] === "t" && c[3] === "Algodón"
);
ok(
  "K13 «Actividad» sabe quién creó la tela, quién le sumó colores y quién la corrigió, con el valor de antes y el de después",
  `select ${CREAR("Zafiro Prueba", COLORES(COLOR("c1")), `, 'merma_pct', 0.05`)} as r \\gset
select (:'r'::jsonb -> 'material' ->> 'id')::uuid as mid \\gset
select retail.agregar_colores_a_material(:'mid', :'taller', ${COLORES(COLOR("c2"))}) as a \\gset
select ${EDITAR(":'mid'", `jsonb_build_object('merma_pct', 0.15)`)} as e \\gset
select count(*) filter (where accion = 'tela_creada'), count(*) filter (where accion = 'colores_agregados'), count(*) filter (where accion = 'tela_editada'),
  max((detalle -> 'antes' ->> 'merma_pct')::numeric) filter (where accion = 'tela_editada'), max((detalle -> 'despues' ->> 'merma_pct')::numeric) filter (where accion = 'tela_editada'),
  bool_and(persona_id is not null)
  from retail.actividad where tabla = 'materiales' and registro_id = :'mid';`,
  (c) => Number(c[0]) === 1 && Number(c[1]) === 1 && Number(c[2]) === 1 && Number(c[3]) === 0.05 && Number(c[4]) === 0.15 && c[5] === "t"
);
ok(
  "K14 pasar de kilo a metro conserva el ancho y el gramaje guardados (la hoja no los manda y la base no los borra)",
  `${TELA_DOS_COLORES}
select ${EDITAR(":'mid'", `jsonb_build_object('unidad_compra', 'kilo', 'ancho_cm', 160, 'gramaje_gm2', 180)`)} as r2 \\gset
select ${EDITAR(":'mid'", `jsonb_build_object('unidad_compra', 'metro')`)} as r3 \\gset
select (:'r3'::jsonb -> 'material' ->> 'unidad_compra'), (:'r3'::jsonb -> 'material' ->> 'ancho_cm')::numeric, (:'r3'::jsonb -> 'material' ->> 'gramaje_gm2')::numeric;`,
  (c) => c[0] === "metro" && Number(c[1]) === 160 && Number(c[2]) === 180
);

// ---------------- M (continuación). Un saldo mal formado no se descarta en silencio ----------------
mal(
  "M4 un saldo de cantidad cero se rechaza (antes se descartaba en silencio y la persona creía haber anotado lo que ya tenía)",
  "tiene que ser mayor que cero",
  `select ${CREAR("Zafiro Prueba", COLORES(COLOR("c1", [0, 0])))};`
);
mal(
  "M5 un saldo que no es un objeto se rechaza",
  "se manda como un objeto",
  `select ${CREAR("Zafiro Prueba", `jsonb_build_array(jsonb_build_object('color_codigo', :'c1', 'saldo_inicial', to_jsonb('mucho'::text)))`)};`
);

// ---------------- N (continuación) ----------------
mal(
  "N5 sumarle colores a un avío también es del líder",
  "Los avíos los crea el líder",
  `select retail.crear_material(:'taller', jsonb_build_object('nombre', 'Botón Suma', 'tipo', 'avio', 'unidad_medida', 'unidad'), '[]'::jsonb, null) as r \\gset
${MICAELA_EN_EL_TALLER}
select retail.agregar_colores_a_material((:'r'::jsonb -> 'material' ->> 'id')::uuid, :'taller', ${COLORES(COLOR("c1"))});`
);

// ---------------- I (continuación). Lo que el conversor cambiaría al adoptar se dice, y lo que no debe cambiar se frena ----------------
const TELA_CON_MERMA = `select id as tej1 from retail.tejidos where activo order by nombre limit 1 \\gset
select id as tej2 from retail.tejidos where activo order by nombre offset 1 limit 1 \\gset
select ${CREAR("Tela Merma", COLORES(COLOR("c1")), `, 'merma_pct', 0.05, 'tejido_id', :'tej1'`)} as r \\gset`;
ok(
  "I9 un suelto con OTRA merma que la de su tela no se cuelga en silencio: se queda suelto y dice por qué",
  `${TELA_CON_MERMA}
insert into retail.insumos (codigo, nombre, tipo, unidad_medida, color_codigo, merma_pct) values ('ZZ-MM1', 'Tela Merma', 'tela', 'metro', :'c2', 0.2);
select count(*) as n from retail.fn_materializar_insumos_sueltos(true) \\gset
select (select count(*) from retail.insumos where codigo = 'ZZ-MM1' and material_id is null), (select detalle from retail.fn_materializar_insumos_sueltos() where insumo_codigo = 'ZZ-MM1');`,
  (c) => Number(c[0]) === 1 && c[1].includes("no es la de la tela")
);
ok(
  "I10 un suelto con merma 0 sí se adopta, y el ensayo dice lo que cambia: «merma 0 % → 5 %»",
  `${TELA_CON_MERMA}
insert into retail.insumos (codigo, nombre, tipo, unidad_medida, color_codigo) values ('ZZ-MM2', 'Tela Merma', 'tela', 'metro', :'c2');
select detalle from retail.fn_materializar_insumos_sueltos() where insumo_codigo = 'ZZ-MM2';`,
  (c) => c[0].includes("merma 0 % → 5 %") && c[0].includes("tejido (ninguno)")
);
ok(
  "I11 un suelto con OTRO tejido que su tela se queda suelto (la copia se lo cambiaría sin avisar)",
  `${TELA_CON_MERMA}
insert into retail.insumos (codigo, nombre, tipo, unidad_medida, color_codigo, tejido_id) values ('ZZ-MM3', 'Tela Merma', 'tela', 'metro', :'c2', :'tej2');
select (select count(*) from retail.fn_materializar_insumos_sueltos(true) where insumo_codigo = 'ZZ-MM3' and resultado = 'se queda suelto'), (select count(*) from retail.insumos where codigo = 'ZZ-MM3' and material_id is null);`,
  (c) => Number(c[0]) === 1 && Number(c[1]) === 1
);
ok(
  "I12 un NULL también ENSAYA (antes `not null` es nulo y escribía de verdad diciendo «se convertiría»)",
  `${SUELTO("ZZ-NUL", "Tela nula", ":'c1'")}
select count(*) as n from retail.fn_materializar_insumos_sueltos(null) \\gset
select (select count(*) from retail.insumos where codigo = 'ZZ-NUL' and material_id is null), (select count(*) from retail.materiales where nombre = 'Tela nula');`,
  (c) => Number(c[0]) === 1 && Number(c[1]) === 0
);

// ---------------- S. Las copias de cada color son las de su tela (el invariante que vigila INV-23 de /chaos) ----------------
const COPIAS_DESIGUALES = `select count(*) from retail.insumos i join retail.materiales m on m.id = i.material_id left join retail.colores c on c.codigo = i.color_codigo
 where i.tipo <> m.tipo or i.unidad_medida <> m.unidad_medida or i.tejido_id is distinct from m.tejido_id or i.merma_pct <> m.merma_pct
    or i.codigo <> m.codigo || coalesce('-' || i.color_codigo, '') or i.nombre <> m.nombre || coalesce(' · ' || c.nombre, '')`;
ok(
  "S1 tras crear, sumar colores, editar y convertir, ningún color tiene copias distintas de las de su tela",
  `${TELA_CON_MERMA}
select (:'r'::jsonb -> 'material' ->> 'id')::uuid as mid \\gset
select retail.agregar_colores_a_material(:'mid', :'taller', ${COLORES(COLOR("c2"), COLOR("c3"))}) as a \\gset
select ${EDITAR(":'mid'", `jsonb_build_object('nombre', 'Tela Merma Editada', 'merma_pct', 0.1, 'tejido_id', :'tej2')`)} as e \\gset
${SUELTO("ZZ-S1X", "Otra suelta", ":'c1'")}
select count(*) as n from retail.fn_materializar_insumos_sueltos(true) \\gset
${COPIAS_DESIGUALES};`,
  (c) => Number(c[0]) === 0
);
ok(
  "S2 el detector ve un color renombrado en Catálogo (la copia del nombre queda atrás) y la cura documentada lo arregla",
  `${TELA_CON_MERMA}
update retail.colores set nombre = nombre || ' (renombrado)' where codigo = :'c1';
${COPIAS_DESIGUALES.replace("select count(*) from", "select count(*) as antes from")} \\gset
update retail.insumos set material_id = material_id where material_id is not null;
select :'antes', (${COPIAS_DESIGUALES});`,
  (c) => Number(c[0]) >= 1 && Number(c[1]) === 0
);

// ---------------- T. El orden de pegado y el repegado ----------------
mal(
  "T1 sin 20261028172000 la migración 203000 se detiene al principio con un mensaje claro y no cambia nada",
  "Primero pega 20261028172000",
  `drop trigger insumos_unidad_firme on retail.insumos;
drop function retail.fn_insumos_unidad_firme();
${M203}`
);
mal(
  "T2 repegar la PARTE 1 de 20261028175000 cuando 203000 ya está se detiene y lo dice (no devuelve seis funciones a su versión anterior)",
  "ya está pegada",
  M175
);
ok(
  "T3 20261028203000 se puede pegar dos veces seguidas",
  `${M203}
${M203}
select to_regprocedure('retail.editar_material(uuid,uuid,jsonb)') is not null, to_regprocedure('retail.fn_materializar_insumos_sueltos()') is null;`,
  (c) => c[0] === "t" && c[1] === "t"
);

// ---------------- R. El camino de vuelta (script de producción, ensayado aquí) ----------------
const DESHACER = readFileSync(new URL("../../supabase/migrations/pegar-en-produccion-deshacer-materiales-2026-10-28.sql", import.meta.url), "utf8");
const DESHACER_APLICA = DESHACER.replace("v_aplicar boolean := false;", "v_aplicar boolean := true;");
if (DESHACER_APLICA === DESHACER) throw new Error("El script de deshacer ya no trae la línea APLICAR: la prueba R lo necesita.");
// La PARTE B vive comentada entre marcas; se corre tal cual (sin los «-- »), así lo que se documenta es lo que se ensaya.
const PARTE_B = DESHACER.split("-- PARTE-B-INICIO")[1]
  .split("-- PARTE-B-FIN")[0]
  .split("\n")
  .map((l) => l.replace(/^-- ?/, ""))
  .filter((l) => l.trim() !== "" && !l.startsWith("-- "))
  .join("\n");
const SUELTA_CONVERTIDA = `${SUELTO("ZZ-D1", "Tela vieja D", ":'c1'")}
select count(*) as n from retail.fn_materializar_insumos_sueltos(true) \\gset
select id as mid from retail.materiales where nombre = 'Tela vieja D' \\gset
select retail.agregar_colores_a_material(:'mid', :'taller', ${COLORES(COLOR("c2"))}) as x \\gset`;
mal(
  "R1 por defecto el deshacer ENSAYA: hace todo, cuenta y termina con un error que lo deshace",
  "ENSAYO_OK",
  `${SUELTA_CONVERTIDA}
${DESHACER}`
);
ok(
  "R2 al aplicar con el respaldo del conversor: el insumo vuelve a ser suelto con su nombre y su código de antes; el color sumado después conserva los suyos",
  `${SUELTA_CONVERTIDA}
${DESHACER_APLICA}
select (select count(*) from retail.insumos where codigo = 'ZZ-D1' and nombre = 'Tela vieja D' and material_id is null),
  (select count(*) from retail.insumos where nombre like 'Tela vieja D · %' and codigo = 'ZZ-D1-' || :'c2' and material_id is null),
  (select count(*) from retail.insumos where material_id is not null);`,
  (c) => Number(c[0]) === 1 && Number(c[1]) === 1 && Number(c[2]) === 0
);
ok(
  "R3 sin respaldo (el MM-01 se convirtió antes de que existiera): el insumo más antiguo de una tela del conversor vuelve con el nombre y el código de su tela",
  `with n as (insert into retail.materiales (codigo, nombre, tipo, unidad_medida) values ('ZZ-MM', 'Tela sin respaldo', 'tela', 'metro') returning id) select id as mid2 from n \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida, material_id, color_codigo) values ('X', 'X', 'tela', 'metro', :'mid2', :'c1');
select codigo as derivado from retail.insumos where material_id = :'mid2' \\gset
${DESHACER_APLICA}
select (select count(*) from retail.insumos where codigo = 'ZZ-MM' and nombre = 'Tela sin respaldo' and material_id is null), :'derivado' = 'ZZ-MM-' || :'c1';`,
  (c) => Number(c[0]) === 1 && c[1] === "t"
);
ok(
  "R4 después de deshacer la web vieja trabaja como antes (se crea y se completa un insumo suelto) y la web nueva ya no crea telas",
  `${SUELTA_CONVERTIDA}
${DESHACER_APLICA}
select id as tej from retail.tejidos where activo order by nombre limit 1 \\gset
update retail.insumos set tejido_id = :'tej' where codigo = 'ZZ-D1';
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('ZZ-NUEVO', 'Suelto nuevo', 'tela', 'metro');
select (select tejido_id = :'tej' from retail.insumos where codigo = 'ZZ-D1'),
  has_function_privilege('authenticated', 'retail.crear_material(uuid,jsonb,jsonb,uuid)', 'execute'),
  has_function_privilege('authenticated', 'retail.editar_material(uuid,uuid,jsonb)', 'execute'),
  (select tgenabled from pg_trigger where tgname = 'insumos_copias_de_la_tela' and tgrelid = 'retail.insumos'::regclass);`,
  (c) => c[0] === "t" && c[1] === "f" && c[2] === "f" && c[3] === "O"
);
ok(
  "R5 la PARTE B (abandonar el diseño) corre en su orden y deja a insumos sin la columna, sin la tabla de telas y editable como antes",
  `${SUELTA_CONVERTIDA}
${DESHACER_APLICA}
${PARTE_B}
update retail.insumos set nombre = 'Tela vieja D editada' where codigo = 'ZZ-D1';
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('ZZ-NUEVO2', 'Otro suelto', 'tela', 'metro');
select to_regclass('retail.materiales') is null,
  not exists (select 1 from information_schema.columns where table_schema = 'retail' and table_name = 'insumos' and column_name = 'material_id'),
  (select nombre from retail.insumos where codigo = 'ZZ-D1');`,
  (c) => c[0] === "t" && c[1] === "t" && c[2] === "Tela vieja D editada"
);

ok(
  "R6 el deshacer sirve TAMBIÉN en el estado de producción de hoy (sin 20261028203000): sin editar_material ensaya igual",
  `${SUELTA_CONVERTIDA}
drop function retail.editar_material(uuid, uuid, jsonb);
select 1 as hecho \\gset
select count(*) from retail.insumos where material_id is not null;`,
  (c) => Number(c[0]) >= 1
);
mal(
  "R6b …y el ensayo llega a su «ENSAYO_OK» aunque falte esa función",
  "ENSAYO_OK",
  `${SUELTA_CONVERTIDA}
drop function retail.editar_material(uuid, uuid, jsonb);
${DESHACER}`
);
ok(
  "R7 vuelve con el nombre y el código ORIGINALES de la tela aunque después se la haya editado (los toma de la foto de hoy, no de la tela de ahora)",
  `with n as (insert into retail.materiales (codigo, nombre, tipo, unidad_medida) values ('ZZ-FT', 'Tela de la foto', 'tela', 'metro') returning id) select id as mid3 from n \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida, material_id, color_codigo) values ('X', 'X', 'tela', 'metro', :'mid3', :'c1');
insert into respaldo_purgas.filas (purga, tabla, fila) select 'estado-tras-conversion-2026-10-28', 'materiales', to_jsonb(m) from retail.materiales m where m.id = :'mid3';
update retail.materiales set nombre = 'Tela Renombrada', codigo = 'ZZ-RN' where id = :'mid3';
${DESHACER_APLICA}
select (select count(*) from retail.insumos where codigo = 'ZZ-FT' and nombre = 'Tela de la foto' and material_id is null), (select count(*) from retail.insumos where nombre like 'Tela Renombrada%');`,
  (c) => Number(c[0]) === 1 && Number(c[1]) === 0
);
mal(
  "R8 si el código al que volvería ya lo usa OTRO insumo, se detiene y nombra a ese insumo (no un error crudo del índice)",
  "ya lo usa «Otro con el código»",
  `with n as (insert into retail.materiales (codigo, nombre, tipo, unidad_medida) values ('ZZ-FT', 'Tela de la foto', 'tela', 'metro') returning id) select id as mid3 from n \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida, material_id, color_codigo) values ('X', 'X', 'tela', 'metro', :'mid3', :'c1');
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('ZZ-FT', 'Otro con el código', 'avio', 'unidad');
${DESHACER_APLICA}`
);

// ---------------- U. Retirar un color (ADR-0554, «Retirar color»: alguien se equivocó de color y no había cómo quitarlo) ----------------
// Retirar es esconder (`archivado_at`): no borra nada. Se niega ante lo abierto —saldo, orden en proceso, orden de insumos o factura por recibir, receta de un modelo— y a un color retirado no le entra tela.
const RETIRAR = (ins) => `retail.retirar_color_de_material(${ins}, :'taller')`;
const TELA_TRES_COLORES = `select ${CREAR("Zafiro Prueba", COLORES(COLOR("c1"), COLOR("c2"), COLOR("c3")))} as r \\gset
select (:'r'::jsonb -> 'material' ->> 'id')::uuid as mid \\gset
select i.id as i1 from retail.insumos i where i.material_id = :'mid' and i.color_codigo = :'c1' \\gset
select i.id as i2 from retail.insumos i where i.material_id = :'mid' and i.color_codigo = :'c2' \\gset
select i.id as i3 from retail.insumos i where i.material_id = :'mid' and i.color_codigo = :'c3' \\gset
select p.id as felipe_p from public.personas p where p.auth_user_id = '${FELIPE}' \\gset`;
/** Una tela con un color con 9 m en el Taller (saldo inicial) y otro sin saldo. */
const TELA_CON_SALDO = `select ${CREAR("Zafiro Prueba", COLORES(COLOR("c1", [9, 90]), COLOR("c2")))} as r \\gset
select (:'r'::jsonb -> 'material' ->> 'id')::uuid as mid \\gset
select i.id as i1 from retail.insumos i where i.material_id = :'mid' and i.color_codigo = :'c1' \\gset
select i.id as i2 from retail.insumos i where i.material_id = :'mid' and i.color_codigo = :'c2' \\gset
select p.id as felipe_p from public.personas p where p.auth_user_id = '${FELIPE}' \\gset`;
/** Intenta retirar y, si la base se niega, devuelve su mensaje sin tumbar la transacción: para mirar que NADA cambió después de un rechazo. (psql no interpola variables dentro de un $x$: va por parámetros.) */
const INTENTAR_RETIRAR = (ins) => `create function pg_temp.intentar(p_i uuid, p_t uuid) returns text language plpgsql as $x$ begin perform retail.retirar_color_de_material(p_i, p_t); return 'ok'; exception when others then return 'RECHAZADO: ' || sqlerrm; end $x$;
select pg_temp.intentar(${ins}, :'taller') as intento \\gset`;

ok(
  "U1 el líder retira un color: sale de la lista, conserva su fila y su código, y los demás colores de la tela siguen",
  `${TELA_TRES_COLORES}
select ${RETIRAR(":'i2'")} as r2 \\gset
select (:'r2'::jsonb ->> 'retirado'), (:'r2'::jsonb ->> 'ya_estaba'),
  (select archivado_at is not null from retail.insumos where id = :'i2'),
  (select count(*) from retail.insumos where material_id = :'mid' and archivado_at is null),
  (select count(*) from retail.insumos where material_id = :'mid'),
  (select codigo from retail.insumos where id = :'i2');`,
  (c) => c[0] === "true" && c[1] === "false" && c[2] === "t" && Number(c[3]) === 2 && Number(c[4]) === 3 && c[5].startsWith("ZAF-01-")
);
ok(
  "U2 retirar dos veces (doble clic) no falla y no anota dos veces",
  `${TELA_TRES_COLORES}
select ${RETIRAR(":'i2'")} as r2 \\gset
select ${RETIRAR(":'i2'")} as r3 \\gset
select (:'r3'::jsonb ->> 'ya_estaba'), (select count(*) from retail.actividad where tabla = 'materiales' and registro_id = :'mid' and accion = 'color_retirado');`,
  (c) => c[0] === "true" && Number(c[1]) === 1
);
ok(
  "U3 «Actividad» dice quién lo retiró, qué color y de qué tela, sin cifras de dinero",
  `${TELA_TRES_COLORES}
select ${RETIRAR(":'i2'")} as r2 \\gset
select count(*), bool_and(persona_id is not null), bool_and(descripcion like 'retiró el color «%» (ZAF-01-%) de la tela «Zafiro Prueba» (ZAF-01)'), bool_and((detalle ->> 'insumo_id')::uuid = :'i2')
  from retail.actividad where tabla = 'materiales' and registro_id = :'mid' and accion = 'color_retirado';`,
  (c) => Number(c[0]) === 1 && c[1] === "t" && c[2] === "t" && c[3] === "t"
);
mal(
  "U4 un color con saldo no se retira, y el mensaje dice cuánto tiene y dónde",
  "todavía tiene 9 m en",
  `${TELA_CON_SALDO}
select ${RETIRAR(":'i1'")};`
);
ok(
  "U4b …y tras el rechazo no cambió nada (sigue a la vista, con su saldo y sin línea en Actividad)",
  `${TELA_CON_SALDO}
${INTENTAR_RETIRAR(":'i1'")}
select (:'intento' like 'RECHAZADO: Este color todavía tiene 9 m%'), (select archivado_at is null from retail.insumos where id = :'i1'),
  (select coalesce(sum(fisico), 0) from retail.v_insumo_saldos where insumo_id = :'i1'),
  (select count(*) from retail.actividad where tabla = 'materiales' and registro_id = :'mid' and accion = 'color_retirado');`,
  (c) => c[0] === "t" && c[1] === "t" && Number(c[2]) === 9 && Number(c[3]) === 0
);
ok(
  "U5 el saldo se lee del libro: con una salida que lo deja en cero, el color ya se puede retirar",
  `${TELA_CON_SALDO}
insert into retail.movimientos_insumo (insumo_id, insumo_lote_id, ubicacion_id, tipo, cantidad, costo_unitario, usuario_id, motivo)
  select l.insumo_id, l.id, l.ubicacion_id, 'ajuste', -9, l.costo_unitario, :'felipe_p', 'prueba: ingreso equivocado' from retail.insumo_lotes l where l.insumo_id = :'i1';
select ${RETIRAR(":'i1'")} as r1 \\gset
select (:'r1'::jsonb ->> 'retirado'), (select archivado_at is not null from retail.insumos where id = :'i1');`,
  (c) => c[0] === "true" && c[1] === "t"
);
mal(
  "U6 un color en una orden de producción en proceso no se retira (dice cuál orden)",
  "Este color está en la orden OP-",
  `${TELA_TRES_COLORES}
select id as prod from retail.productos order by created_at limit 1 \\gset
insert into retail.producciones (ubicacion_id, producto_id, estado, cantidad_plan) values (:'taller', :'prod', 'en_proceso', 12) returning id as op \\gset
insert into retail.produccion_insumos (produccion_id, insumo_id, consumo_por_prenda, cantidad_plan) values (:'op', :'i2', 1.2, 14.4);
select ${RETIRAR(":'i2'")};`
);
ok(
  "U6b …pero una orden terminada o anulada ya no lo retiene",
  `${TELA_TRES_COLORES}
select id as prod from retail.productos order by created_at limit 1 \\gset
insert into retail.producciones (ubicacion_id, producto_id, estado, cantidad_plan) values (:'taller', :'prod', 'en_proceso', 12) returning id as op \\gset
insert into retail.produccion_insumos (produccion_id, insumo_id, consumo_por_prenda, cantidad_plan) values (:'op', :'i2', 1.2, 14.4);
update retail.producciones set estado = 'anulada' where id = :'op';
select (${RETIRAR(":'i2'")} ->> 'retirado');`,
  (c) => c[0] === "true"
);
mal(
  "U7 un color con tela por recibir en una orden de insumos no se retira (dice cuál orden)",
  "tela por recibir en la orden de insumos OI-",
  `${TELA_TRES_COLORES}
insert into retail.proveedores_produccion (nombre, rubro) values ('Proveedor Prueba Retirar', 'tela') returning id as prov \\gset
insert into retail.ordenes_insumo (proveedor_id, ubicacion_destino_id, creada_por) values (:'prov', :'taller', :'felipe_p') returning id as oi \\gset
insert into retail.orden_insumo_items (orden_insumo_id, posicion, insumo_id, cantidad, unidad_medida, precio_unitario) values (:'oi', 1, :'i2', 20, 'metro', 12);
select ${RETIRAR(":'i2'")};`
);
ok(
  "U7b …y una orden de insumos anulada, o ya recibida por completo, no lo retiene",
  `${TELA_TRES_COLORES}
insert into retail.proveedores_produccion (nombre, rubro) values ('Proveedor Prueba Retirar', 'tela') returning id as prov \\gset
insert into retail.ordenes_insumo (proveedor_id, ubicacion_destino_id, creada_por, estado, anulada_por, anulada_en, motivo_anulacion)
  values (:'prov', :'taller', :'felipe_p', 'anulada', :'felipe_p', now(), 'Se pidió dos veces') returning id as oi \\gset
insert into retail.orden_insumo_items (orden_insumo_id, posicion, insumo_id, cantidad, unidad_medida, precio_unitario) values (:'oi', 1, :'i2', 20, 'metro', 12);
select (${RETIRAR(":'i2'")} ->> 'retirado');`,
  (c) => c[0] === "true"
);
mal(
  "U8 un color con tela por recibir en una factura vigente no se retira (dice cuál factura)",
  "tela por recibir en la factura TRT-",
  `${TELA_TRES_COLORES}
insert into retail.proveedores_produccion (nombre, rubro) values ('Proveedor Prueba Retirar', 'tela') returning id as pprov \\gset
insert into retail.comprobantes_produccion (proveedor_id, tipo, serie, numero, condicion, subtotal, igv, total) values (:'pprov', 'factura', 'TRT', '1', 'contado', 100, 18, 118) returning id as cprod \\gset
insert into retail.comprobantes_produccion_items (comprobante_id, insumo_id, descripcion, cantidad, costo_unitario) values (:'cprod', :'i2', 'Tela de prueba', 10, 10);
select ${RETIRAR(":'i2'")};`
);
mal(
  "U9 un color en la receta de un modelo no se retira (dice cuál modelo)",
  "es parte de la receta del modelo",
  `${TELA_TRES_COLORES}
select id as prod from retail.productos order by created_at limit 1 \\gset
insert into retail.producto_avios (producto_id, insumo_id, cantidad_por_prenda, declarado_por) values (:'prod', :'i2', 1, :'felipe_p');
select ${RETIRAR(":'i2'")};`
);
ok(
  "U9b …pero una línea de receta archivada ya no lo retiene",
  `${TELA_TRES_COLORES}
select id as prod from retail.productos order by created_at limit 1 \\gset
insert into retail.producto_avios (producto_id, insumo_id, cantidad_por_prenda, declarado_por, archivado_at) values (:'prod', :'i2', 1, :'felipe_p', now());
select (${RETIRAR(":'i2'")} ->> 'retirado');`,
  (c) => c[0] === "true"
);
mal(
  "U10 retirar un color es del líder: un colaborador, aunque vea Producción en ese Taller, no lo retira",
  "Retirar un color es del líder",
  `${TELA_TRES_COLORES}
${MICAELA_EN_EL_TALLER}
select ${RETIRAR(":'i2'")};`
);
mal(
  "U11 un insumo suelto (que no es el color de ninguna tela) no se retira por aquí",
  "Solo se retira el color de una tela",
  `insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('ZZ-SUELTO-U', 'Suelto de prueba', 'tela', 'metro') returning id as suelto \\gset
select ${RETIRAR(":'suelto'")};`
);
mal(
  "U12 un color que ya no existe se dice en castellano",
  "Ese color ya no existe",
  `select ${RETIRAR("'00000000-0000-4000-8000-000000000000'::uuid")};`
);
mal(
  "U13 solo en un Taller: en una tienda se dice",
  "Las telas y sus colores se anotan en un Taller",
  `${TELA_TRES_COLORES}
select retail.retirar_color_de_material(:'i2', (select id from retail.ubicaciones where tipo <> 'taller' and activo order by nombre limit 1));`
);
mal(
  "U14 a un color retirado NO le entra tela: el ingreso se rechaza y dice por qué",
  "está retirado: no se le ingresa tela",
  `${TELA_TRES_COLORES}
select ${RETIRAR(":'i2'")} as r2 \\gset
select retail.recibir_insumo(:'i2', :'taller', 5, 50);`
);
ok(
  "U14b …mientras que a un color a la vista le sigue entrando, y un retirado al que se le devuelve `archivado_at` vuelve a recibir",
  `${TELA_TRES_COLORES}
select retail.recibir_insumo(:'i1', :'taller', 5, 50) as a \\gset
select ${RETIRAR(":'i2'")} as r2 \\gset
update retail.insumos set archivado_at = null where id = :'i2';
select retail.recibir_insumo(:'i2', :'taller', 4, 40) as b \\gset
select (select coalesce(sum(fisico), 0) from retail.v_insumo_saldos where insumo_id = :'i1'), (select coalesce(sum(fisico), 0) from retail.v_insumo_saldos where insumo_id = :'i2');`,
  (c) => Number(c[0]) === 5 && Number(c[1]) === 4
);
ok(
  "U15 una tela con todos sus colores retirados sigue existiendo y se le pueden sumar otros colores",
  `${TELA_TRES_COLORES}
select ${RETIRAR(":'i1'")} as a \\gset
select ${RETIRAR(":'i2'")} as b \\gset
select ${RETIRAR(":'i3'")} as c \\gset
select codigo as c4 from retail.colores where activo and codigo not in (:'c1', :'c2', :'c3') order by codigo limit 1 \\gset
select retail.agregar_colores_a_material(:'mid', :'taller', ${COLORES(COLOR("c4"))}) as d \\gset
select (select count(*) from retail.materiales where id = :'mid' and archivado_at is null),
  (select count(*) from retail.insumos where material_id = :'mid' and archivado_at is null), (select count(*) from retail.insumos where material_id = :'mid');`,
  (c) => Number(c[0]) === 1 && Number(c[1]) === 1 && Number(c[2]) === 4
);
ok(
  "U16 puertas: anon no llama a nada; authenticated solo a retirar, no a las internas",
  `select concat_ws(',',
    has_function_privilege('anon', 'retail.retirar_color_de_material(uuid,uuid)', 'execute'),
    has_function_privilege('authenticated', 'retail.retirar_color_de_material(uuid,uuid)', 'execute'),
    has_function_privilege('authenticated', 'retail.fn_color_compromisos(uuid)', 'execute'),
    has_function_privilege('anon', 'retail.fn_color_compromisos(uuid)', 'execute'),
    has_function_privilege('authenticated', 'retail.fn_insumo_lotes_color_activo()', 'execute'));`,
  (c) => c[0] === "f,t,f,f,f"
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
