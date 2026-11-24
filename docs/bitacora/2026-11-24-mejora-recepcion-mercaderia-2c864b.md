## 2026-11-24 · Recibir: los pasos del modelo y «Crear la prenda» como lo que toca (ADR-0699, actividad 1)

- **Qué hice:** arriba de cada modelo, en Recibir ▸ Contar, ahora se ven los pasos que le faltan para venderse: Cuántas → Crear → Tallas →
  Llevar. Una prenda nueva ya contada tiene como botón principal «Crear la prenda» (antes quedaba para después sin que nadie lo decidiera),
  y la línea del envío dice cuántas prendas ya están a la venta.
- **Por qué así:** lo nuevo era lo que llenaba «Por terminar» y obligaba a volver a recibir otro día. Se reusó la pieza de los puntos de
  Nuevo producto, sin dibujar una segunda.
- **Qué se rompería sin esto:** un envío con cinco modelos nuevos se cerraría con 20 prendas en el almacén que Vender no ve, hasta que
  alguien se acuerde de «Por terminar».

**Verificado en local** (ENV-000644, 1440 × 900, claro): la tira en una reposición y en una nueva, «Crear la prenda» abre «¿Esta prenda ya
existe?», «Dejar para después» cambia la tarjeta y avisa. Pruebas de reglas, tipos, knip y la guía interactiva, en verde.
**Sin verificar:** oscuro, 1024 y 375 px; `/milimetro auditar`, `/formidable`, `/focus` y `/chaos`.

**Hallazgo, sin arreglar:** en ENV-000644, poner en cero un modelo ligado a una prenda existente («Vestido Mimosa») le quitó el vínculo, y
volvió a su nombre anotado («Vestido Lirio NOLLEGO», por crear). Es la misma raíz del «No llegó falso» (`recepcion-modelos-reglas.ts`: el 0
de un anotado no deja marca por modelo). En la base local quedó así.
