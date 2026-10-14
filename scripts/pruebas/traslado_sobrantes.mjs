#!/usr/bin/env node
/**
 * Prueba de `20261014175000_traslado_sobrantes_parte1_tabla.sql` y `20261014180000_traslado_sobrantes_parte2_funciones.sql`
 * (ADR-0404, Felipe 2026-10-14).
 *
 * EL PROBLEMA QUE PRUEBA. Lima envía 2 blusas a Trujillo; Trujillo cuenta 3, y además una prenda que no venía. Al cerrar con
 * la diferencia, las 4 entraban al stock de Trujillo: 2 prendas aparecían sin salir de ninguna sede (INV-08). Ahora entra lo
 * enviado y lo de más queda como sobrante a revisar, fuera del stock, hasta que un líder decide: salió del origen (sale de
 * Lima y entra a Trujillo), encontrada (entra como «Encontré prendas») o error de conteo (no entra nada). Con control: sin
 * la migración, el cierre metía lo de más al stock.
 *
 * Cada caso corre en una transacción que termina en ROLLBACK. Las prendas y el stock los pone la prueba (el seed de la base
 * del CI no tiene los ids de tu máquina): `BLU-EMMA-NEG-L` (vl) y `-M` (vm), con 20 de cada una en el almacén de Lima.
 *
 * USO: pnpm pruebas:traslado-sobrantes   (necesita el stack local: `npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIG_TABLA = readFileSync(join(RAIZ, "supabase/migrations/20261014175000_traslado_sobrantes_parte1_tabla.sql"), "utf8");
const MIG_FUNCIONES = readFileSync(join(RAIZ, "supabase/migrations/20261014180000_traslado_sobrantes_parte2_funciones.sql"), "utf8");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Tienda Trujillo, con Traslados (seed)
const SIN_ROL = "22222222-2222-4222-8222-000000000099"; // una cuenta que no es colaboradora: ningún permiso
const ARGS = ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];

function correr(sql) {
  try {
    return { ok: true, salida: execFileSync("docker", ARGS, { input: `${sql}\nrollback;\n`, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim() };
  } catch (e) {
    return { ok: false, salida: String(e.stdout ?? "").trim(), error: String(e.stderr ?? e.message) };
  }
}

// El bucle del cierre de ANTES (todo lo contado entraba). El control lo vuelve a poner en lugar del nuevo.
const BUCLE_NUEVO = MIG_FUNCIONES.match(/ {2}-- ADR-0404: de cada prenda entra hasta lo ENVIADO\.[\s\S]*?\n {2}end loop;\n/)?.[0];
if (!BUCLE_NUEVO) throw new Error("no encontré el bucle nuevo del cierre en la migración");
const BUCLE_VIEJO = `  for r in select * from transferencia_recepciones
            where transferencia_id = p_transferencia_id and movimiento_id is null
            order by variante_id loop
    if r.cantidad_recibida > 0 then
      insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, transferencia_recepcion_id, usuario_id)
        values (r.variante_id, t.ubicacion_destino_id, v_sub_destino,
                'entrada', r.cantidad_recibida, 'traslado_entrada', r.id, v_persona)
        returning id into v_mov_id;
      perform fn_aplicar_movimiento(v_mov_id);
      update transferencia_recepciones set movimiento_id = v_mov_id where id = r.id;
      perform fn_apartar_pedidos_que_llegaron(p_transferencia_id, r.variante_id, v_sub_destino, r.cantidad_recibida);
      v_lineas := v_lineas + 1; v_unidades := v_unidades + r.cantidad_recibida;
    end if;
  end loop;
`;
const SIN_LA_MIGRACION = `do $d$ begin execute replace(pg_get_functiondef('retail.cerrar_traslado_con_diferencia(uuid, text)'::regprocedure), $n$${BUCLE_NUEVO}$n$, $n$${BUCLE_VIEJO}$n$); end $d$;`;

const linea = (v, cantidad) => `jsonb_build_array(jsonb_build_object('variante_id', :'${v}', 'cantidad', ${cantidad}))`;
const stock = (v, sede) => `(select coalesce(sum(cantidad), 0) from retail.stock where variante_id = :'${v}' and ubicacion_id = :'${sede}')`;
const como = (quien) => `set local request.jwt.claim.sub = '${quien}';\n`;

/**
 * La escena: Lima envía `enviar` de vl; Trujillo cuenta `contarVl` de vl y `contarVm` de vm (que no venía), confirma, y el
 * líder cierra con la diferencia. Deja en psql: tr, y el stock de antes (después de enviar) de cada prenda en cada sede.
 */
