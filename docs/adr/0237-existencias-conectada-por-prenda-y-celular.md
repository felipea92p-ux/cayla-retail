# ADR-0237 · Existencias conectada: por prenda, con sus pantallas vecinas y hecha para el celular

- **Fecha:** 2026-09-26 · **Estado:** Implementado en web (PR pendiente de fusión por Felipe). **Producción:** sin
  migración ni RPC nueva: solo pantalla, y lecturas con la RLS de siempre.
- **Pedido:** Felipe pasó 11 capturas de Existencias (y de Bajar al piso, Mover mercadería, Traslados y los modales) y
  pidió conectarla con las pantallas nuevas y hacerla fácil en el celular, «que la mayoría usará el teléfono gran parte
  del día». Ante las preguntas eligió los cuatro accesos (Recibir, Conteo, Etiquetas, Apartados) y pidió **demo** de las
  otras tres; después, «súbelo al git y que los cambios sean visibles en el sistema». Sin elección explícita en esas
  tres, se construyó lo recomendado en el spike.
- **Spike:** `docs/maquetas/existencias-conectada-2026-09/spike.html` (computadora y celular lado a lado; la barra de
  arriba alterna las opciones).
- **Alcance:** `app/(app)/inventario/page.tsx` (accesos), `components/InventarioPanel.tsx`,
  `components/ExistenciasPorPrenda.tsx` y `components/DetallePrendaExistencias.tsx` (nuevos),
  `lib/existencias-prendas.ts` (nueva, con pruebas), `components/EscanerBusqueda.tsx` (título y pista opcionales),
  `app/(app)/inventario/bajar/page.tsx` + `BajarAlPisoForm.tsx` + `lib/bajada-reglas.ts` (`?lineas=`),
  `app/(app)/etiquetas-de-precio/page.tsx` + `lib/etiquetas-precio.ts` + `lib/etiqueta-precio-reglas.ts` (`?variantes=`).
- **Complementa:** ADR-0231 (la regla única de piso: nada aquí decide qué reponer), ADR-0220 (cabecera), ADR-0161
  (accesos por módulo), ADR-0206 (celular sin barra de navegación), ADR-0229/0232 (Cambios y Devoluciones conectadas:
  mismo patrón de «llevar con la lista cargada» y de botón fijo para escanear).

## Problema

Existencias sabía qué había, pero para hacer algo con eso había que salir: Recibir, Contar, Apartados y Etiquetas no
tenían camino desde aquí, y Trasladar o Bajar al piso empezaban con la lista vacía aunque la prenda ya estuviera a la
vista. La tabla tenía una fila por talla: la Blusa Carlita en 3 colores eran 15 filas y 58 tallas se repartían en 4
páginas; en el celular, cada talla era una tarjeta con 6 recuadros. Y en el piso la consulta más frecuente («¿hay en
M?») obligaba a escribir el código.

## Decidí

1. **La lista entra por prenda** (modelo + color, la misma «percha» de «Por colgar», `clavePercha`), con la curva de
   tallas en una línea: `piso·almacén` libre de cada talla. Ámbar lleno = por colgar; borde ámbar = pide reponer;
   tachada = sin nada libre aquí. Los tonos salen de `porColgar` y de «Acción hoy» (ADR-0231), nunca de un umbral propio.
   **«Por talla» queda a un toque**: es la tabla del PR #445 sin cambios (Cobertura, Ritmo, En la red).
2. **El detalle de la prenda** (`<Modal>`: panel en computadora, hoja que sube en el celular) reúne lo que estaba
   repartido: tocas una talla y ves Reponer al piso, Apartar y Retirar del piso; debajo, Trasladar, Imprimir etiquetas,
   Ajustar e Historial; al final, dónde más hay esa talla. Sus acciones de talla no abren un modal encima de otro:
   cierran el detalle y abren el suyo (los mismos de siempre: `ReponerPisoModal`, `ApartarModal`, `AjustarInventarioModal`).
3. **Varias a la vez:** una casilla por prenda (marca todas sus tallas) y una barra abajo con Bajar al piso, Trasladar y
   Etiquetas. Cada botón **lleva a la pantalla que ya hace el trabajo con la lista cargada**, no la hace aquí:
   `/inventario/bajar?lineas=`, `/inventario/mover?lineas=` (formato que ya leía para Producción) y
   `/etiquetas-de-precio?producto=` (un modelo) o `?variantes=` (varios, origen nuevo). Solo en la sede activa: esas
   pantallas trabajan siempre sobre la sede de quien entra.
