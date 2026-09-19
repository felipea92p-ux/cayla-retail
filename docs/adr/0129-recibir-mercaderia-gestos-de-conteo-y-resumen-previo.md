# ADR-0129 — Recibir mercadería: gestos de conteo, resumen previo a recibir

- **Fecha:** 2026-09-19
- **Estado:** Aceptado. **Producción:** ninguna migración ni RPC nueva; es solo pantalla. `recibir_envio` no cambia.
- **Decide:** Felipe (pidió el spike visual de Recibir y luego «desarrolla el código»). Arquitectura: este documento.
- **Diseño:** `docs/maquetas/recibir-spike-2026-09/` (spike interactivo). Parte de `docs/maquetas/recibir-envio-2026-09/`
  y de las reglas de ADR-0113 (una guía por envío, cuenta cualquiera, colaborador sin dinero, «falta decidir»
  bloquea recibir), que siguen mandando.

## Contexto

La pantalla `/recibir` (ADR-0113) ya hacía todo lo que tenía que hacer, pero «respondía» poco: marcar comprobantes,
contar y recibir eran clics sin acuse; escanear algo que el envío no traía era un callejón; decidir qué pasó con
un faltante eran tres gestos por fila; recibir escribía movimientos que no se editan (principio 4) sin mostrarlos
juntos antes; y un `router.refresh()` o una pestaña cerrada borraba la cuenta de decenas de líneas.

## Decisiones

**D1 — Lo que sí cambia una regla (no solo estilo), decidido por Felipe al pedir el desarrollo:**
- **Resumen previo a recibir** (`ResumenPrevioEnvio`): el botón de la barra ya no escribe; abre «Confirma lo que
  entra» (por comprobante lo que llega y lo que falta con su decisión, lo fuera de comprobante, lo de otra sede y,
  solo líder, cuánto baja lo que se le debe al proveedor). «Confirmar» hace **la misma** llamada atómica a
  `recibir_envio`, con el mismo token. Las validaciones de antes siguen corriendo ANTES de abrirlo.
- **«Marcar las N atrasadas»** y «La más atrasada» como atajo (evento `recibir:marcar`, porque `KpisRecibir` se arma
  en el servidor y no comparte estado con `RecepcionEnvio`).
- **Decisión de faltante en un toque** (píldoras: «Los espero» / No llegaron / Dañadas / Error del proveedor) en vez
  de select + «Guardar», y «Los espero todas» en la barra. La regla («falta decidir» bloquea recibir) no cambia.
- **Escáner sin callejón:** si la prenda no está en el envío pero sí en otro comprobante pendiente, se ofrece
  agregar ese comprobante (`comprobantesQueTraen`) y se vuelve a leer; solo si ningún comprobante la trae pasa a
  «fuera de comprobante» como antes. «Deshacer» resta la última lectura (`restarUnidad`). Sugerencias mientras se
  teclea, sacadas del catálogo de las prendas del envío (cubre líneas agrupadas).

**D2 — Lo que solo es presentación:** subrayado que se desliza en las pestañas (`TabsSubrayado`), cifras que
cuentan (`CifraQueCuenta`), FLIP al filtrar (`useFlip`), plegado por altura de comprobantes y de la tira de decisión
(`grid-template-rows`), tilde que se traza, cascada de «Todo llegó», destello verde de lectura + cinta en el
escáner, paso − / + que aparece al pasar el mouse, miniatura de prenda con su color real (`retail.colores.hex`),
interruptor de «Es un regalo», frases rápidas en la nota, «Envío recibido» con sello, ondas y el hilo de
movimientos (`EnvioRecibido`), y en «Recibidas» un cajón de vista rápida con ↑ ↓ (`RecepcionVistaRapida`,
mismo patrón que ADR-0128), filtro de resultado con pulgar y envíos plegables. Todo con movimiento reducido = instante.

