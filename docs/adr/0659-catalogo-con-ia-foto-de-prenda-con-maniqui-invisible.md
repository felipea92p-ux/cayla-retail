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

## Actualización 2026-11-14 (b) — La ficha de la prenda: lo ya elegido viaja a la IA

**Nace de** un pantalón de lino beige, de pierna ancha y pretina elástica, sostenido a mano en el almacén (con la persona, su short beige y los
estantes en el cuadro): la IA lo devolvió como un buzo. Felipe: «que tomes sugerencia los tejidos ya seleccionados, porque eso se selecciona antes».

**Causa.** El pedido era el mismo para toda prenda y estaba escrito para blusas («interior del cuello», hombros, pecho, «puños, elástico»). Nada de lo
que la persona ya había elegido (categoría, tejido, patrón) llegaba a OpenAI: la IA adivinaba la tela de cómo colgaba la prenda.

**Decisiones** (`lib/ficha-foto-ia.ts`, `pedidoDeCatalogo(extras, ficha)`):

1. **La ficha.** `fichaParaIA` arma, con lo ya elegido (prefijo de la categoría, el tipo si la categoría junta dos, tejido, patrón), un bloque
   «DATOS DE LA PRENDA… mandan sobre lo que adivines de la foto». Va al FINAL de los tres pedidos: solo frente, con molde y con varias fotos. La tela
   usa el `queEs` de `tejido-ayuda.ts`: una sola fuente, no una frase nueva.
2. **Lo plano.** `TEJIDOS_PLANOS` (lino, oxford, gabardina, popelina, drill, denim, sastre, seda, gasa, organza, seersucker) suma «tejido PLANO, no de
   punto…». Algodón, jersey, franela, rib, licra, polar, piqué y suplex no entran: un buzo real tiene que seguir saliendo buzo. La prueba lo vigila como control.
3. **La zona.** `ZONA_POR_PREFIJO`: PAN, JEA, SHO y FAL cuelgan de la cintura. Su pedido habla de pretina y basta, «si es ancha y recta, sigue ancha y
   recta» y «no agregues elástico, puños ni cordón donde la foto no los muestra». Lo que cuelga de los hombros y lo sin zona (CON, LEN, una categoría
   que un Líder crea sin deploy) usa el pedido medido palabra por palabra: nunca la zona de otra (ADR-0290).
4. **Lo que sobra en la foto.** Siempre: «si la sostiene una persona, o hay otra ropa, manos o estantes, ignóralos».
5. **Lo que llega del navegador se limpia**, porque entra a un pedido que se paga: 40 caracteres, sin símbolos raros, prefijo `[A-Z0-9]{2,5}` y el tipo
   solo si es de esa categoría.
6. **Sin ningún dato**, el pedido es idéntico al medido.

Sin migración, sin cambio de pantalla y el mismo costo (~0,05 USD; unos tokens de texto más). La llevan Nuevo producto, Editar producto y Recibir ▸
«Crear la prenda que llegó» (`useCatalogoIA`, `useCatalogoIAAlta`).

**No medido todavía.** Falta la lámina de prueba: este pantalón de lino sostenido y en plano, un palazzo, un jogger y un buzo reales como control y
otra prenda de lino, con el pedido actual contra el nuevo, para que Felipe elija mirando como el 2026-11-14. Hasta entonces, el pedido de cintura es
una hipótesis razonada.

**Se rompe si** el equipo elige un tejido equivocado (la ficha manda: la IA lo dibujará así), o si se agrega una categoría de ropa a
`TIPOS_POR_CATEGORIA` sin decidir su zona (la prueba de totalidad falla, a propósito).

**La foto que la IA necesita** (para el equipo, sin código): la prenda sola en el cuadro, en plano o colgada de la pretina con pinzas; un fondo
distinto de su color; entera y con margen; el celular paralelo a la prenda; luz pareja. Y el ángulo «Detalle de la tela».

## Actualización 2026-11-16 (c) — El pedido de cintura, en positivo (fase 2 del «pantalón que sale buzo»)

**Nace de** el mismo pantalón de lino del 14-nov (Felipe 2026-11-16: «el de lino del 14-nov»). La ficha de esa fecha nunca se probó contra su propio
caso: el laboratorio de fotos sigue mandando el pedido de blusa (`app/api/fotos/laboratorio/route.ts` llama `camposOpenAI(modelo, { conMolde })`, sin
ficha ni zona), así que ninguna lámina midió un pantalón con el pedido de cintura.

