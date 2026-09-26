# ADR-0220 — Fotos de prenda sin fondo y del mismo tamaño, preparadas en el navegador

**Fecha:** 2026-09-26
**Estado:** Construido. `tsc`, `eslint` y las pruebas en verde; la revisión se vio en el navegador con dos fotos reales,
en `next dev` (escritorio y 375 px) y en el build de producción (`next build` + `next start`). Falta subir una foto con
sesión real a una ficha.
**Afecta:** `lib/foto-encuadre.ts` (nuevo, puro, con pruebas), `lib/preparar-foto.ts` y `public/quitar-fondo.worker.js`
(nuevos), `components/RevisarFotosModal.tsx` (nuevo), `lib/producto-fotos.ts`, `lib/fotos-pendientes.ts`,
`components/FotosProducto.tsx`, `components/alta-producto/FotosAlta.tsx`, `components/NuevoProductoForm.tsx`,
`proxy.ts` (el worker no pasa por la sesión). Sin dependencia npm nueva: el worker carga `@huggingface/transformers`
4.3.0 (Apache-2.0) fijado, desde jsDelivr. **No toca la base.**
**Relacionado:** ADR-0197 (fotos al crear), ADR-0210 (alta sin conexión), ADR-0136 (modales).

## Contexto

Felipe (2026-09-26): «cuando subimos imágenes de cada prenda, me gustaría quitarle el fondo automático y que salgan
todas en dimensiones por igual». Cada foto subía tal cual y la grilla de Productos la recortaba a 4:5 como caía: una
prenda llenaba la tarjeta y la de al lado ocupaba un tercio, cada una con su fondo.

## Decidí

1. **Toda foto sale en 1200×1500 (el 4:5 de la grilla), JPEG sobre blanco.** Sin fondo, la prenda se centra con 8 % de
   aire por lado y queda del mismo tamaño que todas; con fondo, la foto entera se encuadra y el resto queda en blanco.
2. **El fondo lo quita MODNet en el navegador** (Apache-2.0, 26 MB, se descarga una vez por equipo), en un worker y
   siempre en CPU. Menos de 1 s por foto.
3. **Nadie sube una foto sin verla antes.** `RevisarFotosModal` muestra el resultado con la miniatura «Antes», y quien
   sube elige «Sin fondo» o «Con fondo». Sugiere sin fondo solo si el recorte encontró UNA prenda: que ocupe al menos
   2 % de la foto y llene al menos 30 % de su caja. Medido: una camisa en gancho llenó 79 %; los pedazos que dejó en
   una foto de tienda llena de ropa, 15 %.
4. **El original se guarda al lado**: `fotos/<id>.jpg` (la que se muestra) y `originales/<id>.jpg` (la foto tal cual,
   reducida a 2400 px). Mismo id, así que no hace falta una columna: si mañana cambia el fondo o el tamaño, se puede
   reprocesar sin volver a fotografiar.
5. **Se aceptan fotos de hasta 25 MB** (antes 5): ya no se suben tal cual, se reducen antes. Lo que llega al almacén
   sigue validado contra el límite de 5 MB del bucket.
6. **Sin botón para reprocesar el catálogo.** Las pocas prendas con foto ya las había editado un compañero con
   ChatGPT, y el resto no tiene foto: pasar el recortador sobre fotos ya limpias solo puede morderlas.

## Descarté (medido el 2026-09-26 en la Mac de Felipe)

- **BiRefNet_lite** (MIT, el que mejor recorta ropa): no corrió en ningún navegador. En el de Claude choca con el
  límite de la tarjeta gráfica (`maxStorageBuffersPerShaderStage` 10, necesita 11); en Safari 26.5 (límite 44) y en CPU
  se queda sin memoria (`std::bad_alloc`). Su entrada es fija de 1024 px, así que no se puede achicar. Si no corre en
  la Mac, tampoco en una tablet de tienda.
- **`@imgly/background-removal` e ISNet**: licencia AGPL, choca con vender el sistema a otra marca (CLAUDE.md).
  **RMBG-1.4/2.0**: licencia no comercial.
- **Photoroom** (US$0.02 por foto, servidor): calidad profesional en cualquier equipo. Felipe eligió lo gratuito con
  revisión. Si MODNet muerde demasiadas prendas, este es el reemplazo: se enchufa en `preparar-foto.ts`, sin tocar la
  revisión ni la subida.
- **WebGPU**: cambia de un equipo a otro (en el navegador de Claude falla). Siempre CPU, para que la Mac, la tablet y
  la PC de la tienda den el mismo resultado.
- **WebP**: Safari no sabe codificarlo desde un canvas (devuelve PNG sin avisar). Sobre blanco no hace falta
  transparencia: JPEG, de 200 a 300 KB por foto.

## El worker vive en `public/`, no en `lib/`

La primera versión era `lib/quitar-fondo.worker.ts` con `new Worker(new URL(…, import.meta.url))`. En `next dev`
funcionaba; el `next build` de Next 16.2 (Turbopack) no lo reconoció y copió el `.ts` crudo a `static/media`, así que en
Vercel el recortador no habría arrancado (hay regresiones abiertas en Next, vercel/next.js#98841). Se pasó a
`public/quitar-fondo.worker.js`, JavaScript plano que se sirve igual en los dos. Carga la librería fijada a 4.3.0 desde
jsDelivr: el modelo ya venía de Hugging Face y los binarios wasm de ONNX ya venían de jsDelivr, así que no suma un
proveedor nuevo. Además quedó fuera del `matcher` de `proxy.ts`, como `sw.js`: sin eso, alguien sin sesión recibía el
HTML del login donde el navegador esperaba JavaScript.

Si falla lo que sea (sin conexión, CDN caído, equipo sin memoria), la revisión ofrece solo «Con fondo» y lo dice: la
foto se encuadra igual. Visto a propósito en la prueba de producción, antes de corregir el `matcher`.

## Lo que hay que saber de MODNet

Está entrenado con personas. En la camisa de prueba dejó medio gancho y mordió un borde de la manga. Por eso la
revisión no es opcional. Una foto de catálogo mordida se ve peor que una con fondo, y eso solo lo decide alguien
mirándola.

## Se rompe si

- Alguien sube una foto al bucket sin pasar por `subirFotoProducto`: queda sin encuadre y sin original.
- Se cambia `LIENZO_FOTO` sin cambiar el `aspect-[4/5]` de las tarjetas: la grilla vuelve a recortar.
- Sin conexión y sin el modelo descargado, la revisión solo ofrece «Con fondo» y lo dice. La foto se encuadra igual.
