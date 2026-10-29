# Cómo nombran sus prendas las grandes tiendas de moda, y cómo debería hacerlo CAYLA

- **Fecha:** 2026-10-28 · **Pedido:** Felipe: «investiga a las tiendas más grandes de moda del mundo y analiza los estándares
  que usan para nombrar sus prendas: ¿solo el tipo y un nombre? ¿el tipo, el nombre y una característica? Compara, evalúa cuál
  serviría para CAYLA y propón una manera».
- **Método:** búsqueda web sobre las fichas publicadas (Zara, H&M, Mango, Massimo Dutti, Uniqlo, Shein, Levi's, Nike, Aritzia,
  Reformation) y lectura del código actual de CAYLA (`apps/web/lib/sugerencias-alta-producto.ts`, `lib/nombres-parecidos.ts`,
  `retail.productos`).
- **Límite importante:** **ninguna de estas casas publica su manual de nombres.** Todo lo de abajo se deduce leyendo sus fichas.
  Etiquetas: **VISTO** (el nombre aparece tal cual en su tienda o en un buscador) · **CONOCIDO** (dato público y estable, no
  vuelto a abrir en esta búsqueda) · **INFERIDO** (lectura nuestra del patrón).

## Resultado en tres líneas

1. **Las grandes no usan una sola fórmula: hay cuatro escuelas.** Descriptiva (Zara, H&M, Mango, Massimo Dutti, Uniqlo), nombre
   propio (Reformation, Sézane, Anthropologie), modelo-ícono o franquicia (Levi's 501, Lululemon Align, Aritzia Effortless Pant,
   Nike Air Force 1) y cadena de palabras clave para buscadores (Shein y los marketplaces).
2. **Las que venden volumen masivo describen; las que venden a una clienta que vuelve, bautizan.** El nombre propio sirve para
   *pedir* una prenda («la Juliette», «el 501»); la descripción sirve para *encontrarla* cuando no la conoces.
3. **Para CAYLA: las dos capas, como Reformation y Aritzia.** El nombre que se dice sigue siendo `Tipo + Nombre propio`
   («Blusa Aurora», lo que CAYLA ya hace), y al lado va una **línea descriptiva que se arma sola** con lo que la ficha ya sabe
   (corte, largo, detalle, tejido). El color y la talla **nunca** van en el nombre. Ver §5.

## 1. Las cuatro escuelas

### 1.1 Descriptiva: «qué es + cómo es» (Zara, H&M, Mango, Massimo Dutti, Uniqlo, Gap, COS)

Fórmula: **`[Tipo] + [corte / largo] + [tejido o acabado] + [detalle] (+ línea)`**, sin nombre propio. La prenda se distingue por
su **referencia numérica**, no por su nombre.

| Casa | Ejemplos tal como salen | Lo que se ve |
|---|---|---|
| **Zara** (VISTO) | «VESTIDO MIDI SATINADO ZW COLLECTION», «PANTALÓN BARREL RAYAS ZW COLLECTION» | Tipo primero, luego largo/corte, tejido o estampado; «ZW COLLECTION» marca una línea, no todas las prendas la llevan. En mayúsculas. |
| **H&M** (VISTO) | «Regular Fit Felted overshirt», «Oversized Fit T-shirt» | El **calce va primero**, luego el tipo. Dos referencias distintas comparten el mismo nombre exacto: el nombre no identifica. |
| **Mango** (VISTO) | «Asymmetrical bow-neck dress», «Printed dress with turn-down neckline» | Detalle + tipo, y el número de referencia en la URL y la ficha. |
| **Massimo Dutti** (VISTO) | «Slim fit 100% linen shirt», «Regular fit shirt with stand collar» | Calce + composición + tipo; el **color va en otra línea**, nunca en el nombre. |
| **Uniqlo** (VISTO) | «AIRism T-shirt», «AIRism Bra Top» | Tecnología del tejido + tipo: el material ES la marca de la prenda (AIRism, HEATTECH, Ultra Light Down). |

**Por qué lo hacen así (INFERIDO):** sacan miles de modelos por temporada: no hay
nombres propios suficientes ni tiempo de bautizarlos, y venden en decenas de idiomas, donde la descripción se traduce sola y un
nombre inventado no. El nombre trabaja para el buscador y para quien no conoce la prenda.

**El costo:** nadie pide «el vestido midi satinado»: hay veinte iguales. En tienda, la colaboradora termina buscando por foto o
por código.

