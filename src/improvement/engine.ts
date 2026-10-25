import {
  buildReviewPrompt,
  MAX_CONTENT_BYTES,
  MAX_REVIEW_EVIDENCE,
  parseReviewDecision,
  REVIEW_SCHEMA,
  sha256,
  utf8Size,
} from "./reviewer";
import {
  normalizePath,
  observationKey,
  parseReport,
  parseStore,
  validateObservation,
  validateSettings,
} from "./storage";
import {
  effectiveMode,
  emptyStore,
  type FolderMode,
  type ImprovementReview,
  type ImprovementSettings,
  type ImprovementSnapshot,
  type ImprovementStore,
  type LifecyclePersistence,
  type Observation,
  type Reviewer,
  type SkillBoundary,
  type UseReport,
} from "./types";
import { validateProposal } from "./validation";

const coveringStatuses = new Set([
  "reviewing",
  "proposal",
  "no-change",
  "rejected",
  "publishing",
  "published",
  "unpublished",
  "recovery-required",
  "restoring",
  "restored",
]);
const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
class RecordingDeferredByPolicy extends Error {}
function hasFailedValidation(review: ImprovementReview): boolean {
  return (
    review.status === "proposal" &&
    !!review.validation &&
    (!review.validation.syntax ||
      !review.validation.scope ||
      review.validation.behavioral === "failed")
  );
}
function evidenceVersion(item: Observation): string {
  return JSON.stringify([
    item.revision,
    item.kind,
    item.observations,
    item.suggestedImprovements,
    item.evidenceRefs,
  ]);
}
export function pendingEvidence(
  store: ImprovementStore,
  folder: string,
): Observation[] {
  return store.observations.filter(
    (item) =>
      item.folder.toLowerCase() === folder.toLowerCase() &&
      item.kind === "task" &&
      !store.reviews.some(
        (review) =>
          coveringStatuses.has(review.status) &&
          !hasFailedValidation(review) &&
          review.snapshot.evidence.some(
            (covered) =>
              covered.id === item.id &&
              evidenceVersion(covered) === evidenceVersion(item),
          ),
      ),
  );
}
export type EngineOptions = {
  persistence: LifecyclePersistence;
  reviewer: Reviewer;
  skills: SkillBoundary;
  clock?: () => Date;
  id?: () => string;
  eligibility?: EvidenceEligibility;
};
export interface EvidenceEligibility {
  eligible(evidence: readonly Observation[], threshold: number): boolean;
}
export const distinctUsesEligibility: EvidenceEligibility = {
  eligible: (evidence, threshold) => evidence.length >= threshold,
};
export type EligibilityStatus =
  | "off"
  | "observe"
  | "waiting"
  | "eligible"
  | "queued"
  | "reviewing"
  | "daily-limit"
  | "retry-required"
  | "awaiting-new-evidence"
  | "storage-blocked";
export function createImprovementEngine(options: EngineOptions) {
  return new ImprovementEngine(options);
}

