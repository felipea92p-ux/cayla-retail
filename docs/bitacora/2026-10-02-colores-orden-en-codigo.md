## 2026-10-02 (El orden de los colores deja de leerse de la base)
**Qué hice:**
- Vender (la lista de Color de «Prenda sin registrar»), Conteo (alta al vuelo), Nuevo producto y Editar producto ordenan los
  colores en código con la carta (`enLaCarta`, ADR-0312), no con la columna `colores.orden`.
- Atributos ▸ Colores ya ordenaba así; dejó de pedirle el orden a la base.
- Una prueba nueva (`lib/colores-sin-orden.test.ts`) falla si alguna pantalla vuelve a pedir colores por `orden`.

**Por qué así:** un color creado desde Atributos entra con `orden = 2000`; en una lista que se ordenaba por esa columna quedaba al
final aunque fuera un rosado. Ahora cae en su lugar por su tono, sin que nadie lo numere. Se encontraron dos pantallas más que el
encargo no listaba (Editar producto y Atributos).

**Felipe se lleva:** un color nuevo aparece junto a sus parecidos en todas las pantallas, no al final de unas pocas.