function escena({ sinMigracion = false, enviar = 2, contarVl = 3, contarVm = 1, cerrar = true } = {}) {
  return `
begin;
${MIG_TABLA}
${MIG_FUNCIONES}
${sinMigracion ? SIN_LA_MIGRACION : ""}
${como(FELIPE)}
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as alm from retail.sububicaciones where ubicacion_id = :'lima' and tipo = 'almacen_tienda' limit 1 \\gset
select id as vl from retail.variantes where sku = 'BLU-EMMA-NEG-L' \\gset
select id as vm from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'vl', :'lima', :'alm', 'entrada', 20, 'colchón de prueba') returning id as m1 \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'vm', :'lima', :'alm', 'entrada', 20, 'colchón de prueba') returning id as m2 \\gset
select retail.fn_aplicar_movimiento(:'m1') as _a1, retail.fn_aplicar_movimiento(:'m2') as _a2 \\gset
select retail.iniciar_traslado(:'lima', :'tru', ${linea("vl", enviar)}, now() + interval '1 day', null, gen_random_uuid()) as tr \\gset
select ${stock("vl", "lima")} as lima_vl, ${stock("vm", "lima")} as lima_vm, ${stock("vl", "tru")} as tru_vl, ${stock("vm", "tru")} as tru_vm \\gset
select retail.registrar_recepcion_traslado(:'tr', :'vl', ${contarVl}) as _r1 \\gset
${contarVm > 0 ? `select retail.registrar_recepcion_traslado(:'tr', :'vm', ${contarVm}) as _r2 \\gset` : ""}
select resultado as confirmado from retail.confirmar_traslado(:'tr') \\gset
${cerrar ? `select lineas_recibidas as lineas, unidades_recibidas as unidades from retail.cerrar_traslado_con_diferencia(:'tr', 'contamos de más en la caja') \\gset` : ""}
`;
}
const sobrante = (v) => `(select id from retail.traslado_sobrantes where transferencia_id = :'tr' and variante_id = :'${v}')`;
const resolver = (v, decision, nota = "'revisamos la caja con calma'") => `select retail.resolver_sobrante_traslado(${sobrante(v)}, '${decision}', ${nota})`;
/** Cuánto se movió cada stock desde la escena (después de enviar): «lima_vl|-1» etc. */
const deltas = `select 'delta|' || (${stock("vl", "lima")} - :lima_vl) || '|' || (${stock("vm", "lima")} - :lima_vm) || '|' || (${stock("vl", "tru")} - :tru_vl) || '|' || (${stock("vm", "tru")} - :tru_vm);`;
const valor = (r, clave) => r.salida.match(new RegExp(`^${clave}\\|(.*)$`, "m"))?.[1];

let fallas = 0;
let total = 0;
function esperar(nombre, ok, detalle) {
  total++;
  if (ok) console.log(`✓ ${nombre}`);
  else {
    fallas++;
    console.log(`✗ ${nombre}\n    ${String(detalle ?? "").split("\n").filter(Boolean).slice(0, 6).join("\n    ")}`);
  }
}
const rechaza = (r, hint) => !r.ok && r.error.includes(hint);
const ver = (r) => r.salida || r.error;

// --- Control: sin la migración, lo contado de más entraba al stock ---
{
  const r = correr(`${escena({ sinMigracion: true })}${deltas}`);
  esperar("CONTROL sin la migración: Trujillo recibía 3 + 1 de un envío de 2 (2 prendas aparecían de la nada)", r.ok && valor(r, "delta") === "0|0|3|1", ver(r));
}

