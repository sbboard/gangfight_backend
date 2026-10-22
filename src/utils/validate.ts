// Accepts numbers or numeric strings; anything else (negative, fractional, NaN) is null
export const toPositiveInt = (value: unknown): number | null => {
  const num = typeof value === "string" ? Number(value) : value;
  return typeof num === "number" && Number.isInteger(num) && num > 0
    ? num
    : null;
};
