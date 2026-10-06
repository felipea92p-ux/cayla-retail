# Criterio: ¿es la misma función? ¿es la misma forma?

El motor agrupa por **huella** (lo que se ve). Tú decides por **función** (lo que la persona hace). Las dos preguntas se responden por separado.

## 1. ¿Hacen lo mismo?

La función es lo que la persona logra al usarlo, no el componente ni el texto exacto.

- **Sí, es la misma:** «Cancelar» en una hoja de Caja y «Cancelar» en una de Inventario. «← Traslados» y «Volver». Un «×» arriba a la derecha
  de una hoja y un botón «Cerrar» en el pie. La insignia «Pagado» de Por pagar y la «Recibido» de Compras (las dos dicen un estado).
- **No, aunque se parezcan:** «Cerrar caja» no es cerrar una hoja (es una operación del negocio). «Anular comprobante» y «Quitar filtro» no son
  la misma «eliminación»: una es irreversible y toca SUNAT, la otra se deshace con un clic. Una píldora de filtro (se prende y apaga) y una
  insignia de estado (solo informa) no son la misma familia aunque las dos sean redondas.
- **Una familia puede necesitar más de una forma a propósito.** Los botones tienen jerarquía (primario, secundario, peligro, sutil, enlace:
  ADR-0169): que haya 5 estilos de botón no es un problema; que haya 23, sí. Las insignias tienen tonos (verde, ámbar, rojo, pizarra): el tono es
  el dato y por eso no separa variantes (`sinColorEnLaClave`). La pregunta no es «¿hay una sola?» sino **«¿cada forma que existe significa algo
  distinto para la persona?»**. Si dos formas significan lo mismo, sobra una.

## 2. ¿La diferencia es un accidente o una decisión?

| Diferencia | Casi siempre es… | Qué haces |
|---|---|---|
| 1–2 px de alto o de relleno, un 5 % de opacidad, `≈token` | accidente (alguien copió a ojo) | se junta sin preguntar mucho: es la migración más barata |
| esquinas rectas vs. píldora, con/sin borde, otra letra | dos diseños que conviven | va a la lámina y Felipe elige |
| distinto color de fondo en el mismo botón (Cancelar rojo vs. gris) | error de significado | va primero: confunde de verdad |
| una forma que vive por un ADR (Finanzas, vista rápida, Movimientos, Observatorio, persiana de Caja) | decisión | «decidida a propósito»: Felipe dice si se unifica |
| un hex que no es ningún token (`#d5ba98`) | color de dato o deuda del modo oscuro | si es la prenda, fuera; si no, va con la deuda de `tema:colores` |

## 3. Falsos positivos conocidos (el motor puede contarlos; tú los sacas)

- **Muestras de color** de una prenda (círculos con su color): el motor las salta, pero una muestra con texto adentro puede colarse como botón.
- **Una frase con una cifra grande adentro** («Te faltan S/ 150 para igualar ayer») sale como «tarjeta de cifra»: no lo es.
- **Una tarjeta de producto** con su nombre en `h3` cuenta como «título de sección». Si todas las tarjetas lo usan igual, no es un problema.
- **Un grupo de botones con uno marcado** (filtros de un solo valor) puede salir como «pestañas». Mira la captura: si cambia la vista, es
  pestaña; si filtra la lista, es filtro.
- **Los iconos dentro de un botón** se cuentan dos veces a propósito: el botón compara su estilo y el icono compara su dibujo (que la X de cerrar
  tenga 4 tamaños es un hallazgo aunque los botones se vean bien).
- **Una pantalla que no existe** (404) o que la cuenta no ve («sin acceso») va a «No cubierto», no al censo.
- **El seed tiene pocos datos:** una tabla vacía no muestra filas, un estado vacío puede ser el único que se ve. Dilo.

## 4. Cómo leer la huella

`alto 36, radio pleno, fondo papel, borde 1px tinta/15, relleno 0·10, letra 13 600 sans` se lee: 36 px de alto, esquinas de píldora, fondo papel,
borde de 1 px en tinta al 15 %, sin relleno vertical y 10 px a los lados, letra de 13 px seminegrita. En la lámina, lo que cambia frente a la
A está en rojo. «≈taupe» = no es exactamente el token pero se le parece (copiado a ojo o mezclado); un hex = no es ningún token.

## 5. Qué unificar primero

Ordena por **confusión × alcance**: primero lo que cambia de significado (un mismo botón con colores de jerarquía distinta), después lo que se
usa en el mostrador (Vender, Caja, Cambios, Devoluciones), después lo que más pantallas tiene. Una familia con 9 formas en 2 pantallas de
configuración puede esperar; una con 2 formas del botón «Cobrar» en el mostrador, no.
