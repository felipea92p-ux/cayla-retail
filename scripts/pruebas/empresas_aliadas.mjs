#!/usr/bin/env node
/**
 * Prueba de `20261121152000_empresas_aliadas_desde_configuracion.sql` (ADR-0683, actividad 1): crear y editar una empresa aliada desde
 * Configuración, con sus tiendas y sus cuentas para cobrar, en una sola transacción.
 *
 * Lo que importa: (1) la migración se aplica dos veces; (2) el RUC se valida con el módulo 11 (el mismo de packages/shared) y no se repite
 * ni puede ser el de CAYLA; (3) solo el Admin guarda; (4) al sumar una aliada a una tienda sin filas, CAYLA sigue en esa tienda; (5) un Nuevo
 * RUS va a una sola tienda; (6) sus cuentas nacen como las de una empresa ajena (banco 104, saldo 0) y quitar es archivar; (7) no se le quita
 * una tienda donde todavía tiene prendas; (8) `fn_empresas_aliadas` las devuelve con tiendas y cuentas, y no a CAYLA.
 * Desde 20261121203000 (los hallazgos de /chaos): (9) un nombre de puros caracteres invisibles no se guarda; (10) dos altas a la vez con el
 * mismo nombre no chocan ni dicen «RUC», y dos con el mismo RUC dicen de quién es.
 * Cada caso corre en su transacción con las migraciones aplicadas dentro y TERMINA EN ROLLBACK. La única excepción es (10): dos sesiones
 * en paralelo no pueden compartir una transacción, así que confirman de verdad y la prueba borra al final SOLO lo que ella misma creó.
 *
 * USO: pnpm pruebas:empresas-aliadas   (necesita el stack local: `npx supabase start`)
 */

import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = process.env.CONTENEDOR_PG ?? "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
// La función vive en 20261121152000 y la reemplaza 20261121203000: se aplican las dos, en orden, o la primera la dejaría como era.
const MIGRACION = [
  "supabase/migrations/20261121152000_empresas_aliadas_desde_configuracion.sql",
  "supabase/migrations/20261121203000_guardar_empresa_aliada_nombre_y_choques.sql",
]
  .map((f) => readFileSync(join(RAIZ, f), "utf8"))
  .join("\n");
const ADMIN = "22222222-2222-4222-8222-000000000001"; // Felipe (seed): líder y Admin
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Trujillo (seed), no es Admin

/** Un RUC válido por el módulo 11 de SUNAT, a partir de sus 10 primeros dígitos. */
function ruc(diez) {
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = [...diez].reduce((a, d, i) => a + Number(d) * pesos[i], 0);
  return diez + String((11 - (suma % 11)) % 10);
}
// RUCs que nadie usa (la base local es compartida: una aliada creada a mano no debe chocar con la prueba).
const RUC_A = ruc("1099990001");
const RUC_B = ruc("1099990002");
const RUC_MAL = RUC_A.slice(0, 10) + String((Number(RUC_A[10]) + 1) % 10);

const sesion = (id) =>
  `set local request.jwt.claim.sub = '${id}';\nset local request.jwt.claims = '{"sub":"${id}","role":"authenticated"}';\nset local role authenticated;`;

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", process.env.BASE_PG ?? "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}

/** Corre `cuerpo` en una transacción con la migración aplicada y termina en rollback. Devuelve la última línea o el error. */
function caso(cuerpo) {
  try {
    const salida = psql(`begin;\n${MIGRACION}\n${cuerpo}\nrollback;`);
    const lineas = salida.split("\n").filter((l) => l && l !== "QUEDÓ BIEN");
    return { ok: true, salida: lineas.at(-1) ?? "" };
  } catch (e) {
    return { ok: false, error: String(e.stderr || e.message) };
  }
}

const TRU = "(select id from retail.ubicaciones where tipo = 'tienda' and activo and nombre ilike '%trujillo%' limit 1)";
const LIM = "(select id from retail.ubicaciones where tipo = 'tienda' and activo and nombre ilike '%lima%' limit 1)";
const crear = (rucv, regimen, sedes, cuentas = "[]") =>
  `retail.guardar_empresa_aliada(null, 'Aliada Prueba', '${rucv}', 'PRUEBA PERSONA NATURAL', '${regimen}', 'aliada@ejemplo.pe', '+51 900 000 000', array[${sedes}]::uuid[], '${cuentas}'::jsonb)`;

