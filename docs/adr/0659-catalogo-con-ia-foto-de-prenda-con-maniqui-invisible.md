# ADR-0659 — «Catálogo con IA»: la foto de la prenda con maniquí invisible, el mismo molde en todos los colores

- **Fecha:** 2026-11-13 · **Estado:** construido en la rama `claude/photoroom-retail-integration-0e131e`. **Sin migración.** En producción no se ve hasta que
  Felipe ponga `OPENAI_API_KEY` en Vercel (sin la llave la opción no se dibuja y todo es como antes).
- **Nace de:** Felipe (2026-11-13): «tengo API de Photoroom gratis, quisiera integrarla para ver qué tal se ve» → al comparar, «ChatGPT me devuelve
  resultados mucho mejores» → «me gusta Ghost mannequin» → «ya me convencí, hay que integrarlo al subir una foto al ERP, con una opción que por defecto
  esté desactivada».
- **Relacionados:** ADR-0442 (la foto se sube tal cual; el armador lee el alfa del PNG), ADR-0228 (4:5), ADR-0434 (recortes del probador), ADR-0279 (fotos
  por color), ADR-0149 (loader y avisos), ADR-0146 (un aviso visto no vuelve), ADR-0389 (guías), ADR-0284 (guía de foco).
- **Investigación y medidas:** `docs/investigacion/2026-11-13-fotos-de-prenda-con-ia-opciones.md`. Maqueta elegida: `docs/maquetas/fotos-con-ia-2026-11/`
  (forma A). Ficha al milímetro: `docs/milimetro/catalogo-con-ia.md`.

## Contexto

El equipo limpia hoy cada foto a mano en ChatGPT (`docs/investigacion/2026-10-17-prompt-estandar-fotos-armador.md`) y la sube tal cual (ADR-0442). Funciona,
pero es una foto por conversación, unos 1–1,5 min cada una, y ChatGPT **no entrega transparencia real** (blanco o negro pintado): esas fotos quedan «sin
recorte» y no entran al armador de looks.

## Lo medido (2026-11-13, un top gris y una blusa verde limón colgados en el almacén)

| Opción | Aspecto | Color contra la prenda real | Transparente | Costo por foto |
|---|---|---|---|---|
| Photoroom, solo recorte (`segmentation.prompt=clothing`) | La prenda como colgaba | Igual (no redibuja) | Sí | 0,02 (plan) |
| Photoroom «Ghost mannequin» | Catálogo | **Cambia de una pasada a otra** (gris → beige; verde → amarillo) | Sí | 0,10 (plan Plus de 100 USD/mes) |
| ChatGPT (chat) | Catálogo | Cercano; redibuja el estampado | **No** | La suscripción, a mano |
| **OpenAI `gpt-image-2.6-sunburst` (API)** | **Catálogo, con volumen** | **«Igual a la prenda» en las dos** | **Sí** | **0,051** (0,061 con molde), por uso, sin mínimo |

**La misma prenda en todos los colores:** pedido por separado, cada color salía con su propia forma. Con la foto de catálogo del primer color como **molde**
(segunda imagen del pedido), la silueta (canal alfa) de otro color pasó de **93,8 % a 99,3 %** igual al molde en la blusa y de **92,5 % a 98,8 %** en el top;
sin molde, además, la etiqueta del cuello cambió de «L» a «M».

## Decisiones

1. **OpenAI `gpt-image-2.6-sunburst`, por uso.** Gana en color, aspecto y precio, entrega PNG transparente sin otro paso y no pide mínimo mensual (el volumen
   de CAYLA es chico y a saltos). El modelo se cambia con `OPENAI_IMAGEN_MODELO`, sin tocar código: se retiran rápido.
2. **Una opción apagada de fábrica**, «Catálogo con IA», en la línea del título de «Fotos por color» (Editar) y sobre la tabla de la prenda (Nuevo),
   recordada **por aparato** (`localStorage["cayla-catalogo-ia"]`, compartida por las dos pantallas). No es un módulo (ADR-0306): es parte de Productos.
3. **Hoja de ángulos:** frente (obligatoria), espalda y detalle de la tela (opcionales). Más fotos, menos inventa la IA lo que el gancho tapa.
4. **Sin bloquear:** «Preparar foto» cierra la hoja al instante y el color se prepara en su cuadro; se puede seguir con el siguiente (Felipe: «mientras no
   termina no puedo subir la que sigue»).
