# Auditoría al milímetro — «Por definir» en Mis compras · 2026-11-13 · claude/mis-compras-por-definir

Medido en local (base privada con todas las migraciones y el seed, cuenta líder e integrante de prueba). Medidores: estados (`milimetro`, también con
`{ foco: true }`), `espacio`, `tipografia`, `color`, `textos`.

| Pieza | Raíz medida | Tamaños |
|---|---|---|
| Sección «Por definir» de Revisar compras | `#por-definir` | 1440 × 900 claro |
| Hoja «Definir» | `[role=dialog]` | 1440 × 900 claro y oscuro; foco con teclado |
| Hoja «Algo nuevo» con «Por definir» | `[role=dialog]` | 375 × 812 claro |
| Aviso «Primero di qué es» de Recibir | `.rc-pasos` y su aviso | 1440 × 900 claro (inert y opacidad medidos) |

**Números:** 0 graves, 0 medias, 0 leves en lo que cambió este PR.

## Graves
Ninguno. Contraste: 0 textos que fallan, en claro y en oscuro. Blancos bajo 24 px: 0 (bajo 44 px con dedo: 0 a 375 px). Controles sin etiqueta: 0.
Foco: 4 controles de la hoja «Definir», todos con anillo y ninguno tapado.

## Medias
Ninguno.

## Leves
Ninguno.

## Arreglado durante la auditoría (en el navegador, antes de medir)
- «A la espera de pr…» se cortaba en la columna de «Se vende a»: pasa a su propia fila, alineada con el campo, con la frase entera.
- El combo «¿Qué es?» de la hoja «Definir» escondía su título (`caja` lo deja solo para lectores de pantalla): sin `caja`.
- «Si se vende todo, ganas» contaba solo las prendas con precio: si alguna espera el suyo, dice «Si se vende lo que tiene precio, ganas».
- En Recibir, el contador aceptaba un número que la base no guarda: queda `inert` y atenuado mientras la prenda está por definir.
- La hoja de la tienda decía «Corregir …» para algo que nunca se definió: «¿Qué es …?».

## Decidido a propósito
- «Por definir» es una `pildora-cayla` más del grupo de «¿Qué es?» (la misma pieza que los chips), y «A la espera de precio sugerido» es el atajo de la hoja (`compra-atajo`).
- La sección usa `TituloSeccion` con `cuenta`, `Aviso tono="atencion"`, `Chip tono="ambar"` y `Boton peso="fantasma"`; la hoja, `<Modal>` angosta con `PieAcciones`.

## Heredado (no lo toca este PR)
- La frase de `PieGuia` a 12,5 px (`p.text-[12.5px]`), en todas las hojas con guía de foco.
- En la bandeja de Revisar compras: textos que se cortan con puntos suspensivos y DM Sans sin cifras tabulares (propuesta 1 del tablero).

## Sin medir
- `movimiento` y `graficos`: la sección no agrega animaciones propias ni gráficos.
