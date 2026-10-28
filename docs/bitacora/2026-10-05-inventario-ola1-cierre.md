## 2026-10-05 (Inventario: la ola 1 y la 2a quedan publicadas)
Qué hice: fusioné en orden los 9 PR de Inventario cuyo SQL Felipe ya había pegado (#792, #785, #787, #784, #789, #786, #799,
#795, #796) y la nota #804. En el camino aparecieron cuatro choques entre PR, y los cuatro se resolvieron sin tocar ninguna migración ya
pegada: dos migraciones con la misma versión (se renombró la de activos), un estado nuevo de las dañadas que la prueba de pérdidas tomaba por pérdida, una
prueba de capacidad que no ponía la nota del segundo cuadre y un build que importaba código de servidor en el cliente. Después
comprobé contra las firmas vivas de producción que ninguna pantalla llama a una función que no exista ni con parámetros que no
acepte (28 funciones nuevas, una firma cada una). Rehíce #788 sobre #800 por el reporte de Felipe: el buscador de «Regularizar
prenda» mostraba todo el catálogo de todas las sedes.
Por qué así: la regla `strict` de `main` obliga a poner cada PR al día antes de fusionar, así que el orden importa y cada choque
se ve antes de entrar; resolver choques en paralelo y fusionar en fila evitó que dos PR verdes por separado rompieran `main` juntos.
Felipe se lleva: Inventario publicado salvo #788 (su parte 2 sin pegar); no cerrar la cola de arranque de ninguna sede hasta que
se pegue la migración del motor que cuenta las ventas cerradas sin prenda; y, si quiere que se revisen las pantallas en producción,
abrir su sesión en el navegador del panel.
