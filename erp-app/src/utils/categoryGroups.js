/**
 * Master Edition category group settings — enable groups, resolve units & workflows.
 */
import {
  CATEGORY_GROUPS,
  MASTER_EDITION_ID,
  getCategoryGroupById,
  getCategoryGroupForSubCategory,
} from "../config/categoryCatalog.js";

export { MASTER_EDITION_ID, CATEGORY_GROUPS, getCategoryGroupById, getCategoryGroupForSubCategory };

var DEFAULT_ENABLED_GROUPS = { general_retail: true };

export function groupsFromLegacyIndustry(businessType) {
  var bt = String(businessType || "").toLowerCase();
  if (!bt || bt === MASTER_EDITION_ID || bt === "master") return Object.assign({}, DEFAULT_ENABLED_GROUPS);
  var out = {};
  CATEGORY_GROUPS.forEach(function (g) {
    if ((g.legacyIndustries || []).indexOf(bt) >= 0) out[g.id] = true;
  });
  if (!Object.keys(out).length) out.general_retail = true;
  return out;
}

export function readEnabledCategoryGroups(settings) {
  var stored = settings && settings.enabledCategoryGroups;
  if (stored && typeof stored === "object" && !Array.isArray(stored)) {
    var has = false;
    Object.keys(stored).forEach(function (k) {
      if (stored[k] === true) has = true;
    });
    if (has) return Object.assign({}, stored);
  }
  return groupsFromLegacyIndustry(settings && settings._migratedFromIndustry);
}

export function hydrateCategoryGroupSettings(settings, businessType) {
  var next = Object.assign({}, settings || {});
  if (!next.enabledCategoryGroups || !Object.keys(next.enabledCategoryGroups).some(function (k) {
    return next.enabledCategoryGroups[k] === true;
  })) {
    var bt = businessType || next._migratedFromIndustry;
    next.enabledCategoryGroups = groupsFromLegacyIndustry(bt);
    if (bt && bt !== MASTER_EDITION_ID && bt !== "master") {
      next._migratedFromIndustry = bt;
    }
  }
  return next;
}

export function isCategoryGroupEnabled(settings, groupId) {
  var map = readEnabledCategoryGroups(settings);
  return map[groupId] === true;
}

export function getEnabledCategoryGroupsList(settings) {
  var map = readEnabledCategoryGroups(settings);
  return CATEGORY_GROUPS.filter(function (g) { return map[g.id] === true; });
}

export function getEnabledSubCategories(settings) {
  var list = [];
  getEnabledCategoryGroupsList(settings).forEach(function (g) {
    (g.subCategories || []).forEach(function (sub) {
      if (list.indexOf(sub) < 0) list.push(sub);
    });
  });
  if (list.indexOf("General") < 0) list.push("General");
  return list;
}

export function getUnitsForSubCategory(subCategory, settings) {
  var g = getCategoryGroupForSubCategory(subCategory);
  if (g && isCategoryGroupEnabled(settings || {}, g.id)) {
    return (g.units || ["Pcs"]).slice();
  }
  var enabled = getEnabledCategoryGroupsList(settings || {});
  if (enabled.length) return (enabled[0].units || ["Pcs"]).slice();
  return ["Pcs", "Box", "Set", "Pair"];
}

export function getUnionUnitsForEnabledGroups(settings) {
  var seen = {};
  var out = [];
  getEnabledCategoryGroupsList(settings).forEach(function (g) {
    (g.units || []).forEach(function (u) {
      if (!seen[u]) {
        seen[u] = true;
        out.push(u);
      }
    });
  });
  if (!out.length) return ["Pcs", "Box", "Set", "Pair"];
  return out;
}

export function getWorkflowForSubCategory(subCategory, settings) {
  var g = getCategoryGroupForSubCategory(subCategory);
  if (!g) return "standard";
  if (!isCategoryGroupEnabled(settings || {}, g.id)) return "standard";
  return g.workflow || "standard";
}

export function isGlassWorkflowCategory(subCategory, settings) {
  return getWorkflowForSubCategory(subCategory, settings) === "glass_cut";
}

export function isGlassWorkflowEnabled(settings) {
  return getEnabledCategoryGroupsList(settings).some(function (g) {
    return g.workflow === "glass_cut";
  });
}

export function persistCategoryGroupToggles(formMap) {
  var toggles = {};
  CATEGORY_GROUPS.forEach(function (g) {
    toggles[g.id] = formMap[g.id] === true;
  });
  return { enabledCategoryGroups: toggles, edition: MASTER_EDITION_ID };
}
