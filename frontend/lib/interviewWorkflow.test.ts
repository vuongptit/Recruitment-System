import assert from "node:assert/strict";
import test from "node:test";
import { interviewActions, interviewDate, interviewGuidance, validatePreferredSlots } from "./interviewWorkflow";
import type { Interview } from "./interviewApi";
const now = Date.parse("2030-01-01T02:00:00Z");
const iv: Interview = { id:"fixture",applicationId:"application",roundNumber:1,scheduledStart:"2030-01-01T05:00:00Z",scheduledEnd:"2030-01-01T05:45:00Z",timeZone:"Asia/Ho_Chi_Minh",durationMinutes:45,mode:"ONLINE",location:null,status:"SCHEDULED" };

test("candidate consent, reschedule and room availability have separate conditions", () => {
 assert.equal(interviewActions(iv, now).confirm, true);
 assert.equal(interviewActions(iv, now).join, false);
 assert.equal(interviewActions({...iv,status:"RESCHEDULE_REQUESTED"},now).confirm,false);
 assert.equal(interviewActions({...iv,status:"RESCHEDULE_REQUESTED"},now).join,false);
 assert.equal(interviewActions({...iv,status:"CANCELLED"},now).cancel,false);
 assert.equal(interviewActions(iv,Date.parse(iv.scheduledStart)-15*60_000).join,true);
 assert.equal(interviewActions({...iv,mode:"OFFLINE"},Date.parse(iv.scheduledStart)).join,false);
});
test("cancel cutoff matches backend and feedback cannot finish an interview in the future", () => {
 const start = Date.parse(iv.scheduledStart);
 assert.equal(interviewActions(iv,start-2*3600_000).cancel,true);
 assert.equal(interviewActions(iv,start-2*3600_000+1).cancel,false);
 assert.equal(interviewActions(iv,start-1).feedback,false);
 assert.equal(interviewActions(iv,start).feedback,true);
 assert.equal(interviewActions({...iv,status:"RESCHEDULE_REQUESTED"},start).feedback,false);
 assert.equal(interviewActions(iv,start).reschedule,false);
 assert.equal(interviewActions({...iv,status:"RESCHEDULE_REQUESTED"},start+3600_000).reschedule,true);
});
test("preferred times cannot be duplicate instants, past or non-date strings", () => {
 assert.ok(validatePreferredSlots(["2030-01-02T00:00:00Z","2030-01-02T07:00:00+07:00"],now));
 assert.ok(validatePreferredSlots(["2029-01-01T00:00:00Z","2030-01-02T00:00:00Z"],now));
 assert.ok(validatePreferredSlots(["tomorrow","Friday"],now));
 assert.equal(validatePreferredSlots(["2030-01-02T00:00:00Z","2030-01-03T00:00:00Z"],now),null);
 assert.match(interviewGuidance({...iv,status:"CANCELLED"}),/không đồng nghĩa kết thúc/);
 assert.doesNotMatch(interviewGuidance({...iv,status:"CONFIRMED",mode:"OFFLINE"},false,now),/phòng trực tuyến/);
 assert.match(interviewDate("2030-01-01T18:00:00Z"),/2\/1\/30/);
});
