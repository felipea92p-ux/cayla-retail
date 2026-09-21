// Supabase FALSO para ver y probar el Inicio sin Docker. Solo localhost, solo datos de demostración.
// Imita lo mínimo de Auth (/auth/v1/user) y PostgREST (/rest/v1/...) que pide Inicio. NO es la base real:
// no prueba RLS ni que las RPC devuelvan lo mismo; solo que la pantalla hace lo que su código dice con estos datos.
//
// Uso (ver docs/pantallas/inicio-traspaso.md):
//   node scripts/demo/supabase-falso.mjs        → escucha en http://localhost:54399
//   apps/web/.env.local:  NEXT_PUBLIC_SUPABASE_URL=http://localhost:54399
//                         NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=demo-publishable-key
//
// Controles (GET, se cambian en vivo):
//   /__mock/cookie                        → la cookie de sesión de demostración (nombre y valor)
//   /__mock/rol?r=lider|integrante|taller → quién mira (líder en tienda, colaboradora en tienda, líder en el Taller)
//   /__mock/caja?abierta=0|1              → caja cerrada o abierta
//   /__mock/falla?que=ventas,traslados,movimientos → simula que esas lecturas se caen (vacío = todo bien)
import http from "node:http";
import crypto from "node:crypto";

const PUERTO = 54399;
const CENTINELA = "22222222-2222-4222-8222-222222222222";
const UBI_TRU = "aaaaaaaa-0000-4000-8000-00000000a001";
const UBI_LIM = "aaaaaaaa-0000-4000-8000-00000000a002";
const UBI_TALLER = "aaaaaaaa-0000-4000-8000-00000000a003";
const USER_ID = "bbbbbbbb-0000-4000-8000-00000000b001";

// ── Datos de demostración (con «basura» a propósito para probar los filtros de Inicio) ──
// 45 productos activos + 6 descontinuados = 51. El Inicio viejo mostraba 51; el nuevo, 45.
const productos = [
  ...Array.from({ length: 45 }, (_, i) => ({ id: `p-act-${i}`, estado: "activo" })),
  ...Array.from({ length: 6 }, (_, i) => ({ id: `p-desc-${i}`, estado: "descontinuado" })),
];
// 164 variantes vigentes + 5 inactivas + la centinela = 170. Viejo: 170; nuevo: 164.
const variantes = [
  ...Array.from({ length: 164 }, (_, i) => ({ id: `v-${i}`, activo: true })),
  ...Array.from({ length: 5 }, (_, i) => ({ id: `v-off-${i}`, activo: false })),
  { id: CENTINELA, activo: true },
];
// Stock de Tienda TRU: 21 filas × 15 unidades = 315, más la centinela (999.999) que se excluye.
const stock = [
  ...Array.from({ length: 21 }, (_, i) => ({ variante_id: `v-${i}`, ubicacion_id: UBI_TRU, cantidad: 15 })),
  { variante_id: CENTINELA, ubicacion_id: UBI_TRU, cantidad: 999999 },
  { variante_id: "v-1", ubicacion_id: UBI_LIM, cantidad: 40 },
];
const ubicaciones = [
  { id: UBI_LIM, nombre: "Tienda Lima", tipo: "tienda", activo: true, meta_venta_diaria: null },
  { id: UBI_TRU, nombre: "Tienda TRU", tipo: "tienda", activo: true, meta_venta_diaria: 1500 },
  { id: UBI_TALLER, nombre: "Taller Lima", tipo: "taller", activo: true, meta_venta_diaria: null },
];
// Estado que se cambia en vivo: /__mock/rol?r=lider|integrante|taller · /__mock/caja?abierta=0|1 · /__mock/falla?que=ventas,traslados,movimientos
const estado = { rol: "lider", cajaAbierta: true, fallas: new Set() };
const VENTAS_LIDER = [220, 90, 160, 140, 180, 120, 200, 130]; // suma 1.240
const VENTAS_INTEGRANTE = [160, 120, 130]; // suma 410
const hoyIso = new Date().toISOString();
const ayerIso = new Date(Date.now() - 86400e3).toISOString();
const transferencias = [
  { estado: "en_transito", ubicacion_origen_id: UBI_LIM, ubicacion_destino_id: UBI_TRU, fecha_estimada_llegada: hoyIso, confirmado_en: null },
  { estado: "en_transito", ubicacion_origen_id: UBI_LIM, ubicacion_destino_id: UBI_TRU, fecha_estimada_llegada: ayerIso, confirmado_en: null },
];

