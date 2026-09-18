# ADR-0052 — El reembolso en efectivo también cuadra la caja

**Fecha:** 2026-09-15
**Estado:** Aplicado en local (`20260915180000_reembolso_en_el_arqueo.sql`).
**No aplicado en producción** — la pega Felipe (D-11); ya lleva `retail.` cuando toque.
**Afecta:** `retail.devoluciones` (columna nueva), `retail.aprobar_devolucion`,
`retail.cerrar_caja` (mismas firmas — sin `drop`), `apps/web/lib/caja.ts`,
`apps/web/components/CajaAbiertaPanel.tsx`, `apps/web/lib/comprobantes-reglas.ts`
(`parsearComprobante`, nueva), `apps/web/lib/ventas-v2.ts`,
`apps/web/lib/devoluciones.ts`, `apps/web/components/BuscarPorComprobante.tsx` (nuevo),
`apps/web/components/DevolucionesLista.tsx`, `apps/web/components/CambiosLista.tsx`,
`apps/web/app/(app)/devoluciones/page.tsx`, `apps/web/app/(app)/cambios/page.tsx`.

## Contexto

Al analizar Devoluciones contra los siete ERP/POS de la comparativa externa aparecieron
dos huecos, distintos pero en la misma pantalla:

1. **El dinero se fuga del arqueo.** `devoluciones.reembolso_monto`/`reembolso_metodo`
   se guardan al aprobar (ADR previo a este repo, ya existente), pero `cerrar_caja`
   nunca los mira. Cuando una Líder reembolsa S/25.90 en efectivo, ese dinero sale
   físicamente del cajón, pero el sistema sigue esperando el monto de siempre — el
   cajón cierra "sobrando" exactamente lo reembolsado, un faltante disfrazado de
   sobrante, indistinguible de un error real de conteo.
2. **Solo se encuentra la venta entre las últimas 30.** `getLineasVentaParaDevolucion` y
   `getLineasVentaRecientes` (Cambios) leen "las 30 ventas más recientes de la sede" sin
   ningún filtro — una clienta que vuelve una semana después no tiene cómo devolver ni
   cambiar nada: su venta ya no está en la lista y no hay dónde escribir el número de
   boleta.

## Decisión

**Parte 1 — el reembolso resta del cajón, no solo se guarda.**

`devoluciones` gana `caja_id`: la caja que estaba **abierta en el instante en que se
aprobó** la devolución (no la de la venta original, que puede ser de otro día).
`aprobar_devolucion` la fija sola, sin que la pantalla la mande. `cerrar_caja` resta los
reembolsos en efectivo de esa caja del `monto_sistema`, en la misma fórmula que ya suma
ingresos y resta egresos — ningún cambio de firma en ninguna de las dos RPC, y el
conteo ciego (ADR-0042: `cerrar_caja` sigue sin revelar el esperado antes de contar) no
se toca. Solo `efectivo`: un reembolso por Yape, Plin, transferencia o tarjeta no
afecta el cajón físico.

En `CajaAbiertaPanel` se agrega una tarjeta "Reembolsos en efectivo" — mismo criterio
que Ingresos/Egresos (un desglose, no el total esperado; conteo ciego intacto), visible
solo cuando hay alguno.

**Parte 2 — buscar por N° de boleta o factura, en Devoluciones y en Cambios.**

`parsearComprobante(texto)` (`comprobantes-reglas.ts`, pura, con test) lee "B001-000010",
"B001-10" o solo "10" — lo que la Encargada escribe a mano desde el papel impreso.
`buscarVentaIdsPorComprobante(ubicacionId, serie, numero)` (`ventas-v2.ts`, compartida
por Devoluciones y Cambios) busca en `comprobantes`; sin serie, un número puede calzar
con boleta, factura o nota (cada tipo tiene su propio correlativo,
`series_comprobantes`) — se devuelven todas las que calcen, la Encargada elige por la
prenda. Con una búsqueda activa, `getLineasVentaParaDevolucion`/`getLineasVentaRecientes`
ignoran el límite de 30 y el filtro de fecha: buscan la venta exacta, sin importar cuán
vieja sea. `?q=` en la URL es la fuente de verdad (mismo patrón que Movimientos,
2026-09-15): la página server component vuelve a pedir los datos con la búsqueda puesta;
`BuscarPorComprobante.tsx` (un componente, usado por las dos pantallas) solo escribe la
URL.

