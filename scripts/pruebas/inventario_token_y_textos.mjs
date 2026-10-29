#!/usr/bin/env node
/**
 * Prueba de `20261014162000_inventario_token_sigue_al_contenido.sql` y `20261014163000_inventario_textos_y_fechas.sql`
 * (/chaos de Inventario 2026-10-14, ADR-0401).
 *
 * EL PROBLEMA QUE PRUEBA. En ocho funciones de Inventario el mismo token con OTRO contenido devolvía lo del primer envío (Nuevo
 * traslado, tras una respuesta perdida y una corrección, anunciaba 3 prendas y la base tenía 2), y `arreglar_prenda_danada` daba por
 * arregladas dos dañadas con un solo movimiento. Además, notas de 5000 letras, una llegada en 1990 y cualquier motivo de ajuste.
 * Aquí cada caso se rechaza con su `hint`, lo válido pasa igual (el reintento con lo mismo devuelve lo mismo) y `fn_resolver_intento`
 * sabe revisar un traslado. Con controles: sin las migraciones, los ataques pasaban.
 *
 * Cada caso corre en una transacción que termina en ROLLBACK.
 *
 * USO: pnpm pruebas:inventario-token-y-textos   (necesita el stack local: `npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
// `arreglar_prenda_danada` cambió de firma después de esta migración (ADR-0564, 20261029033000: ganó `p_destino` y `p_costo`, y su huella los
// incluye). Para probar que el candado sigue protegiendo a la función de HOY, la migración se lee apuntando a la firma y a la huella vigentes.
const MIG_TOKEN = readFileSync(join(RAIZ, "supabase/migrations/20261014162000_inventario_token_sigue_al_contenido.sql"), "utf8")
  .replaceAll("retail.arreglar_prenda_danada(uuid, text, uuid)", "retail.arreglar_prenda_danada(uuid, text, uuid, text, numeric)")
  .replaceAll("md5(jsonb_build_array(p_id, p_nota)::text)", "md5(jsonb_build_array(p_id, p_nota, v_destino, p_costo)::text)");
const MIG_TEXTOS = readFileSync(join(RAIZ, "supabase/migrations/20261014163000_inventario_textos_y_fechas.sql"), "utf8");
const FELIPE = "22222222-2222-4222-8222-000000000001";
const ARGS = ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];

function correr(sql) {
  try {
    return { ok: true, salida: execFileSync("docker", ARGS, { input: `${sql}\nrollback;\n`, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim() };
  } catch (e) {
    return { ok: false, salida: String(e.stdout ?? "").trim(), error: String(e.stderr ?? e.message) };
  }
}

/** Los bloques que insertan las dos migraciones: para deshacerlos en los controles («sin la migración»). */
function bloques(migracion) {
  return [...migracion.matchAll(/select pg_temp\.insertar_antes\(\s*'(retail\.[^']+)',\s*\$v\$([\s\S]*?)\$v\$, \d+,\s*\$v\$([\s\S]*?)\$v\$,/g)].map((m) => ({ firma: m[1], ancla: m[2], bloque: m[3] }));
}
const DEL_TOKEN = bloques(MIG_TOKEN);
const DE_TEXTOS = bloques(MIG_TEXTOS);
if (DEL_TOKEN.length !== 8) throw new Error(`esperaba 8 candados de token y encontré ${DEL_TOKEN.length}`);
if (DE_TEXTOS.length !== 3) throw new Error(`esperaba 3 candados de textos y encontré ${DE_TEXTOS.length}`);
// Se quita el bloque solo, sin mirar qué viene después: en `pedir_a_otra_sede` el de textos queda entre el del token y el ancla.
const deshacer = (lista) => lista.map((b) => `do $d$ begin execute replace(pg_get_functiondef('${b.firma}'::regprocedure), $n$${b.bloque}$n$, ''); end $d$;`).join("\n");

// Las prendas y el proveedor salen del seed por su código (los ids cambian en cada base: en el CI no son los de tu máquina), y su
// stock lo pone la propia prueba, dentro de la transacción: `vl` en el almacén de Lima (traslados, pedidos, bajar al piso) y `vm` en
// el almacén y en el piso (apartar, dañadas, ajustes).
/** Una línea de prendas en SQL: `vl`/`vm` son variables de psql, que no se reemplazan dentro de un texto entre comillas. */
const linea = (v, cantidad, extra = "") => `jsonb_build_array(jsonb_build_object('variante_id', :'${v}', 'cantidad', ${cantidad}${extra}))`;

function preparar({ sinToken = false, sinTextos = false } = {}) {
  return `
begin;
${MIG_TOKEN}
${MIG_TEXTOS}
${sinTextos ? deshacer(DE_TEXTOS) : ""}
${sinToken ? deshacer(DEL_TOKEN) : ""}
set local request.jwt.claim.sub = '${FELIPE}';
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as alm from retail.sububicaciones where ubicacion_id = :'lima' and tipo = 'almacen_tienda' limit 1 \\gset
select id as piso from retail.sububicaciones where ubicacion_id = :'lima' and tipo = 'piso_venta' limit 1 \\gset
select id as vl from retail.variantes where sku = 'BLU-EMMA-NEG-L' \\gset
select id as vm from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select id as prov from retail.proveedores where nombre = 'Textiles Andina SAC' \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'vl', :'lima', :'alm', 'entrada', 20, 'colchón de prueba') returning id as m1 \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'vm', :'lima', :'alm', 'entrada', 20, 'colchón de prueba') returning id as m2 \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'vm', :'lima', :'piso', 'entrada', 20, 'colchón de prueba') returning id as m3 \\gset
select retail.fn_aplicar_movimiento(:'m1') as _a1, retail.fn_aplicar_movimiento(:'m2') as _a2, retail.fn_aplicar_movimiento(:'m3') as _a3 \\gset
-- Lo que ya hay de \`vl\` en el piso: bajar desde Vender pide «que haya N en el piso», así que la prueba pide una y dos más.
select coalesce(sum(cantidad), 0) as piso_vl from retail.stock where variante_id = :'vl' and sububicacion_id = :'piso' \\gset
`;
}

let fallas = 0;
let total = 0;
function esperar(nombre, ok, detalle) {
  total++;
  if (ok) console.log(`✓ ${nombre}`);
  else {
    fallas++;
    console.log(`✗ ${nombre}\n    ${String(detalle ?? "").split("\n").filter(Boolean).slice(0, 5).join("\n    ")}`);
  }
}
const rechaza = (r, hint) => !r.ok && r.error.includes(hint);

/** El mismo token dos veces: `uno` y `dos` son expresiones SQL que reciben el token. */
function mismoToken(uno, dos, { antes = "", despues = "", sin = false } = {}) {
  const t = "c0ffee00-0000-4000-8000-000000014001";
  return correr(`${preparar({ sinToken: sin })}${antes}
select 'uno|' || (${uno(t)})::text;
select 'dos|' || (${dos(t)})::text;
${despues}`);
}
const iguales = (r) => {
  const a = r.salida.match(/^uno\|(.*)$/m)?.[1];
  const b = r.salida.match(/^dos\|(.*)$/m)?.[1];
  return a !== undefined && a === b;
};

const CASOS = [
  {
    nombre: "iniciar_traslado: 2 prendas y luego 3",
    uno: (t) => `retail.iniciar_traslado(:'lima', :'tru', ${linea("vl", 2)}, now() + interval '1 day', null, '${t}')`,
    dos: (t) => `retail.iniciar_traslado(:'lima', :'tru', ${linea("vl", 3)}, now() + interval '1 day', null, '${t}')`,
  },
  {
    nombre: "recibir_lote: 2 y luego 5",
    uno: (t) => `retail.recibir_lote(:'lima', :'prov', ${linea("vl", 2, ", 'costo_unitario', 30")}, null, null, '${t}')`,
    dos: (t) => `retail.recibir_lote(:'lima', :'prov', ${linea("vl", 5, ", 'costo_unitario', 30")}, null, null, '${t}')`,
  },
  {
    nombre: "pedir_a_otra_sede: 1 y luego 3",
    uno: (t) => `retail.pedir_a_otra_sede(:'tru', :'lima', ${linea("vl", 1)}, null, '${t}')`,
    dos: (t) => `retail.pedir_a_otra_sede(:'tru', :'lima', ${linea("vl", 3)}, null, '${t}')`,
  },
  {
    nombre: "pedir_prenda_para_apartar: para Ana y luego para Bea",
    uno: (t) => `retail.pedir_prenda_para_apartar(:'tru', :'lima', :'vl', 1, 'Ana', 'Lozano', '999111222', null, '${t}')`,
    dos: (t) => `retail.pedir_prenda_para_apartar(:'tru', :'lima', :'vl', 1, 'Bea', 'Lozano', '999111222', null, '${t}')`,
  },
  {
    nombre: "apartar_prenda: para Ana y luego para Bea",
    uno: (t) => `retail.apartar_prenda(:'vm', :'lima', 1, 'Ana', '999111222', current_date + 3, null, :'piso', '${t}')`,
    dos: (t) => `retail.apartar_prenda(:'vm', :'lima', 1, 'Bea', '999111222', current_date + 3, null, :'piso', '${t}')`,
  },
  {
    nombre: "bajar_al_piso_desde_vender: 1 y luego 2",
    uno: (t) => `retail.bajar_al_piso_desde_vender(:'lima', :'vl', :piso_vl + 1, '${t}')`,
    dos: (t) => `retail.bajar_al_piso_desde_vender(:'lima', :'vl', :piso_vl + 2, '${t}')`,
    // Devuelve el mismo movimiento con `ya_registrada`: lo que cuenta es el movimiento.
    mismo: (r) => {
      const a = r.salida.match(/^uno\|.*"movimiento_id": "([^"]+)"/m)?.[1];
      const b = r.salida.match(/^dos\|.*"movimiento_id": "([^"]+)"/m)?.[1];
      return Boolean(a) && a === b;
    },
  },
];

