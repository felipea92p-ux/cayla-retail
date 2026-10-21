## 2026-10-21 (Vender: una lectura con un tropiezo ya no se queda en el buscador ni se suma a la siguiente)

Qué hice: `lib/lectura-pistola.ts` reconocía una lectura de pistola solo si TODAS las teclas llegaban con menos de 50 ms entre
una y otra. Una sola pausa un poco más larga a mitad del código (pistola inalámbrica, equipo ocupado) partía la ráfaga: lo
que venía después quedaba con menos de 8 teclas, no se tomaba por lectura y el código se quedaba escrito en el buscador sin
entrar al ticket. Y como quedaba escrito, el siguiente escaneo —si también tropezaba— se pegaba detrás en vez de reemplazarlo.
Ahora, cuando la ráfaga ya lleva 5 teclas a ritmo de máquina (`TECLAS_PARA_PERDONAR`), se le perdona UNA pausa de hasta 110 ms
(`MAX_MS_DE_TROPIEZO`) y sigue siendo la misma lectura.

Por qué así: 5 teclas con menos de 50 ms entre ellas no las escribe una persona, así que a partir de ahí una pausa corta es la
pistola y no alguien que dejó de teclear. El tope de 110 ms queda por debajo de los 150 ms del silencio que cierra la lectura
(`PAUSA_FIN_LECTURA_MS`): si no, ese reloj la cortaría antes. Lo tecleado a mano, lo pegado y las frases con espacios siguen
sin contar como lectura.

Qué no cubre: una pausa de más de 110 ms a mitad del código sigue partiéndolo (lo que viene después se lee como un código
incompleto y dice «No encontramos…»). No se verificó con una pistola real ni en el navegador: lo cubren las pruebas de
`lectura-pistola.test.ts`, que simulan el tropiezo, el código a medias que ya estaba en el campo y a una persona tecleando.
Felipe se lleva: escanear varias prendas seguidas en tienda con la pistola inalámbrica; si aún queda alguna en el buscador, hay
que medir cuánto tarda esa pistola entre teclas y subir `MAX_MS_DE_TROPIEZO` (sin pasar de `PAUSA_FIN_LECTURA_MS`).
