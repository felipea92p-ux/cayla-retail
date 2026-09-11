# ADR-0031 — El reintento no cobra dos veces: el token lo pone el cliente y sobrevive al fallo

**Fecha:** 2026-09-10
**Estado:** Construido y verificado contra el Postgres local; producción ya tenía la mitad
de base desde antes (columna, índice y guarda), así que no necesita DDL.
**Deriva de:** ADR-0013 (Fase 3), ADR-0018 (lo que su diseño NO resuelve), ADR-0022
(los errores hablan idioma CAYLA), ADR-0026 (una firma nueva borra la vieja).
**Afecta:** `supabase/migrations/0054_venta_idempotente.sql`,
`apps/web/components/RegistrarVentaModal.tsx`, `apps/web/lib/error-escritura.ts`,
`packages/database/src/types.ts`

## Contexto

ADR-0018 dejó escrito que la venta sin internet (Fase 3) exige una cola de escrituras, y
que una cola exige que `registrar_venta` sea idempotente. La conclusión que se sacó
entonces —y que se repitió durante días— era que había que construir esa idempotencia.

**Era falsa para producción.** Medido contra la base el 2026-09-10: producción ya tiene la
columna `ventas.token_cliente`, el índice único `ventas_token_cliente_key`, el parámetro
`p_token uuid default null`, la guarda que rechaza un token reusado con otros datos y el
`exception when unique_violation` que resuelve la carrera. Nadie lo escribió en un archivo;
apareció comparando cuerpos de funciones entre entornos. La pieza más difícil de la Fase 3
llevaba semanas construida y sin usar.

Le faltaban tres cosas para servir, y la tercera es la que convirtió esto en un ADR:

1. Nadie mandaba el token: `RegistrarVentaModal` llamaba con tres parámetros nombrados.
2. **Local no tenía nada de esto** — ni la columna, ni el índice, ni el parámetro.
3. No estaba decidido **quién genera el token y cuánto vive**, que es lo único de todo
   esto que no es mecánico.

## La decisión

### A. El token lo genera el navegador, una vez por intento de venta, y sobrevive al fallo

Un `crypto.randomUUID()` creado en el **primer envío** y guardado en un `useRef` que vive
mientras el modal esté abierto. No se regenera al reintentar. No se borra al fallar.

Las tres alternativas y por qué no:

- **Generarlo en el servidor.** No sirve para nada: el problema es exactamente que la
  respuesta del servidor no llegó. Un identificador que solo existe del lado que no
  contesta no puede identificar el reintento.
- **Derivarlo del contenido del carrito** (un hash de items + caja + método). Dos ventas
  legítimamente idénticas —la misma clienta lleva dos veces la misma prenda, o dos clientas
  compran lo mismo en la misma caja— colisionarían, y la segunda devolvería la primera en
  vez de registrarse. Sería perder ventas de verdad para evitar duplicar unas hipotéticas.
- **Regenerarlo cuando cambia el carrito.** Es la tentadora, y es la peligrosa. El caso que
  importa es justamente ése: intentó, pareció fallar, agregó una prenda y volvió a darle. Si
  el token se regenera, la primera venta —que sí había entrado— queda cobrada y la segunda
  también. Manteniéndolo, la RPC rechaza y avisa.

**Por qué en `ref` y no en estado:** tiene que sobrevivir a los re-render del carrito sin
provocar ninguno. Un `useState` acá solo agregaría renders.

### B. El rechazo se traduce en el cliente, no se corrige en la RPC

El `raise exception` del token reusado llega con `code = 'P0001'`, que por la regla de
`lib/error-escritura.ts` pasaría tal cual. Pero su texto habla de "token" y de "reutilizar":
son palabras del sistema, no del mostrador, y contradicen ADR-0022.

**Se traduce en `error-escritura.ts` y no se arregla en la función** porque el mismo texto
está vivo en producción desde el parche a mano, y cambiarlo allá es DDL en el proyecto
compartido con Dynamic. La traducción cubre los dos entornos desde un solo sitio, hoy, sin
pedirle a nadie que pegue nada. Es la única excepción a "no re-traducir lo que las RPC ya
dicen bien", y está anotada como tal en el propio archivo.

