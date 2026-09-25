# ADR-0195 · Se retira el botón "+ Nuevo" global

**Fecha:** 2026-09-25 · **Estado:** aceptado y construido · **Alcance:** `AppShell.tsx` (escritorio y celular), `lib/menu.ts`

## Problema

Felipe pasó una captura del botón "+ Nuevo" del lateral de escritorio y pidió eliminarlo: "no tiene mucha
funcionalidad". Antes de tocarlo, la revisión mostró que no era un botón suelto — era el disparador de un menú
accesible completo (patrón *menu button*: flechas, Inicio/Fin, tipeo, Tab que cierra y devuelve el foco; ADR-0003,
ADR-0111, ADR-0113), compartido entre el lateral de escritorio y el "+" central de la barra del celular
(`COLUMNAS_MOVIL`), con 6 atajos reales (`ACCIONES_NUEVO`, `lib/menu.ts`): Nueva venta, Registrar factura de
proveedor, Recibir mercadería, Mover mercadería, Registrar cambio, Registrar devolución — filtrados por permiso y
módulo, uno por cada uno de 6 módulos distintos (vender, facturas_compra, recibir, traslados, cambios,
devoluciones).

Por tocar más de un módulo a la vez (regla de CLAUDE.md), se confirmó el alcance con Felipe antes de borrar: quitarlo
solo de escritorio, dejarlo achicado (solo el ícono), o quitarlo **en todas partes**. Eligió la tercera.

## Decisión

**Se elimina el atajo global entero, en las dos superficies, sin reemplazo.** Esas 6 pantallas se siguen
alcanzando por el lateral o el árbol de rutas — lo que se pierde es el atajo de un clic desde cualquier pantalla.

- `components/AppShell.tsx`: el botón del lateral, el componente `MenuNuevo` (el menú, con todo su teclado), el
  botón "+" central del celular, y el estado/handlers que los movían (`nuevoAbierto`, `abrirNuevo`, `cerrarNuevo`,
  `disparadorNuevo`, el ícono `IC.nuevo`).
- `lib/menu.ts`: `ACCIONES_NUEVO`, el tipo `Accion`, el tipo `AccionNuevo`, y el campo `nuevo` de `Menu`. La barra
  del celular (`COLUMNAS_MOVIL`) pasa de 5 columnas (con el hueco `null` del "+") a 4: `["inicio",
  "venta.puntoDeVenta", "inventario", "venta.caja"]` — `Menu.movil` deja de admitir `null`.
- `lib/menu-hoy.golden.json` y `lib/menu.test.ts`/`lib/modulos.test.ts`: la fotografía y las pruebas que fijaban el
  menú de hoy se actualizaron para el nuevo estado (sin `nuevo`, `movil` de 4). Ninguna regla de visibilidad,
  permiso o módulo cambió — solo se retiró la superficie "+ Nuevo".

## Lo que se paga

Una combinación puntual pierde su único camino: **el líder parado en el Taller** no tiene "Recibir mercadería" en
el lateral (Compras no se muestra ahí; es la regla de siempre, ver `menu.test.ts`) — hasta hoy le quedaba solo en
"+ Nuevo". Sin el atajo, esa cuenta no tiene NINGÚN link a `/recibir` parada en el Taller (la ruta sigue viva, solo
sin un link desde ahí; llega escribiendo la URL). Es la única consecuencia funcional real de este cambio — el resto
son 6 pantallas que ya vivían, con nombre propio, en el lateral o el árbol de Compras/Inventario. Si Felipe quiere
cerrar ese hueco, la ruta más simple es la misma que ya deja documentada `menu.test.ts`: destrabar «Recibir
mercadería» para el líder en el Taller (quitar el `soloSinPermiso` de `inventario.recibir`) — decisión suya, no de
este ADR.

## Verificación

Suite completa de `apps/web` (126 archivos, 21.290 pruebas) y `tsc --noEmit` en verde. Verificado en el navegador:
el lateral de escritorio ya no muestra el botón, la barra del celular queda en 4 columnas sin hueco al centro, y el
atajo `[` (plegar/expandir el lateral) sigue funcionando.