**Diagnóstico (leído del código, sin llamar a OpenAI).** El pedido de cintura pedía «la pretina y la basta con el mismo ancho y el mismo **fruncido**»
(una basta fruncida es el puño de un jogger), «con **volumen 3D**» y «la cintura y las caderas **con volumen**» (inflan la pierna), y nombraba
«elástico, puños ni cordón». El pedido **con molde** no miraba la zona: copiaba «las mangas, el cuello, el elástico» y tomaba de la foto real «SOLO el
color», así que la textura salía del molde. La ficha decía «sin pelusa ni textura de felpa, de algodón de buzo o de ropa deportiva»: las guías de Google
(Gemini), Ideogram y BFL piden describir lo que se quiere, no lo que se evita, porque el modelo se engancha a la palabra que sigue a «no».

**Decisiones de Felipe (2026-11-16):** cambiar el texto **sin medir** con una lámina (se le advirtió: es la misma apuesta del 14-nov), y «en
Pantalones solo hay pantalones de tela». **Los datos contradicen esa segunda premisa:** en producción hay 4 prendas activas de punto en Pantalones
(PAN-0010 y PAN-0011, buzos de franela; PAN-0027, legging de Licra; PAN-0028, «Buzo Mirahme» con el tejido genérico «Tela»), y 8 jeans que no son
rectos (flare, globo, mom). Por eso **la basta la decide el TEJIDO, no la categoría**, y solo una tela claramente plana se afirma.

**Lo que cambió** (`lib/openai-imagen-reglas.ts`, `lib/ficha-foto-ia.ts`, y el molde en `useCatalogoIA.tsx` / `useCatalogoIAAlta.tsx`):
1. **El cuerpo del pedido de hombros no cambió ni una letra.** Es lo único medido (99 % de la silueta). Una prueba congela sus siete huellas sha256.
   La **ficha** que va al final de TODO pedido sí cambió (no estaba medida): otras dos huellas, de una blusa de seda y un chaleco de sastre con su
   ficha, hacen que un cambio en ella no pase sin verse.
2. **Tres formas de cintura** (`FormaDeCintura`): «pierna-suelta» (Pantalones y Jeans de tela claramente PLANA, `TEJIDOS_PLANOS`, o sin tejido),
   «pierna» (Shorts, y Pantalones o Jeans de cualquier otra tela: de punto, elástica o ambigua —franela, licra, «Algodón», «Tela», «Algodón alicrado»,
   «Mojado»—: un jogger de algodón existe) y «falda».
3. **El pedido de cintura, en positivo:** la prenda PUESTA sin «volumen 3D»; la caída («las piernas caen con el peso de la tela») solo en «pierna-suelta» y
   falda, una sola vez (a un legging le contradiría lo ceñido); la PRETINA va sola, con su cierre (botón y bragueta, o elástica; en la falda, al frente,
   al costado o elástica) y «donde una mano la sostiene, la arruga es de la mano»; la PIERNA «con la misma forma que en la foto… si se abre o se cierra
   hacia abajo, igual… si tiene volumen, lo conserva» (nunca se le fija un ancho: un flare, un globo o un mom no se enderezan); la BASTA de
   «pierna-suelta», «suelta, donde termina en la foto, con su mismo ancho y su mismo acabado (dobladillo, vuelta o borde)» (sin nombrar el tobillo: un
   culotte o un capri terminan a media pierna); la de «pierna», «como en la foto»; la falda, VUELO y RUEDO. Ninguno nombra puño, cordón, felpa, jogger ni buzo (lo vigila una prueba).
4. **Con molde, una prenda de cintura copia su FORMA y toma de la foto real la TEXTURA**; la basta de «pierna-suelta» NO sale del molde («suelta…
   aunque el molde la muestre distinta»: un molde viejo con puño de jogger no la pasa a los demás colores), y «si el MOLDE contradice los DATOS DE LA
   PRENDA, mandan los datos».
5. **Rehacer el color que ES el molde va sin molde** (`moldeAlPreparar`, la misma regla con la que la hoja dice «misma forma que…»): rehacer la foto
   que salió buzo mandaba ese mismo buzo como molde, o un segundo color copiado de él.
6. **La ficha**: «Es un pantalón de tela plana, de vestir o casual» para «pierna-suelta» aunque el tejido falte; la frase de tejido plano ya no habla de
   caída (a un chaleco de Sastre, una blusa de organza o un jean globo les contradecía su tela); y las cláusulas de la ayuda escritas
   para personas (el proveedor, la etiqueta, «elige Seda») no van al pedido, sin perder el dato de la tela de la misma frase.

**Se rompe si** una prenda de punto tiene elegido un tejido claramente plano (un buzo marcado «Lino» recibe la basta suelta), o si un pantalón de tela
plana tiene un tejido ambiguo («Algodón», «Tela»): recibe «pierna», que no lo defiende del buzo. Lo que manda es el tejido bien elegido.