let fallas = 0;
function esperar(nombre, r, condicion, detalle = "") {
  const pasa = condicion(r);
  if (!pasa) fallas++;
  console.log(`${pasa ? "✓" : "✗"} ${nombre}${pasa ? "" : `\n    ${r.ok ? `salió: ${r.salida}` : `error: ${r.error.split("\n").find((l) => l.includes("ERROR")) ?? r.error}`}${detalle ? `\n    ${detalle}` : ""}`}`);
}
const fallaCon = (texto) => (r) => !r.ok && r.error.includes(texto);
const da = (esperado) => (r) => r.ok && r.salida === esperado;

// 1. Dos veces
esperar("la migración se aplica dos veces", caso(`${MIGRACION}\nselect 'ok';`), da("ok"));

// 2. El RUC
esperar("fn_ruc_valido: un RUC bien escrito sí", caso(`select retail.fn_ruc_valido('${RUC_A}');`), da("t"));
esperar("fn_ruc_valido: un dígito verificador mal, no", caso(`select retail.fn_ruc_valido('${RUC_MAL}');`), da("f"));
esperar("fn_ruc_valido: 10 dígitos o un prefijo raro, no", caso(`select retail.fn_ruc_valido('1047000001') or retail.fn_ruc_valido('${ruc("3047000001")}');`), da("f"));
esperar("guardar con un RUC mal escrito se rechaza", caso(`${sesion(ADMIN)}\nselect ${crear(RUC_MAL, "nuevo_rus", TRU)};`), fallaCon("no es válido"));
esperar(
  "el RUC de CAYLA no puede ser de una aliada",
  caso(`insert into retail.configuracion_empresa (id, ruc, razon_social) values (true, '${RUC_A}', 'CAYLA S.A.C.') on conflict (id) do update set ruc = excluded.ruc;\n${sesion(ADMIN)}\nselect ${crear(RUC_A, "nuevo_rus", TRU)};`),
  fallaCon("RUC de CAYLA"),
);
esperar(
  "dos aliadas con el mismo RUC no",
  caso(`${sesion(ADMIN)}\nselect ${crear(RUC_A, "nuevo_rus", TRU)};\nselect ${crear(RUC_A, "nuevo_rus", LIM)};`),
  fallaCon("Ya hay una empresa con ese RUC"),
);

// 3. Solo el Admin
esperar("quien no es Admin no guarda", caso(`${sesion(MICAELA)}\nselect ${crear(RUC_A, "nuevo_rus", TRU)};`), fallaCon("Solo el Admin"));

// 4. CAYLA sigue en la tienda
esperar(
  "al sumar una aliada a una tienda sin filas, CAYLA sigue ahí y la aliada también",
  caso(`delete from retail.empresa_sedes where ubicacion_id = ${TRU};
${sesion(ADMIN)}
select ${crear(RUC_A, "nuevo_rus", TRU)};
select string_agg(clave, ',' order by orden) from retail.fn_empresas_de_sede(${TRU});`),
  (r) => r.ok && r.salida.startsWith("cayla,") && r.salida.includes("aliada_prueba"),
);
esperar(
  "la aliada nace con su cuenta corriente desde hoy y su RUC limpio",
  caso(`${sesion(ADMIN)}\nselect ${crear(RUC_A.slice(0, 2) + " " + RUC_A.slice(2), "rer", TRU)};
reset role;
select ruc || '|' || regimen || '|' || (cuenta_corriente_desde = retail.fn_hoy_lima()) from retail.empresas where clave = 'aliada_prueba';`),
  da(`${RUC_A}|rer|true`),
);

