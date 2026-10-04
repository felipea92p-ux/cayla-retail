## 2026-10-04 («Dónde más hay» no le mostraba nada a las terminales: la función tenía su propia puerta)
Qué hice: una revisión de «Pedir a otra sede» encontró que `fn_stock_por_sede()` —la lista de qué sede tiene qué prenda— no usaba la
puerta única de retail sino una copia a mano que no reconoce a las terminales, así que una terminal recibía cero filas sin error y Vender, Cambios,
Apartados y «Pedir a otra sede» la veían como «ninguna otra sede tiene stock». Comprobé en producción (solo lectura) que su cuerpo es idéntico al
del repo y que hay 6 terminales activas, escribí la migración `20261004110000` (un solo reemplazo: la puerta pasa a `fn_tiene_acceso_retail()`) y la
prueba `pruebas:terminales-red` (27 casos, ya en el CI). La migración quedó escrita y probada, NO pegada en producción.
Por qué así: la puerta es una sola idea y estaba escrita dos veces; arreglarla en la función (no en la web) cura a Vender, Cambios y Apartados a la
vez. Antes de tocar nada listé las 11 funciones que arman su puerta con `colaboradores`: solo esta era una lectura de la red sin terminal; las otras
excluyen a la terminal a propósito (líder, admin, perfil de persona) y esa lista cerrada quedó en la prueba para que la próxima copia de la puerta
ponga el CI en rojo. Sin el arreglo la prueba da 9 rojos; con él, 27/27, y las pruebas vecinas siguen verdes.
Felipe se lleva: falta tu OK para pegar el SQL (una sola parte, sin políticas; la verificación con md5 está en `docs/backlog/2026-10-04-frosty-bartik-ad6e8f.md`).
Decisión tuya pendiente: hoy la puerta cierra en silencio y la web lee «lista vacía» como «no hay stock» —por eso este bug y el de Proveedores
pasaron días sin avisar—; ¿queremos que una lectura sin acceso lance un error visible?