**Sigue sin medir.** Lo que lo mediría sin costo: que el laboratorio use `pedidoDeCatalogo` con la ficha (hoy manda el de blusa) y una medida pura del
canal alfa (ancho de la basta ÷ ancho de la rodilla; un puño se ve como un ensanche justo antes de la basta). Una lámina de 6 prendas × 3 variantes
cuesta ~0,90 USD.

## Actualización 2026-11-16 (d) — La prenda sale PLANCHADA, con la textura de su tejido

**Nace de** el pantalón de lino Crudo (Felipe 2026-11-16, con la captura de la hoja «Fotos de Crudo»): «sale con arrugas y da un mal aspecto… ahora sí
comprendo que la tela es lino, antes no se diferenciaba, pero quiero retocar las arrugas sin perder el tipo de tela».

**Diagnóstico (leído del código).** La ayuda del tejido escrita para PERSONAS viajaba a la IA, y la del lino dice «Se arruga (es parte de su gracia)»: el
pedido le contaba al modelo que el lino se arruga y que eso es lo lindo. Ningún pedido decía cómo debía verse la tela de la foto de catálogo.

**Lo que cambió** (`lib/ficha-foto-ia.ts`, solo la ficha):
1. **La ficha pide la prenda PLANCHADA**, en positivo y sin la palabra «arrugas» (el modelo dibuja la palabra que lee, act. (c)): «recién planchada al
   vapor, como para una sesión de fotos, aunque en las fotos que te doy no lo esté: la tela tersa y bien estirada, con la textura de su tejido a la vista
   (la trama, el grano y el brillo o lo mate que tiene en la foto real). Se quedan los pliegues y las pinzas que son del diseño». «Tersa» y no «lisa»
   («liso» es un diseño: la IA podría borrar unas rayas). «Aunque en las fotos que te doy no lo esté» cubre también el MOLDE, que pudo salir arrugado.
2. **La textura queda nombrada al lado**: el lino conserva «de textura rústica con nudos visibles» y «es un tejido PLANO: se ve su trama».
3. **Lo que le dice a una persona que la tela SE ARRUGA no va a la IA** (`diceQueSeArruga`: lino, algodón, viscosa). Lo que dice que casi NO se arruga,
   o MENOS (jersey, poliéster, gabardina), se queda con su frase.
4. **El seersucker no se plancha** (`TEJIDOS_CON_RELIEVE`): su fruncido es el tejido.
5. **El cuerpo medido no cambió ni una letra** (sus siete huellas siguen iguales); la huella de la ficha (blusa de seda, chaleco de sastre) se actualizó.

**Esto vuelve sobre una decisión de octubre** (`docs/investigacion/2026-10-21-prompt-edicion-minima-fotos.md`): pedir «quita arrugas» en el pedido de
EDICIÓN MÍNIMA hacía que ChatGPT regenerara la prenda (rayas más gruesas, cuello redibujado). Hoy el pedido ya es de regeneración (maniquí invisible,
«el estampado se redibuja con las mismas figuras»), así que el riesgo sumado es menor, pero **no está medido**. **Se rompe si** una prenda RAYADA o con
estampado fino sale con el dibujo cambiado: entonces «Usar mi foto» vuelve a la real, y la regla se puede limitar a las prendas de diseño liso.

**Una ficha `null` no lo recibe:** sin tipo, tejido ni patrón el pedido sigue siendo el medido, palabra por palabra (como desde el 14-nov).

**Las fotos ya hechas no cambian solas:** se rehacen subiendo de nuevo la foto real del color con «Catálogo con IA» encendido, empezando por el color
que sirve de molde (el primero con foto de IA), para que los demás copien una forma ya planchada.

## Actualización 2026-11-16 (e) — Planchada, pero sin perder la tela

**Nace de** la primera foto hecha con la act. (d), el pantalón de lino Crudo (Felipe 2026-11-16, mirando la hoja «Fotos de Crudo»): «es más liso pero
pierde la tela». La IA cumplió «tersa y bien estirada», «recién planchada al vapor», y alisó el lino hasta volverlo otra tela.

**Lo que cambió** (`lib/ficha-foto-ia.ts`, solo la ficha; el cuerpo medido sigue igual):
1. **Se quita solo lo que deja el guardarla:** «sin los dobleces ni las marcas de haberla guardado, doblado o colgado». Salen «tersa», «bien estirada»
   y «al vapor».
