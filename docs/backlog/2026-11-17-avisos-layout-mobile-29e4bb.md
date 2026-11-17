# 2026-11-17 · Recibir con la columna angosta: avisos y barra de filtros

Rama `claude/avisos-layout-mobile-29e4bb`. Bitácora: `docs/bitacora/2026-11-17-avisos-layout-mobile-29e4bb.md`.
Auditoría: `docs/milimetro/auditorias/2026-11-17-recibir-avisos-y-filtros-angostos.md`.

## Esperan a Felipe

- [ ] **Mirar el acomodo en un celular de verdad con envíos a medias reales.** En local se probó con el texto de su captura puesto en la pantalla: la base local no
  tiene ningún envío a medias.
- [x] **El mismo acomodo a 1024 px con el menú abierto** (Felipe, 2026-11-17: «Sí, también a 1024»). El corte del título y del buscador subió a 768 px de columna:
  «Sin aviso» va al final de la fila de filtros y el marcador del buscador ya no se corta. Las píldoras conservan su palabra hasta los 640 px.

## Sin decisión (piezas del sistema, por `/unificar`)

- [ ] **`<Aviso>` con acción se aprieta en todo celular.** Ya van tres arreglos locales de lo mismo: Plan del piso (`plan-piso.css`), la hoja de un gasto
  (`telar.css`) y este (`recepcion-conteo.css`). Lo sano es que la pieza baje su acción sola cuando no le queda ancho, y borrar los tres. Cambia cómo se ve una pieza
  en todo el ERP: Felipe elige mirando.
- [ ] **La píldora solo-ícono:** su ícono pasa 3:1 por poco en claro (3,20:1) y su lista no dice el nombre del filtro al abrirse. Propuesta: ícono al 80 % y el nombre
  en versalitas sobre la lista. Toca también «Ordenar» de Productos y de Existencias en el celular.
