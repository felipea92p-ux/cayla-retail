#!/usr/bin/env node
/**
 * Prueba de «Ingresar insumo ▸ Compra pide proveedor y deja su deuda» (P03 del «Análisis del Taller», Felipe 2026-11-02) contra el Postgres LOCAL:
 * migración `20261102235000_insumo_compra_con_deuda.sql`, que carga ella misma dentro de cada caso (todos con ROLLBACK: la base local compartida no cambia).
 *
 * LA PRUEBA. Un lote de 10 unidades a S/ 5.00 sin IGV: subtotal 50.00; con factura al 18 % el total es 59.00.
 *
 * QUÉ CUBRE
 *   A  A CRÉDITO: nace la factura del proveedor con su deuda (saldo = total), el lote con el costo de la línea (sin IGV), su proveedor, su documento y su
 *      movimiento de compra, todo ligado (lote → ítem de la factura); Por pagar la ve.
 *   B  AL CONTADO: la factura nace pagada (sus medios suman el total); con un pago que no suma el total, se rechaza y NO queda nada (todo o nada).
 *   C  SIN PAPEL: «todavía no tengo el papel» registra una nota de venta provisional (serie S/P, número que corre por proveedor) que se reconoce y se puede
 *      reemplazar; sin serie ni número y sin marcar «sin papel», se rechaza.
 *   D  LO MALO NO DEJA RASTRO: documento repetido, cantidad cero, más de 3 decimales, vencimiento anterior a la emisión, proveedor inexistente, insumo
 *      archivado, quien no es líder: ninguna factura, ningún lote, ningún movimiento.
 *   E  DOBLE ENVÍO: el mismo token dos veces = una factura y un lote; con otro contenido, `token_reusado`.
 *   F  LA FORMA: una sola función, `anon` no ejecuta, `authenticated` sí; `recibir_insumo` (saldo inicial, «Encontré tela») no cambia; y la migración se
 *      pega dos veces.
 *
 * USO
 *   pnpm pruebas:insumo-compra-con-deuda   → contra el stack local (carga la migración dentro de cada caso)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR = process.env.RETAIL_CONTENEDOR_PG ?? "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase/migrations/20261102235000_insumo_compra_con_deuda.sql"), "utf8")
  .replace(/^set lock_timeout.*$/m, "")
  .replace(/^reset lock_timeout;$/m, "");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder y Admin (semilla)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora (semilla)

function psql(sql) {
  return execFileSync("docker", ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"], {
    input: sql,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

let fallas = 0;
let total = 0;
function caso(nombre, fn) {
  total++;
  try {
    const detalle = fn();
    if (detalle) throw new Error(detalle);
    console.log(`✓ ${nombre}`);
  } catch (e) {
    fallas++;
    console.log(`✗ ${nombre}\n    ${String(e.stderr ?? e.message).split("\n").slice(0, 8).join("\n    ")}`);
  }
}

const sesion = (uid) => `set local request.jwt.claim.sub = '${uid}';
set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}';
select set_config('request.headers', '{}', true) as _h \\gset
set local role authenticated;
`;

const ARGS_BASE = { tipo: "factura", serie: "F001", numero: "123", sinPapel: false, condicion: "credito", vence: "hoy+30", igv: 18, pago: null, cantidad: 10, costo: 5, codigo: null, token: "nuevo" };

/**
 * Una escena: abre el contexto, llama a la función nueva (o a otra) con lo que se pida y devuelve el estado. `antes` es SQL extra que corre ANTES de la llamada
 * (como la sesión de Felipe), `despues` corre DESPUÉS de reset role y puede devolver más datos en `extra`.
 */
