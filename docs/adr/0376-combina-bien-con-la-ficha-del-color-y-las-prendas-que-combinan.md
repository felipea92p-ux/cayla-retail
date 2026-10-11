# ADR-0376 — «Combina bien con»: la ficha del color donde se mira un color, y qué prenda va con cuál

- **Fecha:** 2026-10-10
- **Estado:** aceptado; web en la rama `claude/product-recommendations-visibility-80ef1c`; las dos migraciones de la marca en la venta
  (20261010220000 y 20261010220100) **todavía no están en producción** (las pega Felipe, por separado)
- **Decidió:** Felipe (dónde, cómo se ve, qué significa «combina», el papel de cada categoría, cómo se mide); Claude (la regla y las piezas)

## Contexto

El ADR-0316 (2026-10-02) le dio a cada color una ficha: qué transmite (`colores.descripcion`) y con qué se combina
(`colores.combina_con`, hasta 8 códigos, escrita a mano con criterio de estilismo). Solo se veía en Catálogo ▸ Atributos ▸ Colores.
Felipe preguntó dónde más podía servir y pidió dos cosas: que saliera **sin invadir** («solo cuando pasas por el color o te detienes»)
y que la caja llegara a decir **«combínalo con un polo de estos colores»**, investigando cómo lo hacen las mejores plataformas.

Lo que se midió antes de decidir (producción, solo lectura, 2026-10-10):

- Ninguna pantalla fuera de Atributos leía la ficha. Vender ya pedía `variantes.color_codigo` en su consulta y lo tiraba al mapear.
- La terminal de ventas no tiene el módulo Productos: en el mostrador el único lugar donde se mira un color es «Todo de la prenda».
- 446 ventas completadas en 11 días; 187 (42 %) con dos o más líneas; 165 (37 %) con dos categorías distintas (TRU 26 %, AQP 59 %).
  Las líneas «sin registrar» traen categoría, talla y color (`prendas_por_regularizar`, NOT NULL): **las 791 líneas cuentan**.
- `combina_con` **no predice** compra conjunta: el 37,5 % de los pares del mismo ticket cae en una ficha, contra 38,9 % al azar. Lo
  que sí se repite es el mismo color (1,6×). La canasta real es «prenda + bolso o bisutería» (Bolsos + Camisas y Blusas, 17 tickets);
  Polos + Blusas (13) son sustitutos; Pantalones + Blusas (11) se compran juntos menos que al azar.
- 87 de las 91 fichas empiezan con Blanco, Crudo o Negro; **53 de los 95 colores activos no los lista nadie** (Marrón, el 5.º más
  vendido, tiene cero listas). El piso cobrable real de TRU son 292 unidades en 234 tarjetas prenda×color (80 % con 1 unidad).
- Las mejores (Zara, ASOS, Net-a-Porter, Shopify, Lightspeed) separan «parecido» de «combina con», curan el look a mano (estilistas o
  el comerciante), meten la co-compra después y con umbral, muestran 1 a 3 en caja, filtran por stock de esa tienda y lo dicen en
  palabras de tienda («Combina con», «Combina bien con», «Completa tu look con»).

## Decisión

**A. La ficha del color se ve donde ya se mira un color, y solo al señalarlo o fijarlo.** Tres lugares, UNA pieza (`FichaDelColor`,
regla pura `lib/ficha-del-color.ts`): el pie de la carta de Nuevo producto (y «Agregar colores», que reutiliza la carta), Vender ▸
«Todo de la prenda» bajo color · precio · stock, y la vista rápida de Catálogo bajo la foto. En reposo no hay nada nuevo. Los
compañeros son **círculos de 20 px que dicen su nombre al pasar el mouse o al tocar** (en Atributos siguen siendo puntos de 12 px: es
gestión del vocabulario), siempre en el mismo hueco y con alto fijo (ADR-0185); un toque señala y no alterna (en la tablet el toque
dispara antes el «mouse encima»). La frase del color va detrás de «¿Por qué?», nunca a la vista (ley 6 de Formidable). En el
mostrador, los compañeros que **cuelgan en la sede van primero** y los que no, apagados con «no hay aquí»: solo sirve sugerir un
color que de verdad se puede ofrecer. La etiqueta es **«Combina bien con»** (la de Shopify en español; H&M «Combina con»; Felipe la
eligió sobre «Combínalo con», «Completa tu look con» y «Va con»), en una sola constante (`ETIQUETA_COMBINA`). Las 92 fichas salen tal
cual en todos lados y se corrigen en Atributos sin deploy.

