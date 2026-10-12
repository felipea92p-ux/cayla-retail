## Rótulos de anaquel: diseño A «Rollo» y «Quitar todas» (2026-10-12, ADR-0366 act. 2026-10-12)
- [x] **Tres maquetas** (`docs/maquetas/rotulos-2026-10/`, A Rollo · B Anaquel · C Molde); Felipe eligió la **A**.
- [x] **Construida:** `components/rotulos/TiraBrother.tsx` + `app/estilos/rotulos-brother.css`; `ImprimirRotulos.tsx` con
  `EncabezadoPagina`, las prendas en el navegador (sin navegar al sumar o quitar) y **«Quitar todas»** con «Deshacer».
- [ ] **Imprimir en la Brother del almacén** (Windows y Mac) y ver que el recorrido de ≈1 s antes del diálogo no estorba.
- [ ] **`/formidable` sobre la pantalla nueva** (el informe de `docs/formidable/rotulos.md` es del diseño anterior).
- [ ] **Decidir si la luz de la Brother respira** (bucle): hoy está fija; si sí, va como excepción en ADR-0136.
- [ ] **Idea, sin construir: sumar una prenda escaneando su etiqueta** (el código de la talla lleva a su modelo). En el almacén la
  bolsa está en la mano y escribir el nombre deja elegir un modelo parecido por error. Espera la decisión de Felipe.
- [ ] **De la maqueta B, sin construir: «Mirar desde 1,5 m / 3 m».** Antes, calibrar «se lee desde» con un rótulo impreso pegado en el almacén.
