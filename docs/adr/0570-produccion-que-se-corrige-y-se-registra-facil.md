# ADR-0570: Producción que se corrige y se registra fácil (las 34 decisiones del Taller y la «Ruta viva»)

**Estado:** aceptada.
- Actividad 1 (la «Ruta viva», solo web): construida y probada en local.
- Actividad 2 («Terminé» con falla y con fecha): construida y probada en local. Su migración `20261029164000` está SIN pegar en producción: va después de `20261029021000` y `20261029051000`.
- Actividad 3 (corregir, eliminar y restaurar cualquier anotación, con historia y notas): construida y probada en local. Su migración `20261029173000` está SIN pegar: va después de `20261029164000`.
- Actividades 4 a 10: sin construir, en el orden de abajo.
**Fecha:** 2026-10-29.
**Decidió:** Felipe, con 34 preguntas en 9 rondas, el 29-oct. Eligió la versión A de la orden y la A de Insumos mirando la maqueta `docs/maquetas/produccion-taller-2026-10/index.html`.
**Sigue a:** ADR-0400 (la orden y sus fases), ADR-0551 (cinco pasos fijos), ADR-0554 (una tela con sus colores), ADR-0563 (forro y complementos) y ADR-0566 (agregar un paso).

## Contexto

Felipe (2026-10-29, con dos capturas, Insumos y la orden OP-1 del Chaleco): «todo este módulo tiene cientos de errores; qué tedioso y difícil es registrar […] que me permita editar con facilidad, también eliminar con historial de cambio y comentario para entender qué pasó; también falta lo de ojal y botón […] cierre también […]. Bien horrible de manejar y los colores también». Pidió además que quedara «mejor que Shopify».

Se analizó con 4 agentes: Insumos, la página de la orden, el modelo de pasos con el historial del ERP, y una prueba ciega con alguien del taller sin contexto. Esto es lo que encontraron, medido en el código:

- **Un ingreso de tela equivocado no se arregla desde ninguna pantalla.** Los lotes y el libro solo se leen. La única función que escribía un `ajuste` se borró el 28-oct. Anular la factura se niega si ya se recibió. «Retirar color» se niega si hay saldo. Queda solo SQL a mano. A la prueba ciega le dio 1/10.
  Además, el saldo de un lote ignora el `ajuste`. Un «anular» construido sobre él dejaría stock fantasma: hay que decidir el tipo de movimiento antes de dibujar la pantalla.
- **Una sola prenda dañada en un paso del Taller traba la orden.** «Terminé» no tiene dónde anotar la falla, y un paso del Taller cierra solo cuando todas salieron buenas. «Pasar al stock» nunca aparece.
- **La tela decía «Ya se cortó» en verde junto a «Usado 0 m».** El chip salía del corte, no de la tela. La prenda pasaría al stock sin costo de tela: ya pasó con la OP-343, que entró a S/ 4,50 en vez de S/ 22,38.
- **La lista de pasos está escrita a mano en 11 lugares** (CHECK, funciones y web). Cambió 5 veces entre el 14 y el 29 de octubre.
- **Corregir es «deshacer la última, en cadena», y sin motivo.** No hay fecha real: todo pasa «a las 20:29».
- **Colores:** texto taupe rojizo en cada número, verde donde faltaba un dato, franjas de dos beiges casi iguales, y el paso hecho y el que tocaba casi iguales.

## Decisión

### Lo que Felipe decidió (34 preguntas; la recomendada en todas salvo donde se dice)

1. **Quién y dónde.** Anota una encargada del Taller. Se usa sobre todo desde un computador o una Mac: escritorio primero.
2. **Corregir y eliminar** (rondas 2 y 7):
   - Eliminar algo hace que salga de la vista, con rastro y «Restaurar».
   - El comentario es obligatorio, con atajos («Se anotó dos veces», «Cantidad equivocada», «Otra fecha»…).
   - Corrige y elimina quien ve Producción.
   - La historia se ve en cada cosa, más un resumen de «Cambios de la semana».
   - «Corregir» y «Eliminar» van en **cualquier** anotación de la orden, no solo en la última. Si lo de después deja de cuadrar, el sistema dice qué paso arreglar primero.
3. **Procesos** (ronda 3):
   - Además de Ojal y botón: **Pegar cierre** (la cremallera), **Lavado o teñido** y «Otro…», que se escribe cuando surja.
   - Quién lo hace depende del proceso.
   - **Los da de alta el líder**, en un catálogo; no los programa nadie.
   - El modelo sugiere y la orden manda.
