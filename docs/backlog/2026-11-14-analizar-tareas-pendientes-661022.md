## Recibir: tareas 4, 5 y 10 (2026-11-14) — rama `claude/analizar-tareas-pendientes-661022`, solo web, sin migración

Hecho y probado en el navegador contra el código de `main`, con un envío de prueba en la base local (5 prendas del catálogo, 24 unidades):

- [x] **Tarea 4.** El número llega listo al elegir o agregar un modelo sin contar (solo con mouse), y «quién recibe» se recuerda en las tres puertas (`recordarQuienRecibe`).
- [x] **Tarea 5.** Enter y ↓ bajan por la talla, ↑ y Shift+Enter suben, Enter al fondo pasa a la talla siguiente (`columnasDeLaTabla` + `celdaVecina`), y en la última el cursor va a «Llevar al stock ahora».
- [x] **Tarea 10.** «Tallas para después» sigue como en producción, y «Faltan tallas» se suma como filtro aparte (`faltanTallas`: lo contado sin tallas que se pidió repartir ahora; su fila puede mostrar otro aviso, el más urgente). Con todo contado el pie dice «Faltan tallas: <modelo>» (`siguienteFaltanTallas`), solo entre lo que la lista muestra si hay un filtro puesto. La primera versión había reemplazado un filtro por el otro; se corrigió a pedido de Felipe («no quites funcionalidades ni filtros»).
- [x] Tarea 4, corrección: tocar en la lista el modelo que ya está en el contador (sin contar) vuelve a abrir su número, también tras cerrarlo con Escape o un clic fuera, solo si sigue sin contar y se usa el mouse (`esPedidoNuevo`, `abreAlElegir`); con una cifra a medio escribir no: ver «Pendientes de esta rama», abajo.
- [x] Tarea 5, corrección: Enter en la última casilla solo salta al botón del pie cuando el reparto cuadra (`enterSaleDeLaTabla`); a medias, el cursor se queda.
- [x] El cursor vuelve a la primera casilla al abrir la hoja de tallas (roto desde el #1793).

Pendiente:

- [ ] Abrir el PR con `/abrir-pr`. Los commits están solo en la rama local.
- [x] Probar los dos filtros de tallas con un modelo pedido «ahora» y otro «para después»; el pie con un filtro puesto; volver a tocar el modelo del contador tras Escape; Enter en la última casilla con el reparto a medias y completo. Hecho el 14-nov en pantalla, con un navegador sin ventana (ver abajo). Las pruebas cubren las reglas; el texto del pie no tiene prueba de pantalla.
- [ ] «Quién recibe» sin probar en el navegador con una cuenta de terminal y asistencia marcada (lo cubre `lib/responsable-conteo.test.ts`).
- [ ] El aviso «Toca el número para escribirlo» (`PlacaDelModelo.tsx`) quedó viejo cuando el número ya llega abierto. Es un texto de la pantalla: decidir qué dice.
- [ ] `/chaos` sobre Contar con estos cambios (doble Enter, dos pestañas, red caída al teclear). No se corrió: la base local es compartida y otra sesión tiene un caso a medias.
- [ ] `/formidable` y la ciega con una persona de almacén.
- [ ] El anillo de foco del enlace «Faltan tallas: …» quedó sin medir (el medidor pide teclado real). Es la pieza `btn-enlace`, igual que «Falta contar: …».
- [ ] Medir el efecto contra la mediana por reposición (9 min), no contra la de modelo nuevo: desde el 13-nov la foto se puede subir dentro de la hoja de crear. Es la tarea 1.
- [ ] Toca `apps/web/components/recepcion-conteo/` y `lib/`: nada de `components/ui/` ni de `app/estilos/vidrio/`. No cambia el diseño de Dynamic.

## Verificado en pantalla el 14-nov (navegador sin ventana, envío de prueba ya anulado)

Verificado y pasa:

- [x] El número llega abierto al elegir un modelo sin contar y se reabre al volver a elegirlo, con el número vacío (con mouse; con el dedo no se abre solo): 3 de 3 veces tras Escape y 3 de 3 tras un clic fuera.
- [x] Enter recorre la tabla de tallas, se queda en la última casilla si faltan o sobran y sale al botón del pie solo cuando cuadra. Lo repartido queda guardado tras recargar.
- [x] Los filtros salen «Por contar · Faltan tallas · Tallas para después · Por llevar al stock» y no comparten modelos. «Tallas para después» y «Por llevar al stock» dan lo mismo que el servidor con el código publicado.
- [x] El pie «Faltan tallas: X» nunca nombra el modelo que se mira ni uno que la lista no muestra.
- [x] En Nuevo producto, Enter pasa de casilla y no envía el formulario.
- [x] Movimientos de stock: 295 antes y 295 después.

Pendientes de esta rama (decisión de Felipe):

- [x] Con una cifra a medio escribir, tocar la fila del mismo modelo guardaba lo tecleado y lo que se tecleaba después no entraba en ningún lado. Arreglado el 14-nov: esa fila ya no le quita el cursor al número (`conservaLaCifra`).
- [ ] Mirando el único modelo al que le faltan tallas, el pie dice «Todo contado: revisa y cierra.»
- [ ] Una fila puede decir «Falta su nombre» o, en un envío con aviso, «Faltan N» o «Sobran N», y estar en el filtro «Faltan tallas»: la fila lleva un solo aviso, el más urgente.

Ya pasaba en producción (no es de esta rama):

- [x] Enter pasaba al siguiente modelo de la lista aunque ya estuviera contado, y su número se abría con la cifra seleccionada: la próxima tecla la reemplazaba. Arreglado el 14-nov (`destinoDelEnter`).
- [ ] En un envío con aviso, agregar con + otro modelo de la misma categoría y marca dentro del grupo de un modelo anotado (de una sola línea, en la primera línea del grupo) lo deja en «No llegó» sin que nadie lo toque: sale de «Por contar» y de «Falta contar», y al cerrar lo contado del agregado se suma a su línea. La causa: «contado» se deduce de que la línea tenga conteo (`recepcion-modelos-reglas.ts`, regla `contado` de los anotados en `modelosDelGrupo`), y el cero de un anotado no deja marca propia. No se arregla aquí: toca el cierre, el stock y lo que se le reclama al proveedor, y lo decide Felipe. La prueba «la falla de producción» de `destinoDelEnter` lo reproduce.
- [ ] Un filtro sin resultados sigue mostrando el modelo que se mira.
- [ ] «Falta contar: X» del pie no respeta el filtro puesto.
- [ ] «Dejar para después» no sobrevive a recargar la pantalla.
- [ ] Al recargar, la tabla de tallas muestra solo los colores con cifra.

Sin verificar: un envío con aviso en pantalla, «quién recibe» con una cuenta de terminal, un teléfono real, `/chaos` y `/formidable`.

## Recibir: Enter y la fila del modelo que cuentas (2026-11-14) — misma rama, solo web, sin migración

- [x] **Enter nunca abre un modelo que ya tiene cantidad** (`destinoDelEnter`, `lib/recepcion-modelos-reglas.ts`): tras guardar va al siguiente en cero de lo que la lista muestra (un «No llegó» adelante también); al dar la vuelta, solo a lo que falta contar; sin destino, el cursor va al enlace del pie («Falta contar», «Faltan tallas», «Ver todos») o a «Revisar y cerrar». `vecinosDeLaParada` quedó sin uso y se borró con sus pruebas. La guía de `recibir.envio.id` lo dice.
- [x] **Tocar la fila del modelo que cuentas no corta la cifra** (`conservaLaCifra`, `lib/recepcion-dial-reglas.ts`; `onMouseDown` en la fila de `CategoriasAcordeon.tsx`).
- [ ] **Recontar cuesta dos toques** (su fila y su número): Enter ya no encadena modelos contados. Es el precio aceptado.
- [ ] **«Deshacer» al corregir un conteo ya guardado: no por ahora (Felipe, 14-nov).** Costaría unas 30 líneas reusando el de «Poner en cero» (`ponerDeUnToque`).
- [ ] Sin probar en el navegador: las dos reglas están cubiertas por sus pruebas puras y leídas en el código (el clic en la propia fila con el número abierto no lo cierra ni vuelve a seleccionar la cifra, contado o no), pero no se recorrieron en pantalla.
