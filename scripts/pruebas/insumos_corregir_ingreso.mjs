#!/usr/bin/env node
/**
 * Prueba de «corregir y eliminar un ingreso de insumo» — ADR-0570, actividad 6a. Migración 20261030134000.
 *
 * Qué garantiza (cada caso termina en ROLLBACK, así que no deja rastro en el Postgres local compartido):
 *   A. Corregir. Cambiar la cantidad y el costo de un ingreso que nadie usó deja el lote corregido, el saldo y el valor del color al céntimo, el libro con el par «deshago + anoto»
 *      (el ingreso original queda) y UNA fila en la historia con el antes y el después. Un cambio de día, documento o código no toca el libro. Con lo mismo no se escribe nada.
 *   B. Lo que se rechaza. Sin motivo, una cantidad que no es un número (cero, negativa, cuatro decimales), un día de mañana, un código repetido y una pantalla que vio otra cantidad
 *      (otra persona lo corrigió mientras tanto). Un lote que ya tuvo una merma, un consumo o una devolución, y uno que llegó con una factura u orden recibida, no se tocan.
 *   C. Eliminar. El lote queda en CERO con su marca y el saldo del color en cero; «Retirar color» ahora sí se deja (la salida del callejón de 9 m); eliminar dos veces no falla ni anota
 *      dos veces; el PEPS ya no saca tela de un lote eliminado.
 *   D. Restaurar. Vuelve a la cantidad que tenía, con el libro cuadrado; uno activo no se restaura; uno de un color retirado se rechaza.
 *   E. Quién. Es del líder (quien ve Producción sin ser líder, y quien no ve el módulo, no pueden); anon no llama a nada; la historia no se lee ni se escribe desde la API.
 *   F. Estados imposibles. Un lote en cero sin marca, o con marca y con cantidad, no caben; la historia no se edita ni se borra.
 *   G. Las cuentas. Tras toda la batería, la cantidad de cada lote es la suma de su `compra` + sus `ajuste` (el invariante INV-26 de /chaos), y el saldo del color que muestra la orden
 *      (`fn_insumo_saldo_en`) es la suma de sus lotes.
 *   H. La migración. Se puede pegar dos veces, se detiene con un mensaje claro si falta lo que usa y `fn_ingreso_insumo_abrir` toma el lote con candado (`for update`: la carrera con
 *      el consumo es la del PEPS, que toma la misma fila).
 *
 * Los mensajes del servidor salen en el idioma de la base: por eso los casos buscan el HINT propio de la migración.
 *
 * USO
 *   pnpm pruebas:insumos-corregir-ingreso   → necesita el stack local (`npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const MIGRACION = readFileSync(new URL("../../supabase/migrations/20261030134000_insumos_corregir_y_eliminar_ingreso.sql", import.meta.url), "utf8");
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

/** El Taller, una tela de un color con un ingreso de 9 m a S/ 100 (11.1111 el metro), y a Micaela. Todo como líder. */
const PREPARAR = `
begin;
${como(FELIPE)}
select id as taller from retail.ubicaciones where tipo = 'taller' and activo order by nombre limit 1 \\gset
select codigo as c1 from retail.colores where activo order by codigo limit 1 \\gset
select p.id as micaela_p from public.personas p where p.auth_user_id = '${MICAELA}' \\gset
select retail.crear_material(:'taller', jsonb_build_object('nombre', 'Tela Ingreso Prueba'), jsonb_build_array(jsonb_build_object('color_codigo', :'c1')), null) as m \\gset
select i.id as ins from retail.insumos i join retail.materiales mt on mt.id = i.material_id where mt.nombre = 'Tela Ingreso Prueba' \\gset
select retail.recibir_insumo(:'ins', :'taller', 9, 100, 'LT-9', null, 'F001-1', 'compra', null, null) as lote \\gset
`;

