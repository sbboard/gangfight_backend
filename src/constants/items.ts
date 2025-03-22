export const ITEMS: Record<
  string,
  { price: number; generateMeta: () => string; maintainsValue?: boolean }
> = {
  invite: {
    price: 20_000_000,
    generateMeta: () =>
      Math.random()
        .toString(36)
        .substring(2, 7)
        .replace(/[0-9]/g, "")
        .toUpperCase(),
  },
  "bookie license": { price: 11_000_000, generateMeta: () => "" },
  adblock: { price: 1_000_000, generateMeta: () => "" },
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