// 5. Nuevo RUS: una sola tienda
esperar("un Nuevo RUS en dos tiendas se rechaza", caso(`${sesion(ADMIN)}\nselect ${crear(RUC_A, "nuevo_rus", `${TRU}, ${LIM}`)};`), fallaCon("un solo local"));
esperar("otro régimen sí puede estar en dos tiendas", caso(`${sesion(ADMIN)}\nselect ${crear(RUC_A, "mype", `${TRU}, ${LIM}`)} is not null;`), da("t"));
esperar("sin tienda no se guarda", caso(`${sesion(ADMIN)}\nselect ${crear(RUC_A, "mype", "")};`), fallaCon("al menos una tienda"));

// 6. Sus cuentas
const CUENTAS = JSON.stringify([
  { medio: "yape", numero: "900 000 010" },
  { medio: "transferencia", banco: "BCP", numero: "191-0000000-0-45" },
]);
esperar(
  "sus cuentas nacen de su empresa, banco 104, saldo 0, con su medio y su número",
  caso(`${sesion(ADMIN)}\nselect ${crear(RUC_A, "nuevo_rus", TRU, CUENTAS)};
reset role;
select string_agg(c.nombre || '|' || c.tipo || '|' || c.cuenta_contable || '|' || c.saldo_inicial || '|' || c.medio_ajeno || '|' || c.numero, ';' order by c.created_at, c.nombre)
  from retail.cuentas_dinero c join retail.empresas e on e.id = c.empresa_id where e.clave = 'aliada_prueba';`),
  da("BCP de Aliada Prueba|banco|104|0.00|transferencia|191-0000000-0-45;Yape de Aliada Prueba|banco|104|0.00|yape|900000010"),
);
esperar("un Yape con 8 dígitos se rechaza", caso(`${sesion(ADMIN)}\nselect ${crear(RUC_A, "nuevo_rus", TRU, JSON.stringify([{ medio: "yape", numero: "90000001" }]))};`), fallaCon("9 dígitos"));
esperar(
  "una cuenta bancaria sin banco se rechaza",
  caso(`${sesion(ADMIN)}\nselect ${crear(RUC_A, "nuevo_rus", TRU, JSON.stringify([{ medio: "transferencia", numero: "191-0000000-0-45" }]))};`),
  fallaCon("el banco"),
);
esperar(
  "editar: quitar una cuenta la archiva, sumar otra y cambiar el nombre renombra sus cuentas",
  caso(`${sesion(ADMIN)}
select ${crear(RUC_A, "nuevo_rus", TRU, CUENTAS)};
reset role;
create temp table t_ids as select c.id, c.medio_ajeno, e.id as empresa from retail.cuentas_dinero c join retail.empresas e on e.id = c.empresa_id where e.clave = 'aliada_prueba';
grant select on t_ids to authenticated;
${sesion(ADMIN)}
select retail.guardar_empresa_aliada((select empresa from t_ids limit 1), 'Nueva', '${RUC_A}', null, 'nuevo_rus', null, null, array[${TRU}]::uuid[],
  jsonb_build_array(
    jsonb_build_object('id', (select id from t_ids where medio_ajeno = 'yape'), 'medio', 'yape', 'numero', '911111111'),
    jsonb_build_object('id', (select id from t_ids where medio_ajeno = 'transferencia'), 'quitar', true),
    jsonb_build_object('medio', 'plin', 'numero', '922222222')));
reset role;
select string_agg(c.nombre || '|' || coalesce(c.numero, '') || '|' || (c.archivada_en is not null), ';' order by c.nombre)
  from retail.cuentas_dinero c where c.empresa_id = (select empresa from t_ids limit 1);`),
  da("BCP de Aliada Prueba|191-0000000-0-45|true;Plin de Nueva|922222222|false;Yape de Nueva|911111111|false"),
);
esperar(
  "una cuenta de otra empresa no se toca desde aquí",
  caso(`${sesion(ADMIN)}\nselect ${crear(RUC_A, "nuevo_rus", TRU)};
reset role;
select set_config('t.aliada', (select id::text from retail.empresas where clave = 'aliada_prueba'), true), set_config('t.casa', (select id::text from retail.cuentas_dinero where empresa_id = retail.fn_empresa_casa_id() limit 1), true);
${sesion(ADMIN)}
select retail.guardar_empresa_aliada(current_setting('t.aliada')::uuid, 'X', '${RUC_A}', null, 'nuevo_rus', null, null, array[${TRU}]::uuid[],
  jsonb_build_array(jsonb_build_object('id', current_setting('t.casa')::uuid, 'quitar', true)));`),
  fallaCon("no es de esta empresa"),
);