/** Lo que el libro dice del color: la suma con signo (la cuenta de `v_insumo_saldos`) y su valor. */
const SALDO = `(select coalesce(sum(case when m.tipo in ('compra','devolucion') then m.cantidad when m.tipo in ('consumo','merma') then -m.cantidad else m.cantidad end), 0) from retail.movimientos_insumo m where m.insumo_id = :'ins'::uuid)`;
const VALOR = `(select round(coalesce(sum(case when m.tipo in ('compra','devolucion') then m.cantidad * m.costo_unitario when m.tipo in ('consumo','merma') then -m.cantidad * m.costo_unitario else m.cantidad * m.costo_unitario end), 0), 2) from retail.movimientos_insumo m where m.insumo_id = :'ins'::uuid)`;
/** La cuenta de lote que usan el PEPS y la orden (no mira `ajuste`). */
const SALDO_LOTE = `(select l.cantidad_ingresada - coalesce((select sum(mi.cantidad) from retail.movimientos_insumo mi where mi.insumo_lote_id = l.id and mi.tipo in ('consumo','merma')), 0) + coalesce((select sum(mi.cantidad) from retail.movimientos_insumo mi where mi.insumo_lote_id = l.id and mi.tipo = 'devolucion'), 0) from retail.insumo_lotes l where l.id = :'lote'::uuid)`;
/** INV-26: la cantidad de cada lote del insumo es lo que su `compra` + sus `ajuste` suman. */
const LOTE_CUADRA = `(select bool_and(l.cantidad_ingresada = coalesce((select sum(m.cantidad) from retail.movimientos_insumo m where m.insumo_lote_id = l.id and m.tipo in ('compra','ajuste')), 0)) from retail.insumo_lotes l where l.insumo_id = :'ins'::uuid)`;
const LOTE = `l.id = :'lote'::uuid`;

/** El día del propio lote: lo que la pantalla le muestra y manda de vuelta si la persona no lo toca. */
const DIA_DEL_LOTE = `(select l.fecha_ingreso from retail.insumo_lotes l where l.id = :'lote'::uuid)`;
const CORREGIR = (antes, cantidad, costo, motivo = "'Cantidad equivocada'", fecha = DIA_DEL_LOTE, doc = "'F001-1'", cod = "'LT-9'") =>
  `retail.corregir_ingreso_insumo(:'lote'::uuid, ${antes}, ${cantidad}, ${costo}, ${fecha}, ${doc}, ${cod}, ${motivo})`;
const ELIMINAR = (antes = 9, motivo = "'Se anotó dos veces'") => `retail.eliminar_ingreso_insumo(:'lote'::uuid, ${antes}, ${motivo})`;
const RESTAURAR = (motivo = "'Se eliminó por error'") => `retail.restaurar_ingreso_insumo(:'lote'::uuid, ${motivo})`;

/** Micaela, en el Taller y con el módulo «Producción» (como lo prueba materiales.mjs): ve Producción sin ser líder. */
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

