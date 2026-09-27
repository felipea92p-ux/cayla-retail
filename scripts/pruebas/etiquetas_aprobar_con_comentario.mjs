#!/usr/bin/env node
/**
 * Pruebas de APROBAR una etiqueta propuesta (trigger `retail.fn_etiquetas_estado_trigger`, migraciones
 * `20260917230000` y `20260923130000`), contra el Postgres del stack local.
 *
 * POR QUÉ EXISTE. Desde el 2026-09-17 la base exige un comentario para pasar una etiqueta a 'aprobado', pero la pantalla
 * (Catálogo ▸ Atributos ▸ Etiquetas, `EtiquetasLista.tsx`) mandaba `{ id, estado: "aprobado" }` a secas: ninguna propuesta
 * pendiente se podía aprobar (ni reactivar una rechazada sin motivo). Esta prueba fija el CONTRATO que la pantalla tiene que
 * cumplir —el cuerpo que aprueba lleva `notas`— y lo que pasa DESPUÉS de aprobar: una propuesta pendiente no se puede
 * poner en una prenda (ni en el alta de producto ni en «Prendas») hasta que un Líder, o un rol con Etiquetas, la aprueba.
 *
 * QUÉ PRUEBA
 *   1. Una colaboradora sin el módulo Etiquetas propone → nace `pendiente`.
 *   2. Aprobar SIN comentario (el cuerpo que mandaba la pantalla) o con solo espacios → la base lo rechaza.
 *   3. Aprobar CON comentario → `aprobado`, activa, con aprobador y el comentario guardado.
 *   4. Reactivar una rechazada: sin motivo previo pide comentario; con motivo previo, el comentario NUEVO reemplaza al
 *      motivo del rechazo (antes «pasaba» y el motivo quedaba de descripción de la etiqueta).
 *   5. Un rol con el módulo Etiquetas (no líder) también aprueba; sin el módulo ni con comentario se puede (la política no
 *      deja actualizar la fila).
 *   6. Una propuesta pendiente NO entra al alta (`crear_producto_con_variantes`) ni a «Prendas» (`etiquetar_variantes`);
 *      aprobada, sí a las dos.
 *
 * CÓMO. Cada caso corre en su transacción con ROLLBACK (no deja nada). La sesión se simula con `set local request.jwt.claims`.
 * La base local la comparten muchas sesiones y la pantalla Roles y accesos edita los roles sembrados: cada caso deja explícito
 * si «Integrante» ve o no el módulo Etiquetas, en vez de suponerlo.
 *
 * USO
 *   pnpm pruebas:etiquetas-aprobar                 → contra la base `postgres` del stack local
 *   pnpm pruebas:etiquetas-aprobar --base cayla_x  → contra otra base del mismo contenedor
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const i = process.argv.indexOf("--base");
const BASE = i > 0 ? process.argv[i + 1] : "postgres";

// Seed local: Felipe (líder) y Micaela (colaboradora de Trujillo, rol Integrante).
const FELIPE_AUTH = "22222222-2222-4222-8222-000000000001";
const MICAELA_AUTH = "22222222-2222-4222-8222-000000000003";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  );
}

function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

const PRELUDIO = `
begin;
set local search_path = retail, public, extensions;
-- Devuelve 'SIN_ERROR' o 'sqlstate|mensaje' (sirve para ver el texto exacto que le llega a la pantalla).
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text;
  return v_estado || '|' || v_msg;
end;
$f$;
-- «Integrante» NO ve Etiquetas (así la deja la siembra; la pantalla de roles puede haberlo cambiado en la base compartida).
delete from retail.rol_modulos where rol_id = retail.fn_rol_por_clave('integrante') and modulo = 'etiquetas';
`;

const como = (auth) => `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\nset local role authenticated;\n`;
const felipe = como(FELIPE_AUTH);
const micaela = como(MICAELA_AUTH);
const admin = "reset role;\n";

/** Micaela (sin el módulo Etiquetas) propone `nombre`; deja su id en `:id`. */
const proponer = (nombre, alias = "id") => `${micaela}insert into retail.etiquetas (nombre) values ('${nombre}') returning id as ${alias} \\gset\n`;

/** Lo que devuelve la fila: estado | activa | tiene aprobador | comentario. */
const fila = (id) => `select estado || '|' || activo || '|' || (aprobado_por is not null) || '|' || coalesce(notas, '∅') from retail.etiquetas where id = :'${id}';`;

