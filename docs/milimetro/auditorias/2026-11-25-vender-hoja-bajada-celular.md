# Auditoría al milímetro — Vender en el celular: la hoja «¿La tienes en la mano?» · 2026-11-25 · `ccr-ec1276e8-vcf6ru`

Medido: la hoja de la bajada (`components/punto-de-venta/RegistrarBajadaModal.tsx`) abierta desde la grilla de `/vender`, a 375 × 812 con dedo
(claro y quieto, oscuro y quieto, claro y vivo) y a 1440 × 900 claro. Medidores del repo cargados enteros en la página (`milimetro`, `espacio`,
`tipografia`, `color`, `movimiento`, `textos` de `.claude/skills/*/referencia/medir.js`), con la hoja como raíz. Servidor de la rama contra la base
local con el seed, cuenta de integrante (Micaela) en Tienda Trujillo, con su entrada marcada en la base local.

Resumen: **0 graves · 0 medias · 0 leves de esta rama** · 1 heredado anotado abajo (la etiqueta «Responsable» del combo, 4,48:1 en claro).

## Lo que cambió y cómo se midió

1. **La bajada se ofrece junto al pulgar.** Antes, el aviso salía de 16 a 204 px (tapando la cabecera) y su botón era un enlace de 237 × 55 px en dos
   líneas, a 142 px del borde de arriba. Después, una hoja abajo: «Agregar y registrar» mide 161 × 44 px y está a 743 px de 812; el combo, 325 × 44.
2. **Un solo paso.** La prenda, el stock, quién atiende y el botón en la misma hoja (antes: aviso → hoja del responsable → aviso).
3. **El botón no se apaga por lo que falta** (ADR-0611, mejora 4): al tocarlo sin responsable, el combo se marca con su error y el pie dice «Falta:
   Quién atiende». Medido: `disabled` = false.
4. **Mientras guarda**, `<Boton cargando textoCargando="Agregando…">`: doble toque medido = 1 fila en `movimientos`, la ventana de tallas sigue abierta.

## Lo que dijeron los medidores

| Medidor | 375 claro | 375 oscuro | 375 vivo |
|---|---|---|---|
| Estados | 0 apagados, 0 errores, 0 bucles. «Espera escrita a mano» = el `PalabraEnEspera` de `<Boton cargando>` (la pieza decidida): falso positivo | igual | — |
| Espacio | 0 blancos bajo 24 ni bajo 44 con dedo, 0 fuera de escala; controles de 44 px | — | — |
| Tipografía | 0 lectura bajo 14 px; tamaños 13 · 14 · 16 · 25 | — | — |
| Color | 13 textos, 1 falla: `campo-etiqueta «Responsable *»` 4,48:1 (pieza del combo, heredado). La línea ámbar del stock pasa | 0 fallas; 3 APCA a mirar (combo, heredado) | — |
| Movimiento | quieto: 0 animaciones | — | velo de la hoja 160 ms con `--ease-cayla`, sin bucles |
| Textos | lo que marca es de la pantalla (montos sin espacio, «Prenda sin registrar» en dos líneas), no de la hoja | — | — |

## Estados de la hoja

| Estado | Qué se ve | Cómo se midió |
|---|---|---|
| default | título serif, fila en `nota-cayla sin-i`, combo, pie fijo | captura + medidores |
| hover | lo pone `btn-cayla` dentro de `(hover: hover)` | `lib/hover-con-mouse.test.ts` |
| focus-visible | el halo del combo y el foco de `btn-cayla` (piezas decididas) | sin medir con `{ foco: true }` |
| active | la onda y el encogido de `.mov-boton` | a ojo |
| selected | no aplica: botones de acción | — |
| disabled | ninguno por lo que falta; Cancelar y el combo, solo mientras guarda | medidor: 0 apagados |
| loading | «Agregando…» con su hilo, ancho fijo, la hoja `bloqueado` | doble toque en vivo |
| error | el del combo bajo su caja; el de la base, el aviso de la caja | captura «falta» y red caída |
| read-only | no aplica | — |
| vacío | «¿Quién está atendiendo?» con su etiqueta visible | captura |
| quieto | sin animación; la señal de «Agregando…» sigue | medidor de movimiento |

## Heredado (no es de esta rama)

- `campo-etiqueta` de `ComboResponsable` sobre la hoja de vidrio en claro: 4,48:1 (mínimo 4,5). Es la pieza del combo en todas las hojas; va a quien
  decida la etiqueta del campo (`/unificar`, familia `etiqueta-campo`).

## Capturas (375 × 812)

Antes: [el aviso arriba](2026-11-25-vender-hoja-bajada-celular/1-antes-aviso-arriba.jpg) · [la segunda hoja](2026-11-25-vender-hoja-bajada-celular/2-antes-segunda-hoja.jpg).
Después: [la hoja abajo](2026-11-25-vender-hoja-bajada-celular/3-despues-hoja-abajo.jpg) · [de vuelta en las tallas](2026-11-25-vender-hoja-bajada-celular/4-despues-vuelve-a-tallas.jpg) · [oscuro](2026-11-25-vender-hoja-bajada-celular/5-despues-oscuro.jpg).

## Caos (a mano, local)

Doble toque: 1 fila en `movimientos` (la hoja espera con «Agregando…»). Con la base local respondiendo en ~50 ms, el segundo toque puede llegar con la
hoja ya cerrada y caer en el «Listo» de la ventana de tallas (mismo lugar): la cierra, sin mover datos. Gravedad baja; anotado, no resuelto.
Red caída: aviso «Se cortó la conexión… Vuelve a agregarla», 0 filas, nada en el ticket. Cancelar y «atrás»: 0 filas, sigue en `/vender`.