// --- El token: controles (sin la migración devolvía lo del primero) y el rechazo con ella ---
for (const c of CASOS) {
  const sin = mismoToken(c.uno, c.dos, { sin: true });
  esperar(`CONTROL ${c.nombre}: sin la migración, el segundo devolvía lo del primero`, sin.ok && (c.mismo ?? iguales)(sin), sin.salida || sin.error);
  esperar(`${c.nombre}: el segundo se rechaza (token_reusado)`, rechaza(mismoToken(c.uno, c.dos), "token_reusado"), "pasó");
  const repetido = mismoToken(c.uno, c.uno);
  esperar(`${c.nombre}: el reintento con LO MISMO devuelve lo mismo`, repetido.ok && (c.mismo ?? iguales)(repetido), repetido.salida || repetido.error);
}

// --- Las dañadas: dos con el mismo token y la misma nota ---
{
  const antes = `select retail.reportar_danada(:'lima', :'vm', 1, 'almacen', 'mancha uno', gen_random_uuid());
select retail.reportar_danada(:'lima', :'vm', 1, 'almacen', 'mancha dos', gen_random_uuid());
select id as d1 from retail.prendas_danadas where variante_id = :'vm' and motivo_reporte = 'mancha uno' \\gset
select id as d2 from retail.prendas_danadas where variante_id = :'vm' and motivo_reporte = 'mancha dos' \\gset
`;
  const despues = `select 'arregladas|' || count(*) || '|' || count(distinct movimiento_salida_id) from retail.prendas_danadas where id in (:'d1', :'d2') and estado = 'se_arreglo';`;
  const uno = (t) => `retail.arreglar_prenda_danada(:'d1', 'cosido', '${t}')`;
  const dos = (t) => `retail.arreglar_prenda_danada(:'d2', 'cosido', '${t}')`;
  const sin = mismoToken(uno, dos, { antes, despues, sin: true });
  esperar("CONTROL arreglar_prenda_danada: sin la migración, dos dañadas quedaban arregladas con UN movimiento", sin.ok && sin.salida.includes("arregladas|2|1"), sin.salida || sin.error);
  esperar("arreglar_prenda_danada: la segunda dañada con el mismo token se rechaza", rechaza(mismoToken(uno, dos, { antes, despues }), "token_reusado"), "pasó");
  const repetido = mismoToken(uno, uno, { antes, despues });
  esperar("arreglar_prenda_danada: arreglar la misma dos veces no repite nada", repetido.ok && repetido.salida.includes("arregladas|1|1"), repetido.salida || repetido.error);
}

