# Ventas sin registrar · tres maquetas (2026-10-06)

Felipe, sobre la pantalla de hoy (`/inventario/por-regularizar`, `PorRegularizarLista`): «quiero cambiar el estilo… 3 maquetas bastante
visuales, amigables, sofisticadas y con muchas animaciones». Estas son esas tres, navegables y animadas. **Nada toca `apps/web` ni la base.**

Para verlas: `index.html` (o el servidor `maquetas` de `.claude/launch.json`, puerto 8791). También abren con doble clic. Arriba, en la
barra oscura que no existe en el ERP: **Escritorio / Celular** (container queries, como una ventana de 375 px), **claro / oscuro**
(ADR-0336), **Repetir animaciones** y **Volver a empezar** (lo que regularizas en la maqueta se guarda hasta recargar). `?vista=celular`
abre directo en celular y `?sinmov` las deja quietas.

## Qué problema resuelve la pantalla (y lo que NO cambia)
Caja vendió prendas antes de que estuvieran en el sistema; almacén dice qué prenda real era cada una y el stock queda cuadrado. Las tres
propuestas respetan las reglas de hoy, sin tocar ninguna:
- el precio oficial manda; la diferencia es *cobrado − oficial* (negativa = descuento no planificado, positiva = sobreprecio);
- «Ya estaba registrada» baja 1 del stock; «Llegó nueva» no lo mueve;
- 2 días sin regularizar = **Vencida** (aviso al líder);
- las sugerencias solo existen si UNA sola prenda calza en categoría, talla y color con stock, y **nunca vienen marcadas** (ADR-0334);
- «Responsable» se pide al guardar (ADR-0162); las cuatro cifras, los cuatro filtros, la búsqueda, el combo de quién vendió.

Datos inventados: las **cuatro primeras ventas son las de la captura** (Casacas Celeste S, Lentes de sol Negro, Relojes Plateado, Camisas y
Blusas Blanco); el resto muestra las tres edades. La pantalla real tenía 70 pendientes; aquí son 13 para que se vea todo sin paginar.
Dos ventas son **ambiguas a propósito** (Casacas Celeste S y Camisas y Blusas Blanco: hay dos prendas que calzan en todo) y no traen
sugerida; las otras sí.

## Las tres

### A · Emparejar — `a-emparejar.html`
La venta de caja es un **talón con perforación**; la prenda real, una fila del catálogo; entre las dos, un **hilo que se dibuja**.
Unir es un gesto que cualquiera entiende sin manual. Todo en una mesa de dos columnas, sin modales para lo común.
- Pasar el mouse sobre una candidata dibuja un hilo punteado y una etiqueta con el precio de diferencia; tocarla lo fija.
- Abajo (dock): **balanza de precio** (oficial vs cobrado, el tramo se llena), «¿Cómo estaba?» con el halo «Sigue aquí» (guía de foco,
  ADR-0284), cuánto queda de stock antes de guardar (3 → 2) y «Responsable».
- Al guardar: el hilo se ilumina de punta a punta, cae el **sello** «Regularizada» sobre el talón, el stock de la fila baja con un «−1»,
  el talón se pliega, el **anillo** de avance y las cuatro cifras cuentan, y la mesa pasa a la siguiente.
- «Identificar con sugerencias» abre una hoja con las parejas (casillas SIN marcar, «Marcar todas» deliberado) y, al confirmar, los talones
  se van en cascada.
- Celular: la lista de talones y, al tocar uno, la prenda real sube como hoja.

### B · Una por una — `b-una-por-una.html`
**Una sola pregunta en pantalla** («¿qué prenda era esta?», leyes 2 y 5 de Formidable). La venta es una carta grande (con una ligera
inclinación 3D al mover el mouse y una pila detrás); la respuesta, un carrusel debajo.
- Al elegir, la carta **se abre en dos mitades** (lo que anotó caja ≈ la prenda real) y se prenden **tres visitos** en cascada: prenda,
  talla, color; el que no coincide muestra «≠» en ámbar y dice cuál es.
