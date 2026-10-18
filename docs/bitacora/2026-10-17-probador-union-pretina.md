# 2026-10-17 · En el probador, la prenda de abajo se une a la de arriba por su pretina (ADR-0449)

- **Qué:** la falda, el short o el pantalón se dibujan por su pretina, que sigue al borde de abajo de la prenda de arriba (±15 % de una cintura estándar); su largo sale de la forma de la foto. Las medidas salen del recorte, en el navegador: sin columna ni migración.
- **Por qué:** Felipe pidió que «la unión con el pantalón coincida»; con un polo con ojal, la pretina de la «Falda Jean» asomaba 244 px contra 155 px, porque la falda usaba el largo típico de 55 cm. Medido: copiar el borde exacto hacía variar la misma falda de 28 a 54 cm según la blusa, por eso el margen.
- **Verificado:** `tsc`, `eslint`, `pnpm knip`, 565 pruebas de la tienda, y la figura real en el navegador local con prendas de producción. **No verificado:** con cuenta real, en Safari/celular, ni la figura quieta (sigue por largo).
