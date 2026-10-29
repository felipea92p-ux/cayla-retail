# ADR-0562 — «¿Quieres volver a agregar esta prenda?»: la misma prenda escaneada otra vez no suma sola

- **Fecha:** 2026-10-28 · **Estado:** construido en Bajar al piso y Cuadrar el piso (sin migración); la maqueta está en
  `docs/maquetas/escaneo-repetido-2026-10/`. El número está reservado para la rama `claude/duplicate-scan-confirmation-54e92c` (`pnpm reservar`).
- **Relacionados:** ADR-0237 (Existencias y bajadas por escaneo), ADR-0328 (elegir por nombre si la etiqueta no se lee), ADR-0358 (una función,
  una pieza), ADR-0389 (guías interactivas).
- **Origen:** Felipe, 2026-10-28: las colaboradoras cuentan que, cuando se quedan con la etiqueta frente al lector, el lector la vuelve a leer y
  la prenda se agrega duplicada. Pidió que la primera lectura se registre normal y que la siguiente de la misma prenda pregunte «¿Quieres volver
  a agregar esta prenda?» con el total de ESA prenda. Eligió mirando la dirección A de la maqueta (el aviso bajo el campo).

## El problema

Toda lectura sumaba 1 (`leerPrenda` en `lib/bajada-reglas.ts`, `leerCodigoCuadre` en `lib/cuadre-piso-reglas.ts`). Con la pistola no había
ninguna defensa contra una lectura doble; con la cámara en ráfaga, `debeContarLectura` evita la etiqueta quieta solo si el lector no la pierde
ningún cuadro: una mano que tiembla la hace salir y entrar, y suma otra vez. El error no se ve hasta que la bajada o el cuadre no cuadran.

## Lo que se decidió

1. **La primera lectura de una prenda se registra como siempre.** Una línea «por escanear» (cantidad 0, marcada desde Existencias) cuenta como
   primera.
2. **La misma prenda otra vez no suma: pregunta.** El aviso (`components/ui/AvisoRepetida.tsx`, un `<Aviso tono="atencion">`) muestra
   «Llevas de esta prenda: 1 → 2 si la agregas». Suena el tono grave de siempre («mira la pantalla»). Solo el total de esa prenda: el de la
   lista ya está en la barra de abajo y en el contador de la cámara (Felipe, mirando la maqueta).
3. **Mientras pregunta, la misma etiqueta se ignora** y solo se cuenta («6 lecturas repetidas ignoradas»): es exactamente lo que antes
   duplicaba.
4. **Se responde tocando, nunca con Enter.** La pistola remata cada código con Enter: si el Enter confirmara, la etiqueta quieta diría «Sí» sola.
   Ningún botón del aviso toma el foco; `usePistola` (`fuera: "atraer"`) devuelve las teclas de la pistola al campo de escaneo. `Esc` = «No».
5. **Escanear otra prenda es «No»** a la pregunta abierta, y esa otra se lee como siempre: quien escanea una pila de prendas distintas no se
   frena.
6. **«Son varias iguales»** abre «¿Cuántas tienes en total?» (de una más hasta el tope del almacén en Bajar; sin tope en Cuadrar), pone ese
   total y declara la prenda «Varias iguales»: deja de preguntar hasta «Preguntar de nuevo» (o hasta quitarla de la lista). Las pilas viven en la
   pantalla, no en el borrador: al recargar, vuelve a preguntar.
7. **Elegir por nombre no es una lectura repetida** (ADR-0328): tocar la prenda en la lista es elegirla a propósito. Tampoco lo es lo que la
   pantalla no sumaría por su cuenta (tope del almacén, talla archivada): su propio aviso dice por qué.
8. **La regla es una sola función pura** (`lib/lectura-repetida.ts`, con su prueba): `decidirLectura` devuelve `sigue` · `pregunta` · `ignora`.
   Cada escáner la llama antes de sumar; ninguno decide por su cuenta. Sin migración: la pregunta vive en el navegador, antes de tocar la lista
   (los guardados no cambian).

## Dónde aplica (y dónde no, todavía)

| Escáner | Estado |
|---|---|
| Bajar al piso (pistola y cámara) | construido |
| Cuadrar el piso (pistola y cámara) | construido |
| Recibir envío, Llegó mercadería, Etiquetas, Apartar | pendiente: misma pieza y misma función, en otro PR |
| Conteo (cámara en ráfaga) | **decisión de Felipe**: contar una pila de iguales es pasar la misma etiqueta muchas veces |
| Vender (ticket) | **decisión de Felipe**: dos prendas iguales en un ticket son normales y es dinero |

## Alternativas descartadas

- **B · Hoja al centro (`<Modal>`).** Imposible no verla, pero frena a quien escanea prendas distintas (cada lectura espera) y tapa la lista,
  que es lo que hace falta para decidir.
- **C · La fila pregunta.** La pregunta vive junto al número, pero si la fila está fuera de pantalla pasa desapercibida.
- **Preguntar solo si la repetición llega en menos de N segundos.** Distingue mejor una pila de iguales de una etiqueta quieta, pero Felipe pidió
  preguntar en toda repetición; queda como ajuste si en la tienda resulta molesto (y es la opción natural para Conteo).
- **Confirmar con Enter.** Más rápido con teclado, pero la pistola lo manda sola tras cada código.
