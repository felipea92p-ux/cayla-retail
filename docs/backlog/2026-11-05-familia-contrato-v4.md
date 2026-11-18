# 2026-11-05 — Lo que deja el contrato v4 en Retail

- **Republicar el artifact «CAYLA Retail»** con `vidrio`, `sombra` y los radios por pieza, y correr `pnpm familia:comparar tokens … --como retail`: hoy fallaría porque el artifact es de la versión 3.
- **El contrato guarda `variantes_retail` y `pendiente: "P10"` en la tarjeta:** ya aplicado, sobra. Se quita en la próxima versión, en los dos repositorios el mismo día; cambiarlo ahora rompería «idéntico».
- **Decisión de Felipe:** las piezas de diseño propio que siguen en 20 o 24 px (`FUERA_DE_P10` en `lib/familia.test.ts`). Si quiere una sola esquina también ahí, es sacarlas de la lista.
- **Dynamic y el vidrio macizo:** `vidrio/aguanta.css` no viaja. Quien pida más contraste en Dynamic verá el vidrio normal hasta que se decida traerlo.
- **El vigilante de Dynamic:** la Action existe, pero al mirar el 2026-11-05 no tenía ninguna corrida. Conviene confirmar que corre: si no, nadie avisa cuando Retail cambia una receta.
- `FUERA_DE_P10` cuenta selectores, no usos en TSX: `app/(app)/productos/insignias/loading.tsx` sigue en `rounded-[20px]` a propósito, y un `rounded-[24px]` nuevo no lo detectaría esta prueba.