## Se descartó

- **Calcular el reembolso por ventana de tiempo** (`aprobado_en` entre `abierta_en` y
  el cierre) en vez de una columna `caja_id`: técnicamente correcto hoy (una sola caja
  abierta por ubicación a la vez, candado ya existente), pero deja "qué caja absorbió
  este reembolso" como algo inferido, no un hecho guardado — inconsistente con cómo
  `ventas.caja_id`/`caja_movimientos.caja_id` ya lo hacen explícito.
- **Resolver el mismo hueco en Cambios (`cambios.diferencia`/`metodo_pago_diferencia`)**
  en esta pasada: `registrar_cambio` calcula y guarda la diferencia de precio de un
  cambio, pero —igual que las devoluciones antes de este ADR— nunca la inserta en
  `caja_movimientos` ni la liga a una caja. Es la misma fuga, en la pantalla vecina.
  Queda registrada en el BACKLOG como paso propio: el mecanismo de este ADR
  (`caja_id` fijado al aprobar/registrar, restado en `cerrar_caja`) es directamente
  reutilizable, pero mezclarlo acá habría hecho un commit sobre dos módulos a la vez
  sin necesidad.
- **Devolver por serie y número exactos únicamente** (sin aceptar solo el número, o sin
  ceros a la izquierda): la Encargada lee un papel impreso, no un campo de formulario —
  exigir el formato exacto es la misma fricción que ya se evitó en otras pantallas.

## Consecuencias

- Aprobar una devolución con la caja de esa ubicación **cerrada** deja `caja_id` en
  null: ese reembolso no se resta de ningún cierre futuro. Hueco conocido, no resuelto
  acá — el dinero físico tampoco puede salir de un cajón cerrado, así que el reembolso
  real ocurre cuando se vuelva a abrir la caja, un momento que hoy no se captura. Con
  las 9 personas registradas todas Líder y sin caja cerrada al aprobar en el uso real
  hasta ahora, no se ha ejercitado en producción.
- La búsqueda por boleta no reemplaza un historial de ventas: sigue sin haber una
  pantalla para "todas las ventas de esta sede en este rango de fechas" — solo resuelve
  "encontrar ESTA venta si tengo su comprobante", que es lo que Devoluciones y Cambios
  necesitaban.
- `packages/database/src/types.ts` recibió a mano solo `devoluciones.caja_id` — no se
  corrió una regeneración completa (rompería `ProveedoresPanel.tsx`, deuda ya conocida
  del repo).

## Verificación

- `comprobantes-reglas.test.ts`: 6 pruebas nuevas para `parsearComprobante`; suite
  234/234 (antes 228, sumando además las de ADR-0054).
- psql, 3 escenarios en transacciones con `rollback` (impersonando al Líder vía
  `set local role authenticated` + `request.jwt.claims`): reembolso en efectivo de
  S/50 → `cerrar_caja` da exactamente S/50 menos que la referencia sin reembolsos;
  reembolso por Yape de S/179.90 → sin ningún cambio en `monto_sistema`; caso de
  referencia sin ningún reembolso, para comparar los dos anteriores.
- Navegador real, de punta a punta, como Líder (Tienda Lima): búsqueda "B001-10"
  encuentra la Casaca Ximena de esa boleta en Devoluciones y en Cambios; búsqueda
  "B001-99999" responde "No encontramos esa boleta o factura en esta sede"; devolución
  real de Blusa Emma aprobada con reembolso de S/25.90 en efectivo → tarjeta
  "Reembolsos en efectivo: S/25.90" en `/caja`; `cerrar_caja` con S/586.80 contra un
  esperado real de S/586.82 (200 apertura + 374.72 ventas + 45 ingresos − 7 egresos −
  25.90 reembolso) respondió "No cuadró · S/-0.02" — la aritmética exacta, no
  aproximada.
