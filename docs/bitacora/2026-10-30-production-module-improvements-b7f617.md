## 2026-10-30 (Producción: evaluación del módulo en 21 mejoras, y la tela del corte que no se pierde ni se duplica)
Qué hice: evalué el módulo con 7 revisores y escépticos que contrastaron cada hallazgo con el código, y dejé 21 mejoras en `docs/pantallas/produccion-modulo-21-mejoras.md`. Después construí las de integridad 1–3 (ADR-0587): «Terminé» y la Salida se guardan junto con su tela, con token contra el reintento; «Deshacer» devuelve también la tela a su lote; hay un candado por tela y sede antes de leer cuánto había; y una factura suelta pregunta si es de un pedido abierto del proveedor. La mejora 4 quedó escrita en #1499.
Por qué así: medido con dos sesiones reales, la función de hoy deja el estante en −5 m cuando hubo un ajuste de conteo; con el candado queda en 20 m. Una sola regla de «quedó/usado» y una sola de «Terminé» cubren tres puertas, así que no hay dos versiones que puedan diferir.
Qué se rompería sin esto: un corte de red entre dos llamadas deja el corte sin su tela y el costo por prenda mal; un reintento anota 30 prendas de más; y dos órdenes que cortan del mismo rollo dejan un saldo imposible.

## 2026-10-30 (Producción: las tres hojas, probadas en el navegador)
Qué hice: con la web conectada a la base desechable y la cuenta de prueba, anoté un corte con su tela, lo deshice, mandé un corte a un taller de afuera con su tela y abrí una factura suelta de un proveedor con pedido abierto. Todo funcionó en escritorio, a 375 px y en oscuro. El botón del aviso de la factura pasó bajo el texto.
Por qué así: las pruebas de la base no ven si el texto cabe en un teléfono ni si la persona entiende lo que le preguntan.
Qué se rompería sin esto: en el celular el aviso se leía como una columna de palabras sueltas (291 px de alto), y nadie lo lee.
