// Un monto no se parte al bajar de renglón (ADR-0413). El ERP escribe «S/» y la cifra con un espacio que no se parte (`\u00a0`, como
// el propio `Intl` en es-PE): así un renglón nunca deja «S/» sola al final y la cifra en el siguiente («su deuda pasa de S/ ⏎ 25.00»).
// Lo que arma la web ya nace así (`soles`, y la prueba `montos-sin-corte.test.ts` lo vigila en todo `app/`, `components/` y `lib/`).
// Esto es para lo que llega HECHO desde afuera con un espacio normal: los mensajes de la base (`raise exception '… S/ % …'`) y las
// descripciones de Actividad, que se escriben en Postgres. Solo para mostrar: lo que se guarda o se manda (a la base, a Lucode) va tal
// cual llegó.

/** El texto con cada «S/ » pasado a «S/» + espacio que no se parte. */
export function montosSinCorte(texto: string): string {
  return texto.replaceAll("S/ ", "S/\u00a0");
}
