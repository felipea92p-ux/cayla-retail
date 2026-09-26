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
