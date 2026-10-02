# 2026-10-02 · Se retira «¿Se la probó y no la llevó?» del ticket

- Al quitar una prenda del ticket ya no aparece la pregunta; queda solo «¿Qué talla pidió?» en el modal de talla (`AnotarNoHabia`).
- Se borró `SeProboNoLlevo.tsx`; la base, `se-probo-reglas.ts` y las filas ya guardadas no cambian (sin migración). ADR-0288, act. (m).
- Pendiente: si Compras quiere las razones precio/color/no le quedó, decidir otra puerta para anotarlas.
