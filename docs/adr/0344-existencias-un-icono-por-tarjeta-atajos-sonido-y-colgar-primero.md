# ADR-0344 · Existencias: un icono por tarjeta, atajos de filtro, sonido al confirmar y «Colgar primero»

- **Fecha:** 2026-10-05 · **Estado:** construido en la rama `claude/practical-wiles-573af6` (6 commits, uno por actividad). **Solo web, sin
  migración y sin tocar producción.** Verificado: `tsc`, ESLint y las 356 archivos de prueba de `apps/web` en verde (156 066 pruebas), y las
  piezas nuevas dibujadas con datos inventados en el navegador (tarjeta, ventana de acciones, atajos, «Colgar primero» y la tabla de la ventana de
  colgar). **No se probó con sesión real ni con datos de producción** (ver «Lo que no se verificó»).
- **Pedido:** Felipe, 2026-10-05, tras una serie de maquetas de Existencias («táctil y rápida»): llevar la maqueta al sistema, con sonido al
  confirmar, sin «Practicar» y con el movimiento de CAYLA (sin «Expresivo»).
- **Maqueta:** `docs/maquetas/existencias-tactil-2026-10/index.html` (también publicada como artefacto). Es la referencia visual; el sistema manda
  en los nombres (ver «El nombre»).
