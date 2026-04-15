export function showPermissionDenied(actionName, deps) {
  var action = String(actionName || "perform this action").trim();
  var showAlert = deps && deps.showAlert;
  var addAudit = deps && deps.addAudit;
  var actor = deps && deps.actor ? deps.actor : null;

  if (typeof showAlert === "function") {
    showAlert("You do not have permission to " + action + ". Please contact your administrator.");
  }

  if (typeof addAudit === "function") {
    addAudit("permission_denied", action, {
      type: "permission_denied",
      action: action,
      user: actor && actor.username ? actor.username : "",
      role: actor && actor.role ? actor.role : "",
    });
  }
}

