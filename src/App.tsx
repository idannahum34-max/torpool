import { useEffect, useState, useCallback, useRef, type FormEvent } from "react";
import { supabase } from "./lib/supabase";
import type { Session, User } from "@supabase/supabase-js";

/* ─── Types ──────────────────────────────────────────────── */

type Business = {
  id: string;
  owner_id: string;
  business_name: string;
  phone: string | null;
  email: string | null;
};

type Slot = {
  id: string;
  business_id: string | null;
  business_name: string;
  business_phone: string | null;
  service_name: string;
  slot_date: string;
  slot_time: string;
  price: string | null;
  note: string | null;
  status: string;
  created_at?: string;
};

type Claim = {
  id: string;
  slot_id: string;
  client_name: string;
  client_phone: string;
  status: string;
  created_at?: string;
};

type HistoryItem = Slot & { claims: Claim[] };

type WaitlistEntry = {
  id: string;
  business_id: string;
  client_name: string;
  client_phone: string;
  service_interest: string | null;
  preferred_days: string | null;
  preferred_times: string | null;
  note: string | null;
  status: string;
  created_at?: string;
};

type ToastType = "success" | "error" | "info";
type Toast = { id: string; message: string; type: ToastType };
type ConfirmOpts = {
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  resolve: (v: boolean) => void;
};

type AccessStatus = "checking" | "guest" | "allowed" | "denied";
type AuthMode = "login" | "register" | "forgot" | "reset";

/* ─── Helpers ────────────────────────────────────────────── */

function normalizePhone(phone: string | null | undefined) {
  if (!phone) return "";
  const d = phone.replace(/\D/g, "");
  if (d.startsWith("972")) return d;
  if (d.startsWith("0")) return `972${d.slice(1)}`;
  return d;
}

function formatDate(date: string | null | undefined) {
  if (!date) return "";
  try {
    return new Date(date).toLocaleDateString("he-IL", {
      year: "numeric", month: "2-digit", day: "2-digit",
    });
  } catch { return date; }
}

function formatTime(time: string | null | undefined) {
  if (!time) return "";
  return time.slice(0, 5);
}

function cleanText(text: string) {
  return text.replace(/\uFFFD/g, "").normalize("NFC");
}

function waUrl(phone: string, message: string) {
  return `https://wa.me/${phone}?text=${encodeURIComponent(cleanText(message))}`;
}

function sortByCreated<T extends { created_at?: string }>(items: T[]) {
  return [...items].sort((a, b) => {
    const at = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
    return bt - at;
  });
}

function statusLabel(s: string) {
  const map: Record<string, string> = {
    open: "פתוח לבקשות", claimed: "פתוח לבקשות",
    confirmed: "נסגר בהצלחה", cancelled: "בוטל",
    approved: "אושרה", pending: "ממתינה", rejected: "נדחתה",
    active: "פעילה", contacted: "נשלחה הודעה",
    booked: "נסגר איתה", inactive: "לא פעילה",
  };
  return map[s] ?? s;
}

function statusChip(s: string) {
  if (["open","claimed","active"].includes(s)) return "chip chip--open";
  if (["pending","contacted"].includes(s)) return "chip chip--pending";
  if (["confirmed","approved","booked"].includes(s)) return "chip chip--closed";
  if (["cancelled","rejected","inactive"].includes(s)) return "chip chip--cancelled";
  return "chip chip--open";
}

/* ─── Toast hook ─────────────────────────────────────────── */

