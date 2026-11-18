# 2026-11-10 · Probador: la medida de la unión la saca la tienda, no el navegador (ADR-0449)

- **Qué:** `GET /api/medida/<recorte>` mide cada recorte en el servidor con `sharp` y la misma `medirRecorte`, y se guarda un año; la figura pide ese JSON en vez de leer píxeles. Lo recordado sube a `cayla-union-v4`.
- **Por qué:** Safari 26 (Mac e iPhone) le mete ruido a la lectura de un lienzo por su protección contra la huella digital; en Safari los outfits salían sin unir y en Chrome no (Felipe, desde Safari en su Mac).
- **Verificado:** 1081 pruebas de la tienda, `tsc`, `eslint`, `knip`; la ruta en local contra el almacén real da la misma medida que Chrome. **No verificado:** la figura completa en Safari.
