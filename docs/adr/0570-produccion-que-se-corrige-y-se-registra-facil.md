# ADR-0570: Producción que se corrige y se registra fácil (las 34 decisiones del Taller y la «Ruta viva»)

**Estado:** aceptada. La actividad 1 (la «Ruta viva», solo web) está construida y probada en local; las actividades 2 a 10 siguen sin construir, en el orden de abajo.
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

## Consecuencias

- La ruta pasa de `RutaDeFases.tsx` a `RutaViva.tsx`, que también arma las dos columnas. La página le pasa la tela y el costo (`izquierda`) y la ficha y la historia (`derecha`).
- Las anclas de la guía interactiva viven en un solo botón cada una. La huella de `produccion.ordenes.numero` se aceptó tras revisar la guía (144 controles).
- **Pendiente fuera de esta actividad:** las cifras de la cabecera (`ResumenSede`, «S/ 0.00 de S/ …») se salen del ancho a 1024 px con el lateral abierto. No viene de este cambio.
- **No se corrió todavía:** `tema:auditar`, `guias:recorrer`, `/chaos` y `/formidable`. Quedan para la actividad 10.