// --- El pase de un pedido: enviar con el mismo token y otra fecha ---
{
  const antes = `select retail.pedir_a_otra_sede(:'tru', :'lima', ${linea("vl", 1)}, null, gen_random_uuid()) as grupo \\gset
`;
  const uno = (t) => `retail.enviar_pedido_a_otra_sede((select grupo_id from retail.separacion_pedidos where id = :'grupo' or grupo_id = :'grupo' limit 1), now() + interval '1 day', '${t}')`;
  const dos = (t) => `retail.enviar_pedido_a_otra_sede((select grupo_id from retail.separacion_pedidos where id = :'grupo' or grupo_id = :'grupo' limit 1), now() + interval '3 days', '${t}')`;
  esperar("enviar_pedido_a_otra_sede: el mismo token con otra fecha se rechaza", rechaza(mismoToken(uno, dos, { antes }), "token_reusado"), "pasó");
  const repetido = mismoToken(uno, uno, { antes });
  esperar("enviar_pedido_a_otra_sede: el reintento con lo mismo no falla ni duplica", repetido.ok && /dos\|/.test(repetido.salida), repetido.salida || repetido.error);
}

// --- El resolver revisa un traslado ---
{
  const r = correr(`${preparar()}
select retail.iniciar_traslado(:'lima', :'tru', ${linea("vl", 2)}, now() + interval '1 day', null, 'c0ffee00-0000-4000-8000-000000014101') as tr \\gset
select 'hecho|' || (retail.fn_resolver_intento('iniciar_traslado', 'c0ffee00-0000-4000-8000-000000014101') ->> 'estado') || '|' || (retail.fn_resolver_intento('iniciar_traslado', 'c0ffee00-0000-4000-8000-000000014101') ->> 'prendas');
select 'perdido|' || (retail.fn_resolver_intento('iniciar_traslado', 'c0ffee00-0000-4000-8000-000000014102') ->> 'estado');`);
  esperar("fn_resolver_intento: un traslado guardado es «hecho» con sus prendas", r.ok && r.salida.includes("hecho|hecho|2"), r.salida || r.error);
  esperar("fn_resolver_intento: un traslado que no llegó es «no_llego»", r.ok && r.salida.includes("perdido|no_llego"), r.salida || r.error);
  const tarde = correr(`${preparar()}
select retail.fn_resolver_intento('iniciar_traslado', 'c0ffee00-0000-4000-8000-000000014103');
select retail.iniciar_traslado(:'lima', :'tru', ${linea("vl", 2)}, now() + interval '1 day', null, 'c0ffee00-0000-4000-8000-000000014103');`);
  esperar("un traslado que llega DESPUÉS de darse por no llegado se rechaza (intento_descartado)", rechaza(tarde, "intento_descartado"), tarde.salida);
}

