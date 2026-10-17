## 2026-10-17 (/unificar: el censo de control, la deuda escondida y la ronda 17)
Qué hice: corrí un censo de control de todo el ERP con tres cuentas, y lo que las firmas no veían lo rastreé en el código. Una firma del
`aviso` tenía un error (un `\b` después de `bg-ambar/[0.07]` nunca coincide) y 31 recuadros de tono a mano se habían escapado de la ronda
5; con eso y las flechas escritas a mano, los títulos de campo en `label-cayla` y una vuelta escrita con el glifo, migré 45 archivos a sus
piezas (25 avisos, 13 enlaces y botones, 8 títulos de campo, 2 cantidades a `<CampoTexto>`, Apartados a `<Volver>`), reforcé cuatro firmas
y las probé contra el código de antes. Después armé la ronda 17 con las cuatro familias sin decidir: el mes, el cajón lateral, el paso de
cantidad y el anterior/siguiente de la guía de impresión.
Por qué así: «una función, una pieza» (ADR-0358) solo vale si el candado ve lo que se dibuja a mano; un censo mide lo que sus escenarios
abren, así que la deuda escondida se confirma en el código y la firma se prueba contra la versión vieja de cada archivo.
Felipe se lleva: la deuda de todas las familias decididas otra vez en 0 (ahora de verdad) y una página para elegir las cuatro que faltan.
La base local está atrás de `main` (`fn_sobrantes_por_revisar` y `familias.entra_a_motores` no están): Editar producto se cae en local.

## 2026-10-17 (/unificar: la ronda 17 decidida y migrada)
Qué hice: Felipe eligió P1 en las cuatro y las migré el mismo día: la guía de impresión pasa de paso con la flecha de `<Volver>` y
«Siguiente» con su ícono (la firma nueva encontró además la paginación a mano de Clientes, que pasó a `<Paginas>`); Comprobantes elige el
mes con «‹ Octubre 2026 ›» (`<SelectorMesEnUrl>`); los siete cajones son `<Cajon>`, la banda de Compras en todos; y los 19 pasos de
cantidad, `<PasoCantidad>`, la caja del campo con − y + adentro (dos agentes en paralelo con lotes cerrados, revisados después).
Por qué así: «una función, una pieza» (ADR-0358). Las piezas no deciden nada: cada pantalla les pasa qué hace cada botón, así migrar no
cambia el comportamiento. Al verla en la tienda, el «−» apagado en 1 apagaba la caja entera (una regla del campo): la pieza la corrige.
Felipe se lleva: las cuatro con su candado y deuda 0; quedan aparte las teclas grandes de contar, el paso a paso táctil de Existencias y
el pase de Traslados. En Conteo cada fila crece unos 10 px (el control pasa de 26 a 36 px).