export class ImprovementEngine {
  private state: ImprovementSnapshot = {
    store: emptyStore(),
    profile: null,
    loading: true,
    error: null,
    diagnostics: [],
    activeReviewId: null,
  };
  private revision: string | null = null;
  private knownRaw: string | null = null;
  private storageHealthy = false;
  private storageError: string | null = null;
  private listeners = new Set<() => void>();
  private queue: Promise<unknown> = Promise.resolve();
  private disposed = false;
  private initialized = false;
  private initializing: Promise<void> | null = null;
  private kicking = false;
  private active: {
    id: string;
    controller: AbortController;
    generation: number;
    cancellation: Promise<void> | null;
  } | null = null;
  private generation = 0;
  private policyEpoch = 0;
  private pendingPolicyChanges = 0;
  private readonly now: () => Date;
  private readonly nextId: () => string;
  constructor(private readonly options: EngineOptions) {
    this.now = options.clock ?? (() => new Date());
    this.nextId = options.id ?? (() => globalThis.crypto.randomUUID());
  }
  getSnapshot = (): ImprovementSnapshot => this.state;
  getEligibility = (
    folder: string,
  ): {
    status: EligibilityStatus;
    pending: number;
    threshold: number;
    attemptsToday: number;
    dailyLimit: number;
  } => {
    const store = this.state.store;
    const evidence = pendingEvidence(store, folder).slice(
      0,
      MAX_REVIEW_EVIDENCE,
    );
    const details = {
      pending: pendingEvidence(store, folder).length,
      threshold: store.settings.threshold,
      attemptsToday: this.dayCount(store),
      dailyLimit: store.settings.dailyLimit,
    };
    let status: EligibilityStatus;
    const mode = effectiveMode(store.settings, store.skillModes, folder);
    const latest = [...store.reviews]
      .reverse()
      .find(
        (review) =>
          review.snapshot.skill.folder.toLowerCase() === folder.toLowerCase(),
      );
    const sameEvidence = (items: readonly Observation[]) =>
      JSON.stringify(items.map((item) => [item.id, evidenceVersion(item)]));
    if (!this.initialized || !this.storageHealthy) status = "storage-blocked";
    else if (this.active && latest?.id === this.active.id) status = "reviewing";
    else if (mode === "off" || mode === "observe") status = mode;
    else if (
      (latest &&
        [
          "failed",
          "cancelled",
          "recovery-required",
          "publishing",
          "restoring",
        ].includes(latest.status)) ||
      (latest && hasFailedValidation(latest))
    )
      status = "retry-required";
    else if (
      !(this.options.eligibility ?? distinctUsesEligibility).eligible(
        evidence,
        store.settings.threshold,
      )
    )
      status = "waiting";
    else if (details.attemptsToday >= store.settings.dailyLimit)
      status = "daily-limit";
    else if (
      store.reviews.some(
        (review) =>
          sameEvidence(review.snapshot.evidence) === sameEvidence(evidence),
      )
    )
      status = "awaiting-new-evidence";
    else
      status = this.active || this.state.activeReviewId ? "queued" : "eligible";
    return { status, ...details };
  };
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private emit() {
    for (const listener of this.listeners) listener();
  }
  private setError(error: unknown) {
    this.state = {
      ...this.state,
      error:
        !this.storageHealthy && this.storageError
          ? this.storageError
          : message(error),
    };
    this.emit();
  }
  private blockStorage(error: unknown) {
    this.storageHealthy = false;
    this.storageError ??= message(error);
  }
  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation);
    this.queue = next.catch(() => undefined);
    return next.catch((error) => {
      this.setError(error);
      throw error;
    });
  }
  private async persist(store: ImprovementStore) {
    if (!this.storageHealthy)
      throw new Error(
        "Lifecycle storage requires a successful reload before further writes.",
      );
    const raw = JSON.stringify(store);
    // Validate our complete next state too. Never silently save partial structures.
    parseStore(raw);
    let result: { revision: string };
    try {
      result = await this.options.persistence.write(this.revision, raw);
    } catch (error) {
      this.blockStorage(error);
      throw error;
    }
    this.revision = result.revision;
    this.knownRaw = raw;
    this.state = { ...this.state, store: structuredClone(store), error: null };
    this.emit();
  }
  private async change(
    operation: (store: ImprovementStore) => void | Promise<void>,
  ) {
    return this.serial(async () => {
      if (!this.initialized || this.disposed)
        throw new Error(
          "Initialize the active lifecycle engine before changing it.",
        );
      if (!this.storageHealthy)
        throw new Error(
          "Lifecycle storage requires a successful reload before further writes.",
        );
      const next = structuredClone(this.state.store);
      await operation(next);
      await this.persist(next);
    });
  }
  initialize = (): Promise<void> => {
    this.disposed = false;
    if (this.initializing) return this.initializing;
    // Repeated UI reads during a live job must not invalidate its generation or
    // release the global process slot. This also covers Retry lifecycle read.
    if (this.initialized && this.active) return this.refreshInbox();
    const generation = ++this.generation;
    this.state = { ...this.state, loading: true };
    this.emit();
    this.initializing = this.serial(async () => {
      const disk = await this.options.persistence.read();
      const store = parseStore(disk.raw);
      if (this.disposed || generation !== this.generation) return;
      this.revision = disk.revision;
      this.knownRaw = disk.raw;
      this.storageHealthy = true;
      this.storageError = null;
      this.initialized = true;
      this.state = {
        store: structuredClone(store),
        profile: disk.profile,
        loading: false,
        error: null,
        diagnostics: disk.diagnostics ?? [],
        activeReviewId: this.active?.id ?? null,
      };
      this.emit();
      let changed = false;
      for (const review of store.reviews)
        if (review.status === "reviewing") {
          review.status = "cancelled";
          review.completedAt = this.now().toISOString();
          review.error =
            "The app stopped during this review. Evidence remains pending; explicitly retry when ready.";
          changed = true;
        }
      changed = (await this.reconcileStore(store)) || changed;
      changed = (await this.importReports(store, disk.reports)) || changed;
      if (changed) await this.persist(store);
    })
      .catch((error) => {
        if (generation === this.generation) {
          this.initialized = false;
          this.blockStorage(error);
          this.state = {
            ...this.state,
            loading: false,
            error: this.storageError,
          };
          this.emit();
        }
        throw error;
      })
      .finally(() => {
        if (generation === this.generation) this.initializing = null;
        this.kick();
      });
    return this.initializing;
  };
  refreshInbox = async (): Promise<void> => {
    await this.serial(async () => {
      if (!this.initialized || this.disposed) return;
      let disk;
      try {
        disk = await this.options.persistence.read();
        parseStore(disk.raw);
      } catch (error) {
        this.blockStorage(error);
        throw error;
      }
      // A second writer is never overwritten. Native CAS also enforces this.
      if (disk.revision !== this.revision || disk.raw !== this.knownRaw) {
        const error = new Error(
          "Lifecycle storage changed outside this app writer. Reload the lifecycle before continuing.",
        );
        this.blockStorage(error);
        throw error;
      }
      const next = structuredClone(this.state.store);
      this.state = { ...this.state, diagnostics: disk.diagnostics ?? [] };
      if (await this.importReports(next, disk.reports))
        await this.persist(next);
      else this.emit();
    });
    this.kick();
  };
  private async importReports(
    store: ImprovementStore,
    reports: { id: string; raw: string }[],
  ): Promise<boolean> {
    let changed = false;
    for (const entry of reports) {
      if (store.receipts.some((receipt) => receipt.id === entry.id)) continue;
      try {
        const report = parseReport(entry.raw);
        // Off inbox entries are deferred, not receipted/rejected. A legitimate
        // report that arrived just before the switch remains available later.
        if (
          effectiveMode(store.settings, store.skillModes, report.folder) ===
          "off"
        )
          continue;
        await this.mergeReport(store, report);
        store.receipts.push({ id: entry.id, status: "imported", error: null });
      } catch (error) {
        if (error instanceof RecordingDeferredByPolicy) continue;
        store.receipts.push({
          id: entry.id,
          status: "rejected",
          error: message(error),
        });
      }
      changed = true;
    }
    return changed;
  }
  private async mergeReport(store: ImprovementStore, report: UseReport) {
    // Inbox contents cannot nominate another root/path. Historical content hashes
    // remain historical; they are not replaced with the current disk revision.
    const file = await this.options.skills.readSkill(report.folder);
    if (this.pendingPolicyChanges)
      throw new RecordingDeferredByPolicy(
        "A policy change is pending. Recording is deferred until the effective policy is known.",
      );
    if (normalizePath(file.path) !== normalizePath(report.sourcePath))
      throw new Error(
        "Reported source path is not this personal skill's checked path.",
      );
    if (store.observations.some((item) => item.reportIds.includes(report.id)))
      return;
    const key = observationKey(report);
    const current = store.observations.find(
      (item) => observationKey(item) === key,
    );
    if (current) {
      if (current.revision !== report.revision || current.kind !== report.kind)
        throw new Error(
          "A task retry reports a different used revision or task kind. Keep one stable task and actual revision per consolidated use.",
        );
      const add = (items: string[], value: string) => {
        if (!items.includes(value)) items.push(value);
      };
      const consolidated = structuredClone(current);
      add(consolidated.observations, report.observation);
      if (report.suggestedImprovement)
        add(consolidated.suggestedImprovements, report.suggestedImprovement);
      report.evidenceRefs.forEach((ref) => add(consolidated.evidenceRefs, ref));
      add(consolidated.reportIds, report.id);
      consolidated.updatedAt = report.reportedAt;
      validateObservation(consolidated, "report.consolidated");
      Object.assign(current, consolidated);
    } else
      store.observations.push({
        id: "evidence-" + (await sha256(key)),
        folder: report.folder,
        sourcePath: report.sourcePath,
        sourceKind: "personal",
        revision: report.revision,
        taskId: report.taskId,
        kind: report.kind,
        observations: [report.observation],
        suggestedImprovements: report.suggestedImprovement
          ? [report.suggestedImprovement]
          : [],
        evidenceRefs: [...report.evidenceRefs],
        reportIds: [report.id],
        createdAt: report.reportedAt,
        updatedAt: report.reportedAt,
      });
  }
  recordReport = async (input: UseReport): Promise<void> => {
    const report = parseReport(JSON.stringify(input));
    await this.change(async (store) => {
      if (
        effectiveMode(store.settings, store.skillModes, report.folder) === "off"
      )
        throw new Error("The effective Off policy blocks new use recording.");
      if (store.receipts.some((receipt) => receipt.id === report.id)) return;
      await this.mergeReport(store, report);
      store.receipts.push({ id: report.id, status: "imported", error: null });
    });
    this.kick();
  };
  setSettings = async (patch: Partial<ImprovementSettings>): Promise<void> => {
    this.policyEpoch += 1;
    this.pendingPolicyChanges += 1;
    try {
      await this.change((store) => {
        store.settings = validateSettings({ ...store.settings, ...patch });
      });
    } finally {
      this.pendingPolicyChanges -= 1;
    }
    this.kick();
  };
  setSkillMode = async (folder: string, mode: FolderMode): Promise<void> => {
    this.policyEpoch += 1;
    this.pendingPolicyChanges += 1;
    try {
      await this.change((store) => {
        for (const key of Object.keys(store.skillModes))
          if (key.toLowerCase() === folder.toLowerCase())
            delete store.skillModes[key];
        store.skillModes = { ...store.skillModes, [folder]: mode };
      });
    } finally {
      this.pendingPolicyChanges -= 1;
    }
    this.kick();
  };
  private dayCount(store: ImprovementStore) {
    const today = this.now().toISOString().slice(0, 10);
    return store.reviews.filter(
      (review) => review.createdAt.slice(0, 10) === today,
    ).length;
  }
  private async fingerprint(evidence: Observation[]) {
    return sha256(
      JSON.stringify(evidence.map((item) => [item.id, evidenceVersion(item)])),
    );
  }
  private kick() {
    if (
      this.kicking ||
      this.disposed ||
      !this.initialized ||
      this.state.loading ||
      this.pendingPolicyChanges ||
      this.active ||
      this.state.activeReviewId
    )
      return;
    this.kicking = true;
    void this.serial(async () => {
      if (this.disposed || this.active || this.state.activeReviewId)
        return null;
      const store = this.state.store;
      if (
        !store.settings.enabled ||
        this.dayCount(store) >= store.settings.dailyLimit
      )
        return null;
      for (const folder of [
        ...new Set(store.observations.map((item) => item.folder)),
      ]) {
        if (this.getEligibility(folder).status !== "eligible") continue;
        const evidence = pendingEvidence(store, folder).slice(
          0,
          MAX_REVIEW_EVIDENCE,
        );
        return this.startReviewLocked(folder, evidence);
      }
      return null;
    })
      .then((review) => {
        if (review) this.runReview(review);
      })
      .catch(() => undefined)
      .finally(() => {
        this.kicking = false;
      });
  }
  private async startReviewLocked(
    folder: string,
    evidence: Observation[],
  ): Promise<ImprovementReview> {
    const store = this.state.store;
    if (!this.storageHealthy)
      throw new Error(
        "Lifecycle storage requires a successful reload before starting a review.",
      );
    const policyEpoch = this.policyEpoch;
    const mode = effectiveMode(store.settings, store.skillModes, folder);
    if (this.pendingPolicyChanges)
      throw new Error(
        "A policy change is pending. Evidence remains pending until it is applied.",
      );
    if (this.disposed || !["propose", "auto-update"].includes(mode))
      throw new Error(
        "Reviewing requires the enabled propose or auto-update policy.",
      );
    if (this.active || this.state.activeReviewId)
      throw new Error(
        "Another review is already active. Pending evidence is retained.",
      );
    if (this.dayCount(store) >= store.settings.dailyLimit)
      throw new Error("The daily review-attempt limit has been reached.");
    if (!evidence.length)
      throw new Error("No pending task evidence is available.");
    const file = await this.options.skills.readSkill(folder);
    if (utf8Size(file.content) > MAX_CONTENT_BYTES)
      throw new Error("This skill exceeds the 64 KiB reviewer content limit.");
    if (
      evidence.some(
        (item) => normalizePath(item.sourcePath) !== normalizePath(file.path),
      )
    )
      throw new Error(
        "Evidence source paths do not match the checked personal skill.",
      );
    const review: ImprovementReview = {
      id: this.nextId(),
      mode,
      status: "reviewing",
      snapshot: {
        skill: { folder, sourcePath: file.path, sourceKind: "personal" },
        content: file.content,
        revision: await sha256(file.content),
        evidence: structuredClone(evidence),
        fingerprint: await this.fingerprint(evidence),
      },
      createdAt: this.now().toISOString(),
      completedAt: null,
      result: null,
      validation: null,
      error: null,
      usage: null,
      publication: null,
    };
    const next = structuredClone(store);
    next.reviews.push(review);
    if (policyEpoch !== this.policyEpoch || this.disposed)
      throw new Error(
        "Policy changed while preparing this review. Evidence remains pending.",
      );
    await this.persist(next);
    if (policyEpoch !== this.policyEpoch || this.disposed) {
      review.status = "cancelled";
      review.completedAt = this.now().toISOString();
      review.error =
        "Policy changed before the reviewer started. Evidence remains pending; retry explicitly.";
      await this.persist(next);
      throw new Error(review.error);
    }
    this.state = { ...this.state, activeReviewId: review.id };
    this.emit();
    return structuredClone(review);
  }
  reviewNow = async (folder: string): Promise<string> => {
    const review = await this.serial(async () => {
      if (!this.initialized || this.disposed)
        throw new Error("Initialize the lifecycle first.");
      if (!this.storageHealthy)
        throw new Error(
          "Lifecycle storage requires a successful reload before starting a review.",
        );
      return this.startReviewLocked(
        folder,
        pendingEvidence(this.state.store, folder).slice(0, MAX_REVIEW_EVIDENCE),
      );
    });
    this.runReview(review);
    return review.id;
  };
  retryReview = async (id: string): Promise<string> => {
    const previous = this.state.store.reviews.find(
      (review) => review.id === id,
    );
    const failedValidation = previous && hasFailedValidation(previous);
    if (
      !previous ||
      (!failedValidation &&
        !["failed", "cancelled", "insufficient-evidence"].includes(
          previous.status,
        ))
    )
      throw new Error(
        "Only failed, cancelled, insufficient-evidence or validation-failed reviews can be retried.",
      );
    if (failedValidation) {
      const review = await this.serial(async () => {
        if (!this.initialized || this.disposed)
          throw new Error("Initialize the lifecycle first.");
        const ids = new Set(previous.snapshot.evidence.map((item) => item.id));
        const evidence = this.state.store.observations.filter((item) =>
          ids.has(item.id),
        );
        return this.startReviewLocked(
          previous.snapshot.skill.folder,
          evidence.slice(0, MAX_REVIEW_EVIDENCE),
        );
      });
      this.runReview(review);
      return review.id;
    }
    return this.reviewNow(previous.snapshot.skill.folder);
  };
  private runReview(review: ImprovementReview) {
    const controller = new AbortController();
    const generation = this.generation;
    const active = {
      id: review.id,
      controller,
      generation,
      cancellation: null as Promise<void> | null,
    };
    this.active = active;
    const settings = { ...this.state.store.settings };
    let timer: ReturnType<typeof setTimeout>;
    let timedOut = false;
    const timeoutMessage = () =>
      `Reviewer timed out after ${settings.timeoutMs} ms. Evidence remains pending; retry explicitly.`;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        void this.requestCancel(active).catch(() => undefined);
        controller.abort();
        reject(new Error(timeoutMessage()));
      }, settings.timeoutMs);
    });
    const cancelled = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener(
        "abort",
        () =>
          reject(
            new Error(
              timedOut
                ? timeoutMessage()
                : "Review cancelled. Evidence remains pending.",
            ),
          ),
        { once: true },
      );
    });
    // Promise.resolve also captures synchronous adapter/prompt failures.
    const attempt = Promise.resolve().then(() =>
      this.options.reviewer.review(
        {
          id: review.id,
          prompt: buildReviewPrompt(review.snapshot),
          schema: JSON.stringify(REVIEW_SCHEMA),
          timeoutMs: settings.timeoutMs,
          model: settings.model,
        },
        controller.signal,
      ),
    );
    void Promise.race([attempt, timeout, cancelled])
      .then(async (response) => {
        if (this.disposed || generation !== this.generation) return;
        const result = parseReviewDecision(response.output, review.snapshot);
        const validation =
          result.decision === "proposal"
            ? validateProposal(
                review.snapshot.skill.folder,
                review.snapshot.content,
                result.proposedContent!,
              )
            : null;
        await this.change((store) => {
          if (this.disposed || generation !== this.generation) return;
          const current = store.reviews.find((item) => item.id === review.id);
          if (!current || current.status !== "reviewing") return;
          current.status = result.decision;
          current.result = result;
          current.validation = validation;
          current.usage = response.usage ?? null;
          current.completedAt = this.now().toISOString();
        });
        const current = this.state.store.reviews.find(
          (item) => item.id === review.id,
        );
        if (
          !this.disposed &&
          !controller.signal.aborted &&
          generation === this.generation &&
          current?.status === "proposal" &&
          effectiveMode(
            this.state.store.settings,
            this.state.store.skillModes,
            review.snapshot.skill.folder,
          ) === "auto-update" &&
          current.validation?.behavioral === "passed" &&
          current.validation.syntax &&
          current.validation.scope
        )
          await this.applyReview(review.id, true);
      })
      .catch(async (error) => {
        if (this.disposed || generation !== this.generation) return;
        await this.change((store) => {
          const current = store.reviews.find((item) => item.id === review.id);
          if (current?.status === "reviewing") {
            current.status =
              controller.signal.aborted && !timedOut ? "cancelled" : "failed";
            current.error = message(error);
            current.completedAt = this.now().toISOString();
          } else if (current?.status === "proposal")
            current.error = message(error);
        }).catch(() => undefined);
      })
      .finally(async () => {
        clearTimeout(timer!);
        if (controller.signal.aborted) {
          try {
            await this.requestCancel(active);
          } catch (error) {
            this.setError(
              `Reviewer cancellation was not confirmed: ${message(error)}. The process slot remains busy until the reviewer exits.`,
            );
            await attempt.catch(() => undefined);
          }
        }
        if (
          this.active?.id === review.id &&
          this.active.generation === generation
        ) {
          this.active = null;
          this.state = { ...this.state, activeReviewId: null };
          this.emit();
          this.kick();
        }
      });
  }
  private requestCancel(
    active: NonNullable<ImprovementEngine["active"]>,
  ): Promise<void> {
    if (!active.cancellation)
      active.cancellation = Promise.resolve().then(() =>
        this.options.reviewer.cancel?.(active.id),
      );
    return active.cancellation;
  }
  cancelReview = async (id: string): Promise<void> => {
    const opened = this.state.store.reviews.find((item) => item.id === id);
    if (!opened || opened.status !== "reviewing")
      throw new Error("This review is not active.");
    type StopResult = { ok: true } | { ok: false; error: unknown };
    const stop = (active: NonNullable<ImprovementEngine["active"]>) => {
      // Stopping a process must not depend on a successful lifecycle write.
      const result = this.requestCancel(active).then<StopResult, StopResult>(
        () => ({ ok: true }),
        (error: unknown) => ({ ok: false, error }),
      );
      active.controller.abort();
      return result;
    };
    let cancellation = this.active?.id === id ? stop(this.active) : null;
    const recorded = await this.change((store) => {
      const review = store.reviews.find((item) => item.id === id);
      if (!review || review.status !== "reviewing")
        throw new Error("This review is not active.");
      review.status = "cancelled";
      review.error =
        "Review cancelled. Evidence remains pending; retry explicitly.";
      review.completedAt = this.now().toISOString();
    }).then<StopResult, StopResult>(
      () => ({ ok: true }),
      (error: unknown) => ({ ok: false, error }),
    );
    // Covers the short gap between persisting review start and creating its
    // in-memory process controller.
    if (!cancellation && this.active?.id === id)
      cancellation = stop(this.active);
    const stopped = cancellation ? await cancellation : null;
    if (stopped && !stopped.ok) throw stopped.error;
    if (!recorded.ok) {
      if (!stopped) throw recorded.error;
      // Acknowledge the actual stopped process for this session, while retaining
      // the original durable journal and blocking every subsequent write.
      const next = structuredClone(this.state.store);
      const review = next.reviews.find((item) => item.id === id);
      if (review?.status === "reviewing") {
        review.status = "cancelled";
        review.completedAt = this.now().toISOString();
        review.error =
          "Review cancelled. The lifecycle journal could not be updated; reload to reconcile the retained journal.";
      }
      this.state = { ...this.state, store: next };
      this.emit();
    }
  };
  rejectReview = async (id: string): Promise<void> => {
    await this.change((store) => {
      const review = store.reviews.find((item) => item.id === id);
      if (!review || !["proposal", "unpublished"].includes(review.status))
        throw new Error("Only a pending proposal can be rejected.");
      review.status = "rejected";
      review.completedAt = this.now().toISOString();
    });
    this.kick();
  };
  applyReview = async (id: string, automatic = false): Promise<void> => {
    // Journal is durable before crossing the checked file boundary. The queue is
    // held only for the bounded save, never for the reviewer process.
    await this.serial(async () => {
      if (!this.initialized || this.disposed)
        throw new Error("Initialize the lifecycle first.");
      if (!this.storageHealthy)
        throw new Error(
          "Lifecycle storage requires a successful reload before publication.",
        );
      if (this.pendingPolicyChanges)
        throw new Error(
          "A policy change is pending. Publication is blocked until it is applied.",
        );
      const next = structuredClone(this.state.store);
      const policyEpoch = this.policyEpoch;
      const review = next.reviews.find((item) => item.id === id);
      if (
        !review ||
        !["proposal", "unpublished"].includes(review.status) ||
        review.result?.decision !== "proposal"
      )
        throw new Error("No unapplied proposal is available.");
      const folder = review.snapshot.skill.folder;
      const mode = effectiveMode(next.settings, next.skillModes, folder);
      if (
        !["propose", "auto-update"].includes(mode) ||
        (automatic && mode !== "auto-update")
      )
        throw new Error(
          "The current effective policy does not allow publication.",
        );
      const validation = validateProposal(
        folder,
        review.snapshot.content,
        review.result.proposedContent!,
      );
      review.validation = validation;
      if (
        !validation.syntax ||
        !validation.scope ||
        validation.behavioral === "failed" ||
        (automatic && validation.behavioral !== "passed")
      )
        throw new Error(
          "The proposal does not satisfy the required publication validation.",
        );
      const source = await this.options.skills.readSkill(folder);
      if (
        normalizePath(source.path) !==
          normalizePath(review.snapshot.skill.sourcePath) ||
        source.content !== review.snapshot.content
      )
        throw new Error(
          "The skill changed since review. Refusing to overwrite a stale revision.",
        );
      review.status = "publishing";
      review.error = null;
      review.publication = {
        operation: "publish",
        previousContent: review.snapshot.content,
        proposedContent: review.result.proposedContent!,
        recoveryPath: null,
        startedAt: this.now().toISOString(),
        completedAt: null,
      };
      await this.persist(next);
      // Check authoritative current policy directly before the checked save.
      const finalMode = effectiveMode(
        this.state.store.settings,
        this.state.store.skillModes,
        folder,
      );
      if (
        policyEpoch !== this.policyEpoch ||
        this.disposed ||
        !["propose", "auto-update"].includes(finalMode) ||
        (automatic && finalMode !== "auto-update")
      ) {
        review.status = "unpublished";
        review.error =
          "Publication stopped because the current policy no longer permits it.";
        await this.persist(next);
        return;
      }
      try {
        const result = await this.options.skills.saveSkill(
          folder,
          review.snapshot.content,
          review.result.proposedContent!,
        );
        review.status = "published";
        review.publication.recoveryPath = result.recoveryPath;
        review.publication.completedAt = this.now().toISOString();
        review.completedAt = this.now().toISOString();
        await this.persist(next);
      } catch (error) {
        // A failed native response may follow a successful filesystem publish.
        // Reconcile exact bytes, preserving a visible recovery state on ambiguity.
        review.error = message(error);
        await this.reconcileReview(review);
        await this.persist(next);
        if (review.status !== "published") throw error;
      }
    });
    this.kick();
  };
  private async reconcileReview(review: ImprovementReview): Promise<void> {
    if (
      !review.publication ||
      !["publishing", "restoring", "recovery-required"].includes(review.status)
    )
      return;
    // Legacy restoring records still carry enough intent to upgrade safely
    // before a missing source changes their status to recovery-required.
    if (!review.publication.operation && review.status === "restoring")
      review.publication.operation = "restore";
    const restoring = review.publication.operation === "restore";
    try {
      const file = await this.options.skills.readSkill(
        review.snapshot.skill.folder,
      );
      if (
        normalizePath(file.path) !==
        normalizePath(review.snapshot.skill.sourcePath)
      )
        throw new Error("The checked source path changed.");
      if (file.content === review.publication.previousContent)
        review.status = restoring ? "restored" : "unpublished";
      else if (file.content === review.publication.proposedContent)
        review.status = "published";
      else {
        review.status = "recovery-required";
        review.error =
          "Source matches neither journal version. Inspect source and native recovery copies; no automatic overwrite was attempted.";
      }
    } catch (error) {
      review.status = "recovery-required";
      review.error = message(error);
    }
    review.completedAt = this.now().toISOString();
  }
  private async reconcileStore(store: ImprovementStore): Promise<boolean> {
    let changed = false;
    for (const review of store.reviews)
      if (
        ["publishing", "restoring", "recovery-required"].includes(review.status)
      ) {
        await this.reconcileReview(review);
        changed = true;
      }
    return changed;
  }
  reconcile = async (): Promise<void> => {
    await this.change(async (store) => {
      await this.reconcileStore(store);
    });
  };
  restoreReview = async (id: string): Promise<void> => {
    await this.serial(async () => {
      if (!this.initialized || this.disposed)
        throw new Error("Initialize the lifecycle first.");
      if (this.pendingPolicyChanges)
        throw new Error(
          "A policy change is pending. Restoration is blocked until it is applied.",
        );
      const next = structuredClone(this.state.store);
      const policyEpoch = this.policyEpoch;
      const review = next.reviews.find((item) => item.id === id);
      if (!review || review.status !== "published" || !review.publication)
        throw new Error("Only a published proposal can be restored.");
      const folder = review.snapshot.skill.folder;
      if (
        !["propose", "auto-update"].includes(
          effectiveMode(next.settings, next.skillModes, folder),
        )
      )
        throw new Error(
          "The current effective policy does not allow restoration.",
        );
      const file = await this.options.skills.readSkill(folder);
      if (
        normalizePath(file.path) !==
          normalizePath(review.snapshot.skill.sourcePath) ||
        file.content !== review.publication.proposedContent
      )
        throw new Error(
          "The skill changed after publication. Refusing stale restoration.",
        );
      review.status = "restoring";
      review.publication.operation = "restore";
      review.error = null;
      await this.persist(next);
      if (
        policyEpoch !== this.policyEpoch ||
        this.disposed ||
        !["propose", "auto-update"].includes(
          effectiveMode(
            this.state.store.settings,
            this.state.store.skillModes,
            folder,
          ),
        )
      ) {
        review.status = "published";
        review.error =
          "Restoration stopped because policy no longer permits it.";
        await this.persist(next);
        return;
      }
      try {
        const result = await this.options.skills.saveSkill(
          folder,
          review.publication.proposedContent,
          review.publication.previousContent,
        );
        review.status = "restored";
        review.publication.recoveryPath = result.recoveryPath;
        review.completedAt = this.now().toISOString();
        await this.persist(next);
      } catch (error) {
        review.error = message(error);
        await this.reconcileReview(review);
        await this.persist(next);
        if (review.status !== "restored") throw error;
      }
    });
  };
  dispose = (): void => {
    this.disposed = true;
    this.initialized = false;
    this.generation += 1;
    this.initializing = null;
    if (this.active) {
      void this.requestCancel(this.active).catch(() => undefined);
      this.active.controller.abort();
    }
    this.state = { ...this.state, activeReviewId: this.active?.id ?? null };
  };
}
