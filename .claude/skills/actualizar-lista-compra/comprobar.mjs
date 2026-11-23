// Comprueba que los JSON guardados (motor y gustos) cuadran con sus propias sumas de control.
// Uso: node comprobar.mjs <motor.json|-> <gustos.json|->
import { readFileSync, existsSync } from "node:fs";
const [, , fMotor, fGustos] = process.argv;
const n = (v) => (v == null || isNaN(+v) ? 0 : +v);
let mal = 0;
const mira = (que, a, b) => { const ok = Math.abs(n(a) - n(b)) < 1e-6; if (!ok) mal++; console.log((ok ? "  ok   " : "  MAL  ") + que + ": " + a + (ok ? "" : " <> control " + b)); };

if (fMotor && fMotor !== "-" && existsSync(fMotor)) {
  const m = JSON.parse(readFileSync(fMotor, "utf8"));
  const c = m.control || {};
  console.log("MOTOR", m.hoy, "| categorias", m.categorias.length, "| lista", m.lista.length, "| traslados", m.traslados.length, "| acabados", m.acabados.length, "| viene", m.viene.length);
  mira("v28", m.categorias.reduce((s, r) => s + n(r.v28), 0), c.v28);
  mira("hay", m.categorias.reduce((s, r) => s + n(r.hay), 0), c.hay);
  mira("comprar (categorias)", m.categorias.reduce((s, r) => s + n(r.comprar), 0), c.comprar);
  mira("producir (categorias)", m.categorias.reduce((s, r) => s + n(r.producir), 0), c.producir);
  mira("comprar (tiendas)", m.tiendas.reduce((s, r) => s + n(r.comprar), 0), c.comprar);
  mira("mover (categorias)", m.categorias.reduce((s, r) => s + n(r.mover), 0), c.mover);
  mira("mover (traslados entre tiendas)", m.traslados.filter((t) => t.de !== "Taller").reduce((s, r) => s + n(r.n), 0), c.mover);
  mira("por_registrar", m.categorias.reduce((s, r) => s + n(r.por_registrar), 0), c.por_registrar);
  mira("pedido", m.categorias.reduce((s, r) => s + n(r.pedido), 0), c.pedido);
  const lista = m.lista.reduce((s, r) => s + n(r.total), 0);
  console.log("  lista suma", lista, "| comprar+producir", n(c.comprar) + n(c.producir), lista === n(c.comprar) + n(c.producir) ? "(igual)" : "(la diferencia va sin color ni talla)");
  for (const r of m.lista) if (n(r.tru) + n(r.aqp) + n(r.lim) !== n(r.total)) { mal++; console.log("  MAL  fila de lista no suma:", JSON.stringify(r)); }
  for (const r of m.categorias) {
    const s = Object.values(r.sedes || {});
    if (s.reduce((a, x) => a + n(x.comprar), 0) !== n(r.comprar)) { mal++; console.log("  MAL  comprar por tienda no suma en", r.cat); }
  }
}
if (fGustos && fGustos !== "-" && existsSync(fGustos)) {
  const g = JSON.parse(readFileSync(fGustos, "utf8"));
  const c = g.control || {};
  const suma = (filas, campo, k) => filas.reduce((s, r) => s + (r[campo] || []).slice(0, k).reduce((a, x) => a + n(x), 0), 0);
  console.log("GUSTOS", g.hoy, "| colores", g.colores.length, "| colores_tipo", g.colores_tipo.length, "| tallas_tipo", g.tallas_tipo.length, "| telas", g.telas.length, "| rotacion", g.rotacion.length, "| semanas", g.semanas.length);
  mira("ventas 28 (colores)", suma(g.colores, "v", 3), c.ventas_28);
  mira("ventas 28 (tallas por tipo)", suma(g.tallas_tipo, "v", 3), c.ventas_28);
  mira("ventas 28 (dias)", suma(g.dias, "v", 3), c.ventas_28);
  mira("ventas 28 (registradas + sin registrar)", n(g.registradas_28) + n(g.sin_registrar_28), c.ventas_28);
  mira("ventas de todas las semanas", suma(g.semanas, "v", 3), c.ventas_todas);
  mira("stock (colores)", suma(g.colores, "h", 4), c.stock);
  mira("stock (tallas por tipo)", suma(g.tallas_tipo, "h", 4), c.stock);
  mira("stock (telas)", suma(g.telas, "h", 4), c.stock);
  mira("ventas 28 (rotacion)", g.rotacion.reduce((s, r) => s + n(r.v), 0), c.ventas_28);
  if (Array.isArray(g.modelos)) {
    console.log("  modelos", g.modelos.length);
    mira("ventas 28 con su prenda (modelos)", suma(g.modelos, "v", 3), g.registradas_28);
    mira("stock (modelos)", suma(g.modelos, "h", 4), c.stock);
  }
}
console.log(mal ? "RESULTADO: " + mal + " DESCUADRES" : "RESULTADO: todo cuadra");
process.exit(mal ? 1 : 0);