// ---------------- A. Corregir ----------------
ok(
  "A1 corregir 9 m a 7 m y el costo: el lote, el saldo y el valor del color cuadran; el libro deja el ingreso y el par «deshago + anoto»; una fila en la historia",
  `select ${CORREGIR(9, 7, 12.5)} as r \\gset
select (select l.cantidad_ingresada || '/' || l.costo_unitario from retail.insumo_lotes l where ${LOTE})
  || '|' || ${SALDO} || '|' || ${VALOR}
  || '|' || (select count(*) from retail.movimientos_insumo m where m.insumo_lote_id = :'lote'::uuid and m.tipo = 'compra')
  || '|' || (select count(*) from retail.movimientos_insumo m where m.insumo_lote_id = :'lote'::uuid and m.tipo = 'ajuste')
  || '|' || (select count(*) from retail.insumo_lote_cambios c where c.insumo_lote_id = :'lote'::uuid and c.accion = 'corregir' and c.motivo = 'Cantidad equivocada' and (c.antes ->> 'cantidad')::numeric = 9 and (c.despues ->> 'cantidad')::numeric = 7)
  || '|' || (:'r'::jsonb ->> 'sin_cambios')
  || '|' || ${LOTE_CUADRA};`,
  (c) => c[0] === "7.000/12.5000" && Number(c[1]) === 7 && Number(c[2]) === 87.5 && c[3] === "1" && c[4] === "2" && c[5] === "1" && c[6] === "false" && c[7] === "true"
);
ok(
  "A2 corregir con lo mismo no escribe nada (ni motivo, ni libro, ni historia): un doble clic o guardar sin tocar",
  `select ${CORREGIR(9, 9, "null", "null")} as r \\gset
select (:'r'::jsonb ->> 'sin_cambios')
  || '|' || (select count(*) from retail.movimientos_insumo m where m.insumo_lote_id = :'lote'::uuid and m.tipo = 'ajuste')
  || '|' || (select count(*) from retail.insumo_lote_cambios c where c.insumo_lote_id = :'lote'::uuid);`,
  (c) => c[0] === "true" && c[1] === "0" && c[2] === "0"
);
ok(
  "A3 cambiar solo el día, el documento y el código deja su historia pero no toca el libro ni el saldo",
  `select ${CORREGIR(9, 9, "null", "'Era de otro día'", "retail.fn_hoy_lima() - 2", "'F001-2'", "'LT-10'")} as r \\gset
select (select l.fecha_ingreso = retail.fn_hoy_lima() - 2 and l.documento = 'F001-2' and l.codigo_lote = 'LT-10' from retail.insumo_lotes l where ${LOTE})
  || '|' || (select count(*) from retail.movimientos_insumo m where m.insumo_lote_id = :'lote'::uuid and m.tipo = 'ajuste')
  || '|' || ${SALDO}
  || '|' || (select count(*) from retail.insumo_lote_cambios c where c.insumo_lote_id = :'lote'::uuid and c.accion = 'corregir');`,
  (c) => c[0] === "true" && c[1] === "0" && Number(c[2]) === 9 && c[3] === "1"
);
ok(
  "A4 quien corrige sin ver costos manda el costo en null y el costo del lote no se toca",
  `select ${CORREGIR(9, 8, "null")} as r \\gset
select (select l.costo_unitario from retail.insumo_lotes l where ${LOTE}) || '|' || ${SALDO} || '|' || ${LOTE_CUADRA};`,
  (c) => c[0] === "11.1111" && Number(c[1]) === 8 && c[2] === "true"
);
ok(
  "A5 un ingreso que fue de 100 de costo y se corrige al mismo costo con 7 m: el valor del color es lo de 7 m, no lo de 9",
  `select ${CORREGIR(9, 7, "11.1111")} as r \\gset
select ${VALOR};`,
  (c) => Number(c[0]) === 77.78
);

// ---------------- B. Lo que se rechaza ----------------
mal("B1 un cambio sin motivo se rechaza", "ingreso_sin_motivo", `select ${CORREGIR(9, 7, 12.5, "''")};`);
mal("B2 un motivo de más de 300 letras se rechaza", "ingreso_motivo_largo", `select ${CORREGIR(9, 7, 12.5, "repeat('x', 301)")};`);
mal("B3 la cantidad en cero se rechaza", "ingreso_cantidad_invalida", `select ${CORREGIR(9, 0, "null")};`);
mal("B4 la cantidad negativa se rechaza", "ingreso_cantidad_invalida", `select ${CORREGIR(9, -2, "null")};`);
mal("B5 la cantidad con cuatro decimales se rechaza", "ingreso_cantidad_invalida", `select ${CORREGIR(9, "7.1234", "null")};`);
mal("B6 un costo negativo se rechaza", "ingreso_costo_invalido", `select ${CORREGIR(9, 7, -1)};`);
mal("B7 un ingreso de mañana se rechaza", "ingreso_fecha_invalida", `select ${CORREGIR(9, 7, 12.5, "'x'", "retail.fn_hoy_lima() + 3")};`);
mal("B8 un código que otro lote del mismo color ya tiene se rechaza", "ingreso_codigo_repetido", `select retail.recibir_insumo(:'ins', :'taller', 3, 30, 'LT-OTRO', null, null, 'compra', null, null);
select ${CORREGIR(9, 7, 12.5, "'x'", DIA_DEL_LOTE, "'F001-1'", "'LT-OTRO'")};`);
mal("B9 una pantalla que vio otra cantidad (otra persona corrigió mientras tanto) se rechaza", "ingreso_cambio_mientras_tanto", `select ${CORREGIR(9, 7, 12.5)};
select ${CORREGIR(9, 6, 12.5)};`);
mal("B10 eliminar con una pantalla que vio otra cantidad se rechaza", "ingreso_cambio_mientras_tanto", `select ${CORREGIR(9, 7, 12.5)};
select ${ELIMINAR(9)};`);
mal(
  "B11 un lote con una merma ya no se corrige: de él ya salió material",
  "ingreso_no_corregible",
  `insert into retail.movimientos_insumo (insumo_id, insumo_lote_id, ubicacion_id, tipo, cantidad, costo_unitario, motivo) values (:'ins'::uuid, :'lote'::uuid, :'taller'::uuid, 'merma', 1, 11.1111, 'prueba');
select ${CORREGIR(9, 7, 12.5)};`
);
mal(
  "B12 un lote con una merma tampoco se elimina",
  "ingreso_no_corregible",
  `insert into retail.movimientos_insumo (insumo_id, insumo_lote_id, ubicacion_id, tipo, cantidad, costo_unitario, motivo) values (:'ins'::uuid, :'lote'::uuid, :'taller'::uuid, 'merma', 1, 11.1111, 'prueba');
select ${ELIMINAR(9)};`
);
mal(
  "B13 un ingreso que llegó con una factura o una orden recibida no se corrige aquí",
  "ingreso_no_corregible",
  `alter table retail.insumo_lotes drop constraint insumo_lotes_comprobante_item_id_fkey;
update retail.insumo_lotes set comprobante_item_id = gen_random_uuid() where id = :'lote'::uuid;
select ${CORREGIR(9, 7, 12.5)};`
);
mal("B14 un ingreso que no existe se dice", "ingreso_no_existe", `select retail.eliminar_ingreso_insumo(gen_random_uuid(), 1, 'x');`);
mal("B15 corregir un ingreso eliminado se rechaza y dice qué hacer", "ingreso_eliminado", `select ${ELIMINAR()};
select ${CORREGIR(0, 7, 12.5)};`);