**D3 — El diseño lo decide el ancho del PANEL, no el de la ventana** (container queries, `@container`): con el menú
lateral abierto una ventana de 1440 px deja ~700 px al panel y las 6 columnas dejaban el nombre en 48 px. Panel
angosto (< 56 rem): cada línea es una tarjeta con − / +; ancho: la tabla de siempre. Ídem la tabla de Recibidas
(< 64 rem: sin «Recibió» ni flecha). Es la lección de ADR-0128 llevada a esta pantalla.

**D4 — Reglas puras con pruebas** (`lib/envio-reglas.ts`, 51 pruebas): `guiaConFormato` (ayuda, no exigencia: la guía
puede anotarse después), `restarUnidad`, `comprobantesQueTraen`, `resumenPorComprobante` y `movimientosDelEnvio`.

## Ampliación (2026-09-19, «el diseño no está igual»): revisión pantalla por pantalla contra el spike

Felipe revisó lo publicado y no era igual. Se comparó el spike y la app lado a lado (mismo ancho de contenido, 1:1) y se
corrigió lo que difería:

- **La fila de conteo es UNA pieza** con dos formas por el ancho del panel (antes eran dos bloques distintos): tarjeta
  (< 46 rem: miniatura + nombre arriba, paso − / + y estado abajo) y tabla (≥ 46 rem: sin SKU; ≥ 60 rem: con SKU). El paso
  − / + es el mismo en las dos (el número en 15 px, no el de 22 px que sobraba), la miniatura con el color real sale en las dos.
- **Tarjeta del envío:** ícono de camión, avatares de proveedores apilados y anillo de 70 px; 3 columnas desde 44 rem.
- **Barra de totales:** el aviso va ARRIBA de las cifras, la barra sube desde el borde al aparecer, y en celular las cifras
  van en una fila con el botón a todo el ancho. El título «Totales del envío» aparece solo cuando cabe junto al menú lateral.
- **Lista:** la barra roja de la fila se anima (crece desde el centro) y hay fondo al pasar el mouse.
- **Decisión de faltante:** el texto es el del spike («¿Qué pasó con las 4 que faltan?» / «Aún no llegan: los espero»).
- **Modal de resumen:** con su rótulo «Antes de recibir». **Paso −/+ al leer:** el campo «hace pop».
- **Lo que antes se dejó sin portar y ahora sí está:** salidas animadas (chips y filas fuera de comprobante, 200 ms) y la
  lista de pendientes plegable en celular («Cambiar / Ocultar»).
- **«Recibidas»:** los dos segmentados del spike en la misma fila de filtros —periodo (Este mes · 30 días · 90 días, mismas
  claves de la pastilla «Fechas») y resultado (`?res=`, se filtra en el navegador)—. La pastilla «Fechas» sigue para rangos a mano.

## Lo que no se portó del spike (a propósito o pendiente)

- **Borrador guardado en el equipo:** se construyó y Felipe pidió quitarlo el mismo día. No hay guardado en el navegador:
  un `router.refresh()` o una pestaña cerrada vuelve a empezar la cuenta (como antes de ADR-0129).
- **Subrayado deslizante de «Pendientes / Recibidas»**: son enlaces (la vista vive en la URL) y la página se vuelve a
  pintar en el servidor; ahí el subrayado cambia de color, no viaja.
- **Ícono de cámara** del escáner (en la maqueta era decorativo; un botón que no hace nada engaña).
- **Ícono por tipo de prenda** en la miniatura: sin foto usa siempre la prenda genérica sobre el color real.

La miniatura de cada línea muestra la **foto de la prenda en ese color** (`producto_fotos`, vía `fotoUrl` del catálogo) cuando existe;
sin foto, el color real con la prenda genérica. No verificado con una foto real: los datos del Postgres local no tienen fotos.

## Consecuencias

- El botón «Recibir» ya no registra de inmediato: hay un paso más, pensado para quien cuenta de pie. Si Felipe lo
  prefiere directo, se quita `pedidoListo` y `registrar()` vuelve a `onSubmit` sin tocar nada más.
- El tope de 240 caracteres de la nota del spike **no** se portó: la nota sigue sin límite (el contador solo informa).
