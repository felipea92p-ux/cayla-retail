## 🧵 Producción más clara (2026-11-26, ADR-0708) — solo web, sin migración; rama `claude/produccion-pantallas-revision-9c5ccd`

### Hecho

- [x] Maqueta aprobada por Felipe, pantalla por pantalla, con sus decisiones en `docs/maquetas/produccion-resumen-2026-11/README.md`.
- [x] Resumen versión C, Eficiencia, Órdenes, Nueva orden, Insumos y sus cuatro hojas llevados al código. Pieza nueva `ParDato` y `TituloGrupo paso`.
- [x] Guías interactivas de `/produccion`, `/produccion/ordenes`, `/produccion/insumos` y `/produccion/eficiencia` reescritas, recorridas en el navegador (1440 claro y 375 oscuro, ida y vuelta) y con su huella aceptada.
- [x] Probado en un banco propio, entrando con la cuenta del seed y cargando datos por la interfaz: 2 telas (por metro y por kilo), 2 avíos, saldo inicial, una compra a crédito y 3 órdenes (una recorrió las cinco fases y pasó al stock). Sin errores de página ni desbordes a 1440, 375 y 1920.
- [x] Corregido tras esa prueba: el Resumen decía «Está en Corte» de una orden por plotear; la franja de Órdenes contaba muestras que la lista no mostraba; nombres de insumo con punto medio; «Ninguna tela alcanza»; Escape con un «?» abierto cerraba la hoja; el nombre de la tela se cortaba en «Llegó una compra»; las fases de Nueva orden se aplastaban a 375 px.
- [x] `tsc` en 0, batería completa en verde, Knip limpio.

### Sin hacer (dicho sin adornos)

- [x] Auditorías obligatorias corridas el 2026-11-26 (ver abajo): `/milimetro auditar`, `tema:auditar`, `/sugerir`, `/formidable` y `/chaos`.
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

### `/formidable` (2026-11-26): corrida, con cambios propuestos y sin aplicar

Informe: `docs/formidable/produccion-mas-clara.md`. Siete lectores ciegos (uno por pantalla u hoja) y medición a 1440 y 375 px. Notas de leyes entre 6,9 y 7,6; oficio entre 7 y 9. Ninguna llega a «formidable»: falta la pasada con una colaboradora real.

- [x] Corregido lo que era un error del rediseño: el precio de «Llegó una compra» sin «sin IGV», el motivo «Falta tela» que tomaba el color de la prenda por el de la tela, y el recuadro de órdenes que contaba la muestra.
- [x] «Lo que ya tenías» abre sin nada elegido (Felipe 2026-11-26): con el primero de la lista puesto, se le sumaba saldo y costo a otro insumo.
- [ ] **Felipe dijo «ninguno por ahora»** a los cambios de texto y distribución propuestos (tres por pantalla, en el informe). Los que más pesan: «Comprar tela» no compra, solo lleva a Insumos; la tela que falta no dice para qué orden es; «Anotar compra», «Llegó una compra» y «Llegó más de este color» abren la misma hoja con tres nombres; el aviso de planilla de Eficiencia no dice qué hacer; el ejemplo «Popelina blanca» invita a poner el color en el nombre.
- [ ] «Llegó una compra» y «Lo que ya tenías» se cierran con Escape sin preguntar aunque haya datos escritos (viene de antes; «Nueva tela» y «Nuevo avío» sí preguntan).
- [ ] Nadie entendió «plotear» en la prueba ciega: es palabra del oficio; se ve en la pasada real.

### `/milimetro auditar` (2026-11-26)

Informe: `docs/milimetro/auditorias/2026-11-26-produccion-mas-clara.md`. 4 graves medidos, los 4 corregidos y vueltos a medir (botón de «Llegó una compra» apagado, foco invisible en la fila de un color y en la de un modelo, control tapado por el pie de la hoja).

- [ ] 4 medias y 10 leves, en el informe (rótulos a mano en la línea de la compra, «Abrir orden» apagado si falta el responsable, «Llegó una compra» de la cabecera apagado sin motivo, foco tras confirmar en «Nuevo avío», y detalles de espaciado y letra).
- [ ] **De piezas de todo el ERP (rompen una norma AA; tocan `components/ui/`, lo decide Felipe):** el foco de `<Segmentado>` casi no se ve (1,16:1), en `<Modal>` el foco se pierde una parada al dar la vuelta con Tab, y `<Chip tono="pizarra">` mide 3,57:1 en oscuro.

