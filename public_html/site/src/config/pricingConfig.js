export { REGION_MULTIPLIERS } from "./currencyMapping.js";

export const DEFAULT_REGION = "WEST";
export const DEFAULT_COUNTRY = "US";

export const BASE_PRICING_LKR = {
  plans: {
    monthly: 1000,
    yearly: 8500,
    twoYears: 15000,
    lifetime: 30000,
  },
  cloudAddonYearly: 6000,
};

/** LAN / sub-PC client licenses (base = South Asia). Per client PC; separate from standalone server pricing. */
export const BASE_CLIENT_PRICING_LKR = {
  monthly: 300,
  yearly: 3000,
  twoYears: 5000,
  lifetime: 10000,
};

export const PLAN_PERIODS = {
  free: "7 Days",
  monthly: "/ month",
  yearly: "/ year",
  twoYears: "/ 2 years",
  lifetime: "one-time",
  cloudAddon: "per year · billed annually",
};

export const PRICING_STORAGE_KEY = "techonerp_selected_country";
