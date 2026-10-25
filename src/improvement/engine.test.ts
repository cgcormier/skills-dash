import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createImprovementEngine,
  pendingEvidence,
  type EvidenceEligibility,
} from "./engine";
import { FakeReviewer, parseReviewDecision, sha256 } from "./reviewer";
import { parseReport, parseStore } from "./storage";
import {
  DEFAULT_SETTINGS,
  effectiveMode,
  emptyStore,
  type ImprovementReview,
  type LifecyclePersistence,
  type Reviewer,
  type UseReport,
} from "./types";
import { validateProposal } from "./validation";

const folder = "improvement-pilot-slugs";
const path = `C:\\fixture\\.agents\\skills\\${folder}\\SKILL.md`;
const base = `---\nname: ${folder}\ndescription: Disposable slug pilot\n---\nConvert lines using this configuration.\n\n\`\`\`skill-task\n{"kind":"slug-lines","lowercase":false,"trim":true,"replaceSpaces":true,"removePunctuation":true,"omitEmpty":true}\n\`\`\`\n`;
const proposed = base.replace('"lowercase":false', '"lowercase":true');
const profile = {
  id: "test-profile",
  root: "C:\\fixture\\.agents\\skills",
  dataDir: "C:\\fixture\\data",
  test: true,
};
function defer<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function decision(
  request: Parameters<Reviewer["review"]>[0],
  kind: "proposal" | "no-change" | "insufficient-evidence" = "no-change",
  content = proposed,
) {
  const snapshot = JSON.parse(
    request.prompt.split("IMMUTABLE_SNAPSHOT_JSON\n")[1],
  );
  return {
    output: JSON.stringify({
      decision: kind,
      rationale: "Repeated factual reports support this decision.",
      proposedContent: kind === "proposal" ? content : null,
      evidenceIds: snapshot.evidence.map((item: { id: string }) => item.id),
    }),
  };
}
function harness(
  reviewer = new FakeReviewer(async (request) => decision(request)),
  eligibility?: EvidenceEligibility,
) {
  let raw: string | null = null;
  let revision: string | null = null;
  let next = 0;
  let content = base;
  const reports: { id: string; raw: string }[] = [];
  const persistence: LifecyclePersistence = {
    read: vi.fn(async () => ({
      raw,
      revision,
      reports: structuredClone(reports),
      profile,
    })),
    write: vi.fn(async (expected, value) => {
      if (expected !== revision) throw new Error("CAS mismatch");
      raw = value;
      revision = String(++next);
      return { revision };
    }),
  };
  const skills = {
    readSkill: vi.fn(async (_folder: string) => ({
      content,
      path: _folder === folder ? path : path.replace(folder, _folder),
    })),
    saveSkill: vi.fn(
      async (_folder: string, expected: string, value: string) => {
        if (expected !== content) throw new Error("Source is stale");
        content = value;
        return { recoveryPath: "C:\\fixture\\recovery" };
      },
    ),
  };
  let id = 0;
  const make = () =>
    createImprovementEngine({
      persistence,
      reviewer,
      skills,
      clock: () => new Date("2026-10-24T12:00:00Z"),
      id: () => `review-${++id}`,
      eligibility,
    });
  const engine = make();
  return {
    engine,
    reviewer,
    persistence,
    skills,
    reports,
    make,
    get raw() {
      return raw;
    },
    set raw(value: string | null) {
      raw = value;
    },
    get content() {
      return content;
    },
    set content(value: string) {
      content = value;
    },
  };
}
async function report(
  task: number,
  extra: Partial<UseReport> = {},
): Promise<UseReport> {
  return {
    version: 1,
    id: `report-${task}`,
    folder,
    sourcePath: path,
    sourceKind: "personal",
    revision: await sha256(base),
    taskId: `task-${task}`,
    kind: "task",
    observation: `Uppercase source produced an inconsistent slug on task ${task}.`,
    evidenceRefs: [`test-result-${task}`],
    reportedAt: "2026-10-24T12:00:00Z",
    ...extra,
  };
}
async function enable(
  h: ReturnType<typeof harness>,
  mode: "propose" | "auto-update" = "propose",
) {
  await h.engine.initialize();
  await h.engine.setSettings({ enabled: true, defaultMode: mode });
}
async function add(h: ReturnType<typeof harness>, start: number, end: number) {
  for (let i = start; i <= end; i += 1)
    await h.engine.recordReport(await report(i));
}
async function settled(
  h: ReturnType<typeof harness>,
  status: ImprovementReview["status"],
) {
  await vi.waitFor(
    () =>
      expect(h.engine.getSnapshot().store.reviews.at(-1)?.status).toBe(status),
    { timeout: 3000 },
  );
  await vi.waitFor(() =>
    expect(h.engine.getSnapshot().activeReviewId).toBeNull(),
  );
}
const engines: ReturnType<typeof harness>[] = [];
function keep(h: ReturnType<typeof harness>) {
  engines.push(h);
  return h;
}
afterEach(() => {
  engines.splice(0).forEach((h) => h.engine.dispose());
  vi.useRealTimers();
});

