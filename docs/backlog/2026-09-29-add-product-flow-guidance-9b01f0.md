## 🧵 Nuevo producto guía a quien lo llena — «el hilo» (2026-09-29, ADR-0284) — solo web, sin migración; rama `claude/add-product-flow-guidance-9b01f0`

**Estado:** hecho en la rama y verificado en el navegador (1280 y 375 px); **a probar con una trabajadora real**. Sin migración,
sin nada que pegar en producción.

- [x] `lib/alta-producto-guia.ts` + `lib/alta-producto-guia.test.ts` (41 casos): estado de cada campo (hecho / sigue aquí / falta /
      opcional), lo que falta por paso, «siguiente» global y `pasoConfirmado`. Una prueba exige coherencia con `problemasAlta`.
- [x] Marca + tinte + «Sigue aquí» en cada campo de los pasos 2, 3 y 4 (`FilaAlta` con `campo`/`estado`); paso 1 con «Familia» →
      «Categoría» y las categorías traídas a la vista.
- [x] Pie del paso con «Faltan: …» tocable (lleva al campo y lo destella); pegado abajo desde `lg`.
- [x] «Siguiente: …» de la ficha y de la barra del celular tocable (`DatosFicha.guia`).
- [x] Paso 4 en tres filas guiadas (Precio y costo · Unidades de hoy · Quién lo registra).
- [x] ✓ de un paso solo si se abrió; los que vienen armados dicen «Por revisar». «Crear otro parecido» reinicia los visitados.
- [x] Nunca se desplaza la página mientras hay foco en una caja de texto; el desplazamiento descuenta la barra del celular.
- [x] La lista flotante de los combos se despega del fondo (`.lista-flotante`: borde de tinta al 22 % y sombra de elevación).
      **Alcanza a los combos de toda la app** (`ComboBuscable`, `Desplegable`, `FiltrosPildora`, `ComboResponsable`); mirar uno de
      Compras o de los filtros de Productos y decidir si se queda así o se limita al alta.
- [x] **Editar producto (ADR-0284 c):** tira «Para completar esta ficha» (tejido, patrón y fotos por color faltantes, tocables) y marcas
      solo en lo que llegó pendiente; `lib/producto-ficha-guia.ts` (13 pruebas). Guía, no candado: no bloquea guardar.
- [ ] **Sin ver en pantalla (Editar):** subir una foto → ✓ en la tarjeta de fotos y «Ficha completa»; una prenda descontinuada; una
      categoría sin tejidos habilitados. Las tres salen de la misma función probada, pero no las recorrí en el navegador.
- [ ] **Decisión de Felipe (Editar):** ¿qué más cuenta como «falta»? Hoy solo fotos y tejido/patrón. Candidatos: descripción, temporada,
      «costo sin comprobar». Se agregan en `pendientesDeFicha` (una entrada + su prueba).
- [ ] **Probar con una persona real, sin ayuda:** ¿llega a «Todo listo» solo con las etiquetas? Si sigue perdiéndose, el siguiente
      escalón es atenuar los campos que aún no tocan.
- [ ] **Sin probar:** paso 3 con muchos colores y fotos; pantalla de éxito y «crear otro parecido» (`vistos` se reinicia a {1, 2});
      cuenta que NO es Líder (el combo «Responsable» arranca sin elegir y la fila «Quién lo registra» queda por hacer); modo sin conexión.
- [ ] **Decisión de Felipe:** ¿Indumentaria exige color? Hoy es solo sugerencia (una línea en `problemasAlta` lo haría obligatorio).
- [ ] **Decisión de Felipe:** en celular, ¿subir «Seguir →» a la barra de abajo mientras el paso esté listo?
- [x] **Regla obligatoria + prueba (ADR-0284 d):** CLAUDE.md «Guía de foco», casilla en la plantilla de PR y `lib/guia-de-foco.test.ts`
      con su registro `lib/guia-de-foco-pantallas.ts` (una `page.tsx` nueva no puede nacer «pendiente»).
- [ ] **Despliegue módulo por módulo (Felipe):** quedan **80 pantallas `pendiente`** en `lib/guia-de-foco-pantallas.ts`, agrupadas por
      módulo. Por cada una: hacer su guía (o declararla «no-aplica» con motivo), pasarla a «aplicada» y bajar `PENDIENTES_HOY`.
      Candidatas de mayor valor para una trabajadora nueva: Vender, Cambios, Devoluciones, Recibir, Compras ▸ nueva, Conteo, Traslados.
- [ ] **Después de este módulo:** el mismo hilo en «Editar producto» y en las demás pantallas donde se llenan campos (Compras,
      Recibir, Traslados). Las piezas (`MarcaCampo`, `FaltanDelPaso`, `useGuiaAlta`) ya son genéricas; falta sacarlas de `alta-producto/`.
- [ ] **Entorno local:** la base de desarrollo no trae patrones (producción tiene 9); se sembraron 3 de prueba en la base local.
      Conviene que el seed de `supabase/seed.sql` los traiga, para que «Indumentaria exige patrón» no deje el alta sin salida al probar.
