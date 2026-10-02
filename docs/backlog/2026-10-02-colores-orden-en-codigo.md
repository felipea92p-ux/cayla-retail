## Colores: lo que queda de `colores.orden` (ADR-0312 actualización c, 2026-10-02)

- [ ] **Retirar `colores.orden` del todo.** Ninguna lista lo usa para ordenar, pero sigue vivo como dato muerto: la API lo
  escribe con 2000 al crear (`app/api/productos/colores/route.ts`), el PATCH lo acepta, y `ColoresLista.tsx` lo arrastra
  (`Color.orden`, la fila nueva con `orden: 2000` y el guardado de edición). Retirarlo exige migración de producción: decidir si
  se borra la columna o se deja inerte. Hoy no estorba; el candado `lib/colores-sin-orden.test.ts` evita que se vuelva a usar.
- [ ] **Orden de fusión.** Esta rama sale de `claude/color-scales-families-c7513c` (donde vive `enLaCarta`) y no compila sin
  ella: se fusiona después, o se rebasa sobre `main` cuando esa se fusione. Esa a su vez espera que se pegue la migración
  `20261002180000` (candado de familias).
