## 📦 Recibir ▸ Contar en dos mitades (2026-11-11, ADR-0645) — solo web, sin migración; rama `claude/redesign-receiving-merchandise-6cbf2f`, **PR abierto: [felipea92p-ux/cayla-retail#1779](https://github.com/felipea92p-ux/cayla-retail/pull/1779)**

- [x] 1 · La lista se queda con todo lo del envío: avance, buscador, un botón «Filtros», quién cuenta y el único «Revisar y cerrar».
- [x] 2 · El contador en tres bloques con pie fijo; en el último modelo lleva al que quedó sin contar.
- [x] 3 · Tallas y colores: contestado por tipo de prenda, su tarjeta y su hoja con guardado solo; «Agregar talla o color» abre la hoja completa de la prenda.
- [x] 4 · «Llevar al stock ahora» como botón principal (tarjeta y pie de la hoja), y el filtro «Por llevar al stock».
- [x] 5 · «¿Pasó algo con esta prenda?» a la vista: Llegó dañada, Es otra prenda, Anotar algo.
- [x] 6 · Angosto y celular: apiladas con la vista que baja al contador; a 375 px, contador + isla + lista en hoja.
- [x] 7 · Cierre: guía interactiva recorrida a 1440 y 375 px (huella 280), `tema:auditar` en 4 escenarios (0 solo en oscuro), `pnpm focus`, `pnpm sugerir`, ADR.
- [ ] **Felipe mira el celular y las mitades apiladas** (la hoja de la lista «también la vemos juntos») y dice si se ajusta.
- [ ] **`/chaos` sin correr.** A la base local compartida le faltan 51 migraciones de esta rama y `scripts/flujo-de-negocio/estado.mjs` y `scripts/chaos/invariantes.mjs` solo conocen ese contenedor. Decide Felipe: actualizar la base compartida, o que los dos instrumentos lean otro contenedor (como ya hace `TEMA_DB_CONTENEDOR`).
- [x] Los 3 cambios de `/formidable`, con el OK de Felipe (2026-11-11): el contador baja a las tallas tras «Llegaron las N» (`c4c3282c5`), un solo botón negro (`c089acb26`), una sola frase de lo que falta (`0075e6e5e`). Medidos; informe en `docs/formidable/recibir-contar-dos-mitades.md`.
- [x] De paso: la página ya no salta de vuelta al guardar en el celular ni con las mitades apiladas (`history.scrollRestoration = "manual"` mientras se recibe).
- [ ] **Prueba ciega de `/formidable` sin correr** (un filtro de la API frenó al agente) y prueba con una colaboradora real.
- [x] PR abierto con `/abrir-pr` el 2026-11-11 ([felipea92p-ux/cayla-retail#1779](https://github.com/felipea92p-ux/cayla-retail/pull/1779)): `main` entró sin conflictos, sin choques con otros PR, y su descripción dice lo de Dynamic y el cambio de `HojaPrenda`. **Falta que Felipe lo fusione.**

### Decisiones abiertas (de Felipe)

- [ ] **«Corregir» en la tarjeta de un modelo que ya entró al stock.** Hoy la tarjeta dice «Ya están en el stock» y no ofrece nada; `CorregirSalida` existe pero solo se llega desde la fila «En stock» de la lista, que un modelo que sigue en la lista no tiene. Toca stock.
- [ ] **«Llegó dañada» en una prenda nueva sin crear** está apagado («primero crea la prenda»). La otra salida: dejar anotarlo como observación.
- [ ] **Un color nuevo se crea solo en las tallas marcadas**, no en todas las tallas de la prenda. Cambia qué variantes nacen en el catálogo.
- [ ] **«Es otra prenda» abre la hoja grande de antes** (`HojaTallas`); se puede acortar.
- [ ] Lo que inventó la maqueta y no existe: aviso de número raro, conflicto entre dos personas que cuentan lo mismo, seguir sin conexión. «Revisa y cierra» y «Cerrado» no se tocaron.

### Visto de paso (no es de esta obra)

- [ ] **`components/ui/useSalidaSinGuardar.tsx:178`: al retirar la guardia con `history.back()`, el navegador devuelve el scroll de la entrada de abajo.** En toda pantalla que se guarda sola y usa la guardia, quien se desplaza entre el cambio y el guardado ve la página volver adonde estaba. Recibir lo evita por su cuenta (ADR-0645, punto 10); el arreglo de fondo es de la pieza compartida (poner la entrada de abajo en «manual» al empujar la guardia), que también mira Dynamic. Decide Felipe.

- [ ] `components/recepcion-conteo/Dial.tsx:96-99`: las rayas del aro se calculan con `Math.cos`/`Math.sin` sin redondear y el servidor y el navegador difieren en el último decimal: aviso de hidratación en desarrollo (no cambia lo que se ve). Redondear a 2 decimales.
- [ ] `components/recepcion-conteo/ContarEnvio.tsx:21-30` y `NuevoModelo.tsx:40`: cinco imports y una variable sin uso (avisos de lint que ya estaban en `main`).
- [ ] El auditor de tema marca como «heredado» todo botón negro y la isla oscura («sobre imagen o degradado»): no sabe leer el fondo de la gota. Es del instrumento, no de las pantallas.
