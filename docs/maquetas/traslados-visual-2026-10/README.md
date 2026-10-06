# Traslados · visual · tres maquetas (2026-10-06)

Felipe, sobre la pantalla de hoy (`/inventario/traslados`): «es muy poco visual y tiene mucho texto que casi nadie se parará a
leer». Pidió tres maquetas **visuales, interactivas, con muchas animaciones, sofisticadas y elegantes, en concordancia con
Movimientos** (el módulo que se rediseñó el 2026-10-05, ADR-0353). Estas son esas tres, navegables y animadas. Nada toca
`apps/web` ni la base.

Para verlas: `index.html` (o el servidor `maquetas` de `.claude/launch.json`, puerto 8791). También abren con doble clic.
Arriba, en la barra oscura que no existe en el ERP: **Escritorio / Celular** (el marco de celular responde con *container
queries*, igual que una ventana de 375 px), **claro / oscuro** (ADR-0336), **Repetir animaciones** y **Volver a empezar**
(lo que hiciste en la maqueta —contar, confirmar, anular— se guarda mientras la pestaña esté abierta). El selector de sede de
la cabecera funciona: la misma caja se lee distinto desde quien la envía y desde quien la recibe. `?sede=lim`, `?vista=celular`
y `?abrir=32` (abre el cajón de ese traslado) abren directo.

Datos inventados: un martes 6 de octubre a las 10:40, doce traslados entre TRU, LIM, AQP y el Taller. Son las mismas prendas que
la maqueta de Movimientos, y sus traslados 29 y 31 son estos mismos.

## El problema que resuelven

La pantalla de hoy dice con frases lo que la persona tendría que **ver**: «3 traslados necesitan tu acción», «2 por recibir y 1
tiene una diferencia por cerrar», cuatro tarjetas de cifras, una nota al pie de dos líneas. Una fila dice «Entra a tu sede ·
Rebalanceo… · 9 prendas · 3 distintas · Pantalón Carla + 2 más · Recibido hoy 09:54 · hace un momento · Por revisar · Revisar».
Todo es verdad, pero hay que leerlo entero para saber qué hacer. Las tres maquetas parten de un **idioma común** y difieren en
*dónde* lo ponen.

### El idioma común (`comun.css` / `comun.js`)

Cada traslado se dibuja por **lo que le toca a quien mira** (la misma lectura de `situacionTraslado` en
`lib/traslados-reglas.ts`), nunca por su estado interno. Un color + un ícono propio + un movimiento + **el viaje**: la línea de
una sede a la otra, con el camión donde va la caja (lo que pasó del tiempo estimado). Nunca solo color.

| Situación | Color (token) | Ícono y su movimiento (una vez, al verse o al pasar el mouse) | Cifra grande |
|---|---|---|---|
| Viene hacia ti | oliva (el de «Llegada» en Movimientos) | el camión entra desde la izquierda | a qué hora llega |
| Atrasado | ámbar | el mismo camión, con su punto que late **tres veces** y se queda quieto | cuánto atraso |
| Enviado | tinta (el de «Traslado enviado») | el camión arranca y se dibujan sus rayas | a qué hora llega |
| Contando | pizarra (informativo, en proceso) | las líneas de la planilla se van tachando | 2/3 contadas |
| Falta revisar | ámbar | la balanza se inclina y queda inclinada | −1 faltó |
| Recibido completo | verde | la caja cae y se dibuja el visto | +12 entraron |
| Cerrado con diferencia | taupe, **sello punteado** (como el ajuste) | la caja cae y se dibuja el «−» | −1 cerrado con nota |
| Anulado | neutro | la flecha de vuelta se dibuja | 0 volvió todo |
| Te piden (pedido de otra sede) | taupe | la etiqueta se mece | la prenda pedida |

El rojo **no aparece**: nada de esto es dinero que vuelve ni un error (ADR-0353, decisión 3; la guía de foco tampoco usa rojo).

