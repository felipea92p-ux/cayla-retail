# 2026-10-14 · QR en Caja: ya no cae en «Otro» y se escribe en mayúscula

- **Qué:** en Caja, una venta pagada con QR salía como «Otro» (aviso de «Nueva venta», chip del filtro de Movimientos del turno y punto del ritmo del día) y la fila decía «Venta · qr».
- **Por qué:** `metodosDe` (`apps/web/lib/caja-panel-reglas.ts`) no conocía el QR y lo mandaba a «Otro»; el título de la fila pegaba el texto crudo de la base. Ahora «qr» es su propio medio (`MetodoRitmo`, `ORDEN_METODOS`, `METODO_RITMO` en `CajaAbiertaPanel.tsx`) y `textoMetodosDeVenta` lo escribe «QR».
- **Verificación:** `caja-panel-reglas.test.ts` y `caja-tablero-reglas.test.ts` (62 pruebas) y `tsc --noEmit` sin errores. Sin migración.
