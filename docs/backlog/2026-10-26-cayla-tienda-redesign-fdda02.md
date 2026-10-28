## 🎭 La tienda online pasa a «G · Pasarela» (ADR-0524, 2026-10-26)

**Hecho (10 actividades, un commit cada una; PR #1375 fusionado el 2026-10-27 y su arreglo del menú, #1381, también):** 0 terreno y papeles ✅ · 1 el sistema ✅ (tokens claro y oscuro, Bodoni Moda y Public Sans, botones con cortina) · 2 cabecera, anuncio y pie ✅ · 3 Inicio con el desfile ✅ (escenario negro con la luz, el título que se parte en dos renglones, el programa con la prenda que asoma, «Así se separa» con 01–04 y el Club como panel negro con la invitación que se inclina) · 4 catálogo y tarjeta de prenda ✅ (cabecera centrada, raya negra en los filtros, cuatro columnas desde 1400 px, nombre en Didone centrado y la foto que sube con cortina) · 5 la ficha ✅ (el visor que encuadra y el flash al agregar, la foto que vuela hasta la bolsa y la hace latir, el nombre en Didone recta; la lupa de la computadora sigue igual) · 6 bolsa, Separar y «Separado» ✅ (la raya negra y el resumen con su filo, el total que rueda hasta su valor y la invitación blanca que se da vuelta con el número del pedido contando) · 7 entrar, cuenta, perfil y Club ✅ (Entrar, Crear cuenta y las de volver a entrar sobre el escenario negro con la hoja blanca y los campos sobre una línea; la tarjeta del Club es la invitación blanca; los títulos de la cuenta sin el rojo) · 8 el movimiento ✅ (la raya que viaja, el velo re-vestido, esqueletos, una prueba que cuenta los bucles) · 9 cierre ✅ (barrido de 100 combinaciones de ancho × tema sin hallazgos, texto de 12 px y blancos de 24 px, peso de la portada contra `main`, PR sin fusionar).

**Para hacer (Felipe):**
- [ ] **Ver cada actividad en captura antes de la siguiente** (la tienda real tiene ~30 pantallas y la maqueta dibujó 5: insignias, ofertas, favoritos, filtros y campanita se diseñan con la misma lengua y nadie los ha visto).
- [x] ~~Fusionar el PR #1341~~ — Felipe pidió construir encima de su rama: esta rama trae sus commits (merge `5216b2402`). Si #1341 se fusiona antes que este PR, el PR de la Pasarela queda solo con lo suyo; si se fusiona después, #1341 queda incluido y se cierra solo.
- [ ] **Probar «Separar» de punta a punta con una cuenta real** al final: la tienda no tiene vista previa de rama y fusionar publica.
- [ ] **Medir la portada del celular en producción tras fusionar** (Lighthouse móvil sobre `/inicio`): en local, con la red más lenta, el LCP pasó de ~2,9 s a ~5,5 s porque ahora hay una foto a la vista, y esa foto va sin optimizar en local (ADR-0524, act. 9). Si pasa de ~4 s en producción, decidir el plan B del desfile.

**Decisiones que dejé escritas (Felipe puede cambiarlas):** el logo de la cabecera sigue siendo el oficial en rojo (la maqueta dibujaba un colibrí con «CAYLA» en Garamond negro); «Nuestras tiendas» del Inicio queda como estaba (solo cambian sus colores y letras); el carril de tarjetas de «Lo nuevo» del Inicio se reemplazó por el programa (la lista de salidas), así que ya no se puede agregar a la bolsa desde ahí: se agrega desde la ficha o desde el catálogo.

**Para probar en producción con calma:** la función `tienda_filtros` (de #1341) no está en producción todavía; en local la apliqué a la base `cayla-retail` (aditiva, solo lectura) para ver el panel de COLOR y TALLA con datos. Con 30 prendas por página, la grilla de cuatro columnas deja 2 en la última fila de cada página (30 no es múltiplo de 4); si molesta, 32 o 36 por página lo arregla.

**Pregunta para Felipe:** la maqueta tiene la cabecera pegada arriba al bajar (`position: sticky`); la de la tienda real no (se va con el scroll) y por eso la foto que vuela a la bolsa a veces tiene su destino fuera de la pantalla. Volverla pegada toca también las barras de filtros y de la ficha (todas bajan 76 px): es decisión de Felipe y va en la actividad 8 si la quiere.

**Dejé en la base local (compartida):** un pedido de prueba cerrado como vencido (`W-0794`, de la cuenta `cliente.prueba@example.com`, a la que le puse una clave desechable) y la foto `rediseno-bolsa` de `estado.mjs`. No restauré la foto porque otra sesión escribió 26 ventas mientras tanto y restaurar las habría borrado; los pedidos no se borran (la base lo impide), se anulan.

**Decisión que tomé en Entrar:** la maqueta tiene un solo formulario al centro; el de la tienda real tiene además el panel del Club (promesa, beneficios y tarjeta), así que el escenario negro lleva la hoja a la izquierda y ese panel en marfil a la derecha. El fondo que se mueve de la maqueta (la luz que va y viene 9 s en bucle) no se copió: es un bucle que Felipe no aprobó (solo el desfile).

**Sin verificar todavía:** la página del pedido confirmado con su código de recojo (no tengo un pedido confirmado en local; su estilo cambió solo en la letra), el desfile en un teléfono real (peso y cuadros por segundo), la portada con campaña sin imagen (solo texto), y las fotos que no son recortadas sobre blanco.

**Ideas que quedaron fuera a propósito:** ofrecer al cliente elegir entre «desfile» y «quieto» en su perfil; las seis direcciones descartadas (`docs/maquetas/tienda-paleta-2026-10/` y `tienda-spike-2026-10/`) quedan solo como historial.

**Lo que sigue (2026-10-27): el traspaso completo está en `docs/maquetas/tienda-rediseno-2026-10/PASARELA-PENDIENTES.md`.** La comparación de la maqueta contra la tienda dejó 7 animaciones por construir
(revelado al bajar, cortina de fotos escalonada, entrada de la ficha, títulos por letras, indicador deslizante de filtros, reacomodo al filtrar, transiciones de talla y tienda) en tres paquetes, y casi ningún botón faltante.
- [ ] Paquete 1 (solo CSS): revelado al bajar, cortina escalonada, entrada de la ficha y transiciones de talla/tienda.
- [ ] Paquete 2: títulos por letras y el indicador deslizante de los filtros.
- [ ] Paquete 3: reacomodo al filtrar (FLIP o transiciones de vista) y la cabecera pegada (decisión de Felipe).
- [ ] Medir `/inicio` móvil en producción con Lighthouse; si pasa de ~4 s, decidir el plan B del desfile.
- [ ] Decisión de Felipe: que el desfile no desaparezca cuando una sede no tiene llegadas de los últimos 30 días.
- [ ] Ver el menú «Ropa» en producción con datos reales (nombres largos y la vitrina «Recién llegado» a 1280 px).
