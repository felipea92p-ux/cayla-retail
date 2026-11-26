# Formidable — Compras reestructurado: Compradores, el detalle de una persona y Todas las compras (PR #2030, ADR-0704) · 2026-11-26

**Dispositivo que manda:** escritorio (oficina de Compras, Mac mini con mouse); 375 px se adapta.
**Medido** en un banco Supabase propio con datos inventados (4 compradores: una ronda que no cuadra, una sin plata registrada, una olvidada de 34 días,
una cerrada; 6 compras con envío; 2 comprobantes de oficina), a 1440 · 1024 · 375 px. **Prueba ciega:** 1 agente (Opus) sin contexto, sobre 5 capturas
a 1440 px y 4 tareas de tienda. Sin escéptico ni colaboradora real.

## Lo que hizo la ciega (Observado)
- **A · quién compra y quién gastó más:** lo encontró (un poco de duda). «No cuadra» le sirvió para dos problemas distintos (Rosa gastó de más; Ana no tiene plata registrada).
- **B · cuánto se gastó este mes:** **mucho dudó.** Compradores dice «Gastado en noviembre S/ 3,170» (solo lo de las personas) y Todas las compras dice
  «S/ 49,999.20» (con la oficina). Nada dice que son cosas distintas.
- **C · qué falta revisar de Rosa:** lo encontró, pero el mismo trabajo se llama «Por revisar» (título y cifra), «Por completar» (lista) y «Falta pasar su papel
  a los libros» (portada). Tres cifras de la bandeja en cero (Plata, Gastos, Rondas) no le sirvieron.
- **D · Pedro:** entendió el aviso, pero «Ciérrala» no dice qué se cierra.
- **En 5 s, Compradores:** «quién tiene plata de la empresa, cuánto gastó y si le cuadra… pero lo primero que se ve son prendas sin categoría» (el bloque «Por definir»).

## Notas (0–10)
| Ley | Nota | Por qué |
|---|---|---|
| 1 Sin manual | 7 | A y D sin ayuda; B dio la cifra equivocada |
| 2 Una pregunta | 6 | En Compradores, «Por definir» ocupa la primera vista antes que las personas |
| 3 Simplicidad profunda | 8 | El aviso traduce la cuenta a una frase |
| 4 Lenguaje de tienda | 6 | «Por revisar / Por completar / pasar su papel a los libros» para lo mismo; «Ciérrala»; «Oficina» |
| 5 Contenido primero | 7 | Las personas pesan, pero tarde |
| 6 Lo difícil a un toque | 8 | El porqué de las cifras va en el «?» |
| 7 Perdonar | 8 | Cerrar una ronda vacía se puede reabrir desde Mis compras |
| 8 Quitar antes de agregar | 6 | Tres cifras en cero en la bandeja de una persona; su nombre repetido en cada fila |
| 9 De punta a punta | 7 | Vacíos y errores cuidados; un id inexistente decía «Sin no compró…» |
| **Leyes** | **7,0** | |
| **Oficio** (medido) | **8** | 0 graves en `/milimetro`; lo que marca está en el marco o en piezas comunes |

## Los 3 cambios de mayor impacto (esperan el OK de Felipe)
1. **Las personas primero** (leyes 2 y 5). Compradores: «Por definir» baja debajo de las tarjetas de quien compra (sigue igual, solo cambia de lugar).
   Se verifica: la primera vista a 1440 px muestra las tarjetas.
2. **Una sola palabra para revisar, y sin ceros** (leyes 4 y 8). «Por revisar» en todo Compradores (la portada dice «Falta revisar su papel»; la lista del
   detalle, «Por revisar»); en el detalle de una persona la bandeja solo muestra las cifras que no están en cero y sus filas no repiten el nombre.
   Se verifica: la ciega encuentra y nombra lo pendiente sin dudar.
3. **Que cada cifra diga de qué es** (leyes 1 y 4). «Gastado en noviembre» → «Gastaron los compradores» (con «sin la oficina» debajo); «No cuadra» solo cuando
   se pagó más de lo entregado, y «Sin plata registrada» cuando no se le dio nada; «Ciérrala desde su detalle» → «Cierra su ronda desde su detalle»;
   «Oficina» → «La oficina». Se verifica: la ciega da la cifra correcta en B.

**Lo que sobra (ley 8):** las tres cifras en cero de la bandeja de una persona; la lista de proveedores dentro de cada tarjeta podría bajar a una sola línea.
**Lo que Felipe no pidió y importa más:** la portada mezcla dos trabajos (quién compra y qué prenda definir); si «Por definir» crece, merece su propio lugar.