**B. Qué prenda combina con cuál lo decide un «papel» por categoría, en código y por prefijo.** `lib/combinar-reglas.ts`:
`CATEGORIAS_LOOK` (45 activas + 5 inactivas de producción: superior, inferior, entero, abrigo, calzado, bolso, accesorio, bisutería,
íntimo, ninguno, cada una con cómo se dice, «un polo», «una cartera») y `PAREJAS` por papel, asimétricas y en orden de prioridad:
a un polo le falta primero un pantalón y después un bolso (es el complemento que más se vende junto); bolso y bisutería SÍ anclan
(en AQP el bolso beige es el ancla más frecuente); íntimo y papelería, mudos. Una categoría creada desde pantalla nace muda, nunca
adivinada por el nombre (ADR-0290), y la prueba de totalidad lo lista. Cambiar una fila es un deploy: 45 filas que Felipe revisó.

**C. La sugerencia es puerta + orden por llaves, nunca una suma de pesos.** Cuatro puertas a la vez: hay para cobrar aquí (piso
cobrable, sin apartados ni almacén) · papel pareja · otra prenda (ni la misma, ni una que ya está en el ticket, ni lo anotado como
sin registrar en ese color) · color aprobado por la ficha en **directa** («Beige lista Chocolate»), **inversa** («Marrón lleva Beige»:
sin esto 53 colores jamás saldrían) o **tono sobre tono con ficha**. Orden: el papel que completa primero · la **rareza** del color
(en cuántas listas aparece, calculada de las fichas al cargar: sin esto Blanco salía en 6 de cada 10 tickets) · el motivo · unidades
· referencia. Hasta 3, una por papel y sin repetir color; nunca se rellena con otra del mismo papel. Sin azar. El «¿Por qué?» sale
de la regla («Beige lista Negro · va arriba a una falda · 2 en Tienda Lima»).

**D. Dónde y cuánto.** En Vender ▸ «Todo de la prenda», bajo la lista de colores: la **frase** del color que se mira («Combina bien con
un jean o una cartera», una línea de alto fijo, en reposo) y, con el color **fijado**, hasta 3 prendas con miniatura, color y «2 aquí»;
tocar una despliega sus tallas (las mismas casillas de la lista) y tocar la talla la suma al ticket con el `agregar` de siempre. Nunca
un bloque bajo el ticket (compite con Cobrar y rompe la regla de reposo). En la vista rápida de Catálogo, solo la frase: las prendas
con su talla viven donde se cobran. Es función del módulo `vender` (ADR-0306): ni módulo ni rol nuevos. Todo corre en el navegador
sobre lo que Vender ya tiene en memoria (~400 tarjetas prenda×color, menos de 1 ms por cambio).

**E. Se mide con una consulta ahora y una marca en la venta con la v1.** `scripts/combina/linea-base.sql` (solo lectura, por sede)
hoy y a las 4 semanas; y `venta_items.origen_sugerencia` (`'combina_bien_con'`, con candado) que `registrar_venta` escribe desde la
clave del ítem, por **reemplazo anclado** sobre su definición viva (la función se redefinió 7 veces). Dos partes que Felipe pega por
separado; hasta entonces la caja manda la clave y la base la ignora.

## Descarté

- *Puntuar el color por su posición en la lista* (87 de 91 fichas empiezan con Blanco, Crudo o Negro: Blanco en el 61 % de las
  líneas de TRU) y *pesos por «cuánto hay» y foto* (el piso real es casi siempre 1 unidad y el 87 % tiene foto: no separan nada).
