## 2026-10-28 (Una fase puede salir afuera «por definir», sin inventar un proveedor)
Qué hice: la hoja «¿Quién hace…?» ganó un tercer segmento, «Por definir» (ADR-0550). La fase se guarda como servicio sin proveedor ni tarifa, no se puede operar hasta definirla (`fase_por_definir`) y la ficha dice «Sigue: definir quién hace…». El costo dice «por definir», no S/ 0.00.
Por qué así: crear un proveedor «Pendiente» obliga a inventar una tarifa y esa tarifa se vuelve deuda real al registrar la Vuelta. Con «por definir» no puede existir una deuda sin nombre.
Felipe se lleva: una migración de una sola parte por pegar en producción (`20261028034000`); 16 casos de Postgres y las pruebas de la web en verde. Falta mirarlo en el navegador.
