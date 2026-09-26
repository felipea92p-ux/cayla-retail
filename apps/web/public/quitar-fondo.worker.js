// El modelo que quita el fondo de las fotos de prenda, en un hilo aparte (ADR-0228). Corre ~1 s por foto en la CPU:
// en el hilo de la pantalla la congelaría ese segundo por cada foto.
//
// Por qué vive en `public/` como JavaScript plano y no en `lib/` como TypeScript: Next 16.2 con Turbopack no reconoció
// `new Worker(new URL("./x.worker.ts", import.meta.url))` en el build de producción —lo copió como archivo crudo, el
// navegador no podía ejecutarlo— aunque en `next dev` funcionaba (visto el 2026-09-26; hay regresiones abiertas en
// Next, vercel/next.js#98841). Un archivo de `public/` se sirve igual en los dos, sin depender del empaquetador.
//
// Por qué MODNet: se midió el 2026-09-26 en la Mac de Felipe. BiRefNet_lite (MIT, el que mejor recorta ropa) no corrió
// en ningún navegador —en el de Claude choca con el límite de la tarjeta gráfica, en Safari 26.5 y en CPU se queda sin
// memoria— y no admite una entrada más chica que 1024 px. ISNet y RMBG no sirven por licencia (AGPL y no comercial).
// MODNet (Apache-2.0, 26 MB) corre en cualquier equipo; está entrenado con personas y a veces muerde una manga o un
// gancho, por eso la pantalla SIEMPRE muestra el resultado y deja elegir la foto con su fondo.
//
// Siempre en CPU (wasm), nunca WebGPU: el resultado tiene que ser el mismo en la Mac, en la tablet y en la PC de la
// tienda, y WebGPU cambia de un equipo a otro (en el navegador de Claude falla).
//
// La librería va fijada a una versión exacta: cambiarla es una decisión, no algo que pasa solo.

import { env, pipeline, RawImage } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0";

const MODELO = "Xenova/modnet";
env.allowLocalModels = false;

let segmentador = null;

function obtenerSegmentador() {
  if (!segmentador) {
    segmentador = pipeline("background-removal", MODELO, {
      device: "wasm",
      dtype: "fp32",
      progress_callback: (p) => {
        if (p.status === "progress_total") self.postMessage({ tipo: "progreso", porcentaje: p.progress });
      },
    });
    // Si la descarga falla (sin conexión la primera vez), el próximo pedido lo vuelve a intentar en vez de quedar roto.
    segmentador.catch(() => (segmentador = null));
  }
  return segmentador;
}

self.onmessage = async (e) => {
  const { id, imagen } = e.data;
  try {
    const seg = await obtenerSegmentador();
    const salida = await seg(await RawImage.fromBlob(imagen));
    const rgba = salida.channels === 4 ? salida : salida.rgba();
    const datos = new Uint8ClampedArray(rgba.data);
    self.postMessage({ tipo: "listo", id, ancho: rgba.width, alto: rgba.height, rgba: datos }, [datos.buffer]);
  } catch (err) {
    self.postMessage({ tipo: "error", id, mensaje: err instanceof Error ? err.message : String(err) });
  }
};