let fallas = 0;
let casos = 0;
function caso(nombre, sql, esperado) {
  casos++;
  const r = correr(`${PRELUDIO}${sql}\nrollback;`);
  const obtenido = r.ok ? r.salida : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje}`;
  const bien = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  if (!bien) {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${typeof esperado === "function" ? "(condición)" : esperado}\n    obtenido: ${obtenido}`);
  } else {
    console.log(`✓ ${nombre}`);
  }
}

const COMENTARIO = "Para la campaña de fin de año; distinta de Oferta porque no lleva descuento.";
const MENSAJE_COMENTARIO = "Aprobar una etiqueta exige un comentario breve";

// ── 1 · quién propone ────────────────────────────────────────────────────────────────────────────────────────────────────
caso(
  "1 · una colaboradora sin el módulo Etiquetas propone → nace pendiente, sin aprobador",
  proponer("Prueba pendiente") + admin + fila("id"),
  "pendiente|true|false|∅"
);

// ── 2 · aprobar sin comentario ───────────────────────────────────────────────────────────────────────────────────────────
// El id de la etiqueta lo deja `\\gset` (variable de psql), no JS: por eso el UPDATE se arma con `format(... %L ...)` dentro de la base.
const aprobarConIntento = (id, notasSql) =>
  `select pg_temp.intento(format($q$update retail.etiquetas set estado = 'aprobado'${notasSql} where id = %L$q$, :'${id}'));`;

caso(
  "2a · aprobar SIN comentario (el cuerpo que mandaba la pantalla) → la base lo rechaza con el mensaje del comentario",
  proponer("Prueba sin comentario") + felipe + aprobarConIntento("id", "") + "\n" + admin + fila("id"),
  (s) => s.startsWith(`P0001|${MENSAJE_COMENTARIO}`) && s.endsWith("pendiente|true|false|∅")
);
caso(
  "2b · un comentario de solo espacios cuenta como vacío (la pantalla lo recorta y no lo envía)",
  proponer("Prueba espacios") + felipe + aprobarConIntento("id", ", notas = '   '"),
  (s) => s.startsWith(`P0001|${MENSAJE_COMENTARIO}`)
);

// ── 3 · aprobar con comentario ───────────────────────────────────────────────────────────────────────────────────────────
caso(
  "3 · aprobar CON comentario → aprobada, activa, con aprobador y el comentario guardado (lo que manda la pantalla ahora)",
  proponer("Prueba con comentario") + felipe + `update retail.etiquetas set estado = 'aprobado', notas = '${COMENTARIO}' where id = :'id';\n` + admin + fila("id"),
  `aprobado|true|true|${COMENTARIO}`
);

// ── 4 · reactivar una rechazada ──────────────────────────────────────────────────────────────────────────────────────────
caso(
  "4a · reactivar una rechazada SIN motivo previo con solo el estado → la base pide el comentario; con comentario, pasa",
  proponer("Prueba rechazada sin motivo") +
    felipe +
    `update retail.etiquetas set estado = 'rechazado' where id = :'id';\n` +
    aprobarConIntento("id", "") +
    "\n" +
    `update retail.etiquetas set estado = 'aprobado', notas = '${COMENTARIO}' where id = :'id';\n` +
    admin +
    fila("id"),
  (s) => s.startsWith(`P0001|${MENSAJE_COMENTARIO}`) && s.endsWith(`aprobado|true|true|${COMENTARIO}`)
);
caso(
  "4b · reactivar una rechazada CON motivo previo: el comentario nuevo REEMPLAZA al motivo del rechazo (no se hereda como descripción)",
  proponer("Prueba rechazada con motivo") +
    felipe +
    `update retail.etiquetas set estado = 'rechazado', notas = 'Ya existe Oferta' where id = :'id';\n` +
    `update retail.etiquetas set estado = 'aprobado', notas = '${COMENTARIO}' where id = :'id';\n` +
    admin +
    fila("id"),
  `aprobado|true|true|${COMENTARIO}`
);

// ── 5 · quién puede aprobar ──────────────────────────────────────────────────────────────────────────────────────────────
caso(
  "5a · un rol con el módulo Etiquetas (no líder) también aprueba, con comentario",
  proponer("Prueba aprueba rol") +
    admin +
    `insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), 'etiquetas');\n` +
    micaela +
    `update retail.etiquetas set estado = 'aprobado', notas = '${COMENTARIO}' where id = :'id';\n` +
    admin +
    fila("id"),
  `aprobado|true|true|${COMENTARIO}`
);
caso(
  "5b · sin el módulo Etiquetas no se aprueba ni con comentario: la política no deja actualizar la fila",
  proponer("Prueba se autoaprueba") +
    micaela +
    `with u as (update retail.etiquetas set estado = 'aprobado', notas = '${COMENTARIO}' where id = :'id' returning 1) select count(*) from u;\n` +
    admin +
    fila("id"),
  "0\npendiente|true|false|∅"
);

