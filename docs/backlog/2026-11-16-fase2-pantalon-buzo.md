# Fase 2 del «pantalón que sale buzo» — lo que queda

Rama `claude/fase2-pantalon-buzo`, 2026-11-16. Hecho: el pedido de cintura en positivo y la ficha (ADR-0659, act. 2026-11-16 c).

- [ ] **Medir sin gastar de más:** que el laboratorio (`app/api/fotos/laboratorio/route.ts`) use `pedidoDeCatalogo` con la ficha y la misma foto
      achicada que la pantalla, y una medida pura del canal alfa: ancho de la basta ÷ ancho de la rodilla (≥ ~0,95 recto; un jogger, menos) y el
      ensanche de un puño. Lámina: el pantalón de lino (sostenido y en plano), un drill, un jean, un palazzo, un short y una falda; ~0,90 USD.
- [ ] **El molde no se propaga si salió mal:** solo una foto raíz que nadie descartó es molde; en Editar un color no es su propio molde
      (`useCatalogoIA.tsx:144`); en Recibir el molde guardado se lee sin filtrar por color (`HojaPrenda.tsx:260`).
- [ ] **Una línea de cómo tomar la foto** de una prenda de cintura en «Fotos y colores» (el texto ya está en ADR-0659, act. 2026-11-14 b), y la
      «Espalda: Escote y caída.» de la hoja de ángulos dicha para un pantalón (`HojaCatalogoIA.tsx:22`).
- [ ] `complexity` (OpenAI la pone en `high` si no se manda; «puede introducir cambios no deseados»): probar `medium` solo con pantalones, en la lámina.