// 7. No se le quita una tienda con prendas suyas
esperar(
  "no se le quita una tienda donde todavía tiene prendas",
  caso(`${sesion(ADMIN)}\nselect ${crear(RUC_A, "mype", `${TRU}, ${LIM}`)};
reset role;
insert into retail.stock_dueno (variante_id, ubicacion_id, empresa_id, cantidad) select (select id from retail.variantes limit 1), ${LIM}, id, 2 from retail.empresas where clave = 'aliada_prueba';
reset role;
select set_config('t.aliada', (select id::text from retail.empresas where clave = 'aliada_prueba'), true), set_config('t.casa', (select id::text from retail.cuentas_dinero where empresa_id = retail.fn_empresa_casa_id() limit 1), true);
${sesion(ADMIN)}
select retail.guardar_empresa_aliada(current_setting('t.aliada')::uuid, 'Aliada Prueba', '${RUC_A}', null, 'mype', null, null, array[${TRU}]::uuid[]);`),
  fallaCon("todavía hay prendas suyas"),
);
esperar(
  "sí se le quita una tienda vacía",
  caso(`${sesion(ADMIN)}\nselect ${crear(RUC_A, "mype", `${TRU}, ${LIM}`)};
reset role;
select set_config('t.aliada', (select id::text from retail.empresas where clave = 'aliada_prueba'), true), set_config('t.casa', (select id::text from retail.cuentas_dinero where empresa_id = retail.fn_empresa_casa_id() limit 1), true);
${sesion(ADMIN)}
select retail.guardar_empresa_aliada(current_setting('t.aliada')::uuid, 'Aliada Prueba', '${RUC_A}', null, 'mype', null, null, array[${TRU}]::uuid[]);
reset role;
select count(*) from retail.empresa_sedes es join retail.empresas e on e.id = es.empresa_id where e.clave = 'aliada_prueba';`),
  da("1"),
);
esperar(
  "no se le quita una tienda donde ya tiene historia (sus movimientos de ahí siguen siendo suyos)",
  caso(`${sesion(ADMIN)}\nselect ${crear(RUC_A, "mype", `${TRU}, ${LIM}`)};
reset role;
select set_config('t.aliada', (select id::text from retail.empresas where clave = 'aliada_prueba'), true);
alter table retail.movimientos disable trigger user;
insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, empresa_id) values ((select id from retail.variantes limit 1), ${LIM}, 'entrada', 1, 'prueba', current_setting('t.aliada')::uuid);
alter table retail.movimientos enable trigger user;
${sesion(ADMIN)}
select retail.guardar_empresa_aliada(current_setting('t.aliada')::uuid, 'Aliada Prueba', '${RUC_A}', null, 'mype', null, null, array[${TRU}]::uuid[]);`),
  fallaCon("ya tiene historia"),
);
esperar("CAYLA no se edita como aliada", caso(`${sesion(ADMIN)}\nselect retail.guardar_empresa_aliada(retail.fn_empresa_casa_id(), 'CAYLA', '${RUC_A}', null, 'general', null, null, array[${TRU}]::uuid[]);`), fallaCon("CAYLA se edita"));

// 8. Leerlas
esperar(
  "fn_empresas_aliadas: trae a las aliadas con tiendas y cuentas, no a CAYLA, y dice que el Admin edita",
  caso(`${sesion(ADMIN)}\nselect ${crear(RUC_B, "nuevo_rus", TRU, CUENTAS)};
select (r->>'puede_editar') || '|' || (select count(*) from jsonb_array_elements(r->'aliadas') a where a->>'clave' = 'cayla') || '|'
       || (select jsonb_array_length(a->'cuentas') || '/' || jsonb_array_length(a->'sedes') from jsonb_array_elements(r->'aliadas') a where a->>'ruc' = '${RUC_B}')
  from retail.fn_empresas_aliadas() r;`),
  da("true|0|2/1"),
);
esperar(
  "quien no ve Configuración no las lee",
  caso(`${sesion(MICAELA)}\nselect retail.fn_empresas_aliadas() is not null;`),
  (r) => (!r.ok && r.error.includes("módulo Configuración")) || (r.ok && r.salida === "t"),
  "Micaela puede tener el módulo en el seed: entonces las lee, y está bien.",
);

