# Auditoría al milímetro — `/recibir` ▸ la tarjeta única «Envíos · sede» · 2026-11-17 · `claude/shipments-visualization-redesign-4d0803`

Medido: 1440×900 claro quieto · 1440 oscuro (`color`) · foco con teclado a 1440 · 375×812 táctil. Servidor: `localhost:3011` (base local, Tienda
Trujillo: dos envíos que se están contando y uno terminado; vista «Todos»). Alcance: solo lo que cambia la rama, la tarjeta
`components/recepcion-envio/EnviosDeLaSede.tsx` (ADR-0676).

**Árbol (regla 1):** no hay pieza nueva. La tarjeta se arma con piezas ya decididas: `TituloSeccion` (con su «?»), `pildora-cayla` + `Globito`
(elige qué ver), `Buscador`, `TablaViva` (ADR-0596), `Chip` (estado), `BarraApilada` (lo recibido), `BotonEnlace` / `Boton` fantasma (la acción
de la fila), `EnlaceVer`, `Vacio`, `Aviso`. Por eso no lleva ficha propia: cada pieza tiene la suya.

Resumen: **0 graves · 0 medias · 2 leves (arregladas)** · 1 heredado · 2 decididos a propósito.

## Lo que se midió

| Pieza | Medida | Regla | Resultado |
|---|---|---|---|
| Estados de la tarjeta (`milimetro`) | 0 apagados, 0 ocupados que se pulsan, 0 elegidos solo por ARIA, 0 errores sin ligar, 0 bucles | `referencia/estados.md` | pasa |
| Foco con teclado (`milimetro { foco }`, 1440) | 18/18 controles con anillo, 0 flojos, 0 tapados por lo que flota | WCAG 2.4.7, 2.4.11 `[Norma]` | pasa |
| Espacio a 1440 (`espacio`) | 0 blancos bajo 24 px que fallen AA | WCAG 2.5.8 `[Norma]` | pasa |
| Espacio a 375 táctil (`espacio`) | 0 blancos bajo 44 px con el dedo (antes del arreglo: 3) · sin desborde horizontal (375 = 375) | ADR-0611, mejora 5 | pasa |
| Letra (`tipografia`, 1440 y 375) | 0 lecturas bajo 14 px, 0 interlineados cortos, 0 líneas de más de 80 | ADR-0358 `texto` | pasa |
| Contraste en claro y oscuro (`color`, 1440) | 71 textos, 0 fallan; los botones de vidrio, por `lib/vidrio-contraste.test.ts` | WCAG 1.4.3, 1.4.11 `[Norma]` | pasa |
| Oscuro (`tema:auditar`, cuenta integrante) | 0 hallazgos solo en oscuro, 0 manchas, 0 velos | ADR-0336 | pasa |
| Textos (`textos`) | sin fallas medibles | CLAUDE.md «Poco texto a la vista» | pasa |
| Quieto (`movimiento`) | 0 animaciones, 0 bucles | ADR-0625 | pasa |

## Leves, arregladas en la rama

1. **El nombre del envío medía 21 px de alto con el dedo.** `button` de la celda principal. Lleva `area-dedo` y el corte con «…» pasó al texto de
   adentro (en el botón recortaba esa área). Medido después: su `::after` mide 44 px y `blancosBajo44ConDedo = 0`.
2. **La frase quedaba más cerca de las píldoras (12 px) que de su tabla (14 px).** La tarjeta pasó de `space-y-3` a `space-y-4`:
   `gruposConProximidadRota = 0`.

## Heredado (no lo trae la rama)

1. **Los interruptores «Compacta» y «Letra grande» apagados no llegan a 3:1** (relleno 1,11:1 en claro y 1,08:1 en oscuro, sin borde). Son de
   `TablaViva`; salen igual en Ingresos. `[Norma]` WCAG 1.4.11 → va a `/color` y a la pieza `Interruptor`: es de todo el ERP y decisión de Felipe.

## Decidido a propósito

- El número del `Globito` mide 10,5 px (`app/estilos/globito-vermas.css`, ronda 15 de `/unificar`).
- `tema:auditar` marca la píldora elegida («Por recibir») como contraste 1:1: su fondo es una imagen (el ahumado) y el auditor no la ve; a la vista
  es letra clara sobre oscuro. Pasa igual con toda `pildora-cayla` elegida.

## Sin medir

- Las filas «En camino», «Sin guía» y «Por terminar», y el aviso «No se pudieron leer los envíos por recibir»: la base local no tiene ninguno. Sus
  textos y su orden están en `lib/envios-de-la-sede-reglas.test.ts`.
- La tarjeta con decenas de envíos (la base local tiene tres).
- 1280 y 1920 px (`/multi-view-responsive`).
