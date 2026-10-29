# ADR-0571 — La cuenta de la devolución al cerrar la ronda, y «Reabrir» en «Tu última ronda» (Mis compras)

- **Fecha:** 2026-10-29 · **Estado:** construido y probado en local; las migraciones `20261029165000` y `20261029170000` **NO están en producción** (esperan el OK de Felipe, tocan una función que mueve dinero).
- **Continúa a:** [ADR-0569](0569-reabrir-la-ultima-ronda-de-compras.md) (reabrir la última ronda) y [ADR-0480](0480-compras-simple-en-cuatro-pasos.md) (la ronda de compras).
- **Origen:** Felipe, 2026-10-29, mirando Mis compras: «por el botón de reabrir no colocaste por aquí, ya que aquí se ve la última ronda» (la tarjeta «Tu última ronda») y, viendo la hoja «Cerrar mi ronda»:
  «cuando se devuelve no dice a qué cuenta de CAYLA se está devolviendo». Al preguntarle cómo, eligió: «que indique la cuenta a la que devolvió y allí le debe listar las cuentas de la empresa».

## 1. «Reabrir» vive en «Tu última ronda»

El botón «Reabrir RC-…» estaba en la tarjeta de la izquierda («¿Sales a comprar?»), lejos de la ronda que se reabre. Pasa al pie de «Tu última ronda» (`ReabrirRonda`), que es la tarjeta donde se ve esa ronda.
Sale de `AbrirRonda` (un solo lugar, no dos). Las reglas no cambian: solo la última ronda cerrada, sin otra abierta y mientras Compras no recibió su cierre (`puedeReabrirLaRonda`; la base lo exige).

## 2. «¿A qué cuenta de CAYLA lo devuelves?»

**El problema.** Con «Lo devuelvo al cerrar», la hoja decía «Lo entregas en caja y Compras lo recibe», sin decir a qué cuenta. Hoy la cuenta la elige Compras al recibir (`recibir_cierre_compras(p_cierre_id, p_cuenta_id)`), así que la
compradora no sabía ni podía indicar a dónde entregó lo que le sobró.

**Lo que se hizo.** Mismo patrón que «¿De qué banco salió?» (ADR-0480, 20261026165000): lo que dice la compradora es una **indicación, no un movimiento**.
- `compra_cierres.cuenta_indicada_id` (nueva columna, con candado: solo con `decision = 'devuelve'`).
- `terminar_dia_compras(p_decision, p_cuenta_indicada_id default null)`: si devuelve y viene una cuenta, tiene que ser un **banco o una caja fuerte activos** (las mismas que acepta `devolver_fondo`; no un cajón ni la del líder), si no `compra_cierre_cuenta`. Con otra decisión se ignora. La cuenta es opcional en la base (una pantalla vieja que llama con un argumento sigue cerrando) y **obligatoria en la pantalla** mientras haya cuentas que elegir (`faltaCuentaDeLaDevolucion`).
- `fn_cuentas_para_devolver_compras()` da la lista a la compradora (`cuentas_dinero` no se lee con el módulo Mis compras).
- `fn_revisar_compras()` trae la cuenta indicada de cada cierre: «Revisar compras» la muestra («Marisol dijo que lo devolvió a BCP») y la deja **elegida de entrada** (`cuentaAlConfirmar`), pero Compras la puede cambiar.
- **El dinero sigue moviéndose en un solo lugar:** `recibir_cierre_compras`, a la cuenta que Compras confirma.

## 3. La hoja «Cerrar mi ronda», con menos texto (opción A de la maqueta)

Felipe, viendo la hoja con la pregunta nueva: «hay mucho texto, se intenta explicar cosas que no son necesarias». Se le mostraron cuatro pantallas (`docs/maquetas/mis-compras-cerrar-ronda-2026-10/`) y eligió la **A**:
sin subtítulo; el cuaderno igual (las cifras son lo esencial); los envíos en **una línea** (con uno o dos, sus códigos y las prendas; con más, cuántos) y su chip, sin la nota «Los que sigan en camino…»;
«¿Qué haces con lo que te queda?» con dos botones de dos palabras («Me lo quedo» / «Lo devuelvo») en vez de tarjetas con su explicación (lo que sigue lo dice el aviso al cerrar); y «¿A qué cuenta?» sin la nota «Compras la mira…». No cambia qué guarda cada botón.

## DESCARTÉ
- **Solo decir en el texto «Compras elige la cuenta al recibir».** Sin base, pero la compradora seguía sin poder decir a dónde entregó. Felipe eligió la otra.
- **Mover la plata a la cuenta que indica la compradora.** La que ella nombra es lo que cree haber hecho; la plata solo entra cuando Compras la recibe de verdad. Por eso es una indicación.
- **Que llegue una cuenta elegida de fábrica.** La compradora sabe dónde entregó; una cuenta de fábrica invita a tocar «Cerrar» sin mirar. Llega vacía.
- **Archivar la cuenta indicada al reabrir.** Al reabrir, el cierre se archiva y al cerrar de nuevo ella la vuelve a elegir; la tabla de archivo (`compra_cierres_reabiertos`) no la guarda.

## Cómo se pega en producción (con el OK de Felipe)
Dos partes, en orden (ADR-0195: un `alter` de una tabla en uso va aparte): `20261029165000` (la columna) y `20261029170000` (las funciones; reemplazos anclados e idempotentes). `pnpm pruebas:compras-simple-cuenta-devolucion` (6 casos).
**Mientras la parte 2 no esté en producción, la web que llama con el parámetro nuevo falla al cerrar una ronda: la web NO se publica antes que las migraciones.**
