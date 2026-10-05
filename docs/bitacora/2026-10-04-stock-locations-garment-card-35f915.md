## 2026-10-04 (el cajón de la prenda dice dónde está cada unidad y cuánto puede cobrar la caja)
Qué hice: el cajón de la prenda en Existencias decía solo «Piso · Almacén». Ahora muestra los cuatro lugares donde puede estar una
prenda en una tienda —Piso (colgada), Almacén (guardada), Apartada y Dañada—, la suma explicada («8 + 5 + 2 + 1 = 16 prendas en esta
sede») y la aclaración de que la caja solo cobra lo colgado y libre (hoy, 8). Cada cifra con algo que hacer es un botón: Almacén baja al
piso (la ventana de «Reponer prenda»); Apartada y Dañada abren sus ventanas con solo lo de esa prenda («Decidir» al líder, «Ver cuáles» a
los demás). La grilla por talla suma «+1 apart.» donde hay una reservada. El Taller, que no separa piso y almacén, queda como estaba.
Por qué así: lo apartado y lo dañado ya vivían en la prenda y nadie los dibujaba, así que lo que una persona contaba en la tienda no
coincidía con lo que se podía vender. La suma de las cuatro (16) incluye lo dañado, que por diseño nunca entra al total de stock; por eso
la nota dice «15 sin contar la dañada, que está en cuarentena». No decimos que ese 15 «sea el de la lista»: la lista muestra solo lo LIBRE
(8 / 5) y el 15 no aparece en ninguna otra pantalla (error mío al principio, lo cazó la revisión). Las cuatro cifras no se pisan: lo apartado
ya sale del piso y del almacén (son lo LIBRE), así que sumar las cuatro no cuenta nada dos veces. Los tonos son los de los chips de la lista
(Apartado ámbar, Dañado rojo) y la celda de Almacén se llama «Reponer prenda», igual que el botón de abajo y la ventana que abre. La suma sale de una función pura
(`desgloseDePrenda`) probada contra la regla real de `sumarCantidades`, para que no pueda desviarse en silencio si alguien cambia cómo
se cuenta el stock. Sin migración: los datos ya llegaban en `PrendaAgrupada`.
Felipe se lleva: «Apartada» abre la ventana de apartados que Existencias ya tenía (con «Liberar» donde la base lo permite) y no la
pantalla `/vender/apartados`: la persona no sale de Existencias y ve solo esa prenda. Verificado con datos inventados (Docker estaba
caído) montando el panel real, a escritorio y a 375 px, con los botones apareciendo solo cuando hay algo que hacer, y vaciando la lista de la
prenda con la ventana abierta (se cierra sola; las otras prendas de la sede siguen en la vista global). Revisión de solo lectura con 4
lentes y un escéptico por hallazgo: 10 confirmados (todos de severidad baja), atendidos. Lo que falta es verlo con datos reales: abrir en
producción una prenda que tenga apartadas o dañadas.
