## 🏷️ Recibir: imprimir la tanda sin salir del conteo (2026-11-14, tarea 6 de «Treinta tareas de Recibir», ADR-0180 act.) — rama `claude/recibir-imprimir-tanda-594af7`, sin migración

Medido en producción (reunión del 2026-11-13): 14 min por modelo nuevo y 9 por reposición. Trujillo lleva cada modelo al stock apenas lo reparte, así que
imprimir se repetía por modelo: 4 o 5 toques y 2 cargas de pantalla cada vez.

- [x] **La hoja «ya están en el stock» imprime ahí mismo** (`SalidaHecha`): pide las etiquetas al abrirse (`GET /api/etiquetas-de-precio/tanda`, la misma
      lectura de la pantalla de Etiquetas), un toque las manda a la Brother y la hoja se cierra. Meta cumplida: 2 toques por modelo («Llevar al stock» e «Imprimir»).
- [x] **El rollo en el orden de las pilas, en todas partes** (Felipe: «que aplique para todo»): categoría → modelo → color → talla. La lista de la hoja
      «Llevar al stock» ordena sus colores igual, para leerse como el rollo.
- [x] Imprimir sigue siendo un clic de la persona (ADR-0180): al abrirse la hoja las etiquetas solo se preparan.
- [x] Si no se sabe si salieron (diálogo del navegador), el aviso ofrece «Imprimir de nuevo»; si el ayudante de la Mac falla, la hoja queda para reintentar.
- [x] Guía interactiva de Recibir al día (el paso «Sale ya, sin cerrar el envío» lo cuenta) y su huella aceptada; auditoría «Al milímetro» sin graves.
- [ ] **Probar con papel de verdad** en la Brother de una tienda (Mac con ayudante y un Windows): aquí el ayudante y el diálogo se simularon para no gastar etiquetas.
- [ ] **Decisión de Felipe, aparte:** ¿el envío recuerda qué tandas faltan imprimir? Hoy no: si se cierra la hoja sin imprimir, las etiquetas salen desde
      Etiquetas (Existencias ▸ marcar ▸ Etiquetas) o al cerrar el envío. Guardarlo es un dato nuevo en la base.
- [ ] Visto de paso: la hoja dice «1 de X ya **están** en el stock» también con una sola prenda (texto de antes de este cambio).
- [ ] Visto de paso: cuando el aviso de error de la hoja se va tras «Reintentar», los botones suben ~30 px (la hoja se centra): un segundo clic rápido puede caer en «Bajar al piso».

### «Llevar e imprimir» y las propuestas de `/innovar` (2026-11-14, tarde)

- [x] **tanda#1 · «Llevar e imprimir», un solo toque** (elegida por Felipe): la hoja de llevar al stock lleva y manda las etiquetas con un botón; «Solo llevar» al lado. De 2 toques por modelo a 1.
- [ ] **tanda#2 · Reimprimir una tanda desde «Ya en stock»** (propuesta, S): un enlace «Etiquetas» junto a «Corregir» en la lista del envío.
- [ ] **tanda#3 · El envío sabe qué falta etiquetar** (propuesta, M, pide migración): es la decisión que Felipe dejó aparte.
- [ ] **tanda#4 a #6** (visión): cola de impresión de la sede, la etiqueta sale al contar, el navegador directo a la Brother. Detalle en `docs/innovacion/2026-11-14-recibir-imprimir-tanda.md`.
- [ ] Sin probar: el costo fuera de lo normal seguido de «Solo llevar» (la intención viaja en una ref; se probó solo «Llevar e imprimir» sin ese aviso y el aviso con el botón de antes).
- [ ] Visto de paso: el dial de «¿Cuántas llegaron?» da un aviso de hidratación en desarrollo (los decimales de sus rayas difieren entre el servidor y el navegador). Ya estaba; no es de este cambio.

