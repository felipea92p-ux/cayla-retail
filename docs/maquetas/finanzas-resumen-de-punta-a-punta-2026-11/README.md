# Finanzas ▸ Resumen · tres caminos de punta a punta, con tres fondos (maqueta 2026-11-09)

Pedido de Felipe (2026-11-09): analizar mejor los sistemas de finanzas más vanguardistas y hacer **3 maquetas lo más completas posible, de punta
a punta**, cada una con **3 fondos** para comparar. El objetivo: que **una persona común entienda fácil las finanzas del negocio**, mostrando
cosas útiles y aprovechando bien la pantalla.

Esta carpeta reemplaza como propuesta a `finanzas-resumen-neobanco-2026-11/` (la del 2026-11-07), que se queda como historia.

## Cómo se abre

- Se sirve la carpeta `docs/maquetas` (`.claude/launch.json` ▸ `maqueta-referentes`, puerto 3031) y se entra a
  `http://localhost:3031/finanzas-resumen-de-punta-a-punta-2026-11/index.html`. También está publicada como artifact.
- **Abajo, el dock de la maqueta** (no es parte del ERP): **Camino A · B · C** y **Fondo 1 · 2 · 3**.
- **Arriba, la mesa de mando de Finanzas**, como en `main`: la sede (Todas, Trujillo, Arequipa, Lima), el mes (‹ Noviembre 2026 ›, con la
  lista de los doce y diciembre con candado), **Ocultar montos**, **Te toca** y **Registrar gasto**. El tema claro u oscuro va en la cabecera,
  como en el ERP.
- Todo queda en la URL: `#b&sede=aqp&mes=2026-10&fondo=clima&hoja=plata` abre el camino B, Arequipa, octubre, el fondo Clima y la hoja «Tu plata».
- **Cada cifra se abre** en su hoja (el detalle). Las siete principales («Lo vendido», «Lo gastado», «Lo que te deja», «Tu plata», «Lo que
  pagas», «SUNAT» y «La ropa») se recorren en orden con **Siguiente**. En el celular la hoja sube desde abajo y se baja con el dedo.
- Hoy en la maqueta: **lunes 9 de noviembre de 2026**. Noviembre va en curso; de junio a octubre están cerrados.

**Las cifras son de ejemplo** (el repo es público) y salen de **un solo modelo** (`modelo.js`). Lo vendido, lo gastado, lo que te deja, la
plata, los pagos y SUNAT cuadran entre sí en los tres caminos, en cada sede y en cada mes. Por ejemplo: lo que deja cada tienda menos los
gastos generales da lo que deja la empresa. **No se tocó** código de la app, migraciones ni producción.

## Lo que ya estaba decidido y no se reabre

- **De Estados financieros** (ADR-0611): el estilo neobanco, la cifra y una frase que la interpreta, las cifras en Inter, y claro y oscuro al
  mismo nivel. Sin la tela de Hilos (retirada el 2026-11-06).
- **El marco y el vidrio de `main`** (ADR-0596, ADR-0623): el riel liso de 272 px, la cabecera de vidrio de 64 px, y lo que se desplaza en
  vidrio claro sin desenfoque. El desenfoque queda solo en lo que flota quieto (la cabecera, el dock y las hojas). Las piezas son las recetas
  Serena.
- **Las reglas del ERP**: solo tokens, con un oscuro que sale de los mismos tokens; movimiento una vez, sin rebote ni bucle (ADR-0136); toda
  la pantalla a lo ancho (ADR-0462); como mucho tres avisos; el vocabulario de tienda («sede», «cliente»).

Hay una tensión con lo pedido: ADR-0611 dice «muy poca información a la vista» y Felipe pidió «el máximo de detalles». Se resolvió así: **la
respuesta va arriba y sola** (una cifra o una frase), **el detalle queda a un toque** (cada cifra abre su hoja) y el resto de la página va
ordenado bajo el pliegue, denso pero tranquilo.

## Lo que se aprendió de los referentes

Investigación en fuentes públicas (centros de ayuda y blogs de cada empresa). No cargaron las ayudas de Monarch, Mercury, Qonto y Revolut, ni
las páginas de Monzo y del Business Feed de QuickBooks; lo de esos casos se leyó en resúmenes de búsqueda. Lo que sirvió para CAYLA:

