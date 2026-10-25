# ADR-0509 — «Nueva orden» se arma sobre la lista de Órdenes, y lo escrito sobrevive a salir

**Estado:** aceptada, **web en su PR (sin migración, nada en producción que pegar)** · **Fecha:** 2026-10-25 · **Decidió:** Felipe (la lista de 7 actividades, aprobada el 2026-10-25) ·
**Sigue a:** ADR-0396 (Nueva orden: el modelo primero, la tabla única, la hoja ancha con ficha viva) y ADR-0400 (fases y tela de la orden)

## Contexto

Felipe (2026-10-25): «me gustaría crear las órdenes en una misma pantalla, no que se abra otra; en general todo este módulo de Producción no me
satisface». Una revisión de solo lectura del módulo (10 exploradores, 10 escépticos y un crítico) separó dos quejas distintas:

1. **La hoja tapaba la lista.** «Nueva orden» era una hoja de 1080 px sobre «Órdenes»: mientras se armaba, la lista de lo que ya se fabrica
   desaparecía detrás.
2. **Abrir una orden no mostraba la orden abierta.** `abrir_orden_produccion` devuelve el id y el número de la orden (`OP-000012`), y la web los
   descartaba: el aviso decía «Orden abierta» y la hoja se cerraba sobre una lista que todavía no tenía la fila.

Y una trampa callada: el token de idempotencia de la apertura vivía en un `useRef(crypto.randomUUID())` creado al montar el formulario. Un formulario
que se queda abierto (lo que se quería) habría mandado el MISMO token en la segunda orden, y la base habría devuelto la primera sin error.

## Decisión

**1. El formulario vive en la página, no en una hoja.** `NuevaOrdenProduccionForm` ya no sabe dónde vive: recibe un `marco` (`MarcoDeLaOrden`) y
la lista le pone `ordenes-lista/MarcoDePagina`, una sección con la lista a la vista debajo. El ancho que decide si la ficha de la orden va a la
derecha o en una barra de abajo es el de ESA tarjeta (`@container`, 880 px), no el de la pantalla: con el lateral abierto a 1280 px quedan ~950 px.
Escape y el clic fuera ya no cierran (una página no se descarta por un roce): cierran «Cancelar» y guardar.

**2. Dos niveles.** El primero es lo que se decide siempre: el modelo, el tipo y la matriz de cantidades. El segundo (fases, tela, fecha de entrega y
nota) viene resuelto y plegado bajo UNA línea que lo resume («7 fases · todo en el Taller · sin tela elegida · sin fecha de entrega»), y se abre
solo cuando algo adentro está mal o cuando la guía de foco quiere llevar el cursor ahí (`lib/orden-nivel-dos-reglas.ts`): lo que está mal no se esconde.

**3. La orden recién abierta se ve.** La lista salta a la pestaña donde quedó (una muestra cae en «Muestras»), le quita los filtros que la esconderían,
la marca con la animación de siempre (`data-recien`, una vez) y la lleva a la vista; el aviso trae «Ver OP-000012» (≥ 7 s: tiene botón). Si la base no
devolvió un número válido, el aviso es el de siempre: nunca se inventa uno (`leerOrdenCreada`). La URL queda limpia (`?nueva=` y `?sugerida=` se quitan: con
F5 el formulario volvía a abrirse aunque la orden ya existiera).

**4. El token es de la orden, no del formulario.** `lib/token-de-orden.ts`: nace con el montaje y se renueva solo cuando la base CONFIRMA una orden (nunca
tras un error o una respuesta perdida: ahí el reintento necesita el mismo). Lo vigila `lib/token-de-orden.test.ts`.

**5. El borrador sobrevive a salir** (`lib/borrador-orden.ts`). Cada cambio con trabajo se guarda en el navegador (`localStorage`), por Taller y por modelo
(`cayla:borrador-orden:<taller>:<modelo>`), con un índice de los diez más recientes por Taller. Nunca lanza: una ventana privada, el disco lleno o los datos
del sitio bloqueados devuelven `false`/`null`. Lo leído se valida (una versión vieja, a medias o hostil se ignora). Cuatro consecuencias:
   - **La guardia cambia.** Mientras el borrador QUEDÓ guardado, salir por el menú, por «atrás» o cerrando la pestaña ya no pregunta «¿Salir sin guardar?»
     (no se pierde nada, y preguntar sería mentir); solo «Cancelar» pregunta, porque cancelar sí descarta. Si no se pudo guardar, o todavía no hay modelo al que
     atarlo, la guardia es la de siempre (`useSalidaSinGuardar`, `soloAlCerrar`).
   - **La lista lo ofrece**: «Hay una orden a medias en este computador · Blusa Emma · 120 prendas · hace 5 min», con «Retomar» y «Descartar» (que se puede deshacer).
   - **Elegir un modelo que ya tenía borrador lo ofrece** en vez de pisarlo en silencio; mientras la persona no decide, lo que escribe no se guarda.
   - **Se suelta con la orden**: abrirla borra lo que ESTE formulario guardó, y solo eso.