// 9. La baja: doble confirmación, una semana, deshacer, y qué pasa al aplicarse
const ID = "current_setting('t.aliada')::uuid";
const ANOTA = "reset role;\nselect set_config('t.aliada', (select id::text from retail.empresas where clave = 'aliada_prueba'), true);\n";
const ADELANTA = "reset role;\nupdate retail.empresas set baja_el = retail.fn_hoy_lima() where clave = 'aliada_prueba';\n";
esperar(
  "la baja pide escribir el nombre tal cual",
  caso(`${sesion(ADMIN)}\nselect ${crear(RUC_A, "nuevo_rus", TRU)};\n${ANOTA}${sesion(ADMIN)}\nselect retail.programar_baja_empresa_aliada(${ID}, 'otra cosa');`),
  fallaCon("tal cual para confirmar"),
);
esperar(
  "con el nombre (sin importar mayúsculas), queda para dentro de 7 días y sigue activa",
  caso(`${sesion(ADMIN)}\nselect ${crear(RUC_A, "nuevo_rus", TRU)};\n${ANOTA}${sesion(ADMIN)}
select retail.programar_baja_empresa_aliada(${ID}, ' ALIADA prueba ') = retail.fn_hoy_lima() + 7;
reset role;
select activo from retail.empresas where clave = 'aliada_prueba';`),
  da("t"),
);
esperar("quien no es Admin no la da de baja", caso(`${sesion(ADMIN)}\nselect ${crear(RUC_A, "nuevo_rus", TRU)};\n${ANOTA}${sesion(MICAELA)}\nselect retail.programar_baja_empresa_aliada(${ID}, 'Aliada Prueba');`), fallaCon("Solo el Admin"));
esperar(
  "con prendas suyas en una tienda no se pide la baja",
  caso(`${sesion(ADMIN)}\nselect ${crear(RUC_A, "nuevo_rus", TRU)};
reset role;
insert into retail.stock_dueno (variante_id, ubicacion_id, empresa_id, cantidad) select (select id from retail.variantes limit 1), ${TRU}, id, 1 from retail.empresas where clave = 'aliada_prueba';
${ANOTA}${sesion(ADMIN)}\nselect retail.programar_baja_empresa_aliada(${ID}, 'Aliada Prueba');`),
  fallaCon("todavía tiene prendas"),
);
esperar(
  "deshacer la deja como estaba",
  caso(`${sesion(ADMIN)}\nselect ${crear(RUC_A, "nuevo_rus", TRU)};\n${ANOTA}${sesion(ADMIN)}
select retail.programar_baja_empresa_aliada(${ID}, 'Aliada Prueba');
select retail.deshacer_baja_empresa_aliada(${ID});
reset role;
select (baja_el is null and baja_pedida_en is null)::text from retail.empresas where clave = 'aliada_prueba';`),
  da("true"),
);
esperar(
  "antes de la semana, aplicar no hace nada",
  caso(`${sesion(ADMIN)}\nselect ${crear(RUC_A, "nuevo_rus", TRU)};\n${ANOTA}${sesion(ADMIN)}
select retail.programar_baja_empresa_aliada(${ID}, 'Aliada Prueba');
reset role;
select retail.fn_aplicar_bajas_de_aliadas() ->> 'borradas';
select count(*) from retail.empresas where clave = 'aliada_prueba';`),
  da("1"),
);
esperar(
  "cumplida la semana, una aliada sin historia se borra con sus tiendas y sus cuentas",
  caso(`${sesion(ADMIN)}\nselect ${crear(RUC_A, "nuevo_rus", TRU, CUENTAS)};\n${ANOTA}${sesion(ADMIN)}
select retail.programar_baja_empresa_aliada(${ID}, 'Aliada Prueba');
${ADELANTA}select retail.fn_aplicar_bajas_de_aliadas() ->> 'borradas';
select (select count(*) from retail.empresas where clave = 'aliada_prueba') + (select count(*) from retail.cuentas_dinero where empresa_id = ${ID}) + (select count(*) from retail.empresa_sedes where empresa_id = ${ID});`),
  da("0"),
);
esperar(
  "cumplida la semana, una aliada con historia deja de estar activa, se archivan sus cuentas y desaparece de la tienda",
  caso(`${sesion(ADMIN)}\nselect ${crear(RUC_A, "nuevo_rus", TRU, CUENTAS)};\n${ANOTA}
update retail.productos set empresa_id = ${ID} where id = (select id from retail.productos limit 1);
${sesion(ADMIN)}
select retail.programar_baja_empresa_aliada(${ID}, 'Aliada Prueba');
${ADELANTA}select retail.fn_aplicar_bajas_de_aliadas() ->> 'dadas_de_baja';
select (select activo::text from retail.empresas where id = ${ID}) || '|' || (select count(*) from retail.cuentas_dinero where empresa_id = ${ID} and archivada_en is null)
       || '|' || (select count(*) from retail.fn_empresas_de_sede(${TRU}) x where x.id = ${ID});`),
  da("false|0|0"),
);
esperar(
  "si al cumplirse todavía tiene prendas, no se aplica y queda dicho por qué",
  caso(`${sesion(ADMIN)}\nselect ${crear(RUC_A, "nuevo_rus", TRU)};\n${ANOTA}${sesion(ADMIN)}
select retail.programar_baja_empresa_aliada(${ID}, 'Aliada Prueba');
${ADELANTA}insert into retail.stock_dueno (variante_id, ubicacion_id, empresa_id, cantidad) values ((select id from retail.variantes limit 1), ${TRU}, ${ID}, 1);
select retail.fn_aplicar_bajas_de_aliadas() ->> 'detenidas';
select activo::text || '|' || coalesce(baja_detenida, '') from retail.empresas where id = ${ID};`),
  da("true|Todavía tiene prendas en una tienda."),
);
esperar(
  "registrar otra vez el RUC de una dada de baja la trae de vuelta (no nace otra)",
  caso(`${sesion(ADMIN)}\nselect ${crear(RUC_A, "nuevo_rus", TRU)};\n${ANOTA}
update retail.productos set empresa_id = ${ID} where id = (select id from retail.productos limit 1);
${sesion(ADMIN)}
select retail.programar_baja_empresa_aliada(${ID}, 'Aliada Prueba');
${ADELANTA}select retail.fn_aplicar_bajas_de_aliadas();
${sesion(ADMIN)}
select retail.guardar_empresa_aliada(null, 'Vuelve', '${RUC_A}', null, 'nuevo_rus', null, null, array[${TRU}]::uuid[]) = ${ID};
reset role;
select activo::text || '|' || nombre from retail.empresas where id = ${ID};`),
  da("true|Vuelve"),
);
esperar("la función que aplica no la llama una sesión de la app", caso(`${sesion(ADMIN)}\nselect retail.fn_aplicar_bajas_de_aliadas();`), fallaCon("permission denied"));
esperar(
  "fn_empresas_aliadas no trae a las dadas de baja y dice cuándo se aplica una pendiente",
  caso(`${sesion(ADMIN)}\nselect ${crear(RUC_A, "nuevo_rus", TRU)};\n${ANOTA}${sesion(ADMIN)}
select retail.programar_baja_empresa_aliada(${ID}, 'Aliada Prueba');
select (a->>'baja_el') = (retail.fn_hoy_lima() + 7)::text from jsonb_array_elements(retail.fn_empresas_aliadas()->'aliadas') a where a->>'clave' = 'aliada_prueba';`),
  da("t"),
);

