## 👗 El probador mide la prenda de arriba por su pecho, con la IA (2026-11-26, ADR-0705) — rama `claude/probador-medida-por-axila`

- [x] La prenda de arriba se dimensiona por su pecho (axilas de la IA + ancho de los píxeles), no por su borde de abajo.
- [x] La IA mide sola cada recorte nuevo (cron cada 10 min); sin medida, la prenda se dibuja como siempre.
- [x] Pegar `20261126153000_recortes_medida_ia.sql` en producción (parte 1, luego parte 2): hecho el 2026-11-26 con el OK de Felipe.
- [ ] Ver en la tienda real la «Camisa Dalia» (CMS-0092) y tops de tirantes, en computadora y celular, cuando el cron haya medido los recortes.
- [ ] Decidir si la figura crece para llenar el arco (hoy un outfit con falda corta queda chico con aire abajo).
- [ ] POL-0065 está en «Polos» pero la foto es una falda: corregir su categoría en el ERP.
- [ ] Refrescar el diccionario de datos (`pnpm datos:generar:produccion`) cuando la migración esté en producción.
