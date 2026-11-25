## 🧾 Vender: aviso al cobrar y tuerca de impresión (2026-11-25, ADR-0670 act. b) — solo web, sin migración; rama `claude/fusion-2011-functionality-4d813d` (incluye el PR #2011)

- [x] El aviso al cobrar reemplaza a «Venta registrada» en la computadora y en el celular (`AvisoAlCobrar`).
- [x] Los interruptores de impresión viven en la tuerca de Vender (`ImpresionDelEquipo`), con «1 en cola» si una boleta espera a la caja.
- [x] Prueba «foto de Trujillo»: el celular sigue mandando a la caja y la Mac sigue siendo la caja.
- [ ] **Probar el cobro de punta a punta en `/vender`** con una base propia (banco) en computadora y a 375 px.
- [ ] **Probar en Trujillo:** una venta desde el celular con la Mac encendida y otra con la Mac dormida.
- [ ] `/milimetro auditar /vender`, `/formidable`, `/chaos` y `tema:auditar` del aviso y de la tuerca.
- [ ] Cerrar el PR #2011 si se fusiona este (lo incluye entero).