### C. El mensaje de "se cayó la red" deja de mentir, pero solo donde puede

`traducirError` decía, ante un `Failed to fetch`:

> «No se guardó nada — revisa el internet y vuelve a intentar.»

**`Failed to fetch` no puede saber eso.** No distingue entre "la petición no salió" y "salió,
entró, y se cortó la respuesta". En el segundo caso la venta está registrada, el stock
descontado, y la pantalla está invitando a repetirla. Es la peor combinación posible: la
frase que más tranquiliza es la que más daño hace.

Ahora `traducirError` acepta `{ reintentoSeguro: true }`, y **solo la venta lo pasa**. Ahí el
mensaje dice la verdad completa: volvé a intentar con el mismo carrito, si alcanzó a entrar
el sistema la reconoce. Las otras 16 escrituras siguen con el mensaje viejo, que promete de
menos — pero no promete de más.

## Consecuencias

- **Sirve hoy, sin cola y sin local-first.** La red de la tienda ya corta llamadas a la
  mitad; no hace falta que se caiga el wifi entero. Esto es la mitad del valor de la Fase 3
  cobrada por adelantado, con tres archivos.
- **Local y producción convergen en esta función**, que es lo que permite que la cola se
  pruebe en local y signifique algo. Siguen divergiendo en lo de siempre
  (`personas` vs `public.personas`, `fn_puede_operar_sede` vs `puede_operar_sede`).
- **`packages/database/src/types.ts` quedó con un parche a mano más.** Regenerar a ciegas lo
  borra, igual que borraría los tipos de la taxonomía. Se le puso al archivo una cabecera que
  lista los parches con fecha — hasta hoy no existía, y ése es exactamente el mecanismo por
  el que un parche se pierde. Que ninguno de los dos entornos tenga el esquema completo sigue
  siendo el problema de fondo, y sigue en el BACKLOG.
- **El candado de permiso de esta función se endureció de paso**: `if not
  fn_puede_operar_sede(...)` pasó a `if ... is not true`. Con NULL, `not NULL` tampoco es
  true y el `raise` no dispara — el candado se abre solo. Producción ya estaba endurecida
  (`34_candados_no_null.sql`); local no. Se cerró acá porque es la misma función que este
  cambio reescribe. **El resto de las funciones locales no se revisó**: queda en el BACKLOG.
- **Lo que esto NO es:** no es la venta sin internet. Sin cola no cambia nada visible cuando
  el wifi está caído — la llamada sigue fallando. Es la red que hace segura a la cola, no la
  cola. Y las dos preguntas de ADR-0013 §C —el umbral de "stock de sobra" y qué ve la
  Encargada cuando se bloquea— siguen abiertas y siguen siendo de Felipe.

## Cómo se verificó (no "debería funcionar")

Contra el Postgres local, todo dentro de una transacción con `rollback`:

1. Mismo token, mismo carrito, dos veces → **una** venta, **un** movimiento, stock 50 → 48.
2. Mismo token, carrito distinto → rechazado, y el stock no se movió.
3. Sin token, dos veces → dos ventas distintas (el comportamiento viejo, intacto).
4. La llamada de tres parámetros nombrados —la que hacía el modal— sigue resolviendo.

Y la prueba se probó al revés antes de creerle: cambiando el segundo token por uno nuevo,
el punto 1 falla con «el reintento devolvió otra venta». Un verificador que siempre aprueba
también diría que todo está bien.

Contra PostgREST local, por HTTP, que es donde murió el arreglo del 10 de septiembre:
la llamada con `p_token` y la llamada sin él **las dos resuelven** — devuelven el error de
negocio de adentro de la función («La caja … no existe»), no «Could not find the function in
the schema cache». Y contra producción, `explain select retail.registrar_venta(…, p_token =>
null)` devuelve un plan.

**Lo que NO se verificó:** una venta real en el navegador. Local tiene cero variantes, así
que no hay nada que vender sin sembrar datos primero. La firma sí se probó por HTTP, que es
donde estaba el riesgo.