// ---------------- C. Eliminar ----------------
ok(
  "C1 eliminar deja el lote en cero con su marca, el saldo del color en cero, el libro cuadrado y la historia con lo que era",
  `select ${ELIMINAR()} as r \\gset
select (select l.cantidad_ingresada || '/' || (l.anulado_at is not null) from retail.insumo_lotes l where ${LOTE})
  || '|' || ${SALDO} || '|' || ${VALOR} || '|' || ${SALDO_LOTE} || '|' || ${LOTE_CUADRA}
  || '|' || (select count(*) from retail.movimientos_insumo m where m.insumo_lote_id = :'lote'::uuid and m.tipo in ('compra','ajuste'))
  || '|' || (select count(*) from retail.insumo_lote_cambios c where c.insumo_lote_id = :'lote'::uuid and c.accion = 'eliminar' and c.motivo = 'Se anotó dos veces' and (c.antes ->> 'cantidad')::numeric = 9)
  || '|' || (:'r'::jsonb ->> 'ya_estaba')
  || '|' || retail.fn_insumo_saldo_en(:'ins'::uuid, :'taller'::uuid);`,
  (c) => c[0] === "0.000/true" && Number(c[1]) === 0 && Number(c[2]) === 0 && Number(c[3]) === 0 && c[4] === "true" && c[5] === "2" && c[6] === "1" && c[7] === "false" && Number(c[8]) === 0
);
ok(
  "C2 la salida del callejón: el color con 9 m no se retira; tras eliminar el ingreso equivocado, sí",
  `select retail.fn_color_compromisos(:'ins'::uuid) as antes \\gset
select ${ELIMINAR()} as r \\gset
select retail.retirar_color_de_material(:'ins'::uuid, :'taller'::uuid) as ret \\gset
select (:'antes' like '%todavía tiene%') || '|' || coalesce(retail.fn_color_compromisos(:'ins'::uuid), 'nada') || '|' || (:'ret'::jsonb ->> 'retirado');`,
  (c) => c[0] === "true" && c[1] === "nada" && c[2] === "true"
);
ok(
  "C3 eliminar dos veces no falla ni anota dos veces",
  `select ${ELIMINAR()} as r1 \\gset
select ${ELIMINAR(0)} as r2 \\gset
select (:'r2'::jsonb ->> 'ya_estaba')
  || '|' || (select count(*) from retail.movimientos_insumo m where m.insumo_lote_id = :'lote'::uuid and m.tipo = 'ajuste')
  || '|' || (select count(*) from retail.insumo_lote_cambios c where c.insumo_lote_id = :'lote'::uuid);`,
  (c) => c[0] === "true" && c[1] === "1" && c[2] === "1"
);
mal("C4 eliminar sin motivo se rechaza", "ingreso_sin_motivo", `select ${ELIMINAR(9, "null")};`);
mal(
  "C5 el PEPS ya no saca tela de un lote eliminado",
  "uso_lotes_sin_saldo",
  `select ${ELIMINAR()};
select retail.fn_insumo_consumir_peps(gen_random_uuid(), :'ins'::uuid, :'taller'::uuid, 1, null, (select p.id from public.personas p where p.auth_user_id = '${FELIPE}'));`
);
ok(
  "C6 `fn_ingresos_eliminados` dice cuánto era, quién lo eliminó y por qué (al líder; a los demás, nada)",
  `select ${ELIMINAR()} as r \\gset
select (select count(*) from retail.fn_ingresos_eliminados(:'taller'::uuid) e where e.lote_id = :'lote'::uuid and e.cantidad = 9 and e.motivo = 'Se anotó dos veces' and length(e.hecho_por) > 0 and e.documento = 'F001-1') as lider \\gset
${MICAELA_EN_EL_TALLER}
select :'lider' || '|' || (select count(*) from retail.fn_ingresos_eliminados(:'taller'::uuid));`,
  (c) => c[0] === "1" && c[1] === "0"
);
ok(
  "C7 la Actividad sabe de cada cambio (corregir, eliminar y restaurar)",
  `select ${CORREGIR(9, 7, 12.5)} as r1 \\gset
select ${ELIMINAR(7)} as r2 \\gset
select ${RESTAURAR()} as r3 \\gset
select (select count(*) from retail.actividad a where a.accion = 'insumo_ingreso_corregido' and a.registro_id = :'ins')
  || '|' || (select count(*) from retail.actividad a where a.accion = 'insumo_ingreso_eliminado' and a.registro_id = :'ins')
  || '|' || (select count(*) from retail.actividad a where a.accion = 'insumo_ingreso_restaurado' and a.registro_id = :'ins');`,
  (c) => c[0] === "1" && c[1] === "1" && c[2] === "1"
);

