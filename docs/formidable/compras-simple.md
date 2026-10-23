# Formidable · Compras simple ▸ Mi plata para compras, Compré ropa y Revisar compras   (`/compras/mi-plata`, `/compras/mi-plata/compra`, `/compras/fondos`)

- **Fecha / SHA:** 2026-10-23 · rama `claude/modulo-compras-66e94a` (actividad 8 de ADR-0480) · **Dispositivo que manda:** 375 px (la compradora, en la calle) para
  Mi plata y Compré ropa; escritorio para Revisar compras.
- **Pregunta que debería resolver:** «¿Cuánta plata de compras tengo y qué anoto ahora?» (la compradora) · «¿Qué compras ya puedo pasar a los libros?» (Compras).
  **Protagonista:** el dinero.
- **Veredicto en una línea:** la compradora hace su día entero a la primera (anotar la plata, comprar, mandar) en 22 toques; se traba en palabras de la oficina
  («Por completar», «Revisado») y casi compra 10 en vez de 3 porque la cantidad llega escrita.

## Prueba ciega [Observado]

Un agente (Sonnet) sin el repo, en el navegador a tamaño de celular, con la sesión de una compradora y datos inventados. Tarea en palabras de tienda: «Te dieron S/ 200
en efectivo, anótalo; compraste 3 prendas iguales a S/ 20 sin papel para Trujillo, regístralo; mándalo a la tienda».

| Medida | Resultado |
|---|---|
| Lectura de 5 s | «Es mi saldo de plata de compras; toco el botón que se parece a lo que hice» — coincide |
| Primer intento | sí, las tres partes, sin retroceder |
| Pasos | 22 toques + 1 scroll (anotar 5 · comprar 15 · mandar 2) |
| Dudas | 7 (cuál tocar primero; la cantidad ya escrita; «Igual que la vez pasada» del costo; el precio de venta; cuántos fardos; el saldo; «Nota de venta» o «Sin papel») |
| Palabras no entendidas | «Por completar», «Revisado», «Confirmada», «Completa» (quién los pone y qué falta), «fardo», «Nota de venta» |
| Errores evitables | 2 casi-errores: la cantidad 10 escrita por defecto («con un toque rápido habría comprado 10») y la tarjeta del costo de la vez pasada |
| **Error real** | la pantalla «Listo» dijo «Ahora tienes S/ 340.00» con S/ 400: restaba la compra dos veces. **Arreglado el mismo día** (`RegistrarCompra.tsx`: guarda lo que tenía al guardar) |

Revisar compras no tuvo prueba ciega: **ciega: sin probar** (la usa la oficina de Compras, no alguien nuevo en la calle).

## Notas (0–10) — Mi plata + Compré ropa

| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 8 | [Observado] completó todo a la primera · real: sin probar |
| 2 Una pregunta, una respuesta | 9 | [Observado] «¿Qué hiciste?» con tres respuestas; una pregunta por paso en la compra |
| 3 Simplicidad profunda | 8 | [Observado] el cuaderno del día y «Tienes para comprar» se leyeron sin ayuda |
| 4 Lenguaje de tienda | 6 | [Observado] cuatro estados de oficina sin explicar y «fardo» |
| 5 Contenido primero | 8 | [Medido] la plata arriba en serif; listas de lo hecho debajo |
| 6 Lo difícil, a un toque | 6 | [Opinión] «Por completar» no tiene un «¿qué falta?» a un toque |
| 7 Perdonar antes que preguntar | 6 | [Medido] `RegistrarCompra.tsx:189` llena la cantidad con la de la vez pasada; una compra guardada no se deshace (es dinero: correcto) |
| 8 Quitar antes de agregar | 8 | [Opinión] nada sobra a la vista |
| 9 De punta a punta | 6 → 8 | [Observado] el saldo mal en «Listo» (arreglado); el mensaje del cierre ya recibido seguía diciendo «Compras lo recibe» (arreglado) |
| **Leyes** | **7,2** | |
| **Oficio** | **8** | [Medido] a 511 px: 0 controles bajo 44 px, 0 contrastes bajo 4,5:1, sin desborde; letra de 10,5–11 px solo en piezas del sistema (versalitas, globitos). `tema:auditar` claro y oscuro: 0 hallazgos. Revisar compras a 1440 px: 0 contrastes, lo marcado es del marco del ERP |

