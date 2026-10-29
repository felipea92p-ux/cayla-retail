# Producción que se corrige y se registra fácil (ADR-0570)

Rama `claude/module-registration-editing-4c6c12`. Parte de `claude/multiple-garment-materials-9d1c52` (ADR-0563 y ADR-0566). **Sus 2 SQL, `20261029021000` y luego `20261029051000`, se pegan ANTES que los de esta obra.**

## Actividades (lista aprobada por Felipe el 2026-10-29, `/construir`)

- [x] **1 · La orden como «Ruta viva»** (solo web).
- [ ] **2 · «Terminé» con falla y con fecha.** «¿Cuántas salieron bien?»; las demás «se arreglan» (vuelven al paso anterior), son «segunda» o «se perdió», con motivo. El paso cierra igual: hoy una prenda dañada traba la orden. «¿Cuándo lo terminaste?»: desde la apertura, nunca futura, y se guarda aparte cuándo se anotó. Migración y prueba de base.
- [ ] **3 · Corregir y eliminar cualquier anotación.** «Corregir» (cantidad, fecha) y «Eliminar» en cada evento de la historia, motivo con atajos, «Restaurar», notas del equipo. Una tabla de cambios de solo agregar, escrita en la misma transacción que el cambio (Actividad no basta: falla en silencio). Hoy `quitar_paso_orden` y `agregar_paso_orden` borran y escriben sin dejar rastro si Actividad falla.
- [ ] **4 · La tela al cortar.** «¿Cuánto quedó?» por color en «Terminé Corte». Corte afuera: la tela sale al mandarla y vuelve lo que sobra. «Encontré tela» (retazos, último precio). Sin tela no pasa al stock, salvo el Líder o el Admin con motivo.
- [ ] **5 · Catálogo de procesos.** El líder los da de alta en Servicios y tarifas. Las claves fijas (escritas en 11 lugares) pasan a una tabla con llave foránea. «+ Agregar proceso» con «Otro proceso…». Se siembran Pegar cierre y Lavado o teñido. El modelo sugiere, con la casilla «Recordar en la ficha». `producto_procesos` reemplaza a `lleva_ojales_botones`.
- [ ] **6 · Insumos como «Estante en tabla».** Corregir o eliminar un ingreso mientras nadie lo use; si ya se usó, ajustar lo que queda. Historia por color, «Cambios de la semana» y aviso cuando no alcanza para las órdenes. **Antes de dibujar:** definir el movimiento de corrección que SÍ baja el saldo del lote (hoy el saldo ignora `ajuste`: stock fantasma). Con esto se elimina el ingreso de «Arena (retirado)» (MM-01-ARE, 9 m: se anotó dos veces).
- [ ] **7 · «Llegó una compra».** Varias líneas (telas por color y avíos), metro, kilo o rollo, solo el precio obligatorio. Pago al guardar: Por pagar, Pagado de una cuenta, o Lo anoto después. Reemplaza «Ingresar lote» y el ir y venir entre Facturas y Recibir. Toca dinero: con su OK.
- [ ] **8 · Avíos simples y detallados, y la ficha con avíos.** Todo avío tiene una variante o más, de color y medida. La ficha del modelo dice qué avíos lleva cada prenda; se apartan al abrir la orden y se descuentan al terminar su paso.
- [ ] **9 · Consumibles con monto fijo por prenda.** Hilo, bolsas y agujas como gasto del Taller, sin estante. El monto fijo («S/ 0,50 por prenda») se suma al costo al pasar al stock, con un cuadre del mes. Toca costo: con su OK.
- [ ] **10 · Cierre.** `/chaos` sobre todo lo que guarda, `/formidable` con antes y después, `guias:recorrer`, `tema:auditar`, diccionario de datos.

## Encontrado de paso (fuera de esta obra)

- **Las cifras de la cabecera de la orden se salen del ancho.** `ResumenSede` («S/ 0.00 de S/ 1,162.46») desborda a 1024 px con el lateral abierto. No viene de la Ruta viva.
- **El «Anular orden» rojo fijo en la cabecera** y los «Anular» rojos de cada salida o vuelta pasan el tope de 2 rojos por pantalla. Lo resuelve la actividad 3: «Corregir» y «Eliminar» como enlaces, y el rojo dentro de su hoja.
- **Las franjas de la Tabla oficial:** los tonos hueso (#eae1d2) y sand (#e8e0d0) casi no se distinguen. Producción ya va sin franja; llevarlo a todo el ERP es decisión de Felipe con `/unificar`.
