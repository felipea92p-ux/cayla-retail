# ADR-0172 — Traslados: rediseño de lista y detalle, conteo por borradores y traslados vacíos ocultos

**Fecha:** 2026-09-22 · **Estado:** aceptado (Felipe aprobó la demo el 2026-09-22) · **Sin migraciones** ·
**Sobre:** ADR-0105 (lectura operativa de Traslados), ADR-0169 (paleta oficial) · **Demo:** `docs/maquetas/traslados-rediseno-2026-09/`

## Contexto

Las capturas de producción de Felipe (Tienda TRU) mostraban tres traslados «Completado» con
«0 unidades · 0 variantes · Sin prendas», un detalle casi vacío (solo la cabecera de una tabla) y el
filtro «Otra sede» pintado con el `<select>` nativo del sistema operativo, en el azul de Windows.

Se consultó producción (solo lectura): **los 4 traslados que existen tienen 0 líneas y 0 movimientos**
(la tabla `movimientos` solo guarda conteos físicos). Son cabeceras que quedaron de la limpieza de datos de
prueba, no un fallo del flujo: `iniciar_traslado` ya rechaza un traslado sin ítems. El Traslado 4
(Taller → Tienda AQP) sigue «en tránsito» vacío, y le pedía a AQP confirmar una recepción de nada.

ADR-0169 ya había pasado Traslados a la paleta oficial «solo visual». Lo que faltaba era lo que la
maqueta proponía en contenido y operación.

## Decisión (Felipe, 2026-09-22, sobre la demo)

1. **Traslados vacíos: se ocultan, no se borran.** `esTrasladoVacio` / `separarVacios`
   (`lib/traslados-reglas.ts`) los apartan en `getTrasladosDeLaSede`, `getTrasladosEnCurso` y
   `getTrasladosCerrados`. El contador del menú (`getTrasladosPorAtender`) los excluye con
   `transferencia_items!inner`. Al líder, el pie de la lista le dice cuántos se ocultaron. Si alguien entra por
   URL al detalle de uno, el panel explica qué es y no ofrece nada que confirmar.
2. **La insignia dice lo que le toca a quien mira** (`estadoTraslado`): «Por confirmar» (rojo),
   «Por revisar» (ámbar, el líder de destino), «Con diferencia» (ámbar), «En camino» (pizarra), «Completado»
   (verde). Un cerrado que tuvo diferencia es «Cerrado con diferencia» en neutro, no verde. Lo usan la lista y
   el título del detalle.
3. **Lista:** «Salió» con día y hora; «Entra a tu sede» / «Sale de tu sede»; el contenido con miniaturas
   o, si ninguna prenda tiene foto, **los colores de lo que va** (`TrasladoResumen.colores`, de `colores.hex`);
   «Ver detalle» pasa a botón sutil, así solo pesa el botón de la acción real. La franja dice «N traslados
   necesitan tu acción» y lleva directo al más urgente.
4. **Filtros:** dirección y otra sede con píldoras (`pildora-cayla`); el `<select>` nativo se va.
5. **Detalle:**
   - **Recorrido en 4 pasos** (`recorridoTraslado` → `TrasladoRecorrido.tsx`): salió, en camino, recibido y
     cerrado, cada uno con cuándo y quién. `getTrasladoDetalle` ahora también lee `confirmado_por` y
     `cerrado_por` (vía `fn_nombres_personas`, que ya se usaba), y el color y la foto de cada prenda
     (`getAparienciaVariantes`, tolerante a fallo), así la fila usa `ProductoVarianteCelda` como Existencias y
     Conteo. Con eso se cierra el pendiente «Traslados › detalle sigue con la celda de texto».
   - **Tres cifras:** enviado, recibido (con barra de avance mientras se cuenta) y diferencia. La diferencia
     total no se dice hasta terminar de contar: a medio conteo, «−15» solo sería lo que falta contar.
   - **Se cuenta, no se asume (conteo por borradores, `leerRecepcion`).** Las casillas empiezan vacías,
     con «−», «+» y «Coincide» por línea. Lo contado queda en la pantalla. Al confirmar, primero se manda
     cada línea cambiada a `registrar_recepcion_traslado` y después `confirmar_traslado`. Antes cada casilla
     venía llena con lo enviado y guardaba al salir de ella, y el botón de confirmar seguía apagado hasta
     pasar por todas. Contar no pide Responsable; guardar sí (ADR-0161).
   - **Un solo campo para escanear:** si la prenda está en el envío, suma 1 a su línea. Si no, se agrega
     como prenda de más (antes era una tarjeta aparte).
   - **Confirmar pasa por `<Modal>`** (ADR-0136) con enviado, recibido y diferencia.
   - **Cerrar con diferencia exige una nota** (`notaCierreValida`, 5 letras como mínimo) y dice cuántas
     prendas entran y cuántas salen del inventario.
   - **En celular, una tarjeta por prenda** con el contador a la mano. La tabla obligaba a deslizar de lado.

## Qué NO cambia

Ninguna RPC, tabla, política ni regla de stock. Quién confirma, cuándo entra el stock (solo al confirmar
si todo coincide, o cuando un líder cierra) y quién cierra siguen en `confirmar_traslado` y
`cerrar_traslado_con_diferencia`. `situacionTraslado` (ADR-0105) sigue decidiendo qué pide acción.

## Descartado

- **Anular los 4 traslados vacíos en la base:** pedía un estado nuevo «anulado» y una migración en producción.
  Felipe eligió ocultarlos. Siguen en la base.
- **Precargar lo recibido con lo enviado** (como antes): es un clic, pero se confirma sin mirar. «Coincide»
  por línea cuesta un toque por prenda y obliga a verla.
- **Guardar cada toque de «+» al instante:** una RPC por clic, con el loader global (ADR-0149) parpadeando
  en cada una.

## Consecuencias y riesgos

- Si falla una línea a mitad de camino, lo guardado queda guardado (la RPC solo fija una cantidad) y la
  pantalla dice qué falló. Es un estado que el modelo ya admite: recepción empezada.
- La nota obligatoria vive solo en la pantalla: la RPC todavía acepta `p_nota` vacía (BACKLOG).
- `cerradosAcotados` ahora cuenta las filas LEÍDAS (vacías incluidas): así se sabe si la consulta llegó al tope.

## Cómo se verificó

Typecheck, lint y las 24,161 pruebas unitarias (115 archivos) en verde, 21 de ellas nuevas en `traslados-reglas.test.ts`.
Sin base local ni sesión en este entorno, se montaron los componentes reales en una ruta temporal, sin
commitear, con datos de muestra. Se capturaron la lista, los filtros y el detalle en cuatro estados (por
confirmar contando, con diferencia para el líder, cerrado con diferencia, saliente) a 1440 px y 390 px, sin
scroll lateral. **Falta:** verlo con una sesión real contra producción. El modal de confirmar no se pudo abrir
en esa ruta, porque el combo Responsable necesita la base.

## Se rompe si

- Una pantalla nueva lee `transferencias` sin `separarVacios` o `!inner`: vuelven las recepciones de nada.
- Alguien vuelve a guardar por casilla: el botón de confirmar deja de reflejar lo contado.
