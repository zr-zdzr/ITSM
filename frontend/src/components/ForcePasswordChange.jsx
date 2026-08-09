import { useState, useEffect } from "react";
import { KeyRound } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import Modal from "./ui/Modal";

/**
 * Blocking first-login gate for bulk-provisioned accounts: the temp password
 * must be replaced before the app is usable. Not dismissible — the modal has
 * no close path other than a successful change.
 */
export default function ForcePasswordChange() {
  const { user, setUser } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState({ cur: "", nw: "", confirm: "" });
  const [saving, setSaving] = useState(false);
  const [ssoMode, setSsoMode] = useState(null);

  useEffect(() => {
    if (user?.must_change_password)
      api
        .get("/auth/config")
        .then((c) => setSsoMode(c.google === true))
        .catch(() => setSsoMode(false));
  }, [user?.must_change_password]);

  // Under Google SSO there is no local password to change — the flag is a
  // leftover from the temp-password flow and clears on first Google sign-in.
  if (!user?.must_change_password || ssoMode !== false) return null;

  async function submit() {
    if (form.nw.length < 6)
      return toast("New password must be at least 6 characters", "error");
    if (form.nw !== form.confirm)
      return toast("Passwords do not match", "error");
    setSaving(true);
    try {
      await api.post("/auth/change-password", {
        current_password: form.cur,
        new_password: form.nw,
      });
      const me = await api.get("/auth/me");
      setUser(me);
      toast("Password updated — welcome!", "success");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  }

  const field = (label, key, placeholder) => (
    <div>
      <label className="form-label small fw-medium mb-1">{label}</label>
      <input
        type="password"
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        placeholder={placeholder}
        className="form-control form-control-sm"
      />
    </div>
  );

  return (
    <Modal open onClose={() => {}} title="Set Your Password">
      <div className="d-flex flex-column gap-2">
        <p className="small text-secondary d-flex align-items-center gap-2 mb-1">
          <KeyRound size={14} style={{ color: "var(--brand)" }} />
          You signed in with a temporary password. Choose your own to continue.
        </p>
        {field("Temporary Password", "cur", "The password you were given")}
        {field("New Password", "nw", "At least 6 characters")}
        {field("Confirm New Password", "confirm", "Repeat it")}
        <button
          onClick={submit}
          disabled={saving || !form.cur || !form.nw || !form.confirm}
          className="btn btn-primary btn-sm mt-1"
        >
          {saving ? "Saving…" : "Set Password"}
        </button>
      </div>
    </Modal>
  );
}
