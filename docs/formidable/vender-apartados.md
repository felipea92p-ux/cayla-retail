# Formidable · Ventas ▸ Apartados, el módulo entero   (`/vender/apartados`: Apartar, Entregar, Historial y sus hojas)

- **Fecha / SHA:** 2026-11-26 · 5192595cb · **Dispositivo que manda:** escritorio (Mac mini); 375 px obligatorio (PL-105)
- **Pregunta que debería resolver:** «¿Qué le guardo a quién, cuánto dejó, cuánto le falta, hasta cuándo, y qué me toca hacer hoy?» · **Protagonista:** el cliente y su dinero
- **Veredicto en una línea:** «Se puede usar sin manual (las tres ciegas terminaron su tarea), pero las tres tuvieron que bajar la página para encontrar el botón principal, y lo urgente del día está guardado dentro de "Historial". Dos leyes en 4.»
- **Maqueta navegable del nuevo diseño:** `docs/maquetas/apartados-claro-2026-11/index.html` (interruptor Hoy / Propuesta en cada pantalla). **Nada del ERP cambió: espera tu OK.**
- El informe anterior, solo de la hoja del detalle: `vender-apartados-detalle.md` (2026-10-15).

## Notas (0–10)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 6 | [Observado] 3 ciegas (Sonnet, datos inventados): 3 de 3 terminaron al primer intento; 3 de 3 bajaron la página para encontrar el botón principal; 19 dudas en total · real: sin probar |
| 2 Una pregunta, una respuesta | 5 | [Medido] «Confirmar apartado» en y = 1031 y «Entregar y cobrar» en y = 918, con pantalla de 900. Historial mezcla cifras, avisos, pedidos entre tiendas, filtros y lista. «Apartado registrado» tiene 3 salidas |
| 3 Simplicidad profunda | 6 | [Observado] Los estados son veredictos claros («Vence hoy», «Vencido · decide en 2 días»). [Medido] Tres números distintos para «a cuántos escribir» (2, 3 y 4); la ciega tuvo que elegir |
| 4 Lenguaje de tienda | 5 | [Medido] Lo que falta pagar tiene 6 nombres y lo pagado 4. [Observado] «Precio congelado», «Si no recoge», «En custodia», «correlativo», «se liberó solo»: cinco palabras que las ciegas adivinaron. Cuatro textos en femenino |
| 5 Contenido primero | 5 | [Medido] En Historial la primera fila está en y ≈ 860–887 de 900. Apartar y Entregar sí ponen la prenda y el cliente adelante |
| 6 Lo difícil, a un toque | 6 | [Observado] Los «?» existen y funcionan; pero las condiciones que hay que LEERLE al cliente quedaron detrás de uno: la ciega marcó «Le leí las condiciones» sin leer nada |
| 7 Perdonar antes que preguntar | 7 | [Opinión] Se confirma solo lo que no se deshace (liberar, devolver). Sin evidencia nueva |
| 8 Quitar antes de agregar | 4 | [Medido] Entregar: 75 palabras de explicación a la vista y la cuenta dicha dos veces. Editar prendas: una frase de 42 palabras. La misma prenda, en 3 lugares de Apartar |
| 9 De punta a punta | 4 | [Medido] Botón bajo el borde en Abonar (a 1440 × 900), y en el detalle, Devolver y Editar a 768 px de alto. A 375 px la fila de Entregar parte el nombre en 3 líneas y el nombre tocable del Historial mide 24 px |
| **Leyes (promedio)** | **5,3** | leyes 8 y 9 en 4 |
| **Oficio visual** | **5** | [Medido, 9 estados × 4 anchos] Pasan contraste (0 fallas en todo), texto mínimo de la interfaz y espaciado. Fallan: alineación (4 a 16 bordes «casi» alineados; columnas del Historial distintas por fila), alturas desiguales en una fila, rojo sobre el tope (10 en Historial), y blancos bajo 44 px a 375 |

