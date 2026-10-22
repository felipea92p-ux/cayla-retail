## 2026-10-21 (Nueva orden de compra: el proveedor filtra lo que se ofrece, se puede registrar uno nuevo y se ve cómo pagarle)
Qué hice: analicé la pantalla con seis agentes y ocho revisores, tomé 24 decisiones con Felipe y construí la entrega 1 en cinco commits: la compradora ve los datos de pago (titular primero),
«Cómo pagarle» dentro de la orden, categorías y marcas del proveedor primero con «Ver todas», aviso en la línea que ya no es de ese proveedor y «+ Registrar proveedor» con lo básico sin duplicar.
Por qué así: lo que cambia dinero (quién ve las cuentas, quién puede registrar un proveedor) va por funciones estrechas con su prueba de base y mutaciones; las categorías de un proveedor se derivan de su historial
(sin tabla ni casilla «Recordar») y, sin historial, se ve todo: nunca un candado. El día de compra, la bitácora y el pago por proveedor quedaron diseñados y decididos, sin construir.
Felipe se lleva: tres migraciones por pegar en orden (`20261021200000`, `201000`, `202000`), una consulta SQL de solo lectura que mide si el prefiltro se sentirá útil (al final de `docs/pantallas/compras-ordenes-nueva.md`),
y una rama de Análisis sin fusionar que toca los mismos archivos.

## 2026-10-22 (Nueva orden de compra: precio sugerido y avisos de compra, diseño y actividades 1 y 2 de 7)
Qué hice: con Felipe cerré 18 decisiones en 5 rondas y 4 estudios de solo lectura (ver `docs/pantallas/compras-ordenes-precio-y-stock.md`, con maqueta tocable), cambié «Precio u.» por «Costo u.» en las órdenes de compra y de insumo,
escribí las reglas puras de la ayuda de precio (`lib/orden-compra-precio-ayuda.ts`: ganancia sin IGV, rebaja al S/ 0.10, piso de 48 %, 22 avisos) y la migración `20261022080000` que guarda el precio sugerido y sus motivos en la línea de la orden.
Por qué así: el sugerido nace en la orden (no en el comprobante) para que llegue a quien recibe aunque no haya papel, y nunca fija el precio de nadie; las huellas de la orden lo cuentan, o editar solo el sugerido no se habría guardado.
Felipe se lleva: una migración por pegar (`20261022080000`, una parte, re-pegable) y las actividades 3 a 7 por aprobar y construir; sin pantalla todavía (el archivo de reglas está declarado en `knip.ts` hasta la actividad 4).
