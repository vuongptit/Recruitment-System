import assert from "node:assert/strict";
import test from "node:test";
import { APPLICATION_STATUSES, applicationGuidance, applicationProgress, candidateApplicationActions, formatApplicationDate, isApplicationTerminal } from "./applicationStateMachine";

test("both portals have guidance for every persisted status, with no withdrawal command", () => {
  for (const status of APPLICATION_STATUSES) {
    assert.ok(applicationGuidance(status, "CANDIDATE"));
    assert.ok(applicationGuidance(status, "RECRUITER"));
    assert.ok(candidateApplicationActions(status).every((action) => action.kind === "RESPOND_OFFER"));
  }
  assert.equal(isApplicationTerminal("REVIEWING"), false);
  assert.equal(isApplicationTerminal("INTERVIEW"), false);
  assert.equal(isApplicationTerminal("REJECTED"), true);
});

test("a rejected or legacy-withdrawn record never invents unrecorded interview or offer progress", () => {
  assert.ok(applicationProgress("REJECTED").every((step) => step.state === "upcoming"));
  const history = [{ fromStatus: "REVIEWING", toStatus: "REJECTED", changedAt: "2026-11-13T00:00:00Z", note: "Không phù hợp" }];
  assert.deepEqual(applicationProgress("REJECTED", history).map((step) => step.state), ["recorded", "recorded", "upcoming", "upcoming", "upcoming"]);
  assert.equal(applicationProgress("WITHDRAWN", history).filter((step) => step.state === "current").length, 0);
});

test("the current stage is unique and OFFER never implies acceptance", () => {
  assert.deepEqual(applicationProgress("OFFER").map((step) => step.state), ["passed", "passed", "passed", "current", "upcoming"]);
  assert.equal(isApplicationTerminal("OFFER"), false);
  assert.match(applicationGuidance("INTERVIEW", "CANDIDATE"), /chưa xác nhận đã có lịch/);
});

test("application times use Vietnam time even across the UTC day boundary", () => {
  assert.match(formatApplicationDate("2026-11-12T18:00:00Z"), /13\/11\/26/);
  assert.match(formatApplicationDate("2026-11-12T18:00:00Z"), /01:00/);
  assert.equal(formatApplicationDate("invalid"), "Chưa có thời gian");
});
