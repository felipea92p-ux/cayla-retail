# Spike visual — Caja, Cambios, Devoluciones y Facturación (2026-09-22)

Documenta el **estado actual** (no una propuesta de rediseño) de las 4 pantallas de Ventas que
no tenían spike guardado en `docs/maquetas/`: Caja, Cambios, Devoluciones y Facturación (SUNAT).
Se generaron a pedido de Felipe para completar la base visual antes de la próxima ronda de
rediseño en Stitch — el pedido explícito fue "usar esta base que tenemos en Stitch y
actualizarla con respecto a las nuevas funcionalidades", y estas 4 pantallas eran el hueco.

Cada HTML es fiel al código real (`apps/web/app/(app)/caja`, `/cambios`, `/devoluciones`,
`/vender/facturacion`) — títulos, subtítulos, estados, candados de rol y reglas de negocio
citados 1:1 contra el componente y el archivo `lib/*-reglas.ts` correspondiente, con datos de
ejemplo. **No proponen cambios de diseño**: son la fotografía de hoy, para no rediseñar a
ciegas ni perder de vista un candado o una regla que ya existe.

## Archivos

- `caja.html` — dashboard con caja abierta: 5 KPIs (apertura, ventas por método, ingresos,
  egresos), meta del día opcional, métodos de pago (dona), ritmo del día (dispersión por
  hora), movimientos recientes e historial de cierres. Candado de "Cerrar caja" (ADR-0160).
- `cambios.html` — landing ("Iniciar un cambio" + "Actividad reciente" con filtros y chips de
  plazo) + vista previa del paso 3 del flujo guiado (motivo + condición de la prenda que
  vuelve). Candado "Tallas que no calzan" (solo líder) y "Buscar en todas las tiendas" (solo
  líder).
- `devoluciones.html` — landing ("Iniciar" + "Por aprobar" con las dos tarjetas de aprobación
  + "Actividad reciente") + el motivo estructurado cerrado hoy (ADR-0158). Varias prendas en
  una sola devolución (checkboxes → una nota de crédito).
- `facturacion.html` — vista Resumen: cabecera con línea viva, las 4 tarjetas de vidrio
  (único lugar del ERP con ese estilo translúcido) y "Actividad de hoy" con el hilo del
  comprobante (venta → número → SUNAT → aceptado).

Cada archivo trae, al pie, un panel "Cómo funciona hoy" con las mismas reglas de negocio que
ya están en BACKLOG.md/BITÁCORA.md — no inventa nada nuevo, solo lo hace visible.

## Cómo se generaron

Estructura, copys y estados se levantaron leyendo el código real de cada pantalla (page.tsx,
componentes principales y archivos `lib/*-reglas.ts`) con cuatro exploraciones en paralelo, no
de memoria. Los PNG se renderizaron con Chromium headless a 1680px de ancho.

## Pendientes de cada pantalla (ver BACKLOG.md para el detalle completo)

- **Caja**: sin pendiente crítico abierto.
- **Cambios**: decisión de negocio pendiente sobre numeración corrida; endurecer
  `cambios.motivo` a obligatorio en la base.
- **Devoluciones**: la migración del motivo estructurado (`20260922180000`) espera revisión de
  Felipe antes de pegarse en producción; el plazo de 15 días solo avisa, no bloquea.
- **Facturación**: revisión completa del rango nunca se cerró; `getComprobantesMes` no pagina
  (PostgREST corta en 1000 filas); falta compactar la fila de comprobantes en móvil.