function escena({ como = "lider", llamadas = [{}], insumo = "primero", proveedor = "primero", antes = "", extra = "null" } = {}) {
  const sqlLlamadas = llamadas
    .map((l, i) => {
      const a = { ...ARGS_BASE, ...l };
      const insArg = a.insumo === "inexistente" ? "'00000000-0000-4000-8000-000000000000'" : ":'ins'";
      const provArg = a.proveedor === "inexistente" ? "'00000000-0000-4000-8000-000000000000'" : ":'prov'";
      const vence = a.vence === "hoy+30" ? "(retail.fn_hoy_lima() + 30)" : a.vence === "ayer" ? "(retail.fn_hoy_lima() - 400)" : a.vence ? `'${a.vence}'::date` : "null";
      // El token va como argumento de format(): psql no interpola `:'tok'` dentro de un texto entre comillas ($q$…$q$).
      const tokenArg = a.token === "nuevo" ? `:'tok${i}'` : a.token === "mismo" ? `:'tok0'` : "null";
      const pago = a.pago === null ? "null" : `'${JSON.stringify(a.pago)}'::jsonb`;
      const serie = a.serie === null ? "null" : `'${a.serie}'`;
      const numero = a.numero === null ? "null" : `'${a.numero}'`;
      const codigo = a.codigo === null ? "null" : `'${a.codigo}'`;
      return `select set_config('prueba.r${i}', pg_temp.intento(format($q$select retail.recibir_insumo_comprado(%L, %L, %L, ${a.cantidad}::numeric, ${a.costo}::numeric, '${a.tipo}', ${serie}, ${numero}, ${a.sinPapel}, '${a.condicion}', retail.fn_hoy_lima(), ${vence}, ${a.igv}::numeric, ${pago}, ${codigo}, null, %L::uuid)$q$, ${insArg}, :'taller', ${provArg}, ${tokenArg})), true) as _r${i} \\gset`;
    })
    .join("\n");
  const salida = psql(`begin;
${MIGRACION}
set local request.jwt.claim.sub = '${FELIPE}';
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_msg text; v_hint text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics v_msg = message_text, v_hint = pg_exception_hint;
  return 'error|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
grant execute on function pg_temp.intento(text) to authenticated;
select id as taller from retail.ubicaciones where tipo = 'taller' and activo limit 1 \\gset
-- Su propio proveedor e insumo (el CI parte de una base sin proveedores de Producción): nada depende de lo que haya en la base local.
select retail.guardar_proveedor_produccion(null, 'Proveedor P03 de prueba', 'tela') as prov \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('T-P03-LINO', 'Lino P03 de prueba', 'tela', 'metro') returning id as ins \\gset
${insumo === "archivado" ? `update retail.insumos set archivado_at = now() where id = :'ins';` : ""}
update retail.colaboradores set ubicacion_asignada_id = :'taller' where persona_id = (select id from public.personas where auth_user_id = '${MICAELA}');
select count(*) as n_comp0 from retail.comprobantes_produccion where proveedor_id = :'prov' \\gset
select count(*) as n_lotes0 from retail.insumo_lotes where insumo_id = :'ins' \\gset
select count(*) as n_movs0 from retail.movimientos_insumo where insumo_id = :'ins' \\gset
select gen_random_uuid() as tok0, gen_random_uuid() as tok1 \\gset
${antes}
${sesion(como === "lider" ? FELIPE : MICAELA)}
${sqlLlamadas}
reset role;
select jsonb_build_object(
  'r', jsonb_build_array(${llamadas.map((_, i) => `current_setting('prueba.r${i}')`).join(", ")}),
  'comprobantes', (select coalesce(jsonb_agg(jsonb_build_object('tipo', c.tipo, 'serie', c.serie, 'numero', c.numero, 'condicion', c.condicion, 'subtotal', c.subtotal, 'igv', c.igv, 'total', c.total, 'estado', c.estado, 'nota', c.nota,
                          'pagado', coalesce((select sum(p.monto) from retail.comprobantes_produccion_pagos p where p.comprobante_id = c.id), 0),
                          'saldo', (select f.saldo from retail.fn_comprobantes_produccion(100000) f where false) ) order by c.created_at), '[]'::jsonb)
                    from retail.comprobantes_produccion c where c.proveedor_id = :'prov' and c.created_at >= now() - interval '1 minute'),
  'n_comp', (select count(*) from retail.comprobantes_produccion where proveedor_id = :'prov') - :n_comp0,
  'n_lotes', (select count(*) from retail.insumo_lotes where insumo_id = :'ins') - :n_lotes0,
  'n_movs', (select count(*) from retail.movimientos_insumo where insumo_id = :'ins') - :n_movs0,
  'lotes', (select coalesce(jsonb_agg(jsonb_build_object('cant', l.cantidad_ingresada, 'costo', l.costo_unitario, 'proveedor', l.proveedor_id = :'prov', 'documento', l.documento, 'ligado', l.comprobante_item_id is not null, 'origen', l.origen)), '[]'::jsonb)
              from retail.insumo_lotes l where l.insumo_id = :'ins' and l.created_at >= now() - interval '1 minute'),
  'saldo_por_pagar', (select coalesce(sum(case when c.estado = 'anulada' then 0 else c.total - coalesce((select sum(p.monto) from retail.comprobantes_produccion_pagos p where p.comprobante_id = c.id), 0) end), 0)
                        from retail.comprobantes_produccion c where c.proveedor_id = :'prov' and c.created_at >= now() - interval '1 minute'),
  'extra', ${extra}
);
rollback;`);
  return JSON.parse(salida.split("\n").filter(Boolean).at(-1));
}

