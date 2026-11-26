# Auditoría al milímetro — Vender: el aviso sobre la cámara y «Escaneadas» como el ticket · 2026-11-25 · `scanned-items-indicators-15a599`

Medido: `components/EscanerCamara.tsx` dibujado con datos inventados desde una página temporal (no commiteada), con una cámara (`canvas.captureStream`)
y un `BarcodeDetector` simulados, a 375 × 812 con dedo; claro y oscuro, quieto (de fábrica) y vivo. Estado medido: 4 prendas en la bandeja (una
«× 2») y el aviso «En el almacén» con «Agregar» a la vista. Medidores del repo cargados enteros en la página (`milimetro` —también con
`{ foco: true }` tras un Tab real—, `espacio`, `tipografia`, `color`, `movimiento`, `textos`). No hay gráficos.

Resumen: **0 graves · 0 medias · 0 leves de esta rama** (los montos `S/69.00` se corrigieron durante la auditoría a `S/ 69.00` con espacio que no se parte, ADR-0413) · 1 heredado.

## Lo que cambió y cómo se midió

1. **El aviso sobre la cámara** (`AvisoSobreLaCamara`): placa crema de 351 px a 4 px del visor, `role="status"`; punto o ✓ + motivo en 16 px y la
   prenda en 14 px. Se va solo: 1,8 s si entró, 3,2 s si no y 6 s con «Agregar» (`msDelAvisoDeLectura`, con prueba). Entra con `anim-revelar`
   (160 ms, una vez); quieto, aparece sin moverse.
2. **«Escaneadas» es el ticket** (`filasDeLaBandeja`): una fila por prenda (medido: la misma prenda dos veces = 1 fila «× 2»), con scroll
   (`overflow-y: auto`, alto fijo de 104/156 px, ADR-0185). La recién leída lleva fondo verde y su ✓ de 20 px, y se trae a la vista.
3. **Quitar**: botón de 44 × 44 px en rojo profundo (la forma de «Quitar del ticket» de `OpcionesDePrendaModal`), tacho con una y «−» con varias; su nombre
   accesible dice cuántas quedan. Medido: × 2 → × 1 → la fila desaparece, el ticket baja de 5 a 3.

## Lo que dijeron los medidores (375)

| Medidor | Claro | Oscuro | Vivo |
|---|---|---|---|
| Estados | 0 apagados, 0 errores, 0 bucles, 0 sin etiqueta | — | — |
| Foco (Tab real) | 7 controles: 0 sin anillo, 0 tapados; 1 anillo flojo (heredado, abajo) | — | — |
| Espacio | 0 blancos bajo 24 ni bajo 44 con dedo, 0 fuera de escala; controles de 44 px | — | — |
| Tipografía | 0 lectura bajo 14 px; cifras tabulares en todas las que lo piden; 0 montos partibles | — | — |
| Color | 27 textos, 0 fallan; 0 rojos de más | 27 textos, 0 fallan | — |
| Movimiento | — | — | 27 transiciones de color 100–260 ms y entradas de 160 ms, 0 bucles; todo quieto al terminar |
| Textos | montos `S/69.00` → corregido; repetido: sin fallas | — | — |

## Heredado (no es de esta rama)

- La ✕ «Cerrar la cámara» (`botonRedondo`) no dibuja un anillo de foco propio: el medidor lo da 1:1 entre con y sin foco. Es de antes de esta rama;
  se anota para `/unificar` (familia `accion.cerrar`).

## Lo que no se midió

- La cámara y el lector reales de un teléfono (Safari de iPhone, Chrome de Android): solo simulados.
- 1440 px: la cámara es del teléfono; en escritorio Vender usa el lector.