- *Co-compra o lift en la v1* (3 pares de categorías con 10 tickets en 11 días; un lift con tan poca muestra premia pares de una
  vez) y *co-compra prenda-prenda* (57 pares, 1 repetido: los modelos no se repiten). Cuando entre, será por categoría, con umbral
  (≥ 3 tickets con el mismo par en 12 semanas) y solo como orden.
- *Embeddings tipo Polyvore o un LLM en línea en el mostrador*: 0 outfits etiquetados, y el principio 9 no admite una llamada
  externa en el camino de cobrar. Un LLM offline como borrador de atributos (que Felipe revise) queda posible.
- *Una columna `categorias.papel` editable en Categorías* para la v1: toma un candado sobre una tabla que lee cada pantalla
  (ADR-0195) y reemplaza `actualizar_categoria`; para 45 filas que cambian con Felipe, el repo ya resuelve esto por prefijo en código
  con prueba (`ICONOS_POR_PREFIJO`, `FICHAS_POR_CATEGORIA`). Entra si Felipe quiere cambiar un papel sin deploy.
- *Parejas categoría → categoría una por una* (51 × 50 filas que nadie mantiene) y *esperar la co-compra* (12 semanas sin nada).
- *Nombres en vez de círculos* para los compañeros (lo propuso el análisis; Felipe prefirió círculos con el nombre al pasar) y
  *puntos de 12 px sin nombre* fuera de Atributos (Perla, Crudo y Beige se confundían; en tablet no hay hover).
- *La ficha en la etiqueta impresa o el ticket térmico* (1,4 mm libres; el ticket no imprime ni «talla · color» por decisión).
- *Una tabla de impresiones desde el día 1*: exige dos arreglos previos («Dejar en espera» no renueva el token del carrito; una RPC
  desde una terminal sin responsable falla con 42501) y una RPC nueva. Después, si la marca en la venta no alcanza.

## Se rompe si

- **Se pega la parte 2 sin la parte 1**: `registrar_venta` insertaría en una columna que no existe y ninguna venta se registraría
  hasta deshacerlo. Orden: parte 1, comprobar la columna, parte 2.
- **La definición viva de `registrar_venta` ya no tiene el trozo del insert tal cual** (otra migración lo tocó): la parte 2 se
  detiene con «se esperaban 1 apariciones y hay N» y no cambia nada; hay que regenerar el reemplazo desde la definición real.
- **Un Líder crea una categoría desde pantalla**: nace muda (no sugiere ni se sugiere) hasta que alguien la sume a `CATEGORIAS_LOOK`;
  la prueba de totalidad lista la que falte frente a la lista de producción que lleva dentro.
- **Se desactiva un color**: deja de ofrecerse como compañero (el índice se arma solo con activos); si una prenda sigue en ese
  color, no sugiere nada.
- **El catálogo guardado es de antes de este cambio**: no trae `colorCodigo` y no hay ficha ni sugerencia hasta que la versión del
  catálogo suba (ocurre sola con cualquier escritura en el catálogo o con el despliegue).

## Verificación

- `lib/ficha-del-color.test.ts` (8) y `lib/combinar-reglas.test.ts` (26): totalidad sobre los prefijos reales, las cuatro puertas,
  el orden por rareza, sin relleno del mismo papel, estabilidad, la prenda sin registrar como ancla, el bolso que ancla, la frase.
  Suite completa de la web en verde (395 archivos). El candado «probado = en pantalla» (`reglas-sin-uso`) obligó a commitear la regla
  junto con Vender.
- En local, a 1280 px y 375 px: el pie de la carta con Beige, Lavanda y Azul zafiro; la hoja de Vender con «Negro · 5 aquí» y
  «Terracota · no hay aquí», el «¿Por qué?», la frase «Combina bien con una blusa», la tarjeta Blusa Emma Negro «2 aquí», sus tallas y
  la M que entra al ticket y desaparece de la sugerencia; la vista rápida con la frase. Auditoría de tema de los tres escenarios
  nuevos: 0 hallazgos solo en oscuro.