const ok = (s, i = 0) => s.r[i] === "ok";
const esperaError = (s, i = 0, pista = null, texto = null) => {
  const r = s.r[i];
  if (!r.startsWith("error|")) return `no falló: ${r}`;
  if (pista && !r.startsWith(`error|${pista}|`)) return `la pista no es ${pista}: ${r}`;
  if (texto && !r.includes(texto)) return `el mensaje no dice «${texto}»: ${r}`;
  return null;
};
const sinRastro = (s) => (s.n_comp === 0 && s.n_lotes === 0 && s.n_movs === 0 ? null : `quedó rastro: ${JSON.stringify({ comp: s.n_comp, lotes: s.n_lotes, movs: s.n_movs })}`);

// ---------------- A · A CRÉDITO ----------------
caso("A1 a crédito: nace la factura con su deuda (saldo = total) y el lote con su costo sin IGV, su proveedor y su documento, todo ligado", () => {
  const s = escena({});
  if (!ok(s)) return JSON.stringify(s.r);
  const c = s.comprobantes[0];
  if (s.comprobantes.length !== 1 || c.tipo !== "factura" || c.serie !== "F001" || c.numero !== "123" || c.condicion !== "credito") return JSON.stringify(s.comprobantes);
  if (Number(c.subtotal) !== 50 || Number(c.igv) !== 9 || Number(c.total) !== 59 || Number(c.pagado) !== 0) return `montos: ${JSON.stringify(c)}`;
  if (Number(s.saldo_por_pagar) !== 59) return `saldo por pagar ${s.saldo_por_pagar}`;
  const l = s.lotes[0];
  if (s.lotes.length !== 1 || Number(l.cant) !== 10 || Number(l.costo) !== 5 || !l.proveedor || l.documento !== "F001-123" || !l.ligado || l.origen !== "compra") return JSON.stringify(s.lotes);
  if (s.n_movs !== 1) return `movimientos nuevos: ${s.n_movs}`;
});
caso("A2 con IGV de 0 % (un proveedor exonerado) el total es el subtotal", () => {
  const s = escena({ llamadas: [{ igv: 0 }] });
  if (!ok(s)) return JSON.stringify(s.r);
  if (Number(s.comprobantes[0].total) !== 50 || Number(s.comprobantes[0].igv) !== 0) return JSON.stringify(s.comprobantes[0]);
});
caso("A3 una boleta no lleva IGV aparte: total = subtotal", () => {
  const s = escena({ llamadas: [{ tipo: "boleta" }] });
  if (!ok(s)) return JSON.stringify(s.r);
  if (Number(s.comprobantes[0].total) !== 50) return JSON.stringify(s.comprobantes[0]);
});

