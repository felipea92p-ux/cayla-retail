# 2026-11-17 · Precios por tienda, costo del taller e Insumos

Rama `claude/pricing-formula-costs-81abca`. Bitácora: `docs/bitacora/2026-11-17-pricing-formula-costs-81abca.md`.

## Esperan a Felipe

- [x] ~~Aplicar `20261117234000_avios_boton_en_centimetros.sql` en producción~~ — **aplicada el 2026-11-17 con el OK de Felipe** y verificada
  («Botones 0.57 cm · Neutro», «Aguja Clase B» sin medida, 0 fichas en líneas). Falta refrescar el diccionario (`pnpm datos:generar:produccion`).
- [ ] **Medir con regla el botón de 0.57 cm** y corregirlo en «Editar avío» si no es su medida real.
- [ ] **Precios:** cómo se reparten sueldos y local del taller entre las prendas (mes normal, este mes o tarifa), el multiplicador y la línea de
  precio de cada tienda, el papel de la tienda de Lima, el local del taller (Finanzas no tiene su alquiler ni luz) y si el ámbar pasa a «Bajo el
  objetivo». Todo en la maqueta `docs/maquetas/precio-por-tienda-2026-11/` (sin commit: trae cifras reales y el repo es público).

## Pendiente de construir (con OK)

- [ ] La compra de tela con el **total del papel** y el tipo de papel decidiendo el IGV (decidido por Felipe el 2026-11-17); hoy pide el precio por
  metro sin IGV, contra ADR-0668.
- [ ] «¿Cuánto quedó?» del rollo que **no venga escrito con el plan** (hoy lo «medido» es idéntico al plan y la merma nunca se mide), y anotar por
  kilo o por rollo además de por metro.
- [ ] La **hoja de costo de la orden** con sueldos y local del taller (sueldos desde la planilla de Dynamic, que solo trae períodos pagados; la sede
  LIM mezcla taller y tienda Lima y hay que separarla en Dynamic).
- [ ] **Registrar las compras de avíos:** el descuento automático al pasar al stock no descuenta lo que no está en el estante (el hilo no tiene compras).
- [ ] Un aviso al pasar al stock una orden cuya tela **no tiene composición**: la etiqueta de la prenda del taller la necesita (reglamento andino
  de etiquetado de confecciones; falta confirmar si exige porcentajes).

## Nueva orden de producción (pedido de Felipe, 2026-11-17; esperan su elección)

- [ ] **Más grande y espaciosa:** hoy una sola tarjeta junta modelo, matriz de tallas, 5 fases con Taller/Afuera, tela por color, materiales y 6 campos
  opcionales. Propuesta: por pasos o a pantalla completa.
- [ ] **Quitar un color sin querer:** en un modelo nuevo, el «×» es de 24 px junto al nombre y no pregunta (no se pierden los números: al volver a
  agregarlo reaparecen). En un modelo que ya existe no se quitan colores: uno en 0 simplemente no se fabrica. **Felipe (2026-11-17): «que sea doble lo
  de borrar el color»** → quitar un color pide dos toques: el primero convierte el «×» en «¿Quitar Beige?» en su misma fila, el segundo quita; si no
  se toca en unos segundos o se toca otra cosa, vuelve solo. Sin ventana aparte. `QuitarColor` también lo usan apagar una fase y quitar un avío de la
  ficha: decidir si los tres llevan el doble toque o solo el color.
- [ ] **Cuántas van a cada tienda:** hoy «¿A qué tienda va?» es UNA tienda opcional (`producciones.tienda_destino_id`). Felipe quiere repartir por sede
  e identificarlo mejor. Cambia el modelo de datos: espera decisión.
- [ ] **Consumo absurdo sin aviso:** en la base local «Blusa Emma» dice 45 m por prenda y la orden pide 495 m para 10 prendas sin avisar.
- Ya resuelto, sin cambio: una tela parecida para otro color ya se puede elegir (cada color tiene su tela; las del tejido del modelo salen primero y
  las demás bajo «Otras telas»). Los datos de pago de un proveedor del taller ya son opcionales (solo el nombre y qué le vende son obligatorios).
