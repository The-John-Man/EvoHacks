import assert from "node:assert/strict";
import test from "node:test";
import { preparePracticeApplication } from "../scripts/autofill.mjs";

// These requests must fail before a browser or a provider session is contacted.
const draft = { origin: "https://claimable.example", answers: { householdSize: 3 } };

test("the practice driver accepts only a deployment origin", async () => {
  for (const origin of [
    "https://claimable.example/agency/form", "https://user@claimable.example",
    "http://claimable.example", "https://claimable.example?next=elsewhere",
  ]) {
    await assert.rejects(preparePracticeApplication({ ...draft, origin }), /Invalid practice origin/);
  }
});

test("the practice driver rejects extra fields and inaccurate number formats", async () => {
  for (const answers of [
    { signature: "Maria" }, { householdSize: 1.5 }, { householdSize: 0 },
    { utilitiesMonthly: -1 }, { rentMonthly: 2.001 }, { rentMonthly: "0" },
  ]) {
    await assert.rejects(preparePracticeApplication({ ...draft, answers }), /Unknown practice field|Invalid confirmed value/);
  }
});
