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

## Lo que no se portó del spike (a propósito o pendiente)

- **Borrador guardado en el equipo:** se construyó y Felipe pidió quitarlo el mismo día. No hay guardado en el navegador:
  un `router.refresh()` o una pestaña cerrada vuelve a empezar la cuenta (como antes de ADR-0129).
- **Animaciones de SALIDA** (chips de comprobante, filas fuera de comprobante): solo entran; quitar es instantáneo.
- **Subrayado deslizante de «Pendientes / Recibidas»**: son enlaces (la vista vive en la URL) y la página se vuelve a
  pintar en el servidor; ahí el subrayado cambia de color, no viaja.
- **Lista de pendientes plegable en celular** («Cambiar / Ocultar»): se conserva lo de antes (al marcar, la pantalla
  baja al panel).
- **Ícono de cámara** del escáner (en la maqueta era decorativo; un botón que no hace nada engaña).
- **Filtro de periodo de Recibidas:** ya lo cubre la pastilla «Fechas» (`?desde=&hasta=`).

## Consecuencias

- El botón «Recibir» ya no registra de inmediato: hay un paso más, pensado para quien cuenta de pie. Si Felipe lo
  prefiere directo, se quita `pedidoListo` y `registrar()` vuelve a `onSubmit` sin tocar nada más.
- El tope de 240 caracteres de la nota del spike **no** se portó: la nota sigue sin límite (el contador solo informa).