4. **Cantidades: una unidad por talla** en lo que se lleva a Bajar y a Trasladar. CAYLA no sugiere cuánto reponer
   (ADR-0231): la lista llega armada y la vendedora pone la cantidad; cada pantalla la topa a lo que hay libre.
5. **Escanear:** en el celular, «Escanear prenda» fijo abajo (como Cambios) con `EscanerBusqueda`, que lee UNA etiqueta.
   En la computadora, la pistola en el buscador: con Enter, **solo el código exacto** (etiqueta o código de barras)
   abre la prenda parada en esa talla; un pedazo nunca abre otra talla por parecerse. Un código que no es de esta sede
   queda escrito en el buscador y el estado vacío de siempre explica por qué no aparece.
6. **Accesos en la cabecera, en dos renglones:** arriba Bajar al piso y + Nuevo traslado; abajo, chicos, Recibir
   mercadería, Contar y Apartados (con cuántos hay abiertos). Dos renglones y no uno porque el PR #494 subió las acciones
   a la derecha para no gastar 54 px de alto, y cinco botones en fila no caben junto al título a 1440 px. Cada acceso
   solo si el rol ve ese módulo (ADR-0161) y mirando la sede propia. «+ Nuevo traslado» ahora también pregunta por el
   módulo Traslados: antes se mostraba siempre y a quien no lo tiene lo dejaba en «Sin acceso».

## Descarté

- **Etiquetas como acceso de la cabecera** (lo pidió Felipe entre los cuatro): `/etiquetas-de-precio` sin un origen
  (lotes, producto, campaña, variantes) no muestra nada. Vive donde tiene sentido: en el detalle de la prenda y en la
  barra de varias. Si se quiere en la cabecera, necesita antes una pantalla que elija qué etiquetar.
- **«Contar esta prenda»** (estaba en el spike): Conteo no acepta hoy una lista inicial; queda en BACKLOG.
- **«Pedir traslado» desde «Dónde más hay»:** «Mover mercadería» solo deja elegir el origen al líder; a una integrante
  la dejaría con el origen equivocado. Se muestra dónde hay, sin botón, hasta decidir quién pide y cómo (sigue abierta
  la pregunta de ADR-0231: «¿dónde ve la tienda que tiene que pedir un traslado?»).
- **Cambiar las 4 cifras** (Dañado y En camino, casi siempre en 0, por Por recibir y Apartadas) y la **fila de avisos**
  («llega un envío hoy», «vence un apartado»): son del spike, pero cambian qué cuenta la pantalla; esperan que Felipe
  las elija.
- **Otro escáner para Existencias:** `EscanerBusqueda` (Cambios) ya lee una sola vez; se le agregaron título y pista.

## Riesgos y cómo se verifica

- **Bajar al piso con una bajada a medias en el aparato:** si hay borrador guardado, manda el borrador (se ofrece como
  siempre) y la lista de Existencias no lo pisa. Probado en `lineasIniciales` (pura) y a mano.
- **Enlaces largos:** más de 100 tallas marcadas no arman enlace (`MAX_VARIANTES_EN_URL`): el botón no aparece.
- Verificado en navegador (página de prueba temporal, sin sesión, con datos de ejemplo) a 1440 y 375 px: lista por
  prenda, detalle, Reponer desde el detalle, barra de varias con sus enlaces, pistola con Enter, cámara (en el panel el
  navegador la bloquea: la lectura real se prueba en un teléfono) y «Por talla». Falta verlo con una cuenta real y
  datos de producción.

## Actualización 2026-09-26 (noche) — lo marcado llega a «Bajar al piso» por escanear, no en 1

