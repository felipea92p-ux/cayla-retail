// HERRAMIENTA DE LA MAQUETA — una «base» de mentira para la página de prueba de Apartados. No guarda nada y no toca ninguna base real.
// Uso:  node base-de-mentira.mjs   (escucha en 127.0.0.1:3084)
// y la web se levanta apuntando aquí:  NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:3084  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_prueba
// Responde solo lo que el módulo llama: quién está de turno, apartar, entregar, devolver… Lo demás contesta «no existe» (la pantalla lo tolera).
// Además guarda en ./congelado/<nombre>.html lo que el navegador le mande a /guardar/<nombre> (ver congelar-en-el-navegador.js).
import http from "node:http";
import fs from "node:fs";

let ultimo = null;
const turno = [
  { persona_id: "p-1", nombre_corto: "Micaela", estado_ahora: "presente", es_de_esta_sede: true },
  { persona_id: "p-2", nombre_corto: "Rosa", estado_ahora: "presente", es_de_esta_sede: true },
  { persona_id: "p-3", nombre_corto: "Camila", estado_ahora: "en_pausa", es_de_esta_sede: true },
];
const PRECIOS = { "v-1": ["BLU-0001", "Blusa Emma", 89.9], "v-2": ["BLU-0002", "Blusa Emma", 89.9], "v-4": ["PAN-0004", "Pantalón Lía", 129.9], "v-5": ["PAN-0005", "Pantalón Lía", 129.9], "v-6": ["VES-0006", "Vestido Aurora", 159.9], "v-7": ["CAS-0007", "Casaca Nube", 219.9], "v-8": ["FAL-0008", "Falda Sol", 99.9], "v-9": ["CHO-0009", "Chompa Alma", 139.9], "v-10": ["POL-0010", "Polo Río", 49.9] };
/** El apartado recién «guardado», armado con lo que mandó la pantalla: así la hoja «Apartado registrado» muestra los datos escritos. */
const fila = (b) => {
  const items = (b.p_items ?? []).map((i, k) => { const [sku, referencia, precio] = PRECIOS[i.variante_id] ?? ["?", "Prenda", 0]; return { id: `n${k}`, variante_id: i.variante_id, sku, referencia, cantidad: i.cantidad ?? 1, precio_unitario: precio, descuento_unitario: i.descuento_unitario ?? 0 }; });
  const total = Math.round(items.reduce((s, i) => s + (i.precio_unitario - i.descuento_unitario) * i.cantidad, 0) * 100) / 100;
  const adelanto = Math.round((b.p_pagos ?? []).reduce((s, p) => s + Number(p.monto ?? 0), 0) * 100) / 100;
  return { id: "a-99", codigo: "APT-TRU-0042", estado: "abierta", clienta_nombres: b.p_clienta_nombres, clienta_apellidos: b.p_clienta_apellidos, clienta_celular: b.p_clienta_celular ?? "", clienta_dni: b.p_clienta_dni ?? null, asesora: "Micaela", total, adelanto, saldo: Math.round((total - adelanto) * 100) / 100, vence_el: "2026-12-03", extensiones: 0, creada_en: new Date().toISOString(), devolucion_medio: b.p_devolucion_medio ?? "yape", devolucion_numero: b.p_devolucion_numero ?? null, liberada_sola: false, estante: "A-07", items, pagos: (b.p_pagos ?? []).map((p) => ({ metodo: p.metodo, monto: p.monto, fecha: new Date().toISOString(), abono: false })) };
};
const escrituras = new Set(["abonar_separacion", "aplazar_separacion", "liberar_separacion", "registrar_aviso_separacion", "guardar_opciones_apartados", "editar_separacion", "editar_separacion_con_total", "marcar_separacion_enviada", "enviar_pedido_para_apartar", "cancelar_pedido_para_apartar"]);

http.createServer((req, res) => {
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*", "Access-Control-Expose-Headers": "*" };
  if (req.method === "OPTIONS") return res.writeHead(204, cors).end();
  let cuerpo = "";
  req.on("data", (c) => (cuerpo += c));
  req.on("end", () => {
    const json = (estado, x) => res.writeHead(estado, { ...cors, "Content-Type": "application/json" }).end(JSON.stringify(x));
    const g = req.url.match(/^\/guardar\/([a-z0-9-]+)$/);
    if (g) {
      fs.mkdirSync(new URL("./congelado/", import.meta.url), { recursive: true });
      fs.writeFileSync(new URL(`./congelado/${g[1]}.html`, import.meta.url), cuerpo);
      return json(200, { ok: g[1], kb: Math.round(cuerpo.length / 1024) });
    }
    const m = req.url.match(/\/rest\/v1\/rpc\/([a-z_]+)/);
    if (!m) return json(404, { message: "base de prueba: no existe" });
    let b = {};
    try { b = JSON.parse(cuerpo || "{}"); } catch { /* cuerpo vacío */ }
    const f = m[1];
    if (f !== "fn_asesoras_de_turno") console.log(new Date().toISOString().slice(11, 19), f, cuerpo.slice(0, 300));
    if (f === "fn_asesoras_de_turno") return json(200, turno);
    if (f === "separar_prendas") { ultimo = b; return json(200, "a-99"); }
    if (f === "buscar_separaciones") return json(200, ultimo && b.p_texto === "a-99" ? [fila(ultimo)] : []);
    if (f === "entregar_separacion") return json(200, "venta-1");
    if (f === "registrar_devolucion_separacion") return json(200, { aviso: null });
    if (escrituras.has(f)) return json(200, null);
    return json(404, { code: "PGRST202", message: "base de prueba: función no simulada" });
  });
}).listen(3084, "127.0.0.1", () => console.log("base de prueba en http://127.0.0.1:3084"));
