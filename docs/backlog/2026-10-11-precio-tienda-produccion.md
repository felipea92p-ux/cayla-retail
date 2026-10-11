## Producción ▸ margen con el precio de tienda (2026-10-11, rama `claude/precio-tienda-produccion`)

- [x] Producción mide el margen con el precio propio más bajo de cualquier tienda (decidido por Felipe el 2026-10-11): `precioPropioMasBajo` (`lib/precio-sede-reglas.ts`), `precioParaMargen` / `conPreciosMasBajos` (`lib/produccion-reglas.ts`), cableado en `produccion/ordenes/page.tsx`.
- [ ] **No se probó en el navegador ni con SQL local:** Docker estaba apagado en esta Mac. No hay SQL en este cambio; cubren las pruebas de vitest. Falta mirar a mano una orden de un modelo con precio propio (hoy FAL-0008 con TRU a 69.90 y POL-0023 con AQP a 39.90): la tarjeta debe decir «· en Trujillo»/«· en Arequipa» y el panel «el margen usa S/ …».
- [ ] **Precio por talla:** el margen usa el precio propio más bajo de cualquier talla del modelo contra el precio MÁS ALTO de sus tallas. Si algún día un modelo tiene tallas a distinto precio y una tienda baja solo una, el margen se mide con esa; es la lectura prudente, no la media.
- [ ] Si `getPreciosDeLasTiendas()` no responde (devuelve vacío sin avisar), el margen vuelve en silencio al precio de la grilla. Es lo mismo que las demás pantallas; si Felipe quiere que lo diga, es un aviso aparte.
- [ ] El tope de 1.000 filas de `getPreciosPorSede` (ver `2026-10-11-precio-tienda-pantallas-faltantes.md`) también limita a Producción.
