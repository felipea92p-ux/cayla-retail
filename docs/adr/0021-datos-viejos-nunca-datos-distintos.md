# ADR-0021 — Datos viejos, nunca datos distintos: el punto medio en vez de local-first

**Fecha:** 2026-09-09
**Estado:** Aplicado en `/inventario` y `/vender`; pendiente extenderlo al resto
**Deriva de:** ADR-0013 (fases de latencia) y ADR-0018 (motor de sincronización)
**Sustituye, por ahora:** la Fase 2 de ADR-0013 — local-first queda diseñado pero sin construir

## Contexto

Felipe pidió que el sistema sea "lo más robusto posible", que sea rápido, y que **no queden
cosas en el aire ni haya conflictos**. Las tres cosas juntas descartan local-first como
próximo paso, y describen otro.

La distinción que resuelve el pedido:

| | Local-first (ADR-0018) | Este ADR |
|---|---|---|
| Qué vive en el navegador | Una **copia** de los datos | Una **respuesta reciente** del servidor |
| ¿Puede divergir de la base? | **Sí** — dos verdades que sincronizar | **No** — hay una sola verdad |
| Riesgo | Conflictos, estados imposibles | Solo que el dato sea viejo |
| Al escribir | Hay que decidir quién gana | Se refresca y listo |

**El principio, en cinco palabras: datos viejos, nunca datos distintos.** Un dato viejo se
corrige solo con el siguiente refresco y su antigüedad tiene un techo conocido. Un dato
*distinto* es un estado imposible, y eso es lo que el principio 2 prohíbe.

Además, la medición del mismo día quitó la urgencia: la pantalla con sesión carga en
300-750 ms (no los ~2 s que se asumían), y el costo es **fijo por petición**, no por dato —
`/mas`, que casi no consulta nada, tarda más que `/comercial`, que consulta todo. Eso
descarta cachear datos como solución y deja dos caminos: no hacer la petición (local-first,
con su riesgo) o **dejar de esperarla para mostrar la pantalla** (esto).

## Decisión

Tres piezas, ninguna de las cuales crea una segunda copia de la verdad.

**1. Caché del router del cliente (`staleTimes: 30`, ya aplicado en Fase 1).** Volver a una
pantalla vista hace menos de 30 s es instantáneo, sin viaje al servidor. Seguro porque los
22 componentes que mutan algo llaman `router.refresh()`, que invalida esa caché entera:
nadie ve su propio cambio desactualizado. El techo de antigüedad es 30 s y solo aplica a
cambios hechos por otra persona en otra sede.

**2. La estructura no espera a los datos.** `/inventario` y `/vender` hacían `await` de
todo antes de devolver JSX: la cabecera, la navegación y los botones —que no dependen de
ninguna consulta— se quedaban detrás del catálogo entero. Ahora la página solo espera la
persona (memorizada por el layout, sin viaje nuevo) y el resto baja dentro de su
`<Suspense>` con un esqueleto.

En `/vender` se parte además en dos boundaries: el historial del día era una consulta chica
que esperaba al catálogo entero solo por compartir `Promise.all`.

**3. Los esqueletos con forma, no un "Cargando…".** Un texto suelto no dice qué viene ni
cuánto falta; un bloque con la forma del contenido se lee como "ya se está armando" y evita
el salto de la página cuando llega lo real.

## Consecuencias

- **No se agrega estado nuevo en ninguna parte.** Es la misma consulta al mismo servidor;
  cambia cuándo se dibuja la pantalla, no de dónde salen los datos. Por construcción, este
  cambio no puede producir un conflicto.
- **Un fallo dentro de un `<Suspense>` sigue subiendo al `error.tsx` de la sección** —
  Suspense no atrapa errores, solo esperas. Así que la política de ADR anterior sigue
  mandando: si el catálogo falla, se cae la pantalla entera, incluida la cabecera. Es lo
  correcto para stock, y es deliberado.
- **`tolerar()` estrenó su primer caso real y conviene tenerlo de ejemplo:** el historial
  del día en `/vender`. Ahí el dinero se ve pero no se decide — el cuadre real lo calcula
  `cerrar_caja` en el servidor contra `ventas`, no contra esa lista. Y del otro lado está
  el costo de fallar en duro: dejar a una Encargada sin vender, con la clienta enfrente,
  porque no cargó un historial. Ese intercambio no se paga.
- **Falta extenderlo**: `/comercial`, `/finanzas/*`, `/produccion` y `/buscar` siguen
  esperando todo antes de dibujar. Es mecánico, mismo patrón.
- **No verificado en vivo todavía.** Compila y pasa las pruebas, pero que la estructura
  aparezca antes que los datos hay que verlo corriendo, con sesión iniciada. Es la misma
  distinción entre "compila" y "funciona" que este mismo día costó tres rondas con la
  región de Vercel.
- **Local-first no se descarta, se posterga.** ADR-0018 sigue siendo el diseño válido para
  el día que la tienda necesite operar con el wifi caído — que es lo único que este camino
  no puede dar, porque siempre hay una petición de por medio.
