## Existencias: lo que sigue después de sacar el ritmo del camino (2026-11-13)

- [ ] Leer `existencias_tramos` en producción tras publicar: `lista_ms` debería quedar cerca del `fin` de `existencias` (~0,7–1,1 s en TRU) y `tiempo_de_pantalla` de `/inventario` bajar de 3,3–4,8 s.
- [ ] **Mandar menos al navegador** (siguiente paso propuesto): `bytes.panel` era ~1,97 MB en TRU (≈1 KB por talla, 1.953 tallas). Los datos del producto (foto, referencia, categoría, marca, descripción, estado) viajan repetidos en cada talla y «en la red» repite el nombre de cada sede. Mandarlos una vez por producto (357) y las sedes por id. Medir con `bytes.panel`.
- [ ] Solo si con eso sigue lenta: la página visible primero y el resto de la lista justo después, sin perder la búsqueda instantánea. Paginar en el servidor queda descartado (cada filtro y cada letra costaría un viaje).
- [ ] Visto de paso: a 688 px de ancho, la tarjeta «¿No es lo que ves en la tienda?» del panel de la talla se aprieta y parte el texto palabra por palabra. No es de este cambio.
