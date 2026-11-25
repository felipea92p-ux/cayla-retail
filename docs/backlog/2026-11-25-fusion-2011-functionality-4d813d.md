## 🧾 Vender: aviso al cobrar y tuerca de impresión (2026-11-25, ADR-0670 act. b) — solo web, sin migración; rama `claude/fusion-2011-functionality-4d813d` (incluye el PR #2011)

- [x] El aviso al cobrar reemplaza a «Venta registrada» en la computadora y en el celular (`AvisoAlCobrar`).
- [x] Los interruptores de impresión viven en la tuerca de Vender (`ImpresionDelEquipo`), con «1 en cola» si una boleta espera a la caja.
- [x] Prueba «foto de Trujillo»: el celular sigue mandando a la caja y la Mac sigue siendo la caja.
- [x] Cobro de punta a punta en `/vender` en un banco propio, computadora y 375 px (arreglado el foco tras «Reimprimir»).
- [ ] **Probar en Trujillo:** una venta desde el celular con la Mac encendida y otra con la Mac dormida.
- [x] `/milimetro`, `/formidable` (8,0 · 8), `/chaos` (resiste) y `tema:auditar` (0 solo en oscuro).
- [ ] **Los 3 cambios de texto de `/formidable`** («tuerca» fuera del aviso, «Imprimir otra copia», «1 tuya en cola»): esperan el OK de Felipe.
- [ ] Cerrar el PR #2011 si se fusiona este (lo incluye entero).