**Conteo a ciegas, en las tres (ADR-0239 D-130).** Mientras la caja viene hacia tu sede, ninguna pantalla dice cuántas prendas
trae: dice *cuáles* (la pila de prendas, «4 distintas · se cuentan al llegar») y, en vez de la cifra de unidades, muestra a qué
hora llega. Lo enviado aparece recién en el cajón, al apretar «Terminé de contar».

### El cajón del traslado (lo comparten las tres)

Misma forma que `<Modal>` (velo con desenfoque → hoja → cascada de 55 ms), con el sello, el viaje y «Qué pasó» en pasos, como el
cajón de Movimientos. Según lo que te toca:
- **Recibir:** cuentas con − / + o con **Escanear**, como hoy (cada lectura suma una y la fila destella); la barra dice «2 de 4 contadas»
  y el botón, «Faltan 2 por contar» hasta que está todo. «Terminé de contar» muestra lo enviado: cada fila entra con su visto o
  su marca ámbar, y desde ahí **ya no se puede tocar el conteo** (para corregir está «Volver a contar»; si se pudiera editar
  viendo lo enviado, dejaría de ser a ciegas). Eliges **Almacén o Piso de venta** (D-131) y confirmas: las prendas vuelan de su
  fila a la sede y aparece **«Lo siguiente»** (colgarlas en el piso, imprimir etiquetas, ver en Existencias: ADR-0242 D-6).
  Si algo no cuadró, entra lo que coincidió y el resto queda «Falta revisar» (D-129).
- **Revisar una diferencia** (líder de la sede que recibió): enviadas → llegaron, con la diferencia marcada; «Cerrar con
  diferencia» se habilita con una nota.
- **Lo que enviaste:** las prendas con su cantidad, **Guía** y **WhatsApp** (ADR-0242 D-3) y **Anular** mientras nadie empezó a
  contar (pide el motivo; todo vuelve al almacén).
- **Un pedido de otra sede** (ADR-0233 / ADR-0242 D-7): «Enviar a LIM» arma el traslado; «No la tengo» avisa.

Lo que la maqueta **no dibuja** y la pantalla real ya hace (se conserva al construir): buscar la prenda escribiendo en el campo
de escaneo, anotar una prenda que no venía en el envío, la firma de recepción del combo «Responsable» y el token contra el
doble clic.

## Las tres opciones

### A · Ruta — `a-ruta.html`
La hermana directa de Movimientos. Arriba, **«Hoy te toca»**: una tarjeta por cosa que hacer, con su sello, una cifra grande y
**un solo verbo** («Contar la caja», «Revisar y cerrar», «Enviar»). Debajo, la lista: cada traslado es una tarjeta con su sello,
la pila de prendas, el viaje y su cifra; la cabecera de «En curso» lleva una **franja** con un trazo por traslado (tocar uno te
lleva a él). Lo terminado se junta en un **mazo** que se abre en abanico. A la derecha, la **columna de estados** (Llegan,
Contando, Por revisar, Enviados, Terminados) que cuentan hacia arriba y filtran, igual que los siete botones de Movimientos.
**Cuesta:** poco. Mismos datos y la misma lista; cambian `TrasladosLista`, `TrasladosPanel` y `TrasladoDetallePanel`, y se
reutilizan las piezas de Movimientos (`SelloTipo`, `app/estilos/movimientos-sellos.css`).

### B · Mapa — `b-mapa.html`
Las cuatro sedes dibujadas sobre la costa (Trujillo arriba, Lima y el Taller al medio, Arequipa abajo) y **cada caja como un
camión en su arco**: el arco se dibuja hasta donde va, el camión corre hasta ahí al entrar, y una caja atrasada lleva su halo
ámbar. Pasar por un camión muestra su ficha y apaga los demás arcos; tocarlo abre el cajón. **Tocar otra sede es verla como esa
sede** (es el selector de sede, dibujado). Abajo, un **reloj**: arrastrarlo (o ▶) adelanta el tiempo y se ve qué llega esta
noche, mañana o el jueves (las que llegarían se pintan llenas en la puerta). A la derecha, «Hoy te toca» compacto, la lista corta
y los terminados como estampillas. En celular el mapa queda arriba, vertical como el país.
**Cuesta:** medio. Un componente SVG nuevo; los datos son los que ya lee la lista (origen, destino, salida, hora estimada,
estado). **Las sedes no tienen coordenadas en la base:** con 4 sedes irían en el código; una sede nueva pide su lugar en el mapa.
Es pariente del Observatorio del Admin (ADR-0322, «el cometa de un traslado en camino»).

