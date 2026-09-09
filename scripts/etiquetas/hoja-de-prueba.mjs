/**
 * Genera una hoja para MEDIR si una etiqueta impresa se lee de verdad.
 *
 * POR QUÉ EXISTE. ADR-0025 justifica el código corto con una aritmética de módulos:
 * 40 caracteres dan ~1.2 puntos por módulo a 300 dpi y 14 dan ~3.1, contra una regla
 * de impresión térmica de ≥3. Esa cuenta nunca se verificó contra papel. Esto imprime
 * los tres casos juntos para poder mirarlos con un lector real.
 *
 * IMPORTA `barrasCode128` DE LA APP, no una copia. Lo que se imprime acá es byte por
 * byte lo que imprime `/inventario/etiquetas` — si algún día divergen, esta hoja deja
 * de medir lo que se quería medir.
 *
 *   node scripts/etiquetas/hoja-de-prueba.mjs
 */

import { writeFileSync } from "node:fs";
import { barrasCode128, puntosPorModulo } from "../../apps/web/lib/codigo128.ts";

// 62 mm es el ancho del rollo de la Brother QL; ~50 mm es el área útil real del
// código una vez descontados los márgenes de la etiqueta.
const ANCHO_UTIL_MM = 50;

const CASOS = [
  {
    texto: "BLU-0001-AZM-M",
    titulo: "Código corto de CAYLA",
    nota: "Lo que imprime la app desde hoy",
  },
  {
    texto: "7501234567890",
    titulo: "Código de fábrica adoptado",
    nota: "El EAN que ya trae la prenda — no hay que imprimir nada",
  },
  {
    texto: "BLUSA-MANGA-LARGA-ESCOTE-V-M-AZUL-MARINO",
    titulo: "El SKU largo de antes (control)",
    nota: "Así se imprimía hasta hoy. Es el caso que debería costar leer",
  },
];

const etiquetas = CASOS.map(({ texto, titulo, nota }) => {
  const barras = barrasCode128(texto);
  if (!barras) throw new Error(`Code 128 no puede con: ${texto}`);
  const puntos = puntosPorModulo(barras.total, ANCHO_UTIL_MM);
  const veredicto =
    puntos >= 3 ? ["holgado", "ok"] : puntos >= 2 ? ["al filo", "filo"] : ["debería fallar", "mal"];
  return { texto, titulo, nota, barras, puntos, veredicto };
});

const filas = etiquetas
  .map(
    (e) => `      <tr>
        <td>${e.titulo}</td>
        <td class="num">${e.texto.length}</td>
        <td class="num">${e.barras.total}</td>
        <td class="num">${e.puntos.toFixed(1)}</td>
        <td class="v ${e.veredicto[1]}">${e.veredicto[0]}</td>
      </tr>`
  )
  .join("\n");

