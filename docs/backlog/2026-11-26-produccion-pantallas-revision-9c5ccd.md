## 🧵 Producción más clara (2026-11-26, ADR-0708) — solo web, sin migración; rama `claude/produccion-pantallas-revision-9c5ccd`

### Hecho

- [x] Maqueta aprobada por Felipe, pantalla por pantalla, con sus decisiones en `docs/maquetas/produccion-resumen-2026-11/README.md`.
- [x] Resumen versión C, Eficiencia, Órdenes, Nueva orden, Insumos y sus cuatro hojas llevados al código. Pieza nueva `ParDato` y `TituloGrupo paso`.
- [x] Guías interactivas de `/produccion`, `/produccion/ordenes`, `/produccion/insumos` y `/produccion/eficiencia` reescritas, recorridas en el navegador (1440 claro y 375 oscuro, ida y vuelta) y con su huella aceptada.
- [x] Probado en un banco propio, entrando con la cuenta del seed y cargando datos por la interfaz: 2 telas (por metro y por kilo), 2 avíos, saldo inicial, una compra a crédito y 3 órdenes (una recorrió las cinco fases y pasó al stock). Sin errores de página ni desbordes a 1440, 375 y 1920.
- [x] Corregido tras esa prueba: el Resumen decía «Está en Corte» de una orden por plotear; la franja de Órdenes contaba muestras que la lista no mostraba; nombres de insumo con punto medio; «Ninguna tela alcanza»; Escape con un «?» abierto cerraba la hoja; el nombre de la tela se cortaba en «Llegó una compra»; las fases de Nueva orden se aplastaban a 375 px.
- [x] `tsc` en 0, batería completa en verde, Knip limpio.

### Sin hacer (dicho sin adornos)

- [ ] **Auditorías obligatorias sin correr:** `/milimetro auditar` de las cinco rutas, `tema:auditar` (modo oscuro medido; solo se miraron capturas), `/formidable` y `/chaos` de las cuatro hojas y de Nueva orden.
- [ ] **Sin ver con datos:** «Qué fabricar primero», el recuadro de modelos y la hoja del modelo (los 10 modelos del seed están pendientes de aprobar y el Resumen no los cuenta); «Prendas listas sin llevar a tienda» y «Un pago está vencido»; Eficiencia con planilla y con más de un mes.
- [ ] **Sin probar con otra cuenta:** todo se probó como Admin. Falta el combo «Responsable», la vista de quien no es líder y el candado de dinero.
- [ ] **Sin guardar de verdad:** una compra «Ya la pagué» o «sin factura» y una tela por rollo (solo se llenaron y se capturaron).
- [ ] 768 y 1024 px, Safari y un teléfono real.

### Hallazgos de la prueba que no se arreglaron aquí

- [ ] **Decide Felipe (dinero):** en Nueva orden, si la tela se declara para un solo color, «Cuesta hacerla» reparte esa tela entre todas las prendas y la ganancia sale de más; y «Ver de qué se forma» solo muestra «Toda la orden».
- [ ] **Decide Felipe:** el punto medio de las piezas de todo el ERP: la línea de sede y fecha de la cabecera, «· opcional» / «· obligatorio» en los rótulos de campo, «Sigue: X · quedan 2 más» de la guía de foco, «Admin · queda a tu nombre» y la nota de `TituloGrupo`. Son de todo el sistema (y de Dynamic): cambiarlas es otro PR.
- [ ] Una fecha de entrega pasada en Nueva orden muestra el globo nativo del navegador y a la vez «Todo listo para abrir la orden» (viene de antes).
- [ ] Tela por kilo: «Ya tengo» va en kilos y «Avísame si baja de» en metros en la misma fila; el costo sale con tres decimales («S/ 10.944 el metro»).
- [ ] Cambiar la unidad de una tela borra lo escrito en sus colores y debajo dice «Todo listo» (viene de antes).
- [ ] Nuevo avío a 375 px: las seis opciones de «Se cuenta en» se montan (viene de antes: es el segmentado con seis opciones).
- [ ] Nueva orden a 375 px: la tabla de cantidades queda cortada sin indicar que se desliza, y la ficha sigue siendo la barra de abajo (no baja completa).
- [ ] «Lo que ya tenías»: «Costó el metro» (campo de monto, 48 px) y «Cuánto había» (40 px) tienen alto y letra distintos.
- [ ] «Retirar color» se ofrece también en un avío sin color.
- [ ] El Resumen dice «Ningún modelo todavía» cuando hay modelos pendientes de aprobar que Nueva orden sí ofrece.
- [ ] El paso 3 de Nueva orden (fases, tela, entrega) no se rediseñó: conserva sus párrafos a la vista. Tampoco la página de la orden (`/produccion/ordenes/OP-…`), que sigue con puntos medios.
- [ ] «Editar tela» tomó las palabras nuevas («De qué está hecha», «Se pierde al cortar») pero no los pasos numerados.
- [ ] Abreviaturas que quedan: «unid.», «doc.», «m/kg», «N.° de operación».

### Para Dynamic

- `components/ui/ParDato.tsx` (pieza nueva), `TituloGrupo` con `paso`, `MenuAcciones` con `guia` en cada opción y `AyudaCabecera` (su Escape ya no cierra la hoja de abajo). Están en la carpeta que Dynamic mira: allá queda como tarea si quieren lo mismo.