4. **Insumos** (rondas 4, 5 y 8):
   - **Una sola puerta, «Llegó una compra»:** varias líneas (telas por color y avíos).
   - **Solo el precio es obligatorio** («por ahora no me bloquees casi nada»).
   - Al guardar se elige el pago: Por pagar, Pagado (de qué cuenta) o Lo anoto después.
   - Se compra por metro, kilo y rollo.
   - Un ingreso equivocado se corrige libre mientras nadie lo use; si ya se usó, solo se ajusta lo que queda.
   - El Arena real son 9 m: el ingreso de «Arena (retirado)» (MM-01-ARE) se elimina con su motivo.
   - **Avíos con registro simple y detallado.** Propuesta: todo avío tiene al menos una variante, como los productos de Shopify; el simple tiene una sola y el detallado tiene color y medida.
   - Hilo, bolsas y agujas: **gasto del Taller más un monto fijo por prenda**, sin estante.
   - «Encontré tela» en un toque (retazos o tela sin registrar), con el último precio si no se sabe.
   - El aviso sale cuando la tela **no alcanza para las órdenes**, sin mínimos que configurar.
5. **La orden** (rondas 6 y 7):
   - En «Terminé», las prendas que no salieron bien se arreglan (vuelven al paso anterior), quedan como segunda (no entra al stock, ADR-0400) o se perdieron, con su motivo.
   - Se pregunta «¿Cuándo lo terminaste?»: desde la apertura, nunca en el futuro, y se guarda aparte cuándo se anotó.
   - **No hace falta saber quién hizo el paso**; basta quién lo anotó.
   - La tela se anota al cortar con «¿cuánto quedó?» por color. Si se corta afuera, sale al mandarla.
   - **Sin tela anotada no pasa al stock**, salvo el Líder o el Admin con motivo. Felipe agregó que, a cambio, «Encontré tela» cubre los retazos.
   - La ficha del modelo dice qué avíos lleva cada prenda, y se descuentan solos al terminar el paso que los usa.
6. **Pantallas y color** (ronda 9): la orden es la **A «Ruta viva»** e Insumos la **A «Estante en tabla»**. La regla de color:
   - verde, solo lo hecho;
   - ámbar, lo que te toca o falta;
   - rojo, solo un problema;
   - lo demás, tinta y gris neutro (sin taupe en cada número);
   - tablas sin franjas.

### Las actividades (`/construir`, lista aprobada por Felipe, en este orden)

1. La orden como «Ruta viva» (solo web). **Hecha:** ver abajo.
2. «Terminé» con falla y con fecha.
3. Corregir y eliminar cualquier anotación, con historia de solo agregar y notas del equipo.
4. La tela al cortar («¿cuánto quedó?»), «Encontré tela» y el candado de «Pasar al stock».
5. El catálogo de procesos, con Pegar cierre, Lavado y «Otro…».
6. Insumos como «Estante en tabla», con corregir y eliminar ingresos.
7. «Llegó una compra», con su pago.
8. Avíos simples y detallados en la ficha del modelo.
9. Consumibles con monto fijo por prenda.
10. Cierre: `/chaos`, `/formidable`, guías y documentos.

La rama parte de `claude/multiple-garment-materials-9d1c52` (ADR-0563 y ADR-0566): «+ Agregar un paso» deja usar Ojal y botón desde el primer día. **Sus dos SQL van antes que los de esta obra.**

### Actividad 1: la «Ruta viva» (solo web, sin base)

**DECIDÍ:**
- La ruta va como una fila de pasos con un color cada uno, y **un solo paso abierto debajo**, con sus botones. Al entrar se abre el que toca. Tocar otro paso de la ruta lo abre, y un punto ámbar marca dónde más hay algo para anotar.
- Bajo el paso abierto van la tela y el costo. Al costado van la ficha y la «Historia» (antes «Línea de tiempo»).
- La tela dice «Falta anotar» en ámbar, con un aviso arriba de la tabla y su botón, en vez del verde «Ya se cortó». «Alcanza» pasa a neutro.
- Las tablas de la orden no llevan franja.
- El punto de cada entrada de la historia dice qué fue: verde lo hecho, pizarra lo que salió a un servicio, ámbar lo que se deshizo o anuló.
- Las reglas son puras y tienen prueba: `estadoEnRuta`, `faseAbiertaDeLaRuta`, `subtituloEnRuta`, `tonoDeEntrada` y `FilaDeTela.porAnotar`, en `lib/orden-pagina-reglas.ts`.

