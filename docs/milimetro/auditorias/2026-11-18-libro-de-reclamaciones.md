# Auditoría al milímetro — Tienda web ▸ Libro de Reclamaciones · 2026-11-18 · `claude/video-analysis-implementation-check-a4f3c2`

Medido: la lista (`/tienda-web/libro-de-reclamaciones`) y el cajón de una hoja, a 1440×900 claro y oscuro, a 375×812 claro, y con las animaciones
encendidas y apagadas (28 mediciones, con Playwright y la cuenta admin de `tema/cuentas.mjs`). Servidor: `localhost:3010`, con la base local tipo
producción y una hoja de prueba. Medidores: los `referencia/medir.js` de `/milimetro` (también con `{ foco: true }`), `/espacio`, `/tipografia`,
`/color`, `/movimiento` y `/textos`. Sin gráficos, así que `/graficos` no aplica.

Resumen: **0 graves · 2 medias arregladas · lo demás es de piezas compartidas** · se subieron a 14 px cinco textos de lectura que estaban entre 12 y 13,5 px, y «Enviar respuesta» ya no lleva un «Guardando…» escondido.

## Arreglado en esta rama

| Qué | Dónde | Medido antes | Regla | Nivel |
|---|---|---|---|---|
| Texto de lectura bajo 14 px (la fecha y el tipo de la fila, el pedido, el plazo, el conteo de la paginación y la nota) | `LibroPantalla.tsx` | 12 y 13 px | «La letra de lectura» (ADR-0358, `texto`): `texto-detalle` / `text-sm` | Media · regla del repo |
| El plazo y los datos de la hoja en el cajón | `HojaCajon.tsx` | 13,5 px | La misma | Media · regla del repo |
| «Enviar respuesta» no guarda (abre la confirmación), pero pasaba `cargando={false}` y llevaba un «Guardando…» invisible | `HojaCajon.tsx` | `esperaEscritaAMano` 1 | `accion.guardar`: `cargando` solo en el botón que guarda; el que guarda es «Sí, enviar», con «Enviando…» | Media · regla del repo |

Medido otra vez después del arreglo: `lecturaBajo14` = 0 en la lista (1440 y 375) y `esperaEscritaAMano` = 0 en las 14 vistas.

## Lo que queda: de piezas compartidas o decidido a propósito

- **«Hoja anterior» apagado sin motivo a la vista** (contraste 1,6): es la navegación ↑ ↓ de `<Cajon>` en el primer registro. Es de la pieza (`components/ui/Cajon.tsx`)
  y pasa igual en todos los cajones. → `/unificar` (cajón), no esta pantalla.
- **Dos textos de 13 px en el cajón**: el pie de `<Campo>` («Le llega a … ») y el chip del `<ComboResponsable>`. Los dos son de la pieza.
- **Espacio**: 3 valores fuera de la escala de 4 en la lista, todos dentro de `nota-cayla` y de la fila de `<Tabla>` (padding de 14/18, de la pieza). En el cajón, 0.
- **Color**: 0 textos que fallen en claro y en oscuro. 3 «no concluyentes» sobre vidrio, del chip «Por responder» (4,44 y 3,93 medidos sobre el fondo que se ve
  a través, que cambia con la aurora; `lib/vidrio-contraste.test.ts` lo cubre para la pieza). En oscuro, 18 y 10 avisos APCA y ninguna falla WCAG.
- **Textos**: un corte a propósito (el detalle de la fila, `truncate`, que se lee entero en el cajón) y `botonEnDos` en la tarjeta «VENCEN PRONTO» de `<TarjetaCifra>`.
- **Movimiento**: con las animaciones encendidas, 3 en la lista y 19 en el cajón, ninguna en bucle, todo quieto antes de 3,4 s. Apagadas, 0.
- **Foco**: 9 controles en la lista y 5 en el cajón. Ninguno sin anillo ni tapado. El halo del campo de la respuesta se revisó a ojo.

## No se midió

- La hoja pública de la tienda (`apps/tienda`), que tiene su propia identidad (ADR-0616) y queda fuera del chequeo.
- El estado de error de la respuesta en el navegador, porque el medidor no lo dispara. Lo cubren las pruebas de `lib/libro-reclamaciones-reglas.test.ts`
  (`problemaDeLaRespuesta`, `avisoDelError`) y la guía (`boton-confirma.test.ts`).
