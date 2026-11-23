# La letra sale de una escala — 2026-11-23

Rama `claude/letra-escala-cerrada`. ADR-0691. Actividades 1 y 2 de la lista de las ocho mejoras de estética
(`docs/backlog/2026-11-18-system-aesthetics-analysis-96733d.md`, en el PR #1976). Sin migraciones.

## Hecho

- [x] **1 · La escala en un solo lugar, con su candado.** `text-xs` 13 · `text-detalle` 14 · `text-sm` 16 · `text-lg` 18 · `text-xl` 21, en el
      `@theme` de `globals.css`. El puente `app/estilos/letra.css` lleva cada `text-[Npx]` a su escalón. 85 tamaños de 12 hojas de piezas
      comunes pasaron a `var(--text-…)`. `lib/letra-suelta.test.ts` (17 casos) y `pnpm --filter web tema:letra`.
- [x] Medido antes y después en 36 vistas: textos por debajo de 13 px, de 1.012 a 250; 3 cortes nuevos; ningún desborde horizontal.
- [x] **2 · Las cifras alineadas.** Los diez dígitos salen de Inter (`lib/letra-cifras.ts`, primera en `--font-sans`); las letras siguen en
      DM Sans. «1111» y «0000» miden lo mismo con ancho fijo. El papel que se imprime conserva sus dígitos (`app/estilos/cifras.css`).
      Dependencia nueva: `@fontsource-variable/inter` 5.3.0 (OFL-1.1). `lib/letra-cifras.test.ts` (6 casos).

## Pendiente

- [ ] **La deuda: 2.471 tamaños escritos a mano en 507 archivos.** Baja módulo por módulo (actividades 3 a 7). Al terminar cada uno:
      `pnpm --filter web tema:letra:registro`, y borrar del puente los tamaños que ya no use nadie.
- [ ] **250 textos siguen por debajo de 13 px** en las 36 vistas medidas. Vienen de hojas propias: Observatorio (`o-*`), los gráficos
      (`mc-*`, `barras-tiempo-eje`), Plan del piso (`pp-*`), Movimientos (`mv-rotulo`), Finanzas (`dock-telar`, `bolsillos`, `fin-*`) y la
      persiana de Caja (`caja-cerrada-*`).
- [ ] **Tres cortes nuevos:** un nombre de prenda largo en Existencias («Pantalon Cayla Clasico», ya llevaba `truncate`) y dos
      descripciones de Catálogo ▸ Atributos (`line-clamp-4`). Se miran en la actividad de Inventario y Catálogo.
- [ ] **Sin mirar:** las hojas y los estados que solo se abren al guardar o con la caja abierta (el cobro de Vender, un cambio en curso).
- [ ] **Desde 22 px no se vigila** (títulos de pantalla y de hoja, cifras grandes): hay 22, 24, 26, 27, 28, 30, 32 y 34 px. Decidir si
      la escala sigue hacia arriba.
- [ ] **El papel y los visores:** el puente no toca nada dentro de `.papel-fijo` ni de `[data-papel]`. Ahí también viven los visores de
      cámara y el aviso de cierre de caja, que no son papel: se quedan con su letra hasta que se revise cada uno.
- [ ] **Sin probar en papel:** un ticket, una etiqueta y un rótulo impresos de verdad, para confirmar que sus dígitos no cambiaron.
- [ ] **Decidir si lo impreso en hoja grande** (una orden, un reporte) también debería llevar las cifras de ancho fijo. Hoy todo lo impreso
      conserva los dígitos de DM Sans.
- [ ] **Dynamic:** nada llega solo. Quedan como tarea allá las hojas de `estilos/vidrio/` que pasaron a la escala y `ResumenSede` y
      `TarjetaCifra`; si quiere la misma escala, necesita sus cinco tokens (`globals.css` no viaja).