// ---------------- D. Restaurar ----------------
ok(
  "D1 restaurar devuelve el ingreso a la cantidad que tenía, con el saldo, el valor y el libro cuadrados",
  `select ${CORREGIR(9, 7, 12.5)} as r1 \\gset
select ${ELIMINAR(7)} as r2 \\gset
select ${RESTAURAR()} as r3 \\gset
select (select l.cantidad_ingresada || '/' || (l.anulado_at is null) || '/' || l.costo_unitario from retail.insumo_lotes l where ${LOTE})
  || '|' || ${SALDO} || '|' || ${VALOR} || '|' || ${SALDO_LOTE} || '|' || ${LOTE_CUADRA}
  || '|' || (select string_agg(c.accion, ',' order by c.created_at, c.id) from retail.insumo_lote_cambios c where c.insumo_lote_id = :'lote'::uuid);`,
  (c) => c[0] === "7.000/true/12.5000" && Number(c[1]) === 7 && Number(c[2]) === 87.5 && Number(c[3]) === 7 && c[4] === "true" && c[5] === "corregir,eliminar,restaurar"
);
ok(
  "D2 restaurar uno que no está eliminado lo dice y no escribe",
  `select ${RESTAURAR()} as r \\gset
select (:'r'::jsonb ->> 'ya_estaba') || '|' || (select count(*) from retail.movimientos_insumo m where m.insumo_lote_id = :'lote'::uuid and m.tipo = 'ajuste');`,
  (c) => c[0] === "true" && c[1] === "0"
);
mal(
  "D3 restaurar un ingreso de un color retirado se rechaza",
  "ingreso_color_retirado",
  `select ${ELIMINAR()};
select retail.retirar_color_de_material(:'ins'::uuid, :'taller'::uuid);
select ${RESTAURAR()};`
);
mal("D4 restaurar sin motivo se rechaza", "ingreso_sin_motivo", `select ${ELIMINAR()};
select ${RESTAURAR("null")};`);