| Patrón | Quién | Dónde entra |
|---|---|---|
| Una frase responde antes que cualquier número («vendiste, gastaste, te quedan…») | Fathom; Xero lo deja sin hacer y sus usuarios lo piden | C (la frase grande), y la frase de cabecera de los tres |
| La plata de impuestos y la comprometida, en bolsillos con nombre, restados de lo disponible | Square (carpeta de impuestos), bunq, Relay, Nubank (cajitas) | A (los bolsillos); «Libre para usar» en los tres |
| «Por llegar» aparte de lo que ya tienes (tarjetas que el POS aún no abona) | Mercado Pago («dinero a liberar»), Shopify | La hoja «Tu plata» |
| Elegir contra qué comparar: el mes pasado o la misma temporada del año pasado | Toast, Square | B («Contra octubre / el año pasado») |
| Sueldos y alquiler como parte de lo que se vende, para comparar tiendas | Toast (costo laboral como % de la venta) | B («Cada sede, junta»), hoja de cada tienda |
| El día más justo de la proyección, con su causa | Float, Qonto (la curva puede bajar de cero) | A («El día más justo»), hoja «Tu plata» |
| Lo estimado se ve distinto de lo real | QuickBooks, Stripe | Líneas claras, barras rayadas, «(estimado)» y su rango |
| De dónde viene y a dónde va la plata, en un dibujo | Monarch (Sankey, que se puede compartir con los montos ocultos) | C (el río y la cuadrícula de 100); **Ocultar montos** en los tres |
| Cada número se abre en la lista que lo explica | Mercury, Toast, Digits | Las hojas |
| Ocultar una cifra cuando no aplica, y decir por qué | Mercury (no muestra el «runway» si la empresa gana) | Una sede no tiene «Libre para usar» (el banco es de todos); un mes cerrado no tiene bolsillos |
| El IGV como una resta («cobraste − pagaste al comprar = para SUNAT») | bunq, Found | La hoja SUNAT y C |
| Explicar en pantalla por qué dos cifras no coinciden | Toast | La hoja «Lo vendido» (contra Ventas ▸ Reportes) |
| Avisos solo con umbral, como mucho 3, también los buenos | Shopify, Fathom, Cleo | «Hoy te toca» (incluye «La quincena está cubierta») |
| Escala fija al comparar meses | Lo contrario de Apple Card, que cambia la escala cada mes y engaña | «Los últimos seis meses» |

**Lo que no se copió:** jerga («burn», «runway», «Ready to Assign»), gráficos de trader, colores para todo y fondos animados con WebGL (gastan
batería y bajan la legibilidad). El fondo de rejilla de puntos no lo usa ningún producto financiero que se haya encontrado: es una propuesta propia,
no una tendencia comprobada.

## Los tres caminos

Los tres responden las mismas seis preguntas: cuánto vendimos, cuánto gastamos, cuánto ganamos, cuánta plata hay y dónde, qué toca pagar, y
cuánto es de SUNAT. Lo que cambia es **por cuál empiezan**.

| | Camino | La idea | Referentes | Ganas | Pagas |
|---|---|---|---|---|---|
| **A** | **Bolsillos** | Empieza por lo que todos ya entienden de su app del banco: **cuánto puedes usar** (S/ 14,607 de S/ 79,475). La plata se parte en bolsillos con nombre: para el equipo, para SUNAT, para proveedores, recibos y lo de CLAURE. Al lado va cómo va el mes. Debajo, «Próximos» con el día más justo, los movimientos día por día (lo que es «entre tus cuentas» no cuenta como gasto) y las tiendas. Tiene preguntas listas («¿Puedo comprar mercadería?»). | Nubank, Square, Relay, Monzo, Copilot | Es la que responde más preguntas arriba. Es la única que deja claro qué plata ya tiene dueño. | Pide una regla nueva («Libre para usar») y nombres que el equipo tiene que reconocer (CLAURE). |
| **B** | **Tablero** | Ocho cifras arriba, cada una se abre. Después, **«¿Ya pagaste el mes?»** dibujado como un contador: lo que deja cada venta se va sumando hasta cruzar la raya de los gastos fijos, y ese día empiezas a ganar. Al lado va el veredicto, comparando con el mes pasado o con el año pasado. Debajo, cada sede junta, en qué se va la plata y **el mes en un calendario**: lo vendido en los días que pasaron y lo que pagas en los que vienen. | Toast, Xero, Stripe | La más densa: aprovecha 1440 y 1920 px y le sirve a quien mira el negocio todos los días. El calendario junta pasado y futuro en una sola imagen. | El gráfico de equilibrio pide leerlo una vez. Es la que más le cuesta a una persona sin formación. |
| **C** | **Camino** | Una **frase grande**, como la diría el contador de confianza, con sus cifras tocables: «Vendiste S/ 42,984. De eso, S/ 6,557 es el IGV…, te queda S/ 1,225». Debajo, la plata libre y lo próximo. Después, el mismo cuento en dos dibujos: el río de la plata y la cuadrícula de 100 soles. Siguen la boleta del mes y **«Si gané, ¿por qué tengo menos plata?»** (el alquiler se pagó adelantado y la ropa de Black Friday es stock, no gasto). Al final, lo que viene, SUNAT y la ropa. | Monarch, Fathom, bunq | Es la que mejor se entiende sin que nadie la explique. Es la única que responde la confusión entre ganancia y plata. | Es más larga, y el río pide pasar el mouse. En el celular se cambia por la cuadrícula. |