## Los 3 cambios de mayor impacto
1. **El botón principal, siempre a la vista.** Antes: en Apartar ▸ cobro y en Entregar el panel crece y empuja «Confirmar» / «Entregar y cobrar» bajo la pantalla; en las hojas Abonar, Devolver y Editar el pie no está pegado, y en el detalle la clase está puesta pero no pega. Después: el panel se queda quieto y su pie (responsable + botón) no se mueve; el pie de cada hoja va pegado. **Leyes 2 y 9.** Verifica: a 1440 × 900 y a 1366 × 768 el botón está dentro de la pantalla sin bajar (en la maqueta: 811 y 771 px). Esfuerzo **S–M**. Presentación.
2. **«Pendientes» tiene su pestaña y el Historial muestra la lista.** Antes: devolver adelantos, vencidos por decidir, a quién escribir y los pedidos entre tiendas viven dentro de «Historial», bajo cifras y filtros; la lista empieza en y ≈ 860. Después: Apartar · Entregar · **Pendientes (4)** · Historial. Pendientes agrupa por lo que hay que hacer («Devuelve el adelanto», «Vencidos: decide hoy», «Vencen hoy o mañana: escríbeles»); Historial queda con 3 cifras de una línea, una fila de filtros y una tabla con columnas iguales y títulos. **Leyes 5, 2 y 3.** Verifica: primera fila del Historial sobre y = 500; la ciega encuentra «a quién devolver» sin leer un aviso. Esfuerzo **M**. Presentación. *El nombre «Historial» lo pediste tú (ADR-0367, 2026-10-09): se conserva; lo que cambia es que el trabajo del día sale de ahí.*
3. **Una palabra para cada cosa, y lo que se le lee al cliente a la vista.** «Le falta» en vez de seis nombres; «Cancelar apartado» en vez de «Liberar» (es la palabra del mensaje que se le manda al cliente); «Seguir: datos del cliente» en el botón que hoy dice «Apartar» y no aparta; «Se le guarda hasta» en vez de «Precio congelado»; «Si no viene · Le devolvemos su adelanto por»; y las condiciones en dos líneas sobre la casilla. **Leyes 4, 1 y 6.** Verifica: repetir las tres ciegas y contar dudas. Esfuerzo **S**. Presentación. *Las condiciones tras el «?» las elegiste tú el 2026-11-16 para compactar: esto lo reabre con la evidencia de la ciega.*

## Lo que sobra (ley 8)
- La segunda cuenta del panel «Saldo» de Entregar (Total / Ya pagó / Saldo): repite la de arriba.
- «Stock: 4» en cada línea de Apartar: ya dice «Quedan 3…».
- «La venta de S/ … entra hoy a ingresos y sale de "En custodia"» en «Apartado entregado»: contabilidad.
- «…no se gasta ningún correlativo» en Devolver.
- La tarjeta «Vencen en 2 días» (cuenta también hoy y mañana: el nombre es impreciso) y el párrafo rojo de «se liberó solo» en Apartar y Entregar.

## Lo que no pediste y importa más
**A 375 px, que en Apartados es obligatorio, la lista de Entregar se rompe**: el estado no se parte y aprieta el nombre a 3 líneas y el código a otras 3 («APT– / TRU– / 0038»). Es la pantalla con la que se busca al cliente que vino a recoger. La maqueta no lo cubre (es de escritorio).

## Lista aparte (no se ejecuta)
- Línea de tiempo de Entregar: «Hoy» está fijo al centro (`EntregarVista.tsx:499`); el día que vence, miente. (La maqueta lo corrige.)
- «Recordar en lote» no tiene salida a la vista: solo «Saltar» y Escape.
- «Liberar» pesa distinto: peligro en Entregar, secundario en la fila del Historial.
- Tres verbos para salir de una hoja («Mejor no», «Cancelar», «Ahora no»): ya está abierto en `docs/backlog/2026-10-13-mystifying-jang-ef15d0.md`.
- Al elegir Efectivo queda marcado «Mitad» sin que nadie lo eligiera (lo vio la ciega; no se verificó en el código).
- La búsqueda de cliente, cuando falla, muestra el código técnico del error al final del aviso.
- Textos en femenino: «Esperarla» (Abonar), «La clienta lo recoge en la tienda» (detalle), «una tras otra» (lote), «la líder».
- En Apartar la misma prenda se ve en el ticket, en «Recién escaneada» y en «Escaneadas hace poco»; y hay dos entradas al descuento. Es herencia del Punto de venta: se decide con Vender, no aquí.
- «Opciones» pide «¿Quién está atendiendo?» para guardar una configuración: es efecto de «el combo en todo» (ADR-0161); la pregunta no calza con una configuración.
- La cabecera, con cuenta de líder y a 1440 px, baja las pestañas a una segunda fila en Apartar.