// ---------------- B · AL CONTADO ----------------
caso("B1 al contado: la factura nace pagada (sus medios suman el total) y no queda deuda", () => {
  const s = escena({ llamadas: [{ condicion: "contado", vence: null, pago: [{ metodo: "transferencia", monto: 40 }, { metodo: "efectivo", monto: 19 }] }] });
  if (!ok(s)) return JSON.stringify(s.r);
  if (Number(s.comprobantes[0].pagado) !== 59 || Number(s.saldo_por_pagar) !== 0) return `pagado ${s.comprobantes[0].pagado}, saldo ${s.saldo_por_pagar}`;
  if (s.n_lotes !== 1) return `lotes ${s.n_lotes}`;
});
caso("B2 al contado con un pago que no suma el total: se rechaza y NO queda nada (todo o nada)", () => {
  const s = escena({ llamadas: [{ condicion: "contado", vence: null, pago: [{ metodo: "efectivo", monto: 58 }] }] });
  return esperaError(s, 0, null, "Al contado") ?? sinRastro(s);
});
caso("B3 al contado sin pago: se rechaza y NO queda nada", () => {
  const s = escena({ llamadas: [{ condicion: "contado", vence: null, pago: null }] });
  return esperaError(s, 0, null, "con su pago") ?? sinRastro(s);
});

// ---------------- C · SIN PAPEL ----------------
caso("C1 «todavía no tengo el papel»: nota de venta provisional S/P, que se reconoce, con su lote y su deuda", () => {
  const s = escena({ llamadas: [{ sinPapel: true, tipo: "factura", serie: null, numero: null }] });
  if (!ok(s)) return JSON.stringify(s.r);
  const c = s.comprobantes[0];
  if (c.tipo !== "nota_venta" || c.serie !== "S/P" || !/^\d{6}$/.test(c.numero)) return JSON.stringify(c);
  if (Number(c.total) !== 50 || !/Sin el papel del proveedor/.test(c.nota ?? "")) return JSON.stringify(c);
  if (s.n_lotes !== 1 || s.lotes[0].documento !== `S/P-${c.numero}`) return JSON.stringify(s.lotes);
});
caso("C2 dos compras sin papel al mismo proveedor: los números corren y no chocan", () => {
  const s = escena({ llamadas: [{ sinPapel: true, serie: null, numero: null }, { sinPapel: true, serie: null, numero: null }] });
  if (!ok(s, 0) || !ok(s, 1)) return JSON.stringify(s.r);
  const [a, b] = s.comprobantes;
  if (s.comprobantes.length !== 2 || a.numero === b.numero) return JSON.stringify(s.comprobantes);
});
caso("C3 sin serie ni número y sin marcar «sin papel»: se rechaza y NO queda nada", () => {
  const s = escena({ llamadas: [{ serie: null, numero: null }] });
  return esperaError(s, 0, null, "serie y número") ?? sinRastro(s);
});

// ---------------- D · LO MALO NO DEJA RASTRO ----------------
for (const [nombre, llamada, texto] of [
  ["un documento repetido de ese proveedor", [{}, { numero: "123", token: "nuevo" }], "ya está registrado"],
  ["cantidad cero", [{ cantidad: 0 }], "mayor a cero"],
  ["una cantidad con más de 3 decimales", [{ cantidad: 1.2345 }], "3 decimales"],
  ["un vencimiento anterior a la emisión", [{ vence: "ayer" }], "anterior a la emisión"],
  ["un costo negativo", [{ costo: -1 }], "negativo"],
  ["un proveedor que no existe", [{ proveedor: "inexistente" }], "proveedor no existe"],
  ["un insumo que no existe", [{ insumo: "inexistente" }], "no existe"],
]) {
  caso(`D ${nombre}: se rechaza${nombre.includes("repetido") ? " la segunda" : ""} sin dejar rastro de más`, () => {
    const s = escena({ llamadas: llamada });
    const idx = llamada.length - 1;
    const e = esperaError(s, idx, null, texto);
    if (e) return e;
    if (nombre.includes("repetido")) return s.n_comp === 1 && s.n_lotes === 1 ? null : `esperaba UNA factura y UN lote: ${JSON.stringify({ comp: s.n_comp, lotes: s.n_lotes })}`;
    return sinRastro(s);
  });
}
caso("D un insumo archivado: se rechaza y NO queda nada", () => {
  const s = escena({ insumo: "archivado" });
  return esperaError(s, 0, null, "archivado") ?? sinRastro(s);
});
caso("D quien no es líder no registra una compra con deuda: se rechaza y NO queda nada", () => {
  const s = escena({ como: "integrante" });
  return esperaError(s, 0, null, "Líder") ?? sinRastro(s);
});