const bloques = etiquetas
  .map(
    (e) => `  <section class="caso">
    <p class="caso-tit">${e.titulo}</p>
    <p class="caso-nota">${e.nota}</p>
    <div class="etiqueta">
      <p class="ref">Blusa Reflixme</p>
      <p class="detalle">M · Azul marino &nbsp;·&nbsp; S/ 79.00</p>
      <svg viewBox="0 0 ${e.barras.total} 1" preserveAspectRatio="none" shape-rendering="crispEdges" class="barras">
        <path d="${e.barras.d}" fill="#000"></path>
      </svg>
      <p class="codigo">${e.texto}</p>
    </div>
    <p class="medida">${e.barras.total} módulos · ${e.puntos.toFixed(1)} puntos por módulo a 300 dpi</p>
  </section>`
  )
  .join("\n");

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Hoja de prueba de etiquetas · CAYLA</title>
<style>
  :root { --tinta:#1a1a18; --crema:#f5f0e8; --sand:#e8e0d0; --rojo:#b8412d; --verde:#556e49; --ambar:#8c631f; }
  * { box-sizing: border-box; }
  body { margin:0; padding:24px; background:var(--crema); color:var(--tinta);
         font:15px/1.55 "DM Sans", system-ui, sans-serif; }
  .hoja { max-width: 44rem; margin: 0 auto; }
  h1 { font: 500 30px/1.15 Georgia, serif; margin:0 0 6px; }
  .bajada { color:#5b544c; margin:0 0 22px; max-width:52ch; }
  table { border-collapse: collapse; width:100%; margin: 0 0 26px; font-size:14px; }
  th { text-align:left; font-size:11px; letter-spacing:.12em; text-transform:uppercase;
       color:#805c4c; font-weight:500; padding:0 8px 6px 0; border-bottom:1px solid var(--sand); }
  td { padding:7px 8px 7px 0; border-bottom:1px solid var(--sand); }
  td.num { text-align:right; font-variant-numeric:tabular-nums; font-family:ui-monospace,monospace; }
  td.v { font-weight:500; }
  .ok { color:var(--verde); } .filo { color:var(--ambar); } .mal { color:var(--rojo); }

  .caso { margin: 0 0 26px; }
  .caso-tit { font:500 17px/1.2 Georgia, serif; margin:0 0 2px; }
  .caso-nota { color:#5b544c; font-size:13px; margin:0 0 10px; }

  /* La etiqueta al TAMAÑO FÍSICO REAL del rollo: 62 x 29 mm. No cambiar. */
  .etiqueta { width:62mm; height:29mm; background:#fff; border:1px solid var(--sand);
              padding:2mm 6mm; display:flex; flex-direction:column; justify-content:center; }
  .ref { font:600 9pt/1.15 "DM Sans", sans-serif; margin:0; color:#000; }
  .detalle { font:7pt/1.2 "DM Sans", sans-serif; margin:.4mm 0 1mm; color:#000; }
  .barras { width:100%; height:11mm; display:block; }
  .codigo { font:6.5pt/1 ui-monospace, monospace; letter-spacing:.06em; text-align:center;
            margin:.7mm 0 0; color:#000; }
  .medida { font-size:12px; color:#5b544c; margin:6px 0 0; font-variant-numeric:tabular-nums; }

  .aviso { border-left:3px solid var(--rojo); background:#fbf8f2; padding:14px 16px; margin:0 0 24px; }
  .aviso p { margin:0 0 6px; font-size:14px; } .aviso p:last-child { margin:0; }
  ol { padding-left:18px; } ol li { margin-bottom:7px; }

  @media print {
    body { background:#fff; padding:0; }
    .no-imprimir { display:none; }
    .etiqueta { border:1px dashed #bbb; }
    @page { margin: 10mm; }
  }
</style>
</head>
<body>
<div class="hoja">
  <h1>¿Se lee la etiqueta?</h1>
  <p class="bajada">Las tres etiquetas de abajo están al tamaño físico real del rollo de la
    Brother QL (62 × 29 mm) y usan el mismo generador de código de barras que la app.</p>

  <div class="aviso no-imprimir">
    <p><strong>Ojo con dónde imprimís.</strong> La cuenta de abajo asume 300 dpi, que es la
      Brother QL. Una impresora láser común tiene 600 dpi y dibuja el doble de fino, así que
      <strong>ahí hasta el código largo va a leerse</strong> y la prueba no dice nada.</p>
    <p>Para medir la densidad de verdad hay que imprimir en la Brother. Leer desde la pantalla
      sí sirve, pero para otra cosa: comprueba que el código está bien construido y decodifica
      al texto correcto.</p>
  </div>

  <table>
    <thead>
      <tr><th>Caso</th><th>Caract.</th><th>Módulos</th><th>Puntos/mód.</th><th>Pronóstico</th></tr>
    </thead>
    <tbody>
${filas}
    </tbody>
  </table>

${bloques}

  <div class="no-imprimir">
    <h2 style="font:500 20px/1.2 Georgia,serif; margin:28px 0 8px;">Cómo medirlo</h2>
    <ol>
      <li>Abrí una app de lector de códigos de barras en el celular.</li>
      <li><strong>Desde la pantalla:</strong> apuntá a cada uno. Los tres deberían decodificar
        al texto que está impreso debajo. Si alguno devuelve algo distinto, el problema es el
        generador y no la impresión — avisame.</li>
      <li><strong>Desde la Brother:</strong> imprimí esta hoja y repetí. Anotá para cada uno a
        qué distancia engancha y cuánto tarda.</li>
      <li>Lo que confirma o tumba la decisión: que el <strong>largo</strong> cueste
        notoriamente más que los dos cortos. Si los tres leen igual de fácil en la Brother, la
        aritmética estaba mal y el código corto se justifica solo por ser dictable por
        teléfono, no por legibilidad.</li>
    </ol>
  </div>
</div>
</body>
</html>`;

const salida = new URL("./hoja-de-prueba.html", import.meta.url);
writeFileSync(salida, html, "utf8");

console.log("Hoja generada:", salida.pathname.replace(/^\//, ""));
for (const e of etiquetas) {
  console.log(
    `  ${e.texto.padEnd(42)} ${String(e.barras.total).padStart(4)} módulos  ` +
      `${e.puntos.toFixed(1).padStart(5)} pts/mód  → ${e.veredicto[0]}`
  );
}