// ---------------- E. Quién ----------------
mal("E1 quien ve Producción sin ser líder no corrige un ingreso", "ingreso_sin_lider", `${MICAELA_EN_EL_TALLER}select ${CORREGIR(9, 7, 12.5)};`);
mal("E2 quien ve Producción sin ser líder no elimina un ingreso", "ingreso_sin_lider", `${MICAELA_EN_EL_TALLER}select ${ELIMINAR()};`);
mal("E3 quien no ve el módulo Producción no llega ni a la pregunta del líder", "produccion_sin_modulo", `${MICAELA_SIN_PRODUCCION}select ${ELIMINAR()};`);
ok(
  "E4 anon no llama a nada; authenticated llama a las cuatro funciones de pantalla y a ninguna pieza interna; la historia no se lee ni se escribe desde la API",
  `select (select string_agg(f.nombre || '=' || has_function_privilege('anon', f.firma, 'execute'), ',' order by f.nombre) from (values
      ('corregir', 'retail.corregir_ingreso_insumo(uuid,numeric,numeric,numeric,date,text,text,text)'),
      ('eliminar', 'retail.eliminar_ingreso_insumo(uuid,numeric,text)'),
      ('restaurar', 'retail.restaurar_ingreso_insumo(uuid,text)'),
      ('lista', 'retail.fn_ingresos_eliminados(uuid)')) as f(nombre, firma))
  || '|' || (select string_agg(f.nombre || '=' || has_function_privilege('authenticated', f.firma, 'execute'), ',' order by f.nombre) from (values
      ('corregir', 'retail.corregir_ingreso_insumo(uuid,numeric,numeric,numeric,date,text,text,text)'),
      ('eliminar', 'retail.eliminar_ingreso_insumo(uuid,numeric,text)'),
      ('restaurar', 'retail.restaurar_ingreso_insumo(uuid,text)'),
      ('lista', 'retail.fn_ingresos_eliminados(uuid)'),
      ('abrir', 'retail.fn_ingreso_insumo_abrir(uuid)'),
      ('corregible', 'retail.fn_ingreso_insumo_corregible(uuid)'),
      ('motivo', 'retail.fn_ingreso_insumo_motivo(text)'),
      ('anotar', 'retail.fn_ingreso_insumo_anotar(text,text,uuid,uuid,uuid,jsonb)')) as f(nombre, firma))
  || '|' || has_table_privilege('authenticated', 'retail.insumo_lote_cambios', 'select')
  || '|' || has_table_privilege('authenticated', 'retail.insumo_lote_cambios', 'insert')
  || '|' || has_table_privilege('anon', 'retail.insumo_lote_cambios', 'select');`,
  (c) =>
    c[0] === "corregir=false,eliminar=false,lista=false,restaurar=false" &&
    c[1] === "abrir=false,anotar=false,corregible=false,corregir=true,eliminar=true,lista=true,motivo=false,restaurar=true" &&
    c[2] === "false" &&
    c[3] === "false" &&
    c[4] === "false"
);

ok(
  "E5 la pantalla puede leer `anulado_at` (las columnas de insumo_lotes se leen una por una) y el costo de un lote sigue sin ser legible por la API",
  `select has_column_privilege('authenticated', 'retail.insumo_lotes', 'anulado_at', 'select') || '|' || has_column_privilege('authenticated', 'retail.insumo_lotes', 'costo_unitario', 'select') || '|' || has_column_privilege('anon', 'retail.insumo_lotes', 'anulado_at', 'select');`,
  (c) => (c[0] === "t" || c[0] === "true") && (c[1] === "f" || c[1] === "false") && (c[2] === "f" || c[2] === "false")
);

// ---------------- F. Estados imposibles ----------------
mal("F1 un lote en cero sin marca de eliminado no cabe", "insumo_lotes_anulado_sin_cantidad", `update retail.insumo_lotes set cantidad_ingresada = 0 where id = :'lote'::uuid;`);
mal("F2 un lote con marca de eliminado y con cantidad no cabe", "insumo_lotes_anulado_sin_cantidad", `update retail.insumo_lotes set anulado_at = now() where id = :'lote'::uuid;`);
mal("F3 una cantidad negativa en un lote no cabe", "insumo_lotes_cantidad_ingresada_check", `update retail.insumo_lotes set cantidad_ingresada = -1, anulado_at = now() where id = :'lote'::uuid;`);
mal("F4 la historia de un ingreso no se edita", "no se edita ni se borra", `select ${CORREGIR(9, 7, 12.5)};
update retail.insumo_lote_cambios set motivo = 'otro' where insumo_lote_id = :'lote'::uuid;`);
mal("F5 la historia de un ingreso no se borra", "no se edita ni se borra", `select ${CORREGIR(9, 7, 12.5)};
delete from retail.insumo_lote_cambios where insumo_lote_id = :'lote'::uuid;`);
mal("F6 la historia no admite un motivo vacío", "insumo_lote_cambios_motivo_check", `insert into retail.insumo_lote_cambios (insumo_lote_id, insumo_id, ubicacion_id, accion, motivo, antes, despues, hecho_por)
  values (:'lote'::uuid, :'ins'::uuid, :'taller'::uuid, 'corregir', '  ', '{}', '{}', :'micaela_p'::uuid);`);

