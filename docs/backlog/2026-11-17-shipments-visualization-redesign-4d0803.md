# Recibir mercadería: la tarjeta única de envíos (ADR-0676) — pendientes · 2026-11-17

- [ ] **Miniaturas de las prendas en cada fila** (decisión de Felipe: «cerrar ahora, miniaturas después»). La lista no trae las prendas de cada
      envío y las tablas de envíos solo se leen por funciones de la base: hace falta una función nueva que devuelva, por envío, sus primeras
      prendas (producto, foto, color, categoría) y, en la web, `<MiniaturaPrenda>` en la celda «Envío» de
      `components/recepcion-envio/EnviosDeLaSede.tsx`. Trae SQL para pegar en producción: lo pega Felipe.
- [ ] **Ver en pantalla las filas «En camino», «Sin guía» y «Por terminar»** y el aviso «No se pudieron leer los envíos por recibir»: la base
      local no tenía ninguno el 2026-11-17. Su lógica está probada (`lib/envios-de-la-sede-reglas.test.ts`); falta la vista.
- [ ] **Retirar la cara anterior de Recibir** (`EnviosParaRecibir`, `RecibidoEnLaSede`, `FiltrosDeEnvios` y sus pasos de la guía): solo sale si la
      base no tiene las funciones de ADR-0393, y producción las tiene. Es borrar código y decidir que esa cara ya no vuelve.
- [ ] **Los interruptores apagados de `TablaViva`** («Compacta», «Letra grande») no llegan a 3:1 (1,11:1 en claro, 1,08:1 en oscuro). Es de la
      pieza `Interruptor`, de todo el ERP: va por `/color` y lo decide Felipe.
- [ ] Si la tienda extraña filtrar por proveedor (hoy se busca), `TablaViva` necesitaría filtrar una fila con varias opciones.
