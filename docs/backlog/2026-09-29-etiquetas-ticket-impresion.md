## 🏷️ Íconos de las etiquetas comerciales en el papel de la etiqueta de precio (2026-09-29, ADR-0180 «Actualización (b)») — solo web, sin migración; rama `claude/etiquetas-ticket-impresion-be4b2c`

**Estado:** hecho en la rama; pruebas y tipos en verde; **falta imprimir en la Brother real**.

- [x] `iconosDelPapel` / `iconosPorVariante` (reglas puras, 18 pruebas): hasta 2 íconos; ganadora primero; próximas al final; terminadas fuera; misma familia = un lugar.
- [x] `IconoEtiquetaPapel.tsx`: los 21 íconos en negro puro, trazo ≥ 0,20 mm, 3,4 mm de lado.
- [x] `lib/etiquetas-precio.ts` lee las etiquetas de cada prenda (a mano + por categoría) y `EtiquetaPrecio.tsx` las dibuja en una fila «ícono + palabra» bajo el color, todas iguales (propuesta A, ADR-0180 (c)).
- [x] Dos etiquetas que no caben juntas van una debajo de la otra, también con campaña (la fecha pasó junto al precio tachado).
- [ ] **Imprimir en la Brother con una prenda de 2 etiquetas** (sin campaña) y otra CON campaña y 2 etiquetas, y mirar que el ícono de 3,4 mm salga nítido y
      que el bloque de precio con la fila en 2 líneas no se vea apretado (queda ~1 mm de aire).
- [ ] **Confirmar la frase de validez:** pasó de «Precio válido hasta el 30.10» (bajo una raya) a «Válido hasta el 30.10» junto al precio tachado.
- [ ] **Mirar el bloque «−30 %» con precio de lista de 4 cifras** (S/ 1,199.90 → 839.90): llega al borde. Ya pasaba antes de este cambio; `.etq-precio-largo` solo mira el largo del precio cobrado.
- [ ] Decidir si la pantalla de etiquetas (la tabla) debe decir qué etiquetas lleva cada fila, con la explicación de `lib/etiqueta-ayuda.ts` (hoy solo se ve en la vista previa).