// --- Textos y fechas ---
const traslado = (nota, fecha) => `select retail.iniciar_traslado(:'lima', :'tru', ${linea("vl", 1)}, ${fecha}, ${nota}, gen_random_uuid());`;
{
  const sin = correr(`${preparar({ sinTextos: true })}${traslado("repeat('x', 5000)", "'1990-01-01'::timestamptz")}`);
  esperar("CONTROL sin la migración: un traslado con nota de 5000 y llegada en 1990 se guardaba", sin.ok, sin.error);
}
esperar("una nota de traslado de 201 se rechaza", rechaza(correr(`${preparar()}${traslado("repeat('x', 201)", "now() + interval '1 day'")}`), "traslado_nota_larga"), "pasó");
esperar("una nota de traslado de 200 se guarda", correr(`${preparar()}${traslado("repeat('x', 200)", "now() + interval '1 day'")}`).ok, "rechazada");
esperar("una llegada en 1990 se rechaza", rechaza(correr(`${preparar()}${traslado("null", "'1990-01-01'::timestamptz")}`), "traslado_llegada_pasada"), "pasó");
esperar("una llegada de ayer se acepta (el pase abierto antes de medianoche)", correr(`${preparar()}${traslado("null", "now() - interval '1 day'")}`).ok, "rechazada");
esperar("una nota de pedido a otra sede de 201 se rechaza",
  rechaza(correr(`${preparar()}select retail.pedir_a_otra_sede(:'tru', :'lima', ${linea("vl", 1)}, repeat('x', 201), gen_random_uuid());`), "pedido_nota_larga"), "pasó");