**DESCARTÉ:**
- **Mantener las tarjetas de todos los pasos con sus botones a la vista (la vista D de ADR-0400).** Es la que Felipe llamó «horrible de manejar»: siete tarjetas casi iguales y los botones repartidos.
- **La versión B, «Planilla».** Para alguien nuevo es una grilla de números.
- **La versión C, «Paso enfocado».** Para ver la orden entera hay que pasar paso por paso.

**SE ROMPE SI:** dos pasos tocan a la vez (uno del Taller y la Salida del siguiente, en paralelo) y la encargada no mira el punto ámbar del que está cerrado. El paso cerrado no muestra su botón hasta que lo toca. Lo cubre el punto ámbar, pero solo si se ve.

**Detalles:**
- El paso que la persona abre vale mientras la fase actual no cambie. Al anotar y pasar a la siguiente, la ruta vuelve a abrir la que toca.
- La franja se quita solo dentro de `.op-pagina`, con una regla más específica que la de la Tabla oficial. Llevarlo a todo el ERP lo decide `/unificar` con Felipe.
- El texto secundario de la orden es `--op-tenue` (tinta al 72 %, sobre el piso de contraste de ADR-0336).

### Actividad 2: «Terminé» con falla y con fecha (migración `20261029164000`, web)

**DECIDÍ:**
- Una tabla aparte, `produccion_fallas`, de solo agregar como `produccion_avances`. Cada fila es talla y color, cuántas, destino (`segunda`, `perdida` o `arreglo`) y motivo. Un Deshacer es una fila negativa con `deshace_id`, una sola vez (`unique`).
- **Segunda y perdida cierran la fase y NO pasan a la siguiente.** Se suman a las segundas y faltantes que `fn_fases_de_orden` ya contaba de la Vuelta: la misma regla de cierre de ADR-0400, que ahora alcanza al Taller.
- **«Se arregla» no reabre la fase anterior.** La prenda sigue pendiente en ESTA fase y la historia dice adónde fue. Cuando vuelve buena, se anota y la fase cierra.
- El día real va en `produccion_avances.hecho_en`, como en la marca de Ploteo. Va desde la apertura y nunca es futuro, y `created_at` sigue diciendo cuándo se anotó.
- Una función nueva, `anotar_termine`, lleva buenas, fallas y día en una llamada, todo o nada, bajo el candado de la orden.
- `registrar_avance` conserva su firma y la llama. Así hay una sola regla, y la web publicada antes que la base sigue andando.
- En la hoja, al anotar una falla, las buenas de esa talla y color bajan solas.

**DESCARTÉ:**
- **Un `origen` nuevo en `produccion_avances`.** Lo que suma esa tabla es lo que pasa a la fase siguiente: mezclar ahí prendas que no pasan obligaba a filtrar 9 lecturas.
- **Más argumentos en `registrar_avance`.** 9 suites recargan las migraciones que la definen con 3 argumentos, y dos versiones vuelven ambiguas todas las llamadas.
- **Que el arreglo reste de la fase anterior.** Si esa fase la hizo un servicio, la prenda tendría que volver a salir y se le pagaría otra vez.

**SE ROMPE SI:**
- Un arreglo se paga aparte por prenda: hoy no se anota quién arregla, y Felipe dijo que no importa quién hizo cada paso.
- Alguien elige un día anterior al del paso de antes: se acepta y la historia lo muestra tal cual.

**Lo que se probó:**
- `pnpm pruebas:produccion-termine-con-falla`: 21 casos.
- Las 24 suites de Producción en una base hecha desde cero con las 933 migraciones de la rama. Eso destapó dos cosas:
  - Un ancla que no existía en `main`: la copia de la base compartida traía una migración de otra rama sin fusionar.
  - Que la suite del Ploteo tiene que deshacer estos parches. Ahora los lee de la migración.
- En el navegador, sobre una orden de prueba:
  - 98 buenas y 2 segundas con fecha de ayer cierran Habilitado, a Costura le entran 98, y la historia muestra «Con falla» en rojo y «anotó el jue 29».
  - Deshacer la falla reabre la fase sin borrar nada.

### Actividad 3: corregir, eliminar y restaurar cualquier anotación, con historia y notas (migración `20261029173000`, web)

