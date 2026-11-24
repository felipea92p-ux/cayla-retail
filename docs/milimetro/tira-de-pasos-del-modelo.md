# Ficha al milímetro — Los pasos del modelo en Recibir ▸ Contar

## 2026-11-24 (tarde) · Forma A: los pasos son el cuerpo de la placa (reemplaza a la tira de puntos de abajo)

Felipe, mirando la maqueta: «los pasos no deberían ser de esta forma… si lo pones arriba como una opción puede que ni se den cuenta». Eligió la
**forma A**: los pasos van uno bajo otro DENTRO de la placa; el que toca está abierto con su contenido (el número, o la tarjeta de crear /
repartir / llevar); lo hecho queda en una línea con su resumen y «Cambiar»; lo que viene, apagado con «Después». Y «un foco cuando pasas a
otro paso y te centre en lo que debes hacer».

**Pieza:** `FilaDePaso` (`components/recepcion-conteo/PlacaDelModelo.tsx`) sobre la lista `.rc-pasos-v` (`vidrio/recibir-mesa.css`). No hay
pieza decidida para «pasos en vertical dentro de una placa»; se arma con lo de la placa (hilo de fila, `--hilo-fila`), el círculo de paso de
siempre (28 px, como `.rc-paso`) y el `btn-enlace` de «Cambiar». **Va a `/unificar` como candidata** si otra pantalla necesita lo mismo.

| Estado | Qué se ve | Se anuncia | Cómo se midió |
|---|---|---|---|
| abierto | número en tinta con halo de 4 px; su bloque debajo | `aria-current="step"` | Playwright: `data-estado="abierto"` |
| hecho | ✓ en verde, nombre + resumen («Contaste 5»), «Cambiar» si se puede | texto | idem |
| falta | número con borde de control, texto en `tenue`, «Después» | texto | `tema:auditar` 0 hallazgos solo en oscuro |
| llegar a un paso | la luz difuminada de la guía de foco (`data-llamado`, 1,1 s, una vez), solo se desplaza si no se ve; con mouse, el foco va al botón principal del paso | — | Playwright: luz en `rc-paso-crear`, foco en «Crear la prenda» |
| quieto | la luz no anima (`movimiento.css`), el desplazamiento es inmediato (`prefiereQuieto`) | — | — |
| disabled / error / loading | no aplica a la fila: los tiene cada control de adentro | — | — |

Letra: nombre 16 px (`text-sm`), resumen 14 (`text-detalle`), número 14. Espacio: fila de 28 px mínimo, 10 px arriba y abajo, 12 entre el
número y el texto, múltiplos de la escala. Color: solo tokens (`verde`, `tinta`, `crema`, `borde-control`, `secundario`, `tenue`).

---

# Ficha al milímetro — Los pasos del modelo en Recibir ▸ Contar

## 2026-11-24 (ADR-0699, rama `claude/mejora-recepcion-mercaderia-2c864b`)

**Pieza:** `<PuntosAvance>` (`components/alta-producto/PuntosAvance.tsx`), la de Nuevo producto y de «Crear la prenda» al recibir.
**Rama del árbol:** la familia existe (los puntos de un paso a paso, ADR-0260) y ya se usa en dos lugares; no se dibuja otra. Se le agrega
la prop `etiqueta`, para que no diga «Avance del producto». Sus anclas de guía no cambian, porque el escáner de guías solo lee anclas
literales; la de Recibir va en el contenedor (`data-guia="recepcion.pasos"`). Dentro de la placa del
contador va sin pegarse arriba y sin fondo (como `.hoja-con-pasos`, `app/estilos/puntos-avance.css:28`), y un poco más baja: la placa
reparte su alto con el dial.

**Qué dice.** Los pasos que le quedan a ESE modelo para salir a la venta, en su orden: **Cuántas → Crear → Tallas → Llevar**. «Crear»
aparece solo si la prenda es nueva y todavía no está en el catálogo; una reposición tiene tres. Un modelo que no llegó (0) no muestra la
tira: no le queda nada.

