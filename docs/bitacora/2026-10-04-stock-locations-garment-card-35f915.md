## 2026-10-04 (el cajón de la prenda dice dónde está cada unidad y cuánto puede cobrar la caja)
Qué hice: el cajón de la prenda en Existencias decía solo «Piso · Almacén». Ahora muestra los cuatro lugares donde puede estar una
prenda en una tienda —Piso (colgada), Almacén (guardada), Apartada y Dañada—, la suma explicada («8 + 5 + 2 + 1 = 16 prendas en esta
sede») y la aclaración de que la caja solo cobra lo colgado y libre (hoy, 8). Cada cifra con algo que hacer es un botón: Almacén baja al
piso (la ventana de «Reponer prenda»); Apartada y Dañada abren sus ventanas con solo lo de esa prenda («Decidir» al líder, «Ver cuáles» a
los demás). La grilla por talla suma «+1 apart.» donde hay una reservada. El Taller, que no separa piso y almacén, queda como estaba.
Por qué así: lo apartado y lo dañado ya vivían en la prenda y nadie los dibujaba, así que lo que una persona contaba en la tienda no
coincidía con lo que se podía vender. Hay DOS totales y los dos se dicen: «15 cuentan como stock» (el de la lista y el Conteo) y «16 en esta
sede» (con lo dañado), porque la cuarentena nunca entra al total, a propósito. Las cuatro cifras no se pisan: lo apartado ya sale del
piso y del almacén (son lo LIBRE), así que sumar las cuatro no cuenta nada dos veces. La suma sale de una función pura
(`desgloseDePrenda`) probada contra la regla real de `sumarCantidades`, para que no pueda desviarse en silencio si alguien cambia cómo
se cuenta el stock. Sin migración: los datos ya llegaban en `PrendaAgrupada`.
Felipe se lleva: «Apartada» abre la ventana de apartados que Existencias ya tenía (con «Liberar» donde la base lo permite) y no la
pantalla `/vender/apartados`: la persona no sale de Existencias y ve solo esa prenda. Verificado con datos inventados (Docker estaba
caído) montando el panel real, a escritorio y a 375 px, con los botones apareciendo solo cuando hay algo que hacer. Lo que falta es verlo
con datos reales: abrir en producción una prenda que tenga apartadas o dañadas.