**6. «Crear otra orden después de esta».** Un interruptor junto a «Abrir orden»: prendido, al abrir una orden el formulario nace de nuevo con el mismo tipo, las mismas
fases y el mismo modelo (si ya existía), con las cantidades vacías, y la lista no se lleva la vista. Cada orden manda su propio token.

## DESCARTÉ

- **Dejar la hoja y solo sumar «Ver OP-…».** Arregla la queja 2 pero no la 1: la lista sigue tapada.
- **Una ruta aparte (`/produccion/ordenes/nueva`).** Es exactamente «que se abra otra» pantalla.
- **Un estado «borrador» en la base.** Un borrador no es una orden: sumarlo toca la tabla de órdenes (que ya cuelga de stock, costos y fases) y exige migración; el costo
  de no tenerlo en la base es que no viaja de un computador a otro, y para armar un lote en el mismo Taller no hace falta.
- **Un segundo botón «Abrir y crear otra».** Dos botones de envío compiten por el mismo clic y ensucian la guía de «qué sigue». El interruptor se prende una vez y vale para toda la tanda.
  (Esto se aparta de lo aprobado en la lista, que decía «el botón»; Felipe puede pedir el botón.)
- **Un solo apunte al «último» borrador.** Era lo primero que escribí: empezar el modelo A, pasar al B y abrir la orden de B dejaba el borrador de A guardado pero invisible, y
  nunca se soltaba. Por eso hay un índice (`fix(produccion)`, con la prueba que fallaba primero).

## SE ROMPE SI

- **El Taller trabaja desde dos computadores a la vez.** El borrador no viaja: se ve solo en el navegador donde se escribió. El aviso lo dice («en este computador»).
- **Alguien más usa el mismo computador** y retoma un borrador ajeno: el aviso es neutro («hay una orden a medias», no «dejaste»), y retomar o descartar no toca la base.
- **Se acumulan más de diez borradores en un Taller**: el más viejo se suelta (el almacén del navegador es de ~5 MB).
- **Se reintenta una apertura con OTRAS fases o tela.** La huella de la idempotencia en la base no cubre las fases ni la tela: el reintento devuelve la orden vieja sin
  error. Es anterior a este cambio y está en la RPC (zona roja: dinero y stock): queda como tarea aparte, no se tocó aquí.
- **La lista tiene tantas filas que el formulario queda lejos de ellas.** Con el formulario abierto, la primera fila empieza a ~1300 px del borde de arriba (el formulario plegado mide ~680 px):
  la lista no queda tapada, pero tampoco se ve entera sin bajar.

## Qué NO cambia

Ninguna migración, ninguna RPC, ningún permiso, ningún monto ni movimiento de stock: lo que viaja a la base es idéntico (las mismas líneas, las mismas fases, la misma tela, un token por orden).

## Verificación

- Pruebas: la lógica pura del borrador (`lib/borrador-orden.test.ts`, 29 casos: guardar y leer, validar, almacén que falla, índice, tope, huérfanos), la de la lista, la del nivel 2 y el token, más las que
  leen el formulario como texto (ficha, guardia, matriz, token, corte de red). Suite completa, tipos, lint, `knip` y `knip:produccion` en verde en cada commit.
- En el navegador (Playwright con el Chrome del sistema, sobre una página temporal con la lista real y una base falsa; no se commitea): el borrador sobrevive a una recarga y «Retomar» lo devuelve; «Cancelar» pregunta y
  descarta; con el almacén roto salta el aviso del navegador al recargar; «crear otra» manda tokens distintos; a 1024, 1280, 1440 y 1920 px sin desborde horizontal; en modo oscuro, ningún texto del formulario,
  de la lista ni de los avisos nuevos falla solo en oscuro.
- `/chaos` (lo que se puede atacar sin base): basura de hasta 200 KB en el almacén, textos con HTML (salen como texto), doble clic en «Abrir orden» (una sola llamada), dos pestañas (la otra se repinta sola),
  respuesta 500 con «crear otra» prendido (el formulario y el borrador se quedan; el reintento funciona).
- **No se pudo correr** (Docker caído, sin base local): `pnpm --filter web guias:recorrer`, `pnpm --filter web tema:auditar` con sus dos escenarios nuevos, y el `/chaos` de la parte de base. No se probó con una
  persona del Taller ni con un agente ciego (`/formidable` queda propuesta, no aplicada).

## Piezas

`components/ordenes-lista/MarcoDePagina.tsx`, `components/orden-produccion/NivelDos.tsx`, `lib/orden-nivel-dos-reglas.ts`, `lib/token-de-orden.ts`, `lib/borrador-orden.ts`; cambian
`components/NuevaOrdenProduccionForm.tsx`, `components/ordenes-lista/OrdenesLista.tsx` y `FilaDeOrden.tsx`, `components/orden-produccion/FichaOrden.tsx`, `lib/ordenes-lista-reglas.ts`, la guía y la huella de
`/produccion/ordenes` y el registro de escenarios de oscuro. El interruptor de «crear otra» y el pliegue del nivel 2 se dibujan con piezas del sistema (`Interruptor`, `BotonVerMas`/`FilasDeMas`); el pliegue
es un componente local que las junta: si Felipe lo quiere como pieza única del sistema, pasa por `/unificar`.
