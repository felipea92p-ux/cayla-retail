## 2026-10-05 (Existencias: un icono por tarjeta, atajos de filtro, sonido al confirmar y «Colgar primero» — ADR-0344)
Qué hice: llevé al sistema la maqueta «táctil y rápida» de Existencias en seis cortes. La tarjeta muestra un solo icono (colgar en el piso, o «⋯») y,
al pasar el mouse, una ventana hacia arriba con todas sus acciones y su nombre; se quitó la pastilla repetida. Bajo el buscador hay cinco atajos
(Todo · Por colgar · Sin stock atrás · Apartadas · Dañadas) que escriben los mismos filtros del panel, solo con iconos o con texto, y el escáner es un
icono. Suena una campanita al colgar, subir, ajustar o reportar una dañada (se apaga por equipo). «Colgar primero» muestra las tres prendas que más
conviene colgar, en el orden del motor del piso, con cuánto les alcanza. La ventana de colgar dice qué falta, llena con un toque y avisa lo que casi no hay.
Por qué así: el nombre lo decidió Felipe en ADR-0339 («Colgar en el piso»; la maqueta decía «Reponer») y todo lo nuevo lo usa; la lista de «Colgar
primero» es la del motor del piso para no tener dos órdenes de «qué colgar»; los atajos son los mismos filtros «Hoy» y «Condición» para no tener dos fuentes.
Qué se rompería sin esto: una asesora con el cliente enfrente abría cuatro ventanas para saber qué colgar primero, y la misma prenda podía salir primera
en Existencias y tercera en el Inicio.
Cómo se verifica: `pnpm test` (156 066 pruebas) y `tsc`/ESLint en verde; las piezas se dibujaron con datos inventados. Falta abrir `/inventario` con sesión real.
