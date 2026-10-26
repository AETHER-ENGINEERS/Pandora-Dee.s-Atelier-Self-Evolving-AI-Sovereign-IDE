import test from "node:test";
import assert from "node:assert/strict";
import { appKeyOf, parseToml, versionFromFilename } from "./xdc.mjs";

test("manifests parse", () => {
  const m = parseToml('# c\nname = "XDC-Chess"\nversion = "0.7.0+48"\nmin_api = 1\n[extra]\nx = 2\n');
  assert.equal(m.name, "XDC-Chess");
  assert.equal(m.version, "0.7.0+48");
  assert.equal(m.min_api, 1);
});

test("versions come from file names when the manifest has none", () => {
  assert.equal(versionFromFilename("sid-step-0.0.10-1"), "0.0.10 (1)");
  assert.equal(versionFromFilename("sid-step-0_1_0"), "0.1.0");
  assert.equal(versionFromFilename("path_of_the_fool_deep_descent_64"), "64");
  assert.equal(versionFromFilename("vexel"), "");
});

test("versions of one app group together", () => {
  assert.equal(appKeyOf("The Path of the Fool: Deep Descent"), "the-path-of-the-fool-deep-descent");
  assert.equal(appKeyOf("XDC-Chess"), appKeyOf("xdc chess"));
});
