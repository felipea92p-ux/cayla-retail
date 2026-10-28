## 2026-10-01 (Prenda sin registrar: etiqueta en vivo, tallas por categoría y guía de foco)
Qué hice: tres maquetas del modal (`docs/maquetas/prenda-sin-registrar-2026-10/`); Felipe eligió la C, más ancha y con íconos. El modal arma la etiqueta provisional a la derecha, ofrece solo las tallas de la categoría (habituales primero, «Estándar» aparte, «Única» puesta sola) y lleva la guía de foco (`lib/prenda-sin-registrar-guia.ts`), que reemplaza la marca en rojo.
Por qué así: la colaboradora ve lo que almacén va a recibir y no puede elegir una talla ajena a la categoría; una categoría sin tallas configuradas ofrece solo «Única» (decisión de Felipe). La guía sale de `pasoSiguiente`, la misma regla que apaga «Agregar al ticket».
Felipe se lleva: solo web, sin migración; 273 archivos de pruebas, `tsc` y eslint en verde; recorrido verificado en el navegador local (escritorio y 375 px). Queda: el resto de `/vender` y la talla 44 de «Pantalones» en producción.

## 2026-10-01 (La lista de un combo ya no salta al abrir un modal)
Qué hice: `usePosicionLista` (`components/ui/useAnclaje.ts`) convierte la posición al marco de la hoja mientras la hoja entra (`marcoDelFijo`). Felipe vio la lista de «Categoría» abrirse corrida a la derecha y saltar a su lugar.
Por qué así: durante la entrada la hoja lleva `transform`, y eso vuelve a la hoja el bloque contenedor de todo `fixed` de adentro; medir cuadro a cuadro no alcanzaba porque aplicaba coordenadas de la ventana en el marco de la hoja. Se arregla en el anclaje compartido: vale para todo combo que se abre con el modal.
Felipe se lleva: medido en el navegador (lista a 1 px del campo durante toda la entrada, antes ~124 px corrida); `tsc` y pruebas de combos en verde.