### 1.2 Nombre propio: «el nombre de alguien + qué es» (Reformation, Sézane, Anthropologie, M.M. LaFleur)

Fórmula: **`[Nombre propio] + [Tipo]`** — «Juliette Dress», «Blouse Victoire» (CONOCIDO). La descripción (corte, tejido) vive en
la ficha, debajo, no en el nombre.

- Es una costumbre de la alta costura: Jeanne Paquin bautizaba sus modelos ya a fines del siglo XIX para que la clienta los
  **pidiera por su nombre** en vez de por un número o por «el negro» (Victoria & Albert Museum, VISTO).
- Da identidad: el nombre de una persona hace pensar en *quién* la usa. Reformation construye toda su marca sobre esa persona
  («la chica cool a la que le importa»). En M.M. LaFleur las prendas llevan el nombre de colaboradoras o de sus madres (VISTO).
- **El costo:** el nombre solo no dice qué es la prenda; por eso siempre va pegado al tipo, y la descripción se muestra aparte.

### 1.3 Modelo-ícono o franquicia (Levi's, Lululemon, Aritzia, Nike)

Fórmula: **`[Nombre del modelo] + [variante]`**, y el nombre **sobrevive a las temporadas**.

- **Levi's 501** (VISTO): el número nació hacia 1890 como un simple código de producto; hoy funciona como el nombre del corte
  (501 recto, 505 más holgado, 511 slim). Un código que se volvió marca.
- **Aritzia «The Effortless Pant™»** (VISTO): un mismo nombre con versiones —«Effortless Cropped Pant», «Effortless Linen Pant»—;
  la variante dice largo o tejido. Cada ficha tiene «conoce el significado de su nombre».
