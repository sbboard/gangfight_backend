export const ITEMS: Record<
  string,
  { price: number; generateMeta: () => string; maintainsValue?: boolean }
> = {
  invite: {
    price: 20_000_000,
    generateMeta: () => {
      let code;
      do {
        code = Math.random()
          .toString(36)
          .substring(2, 6) // Generate a 4-character string
          .replace(/[0-9]/g, "")
          .toUpperCase();
      } while (code.length < 4); // Ensure the code is exactly 4 characters
      return code;
    },
  },
  "bookie license": { price: 11_000_000, generateMeta: () => "" },
  adblock: { price: 1_000_000, generateMeta: () => "" },
  "joes eye": { price: 10000, generateMeta: () => "" },
  "magic beans": {
    price: 100_000_000,
    generateMeta: () => "",
    maintainsValue: true,
  },
  "shield of turin": {
    price: 250_000_000,
    generateMeta: () => "",
    maintainsValue: true,
  },
  head: { price: 500_000_000, generateMeta: () => "", maintainsValue: true },
  demon: { price: 1_000_000_000, generateMeta: () => "", maintainsValue: true },
};
