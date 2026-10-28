## 🧺 Cajón de la prenda: los cuatro lugares y la suma explicada (2026-10-04) — solo web, **sin SQL**; rama `claude/stock-locations-garment-card-35f915`

Pedido de Felipe: que la ficha de la prenda muestre dónde puede estar el stock (Colgada/Piso, Guardada/Almacén, Apartada, Dañada) con la suma
explicada y la aclaración de que la caja solo cobra lo colgado y libre; con cada cifra clickeable si no era trabajo grande (no lo fue).

- [x] **1 · El bloque de los cuatro lugares** (`components/DesgloseStockPrenda.tsx`, `lib/existencias-prendas.ts`: `desgloseDePrenda`,
  `lineaDeLaSuma`, `aclaracionDeLaCaja`) en `CajonPrendaExistencias.tsx`. La suma de las cuatro (con lo dañado) y, si hay dañadas, «N sin contar
  la dañada». Ningún texto afirma que ese N sea el de la lista (la lista muestra solo lo libre). Prueba atada a `sumarCantidades` y a
  `cantidadCobrable` (`lib/existencias-prendas.test.ts`).
- [x] **2 · La grilla por talla suma «+N apart.»** (una talla con una apartada se leía «0 · 0», igual que una sin nada).
- [x] **3 · Cifras clickeables:** Almacén → «Reponer prenda»; Apartada y Dañada → sus ventanas filtradas a la prenda (`deLaPrenda`, estado
  `soloPrenda` en `InventarioPanel.tsx`). Solo son botón con algo que hacer y permiso para hacerlo (ADR-0161).
- [ ] **Verificar con datos reales tras publicar:** una prenda de TRU con apartadas o dañadas: la suma del cajón = Piso + Almacén + Apartada +
  Dañada, y «cuentan como stock» = el número de la lista. (No consulté producción: si todavía no hay apartados ni dañadas reales, habrá que
  crear una de prueba.)
- [x] **4 · Revisión (4 lentes + escéptico, 10 confirmados, todos bajos):** ventana filtrada que se vaciaba con un «no hay nada» falso (ahora se cierra
  sola, `filtradaVacia` en `InventarioPanel.tsx`); contraste del cero (taupe sin opacidad); tonos iguales a los chips de la lista (Apartado ámbar,
  Dañado rojo); un solo verbo («Reponer prenda»); la aclaración «cuentan como stock» (falsa respecto a la lista) reescrita; prueba de la caja atada
  a `cantidadCobrable`.
- [ ] **Menor, no hecho:** las ventanas de Dañadas y Apartados abiertas desde el cajón siguen titulándose «Prendas dañadas» / «Apartados» sin decir
  que están filtradas a una prenda (cada fila nombra su prenda). Si molesta, es una prop opcional en ambos modales, que **choca en texto con #796**
  (`ResolverDanadosModal`), por eso no la toqué.
- [ ] **Decisión de Felipe — las otras superficies:** la lista «Por prenda» (`ExistenciasPorPrenda.tsx`) y las tarjetas siguen con Piso y Almacén
  LIBRES, sin Apartada ni Dañada (la lista ya marca «Dañado · N» por talla). ¿También ahí? Hoy el cajón es la única superficie que reparte los
  cuatro lugares.
- [ ] **Abierto, no tocado:** la cifra «En camino» (traslados hacia la sede) no entra en las cuatro ni en la suma: todavía no es stock de la
  sede. Se ve en la lista; si el cajón también debe nombrarla, es otra decisión.
