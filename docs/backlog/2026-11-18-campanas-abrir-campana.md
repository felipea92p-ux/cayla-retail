# Campañas y ofertas: abrir una campaña, la hoja de ofertas y la compra de ejemplo (ADR-0677, actividades 6 a 8) · pendientes

- [ ] **Imprimir y «Ver en la web» de una campaña con solo ofertas (decisión de Felipe).** Hoy salen en «Más» solo si la campaña tiene el
  descuento de siempre (`descuento_pct`): la etiqueta de precio lee ese % (`fn_campanas_por_variante`, `lib/etiqueta-precio-reglas.ts`) y el
  diseño de la tienda web lo exige en la base (`fn_campana_web_valida`: `descuento_pct > 0`). Una campaña armada con ofertas («3 x 2», «−20 %
  en Polos») no tiene ninguna de las dos. Qué imprime el papel con un «3 x 2» y si la tienda web anuncia una campaña sin descuento es de Felipe.
- [ ] Desactivar una campaña con prendas marcadas a mano falla (el candado «en uso» de las campañas, inventario de la maqueta). Los descuentos ya
  lo resuelven (`desactivar_descuento` quita sus marcas); para una campaña, decidir si se quitan o si se avisa.
