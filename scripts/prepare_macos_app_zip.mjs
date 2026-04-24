import { copyFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const appPath = path.join(root, "src-tauri", "target", "release", "bundle", "macos", "PPText Editor.app");
const bundleDir = path.dirname(appPath);
const downloadsDir = path.join(root, "landing_page", "downloads");
const canonicalName = "PPText-Editor-macos-arm64.app.zip";
const bundleZipPath = path.join(bundleDir, canonicalName);
const downloadZipPath = path.join(downloadsDir, canonicalName);

await mkdir(downloadsDir, { recursive: true });
await rm(bundleZipPath, { force: true });
await rm(downloadZipPath, { force: true });

const signResult = spawnSync("codesign", ["--force", "--deep", "--sign", "-", appPath], {
  encoding: "utf8",
});

if (signResult.status !== 0) {
  throw new Error(signResult.stderr || signResult.stdout || "Failed to ad-hoc sign macOS app.");
}

const verifyResult = spawnSync("codesign", ["--verify", "--deep", "--strict", "--verbose=4", appPath], {
  encoding: "utf8",
});

if (verifyResult.status !== 0) {
  throw new Error(verifyResult.stderr || verifyResult.stdout || "Failed to verify macOS app signature.");
}

const result = spawnSync("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", appPath, bundleZipPath], {
  encoding: "utf8",
});

if (result.status !== 0) {
  throw new Error(result.stderr || result.stdout || "Failed to create macOS app zip.");
}

await copyFile(bundleZipPath, downloadZipPath);

console.log(`Prepared canonical macOS app zip:
- app: ${appPath}
- bundle: ${bundleZipPath}
- download: ${downloadZipPath}`);