**Problema.** La decisión 4 mandaba a «Bajar al piso» una unidad por talla. Esa lista se podía confirmar sin escanear
nada: «Confirmar bajada · 4 prendas» quedaba activo apenas llegaba. La pantalla de bajada está hecha para lo contrario:
«Cada lectura suma 1», y lo que queda registrado es lo que se leyó al colgar. Si el sistema baja lo que se marcó y no lo
que se colgó, su piso deja de ser el piso real. Como la venta descuenta del piso, el error aparece después en la caja.
Lo encontró el análisis `/pantalla` (`docs/pantallas/inventario.md`, tarea #4), y Felipe lo pidió.

**Decidí.**
- Cada talla marcada llega **en 0, «Por escanear»** (`lineasIniciales`, `porEscanear` en `lib/bajada-reglas.ts`).
- Cada lectura la sube a 1 y la lleva arriba, como con cualquier prenda. Lo «por escanear»:
  - no viaja a la base (`itemsParaRpc` ya descartaba los ceros);
  - no cuenta en el resumen ni en el botón;
  - no dispara el aviso al salir de la página.
- Con solo prendas por escanear, «Confirmar bajada» queda apagado y dice: «Escanea cada prenda de la lista al colgarla:
  solo se baja lo escaneado».
- El borrador del aparato conserva lo «por escanear» junto a lo escaneado. Sin nada escaneado no hay borrador que
  ofrecer: la lista se rearma desde Existencias.
- El enlace (`?lineas=id:1`) no cambia: el 1 es solo su formato. La pantalla no lo usa.

**Descarté.** Dejar el 1 y avisar «revisa las cantidades». Un aviso no impide confirmar a ciegas, y ese error lo paga
la caja, no Existencias. También descarté marcar la lista como «sugerida» con otro color: sigue siendo algo que se
confirma sin tocar.

**Se rompe si** la vendedora, en vez de escanear, toca «+» en cada talla. Queda permitido a propósito: es el mismo
arreglo a mano que ya existía («si tienes 12 iguales, escanea una y cambia el número»), pero exige un toque por talla.
No es un confirmar a ciegas.

**Trasladar no cambia:** «Mover mercadería» sigue recibiendo una unidad por talla, porque quien envía un traslado arma
el pedido y lo confirma el que recibe.

**Verificación.** `lib/bajada-reglas.test.ts` (95 casos, 3 nuevos en `lineasIniciales` y el del borrador). En el
navegador, con la cuenta de líder en TRU:
- dos tallas llegan «Por escanear», con «0 prendas · 0 modelos» y el botón apagado;
- la pistola lee una: queda en 1, arriba, y el botón dice «Confirmar bajada · 1 prenda»;
- al recargar, el borrador ofrece «1 prenda» y al continuar vuelven las dos.

No se confirmó la bajada, para no dejar movimientos en la base local compartida.

## Actualización 2026-09-26 (noche, 2) — la lista empieza por lo urgente, y el celular llega a la lista

Tareas #5 y #6 del análisis `/pantalla` (`docs/pantallas/inventario.md`), ordenadas por Felipe.

**#5 · Por dónde empezar.** Con el umbral de 4, en Lima local 33 de 33 tallas pedían reponer, y cada fila llevaba un
botón negro: la señal no distinguía nada.
- Sin texto en el buscador, la lista por prenda sale por urgencia: primero las prendas con tallas por colgar (la de más
  tallas antes), después las que piden reponer, al final el resto. Es estable (`ordenarPorUrgencia`,
  `urgenciaDePrenda` en `lib/existencias-prendas.ts`).
- Con texto escrito, sigue mandando la relevancia de la búsqueda.
- «Reponer N tallas» y el «Reponer» de «Por talla» pasan a **secundarios**. En la pantalla queda un solo botón negro,
  «+ Nuevo traslado».
- El umbral (4) no se tocó: sigue abierto en ADR-0231.

**#6 · El celular llega a la lista.** A 375 px, la primera prenda empezaba a unos 1.900 px; ahora empieza a 764 px,
medido con la cuenta de líder en TRU, local. Todo es solo por debajo de `sm`; la computadora no cambia.
- Los cinco accesos de la cabecera van en UNA fila que se desliza de lado, sin barra visible. El ancho se topa al de la
  pantalla, así que la página no se corre hacia los costados (medido: `scrollWidth` = 375).
- Las cifras van de a dos por fila, compactas, sin la línea de detalle. Al tocarlas se abre lo mismo que antes.
- Los combos de filtro se pliegan tras «Filtros · n» (n = cuántos están puestos). Se ven debajo de la fila de la
  píldora (`order`), así que el botón no se mueve al abrirlos (ADR-0185). Medido: el botón queda en 682 px abierto o
  cerrado.
- Queda justo bajo el botón fijo «Escanear prenda», que tapa unos 90 px de abajo: se ve con un deslizamiento mínimo.
  Lo que sigue ocupando la primera pantalla (la frase de la cabecera, el título «Prioridades de hoy» y sus dos enlaces)
  se dejó a propósito.