describe("skill improvement lifecycle", () => {
  it("cancels the reviewer when storage is blocked and preserves the original corruption cause", async () => {
    const reviewer = Object.assign(
      new FakeReviewer(() => new Promise<{ output: string }>(() => undefined)),
      { cancel: vi.fn(async () => undefined) },
    );
    const h = keep(harness(reviewer));
    await enable(h);
    await add(h, 1, 5);
    await vi.waitFor(() => expect(reviewer.requests).toHaveLength(1));
    h.raw = "{broken";
    await expect(h.engine.refreshInbox()).rejects.toThrow("store.JSON");
    await expect(h.engine.cancelReview("review-1")).resolves.toBeUndefined();
    await vi.waitFor(() =>
      expect(h.engine.getSnapshot().activeReviewId).toBeNull(),
    );
    expect(reviewer.cancel).toHaveBeenCalledTimes(1);
    expect(h.engine.getSnapshot().error).toContain("store.JSON");
    expect(h.engine.getSnapshot().store.reviews[0].status).toBe("cancelled");
    expect(pendingEvidence(h.engine.getSnapshot().store, folder)).toHaveLength(
      5,
    );
    expect(h.raw).toBe("{broken");
  });
  it("keeps validation-failed evidence pending across another failed retry", async () => {
    let count = 0;
    const reviewer = new FakeReviewer(async (request) =>
      ++count === 1
        ? decision(
            request,
            "proposal",
            proposed.replace('"trim":true', '"trim":false'),
          )
        : count === 2
          ? { output: "not JSON" }
          : decision(request),
    );
    const h = keep(harness(reviewer));
    await enable(h);
    await add(h, 1, 5);
    await settled(h, "proposal");
    expect(h.engine.getSnapshot().store.reviews[0].validation?.behavioral).toBe(
      "failed",
    );
    expect(pendingEvidence(h.engine.getSnapshot().store, folder)).toHaveLength(
      5,
    );
    await h.engine.retryReview("review-1");
    await settled(h, "failed");
    expect(pendingEvidence(h.engine.getSnapshot().store, folder)).toHaveLength(
      5,
    );
    await h.engine.retryReview("review-2");
    await settled(h, "no-change");
    expect(reviewer.requests).toHaveLength(3);
  });
  it("retains restoration intent through recovery-required and a later restart", async () => {
    const h = keep(
      harness(
        new FakeReviewer(async (request) => decision(request, "proposal")),
      ),
    );
    await enable(h);
    await add(h, 1, 5);
    await settled(h, "proposal");
    await h.engine.applyReview("review-1");
    h.skills.saveSkill.mockImplementationOnce(async () => {
      throw new Error("Restoration interrupted");
    });
    h.skills.readSkill
      .mockResolvedValueOnce({ content: proposed, path })
      .mockRejectedValueOnce(new Error("Source temporarily missing"));
    await expect(h.engine.restoreReview("review-1")).rejects.toThrow(
      "Restoration interrupted",
    );
    expect(h.engine.getSnapshot().store.reviews[0].status).toBe(
      "recovery-required",
    );
    h.content = base;
    h.engine.dispose();
    const restarted = h.make();
    try {
      await restarted.initialize();
      expect(restarted.getSnapshot().store.reviews[0].status).toBe("restored");
    } finally {
      restarted.dispose();
    }
    expect(h.skills.saveSkill).toHaveBeenCalledTimes(2);
  });
  it("upgrades a legacy restoring journal before a temporary read failure loses its status", async () => {
    const h = keep(
      harness(
        new FakeReviewer(async (request) => decision(request, "proposal")),
      ),
    );
    await enable(h);
    await add(h, 1, 5);
    await settled(h, "proposal");
    const stored = parseStore(h.raw);
    const review = stored.reviews[0];
    review.status = "restoring";
    review.publication = {
      previousContent: base,
      proposedContent: proposed,
      recoveryPath: null,
      startedAt: "2026-10-24T12:00:00Z",
      completedAt: null,
    };
    h.raw = JSON.stringify(stored);
    h.engine.dispose();
    h.skills.readSkill.mockRejectedValueOnce(new Error("Temporarily missing"));
    const firstRestart = h.make();
    try {
      await firstRestart.initialize();
      expect(firstRestart.getSnapshot().store.reviews[0].status).toBe(
        "recovery-required",
      );
      expect(parseStore(h.raw).reviews[0].publication?.operation).toBe(
        "restore",
      );
    } finally {
      firstRestart.dispose();
    }
    const secondRestart = h.make();
    try {
      await secondRestart.initialize();
      expect(secondRestart.getSnapshot().store.reviews[0].status).toBe(
        "restored",
      );
    } finally {
      secondRestart.dispose();
    }
    expect(h.skills.saveSkill).not.toHaveBeenCalled();
  });
  it("starts disabled and inherits folder policy under the global kill switch", () => {
    const store = emptyStore();
    expect(store.settings).toEqual(DEFAULT_SETTINGS);
    expect(
      effectiveMode(store.settings, { [folder]: "auto-update" }, folder),
    ).toBe("off");
    store.settings.enabled = true;
    expect(effectiveMode(store.settings, { [folder]: "inherit" }, folder)).toBe(
      "propose",
    );
    expect(effectiveMode(store.settings, { [folder]: "observe" }, folder)).toBe(
      "observe",
    );
    expect(
      effectiveMode(store.settings, { [folder]: "off" }, folder.toUpperCase()),
    ).toBe("off");
    expect(effectiveMode(store.settings, {}, "constructor")).toBe("propose");
  });
  it("uses a replaceable eligibility policy while keeping the distinct-use default", async () => {
    const eligibility = { eligible: vi.fn(() => false) };
    const h = keep(harness(undefined, eligibility));
    await enable(h);
    await add(h, 1, 5);
    await h.engine.refreshInbox();
    expect(eligibility.eligible).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ taskId: "task-1" })]),
      5,
    );
    expect(h.reviewer.requests).toHaveLength(0);
    expect(h.engine.getEligibility(folder).status).toBe("waiting");
  });
  it("exposes the daily budget block for otherwise eligible new evidence", async () => {
    const h = keep(harness());
    await enable(h);
    await h.engine.setSettings({ dailyLimit: 1 });
    await add(h, 1, 5);
    await settled(h, "no-change");
    await add(h, 6, 10);
    expect(h.engine.getEligibility(folder)).toEqual({
      status: "daily-limit",
      pending: 5,
      threshold: 5,
      attemptsToday: 1,
      dailyLimit: 1,
    });
    expect(h.reviewer.requests).toHaveLength(1);
  });
  it("recovers a successful file save whose lifecycle completion write failed without republishing", async () => {
    const h = keep(
      harness(
        new FakeReviewer(async (request) => decision(request, "proposal")),
      ),
    );
    await enable(h);
    await add(h, 1, 5);
    await settled(h, "proposal");
    const originalWrite = h.persistence.write;
    let failOnce = true;
    h.persistence.write = async (expected, raw) => {
      if (failOnce && parseStore(raw).reviews[0]?.status === "published") {
        failOnce = false;
        throw new Error("Interrupted completion write");
      }
      return originalWrite(expected, raw);
    };
    await expect(h.engine.applyReview("review-1")).rejects.toThrow(
      "successful reload",
    );
    expect(h.content).toBe(proposed);
    expect(parseStore(h.raw).reviews[0].status).toBe("publishing");
    await h.engine.initialize();
    expect(h.engine.getSnapshot().store.reviews[0].status).toBe("published");
    expect(h.skills.saveSkill).toHaveBeenCalledTimes(1);
  });
  it("Off blocks direct recording and defers inbox evidence until policy permits recording", async () => {
    const h = keep(harness());
    await h.engine.initialize();
    await expect(h.engine.recordReport(await report(1))).rejects.toThrow(
      "Off policy",
    );
    h.reports.push({
      id: "deferred-inbox",
      raw: JSON.stringify(await report(2)),
    });
    await h.engine.refreshInbox();
    expect(h.engine.getSnapshot().store.observations).toHaveLength(0);
    expect(h.engine.getSnapshot().store.receipts).toHaveLength(0);
    await h.engine.setSettings({ enabled: true, defaultMode: "observe" });
    await h.engine.refreshInbox();
    expect(h.engine.getSnapshot().store.observations).toHaveLength(1);
    expect(h.engine.getSnapshot().store.receipts[0]).toEqual({
      id: "deferred-inbox",
      status: "imported",
      error: null,
    });
  });
  it("repeated initialize during a review preserves its generation and single process slot", async () => {
    const deferred = defer<{ output: string }>();
    const reviewer = new FakeReviewer(() => deferred.promise);
    const h = keep(harness(reviewer));
    await enable(h);
    await add(h, 1, 5);
    await vi.waitFor(() => expect(reviewer.requests).toHaveLength(1));
    await h.engine.initialize();
    expect(h.engine.getSnapshot().store.reviews[0].status).toBe("reviewing");
    expect(h.engine.getSnapshot().activeReviewId).toBe("review-1");
    deferred.resolve(decision(reviewer.requests[0]));
    await settled(h, "no-change");
    expect(reviewer.requests).toHaveLength(1);
  });
  it("does not start a reviewer when Off is requested during the async source read", async () => {
    const h = keep(harness());
    await enable(h);
    await add(h, 1, 1);
    const source = defer<{ content: string; path: string }>();
    h.skills.readSkill.mockImplementationOnce(() => source.promise);
    const calls = h.skills.readSkill.mock.calls.length;
    const starting = h.engine.reviewNow(folder);
    await vi.waitFor(() =>
      expect(h.skills.readSkill.mock.calls.length).toBe(calls + 1),
    );
    const turningOff = h.engine.setSettings({ enabled: false });
    source.resolve({ content: base, path });
    await expect(starting).rejects.toThrow("Policy changed");
    await turningOff;
    expect(h.reviewer.requests).toHaveLength(0);
    expect(h.engine.getSnapshot().store.reviews).toHaveLength(0);
    expect(pendingEvidence(h.engine.getSnapshot().store, folder)).toHaveLength(
      1,
    );
  });
  it("does not publish when Off is requested while the publication journal is being persisted", async () => {
    const reviewer = new FakeReviewer(async (request) =>
      decision(request, "proposal"),
    );
    const h = keep(harness(reviewer));
    await enable(h);
    await add(h, 1, 5);
    await settled(h, "proposal");
    const gate = defer<void>();
    const originalWrite = h.persistence.write;
    const journalStarted = defer<void>();
    h.persistence.write = async (expected, raw) => {
      if (parseStore(raw).reviews.at(-1)?.status === "publishing") {
        journalStarted.resolve();
        await gate.promise;
      }
      return originalWrite(expected, raw);
    };
    const applying = h.engine.applyReview("review-1");
    await journalStarted.promise;
    const turningOff = h.engine.setSettings({ enabled: false });
    gate.resolve();
    await applying;
    await turningOff;
    expect(h.skills.saveSkill).not.toHaveBeenCalled();
    expect(h.engine.getSnapshot().store.reviews[0].status).toBe("unpublished");
    expect(h.content).toBe(base);
  });
  it("holds the global process slot until native cancellation is acknowledged", async () => {
    const cancelled = defer<void>();
    const reviewer = Object.assign(
      new FakeReviewer(() => new Promise<{ output: string }>(() => undefined)),
      { cancel: vi.fn(() => cancelled.promise) },
    );
    const h = keep(harness(reviewer));
    await enable(h);
    await add(h, 1, 5);
    await vi.waitFor(() => expect(reviewer.requests).toHaveLength(1));
    const cancellation = h.engine.cancelReview("review-1");
    await vi.waitFor(() =>
      expect(h.engine.getSnapshot().store.reviews[0].status).toBe("cancelled"),
    );
    for (let i = 6; i <= 10; i += 1)
      await h.engine.recordReport(
        await report(i, {
          folder: "other",
          sourcePath: path.replace(folder, "other"),
        }),
      );
    expect(reviewer.requests).toHaveLength(1);
    expect(h.engine.getSnapshot().activeReviewId).toBe("review-1");
    cancelled.resolve();
    await cancellation;
    await vi.waitFor(() => expect(reviewer.requests).toHaveLength(2));
    expect(reviewer.cancel).toHaveBeenCalledTimes(1);
    await h.engine.cancelReview("review-2");
    await vi.waitFor(() =>
      expect(h.engine.getSnapshot().activeReviewId).toBeNull(),
    );
  });
  it("blocks a queued review when Off was requested before its queue operation begins", async () => {
    const h = keep(harness());
    await enable(h);
    await add(h, 1, 1);
    const starting = h.engine.reviewNow(folder);
    const turningOff = h.engine.setSettings({ enabled: false });
    await expect(starting).rejects.toThrow("policy change is pending");
    await turningOff;
    expect(h.reviewer.requests).toHaveLength(0);
    expect(h.engine.getSnapshot().store.reviews).toHaveLength(0);
  });
  it("keeps late duplicate reports covered but reopens new factual information for the same task", async () => {
    const h = keep(harness());
    await enable(h);
    await add(h, 1, 5);
    await settled(h, "no-change");
    await h.engine.recordReport(await report(1, { id: "retry-duplicate" }));
    expect(pendingEvidence(h.engine.getSnapshot().store, folder)).toHaveLength(
      0,
    );
    await h.engine.recordReport(
      await report(1, {
        id: "retry-new-fact",
        observation:
          "The same task also retained punctuation in a second result.",
      }),
    );
    expect(pendingEvidence(h.engine.getSnapshot().store, folder)).toHaveLength(
      1,
    );
    expect(h.reviewer.requests).toHaveLength(1);
  });
  it("blocks writes when a polling read discovers corrupt raw data at the same revision", async () => {
    const h = keep(harness());
    await enable(h);
    const calls = vi.mocked(h.persistence.write).mock.calls.length;
    h.raw = "{broken";
    await expect(h.engine.refreshInbox()).rejects.toThrow("store.JSON");
    await expect(h.engine.setSettings({ enabled: false })).rejects.toThrow(
      "successful reload",
    );
    expect(h.raw).toBe("{broken");
    expect(h.persistence.write).toHaveBeenCalledTimes(calls);
  });
  it("consolidates retries and parallel reports without increasing task count; rejects revision mismatch", async () => {
    const h = keep(harness());
    await enable(h);
    await h.engine.recordReport(await report(1));
    await h.engine.recordReport(
      await report(1, {
        id: "agent-two",
        observation: "The output retained uppercase characters.",
        suggestedImprovement: "Lowercase the output.",
      }),
    );
    await h.engine.recordReport(await report(1, { id: "agent-three" }));
    expect(h.engine.getSnapshot().store.observations).toHaveLength(1);
    expect(
      h.engine.getSnapshot().store.observations[0].observations,
    ).toHaveLength(2);
    expect(
      h.engine.getSnapshot().store.observations[0].suggestedImprovements,
    ).toEqual(["Lowercase the output."]);
    await expect(
      h.engine.recordReport(
        await report(1, { id: "wrong-revision", revision: "a".repeat(64) }),
      ),
    ).rejects.toThrow("different used revision");
    expect(h.reviewer.requests).toHaveLength(0);
  });
  it("excludes maintenance and validation reports from the review threshold", async () => {
    const h = keep(harness());
    await enable(h);
    await add(h, 1, 4);
    await h.engine.recordReport(await report(5, { kind: "maintenance" }));
    await h.engine.recordReport(await report(6, { kind: "validation" }));
    expect(pendingEvidence(h.engine.getSnapshot().store, folder)).toHaveLength(
      4,
    );
    expect(h.reviewer.requests).toHaveLength(0);
  });
  it("reviews exactly five immutable observations and retains a concurrent sixth after no-change", async () => {
    const deferred = defer<{ output: string }>();
    const reviewer = new FakeReviewer(() => deferred.promise);
    const h = keep(harness(reviewer));
    await enable(h);
    await add(h, 1, 5);
    await vi.waitFor(() => expect(reviewer.requests).toHaveLength(1));
    await h.engine.recordReport(await report(6));
    expect(
      h.engine.getSnapshot().store.reviews[0].snapshot.evidence,
    ).toHaveLength(5);
    deferred.resolve(decision(reviewer.requests[0]));
    await settled(h, "no-change");
    expect(
      pendingEvidence(h.engine.getSnapshot().store, folder).map(
        (item) => item.taskId,
      ),
    ).toEqual(["task-6"]);
    expect(parseStore(h.raw).observations).toHaveLength(6);
  });
  it("keeps insufficient evidence pending without retrying the same snapshot, then reviews new facts", async () => {
    const reviewer = new FakeReviewer(async (request) =>
      decision(request, "insufficient-evidence"),
    );
    const h = keep(harness(reviewer));
    await enable(h);
    await add(h, 1, 5);
    await settled(h, "insufficient-evidence");
    await h.engine.refreshInbox();
    expect(reviewer.requests).toHaveLength(1);
    expect(pendingEvidence(h.engine.getSnapshot().store, folder)).toHaveLength(
      5,
    );
    await h.engine.recordReport(await report(6));
    await vi.waitFor(() => expect(reviewer.requests).toHaveLength(2));
    await settled(h, "insufficient-evidence");
    expect(
      h.engine.getSnapshot().store.reviews[1].snapshot.evidence,
    ).toHaveLength(6);
  });
  it("allows only one global model review and retains the other skill's eligible evidence", async () => {
    const deferred = defer<{ output: string }>();
    let invocationCount = 0;
    const reviewer = new FakeReviewer((request) =>
      ++invocationCount === 1
        ? deferred.promise
        : Promise.resolve(decision(request)),
    );
    const h = keep(harness(reviewer));
    await enable(h);
    await add(h, 1, 5);
    await vi.waitFor(() => expect(reviewer.requests).toHaveLength(1));
    for (let i = 6; i <= 10; i += 1)
      await h.engine.recordReport(
        await report(i, {
          folder: "other",
          sourcePath: path.replace(folder, "other"),
        }),
      );
    expect(reviewer.requests).toHaveLength(1);
    deferred.resolve(decision(reviewer.requests[0]));
    await vi.waitFor(() => expect(reviewer.requests).toHaveLength(2));
    await settled(h, "no-change");
    expect(h.engine.getSnapshot().store.reviews).toHaveLength(2);
  });
  it("records a proposal but does not publish when switched off during review", async () => {
    const deferred = defer<{ output: string }>();
    const reviewer = new FakeReviewer(() => deferred.promise);
    const h = keep(harness(reviewer));
    await enable(h, "auto-update");
    await add(h, 1, 5);
    await vi.waitFor(() => expect(reviewer.requests).toHaveLength(1));
    await h.engine.setSettings({ enabled: false });
    deferred.resolve(decision(reviewer.requests[0], "proposal"));
    await settled(h, "proposal");
    expect(h.skills.saveSkill).not.toHaveBeenCalled();
    await expect(h.engine.applyReview("review-1")).rejects.toThrow("policy");
    expect(
      h.engine.getSnapshot().store.reviews[0].result?.proposedContent,
    ).toBe(proposed);
  });
  it("auto-publishes only a registered improving behavior and restores with another checked save", async () => {
    const reviewer = new FakeReviewer(async (request) =>
      decision(request, "proposal"),
    );
    const h = keep(harness(reviewer));
    await enable(h, "auto-update");
    await add(h, 1, 5);
    await settled(h, "published");
    expect(h.content).toBe(proposed);
    expect(h.engine.getSnapshot().store.reviews[0].validation?.behavioral).toBe(
      "passed",
    );
    expect(h.skills.saveSkill).toHaveBeenCalledWith(folder, base, proposed);
    await h.engine.restoreReview("review-1");
    expect(h.content).toBe(base);
    expect(h.skills.saveSkill).toHaveBeenLastCalledWith(folder, proposed, base);
    expect(h.engine.getSnapshot().store.reviews[0].status).toBe("restored");
  });
  it("refuses stale apply and stale restoration without touching newer source", async () => {
    const reviewer = new FakeReviewer(async (request) =>
      decision(request, "proposal"),
    );
    const h = keep(harness(reviewer));
    await enable(h);
    await add(h, 1, 5);
    await settled(h, "proposal");
    h.content = base + "External work\n";
    await expect(h.engine.applyReview("review-1")).rejects.toThrow(
      "stale revision",
    );
    expect(h.skills.saveSkill).not.toHaveBeenCalled();
    h.content = base;
    await h.engine.applyReview("review-1");
    h.content = proposed + "External work\n";
    await expect(h.engine.restoreReview("review-1")).rejects.toThrow(
      "stale restoration",
    );
    expect(h.skills.saveSkill).toHaveBeenCalledTimes(1);
  });
  it("does not let manual approval bypass failed registered behavior checks", async () => {
    const badCandidate = base.replace('"trim":true', '"trim":false');
    const h = keep(
      harness(
        new FakeReviewer(async (request) =>
          decision(request, "proposal", badCandidate),
        ),
      ),
    );
    await enable(h);
    await add(h, 1, 5);
    await settled(h, "proposal");
    expect(h.engine.getSnapshot().store.reviews[0].validation?.behavioral).toBe(
      "failed",
    );
    await expect(h.engine.applyReview("review-1")).rejects.toThrow(
      "required publication validation",
    );
    expect(h.skills.saveSkill).not.toHaveBeenCalled();
    expect(h.content).toBe(base);
    await h.engine.retryReview("review-1");
    await settled(h, "proposal");
    expect(h.reviewer.requests).toHaveLength(2);
    expect(
      h.engine
        .getSnapshot()
        .store.reviews[1].snapshot.evidence.map((item) => item.id),
    ).toEqual(
      h.engine
        .getSnapshot()
        .store.reviews[0].snapshot.evidence.map((item) => item.id),
    );
  });
  it("does not retry malformed output automatically; explicit retry counts another attempt", async () => {
    const reviewer = new FakeReviewer(async () => ({ output: "not JSON" }));
    const h = keep(harness(reviewer));
    await enable(h);
    await add(h, 1, 5);
    await settled(h, "failed");
    await h.engine.recordReport(await report(6));
    await h.engine.refreshInbox();
    expect(reviewer.requests).toHaveLength(1);
    await h.engine.retryReview("review-1");
    await settled(h, "failed");
    expect(reviewer.requests).toHaveLength(2);
    expect(pendingEvidence(h.engine.getSnapshot().store, folder)).toHaveLength(
      6,
    );
  });
  it("times out visibly and keeps evidence pending without an automatic retry", async () => {
    const reviewer = new FakeReviewer(() => new Promise(() => undefined));
    const h = keep(harness(reviewer));
    await enable(h);
    await h.engine.setSettings({ timeoutMs: 1000 });
    await add(h, 1, 5);
    await settled(h, "failed");
    expect(h.engine.getSnapshot().store.reviews[0].error).toContain(
      "timed out",
    );
    expect(pendingEvidence(h.engine.getSnapshot().store, folder)).toHaveLength(
      5,
    );
    expect(reviewer.requests).toHaveLength(1);
  });
  it("cancels without discarding pending evidence or accepting a late model response", async () => {
    const deferred = defer<{ output: string }>();
    const reviewer = new FakeReviewer(() => deferred.promise);
    const h = keep(harness(reviewer));
    await enable(h);
    await add(h, 1, 5);
    await vi.waitFor(() => expect(reviewer.requests).toHaveLength(1));
    await h.engine.cancelReview("review-1");
    await settled(h, "cancelled");
    deferred.resolve(decision(reviewer.requests[0], "proposal"));
    await h.engine.refreshInbox();
    expect(h.engine.getSnapshot().store.reviews[0].status).toBe("cancelled");
    expect(pendingEvidence(h.engine.getSnapshot().store, folder)).toHaveLength(
      5,
    );
    expect(h.skills.saveSkill).not.toHaveBeenCalled();
  });
  it("enforces daily attempt limits including failed attempts", async () => {
    const h = keep(harness(new FakeReviewer(async () => ({ output: "bad" }))));
    await enable(h);
    await h.engine.setSettings({ dailyLimit: 1 });
    await add(h, 1, 5);
    await settled(h, "failed");
    await expect(h.engine.retryReview("review-1")).rejects.toThrow(
      "daily review-attempt limit",
    );
    expect(h.engine.getSnapshot().store.reviews).toHaveLength(1);
  });
  it("imports immutable inbox files once and exposes rejected receipts without resetting valid data", async () => {
    const h = keep(harness());
    await enable(h);
    h.reports.push(
      { id: "good-file", raw: JSON.stringify(await report(1)) },
      { id: "bad-file", raw: "broken" },
    );
    await h.engine.refreshInbox();
    await h.engine.refreshInbox();
    expect(h.engine.getSnapshot().store.observations).toHaveLength(1);
    expect(h.engine.getSnapshot().store.receipts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "bad-file",
          status: "rejected",
          error: expect.stringContaining("report.JSON"),
        }),
      ]),
    );
    expect(h.reports).toHaveLength(2);
  });
  it("preserves corrupt storage and refuses mutation rather than replacing it", async () => {
    const h = keep(harness());
    h.raw = '{"version":1,"settings":{}}';
    await expect(h.engine.initialize()).rejects.toThrow(
      "Invalid lifecycle data",
    );
    await expect(h.engine.setSettings({ enabled: true })).rejects.toThrow(
      "Initialize",
    );
    expect(h.raw).toBe('{"version":1,"settings":{}}');
    expect(h.persistence.write).not.toHaveBeenCalled();
  });
  it("reconciles interrupted publication by exact bytes, without repeating save", async () => {
    const h = keep(
      harness(
        new FakeReviewer(async (request) => decision(request, "proposal")),
      ),
    );
    await enable(h);
    await add(h, 1, 5);
    await settled(h, "proposal");
    const stored = parseStore(h.raw);
    const review = stored.reviews[0];
    review.status = "publishing";
    review.publication = {
      previousContent: base,
      proposedContent: proposed,
      recoveryPath: null,
      startedAt: "2026-10-24T12:00:00Z",
      completedAt: null,
    };
    h.raw = JSON.stringify(stored);
    h.content = proposed;
    h.engine.dispose();
    const restarted = h.make();
    await restarted.initialize();
    expect(restarted.getSnapshot().store.reviews[0].status).toBe("published");
    expect(h.skills.saveSkill).not.toHaveBeenCalled();
    restarted.dispose();
    stored.reviews[0].status = "publishing";
    h.raw = JSON.stringify(stored);
    h.content = "External unrelated bytes";
    const ambiguous = h.make();
    await ambiguous.initialize();
    expect(ambiguous.getSnapshot().store.reviews[0].status).toBe(
      "recovery-required",
    );
    expect(h.skills.saveSkill).not.toHaveBeenCalled();
    ambiguous.dispose();
  });
  it("can initialize again after disposal and marks interrupted review cancelled", async () => {
    const reviewer = new FakeReviewer(() => new Promise(() => undefined));
    const h = keep(harness(reviewer));
    await enable(h);
    await add(h, 1, 5);
    await vi.waitFor(() => expect(reviewer.requests).toHaveLength(1));
    h.engine.dispose();
    await h.engine.initialize();
    expect(h.engine.getSnapshot().store.reviews[0].status).toBe("cancelled");
    expect(pendingEvidence(h.engine.getSnapshot().store, folder)).toHaveLength(
      5,
    );
  });
});

