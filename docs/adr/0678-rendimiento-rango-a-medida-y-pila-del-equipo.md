# ADR-0678 — Rendimiento: un rango de fechas a medida (máx. 30 días) y «El equipo» que mide su tarjeta

- **Fecha:** 2026-11-17 · **Estado:** construido en la rama `claude/custom-date-range-filter-a43ea9`. Solo web: sin migración, sin dinero,
  stock ni permisos.
- **Pidió:** Felipe, 2026-11-17, con dos capturas de Gestión ▸ Rendimiento: «se está saliendo» (las caras de «El equipo») y «no permite un
  rango de fecha personalizado: que se despliegue un calendario, se elijan 2 fechas, se aplique el filtro y máximo 30 días». Pidió una maqueta
  navegable (`docs/maquetas/rendimiento-rango-2026-11/`), después «solo un calendario sin más nada, y ahí se selecciona el rango», y aprobó construir.

## Las decisiones

1. **Entrada: un cuarto lugar «Rango» en el segmento del período** (Hoy · 7 días · Este mes · Rango), no un botón nuevo en otra parte. Con un rango
   puesto, el lugar dice «20 oct – 10 nov» (`tramoCorto`). El ícono de calendario lo distingue de los tres atajos.
2. **Solo un calendario** (`RangoRendimiento.tsx`): un mes, flechas para cambiar de mes, sin atajos, campos ni botón «Aplicar». El primer toque
   fija el inicio, el segundo aplica y cierra; un toque anterior al primero lo reemplaza; el mismo día dos veces es un solo día. En escritorio
   flota bajo el segmento (vidrio de lo que flota, ADR-0596); bajo 640 px es una `<Modal>` (la hoja del celular, ADR-0479).
3. **Tope de 30 días contando los dos extremos** (`RANGO_MAX_DIAS`). Se bloquea antes de equivocarse: los días que pasan de 30 desde el primero
   salen rayados con «Pasa de 30 días», sin mensaje de error. Mismo tope para la dirección (`?desde=&hasta=`) y para el buscador («del 5 al 12»):
   la regla es una sola, `tramoValido` en `rendimiento-vista-reglas.ts`.
4. **Piso: el 1.º del mes pasado** (`pisoDelRango` = lo que ya lee `rangoDeLecturaPersonas`). No se le pide más a la base. Tampoco se eligen días
   futuros. Si el rango empieza en el mes pasado, el eje del gráfico se alarga hacia atrás (`diasDelEjeConTramo`) y no se encoge mientras se arrastra.
5. **«El equipo» mide su tarjeta** (`PilaDelEquipo.tsx`): con 14 personas las últimas caían fuera. Caben las caras que caben (`carasQueCaben`,
   32 px con 6 de pisada y 52 para el «+N»); el resto va a «+N», que abre una lista con nombre y el punto de lectura. Tocar a alguien de la lista
   hace lo mismo que su cara. Se mide la tarjeta, no la propia caja: el valor de una tarjeta de cifra mide lo que miden sus caras y siempre «cabría».
6. **Escape es de este control** (ADR-0136, act. 2026-09-26): ambos paneles lo oyen en captura con `stopPropagation`, para que el Escape de la
   pantalla (que limpia lo puesto) no borre el rango.

## Lo que se descartó

- Un campo de texto o dos campos de fecha: Felipe pidió solo el calendario.
- Un tope mayor o sin tope: 30 días es lo que Felipe fijó; más allá, «Este mes» y el mes pasado ya existen.
- Leer más historia: el piso se queda en lo que la pantalla ya carga.
- Achicar o envolver las caras: la pila pierde su forma; «+N» con lista conserva nombre y acción.

## Abierto

- **1 de marzo:** febrero tiene 28 días, así que ese día el piso solo deja volver 28 días en vez de 30.
- Probado con datos inventados (escritorio, 1180 y 375 px); falta con cuenta real, a 1920 px y `/formidable`.

## Dónde vive

`components/rendimiento/RangoRendimiento.tsx`, `PilaDelEquipo.tsx`, `MesaRendimiento.tsx`, `lib/rendimiento-vista-reglas.ts` (con su prueba),
`app/estilos/vidrio/rendimiento.css` (`.rango-*`, `.mesa-pila*`), guía `rendimiento.rango` en `lib/guias/pantallas/gestion.ts`. Movimiento: una
vez, sin rebote ni bucle, apagado con las animaciones (ADR-0136, ADR-0625). Sin cambios en `recetas.css` ni en `components/ui/`: **no cambia el
diseño de Dynamic.**
