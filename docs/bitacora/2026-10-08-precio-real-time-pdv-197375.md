# 2026-10-08 — Precios en vivo en todo el ERP (ADR-0363)

- **Vender:** leía precio y campañas una sola vez al abrir; ahora `usePreciosEnVivo` relee cada 10 s y al volver a la pestaña, y `ticketConPreciosAlDia` corrige el ticket armado (una línea con descuento a mano no se toca: se avisa). Retomar un ticket en espera usa la misma regla.
- **Todo lo demás:** `<PreciosEnVivo />` (en `app/(app)/layout.tsx`) mira la versión del catálogo y las campañas de hoy; si cambiaron, `router.refresh()` sin loader, esperando a que nadie esté escribiendo. «Nueva proforma» toma la prenda del catálogo de ahora.
- **Pendiente:** probarlo en el navegador local (esta copia no tenía `.env.local`): una pestaña en Vender/Productos/Apartados, cambiar un precio o quitar una etiqueta en otra, volver.
