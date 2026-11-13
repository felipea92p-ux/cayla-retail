## Recibir mercadería más rápido: 30 tareas (2026-11-13) — rama `claude/merchandise-receipt-diagram-398372`

Sale de la reunión del 13-nov (Felipe, Diego y Daniel), de siete lectores del código y de medir producción en solo lectura. Tablero con el detalle de cada tarea, el recorrido y el avance: https://claude.ai/artifact/F66WjT6nf3heh5N47J2m16 (privado; la fuente no está en el repo).

**Lo medido (22 envíos, del 30-oct al 13-nov; 10 cerrados de Trujillo = 649 prendas, 78 modelos):** 14 min de mediana por modelo nuevo y 9 por reposición, sin contar la foto; 4,6 colores por 1,4 tallas por modelo; 32 de 40 modelos nuevos recibieron la foto 45 min después, en Productos; 8 de 13 envíos cerrados entraron sin aviso; 2 diferencias en total; 175 prendas contadas en Arequipa sin poder venderse (33 pendientes desde el 11-nov).

Nada de esto está construido: es la lista. Los ahorros son estimados leyendo el código, no medidos. Cuatro revisores contrastaron las 30 con el código y se corrigieron 20 puntos.

### Ola 1 · Rápidas

- [ ] **1. Medir el ritmo: minutos por modelo, a la vista en cada envío.** No ahorra por sí sola: es la regla con la que se comprueba cada una de las otras 29.
- [x] **2. Un check «Llegaron las N» en cada fila de la lista.** De 2 toques y cruzar la pantalla a 1 toque por modelo que cuadra: de 26 a 13 en un envío de 13 modelos. — Hecho en la rama (sin commit): un ✓ en cada fila anotada y sin contar llama a `ponerDeUnToque` (`CategoriasAcordeon.tsx`, `ContarEnvio.tsx`), con su paso en la guía y la huella aceptada. Sin probar en el navegador: la base local no tiene envíos. Desde cero no hay aviso con «Deshacer» (la misma regla de «Llegaron las N» del contador): un toque equivocado se corrige eligiendo el modelo. Toca `app/estilos/vidrio/recibir-mesa.css`, que mira Dynamic: queda como tarea allá.
- [ ] **3. Pegar y arrastrar la foto sobre la casilla del color.** Unos 4 toques menos por foto y cero búsqueda en carpetas.
- [ ] **4. Sin clics de más al empezar: el número llega listo y «quién recibe» se recuerda.** 1 clic menos por modelo sin aviso, y 2 toques y una hoja menos por envío en las terminales.
- [ ] **5. Teclado de planilla en la tabla de tallas y colores.** La tabla se llena con una mano en el teclado numérico: cifra y Enter.
- [ ] **6. Imprimir la tanda sin salir del conteo, en el orden de las pilas.** De 4 o 5 toques y 2 cargas de pantalla por modelo a 1 o 2 toques: unas 36 pulsaciones menos en 12 modelos.
- [ ] **7. «Igual que la anterior» al crear la siguiente prenda del envío.** De 4 a 7 toques repetidos a 1 por modelo nuevo: unos 40 menos en un envío de 13.
- [ ] **8. El margen a la vista, en soles y en porcentaje.** No quita toques: quita la cuenta mental al poner el precio.
- [ ] **9. Una galería de fotos grandes para reconocer la prenda que ya existe.** Asociar una prenda pasa de unos 8 toques a 4 cuando hay que mirar varias candidatas.
- [ ] **10. Filtro y frase «Faltan tallas» para la segunda pasada.** La segunda pasada deja de ser abrir cada categoría buscando chips: 1 toque por modelo pendiente.
- [ ] **11. El envío cerrado dice qué sigue con las manos.** Se entiende de un vistazo qué sigue: 10 a 20 segundos por envío, y el rótulo de anaquel a 1 toque. *(decide Felipe)*
- [ ] **12. Contar cómodo a cualquier ancho: más modelos a la vista y nada que obligue a bajar.** Menos subir y bajar: hoy se ven 3 o 4 modelos a la vez a 1440 × 900.

### Ola 2 · Cambian el recorrido

