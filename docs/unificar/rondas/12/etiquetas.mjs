// Lector de etiquetas de apertura JSX que respeta llaves y comillas (el de guias/escaner.mjs) y busca atributos al nivel 0.
export function aperturaDesde(texto, i) {
  let llaves = 0, comilla = null;
  for (let j = i + 1; j < texto.length && j < i + 6000; j++) {
    const c = texto[j];
    if (comilla) { if (c === comilla && texto[j - 1] !== "\\") comilla = null; continue; }
    if (c === '"' || c === "`") comilla = c;
    else if (c === "'" && llaves === 0) comilla = c;
    else if (c === "{") llaves++;
    else if (c === "}") llaves--;
    else if (c === ">" && llaves === 0) return { abre: texto.slice(i, j + 1), fin: j + 1 };
  }
  return null;
}
// Posiciones (dentro de la etiqueta) de los atributos de nivel 0: [{nombre, ini, fin, valor}]
export function atributos(tag) {
  const out = []; let llaves = 0, comilla = null;
  for (let j = 0; j < tag.length; j++) {
    const c = tag[j];
    if (comilla) { if (c === comilla && tag[j - 1] !== "\\") comilla = null; continue; }
    if (c === '"' || c === "`") { comilla = c; continue; }
    if (c === "{") { llaves++; continue; }
    if (c === "}") { llaves--; continue; }
    if (llaves === 0 && /\s/.test(tag[j - 1] ?? "") && /[A-Za-z]/.test(c)) {
      const m = tag.slice(j).match(/^([A-Za-z][\w-]*)(=)?/);
      if (!m) continue;
      const nombre = m[1];
      let fin = j + m[0].length, valor = null;
      if (m[2]) {
        const v0 = fin;
        if (tag[v0] === '"') { const k = tag.indexOf('"', v0 + 1); fin = k + 1; valor = tag.slice(v0 + 1, k); }
        else if (tag[v0] === "{") { let d = 0, q = null; for (let k = v0; k < tag.length; k++) { const ch = tag[k]; if (q) { if (ch === q && tag[k - 1] !== "\\") q = null; continue; } if (ch === '"' || ch === "`") q = ch; else if (ch === "{") d++; else if (ch === "}") { d--; if (d === 0) { fin = k + 1; break; } } } valor = tag.slice(v0, fin); }
      }
      out.push({ nombre, ini: j, fin, valor });
      j = fin - 1;
    }
  }
  return out;
}