## Los 3 cambios de mayor impacto (hechos con el OK de Felipe, 2026-10-23)

1. **La cantidad llega vacía, con «La vez pasada: 10» como sugerencia de un toque** (ley 7, ley 1). Antes: el 10 escrito; «Seguir con 10» a un toque. Después: la caja vacía y
   la sugerencia al lado, como el costo. Ojo: la maqueta aprobada llenaba la cantidad con la de la vez pasada; es una decisión tuya. Se verifica repitiendo la ciega:
   0 casi-errores en la cantidad.
2. **Los estados de la compradora dicen quién y qué** (ley 4, ley 6). Antes: «Por completar», «Completa», «Por revisar», «Revisado», «Por confirmar», «Confirmada».
   Después: «Compras la revisa» / «Ya está en los libros» y «Compras la confirma» / «Confirmada por Compras». Se verifica con la ciega: 0 palabras no entendidas en la lista.
3. **«¿Cuántos paquetes (fardos)?»** y, debajo, «Si todo va junto, es 1» (ley 4). Antes: «¿Cuántos fardos (paquetes)?». Se verifica con la ciega.

**Lo que sobra (ley 8):** nada a la vista. **Lo que Felipe no pidió y importa más:** el saldo de «Listo» estaba mal (ya arreglado): era la cifra que la compradora usa
para decidir si sigue comprando.

## Lista aparte (sin ejecutar)

- El costo «Igual que la vez pasada» como tarjeta grande invita a tocarlo aunque el precio sea otro (duda 3); medir con la colaboradora real antes de cambiarlo.
- «Nota de venta» vs «Sin papel»: una línea de ayuda bajo «Nota de venta» («un papel simple, sin RUC»).
- Revisar compras: falta su prueba ciega.

## Refutados o matizados

- «La lista decía “salió a Trujillo” antes de mandar» (ciega): **NO VERIFICABLE**. El código dice «falta mandar a …» mientras queda algo por mandar
  (`app/(app)/compras/mi-plata/page.tsx:95`); la ciega miró la lista recién después de mandar.

## El después (2026-10-23, con el OK de Felipe)

| Cambio | Antes | Después [Medido / visto a 375 px] |
|---|---|---|
| 1 · La cantidad | el 10 de la vez pasada escrito y «Seguir con 10» a un toque | la caja vacía; arriba, «La vez pasada compraste 10 · Tócalo si compraste lo mismo» (la misma tarjeta del costo); «Seguir» apagado con «Toca la de arriba, o escribe cuántas»; al escribir 3, «Seguir con 3» |
| 2 · Los estados | «Por completar» / «Completa», «Por revisar» / «Revisado», «Por confirmar» / «Confirmada» | «Compras la revisa» / «En los libros», «Compras lo revisa» / «En los libros», «Compras la confirma» / «Confirmada», con el detalle al pasar el mouse (`estadoParaLaCompradora`, `lib/mi-plata-reglas.ts`); caben a 375 px sin desborde |
| 3 · Los paquetes | «¿Cuántos fardos (paquetes)?» | «¿Cuántos paquetes (fardos)?» y «Si todo va junto, es 1»; el aviso y la guía dicen «paquete» |

**Notas provisionales** (sin repetir la ciega): ley 4 de 6 a 8, ley 7 de 6 a 8 → **leyes 7,7**; oficio sin cambio (8). Falta repetir la prueba ciega para
confirmarlas, la ciega de Revisar compras y la pasada con una compradora real.
