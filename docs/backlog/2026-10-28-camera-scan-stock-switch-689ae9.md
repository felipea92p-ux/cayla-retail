## 📷 Cámara de Vender: interruptor «Al ticket / Existencias» (2026-10-28) — solo web, sin migración; rama `claude/camera-scan-stock-switch-689ae9`

- [x] `lib/escaner-existencias.ts` (+ prueba, 17 casos): reconoce la etiqueta con `resolverCodigoV2`, junta todos los colores y tallas de esa prenda con `agruparPorPrenda` y cuenta piso, almacén y apartado por talla (negativos a 0; sede sin almacén → `null`); `veredictoDeLaTalla` y `frasePorTalla` para el chip y el lector de pantalla.
- [x] `components/EscanerCamara.tsx`: prop opcional `consulta` (Apartados no la pasa y no cambia); interruptor con `SegmentoDeslizante forma="modo"`; en «Existencias» la lectura no pasa por `onCodigo` (no hay vuelo ni ticket) y la bandeja se consulta en cada pintada contra el stock en vivo. Siempre abre en «Al ticket».
- [x] `components/ExistenciasEnCamara.tsx`: cabecera con el veredicto, píldoras de color (el sin existencias, apagado), matriz de tallas con la leída resaltada y desplazada a la vista si no caben todas, aviso si la etiqueta no es de esta tienda.
- [x] Guía de Vender: el paso «Escanear con la cámara» explica el interruptor; huellas aceptadas (`vender`, `vender.apartados`).
- [x] Verificado: tipos, lint, Knip, las 665 pruebas del web; en el navegador a 375 px (claro, oscuro y apaisado 667×375) con cámara y QR simulados contra la base local.
- [ ] Probar con la cámara real de un celular (Android con detector nativo y iPhone con jsQR): lo simulado fue la cámara y el lector, no la pantalla.
- [ ] `/formidable` sobre la hoja de la cámara (tablero en `docs/formidable/README.md`): es una pieza nueva dentro de un modal existente.
- [ ] Escenario del modo oscuro en `tema/escenarios/registro.mjs`: la cámara de Vender no tiene escenario y el auditor corre sin cámara (ahí no se ve el interruptor); el modo oscuro se revisó a mano.
- [ ] Decisión de Felipe, si quiere: sumar «dónde más hay» (otras sedes, `stockOtrasSedes`) a la matriz. Hoy solo piso y almacén de la sede, como se pidió.
