export const shortDateFmt = new Intl.DateTimeFormat("es-PE", {
  month: "short",
  day: "numeric",
});

export const weekdayDateFmt = new Intl.DateTimeFormat("es-PE", {
  weekday: "short",
  month: "short",
  day: "numeric",
});

export const hmsTimeFmt = new Intl.DateTimeFormat("es-PE", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

// `Intl.NumberFormat.prototype.format` is a bound getter — safe to extract.
// es-PE agrupa miles con "," y decimales con "." (igual que en-US) — el
// cambio de locale es por consistencia con el resto de formatters, no
// porque cambie el resultado visual.
export const intFmt = new Intl.NumberFormat("es-PE").format;