5. **Sin paso de revisión** (Felipe: «hay que omitir Revisar»): al terminar, la foto de catálogo queda sola como la del color, con «Con IA». El
   arrepentimiento es **«Usar mi foto»**, que vuelve a la real, siempre guardada.
6. **El primer color con foto de IA es el molde** de los demás; si todavía se prepara, los que vienen detrás lo esperan.
7. **El par se guarda junto, sin columna nueva:** la real tal cual en `fotos/<id>.<ext>` (como siempre, ADR-0442) y la de catálogo al lado,
   `fotos/<id>.<ext>.ia.png`. Desde el nombre se llega a la real («Usar mi foto») y se reconoce el molde. `catalogo_actualizar_producto` no cambia la URL de
   una fila que ya existe: «Usar mi foto» reemplaza la foto (quita una, agrega otra), y al guardar la base hace lo de siempre.
8. **Nuevo producto no sube nada antes de crear:** la de IA espera en el navegador junto a la real; al crear, el formulario **espera** a las que se están
   preparando y sube el par (o solo la real, con «Usar mi foto»).
9. **La IA nunca deja un color sin foto (principio 9):** sin llave, la opción no se dibuja; si OpenAI falla, se sube la real y se avisa «La IA no respondió:
   quedó tu foto de <color>». Los errores se dicen para la tienda (sin llaves ni saldos: «Avísale a tu líder»); el detalle va a `capturarError`.
10. **En el servidor:** `POST /api/fotos/catalogo` pide sesión y el módulo Productos, 12 pedidos por persona por minuto (freno contra un bucle que vacíe el
    saldo), 1 MB por foto (el navegador las achica a 1.600 px: Vercel no acepta más de 4,5 MB por pedido) y 2 min de espera (`maxDuration` 150).

## Descarté

- **Photoroom Ghost mannequin:** el color cambia de una pasada a otra y el plan obliga a 100 USD/mes. Queda solo en el laboratorio.
- **Gemini «Nano Banana 2.1»:** más barato, pero sin transparencia (haría falta otro servicio de recorte) y sin probar con nuestras prendas.
- **Revisar cada foto antes de usarla:** era la propuesta; Felipe la quitó. El control queda en «Usar mi foto» y en el aviso cuando la IA falla.
- **Una tabla o columna para el par:** el nombre del archivo basta y no toca la base.
- **Las formas B (toda la prenda de una vez) y C (bandeja del día):** maquetadas; quedan para después.

## Se rompe si

- Alguien cambia el nombre de las fotos de IA (`.ia.png`, `lib/foto-catalogo-reglas.ts`): «Usar mi foto» y el molde dejan de encontrar la real.
- OpenAI retira `gpt-image-2.6-sunburst`: la opción responde «no disponible» hasta cambiar `OPENAI_IMAGEN_MODELO`.
- Se guarda la ficha mientras una foto se prepara: la foto llega después como un cambio sin guardar (hay que guardar otra vez). Y si la persona sale de la
  pantalla a mitad, la que se preparaba se pierde sin aviso. Los dos quedaron anotados en el tablero de `/chaos`.

## Lo que se probó

- Laboratorio y ruta real con fotos de Felipe: 200, 1024×1280, ~32 % transparente, 0,051–0,065 USD, 25–29 s.
- Editar y Nuevo producto, en local: dos colores a la vez, el segundo esperó al molde y salió con la misma forma; «Crear» tocado al instante esperó y subió
  los dos pares; «Usar mi foto» subió la real.
- `/chaos`: doble clic (una llamada) e IA caída (la real queda y avisa), dos hallazgos cerrados el mismo día. `/milimetro`: 0 fallas de contraste en claro y
  oscuro. Guías: Nuevo producto en verde a 1440 y 375; Editar, el paso nuevo en verde (queda en rojo «Revisar y guardar», de antes).

## Actualización 2026-11-13 (b) — /formidable, /chaos y Recibir

- **/formidable** (`docs/formidable/catalogo-con-ia.md`): el panel grande de Editar muestra la foto que se prepara y «Con IA · Usar mi foto»;
  una foto que se prepara cuenta como cambio sin guardar (salir pregunta; «Revisar y guardar» y «Descartar» esperan); la foto «para todos los
  colores» no usa molde ni lo es; en Nuevo la miniatura de IA abre la vista grande.