### Modo oscuro y `/sugerir` (2026-11-26)

- [x] `tema:auditar` en las cuatro rutas con `--escenarios`: 0 hallazgos solo en oscuro, 0 manchas y 0 velos a 1440 y 375 px; 30 de 34 escenarios abren (los otros 4 piden datos que el banco no tiene). El registro de escenarios quedó al día: 9 arreglados y 12 nuevos.
- [x] Corregido de `/sugerir`: el marcador del tejido cortado en «Nueva tela», «Precio de el kilo», «Costó cada uno» sin nada elegido en «Lo que ya tenías» y el buscador de modelos cortado a 375 px.
- [ ] Los puntos de color oscuros (negro, vino) casi no se distinguen en modo oscuro (pieza `Punto`, compartida con Nuevo producto).
- [ ] El ejemplo del nombre de la tela («Popelina blanca») no sigue al tejido y trae un color (queda con lo de `/formidable`); «Lo que sepas, por ejemplo: Algodón» tampoco sigue al tejido; `sugerirAvio` no tiene prueba; el buscador de colores se corta a 375 px (pieza compartida); «Sale de la ficha…» aparece aunque la ficha no traiga rinde.
- [ ] La hoja «Retirar color» titula con punto medio («Botón nácar 1.8 cm · Negro»).

### `/chaos` (2026-11-26), semilla 2043

Las cinco piezas que guardan, en banco propio y navegador, a 1440 y 375 px. **0 estados imposibles** (30 invariantes del repo + 13 de Insumos y Órdenes) y **ningún hallazgo grave nace del rediseño**. Resiste doble clic, ráfagas, diez sesiones a la vez, red cortada, respuesta perdida, unidades y lo plegado. Informe local (fuera de git): `.chaos/informes/produccion-mas-clara-2026-11-26.md`. Estado para el tablero: «atacada, con hallazgos abiertos», todos de antes.

- [x] Corregido lo único del rediseño: el aviso «Elige si es un lote de producción o una muestra» ahora dice «para vender».
- [ ] **Decide Felipe (dinero), venía de antes:** «Llegó una compra» con «Ya la pagué» deja guardar el pago **sin cuenta** si las cuentas todavía cargan o su lectura falló (`LlegoUnaCompraModal.tsx`, `MediosDePago.tsx`).
- [ ] **Decide Felipe (dinero), venía de antes:** «Lo que ya tenías» manda el costo total redondeado a céntimos, y el costo unitario guardado no es el escrito (3 a S/ 0.045 quedan a 0.0467; 1 a S/ 0.004 queda a 0).
- [ ] Fechas imposibles (vence o entrega en 2999) y caracteres invisibles en nombres se guardan sin aviso (venía de antes).
- [ ] **De todo el ERP, por confirmar en un build de producción:** con las animaciones apagadas (como nace toda cuenta) el aviso de éxito no llegó a verse tras guardar; en Nueva orden se pierde con él el enlace «Ver OP-…» (`components/ui/Avisos.tsx`, `lib/avisos-reglas.ts`). Medido en el servidor de desarrollo.
- [ ] Enter en «Nota» abre la orden y Enter en «Costó» guarda el saldo (falta `enterNoGuarda`); dos mensajes de la compra dicen otra cosa de la que pasa (la misma tela en dos líneas; vencimiento ya pasado); errores crudos de Postgres con un carácter nulo pegado.
- [ ] Un hallazgo de permisos se le dijo a Felipe en el chat y no se escribe aquí (regla «Caos»).
- [ ] Sin cubrir: una cuenta que no sea líder con Producción en el Taller, dos navegadores a la vez, teléfono real.
- [ ] La página de la orden todavía dice «lote de producción» en «Pasar a lote de producción» y en su línea de tiempo.

### Para Dynamic

- `components/ui/ParDato.tsx` (pieza nueva), `TituloGrupo` con `paso`, `MenuAcciones` con `guia` en cada opción y `AyudaCabecera` (su Escape ya no cierra la hoja de abajo). Están en la carpeta que Dynamic mira: allá queda como tarea si quieren lo mismo.
