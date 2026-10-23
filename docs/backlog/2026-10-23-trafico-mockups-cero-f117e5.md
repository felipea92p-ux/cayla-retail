## 📈 Tienda web ▸ Tráfico: tres maquetas desde cero (2026-10-23) — solo maqueta, sin migración ni código del ERP; rama `claude/trafico-mockups-cero-f117e5`

- [x] Tres direcciones en `docs/maquetas/trafico-cero-2026-10/` (A «El hilo», B «De cada 100», C «La vitrina»), con barra de maqueta (dirección, tema, ancho, «Ver la entrada otra vez») y el marco del ERP (lateral con Tienda web ▸ Tráfico «Nuevo»).
- [x] Datos: 21 prendas reales de la base local; visitas inventadas con semilla fija y coherentes (los filtros cuadran con sus filas; las 100 figuritas de B cuadran con cada pie y cada fila en los 180 casos).
- [x] Verificado en el navegador: claro y oscuro, 1024 / 1440 / 1920, los tres períodos, filtros, cajón, tabla y teclado; 1.836 pintadas sin errores ni desborde; contraste medido sin fallas; la escala de B pasa `validate_palette --ordinal`; Formidable rápido medido.
- [x] **Felipe eligió C · La vitrina** (2026-10-23); la maqueta abre en C.
- [x] **Felipe decidió el menú** (2026-10-23): Tráfico es la 7.ª hija de «Tienda web», con la excepción `tiendaWeb: 7` en `EXCEPCIONES_TOPE_HIJAS` (`lib/menu.test.ts`), y su propio módulo, solo para el líder (ADR-0161). Se escribe en su ADR al construirlo.
- [ ] **Decide Felipe:** cómo medir las visitas de verdad (id anónimo por aparato, camino por `utm_source`/`referrer`, ciudad sin guardar la IP, pasos de la tienda; dónde se guardan más de 1 día). Lleva su ADR. «Separaron» y «recogieron» ya están en `retail.pedidos_web`.
- [ ] Al construirlo: módulo nuevo solo para el líder (ADR-0161), su guía interactiva (ADR-0389), guía de foco si tiene campos (no tiene), `/formidable` completo con prueba ciega.
- [ ] **Sin probar:** VoiceOver, zoom al 200 % y la prueba con una colaboradora.
