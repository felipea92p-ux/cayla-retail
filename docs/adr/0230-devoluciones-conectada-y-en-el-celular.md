# ADR-0230 · Devoluciones conectada con sus pantallas vecinas y hecha para el celular

- **Fecha:** 2026-09-26 · **Estado:** Aprobado por Felipe («me parece bien, ahora realízalo para visualizarlo en el
  sistema»). **Producción:** sin migración ni RPC nueva: solo pantalla y lecturas con la RLS de siempre.
- **Spike:** `docs/maquetas/devoluciones-2026-09/` (`demo.html` para elegir, `spike.html` con lo elegido; README con la
  investigación de Shopify POS, Square, Lightspeed, Odoo y Bsale).
- **Alcance:** `app/(app)/devoluciones/page.tsx`, `components/DevolucionesPanel.tsx`, `DevolucionesVentas.tsx`,
  `DevolucionesPendientes.tsx`, `DevolucionesResueltas.tsx` (nuevo), `BuscadorVentas.tsx` (`escanearRef`,
  `escanearEnBarraMovil`), `ui/ResumenSede.tsx` (cifra con `href` y `alerta`), `lib/devoluciones.ts`
  (`getDevolucionesResueltas`, `contarPrendasEnCuarentena`), `lib/devoluciones-reglas.ts` (`estadoPlazoDevolucion`,
  `destinoPrendaResuelta`), y `inventario/page.tsx` + `InventarioPanel.tsx` (`?danados=1`).
- **Complementa:** ADR-0122/0125 (flujo guiado), ADR-0161 (accesos por módulo), ADR-0206 (celular sin barra de
  navegación), ADR-0220 (cabecera de Ventas), ADR-0225/0226 (botón fijo abajo en el celular).

## Problema

Devoluciones funcionaba, pero sola. Actividad reciente repetía un botón negro «Iniciar devolución» por venta (siete
iguales en TRU), y «Dentro del plazo» no decía cuánto quedaba. El cambio, que R-37 pone primero, estaba escondido al pie del
paso 2. Lo que esperaba a un líder solo aparecía como bloque cuando había algo, y las cifras contaban únicamente lo
aprobado. Una vez resuelta, la devolución desaparecía: ni su nota de crédito ni adónde fueron sus prendas. En el celular,
la cabecera, el buscador y dos chips llenaban la primera pantalla, y «Escanear prenda» se perdía al bajar.

## Decisión (Felipe eligió en el demo: 1A, 2A, 3A y el aviso de caja para los dos roles)

- **D1 — Tarjeta compacta con dos acciones.** «Devolver» con borde (`btn-secundario`) y, al lado, «Cambiar» (enlace a
  `/cambios?item=` con la primera prenda que todavía se puede tocar). «Ver venta» abre `DetalleVentaModal` (prendas, pago,
  comprobante, reimpresión). El chip dice «Quedan N días», **ámbar los últimos 3** (antes verde: «sigue dentro»; el spike lo
  pidió ámbar porque apura, y ámbar ya significa «a la espera de alguien»: aquí, de la clienta). Los resultados de
  búsqueda (una fila por prenda) conservan su botón negro: ahí la prenda ya se eligió.
- **D2 — En el celular, «Escanear prenda» y la lupa fijos abajo.** Es la acción de la pantalla, no navegación (ADR-0206),
  igual que «Vender» en el Inicio y en Caja. Escanear sube al buscador y lo deja en modo escaneo; la lupa lo enfoca. El
  chip «Escanear prenda» se oculta en el celular para no repetirse.
- **D3 — «Por aprobar» es la primera cifra, tocable y ámbar si hay alguna**, y lleva a la pestaña del mismo nombre. La parte
  baja son tres pestañas: Compras (con sus filtros como `pildora-cayla`, para no confundirse con las pestañas), Por
  aprobar y **Resueltas**: las aprobadas y rechazadas de 15 días, con la nota de crédito (enlace a Comprobantes ▸ Emitidos),
  el reembolso y el destino de cada prenda (`destinoPrendaResuelta`: impecable al piso, lo demás a cuarentena, rechazada
  sigue con la clienta).
- **D4 — Avisos que llevan a las pantallas vecinas.** «N prendas esperan en cuarentena → Revisar en Inventario» abre la
  cola de dañadas (`/inventario?danados=1`). «La caja está cerrada → Abrir caja» lo ven **los dos roles**, cada uno con su
  texto: el líder decide el reembolso al aprobar, y la colaboradora le avisa a la clienta antes de registrar.
- **D5 — Cada acceso solo si la cuenta ve el módulo** (`veModulo`, ADR-0161): Cambios, Caja, Comprobantes (`facturacion`)
  e Inventario (`existencias`). Un enlace nunca lleva a «Sin acceso»; sin el módulo, el aviso de caja queda sin enlace y
  el de cuarentena no se pide a la base.

## Lo que quedó fuera

- **Ficha de la clienta.** Felipe la eligió, pero `/clientas` sigue siendo una pantalla mínima de verificación, sin menú
  ni módulo (ADR-0154). Además la venta solo guarda el nombre y el documento del comprobante, no un `clienta_id`. Enlazarla
  sería mandar a la colaboradora a una pantalla de pruebas. Se retoma cuando exista la ficha real.
- **«Sin comprobante» como flujo propio con solo saldo a favor** (Lightspeed) y **la nota de crédito como pago en Vender**
  (Bsale, R-37): piden decisión de negocio, y la segunda también base.

## Verificación

`vitest` completo (173 archivos), `tsc` y `eslint` en verde. En el navegador, contra la base local con datos de prueba, a
1440 y 375 px: la cifra abre «Por aprobar», Resueltas muestra una devolución real con una prenda al piso y otra en
cuarentena, «Ver venta» abre el detalle, y «Revisar en Inventario» abre la cola de dañadas. **No verificado con clic:** el
aviso de caja cerrada (la caja local estaba abierta y no se cerró una caja compartida para probarlo) y el enlace
«Cambiar» hasta el flujo de Cambios.