function fila(n, d) {
  return {
    id: `m-${n}`, created_at: `2026-09-21T1${n % 10}:00:00Z`, fecha_lima: d.fecha, hora: `1${n % 10}:00`,
    tipo: d.tipo, categoria: d.categoria, motivo: d.motivo, cantidad: d.cantidad, delta: d.delta,
    es_sistema: false, nota: null, variante_id: `v-${n}`, sku: d.sku, referencia: d.referencia, talla: null, color: null,
    ubicacion_id: UBI_TRU, ubicacion_nombre: "Tienda TRU", ubicacion_destino_id: null, ubicacion_destino_nombre: null,
    sububicacion_id: null, sububicacion_nombre: null, sububicacion_tipo: null,
    sububicacion_destino_id: null, sububicacion_destino_nombre: null, sububicacion_destino_tipo: null,
    usuario_id: null, usuario_nombre: null, venta_id: null, venta_nota: null,
    comprobante_tipo: null, comprobante_numero: null, comprobante_estado: null,
    lote_id: null, lote_guia: null, lote_nota: null, proveedor_nombre: null,
    compra_id: null, compra_documento: null, transferencia_id: null,
  };
}
const movs = [
  fila(9, { fecha: "2026-09-21", tipo: "salida", categoria: "salida", motivo: "venta", cantidad: 1, delta: -1, sku: "PANTALONMILA-28-NAR", referencia: "Pantalón Milagros" }),
  fila(8, { fecha: "2026-09-21", tipo: "salida", categoria: "salida", motivo: "venta", cantidad: 1, delta: -1, sku: "CASACAEMILIA-L-VER", referencia: "Casaca Emilia" }),
  fila(7, { fecha: "2026-09-21", tipo: "ajuste", categoria: "ajuste", motivo: "merma", cantidad: 1, delta: -1, sku: "BLUSAXIMENA-L-NEG", referencia: "Blusa Ximena" }),
  fila(6, { fecha: "2026-09-20", tipo: "entrada", categoria: "entrada", motivo: "recepcion", cantidad: 12, delta: 12, sku: "CASACAEMILIA-M-VER", referencia: "Casaca Emilia" }),
  fila(5, { fecha: "2026-09-20", tipo: "traslado", categoria: "transferencia", motivo: "traslado_entrada", cantidad: 3, delta: 3, sku: "CASACAEMILIA-L-BLA", referencia: "Casaca Emilia" }),
  fila(4, { fecha: "2026-09-19", tipo: "salida", categoria: "salida", motivo: "venta", cantidad: 2, delta: -2, sku: "CASACAEMILIA-L-BLA", referencia: "Casaca Emilia" }),
];

// ── Sesión de demostración ──
const b64u = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
const exp = 4102444800; // año 2100
const jwt = (() => {
  const h = b64u({ alg: "HS256", typ: "JWT" });
  const p = b64u({ sub: USER_ID, aud: "authenticated", role: "authenticated", email: "demo@cayla.local", exp, iat: 1758400000, session_id: "s1" });
  const s = crypto.createHmac("sha256", "demo-secret").update(`${h}.${p}`).digest("base64url");
  return `${h}.${p}.${s}`;
})();
const usuario = { id: USER_ID, aud: "authenticated", role: "authenticated", email: "demo@cayla.local", app_metadata: {}, user_metadata: {}, created_at: "2026-09-01T00:00:00Z" };
const sesion = { access_token: jwt, refresh_token: "demo-refresh", token_type: "bearer", expires_in: 999999999, expires_at: exp, user: usuario };
const cookie = `base64-${b64u(sesion)}`;

const cajas = () => (estado.cajaAbierta ? [{ id: "caja-1", ubicacion_id: UBI_TRU, monto_apertura: 100, abierta_en: "2026-09-21T14:12:00Z", abierta_por: USER_ID, estado: "abierta" }] : []);
const ventasSemPasada = [{ id: "sp1", estado: "completada", ubicacion_id: UBI_TRU }, { id: "sp2", estado: "completada", ubicacion_id: UBI_TRU }, { id: "sp3", estado: "completada", ubicacion_id: UBI_TRU }];
const ventaPagosSemPasada = [{ monto: 980 }];
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", "access-control-expose-headers": "content-range" };

function filtrar(filas, params) {
  let r = filas;
  for (const [k, v] of params) {
    if (["select", "order", "limit", "offset"].includes(k)) continue;
    const m = /^(eq|neq)\.(.*)$/.exec(v);
    if (m) r = r.filter((x) => (m[1] === "eq" ? String(x[k]) === m[2] : String(x[k]) !== m[2]));
    else if (v.startsWith("in.")) { const lista = v.slice(4, -1).split(","); r = r.filter((x) => lista.includes(String(x[k]))); }
  }
  return r;
}
const TABLAS = { productos, variantes, stock, ubicaciones, get transferencias() { return transferencias; }, get cajas() { return cajas(); }, ventas: ventasSemPasada, venta_pagos: ventaPagosSemPasada };