const ajuste = (motivo, nota) => `select retail.ajustar_inventario(:'lima', :'alm', ${linea("vm", -1)}, ${motivo}, '[]'::jsonb, false, ${nota}, gen_random_uuid());`;
{
  const sin = correr(`${preparar({ sinTextos: true })}${ajuste("'porque_si'", "null")}`);
  esperar("CONTROL sin la migración: un ajuste con motivo inventado se guardaba", sin.ok, sin.error);
}
esperar("un ajuste con motivo inventado se rechaza", rechaza(correr(`${preparar()}${ajuste("'porque_si'", "null")}`), "ajuste_motivo_invalido"), "pasó");
for (const m of ["reposicion", "merma", "conteo_fisico", "otro"]) {
  // «Encontré prendas» (reposicion) suma: va con +1 y su nota.
  const sql = m === "reposicion"
    ? `select retail.ajustar_inventario(:'lima', :'alm', ${linea("vm", 1)}, 'reposicion', '[]'::jsonb, false, 'estaba en otra caja', gen_random_uuid());`
    : ajuste(`'${m}'`, "'una nota'");
  const r = correr(`${preparar()}${sql}`);
  esperar(`un ajuste con el motivo «${m}» de la pantalla se guarda`, r.ok, r.error);
}
esperar("una nota de ajuste de 301 se rechaza", rechaza(correr(`${preparar()}${ajuste("'otro'", "repeat('x', 301)")}`), "ajuste_nota_larga"), "pasó");
esperar("una nota de ajuste de 300 se guarda (Existencias antepone su prefijo a lo escrito)", correr(`${preparar()}${ajuste("'otro'", "repeat('x', 300)")}`).ok, "rechazada");

// --- Las migraciones se pueden pegar dos veces ---
{
  const r = correr(`begin;\n${MIG_TOKEN}\n${MIG_TOKEN}\n${MIG_TEXTOS}\n${MIG_TEXTOS}
select 'llamadas|' || sum((length(d) - length(replace(d, 'fn_intento_con_huella(', ''))) / length('fn_intento_con_huella('))
  from (select pg_get_functiondef(oid) d from pg_proc where pronamespace = 'retail'::regnamespace
         and proname in ('iniciar_traslado','enviar_pedido_a_otra_sede','recibir_lote','pedir_a_otra_sede','pedir_prenda_para_apartar','apartar_prenda','bajar_al_piso_desde_vender','arreglar_prenda_danada')) x;
select 'textos|' || (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname in ('iniciar_traslado','pedir_a_otra_sede','ajustar_inventario')
  and pg_get_functiondef(oid) ~ '(traslado_nota_larga|pedido_nota_larga|ajuste_motivo_invalido)');`);
  esperar("las dos migraciones se pueden pegar dos veces: cada candado una sola vez", r.ok && r.salida.includes("llamadas|8") && r.salida.includes("textos|3"), r.salida || r.error);
}

console.log(fallas ? `\n${fallas} de ${total} en rojo.` : `\n${total}/${total} pruebas en verde.`);
process.exit(fallas ? 1 : 0);
