// El Podio del cierre (rediseño «B» de Recibir, Felipe 2026-10-29): por categoría, cuatro columnas a la misma escala —lo que dijeron, lo
// que se contó, lo que se puede vender hoy y lo que queda para después— y una llave sobre las dos primeras que dice si cuadra, faltan o
// sobran. Reemplaza a las cuatro cifras sueltas de la fila. Los números son los mismos que ya mostraba la tabla; aquí solo se arma el dibujo.

export type ColumnaPodio = { clave: "dijeron" | "contaste" | "vender" | "despues"; titulo: string; n: number; /** Alto, de 0 a 100. */ alto: number };

export type Podio = {
  columnas: ColumnaPodio[];
  /** Lo que dice la llave entre «Dijeron» y «Contaste»; `null` sin guía (sin aviso o fuera de la guía): no hay con qué comparar. */
  llave: { texto: string; cuadra: boolean } | null;
};

export function podioDeCategoria(c: { dijeron: number | null; contadas: number; alStock: number; paraDespues: number }): Podio {
  const conGuia = c.dijeron != null;
  const crudas: Omit<ColumnaPodio, "alto">[] = [
    ...(conGuia ? [{ clave: "dijeron" as const, titulo: "Dijeron", n: c.dijeron ?? 0 }] : []),
    { clave: "contaste", titulo: "Contaste", n: c.contadas },
    { clave: "vender", titulo: "Se venden", n: c.alStock },
    { clave: "despues", titulo: "Después", n: c.paraDespues },
  ];
  const mayor = Math.max(1, ...crudas.map((x) => x.n));
  const columnas = crudas.map((x) => ({ ...x, alto: (x.n / mayor) * 100 }));
  if (!conGuia) return { columnas, llave: null };
  const d = c.contadas - (c.dijeron ?? 0);
  return { columnas, llave: { texto: d === 0 ? "cuadra" : d < 0 ? `faltan ${-d}` : `sobran ${d}`, cuadra: d === 0 } };
}
