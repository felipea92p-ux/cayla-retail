## 2026-09-30 (Nuevo producto avisa si la prenda ya existe: alerta de «prendas parecidas», Fase 1, ADR-0294)

Qué hice: Nuevo producto ahora muestra, en el resumen de la derecha, una alerta compacta con lo que ya existe de la marca elegida (o, sin marca, de la categoría), y una
hoja «Ver y comparar» con foto, colores, tallas, cuántas hay por sede y cuándo y dónde se cargó; en celular y tablet es una tira sobre la barra de abajo. Marca y proveedor
subió arriba del Nombre (sigue opcional y la guía no la señala). Solo frena el nombre idéntico. Es solo web, sin migración y sin tocar producción: lee con lo que ya existía
(`fn_productos`, `productos`, `fn_existencias_productos`, `fn_producto_origen`). Piezas nuevas en `lib/parecidas-alta-*.ts`, `lib/candidatas-alta-*.ts`, `lib/useParecidasAlta.ts` y
`components/alta-producto/{AlertaParecidas,TarjetaParecida,HojaParecidas,TiraParecidas,ParecidasDelAlta}.tsx`; el formulario y la ficha solo se enchufan
(`NuevoProductoForm.tsx`, `FichaPrevia.tsx`). PR abierto para que Felipe lo fusione.

Por qué así: Felipe definió que «mismo producto» es **mismo diseño**: «Wide Leg» y «Wide Leg Corto Comfo» son prendas distintas, así que el texto del nombre no decide nada y lo que
decide es mirar la foto y el stock. Por eso el sistema solo avisa y ordena, nunca fusiona ni preselecciona, y «Es el mismo diseño» abre la ficha del existente (no suma unidades: eso
es una fase posterior). Una excepción que hay que saber: la base hoy también rechaza «una letra de diferencia» (Polo G44 contra Polo G45) hasta que se confirme, y la maqueta decía
que ya no frenaba; en esta fase «Crear» espera la respuesta «No, es otro diseño» en la hoja, y una constante (`CASI_IGUAL_FRENA_EN_BASE`) lo apaga cuando cambie la base. El candado
sale de la base, no de la alerta: si la lectura falla vuelve la casilla de siempre.

Felipe se lleva: tres preguntas abiertas (ADR-0294, «Lo que queda a decisión de Felipe»): si se acepta que «una letra» espere la respuesta mientras tanto; si «Revisa: N parecidas · Ver» se
repite junto a «Crear producto» en el paso 4; y si la alerta muestra dos filas o tres (con la alerta el resumen corre por su cuenta y «Crear producto» quedó fijo abajo, a la vista). **Sin verificar con una cuenta real:** la
prueba usó una página temporal (`app/auth/prueba-alta-parecidas`, ya borrada) con respuestas de ejemplo para la base. La revisión final dejó todo `apps/web` en verde (pruebas, `tsc`, eslint) y corrigió,
entre otras cosas, `reglas-sin-uso`, la hoja que reaparecía sola, «Ninguna es mi prenda» con una búsqueda activa y el nombre «Prenda sin Registrar»; lo que queda abierto está en el backlog.
