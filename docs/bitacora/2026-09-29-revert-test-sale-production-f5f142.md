## 2026-09-29 (Se deshizo en producción la venta de prueba de Camisa Lara y la prenda volvió al Piso de venta)

Qué hice: a pedido de Felipe, anulé en producción (`cayla-dynamic`, schema `retail`) las dos ventas de prueba que había:
la de hoy 10:57 en Tienda TRU (Camisa Lara ×1, S/ 59.90, boleta B004-33 en sandbox) y la nota NV01-7 de ayer (S/ 1.00,
prenda sin registrar). Las dos quedaron `anulada` + `es_prueba = true`, así que salen del historial, de Caja y de los
reportes por defecto. La prenda volvió **al Piso de venta** con un movimiento de entrada `anulacion_venta` en la misma
sububicación de la salida: Piso = 1, Almacén de tienda = 0, tal como estaba a las 10:53, antes de vender. La regularización
pendiente de la NV01-7 (Abrigos · Pistacho · S) se anuló sola por el trigger de anulación, y la nota NV01-7 pasó a
`no_emitido`. Nada se borró: `movimientos` sigue intacto y ahora cuenta la historia completa (carga inicial, traslado al
piso, venta, anulación).

Por qué así: `anular_venta` (ADR-0065) es el camino oficial, pero desde el editor SQL no corre (pide sesión de líder, y
rechaza una boleta «aceptada»), así que apliqué **su misma lógica** en un solo bloque `do $$` todo-o-nada: comprobó lo que
esperaba (una sola salida de 1 prenda en el Piso, sin cambios ni devoluciones, caja abierta, stock previo 0/0), primero en
**ensayo** (terminaba en excepción, sin escribir) y luego real. Dentro del mismo bloque se demostró: Piso 1, Almacén 0,
stock total de la base 4 → 5, libro de la prenda = stock (1 = 1), y la boleta sandbox intacta. Se prefirió anular a
purgar (ADR-0224) porque el script de purga borra el *producto* entero (Camisa Lara) y rompe la inmutabilidad de
`movimientos`; anular deja el rastro y no toca el producto. La NV01-7 estaba en una caja cerrada y de otro día, que el RPC
normal rechaza («usa Cambio o Devolución»); se anuló igual por orden explícita de Felipe para una venta de prueba sin stock,
y el cierre guardado de esa caja no cambió. `anulado_por` quedó como Felipe Alvarez (quien lo ordenó); el motivo de las dos
ventas dice que se aplicó con SQL equivalente a `anular_venta`.

Felipe se lleva: sin código ni migración, solo datos de producción (por eso este PR es solo esta nota). Verificado por
consulta directa después de correr: las dos ventas `anulada`/`es_prueba`, Piso 1 / Almacén 0. **No se tocó:** la boleta
B004-33 (sandbox, sin validez ante SUNAT; Impuestos ya excluye sandbox y ventas de prueba), la serie B004 (sigue en 33: un
número que pudo verlo el PSE no se reutiliza), ni la caja abierta de TRU de hoy (10:56, monto de apertura 0, no marcada de
prueba): si también era de prueba, hay que cerrarla o archivarla aparte. La venta de hoy la registró la cuenta de Melany
Enrriquez; la NV01-7, la de Felipe.