**Recomendación: C como base, con los bolsillos de A.** Arriba, la frase de C; a su lado o debajo, «Libre para usar» con sus bolsillos y
«Próximos» de A. Después, la boleta, «¿por qué tengo menos plata?» y el río. Las ocho cifras de B pueden quedar como una vista «Tablero» para
quien mira el negocio todos los días. La prueba ciega (abajo) apunta a lo mismo. Felipe elige mirando (ADR-0358).

## Los tres fondos

| | Fondo | Qué es | Ganas | Pagas |
|---|---|---|---|---|
| **1** | **Aurora** | El de producción: tres nubes quietas (roja, pizarra y ámbar), con las medidas de `vidrio/marco.css`. | No hay nada que decidir: el Resumen se ve como el resto del ERP. | No dice nada del negocio: es solo ambiente. |
| **2** | **Rejilla** | El papel cuadriculado del cuaderno de cuentas: puntos de tinta al 16 % (13 % en oscuro) que se apagan hacia abajo, alineados al menú. | Ordena la vista y le queda bien a los números (B, sobre todo). Ningún producto financiero lo usa: se distingue. | Es un fondo nuevo solo para Finanzas: rompe un poco la unidad con el resto del ERP. |
| **3** | **Clima** | Un resplandor arriba que toma el color de **cómo va el mes**: verde si va bien, ámbar si hay que mirarlo (una tienda que afloja, la plata libre que no alcanza), rojo si el mes pierde. Lo decide el modelo, no un gusto, y lo acompaña un chip con palabras («El mes va bien»), para no depender del color. | Se entiende antes de leer: la ley 5 de `/formidable` («ver antes que leer»). Cambia al elegir una sede (Arequipa sale en ámbar). | Usa el color de estado en toda la pantalla, y esa regla (umbrales) es otra decisión de dinero. Hay que cuidar que no alarme por poco. |

**Recomendación: Aurora**, para no abrir otra decisión de marco. **Clima** vale la pena solo si Felipe quiere que el fondo del Resumen hable; en
ese caso, sus umbrales se deciden junto con los de «Hoy te toca».

## Lo que el ERP ya calcula y lo que sería nuevo

Mapeado en `main` (892e29920, 2026-11-08):

- **Ya existe:**
  - lo vendido por sede (`fn_estado_resultados`), por día (`fn_rendimiento_serie`), por medio de pago y las ventas y el ticket (en Ventas ▸
    Reportes, no en Finanzas);
  - lo que costaron las prendas y el margen;
  - lo que te deja (`FilaER.resultado`) y el equilibrio del mes (`equilibrio()`);
  - la meta (`fn_meta_mes`);
  - las cuentas y cajas (`cuentas_dinero`, con «por abonar»);
  - la proyección de caja (`fn_flujo_caja_proyeccion`, que ya trae `de_claudia`, la planilla, los aportes y los impuestos);
  - Por pagar (`fn_por_pagar_consolidado`);
  - el IGV del mes y la renta (`fn_impuestos_panel`);
  - la ropa al costo (`fn_valor_inventario_existencias`) y las compras del mes;
  - la cuenta de CLAURE (`fn_claure_cuenta`, ADR-0560);
  - «A dónde va la plata» (`recorrido-plata-reglas.ts`), que es la base del río de C.
