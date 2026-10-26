## 🎭 La tienda online pasa a «G · Pasarela» (ADR-0524, 2026-10-26)

**En curso (10 actividades, un commit cada una):** 0 terreno y papeles ✅ · 1 el sistema ✅ (tokens claro y oscuro, Bodoni Moda y Public Sans, botones con cortina) · 2 cabecera, anuncio y pie ✅ · 3 Inicio con el desfile ✅ (escenario negro con la luz, el título que se parte en dos renglones, el programa con la prenda que asoma, «Así se separa» con 01–04 y el Club como panel negro con la invitación que se inclina) · 4 catálogo y tarjeta de prenda ✅ (cabecera centrada, raya negra en los filtros, cuatro columnas desde 1400 px, nombre en Didone centrado y la foto que sube con cortina) · 5 la ficha · 6 bolsa, Separar y «Separado» · 7 entrar, cuenta, perfil y Club · 8 el movimiento (la raya que viaja, el velo re-vestido, esqueletos) · 9 cierre (barrido de anchos y temas, contraste, peso de la portada, pruebas y PR).

**Para hacer (Felipe):**
- [ ] **Ver cada actividad en captura antes de la siguiente** (la tienda real tiene ~30 pantallas y la maqueta dibujó 5: insignias, ofertas, favoritos, filtros y campanita se diseñan con la misma lengua y nadie los ha visto).
- [x] ~~Fusionar el PR #1341~~ — Felipe pidió construir encima de su rama: esta rama trae sus commits (merge `5216b2402`). Si #1341 se fusiona antes que este PR, el PR de la Pasarela queda solo con lo suyo; si se fusiona después, #1341 queda incluido y se cierra solo.
- [ ] **Probar «Separar» de punta a punta con una cuenta real** al final: la tienda no tiene vista previa de rama y fusionar publica.

**Decisiones que dejé escritas (Felipe puede cambiarlas):** el logo de la cabecera sigue siendo el oficial en rojo (la maqueta dibujaba un colibrí con «CAYLA» en Garamond negro); «Nuestras tiendas» del Inicio queda como estaba (solo cambian sus colores y letras); el carril de tarjetas de «Lo nuevo» del Inicio se reemplazó por el programa (la lista de salidas), así que ya no se puede agregar a la bolsa desde ahí: se agrega desde la ficha o desde el catálogo.

**Para probar en producción con calma:** la función `tienda_filtros` (de #1341) no está en producción todavía; en local la apliqué a la base `cayla-retail` (aditiva, solo lectura) para ver el panel de COLOR y TALLA con datos. Con 30 prendas por página, la grilla de cuatro columnas deja 2 en la última fila de cada página (30 no es múltiplo de 4); si molesta, 32 o 36 por página lo arregla.

**Sin verificar todavía:** el desfile en un teléfono real (peso y cuadros por segundo), la portada con campaña sin imagen (solo texto), y las fotos que no son recortadas sobre blanco.

**Ideas que quedaron fuera a propósito:** ofrecer al cliente elegir entre «desfile» y «quieto» en su perfil; las seis direcciones descartadas (`docs/maquetas/tienda-paleta-2026-10/` y `tienda-spike-2026-10/`) quedan solo como historial.
