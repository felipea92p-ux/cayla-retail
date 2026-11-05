## 🏷️ Prendas de una etiqueta: escanear para marcar y «la etiqueta que se llena» (2026-10-22) — solo web, sin migración; rama `claude/qr-scan-garment-modal-redesign-de3bf2`

- [x] Maqueta de tres direcciones (`docs/maquetas/etiqueta-escanear-2026-10/`); Felipe eligió la B.
- [x] Hoja a dos columnas del alto de la pantalla, sin scroll propio, medida en el navegador a 375, 768, 1024×768, 1440×900 y 1920×1080, en claro y oscuro.
- [x] Pistola en toda la hoja (`usePistola fuera="leer"`), lectura pura y probada (`leerCodigo`, `mensajeLectura`, `otrasTallas`, `etiquetaColgada`, `cajaAntesDespues` en `lib/etiquetar-prendas.ts`; `lib/etiquetar-prendas-lectura.test.ts`).
- [x] Cámara solo en un aparato táctil (`pointer: coarse`), en ráfaga: `EscanerBusqueda` gana `continuo` (Cambios y Existencias no cambian).
- [x] Aplicar contra la base local: 3 prendas escaneadas → 3 variantes guardadas; quitarlas con «Al escanear: Quitar» → 0.
- [ ] **Sin probar:** la pistola física y la cámara de un teléfono de verdad (en el panel la cámara no existe; se vio su plan B «Buscar escribiendo»).
- [ ] **Sin correr:** `/chaos` de la hoja (guarda: doble clic en «Sí, aplicar», dos pestañas, red caída) y `/formidable`.
