## 2026-10-28 (Maqueta: «¿Quieres volver a agregar esta prenda?» al escanear)
Qué hice: una maqueta tocable en `docs/maquetas/escaneo-repetido-2026-10/` con tres direcciones (aviso en el campo, hoja al centro, la fila pregunta), en escritorio con pistola y en celular con cámara, copiando «Bajar prendas al piso» y la hoja de cámara. Sin código del ERP.
Por qué así: hoy toda lectura suma 1 (`leerPrenda`); la maqueta pregunta solo en la repetición, ignora las lecturas de la misma etiqueta mientras se decide y se responde tocando, nunca con Enter (el Enter de la pistola no puede decir «Sí»).
Felipe se lleva: elegir mirando A, B o C, y decidir si Conteo (pilas de iguales) y Vender también preguntan; el README lo deja escrito.

## 2026-10-28 (Construido: la misma prenda escaneada otra vez pregunta antes de sumar, en Bajar al piso y Cuadrar el piso)
Qué hice: `lib/lectura-repetida.ts` (regla pura con su prueba), `components/ui/AvisoRepetida.tsx` (la dirección A elegida, solo con el total de esa prenda) y su uso en Bajar al piso y Cuadrar el piso, con pistola y con cámara; guías y huellas al día; ADR-0562.
Por qué así: la regla vive en una función que cada escáner llama antes de sumar; se responde tocando (el Enter de la pistola no puede decir «Sí»), la etiqueta quieta se ignora mientras se pregunta y otra prenda cuenta como «No». Sin migración.
Felipe se lleva: probado en el navegador con prendas inventadas (escritorio y 375 px, bandeja de la cámara sin cámara real); falta probarlo con la pistola en una tienda y decidir Conteo y Vender.