- **Sería nuevo** (son reglas de dinero, así que esperan el OK de Felipe):
  1. **«Libre para usar»** = lo que tienes − la plata de CLAURE − los pagos de 14 días − el IGV que vas juntando. Es la lectura prudente: no
     cuenta lo que vas a vender.
  2. **La proyección del mes con su rango** (más ancho mientras menos días van). En la maqueta es ±(4 % a 20 %) de lo que falta.
  3. **CTS y gratificación como «la parte del mes»**. Depende del régimen laboral de CAYLA; la maqueta usa el de pequeña empresa.
  4. **«Si gané, ¿por qué tengo menos plata?»**: pide cruzar lo devengado con lo pagado (alquiler adelantado, compras de stock, pagos del mes
     anterior). Los montos de la maqueta son inventados.
  5. **La fecha de SUNAT**: el ERP usa el día 15 porque el RUC no está cargado. La maqueta dice «el 18 (ejemplo)».
  6. **Los umbrales**: el aviso de una tienda que afloja (−8 % con S/ 3,000 de venta o más) y el clima (el mes pierde, afloja o va bien).
  7. **Comparar con el año pasado** necesita doce meses de historia en el ERP.

## Qué se verificó

- **Barrido automático** (Playwright contra la maqueta servida): 3 caminos × 4 sedes × 3 meses × 2 anchos (1440 y 375 px), abriendo además las
  11 hojas en el camino A. Ningún error de JavaScript, ningún «NaN» ni «undefined» en pantalla, y ningún scroll lateral. A 375 px el camino C
  se desbordaba por la historia de seis meses; se arregló.
- **Contraste medido** (WCAG, compuesto sobre el vidrio y el crema real) en los tres caminos, en claro y oscuro, y en seis hojas. Quedan 0
  textos bajo el mínimo. Hubo dos fallas solo en oscuro (la fecha vencida y la etiqueta SUNAT del calendario); se arreglaron. El script marca los
  botones principales como 1:1 porque su fondo es un degradado y no lo sabe leer: es un falso positivo.
- **Capturas mirando cada una**: los tres caminos a 1440, 1920 y 375 px, en claro y oscuro, los tres fondos, un mes cerrado,
  una sede, «Ocultar montos», la lista de meses y cuatro hojas.
- **Prueba ciega, dos rondas.** Un agente sin contexto, en el papel de una encargada sin formación, miró solo las capturas y respondió seis
  preguntas. Fueron dos agentes distintos, uno por ronda, así que las notas también varían por quién mira.
  - **Ronda 1:**
    - Notas de «la entendí sin que nadie me explique»: C 8, A 7, B 4.
    - B se contradecía: decía «va bien» arriba y «S/ 813 peor que octubre» en el veredicto.
    - B asustaba con «te falta vender S/ 90,900» y no mostraba la plata arriba.
    - C no decía cuánta plata hay ni qué toca pagar.
  - **Lo que se cambió:**
    - B compara mes contra mes con una sola medida, dice cuánto pide el mes y cuánto llevas, y pone sus ocho cifras arriba.
    - C agrega la plata libre y lo próximo bajo la frase.
  - **Ronda 2:**
    - Notas: C 8, B 6, A 5.
    - Lo que más confundió: SUNAT aparecía con tres cifras sin explicar (el IGV de las ventas de noviembre, el pago de octubre y el bolsillo
      que suma las dos).
    - También confundió la ganancia «hasta hoy» contra la estimada.
  - **Lo que se cambió después:**
    - Cada cifra de SUNAT dice qué es y cuándo se paga.
    - A explica por qué hoy queda poco.
    - «igual» dice contra qué compara.
    - Los bolsillos pasaron a una lista.
  - **No hubo una tercera ronda.**
- **No se verificó:**
  - la prueba con colaboradoras reales;
  - el rendimiento en el Mac mini de la tienda;
  - el contraste con `pnpm --filter web tema:auditar`, que solo corre contra el ERP;
  - un recorrido completo solo con teclado. Sí se probó, con un script: Enter abre la hoja de una cifra, Tab se queda dentro de la hoja,
    «Siguiente» pasa a la otra, Escape la cierra y devuelve el foco a la cifra, y las flechas recorren el gráfico.

## Los archivos

`index.html` (el armazón), `base.css` (tokens, los tres fondos, el marco y las piezas), `caminos.css`, `modelo.js` (las cifras), `piezas.js`
(íconos, gráficos y la hoja), `hojas.js` (el detalle de cada cifra), `camino-a.js`, `camino-b.js`, `camino-c.js` y `app.js` (estado, mesa de mando
y dock).