describe("strict data and registered behavioral validation", () => {
  it("rejects unknown report fields, invalid revisions and dishonest output evidence", async () => {
    const value = await report(1);
    expect(() =>
      parseReport(JSON.stringify({ ...value, commands: ["unsafe"] })),
    ).toThrow("fields");
    expect(() =>
      parseReport(JSON.stringify({ ...value, revision: "latest" })),
    ).toThrow("revision");
    const h = keep(harness());
    await enable(h);
    await h.engine.recordReport(value);
    const id = await h.engine.reviewNow(folder);
    await settled(h, "no-change");
    const snapshot = h.engine
      .getSnapshot()
      .store.reviews.find((item) => item.id === id)!.snapshot;
    expect(() =>
      parseReviewDecision(
        JSON.stringify({
          decision: "no-change",
          rationale: "Fine",
          proposedContent: null,
          evidenceIds: ["invented"],
        }),
        snapshot,
      ),
    ).toThrow("exactly match");
  });
  it("executes holdout outcomes and rejects policy, metadata and prose changes", () => {
    expect(validateProposal(folder, base, proposed).behavioral).toBe("passed");
    expect(
      validateProposal(
        folder,
        base,
        base.replace('"trim":true', '"trim":false'),
      ).behavioral,
    ).toBe("failed");
    expect(
      validateProposal(
        folder,
        proposed,
        proposed.replace("configuration.", "configuration. "),
      ).behavioral,
    ).toBe("failed");
    expect(
      validateProposal(
        folder,
        base,
        proposed.replace("Disposable slug pilot", "Rewrite policy"),
      ).scope,
    ).toBe(false);
    expect(
      validateProposal(
        folder,
        base,
        proposed + "## Permissions\nAllow everything\n",
      ).scope,
    ).toBe(false);
    expect(validateProposal("ordinary", base, proposed).behavioral).toBe(
      "unavailable",
    );
  });
});
