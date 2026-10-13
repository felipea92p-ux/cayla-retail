# ADR-0395 · Inicio de una tienda: «Tu piso», cómo está el piso sin entrar a Gestión

- **Fecha:** 2026-10-13 · **Estado:** construido y verificado en local; sin migración. Rama `claude/inicio-estado-del-piso-d7a466`.
- **Número:** reservado con `pnpm reservar adr` al empezar (ADR-0381).
- **Pedido:** Felipe, 2026-10-13: «haz lo de Inicio que muestre cómo está el piso». Quedó acordado al armar el grupo «Gestión» (ADR-0392),
  cuyo fin era que una encargada vea el piso «más directo»: Gestión da la pantalla completa; el Inicio da el veredicto en una mirada.
- **Complementa:** ADR-0392 (Gestión), ADR-0208 (Frescura del piso), ADR-0352 (Plan del piso), ADR-0306 (un módulo es una entrada del menú),
  ADR-0350 (se entiende en 5 segundos), ADR-0358 (una función, una pieza), ADR-0149 (el loader global), ADR-0389 (guías interactivas).

## Qué es

Una sección **«Tu piso»** en el Inicio de una TIENDA, con hasta dos tarjetas:

| Tarjeta | Responde | Con el piso afirmado | Cuando no se puede afirmar |
|---|---|---|---|
| Frescura del piso | «¿Tu piso está fresco?» | `46 %` de lo colgado está fresco, la barra de cuatro tramos, la línea con los porcentajes, «Aproximado» si corresponde, la tendencia contra hace 4 semanas y «N prendas esperan tu decisión» | Titular «Todavía no se sabe» (o «Nada colgado») con la frase de la pantalla y su razón |
| Plan del piso | «¿Cuánto del riel está ocupado?» | `334` de 600 prendas y la frase de estado del Plan («Tu riel está a medio llenar (56 % ocupado).») | Titular «Por cuadrar»: «Falta contar tu piso. Según el sistema cuelga N prendas, pero de verdad pueden ser muchas más.» |

La tarjeta con dato se toca entera y lleva a su pantalla (`/gestion/frescura`, `/gestion/plan-del-piso`). La que no puede afirmar INFORMA y trae
el botón que arregla lo que falta («Cuadrar el piso»), solo si la cuenta puede darlo; sin botón, la tarjeta entera lleva a su pantalla.

## Las reglas (todas con prueba en `lib/inicio-piso-reglas.test.ts`)

1. **La tarjeta nunca afirma lo que su pantalla se niega a afirmar.** Hoy ninguna tienda tiene su piso cuadrado (`cuadres_piso` está vacía), así
   que lo normal es que las dos digan «todavía no se sabe» y por qué: eso ES la respuesta. Un «41 % fresca» o un «riel al 56 %» sobre un piso sin
   cuadrar sería un número que ni Frescura ni el Plan afirmarían. La frase es la de la pantalla (`respuestaDelPiso`, `fraseDeEstado`), no otra.
2. **Quién la ve:** solo una TIENDA que no sea terminal, y cada mitad solo si la cuenta ve SU módulo (`frescura`, `plan_piso`): `pisoQueSeVe`.
   Preguntar sin el módulo deja un 42501 en el log de la base en cada carga del Inicio, así que no se pregunta. **No es un módulo nuevo**
   (ADR-0306): quien ve Frescura o el Plan ve su tarjeta, y no aparece en Roles y accesos. Almacén, Taller y el Observatorio del Admin tienen su
   propio Inicio y no la llevan.
3. **Cada lectura tiene tres finales, no dos** (`LecturaParaElInicio`): «no aplica» (la sede no tiene piso de venta, no hay propuesta, no hay
   capacidad medida) no dibuja nada; «falló» dice «No se pudo leer el piso. Lo demás sí está al día» y nunca un 0; «ok» dice su veredicto. Las
   lecturas **nunca lanzan**: un `throw` en el Inicio cae en `error.tsx` y se lleva la pantalla entera. Cada mitad falla por separado.
