# ADR-0238 · Comprobantes conectado: «Hoy» primero, cada boleta abre su venta y pestañas abajo en celular

- **Fecha:** 2026-09-26 · **Estado:** Implementado en web (PR pendiente de fusión por Felipe). **Producción:** sin
  migración ni RPC nueva: solo pantalla y lecturas con la RLS de siempre (`comprobantes`, `clientas`, `devoluciones`).
- **Pedido:** Felipe pasó 11 capturas de Comprobantes y pidió conectarla con las pantallas nuevas y hacerla cómoda en el
  teléfono. Tras el análisis (`docs/pantallas/vender-comprobantes.md`), un demo y dos vueltas de spike eligió
  **1A «Hoy» · 2B barra abajo · 3A Cobrar + Apartar**, las 4 pestañas **Hoy · Series · Por enviar · Proformas** para todos
  y gráficos en las tarjetas **solo con colores CAYLA**. Después pidió «súbelo al sistema».
- **Spike:** `docs/maquetas/comprobantes-conectado-2026-09/spike.html` (y `demo.html`, con el comparativo y la
  investigación de Shopify POS, Square, Lightspeed, Nubefact, Alegra y Bsale).

## Decisión

1. **Pestañas (`lib/facturacion-reglas.ts`, `PESTANAS`):** Hoy (`/vender/comprobantes`), Series (`/series`, nueva ruta),
   Por enviar (`/por-reintentar`: la ruta no cambia) y Proformas. «Emitidos» deja de ser pestaña: su ruta
   `/emitidos` sigue viva como «Este mes» de Hoy (selector `PeriodoComprobantes`), así no se rompe ningún enlace.
2. **«Por enviar» cuenta todo lo que no llegó a SUNAT** (`getPorEnviar`): la cola de reintento **más** los `pendiente` y
   los `rechazado`. Hasta hoy la vista solo listaba `pendiente_reintento` y decía «todo llegó» mientras producción tenía
   3 boletas `pendiente` con 0 intentos (consultado el 2026-09-26). El contador de la pestaña sale del resumen
   (`resumenPorEnviar`), que ya incluía los tres estados, así que el número y la lista ya no se contradicen.
3. **Sin cifras en la cabecera:** repetían las tarjetas y cambiaban de lugar según la pestaña. «Por enviar» sigue
   siempre a la vista como contador de su pestaña.
4. **Gráficos en las tarjetas (`ComprobantesGraficos.tsx`, reglas en `lib/comprobantes-graficos-reglas.ts`):** Emitidos
   por tipo, Facturado por hora o por día (tinta = facturado ante SUNAT real, neutro = prueba o sin enviar; la parte en
   tinta suma lo mismo que la cifra), enviados contra faltan, y puntos para vigentes, por vencer, vencidas y rechazados.
   **Colores:** `--color-tinta`, `--color-taupe`, `--color-grafico-neutro`, `--color-grafico-alza`,
   `--color-grafico-baja` y `--color-sand`. **El rojo no entra en ningún gráfico** (ADR-0169).
5. **Cada comprobante tiene «Opciones» (`OpcionesComprobante.tsx`):** WhatsApp **al número de la clienta**
   (`clientas.telefono_whatsapp` por DNI, `enlaceWhatsAppA`), Ver PDF, **Ver la venta** (el `DetalleVentaModal` de
   Historial y Caja), Imprimir de nuevo, **Cambio** y **Devolución** (`/cambios?q=<serie-número>`, que ya busca por
   comprobante), y el vínculo **nota de crédito ↔ boleta ↔ devolución** («Tiene NC…», «Corrige…»). XML y CDR van al
   pie («para el contador»). En celular, los enlaces sueltos de la fila se esconden y todo vive en esa hoja.
6. **Celular: las 4 pestañas abajo** (`PestanasComprobantesMovil.tsx`, bajo `lg`), con el mismo patrón y `EnCuerpo`
   de Apartados. Arriba queda la búsqueda.
7. **Proforma → Apartar:** junto a «Cobrar», en las vigentes. Las prendas viajan como desde el ticket del POS
   (`hrefApartarDesdeTicket`, `?prendas=`); Apartados vuelve a leer precio y stock de hoy y cobra el adelanto (ADR-0166).
8. Series dice «Sigue el 33 · 32 reservados» en vez de «32 números usados» (el contador cuenta reservas, no emitidos).

## Excepción a ADR-0206

ADR-0206 dejó el celular sin barra de navegación (solo el ☰). Una **barra de pestañas de la propia pantalla** no es
navegación del ERP: Apartados ya la tenía (PR #482) y Comprobantes la suma aquí. La regla queda así: el ☰ es el único
menú; una pantalla con pestañas puede llevarlas abajo en celular.

## Descartado

- **Migración para que la RPC de la cola traiga los `pendiente`:** tocaba una función de producción (confirmación
  aparte) sin ganar nada que la lectura directa de `comprobantes` no dé ya, con la misma RLS.
- **Tarjetas que filtran la lista al tocarlas** (estaban en el spike): el filtro vive en el estado de `ComprobantesPanel`
  y las tarjetas son de servidor; queda para un paso aparte, con `?estado=` en la URL.
- **Búsqueda en todos los meses:** sigue buscando en lo cargado (hoy o el mes). Queda en BACKLOG (#11 del análisis).

## Qué no resuelve

- **Por qué el barrido toma las boletas `pendiente` y no las intenta** (`intentos_transmision = 0` con
  `proximo_reintento_at` corriéndose): ahora se VEN en «Por enviar» y se pueden «Enviar ahora», pero la causa sigue
  abierta. Tampoco qué flujo creó dos de ellas sin venta.
- «Apartar» no lleva la clienta ni el precio cotizado: Apartados arranca con las prendas y el precio de hoy.

## Cómo se verificó

`tsc`, `eslint` de los archivos tocados, 186 suites de `vitest` en verde y `next build --webpack` (exit 0, con las 5 rutas
de Comprobantes). En el navegador, con datos inventados en una página temporal (sin sesión): computadora a 1400 px y
celular a 375 px, la hoja de Opciones (enlaces de WhatsApp con `wa.me/51…`, Cambio y Devolución con `?q=`) y los gráficos
de Hoy y Proformas. **Falta verlo con una cuenta real** (líder y colaboradora) tras el despliegue.