- [ ] **13. Las fotos del envío en una sola pasada, sin salir de Recibir.** Quita unos 6 toques de navegación por prenda y volver a sacar del anaquel lo ya guardado. *(decide Felipe)*
- [ ] **14. Contar directo por color y talla: la suma pone el número.** Un conteo físico completo menos por cada modelo sin cantidad anunciada. *(decide Felipe)*
- [ ] **15. Una hoja borrador para lo que llega sin aviso.** De unos 50 toques y 10 hojas a 10 filas en un envío de 10 modelos. *(decide Felipe)*
- [ ] **16. Cuentagotas: tocar la tela en la foto y elegir entre 3 colores.** Por color, de buscar a ojo entre más de cien círculos a 1 toque en la foto y 1 entre 3.
- [ ] **17. Encender «Catálogo con IA» y usarlo en la pasada de fotos.** De 1 a 1,5 minutos de ChatGPT por foto, con la persona esperando, a 25 a 29 segundos sin atenderla. *(decide Felipe)*
- [ ] **18. «Llevar al stock» llega resuelta: costo de la última vez y solo lo que cambia.** Un campo menos por modelo y cero llamadas para preguntar el costo. *(decide Felipe)*
- [ ] **19. Una sola pregunta de «¿ya existe?» por prenda.** 1 hoja y 1 o 2 toques menos por prenda nueva: 6 o 7 hojas menos en un envío de 13 modelos. *(decide Felipe)*
- [ ] **20. Crear una prenda a partir de una parecida.** De 6 a 8 toques menos por cada prenda que es casi otra. *(decide Felipe)*
- [ ] **21. El detalle va después de la foto y lo propone la IA.** De escribir 20 a 40 letras a 1 toque por prenda. *(decide Felipe)*
- [ ] **22. Una cola «Crear la siguiente» para lo que quedó pendiente.** Sin volver a la lista entre una prenda y otra: 2 toques y una carga menos por pendiente.
- [ ] **23. Contar por bolsa: la lista por proveedor y «llegó todo» del bloque.** De 2 toques por modelo a 1 por bolsa: de unos 25 a 4 en un envío de 13 modelos y 4 proveedores. *(decide Felipe)*
- [ ] **24. La carta de colores ayuda a decidir: nombres a la vista y una regla para los gemelos.** De señalar círculo por círculo a leer y tocar: de 15 a 40 segundos a 5 a 10 por color. *(decide Felipe)*
- [ ] **25. El papel de la compra, a mano: junto al modelo y también sin aviso.** De 3 toques a 1 para ver la boleta de un modelo, y la nota de la bolsa deja de perderse. *(decide Felipe)*

### Ola 3 · Fuera de la pantalla y de fondo

- [ ] **26. La bolsa dice de quién es: código con plumón y la nota adentro.** Ataca lo más lento según la reunión: de vaciar el fardo y descartar a leer un código. *(decide Felipe)*
- [ ] **27. Un rincón de fotos en cada almacén: parante, ganchos, fondo y luz fija.** Menos fotos repetidas y un cuentagotas que acierta más. *(decide Felipe)*
- [ ] **28. Llegó antes que su envío de Compras: seguir sin esperar.** Quita la espera a que quien compró apriete «Mandar a la tienda»: el fardo deja de quedar parado. *(decide Felipe)*
- [ ] **29. Dos personas a la vez y mala señal: que nadie pise a nadie.** Evita recontar por desconfianza y deja repartir el fardo entre dos aparatos. *(decide Felipe)*
- [ ] **30. Insignias y campaña al recibir, antes de imprimir la etiqueta.** Evita volver a Catálogo ▸ Insignias y reimprimir la etiqueta de cada modelo que entra a una campaña. *(decide Felipe)*

### Decisiones de Felipe que frenan tareas

- [ ] **¿Quién puede subir fotos desde Recibir?** Recomendación: Que quien recibe pueda subir la foto de lo que recibe, con una función firmada por el responsable, como ya pasa con la foto del papel. Frena: tareas 13, 16, 17 y 21.
- [ ] **¿Se puede contar directo por color y talla?** Recomendación: Sí, como segundo camino y solo cuando no hay cantidad anunciada. Frena: tareas 14 y 15.
- [ ] **¿Se permite marcar un bloque entero como llegado?** Recomendación: Por fila sí, ya. Por bloque solo dentro de un proveedor y con «Deshacer». Nunca el envío entero. Frena: tarea 23.
- [ ] **¿El costo de la última vez entra puesto cuando llega sin aviso?** Recomendación: Sí, igual que «Hacer ahora», y que la pantalla lo diga. El aviso de costo fuera de lo normal ya cubre el error grande. Frena: tarea 18.
- [ ] **¿Se enciende «Catálogo con IA», y con qué tope?** Recomendación: Sí, con un tope de US$ 60 al mes y apagado por aparato, como está. Frena: tareas 17 y 21.
- [ ] **¿Qué pasa cuando dos personas guardan el mismo conteo?** Recomendación: Releer al volver ahora, porque es solo pantalla. Que la base rechace lo viejo, cuando se toque la base. Frena: tareas 29 y 14.
- [ ] **¿Qué diferencia hace que una prenda sea otro producto?** Recomendación: Otro producto si cambia lo que el cliente ve o paga. Otro proveedor solo, no. Frena: tarea 20.
- [ ] **¿Quien solo ve Recibir puede poner insignias y campañas?** Recomendación: Insignias, sí. La campaña, solo quien ya ve su módulo. Frena: tarea 30.
- [ ] **¿Cómo se logra que el fardo llegue avisado?** Recomendación: El primero: que avisar cueste una foto de la nota y la cantidad, con el costo para después. Recepción no reemplaza a Compras. Frena: las tareas 14, 15, 18, 25 y 28 solo acomodan Recibir al sin aviso.
- [ ] **¿El sistema anota dónde quedó cada modelo?** Recomendación: Una nota corta por modelo, como «Anaquel 3, arriba», que se ve al buscar la prenda. No un modelo de anaqueles. Frena: la segunda parte de la tarea 11.