http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PUERTO}`);
  const send = (status, body, extra = {}) => { res.writeHead(status, { "content-type": "application/json", ...CORS, ...extra }); res.end(body === undefined ? "" : JSON.stringify(body)); };
  console.log(req.method, url.pathname + url.search.slice(0, 120));
  if (req.method === "OPTIONS") return send(204);

  if (url.pathname === "/__mock/cookie") return send(200, { nombre: "sb-localhost-auth-token", valor: cookie });
  if (url.pathname === "/__mock/rol") { estado.rol = url.searchParams.get("r") ?? "lider"; return send(200, { rol: estado.rol }); }
  if (url.pathname === "/__mock/caja") { estado.cajaAbierta = url.searchParams.get("abierta") !== "0"; return send(200, { cajaAbierta: estado.cajaAbierta }); }
  if (url.pathname === "/__mock/falla") { estado.fallas = new Set((url.searchParams.get("que") ?? "").split(",").filter(Boolean)); return send(200, { fallas: [...estado.fallas] }); }
  if (url.pathname === "/auth/v1/user") return send(200, usuario);
  if (url.pathname === "/auth/v1/.well-known/jwks.json") return send(200, { keys: [] });

  const rpc = /^\/rest\/v1\/rpc\/(\w+)$/.exec(url.pathname);
  if (rpc) {
    const unico = (req.headers.accept ?? "").includes("vnd.pgrst.object");
    const fila1 = (o) => send(200, unico ? o : [o]);
    if (rpc[1] === "fn_persona_actual_resumen") {
      if (estado.rol === "integrante") return fila1({ nombre: "Ana Demo", es_lider: false, ubicacion_id: UBI_TRU, ubicacion_nombre: "Tienda TRU", ubicacion_tipo: "tienda" });
      if (estado.rol === "taller") return fila1({ nombre: "Ana Demo", es_lider: true, ubicacion_id: UBI_TALLER, ubicacion_nombre: "Taller Lima", ubicacion_tipo: "taller" });
      return fila1({ nombre: "Ana Demo", es_lider: true, ubicacion_id: UBI_TRU, ubicacion_nombre: "Tienda TRU", ubicacion_tipo: "tienda" });
    }
    if (rpc[1] === "fn_movimientos") {
      if (estado.fallas.has("movimientos")) return send(500, { message: "falla simulada de fn_movimientos", code: "XX000" });
      return send(200, movs);
    }
    if (rpc[1] === "fn_ventas_del_dia") {
      if (estado.fallas.has("ventas")) return send(500, { message: "falla simulada de fn_ventas_del_dia", code: "XX000" });
      const tot = estado.rol === "integrante" ? VENTAS_INTEGRANTE : VENTAS_LIDER;
      return send(200, tot.map((total, i) => ({ venta_id: "vd-" + i, hora: "1" + i + ":00", vendedor: "Ana Demo", metodos_pago: "efectivo", total, nota: null })));
    }
    if (rpc[1] === "fn_nombres_personas") return send(200, [{ id: USER_ID, nombre: "Ana Demo" }]);
    return send(200, []);
  }

  const tabla = /^\/rest\/v1\/(\w+)$/.exec(url.pathname);
  if (tabla) {
    if (tabla[1] === "transferencias" && estado.fallas.has("traslados")) return send(500, { message: "falla simulada de transferencias", code: "XX000" });
    const filas = tabla[1] === "venta_pagos" ? ventaPagosSemPasada : filtrar(TABLAS[tabla[1]] ?? [], url.searchParams);
    if ((req.headers.accept ?? "").includes("vnd.pgrst.object")) {
      if (filas.length === 1) return send(200, filas[0]);
      return send(406, { code: "PGRST116", details: "The result contains " + filas.length + " rows", hint: null, message: "JSON object requested, multiple (or no) rows returned" });
    }
    if (req.method === "HEAD") return send(200, undefined, { "content-range": `${filas.length ? `0-${filas.length - 1}` : "*"}/${filas.length}` });
    return send(200, filas, { "content-range": `0-${Math.max(filas.length - 1, 0)}/${filas.length}` });
  }
  send(200, []);
}).listen(PUERTO, () => console.log(`Supabase FALSO en http://localhost:${PUERTO}`));
