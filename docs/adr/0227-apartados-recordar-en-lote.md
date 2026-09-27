# ADR-0227 — Apartados: recordar en lote, con cada aviso anotado

**Fecha:** 2026-09-26
**Estado:** Aprobado por Felipe el 2026-09-26 (orden de las funciones del spike: «hay que realizar todo por orden»; paso 1).
**Afecta:** migración `20260926233000_separacion_avisos.sql` (tabla `retail.separacion_avisos`, RPC
`registrar_aviso_separacion` y `fn_avisos_separaciones`); web: `lib/separaciones.ts`, `lib/separaciones-reglas.ts`,
`components/apartados/TodosVista.tsx`, `ModalesApartado.tsx` (`RecordarModal`).
**Spike:** `docs/maquetas/apartados-v2-2026-09/` («Recordar en lote»).

## El problema

Dos días antes de que venza un apartado hay que escribirle a la clienta, y otra vez si ya venció. El botón de WhatsApp
de «Todos» abría el chat sin dejar rastro: nadie sabía si la otra vendedora ya le había escrito, y a veces nadie lo hacía
hasta que el apartado se liberaba solo y había que devolver el adelanto. Además, el mensaje de un apartado vencido decía
«te espera hasta el» una fecha que ya había pasado.

## Decisión

- **Cada aviso es una fila que no se edita ni se borra** (`separacion_avisos`: quién avisó, a qué apartado, cuándo), el
  mismo criterio append-only de `movimientos`. «¿Ya se le avisó hoy?» se deriva de esa lista (día de Lima), no es una
  columna que un segundo aviso pisa. Queda lista para que «Actividad» (ADR-0207) cuente la historia del apartado.
- **No se toca `separaciones` ni `buscar_separaciones`**: la lectura es una función propia (`fn_avisos_separaciones`).
  Si falla o la migración aún no está, la pantalla sigue igual y trata a todas como «por avisar»: nunca esconde a alguien.
- **Candado:** operar esa tienda y ver el módulo Apartados (`fn_ve_modulo('apartados')`, que las funciones viejas de
  Apartados todavía no preguntan), y firma el responsable del combo (`fn_actor_persona_id(true)`).
- **Pantalla:** en «Todos», un aviso «N clientas por avisar hoy · M ya avisadas» con «Escribirles en lote». La cola son
  los abiertos que vencen en 2 días o menos o que ya vencieron y siguen en su gracia; primero el que vence antes. El botón
  de WhatsApp de cada fila abre la misma ventana con esa sola clienta, y el que ya se avisó hoy se ve con un visto verde.
- **El chat se abre antes de hablar con la base**: el navegador solo deja abrir una ventana en el mismo toque. Si la base
  rechaza el aviso, la ventana avisa que el chat se abrió pero no quedó anotado. Lo envía la persona desde el WhatsApp de
  la tienda; el sistema no manda mensajes solo.
- **El mensaje de un vencido** dice que venció y hasta cuándo se le sigue guardando (la gracia de 2 días, D3).

## Alternativas descartadas

- **Una columna `ultimo_aviso_en` en `separaciones`**: más simple, pero pierde quién avisó antes y altera una tabla en uso.
- **Enviar el WhatsApp desde el sistema** (API de WhatsApp Business): dinero y una integración externa nueva; hoy la
  tienda escribe desde su propio número (acta del club, D-92 a D-111).

## Cómo se verifica

`pnpm pruebas:separaciones` (53/53 contra Postgres: la líder avisa y firma ella, dos avisos quedan los dos, sin el módulo
no se avisa, con el módulo sí, un liberado no se avisa ni se cuenta, `authenticated` no toca la tabla). En la pantalla:
«Todos» con un apartado que vence mañana → aparece en la cola; «Escribirles en lote» → se abre WhatsApp y la clienta
queda con el visto verde; al día siguiente vuelve a la cola si sigue abierta.
