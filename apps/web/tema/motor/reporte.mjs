// Arma el reporte de una corrida: lo que está MAL SOLO en oscuro es lo urgente (lo rompió el tema); lo que ya estaba mal en claro
// se anota aparte, porque no es culpa del oscuro y se arregla cuando toque esa pantalla (ADR-0336).

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const linea = (h) => `  - **${h.ratio}** (mín. ${h.umbral}) «${h.texto}» ${h.color} sobre ${h.fondo}${h.imagen ? " ⚠ sobre imagen o degradado" : ""} — \`${h.donde}\``;

export function resumirVisita(v) {
  const claves = new Set(v.claro?.contrastes.map((h) => h.clave) ?? []);
  const soloOscuro = v.oscuro.contrastes.filter((h) => !claves.has(h.clave));
  const heredados = v.oscuro.contrastes.filter((h) => claves.has(h.clave));
  const solucionados = v.claro ? v.claro.contrastes.filter((h) => !v.oscuro.contrastes.some((o) => o.clave === h.clave)).length : 0;
  return { soloOscuro, heredados, solucionados, manchas: v.oscuro.manchas, velos: v.oscuro.velos };
}

export function escribirReporte(dirSalida, visitas, meta) {
  mkdirSync(dirSalida, { recursive: true });
  const filas = [];
  const detalle = [];
  let hallazgos = 0;
  for (const v of visitas) {
    const nombre = `${v.cuenta} · ${v.titulo}`;
    if (v.estado !== "ok") {
      filas.push(`| ${v.cuenta} | ${v.titulo} | ${v.estado} | | | | |`);
      continue;
    }
    const r = resumirVisita(v);
    const malos = r.soloOscuro.length + r.manchas.length + r.velos.length;
    hallazgos += malos;
    filas.push(`| ${v.cuenta} | ${v.titulo} | ${malos ? "❌" : "✅"} | ${r.soloOscuro.length} | ${r.manchas.length} | ${r.velos.length} | ${r.heredados.length} |`);
    const verHeredados = meta.heredados && r.heredados.length;
    if (malos || v.errores.length || verHeredados) {
      detalle.push(`### ${nombre}\n`);
      if (v.captura) detalle.push(`Captura: \`${v.captura}\`\n`);
      if (r.soloOscuro.length) detalle.push(`**Contraste que solo falla en oscuro (${r.soloOscuro.length}):**\n${r.soloOscuro.slice(0, 25).map(linea).join("\n")}\n`);
      if (verHeredados) detalle.push(`**Heredados del claro (${r.heredados.length}; también fallan en claro, pero en oscuro hay que verlos igual):**\n${[...r.heredados].sort((a, b) => a.ratio - b.ratio).slice(0, 30).map(linea).join("\n")}\n`);
      if (r.manchas.length) detalle.push(`**Manchas claras (${r.manchas.length}):**\n${r.manchas.slice(0, 15).map((m) => `  - ${m.fondo} ${m.tam} — \`${m.donde}\``).join("\n")}\n`);
      if (r.velos.length) detalle.push(`**Velos que aclaran (${r.velos.length}):**\n${r.velos.map((m) => `  - ${m.fondo} sobre una página ${m.pagina} — \`${m.donde}\``).join("\n")}\n`);
      if (v.errores.length) detalle.push(`**Errores de consola:** ${v.errores.slice(0, 4).map((e) => "`" + e.slice(0, 120) + "`").join(" · ")}\n`);
    }
  }
  const md = [
    `# Auditoría del modo oscuro — ${meta.cuando}`,
    "",
    `Base: ${meta.baseUrl} · viewport ${meta.ancho}×${meta.alto} · ${visitas.length} visitas · **${hallazgos} hallazgos solo en oscuro**`,
    "",
    "«Solo en oscuro» = falla en oscuro y NO en claro (lo rompió el tema). «Heredados» = ya fallaba en claro (no es culpa del oscuro).",
    "",
    "| Cuenta | Pantalla | | Contraste solo oscuro | Manchas | Velos | Heredados |",
    "|---|---|---|---|---|---|---|",
    ...filas,
    "",
    ...detalle,
  ].join("\n");
  writeFileSync(join(dirSalida, "reporte.md"), md);
  writeFileSync(join(dirSalida, "reporte.json"), JSON.stringify({ meta, visitas }, null, 1));
  return { hallazgos, md };
}