// ---------------- E · DOBLE ENVÍO ----------------
caso("E1 el mismo envío dos veces (mismo token): una sola factura y un solo lote", () => {
  const s = escena({ llamadas: [{ token: "nuevo" }, { token: "mismo" }] });
  if (!ok(s, 0) || !ok(s, 1)) return JSON.stringify(s.r);
  if (s.n_comp !== 1 || s.n_lotes !== 1 || s.n_movs !== 1) return `facturas ${s.n_comp}, lotes ${s.n_lotes}, movimientos ${s.n_movs}`;
});
caso("E2 el mismo token con otro contenido: token_reusado y no se suma nada", () => {
  const s = escena({ llamadas: [{ token: "nuevo" }, { token: "mismo", cantidad: 99 }] });
  if (!ok(s, 0)) return JSON.stringify(s.r);
  const e = esperaError(s, 1, "token_reusado");
  if (e) return e;
  if (s.n_comp !== 1 || s.n_lotes !== 1) return `facturas ${s.n_comp}, lotes ${s.n_lotes}`;
});

// ---------------- F · LA FORMA ----------------
caso("F1 una sola función, anon no la ejecuta y authenticated sí", () => {
  const salida = psql(`begin;\n${MIGRACION}
select (select count(*) from pg_proc where proname = 'recibir_insumo_comprado' and pronamespace = 'retail'::regnamespace)::text
  || ',' || has_function_privilege('anon', (select oid from pg_proc where proname = 'recibir_insumo_comprado' and pronamespace = 'retail'::regnamespace), 'execute')::text
  || ',' || has_function_privilege('authenticated', (select oid from pg_proc where proname = 'recibir_insumo_comprado' and pronamespace = 'retail'::regnamespace), 'execute')::text;
rollback;`).split("\n").filter(Boolean).at(-1);
  if (salida !== "1,false,true") return salida;
});
caso("F2 recibir_insumo (saldo inicial y «Encontré tela») sigue igual: ni la migración lo toca", () => {
  const salida = psql(`select md5(pg_get_functiondef('retail.recibir_insumo(uuid,uuid,numeric,numeric,text,uuid,text,text,text,uuid)'::regprocedure));`).split("\n").at(-1);
  const despues = psql(`begin;\n${MIGRACION}\nselect md5(pg_get_functiondef('retail.recibir_insumo(uuid,uuid,numeric,numeric,text,uuid,text,text,text,uuid)'::regprocedure));\nrollback;`).split("\n").filter(Boolean).at(-1);
  if (salida !== despues) return "la migración cambió recibir_insumo";
});
caso("F3 la migración se puede pegar dos veces", () => {
  const salida = psql(`begin;\n${MIGRACION}\n${MIGRACION}
select count(*) from pg_proc where proname = 'recibir_insumo_comprado' and pronamespace = 'retail'::regnamespace;
rollback;`).split("\n").filter(Boolean).at(-1);
  if (salida !== "1") return `funciones ${salida}`;
});

console.log(fallas ? `\n${fallas} de ${total} en rojo.` : `\n${total}/${total} pruebas en verde.`);
process.exit(fallas ? 1 : 0);
