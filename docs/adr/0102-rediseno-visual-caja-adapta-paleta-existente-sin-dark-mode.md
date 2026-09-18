# ADR-0102 — Rediseño visual de Caja: se adapta a la paleta ya decidida, sin modo oscuro

**Fecha:** 2026-09-18
**Estado:** Aplicado (Caja y Punto de Venta)
**Nota de numeración:** escrito originalmente como ADR-0101; renumerado a 0102 al
sincronizar con `main`, donde esa numeración ya la había tomado la sesión de "Resumen de
Inventario" (`0101-resumen-inventario-quinta-pantalla.md`), fusionada mientras esta rama
seguía sin pushear.

## Contexto

Felipe pidió rediseñar Caja (visual e interactiva, con KPIs, dona de métodos de
pago, barras por hora, timeline de movimientos, historial de cierres) y
extender el mismo lenguaje visual a Punto de Venta, a partir de una maqueta
HTML de referencia (`CAYLA_CORP_OPS_202609_MockupCaja.html`).

La maqueta traía su propia paleta (fondo `#f9f9f7`/`#0d0d0d`, acento terracota
`#b6552f`/`#e07a4f`) con **modo oscuro persistente** y sombra visible en
tarjetas en reposo. Eso choca de punta a punta con decisiones ya tomadas y
documentadas en este repo:

- `globals.css:130` (puente shadcn/ui): *"Sin modo oscuro: el brandbook es una
  sola paleta, no dos."*
- Brandbook v3.0 (`design-tokens.ts`): tres colores únicos (rojo `#b8412d`,
  crema `#f5f0e8`, tinta `#1a1a18`), rojo capado a máximo 2 usos por pantalla
  como "acento sagrado".
- ADR-0012: sombras reactivadas **solo** para lo que flota (modal, desplegable)
  — "lo que está pegado al fondo (tarjetas, tablas, celdas) sigue sin sombra".

Se le presentó la disyuntiva a Felipe (paleta/dark mode nuevos solo para
Caja+POS como isla visual, vs. como estándar de toda la app, vs. traducir la
maqueta a la identidad ya existente) antes de escribir código.

## Decisión

**Se traduce el layout, las animaciones y los componentes de la maqueta a la
paleta CAYLA ya existente. Sin modo oscuro.** Elegido por Felipe entre las tres
opciones — ver conversación del 2026-09-18.

Consecuencias concretas de esa elección:

- **Colores categóricos nuevos, pero de DATO, no de marca**: `--color-metodo-efectivo`
  (azul `#2f5f8a`), `--color-metodo-tarjeta` (`#96541a`), `--color-metodo-yape`
  (`#1f7a68`), agregados a `globals.css` y `design-tokens.ts`. Los tres miden
  ≥4.5:1 sobre crema/papel (efectivo 5.92:1, tarjeta 5.18:1, yape/plin 4.59:1),
  misma vara que el resto de tokens. No cuentan contra el cupo de 2 rojos por
  pantalla — son una familia aparte, para que Caja y Vender pinten el mismo
  método con el mismo color sin gastar el acento de marca.
- **Sombra al pasar el mouse, no en reposo**: las tarjetas KPI usan
  `.card-cayla.alza-cayla` (ya existente, `globals.css`) — elevación + sombra
  SOLO en `:hover`, nunca en reposo. Cumple el pedido de "hover con elevación"
  sin reabrir ADR-0012.
- **Radios**: la escala real (4/8/12/16/22px, ADR-0012) ya cubre lo pedido
  (12-16px) — no hizo falta ningún cambio acá.
- **Badge de estado reinterpretado**: la maqueta pedía "Caja balanceada" /
  "Descuadre detectado" calculado en vivo contra ingresos/egresos/ventas. Eso
  es imposible de calcular honestamente: `getResumenCaja` es un **conteo
  ciego** (ADR-0042) — a propósito no expone el monto esperado del cajón
  mientras la caja sigue abierta, así que no hay ningún "esperado" real contra
  el cual comparar antes del cierre. El badge se re-especificó contra una señal
  real y disponible: la cola de ventas offline sin sincronizar
  (`ventas-offline.ts`) — verde "Todo sincronizado" / ámbar "N venta(s) sin
  sincronizar". Mismo lenguaje visual (ícono+texto+color), dato verdadero.
- **Banner de alerta de egresos, no construido**: la maqueta mostraba "egresos
  32% por encima del promedio semanal". No existe ningún rollup histórico de
  egresos por día en ningún lado (`getHistorialCierres()` no trae desglose de
  egresos). Se decidió NO inventar el número — queda en BACKLOG.
- **"vs. mismo día de la semana anterior" en la barra de meta, no construido**:
  mismo motivo — no hay una cifra de "ventas totales del mismo día hace una
  semana" en ningún lado; `montoCierreSistema` mide otra cosa (lo esperado en
  el cajón, no el total vendido). Queda en BACKLOG.

## Consecuencias

- Nueva columna `retail.ubicaciones.meta_venta_diaria numeric null`
  (`20260918100000_meta_venta_diaria_por_ubicacion.sql`) — nullable, sin
  default inventado; si es null, la barra de meta simplemente no se muestra.
  Aplicada en local; **pendiente producción con ok de Felipe**.
- `lib/caja.ts`: `MovimientoCaja` gana `registradoPorNombre` (resuelto vía
  `fn_nombres_personas`, mismo patrón que el resto del archivo); nueva
  `getSeriesVentasCaja()` para la serie horaria y el desglose por método —
  separada de `ResumenCaja` a propósito, para no mezclar el contrato del
  conteo ciego con lo que existe solo para dibujar.
- Punto de Venta, extendido en el mismo hilo: la mayoría de `PuntoDeVentaCatalogo.tsx`/
  `PuntoDeVentaTicket.tsx` ya calzaba (tarjetas de producto, total en serif, botón
  "Cobrar") — solo cambiaron los chips de categoría/stock (`rounded-lg`→`rounded-md`,
  el radio real de la "pastilla") y el color del selector de método de pago, ahora con
  los mismos 3 categóricos de la dona de Caja.