- **Complementa:** ADR-0331 (la cara de Existencias), ADR-0326 (la barra de filtros), ADR-0328 (inventario por olas), ADR-0136 (movimiento),
  ADR-0231 (la ventana no sugiere cuántas colgar). **Respeta:** ADR-0339 (PR #808, abierto): «Colgar en el piso» es el único nombre.

## El nombre (un choque que hubo que resolver)

La maqueta decía «Reponer» y «Retirar del piso» (el glosario «Lenguaje de tienda CAYLA», 2026-10-05). El PR #808 —la decisión de Felipe del
2026-10-04, ADR-0339— retira «Reponer» para esta acción, fija **«Colgar en el piso»**, deja **«Subir a almacén»** como está y protege el nombre
con una prueba que rompe el build si reaparece uno retirado. Se preguntó cuál valía y Felipe eligió **«Colgar en el piso»**. Todo lo construido
lo usa: la acción de la tarjeta, el botón de la ventana («Colgar N prendas»), «Colgar primero» y la inversa «Subir a almacén». «Enviar a otra sede»
no choca con nada. La maqueta conserva sus nombres de glosario y lo dice arriba.

## Decisiones

**1. Un icono por tarjeta y una ventana hacia arriba** (`components/existencias/AccionesTarjeta.tsx`, `lib/existencias-acciones.ts`).
DECIDÍ: la tarjeta muestra UN icono —la acción que le toca (colgar, en ámbar; sin nada que colgar, «⋯»)— y al pasar el mouse o enfocar con el
teclado se abre hacia arriba una ventana con TODAS las acciones y su nombre, la del icono incluida y resaltada: Colgar en el piso · Subir a almacén ·
Enviar a otra sede · Ajustar stock · Reportar dañada · Ver detalle. En tablet un «⋯» al lado la abre con un toque. Una acción sin permiso no se dibuja;
una que se puede pero hoy no tiene con qué se ve apagada y dice por qué. Se abre con CSS (`group-hover`, `focus-within`), no con estado.
DESCARTÉ: dejar el botón con texto «Reponer» más el menú «⋯» de la esquina, porque eran dos controles para lo mismo y el texto no cabía en
`btn-chico` con el nombre nuevo (más largo); y mostrar los tres iconos siempre, porque en 8 tarjetas son 24 botones iguales y ninguno dice cuál conviene.
SE ROMPE SI: una integrante con mouse no sabe que hay más acciones escondidas (el icono solo no lo dice). Si pasa en la prueba con alguien sin
capacitación, vuelve un indicador mínimo; no se puso porque se pidió menos elementos.

**2. Sin indicador de estado en la tarjeta.**
DECIDÍ: se quitó la pastilla «3 tallas por colgar»: las etiquetas ámbar del riel ya lo dicen. Sigue dicha para el lector de pantalla
(`EstadoParaLector`). La cifra que trae a la persona desde «Para hoy» sigue arriba, en la línea del conteo («6 prendas · 15 tallas por colgar»).
DESCARTÉ: dejarla, porque repetía lo que ya se ve. Esto toca la actualización (c) de ADR-0331 («la suma de las pastillas es la cifra de Para hoy»):
la suma ahora se comprueba con la línea del conteo y las etiquetas ámbar, no con una pastilla por tarjeta.
SE ROMPE SI: alguien necesitaba contar las pastillas para creerle al número de «Para hoy». La línea del conteo sigue ahí para eso.

**3. Atajos de filtro bajo el buscador** (`components/existencias/FiltrosRapidos.tsx`, `lib/existencias-rapidos.ts`).
DECIDÍ: cinco botones —Todo · Por colgar · Sin stock atrás · Apartadas · Dañadas— que escriben los mismos filtros «Hoy» y «Condición» del panel,
con las mismas cifras. Se ven solo con iconos (nombre y cifra al pasar el mouse) o con texto; el gusto se guarda por equipo
(`lib/preferencia-local.ts`). El escáner pasa a ser un icono junto al buscador. Los nombres son los de la píldora (`TEXTO_HOY`), no unos propios.
DESCARTÉ: reemplazar el panel «Filtros» de ADR-0326 (la estructura de Productos fue decisión de Felipe) y una fila de filtros nueva con otra
lógica: dos fuentes de verdad para lo mismo. Un atajo es UNA elección: elegir uno quita el «Hoy» y la «Condición» que hubiera; con «Mantener», o
un «Hoy» más una «Condición», ningún botón se enciende (no se afirma lo que no es). Una prueba exige que cada atajo, escrito en la URL y leído de
nuevo, se encienda a sí mismo y a ningún otro.
SE ROMPE SI: alguien usa solo iconos y no distingue «Sin stock atrás» de «Dañadas». El interruptor y el nombre al pasar el mouse lo cubren, pero en
tablet no hay mouse.

**4. Sonido al confirmar** (`lib/sonido-confirmar.ts`, `components/BotonSonidoConfirmar.tsx`).
DECIDÍ: al colgar en el piso, subir a almacén, ajustar o reportar una dañada suena una campanita corta (dos tonos que suben) y vibra, en el mismo
instante del aviso verde. Se apaga por equipo con un icono en la barra de Existencias; de fábrica suena, como se pidió. Mismo motor de audio que el
bip de la pistola (`reproducirPatron` en `sonido-conteo.ts`), sin duplicarlo. Al encenderlo suena una vez: la persona oye cómo es y el navegador
ya deja sonar.
DESCARTÉ: guardarlo en la cuenta o en la base (una boutique con música baja no quiere campanitas: lo decide el lugar, no la persona) y sonar en
todo `avisar.exito` de la app (alcance que nadie pidió).
SE ROMPE SI: un navegador no deja sonar hasta el primer toque: la primera confirmación puede quedar muda. No pierde nada; es una comodidad.

**5. «Colgar primero»** (`components/existencias/ColgarPrimero.tsx`, `lib/existencias-colgar-primero.ts`).
DECIDÍ: sobre la lista de tarjetas, sin filtros ni búsqueda (o solo «Por colgar»), las tres prendas de TODA la sede que más conviene colgar, **en el
orden de la lista del día del motor del piso** (el mismo de «Para hoy» y del Inicio de Almacén), con el aro de cuántas semanas dura lo que hay al Ritmo
reciente. Respeta las dos decisiones de Felipe del ritmo (2026-09-25): con pocas jornadas NO dice una tasa y cero ventas NO dice «nunca vende»; en
esos casos la fila lo cuenta («Poco tiempo en el piso para medir…», «Sin ventas esta semana») y no dibuja aro. Con el piso sin cuadrar no muestra nada.
DESCARTÉ: el orden de la maqueta (ventas por semana × tallas que faltan): sería un SEGUNDO orden de «qué colgar» y la misma prenda saldría primera
en una pantalla y tercera en otra.
SE ROMPE SI: el motor del piso cambia su criterio de la lista del día: «Colgar primero» lo sigue solo, que es lo que se quiere.

**6. La ventana de colgar dice qué falta, llena con un toque y avisa lo que casi no hay** (`ReponerPrendaModal.tsx`, `MatrizMover.tsx`,
`lib/reponer-prenda-reglas.ts`).
DECIDÍ: la frase «Faltan en el piso: Azul marino 26, 28 · Celeste 30.» con un punto ámbar en esas casillas; los atajos «Lo que falta en el piso · N»
(1 de cada una), «Todo el almacén» y «Vaciar»; y una franja por cada talla que casi no hay aquí y otra sede sí tiene (y no viene en camino). Todo sale
de la decisión del motor (`hoyDeTalla`).
DESCARTÉ: abrir la tabla ya llena, como hace la maqueta de referencia («Ya las marqué abajo»): ADR-0231 pide que arranque en 0 y que la cifra la
ponga quien tiene la prenda en la mano. Los atajos llenan solo cuando la persona los toca, con el mismo 1 por talla con que Existencias manda a
colgar lo marcado (`lineasParaBajar`, ADR-0237).
SE ROMPE SI: alguien toca «Todo el almacén» sin mirar y cuelga lo que no cabe en el piso. El tope de la capacidad (ADR-0329) todavía no se pregunta
aquí.

## Segunda vuelta (2026-10-05, tarde): «debería verse como la maqueta»

Felipe vio la primera entrega publicada y pidió que Existencias se vea como la maqueta. Eligió, sobre cuatro preguntas:

**7. La tarjeta de la maqueta** (`ExistenciasTarjetas.tsx`, `lib/inventario-v2.ts`).
DECIDÍ: foto (o su categoría sobre su color), nombre, marca · categoría, **precio de catálogo**, colores de 20 px con el nombre del que se ve, las tallas como
**botones** con «N piso» (por colgar en ámbar, sin nada con borde punteado; tocarla abre el cajón de esa talla) y el icono único con sus acciones. Los guardados
se dicen en la línea del color y al pasar el mouse por la talla. El precio llega con la lectura de stock (`variantes.precio` en el `select`; opcional en la fila).
DESCARTÉ: dejar el riel de etiquetas de ADR-0331, que Felipe aprobó el 2026-10-04: lo reemplaza porque pidió «como en la maqueta».
SE ROMPE SI: alguien necesitaba ver las guardadas de cada talla sin pasar el mouse: ahora solo está la suma por color.

**8. «Para hoy» sale de la primera pantalla; queda el botón «Pendientes».**
DECIDÍ: la pantalla arranca con la barra y las tarjetas. Las tareas (cuadrar el piso, ventas sin registrar, dañadas, apartados vencidos, traslados) siguen en una
ventana que abre el botón «Pendientes · N».
DESCARTÉ: quitarlas del todo, que fue lo que se pidió: «Regularizar» (ADR-0330 lo sacó de la cabecera) y «Decidir» las dañadas no tendrían ninguna entrada desde
Existencias, y las ventas sin registrar tienen plazo (15-oct). Es una desviación del pedido; se deshace borrando el botón.
SE ROMPE SI: nadie toca «Pendientes» y una venta sin registrar se vence: el aviso del Inicio sigue, pero ya no hay tarea visible en Existencias.

**9. «Se acaban» y «Sin ventas»** (dos opciones nuevas de «Condición», `lib/existencias-filtros.ts`).
DECIDÍ: «Se acaban» = algo colgado que dura una semana o menos al Ritmo reciente medido (`DIAS_SE_ACABA`); «Sin ventas» = colgada, con jornadas suficientes y ninguna
venta esta semana. Salen en el panel «Condición» y como los «Recomendados» de la fila de atajos. Con pocas jornadas no se afirma nada.
DESCARTÉ: «sin ventas en 30 días» (el motor lee 14; Frescura calcula 30) y decir «nunca vende» (decisión de Felipe del 2026-09-25).
SE ROMPE SI: «sin ventas esta semana» se lee como «esta prenda no sirve»: son pocas jornadas de evidencia.

**10. «Prioridad | A–Z»** junto a los atajos (mismo estado que «Ordenar por», que sigue con sus otros órdenes). **«Colgar primero» no se esconde con el piso sin cuadrar:**
dice «Aparece cuando se cuadre el piso de esta sede», para que su ausencia no se lea como una falla.

## Lo que NO se construyó (y por qué)

- **El panel guiado paso a paso de la maqueta** (cajón o hoja con las acciones como flujos de pocos toques). Hoy cada acción tiene su ventana y el
  cajón de la prenda existe; reemplazarlos es una actividad aparte y choca con la sesión de rediseño por olas (ADR-0328, `InventarioPanel.tsx`).
- **«Pedir a otra sede» desde la franja «casi no hay»:** la ventana existe (`PedirAOtraSedeModal`), pero abrirla encima de otra ventana no se resolvió.
  Hoy la franja informa y la acción sigue en Traslados.
- **«Practicar», el modo «Expresivo» y el aro «Hoy: N de M»** de la maqueta: Felipe pidió quitar los dos primeros; el aro no se pidió y contaría un
  clic, no el trabajo, mientras el piso de TRU no esté cuadrado.
- **Atajos de teclado (1–7, flechas) y la lectura de pistola en cualquier lado:** la pistola ya funciona con el buscador (`onEnter`); los demás
  atajos quedan pendientes.

## Choques con ramas abiertas

- **#808 (ADR-0339):** renombra `ReponerPrendaModal.tsx` → `BajarPrendaModal.tsx`, `reponer-prenda-reglas.ts` → `bajar-prenda-reglas.ts` y toca
  `ExistenciasTarjetas.tsx`, `InventarioPanel.tsx`, `MatrizMover.tsx` y `SubirAAlmacenModal.tsx`. Mis cambios en esos archivos van a pedir una
  resolución a mano (los textos ya coinciden con los suyos). Mis identificadores nuevos evitan los de su lista retirada.
- **#807 (Existencias en el celular, «Hacer…»):** toca `ExistenciasTarjetas.tsx`, `FiltrosExistencias.tsx` e `InventarioPanel.tsx`. El segundo en
  fusionarse resuelve; las dos ramas cambian la cabecera de la tarjeta y la fila de filtros.

## Lo que no se verificó

- **Con sesión y datos reales.** Se dibujaron las piezas con una página temporal de datos inventados (no va al repo); la pantalla `/inventario`
  completa, con el motor del piso y el ritmo de verdad, no se abrió (el login lo inicia Felipe).
- **El celular a 375 px.** Existencias no está en la lista de pantallas de celular obligatorio, pero la fila de atajos, el icono y la ventana
  hacia arriba conviene mirarlos allí; la ventana se abre con el «⋯».
- **Sonido y vibración** en un dispositivo real; solo se probó que el patrón suena distinto del bip de la pistola.

## Tercera vuelta (2026-10-05): la pantalla igual a la maqueta

11. **Sin herramientas de más.** La cabecera pierde su fila de botones (Recibir, Contar, Trasladar y Apartados siguen en el lateral; Cuadrar el piso, en «Pendientes»); con tarjetas no hay «Copiar enlace» ni segundo «Ordenar por» (queda «Prioridad | A–Z»); «Ver detalle» es un icono. La ventana de la tarjeta lleva solo Colgar en el piso, Subir a almacén y Enviar a otra sede.
12. **El panel de la talla reemplaza al cajón** (`components/existencias/PanelTalla.tsx`, lógica en `lib/existencias-panel-talla.ts`): vistas Esta talla / Todas / Ficha, color y talla para cambiar sin salir, cuatro cifras, frase de diagnóstico, ritmo, otras sedes y siete acciones con lo que dicen debajo. En este corte cada acción abre la ventana que ya existía; **Apartar** (se hace en Vender) y **Pedir a otra sede** (no existe en la base) se dibujan apagadas. Los pasos guiados dentro del panel quedan para el siguiente corte.

## Cuarta vuelta (2026-10-06): toda la maqueta, funciones y diseño

Felipe: «implementa todo lo trabajado en la maqueta, todas sus funcionalidades, diseño». Se construyó en cinco actividades, un commit cada una
(rama `claude/existencias-maqueta-completa`).

13. **Cada acción se hace dentro del panel, paso a paso** (`components/existencias/FlujoTalla.tsx`, lógica en `lib/existencias-flujos.ts`): pasos
    numerados con ✓, «Falta: …» tocable (las piezas de la guía de foco, ADR-0284), resumen antes de confirmar, y «✓ hecho» al terminar.
    - Colgar y Colgar varias → `bajar_al_piso`; Subir a almacén (se queda o para enviar, con nota opcional) → `retirar_del_piso` / `subir_para_enviar`;
      Pedir a otra sede (para reponer o para un cliente) → `pedir_a_otra_sede` / `pedir_prenda_para_apartar`; Ajustar → `ajustar_inventario`;
      Reportar dañada → `reportar_danada`. Las MISMAS funciones y los mismos armadores que las ventanas, con la marca del intento por huella.
    - DECIDÍ: los pasos llaman a la base desde el panel y reusan las reglas de `lib/` (argumentos, errores, «¿la base resolvió la marca?»).
      DESCARTÉ: abrir las ventanas de siempre encima del panel, porque la maqueta hace todo sin salir y dos ventanas apiladas pierden el foco.
      SE ROMPE SI: una de esas funciones cambia sus parámetros y solo se actualiza el armador de una ventana que ya no existe; por eso las ventanas
      Reponer y Subir se borraron (punto 14) y el armador vive en un solo lugar.
    - **Enviar a otra sede** termina en «Nuevo traslado» ya cargado (cantidad y sede): el traslado es el único que saca prendas de una sede.
      **Apartar** abre la separación de Vender con la talla puesta (Felipe eligió «Separación de Vender»: ahí se cobra el adelanto con la caja abierta).
    - **Ajustar** usa los cuatro motivos de la base con las palabras de la maqueta («Error al cobrar» y «Uso interno» viajan como «otro» con su nota;
      «Se dañó» lleva a Reportar dañada). Una talla que faltó en un conteo cerrado se ajusta en la ventana completa, que la enlaza con ese conteo.
    - **Lo que la maqueta dibuja y la base no tiene:** el «lo confirma un líder» de Ajustar (no hay cola de aprobación de ajustes). No se construyó.
14. **Se borran las piezas reemplazadas:** `CajonPrendaExistencias`, `DesgloseStockPrenda`, `ReponerPrendaModal`, `SubirAAlmacenModal`, `ReportarDanadaModal` y `MatrizMover`,
    con las reglas que solo ellas usaban y sus pruebas. Las que servían se reusan (`casiNoHay`, `lineasDeMoverModelo`, `detalleDeLoMovido`,
    `leerCantidadTecleada`, `textoFilaSinAlcance`, la nota y el aviso de Subir, y de dañadas `problemasReporte`, `desdeInicial`, `quePasaAlReportar` y
    `puedeEnviarReporte`: con un envío en duda solo falta quién lo hace, en TODOS los pasos). La suma explicada del cajón (Felipe, 2026-10-04) sigue en el panel,
    por talla, con la ⓘ de qué cobra la caja.
15. **La tarjeta como la maqueta:** sin «colgadas · guardadas»; la cabecera abre el panel; con «Hoy» o «Condición» se ven todas las tallas del color
    (las que cumplen con su punto, la más vendida con un aro, las demás atenuadas) y los colores que cumplen llevan su punto; el icono es Colgar
    (resaltado si falta algo en el piso), Pedir (agotado aquí y una tienda lo tiene) o Ver (con un filtro). `mejorOrigen` es la única regla de a
    qué tienda pedir.
16. **El anillo «N de M hoy»** (`AnilloMision`, `lib/existencias-mision.ts`) reemplaza al botón «Pendientes» y lo abre. Cuenta contra la foto de la
    mañana, guardada en el navegador por sede y por día: es el marcador del día de quien mira, no un dato de la tienda. Un pedido hecho no cuenta
    como resuelto hasta que llega. DECIDÍ: el navegador. DESCARTÉ: una tabla, porque una cifra de ánimo no vale un dato auditado ni una migración.
    SE ROMPE SI: dos equipos de la misma tienda abren el día a horas distintas; cada uno ve su propio avance.
17. **La caja de buscar de la maqueta**, la **pistola sin tocar el buscador** (`lib/existencias-pistola.ts`: una ráfaga terminada en Enter abre la
    talla; los atajos 1–7 esperan un instante por si es una ráfaga), **teclado** (← → talla, ↑ ↓ color con `useFlechasDelCajon`, 1–7 acción, Enter
    sigue, Escape vuelve) y, en el celular, el panel como **hoja que sube con su asa**.

**Lo que se aparta de la maqueta a propósito:** la cabecera de la pantalla sigue siendo `EncabezadoPagina` (ADR-0220: la cabecera de Inventario es la
de su módulo); el aviso ámbar del piso sin cuadrar sigue (explica por qué «Hoy» no pide colgar); no hay Ctrl+K para buscar (lo usa el buscador
general); la animación del punto que «vuela» al anillo no se hizo (ADR-0136: sin movimiento decorativo).

## Actualización 2026-10-06 — la barra compacta

**Pedido** (sobre una captura de producción de Tienda TRU a 2000 px): «que la barra de búsqueda sea pequeña y no invasiva; el texto del medio
quita espacio, quitarlo o acomodarlo; lo del día puede ir arriba o al costado de Filtros; Filtros solo un icono; que se vea el texto y no solo
iconos; tabla o grilla, un solo icono en cualquier sentido». Se aplicó igual en el ERP y en la maqueta (`docs/maquetas/existencias-tactil-2026-10/`).

**Lo que cambia de este ADR:**
- **Decisión 3:** los atajos van **siempre con su nombre**. Se quitan el interruptor «Solo iconos | Iconos con texto» y su preferencia
  (`cayla.filtros-rapidos`). Su «SE ROMPE SI» (en tablet no hay mouse para ver el nombre) era justo el problema que se vio en uso. En la
  computadora, si no caben, el último baja a otra línea (una fila que se desliza con mouse esconde botones); en el celular se deslizan.
- **Decisión 10:** «Prioridad | A–Z» pasa a la fila del buscador, a la derecha. **«Colgar primero» se esconde cuando está vacía**, también con el
  piso sin cuadrar: su frase («Aparece cuando se cuadre el piso…») y el aviso ámbar sobre las tarjetas ocupaban tres líneas que repetían lo que
  ya dice «por cuadrar» en la cifra de la cabecera. La pausa ahora la dicen dos piezas donde se pregunta: el atajo **«Por colgar» lleva una
  pausa en vez de un «0»** (la frase completa en su etiqueta y al pasar el mouse) y su **lista vacía explica la pausa** con el botón «Cuadrar el
  piso». La tarea «Cuadrar el piso» sigue en «Pendientes» (el anillo).
- **Decisión 16:** el anillo va **al costado de «Filtros»**, del alto de esa fila (40 px); en el celular, solo el círculo (la cifra va en su
  etiqueta).
- **Decisión 17:** la caja de buscar baja de 52 a 40 px y, desde 768 px, a un ancho de lectura (26rem): ya no es una franja de lado a lado.
- **«Filtros» es solo un icono**, con la cifra de lo puesto en la esquina (`BotonFiltros soloIcono`; Productos, Compras e Historial siguen con
  «Filtros · N» en texto).
- **Tabla o tarjetas: un icono** que muestra la vista a la que lleva, igual en los dos sentidos (sin «Ver tarjetas» en texto ni relleno oscuro).
- **La cifra va sola:** se quitan «toca un color para cambiarlo, una talla para ver dónde hay» y «Vista de piso y almacén».
- Con los atajos a la vista, el «Hoy» o la «Condición» puestos ya no se repiten como chip debajo («Hoy: Sin stock atrás ×»): el atajo encendido
  lo dice.

**El orden de la barra:** desde 1280 px, dos filas (buscar · escanear · Filtros · anillo | cifra · orden · vista · sonido; debajo, los atajos).
Más angosto, tres: buscar con Filtros y el anillo, los atajos, y la cifra con la vista. Cada control existe una vez: solo cambia de lugar
(`order-*` sobre un `flex-wrap`). Medido en local: la tarjeta de la barra pasa de unos 190 px de alto a **120 px** a 1280 y 1440 px; a 1024 px son
cuatro filas (los atajos no caben en una); a 375 px, 168 px, sin desplazamiento lateral de la página.

DECIDÍ: el anillo al costado de «Filtros».
DESCARTÉ: subirlo a la cabecera, como la maqueta, porque la cabecera la dibuja el servidor (`EncabezadoPagina`, ADR-0220) y el anillo vive en el
estado del panel (avanza al colgar): había que colgarlo con un portal que aparece después de cargar la página (un salto) o pasar la cabecera al
navegador, en dos archivos que también tocan los PR #807 y #808.
SE ROMPE SI: una sede tiene muchos pendientes y nadie mira el anillo porque quedó «escondido» en la barra: el número del día solo se ve si se
busca. Si pasa, la cifra de pendientes puede ir también como punto en la cabecera, sin mover el anillo.

### Segunda vuelta del mismo día — el panel «Filtros» se reordena, la tarjeta se achica y la acción dice su nombre

**Pedidos** (mirando la pantalla en local): «estos apartados [Prioridad | A–Z] quizás ponerlos dentro de Filtros, reorganiza Filtros y todo el
espacio de la barra para que no se sienta congestionada»; «que al pasar el cursor se despliegue el icono con su texto y aparte la ventana»;
«aprovechar el espacio que sobra, que se vea bonito y no ocupe mucho… pero que tampoco se vea amontonado».

- **Filtros en tres filas con nombre:** **Prenda** (Categoría · Talla · Color · **Marca**: la marca es de la prenda, no de quien gestiona),
  **Gestión** (Hoy · Condición) y **Vista** (**Ordenar por**, con todos los órdenes, y **Sonido al confirmar**). El orden y el sonido salen de la
  fila del buscador, que queda con buscar, escanear, Filtros y el anillo a la izquierda, y la cifra y tabla/tarjetas a la derecha. El orden no
  cuenta como filtro puesto (no quita prendas); si no es el de siempre, se ve como chip «Orden: …» que vuelve atrás con un toque. «Más
  relevantes» se llama **«Prioridad»** donde la sede separa piso y almacén (el nombre que la persona ya vio).
- **La acción de la tarjeta sube a la fila de los colores**, a la derecha: su fila propia de abajo estaba vacía salvo por el icono. La tarjeta
  baja de unos 240 a **192 px** y las acciones de una fila de tarjetas quedan a la misma altura; el aire interior no cambia.
- **El icono dice su nombre:** con mouse, al pasar el cursor (o enfocar) se estira a «Colgar en el piso» y además se abre la ventana con las
  OTRAS acciones (ya no repite la del botón). Sin mouse (tablet, celular) el nombre se ve siempre si la tarjeta tiene 18rem de contenido; si
  no cabe (muchos colores), el botón baja de línea.
- **Atajos en una fila que se desliza bajo 1280 px:** partidos en dos o tres líneas se veían amontonados. Desde 1280 px caben en una.
- **El anillo, más chico donde falta ancho:** bajo 1024 px solo el círculo con la cifra adentro (lo que falta, o ✓); el buscador gana ese lugar.
  Y ya no dice «Al día» si hay pendientes: dice cuántos, en ámbar. Era el recordatorio que quedaba a la vista del piso sin cuadrar.

DECIDÍ: el nombre de la acción se abre al pasar el cursor y se ve siempre con el dedo.
DESCARTÉ: el nombre siempre visible con mouse (cada tarjeta con un botón ancho: el «amontonado» que se pidió evitar) y solo el icono también en
tablet (con el dedo no hay «pasar por encima»: el nombre no se vería nunca).
SE ROMPE SI: una tablet con mouse (o un portátil con pantalla táctil) informa «hover» y nunca muestra el nombre fijo: ahí vale el comportamiento
de computadora, que es correcto para quien tiene cursor.

### Tercera vuelta — «Qué toca con esta talla» en el panel

**Pedido** (comparando el panel del ERP con el de la maqueta): «le falta especificar si hay, si reponer, qué falta, y si sugiere pedir o
no a otra sede». En el ERP, una talla con 0 en piso y 6 en almacén decía «Disponible: 6 unidades» en verde: la frase y «Faltan en el piso»
solo hablaban cuando el motor del piso decía «por colgar», y con el motor sin responder (local) o en pausa (TRU sin cuadrar) callaban.

DECIDÍ: en «Esta talla», tres respuestas que siempre dicen algo (`queTocaConLaTalla`, `lib/existencias-panel-talla.ts`, con su prueba):
**Hay** (sí/no, con piso y almacén o lo que viene en camino), **Colgar en el piso** (sí y cuántas, con su botón / no hace falta / no se puede
/ en pausa) y **Pedir a otra sede** (no hace falta / sí, a la tienda que más tiene, con su botón / al Taller se le pide aparte / nadie
tiene). Manda el motor cuando decide; sin su decisión, los números. «Faltan en el piso» usa la misma idea (`loQueFaltaEnElPiso`). La frase
única de antes (`diagnosticoDeTalla`) se borra: nadie más la usaba.
DESCARTÉ: copiar la regla de la maqueta (solo números: 0 en el piso = «por reponer»), porque en una sede sin cuadrar mandaría a colgar lo
que ya cuelga (ADR-0328, decisión 5). Con el piso en pausa la respuesta es «En pausa» y la frase dice que mire si ya cuelga, sin botón.
SE ROMPE SI: el motor deja de responder en producción: «Colgar» vuelve a los números y puede pedir colgar una talla de los extremos sin
ventas, que el motor habría mandado mantener. Es lo menos malo: decir «Disponible» en verde con 0 en el piso era peor.

**La talla principal, con un solo borde** (mismo día): con un filtro puesto, la talla que más se vende llevaba un aro oscuro por fuera de su
propio borde; en una talla sin nada (borde punteado) quedaban dos bordes. Ahora el aro reemplaza al borde: uno solo, sólido y oscuro, y el
estado lo dicen el fondo, la cifra («—») y la insignia del filtro.

**Las acciones del panel siguen a la talla** (mismo día; pedido: «que el orden de los accesos cambie según lo que necesita esa prenda y se
muestren primero los que puede usar»).
DECIDÍ: primero la que la talla necesita (Colgar si no hay en el piso y sí atrás —con la vara de «Qué toca», nunca en pausa—; si no, Pedir
cuando queda 1 o ninguna y una tienda tiene), después las que se pueden usar en el orden de su lugar (con algo en el piso: Apartar primero;
sin nada colgado: Colgar; sin nada en la sede: Pedir), y las que no se pueden ahora al final, como una línea chica con su porqué
(«No se puede ahora: Subir a almacén · nada en piso»). La tecla 1–7 queda pegada a la acción (Colgar = 1 … Ficha = 7), no a su lugar.
DESCARTÉ: esconder las que no se pueden (se pierde el porqué: «¿por qué no puedo subirla?» se responde ahí mismo) y numerar por lugar (con
el orden cambiando en cada talla, la misma tecla haría cosas distintas).
SE ROMPE SI: alguien aprende de memoria el LUGAR de un botón (no su tecla) y el orden cambia de una talla a otra. El color y el nombre
siguen iguales; el lugar ya no es fijo a propósito.

