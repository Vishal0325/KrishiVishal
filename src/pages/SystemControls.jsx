import React, { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { AlertTriangle, Loader2, Lock, ShieldAlert, WifiOff } from "lucide-react";
import PageHeader from "../components/common/PageHeader";
import { useAuth } from "../hooks/useAuth";
import { useWarehouse } from "../context/WarehouseContext";
import { configVersion, useSystemConfig } from "../hooks/useSystemConfig";
import { describeFlagError, updateFeatureFlag } from "../services/featureFlagService";

/**
 * Each control describes ONE boolean flag.
 * `dangerWhen`: the flag value that means "something is switched off / locked" (shown in red).
 * `critical`: mirrors the backend registry (reason >= 10 chars is mandatory server-side).
 * `defaultValue`: shown when the config doc/field does not exist yet (mirrors backend defaults).
 */
const GLOBAL_CONTROLS = [
  {
    key: "maintenanceMode",
    title: "Maintenance Mode",
    description: "Blocks ordering for every customer. Use for migrations or major incidents.",
    critical: true,
    defaultValue: false,
    dangerWhen: true,
    onText: "ON: store in maintenance",
    offText: "OFF: normal",
  },
  {
    key: "checkoutFrozen",
    title: "Global Checkout Freeze",
    description: "Rejects every new order on every hub (pricing bug, inventory corruption).",
    critical: true,
    defaultValue: false,
    dangerWhen: true,
    onText: "FROZEN: no orders accepted",
    offText: "Checkout open",
  },
  {
    key: "paymentsOnlineEnabled",
    title: "Online Payments (Razorpay)",
    description: "When OFF, new online-payment orders are rejected. COD and wallet are unaffected.",
    critical: true,
    defaultValue: true,
    dangerWhen: false,
    onText: "Enabled",
    offText: "DISABLED: online payments blocked",
  },
  {
    key: "codEnabled",
    title: "Cash on Delivery (Master)",
    description: "When OFF, COD is blocked on every hub regardless of hub settings.",
    critical: true,
    defaultValue: true,
    dangerWhen: false,
    onText: "Enabled",
    offText: "DISABLED: COD blocked",
  },
];

const HUB_CONTROLS = [
  {
    key: "lockdown",
    title: "Hub Lockdown",
    description: "Immediately stops new orders for this hub (flood, strike, fraud, stock-out).",
    critical: true,
    defaultValue: false,
    dangerWhen: true,
    onText: "LOCKED DOWN",
    offText: "Normal",
  },
  {
    key: "acceptingOrders",
    title: "Hub Orders",
    description: "Soft pause for this hub's new orders (shift end, capacity). Turn back on to resume.",
    critical: false,
    defaultValue: true,
    dangerWhen: false,
    onText: "Accepting orders",
    offText: "PAUSED: not accepting orders",
  },
];

const MIN_REASON_CRITICAL = 10;
const MIN_REASON_OTHER = 3;

function readFlag(state, control) {
  const v = state?.data?.[control.key];
  return typeof v === "boolean" ? v : control.defaultValue;
}

function formatTs(ts) {
  const d = ts && typeof ts.toDate === "function" ? ts.toDate() : null;
  return d ? format(d, "dd MMM yyyy, HH:mm") : null;
}

/** "Last changed" line shown under every toggle (updatedBy / updatedAt / reason). */
function FlagMeta({ state, flagKey }) {
  const meta = state?.data?.flagMeta?.[flagKey];
  if (!meta) {
    return <p className="mt-2 text-[11px] text-gray-400">Never changed (default value)</p>;
  }
  const when = formatTs(meta.updatedAt);
  return (
    <div className="mt-2 text-[11px] text-gray-500 space-y-0.5">
      <p>
        <span className="font-semibold text-gray-600">Updated by:</span> {meta.updatedByEmail || meta.updatedBy || "unknown"}
        {meta.updatedByRole ? ` (${meta.updatedByRole === "super_admin" ? "SuperAdmin" : "HubManager"})` : ""}
      </p>
      <p>
        <span className="font-semibold text-gray-600">At:</span> {when || "just now"}
      </p>
      {meta.reason ? (
        <p className="break-words">
          <span className="font-semibold text-gray-600">Reason:</span> {meta.reason}
        </p>
      ) : null}
    </div>
  );
}

function ToggleSwitch({ checked, disabled, onClick, label, danger }) {
  const on = checked
    ? danger
      ? "bg-red-600"
      : "bg-[#0B4D31]"
    : danger
      ? "bg-red-600"
      : "bg-gray-300";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#0B4D31] ${on} ${
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function ControlRow({ control, state, disabled, busy, onRequestToggle }) {
  const value = readFlag(state, control);
  const danger = value === control.dangerWhen;
  return (
    <div className={`p-4 rounded-2xl border ${danger ? "border-red-200 bg-red-50/60" : "border-gray-100 bg-white"} shadow-sm`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            {control.title}
            {control.critical ? (
              <span className="text-[9px] uppercase tracking-wider font-black text-red-700 bg-red-100 px-1.5 py-0.5 rounded">Critical</span>
            ) : null}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">{control.description}</p>
          <p className={`text-xs font-bold mt-2 ${danger ? "text-red-700" : "text-emerald-700"}`}>
            {value ? control.onText : control.offText}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {busy ? <Loader2 size={16} className="animate-spin text-gray-400" /> : null}
          <ToggleSwitch
            checked={value}
            danger={danger}
            disabled={disabled || busy}
            label={control.title}
            onClick={() => onRequestToggle(control, !value)}
          />
        </div>
      </div>
      <FlagMeta state={state} flagKey={control.key} />
    </div>
  );
}

/**
 * Confirmation modal. `expectedVersion` was captured when the modal OPENED, so a concurrent
 * change made while the admin is typing is detected (stale banner + server-side check).
 */
function ReasonModal({ request, liveVersion, submitting, error, onCancel, onConfirm }) {
  const { control, newValue, scopeLabel } = request;
  const [reason, setReason] = useState("");
  const textareaRef = useRef(null);
  const minLen = control.critical ? MIN_REASON_CRITICAL : MIN_REASON_OTHER;
  const trimmed = reason.trim();
  const stale = !submitting && liveVersion !== request.expectedVersion;
  const valid = trimmed.length >= minLen && trimmed.length <= 500;
  const turnsDanger = newValue === control.dangerWhen;

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !submitting) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [submitting, onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onCancel();
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="flag-modal-title" className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-xl ${turnsDanger ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
            <AlertTriangle size={20} />
          </div>
          <div className="min-w-0">
            <h2 id="flag-modal-title" className="text-base font-black text-gray-900">
              {control.title}: {newValue ? control.onText : control.offText}
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              Scope: <span className="font-semibold">{scopeLabel}</span>. This takes effect for all users within about 10 seconds and is permanently audit-logged.
            </p>
          </div>
        </div>

        {stale ? (
          <div role="alert" className="mt-4 text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3">
            These controls changed while this dialog was open (v{request.expectedVersion} → v{liveVersion}). Cancel and review the latest state.
          </div>
        ) : null}

        <label htmlFor="flag-reason" className="block text-xs font-bold text-gray-700 mt-4">
          Why are you toggling this? <span className="text-red-600">*</span>
        </label>
        <textarea
          id="flag-reason"
          ref={textareaRef}
          value={reason}
          maxLength={500}
          rows={3}
          disabled={submitting}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Razorpay webhook failing, TICKET-4412"
          className="mt-1 w-full rounded-xl border border-gray-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B4D31]"
        />
        <div className="flex justify-between text-[11px] mt-1 text-gray-400">
          <span>{trimmed.length < minLen ? `At least ${minLen} characters required` : "Looks good"}</span>
          <span>{trimmed.length}/500</span>
        </div>

        {error ? (
          <div role="alert" className="mt-3 text-xs bg-red-50 border border-red-200 text-red-700 rounded-xl p-3">
            {error}
          </div>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {stale || error ? "Close" : "Cancel"}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(trimmed)}
            disabled={!valid || stale || submitting || Boolean(error)}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
              turnsDanger ? "bg-red-600 hover:bg-red-700" : "bg-[#0B4D31] hover:bg-[#083b25]"
            }`}
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
            Confirm change
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusBanner({ state, label }) {
  if (state.error) {
    return (
      <div role="alert" className="flex items-center gap-2 text-xs bg-red-50 border border-red-200 text-red-700 rounded-xl p-3">
        <AlertTriangle size={14} /> Could not load {label} controls ({state.error.code || "error"}). Toggles are disabled.
      </div>
    );
  }
  if (!state.loading && state.fromCache) {
    return (
      <div role="status" className="flex items-center gap-2 text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3">
        <WifiOff size={14} /> Showing cached {label} controls (offline or reconnecting). Toggles are disabled until live data arrives.
      </div>
    );
  }
  return null;
}

export default function SystemControls() {
  const { user, role } = useAuth();
  const { warehouses, selectedWarehouseId } = useWarehouse();
  const isSuper = role === "SuperAdmin";

  const [claimHubId, setClaimHubId] = useState(null);
  useEffect(() => {
    let alive = true;
    if (!user) return undefined;
    user
      .getIdTokenResult()
      .then((r) => {
        if (alive) setClaimHubId(typeof r.claims.hubId === "string" ? r.claims.hubId : null);
      })
      .catch(() => alive && setClaimHubId(null));
    return () => {
      alive = false;
    };
  }, [user]);

  // SuperAdmin picks any hub; a HubManager is pinned to their own hub (also enforced server-side).
  const [pickedHubId, setPickedHubId] = useState(selectedWarehouseId && selectedWarehouseId !== "ALL" ? selectedWarehouseId : "");
  const activeHubId = isSuper ? pickedHubId || warehouses[0]?.id || "" : claimHubId || "";
  const activeHubName = useMemo(() => {
    const w = warehouses.find((x) => x.id === activeHubId);
    return w?.name || w?.code || activeHubId;
  }, [warehouses, activeHubId]);

  const { global, hub } = useSystemConfig(activeHubId || null);

  const [pending, setPending] = useState(null); // { control, newValue, scope, hubId, expectedVersion, scopeLabel }
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState(null);

  const writeLocked = global.data?.adminWriteLock === true && !isSuper;
  const globalReady = !global.loading && !global.error && !global.fromCache;
  const hubReady = Boolean(activeHubId) && !hub.loading && !hub.error && !hub.fromCache;

  const openModal = (scope) => (control, newValue) => {
    const isGlobal = scope === "global";
    setModalError(null);
    setPending({
      control,
      newValue,
      scope,
      hubId: isGlobal ? null : activeHubId,
      // Captured NOW: the version the admin was looking at when they decided to act.
      expectedVersion: configVersion(isGlobal ? global : hub),
      scopeLabel: isGlobal ? "Global (all hubs)" : `Hub: ${activeHubName}`,
    });
  };

  const closeModal = () => {
    if (!submitting) {
      setPending(null);
      setModalError(null);
    }
  };

  const confirm = async (reason) => {
    if (!pending || submitting) return;
    setSubmitting(true);
    setModalError(null);
    try {
      const res = await updateFeatureFlag({
        flagPath: pending.control.key,
        newValue: pending.newValue,
        reason,
        expectedVersion: pending.expectedVersion,
        hubId: pending.hubId,
      });
      toast.success(res.changed ? `${pending.control.title} updated (v${res.version})` : "Already in that state: no change made");
      setPending(null);
    } catch (err) {
      const { message } = describeFlagError(err);
      setModalError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const liveVersionForPending = pending ? configVersion(pending.scope === "global" ? global : hub) : 0;
  const busyKey = submitting && pending ? `${pending.scope}:${pending.control.key}` : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="System Controls / Feature Flags"
        subtitle="Instant kill switches enforced by the backend. Every change requires a reason and is audit-logged."
      />

      {writeLocked ? (
        <div role="alert" className="flex items-center gap-2 text-xs bg-red-50 border border-red-200 text-red-700 rounded-xl p-3">
          <Lock size={14} /> Admin write lock is ON. Only a SuperAdmin can change controls.
        </div>
      ) : null}

      {/* ---------------- Global ---------------- */}
      <section aria-labelledby="global-controls" className="space-y-3">
        <div className="flex items-center gap-2">
          <ShieldAlert size={18} className="text-red-700" />
          <h2 id="global-controls" className="text-sm font-black uppercase tracking-wider text-gray-800">
            Global Kill Switches
          </h2>
          <span className="text-[11px] text-gray-400">v{configVersion(global)}</span>
        </div>
        <StatusBanner state={global} label="global" />
        {!isSuper ? (
          <p className="text-xs text-gray-500">Only a SuperAdmin can change global switches. You can view their current state.</p>
        ) : null}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {GLOBAL_CONTROLS.map((c) => (
            <ControlRow
              key={c.key}
              control={c}
              state={global}
              disabled={!isSuper || !globalReady}
              busy={busyKey === `global:${c.key}`}
              onRequestToggle={openModal("global")}
            />
          ))}
        </div>
      </section>

      {/* ---------------- Hub ---------------- */}
      <section aria-labelledby="hub-controls" className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="hub-controls" className="text-sm font-black uppercase tracking-wider text-gray-800">
            Hub Controls
          </h2>
          {isSuper ? (
            <select
              aria-label="Select hub"
              value={activeHubId}
              onChange={(e) => setPickedHubId(e.target.value)}
              className="text-xs border border-gray-200 rounded-xl px-3 py-2 bg-white"
            >
              {warehouses.length === 0 ? <option value="">No hubs found</option> : null}
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name || w.code || w.id}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-xs font-semibold text-gray-700">{activeHubId ? activeHubName : "No hub assigned to your account"}</span>
          )}
          {activeHubId ? <span className="text-[11px] text-gray-400">v{configVersion(hub)}</span> : null}
        </div>

        {activeHubId ? (
          <>
            <StatusBanner state={hub} label="hub" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {HUB_CONTROLS.map((c) => (
                <ControlRow
                  key={c.key}
                  control={c}
                  state={hub}
                  disabled={!hubReady || writeLocked}
                  busy={busyKey === `hub:${c.key}`}
                  onRequestToggle={openModal("hub")}
                />
              ))}
            </div>
          </>
        ) : (
          <p className="text-xs text-gray-500">Select a hub to manage its controls.</p>
        )}
      </section>

      {pending ? (
        <ReasonModal
          // New component state (reason text) for every request.
          key={`${pending.scope}:${pending.hubId}:${pending.control.key}:${pending.expectedVersion}`}
          request={pending}
          liveVersion={liveVersionForPending}
          submitting={submitting}
          error={modalError}
          onCancel={closeModal}
          onConfirm={confirm}
        />
      ) : null}
    </div>
  );
}
