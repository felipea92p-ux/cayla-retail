# Fotos de prenda con IA: qué API conviene a CAYLA

**Fecha:** 2026-11-13 · **Estado:** investigación + prueba con 2 fotos reales en el laboratorio local (`/laboratorio/fotos`). **Nada decidido:** la
elección es de Felipe, después de probar con 10–15 prendas.
**Relacionado:** ADR-0442 (la foto se sube tal cual; el armador solo acepta PNG transparente), `2026-10-21-prompt-edicion-minima-fotos.md` (piloto
de ChatGPT: redibuja la prenda), `2026-10-17-prompt-estandar-fotos-armador.md` (el prompt del equipo).

## Lo que CAYLA necesita de una foto

Sale de una foto de celular de la prenda colgada en el almacén (gancho de madera, perchero, anaqueles detrás) y tiene que llegar a:

1. **Aspecto de catálogo**: de frente, sin gancho ni perchero, ordenada (lo que hoy hace ChatGPT a mano y le gustó a Felipe).
2. **Color y estampado fieles**: lo que la clienta ve es lo que le llega. Es lo más difícil y lo más importante.
3. **Transparencia real (PNG con alfa)**: el armador de looks apila prendas; una foto con fondo pintado queda «sin recorte» (ADR-0442).
4. **Automático dentro del ERP**: al subir la foto, sin abrir otra herramienta.
5. **Pago por uso**: el volumen es chico y a saltos (lotes cuando llega una colección). Un plan mensual con mínimo se desperdicia.

## Lo que ya medimos (2026-11-13, top gris de cuello caído y blusa verde limón floreada)

- **Photoroom, solo recorte** (`/v2/edit` con `segmentation.prompt=clothing`): limpio, sin ganchos ni perchero, color real. Sin la palabra
  «clothing» se queda con los ganchos y el palo del perchero. No endereza ni plancha: la prenda queda como estaba colgada.
- **Photoroom Ghost mannequin**: aspecto de catálogo y transparente, pero **el color cambia de una pasada a otra con la misma foto** (el gris salió
  gris y beige; el verde limón, verde y amarillo) y la pose también (de frente o de tres cuartos) hasta que se le pide «front view». Pedirle «mantén
  el color» lo empeoró. Inventa detalles (el elástico del bajo salió fruncido).
- **ChatGPT (chat)**: el mejor aspecto, color algo más cercano, pero redibuja el estampado (las flores cambian de lugar) y **no entrega
  transparencia** (blanco o negro pintado). Ya lo había visto el piloto del 2026-10-21 (rayas, etiquetas cosidas).

**Conclusión de la prueba:** ninguna IA que redibuja garantiza el color. Toda opción generativa necesita que una persona compare con la prenda real
antes de publicar, y conviene que el ERP la ayude (la insignia de color del laboratorio mide la diferencia contra el recorte fiel).

## Las opciones (precios oficiales salvo donde se indica)

| Opción | Qué hace | USD por foto | Cómo se paga | Transparente | Probado con nuestras fotos |
|---|---|---|---|---|---|
| **A. OpenAI `gpt-image-2.6-sunburst`** (edición) | Redibuja como ChatGPT; Sunburst es el modelo «para cuando importa la precisión de la edición» | ~0,03–0,10 (estimado: OpenAI cobra por tokens y no publica tabla por foto) | Por uso, sin mínimo; puede pedir verificar la organización | **Sí** (`background: transparent`, png/webp) | No |
| **B. Google Gemini «Nano Banana 2.1»** (`gemini-nano-banana-2.1`) | Edita con instrucciones; acepta 4:5 nativo | ~0,035 (1K) · ~0,052 (2K) | Crédito prepago desde 5 USD, disponible en Perú; sin capa gratis para imágenes | **No** (solo JPEG): necesita un recorte después (+0,01–0,02) | No |
| **C. Photoroom Ghost mannequin** | Maniquí invisible | 0,10 | **Plan Plus de 100 USD/mes** (1.000 imágenes que no se acumulan) | Sí | **Sí**: color inestable |
| **D. Solo recorte fiel** (Pixian, Bria RMBG, Photoroom Basic) | Quita el fondo, no redibuja | Pixian ~0,01 · Bria 0,018 (0,025 guiado por texto) · Photoroom 0,02 | Pixian y Bria por uso sin mínimo; Photoroom Basic con plan | Sí | Photoroom sí (bien); Pixian y Bria no |
| Descartadas: Photta (~0,48 y sin transparencia), Runflow (parte de una foto con modelo), FASHN, Claid, Pixelcut, Picsart (sin maniquí invisible por API), WeShop, Botika, Booth, Caimera (sin API o sin precio público) | | | | | |

**Costo al mes con ~150 fotos** (ejemplo): A ≈ 5–15 USD · B + recorte ≈ 7–10 USD · C = 100 USD fijos · D ≈ 1,5–3 USD.

## Recomendación

1. **Arquitectura, sea cual sea la IA: dos imágenes por foto.** El recorte fiel (D, centavos) siempre, como referencia del color verdadero y como
   respaldo; la versión de catálogo (A o B) al lado. El ERP compara las dos y avisa cuando el tono se fue (`veredictoDeColor`), y una persona
   aprueba la de catálogo antes de publicarla. Si no se aprueba, se publica el recorte fiel. Así un mal resultado nunca llega solo a la tienda.
2. **Para la versión de catálogo, probar A y B en el laboratorio contra C**, con 10–15 prendas de colores difíciles (blanco, crema, gris, estampados,
   rayas, una con etiqueta cosida). La prueba cuesta menos de 5 USD. Favorita en el papel: **A (OpenAI 2.6 Sunburst)**: es la familia de lo que ya
   gustó en ChatGPT, entrega transparencia sin otro paso y se paga por uso. **B (Gemini 2.1)** es la más barata y acepta 4:5 nativo.
