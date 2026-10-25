import { useEffect, useState } from "react";
import {
  createNativeImprovementEngine,
  effectiveMode,
  pendingEvidence,
  type FolderMode,
  type ImprovementMode,
  type ImprovementReview,
  type ImprovementSnapshot,
} from "../improvement";
import { isDesktop } from "../storage/skillFiles";
import { Modal } from "./Modal";
import { proposalDiff } from "./proposalDiff";

export type ImprovementEngine = ReturnType<
  typeof createNativeImprovementEngine
>;
const modes: { value: ImprovementMode; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "observe", label: "Observe" },
  { value: "propose", label: "Propose" },
  { value: "auto-update", label: "Auto-update" },
];
const modeLabel = (value: ImprovementMode) =>
  modes.find((mode) => mode.value === value)!.label;

export function useImprovement() {
  const [engine] = useState(createNativeImprovementEngine);
  const [snapshot, setSnapshot] = useState<ImprovementSnapshot>(() =>
    engine.getSnapshot(),
  );
  useEffect(() => {
    if (!isDesktop()) return;
    const unsubscribe = engine.subscribe(() =>
      setSnapshot(engine.getSnapshot()),
    );
    void engine.initialize().catch(() => setSnapshot(engine.getSnapshot()));
    const timer = window.setInterval(
      () =>
        void engine
          .refreshInbox()
          .catch(() => setSnapshot(engine.getSnapshot())),
      2000,
    );
    return () => {
      unsubscribe();
      window.clearInterval(timer);
      engine.dispose();
    };
  }, [engine]);
  return { engine, snapshot };
}

