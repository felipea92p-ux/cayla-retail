/**
 * Genera una hoja para MEDIR si una etiqueta de CAYLA se lee de verdad.
 *
 * LA REGLA DE ESTE ARCHIVO: dibuja con el MISMO código que la app, nunca con una
 * copia. El QR sale de `qrcode.react` renderizado a HTML estático con los parámetros
 * de `apps/web/lib/qr.ts`, y el código de barras de `apps/web/lib/codigo128.ts`. Si
 * alguna vez se duplica alguno acá, la hoja deja de medir lo que se quería medir.
 *
 * LO QUE APRENDIMOS MIDIENDO (2026-09-09/10):
 *   · El primer intento daba basura al escanear (`755123:1<7V90` en vez de
 *     `7501234567890`). No era el encoder —un round-trip probó que siempre estuvo
 *     bien— sino el DIBUJO: se estiraba al ancho de la etiqueta y deformaba la
 *     proporción de anchos de la que depende Code 128. Arreglado, y verificado por
 *     Felipe con la pistola Zebra.
 *   · Una etiqueta de 62 mm en pantalla son ~234 px: menos de 1 px por módulo.
 *     Ninguna cámara resuelve eso. Por eso la prueba de pantalla va agrandada.
 *   · Y el techo de 15 caracteres del código de barras dejaba afuera a una talla
 *     XXL. Con QR ese techo desaparece — es la razón de fondo del cambio.
 *
 *   node scripts/etiquetas/hoja-de-prueba.mjs
 */

import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { barrasCode128, medir, MODULO_MM, ANCHO_UTIL_MM } from "../../apps/web/lib/codigo128.ts";
import {
  LADO_QR_MM,
  LADO_VIEWBOX_PX,
  NIVEL_QR,
  ZONA_MUDA_MODULOS,
  puntosPorModuloQR,
} from "../../apps/web/lib/qr.ts";

// Anclado en apps/web para resolver SUS dependencias: pnpm no las sube a la raíz, y
// este script vive fuera del paquete. Por eso react también entra por acá y no con un
// `import` de arriba.
const requerir = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const { createElement } = requerir("react");
const { QRCodeSVG } = requerir("qrcode.react");
const { renderToStaticMarkup } = requerir("react-dom/server");

const PRENDAS = [
  { codigo: "CIN-0001-U", referencia: "Correa de cuero", detalle: "Única", precio: 45 },
  { codigo: "BLU-0001-AZM-M", referencia: "Blusa Reflixme", detalle: "M · Azul marino", precio: 79 },
  { codigo: "7501234567890", referencia: "Blusa importada", detalle: "M · Azul marino", precio: 79 },
  { codigo: "BLU-0042-AZM-XXL", referencia: "Blusa cuello alto", detalle: "XXL · Azul marino", precio: 85 },
];

/** El QR tal cual lo dibuja la app: mismo componente, mismos parámetros. */
function qrSvg(texto, ladoMm = LADO_QR_MM) {
  return renderToStaticMarkup(
    createElement(QRCodeSVG, {
      value: texto,
      size: LADO_VIEWBOX_PX,
      level: NIVEL_QR,
      marginSize: ZONA_MUDA_MODULOS,
      style: { width: `${ladoMm}mm`, height: `${ladoMm}mm`, display: "block" },
    })
  );
}

/** Módulos de lado del QR (sin zona muda), leídos del viewBox que devolvió la librería. */
function modulosQR(svg) {
  const m = svg.match(/viewBox="0 0 (\d+) \d+"/);
  return m ? Number(m[1]) - ZONA_MUDA_MODULOS * 2 : null;
}

const etiquetas = PRENDAS.map((p) => {
  const svg = qrSvg(p.codigo);
  const mods = modulosQR(svg);
  return { ...p, svg, mods, puntos: puntosPorModuloQR(mods) };
});

const etiquetasHtml = etiquetas
  .map(
    (e) => `  <section class="caso">
    <p class="caso-tit">${e.referencia} <span class="caso-nota">${e.codigo}</span></p>
    <div class="etiqueta">
      <div class="qr">${e.svg}</div>
      <div class="datos">
        <p class="ref">${e.referencia}</p>
        <p class="detalle">${e.detalle}</p>
        <p class="precio">S/${e.precio.toFixed(2)}</p>
        <p class="codigo">${e.codigo}</p>
      </div>
    </div>
    <p class="medida">QR de ${e.mods}×${e.mods} módulos · ${e.puntos.toFixed(1)} puntos por módulo a 300 dpi</p>
  </section>`
  )
  .join("\n");