function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirm, setConfirm] = useState<ConfirmOpts | null>(null);
  const counter = useRef(0);

  const showToast = useCallback((message: string, type: ToastType = "info") => {
    counter.current += 1;
    const id = `t${counter.current}`;
    setToasts(p => [...p, { id, message, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500);
  }, []);

  const showConfirm = useCallback((opts: Omit<ConfirmOpts, "resolve">): Promise<boolean> => {
    return new Promise(resolve => setConfirm({ ...opts, resolve }));
  }, []);

  const resolveConfirm = useCallback((v: boolean) => {
    if (confirm) { confirm.resolve(v); setConfirm(null); }
  }, [confirm]);

  return { toasts, confirm, showToast, showConfirm, resolveConfirm };
}

/* ─── Toast UI ───────────────────────────────────────────── */

function ToastList({ toasts }: { toasts: Toast[] }) {
  if (!toasts.length) return null;
  return (
    <div className="toast-wrap">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast--${t.type}`}>
          <span className="toast-icon">
            {t.type === "success" ? "✓" : t.type === "error" ? "✕" : "i"}
          </span>
          {t.message}
        </div>
      ))}
    </div>
  );
}

function ConfirmModal({ opts, onChoice }: { opts: ConfirmOpts; onChoice: (v: boolean) => void }) {
  return (
    <div className="modal-overlay" onClick={() => onChoice(false)}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <p className="modal-msg">{opts.message}</p>
        <div className="modal-actions">
          <button className="modal-cancel" onClick={() => onChoice(false)}>
            {opts.cancelLabel ?? "ביטול"}
          </button>
          <button
            className={`modal-confirm${opts.danger ? " modal-confirm--danger" : ""}`}
            onClick={() => onChoice(true)}
          >
            {opts.confirmLabel ?? "אישור"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Logo ───────────────────────────────────────────────── */

function Logo() {
  return (
    <div className="brandbar">
      <div className="brandmark">TP</div>
      <div>
        <p className="brandtitle">תורפול</p>
        <p className="brandsub">תור שהתבטל? הופכים אותו להזדמנות.</p>
      </div>
    </div>
  );
}

/* ─── App ────────────────────────────────────────────────── */

export default function App() {
  const PAYMENT_PHONE = "972559998187";

  /* auth */
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [accessStatus, setAccessStatus] = useState<AccessStatus>("checking");
  const [authMode, setAuthMode] = useState<AuthMode>("login");

  /* data */
  const [business, setBusiness] = useState<Business | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [clientClaim, setClientClaim] = useState<Claim | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [waitlistEntries, setWaitlistEntries] = useState<WaitlistEntry[]>([]);
  const [waitlistBusinessId, setWaitlistBusinessId] = useState<string | null>(null);

  /* stats */
  const [approvedCount, setApprovedCount] = useState(0);
  const [approvedValue, setApprovedValue] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [cancelledCount, setCancelledCount] = useState(0);
  const [activeWaitlistCount, setActiveWaitlistCount] = useState(0);

  /* view flags */
  const [loading, setLoading] = useState(true);
  const [showClientPage, setShowClientPage] = useState(false);
  const [showCreateSlot, setShowCreateSlot] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showWaitlist, setShowWaitlist] = useState(false);
  const [showWaitlistSignup, setShowWaitlistSignup] = useState(false);
  const [showEditBusiness, setShowEditBusiness] = useState(false);
  const [showEditSlot, setShowEditSlot] = useState(false);
  const [clientSubmitted, setClientSubmitted] = useState(false);
  const [waitlistSubmitted, setWaitlistSubmitted] = useState(false);

  /* toast */
  const { toasts, confirm, showToast, showConfirm, resolveConfirm } = useToast();

  /* ── derived ── */
  const isOwner = Boolean(session && business && slot && slot.business_id === business.id);

  const isDashboard =
    Boolean(session) &&
    accessStatus === "allowed" &&
    Boolean(business) &&
    !slot && !showClientPage && !showCreateSlot &&
    !showHistory && !showWaitlist && !showEditBusiness && !showWaitlistSignup;

  const isLanding = !session && !slot && !showWaitlistSignup;

  const clientLink = slot ? `${window.location.origin}/?slot=${slot.id}&view=client` : "";
  const waitlistLink = business ? `${window.location.origin}/?business=${business.id}&view=waitlist` : "";

  /* ── init ── */
  useEffect(() => {
    startApp();
    const { data } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (event === "PASSWORD_RECOVERY") { setAuthMode("reset"); setLoading(false); return; }
      if (newSession?.user) {
        checkAccess().then(ok => { if (ok) loadBusiness(newSession.user.id); else setBusiness(null); });
      } else {
        setBusiness(null);
        setAccessStatus("guest");
        setApprovedCount(0); setApprovedValue(0);
        setPendingCount(0); setCancelledCount(0); setActiveWaitlistCount(0);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function checkAccess() {
    const { data, error } = await supabase.rpc("is_current_user_allowed");
    if (error) { setAccessStatus("denied"); return false; }
    const ok = data === true;
    setAccessStatus(ok ? "allowed" : "denied");
    return ok;
  }

  async function startApp() {
    setLoading(true);
    const params = new URLSearchParams(window.location.search);
    const slotId = params.get("slot");
    const businessId = params.get("business");
    const view = params.get("view");

    if (window.location.hash.includes("type=recovery")) setAuthMode("reset");

    if (businessId && view === "waitlist") {
      setWaitlistBusinessId(businessId);
      setShowWaitlistSignup(true);
    }

    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    setUser(data.session?.user ?? null);

    if (data.session?.user && !window.location.hash.includes("type=recovery")) {
      const ok = await checkAccess();
      if (ok) await loadBusiness(data.session.user.id);
      else setBusiness(null);
    } else {
      setAccessStatus("guest");
    }

    if (slotId) await loadSlotFromUrl();
    setLoading(false);
  }

  async function loadBusiness(userId: string) {
    const { data, error } = await supabase
      .from("businesses").select("*").eq("owner_id", userId).maybeSingle();
    if (error) { showToast("לא הצלחתי לטעון את העסק", "error"); return; }
    setBusiness(data as Business | null);
    if (data) await loadStats(data.id);
  }

  async function loadStats(bid: string) {
    const { data: slotsData } = await supabase
      .from("slots").select("*, claims(*)").eq("business_id", bid);
    const slots = (slotsData || []) as HistoryItem[];
    const confirmed = slots.filter(s => s.status === "confirmed");
    const cancelled = slots.filter(s => s.status === "cancelled");
    const pending = slots.reduce((sum, s) =>
      sum + (s.claims || []).filter(c => c.status === "pending").length, 0);
    const value = confirmed.reduce((sum, s) => sum + (Number(s.price) || 0), 0);

    const { data: wlData } = await supabase
      .from("waitlist_entries").select("id, status").eq("business_id", bid);
    const activeWl = (wlData || []).filter(e =>
      e.status === "active" || e.status === "contacted").length;

    setApprovedCount(confirmed.length);
    setApprovedValue(value);
    setPendingCount(pending);
    setCancelledCount(cancelled.length);
    setActiveWaitlistCount(activeWl);
  }

  async function loadSlotFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const slotId = params.get("slot");
    const view = params.get("view");
    if (!slotId) return;

    const { data: slotData, error } = await supabase
      .from("slots").select("*").eq("id", slotId).single();
    if (error) { showToast("לא הצלחתי לטעון את התור", "error"); return; }

    setSlot(slotData as Slot);
    const { data: claimsData } = await supabase
      .from("claims").select("*").eq("slot_id", slotId).order("created_at", { ascending: false });
    setClaims(sortByCreated((claimsData || []) as Claim[]));
    setClientClaim(null);
    setShowClientPage(view === "client");
    setShowWaitlistSignup(false);
  }

  /* ── auth handlers ── */
  async function handleAuth(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") || "");
    const password = String(form.get("password") || "");

    if (authMode === "register") {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) { showToast(error.message, "error"); setLoading(false); return; }
      if (!data.session) showToast("נרשמת! אם נדרש אימות מייל, בדקי את תיבת הדואר.", "info");
      setSession(data.session); setUser(data.user);
      if (data.user) { const ok = await checkAccess(); if (ok) await loadBusiness(data.user.id); }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { showToast(error.message, "error"); setLoading(false); return; }
      setSession(data.session); setUser(data.user);
      if (data.user) { const ok = await checkAccess(); if (ok) await loadBusiness(data.user.id); }
    }
    setLoading(false);
  }

  async function handleForgotPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") || "");
    if (!email) { showToast("צריך להזין אימייל", "error"); return; }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (error) { showToast("לא הצלחתי לשלוח קישור איפוס. בדקי שהאימייל נכון.", "error"); setLoading(false); return; }
    showToast("שלחנו לך קישור לאיפוס סיסמה במייל", "success");
    setAuthMode("login");
    setLoading(false);
  }

  async function handleUpdatePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") || "");
    const confirm2 = String(form.get("confirmPassword") || "");
    if (password.length < 6) { showToast("הסיסמה חייבת להיות לפחות 6 תווים", "error"); return; }
    if (password !== confirm2) { showToast("הסיסמאות לא תואמות", "error"); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) { showToast("לא הצלחתי לעדכן סיסמה. נסי לפתוח שוב את הקישור מהמייל.", "error"); setLoading(false); return; }
    showToast("הסיסמה עודכנה בהצלחה", "success");
    await supabase.auth.signOut();
    setSession(null); setUser(null); setBusiness(null);
    setAccessStatus("guest"); setAuthMode("login");
    window.history.pushState({}, "", "/");
    setLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setSession(null); setUser(null); setBusiness(null);
    setAccessStatus("guest"); setSlot(null); setClaims([]);
    setClientClaim(null); setHistory([]); setWaitlistEntries([]);
    setShowClientPage(false); setShowCreateSlot(false);
    setShowHistory(false); setShowWaitlist(false);
    setShowWaitlistSignup(false); setShowEditBusiness(false);
    setShowEditSlot(false); setClientSubmitted(false);
    setWaitlistSubmitted(false);
    window.history.pushState({}, "", "/");
  }

  function guardAccess() {
    if (accessStatus !== "allowed") {
      showToast("הגישה לפעולה הזו פתוחה למנויות פעילות בלבד.", "error");
      return false;
    }
    return true;
  }

  /* ── business handlers ── */
  async function handleCreateBusiness(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!guardAccess() || !user) return;
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const { data, error } = await supabase.from("businesses").insert({
      owner_id: user.id,
      business_name: String(form.get("businessName") || ""),
      phone: String(form.get("phone") || ""),
      email: String(form.get("email") || ""),
    }).select().single();
    if (error) { showToast("שגיאה ביצירת העסק. ייתכן שאין לחשבון הזה גישה פעילה.", "error"); setLoading(false); return; }
    setBusiness(data as Business);
    await loadStats(data.id);
    setLoading(false);
  }

  async function handleUpdateBusiness(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!guardAccess() || !business) return;
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const updates = {
      business_name: String(form.get("businessName") || ""),
      phone: String(form.get("phone") || ""),
      email: String(form.get("email") || ""),
    };
    const { data, error } = await supabase
      .from("businesses").update(updates).eq("id", business.id).select().single();
    if (error) { showToast("שגיאה בעדכון פרטי העסק", "error"); setLoading(false); return; }
    await supabase.from("slots").update({
      business_name: updates.business_name,
      business_phone: updates.phone,
    }).eq("business_id", business.id);
    setBusiness(data as Business);
    setShowEditBusiness(false);
    showToast("פרטי העסק עודכנו", "success");
    await loadStats(business.id);
    setLoading(false);
  }

  /* ── slot handlers ── */
  async function handleCreateSlot(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!guardAccess()) return;
    if (!business) { showToast("צריך ליצור עסק לפני יצירת תור", "info"); return; }
    if (!business.phone) { showToast("חסר טלפון WhatsApp לעסק. עדכני את פרטי העסק.", "error"); return; }
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const { data, error } = await supabase.from("slots").insert({
      business_id: business.id,
      business_name: business.business_name,
      business_phone: business.phone,
      service_name: String(form.get("serviceName") || ""),
      slot_date: String(form.get("date") || ""),
      slot_time: String(form.get("time") || ""),
      price: String(form.get("price") || ""),
      note: String(form.get("note") || ""),
      status: "open",
    }).select().single();
    if (error) { showToast("שגיאה ביצירת התור", "error"); setLoading(false); return; }
    setSlot(data as Slot); setClaims([]); setClientClaim(null); setClientSubmitted(false);
    setShowCreateSlot(false); setShowHistory(false); setShowWaitlist(false);
    setShowClientPage(false); setShowEditSlot(false);
    window.history.pushState({}, "", `/?slot=${data.id}`);
    await loadStats(business.id);
    setLoading(false);
  }

  async function handleUpdateSlot(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!guardAccess() || !slot || !business || slot.business_id !== business.id) return;
    if (slot.status === "confirmed") { showToast("התור כבר נסגר", "error"); return; }
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const { data, error } = await supabase.from("slots").update({
      service_name: String(form.get("serviceName") || ""),
      slot_date: String(form.get("date") || ""),
      slot_time: String(form.get("time") || ""),
      price: String(form.get("price") || ""),
      note: String(form.get("note") || ""),
    }).eq("id", slot.id).select().single();
    if (error) { showToast("שגיאה בעדכון התור", "error"); setLoading(false); return; }
    setSlot(data as Slot);
    setShowEditSlot(false);
    showToast("התור עודכן", "success");
    await loadStats(business.id);
    setLoading(false);
  }

  /* ── claim handlers ── */
  async function sendClaimEmail(slotId: string, clientName: string, clientPhone: string) {
    await supabase.functions.invoke("send-claim-email", {
      body: { slotId, clientName, clientPhone },
    });
  }

  async function handleClaimSlot(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!slot) return;
    if (slot.status === "confirmed") { showToast("התור כבר נסגר", "error"); return; }
    if (slot.status === "cancelled") { showToast("התור כבר לא זמין", "error"); return; }
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const clientName = String(form.get("clientName") || "").trim();
    const clientPhone = String(form.get("clientPhone") || "").trim();
    if (!clientName || !clientPhone) { showToast("צריך למלא שם וטלפון", "error"); setLoading(false); return; }
    const { data, error } = await supabase.from("claims").insert({
  slot_id: slot.id,
  client_name: clientName,
  client_phone: clientPhone,
  normalized_client_phone: normalizePhone(clientPhone),
  status: "pending",
}).select().single();
    if (error) { showToast("שגיאה בשליחת הבקשה. נסי שוב בעוד רגע.", "error"); setLoading(false); return; }
    await sendClaimEmail(slot.id, clientName, clientPhone);
    const inserted = data as Claim;
    setClientClaim(inserted);
    setClaims(prev => sortByCreated([inserted, ...prev]));
    setClientSubmitted(true);
    setShowClientPage(true);
    window.history.pushState({}, "", `/?slot=${slot.id}&view=client`);
    setLoading(false);
  }

  async function handleJoinWaitlist(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!waitlistBusinessId) { showToast("לא נמצא עסק לרשימת ההמתנה", "error"); return; }
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const clientName = String(form.get("clientName") || "").trim();
    const clientPhone = String(form.get("clientPhone") || "").trim();
    if (!clientName || !clientPhone) { showToast("צריך למלא שם וטלפון", "error"); setLoading(false); return; }
   const { error } = await supabase.from("waitlist_entries").insert({
  business_id: waitlistBusinessId,
  client_name: clientName,
  client_phone: clientPhone,
  normalized_client_phone: normalizePhone(clientPhone),
  service_interest: String(form.get("serviceInterest") || "").trim(),
  preferred_days: String(form.get("preferredDays") || "").trim(),
  preferred_times: String(form.get("preferredTimes") || "").trim(),
  note: String(form.get("note") || "").trim(),
  status: "active",
});
    if (error) { showToast("לא הצלחתי להצטרף לרשימת ההמתנה. נסי שוב.", "error"); setLoading(false); return; }
    setWaitlistSubmitted(true);
    setLoading(false);
  }

  /* ── slot management ── */
  async function approveClaim(c: Claim, s?: Slot) {
    if (!guardAccess()) return;
    const activeSlot = s || slot;
    if (!business || !c || !activeSlot) return;
    if (activeSlot.business_id !== business.id) { showToast("אין הרשאה לאשר תור זה", "error"); return; }
    if (activeSlot.status === "confirmed") { showToast("התור כבר נסגר", "error"); return; }
    if (activeSlot.status === "cancelled") { showToast("אי אפשר לסגור תור שבוטל", "error"); return; }
    const ok = await showConfirm({
      message: `לסגור את התור עם ${c.client_name}? שאר הבקשות הממתינות יסומנו כנדחו.`,
      confirmLabel: "כן, סגרי",
      cancelLabel: "ביטול",
    });
    if (!ok) return;
    setLoading(true);
   const { error } = await supabase.rpc("approve_claim", {
  p_claim_id: c.id,
});
    if (error) { showToast("שגיאה בסגירת התור", "error"); setLoading(false); return; }
    showToast("התור נסגר בהצלחה ✓", "success");
    await loadStats(business.id);
    showHistory ? await loadHistory() : await loadSlotFromUrl();
    setLoading(false);
  }

  async function rejectClaim(c: Claim, s?: Slot) {
    if (!guardAccess()) return;
    const activeSlot = s || slot;
    if (!business || !c || !activeSlot) return;
    if (c.status === "approved") { showToast("אי אפשר לדחות בקשה שכבר אושרה", "error"); return; }
    const ok = await showConfirm({
      message: `לדחות את הבקשה של ${c.client_name}? התור יישאר פתוח לבקשות נוספות.`,
      confirmLabel: "דחי בקשה",
      cancelLabel: "ביטול",
    });
    if (!ok) return;
    setLoading(true);
    const { error } = await supabase.from("claims").update({ status: "rejected" }).eq("id", c.id);
    if (error) { showToast("שגיאה בדחיית הבקשה", "error"); setLoading(false); return; }
    showToast("הבקשה נדחתה. התור עדיין פתוח.", "info");
    await loadStats(business.id);
    showHistory ? await loadHistory() : await loadSlotFromUrl();
    setLoading(false);
  }

  async function cancelSlot(s?: Slot) {
    if (!guardAccess()) return;
    const activeSlot = s || slot;
    if (!business || !activeSlot) return;
    const ok = await showConfirm({
      message: "לבטל את התור? הוא יישאר בהיסטוריה אבל לקוחות לא יוכלו לבקש אותו.",
      confirmLabel: "בטלי תור",
      cancelLabel: "ביטול",
      danger: true,
    });
    if (!ok) return;
    setLoading(true);
    const { error } = await supabase.from("slots").update({ status: "cancelled" }).eq("id", activeSlot.id);
    if (error) { showToast("שגיאה בביטול התור", "error"); setLoading(false); return; }
    showToast("התור בוטל", "info");
    await loadStats(business.id);
    showHistory ? await loadHistory() : await loadSlotFromUrl();
    setLoading(false);
  }

  async function reopenSlot(s?: Slot) {
    if (!guardAccess()) return;
    const activeSlot = s || slot;
    if (!business || !activeSlot) return;
    const ok = await showConfirm({
      message: "לפתוח את התור שוב לבקשות? בקשות קיימות יישארו כמו שהן.",
      confirmLabel: "פתחי מחדש",
      cancelLabel: "ביטול",
    });
    if (!ok) return;
    setLoading(true);
    const { error } = await supabase.from("slots").update({ status: "open" }).eq("id", activeSlot.id);
    if (error) { showToast("שגיאה בפתיחת התור", "error"); setLoading(false); return; }
    showToast("התור נפתח שוב לבקשות", "success");
    await loadStats(business.id);
    showHistory ? await loadHistory() : await loadSlotFromUrl();
    setLoading(false);
  }

  async function deleteSlot(s?: Slot) {
    if (!guardAccess()) return;
    const activeSlot = s || slot;
    if (!business || !activeSlot) return;
    const ok = await showConfirm({
      message: "למחוק את התור לגמרי? הפעולה תמחק גם את כל הבקשות ולא ניתן לשחזר.",
      confirmLabel: "מחיקה",
      cancelLabel: "ביטול",
      danger: true,
    });
    if (!ok) return;
    setLoading(true);
    await supabase.from("claims").delete().eq("slot_id", activeSlot.id);
    const { error } = await supabase.from("slots").delete().eq("id", activeSlot.id);
    if (error) { showToast("שגיאה במחיקת התור", "error"); setLoading(false); return; }
    showToast("התור נמחק מהמערכת", "success");
    setSlot(null); setClaims([]); setClientClaim(null); setClientSubmitted(false);
    await loadStats(business.id);
    showHistory ? await loadHistory() : resetToDashboard();
    setLoading(false);
  }

  /* ── waitlist management ── */
  async function updateWaitlistStatus(entry: WaitlistEntry, status: string) {
    if (!guardAccess() || !business) return;
    setLoading(true);
    const { error } = await supabase.from("waitlist_entries").update({ status }).eq("id", entry.id);
    if (error) { showToast("שגיאה בעדכון הסטטוס", "error"); setLoading(false); return; }
    await loadWaitlist();
    await loadStats(business.id);
    setLoading(false);
  }

  async function deleteWaitlistEntry(entry: WaitlistEntry) {
    if (!guardAccess()) return;
    const ok = await showConfirm({
      message: `למחוק את ${entry.client_name} מרשימת ההמתנה?`,
      confirmLabel: "מחיקה",
      cancelLabel: "ביטול",
      danger: true,
    });
    if (!ok) return;
    setLoading(true);
    const { error } = await supabase.from("waitlist_entries").delete().eq("id", entry.id);
    if (error) { showToast("שגיאה במחיקת הרשומה", "error"); setLoading(false); return; }
    if (business) await loadStats(business.id);
    await loadWaitlist();
    setLoading(false);
  }

  /* ── load views ── */
  async function loadHistory() {
    if (!guardAccess() || !business) return;
    setLoading(true);
    setShowHistory(true); setShowWaitlist(false); setShowCreateSlot(false);
    setShowClientPage(false); setShowEditBusiness(false); setShowEditSlot(false);
    setSlot(null); setClaims([]); setClientClaim(null); setClientSubmitted(false);
    const { data, error } = await supabase
      .from("slots").select("*, claims(*)").eq("business_id", business.id)
      .order("created_at", { ascending: false });
    if (error) { showToast("לא הצלחתי לטעון היסטוריה", "error"); setLoading(false); return; }
    setHistory(((data || []) as HistoryItem[]).map(item => ({
      ...item, claims: sortByCreated(item.claims || []),
    })));
    window.history.pushState({}, "", "/");
    setLoading(false);
  }

  async function loadWaitlist() {
    if (!guardAccess() || !business) return;
    setLoading(true);
    setShowWaitlist(true); setShowHistory(false); setShowCreateSlot(false);
    setShowClientPage(false); setShowEditBusiness(false); setShowEditSlot(false);
    setSlot(null); setClaims([]); setClientClaim(null); setClientSubmitted(false);
    const { data, error } = await supabase
      .from("waitlist_entries").select("*").eq("business_id", business.id)
      .order("created_at", { ascending: false });
    if (error) { showToast("לא הצלחתי לטעון רשימת המתנה", "error"); setLoading(false); return; }
    setWaitlistEntries(sortByCreated((data || []) as WaitlistEntry[]));
    window.history.pushState({}, "", "/");
    setLoading(false);
  }

  function resetToDashboard() {
    setSlot(null); setClaims([]); setClientClaim(null);
    setHistory([]); setWaitlistEntries([]);
    setShowClientPage(false); setShowCreateSlot(false);
    setShowHistory(false); setShowWaitlist(false);
    setShowEditBusiness(false); setShowEditSlot(false);
    setClientSubmitted(false); setWaitlistSubmitted(false);
    window.history.pushState({}, "", "/");
    if (business && accessStatus === "allowed") loadStats(business.id);
  }

  function goToCreateSlot() {
    if (!guardAccess()) return;
    setShowCreateSlot(true); setShowHistory(false); setShowWaitlist(false);
    setShowClientPage(false); setShowEditBusiness(false); setShowEditSlot(false);
    setSlot(null); setClaims([]); setClientClaim(null); setClientSubmitted(false);
    window.history.pushState({}, "", "/");
  }

  function openSlotFromHistory(item: HistoryItem) {
    setSlot(item); setClaims(sortByCreated(item.claims || []));
    setClientClaim(null); setShowHistory(false); setShowWaitlist(false);
    setShowCreateSlot(false); setShowEditBusiness(false); setShowEditSlot(false);
    setShowClientPage(false); setClientSubmitted(false);
    window.history.pushState({}, "", `/?slot=${item.id}`);
  }

  /* ── copy helpers ── */
  function copyClientLink(s?: Slot) {
    const target = s || slot;
    if (!target) return;
    navigator.clipboard.writeText(`${window.location.origin}/?slot=${target.id}&view=client`);
    showToast("הלינק הועתק ללוח ✓", "success");
  }

  function copyWhatsappMessage(s?: Slot) {
    const target = s || slot;
    if (!target) return;
    const link = `${window.location.origin}/?slot=${target.id}&view=client`;
    const msg = `היי אהובות 🤍\n\nהתפנה לי תור ל-${target.service_name}\nבתאריך ${formatDate(target.slot_date)}\nבשעה ${formatTime(target.slot_time)}\n${target.price ? `מחיר: ${target.price} ₪\n` : ""}\nמי שרוצה יכולה להשאיר פרטים כאן:\n${link}\n\nהשארת פרטים לא מאשרת את התור אוטומטית.\nאני אאשר מול הלקוחה המתאימה 🙏`;
    navigator.clipboard.writeText(msg);
    showToast("הודעת WhatsApp הועתקה ✓", "success");
  }

  function copyWaitlistLink() {
    if (!waitlistLink) return;
    navigator.clipboard.writeText(waitlistLink);
    showToast("לינק רשימת ההמתנה הועתק ✓", "success");
  }

  function copyWaitlistMsg() {
    if (!waitlistLink) return;
    const msg = `היי אהובות 🤍\n\nפתחתי רשימת המתנה לתורים שמתפנים.\nמי שרוצה שאעדכן אותה כשמתפנה תור, יכולה להשאיר פרטים כאן:\n\n${waitlistLink}\n\nכשיתפנה תור מתאים — אעדכן לפי זמינות 🙏`;
    navigator.clipboard.writeText(msg);
    showToast("הודעת רשימת ההמתנה הועתקה ✓", "success");
  }

  /* ── WhatsApp link builders ── */
  function buildClientToBusinessLink() {
    if (!slot || !clientClaim) return "";
    const phone = normalizePhone(slot.business_phone);
    if (!phone) return "";
    return waUrl(phone, `היי, ראיתי שהתפנה תור דרך תורפול.\n\nשם: ${clientClaim.client_name}\nטלפון: ${clientClaim.client_phone}\n\nאני רוצה את התור:\n${slot.service_name}\nתאריך: ${formatDate(slot.slot_date)}\nשעה: ${formatTime(slot.slot_time)}\n${slot.price ? `מחיר: ${slot.price} ₪` : ""}\n\nהשארתי פרטים באתר ומחכה לאישור.`);
  }

  function buildApprovalLink(c?: Claim | null, s?: Slot | null) {
    const activeSlot = s || slot;
    if (!c || !activeSlot) return "";
    const phone = normalizePhone(c.client_phone);
    if (!phone) return "";
    return waUrl(phone, `היי ${c.client_name},\n\nהתור שלך אושר.\n\nפרטי התור:\n${activeSlot.service_name}\nתאריך: ${formatDate(activeSlot.slot_date)}\nשעה: ${formatTime(activeSlot.slot_time)}\n${activeSlot.price ? `מחיר: ${activeSlot.price} ₪` : ""}\n\nנתראה.`);
  }

  function buildRejectionLink(c?: Claim | null, s?: Slot | null) {
    const activeSlot = s || slot;
    if (!c || !activeSlot) return "";
    const phone = normalizePhone(c.client_phone);
    if (!phone) return "";
    return waUrl(phone, `היי ${c.client_name},\n\nתודה שהשארת פרטים.\nהתור הזה כבר לא מתאים או נתפס, אבל אעדכן אותך כשיתפנה תור חדש.\n\nפרטי התור:\n${activeSlot.service_name}\nתאריך: ${formatDate(activeSlot.slot_date)}\nשעה: ${formatTime(activeSlot.slot_time)}`);
  }

  function buildCancellationLink(c?: Claim | null, s?: Slot | null) {
    const activeSlot = s || slot;
    if (!c || !activeSlot) return "";
    const phone = normalizePhone(c.client_phone);
    if (!phone) return "";
    return waUrl(phone, `היי ${c.client_name},\n\nלצערי התור שהתבקשת אליו בוטל.\n\nפרטי התור:\n${activeSlot.service_name}\nתאריך: ${formatDate(activeSlot.slot_date)}\nשעה: ${formatTime(activeSlot.slot_time)}\n${activeSlot.price ? `מחיר: ${activeSlot.price} ₪` : ""}\n\nאעדכן אותך כשיתפנה תור חדש.`);
  }

  function buildWaitlistLink(entry: WaitlistEntry, s?: Slot | null) {
    const phone = normalizePhone(entry.client_phone);
    if (!phone) return "";
    const activeSlot = s || slot;
    const msg = activeSlot
      ? `היי ${entry.client_name},\n\nהתפנה תור שאולי יכול להתאים לך:\n\n${activeSlot.service_name}\nתאריך: ${formatDate(activeSlot.slot_date)}\nשעה: ${formatTime(activeSlot.slot_time)}\n${activeSlot.price ? `מחיר: ${activeSlot.price} ₪\n` : ""}\nאם זה מתאים לך, אפשר להשאיר בקשה כאן:\n${window.location.origin}/?slot=${activeSlot.id}&view=client`
      : `היי ${entry.client_name},\n\nראיתי שנרשמת לרשימת ההמתנה.\nכשיתפנה תור מתאים אעדכן אותך.`;
    return waUrl(phone, msg);
  }

  /* ── claims render helper ── */
  function renderClaims(itemClaims: Claim[], itemSlot: Slot) {
    return itemClaims.map(c => {
      const approvalLink   = buildApprovalLink(c, itemSlot);
      const rejectionLink  = buildRejectionLink(c, itemSlot);
      const cancellationLink = buildCancellationLink(c, itemSlot);
      const canAct = c.status === "pending" && itemSlot.status !== "confirmed" && itemSlot.status !== "cancelled";

      return (
        <div className="req-box" key={c.id} style={{ marginTop: 10 }}>
          <div className="req-grid">
            <div><span>שם</span><strong>{c.client_name}</strong></div>
            <div><span>טלפון</span><strong>{c.client_phone}</strong></div>
            <div><span>סטטוס</span><strong>{statusLabel(c.status)}</strong></div>
          </div>
          <div className="action-row" style={{ marginTop: 10 }}>
            {canAct && (
              <button className="btn btn--success btn--small" onClick={() => approveClaim(c, itemSlot)}>סגרי איתה</button>
            )}
            {canAct && (
              <button className="btn btn--ghost btn--small" onClick={() => rejectClaim(c, itemSlot)}>דחי בקשה</button>
            )}
            {canAct && rejectionLink && (
              <a className="btn btn--ghost btn--small" href={rejectionLink} target="_blank" rel="noreferrer">הודעת דחייה</a>
            )}
            {c.status === "approved" && approvalLink && itemSlot.status !== "cancelled" && (
              <a className="btn btn--success btn--small" href={approvalLink} target="_blank" rel="noreferrer">הודעת אישור</a>
            )}
            {itemSlot.status === "cancelled" && cancellationLink && (
              <a className="btn btn--ghost btn--small" href={cancellationLink} target="_blank" rel="noreferrer">הודעת ביטול</a>
            )}
          </div>
        </div>
      );
    });
  }

  /* ══════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════ */

  if (loading || (session && accessStatus === "checking")) {
    return (
      <div className="page loading-wrap">
        <div style={{ textAlign: "center" }}>
          <div className="loader-dot" />
          <p style={{ color: "rgba(255,255,255,0.6)" }}>טוען...</p>
        </div>
      </div>
    );
  }

  /* ── Waitlist signup (public) ── */
  if (showWaitlistSignup) {
    return (
      <div className="page">
        <ToastList toasts={toasts} />
        {confirm && <ConfirmModal opts={confirm} onChoice={resolveConfirm} />}
        <div className="shell">
          <Logo />
          <div className="glass-card waitlist-layout">
            <div className="hero-copy">
              <div className="eyebrow">רשימת המתנה</div>
              <h1>רוצה לדעת כשמתפנה תור?</h1>
              <p className="hero-desc">
                השאירי פרטים, ובעלת העסק תוכל לעדכן אותך כשמתפנה תור שמתאים לך.
                ההצטרפות לא מאשרת תור אוטומטית.
              </p>
            </div>
            <div className="auth-panel">
              {waitlistSubmitted ? (
                <>
                  <span className="section-kicker">נשלח ✓</span>
                  <h3 style={{ color: "#fff", margin: "0 0 10px" }}>נכנסת לרשימת ההמתנה</h3>
                  <p style={{ color: "rgba(245,235,255,0.72)", lineHeight: 1.7 }}>
                    הפרטים נשמרו. כשיתפנה תור מתאים, בעלת העסק תוכל ליצור איתך קשר.
                  </p>
                </>
              ) : (
                <>
                  <span className="section-kicker">הצטרפות</span>
                  <h3 style={{ color: "#fff", margin: "0 0 16px" }}>הצטרפי לרשימת ההמתנה</h3>
                  <form className="form-grid" onSubmit={handleJoinWaitlist}>
                    <label className="field"><span>שם מלא</span><input name="clientName" placeholder="דנה כהן" required /></label>
                    <label className="field"><span>טלפון</span><input name="clientPhone" placeholder="0501234567" required /></label>
                    <label className="field field--full"><span>איזה טיפול מעניין אותך?</span><input name="serviceInterest" placeholder="טיפול פנים / לק ג׳ל / ריסים" /></label>
                    <label className="field"><span>ימים שנוחים</span><input name="preferredDays" placeholder="ראשון, שלישי, חמישי" /></label>
                    <label className="field"><span>שעות שנוחות</span><input name="preferredTimes" placeholder="בוקר / ערב / גמיש" /></label>
                    <label className="field field--full"><span>הערה</span><textarea name="note" placeholder="כל דבר שחשוב שבעלת העסק תדע" /></label>
                    <div className="field--full form-actions">
                      <button className="btn btn--primary btn--full" type="submit">הצטרפי לרשימת המתנה</button>
                    </div>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── Paywall ── */
  if (session && authMode !== "reset" && accessStatus === "denied") {
    const payMsg = encodeURIComponent(`היי, נרשמתי לתורפול ואני רוצה להצטרף למנוי הפיילוט.\n\nהאימייל שאיתו נרשמתי:\n${user?.email || ""}\n\nאשמח לקבל קישור תשלום בביט או פייבוקס.\n\nלאחר התשלום אשלח צילום אישור כדי שתוכלו לפתוח לי גישה.`);
    return (
      <div className="page">
        <ToastList toasts={toasts} />
        <div className="shell">
          <Logo />
          <div className="paywall-grid">
            <div className="glass-card hero-copy" style={{ padding: "34px" }}>
              <div className="eyebrow">גישה למנויות בלבד</div>
              <h1 style={{ fontSize: "clamp(2rem,4vw,3.5rem)", margin: "0 0 14px" }}>
                הגישה לתורפול פתוחה למנויות פעילות בלבד
              </h1>
              <p className="hero-desc">
                החשבון שלך נוצר בהצלחה, אבל עדיין לא הופעלה לך גישה למערכת.
                כדי להשתמש בתורפול צריך להצטרף למנוי הפיילוט.
              </p>
            </div>
            <div className="glass-card paywall-card">
              <span className="section-kicker">פיילוט</span>
              <h3 style={{ color: "#fff", margin: "0 0 16px" }}>מנוי לעסקים ראשונים</h3>
              <div className="price-box">
                <strong>49 ₪</strong>
                <span>לחודש בתקופת הפיילוט</span>
              </div>
              <p style={{ color: "rgba(245,235,255,0.72)", lineHeight: 1.7, margin: "0 0 18px" }}>
                לחצי על הכפתור, בקשי קישור תשלום בביט או פייבוקס, ולאחר אישור התשלום הגישה תיפתח לפי האימייל שאיתו נרשמת.
              </p>
              <div className="action-row">
                <a className="btn btn--primary" href={`https://wa.me/${PAYMENT_PHONE}?text=${payMsg}`} target="_blank" rel="noreferrer">
                  בקשת קישור תשלום ב-WhatsApp
                </a>
                <button className="btn btn--ghost" onClick={handleLogout}>התנתקות</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── Main app shell ── */
  return (
    <div className="page">
      <ToastList toasts={toasts} />
      {confirm && <ConfirmModal opts={confirm} onChoice={resolveConfirm} />}

      <div className="shell">

        {/* ── Topbar (dashboard only) ── */}
        {session && accessStatus === "allowed" && business && authMode !== "reset" && (
          <div className="dashboard-header">
            <Logo />
            <div className="top-tabs">
              <button className={`top-tab${isDashboard ? " active" : ""}`} onClick={resetToDashboard}>דשבורד</button>
              <button className={`top-tab${showCreateSlot ? " active" : ""}`} onClick={goToCreateSlot}>תור חדש</button>
              <button className={`top-tab${showHistory ? " active" : ""}`} onClick={loadHistory}>היסטוריה</button>
              <button className={`top-tab${showWaitlist ? " active" : ""}`} onClick={loadWaitlist}>רשימת המתנה</button>
              <button className={`top-tab${showEditBusiness ? " active" : ""}`} onClick={() => { resetToDashboard(); setShowEditBusiness(true); }}>הגדרות</button>
              <button className="top-tab" onClick={handleLogout}>התנתקות</button>
            </div>
          </div>
        )}

        {/* ── Password reset ── */}
        {authMode === "reset" && (
          <div className="glass-card hero-landing">
            <div className="hero-copy">
              <div className="eyebrow">איפוס סיסמה</div>
              <h1>הגדירי סיסמה חדשה לחשבון</h1>
              <p className="hero-desc">בחרי סיסמה חדשה. אחרי העדכון תועברי חזרה למסך ההתחברות.</p>
            </div>
            <div className="auth-panel">
              <span className="section-kicker">סיסמה חדשה</span>
              <h3 style={{ color: "#fff", margin: "0 0 16px" }}>עדכון סיסמה</h3>
              <form className="form-grid" onSubmit={handleUpdatePassword}>
                <label className="field field--full"><span>סיסמה חדשה</span><input name="password" type="password" placeholder="לפחות 6 תווים" required /></label>
                <label className="field field--full"><span>אימות סיסמה</span><input name="confirmPassword" type="password" placeholder="הקלידי שוב את הסיסמה" required /></label>
                <div className="field--full form-actions">
                  <button className="btn btn--primary btn--full" type="submit">עדכני סיסמה</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Landing page ── */}
        {isLanding && authMode !== "reset" && (
          <>
            <div className="glass-card hero-landing">
              <div className="hero-copy">
                <div className="eyebrow">פיילוט לעסקים ראשונים · 49 ₪</div>
                <h1>הופכים ביטולים של הרגע האחרון לתורים סגורים</h1>
                <p className="hero-desc">
                  תורפול מרכזת את כל הבקשות לתור שהתפנה במקום אחד, עוזרת לך לבחור למי לאשר, ושומרת לך היסטוריה של הכנסה שחזרה ליומן.
                </p>
                <div className="hero-pills">
                  <span className="pill">לינק אחד במקום בלגן בהודעות</span>
                  <span className="pill">כל הבקשות במקום אחד</span>
                  <span className="pill">רשימת המתנה מוכנה</span>
                  <span className="pill">תור אחד יכול להחזיר את כל המנוי</span>
                </div>
              </div>
              <div className="auth-panel">
                <div className="auth-switch">
                  <button className={`auth-tab${authMode === "login" ? " active" : ""}`} onClick={() => setAuthMode("login")}>כניסה</button>
                  <button className={`auth-tab${authMode === "register" ? " active" : ""}`} onClick={() => setAuthMode("register")}>הרשמה</button>
                </div>

                {(authMode === "login" || authMode === "register") && (
                  <>
                    <form className="form-grid" onSubmit={handleAuth}>
                      <label className="field field--full"><span>אימייל</span><input name="email" type="email" placeholder="you@example.com" required /></label>
                      <label className="field field--full"><span>סיסמה</span><input name="password" type="password" placeholder="לפחות 6 תווים" required /></label>
                      <div className="field--full form-actions">
                        <button className="btn btn--primary btn--full" type="submit">
                          {authMode === "login" ? "התחברי" : "צרי משתמש"}
                        </button>
                      </div>
                    </form>
                    {authMode === "login" && (
                      <button className="text-btn" onClick={() => setAuthMode("forgot")}>שכחת סיסמה?</button>
                    )}
                  </>
                )}

                {authMode === "forgot" && (
                  <>
                    <p style={{ color: "rgba(245,235,255,0.72)", lineHeight: 1.7, margin: "0 0 16px" }}>
                      הכניסי את האימייל שאיתו נרשמת, ונשלח לך קישור לאיפוס הסיסמה.
                    </p>
                    <form className="form-grid" onSubmit={handleForgotPassword}>
                      <label className="field field--full"><span>אימייל</span><input name="email" type="email" placeholder="you@example.com" required /></label>
                      <div className="field--full form-actions">
                        <button className="btn btn--primary" type="submit">שלחי קישור לאיפוס</button>
                        <button type="button" className="btn btn--ghost" onClick={() => setAuthMode("login")}>חזרה</button>
                      </div>
                    </form>
                  </>
                )}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "18px", marginTop: "22px" }}>
              {[
                { n: "01", t: "לינק אחד במקום בלגן", d: "מפרסמת תור שהתפנה ושולחת לינק מסודר לסטורי, WhatsApp או רשימת תפוצה." },
                { n: "02", t: "כל הבקשות במקום אחד", d: "במקום עשר הודעות פרטיות, את רואה את כל מי שרוצה את התור במסך אחד." },
                { n: "03", t: "רשימת המתנה מוכנה",   d: "לקוחות יכולות להירשם מראש, וכשמתפנה תור את לא מתחילה מאפס." },
              ].map(f => (
                <div key={f.n} className="glass-card" style={{ padding: "26px" }}>
                  <div style={{ width: 44, height: 44, borderRadius: 14, background: "linear-gradient(135deg,#ffd7e9,#bea5ff)", display: "grid", placeItems: "center", fontWeight: 900, color: "#1c0e20", marginBottom: 12 }}>{f.n}</div>
                  <h3 style={{ color: "#fff", margin: "0 0 8px" }}>{f.t}</h3>
                  <p style={{ color: "rgba(245,235,255,0.7)", lineHeight: 1.7, margin: 0 }}>{f.d}</p>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── Create business ── */}
        {session && accessStatus === "allowed" && !business && !slot && authMode !== "reset" && (
          <div className="glass-card" style={{ padding: "32px", maxWidth: 560 }}>
            <span className="section-kicker">הקמת עסק</span>
            <h3 style={{ color: "#fff", margin: "0 0 18px" }}>בואי ניצור את העסק שלך</h3>
            <form className="form-grid" onSubmit={handleCreateBusiness}>
              <label className="field"><span>שם העסק</span><input name="businessName" placeholder="קליניקת נועה" required /></label>
              <label className="field"><span>טלפון WhatsApp</span><input name="phone" placeholder="0501234567" required /></label>
              <label className="field field--full"><span>אימייל לקבלת התראות</span><input name="email" type="email" placeholder="you@example.com" defaultValue={user?.email || ""} required /></label>
              <div className="field--full form-actions">
                <button className="btn btn--primary" type="submit">צרי עסק</button>
              </div>
            </form>
          </div>
        )}

        {/* ── Dashboard ── */}
        {isDashboard && business && authMode !== "reset" && (
          <>
            <div className="glass-card hero-dashboard">
              <div className="hero-copy">
                <div className="eyebrow">דשבורד · {business.business_name}</div>
                <h1 style={{ fontSize: "clamp(1.8rem,3.5vw,3rem)", margin: "0 0 12px" }}>
                  כל תור שמתפנה יכול להפוך להכנסה שחוזרת ליומן
                </h1>
                <p className="hero-desc">
                  צרי תור שהתפנה, שלחי לינק ללקוחות, קבלי בקשות מסודרות וסגרי מול הלקוחה הנכונה — בלי בלגן.
                </p>
              </div>
              <div className="stats-side">
                <div className="stat-card"><strong>{approvedCount}</strong><span>תורים שנסגרו</span></div>
                <div className="stat-card"><strong>{approvedValue} ₪</strong><span>הכנסה שחזרה</span></div>
                <div className="stat-card"><strong>{pendingCount}</strong><span>בקשות ממתינות</span></div>
                <div className="stat-card"><strong>{activeWaitlistCount}</strong><span>ברשימת המתנה</span></div>
                <div className="stat-card"><strong>{cancelledCount}</strong><span>תורים שבוטלו</span></div>
              </div>
            </div>

            <div className="dash-grid">
              <div className="glass-card panel">
                <span className="panel-kicker">פעולות מהירות</span>
                <h3>ניהול</h3>
                <p>פרסמי תור שהתפנה, עייני בהיסטוריה, או נהלי את רשימת ההמתנה.</p>
                <div className="action-row">
                  <button className="btn btn--primary" onClick={goToCreateSlot}>התפנה לי תור</button>
                  <button className="btn btn--ghost" onClick={loadWaitlist}>רשימת המתנה</button>
                  <button className="btn btn--ghost" onClick={loadHistory}>היסטוריה</button>
                </div>
              </div>
              <div className="glass-card panel">
                <span className="panel-kicker">רשימת המתנה</span>
                <h3>ביקוש מוכן לפני שהתור מתפנה</h3>
                <p>שלחי ללקוחות לינק קבוע לרשימת המתנה. כשיתפנה תור, כבר תהיה לך רשימה.</p>
                <div className="action-row">
                  <button className="btn btn--ghost" onClick={copyWaitlistLink}>העתיקי לינק</button>
                  <button className="btn btn--success" onClick={copyWaitlistMsg}>הודעת WhatsApp</button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── Edit business ── */}
        {showEditBusiness && business && authMode !== "reset" && (
          <div className="glass-card" style={{ padding: "32px", maxWidth: 560 }}>
            <span className="section-kicker">הגדרות העסק</span>
            <h3 style={{ color: "#fff", margin: "0 0 18px" }}>עריכת פרטי העסק</h3>
            <form className="form-grid" onSubmit={handleUpdateBusiness}>
              <label className="field"><span>שם העסק</span><input name="businessName" defaultValue={business.business_name} required /></label>
              <label className="field"><span>טלפון WhatsApp</span><input name="phone" defaultValue={business.phone || ""} required /></label>
              <label className="field field--full"><span>אימייל לקבלת התראות</span><input name="email" type="email" defaultValue={business.email || user?.email || ""} required /></label>
              <div className="field--full form-actions">
                <button className="btn btn--primary" type="submit">שמרי שינויים</button>
                <button type="button" className="btn btn--ghost" onClick={resetToDashboard}>חזרה</button>
              </div>
            </form>
          </div>
        )}

        {/* ── Create slot ── */}
        {showCreateSlot && business && authMode !== "reset" && (
          <div className="glass-card" style={{ padding: "32px", maxWidth: 600 }}>
            <span className="section-kicker">תור חדש</span>
            <h3 style={{ color: "#fff", margin: "0 0 18px" }}>יצירת תור שהתפנה</h3>
            <form className="form-grid" onSubmit={handleCreateSlot}>
              <label className="field"><span>טיפול</span><input name="serviceName" placeholder="טיפול פנים" required /></label>
              <label className="field"><span>מחיר (₪)</span><input name="price" type="number" placeholder="350" /></label>
              <label className="field"><span>תאריך</span><input name="date" type="date" required /></label>
              <label className="field"><span>שעה</span><input name="time" type="time" required /></label>
              <label className="field field--full"><span>הערה</span><textarea name="note" placeholder="מתאים ללקוחות חדשות וקיימות" /></label>
              <div className="field--full form-actions">
                <button className="btn btn--primary" type="submit">צרי תור</button>
                <button type="button" className="btn btn--ghost" onClick={resetToDashboard}>חזרה</button>
              </div>
            </form>
          </div>
        )}

        {/* ── Client view ── */}
        {slot && showClientPage && authMode !== "reset" && (
          <>
            <div className="glass-card public-layout">
              <div className="public-summary">
                <span className="section-kicker">בקשת תור</span>
                <h2>התפנה תור אצל {slot.business_name}</h2>
                <p style={{ color: "rgba(245,235,255,0.72)", lineHeight: 1.7 }}>
                  השארת פרטים לא מאשרת את התור אוטומטית. בעלת העסק תחזור אלייך לאישור סופי.
                </p>
                <div className="public-meta">
                  <div className="meta-item"><span>טיפול</span><strong>{slot.service_name}</strong></div>
                  <div className="meta-item"><span>תאריך</span><strong>{formatDate(slot.slot_date)}</strong></div>
                  <div className="meta-item"><span>שעה</span><strong>{formatTime(slot.slot_time)}</strong></div>
                  {slot.price && <div className="meta-item"><span>מחיר</span><strong>{slot.price} ₪</strong></div>}
                </div>
              </div>
              <div className="public-form-card">
                {clientSubmitted ? (
                  <>
                    <span className="section-kicker">נשלח ✓</span>
                    <h3>הבקשה נשלחה</h3>
                    <p style={{ color: "rgba(245,235,255,0.72)", lineHeight: 1.7, margin: "8px 0 18px" }}>
                      בעלת העסק קיבלה את הפרטים במערכת. כדי לוודא שהיא תראה את זה מיד, שלחי לה גם WhatsApp.
                    </p>
                    {buildClientToBusinessLink() && (
                      <a className="btn btn--success btn--full" href={buildClientToBusinessLink()} target="_blank" rel="noreferrer">
                        שלחי WhatsApp לבעלת העסק
                      </a>
                    )}
                  </>
                ) : slot.status === "cancelled" ? (
                  <>
                    <h3 style={{ color: "#ffb0c4" }}>התור בוטל</h3>
                    <p style={{ color: "rgba(245,235,255,0.72)", lineHeight: 1.7 }}>התור הזה כבר לא זמין.</p>
                  </>
                ) : slot.status === "confirmed" ? (
                  <>
                    <h3 style={{ color: "#9ef0bf" }}>התור כבר נסגר</h3>
                    <p style={{ color: "rgba(245,235,255,0.72)", lineHeight: 1.7 }}>בעלת העסק כבר סגרה את התור עם לקוחה.</p>
                  </>
                ) : (
                  <>
                    <span className="section-kicker">השארת פרטים</span>
                    <h3 style={{ margin: "0 0 6px" }}>בקשי את התור</h3>
                    <p style={{ color: "rgba(245,235,255,0.72)", lineHeight: 1.7, margin: "0 0 16px", fontSize: "0.92rem" }}>
                      יכול להיות שגם לקוחות נוספות יבקשו את התור. בעלת העסק תבחר למי לאשר.
                    </p>
                    <form className="form-grid" onSubmit={handleClaimSlot}>
                      <label className="field"><span>שם מלא</span><input name="clientName" placeholder="דנה כהן" required /></label>
                      <label className="field"><span>טלפון</span><input name="clientPhone" placeholder="0501234567" required /></label>
                      <div className="field--full form-actions">
                        <button className="btn btn--primary btn--full" type="submit">שלחי בקשה לתור</button>
                      </div>
                    </form>
                  </>
                )}
              </div>
            </div>
          </>
        )}

        {/* ── Owner slot view ── */}
        {slot && !showClientPage && !showHistory && isOwner && authMode !== "reset" && (
          <div className="glass-card" style={{ padding: "28px" }}>
            <div className="item-head">
              <div>
                <span className="section-kicker">ניהול תור</span>
                <h3 style={{ color: "#fff", margin: "4px 0 6px" }}>{slot.service_name}</h3>
                <p className="meta-line">{formatDate(slot.slot_date)} · {formatTime(slot.slot_time)}{slot.price ? ` · ${slot.price} ₪` : ""}</p>
              </div>
              <span className={statusChip(slot.status)}>{statusLabel(slot.status)}</span>
            </div>

            {showEditSlot ? (
              <form className="form-grid" onSubmit={handleUpdateSlot}>
                <label className="field"><span>טיפול</span><input name="serviceName" defaultValue={slot.service_name} required /></label>
                <label className="field"><span>מחיר (₪)</span><input name="price" type="number" defaultValue={slot.price || ""} /></label>
                <label className="field"><span>תאריך</span><input name="date" type="date" defaultValue={slot.slot_date} required /></label>
                <label className="field"><span>שעה</span><input name="time" type="time" defaultValue={slot.slot_time} required /></label>
                <label className="field field--full"><span>הערה</span><textarea name="note" defaultValue={slot.note || ""} /></label>
                <div className="field--full form-actions">
                  <button className="btn btn--primary" type="submit">שמרי שינויים</button>
                  <button type="button" className="btn btn--ghost" onClick={() => setShowEditSlot(false)}>ביטול</button>
                </div>
              </form>
            ) : (
              <>
                {slot.note && (
                  <div className="req-box" style={{ marginBottom: 16 }}>
                    <div className="req-title">הערה</div>
                    <p style={{ color: "rgba(245,235,255,0.8)", margin: 0 }}>{slot.note}</p>
                  </div>
                )}

                <div className="link-box">
                  <span>לינק ללקוחה</span>
                  <div className="link-row">
                    <input value={clientLink} readOnly />
                    <button className="btn btn--ghost btn--small" onClick={() => copyClientLink()}>העתקי</button>
                  </div>
                </div>

                <div style={{ marginTop: 16 }}>
                  <div className="req-title" style={{ color: "rgba(245,235,255,0.8)", marginBottom: 8 }}>
                    בקשות לתור {claims.length > 0 ? `(${claims.length})` : ""}
                  </div>
                  {claims.length === 0 ? (
                    <div className="empty-state">
                      <p style={{ margin: 0 }}>אין עדיין בקשות. שלחי את הלינק ללקוחות.</p>
                    </div>
                  ) : renderClaims(claims, slot)}
                </div>

                <div className="action-row" style={{ marginTop: 18 }}>
                  <button className="btn btn--success btn--small" onClick={() => copyWhatsappMessage()}>הודעת WhatsApp</button>
                  <button className="btn btn--ghost btn--small" onClick={loadWaitlist}>רשימת המתנה</button>
                  {slot.status !== "confirmed" && slot.status !== "cancelled" && (
                    <button className="btn btn--ghost btn--small" onClick={() => setShowEditSlot(true)}>ערכי תור</button>
                  )}
                  {slot.status === "cancelled" && (
                    <button className="btn btn--ghost btn--small" onClick={() => reopenSlot()}>פתחי מחדש</button>
                  )}
                  {slot.status !== "cancelled" && slot.status !== "confirmed" && (
                    <button className="btn btn--warning btn--small" onClick={() => cancelSlot()}>בטלי תור</button>
                  )}
                  <button className="btn btn--danger btn--small" onClick={() => deleteSlot()}>מחיקה</button>
                  <button className="btn btn--ghost btn--small" onClick={resetToDashboard}>חזרה לדשבורד</button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Waitlist view ── */}
        {showWaitlist && business && authMode !== "reset" && (
          <div className="section-block">
            <div className="section-head">
              <div>
                <span className="section-kicker">רשימת המתנה</span>
                <h2>לקוחות שמחכות לתור שהתפנה</h2>
              </div>
            </div>

            <div className="glass-card panel" style={{ marginBottom: 18 }}>
              <span className="panel-kicker">הפצה</span>
              <h3>לינק קבוע להצטרפות</h3>
              <p>שלחי את הלינק הזה ללקוחות. הן יירשמו מראש, וכשיתפנה תור תוכלי לפנות אליהן מהר.</p>
              <div className="link-box" style={{ marginBottom: 14 }}>
                <span>לינק רשימת המתנה</span>
                <div className="link-row">
                  <input value={waitlistLink} readOnly />
                  <button className="btn btn--ghost btn--small" onClick={copyWaitlistLink}>העתקי</button>
                </div>
              </div>
              <div className="action-row">
                <button className="btn btn--success btn--small" onClick={copyWaitlistMsg}>הודעת WhatsApp</button>
                <button className="btn btn--primary btn--small" onClick={goToCreateSlot}>התפנה לי תור</button>
                <button className="btn btn--ghost btn--small" onClick={resetToDashboard}>חזרה לדשבורד</button>
              </div>
            </div>

            {waitlistEntries.length === 0 ? (
              <div className="empty-state">
                <h3>אין עדיין לקוחות ברשימת ההמתנה</h3>
                <p>העתיקי את ההודעה ושלחי ללקוחות. מי שתשאיר פרטים תופיע כאן.</p>
              </div>
            ) : (
              <div className="stack-list">
                {waitlistEntries.map(entry => {
                  const wLink = buildWaitlistLink(entry, slot);
                  return (
                    <div className="item-card" key={entry.id}>
                      <div className="item-head">
                        <div>
                          <h4>{entry.client_name}</h4>
                          <p className="meta-line">{entry.client_phone}</p>
                        </div>
                        <span className={statusChip(entry.status)}>{statusLabel(entry.status)}</span>
                      </div>
                      <div className="req-box">
                        <div className="req-title">העדפות</div>
                        <div className="req-grid">
                          <div><span>טיפול</span><strong>{entry.service_interest || "לא צוין"}</strong></div>
                          <div><span>ימים</span><strong>{entry.preferred_days || "לא צוין"}</strong></div>
                          <div><span>שעות</span><strong>{entry.preferred_times || "לא צוין"}</strong></div>
                        </div>
                        {entry.note && <p style={{ color: "rgba(245,235,255,0.7)", margin: "10px 0 0", fontSize: "0.92rem" }}>{entry.note}</p>}
                      </div>
                      <div className="action-row" style={{ marginTop: 12 }}>
                        {wLink && (
                          <a className="btn btn--success btn--small" href={wLink} target="_blank" rel="noreferrer" onClick={() => updateWaitlistStatus(entry, "contacted")}>
                            שלחי WhatsApp
                          </a>
                        )}
                        {entry.status !== "booked" && <button className="btn btn--ghost btn--small" onClick={() => updateWaitlistStatus(entry, "booked")}>סומן כנסגר</button>}
                        {entry.status !== "inactive" && <button className="btn btn--warning btn--small" onClick={() => updateWaitlistStatus(entry, "inactive")}>לא פעילה</button>}
                        {entry.status !== "active" && <button className="btn btn--ghost btn--small" onClick={() => updateWaitlistStatus(entry, "active")}>החזרה לפעילה</button>}
                        <button className="btn btn--danger btn--small" onClick={() => deleteWaitlistEntry(entry)}>מחיקה</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── History view ── */}
        {showHistory && business && authMode !== "reset" && (
          <div className="section-block">
            <div className="section-head">
              <div>
                <span className="section-kicker">היסטוריה</span>
                <h2>כל התורים שהתפנו</h2>
              </div>
            </div>

            {history.length === 0 ? (
              <div className="empty-state">
                <h3>אין עדיין תורים</h3>
                <p>כשתיצור תור ראשון, הוא יופיע כאן.</p>
              </div>
            ) : (
              <div className="stack-list">
                {history.map(item => {
                  const itemClaims = sortByCreated(item.claims || []);
                  return (
                    <div className="item-card" key={item.id}>
                      <div className="item-head">
                        <div>
                          <h4>{item.service_name}</h4>
                          <p className="meta-line">{formatDate(item.slot_date)} · {formatTime(item.slot_time)}{item.price ? ` · ${item.price} ₪` : ""}</p>
                        </div>
                        <span className={statusChip(item.status)}>{statusLabel(item.status)}</span>
                      </div>

                      {itemClaims.length > 0 ? (
                        <div className="req-box">
                          <div className="req-title">בקשות ({itemClaims.length})</div>
                          {renderClaims(itemClaims, item)}
                        </div>
                      ) : (
                        <p className="meta-line">אין בקשות לתור זה.</p>
                      )}

                      <div className="action-row" style={{ marginTop: 14 }}>
                        <button className="btn btn--ghost btn--small" onClick={() => openSlotFromHistory(item)}>פתחי תור</button>
                        <button className="btn btn--ghost btn--small" onClick={() => copyClientLink(item)}>העתיקי לינק</button>
                        <button className="btn btn--success btn--small" onClick={() => copyWhatsappMessage(item)}>הודעת WhatsApp</button>
                        {item.status === "cancelled" && (
                          <button className="btn btn--ghost btn--small" onClick={() => reopenSlot(item)}>פתחי מחדש</button>
                        )}
                        {item.status !== "cancelled" && item.status !== "confirmed" && (
                          <button className="btn btn--warning btn--small" onClick={() => cancelSlot(item)}>בטלי תור</button>
                        )}
                        <button className="btn btn--danger btn--small" onClick={() => deleteSlot(item)}>מחיקה מלאה</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="action-row" style={{ marginTop: 18 }}>
              <button className="btn btn--primary" onClick={goToCreateSlot}>התפנה לי תור</button>
              <button className="btn btn--ghost" onClick={resetToDashboard}>חזרה לדשבורד</button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}