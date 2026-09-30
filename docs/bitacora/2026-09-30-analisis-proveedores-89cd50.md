## 2026-09-30 (Proveedores no cargaba en la terminal de TRU: la base no la reconocía como parte de retail)
Qué hice: analicé por qué Compras ▸ Proveedores mostraba «Esta pantalla no está mostrando datos». Los registros de la API dijeron que
la base no fallaba: respondía 200 con lista vacía. La cuenta era la terminal administrativa de Tienda TRU; la web la deja entrar
(su rol trae el módulo) pero `fn_tiene_acceso_retail()`, la puerta de cuatro lecturas, solo reconocía personas con colaborador, así que
devolvía cero proveedores y la web lanzaba porque no llegó la fila del resumen. Escribí la migración `20260930050000` (la puerta ahora
reconoce también una terminal activa de una sede activa) y la prueba `pruebas:terminales-lecturas` (27 casos, ya en el CI). El SQL
**no está pegado en producción**.
Por qué así: arreglar la definición de «actor de retail» arregla las cuatro funciones (proveedores, resumen, existencias por sede y
por producto) y las que vengan, en vez de parchar una por una. Antes de escribirla medí que la capa de dinero por tienda ya
funcionaba para terminales (TRU +S/118, Lima +S/59, líder +S/177 con dos comprobantes): si no, abrir la puerta habría cambiado un
error visible por «deuda 0» en silencio. Sin el arreglo la prueba se pone roja en los 10 casos de terminal; con él, 27/27, y las
suites vecinas (terminales, firma, proveedores, existencias, roles) siguen verdes (ADR-0289).
Felipe se lleva: pegar el SQL y la terminal ve Proveedores (y el stock) completos, cada una con la deuda de su tienda. Decisión
tuya pendiente: hoy el directorio con banco, cuenta, CCI y billetera lo lee cualquier cuenta que pase la puerta, sin mirar el
módulo «proveedores»; si debe depender del módulo, es otra migración.