**DECIDÍ:**
- Una tabla nueva, `produccion_cambios`, de solo agregar: cada corrección, eliminación, restauración y nota de una orden, con quién, cuándo, el motivo y el antes y el después. Se escribe en la MISMA transacción que el cambio. La Actividad no alcanza como historia: si falla, falla en silencio.
- **Corregir = deshacer lo viejo + anotar lo nuevo, en un solo paso.** Nada se edita ni se borra. El cambio guarda qué filas quitó y cuáles puso (`quita_ids`, `pone_ids`). Un Deshacer ya sabe qué deshace (`deshace_id`), así que no hace falta otra columna en lo anotado.
- **La regla de «Terminé» sale a una sola función, `fn_produccion_escribir_termine`.** La usan «Terminé», corregir y restaurar. Una corrección valida exactamente lo mismo: nunca más buenas + segundas + perdidas que lo que entró.
- **Ningún cambio deja a la fase siguiente con más prendas de las que le llegaron** (`fn_produccion_exigir_cadena`, la regla de `deshacer_avance` llevada a cualquier anotación, no solo a la última). Si la siguiente ya las usó, la base dice qué corregir primero.
- Se corrige y se elimina un «Terminé» de cualquier día: sus buenas, sus fallas y su día. Si el día no cambia, se queda el momento de antes. La marca de Ploteo se quita y se restaura. Las salidas y vueltas siguen con su «Anular» de siempre, que ya pedía motivo.
- Restaurar vuelve a anotar lo eliminado tal como era y con su día, con la misma regla. Si mientras tanto la fase se llenó, la base lo dice. Se restaura una sola vez (`restaura_id` único).
- Las notas del equipo van en la misma tabla, valen en cualquier estado de la orden y no se borran: si algo cambió, se escribe otra.
- **En la pantalla:** cada anotación viva lleva su lápiz (`<LapizEditar>`, la pieza de «editar» en una fila). El lápiz abre la hoja; «Eliminar» va dentro, a la izquierda del pie. Así el rojo no se repite en cada fila (antes había un «Anular» rojo por salida). Lo que un cambio quitó sale de la vista y en su lugar va el cambio: «Corrigió lo terminado en Habilitado 98 → 97 · Beige S: 8 → 7 · Por qué: Cantidad equivocada». Lo rehecho dice «corrigió el …» o «restauró el …», nunca «anotó». Las filas de falla son una sola pieza (`FilasDeFalla`) para «Terminé» y «Corregir».

**DESCARTÉ:**
- **Marcar cada fila con un `cambio_id` leído de una variable de la transacción (`set_config`).** Cualquier inserción del paso quedaría marcada sin que el código lo diga.
- **Que restaurar solo vuelva a mostrar lo eliminado.** Las filas viejas ya están deshechas: restaurar es anotar de nuevo, con la misma regla.
- **Agregar `deshace_id` a las filas de la línea de tiempo con reemplazos anclados.** Esas filas las reemplazan por su texto otras migraciones (la de las fallas, la de la marca de otra rama), y volver a pegar una de esas duplicaba el bloque. Se probó: la suite de fallas lo agarró. La orden manda los cambios y lo ya deshecho en dos claves aparte (`cambios`, `deshechos`).
- **Borrar las notas.** Una nota mal escrita se corrige con otra; borrarla dejaría un hueco en lo que el equipo se contó.

**SE ROMPE SI:**
- Algún día otra función escribe en una fase sin tomar el candado de la orden. Hoy todas lo toman, y la prueba S3 lo vigila en las cuatro de esta obra.
- Alguien vuelve a pegar `20261029164000` después de esta: «Terminé» queda con su copia de la regla. Hace lo mismo, pero ya no es una sola. Por eso, si se vuelve a pegar aquella, se pega esta después.

**Lo que se probó:**
- `pnpm pruebas:produccion-correcciones`: 28 casos. Cubren corregir uno que no es el último, el día, sin cambios, pasarse, lo que la fase siguiente ya usó, la marca, restaurar una sola vez y sin pasarse, notas, otra sede, una orden ya en el stock, la forma y que se pueda pegar otra vez.
- La suite de fallas (21) ahora carga también esta migración: «Terminé» con la regla compartida hace lo mismo.
- Las 25 suites de Producción, en la base hecha desde cero.
- En el navegador (OP-000231), en escritorio y a 375 px:
  - corregir Habilitado 98 → 97 deja el cambio en la historia y la entrada con «Corregida»;
  - eliminar Corte con Habilitado ya anotado se rechaza con un mensaje que dice qué corregir primero;
  - eliminar y restaurar Habilitado;
  - una nota.

### Actividad 4: la tela al cortar, «Encontré tela» y el candado de «Pasar al stock» (migración `20261029190000`, web)

