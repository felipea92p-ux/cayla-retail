## 🧵 Editar producto: recorrido de todos los casos (2026-10-03, ADR-0313 cuarta vuelta) — solo web, sin migración; rama `claude/stock-talla-button-visibility-eb9a32`

- [x] «Stock por talla» no tapa «Estándar» (subgrid) — medido: 53 px de etiqueta, 9 px antes de la barra; un nombre largo salta de línea.
- [x] «Agregar color» / «Agregar talla» más notorios; a 375 px los dos «+» quedan alineados, lado a lado desde `@lg`.
- [x] La celda «—» agrega esa combinación (`comoLlenarHueco` + prueba); guardado real en «Blusa Lino Aurora (prueba)» y devuelto.
- [x] Sin «Ajustar stock»: el stock de la sede se lee y se ve; no se carga stock en variantes nuevas ni sale el cartel «toca +».
- [x] Guardado a medias: fotos y temporada se reanclan antes del stock; se releen las recién creadas; `cargarNuevas` con tope y respuesta incierta.
- [x] Celda de stock: apartado al salir de la celda; faltante de conteo contra el stock de hoy.
- [x] «Cambiar en bloque»: un monto por campo y el grupo perdido lo dice; sin bloque de costo si todos vienen de compras.
- [x] Quitar un color suelta su corrección y, si nunca existió, sus fotos nuevas.
- [x] Etiquetas con descuento en la ficha para quien edita Productos (ADR-0293).
- [x] Textos: «Nacen en 0» coherente con la tabla, «72 u. contando todas las sedes», leyenda del «—», «Reintentar» si falla la lectura.
- [ ] **Sin probar en el navegador:** una cuenta SIN «Ajustar stock» (no hay credenciales de prueba de otro rol en local), una prenda «Sin color» y la lectura de stock que falla. Cubierto por tipos y código; falta verlo.
- [ ] **Decisión de Felipe — quitar una talla:** los colores tienen tacho; las tallas no. Una talla recién agregada (sin guardar) solo se va con «Descartar» todo. ¿Tacho también en la cabecera de la talla (desactiva esa talla en todos los colores, igual que «Quitar color»)?
- [ ] **Decisión de Felipe — salto grande de stock:** escribir 9999 sobre 6 («Conteo físico») se guarda sin pregunta; la hoja lo muestra («6 → 9999»). ¿Un aviso cuando el salto es grande (p. ej. más de 10 veces o más de 100 u.)?
- [ ] La cabecera de una talla recién agregada no dice «nueva» (el color sí).
- [ ] La barra del panel mide contra la talla más alta del MISMO color: 2 u. llenan la barra (en ámbar). Si se prefiere contra un umbral fijo, es una línea.
- [ ] Bajo: «Agregar color» sobre un color quitado en la visita dice «ya existían desactivadas» (en la base siguen activas; es un «Deshacer»). En la hoja, el stock dice «28 · Negro» y lo demás «Negro 28».
- [ ] Bajo (revisor): si un primer intento guardó correcciones y solo falló el stock, el reintento cae en la rama «solo stock» y su aviso no ofrece reimprimir todo (`ProductoForm.tsx`, rama `resumen.total === 0`).
- [ ] Bajo (revisor): «Corregir talla» desde la cabecera arrastra también las tallas de un color que se está quitando (`filasDelEje` usa `enGrupo`).