const pantallaHtml = etiquetas
  .map(
    (e) => `    <div class="grande">
      ${qrSvg(e.codigo, 42)}
      <p class="codigo-grande">${e.codigo}</p>
    </div>`
  )
  .join("\n");

// El contraste que explica el cambio: los mismos códigos en código de barras.
const xxl = "BLU-0042-AZM-XXL";
const barrasXxl = medir(barrasCode128(xxl).total);
const largo = "BLUSA-MANGA-LARGA-ESCOTE-V-M-AZUL-MARINO";
const barrasLargo = medir(barrasCode128(largo).total);

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>La etiqueta de CAYLA · prueba de lectura</title>
<style>
  :root { --tinta:#1a1a18; --crema:#f5f0e8; --papel:#fbf8f2; --sand:#e8e0d0;
          --rojo:#b8412d; --verde:#556e49; --taupe:#805c4c; }
  * { box-sizing:border-box; }
  body { margin:0; padding:28px 20px 60px; background:var(--crema); color:var(--tinta);
         font:15px/1.55 "DM Sans", system-ui, sans-serif; }
  .hoja { max-width:52rem; margin:0 auto; }
  h1 { font:500 32px/1.12 Georgia, serif; margin:0 0 6px; }
  h2 { font:500 23px/1.15 Georgia, serif; margin:0 0 4px; }
  .bajada { color:#5b544c; margin:0 0 12px; max-width:58ch; }
  .parte { border-top:1px solid var(--sand); margin-top:34px; padding-top:24px; }
  .et { font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:var(--taupe);
        font-weight:500; margin:0 0 6px; }
  .caso { margin:0 0 20px; }
  .caso-tit { font:500 15px/1.25 "DM Sans", sans-serif; margin:0 0 7px; }
  .caso-nota { color:#5b544c; font-weight:400; font-family:ui-monospace, monospace; font-size:13px; }
  .medida { font-size:12.5px; color:#5b544c; margin:6px 0 0; font-variant-numeric:tabular-nums; }

  /* LA ETIQUETA, al tamaño físico real del rollo: 62 x 29 mm. No cambiar. */
  .etiqueta { width:62mm; height:29mm; background:#fff; border:1px solid var(--sand);
              padding:2mm; display:flex; align-items:center; gap:2mm; }
  .qr { flex:0 0 auto; }
  .datos { min-width:0; flex:1 1 auto; display:flex; flex-direction:column;
           justify-content:center; gap:.4mm; }
  .ref { font:600 9pt/1.15 "DM Sans", sans-serif; margin:0; color:#000;
         text-transform:uppercase; letter-spacing:.02em;
         overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .detalle { font:8pt/1.15 "DM Sans", sans-serif; margin:0; color:#000; text-transform:uppercase; }
  .precio { font:600 12pt/1.15 "DM Sans", sans-serif; margin:0; color:#000; }
  .codigo { font:7pt/1.15 ui-monospace, monospace; letter-spacing:.06em; margin:0; color:#000;
            overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

  .grandes { display:flex; flex-wrap:wrap; gap:18px; }
  .grande { background:#fff; border:1px solid var(--sand); padding:12px; text-align:center; }
  .codigo-grande { font:11px/1 ui-monospace, monospace; letter-spacing:.1em; margin:8px 0 0; color:#000; }

  table { border-collapse:collapse; width:100%; font-size:14px; margin:6px 0 0; }
  th { text-align:left; font-size:11px; letter-spacing:.12em; text-transform:uppercase;
       color:var(--taupe); font-weight:500; padding:0 10px 6px 0; border-bottom:1px solid var(--sand); }
  td { padding:7px 10px 7px 0; border-bottom:1px solid var(--sand); }
  td.num { text-align:right; font-variant-numeric:tabular-nums; font-family:ui-monospace,monospace; }
  .si { color:var(--verde); font-weight:500; } .no { color:var(--rojo); font-weight:500; }

  ol { padding-left:19px; max-width:62ch; } ol li { margin-bottom:9px; }

  @media print {
    body { background:#fff; padding:0; }
    .solo-pantalla { display:none !important; }
    .etiqueta { border:1px dashed #bbb; }
    @page { margin:12mm; }
  }
</style>
</head>
<body>
<div class="hoja">
  <h1>La etiqueta de CAYLA</h1>
  <p class="bajada">QR para la máquina, caracteres para el ojo. Al tamaño físico real del rollo
    de 62 × 29 mm, dibujada con el mismo código que imprime la app.</p>

  <div class="parte">
    <p class="et">Prueba 1 · imprimir en la Brother QL</p>
    <h2>¿Se lee la etiqueta real?</h2>
    <p class="bajada">Imprimí esta hoja y escaneá cada una. El QR mide ${LADO_QR_MM} mm de lado,
      con ${ZONA_MUDA_MODULOS} módulos de zona muda — sin esa zona el lector no encuentra dónde
      empieza el código, y es el error más común al imprimir QR.</p>
${etiquetasHtml}
  </div>

  <div class="parte">
    <p class="et">Prueba 2 · desde la pantalla</p>
    <h2>¿El código está bien construido?</h2>
    <p class="bajada">Agrandados a propósito: una etiqueta de 62 mm en pantalla deja los módulos
      por debajo del píxel y ninguna cámara los resuelve. Cada uno tiene que decodificar
      exactamente al texto de abajo.</p>
    <div class="grandes">
${pantallaHtml}
    </div>
  </div>

  <div class="parte solo-pantalla">
    <p class="et">Por qué QR y no código de barras</p>
    <h2>El techo de los 15 caracteres</h2>
    <p class="bajada">Code 128 ocupa ancho en proporción al largo del texto. En los
      ${ANCHO_UTIL_MM} mm útiles de la etiqueta, con módulos de ${MODULO_MM} mm (3 puntos a
      300 dpi, el mínimo de la impresión térmica), entran ${barrasXxl.maxCaracteres} caracteres.
      El QR no tiene ese problema: crece hacia arriba además de a lo ancho.</p>
    <table>
      <thead><tr><th>Código</th><th>Caract.</th><th>Código de barras</th><th>QR</th></tr></thead>
      <tbody>
        <tr><td>BLU-0001-AZM-M</td><td class="num">14</td>
            <td class="si">entra</td><td class="si">entra</td></tr>
        <tr><td>${xxl}</td><td class="num">${xxl.length}</td>
            <td class="no">no entra — pide ${barrasXxl.anchoMm.toFixed(0)} mm</td>
            <td class="si">entra</td></tr>
        <tr><td>${largo}</td><td class="num">${largo.length}</td>
            <td class="no">no entra — pide ${barrasLargo.anchoMm.toFixed(0)} mm</td>
            <td class="si">entra</td></tr>
      </tbody>
    </table>
    <p class="medida">Una talla XXL no entraba en su propia etiqueta. Ésa fue la razón de fondo
      del cambio, además de que CAYLA ya venía usando QR.</p>
  </div>

  <div class="parte solo-pantalla">
    <h2>Qué mirar</h2>
    <ol>
      <li><strong>Que cada QR devuelva exactamente el código impreso debajo.</strong> Si alguno
        devuelve otra cosa, el problema es el generador y quiero saberlo.</li>
      <li><strong>Que la Zebra los enganche rápido y de lejos</strong>, no solo pegada. La pistola
        tiene que ser lectora 2D; si es de barras solamente, no va a ver ningún QR.</li>
      <li><strong>Que el texto de la derecha se lea sin esfuerzo</strong> a la distancia a la que
        se mira una etiqueta colgada. Es lo que alguien dicta por teléfono cuando otra sede
        pregunta si hay una talla.</li>
      <li>Si imprimís en una láser común, la prueba de densidad no vale: tiene 600 dpi y dibuja
        el doble de fino que la Brother.</li>
    </ol>
  </div>
</div>
</body>
</html>`;

writeFileSync(new URL("./hoja-de-prueba.html", import.meta.url), html, "utf8");

console.log("Hoja generada.\n");
for (const e of etiquetas) {
  console.log(
    `  ${e.codigo.padEnd(20)} QR ${e.mods}×${e.mods} módulos  ` +
      `${e.puntos.toFixed(1).padStart(5)} pts/mód  → ${e.puntos >= 4 ? "holgado" : "al filo"}`
  );
}
console.log(
  `\n  En código de barras, "${xxl}" pediría ${barrasXxl.anchoMm.toFixed(0)} mm ` +
    `y la etiqueta tiene ${ANCHO_UTIL_MM}.`
);