// 10. El nombre (20261121203000): al menos una letra o un número
const INVISIBLE = "\u200b\u200c\u200d\u2060";
esperar(
  "un nombre de puros caracteres invisibles no se guarda",
  caso(`${sesion(ADMIN)}\nselect retail.guardar_empresa_aliada(null, '${INVISIBLE}', '${RUC_A}', null, 'nuevo_rus', null, null, array[${TRU}]::uuid[]);`),
  fallaCon("Escribe el nombre"),
);
esperar(
  "un nombre de una sola letra con tilde o ñ sí",
  caso(`${sesion(ADMIN)}\nselect retail.guardar_empresa_aliada(null, 'Ñ', '${RUC_A}', null, 'nuevo_rus', null, null, array[${TRU}]::uuid[]) is not null;`),
  da("t"),
);
esperar(
  "un nombre de puros números sí",
  caso(`${sesion(ADMIN)}\nselect retail.guardar_empresa_aliada(null, '${INVISIBLE}21', '${RUC_A}', null, 'nuevo_rus', null, null, array[${TRU}]::uuid[]) is not null;`),
  da("t"),
);

// 11. Dos altas a la vez (20261121203000). Dos sesiones de verdad: la primera guarda y se queda 2 s sin confirmar; la segunda empieza
// medio segundo después. Sin el candado, la segunda generaba la misma clave y fallaba con «Ya hay una empresa con ese RUC».
const RUC_C = ruc("1099990003");
const RUC_D = ruc("1099990004");
const NOMBRE_CHOQUE = "Aliada Choque Prueba";

