# 2026-11-07 · Insumos: los lotes caben en el celular

- **Qué:** en Producción ▸ Insumos, al abrir una tela, cada lote era una fila de cinco columnas (código · detalle · cantidad · costo · lápiz).
  A 375 px no cabía: el detalle quedaba en 0 px y el lápiz «Corregir este ingreso» salía de la pantalla (x = 394–438), sin poder tocarlo.
- **Cómo:** bajo 640 px la misma fila se arma en tres renglones con áreas de grid: código, cantidad y lápiz / el detalle a todo el ancho /
  el costo con «1º». Desde `sm` no cambia nada (`components/InsumosPanel.tsx`).
- **Verificado:** en local con la cuenta del Taller, a 375 px (ningún control fuera de la pantalla, la fila mide 120 px) y a 1440 px (igual que antes).