**DECIDÍ:**
- **Se pregunta lo que quedó, no lo que se usó.** En el Taller nadie mide lo cortado: mide lo que queda en el rollo. «¿Cuánto quedó en el estante?» trae todos los colores de la orden en una hoja (`AnotarLoUsadoModal`), y la base resta lo que quedó de lo que la pantalla muestra como «en el estante» (`fn_insumo_saldo_en`, el libro de movimientos). El número que la persona ve antes de medir es el mismo que usa la base.
- **Todo o nada, en una sola llamada:** `anotar_insumos_de_la_orden(orden, líneas)`. Lo usado sale de los lotes del más antiguo al más nuevo (PEPS, `fn_insumo_consumir_peps`) dentro de la base. Antes la pantalla partía entre lotes y hacía una llamada por lote: si la segunda fallaba, quedaba la mitad. El partido del navegador se borró.
- **Corte de afuera:** la tela sale con la salida (`AnotarSalidaModal` la pide con «usado») y lo que sobra vuelve con «Devolver lo que sobró», que ya existía.
- **«Encontré tela»** (`encontre_tela`): un retazo o una tela que nunca se registró entra como un lote más con origen `encontrada`, al precio escrito o al del último lote de ese color. Solo telas: un avío entra con su compra. No toca caja ni comprobantes.
- **El candado de «Pasar al stock»:** si la orden declaró tela (también un forro) y algún color no tiene nada anotado, `cerrar_produccion` no la deja entrar (`fn_produccion_exigir_tela`). Solo un líder (o un Admin, que aquí también es líder) la deja pasar con su motivo (`permitir_pasar_sin_tela`), y el permiso queda en la historia de la orden (`produccion_cambios`, acción `sin_tela`). Una muestra no lo pide.

**DESCARTÉ:**
- **Exigir tela también a una orden que no declaró ninguna.** Es la lectura literal de «sin tela no pasa», pero 20 suites de otros módulos (Frescura, el plan del piso, costos) cierran órdenes sin tela para armar su escena, y toda orden abierta sin tela declarada quedaría trabada. La pantalla sigue avisando y ofrece «Declarar la tela». **Volverlo candado es decisión de Felipe** y sería otra migración.
- **Seguir preguntando «¿cuánto usaste?».** Es un número que nadie midió; por eso se anotaba cero o no se anotaba.
- **Una compra inventada para un retazo.** Ensucia Compras y Por pagar con algo que nadie compró.

**SE ROMPE SI:**
- Alguien anota «quedó» de un color que se cortó para dos órdenes en una sola medición: la base le carga todo a la orden que anota. Se corrige devolviendo lo que no era suyo («Devolver lo que sobró»).
- El estante tiene un ajuste que los lotes no ven (el saldo de un lote ignora los `ajuste`, actividad 6): lo que quedó puede pedir más de lo que los lotes tienen. La base lo rechaza con «Avisa al líder» en vez de dejar un lote negativo.

**Lo que se probó:**
- `pnpm pruebas:produccion-tela-al-cortar`: 16 casos (quedó por color, todo o nada, PEPS entre lotes, pasarse, repetidos, ajeno, «Encontré tela» con y sin precio, avío rechazado, el candado con tela y con forro, el permiso solo de líder, la muestra y la orden sin tela que pasan, y que se pueda pegar otra vez).
- Las 26 suites de Producción y las 13 de otros módulos que cierran órdenes, en una base desde cero.
- `tsc`, las reglas de la orden y las guardas de pantalla (guías, guía de foco, `unificar`, tema, `sugerir`, módulos): 478 en verde.
- **Sin probar en el navegador:** el permiso de líder, la tela del corte de afuera y «Encontré tela», también a 375 px. La sesión que lo terminó corrió en un contenedor sin base local; queda para la actividad 10 junto con `/chaos`.

## Consecuencias

- La ruta pasa de `RutaDeFases.tsx` a `RutaViva.tsx`, que también arma las dos columnas. La página le pasa la tela y el costo (`izquierda`) y la ficha y la historia (`derecha`).
- Las anclas de la guía interactiva viven en un solo botón cada una. La huella de `produccion.ordenes.numero` se aceptó tras revisar la guía (144 controles).
- **Pendiente fuera de esta actividad:** las cifras de la cabecera (`ResumenSede`, «S/ 0.00 de S/ …») se salen del ancho a 1024 px con el lateral abierto. No viene de este cambio.
- «Deshacer» ya no está en la historia: lo reemplaza el lápiz, que corrige o elimina cualquier anotación con su porqué. Sigue en el aviso de éxito, para el error de recién. `DeshacerAvanceModal.tsx` se borró.
- `fn_orden_produccion` devuelve dos claves más, `cambios` y `deshechos`. La huella de la guía se aceptó tras ponerla al día (168 controles).
- **No se corrió todavía:** `tema:auditar`, `guias:recorrer`, `/chaos` y `/formidable`. Quedan para la actividad 10.
