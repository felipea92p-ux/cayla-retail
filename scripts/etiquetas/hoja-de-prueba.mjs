/**
 * Genera una hoja para MEDIR si un código de barras se lee de verdad.
 *
 * QUÉ APRENDIMOS EL 2026-09-09 (y por qué esta hoja quedó así).
 * La primera versión mostraba los códigos al tamaño de la etiqueta (62 mm) y decía
 * "apuntá el celular a la pantalla". Felipe lo hizo y salió basura: `755123:1<7V90`
 * en vez de `7501234567890`, y ráfagas de dígitos. Dos causas, y ninguna era el
 * encoder (que decodifica exacto, verificado con round-trip):
 *
 *   1. El dibujo se ESTIRABA al ancho de la etiqueta, así que la proporción de
 *      anchos —de la que depende Code 128— se deformaba. Ya está arreglado:
 *      el módulo tiene tamaño fijo y el ancho se deduce.
 *   2. Una etiqueta de 62 mm en pantalla son ~234 px, o sea **menos de 1 píxel por
 *      módulo**. Ningún lector puede resolver eso, por bien dibujado que esté.
 *
 * Por eso ahora la hoja tiene DOS secciones con propósitos distintos, y lo dice.
 *
 *   node scripts/etiquetas/hoja-de-prueba.mjs
 */

import { writeFileSync } from "node:fs";
import { barrasCode128, medir, MODULO_MM, ANCHO_UTIL_MM } from "../../apps/web/lib/codigo128.ts";

/** Módulo grande para escanear desde el monitor: 3 px es lo mínimo que una cámara resuelve. */
const MODULO_PANTALLA_PX = 3;

const CASOS = [
  { texto: "BLU-0001-AZM-M", titulo: "Código corto de CAYLA", nota: "Lo que imprime la app" },
  { texto: "7501234567890", titulo: "Código de fábrica adoptado", nota: "El EAN que ya trae la prenda" },
  { texto: "CIN-0001-U", titulo: "Prenda sin color (una correa)", nota: "El más corto que produce el sistema" },
  {
    texto: "BLU-0042-AZM-XXL",
    titulo: "Una talla XXL",
    nota: "El caso más largo que produce el sistema — decisión pendiente",
  },
  {
    texto: "BLUSA-MANGA-LARGA-ESCOTE-V-M-AZUL-MARINO",
    titulo: "El SKU largo de antes",
    nota: "Así se imprimía hasta hoy",
  },
];

const casos = CASOS.map((c) => {
  const barras = barrasCode128(c.texto);
  if (!barras) throw new Error(`Code 128 no puede con: ${c.texto}`);
  return { ...c, barras, m: medir(barras.total) };
});

const svg = (barras, anchoCss, altoCss) =>
  `<svg viewBox="0 0 ${barras.total} 1" preserveAspectRatio="none" shape-rendering="crispEdges"
       style="width:${anchoCss};height:${altoCss};display:block">
    <path d="${barras.d}" fill="#000"></path>
  </svg>`;

const paraPantalla = casos
  .map(
    (c) => `  <section class="caso">
    <p class="caso-tit">${c.titulo} <span class="caso-nota">— ${c.nota}</span></p>
    <div class="grande">
      ${svg(c.barras, `${c.barras.total * MODULO_PANTALLA_PX}px`, "76px")}
      <p class="codigo-grande">${c.texto}</p>
    </div>
    <p class="medida">${c.barras.total} módulos · ${MODULO_PANTALLA_PX} px por módulo en pantalla</p>
  </section>`
  )
  .join("\n");

