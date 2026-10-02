# «Gris melange» jaspeado: `colores.tipo` llega a la muestra (2026-10-02)

Estado: hecho en la rama `claude/color-textura-jaspeado`, **apilada sobre el PR #736** (`claude/color-scales-families-c7513c`; se fusiona después de él, su migración ya está pegada en producción). Sin migración propia. ADR-0312, actualización (b).

- [x] `tipo` de la base a la pantalla: `ColorAlta`, `alta-producto-datos.ts`, `colorDeRespuesta`, `api/productos/colores` (2 consultas), Editar producto, Atributos → Colores.
- [x] `fondoDeMuestra(hex, familia, tipo)`: una `textura` lleva el jaspeado (8 capas, solo tokens); liso exacto; metálico gana; estampado liso.
- [x] `Punto`, carta y pie, matriz de cantidades (franja y punto), fotos por color, Atributos y combos de Editar pasan `tipo`.
- [x] Pruebas (`color-escala.test.ts`, `color-alta-reglas.test.ts`), suite completa y `tsc` en verde; probado en navegador a 1024 y 375 px.
- [ ] El punto de color del filtro de Productos (`FiltrosProductos.tsx`) y el de «prenda sin registrar» (`PrendaSinRegistrarModal`, Vender: celular obligatorio) dibujan el hex plano; pasarlos por `fondoDeMuestra` si Felipe lo quiere.
- [ ] Si algún día hay un `textura` muy oscuro o muy claro, ajustar la mezcla luz/sombra por `claridadDeHex` (el promedio se desvía +9 sobre un azul marino).
