// vivo.json (lectura pública de cayla.pe) + datos de la maqueta anterior (looks y tiendas, 2026-11-05) → premium/datos.js
const fs = require("fs");
const path = require("path");
const vivoP = path.join(__dirname, "vivo.json"), previoP = path.join(__dirname, "../../tienda-rediseno-2026-11/datos.js"), outP = path.join(__dirname, "../premium/datos.js");
const V = JSON.parse(fs.readFileSync(vivoP, "utf8"));
const prev = new Function(fs.readFileSync(previoP, "utf8") + ";return {LOGO,LOOKS,SEDES,PRENDAS}")();
const MENU = [["arriba","Blusas/Tops","ropa"],["vestidos","Vestidos/Conjuntos","ropa"],["abajo","Pantalones/Faldas","ropa"],["encima","Chompas/Abrigos","ropa"],["bolsos","Bolsos/Cinturones","accesorios"],["cabeza","Lentes/Gorros/Pañuelos","accesorios"],["bisuteria","Bisutería/Belleza","accesorios"],["mas","Otros accesorios","accesorios"]];
const CATS = [["CMS","Camisas y Blusas","arriba"],["TOP","Tops","arriba"],["POL","Polos","arriba"],["BOD","Bodys","arriba"],["COR","Corsets","arriba"],["VES","Vestidos","vestidos"],["CON","Conjuntos","vestidos"],["ENT","Enterizos","vestidos"],["PAN","Pantalones","abajo"],["JEA","Jeans","abajo"],["FAL","Faldas","abajo"],["SHO","Shorts","abajo"],["CHA","Chalecos","encima"],["CAS","Casacas","encima"],["BLZ","Blazers","encima"],["CAR","Bolsos y Carteras","bolsos"],["CIN","Cinturones","bolsos"],["GOR","Gorros y Sombreros","cabeza"],["ARE","Aretes","bisuteria"],["COL","Collares","bisuteria"],["ACC","Accesorios de moda","mas"]];
const num = s => s ? Number(String(s).replace(/[^\d.]/g, "")) : null;
const byId = new Map();
const sedes = ["trujillo", "arequipa", "lima"];
for (const sede of sedes) for (const lista of ["todo", "nuevo", "ofertas", "vendidos"]) {
  (V.listas[`${sede}:${lista}`] || []).forEach((c, i) => {
    let x = byId.get(c.id);
    if (!x) { x = { id: c.id, n: c.n, cat: c.cat, p: num(c.precio), a: num(c.antes), desde: /desde/i.test(c.precio), oferta: c.oferta, fotos: [], co: c.colores.map(k => ({ n: k.n, h: k.h })), mas: c.masColores ? Number(c.masColores.replace(/\D/g, "")) : 0, s: {}, ins: c.insignias, nuevo: false, vend: null, ofe: false }; byId.set(c.id, x); }
    for (const f of c.fotos) if (!x.fotos.includes(f)) x.fotos.push(f);
    if (lista === "todo" || !(sede in x.s)) x.s[sede] = c.nota;
    if (lista === "nuevo") x.nuevo = true;
    if (lista === "vendidos" && sede === "trujillo") x.vend = i + 1;
    if (lista === "ofertas") x.ofe = true;
  });
}
const limpia = u => { if (!u) return null; const m = /fotos(?:%2F|\/)([^?&"]+\.(?:png|jpe?g|webp))/i.exec(u) || /recorte\/([^?]+)/.exec(u); return m ? decodeURIComponent(m[1]).split(/%2F|\//).pop() : null; };
const prendas = [...byId.values()].map(x => {
  const f = V.fichas[x.id] || {};
  let fotos = [...new Set([...x.fotos, ...(f.fotos || [])].map(limpia).filter(Boolean))];
  if (!fotos.length) { const v = prev.PRENDAS.find(y => y.n.toLowerCase() === x.n.toLowerCase()); if (v) fotos = v.fo.slice(); }
  const cat = CATS.find(c => c.slice(1, 2)[0] === x.cat) || null;
  const texto = f.texto || "";
  const desc = (texto.split(/\n/).find(l => l.length > 60 && !/Separas|Recoges|Cambias/.test(l)) || "").trim();
  return { ...x, pre: cat?.[0] || null, g: cat?.[2] || (x.cat && /arete|collar|cinturon|bolso|gorro/i.test(x.cat) ? "mas" : "otras"), fotos, pct: x.a && x.p ? Math.round((1 - x.p / x.a) * 100) : null,
    t: (f.tallas || []).map(t => t.t.split("\n")[0].trim()).filter(Boolean), tOff: (f.tallas || []).filter(t => t.off || /Agotad/i.test(t.t)).map(t => t.t.split("\n")[0].trim()), coF: [], desc, fichaTexto: texto.slice(0, 1200) };
});
const out = `// Datos reales leídos de cayla.pe (solo lectura, ${V.fecha.slice(0, 10)}): prendas, precios, ofertas, colores, tallas y disponibilidad por tienda.
// Looks y datos de las tiendas: de la maqueta del 2026-11-05 (también de producción). Nada de esto se escribe en ningún lado.
window.CAYLA = ${JSON.stringify({ fecha: V.fecha, logo: prev.LOGO, grupos: MENU.map(([clave, nombre, menu]) => ({ clave, nombre, menu })), categorias: CATS.map(([pre, n, g]) => ({ pre, n, g })), prendas, looks: prev.LOOKS, sedes: prev.SEDES, portada: V.portada, legal: fs.existsSync(path.join(__dirname, "legal.json")) ? JSON.parse(fs.readFileSync(path.join(__dirname, "legal.json"), "utf8")) : null })};
`;
fs.writeFileSync(outP, out);
console.log("prendas", prendas.length, "con tallas", prendas.filter(p => p.t.length).length, "ofertas", prendas.filter(p => p.ofe).length, "kb", Math.round(out.length / 1024));