// --- El cierre: entra lo enviado, lo de más queda por revisar ---
{
  const r = correr(`${escena()}${deltas}
select 'cierre|' || :lineas || '|' || :unidades || '|' || (select estado from retail.transferencias where id = :'tr');
select 'sobrantes|' || string_agg(case when variante_id = :'vl' then 'vl' else 'vm' end || ':' || cantidad || ':' || estado, ',' order by variante_id = :'vm')
  from retail.traslado_sobrantes where transferencia_id = :'tr';
select 'inv08|' || count(*) from (
  select tr.id from retail.transferencia_recepciones tr
    join retail.transferencia_items ti on ti.transferencia_id = tr.transferencia_id and ti.variante_id = tr.variante_id
    join retail.movimientos m on m.transferencia_recepcion_id = tr.id and m.tipo = 'entrada'
   where tr.transferencia_id = :'tr' group by tr.id, ti.cantidad having sum(m.cantidad) > ti.cantidad) x;
select 'por_revisar_tru|' || coalesce((select unidades from retail.fn_sobrantes_por_revisar(:'tru') where transferencia_id = :'tr'), 0);
select 'por_revisar_lima|' || coalesce((select unidades from retail.fn_sobrantes_por_revisar(:'lima') where transferencia_id = :'tr'), 0);
select 'del_traslado|' || count(*) from retail.fn_sobrantes_de_traslado(:'tr');`);
  esperar("al cerrar entra solo lo enviado: Trujillo +2 de la blusa, +0 de la que no venía", r.ok && valor(r, "delta") === "0|0|2|0", ver(r));
  esperar("el cierre devuelve lo que ENTRÓ (1 línea, 2 unidades) y deja el traslado cerrado", r.ok && valor(r, "cierre") === "1|2|cerrada", ver(r));
  esperar("lo de más queda como sobrante por revisar: 1 de la blusa y 1 de la que no venía", r.ok && valor(r, "sobrantes") === "vl:1:por_revisar,vm:1:por_revisar", ver(r));
  esperar("INV-08: lo que entró por el traslado no pasa de lo enviado", r.ok && valor(r, "inv08") === "0", ver(r));
  esperar("fn_sobrantes_por_revisar: la sede que recibió y la que envió ven 2 unidades por revisar", r.ok && valor(r, "por_revisar_tru") === "2" && valor(r, "por_revisar_lima") === "2", ver(r));
  esperar("fn_sobrantes_de_traslado: el pase ve los dos sobrantes", r.ok && valor(r, "del_traslado") === "2", ver(r));
}

// --- Lo que falta (de menos) sigue igual ---
{
  const r = correr(`${escena({ contarVl: 1, contarVm: 0 })}${deltas}
select 'sobrantes|' || count(*) from retail.traslado_sobrantes where transferencia_id = :'tr';
select 'perdidas|' || string_agg(lado || ':' || unidades, ',') from retail.fn_perdidas_de_traslados(null, now() - interval '1 hour', now() + interval '1 hour') where transferencia_id = :'tr';`);
  esperar("de menos: entra lo contado (1), no hay sobrante y Pérdidas dice 1 perdida", r.ok && valor(r, "delta") === "0|0|1|0" && valor(r, "sobrantes") === "0" && valor(r, "perdidas") === "perdida:1", ver(r));
}

