## 🏷️ Etiquetas: las hojas de campaña y de prendas, y las tarjetas (2026-10-17) — rama `claude/discount-campaign-interface-b60d45`, ADR-0441 (reservado)

Construcción en 9 actividades aprobada por Felipe (`/construir`). Este PR lleva las tres primeras, que no tocan la base. El ADR-0441 se escribe
cuando entre la decisión estructural (actividad 7: guardar campaña y prendas en una sola transacción).

### Hecho

- [x] **1. La hoja «Campaña»**: ancha, Desde y Hasta en una fila, descuentos de un toque, categorías con cuántas prendas trae cada una y a
  cuántas prendas llega antes de guardar.
- [x] **2. La hoja «Prendas»**: foto, nombre, «2 de 8 tallas y colores», píldoras Con / Sin la etiqueta, precio antes y después, lista de alto
  fijo, quién registra desde el inicio y pie pegado abajo en un laptop.
- [x] **3. Las tarjetas**: cuentan las prendas a la venta con la regla de su hoja (Nuevo: 164, no 186), dicen aparte las marcadas que ya no se
  venden, «Vigente, sin prendas» en ámbar, y «Prendas» / «Campaña» con los botones del sistema.
- [x] **3b. Quitar también se revisa** (Felipe lo aprobó el 2026-10-17): con descuento, quitar prendas pasa por «Revisar y aplicar»
  («deja de rebajar N prendas: desde hoy se cobran sin este N %»), y la hoja «Prendas» dice las marcas de prendas que ya no se venden
  con «Quitárselas» / «Deshacer». Al aplicar, la tarjeta sigue contando las que no se quitaron.
- [x] **4. Por temporada, con «Repetir»**: cada grupo va por temporada (lo que rige, lo que viene, lo que pasó, sin fechas); «Pasó el
  10 may.» en vez de «Fuera de temporada»; «Sin preparar» en ámbar si lo que viene no llega a ninguna prenda; «Repetir» abre la hoja con
  las fechas del año que viene y, si cambió el día de la semana, ofrece el mismo («Usar el domingo 9»). Felipe eligió la opción 1 (sumar un
  año y avisar) el 2026-10-17. El aviso sale también en las fiestas de fecha fija (Navidad, Fiestas Patrias): quien repite decide.
- [x] **5. Aviso de reimprimir**: al guardar una campaña, si cambió HOY el precio en caja de alguna prenda (otro %, fechas que la
  hacen regir o dejar de regir, categorías que entran o salen), el aviso de éxito dice cuántas y ofrece «Imprimir sus etiquetas», que abre
  `/etiquetas-de-precio?variantes=` con solo esas. El botón no lleva número: la impresión saca una por unidad en la tienda.
- [ ] **La pantalla de impresión habla de Existencias** cuando llega desde una campaña («Existencias · Prendas marcadas», «entre las que
  marcaste»): que diga de dónde viene es un cambio de esa pantalla (ADR-0180), no de Etiquetas.

### Sigue pendiente

- [ ] **6. Lectura de rotación** (migración: ensayo y OK de Felipe antes de producción).
- [ ] **7. Pantalla de trabajo con un solo Guardar** (RPC nueva que guarda campaña y prendas juntas; aquí se escribe el ADR-0441).
- [ ] **8. Sugeridas dentro de la pantalla** (antes: Felipe fija los números de las reglas).
- [ ] **9. `/chaos`, `/formidable` y la guía** de la pantalla nueva.
- [ ] **Una prenda descontinuada con stock se cobra con descuento**: `registrar_venta` no mira si la talla o el producto siguen activos, y el
  aviso «por debajo del costo» ya no la cuenta. Si eso no es lo que Felipe quiere, es un cambio de base.
  Lo mismo al revés: si una de esas prendas tiene stock, «Quitárselas» le sube el precio en caja sin pasar por la revisión (la hoja la
  cuenta como «ya no se vende»). En producción, el 2026-10-17, los productos descontinuados tenían 0 unidades.
- [ ] **«Desactivar» de la tarjeta** sigue como enlace que aparece al pasar el mouse (lo comparten Tallas, Tejidos y Patrones): pasarlo a
  `btn-peligro` lo decide Felipe mirando, porque serían 20 botones rojos a la vista en una pantalla táctil.
- [ ] **192 «Prendas sin registrar»** pendientes en producción: sin regularizarlas, la lectura de rotación (actividad 6) sale corta.