- Debajo: balanza de precio, las dos formas como tarjetas grandes y «Regularizar».
- **Teclado completo:** ← → elige, Enter confirma, 1 / 2 «cómo estaba», S salta (la carta se va a la izquierda y vuelve al final), Esc
  deshace la elección.
- Al guardar: sello, la carta **sale volando** a la derecha, la siguiente sube de la pila; el riel de la izquierda (toda la cola, con un
  punto rojo en las vencidas) se encoge. Al terminar: aro que se dibuja y «Todo cuadrado».
- «Ya identificadas» muestra lo hecho en tarjetas.

### C · Galería viva — `c-galeria.html`
Las ventas son **prendas, no filas**: un lookbook con la prenda dibujada sobre su color, **etiqueta colgante** con el precio y las ventas
**agrupadas por edad** (Hoy · Ayer · Hace más de 2 días, con encabezado fijo).
- Héroe con el número grande que cuenta, un hilo decorativo que se dibuja y una **barra de edades** (Hoy / Ayer / Vencidas) que además filtra.
- Cada tarjeta lleva un **anillo** que se llena hacia las 48 horas (rojo si ya pasó). Las tarjetas aparecen al hacer scroll y la silueta
  sigue al mouse.
- Pasar el mouse **sugiere la prenda** («Parece: Lentes Aviador · Sí, es esa»); «Sí, es esa» abre el cajón con la prenda ya elegida (sigue
  habiendo que escoger «cómo estaba» y confirmar: una sola candidata no es certeza).
- **Cajón de tres pasos** (prenda → cómo estaba → Responsable) con «Sigue aquí».
- Al guardar: el cajón se cierra, la tarjeta **se da vuelta** (3D) y muestra la prenda real con su sello, se desvanece y la galería se
  **reacomoda** con una transición de posición. En celular, dos columnas y el cajón sube como hoja.

## Movimiento: lo que respeta y lo que pide una decisión tuya
Todas usan `--ease-cayla`, **sin rebote**, y **cada animación corre una vez** (al verse, al tocar o al pasar el mouse); lo único repetido es
la señal del punto de «Vencida» (tres latidos, como en el ERP). Todo se apaga con `prefers-reduced-motion`. **Pero** esto es bastante más
movimiento del que ADR-0136 permite hoy dentro de una pantalla: el sistema solo concede «movimiento rico» a unas pocas piezas por decisión
tuya (la vista rápida de producto, Movimientos, Nuevo producto, Análisis). Si eliges una, habría que **registrarla como excepción en
ADR-0136** (como se hizo con esas) y fijar qué se queda y qué se recorta.

## Cosas que cambiarían al llevarla al ERP (a propósito)
- Colores solo desde tokens; los únicos hex sueltos son los **colores de prenda** (dato, ADR-0336 regla 3), que en el ERP vienen de la base.
- «La prenda sin foto» (ADR-0333): aquí la silueta de la categoría sobre el color de la prenda es la misma pieza (`MosaicoPrenda`), pero con
  más detalle de dibujo del que hoy tiene.
- Piezas únicas (ADR-0358): la maqueta usa el `Volver`, píldoras de filtro y `TarjetaCifra` en espíritu; al construirla se usarían las piezas
  reales (A y C dibujan la cifra más grande que la `TarjetaCifra` actual — habría que decidir si se unifica o es excepción).
- Lector de pantalla y foco: los botones llevan nombre accesible y el foco se ve; falta probar teclado en A y C como en B.
- **Guía de foco (ADR-0284):** las tres la traen (halo «Sigue aquí»); al implementar, sus pasos salen de la validación real.
- Nada de esto cambia reglas de dinero, stock ni permisos: son las mismas, solo se ven distinto.

## Fuera de la maqueta
«Cerrar la cola de arranque» (de un líder) solo muestra un aviso; «Reabrir» y la paginación de 25 en 25 no se dibujaron.

