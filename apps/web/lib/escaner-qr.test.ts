import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QRCodeSVG } from "qrcode.react";
import jsQR from "jsqr";
import { describe, expect, it } from "vitest";

// El QR que imprime la etiqueta (`CodigoQR` → `QRCodeSVG` con el código de la prenda) tiene que poder leerlo el lector de
// respaldo de la cámara (`jsQR`, el que usan los iPhone en `EscanerCamara`). Se genera con la MISMA librería, se pasa a
// píxeles sobre un fondo gris (como lo vería la cámara: la etiqueta no llena el cuadro) y se decodifica.

/** Pinta el SVG de `qrcode.react` (rectángulos `Mx yhWv1H..z` en una grilla de módulos) en RGBA. */
function aPixeles(svg: string, anchoCuadro: number, altoCuadro: number, pxPorModulo: number) {
  const modulos = Number(/viewBox="0 0 (\d+) \d+"/.exec(svg)?.[1]);
  const negro = /<path fill="#000000" d="([^"]+)"/.exec(svg)?.[1] ?? "";
  const grilla = Array.from({ length: modulos }, () => new Array<boolean>(modulos).fill(false));
  for (const [, x, y, w] of negro.matchAll(/M(\d+)[ ,]+(\d+)\s*h(\d+)v1H\d+z/g)) {
    for (let i = 0; i < Number(w); i++) grilla[Number(y)][Number(x) + i] = true;
  }
  const datos = new Uint8ClampedArray(anchoCuadro * altoCuadro * 4);
  const lado = modulos * pxPorModulo;
  const x0 = Math.floor((anchoCuadro - lado) / 2);
  const y0 = Math.floor((altoCuadro - lado) / 2);
  for (let y = 0; y < altoCuadro; y++) {
    for (let x = 0; x < anchoCuadro; x++) {
      const dentro = x >= x0 && x < x0 + lado && y >= y0 && y < y0 + lado;
      // Fondo gris (la mesa), etiqueta blanca, módulos negros.
      const valor = !dentro ? 138 : grilla[Math.floor((y - y0) / pxPorModulo)][Math.floor((x - x0) / pxPorModulo)] ? 0 : 255;
      const i = (y * anchoCuadro + x) * 4;
      datos[i] = datos[i + 1] = datos[i + 2] = valor;
      datos[i + 3] = 255;
    }
  }
  return datos;
}

describe("el QR de la etiqueta se lee con la cámara", () => {
  it.each(["CMS-0001-NEG-M", "PAN-0142-BEI-XL"])("lee %s", (codigo) => {
    const svg = renderToStaticMarkup(createElement(QRCodeSVG, { value: codigo, marginSize: 4 }));
    const [ancho, alto] = [640, 480];
    const lectura = jsQR(aPixeles(svg, ancho, alto, 9), ancho, alto, { inversionAttempts: "dontInvert" });
    expect(lectura?.data).toBe(codigo);
  });
});
