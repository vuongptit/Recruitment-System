import assert from "node:assert/strict";
import test from "node:test";
import { locationSearchValue, normalizeLocationText, provinceForLocation, wardForLocation } from "./locations/catalogue";

test("province and ward selection retain the existing address search contract", () => {
  const province = provinceForLocation("Hà Nội");
  assert.ok(province);
  assert.equal(province.code, "01");
  assert.equal(locationSearchValue(province), "Hà Nội");
  const location = locationSearchValue(province, "Phường Ba Đình");
  assert.equal(location, "Phường Ba Đình, Hà Nội");
  assert.equal(provinceForLocation(location)?.code, "01");
  assert.equal(wardForLocation(location, province), "Phường Ba Đình");
  assert.equal(locationSearchValue(undefined), "");
});

test("location search accepts accented names and preserves unknown legacy location text", () => {
  assert.equal(normalizeLocationText("Đà Nẵng"), "da nang");
  assert.equal(provinceForLocation("thanh pho ha noi")?.shortName, "Hà Nội");
  assert.equal(provinceForLocation("Remote"), undefined);
  assert.equal(wardForLocation("Hà Nội", provinceForLocation("Hà Nội")), "");
});