// ---------------- G. Las cuentas ----------------
ok(
  "G1 tras corregir, eliminar y restaurar varios lotes del mismo color, el saldo del color es la suma de sus lotes y todos cuadran con su libro",
  `select retail.recibir_insumo(:'ins'::uuid, :'taller'::uuid, 4, 20, 'LT-4', null, null, 'compra', null, null) as lote2 \\gset
select ${CORREGIR(9, 7, 12.5)} as r1 \\gset
select retail.corregir_ingreso_insumo(:'lote2'::uuid, 4, 5, 6, (select l.fecha_ingreso from retail.insumo_lotes l where l.id = :'lote2'::uuid), null, 'LT-4', 'Eran 5') as r2 \\gset
select ${ELIMINAR(7)} as r3 \\gset
select ${RESTAURAR()} as r4 \\gset
select ${SALDO} || '|' || retail.fn_insumo_saldo_en(:'ins'::uuid, :'taller'::uuid) || '|' || ${LOTE_CUADRA}
  || '|' || (select sum(l.cantidad_ingresada) from retail.insumo_lotes l where l.insumo_id = :'ins'::uuid)
  || '|' || ${VALOR};`,
  (c) => Number(c[0]) === 12 && Number(c[1]) === 12 && c[2] === "true" && Number(c[3]) === 12 && Number(c[4]) === 117.5
);

// ---------------- H. La migración ----------------
CASOS.push({
  nombre: "H1 la migración se puede pegar dos veces seguidas sin cambiar nada",
  tipo: "exito",
  sql: `${PREPARAR}${MIGRACION}\n${MIGRACION}\nselect (select cantidad_ingresada from retail.insumo_lotes where id = :'lote'::uuid) || '|' || (select count(*) from pg_constraint where conrelid = 'retail.insumo_lotes'::regclass and conname in ('insumo_lotes_cantidad_ingresada_check', 'insumo_lotes_anulado_sin_cantidad'));\nrollback;`,
  verificar: (c) => c[0] === "9.000" && c[1] === "2",
});
CASOS.push({
  nombre: "H2 si falta lo que usa, la migración se detiene al principio con un mensaje claro",
  tipo: "error",
  contiene: "Falta lo que este SQL necesita",
  sql: `begin;\nalter table retail.insumo_lotes rename column recepcion_id to recepcion_id_x;\n${MIGRACION}\nrollback;`,
});
ok(
  "H3 `fn_ingreso_insumo_abrir` toma el lote con candado (la misma fila que toma el PEPS al descontar): una carrera se hace en fila",
  `select position('for update' in lower(pg_get_functiondef('retail.fn_ingreso_insumo_abrir(uuid)'::regprocedure))) > 0;`,
  (c) => c[0] === "t" || c[0] === "true"
);

// ---------------- correr ----------------
let fallas = 0;
for (const caso of CASOS) {
  const r = correr(caso.sql);
  let bien;
  let detalle = "";
  if (caso.tipo === "exito") {
    bien = r.ok && caso.verificar(r.salida.split("\n").pop().split("|"));
    if (!bien) detalle = r.ok ? `salida: ${r.salida}` : r.mensaje;
  } else {
    bien = !r.ok && r.mensaje.includes(caso.contiene);
    if (!bien) detalle = r.ok ? "no falló y debía fallar" : r.mensaje;
  }
  console.log(`${bien ? "✓" : "✗"} ${caso.nombre}`);
  if (!bien) {
    fallas += 1;
    console.log(`   ${detalle.split("\n").slice(0, 6).join("\n   ")}`);
  }
}
console.log(`\n${CASOS.length - fallas}/${CASOS.length} casos en verde`);
process.exit(fallas ? 1 : 0);
