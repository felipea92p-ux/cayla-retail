# Auditoría al milímetro — Compradores «como tu banco»: la lista y el estado de cuenta de una persona (ADR-0704 act. d) · 2026-11-26 · claude/compradores-como-tu-banco
Medido: 1440×900 claro (vivo y quieto) · 375×812 claro con dedo · 1440 oscuro · foco con teclado · color con la pantalla entera a la vista (1440×2000, claro y oscuro)     Servidor: `http://compradores.localhost:3067` (worktree, sin base)
Resumen: 0 graves · 1 media abierta, de una pieza del sistema que ya existía · 0 leves abiertas (2 corregidas) · 4 decididos a propósito

Cómo se midió: las dos vistas reales (`CompradoresVista` con `ListaCompradores`, y `DetalleComprador` con `EstadoDeCuenta`) en una página temporal,
sin sesión ni base, a escala: la lista con 18 personas (las 6 de producción de ese día más 12 inventadas) y el detalle con una persona inventada
de 34 compras en 6 días. Los siete medidores del set en un Chrome sin pantalla (32 mediciones) y, tras los arreglos, espacio y foco otra vez.
**No se midió con el marco del ERP**: ver «Sin medir».

## Graves

Ninguno.

## Medias

Abierta, de una pieza del sistema que ya existía (no nace de este cambio; vive en `components/ui/`, que comparte Dynamic):

1. **`<Volver>` mide 42×42 con el dedo** — `components/ui/Volver.tsx` — medido a 375 px con puntero grueso — regla del repo: 44 px (ADR-0611,
   mejora 5) — va a /espacio. Ya anotada en la auditoría `2026-11-26-compradores-tabla.md`. Espera a Felipe.

## Leves

Corregidas en este mismo cambio:

2. Espacios fuera de la escala de 4 en las filas de la lista y del estado de cuenta (14 px de `py-3.5`, 10 px de `py-2.5`, 6 px de `gap-1.5` y
   `mt-1.5`): 24 valores en la lista y 32 en el detalle — ahora 16, 12 y 8; medido después: 0 fuera de escala propios — /espacio.
3. La barra de cada fila de la lista no le decía su cifra al lector de pantalla (va oculta para él): ahora la fila dice «gastó S/ X de S/ Y» en
   texto solo para el lector — /graficos.

## Decidido a propósito

- **La barra de la lista no escribe su número a la vista:** es un indicio de cuánto gastó; la cifra está a un toque, en el detalle. Felipe eligió
  esta fila mirando la maqueta («solo datos necesarios»).
- La barra del resumen tampoco: lo que gastó y lo que le diste van escritos justo debajo.
- `<BotonVerMas>` trae 13 px de relleno: es la pieza elegida (ADR-0358).
- Los nombres de proveedor en mayúsculas («MIYAN 777 S.A.C.») son el dato tal como se registró.

## Lo que salió limpio

Estados: sin hallazgos en las diez pasadas; foco medido en 16 controles de la lista y 14 del detalle, ninguno sin anillo ni tapado (los 8 de
la lista que no lo toman son las filas plegadas, que están ocultas). Color: 89 textos de la lista y 91 del detalle, 0 fallan en claro y 0 en
oscuro; ya no queda ninguno sin concluir (6 y 7 quedan para segunda mirada con APCA y pasan WCAG). Tipografía: nada bajo 13 px, todo de la
escala (13 · 14 · 16 · 18 · 21) más las cifras de exhibición. Movimiento: 0 bucles; quieto, 0 animaciones. Textos: sin fallas medibles. Las
capturas en oscuro y a 375 px se miraron.

## Sin medir

- **Con el marco real del ERP** (menú, cabecera de vidrio y fondo Lienzo): la página temporal no lo lleva.
- **`tema:auditar`**: necesita un banco local con cuentas; no se corrió.
- **Lo que guarda dentro del detalle** (Entregar plata, Anular en una línea, la herramienta de revisión, Cerrar su ronda): no se abrió aquí.
- El calendario de «Rango» abierto (es la pieza de Rendimiento, sin cambios) y el foco con teclado a 375 px.
