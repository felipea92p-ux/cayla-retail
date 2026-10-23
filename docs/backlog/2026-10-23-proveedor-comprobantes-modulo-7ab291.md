# 2026-10-23 · Historial de compras (ADR-0480, actualización)

- [x] ~~Pegar `20261023164000_compras_historial_de_compras.sql` en producción~~ — aplicada el 2026-10-23 (con el OK de Felipe) y verificada.
- [ ] Compra a crédito: con el registro a mano retirado, ningún camino crea una deuda nueva en «Por pagar». Decidir si «Revisar compras» aprende el crédito (vencimiento y plazo del proveedor) antes de que llegue la primera factura a crédito.
- [ ] `registrar_compra` quedó sin pantalla que la llame: decidir si se retira de la base (migración aparte) o se deja para el crédito.
- [ ] Los textos del detalle de una compra y de «Por pagar» siguen diciendo «factura»; revisarlos con el mismo criterio si Felipe lo pide.