// --- Las tres salidas de la revisión ---
const perdidas = `select 'perdidas|' || coalesce(string_agg(lado || ':' || unidades, ','), 'ninguna') from retail.fn_perdidas_de_traslados(null, now() - interval '1 hour', now() + interval '1 hour') where transferencia_id = :'tr';`;
{
  const r = correr(`${escena()}
${resolver("vl", "salio_del_origen")} \\gset
${resolver("vm", "salio_del_origen")} \\gset
${deltas}
select 'salida_vl|' || (m.transferencia_item_id is not null) || '|' || (m.transferencia_recepcion_id is null) || '|' || m.motivo
  from retail.traslado_sobrantes s join retail.movimientos m on m.id = s.movimiento_salida_id where s.id = ${sobrante("vl")};
select 'salida_vm|' || (m.transferencia_item_id is null) || '|' || (m.transferencia_recepcion_id is not null) || '|' || m.motivo
  from retail.traslado_sobrantes s join retail.movimientos m on m.id = s.movimiento_salida_id where s.id = ${sobrante("vm")};
select 'entradas|' || string_agg(m.motivo || ':' || (m.transferencia_recepcion_id is not null), ',')
  from retail.traslado_sobrantes s join retail.movimientos m on m.id = s.movimiento_entrada_id where s.transferencia_id = :'tr';
select 'estados|' || string_agg(estado, ',' order by estado) from retail.traslado_sobrantes where transferencia_id = :'tr';
${perdidas}
select 'por_revisar|' || count(*) from retail.fn_sobrantes_por_revisar(:'tru') where transferencia_id = :'tr';`);
  esperar("«salió del origen»: Lima −1 de cada una y Trujillo recibe las dos (3 de la blusa, 1 de la otra)", r.ok && valor(r, "delta") === "-1|-1|3|1", ver(r));
  esperar("la salida de la blusa va enlazada a su línea del envío, como un traslado", r.ok && valor(r, "salida_vl") === "true|true|traslado_salida", ver(r));
  esperar("la de la prenda que no venía va enlazada a la línea contada (no había línea del envío)", r.ok && valor(r, "salida_vm") === "true|true|traslado_salida", ver(r));
  esperar("las entradas son del traslado y van enlazadas a su línea contada", r.ok && valor(r, "entradas") === "traslado_entrada:true,traslado_entrada:true", ver(r));
  esperar("Pérdidas no ve ni pérdida ni aparecida: la prenda viajó", r.ok && valor(r, "perdidas") === "ninguna", ver(r));
  esperar("los dos quedan revisados y la sede ya no tiene nada por revisar", r.ok && valor(r, "estados") === "salio_del_origen,salio_del_origen" && valor(r, "por_revisar") === "0", ver(r));
}
{
  const r = correr(`${escena()}
${resolver("vl", "encontrada")} \\gset
${resolver("vm", "error_de_conteo")} \\gset
${deltas}
select 'encontrada|' || m.tipo || '|' || m.motivo || '|' || m.cantidad || '|' || (m.nota like 'De más en el traslado %')
  from retail.traslado_sobrantes s join retail.movimientos m on m.id = s.movimiento_entrada_id where s.id = ${sobrante("vl")};
select 'error|' || estado || '|' || (movimiento_salida_id is null and movimiento_entrada_id is null) || '|' || (revisado_por is not null)
  from retail.traslado_sobrantes where id = ${sobrante("vm")};`);
  esperar("«encontrada»: entra a Trujillo como «Encontré prendas» con su nota; Lima no cambia", r.ok && valor(r, "delta") === "0|0|3|0" && valor(r, "encontrada") === "ajuste|reposicion|1|true", ver(r));
  esperar("«error de conteo»: no entra nada, queda revisado y firmado", r.ok && valor(r, "error") === "error_de_conteo|true|true", ver(r));
}

// --- Reintentos y candados ---
{
  const r = correr(`${escena()}
select (${resolver("vl", "salio_del_origen")}) ->> 'ya_registrado' as uno \\gset
select (${resolver("vl", "salio_del_origen")}) ->> 'ya_registrado' as dos \\gset
select 'ya|' || :'uno' || '|' || :'dos';
${deltas}`);
  esperar("pedir dos veces lo mismo devuelve lo mismo (ya_registrado) y mueve una sola vez", r.ok && valor(r, "ya") === "false|true" && valor(r, "delta") === "-1|0|3|0", ver(r));
}
esperar("otra decisión sobre uno ya revisado se rechaza (sobrante_ya_revisado)",
  rechaza(correr(`${escena()}${resolver("vl", "salio_del_origen")};\n${resolver("vl", "encontrada")};`), "sobrante_ya_revisado"), "pasó");