### C · Horizonte — `c-horizonte.html`
Los traslados sobre **una línea de tiempo**, como un tablero de trenes. Una raya vertical dice **Ahora**: a la izquierda lo que
ya pasó, a la derecha lo que viene; las noches (20:00 a 08:00) van en una banda hueso. Arriba el carril de lo que **llega** a tu
sede, abajo el de lo que **sale**. Cada caja es una barra de cuándo salió a cuándo llega: lo recorrido lleno, lo que falta
punteado, **el atraso rayado en ámbar más allá de su hora**, la espera de un conteo o de una revisión en trazos. «Semana / 3
días» estira todo sin perder «ahora» de vista; se arrastra con el mouse o con el dedo; «Ir a ahora» vuelve.
**Cuesta:** medio. Una vista de tiempo nueva; usa columnas que ya existen (`created_at`, `fecha_estimada_llegada`,
`confirmado_en`, `cerrado_en`, `anulado_en`) y necesita los traslados de la semana de la sede, cerrados incluidos.

## Qué respetan (y qué pide decisión)

- **Colores solo de tokens** de `globals.css` y sus mezclas con `color-mix`; el modo oscuro sale solo (tinta y crema
  intercambiados, ADR-0336). Los únicos hex sueltos son los colores de las prendas inventadas, que en el ERP son dato.
- **ADR-0136:** `--ease-cayla`, sin rebote, cada animación corre **una vez** al verse o al pasar el mouse, y todo se apaga con
  `prefers-reduced-motion`. Ninguna queda en bucle.
- **Cabecera:** `EncabezadoPagina` de ADR-0220 (sede y fecha, título de 46 px, frase de una línea, acciones a la derecha).
- **«Hoy te toca» (ADR-0242 D-1)** está en las tres, con la regla de una tarjeta = una cosa = un verbo.
- **Fuera de la regla de movimiento, a decisión de Felipe** (ADR-0353 dejó escrito que su movimiento «no se generaliza: otra
  pantalla que lo quiera lo pide con Felipe»): el camión que viaja por el viaje y por el mapa, la balanza que se inclina, la
  etiqueta que se mece (el mismo péndulo del perchero), el punto de atraso que late tres veces (como el de «Vencida»), las
  prendas que vuelan al confirmar, el reloj ▶ del mapa (corre una vez y se detiene). Si se elige una opción, va su
  actualización de ADR-0136.
- **La opción A se aparta de ADR-0242 D-1 en una cosa:** D-1 sacó las tarjetas de cifras y los filtros para dejar solo la bandeja
  y la lista; la A vuelve a poner una columna de estados que cuentan y filtran, porque es lo que hace Movimientos. B y C no la
  tienen.
- **Guía de foco y Formidable:** el cajón ya dice qué falta («Faltan 2 por contar», la barra) y qué sigue («Lo siguiente»);
  al construirlo se declara en `lib/guia-de-foco-pantallas.ts` y se pasa por `/formidable`.

## Decisiones de Felipe (pendientes)

1. **¿Cuál de las tres?** (o una mezcla: por ejemplo, la lista de la A con el mapa de la B como cabecera).
2. **El movimiento rico en Traslados** (la lista de arriba): ¿se aprueba como en Movimientos?
3. **Colores:** llega en oliva y enviado en tinta (los mismos de Movimientos), contando en pizarra, revisar y atraso en ámbar
   (en Movimientos el ámbar es «Colgada en piso»; aquí no hay colgadas y el ámbar dice «al filo»).
4. **La columna de estados de la A** frente a ADR-0242 D-1.
