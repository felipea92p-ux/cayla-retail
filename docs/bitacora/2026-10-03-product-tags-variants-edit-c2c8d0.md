# 2026-10-03 · Editar producto: todo desde la matriz

- Pestaña «Etiquetas» en la matriz (una talla o todas), con las etiquetas dibujadas como en Atributos debajo de la tabla; lápiz y tacho por color («Quitar color» desactiva, nunca borra, y suelta lo que se le tocó); lápiz en cada talla y «+ Agregar talla».
- Desaparece «Más de cada variante» (`VariantesFicha.tsx` borrado); al entrar solo «Variantes y precios» está abierta. Sin migración. ADR-0313, act. 2026-10-03.
- Al guardar con unidades nuevas sale la hoja «Etiquetas de lo que entró» (una etiqueta por unidad que entró). Verificado en local con guardados reales (revertidos) y a 375 px.
- La matriz ya no se mueve al agregar un color ni al cambiar de pestaña (`table-fixed`, Color según cuántas tallas hay); medida de 375 a 1920 px.
- Etiquetas de precio usa todo el ancho (entra a `SIN_TOPE_DE_ANCHO` del AppShell): desde 1280 px, la vista previa va a la derecha, pegada arriba; más angosta, una columna como antes.