esperar("sin nota se rechaza (sobrante_sin_nota)", rechaza(correr(`${escena()}${resolver("vl", "encontrada", "'ok'")};`), "sobrante_sin_nota"), "pasó");
esperar("una nota de 201 se rechaza (sobrante_nota_larga)", rechaza(correr(`${escena()}${resolver("vl", "encontrada", "repeat('x', 201)")};`), "sobrante_nota_larga"), "pasó");
esperar("una decisión inventada se rechaza (sobrante_decision_invalida)", rechaza(correr(`${escena()}${resolver("vl", "me_la_quedo")};`), "sobrante_decision_invalida"), "pasó");
{
  // El mismo permiso que cerrar la diferencia (`fn_puede_ajustar_inventario`): Micaela tiene Traslados en el seed.
  const r = correr(`${escena()}${como(MICAELA)}${resolver("vl", "encontrada")} \\gset\n${deltas}`);
  esperar("una integrante con Traslados en la sede que recibió lo revisa, como cierra la diferencia", r.ok && valor(r, "delta") === "0|0|3|0", ver(r));
  const sin = correr(`${escena()}${como(SIN_ROL)}${resolver("vl", "encontrada")};`);
  esperar("una cuenta sin el permiso de cerrar la diferencia no puede revisarlo (sobrante_sin_permiso)", rechaza(sin, "sobrante_sin_permiso"), ver(sin));
}
{
  // Lima se queda sin la otra prenda libre: «salió de Lima» no puede descontar lo que el sistema no tiene.
  const r = correr(`${escena()}
with ins as (
  insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  select st.variante_id, st.ubicacion_id, st.sububicacion_id, 'ajuste', -(st.cantidad - coalesce(st.cantidad_apartada, 0)), 'merma'
    from retail.stock st join retail.sububicaciones sb on sb.id = st.sububicacion_id
   where st.ubicacion_id = :'lima' and st.variante_id = :'vm' and sb.tipo <> 'cuarentena'
     and st.cantidad - coalesce(st.cantidad_apartada, 0) > 0
  returning id)
select count(*) as _vaciados from (select retail.fn_aplicar_movimiento(id) from ins) x \\gset
${resolver("vm", "salio_del_origen")};`);
  esperar("«salió del origen» sin la prenda libre en el origen se rechaza y lo dice (sobrante_origen_sin_stock)", rechaza(r, "sobrante_origen_sin_stock") && r.error.includes("Tienda Lima"), ver(r));
}

// --- La migración se puede pegar dos veces, y se detiene si el cierre cambió ---
{
  const r = correr(`begin;\n${MIG_TABLA}\n${MIG_FUNCIONES}\n${MIG_TABLA}\n${MIG_FUNCIONES}
select 'cierre|' || md5(prosrc) from pg_proc where oid = 'retail.cerrar_traslado_con_diferencia(uuid,text)'::regprocedure;
select 'perdidas|' || (length(d) - length(replace(d, 'ADR-0404', ''))) / length('ADR-0404')
  from (select pg_get_functiondef('retail.fn_perdidas_de_traslados(uuid, timestamp with time zone, timestamp with time zone)'::regprocedure) d) x;`);
  esperar("las dos partes se pueden pegar dos veces: el cierre queda igual y Pérdidas lleva su cambio una sola vez",
    r.ok && valor(r, "cierre") === "111d4c2892e4eb675145cd3fa65b14cb" && valor(r, "perdidas") === "1", ver(r));
  const cambiado = correr(`begin;\n${MIG_TABLA}
do $d$ begin execute replace(pg_get_functiondef('retail.cerrar_traslado_con_diferencia(uuid, text)'::regprocedure), 'ADR-0190: stock primero', 'ADR-0190: el stock primero'); end $d$;
${MIG_FUNCIONES}`);
  esperar("si alguien cambió el cierre, la migración se detiene sin tocar nada", rechaza(cambiado, "cambió desde que se escribió"), ver(cambiado));
}

console.log(fallas ? `\n${fallas} de ${total} en rojo.` : `\n${total}/${total} pruebas en verde.`);
process.exit(fallas ? 1 : 0);