3. **Photoroom queda para el recorte** (si se elige un plan) o se reemplaza por Pixian/Bria, que no piden mínimo mensual. Su maniquí invisible no
   gana en calidad y su plan de 100 USD no calza con el volumen.

## Qué falta para la prueba

- Una llave de **OpenAI** (platform.openai.com, cuenta aparte de ChatGPT Plus, con medio de pago) y/o una de **Gemini** (aistudio.google.com,
  crédito prepago de 5 USD). Van en `apps/web/.env.local`, nunca en el chat ni en Vercel.
- Sumar los dos perfiles al laboratorio (`lib/photoroom-reglas.ts` se generaliza a un proveedor por perfil).

## Advertencias

- OpenAI no publica precio por foto para 2.6: el rango sale de su calculadora (vía terceros) y de las tarifas por token. Se confirma con el uso real.
- Los modelos cambian rápido: `gpt-image-1` ya se apagó, `gpt-image-1.5` se apaga el 2026-12-01 y `gpt-image-2` el 2027-02-10; en Gemini,
  `gemini-2.5-flash-image` el 2027-03-15. Lo que se integre debe poder cambiar de modelo con una línea.
- Gemini marca todo con SynthID (invisible). Photoroom sandbox, con marca visible.
- No se verificaron: el precio de Picsart (0,0011 USD, sospechoso), el de Claid por API, BiRefNet en fal, remove.bg oficial.

## Actualización 2026-11-13 (tarde): OpenAI probado con las mismas dos fotos

`gpt-image-2.6-sunburst`, edición con el prompt de «edición mínima» (`lib/openai-imagen-reglas.ts`), 1024×1280, calidad media, fondo transparente:

| | Photoroom maniquí invisible | OpenAI 2.6 Sunburst |
|---|---|---|
| Top gris | Gris → algo más beige («cambió un poco») | **«Color: igual a la prenda»**; cuello caído conservado, sin gancho |
| Blusa verde limón | → amarilla y más oscura («cambió, revisa el tono») | **«Color: igual a la prenda»**; de frente, mangas y elástico como la real |
| Armador | Entra listo | **Entra listo** (transparencia real, sin otro paso) |
| Costo medido | 0,10 (plan de 100 USD/mes) | **0,051 USD por foto** (del `usage` de la respuesta), por uso |
| Marca de agua | Sí (sandbox) | No |

**Lectura:** con dos prendas, OpenAI gana en color, aspecto y precio. Sigue siendo una IA que redibuja: el estampado de la blusa es del mismo tipo y
tamaño, pero hay que mirarlo de cerca prenda por prenda. Falta la prueba con 10–15 prendas difíciles (blanco, crema, rayas, etiqueta cosida, jean)
antes de decidir; a 0,05 USD por foto cuesta menos de 1 USD.

**Con volumen (pedido de Felipe, mismo día):** la primera versión quedaba plana. Con el pedido de «maniquí invisible» (la prenda puesta, hombros,
pecho y cintura rellenos, sin maniquí ni persona a la vista; `PROMPT_CATALOGO`), las dos salieron como foto de catálogo, de frente, con el color
de la prenda real y limpias sobre oscuro. Mismo costo: 0,0507 USD por foto (1.530 tokens de imagen de entrada, 202 de texto, 1.248 de salida) y ~25 s.
A mirar: en la blusa dibujó una etiqueta de talla «L» en el cuello (la real tiene una etiqueta ahí, pero no se lee cuál).

**La misma prenda en todos los colores (pedido de Felipe, mismo día):** el primer color queda como molde y cada color siguiente se pide con su foto y el
molde (`PROMPT_CON_MOLDE`, dos imágenes en `/v1/images/edits`). Silueta (canal alfa) contra el molde: blusa 93,8 % → **99,3 %**, top 92,5 % → **98,8 %**;
sin molde cambió la etiqueta «L» por «M». 0,061 USD por foto. Probado de punta a punta en el laboratorio («Usar como molde»).

## Fuentes

- OpenAI: [Images 2.6](https://openai.com/index/introducing-images-2-6/), [precios](https://developers.openai.com/api/docs/pricing),
  [guía de imágenes](https://developers.openai.com/api/docs/guides/image-generation), [referencia de edición](https://developers.openai.com/api/reference/resources/images/methods/edit),
  [retiros](https://developers.openai.com/api/docs/deprecations), [precio por foto estimado (eesel)](https://www.eesel.ai/blog/chatgpt-images-2-6-pricing).
- Google: [generación de imágenes](https://aistudio.google.com/docs/image-generation), [precios](https://aistudio.google.com/docs/pricing),
  [retiros](https://aistudio.google.com/docs/deprecations), [regiones](https://aistudio.google.com/docs/available-regions), [facturación](https://aistudio.google.com/docs/billing).
- Photoroom: [precios](https://www.photoroom.com/api/pricing), [Ghost mannequin](https://www.photoroom.com/api/ghost-mannequin), [documentación de precios](https://docs.photoroom.com/getting-started/pricing.md).
- Recorte: [Pixian](https://pixian.ai/pricing), [Bria](https://bria.ai/pricing), [FASHN](https://help.fashn.ai/plans-and-pricing/api-pricing),
  [Pixelcut](https://www.pixelcut.ai/), [Picsart](https://picsart.com/api-platform), [Claid](https://claid.ai/api-pricing).
- Moda: [Photta](https://photta.app/pricing), [Photta ghost mannequin API](https://photta.app/api/ghost-mannequin-api), [Runflow](https://www.runflow.io/api/on-model-removal).
