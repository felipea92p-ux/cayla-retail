## 2026-10-26 (Proveedores: tres maquetas para elegir mirando — ADR-0502)
Qué hice:
- **Tres direcciones tocables** en `docs/maquetas/proveedores-2026-10/` (lista y ficha, claro y oscuro): **A · Tres montones** (la lista repartida en vuelve a comprarle / mira antes / frena; la ficha con la respuesta y «¿Se vende? ¿Te deja plata? ¿Cumple?»), **B · El reloj del ritmo** (todo en semanas para vender lo que queda: un mapa de proveedores y la curva «si sigue así» con fecha) y **C · El flujo** (el río de la mercadería de cada proveedor a vendido, en estantes o rotando lento; el perchero de tallas y el hilo del pago).
- Las reglas de `proveedor-ritmo-reglas.ts` y `proveedor-prendas-reglas.ts` copiadas con sus umbrales; los casos reales del ADR-0502 (Lasak 99 semanas, Anqori 22, Deyner 3, Jacard S/ 825 parados) salen igual. Un lugar marcado «Dato nuevo» para las tallas y las sedes que construye otra sesión.
- Revisadas en el navegador a 1440 y 1920 px, claro y oscuro, y a 375 px sin desborde. Lo que gana y paga cada una, en el README de la carpeta.
Por qué así: Felipe dijo que hoy no se entiende lo que muestra Proveedores; las tres responden «¿a quién le vuelvo a comprar?» en 5 segundos con los mismos datos, para que elija mirando.
Estado: solo maquetas, sin código del ERP ni migraciones y sin PR. Falta que Felipe elija; después, `/construir`.
