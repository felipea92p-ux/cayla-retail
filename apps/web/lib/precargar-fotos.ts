// Precarga de fotos de prenda: la foto de OTRO color ya está en la memoria del navegador cuando la persona lo toca o pasa el mouse.
// Sin esto, cada cambio de color pedía su foto recién al cambiar y la caja quedaba en blanco hasta que llegaba. Se precarga EXACTAMENTE
// lo que `<Image>` va a pedir (el `src`, el `srcset` y los `sizes` del optimizador; `components/ui/precargar-miniaturas.ts` los arma),
// así el navegador reutiliza la versión ya descargada y decodificada en vez de pedirla otra vez.
// Solo corre en el navegador; en el servidor (o sin `Image`) no hace nada.

/** Lo mínimo de una imagen que se necesita: se puede cambiar por una de mentira en las pruebas. */
export type ImagenPrecarga = { src: string; srcset?: string; sizes?: string; decoding?: string; decode?: () => Promise<void>; onload: unknown; onerror: unknown };

/** Una foto servida por el optimizador de Next: el `src`, el `srcset` y los `sizes` EXACTOS con que la dibuja `<Image>`. Precargada con esos
 *  tres, el navegador elige la misma versión chica que va a pintar (y no baja el original). */
export type FotoOptimizada = { src: string; srcSet?: string; sizes?: string };

/** Cuánto se espera una foto antes de dejar de esperarla: pasado esto el cambio sigue su curso (una red lenta no congela el color). */
export const MS_ESPERA_MAX = 2500;

const pedidas = new Map<string, Promise<boolean>>();

function crearEnNavegador(): ImagenPrecarga | null {
  return typeof Image === "undefined" ? null : (new Image() as unknown as ImagenPrecarga);
}

/** Pide la foto una sola vez. Resuelve `true` cuando ya está cargada (y decodificada) y `false` si falló; nunca rechaza.
 *  Una foto que falló se vuelve a intentar la próxima vez (un corte de red no la deja marcada como mala para siempre). */
export function cargarFoto(url: string, crear: () => ImagenPrecarga | null = crearEnNavegador, optimizada?: FotoOptimizada): Promise<boolean> {
  // La clave incluye el `srcset`: la misma foto en otro tamaño es otra descarga.
  const clave = optimizada?.srcSet ? `${url}|${optimizada.srcSet}` : url;
  const previa = pedidas.get(clave);
  if (previa) return previa;
  const img = crear();
  if (!img) return Promise.resolve(false);
  const promesa = new Promise<boolean>((resolver) => {
    img.decoding = "async";
    // `sizes` y `srcset` antes que `src`: así el navegador decide la versión desde el primer pedido.
    if (optimizada?.srcSet) {
      if (optimizada.sizes) img.sizes = optimizada.sizes;
      img.srcset = optimizada.srcSet;
    }
    img.src = optimizada?.src ?? url;
    if (typeof img.decode === "function") {
      // `decode()` espera a que la foto esté descargada Y lista para pintarse: el cruce arranca sin el tirón de decodificar.
      img.decode().then(
        () => resolver(true),
        () => resolver(false),
      );
    } else {
      img.onload = () => resolver(true);
      img.onerror = () => resolver(false);
    }
  });
  pedidas.set(clave, promesa);
  void promesa.then((ok) => {
    if (!ok && pedidas.get(clave) === promesa) pedidas.delete(clave);
  });
  return promesa;
}

/** Solo para las pruebas: vacía la memoria de fotos pedidas.
 * @internal existe PARA `precargar-fotos.test.ts`: cada caso necesita empezar sin fotos ya pedidas. */
export function olvidarFotosPedidas(): void {
  pedidas.clear();
}
