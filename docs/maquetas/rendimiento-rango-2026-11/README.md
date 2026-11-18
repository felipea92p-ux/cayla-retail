# Maqueta · Rendimiento: rango de fechas (máx. 30 días) y «El equipo» que ya no se sale (2026-11-17)

Dos cosas que Felipe vio en Gestión ▸ Rendimiento (`app/(app)/rendimiento` → `components/rendimiento/`):

1. **«El equipo» se sale de su tarjeta.** `PilaPersonas` (`components/ui/AvatarPersona.tsx`) pinta todas las caras en una fila sin medir
   el espacio; con 14 personas pasa de la tarjeta.
2. **No hay un rango de fechas a medida.** El período es Hoy · 7 días · Este mes (`PRESETS`, `lib/rendimiento-vista-reglas.ts`).

Abrir `index.html` (o la config `maqueta-referentes` del navegador integrado: `http://localhost:3031/rendimiento-rango-2026-11/`).
La barra negra cambia la pila («Como ahora» enseña el defecto), el tema y el ancho (375 = la hoja del celular).

## Qué se prueba tocando

- **RANGO** (cuarto lugar del segmento) abre **solo un calendario**: sin atajos, campos ni botones. Tocas el primer día, mueves el mouse
  (la banda se estira) y al tocar el último el rango se aplica y se cierra. Las flechas cambian de mes.
- **Máximo 30 días**, los dos extremos incluidos: pasado el límite los días se rayan y dicen «Pasa de 30 días». Tampoco se puede elegir
  del día de hoy en adelante ni antes del 1.º del mes pasado.
- Un toque antes del primer día lo reemplaza; dos toques al mismo día dan un solo día. «Esc» o tocar fuera descarta.
- Teclado: ← → ↑ ↓ mueven el día, Inicio/Fin la semana, RePág/AvPág el mes, Enter elige, Esc cierra (con `stopPropagation`, ADR-0136).
- Al aplicar: el segmento dice «5 – 30 oct», aparece la píldora «Días: …» con su ✕, y la frase, las cifras y «El equipo» se rehacen.
- **«El equipo» corregido:** la pila mide su caja; lo que no cabe se cuenta en «+N» y abre la lista con nombre.

## Decisiones tomadas (justificadas en el pie de la maqueta)

| Pieza | Decisión |
|---|---|
| Entrada | Cuarto lugar del mismo segmento, no un botón nuevo en otra parte. |
| Calendario | Solo un mes, sin atajos ni botones; el segundo día aplica y cierra. En el celular, hoja desde abajo (ADR-0479). |
| Tope | 30 días contando ambos extremos; se bloquea antes de equivocarse, no con un error después. |
| Piso | 1.º del mes pasado = lo que `rangoDeLecturaPersonas` ya carga: sin pedirle más a la base. |
| Pila | Cabe lo que cabe + «+N» con lista; no se achican ni se envuelven las caras. |

## Lo que cuesta

Solo la web, sin migración: `MesaRendimiento.tsx`, un `RangoRendimiento.tsx` nuevo (los días y saltos de mes salen de
`lib/estados-periodo.ts`), `rendimiento-vista-reglas.ts` (`RANGO_MAX_DIAS` y `tramoValido`, con prueba), `PilaPersonas`, la guía
interactiva (`data-guia`, huella) y un ADR. Dinero, stock y permisos no se tocan.

**Abierto:** el 1 de marzo (febrero de 28 días) solo deja volver 28 días con ese piso; el buscador («del 5 al 12») hoy no tiene tope y
pasaría por la misma validación.

## Reglas que respeta

Solo tokens, claro y oscuro, sin rebote ni bucle, todo se apaga con `prefers-reduced-motion`. Datos inventados (el repo es público).

## Lo que decidió Felipe

2026-11-17: pidió solo un calendario, sin atajos, campos ni botones (el rango se elige ahí y se aplica al segundo toque) y aprobó construirla. Construida en `components/rendimiento/RangoRendimiento.tsx` y `PilaDelEquipo.tsx`.
