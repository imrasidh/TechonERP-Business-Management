#!/usr/bin/env node
/**
 * Publish Windows installer to GitHub Releases and update public version.json.
 *
 * Usage (from erp-app):
 *   npm run release                    # bump patch + build + publish
 *   npm run release -- --minor         # bump minor (2.0.2 → 2.1.0)
 *   npm run release -- --major         # bump major (2.0.2 → 3.0.0)
 *   npm run release -- --no-bump       # keep package.json version as-is
 *   npm run release -- --set 2.1.0     # set exact version
 *   npm run release:publish            # publish existing build (no bump, no rebuild)
 *   npm run release:publish -- --notes "Bug fixes"
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = join(__dirname, "..");
const RELEASE_OWNER = "imrasidh";
const RELEASE_REPO = "TechonERP-releases";
const RELEASE_DIR = join(appRoot, "release");
const PACKAGE_JSON = join(appRoot, "package.json");

function parseArgs(argv) {
  const out = {
    notes: "TechonERP Windows installer",
    skipBuild: false,
    bump: "patch", // patch | minor | major | none
    setVersion: null,
  };
  for (var i = 0; i < argv.length; i++) {
    if (argv[i] === "--notes" && argv[i + 1]) {
      out.notes = argv[++i];
    } else if (argv[i] === "--skip-build") {
      out.skipBuild = true;
      if (out.bump === "patch") out.bump = "none"; // don't bump by default when re-publishing
    } else if (argv[i] === "--no-bump") {
      out.bump = "none";
    } else if (argv[i] === "--patch") {
      out.bump = "patch";
    } else if (argv[i] === "--minor") {
      out.bump = "minor";
    } else if (argv[i] === "--major") {
      out.bump = "major";
    } else if (argv[i] === "--set" && argv[i + 1]) {
      out.setVersion = argv[++i];
      out.bump = "none";
    }
  }
  return out;
}

function run(cmd, args, opts) {
  const r = spawnSync(cmd, args, Object.assign({ cwd: appRoot, stdio: "inherit", shell: true }, opts || {}));
  if (r.status !== 0) {
    throw new Error((cmd + " " + args.join(" ")).trim() + " failed (" + r.status + ")");
  }
  return r;
}

function runCapture(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: appRoot, encoding: "utf8", shell: true });
  if (r.status !== 0) {
    throw new Error((cmd + " " + args.join(" ")).trim() + " failed: " + (r.stderr || r.stdout || r.status));
  }
  return (r.stdout || "").trim();
}

function readPackageJson() {
  return JSON.parse(readFileSync(PACKAGE_JSON, "utf8"));
}

function readPackageVersion() {
  const pkg = readPackageJson();
  if (!pkg.version) throw new Error("package.json missing version");
  return String(pkg.version);
}

function bumpSemver(version, kind) {
  const parts = String(version).split(".").map(function (n) {
    return parseInt(n, 10) || 0;
  });
  while (parts.length < 3) parts.push(0);
  var major = parts[0];
  var minor = parts[1];
  var patch = parts[2];
  if (kind === "major") {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (kind === "minor") {
    minor += 1;
    patch = 0;
  } else {
    patch += 1;
  }
  return major + "." + minor + "." + patch;
}

function writePackageVersion(nextVersion) {
  if (!/^\d+\.\d+\.\d+$/.test(nextVersion)) {
    throw new Error("Invalid version (use x.y.z): " + nextVersion);
  }
  const pkg = readPackageJson();
  const prev = pkg.version;
  pkg.version = nextVersion;
  writeFileSync(PACKAGE_JSON, JSON.stringify(pkg, null, 2) + "\n", "utf8");
  return { prev: prev, next: nextVersion };
}

function applyVersionBump(args) {
  if (args.setVersion) {
    const r = writePackageVersion(args.setVersion);
    console.log("Version set: " + r.prev + " → " + r.next);
    return r.next;
  }
  if (args.bump === "none") {
    const v = readPackageVersion();
    console.log("Version unchanged: " + v);
    return v;
  }
  const prev = readPackageVersion();
  const next = bumpSemver(prev, args.bump);
  writePackageVersion(next);
  console.log("Version bumped (" + args.bump + "): " + prev + " → " + next);
  return next;
}

function findSetupExe(version) {
  const candidates = [
    join(RELEASE_DIR, "Techon-ERP Setup " + version + ".exe"),
    join(RELEASE_DIR, "Techon-ERP Setup " + version + ".exe"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  // Fallback: any Setup *.exe
  try {
    const listing = runCapture("powershell", [
      "-NoProfile",
      "-Command",
      "Get-ChildItem -LiteralPath '" + RELEASE_DIR.replace(/'/g, "''") + "' -Filter '*.exe' | Where-Object { $_.Name -like '*Setup*' } | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName",
    ]);
    if (listing) return listing;
  } catch (_) {}
  return null;
}

function ensureZip(version) {
  mkdirSync(RELEASE_DIR, { recursive: true });
  const versionZip = join(RELEASE_DIR, "TechonERP-" + version + ".zip");
  const latestNamed = join(RELEASE_DIR, "TechonERP-latest.zip");
  const existingLatest = join(RELEASE_DIR, "latest.zip");

  if (existsSync(versionZip)) {
    copyFileSync(versionZip, latestNamed);
    return { versionZip, latestZip: latestNamed };
  }

  if (existsSync(existingLatest)) {
    copyFileSync(existingLatest, versionZip);
    copyFileSync(existingLatest, latestNamed);
    return { versionZip, latestZip: latestNamed };
  }

  const setupExe = findSetupExe(version);
  if (!setupExe) {
    throw new Error(
      "No installer found in release/. Run a full build first (npm run dist), or place TechonERP-" +
        version +
        ".zip / latest.zip there."
    );
  }

  console.log("Creating zip from:", setupExe);
  if (existsSync(versionZip)) unlinkSync(versionZip);
  run("powershell", [
    "-NoProfile",
    "-Command",
    "Compress-Archive -LiteralPath '" + setupExe.replace(/'/g, "''") + "' -DestinationPath '" + versionZip.replace(/'/g, "''") + "' -Force",
  ]);
  copyFileSync(versionZip, latestNamed);
  return { versionZip, latestZip: latestNamed };
}

function releaseExists(tag) {
  const r = spawnSync("gh", ["release", "view", tag, "--repo", RELEASE_OWNER + "/" + RELEASE_REPO], {
    cwd: appRoot,
    encoding: "utf8",
    shell: true,
  });
  return r.status === 0;
}

function downloadUrl(version) {
  return (
    "https://github.com/" +
    RELEASE_OWNER +
    "/" +
    RELEASE_REPO +
    "/releases/download/v" +
    version +
    "/TechonERP-" +
    version +
    ".zip"
  );
}

function upsertVersionJson(version, notes) {
  const payload = {
    version: version,
    url: downloadUrl(version),
    download: downloadUrl(version),
    notes: notes || "TechonERP Windows installer",
    publishedAt: new Date().toISOString(),
  };
  const content = JSON.stringify(payload, null, 2) + "\n";
  const b64 = Buffer.from(content, "utf8").toString("base64");
  const path = "version.json";
  let sha = null;
  const get = spawnSync(
    "gh",
    ["api", "repos/" + RELEASE_OWNER + "/" + RELEASE_REPO + "/contents/" + path],
    { cwd: appRoot, encoding: "utf8", shell: true }
  );
  if (get.status === 0) {
    try {
      sha = JSON.parse(get.stdout).sha;
    } catch (_) {}
  }
  const body = {
    message: "chore: bump version.json to " + version,
    content: b64,
    branch: "main",
  };
  if (sha) body.sha = sha;
  const put = spawnSync(
    "gh",
    ["api", "--method", "PUT", "repos/" + RELEASE_OWNER + "/" + RELEASE_REPO + "/contents/" + path, "--input", "-"],
    { cwd: appRoot, encoding: "utf8", shell: true, input: JSON.stringify(body) }
  );
  if (put.status !== 0) {
    throw new Error("Failed to update version.json on GitHub: " + (put.stderr || put.stdout));
  }
  // Keep local copy in sync for reference
  const localPublic = join(appRoot, "..", "public_html", "version.json");
  try {
    writeFileSync(localPublic, content, "utf8");
  } catch (_) {}
  return payload;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  console.log("0) Version…");
  const version = applyVersionBump(args);
  const tag = "v" + version;

  console.log("\nPublishing TechonERP " + version + " → " + RELEASE_OWNER + "/" + RELEASE_REPO);

  if (!args.skipBuild) {
    console.log("\n1) Building installer (npm run dist)…");
    run("npm", ["run", "dist"]);
  } else {
    console.log("\n1) Skipping build (--skip-build)");
  }

  console.log("\n2) Preparing zip…");
  const zips = ensureZip(version);

  console.log("\n3) Creating / updating GitHub release " + tag + "…");
  if (releaseExists(tag)) {
    console.log("Release " + tag + " already exists — uploading/replacing assets…");
    // delete existing assets with same names then upload
    run("gh", [
      "release",
      "upload",
      tag,
      zips.versionZip + "#TechonERP-" + version + ".zip",
      zips.latestZip + "#TechonERP-latest.zip",
      "--repo",
      RELEASE_OWNER + "/" + RELEASE_REPO,
      "--clobber",
    ]);
  } else {
    run("gh", [
      "release",
      "create",
      tag,
      zips.versionZip + "#TechonERP-" + version + ".zip",
      zips.latestZip + "#TechonERP-latest.zip",
      "--repo",
      RELEASE_OWNER + "/" + RELEASE_REPO,
      "--title",
      "TechonERP " + version,
      "--notes",
      args.notes,
    ]);
  }

  console.log("\n4) Updating version.json on GitHub…");
  const meta = upsertVersionJson(version, args.notes);

  console.log("\nDone.");
  console.log("  Release:  https://github.com/" + RELEASE_OWNER + "/" + RELEASE_REPO + "/releases/tag/" + tag);
  console.log("  Download: " + meta.url);
  console.log(
    "  Manifest: https://raw.githubusercontent.com/" +
      RELEASE_OWNER +
      "/" +
      RELEASE_REPO +
      "/main/version.json"
  );
  console.log("\nNo cPanel upload needed for the installer or version file.");
}

try {
  main();
} catch (e) {
  console.error("\nRelease failed:", e && e.message ? e.message : e);
  process.exit(1);
}
