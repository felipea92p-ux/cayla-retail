## 2026-10-21 (Nueva orden de compra: el proveedor filtra lo que se ofrece, se puede registrar uno nuevo y se ve cómo pagarle)
Qué hice: analicé la pantalla con seis agentes y ocho revisores, tomé 24 decisiones con Felipe y construí la entrega 1 en cinco commits: la compradora ve los datos de pago (titular primero),
«Cómo pagarle» dentro de la orden, categorías y marcas del proveedor primero con «Ver todas», aviso en la línea que ya no es de ese proveedor y «+ Registrar proveedor» con lo básico sin duplicar.
Por qué así: lo que cambia dinero (quién ve las cuentas, quién puede registrar un proveedor) va por funciones estrechas con su prueba de base y mutaciones; las categorías de un proveedor se derivan de su historial
(sin tabla ni casilla «Recordar») y, sin historial, se ve todo: nunca un candado. El día de compra, la bitácora y el pago por proveedor quedaron diseñados y decididos, sin construir.
Felipe se lleva: tres migraciones por pegar en orden (`20261021200000`, `201000`, `202000`), una consulta SQL de solo lectura que mide si el prefiltro se sentirá útil (al final de `docs/pantallas/compras-ordenes-nueva.md`),
y una rama de Análisis sin fusionar que toca los mismos archivos.
