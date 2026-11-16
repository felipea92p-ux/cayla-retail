# Auditoría al milímetro · «Corregir esta compra» con «Quitar» (2026-11-16)

- **Ruta / pieza:** Compras ▸ Mis compras ▸ una compra ▸ «Corregir» (`components/mi-plata/HojaCorregirCompra.tsx`). Se miró lo que agregó el PR #1904:
  - el botón «Quitar: se anotó por error»;
  - la fila tachada con `<Chip tono="rojo">Se quita</Chip>`;
  - el aviso «Se quita de la compra», con «No quitarla»;
  - los textos «puede bajar hasta N» y «No se puede quitar: …».
- **Rama:** `claude/corregir-compra-con-envio-abierto` · PR #1904.
- **Cómo:** la hoja de verdad, dibujada en una página temporal (`app/auth/prueba-*`, ya borrada) con una compra inventada pasada por las mismas lecturas de `lib/`. Servidor del worktree sin base (`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9`, host `quitar.localhost`).
- **Medidores** (los de las seis skills, pegados enteros):
  - 1440 × 900 en claro, oscuro (`cayla-tema` + recarga) y quieto;
  - 375 × 812 táctil (`pointer: coarse`);
  - foco con teclado (`{ foco: true }`).

## Resultado

**0 graves abiertos, 0 medias, 0 leves en lo nuevo.** Hubo 1 grave, que se arregló.

| # | Qué | Dónde | Medido | Regla · nivel | Estado |
|---|---|---|---|---|---|
| 1 | El monto de antes de «Papel y pago» («S/ 209.50» tachado) con `opacity-70` | `HojaCorregirCompra.tsx`, fila «Papel y pago» | 2,8:1 en oscuro (mín. 4,5) | WCAG 1.4.3 `[Norma]` · grave | **Arreglado**: sin `opacity`, queda en el taupe de la línea → ~4,8:1 en oscuro y 5,2:1 en claro. Ya estaba antes, pero ahora sale cada vez que se quita una prenda. |

### Lo nuevo, medido

| Pieza | Claro | Oscuro | 375 táctil |
|---|---|---|---|
| Nombre de la fila quitada (tachado, `text-tinta` sobre hueso) | 13,44:1 | >13:1 (crema sobre `#33302a`) | — |
| `<Chip tono="rojo">Se quita</Chip>` | 6,62:1 | ~6,1:1 | — |
| «Quitar: se anotó por error» (`<Boton peso="peligro">`, la gota con letra roja, pieza decidida; contraste vigilado por `lib/vidrio-contraste.test.ts`) | pieza del sistema | pieza del sistema | 44 px de alto, todo el ancho, sin desborde |
| «No quitarla» (`<BotonDeshacer>`) | — | — | 20 px dibujado, área de 44 px (`tacto.css`) |
| Textos («puede bajar hasta N», «No se puede quitar: …», el aviso) | `/textos` y `/tipografia` sin fallas; nada bajo 14 px | — | sin fallas |

- **Foco con teclado:** 11/11 controles con anillo, 0 tapados, 0 flojos. Los 6 «halo a ojo» son los campos (la caja que se enciende, ADR-0351).
- **Quieto:** 0 bucles. La hoja no agrega movimiento propio; usa el de `<Modal>` y `<Boton>`.

### Estados de lo nuevo

| Estado | «Quitar: se anotó por error» | Fila «Se quita» |
|---|---|---|
| default | gota con letra roja (`btn-peligro`) | tachada, chip rojo |
| hover | el de `btn-cayla`, dentro de `(hover: hover)` | el de la fila (`hover:bg-hueso`) |
| focus-visible | anillo `--foco-*`, medido | anillo, medido |
| active | `.mov-boton` | — |
| selected | no aplica: es una acción, no queda elegida | no aplica |
| disabled | no se apaga: si la base no deja quitar, el botón no aparece y se dice por qué en una línea | no aplica |
| loading | no aplica: no guarda; guarda «Guardar la corrección» con `<Boton cargando>` | — |
| error | el de la base («no se puede quitar: …»), en el `<Aviso tono="error">` de la hoja | — |
| read-only / vacío | no aplica | no aplica |
| quieto | sin movimiento propio | sin movimiento propio |

## Heredado de la hoja (no es de este PR; queda anotado)

- «Revisar los cambios» se apaga sin cambios o con un dato malo (`disabled`). La hoja está en `no-aplica` de la guía de foco (ADR-0561), pero `medir.js` lo marca para revisar.
- La flecha `<Volver>` mide 42 × 42 con el dedo (pieza decidida).
- Rellenos de 14 y 18 px en `nota-cayla`, de la pieza.
- Cifras sin tabulares en los montos de las filas (DM Sans, propuesta 1 de `/tipografia`).

## Sin medir

- El medidor de `/color` a veces da los textos de la hoja como tapados (`textosMedidos: 0`). Por eso el contraste de lo nuevo se midió a mano con los colores computados y el fondo pintado real.
- `tema:auditar` (pide sesión).
- Lo que guarda contra la base: lo cubre `pnpm pruebas:corregir-compra-envio-abierto`. Falta `/chaos`.