2. **La TELA va primero:** «la misma de la foto real y se ve de cerca: su trama, sus hilos, su grano y su acabado mate o brillante, sin alisarla de
   más», y **la foto de cerca de la tela manda** si se subió (el ángulo «Detalle de la tela» de la hoja de la IA).
3. **El lino dice cómo se ve planchado** (`SE_VE_PLANCHADA`): «hilos irregulares con nudos, aspecto mate y rústico, y unas ondas suaves y naturales en
   la tela, propias del lino». Otro tejido entra a esa tabla solo después de verlo salir mal: la regla general vale para los demás.

**Sigue sin medir** con una lámina: es la segunda apuesta del día sobre el mismo pantalón. Lo que más ayuda sin tocar el pedido: subir también la
foto de cerca de la tela (con luz de costado se ven los nudos del lino).

## Actualización 2026-11-16 (f) — Tres acabados de la tela, para elegir mirando en el laboratorio

**Nace de** la segunda foto del lino Crudo con la act. (e): también salió lisa (Felipe: «se sigue perdiendo el tipo de tela»). La foto sí salió con
el pedido nuevo (publicado 22:25:26, pedida ~22:28; la ficha del pantalón dice Pantalones, Lino, Liso). **Diagnóstico:** en la foto real,
sostenida a mano en el almacén, lo único que dice «lino» son las arrugas; desde esa distancia no se ven los hilos ni los nudos. Al pedirle
planchada, la IA quita la única pista y rellena con una tela genérica: no puede copiar una trama que no ve, se la nombre como se la nombre.

**Felipe eligió** (de cuatro caminos: probar con la foto de cerca, comparar tres versiones, que el lino conserve sus arrugas, o calidad alta)
**comparar tres versiones de la misma foto y decidir mirando.** Producción no cambia hasta que elija.

**Lo que cambió:**
1. `fichaParaIA(datos, { acabado })` (`lib/ficha-foto-ia.ts`) con tres acabados (`ACABADOS`): **«planchada»** (la de hoy, la de fábrica: el pedido de
   producción sale palabra por palabra igual, lo vigilan sus huellas), **«arrugas-finas»** (sin los dobleces de guardarla, pero con «las arrugas
   finas y naturales de su tela, repartidas parejo»: aquí SÍ se nombran, es lo que se mide) y **«sin-planchar»** (ninguna línea de acabado). El
   seersucker no lleva ninguno.
2. **El laboratorio (`/laboratorio/fotos`, solo fuera de producción) arma el MISMO pedido que producción** (`pedidoDeCatalogo` con la ficha), que
   hasta hoy mandaba el de blusa sin ficha. Con «Comparar acabados» encendido, cada foto pide las tres versiones lado a lado, con la ficha
   (categoría, tejido, patrón; de fábrica, el caso medido: Pantalones, Lino, Liso), la foto de cerca de la tela si se sube, y el molde si se elige.
   Tres llamadas por foto (~0,18 USD); cada versión dice lo que costó.

**Qué sigue:** correr el laboratorio con la foto real de Crudo (y, si se puede, con una foto de cerca de la tela), mirar las tres versiones y
elegir. Lo elegido pasa a ser el acabado de fábrica, o solo el del lino si las demás telas salen bien planchadas.

## Actualización 2026-11-17 (g) — El lino sale «con arrugas finas» de fábrica

**Nace de** la tercera foto planchada del lino Crudo, mirada junto a las dos de antes (Felipe 2026-11-17): «se sigue viendo de esta forma, se ve
peor». Tres fotos planchadas, tres veces el lino perdió lo que lo hace lino. El laboratorio de la act. (f) existe, pero corre en local con la llave,
y Felipe prueba en producción.

**Lo que cambió** (`lib/ficha-foto-ia.ts`): `ACABADO_POR_TEJIDO = { lino: "arrugas-finas" }`. Sin acabado pedido, el lino sale «con arrugas finas»
(lo que Felipe pidió al principio: «retocar las arrugas sin perder el tipo de tela»): sin los dobleces de guardarla, con las arrugas finas y parejas
de una tela natural, y la textura de la foto real. Las demás telas siguen «planchada» (no hay evidencia de que les vaya mal); el laboratorio sigue
pidiendo el acabado que se le diga. Las huellas de la blusa de seda y el chaleco de sastre no cambiaron.

**Aquí SÍ se nombran las arrugas** (lo de octubre, «quita arrugas», redibujaba rayas): el lino de esta prueba es liso, sin rayas que redibujar. **Se
rompe si** un lino rayado sale con las rayas cambiadas; entonces «Usar mi foto». **Si tampoco convence**, lo siguiente es `lino: "sin-planchar"`
(las fotos de antes, con sus arrugas): una línea.