const paraImprimir = casos
  .map((c) => {
    const cuerpo = c.m.cabe
      ? `<div class="etiqueta">
        <p class="ref">Blusa Reflixme</p>
        <p class="detalle">M · Azul marino &nbsp;·&nbsp; S/ 79.00</p>
        <div class="barras-real">${svg(c.barras, `${c.m.anchoMm}mm`, "11mm")}</div>
        <p class="codigo">${c.texto}</p>
      </div>
      <p class="medida">${c.barras.total} módulos × ${MODULO_MM} mm = <strong>${c.m.anchoMm.toFixed(1)} mm</strong> de ${ANCHO_UTIL_MM} mm disponibles</p>`
      : `<div class="etiqueta no-entra">
        <p class="aviso-chico">No entra en la etiqueta</p>
        <p class="detalle-chico">Necesita ${c.m.anchoMm.toFixed(0)} mm y hay ${ANCHO_UTIL_MM} mm.
          Con este módulo entran hasta ${c.m.maxCaracteres} caracteres; éste tiene ${c.texto.length}.</p>
      </div>
      <p class="medida mal">${c.barras.total} módulos × ${MODULO_MM} mm = <strong>${c.m.anchoMm.toFixed(1)} mm</strong> — se pasa por ${(c.m.anchoMm - ANCHO_UTIL_MM).toFixed(0)} mm</p>`;
    return `  <section class="caso">
    <p class="caso-tit">${c.titulo}</p>
${cuerpo}
  </section>`;
  })
  .join("\n");

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>¿Se lee el código? · CAYLA</title>
<style>
  :root { --tinta:#1a1a18; --crema:#f5f0e8; --papel:#fbf8f2; --sand:#e8e0d0;
          --rojo:#b8412d; --verde:#556e49; --taupe:#805c4c; }
  * { box-sizing:border-box; }
  body { margin:0; padding:28px 20px 60px; background:var(--crema); color:var(--tinta);
         font:15px/1.55 "DM Sans", system-ui, sans-serif; }
  .hoja { max-width:52rem; margin:0 auto; }
  h1 { font:500 32px/1.12 Georgia, serif; margin:0 0 6px; }
  h2 { font:500 23px/1.15 Georgia, serif; margin:0 0 4px; }
  .bajada { color:#5b544c; margin:0 0 8px; max-width:56ch; }
  .parte { border-top:1px solid var(--sand); margin-top:34px; padding-top:24px; }
  .et { font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:var(--taupe);
        font-weight:500; margin:0 0 6px; }

  .caso { margin:0 0 22px; }
  .caso-tit { font:500 16px/1.25 "DM Sans", sans-serif; margin:0 0 8px; }
  .caso-nota { color:#5b544c; font-weight:400; }
  .medida { font-size:12.5px; color:#5b544c; margin:6px 0 0; font-variant-numeric:tabular-nums; }
  .medida.mal { color:var(--rojo); }

  .grande { background:#fff; border:1px solid var(--sand); padding:14px 16px; display:inline-block;
            max-width:100%; overflow-x:auto; }
  .codigo-grande { font:12px/1 ui-monospace, monospace; letter-spacing:.14em; text-align:center;
                   margin:8px 0 0; color:#000; }

  /* Etiqueta al tamaño físico real del rollo: 62 x 29 mm. No cambiar. */
  .etiqueta { width:62mm; height:29mm; background:#fff; border:1px solid var(--sand);
              padding:2mm 6mm; display:flex; flex-direction:column; justify-content:center; }
  .etiqueta.no-entra { border:1px dashed var(--rojo); justify-content:center; }
  .ref { font:600 9pt/1.15 "DM Sans", sans-serif; margin:0; color:#000; }
  .detalle { font:7pt/1.2 "DM Sans", sans-serif; margin:.4mm 0 1mm; color:#000; }
  .barras-real { display:flex; justify-content:center; }
  .codigo { font:6.5pt/1 ui-monospace, monospace; letter-spacing:.06em; text-align:center;
            margin:.7mm 0 0; color:#000; }
  .aviso-chico { font:600 8pt/1.2 "DM Sans", sans-serif; color:var(--rojo); margin:0 0 1mm; }
  .detalle-chico { font:6.5pt/1.3 "DM Sans", sans-serif; color:#000; margin:0; }

  .nota { border-left:3px solid var(--rojo); background:var(--papel); padding:14px 16px; margin:14px 0 22px; }
  .nota p { margin:0 0 7px; font-size:14px; } .nota p:last-child { margin:0; }
  ol { padding-left:19px; max-width:60ch; } ol li { margin-bottom:9px; }

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
  <h1>¿Se lee el código?</h1>
  <p class="bajada">Dos pruebas distintas, con tamaños distintos. Mezclarlas fue lo que hizo
    fallar el primer intento.</p>

  <div class="nota solo-pantalla">
    <p><strong>Por qué el primer intento dio basura.</strong> Un código dibujado al ancho de una
      etiqueta de 62 mm ocupa unos 234 píxeles en pantalla: <strong>menos de un píxel por
      módulo</strong>. Ninguna cámara puede resolver eso. Y encima el dibujo se estiraba para
      llenar el ancho, así que la proporción entre barras —que es de lo que depende Code 128—
      se deformaba.</p>
    <p>El cálculo del código siempre estuvo bien: todos los casos decodifican exacto y el
      checksum cierra, verificado con un round-trip. Lo que estaba mal era el dibujo, y ya
      está arreglado.</p>
  </div>

  <div class="parte">
    <p class="et">Prueba 1 · desde la pantalla</p>
    <h2>¿El código está bien construido?</h2>
    <p class="bajada">Estos están agrandados a propósito (3 px por módulo) para que la cámara
      los resuelva. Cada uno tiene que decodificar EXACTAMENTE al texto que está debajo.</p>
${paraPantalla}
  </div>

  <div class="parte">
    <p class="et">Prueba 2 · desde la Brother QL</p>
    <h2>¿Entra y se lee en la etiqueta real?</h2>
    <p class="bajada">Ahora al tamaño físico real: cada módulo mide ${MODULO_MM} mm, que son
      exactamente 3 puntos a 300 dpi. El ancho ya no se estira — sale de cuántos módulos tiene
      el código. Imprimí esta hoja en la Brother y escaneá.</p>
${paraImprimir}
  </div>

  <div class="parte solo-pantalla">
    <h2>Qué mirar</h2>
    <ol>
      <li><strong>En la prueba 1</strong>, cada uno tiene que dar exactamente el texto que está
        debajo. Si alguno devuelve otra cosa, el problema es el generador y quiero saberlo.</li>
      <li><strong>Los dos que no entran son el punto de todo esto.</strong> El SKU largo de
        antes necesita ${casos[4].m.anchoMm.toFixed(0)} mm y hay ${ANCHO_UTIL_MM}: se imprimía
        igual, encogido hasta ser ilegible, y nadie se enteraba. Ahora la app se niega y lo dice.</li>
      <li><strong>Y la talla XXL destapa una decisión pendiente.</strong>
        <code>BLU-0042-AZM-XXL</code> son 16 caracteres y con este módulo entran
        ${casos[3].m.maxCaracteres}. O se le baja el margen a la etiqueta para ganar ancho, o se
        acorta el formato del código. Hay que decidirlo antes de imprimir en serio.</li>
      <li><strong>En la prueba 2</strong>, imprimí en la Brother y anotá a qué distancia
        engancha cada uno. En una impresora láser común la prueba no vale: tiene 600 dpi y
        dibuja el doble de fino.</li>
    </ol>
  </div>
</div>
</body>
</html>`;

writeFileSync(new URL("./hoja-de-prueba.html", import.meta.url), html, "utf8");

console.log("Hoja generada.\n");
for (const c of casos) {
  console.log(
    `  ${c.texto.padEnd(42)} ${String(c.barras.total).padStart(4)} mód  ` +
      `${c.m.anchoMm.toFixed(1).padStart(6)} mm  ` +
      `${c.m.cabe ? "entra" : `NO ENTRA (máx ${c.m.maxCaracteres} caracteres)`}`
  );
}