export function ImprovementSettings({
  engine,
  snapshot,
  onClose,
}: {
  engine: ImprovementEngine;
  snapshot: ImprovementSnapshot;
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  const settings = snapshot.store.settings;
  const available = isDesktop() && !!snapshot.profile && !snapshot.loading;
  async function change(
    patch: Parameters<ImprovementEngine["setSettings"]>[0],
  ) {
    setError("");
    try {
      await engine.setSettings(patch);
    } catch (error) {
      setError(String(error));
    }
  }
  return (
    <Modal title="Skill improvement settings" onClose={onClose}>
      <div className="form-body improvement-settings">
        <p>
          Turn completed agent work into reviewable skill changes. Recording is
          opt-in. Leaving a skill unchanged is a valid result.
        </p>
        {!isDesktop() && (
          <p role="status">
            Open the desktop app to use improvement. Browser mode has no
            lifecycle store or reviewer access.
          </p>
        )}
        {snapshot.profile && (
          <p className="small profile-label">
            {snapshot.profile.test
              ? "ISOLATED TEST PROFILE"
              : "PERSONAL PROFILE"}
            <br />
            <span className="file-path">{snapshot.profile.dataDir}</span>
          </p>
        )}
        {(error || snapshot.error) && (
          <p className="paper-banner error" role="alert">
            {error || snapshot.error}
          </p>
        )}
        <label className="improvement-switch">
          <input
            type="checkbox"
            checked={settings.enabled}
            disabled={!available}
            onChange={(event) => void change({ enabled: event.target.checked })}
          />
          <span>
            <strong>Enable skill improvement</strong>
            <small>
              Turning this off stops new recording, review starts, and
              publication.
            </small>
          </span>
        </label>
        <div className="improvement-fields">
          <label>
            Default mode
            <select
              aria-label="Default mode"
              value={settings.defaultMode}
              disabled={!available}
              onChange={(event) =>
                void change({
                  defaultMode: event.target.value as ImprovementMode,
                })
              }
            >
              {modes.map((mode) => (
                <option key={mode.value} value={mode.value}>
                  {mode.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Uses before review
            <input
              key={`threshold-${settings.threshold}`}
              aria-label="Uses before review"
              type="number"
              min={1}
              max={50}
              defaultValue={settings.threshold}
              disabled={!available}
              onBlur={(event) => {
                if (Number(event.target.value) !== settings.threshold)
                  void change({ threshold: Number(event.target.value) });
              }}
            />
          </label>
          <label>
            Daily review limit
            <input
              key={`limit-${settings.dailyLimit}`}
              aria-label="Daily review limit"
              type="number"
              min={1}
              max={100}
              defaultValue={settings.dailyLimit}
              disabled={!available}
              onBlur={(event) => {
                if (Number(event.target.value) !== settings.dailyLimit)
                  void change({ dailyLimit: Number(event.target.value) });
              }}
            />
          </label>
          <label>
            Review timeout (seconds)
            <input
              key={`timeout-${settings.timeoutMs}`}
              aria-label="Review timeout (seconds)"
              type="number"
              min={1}
              max={600}
              defaultValue={settings.timeoutMs / 1000}
              disabled={!available}
              onBlur={(event) => {
                if (Number(event.target.value) * 1000 !== settings.timeoutMs)
                  void change({ timeoutMs: Number(event.target.value) * 1000 });
              }}
            />
          </label>
          <label className="wide">
            Verified reviewer model
            <input
              aria-label="Reviewer model"
              value={settings.model}
              readOnly
              aria-describedby="reviewer-model-note"
            />
          </label>
        </div>
        <p className="small" id="reviewer-model-note">
          This release verifies gpt-6.1-sol with ultra reasoning. Changing
          models requires updating and verifying the runner configuration.
        </p>
        <dl className="mode-explanations">
          <dt>Off</dt>
          <dd>No new evidence, reviews, or publication.</dd>
          <dt>Observe</dt>
          <dd>Record task evidence only.</dd>
          <dt>Propose</dt>
          <dd>Generate proposals and wait for your approval.</dd>
          <dt>Auto-update</dt>
          <dd>Apply only changes that pass registered behavior checks.</dd>
        </dl>
        <p className="small">
          One review runs at a time, while the app is open. Failed and
          insufficient-evidence reviews wait for new information or an explicit
          retry. Codex uses your CLI authentication. Token usage is shown when
          available; monetary cost is not reported.
        </p>
        {!!snapshot.diagnostics.length && (
          <ul className="improvement-diagnostics">
            {snapshot.diagnostics.map((message, index) => (
              <li key={index}>{message}</li>
            ))}
          </ul>
        )}
        {snapshot.store.receipts.some(
          (receipt) => receipt.status === "rejected",
        ) && (
          <details>
            <summary>Rejected reports</summary>
            <ul>
              {snapshot.store.receipts
                .filter((receipt) => receipt.status === "rejected")
                .slice(-20)
                .map((receipt) => (
                  <li key={receipt.id}>
                    {receipt.id}: {receipt.error}
                  </li>
                ))}
            </ul>
          </details>
        )}
        <button className="primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}

export function SkillImprovement({
  engine,
  snapshot,
  folder,
  blocked,
  onChanged,
}: {
  engine: ImprovementEngine;
  snapshot: ImprovementSnapshot;
  folder: string;
  blocked: boolean;
  onChanged: () => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const mode = effectiveMode(
    snapshot.store.settings,
    snapshot.store.skillModes,
    folder,
  );
  const observations = snapshot.store.observations.filter(
    (observation) =>
      observation.folder === folder && observation.kind === "task",
  );
  const reviews = snapshot.store.reviews
    .filter((review) => review.snapshot.skill.folder === folder)
    .slice()
    .reverse();
  const pending = pendingEvidence(snapshot.store, folder);
  const eligibility = engine.getEligibility(folder);
  const queueMessage: Record<string, string> = {
    eligible: "Eligible for the next review.",
    queued: "Queued behind the active review.",
    "daily-limit": `Daily review limit reached (${eligibility.attemptsToday}/${eligibility.dailyLimit}, UTC day). Evidence remains pending.`,
    "retry-required":
      "Review stopped. Inspect the result and retry or recover explicitly.",
    "awaiting-new-evidence":
      "This evidence was already assessed. New information or an explicit retry is needed.",
    "storage-blocked":
      "Lifecycle storage must load successfully before work can start.",
  };
  const canReview = mode === "propose" || mode === "auto-update";
  async function act(name: string, action: () => Promise<unknown>) {
    setBusy(name);
    setError("");
    try {
      await action();
      onChanged();
    } catch (error) {
      setError(String(error));
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className="skill-improvement" aria-label="Skill improvement">
      <div className="improvement-heading">
        <h3>Skill improvement</h3>
        <span className="mode-label">Effective mode: {modeLabel(mode)}</span>
      </div>
      <p className="small">
        {pending.length} pending / {snapshot.store.settings.threshold} uses to
        review · {observations.length} distinct task applications
      </p>
      {queueMessage[eligibility.status] && (
        <p className="small" role="status">
          {queueMessage[eligibility.status]}
        </p>
      )}
      <label className="skill-mode">
        Mode for this skill
        <select
          aria-label="Mode for this skill"
          value={snapshot.store.skillModes[folder] ?? "inherit"}
          disabled={!snapshot.profile || snapshot.loading}
          onChange={(event) =>
            void act("mode", () =>
              engine.setSkillMode(folder, event.target.value as FolderMode),
            )
          }
        >
          <option value="inherit">
            Inherit global default (
            {modeLabel(snapshot.store.settings.defaultMode)})
          </option>
          {modes.map((mode) => (
            <option key={mode.value} value={mode.value}>
              {mode.label}
            </option>
          ))}
        </select>
      </label>
      {!snapshot.store.settings.enabled && (
        <p className="small">
          The global master switch is off. Enable it in Improvement settings to
          record task evidence.
        </p>
      )}
      {snapshot.activeReviewId && (
        <p className="small" role="status">
          {reviews.some((review) => review.id === snapshot.activeReviewId)
            ? "Review in progress. Incoming uses remain separate evidence."
            : "Another skill is being reviewed. Eligible evidence waits for that review to finish."}
        </p>
      )}
      <div className="file-actions">
        <button
          className="secondary"
          disabled={
            !canReview ||
            !pending.length ||
            !!snapshot.activeReviewId ||
            !!busy ||
            blocked
          }
          onClick={() => void act("review", () => engine.reviewNow(folder))}
        >
          Review now
        </button>
        <button
          className="text-button"
          disabled={!!busy}
          onClick={() => void act("refresh", () => engine.refreshInbox())}
        >
          Refresh evidence
        </button>
      </div>
      {blocked && (
        <p className="small">
          Save or discard your editor draft before applying or restoring a
          review.
        </p>
      )}
      {error && (
        <p className="paper-banner error" role="alert">
          {error}
        </p>
      )}
      {!observations.length && (
        <p className="small">
          No task evidence yet. Opted-in agents report the skill revision, task
          ID, outcome, and available evidence references after completing a
          task.
        </p>
      )}
      {!!observations.length && (
        <details className="observation-list">
          <summary>Recent observations ({observations.length})</summary>
          <ul>
            {observations
              .slice(-10)
              .reverse()
              .map((observation) => (
                <li key={observation.id}>
                  <p>{observation.observations.join("\n")}</p>
                  <p className="small">
                    Task: {observation.taskId}
                    <br />
                    Revision: <code>{observation.revision}</code>
                    <br />
                    Evidence ID: {observation.id}
                  </p>
                  {observation.evidenceRefs.length > 0 && (
                    <p className="small">
                      References: {observation.evidenceRefs.join(" · ")}
                    </p>
                  )}
                  {observation.suggestedImprovements.length > 0 && (
                    <p className="small">
                      Agent suggestions (unverified):{" "}
                      {observation.suggestedImprovements.join(" · ")}
                    </p>
                  )}
                </li>
              ))}
          </ul>
        </details>
      )}
      {reviews.slice(0, 12).map((review) => (
        <ReviewCard
          key={review.id}
          review={review}
          canApply={canReview && !blocked && !busy}
          busy={!!busy}
          onAction={(action) =>
            void act(action, async () => {
              if (action === "apply") await engine.applyReview(review.id);
              else if (action === "reject")
                await engine.rejectReview(review.id);
              else if (action === "cancel")
                await engine.cancelReview(review.id);
              else if (action === "retry") await engine.retryReview(review.id);
              else if (action === "restore")
                await engine.restoreReview(review.id);
              else await engine.reconcile();
            })
          }
        />
      ))}
    </section>
  );
}

function ReviewCard({
  review,
  canApply,
  busy,
  onAction,
}: {
  review: ImprovementReview;
  canApply: boolean;
  busy: boolean;
  onAction: (action: string) => void;
}) {
  const result = review.result;
  const validation = review.validation;
  const proposal = result?.decision === "proposal";
  return (
    <article
      className="improvement-review"
      aria-label={`Review ${review.status}`}
    >
      <div className="review-title">
        <strong>{review.status.replaceAll("-", " ")}</strong>
        <time dateTime={review.createdAt}>
          {new Date(review.createdAt).toLocaleString()}
        </time>
      </div>
      <p className="small">
        Assessed {review.snapshot.evidence.length} exact evidence records ·
        Started in {modeLabel(review.mode)}
      </p>
      {result && (
        <p>
          <strong>Reviewer rationale:</strong> {result.rationale}
        </p>
      )}
      {review.error && (
        <p className="paper-banner error" role="alert">
          {review.error}
        </p>
      )}
      {validation && (
        <div className="review-validation">
          <strong>Validation</strong>
          <p className="small">
            Structure: {validation.syntax ? "passed" : "failed"} · Scope:{" "}
            {validation.scope ? "passed" : "failed"} · Behavior:{" "}
            {validation.behavioral}
            {validation.procedure
              ? ` (${validation.procedure})`
              : " — no registered checks"}
          </p>
          <ul>
            {validation.checks.map((check, index) => (
              <li key={index}>
                <span aria-label={check.passed ? "Passed" : "Failed"}>
                  {check.passed ? "✓" : "×"}
                </span>{" "}
                {check.name}: {check.detail}
              </li>
            ))}
          </ul>
        </div>
      )}
      {proposal && result.proposedContent !== null && (
        <details className="proposal-diff" open={review.status === "proposal"}>
          <summary>Proposed diff</summary>
          <p className="small">
            − removed · + added. Unchanged context surrounds the replacement.
          </p>
          <pre aria-label="Proposed diff">
            {proposalDiff(review.snapshot.content, result.proposedContent).map(
              (line, index) => (
                <span key={index} className={`diff-${line.kind}`}>
                  {line.kind === "removed"
                    ? "− "
                    : line.kind === "added"
                      ? "+ "
                      : "  "}
                  {line.text}
                  {"\n"}
                </span>
              ),
            )}
          </pre>
        </details>
      )}
      <details>
        <summary>Review evidence and usage</summary>
        <ul className="small">
          {review.snapshot.evidence.map((evidence) => (
            <li key={evidence.id}>
              {evidence.id} · {evidence.taskId} · revision {evidence.revision}
              <br />
              {evidence.observations.join("; ")}
            </li>
          ))}
        </ul>
        <p className="small">
          {review.usage
            ? `Reported usage: ${JSON.stringify(review.usage)}`
            : "Token usage unavailable."}{" "}
          Monetary cost is not reported.
        </p>
      </details>
      {review.publication?.recoveryPath && (
        <p className="file-path">
          Previous version: {review.publication.recoveryPath}
        </p>
      )}
      <div className="file-actions">
        {(review.status === "proposal" || review.status === "unpublished") && (
          <>
            <button
              className="primary"
              disabled={
                !canApply ||
                !validation?.syntax ||
                !validation.scope ||
                validation.behavioral === "failed"
              }
              onClick={() => onAction("apply")}
            >
              Apply proposal
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => onAction("reject")}
            >
              Reject proposal
            </button>
          </>
        )}
        {review.status === "reviewing" && (
          <button className="secondary" onClick={() => onAction("cancel")}>
            Cancel review
          </button>
        )}
        {(["failed", "cancelled", "insufficient-evidence"].includes(
          review.status,
        ) ||
          (review.status === "proposal" &&
            validation &&
            (!validation.syntax ||
              !validation.scope ||
              validation.behavioral === "failed"))) && (
          <button
            className="secondary"
            disabled={!canApply}
            onClick={() => onAction("retry")}
          >
            Retry review
          </button>
        )}
        {review.status === "published" && (
          <button
            className="secondary"
            disabled={!canApply}
            onClick={() => onAction("restore")}
          >
            Restore previous version
          </button>
        )}
        {["publishing", "restoring", "recovery-required"].includes(
          review.status,
        ) && (
          <button
            className="secondary"
            disabled={busy}
            onClick={() => onAction("reconcile")}
          >
            Check recovery state
          </button>
        )}
      </div>
    </article>
  );
}
