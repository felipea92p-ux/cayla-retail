# Letra y texto de Compras, Gestión y Rendimiento — 2026-11-23

Rama `claude/letra-compras-gestion`, sobre `main` (las actividades 1 a 5 ya entraron: PR #1978, #1981, #1984 y #1986).
Actividad 6 de las ocho mejoras de estética. ADR-0691. Sin migraciones.

## Hecho

- [x] **Letra (TSX):** 162 tamaños a mano de 65 archivos que se ven desde Compras (Historial, Por pagar, Proveedores, Plan de campaña, Mis
      compras, Fondos, Órdenes), Gestión (Análisis, Frescura, Plan del piso, Preguntas) y Rendimiento pasaron a la utilidad de su escalón.
- [x] **Letra (hojas):** 170 tamaños de 13 hojas pasaron a `var(--text-…)`: Análisis (cuatro hojas), el Plan del piso, la mesa de
      Rendimiento, el presupuesto y el calendario del Plan de campaña, Mis compras en el celular, el paso 2 del plan, Notas de crédito, el
      registro de comprobantes y el globito de los gráficos.
- [x] **El calendario del Plan:** las fechas bajo el nombre de cada campaña salían a 12,8 px (el 80 % que el navegador le da a `small`).
      Ahora piden los 13 px de la escala.
- [x] **El cajón de un proveedor:** con la letra a 13 px, «Facturado 12 m» y «Última compra» ocupan dos renglones y «Saldo» uno. Las tres
      cifras ahora van pegadas abajo y quedan a la misma altura. Se probó en una sola línea: no entra, «Última compra» se cortaba.
- [x] **Letra fija, con su motivo:** la lista de compra que se imprime (papel), dos textos del dibujo de la mesa de Rendimiento y dos
      marcas dentro de celdas de la matriz de Análisis.
- [x] **Deuda de letra:** de 1.309 a 971 (de 232 a 154 archivos); por debajo de 13 px, de 450 a 306.
- [x] **Texto:** 19 frases.

| Dónde sale | Hoy | Ahora |
|---|---|---|
| Proveedores ▸ sobre la lista | Del que más te llegó al que menos. Toca uno para ver su detalle; marca hasta 3 para compararlos. | Del que más te llegó al que menos. Marca hasta 3 para compararlos. |
| Plan ▸ Presupuesto, sin compra | Todavía no hay nada que comprar: arma el plan de las categorías para ver si cabe en tu tope. | Arma el plan de las categorías para ver si cabe en tu tope. |
| Plan ▸ Presupuesto, supuestos | Son los supuestos de TODA la campaña: se cambian aquí o desde la hoja de cada categoría. | Valen para toda la campaña: se cambian aquí o en cada categoría. |
| Plan ▸ Pagos, nada por pedir | Con lo que hay y lo que viene en camino, no hace falta comprar para esta campaña. | Con lo que hay y lo que viene en camino, alcanza para esta campaña. |
| Plan ▸ Pagos, costo e IGV | Ninguna categoría tiene nada por comprar: cuando el plan pida comprar algo, aquí dices cuáles costos ya traen el IGV. | Cuando el plan pida comprar algo, aquí dices qué costos ya traen el IGV. |
| Plan ▸ Pagos, sin guardar | Mientras no lo guardes, Finanzas cuenta lo que falta pedir sin fechas de pago. | Hasta guardarlo, Finanzas cuenta lo que falta pedir sin fechas. |
| Plan ▸ Pagos, se ve en Finanzas | Por defecto, una campaña con compra se ve. Nadie lo ha cambiado. Ocultarla no borra nada: sigue en el Plan y en Compras. | Por defecto, una campaña con compra se ve. Ocultarla no borra nada. |
| Plan ▸ Pagos, Resumen de Finanzas | Sale como «Inversión en mercadería», no en «Te deja». Al registrar la orden o la factura, lo real reemplaza lo planeado. | Sale como «Inversión en mercadería». Al registrar la orden o la factura, lo real reemplaza lo planeado. |
| Plan ▸ Pagos, «Se hará» | Se hará. La inversión sale en el Resumen de Finanzas y en tu caja de las próximas semanas, para que sepas qué pagos vienen y puedas guardar plata o anticiparte. | Se hará. Sale en el Resumen de Finanzas y en tu caja de las próximas semanas. |
| Plan ▸ Pagos, «Solo en Escenarios» | Es una idea: sirve para el «¿y si compro esto?» de Escenarios, pero no sale en el Resumen ni en tu caja. Escenarios todavía no la lee: se conectará. | Es una idea: no sale en el Resumen ni en tu caja. Escenarios todavía no la lee. |
| Plan ▸ Pagos, «No mostrarla» | Finanzas no la ve en ningún sitio. Lo ya registrado de verdad (órdenes, facturas por pagar) sigue contando. | Finanzas no la ve. Las órdenes y facturas ya registradas siguen contando. |
| Plan ▸ Resultados, antes de empezar | Empieza el 1 dic. Desde el día siguiente, aquí ves lo que se va vendiendo, tienda por tienda. | Empieza el 1 dic. Desde el día siguiente verás sus ventas, tienda por tienda. |
| Frescura ▸ aviso, piso sin cuadrar | Mientras el piso no esté cuadrado, el sistema no sabe con certeza qué está colgado: estos porcentajes son aproximados. | Mientras el piso no esté cuadrado, estos porcentajes son aproximados. |
| Frescura ▸ aviso, almacén sin contar | Mientras el almacén no esté contado, algo guardado puede contarse como colgado: estos porcentajes son aproximados. | Mientras el almacén no esté contado, estos porcentajes son aproximados. |
| Frescura ▸ detalle de una prenda | Son preguntas, no órdenes: la decisión es tuya. Aquí no se rebaja nada; lo que decidas se anota con «Anotar lo que hice». | Son preguntas, no órdenes. Lo que decidas se anota con «Anotar lo que hice». |
| Plan del piso ▸ Grupos, nota | Los grupos son la unidad del plan: con pocos días de venta, repartir el piso categoría por categoría daría cifras de 2 prendas que no dicen nada. «Por revisar» es la propuesta de la investigación del 4 de octubre; el rol de cada grupo (destino, rutina…) es una hipótesis que se valida con las ventas de cada sede, no un hecho. Cuánto lugar tiene cada grupo viene en el paso siguiente, sobre estos mismos grupos. | El plan reparte el piso por grupos, no por categoría: con pocas ventas, categoría por categoría no dice nada. «Por revisar» es una propuesta: se valida con las ventas de cada sede. |
| Plan del piso ▸ Historia, nota | Para qué sirve. La investigación del 5 de octubre no encontró ninguna medida de cuánto más vende una categoría de ropa por tener más lugar; la que circula es de supermercado. Con estas fotos y las ventas, en unos meses se podrá medir con los datos de CAYLA, y decidir con eso cuánto vale reasignar el piso. Una foto «por cuadrar» se guarda igual pero sale apagada: sin saber lo que cuelga de verdad, no sirve para medir. | Para qué sirve. Con estas fotos y las ventas, en unos meses se podrá medir cuánto más vende una categoría por tener más lugar. Una foto «por cuadrar» sale apagada: no sirve para medir. |
| Rendimiento ▸ bajo el gráfico | Arrastra sobre el gráfico para elegir días, o toca un día. Lo demás se acomoda solo. | Arrastra sobre el gráfico para elegir días, o toca un día. |
| Rendimiento ▸ sin meta | Sin meta de la sede, aquí solo ves lo vendido. Cárgala en Configuración ▸ Metas y se reparte sola, por horas. | Sin meta de la sede, aquí solo ves lo vendido. Cárgala en Configuración ▸ Metas. |

- [x] Medido en 74 vistas (42 a 1440 × 900 y 32 a 375 × 812), en claro contra el «antes» y repetido en oscuro: 0 textos cortados
      nuevos, 0 desbordes; 30 vistas cambiaron de alto.
- [x] Nada se guardó en la base: las vistas solo abren hojas.

## Pendiente

- [ ] **Que Felipe revise el tono** de las 19 frases. A mirar con cuidado: las tres de «cómo se ve en Finanzas» del Plan de campaña y
      las dos notas del Plan del piso, que perdieron la mención a la investigación.
- [ ] **Los gráficos** (`graficos-tiempo.css`, 11 tamaños: ejes a 10,5 px y cifras a 11 px). Son lo único que queda bajo 13 px a la
      vista en Caja, Reportes, Por pagar, Proveedores y Rendimiento (40 textos en las 74 vistas). La línea calcula sus márgenes, el
      alto de sus filas y el ancho de sus textos con esos tamaños (`Linea.tsx`, `lib/linea-marcas-reglas.ts`), y las dos piezas las
      eligió Felipe mirando. Subirlos cambia cómo se ve cada gráfico del ERP: pide una lámina de antes y después para que elija.
- [ ] **Frases largas que no se tocaron:**
      las que arma una regla con su prueba (Mis compras «Pusiste S/ … de tu bolsillo…», los avisos del Plan del piso, la frase de
      Rendimiento), las del pago a un proveedor («Se registra como un solo pago…»: es plata), y las que ya están detrás de un toque
      («¿Cómo se lee?» de Frescura, el «?» de cada cifra de Rendimiento, la hoja de una categoría del Plan).
- [ ] **Sin ver en pantalla:** una orden de compra abierta, el detalle de una factura, la hoja de un pago con varios medios y el paso a
      paso del Plan. Cambiaron de clase, no de tamaño.
- [ ] **Producción** (`orden-pagina.css`, `ordenes-lista.css`, `ficha-taller.css` y sus pantallas) no está en ninguna actividad de la
      lista. Para llegar a deuda 0 en la actividad 7 hay que sumarla.
- [ ] **Sigue de antes:** el aviso de cierre de caja de la cabecera, las preguntas del paso «Reemplazo» de Cambios y el Inicio de almacén.
- [ ] **Dynamic:** queda como tarea allá. Cambió una hoja de `app/estilos/vidrio/` (`rendimiento.css`): solo el tamaño de la letra, de
      una pantalla que es de Retail.
