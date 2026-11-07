// Junta las frases (5+ palabras, fuera de tablas, botones y campos) de cada pantalla, sin repetir.
import { readFileSync, writeFileSync } from "node:fs";
const t = JSON.parse(readFileSync("texto.json", "utf8"));
const vistas = new Set();
const porRuta = [];
for (const { ruta, bloques } of t) {
  const frases = [];
  for (const b of bloques ?? []) {
    if (b.palabras < 5 || b.en.tabla || b.en.boton || b.en.campo || b.en.cabecera) continue;
    if (b.mayus) continue;
    const texto = b.texto.replace(/\s+/g, " ").trim();
    // Lo que cambia por dato (montos, fechas) se repite con otro número: se agrupa por su forma.
    const forma = texto.replace(/\d[\d.,:]*/g, "#");
    if (vistas.has(forma)) continue;
    vistas.add(forma);
    const tipo = b.en.nota ? "nota" : b.en.aviso ? "aviso" : b.en.vacio ? "vacio" : b.en.cifra ? "cifra" : "frase";
    frases.push({ texto, px: b.px, palabras: b.palabras, tipo, guia: b.en.guia ?? null });
  }
  if (frases.length) porRuta.push({ ruta, frases });
}
writeFileSync("inventario.json", JSON.stringify(porRuta, null, 1));
const n = porRuta.reduce((s, r) => s + r.frases.length, 0);
const p = porRuta.reduce((s, r) => s + r.frases.reduce((a, f) => a + f.palabras, 0), 0);
console.log(porRuta.length, "pantallas,", n, "frases únicas,", p, "palabras");
for (const r of porRuta.sort((a, b) => b.frases.length - a.frases.length)) console.log(r.frases.length.toString().padStart(3), r.ruta);
