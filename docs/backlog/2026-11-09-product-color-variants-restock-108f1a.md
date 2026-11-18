# Un color por estampado (2026-11-09, ADR-0634)

Estado: construido en la rama `claude/product-color-variants-restock-108f1a`. Sin migración: no hay nada que pegar en producción.

- [x] «Nuevo color» en Liso / Estampado, con su guía de foco.
- [x] Grupo «Estampados» en la carta y en Atributos ▸ Colores.
- [x] Foto del estampado en Vender, Recibir ▸ Contar, Existencias y Ajustar stock.
- [ ] Lo que ya entró como «Multicolor» no se separa solo: hace falta un conteo físico; decisión de Felipe si se hace.
- [ ] El patrón del modelo sigue siendo uno solo: con varios estampados se elige «Estampado».
- [ ] Atributos ▸ Colores tiene su propio «Nuevo color» y todavía no ofrece Estampado.
- [ ] Modo oscuro de la hoja «Nuevo color»: usa solo tokens y piezas del sistema (las pruebas pasan), pero no se miró en pantalla.
- [ ] `/formidable` completo con agente ciego (solo se midió la hoja: controles y desborde).
- [ ] CAYLA Dynamic: `apps/web/components/ui/MuestraEstampado.tsx` es una pieza nueva en una carpeta que su vigilante mira; queda como tarea allá si la quieren.