// ── 6 · lo que una propuesta pendiente NO puede hacer todavía ────────────────────────────────────────────────────────────
// Categoría sin tejido/patrón con dos tallas, una pareja marca-proveedor y un color: los mismos datos que usa el alta.
const FIXTURA_ALTA = `
select c.id as cat from retail.categorias c join retail.familias f on f.codigo = c.familia
  where c.activo and not f.exige_tejido_patron
    and (select count(*) from retail.categoria_tallas ct join retail.tallas t on t.id = ct.talla_id and t.activo where ct.categoria_id = c.id) >= 2
  order by c.nombre limit 1 \\gset
select t.id as t1 from retail.categoria_tallas ct join retail.tallas t on t.id = ct.talla_id and t.activo where ct.categoria_id = :'cat' order by t.id limit 1 \\gset
select marca_id as marca, proveedor_id as prov from retail.marca_proveedores limit 1 \\gset
select codigo as c1 from retail.colores where activo order by codigo limit 1 \\gset
`;
const variantes = `jsonb_build_array(jsonb_build_object('talla_id', :'t1', 'color_codigo', :'c1', 'precio', 59, 'costo', 20))`;
const crearProducto = (ref, etiquetaId) =>
  `format($q$select retail.crear_producto_con_variantes(%L, %L::uuid, %L::jsonb, null, gen_random_uuid(), null, null, false, ${
    etiquetaId ? `array[%L]::uuid[]` : "null"
  }, %L::uuid, %L::uuid)$q$, '${ref}', :'cat', ${variantes}::text, ${etiquetaId ? `:'${etiquetaId}', ` : ""}:'marca', :'prov')`;

caso(
  "6a · una propuesta pendiente NO entra al alta de producto (`crear_producto_con_variantes`); aprobada, sí",
  FIXTURA_ALTA +
    proponer("Prueba alta") +
    felipe +
    `select pg_temp.intento(${crearProducto("Producto Prueba Etiqueta Pendiente", "id")});\n` +
    `update retail.etiquetas set estado = 'aprobado', notas = '${COMENTARIO}' where id = :'id';\n` +
    `select pg_temp.intento(${crearProducto("Producto Prueba Etiqueta Aprobada", "id")});\n` +
    admin +
    `select count(*) from retail.variante_etiquetas ve join retail.variantes v on v.id = ve.variante_id join retail.productos p on p.id = v.producto_id
       where ve.etiqueta_id = :'id' and p.referencia = 'Producto Prueba Etiqueta Aprobada';`,
  (s) => s.split("\n")[0].includes("ya no está disponible en el catálogo") && s.split("\n")[1] === "SIN_ERROR" && s.split("\n")[2] === "1"
);
caso(
  "6b · una propuesta pendiente NO se puede poner en una prenda desde «Prendas» (`etiquetar_variantes`); aprobada, sí",
  FIXTURA_ALTA +
    proponer("Prueba prendas") +
    felipe +
    `select retail.crear_producto_con_variantes('Producto Prueba Prendas', :'cat', ${variantes}, null, gen_random_uuid(), null, null, false, null, :'marca', :'prov') as prod \\gset\n` +
    `select id as var from retail.variantes where producto_id = :'prod' \\gset\n` +
    `select pg_temp.intento(format($q$select retail.etiquetar_variantes(jsonb_build_array(jsonb_build_object('etiqueta_id', %L, 'agregar', jsonb_build_array(%L))))$q$, :'id', :'var'));\n` +
    `update retail.etiquetas set estado = 'aprobado', notas = '${COMENTARIO}' where id = :'id';\n` +
    `select pg_temp.intento(format($q$select retail.etiquetar_variantes(jsonb_build_array(jsonb_build_object('etiqueta_id', %L, 'agregar', jsonb_build_array(%L))))$q$, :'id', :'var'));\n` +
    admin +
    `select count(*) from retail.variante_etiquetas where etiqueta_id = :'id' and variante_id = :'var';`,
  (s) => s.split("\n")[0].includes("SIN_ERROR") === false && s.split("\n")[1] === "SIN_ERROR" && s.split("\n")[2] === "1"
);

console.log(`\n${casos - fallas}/${casos} casos en verde${fallas ? ` — ${fallas} en rojo` : ""} (base: ${BASE})`);
process.exit(fallas ? 1 : 0);
