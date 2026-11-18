# Campañas y ofertas: abrir una campaña, la hoja de ofertas y la compra de ejemplo (ADR-0677, actividades 6 a 8) · pendientes

- [ ] **Imprimir y «Ver en la web» de una campaña con solo ofertas (decisión de Felipe).** Hoy salen en «Más» solo si la campaña tiene el
  descuento de siempre (`descuento_pct`): la etiqueta de precio lee ese % (`fn_campanas_por_variante`, `lib/etiqueta-precio-reglas.ts`) y el
  diseño de la tienda web lo exige en la base (`fn_campana_web_valida`: `descuento_pct > 0`). Una campaña armada con ofertas («3 x 2», «−20 %
  en Polos») no tiene ninguna de las dos. Qué imprime el papel con un «3 x 2» y si la tienda web anuncia una campaña sin descuento es de Felipe.
- [ ] Desactivar una campaña con prendas marcadas a mano falla (el candado «en uso» de las campañas, inventario de la maqueta). Los descuentos ya
  lo resuelven (`desactivar_descuento` quita sus marcas); para una campaña, decidir si se quitan o si se avisa.
- [x] **Guardar una oferta una sola vez (chaos 2026-11-18, g2 sintético).** Hecho con el OK de Felipe (`af25c2438`). Tres `.click()` en el mismo instante sobre «Guardar como borrador»
  crean tres ofertas iguales: `guardar()` mira `guardando` del cierre y React no alcanza a apagar el botón entre clics. Con un doble clic real
  (80 ms) sale una sola, y la base no lo frena porque dos borradores iguales son válidos. Arreglo propuesto: envolver el envío con
  `unSoloEnvio()` (`lib/campana-hoja.ts`, ya existe para esto) en `OfertasHoja.tsx`, con su prueba. Espera el OK de Felipe (`/chaos`).
- [ ] Si otra pestaña retira la oferta abierta, la hoja no se entera hasta guardar: «Guardar cambios» responde «Esa oferta ya se retiró.
  Registra una nueva.» y la hoja sigue abierta con «Retirar» (g4: mensaje claro, nada escrito). Podría cerrarse sola al recibir ese error.
- [ ] «2 por S/ 59.90» es la única opción de «Qué le das» que parte su ejemplo en dos líneas a 1440 (`text-wrap: balance`, ficha 7a): las cinco
  quedan del mismo alto por la grilla, pero el ejemplo se lee en dos golpes. Si molesta, el de fábrica podría ser «2 por S/ 60» (como la maqueta).
- [ ] **El cartel no dice «Todas las tiendas»** (ciega repetida de Formidable, 2026-11-18): dice «Solo Tienda Lima» cuando es una, pero nada
  cuando rige en todas, y «Toda la campaña» se lee como fechas o como prendas. Decidir si el cartel de una campaña con varias tiendas dice siempre
  dónde rige (más texto en cada cartel, ley 8) o si «Toda la campaña» pasa a decir «Todas las prendas».
- [ ] «Retirar» se lee como pausar (la ciega): borra la oferta y no se deshace. Probar «Quitar la oferta» con Felipe.

