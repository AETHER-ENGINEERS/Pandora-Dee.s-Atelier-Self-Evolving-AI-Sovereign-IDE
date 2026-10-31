import test from "node:test";
import assert from "node:assert/strict";
import { assetFor } from "./ungoogled.mjs";

// file names from the ungoogled-software releases (10-31)
const names = [
  "ungoogled-chromium_156.0.8078.73-1.1_installer_x64.exe",
  "ungoogled-chromium_156.0.8078.73-1.1_windows_arm64.zip",
  "ungoogled-chromium_156.0.8078.73-1.1_windows_x64.zip",
  "ungoogled-chromium_156.0.8078.73-1.1_windows_x86.zip",
  "ungoogled-chromium_156.0.8078.47-1.1_arm64-macos.dmg",
  "ungoogled-chromium_156.0.8078.47-1.1_x86_64-macos.dmg",
  "ungoogled-chromium-156.0.8078.79-1-x86_64.AppImage",
  "ungoogled-chromium-156.0.8078.79-1-arm64_linux.tar.xz",
  "ungoogled-chromium-156.0.8078.79-1-x86_64_linux.tar.xz",
];
const pick = (platform, arch) => {
  const a = assetFor(platform, arch);
  return a && { repo: a.repo, file: names.filter((n) => a.match.test(n)) };
};

test("each computer gets the one Ungoogled Chromium file that suits it", () => {
  assert.deepEqual(pick("win32", "x64"), { repo: "ungoogled-chromium-windows", file: ["ungoogled-chromium_156.0.8078.73-1.1_windows_x64.zip"] });
  assert.deepEqual(pick("win32", "arm64").file, ["ungoogled-chromium_156.0.8078.73-1.1_windows_arm64.zip"]);
  assert.deepEqual(pick("darwin", "arm64"), { repo: "ungoogled-chromium-macos", file: ["ungoogled-chromium_156.0.8078.47-1.1_arm64-macos.dmg"] });
  assert.deepEqual(pick("darwin", "x64").file, ["ungoogled-chromium_156.0.8078.47-1.1_x86_64-macos.dmg"]);
  assert.deepEqual(pick("linux", "x64"), { repo: "ungoogled-chromium-portablelinux", file: ["ungoogled-chromium-156.0.8078.79-1-x86_64_linux.tar.xz"] });
  assert.equal(pick("freebsd", "x64"), null);
});