## Hallazgos y veredicto del escéptico
| # | Hallazgo | Veredicto |
|---|---|---|
| H1 | Botón principal fuera de la vista | CONFIRMADO (en Apartar, solo con el paso «Cliente» abierto; el detalle tiene `pie-hoja-fijo` pero no pega) |
| H2 | La lista del Historial empieza en y ≈ 860 | CONFIRMADO (es el peor caso: todo encendido; cifras y filtros no se esconden nunca) |
| H3 | «Historial» guarda el trabajo del día | MATIZADO (el nombre es decisión de Felipe; pidió ver el historial y reimprimir, no mover ahí lo pendiente) |
| H4 | Aviso rojo en las tres pestañas | MATIZADO (va en su placa, no suelto, y solo dura una carga; no usa `<Aviso>`) |
| H5 | Varias cuentas de «lo urgente» | MATIZADO (son coherentes por definición; la que de verdad difiere es la franja) |
| H6 | Columnas que no alinean | CONFIRMADO, más fuerte (cada fila es su propia grilla; tampoco alinean dentro del grupo) |
| H7 | Demasiado texto a la vista | CONFIRMADO |
| H8 | Jerga | MATIZADO («En custodia» y «Liberar» se explican al lado; «correlativo», «Precio congelado» y «Resta» no) |
| H9 | Cancelar con varios nombres | MATIZADO (son 3; «Saltar» no cancela) |
| H10 | La misma prenda en 3 lugares | MATIZADO (herencia deliberada de Vender en parte) |
| H11 | Condiciones tras un «?» | MATIZADO (el área del «?» es de 32 px; lo discutible es esconder lo que hay que leer) |
| H12 | «Con la prenda en la mano» bajo el pliegue | MATIZADO (los botones sí quedan a la vista; la lista, no) |
| H13 | La cuenta dos veces en Entregar | CONFIRMADO |
| H14 | «Hoy» mal ubicado en la línea de tiempo | CONFIRMADO |
| H15 | 375 px: fila partida y blancos de 24 px | CONFIRMADO (toda la fila abre el detalle) |
| H16 | Opciones pide responsable | MATIZADO (deliberado: ADR-0161) |
| H17 | Textos en femenino | CONFIRMADO, y encontró tres más |
| X1 | (del escéptico) El saldo tiene seis nombres | entra al cambio 3 |

## Prueba ciega (3 agentes, una tarea cada uno, 1440 × 813 útiles, clics por coordenadas sobre la imagen)
| Medida | Apartar | Entregar | Devolver un adelanto |
|---|---|---|---|
| Lectura de 5 s | Pasa | Pasa | Pasa (la guió el aviso rojo: «ver Historial») |
| Primer intento | Sí | Sí | Sí |
| Bajó la página para encontrar el botón | Sí (2 veces) | Sí | Sí (página y hoja) |
| Dudas | 9 | 6 | 4 |
| Palabras adivinadas | «Precio congelado», «Si no recoge», «Resta» | «En custodia», «Liquidado», «Otro cliente» | «Se liberó solo», «correlativo», «En custodia» |
| Errores evitables | 1 (tocó «Apartar S/…» esperando que guardara) | 0 | 0 |

Palabra textual: «Dudé si el botón "APARTAR S/89.90" guardaba ya o seguía a otro paso» · «"Le leí las condiciones": no sabía quién las lee ni dónde están» · «Los números no cuadran entre sí… no supe qué creer» (sobre «adelanto de S/89.90 · saldo S/59.90») · «"OTRO CLIENTE"… no supe si era una advertencia o una etiqueta» · «Había dos cifras posibles para "a cuántos escribirles"».

**Límite de la prueba:** la página de prueba no cambia sus datos al guardar, así que dos ciegas no pudieron confirmar que «quedó» (el apartado seguía en la lista). Eso es del entorno, no del ERP, y no se contó.

## Antes de decir «listo»
- **Concurrencia:** sin probar en esta pasada (es una revisión de comprensión; el informe del detalle ya la cubrió para abonar y aplazar).
- **Caída externa:** [Observado] sin base, el combo dice «No se pudo leer quién está de turno · Actualizar lista» y no deja confirmar; la búsqueda de cliente avisa y deja seguir a mano, pero muestra el código técnico.
- **Persona sin contexto:** tres ciegas; colaboradora real, sin probar.

## Historial
| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-11-26 | 5192595cb | 5,3 | 5 | — (maqueta entregada; espera el OK) |
