import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const bundleDir = path.join(root, "src-tauri", "target", "release", "bundle", "dmg");
const downloadsDir = path.join(root, "landing_page", "downloads");
const canonicalName = "PPText-Editor-macos-arm64.dmg";

const entries = await readdir(bundleDir);
const dmgCandidates = (
  await Promise.all(
    entries
      .filter((name) => name.endsWith(".dmg") && name !== canonicalName)
      .map(async (name) => {
        const filePath = path.join(bundleDir, name);
        const fileStat = await stat(filePath);
        return { filePath, mtimeMs: fileStat.mtimeMs };
      }),
  )
).sort((a, b) => b.mtimeMs - a.mtimeMs);

if (dmgCandidates.length === 0) {
  throw new Error(`No source DMG found in ${bundleDir}`);
}

const sourceDmg = dmgCandidates[0].filePath;
const canonicalBundlePath = path.join(bundleDir, canonicalName);
const canonicalDownloadPath = path.join(downloadsDir, canonicalName);

await mkdir(downloadsDir, { recursive: true });
await copyFile(sourceDmg, canonicalBundlePath);
await copyFile(sourceDmg, canonicalDownloadPath);

console.log(`Prepared canonical macOS DMG:
- source: ${sourceDmg}
- bundle: ${canonicalBundlePath}
- download: ${canonicalDownloadPath}`);
