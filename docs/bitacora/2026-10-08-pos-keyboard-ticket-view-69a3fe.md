# 2026-10-08 · Vender en el celular: teclado y «Ver ticket» de la cámara

- **Teclado:** en el iPhone el teclado no achica la página, solo lo visible; la hoja «Registrar cliente» (pegada abajo) quedaba tapada, botones y campo incluidos. `useHojaSobreElTeclado` (nuevo, en `components/ui/`) ajusta el contenedor de toda hoja de `<Modal>` al área visible (`visualViewport`), así se apoya sobre el teclado y el campo con foco se deja a la vista; la fila de acciones del alta lleva `pie-hoja-fijo`. Vale para todas las hojas, no solo esta.
- **Cámara:** «Ver ticket» solo cerraba la cámara; ahora cierra con la misma salida y, en el celular, abre la hoja del ticket (`onVerTicket` en `EscanerCamara`). En escritorio el ticket ya está al lado: solo cierra.
- **Pendiente de verificar en un teléfono real** (el navegador del escritorio no simula el teclado en pantalla): Vender a 375 px → cliente → Registrar → tocar el DNI; y escanear una prenda → «Ver ticket».