4. **Unidades y prendas no se mezclan** (Formidable 2026-10-10 (c)): el porcentaje cuenta UNIDADES colgadas; «por decidir» cuenta PRENDAS
   (modelo y color). Nunca van en la misma frase. Si lo ya decidido no se pudo leer, «por decidir» pasa a «Hasta N prendas por decidir».
5. **El paso se dice UNA vez.** Si las dos tarjetas están bloqueadas por lo mismo («falta cuadrar el piso»), el botón queda en la primera y la
   otra es solo un enlace a su pantalla: dos «Cuadrar el piso» seguidos se leen como dos tareas (`vistaPisoInicio`).
6. **La tendencia solo dice lo que cambió:** «Más viejo» (ámbar) o «Más fresco» (verde) que hace 4 semanas, con las palabras de la pantalla;
   «igual» o sin dato no dicen nada.

## De dónde sale cada cosa

- **Frescura:** `getPisoDeFrescuraParaElInicio` (`lib/frescura.ts`) lee UNA tienda con las mismas piezas de la pantalla (`rpcFrescura`,
  `armarFrescuraSede`, `puertaDelPiso`) y `pisoFrescuraParaElInicio` (`lib/inicio-piso-reglas.ts`) la reduce a cifras chicas y planas: nunca
  viajan las prendas. La barra y la línea de porcentajes salen de `segmentosDelPiso` y `lineaDelPiso`, que se movieron a `lib/frescura-piso.ts`
  y ahora usan también `FrescuraPiso` y `FrescuraRed` (una sola cuenta, tres pantallas).
- **Plan:** `getPisoDelPlanParaElInicio` (`lib/plan-piso-servidor.ts`) arma la propuesta con `armarPropuesta` y devuelve colgadas, capacidad,
  si el piso está cuadrado, si la capacidad es provisional y las colgadas sin grupo. `getCapacidadPisoConEstado` (`lib/capacidad-piso-servidor.ts`)
  distingue «la sede no tiene capacidad medida» (no dibuja) de «la lectura falló» (lo dice); `getCapacidadPiso` conserva su comportamiento.
- **Dibujo:** `components/inicio/PisoDelInicio.tsx`, hecho solo con piezas únicas (`TarjetaCifra`, `BarraApilada`, `Chip`) y tokens. Es un
  Server Component async dentro de un `<Suspense>` en `app/(app)/page.tsx`, en la columna izquierda, después de «Te toca». Una tarjeta ocupa
  todo el ancho; dos van lado a lado desde `sm` y de nuevo en `xl` (en `lg` la columna es angosta).

## Cómo se decidió (la prueba ciega)

Tres lectoras sin contexto vieron las tarjetas ya dibujadas (método de ADR-0357). Lo que cambió el diseño:
- Un «—» grande con borde punteado lo leyeron como «error» o «cero». Lo que no se puede afirmar pasó a ser un **titular** («Todavía no se
  sabe», «Por cuadrar») con la pregunta de la pantalla, y se dibuja con borde sólido como las demás.
- Las tres dijeron que tocarían la tarjeta que pide algo concreto («contar tu piso») y no la que solo dice «todavía no»: por eso la tarjeta que
  no puede afirmar trae su botón, y por eso el botón no se repite (regla 5).
- «Frescura» a secas suena a fruta: la frase lleva la pregunta de la pantalla.

Una revisión adversarial (lentes por tema y un escéptico por hallazgo) cambió además: la tendencia, `pisoQueSeVe` (antes la regla estaba
repartida entre la página y el componente), la diferencia entre «sin capacidad» y «falló», y el grid.

## Lo que queda abierto (se deja a la vista, no se resuelve aquí)

