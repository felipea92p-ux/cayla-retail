## 2026-10-19 (Tienda: las flechas del carrusel «Lo nuevo» ya no dejan tarjetas cortadas)
Qué hice: las flechas de `CarrilConFlechas` llevaban el carril «80 % de su ancho» más allá; ahora lo llevan a una tarjeta exacta (siguiente: la primera tarjeta cortada del lado derecho pasa a ser la primera; anterior: la que queda tantas atrás como caben a la vista).
Por qué así: el 80 % casi nunca cae en el borde de una tarjeta y, con el anclaje obligatorio (`scroll-snap-type: x mandatory`), el navegador (Safari) dejaba el carril a medias, con una tarjeta cortada a cada lado.
Qué se rompería sin esto: cada pulsación podía dejar el carril desalineado, y más cuanto más largo era el carril (84 prendas en «Lo nuevo»).
Verificado: 30 pulsaciones seguidas (ida y vuelta) en un carril de 25 tarjetas a 1472, 1024, 768 y 390 px; siempre queda la primera tarjeta pegada al borde, salvo al llegar al final del carril. Falta probarlo en Safari real.
