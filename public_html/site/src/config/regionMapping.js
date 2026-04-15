import { DEFAULT_REGION } from "./pricingConfig";

const SOUTH_ASIA = ["LK", "IN", "PK", "BD", "NP", "MV"];
const SEA = ["ID", "TH", "PH", "VN", "MY"];
const GCC = ["AE", "SA", "QA", "KW", "BH", "OM"];
const JP_SG_KR = ["JP", "SG", "KR", "CN"];
const WEST = ["US", "GB", "CA", "AU", "DE", "FR", "IT"];

const buildRegionMap = () => {
  const map = {};
  SOUTH_ASIA.forEach((code) => { map[code] = "SOUTH_ASIA"; });
  SEA.forEach((code) => { map[code] = "SEA"; });
  GCC.forEach((code) => { map[code] = "GCC"; });
  JP_SG_KR.forEach((code) => { map[code] = "JP_SG_KR"; });
  WEST.forEach((code) => { map[code] = "WEST"; });
  return map;
};

export const COUNTRY_TO_REGION = buildRegionMap();

export const getRegionByCountry = (countryCode = "") =>
  COUNTRY_TO_REGION[countryCode.toUpperCase()] || DEFAULT_REGION;