- Las dos migraciones ensayadas en una copia del Postgres local: aplican, repiten sin cambiar nada, el candado rechaza un origen
  inventado, la función queda escribiendo la columna.
- **Pendiente:** `/formidable` sobre la hoja de Vender con la pieza nueva, y `/chaos` (la pieza no guarda nada propio: delega en
  `agregar`; atacar espera/retomar con una línea marcada y el doble toque).

## Cómo deshacerlo

Web: `git revert` de los commits de la rama (no toca datos). Base: la columna es inofensiva si se deja; para volver atrás la función,
el mismo reemplazo anclado al revés (`origen_sugerencia` → nada) o `drop column`, que la función viva rechazaría hasta revertirla.

## Actualización 2026-10-10 (noche): lo que decidió Felipe tras Formidable y Caos

**La tarjeta sugerida SE QUEDA cuando su prenda entra al ticket**, marcada con lo que lleva (cambio 1 de Formidable). Antes
desaparecía: es lo que hace Shopify Search & Discovery (condición oficial «It isn't currently in the visitor's cart») y lo que sus
comerciantes reportan como problema sin ajuste para apagarlo; la prueba ciega lo vio como «se fue», no «entró». Nadie documenta la
tarjeta marcada tal cual, pero NN/g valida la señal en el propio control y la hoja ya la tenía en su fila de colores. Cómo queda:
la regla «lo que ya está en el ticket no se sugiere» se evalúa **al abrir la hoja y al fijar un color** (`CombinaBienCon` va con `key`
por color y congela `combinaFijo` al montarse), no en cada toque; la casilla dibuja el visto mientras lleve unidades; el chip pasa de
«2 aquí» a «1 en el ticket · 1 aquí» (`chipDeTarjeta`, `lib/combinar-reglas.ts`, con prueba); y un «Quitar» —el tacho rojo de la línea
del ticket, la misma pieza también en la fila de colores— deshace sin preguntar (sumar al ticket es estado local). Otra talla se suma
tocando otra casilla. Sin aviso en la esquina: la hoja la tapa y no hay nada que esperar. En una lista angosta (celular) el chip, el
tacho y «¿Por qué?» bajan debajo del nombre en vez de cortarlo.

**Tres tarjetas es un TOPE, no una cuota, y es decisión de negocio respaldada por la práctica del sector, no por una guía:** Zara
«Completa tu look» muestra 1 a 3 sin rellenar (5 fichas contadas), Net-a-Porter «Shown here with» 3 fijas una por papel, Square Kiosk
hasta 3, Shopify 3 por página; en caja Lightspeed muestra 1. Baymard y NN/g no fijan número (piden número dinámico y que una sola
dudosa no contamine las demás); el único experimento grande (Alibaba, 1,6 M de compradores) favorece 2, pero midió ítems similares,
no un look. «Dos de ropa y una de accesorio» no lo hace nadie como cuota: a un vestido no le existe segunda prenda que no sea abrigo.
Se mantiene: hasta 3, una por papel, sin rellenar, y el orden de `PAREJAS` como está (calzado al final mientras sea categoría chica).

**El Tab recorre toda la hoja (Caos 2026-10-10, TEC-01, gravedad 3, cerrado):** el renglón del nombre del compañero señalado se vaciaba
al perder el foco y React quitaba su nodo de texto con el foco en tránsito; la trampa de foco del diálogo (Radix) lo devolvía a la hoja
y «Ver tallas», «¿Por qué?» y «Listo» quedaban fuera del teclado. Ahora el renglón siempre tiene texto (`textoDelSenalado`, un espacio
duro sin señalado), con prueba en `lib/ficha-del-color.test.ts` que falla si el hijo del renglón vuelve a poder ser `null`.