- **/chaos** (semilla 1113, IA simulada): resiste. Sus tres hallazgos de gravedad 4 se cerraron: el foco vuelve al botón que abrió la hoja, la
  ruta mira la firma de los primeros bytes (`firmaDeImagen`) y rechaza lo que no es JPG, PNG ni WebP antes de llamar a OpenAI, y el aviso de
  Nuevo nombra el color (`avisoIANoRespondio`).
- **Recibir ▸ «Crear la prenda que llegó»** (Felipe: «que crear producto desde recibir mercadería también pida fotos y allí también esté lo de
  la IA»): en «Tallas y colores», una fila por color con su foto y «Catálogo con IA» (`FotosDeLaPrenda`, en `components/alta-producto/FotosDeColores.tsx`,
  la misma pieza que la tabla de Nuevo producto). Revierte la decisión del 2026-11-03 de dejar las fotos para Productos, **solo para quien puede
  guardarlas**: la regla es la de `producto_fotos` (`fn_puede_editar_catalogo`), que la hoja pregunta a `GET /api/fotos/catalogo` (`{ fotos, ia }`;
  `ia` además exige la llave y el módulo Productos, como el POST). Quien recibe sin editar el catálogo crea la prenda como antes. **Ningún permiso
  cambió.** Las fotos suben después de crear la prenda y esperando a la IA, como en Nuevo; una que falle no deshace la prenda y se avisa.

## Actualización 2026-11-14 — Puesta, pero la misma prenda («Nueva A», rama `claude/ai-color-extraction-64487e`)

Felipe, al ver la blusa verde limón: «me da la impresión que la alargó un poco… hay que tratar que sea lo más parecida posible». El pedido le
decía a la IA que rellenara la prenda «como si la llevara una persona de talla estándar», y eso la reformaba.

**Cómo se probó.** Cinco prendas pedidas a OpenAI como lo hace la pantalla (JPG de 1600 px, `1024×1280`, calidad media, transparente): la blusa
colgada en el almacén (su caja medida a mano, ±3 %) y cuatro fotos de producción en plano sobre blanco (top, pantalón, jean y short). La cifra es
la proporción alto/ancho de la prenda de la IA contra la de la foto. **Felipe eligió mirando una lámina** (`.flujo-de-negocio/laminas/`, local),
no por la cifra: en el pantalón y el short la foto está en plano, y puesta una prenda se cierra en la cintura y se ve más angosta.

| Pedido | Blusa | Top | Jean | Cómo se ve |
|---|---|---|---|---|
| El anterior («talla estándar») | +1 a +8 % | +1 % | +2 % | puesta, pero la alarga y le pone un elástico ancho |
| «Igual a la foto» (proporción y contorno de la foto) | −7 a +2 % | −1 % | −1 % | **copia el gancho**: hombros caídos, plana, sin arreglar |
| Calidad alta, o tamaño libre | −10 / −13 % | −2 / 0 % | −1 % | achata la blusa |
| **«Nueva A» (la elegida)**: el maniquí pone la forma, la prenda sus medidas | **0 a −3 %** | −2 a −3 % | ±1 % | puesta, con la manga murciélago ancha y el elástico fino |

`input_fidelity` (el ajuste de OpenAI para conservar detalles) no lo acepta `gpt-image-2.6-sunburst`. **Lo elegido** vive en
`lib/openai-imagen-reglas.ts`: `MANIQUI_PONE_LA_FORMA` (de frente, hombros llenos, volumen) y `PRENDA_PONE_SUS_MEDIDAS` (largo respecto del
ancho, corte, mangas, bordes y estampado), en el pedido de un solo frente (`PROMPT_CATALOGO`, el medido) y en el de varias fotos sin molde (sin
medir: las mismas reglas). El pedido con molde no cambia: copia la estructura de la primera foto, que ahora sale con su largo. **Lo que el pedido
no arregla:** el estampado se redibuja con las mismas figuras y colores, no en el mismo lugar exacto; para eso está «Usar mi foto». Cuesta lo
mismo (~0,05 USD, ~25 s).

**Sin etiquetas (Felipe, el mismo día: «hay que quitar las etiquetas de la prenda»).** Hasta aquí se pedía conservar las etiquetas cosidas;
ahora todos los pedidos (`SIN_ETIQUETAS`: solo frente, con molde y con varias fotos) piden quitar la del cuello, la de talla, la de composición,
la de la pretina y cualquier colgante o de precio, con la misma tela donde estaban. Probado con la blusa, un jean y un short, dos veces cada uno:
salieron las seis, y el largo no se movió (blusa −3 y −4 %, jean −1 y 0 %).
