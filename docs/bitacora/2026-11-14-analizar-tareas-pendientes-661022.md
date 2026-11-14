## 2026-11-14 (Recibir: tareas 4, 5 y 10 de las 30, «contar sin soltar el teclado»)
Qué hice: al elegir en la lista un modelo sin contar, o al agregar uno, su número llega listo para escribir; quien abre un envío queda recordado para Contar en las tres puertas; la tabla de tallas y colores se llena con cifra y Enter; y el filtro «Faltan tallas» junta todo lo contado sin tallas, con el pie del contador que lleva al siguiente.
Por qué así: las tres son la misma pantalla y el mismo gesto (una persona dicta, la otra digita), ninguna pedía una decisión ni una migración, y ninguna toca los archivos del PR #1859, que sigue abierto. Las que más pesan (7, 8 y 22, crear la prenda) se hacen en la hoja que ese PR está cambiando.
Qué se rompería sin esto: sin aviso cada modelo costaba un clic antes de escribir, la tabla obligaba a pasar por Tab casilla por casilla, y la reposición contada sin repartir no aparecía en ningún filtro: había que abrir cada categoría buscando el chip ámbar.

## 2026-11-14 (Recibir: el cursor ya no llegaba a la primera casilla de la tabla de tallas)
Qué hice: al abrir «Tallas y colores» el cursor vuelve a la primera casilla, y Enter en la última espera a que «Llevar al stock ahora» se encienda antes de dejar el cursor ahí.
Por qué así: desde el 12-nov (#1793) cada casilla es un `PasoCantidad` y ninguna lleva la clase `rc-celda` que buscaba el foco inicial; se busca por `data-variante`, que no depende del estilo. Salió al correr producción y la rama lado a lado.
Qué se rompería sin esto: el cursor quedaba en la × de la hoja y había que tocar la primera casilla; la tarea 5 no se podía cumplir «solo con cifras y Enter».

Demo de antes y después (capturas del sistema en local, producción contra la rama): https://claude.ai/artifact/HGJ138xAm6xiQ51EXkVfUs (privado).