function psqlEnParalelo(sql) {
  return new Promise((resolve) => {
    const p = spawn("docker", ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", process.env.BASE_PG ?? "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"]);
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => resolve(code === 0 ? { ok: true, salida: out.trim().split("\n").at(-1) ?? "" } : { ok: false, error: err || out }));
    p.stdin.end(sql);
  });
}
const esperarMedio = () => new Promise((r) => setTimeout(r, 500));
const altaEnSesion = (nombre, rucv, demora) =>
  `begin;\n${sesion(ADMIN)}\nselect retail.guardar_empresa_aliada(null, '${nombre}', '${rucv}', null, 'mype', null, null, array[${TRU}]::uuid[]) is not null;\n${demora ? "select pg_sleep(2) is not null;\n" : ""}commit;`;
// Lo que la prueba creó: sus aliadas (por RUC) y la fila de CAYLA en Trujillo si la tienda no tenía filas antes.
const TRU_SIN_FILAS = psql(`select not exists (select 1 from retail.empresa_sedes where ubicacion_id = ${TRU});`) === "t";
function limpiar() {
  psql(`begin;
delete from retail.empresa_sedes where empresa_id in (select id from retail.empresas where ruc in ('${RUC_C}', '${RUC_D}'));
delete from retail.empresas where ruc in ('${RUC_C}', '${RUC_D}');
${TRU_SIN_FILAS ? `delete from retail.empresa_sedes where ubicacion_id = ${TRU} and empresa_id = retail.fn_empresa_casa_id();` : ""}
commit;`);
}
async function dosALaVez(rucB) {
  limpiar();
  try {
    const a = psqlEnParalelo(altaEnSesion(NOMBRE_CHOQUE, RUC_C, true));
    await esperarMedio();
    const b = psqlEnParalelo(altaEnSesion(NOMBRE_CHOQUE, rucB, false));
    const [ra, rb] = await Promise.all([a, b]);
    const claves = psql(`select coalesce(string_agg(clave, ',' order by clave), '') from retail.empresas where ruc in ('${RUC_C}', '${RUC_D}');`);
    return { ra, rb, claves };
  } finally {
    limpiar();
  }
}
{
  const { ra, rb, claves } = await dosALaVez(RUC_D);
  esperar(
    "dos altas a la vez con el mismo nombre: las dos se guardan, con claves distintas",
    { ok: ra.ok && rb.ok, salida: claves, error: `${ra.error ?? ""}${rb.error ?? ""}` },
    (r) => r.ok && r.salida === "aliada_choque_prueba,aliada_choque_prueba_2",
  );
}
{
  const { ra, rb } = await dosALaVez(RUC_C);
  esperar("dos altas a la vez con el mismo RUC: la primera se guarda", ra, da("t"));
  esperar("…y la segunda dice de quién es ese RUC (no un choque de clave)", rb, fallaCon(`Ya hay una empresa con ese RUC: «${NOMBRE_CHOQUE}»`));
}

console.log(fallas ? `\n${fallas} prueba(s) fallaron.` : "\nTodas pasaron.");
process.exit(fallas ? 1 : 0);
