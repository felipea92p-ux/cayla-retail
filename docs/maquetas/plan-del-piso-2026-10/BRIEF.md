# Brief · Plan del piso ▸ Propuesta — maquetas de estilo (2026-10-10)

**Estado: solo diseño, sin decidir.** Nada de esto está en el ERP. Datos **inventados** (Tienda AQP, sábado 10 de octubre, 21:14).
Felipe vio el rediseño del PR #944 (riel en dos barras, tres tarjetas, aviso) y dijo que **el estilo general no lo convenció**. No dijo qué le molesta en concreto:
no lo adivines; propón **una dirección clara y distinta** de las otras y deja que él elija **mirando** (su regla: «elige mirando, nunca por una descripción»).

## Para qué sirve la pantalla (la finalidad sale de aquí, no de la imagen)
Una persona de tienda (líder o encargada de sede, sin formación técnica) abre «Plan del piso» y quiere saber, **en 5 segundos**:
1. ¿Qué tan llena está mi tienda? (cuántas prendas cuelgan del riel frente a las que caben)
2. ¿La ropa está repartida como debería? ¿Qué grupo tiene de más o de menos?
3. ¿Hay algo que me toque hacer ahora?

«Riel» = el perchero donde cuelga la ropa de venta. Cada **grupo** (Polos/tops/blusas, Jeans, Pantalones/faldas/shorts, Vestidos/conjuntos, Bodys/corsets/lencería, Abrigo y capas) se lleva una parte del riel.
La **propuesta** reparte la capacidad entre los grupos mezclando lo que hace la industria con lo que de verdad vende la sede (hoy casi nada: 5 ventas confirmadas).

## La verdad que el diseño NO puede ocultar ni exagerar
- La sede **no ha cuadrado su piso** («por cuadrar»): las **78 prendas** son lo que *el sistema* cree que cuelga, **no lo que hay de verdad** (puede ser mucho más). Cualquier «le falta / le sobra» es condicional a eso. Nunca presentes «hoy» como un hecho.
- La **capacidad (1,800) es provisional**: falta contarla.
- Solo hay **5 ventas confirmadas** en 14 días (y **210 sin registrar** que todavía no cuentan): la parte «venta propia» pesa **6 %**; la propuesta es casi pura industria. Un rango como «entre 9.1 y 81.6 %» con 2 ventas dice «casi no sabemos».
- **45 categorías** siguen «por revisar»: la propuesta usa el grupo que puso el sistema; confirmarlas se hace en la pestaña «Grupos».
- **No inventes ninguna cifra.** Todo sale de `window.DATOS` (ver `base.html`). Puedes derivar (sumas, porcentajes, «1,722 libres» = 1,800 − 78) pero que sea exacto.
- Miles con **coma** («1,800»), decimales con **punto** (convención de Perú en este ERP).

