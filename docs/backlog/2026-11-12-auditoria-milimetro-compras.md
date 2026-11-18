## 📐 Auditoría al milímetro de `/compras` (2026-11-12) — rama `claude/auditoria-milimetro-compras`, sin migración

- [x] Los siete medidores corridos contra el ERP local; informe en `docs/milimetro/auditorias/2026-11-12-compras.md`.
- [x] 16 falsos positivos de los medidores arreglados en sus skills (`6089b02d2`, `7e13e67d5`, `c9a179351`).
- [x] Media 1: «Venció dd/mm» en tinta 70 % (rojos 6 → 4). Media 2: cara apilada propia de la fila (`comprobantes-lista.css`). Media 3: pie de `PaginacionCursor` y `PaginacionPaginas` a `text-sm` (15 px). Commit `3f4f4e0a0`, vuelto a medir.
- [ ] **Media 4, el esqueleto global** (`components/Esqueleto.tsx`, `EsqueletoPantalla`): 34 bucles `animate-pulse` con una curva fuera del sistema y sin `data-senal`. Llevarlo a la forma de `cmp-sk` (el esqueleto propio de Compras) o marcarlo como señal de espera (ADR-0625). Es una pieza de todo el ERP: con el OK de Felipe.
- [ ] **Leve 5, el hilo del Buscador** (`app/estilos/vacio-aviso-buscador.css:193-195`): la animación corre siempre aunque solo se vea con `[data-buscando]`; ponerla solo bajo ese atributo.
- [ ] **Sigue sobre el presupuesto de rojo:** quedan 4 (la cifra «2 vencidas» y su barra en la tarjeta «Por pagar», y los dos puntos de «Vencida»). Bajar la tarjeta a 1 rojo es otra decisión de Felipe.
- [ ] **Sin medir:** la columna «Marca y proveedor» con marcas. La base local no tiene `retail.fn_marcas_de_compras`, y no se aplicó la migración porque esa base la comparten otras sesiones.
- [ ] **Del marco, no de Compras:** la aurora del fondo entra en 1 400 ms; «Ctrl»/«K» del buscador global en 10 px; «Pregúntale a CAYLA» (34 × 36) y «Animaciones» (36 × 36) bajo 44 px con el dedo; desajuste de hidratación de `data-mas-der` en `nav.pildoras-desliza`.
- [ ] Correr `/formidable` sobre `/compras` (va después de `/milimetro`).