## Segunda ronda (2026-10-07): tres variantes de A
Felipe: «me gusta el formato de la A, genera 3 diseños más a partir de esa». Las tres conservan lo que se quedó (el **talón con perforación**, el
**hilo** y la mesa de dos lados) y cambian **cómo se une** la venta con la prenda real. Comparten `mesa.js` / `mesa.css` (cifras, anillo,
filtros, talones, hoja de sugerencias, guardado con sello y pliegue) y las mismas reglas; lo único propio de cada una es la parte derecha.

### A2 · Puente — `a2-puente.html`
La unión tiene **su propia columna**: arriba, la venta; abajo, la prenda real; en medio, la **cuerda** con los tres visitos (prenda, talla, color).
Dos hilos convergen en el puente (el del talón y el de la prenda que tocas). Debajo del puente van la balanza de precio, «cómo estaba»
(con «Sigue aquí»), el responsable y el botón: **no hay que bajar para encontrarlo**. Al guardar, las dos mitades se juntan. Las prendas
son tarjetas con foto-color. En pantalla angosta el puente baja debajo de las prendas.

### A3 · Arrastrar — `a3-arrastrar.html`
El talón se **agarra** (puntitos a su izquierda) y se **suelta sobre la prenda**. Mientras arrastras, el hilo es una cuerda elástica que
sigue al mouse, las prendas cercanas «se acercan» y la que tienes debajo se enciende con su diferencia de precio. Al soltar se abre una
tarjeta junto a la prenda (no la tapa) con balanza, «cómo estaba» y botón. Si sueltas en el aire, el talón vuelve solo. **El arrastre es un
atajo, nunca la única forma:** con dedo o teclado se toca el talón y luego la prenda; Escape cierra la tarjeta. Al guardar, el talón viaja
por el hilo y se funde con la prenda.

### A4 · Perchero — `a4-perchero.html`
La prenda real ya no es una fila: es una prenda **colgada de su perchero**, con etiqueta. Cuelgan de un riel que se dibuja al entrar; el
**stock** se ve como prendas apiladas detrás (3 en TRU = 3 prendas); los lentes y relojes cuelgan de un colgador simple. Se mece una vez al
pasar el mouse, se levanta al elegirla, y el hilo la busca. Al guardar, **se descuelga y viaja hasta el talón**; el gancho queda vacío.

### Lo que hay que decidir si eliges una
- **A3** es la única que depende de arrastrar con mouse; en celular cae al «toca el talón, toca la prenda» (verificado a 375 px).
- **A4** dibuja más lujo del que hoy tiene «La prenda sin foto» (ADR-0333, silueta + color): habría que decidir si el perchero es una
  excepción de esta pantalla o una pieza del sistema.
- Las tres piden registrar su movimiento como excepción de ADR-0136, igual que A, B y C.

### Ajuste a A2 (2026-10-07, tarde)
Felipe: «me gusta A2, pero quiero cambiar la parte de arriba; esas cosas no ayudan mucho… y un buscador debajo de las sugerencias por si no
sale la que busco».
- **Arriba:** las cuatro tarjetas grandes y el anillo se reemplazaron por **una franja de una línea**: cuántas faltan (con una barra de avance),
  un botón **«3 vencidas»** que filtra la lista a lo urgente (tocarlo otra vez vuelve a todas) y, en chico, el descuento y el sobreprecio del mes.
  La mesa sube y queda a la vista sin bajar. (Solo A2 la usa: A3 y A4 siguen con las tarjetas, por `cfg.franja` en `mesa.js`.)
- **Debajo de las sugerencias:** «¿No ves la tuya?» con un buscador sobre **todo el catálogo** (nombre, color, talla o código, sin tildes ni
  mayúsculas). Muestra hasta 8 prendas más con la misma tarjeta, **sin repetir** las que ya están arriba (y avisa si la que buscas ya está
  arriba). Enter elige la primera, Escape borra, y si no hay nada dice «Ninguna prenda coincide» con el enlace «Dala de alta» del modal real.

## Construida (2026-10-07)
Felipe eligió **A2 «Puente»** (con la franja y el buscador) y pidió implementarla en el sistema: ADR-0360. Las demás (A, A3, A4, B, C) quedan aquí por si
se retoman.