### Texto (de /textos)
| Paso | Nombre | Corto (celular) | Detalle (al pasar el mouse o leerlo) |
|---|---|---|---|
| 1 | Cuántas llegaron | Cuántas | «Contaste N» o «Sin contar» |
| 2 | Crear la prenda | Crear | «Ya está en el catálogo» o «Es nueva: créala para venderla hoy» |
| 3 | Tallas y colores | Tallas | «Repartidas N de M» |
| 4 | Llevar al stock | Llevar | «Ya está a la venta» o «Lista para llevar» |
Los rótulos bajo cada punto son los de la pieza: «Listo», «Estás aquí», «Sigue». La guía de foco del contador sigue diciendo «Sigue» en su bloque.

### Espacio (de /espacio)
- `--marca` 28 px dentro de la placa (38 px en Nuevo producto): el punto con su tilde sigue sobre 24 px, el mínimo con mouse `[Norma]` WCAG 2.5.8.
- Alto de la línea 4 rem (64 px) en vez de 5,25 rem: dos líneas de texto bajo el punto (nombre 14 px + rótulo 13 px) en la escala de 4 px.
- Sin margen propio arriba: lo pone el `gap` del cuerpo de la placa.

### Tipografía (de /tipografia)
La de la pieza: nombre `text-sm` (14), rótulo 13, sin tamaños a mano (ADR-0691).

### Color (de /color)
La de la pieza: relleno verde (`--color-verde`) para lo hecho, tinta para «Estás aquí», `--color-sand` en la pista. Medido en Nuevo producto;
en la placa el fondo es el vidrio de la mesa, no la crema: el aro del punto usa `--color-crema` y se verifica a ojo en claro y oscuro.

## Estados (de /milimetro)
| Estado | Qué se ve | Qué se anuncia | Cómo se mide | Nivel · fuente |
|---|---|---|---|---|
| default | puntos con su nombre y rótulo | `<nav aria-label="Pasos de <modelo>">`, `aria-current="step"` en el abierto | read_page | `[Norma]` 4.1.2 |
| hover | el de la pieza, dentro de `(hover: hover)` | — | `lib/hover-con-mouse.test.ts` | regla del repo (ADR-0136) |
| focus-visible | anillo `--foco-*` en los pasos tocables | — | Tab en el navegador | `[Norma]` 2.4.7 |
| active | el de `<button>` | — | a ojo | `[Práctica]` |
| selected | «Estás aquí» con su núcleo, no solo color | `aria-current="step"` | read_page | `[Norma]` 1.4.1 |
| disabled | no aplica: un paso que todavía no toca no es botón, es texto | — | — | — |
| loading | no aplica: la tira no guarda; lo que guarda es cada paso | — | — | — |
| error | no aplica: el error va junto al control que falló (dial, hoja) | — | — | — |
| read-only | no aplica | — | — | — |
| vacío | un modelo que no llegó no muestra la tira | — | — | — |
| quieto | el latido del punto abierto se apaga (ADR-0625); el relleno no corre | — | `data-movimiento="quieto"` | `[Norma]` 2.3.3 |

## Movimiento (de /movimiento)
El de la pieza: la línea se llena en 700 ms con `--ease-cayla` al terminar un paso; el punto abierto late (excepción escrita de ADR-0136,
2026-10-06). Quieto: sin latido y sin transición.

**Toques:** un paso «Listo» lleva a ese paso (Cuántas abre el número; Tallas abre la hoja de tallas; Crear no vuelve a crear). «Sigue» lleva
al paso si se puede abrir.

**Accesibilidad:** 1.4.1 (el abierto tiene núcleo y rótulo, no solo color), 2.4.7 (foco), 2.5.8 (24 px), 4.1.2 (nombre y `aria-current`).
**Sin medir todavía:** contraste del aro sobre el vidrio de la placa en oscuro; se mide en la auditoría al terminar.
