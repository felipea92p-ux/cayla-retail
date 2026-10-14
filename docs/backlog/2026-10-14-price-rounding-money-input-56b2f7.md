## 🏷️ Descuento en % sin céntimos sueltos + descuento en S/ (2026-10-14, ADR-0403) — web hecha; SQL SIN PEGAR; rama `claude/price-rounding-money-input-56b2f7`

- [x] La regla del % (S/ 0.10 hacia abajo) en `lib/vender-reglas.ts`; el descuento en S/ vuelve al apartado «Descuento» de Vender (`PuntoDeVentaTicket.tsx`, `PuntoDeVenta.tsx`); guía de Vender y su huella al día.
- [x] Migración `20261014173000_descuento_precio_sin_centimos.sql` (función + topes de 15/35 % en `registrar_venta` + tope de 20 % en `crear_proforma`), probada en pila propia; `pruebas:campana-redondeo` ampliada (topes, proforma, control negativo) y `registrar-venta-antes-de-precio-sede.mjs` aprende a deshacerla.
- [ ] **Pegar el SQL** y publicar la web en la misma ventana (fuera del horario de tienda; F5 en cada caja). Hasta entonces, con la web nueva y la base vieja, las ventas CON campaña se rechazan en el mostrador.
- [ ] **Reimprimir las etiquetas de campaña ya impresas** (el precio exacto de antes ya no es el que cobra la caja).
- [ ] Decidir con Felipe si el redondeo también entra a: apartados con descuento manual, cumpleaños y vales del club (hoy siguen con su propia cuenta).
- [ ] `/chaos` y `/formidable` de esta hoja no corridos (el segmento «% | S/» queda chico en la hoja: es la pieza oficial de modo, sin ancho completo).
