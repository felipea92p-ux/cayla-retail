/// <reference lib="webworker" />
// El modelo que quita el fondo, en un hilo aparte (ADR-0220). Corre ~1 s por foto en la CPU: en el hilo de la pantalla
// la congelaría ese segundo por cada foto, y en una revisión del catálogo entero eso son minutos sin poder tocar nada.
//
// Por qué MODNet y no un modelo «mejor»: se midió el 2026-09-26 en la Mac de Felipe. BiRefNet_lite (MIT, el que mejor
// recorta ropa) no corrió en ningún navegador —en el de Claude choca con el límite de la tarjeta gráfica, en Safari 26.5
// y en CPU se queda sin memoria— y no admite una entrada más chica que 1024 px. ISNet y RMBG no sirven por licencia
// (AGPL y no comercial). MODNet (Apache-2.0, 26 MB) corre en cualquier equipo; está entrenado con personas y a veces
// muerde una manga o un gancho, por eso la pantalla SIEMPRE muestra el resultado y deja elegir la foto con su fondo.
//
// Siempre en CPU (wasm), nunca WebGPU: el resultado tiene que ser el mismo en la Mac, en la tablet y en la PC de la
// tienda, y WebGPU cambia de un equipo a otro (en el navegador de Claude falla).

import { env, pipeline, RawImage } from "@huggingface/transformers";

export const MODELO_QUITAR_FONDO = "Xenova/modnet";

env.allowLocalModels = false;

type Pedido = { id: number; imagen: Blob };
export type RespuestaWorker =
  | { tipo: "progreso"; porcentaje: number }
  | { tipo: "listo"; id: number; ancho: number; alto: number; rgba: Uint8ClampedArray }
  | { tipo: "error"; id: number; mensaje: string };

type Segmentador = (imagen: RawImage) => Promise<RawImage>;
let segmentador: Promise<Segmentador> | null = null;

function obtenerSegmentador(): Promise<Segmentador> {
  segmentador ??= pipeline("background-removal", MODELO_QUITAR_FONDO, {
    device: "wasm",
    dtype: "fp32",
    progress_callback: (p) => {
      if (p.status === "progress_total") self.postMessage({ tipo: "progreso", porcentaje: p.progress } satisfies RespuestaWorker);
    },
  }).then((p) => p as unknown as Segmentador);
  // Si la descarga falla (sin conexión la primera vez), el próximo pedido lo vuelve a intentar en vez de quedar roto.
  segmentador.catch(() => (segmentador = null));
  return segmentador;
}

self.onmessage = async (e: MessageEvent<Pedido>) => {
  const { id, imagen } = e.data;
  try {
    const seg = await obtenerSegmentador();
    const salida = await seg(await RawImage.fromBlob(imagen));
    const rgba = salida.channels === 4 ? salida : salida.rgba();
    const datos = new Uint8ClampedArray(rgba.data);
    self.postMessage({ tipo: "listo", id, ancho: rgba.width, alto: rgba.height, rgba: datos } satisfies RespuestaWorker, [datos.buffer]);
  } catch (err) {
    self.postMessage({ tipo: "error", id, mensaje: err instanceof Error ? err.message : String(err) } satisfies RespuestaWorker);
  }
};
