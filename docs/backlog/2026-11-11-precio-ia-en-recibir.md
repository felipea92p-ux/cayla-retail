## 🏷️ Precio con IA en Recibir mercadería (2026-11-11, ADR-0641 act.) — migración `20261111151000` **en producción desde el 2026-11-11**; rama `claude/precio-ia-en-recibir`

- [x] Proponer abierto a quien ve Recibir o Productos (terminales incluidas), con el origen «recepcion». `pnpm pruebas:precio-propuesto` 30/30.
- [x] Hoja de la prenda nueva: costo + precio, propuesta sola una vez, «Usar» / «Dejar»; el costo escrito llega al cierre. Probado en el navegador.
- [x] Al cerrar, prenda existente: «Gana N % · revisar precio» y propuesta en «Cambiar por talla». Probado en el navegador.
- [x] Migración pegada en producción el 2026-11-11 (subida a la página con su huella SHA-256 comprobada) y verificada en solo lectura.
- [ ] **Sin probar con la IA real** ni con una cuenta de terminal de verdad (se probó con una integrante que ve Recibir y no el dinero de Compras).
- [ ] **Sin probar en el navegador** «Hacer ahora ▸ Crear» con el costo escrito (usa la misma hoja; queda en `costosEscritos`).
- [ ] El aviso «Lo que habías decidido sigue aquí» del cierre también sale cuando el único «decidido» es el costo escrito al crear la prenda.
