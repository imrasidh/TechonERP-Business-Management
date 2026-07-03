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

export function getCategoryOptionGroups(settings) {
  return getEnabledCategoryGroupsList(settings).map(function (g) {
    return {
      id: g.id,
      label: g.label,
      emoji: g.emoji || "",
      workflow: g.workflow || "standard",
      options: (g.subCategories || []).slice(),
    };
  });
}

/** Resolve main group + sub-category for product forms (legacy names kept as sub-only). */
export function resolveCategorySelection(subCategory, settings) {
  var groups = getCategoryOptionGroups(settings);
  var sub = String(subCategory || "").trim();
  var groupId = "";
  if (sub) {
    var g = getCategoryGroupForSubCategory(sub);
    if (g && groups.some(function (gr) { return gr.id === g.id; })) groupId = g.id;
  }
  if (!groupId && groups.length) groupId = groups[0].id;
  return { groups: groups, groupId: groupId, subCategory: sub };
}

export function getSubCategoriesForGroup(groupId, settings, currentSub) {
  var groups = getCategoryOptionGroups(settings);
  var grp = groups.find(function (g) { return g.id === groupId; });
  var opts = grp ? grp.options.slice() : [];
  var sub = String(currentSub || "").trim();
  if (sub && opts.indexOf(sub) < 0) opts.unshift(sub);
  if (!opts.length) opts = ["General"];
  return opts;
}

export function getDefaultProductGroupId(settings) {
  var groups = getCategoryOptionGroups(settings);
  return groups.length ? groups[0].id : "";
}

export function getDefaultProductCategory(settings) {
  var groups = getCategoryOptionGroups(settings);
  if (groups.length && groups[0].options.length) return groups[0].options[0];
  return "General";
}

export function getDefaultProductUnit(settings, category) {
  var units = getUnitsForSubCategory(category || getDefaultProductCategory(settings), settings);
  return units[0] || "Pcs";
}

export function hydrateShopSettings(settings, businessType) {
  return hydrateCategoryGroupSettings(settings || {}, businessType);
}

export function persistCategoryGroupToggles(formMap) {
  var toggles = {};
  CATEGORY_GROUPS.forEach(function (g) {
    toggles[g.id] = formMap[g.id] === true;
  });
  return { enabledCategoryGroups: toggles, edition: MASTER_EDITION_ID };
}