- **Lululemon Align, Define, Scuba** (CONOCIDO): el nombre es el modelo y se reedita en decenas de colores y largos.
- **Nike Air Force 1** (VISTO): modelo + versión + apodo del color entre comillas («Air Force 1 '07 'Tech Tuff'»).

**Por qué funciona:** el cliente vuelve a pedir *ese* calce. Solo se gana con prendas que se repiten año tras año: un modelo que se
vende una temporada no llega a ser franquicia.

### 1.4 Cadena de palabras clave (Shein, marketplaces)

Fórmula: **todo lo que alguien podría buscar**, en una línea. Ejemplo real (VISTO): «Women's Elegant Solid Color Sleeveless Dress
Suitable For Vacation Back To School Music Festivals Christmas Mother's Day Easter Graduation Season»; hay títulos de más de 60
palabras. Sirve al algoritmo del buscador, no a una persona; las guías de títulos de comercio electrónico recomiendan no pasar de
~60 caracteres y no rellenar con palabras clave (digitalcommerce.com, VISTO). **Descartado para CAYLA.**

## 2. Comparación

| | Descriptiva (Zara) | Nombre propio (Reformation) | Ícono (Levi's, Aritzia) | Palabras clave (Shein) |
|---|---|---|---|---|
| Qué dice el nombre | qué es y cómo es | quién es | qué modelo es | todo |
| ¿Se puede **pedir** de palabra? | No («el vestido negro midi…») | **Sí** | **Sí** | No |
| ¿Se **entiende** sin foto? | **Sí** | Solo con el tipo al lado | Solo si lo conoces | Sí, pero agota |
| ¿Es **único**? | No (dos iguales, H&M) | Sí, si se cuida | Sí | No |
| Esfuerzo por modelo | Bajo (sale de los atributos) | Hay que bautizar | Muy bajo, una vez | Bajo |
| Volumen que aguanta | Miles por temporada | Cientos | Pocos modelos | Infinito |
| Color en el nombre | No (línea aparte) | No | Solo como apodo (Nike) | Sí |

**Lo que comparten todas las serias:** el **tipo de prenda siempre está en el nombre** (nadie vende solo «Juliette»), y **el
color y la talla nunca** (son variantes). Y todas tienen además un **código** que es el que de verdad identifica.

## 3. Qué hace CAYLA hoy

- **El nombre ya es `Tipo + Nombre propio`:** en `retail.productos.referencia` («Blusa Emma», «Vestido Sofía», «Casaca Luciana»),
  con su código por categoría (`CMS-0001`, `VES-0001`) y una `descripcion` aparte («Vestido midi con cinturón»). Leído en la base
  local; **no se revisó producción** (vive en el proyecto de Dynamic, fuera de este acceso).
- Nuevo producto enseña esa forma con un ejemplo por categoría (`FICHAS_POR_CATEGORIA` en `lib/sugerencias-alta-producto.ts`: «Blusa
  Aurora», «Pantalón Ámbar») y avisa si el nombre se parece a otro que ya existe (`lib/nombres-parecidos.ts`).
- **Lo que falta, y es lo que hace las cosas frágiles:**
  1. **Nadie fija qué es el «nombre propio».** En los ejemplos conviven nombres de mujer (Emma, Sofía), de naturaleza (Aurora,
     Brisa) y descripciones metidas en el nombre («Pantalón Palazzo Brisa», «Falda Plisada Luna»). Sin regla, cada persona
     inventa la suya.
  2. **El tipo se escribe a mano**, aunque la categoría ya lo sabe: nada impide «Blusa Río» dentro de Casacas.
  3. **La descripción es texto libre**, cuando la ficha ya guarda tejido y patrón como datos (`tejido_id`, `patron_id`).

## 4. Qué le sirve a CAYLA, y por qué

CAYLA no se parece a Zara: son tres tiendas y un taller, la venta pasa por la conversación (mostrador, Instagram, WhatsApp) y el
cliente vuelve. Ahí, lo que más pesa es que **una prenda se pueda pedir por su nombre** («¿todavía tienes la Blusa Aurora en
negro?») y que la colaboradora la **encuentre en el buscador en dos letras**. Eso descarta la escuela descriptiva pura y la de
palabras clave. Pero CAYLA también vende en la web, donde quien llega no conoce a «Aurora»: ahí hace falta decir qué es.

**Decisión: las dos capas (Reformation y Aritzia), más la puerta al ícono (Levi's) para lo que se repite.** Es lo que CAYLA ya
empezó; solo hay que ponerle reglas para que no se degrade.

## 5. La propuesta: el estándar de nombres de CAYLA

### 5.1 La fórmula

```
NOMBRE (lo que se dice):       <Tipo> <Nombre propio>              Blusa Aurora
LÍNEA (lo que se lee debajo):  <corte/largo>, <detalle>, de <tejido>   Manga globo, botones forrados, de lino
VARIANTE (nunca en el nombre): <color> · <talla>                   Negro · M
CÓDIGO (lo que identifica):    <PREFIJO>-<número>                  CMS-0003
```

### 5.2 Reglas del nombre propio

1. **Una palabra**, de 3 a 9 letras, fácil de decir y de escribir en Perú (sin letras dobles raras ni tildes que confundan al
   buscar: el buscador ya ignora tildes, pero la persona que escribe no debe dudar).
2. **Identifica el diseño, no el color ni el tejido.** La Blusa Aurora es la Aurora en negro, en crudo y en lino. Si cambia el
   molde, es otra prenda con otro nombre.
3. **Única dentro de su tipo** (puede haber Blusa Aurora y Falda Aurora si son conjunto; y eso es una ventaja: «el conjunto
   Aurora»). El aviso de parecidos ya lo vigila.
4. **Sale de un banco por temporada.** Cada temporada elige un tema y su lista de nombres antes de producir, y quien da de alta
   elige de ahí. Ejemplos de tema: lugares del Perú (Paracas, Máncora, Colca), flores, nombres de mujer. Ganancia: no se inventa
   en el mostrador, no se repite, y **el nombre ya dice de qué temporada es** la prenda (útil para Frescura y liquidación).
   *Esto es una decisión de marca: el tema lo elige Felipe.*
5. **Prohibido en el nombre:** color, talla, «nuevo», «oferta», «2», la temporada escrita, y nombres de personas reales del
   equipo o de clientes.

### 5.3 La línea descriptiva

- **No se escribe: se arma** con lo que la ficha ya sabe (tejido, patrón y, cuando existan como dato, largo y corte), con un
  detalle libre de pocas palabras. Así sale igual en la web, la etiqueta y el ticket.
- Orden (Massimo Dutti y Zara): **corte o largo → detalle → tejido**. Máximo ~60 caracteres.
- Es lo que lee la web, el buscador de la tienda online y la boleta si el nombre solo no alcanza.

### 5.4 Cuando un modelo se repite: el ícono

Si un diseño vuelve en **tres temporadas o más**, su nombre queda reservado como **modelo de casa** (como el Effortless de Aritzia):
las versiones nuevas conservan el nombre y agregan solo lo que cambia —«Pantalón Ámbar corto», «Pantalón Ámbar de lino»—. Ese
nombre sale del banco de nombres para siempre.

### 5.5 Lo que no lleva nombre propio

Lo que no es moda —bolsas, empaque, papelería, insumos— se nombra **solo descriptivo** («Bolsa de papel mediana»). Bautizar una
bolsa es ruido.

## 6. Cómo se llevaría al ERP (cuando Felipe lo apruebe)

Sin cambiar el núcleo (`productos.referencia` sigue siendo el nombre completo):

1. **Nuevo producto separa el tipo del nombre propio:** el tipo lo pone la categoría (`FICHAS_POR_CATEGORIA[prefijo].prenda`) y
   la persona escribe solo «Aurora». Nadie vuelve a escribir «Blusa» en Casacas.
2. **Banco de nombres por temporada** (lista que carga el Líder): Nuevo producto sugiere el siguiente libre y avisa si ya se usó
   en ese tipo.
3. **La línea descriptiva se arma** desde tejido, patrón y el detalle, y la web la muestra bajo el nombre.
4. **Ordenar lo existente:** un listado de nombres que rompen la regla (llevan color, descripción o un número) para que Felipe
   decida cuáles renombrar. Renombrar no borra nada: el código y los movimientos siguen iguales.

## Fuentes

- Zara: [VESTIDO MIDI SATINADO ZW COLLECTION (zara.com/co)](https://www.zara.com/co/es/woman-new-in-l1180.html),
  [listado zara.com/gt](https://www.zara.com/gt/es/-l1180.html)
- H&M: [Regular Fit Felted overshirt](https://www2.hm.com/en_in/productpage.1227148002.html),
  [Oversized Fit T-shirt](https://www2.hm.com/en_in/productpage.1074658002.html)
- Mango: [Asymmetrical bow-neck dress](https://shop.mango.com/us/en/p/women/dresses-and-jumpsuits/black/asymmetrical-bow-neck-dress_87080443?c=05),
  [Printed dress with turn-down neckline](https://shop.mango.com/au/en/p/women/dresses-and-jumpsuits/dresses/printed-dress-with-turn-down-neckline_77040628)
- Massimo Dutti: [Men's Linen Shirts](https://www.massimodutti.com/gb/men/shirts/linen-n1360)
- Uniqlo: [What is AIRism](https://www.uniqlo.com/us/en/special-feature/materials/airism), [LifeWear](https://www.uniqlo.com/lifewear/uk/en/sp/)
- Shein: [ejemplo de título largo](https://m.shein.tw/Women%20s%20Elegant%20Solid%20Color%20Sleeveless%20Dress%20Suitable%20For%20Vacation%20Back%20To%20School%20Music%20Festivals%20Christmas%20Mother%20s%20Day%20Easter%20Graduation%20Season-p-67757576.html)
- Levi's: [Gear Patrol, guía de calces](https://www.gearpatrol.com/style/levis-jeans/), [HiConsumption, sistema de números](https://hiconsumption.com/style/levis-jeans-numbering-system-guide/)
- Aritzia: [The Effortless Pant™](https://www.aritzia.com/en/product/the-effortless-pant™/104141.html),
  [Effortless Linen Pant](https://www.aritzia.com/en/product/effortless-linen-pant/98045016.html)
- Nike: [Air Force 1 '07 'Tech Tuff' (GOAT)](https://www.goat.com/en-ca/sneakers/air-force-1-07-tech-tuff-315122-201)
- Nombre propio: [V&A, Paquin y el diseño con nombre](https://www.vam.ac.uk/blog/factory-presents/whos-in-a-name-paquin-and-the-named-design-1898-1950),
  [«Why are all my clothes named after humans?»](https://medium.com/timeline/clothes-womens-names-65b3b17303f),
  [M.M. LaFleur](https://mdash.mmlafleur.com/mothers-namesake-pieces), [Reformation, estrategia de marca](https://nogood.io/blog/reformation-marketing-strategy/)
- Títulos de comercio electrónico: [PPC Hero](https://www.ppchero.com/whats-in-a-name-building-powerful-product-titles-for-ecommerce),
  [digitalcommerce.com](https://digitalcommerce.com/ecommerce-titles)