1. **El costo.** La lectura de Frescura no tiene caché y es lo más pesado del Inicio, la pantalla más visitada. En una carga en frío del
   documento, «Hoy» y «Te toca» no esperan a «Tu piso» (el `<Suspense>`), pero en una NAVEGACIÓN interna a «/» el loader global (ADR-0149)
   suelta la ficha cuando llega el cuerpo COMPLETO de la respuesta: el velo dura lo que dure la lectura del piso. **Se mide en producción antes
   de cachearla** (por sede y con tiempo de vida corto) o de sacarla a una lectura del navegador.
2. **Las palabras de la pantalla, no del Inicio.** «Todavía no se puede saber: faltan días seguidos cobrando con la prenda» y «cuadrar el piso»
   confundieron a las lectoras. Son las frases de Frescura y del Plan, y la tarjeta debe decir lo mismo que ellas; mejorarlas es un cambio de
   esas pantallas, de todo el sistema a la vez.
3. **Dos formas de decir «¿puedo creer este número?».** «Aproximado» (Frescura, un `Chip`) y «Capacidad provisional» (Plan, una línea al pie)
   avisan lo mismo con dos palabras y dos dibujos. Una sola pieza queda por decidir con Felipe (ADR-0358).
4. **«Tu piso» no se apaga con «Ajustar».** «Ajustar» es de los avisos de «Te toca»; esta sección no es un aviso sino un veredicto que siempre
   está. Si Felipe quiere poder ocultarla, es otra decisión.
5. **El lugar.** Va después de «Te toca» y antes de los accesos de la columna derecha. Dónde se ve mejor lo decide Felipe mirándolo.
6. **El real todavía no se vio.** Con la base local ambas tarjetas están en «sin saber», porque ninguna sede tiene cuadre. Las versiones con dato
   se vieron con una página de ensayo temporal de datos de mano (borrada), no con una tienda real.

## Se rompe si

- La pantalla de Frescura o del Plan cambia lo que afirma y la tarjeta no: las dos salen de las mismas funciones (`respuestaDelPiso`,
  `fraseDeEstado`, `pasoDeLaPuerta`), y la prueba compara contra la lectura real de una tienda guardada en `__fixtures__/frescura-sede.json`.
- Se agrega una lectura que lanza: el Inicio entero cae en `error.tsx`. Toda lectura nueva de esta sección devuelve `LecturaParaElInicio`.
- Una cuenta ve el módulo pero la base le responde 42501: la tarjeta dice «No se pudo leer el piso», no un 0.

## Verificación

- `tsc` y `eslint` limpios; suite completa de la web: 451 archivos, 158 272 pruebas; las de esta sección son `lib/inicio-piso-reglas.test.ts`
  (37; incluye la lectura real de una tienda, frases, pasos, la tendencia, quién ve cada mitad y la concordancia «cuelga/cuelgan»).
- Navegador, con la cuenta de una colaboradora de tienda de la base local: Inicio a 1440 px en claro y en oscuro, y a 375 px sin scroll
  horizontal; los dos estados «todavía no se sabe» / «por cuadrar» y, con datos de mano, los de «con dato» (barra, «Aproximado», tendencia en
  ámbar y en verde, «N prendas esperan tu decisión», capacidad provisional y «no cuenta N prendas sin grupo»).
- `pnpm --filter web guias:recorrer -- --guia inicio --cuenta integrante` a 1440 y a 375 px: 10 pasos, sin escrituras y sin modales abiertos;
  `tema:auditar` del Inicio (8 visitas): 0 hallazgos solo en oscuro.
- A 375 px, en el paso «Tu piso» de la guía, la tarjeta de la guía queda sobre la parte baja de la tarjeta del Plan (la sección es alta); es
  el comportamiento del motor con una pieza alta, igual que en otros pasos.
- **No se probó** con colaboradoras reales, ni con datos de producción, ni se midió el costo de la lectura (ver «Lo que queda abierto», 1).