## Reglas del sistema (CAYLA Dynamic) — no se negocian
- **Colores: solo los tokens `--color-*` de `base.html`** (claro y oscuro ya definidos). **Cero hex, `rgb()`, `rgba()`, `bg-white`** fuera de `base.html`. Mezclas con `color-mix(in srgb, var(--color-x) N%, var(--color-y))` sí. Prohibido el gradiente decorativo y la sombra de decoración (superficies pegadas al fondo: sin sombra; solo una elevación real puede llevarla, con `--color-sombra`).
- **Rojo (`--color-rojo`)** es «acento sagrado»: **máximo 2 usos en toda la pantalla**, nunca para pintar un grupo ni un estado normal.
- **Tipografía:** títulos y cifras grandes en `var(--serif)` (EB Garamond); todo lo demás `var(--sans)` (DM Sans). Cifras con `font-variant-numeric: lining-nums tabular-nums`. Nada bajo 11 px; texto de apoyo ≥ 12.5 px. Etiquetas pequeñas en versalitas con `letter-spacing:.13em`.
- **Superficies:** tarjeta = `--color-papel` + borde `1px --color-sand` + radio 16; hundido/zebra = `--color-hueso`; nota explicativa = fondo `--color-hueso` (como `.cy-nota`). Controles radio 8. Botones: `.cy-btn` (secundario por defecto; el primario negro solo para LA acción principal, y aquí casi no hay).
- **Movimiento (ADR-0136):** solo como **respuesta a una acción** o una entrada única; `var(--ease-cayla)`, 200–500 ms, **sin rebote, sin bucle, nunca decorativo**; todo se apaga con `prefers-reduced-motion`. Solo `transform` y `opacity`.
- **Vocabulario:** «sede/tienda», «líder», «cliente»; **nunca** «sucursal», «empleado», «jefe». Español de Perú, tuteo, frases cortas, **cero estadística ni jerga a la vista** («peso de la venta», «industria», «Wilson», «muestra efectiva» se **traducen a un veredicto**; el detalle va tras un toque «¿Por qué?», nunca solo con hover).
- **Los 9 principios «Formidable»** (en este orden de prioridad si chocan): sin manual · una pregunta, una respuesta (un protagonista, una acción principal) · simplicidad profunda (la complejidad se traduce a un veredicto) · lenguaje de tienda · contenido primero (la prenda pesa más que los marcos) · lo difícil, a un toque · perdonar antes que preguntar · quitar antes de agregar · de punta a punta (vacíos, errores, 375 px).
- **Escritorio primero** (Mac mini con mouse y teclado); a 1024 px con menú abierto el contenido mide **657 px** y a 375 px, **341 px**: tiene que verse bien en los tres.
- **Accesibilidad mínima:** contraste AA del texto en claro **y** oscuro, foco visible, blancos de mouse ≥ 24 px (32 de objetivo), `aria-label`/`role` en lo que sea dibujo, `button` de verdad en lo que se toca.

## Qué entra y qué no
**Hay que resolver**, en el área de «Propuesta» (todo lo que va bajo las pestañas): el estado de llenado (78 de 1,800), el reparto por grupo hoy contra propuesta, lo que hay fuera del riel
(Accesorios 11 prendas, meta 16–18 % de la venta; Bolsos y calzado 4, meta 6–8 %), el aviso de las 45 categorías por revisar (con su botón a «Grupos»), el estado «por cuadrar» y cómo se calcula (en palabras).
**No se rediseña** el marco (lateral, barra de arriba, título «Plan del piso», pestañas): ya viene dado.
Las cifras viven en `window.DATOS`: **renderiza desde ahí con JS** cuando sea práctico (así no se copian mal), o escribe el HTML a mano con los mismos números.

## Cómo se entrega (protocolo)
1. Escribe **un solo archivo** `fragmentos/<id>.html` (HTML + `<style>` + `<script>` opcional). **Todos tus selectores llevan tu prefijo** (`p0-`, `pa-`, `pb-`, `pc-`) para no chocar con los otros diseños; puedes usar el kit `.cy-*` de `base.html` o dibujar lo tuyo.
2. La raíz de tu diseño lleva `container-type:inline-size` y tu **responsive va con `@container`** (no con `@media` de la ventana): el contenido mide 1024 / 657 / 341 px según la vista.
3. El JS va en una función autoejecutable, sin globales; no midas el DOM al cargar (tu sección está oculta si no es la elegida): usa CSS o `ResizeObserver`, o escucha `window.addEventListener('plan:diseno', e => …)`.
4. **Míralo antes de entregar** (obligatorio): `node armar.mjs <id>` (arma TU copia aislada, sin pisar a nadie) y luego `node capturar.mjs <id> <claro|oscuro> <1440|1024|375> <salida.png>`; abre el PNG con la herramienta de lectura de imágenes y corrige. Mira **claro y oscuro, a 1440, 1024 y 375**; itera al menos dos veces. Una captura con `--pagina` incluye el marco.
5. Al terminar, responde con el resumen que se te pida. No toques `base.html`, `armar.mjs`, `capturar.mjs` ni los fragmentos de otros.
