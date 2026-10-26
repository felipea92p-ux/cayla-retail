# Vitrina ▸ Modelos ▸ «Lista»: ¿una columna o dos? — spike (2026-10-26)

Pregunta de Felipe: en la Lista de la Vitrina, ¿2 columnas de prendas para usar todo el espacio o una columna? Spike con datos inventados que
dibuja la página de 40 modelos de verdad en 6 anchos (1024 a 1920), con nombres normales y largos y con 3 y 5 tiendas, y mide el alto de la
lista, los nombres cortados («…»), el stock partido en dos renglones y el hueco entre el nombre y el primer dato.

Tres opciones: **A** una columna (hoy) · **B** columnas del navegador (CSS `columns`: las que caben, mínimo 30 rem cada una y 5 más por cada
tienda de más; orden alfabético de arriba abajo; el nombre puede pasar a 2 renglones) · **C** una columna con una columna por tienda.

Parámetros de la URL: `?op=A|B|C&an=1024|1280|1366|1440|1536|1920&no=n|l&ti=3|5&se=0|1&tema=light|dark`.

Resultado (alto de la lista de 40 modelos): A 2,787 px en todos los anchos; B 2,827 px a 1024 (una columna), 1,414 px de 1280 a 1536 (dos) y 993 px
a 1920 (tres); C 2,787 px. Con nombres largos y 5 tiendas, A parte el stock en 2 renglones en las 40 filas y C corta 14 nombres; B no corta ni
parte nada en ningún ancho.
