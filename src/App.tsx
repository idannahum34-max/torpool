import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "./lib/supabase";
import type { Session, User } from "@supabase/supabase-js";

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

type HistoryItem = Slot & {
  claims: Claim[];
};

function normalizePhoneForWhatsapp(phone: string | null | undefined) {
  if (!phone) return "";

  const digits = phone.replace(/\D/g, "");

  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0")) return `972${digits.slice(1)}`;

  return digits;
}

function formatDate(date: string) {
  if (!date) return "";

  try {
    return new Date(date).toLocaleDateString("he-IL", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return date;
  }
}

function formatTime(time: string) {
  if (!time) return "";
  return time.slice(0, 5);
}

const emoji = {
  heart: String.fromCodePoint(0x1f90d),
  mail: String.fromCodePoint(0x1f48c),
  check: String.fromCodePoint(0x2705),
  calendar: String.fromCodePoint(0x1f4c5),
  clock: String.fromCodePoint(0x1f550),
  money: String.fromCodePoint(0x1f4b0),
  sparkle: String.fromCodePoint(0x2728),
  pray: String.fromCodePoint(0x1f64f),
};

function LogoMark() {
  return (
    <div className="logo-mark" aria-label="TorPool logo">
      <span>✓</span>
    </div>
  );
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);

  const [authMode, setAuthMode] = useState<
    "login" | "register" | "forgot" | "reset"
  >("login");

  const [slot, setSlot] = useState<Slot | null>(null);
  const [claim, setClaim] = useState<Claim | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [showClientPage, setShowClientPage] = useState(false);
  const [showCreateSlot, setShowCreateSlot] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showEditBusiness, setShowEditBusiness] = useState(false);
  const [showEditSlot, setShowEditSlot] = useState(false);
  const [clientSubmitted, setClientSubmitted] = useState(false);

  const [approvedCount, setApprovedCount] = useState(0);
  const [approvedValue, setApprovedValue] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [cancelledCount, setCancelledCount] = useState(0);

  const isOwnerView = Boolean(
    session && business && slot && slot.business_id === business.id
  );

  const isLandingPage = !session && !slot;

  const isDashboardPage =
    Boolean(session) &&
    Boolean(business) &&
    !slot &&
    !showClientPage &&
    !showCreateSlot &&
    !showHistory &&
    !showEditBusiness;

  const clientLink = slot
    ? `${window.location.origin}/?slot=${slot.id}&view=client`
    : "";

  useEffect(() => {
    startApp();

    const { data } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);

      if (event === "PASSWORD_RECOVERY") {
        setAuthMode("reset");
        setLoading(false);
        return;
      }

      if (newSession?.user) {
        loadBusiness(newSession.user.id);
      } else {
        setBusiness(null);
        setApprovedCount(0);
        setApprovedValue(0);
        setPendingCount(0);
        setCancelledCount(0);
      }
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  async function startApp() {
    setLoading(true);

    const params = new URLSearchParams(window.location.search);
    const slotId = params.get("slot");

    if (window.location.hash.includes("type=recovery")) {
      setAuthMode("reset");
    }

    const { data } = await supabase.auth.getSession();

    setSession(data.session);
    setUser(data.session?.user ?? null);

    if (data.session?.user && !window.location.hash.includes("type=recovery")) {
      await loadBusiness(data.session.user.id);
    }

    if (slotId) {
      await loadSlotFromUrl();
    }

    setLoading(false);
  }

  async function loadBusiness(userId: string) {
    const { data, error } = await supabase
      .from("businesses")
      .select("*")
      .eq("owner_id", userId)
      .maybeSingle();

    if (error) {
      console.error(error);
      alert("לא הצלחתי לטעון את העסק");
      return;
    }

    setBusiness(data);

    if (data) {
      await loadDashboardStats(data.id);
    }
  }

  async function loadDashboardStats(businessId: string) {
    const { data, error } = await supabase
      .from("slots")
      .select("*")
      .eq("business_id", businessId);

    if (error) {
      console.error(error);
      return;
    }

    const slots = data || [];

    const confirmed = slots.filter((item) => item.status === "confirmed");
    const pending = slots.filter((item) => item.status === "claimed");
    const cancelled = slots.filter((item) => item.status === "cancelled");

    const value = confirmed.reduce((sum, item) => {
      const price = Number(item.price || 0);
      return sum + (Number.isNaN(price) ? 0 : price);
    }, 0);

    setApprovedCount(confirmed.length);
    setApprovedValue(value);
    setPendingCount(pending.length);
    setCancelledCount(cancelled.length);
  }

  async function loadSlotFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const slotId = params.get("slot");
    const view = params.get("view");

    if (!slotId) return;

    const { data: slotData, error: slotError } = await supabase
      .from("slots")
      .select("*")
      .eq("id", slotId)
      .single();

    if (slotError) {
      console.error(slotError);
      alert("לא הצלחתי לטעון את התור");
      return;
    }

    setSlot(slotData);

    const { data: claimsData, error: claimsError } = await supabase
      .from("claims")
      .select("*")
      .eq("slot_id", slotId)
      .order("created_at", { ascending: false });

    if (claimsError) {
      console.error(claimsError);
    }

    setClaim(claimsData && claimsData.length > 0 ? claimsData[0] : null);
    setShowClientPage(view === "client");
  }

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "");
    const password = String(form.get("password") || "");

    if (authMode === "register") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        alert(error.message);
        setLoading(false);
        return;
      }

      if (!data.session) {
        alert("נרשמת. אם מופעל אימות מייל ב-Supabase, צריך לאשר דרך המייל.");
      }

      setSession(data.session);
      setUser(data.user);
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        alert(error.message);
        setLoading(false);
        return;
      }

      setSession(data.session);
      setUser(data.user);
    }

    setLoading(false);
  }

  async function handleForgotPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "");

    if (!email) {
      alert("צריך להזין אימייל");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });

    if (error) {
      console.error(error);
      alert("לא הצלחתי לשלוח קישור איפוס. בדקי שהאימייל נכון.");
      setLoading(false);
      return;
    }

    alert("שלחנו לך קישור לאיפוס סיסמה במייל");
    setAuthMode("login");
    setLoading(false);
  }

  async function handleUpdatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    const confirmPassword = String(form.get("confirmPassword") || "");

    if (password.length < 6) {
      alert("הסיסמה חייבת להיות לפחות 6 תווים");
      return;
    }

    if (password !== confirmPassword) {
      alert("הסיסמאות לא תואמות");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({
      password,
    });

    if (error) {
      console.error(error);
      alert("לא הצלחתי לעדכן סיסמה. נסי לפתוח שוב את הקישור מהמייל.");
      setLoading(false);
      return;
    }

    alert("הסיסמה עודכנה בהצלחה. אפשר להתחבר עכשיו.");

    await supabase.auth.signOut();

    setSession(null);
    setUser(null);
    setBusiness(null);
    setAuthMode("login");

    window.history.pushState({}, "", "/");

    setLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();

    setSession(null);
    setUser(null);
    setBusiness(null);
    setSlot(null);
    setClaim(null);
    setHistory([]);

    setShowClientPage(false);
    setShowCreateSlot(false);
    setShowHistory(false);
    setShowEditBusiness(false);
    setShowEditSlot(false);
    setClientSubmitted(false);

    window.history.pushState({}, "", "/");
  }

  async function handleCreateBusiness(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!user) return;

    setLoading(true);

    const form = new FormData(event.currentTarget);

    const newBusiness = {
      owner_id: user.id,
      business_name: String(form.get("businessName") || ""),
      phone: String(form.get("phone") || ""),
      email: String(form.get("email") || ""),
    };

    const { data, error } = await supabase
      .from("businesses")
      .insert(newBusiness)
      .select()
      .single();

    if (error) {
      console.error(error);
      alert("שגיאה ביצירת העסק");
      setLoading(false);
      return;
    }

    setBusiness(data);
    await loadDashboardStats(data.id);
    setLoading(false);
  }

  async function handleUpdateBusiness(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!business) return;

    setLoading(true);

    const form = new FormData(event.currentTarget);

    const updatedBusiness = {
      business_name: String(form.get("businessName") || ""),
      phone: String(form.get("phone") || ""),
      email: String(form.get("email") || ""),
    };

    const { data, error } = await supabase
      .from("businesses")
      .update(updatedBusiness)
      .eq("id", business.id)
      .select()
      .single();

    if (error) {
      console.error(error);
      alert("שגיאה בעדכון פרטי העסק");
      setLoading(false);
      return;
    }

    await supabase
      .from("slots")
      .update({
        business_name: updatedBusiness.business_name,
        business_phone: updatedBusiness.phone,
      })
      .eq("business_id", business.id);

    setBusiness(data);
    setShowEditBusiness(false);
    await loadDashboardStats(business.id);
    setLoading(false);
  }

  async function handleCreateSlot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!business) {
      alert("צריך ליצור עסק לפני יצירת תור");
      return;
    }

    if (!business.phone) {
      alert("חסר טלפון WhatsApp לעסק. עדכני את פרטי העסק.");
      return;
    }

    setLoading(true);

    const form = new FormData(event.currentTarget);

    const newSlot = {
      business_id: business.id,
      business_name: business.business_name,
      business_phone: business.phone,
      service_name: String(form.get("serviceName") || ""),
      slot_date: String(form.get("date") || ""),
      slot_time: String(form.get("time") || ""),
      price: String(form.get("price") || ""),
      note: String(form.get("note") || ""),
      status: "open",
    };

    const { data, error } = await supabase
      .from("slots")
      .insert(newSlot)
      .select()
      .single();

    if (error) {
      console.error(error);
      alert("שגיאה ביצירת התור");
      setLoading(false);
      return;
    }

    setSlot(data);
    setClaim(null);
    setClientSubmitted(false);

    setShowCreateSlot(false);
    setShowHistory(false);
    setShowClientPage(false);
    setShowEditSlot(false);

    window.history.pushState({}, "", `/?slot=${data.id}`);

    await loadDashboardStats(business.id);
    setLoading(false);
  }

  async function handleUpdateSlot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!slot || !business || slot.business_id !== business.id) {
      alert("אין לך הרשאה לערוך את התור הזה");
      return;
    }

    setLoading(true);

    const form = new FormData(event.currentTarget);

    const updatedSlot = {
      service_name: String(form.get("serviceName") || ""),
      slot_date: String(form.get("date") || ""),
      slot_time: String(form.get("time") || ""),
      price: String(form.get("price") || ""),
      note: String(form.get("note") || ""),
    };

    const { data, error } = await supabase
      .from("slots")
      .update(updatedSlot)
      .eq("id", slot.id)
      .select()
      .single();

    if (error) {
      console.error(error);
      alert("שגיאה בעדכון התור");
      setLoading(false);
      return;
    }

    setSlot(data);
    setShowEditSlot(false);

    await loadDashboardStats(business.id);
    setLoading(false);
  }

  async function sendClaimEmailNotification(
    slotId: string,
    clientName: string,
    clientPhone: string
  ) {
    const { data, error } = await supabase.functions.invoke("send-claim-email", {
      body: {
        slotId,
        clientName,
        clientPhone,
      },
    });

    if (error) {
      console.error("Email notification failed:", error);
      return;
    }

    console.log("Email notification result:", data);
  }

  async function handleClaimSlot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!slot) return;

    if (slot.status === "confirmed" || slot.status === "cancelled") {
      alert("התור כבר לא זמין");
      return;
    }

    if (slot.status !== "open") {
      alert("כבר נשלחה בקשה לתור הזה. בעלת העסק תבדוק ותחזור אלייך.");
      return;
    }

    setLoading(true);

    const form = new FormData(event.currentTarget);

    const clientName = String(form.get("clientName") || "").trim();
    const clientPhone = String(form.get("clientPhone") || "").trim();

    if (!clientName || !clientPhone) {
      alert("צריך למלא שם וטלפון");
      setLoading(false);
      return;
    }

    const newClaim = {
      slot_id: slot.id,
      client_name: clientName,
      client_phone: clientPhone,
      status: "pending",
    };

    const { error: claimError } = await supabase.from("claims").insert(newClaim);

    if (claimError) {
      console.error(claimError);
      alert("שגיאה בשליחת הבקשה. נסי שוב בעוד רגע.");
      setLoading(false);
      return;
    }

    await sendClaimEmailNotification(slot.id, clientName, clientPhone);

    const localClaim: Claim = {
      id: "local-client-claim",
      slot_id: slot.id,
      client_name: clientName,
      client_phone: clientPhone,
      status: "pending",
      created_at: new Date().toISOString(),
    };

    setClaim(localClaim);
    setSlot({
      ...slot,
      status: "claimed",
    });

    setClientSubmitted(true);
    setShowClientPage(true);

    window.history.pushState({}, "", `/?slot=${slot.id}&view=client`);

    setLoading(false);
  }

  async function loadHistory() {
    if (!business) return;

    setLoading(true);

    setShowHistory(true);
    setShowCreateSlot(false);
    setShowClientPage(false);
    setShowEditBusiness(false);
    setShowEditSlot(false);
    setSlot(null);
    setClaim(null);
    setClientSubmitted(false);

    const { data, error } = await supabase
      .from("slots")
      .select("*, claims(*)")
      .eq("business_id", business.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      alert("לא הצלחתי לטעון היסטוריה");
      setLoading(false);
      return;
    }

    setHistory((data || []) as HistoryItem[]);
    window.history.pushState({}, "", "/");

    setLoading(false);
  }

  async function approveClaim(claimToApprove?: Claim, slotToApprove?: Slot) {
    const activeClaim = claimToApprove || claim;
    const activeSlot = slotToApprove || slot;

    if (!business || !activeClaim || !activeSlot) return;

    if (activeSlot.business_id !== business.id) {
      alert("אין לך הרשאה לאשר את התור הזה");
      return;
    }

    if (activeSlot.status === "cancelled") {
      alert("אי אפשר לסגור תור שבוטל");
      return;
    }

    setLoading(true);

    const { error: claimError } = await supabase
      .from("claims")
      .update({ status: "approved" })
      .eq("id", activeClaim.id);

    if (claimError) {
      console.error(claimError);
      alert("שגיאה באישור הבקשה");
      setLoading(false);
      return;
    }

    const { error: slotError } = await supabase
      .from("slots")
      .update({ status: "confirmed" })
      .eq("id", activeSlot.id);

    if (slotError) {
      console.error(slotError);
      alert("שגיאה בסגירת התור");
      setLoading(false);
      return;
    }

    alert("התור נסגר בהצלחה");

    await loadDashboardStats(business.id);

    if (showHistory) {
      await loadHistory();
    } else {
      await loadSlotFromUrl();
    }

    setLoading(false);
  }

  async function rejectClaim(claimToReject?: Claim, slotToReject?: Slot) {
    const activeClaim = claimToReject || claim;
    const activeSlot = slotToReject || slot;

    if (!business || !activeClaim || !activeSlot) return;

    if (activeSlot.business_id !== business.id) {
      alert("אין לך הרשאה לדחות את הבקשה הזאת");
      return;
    }

    if (activeSlot.status === "confirmed") {
      alert("התור כבר נסגר. אם צריך, בטלי אותו או מחקי אותו.");
      return;
    }

    const confirmed = window.confirm(
      "לסמן את הלקוחה כדחויה ולפתוח את התור שוב?"
    );

    if (!confirmed) return;

    setLoading(true);

    const { error: claimError } = await supabase
      .from("claims")
      .update({ status: "rejected" })
      .eq("id", activeClaim.id);

    if (claimError) {
      console.error(claimError);
      alert("שגיאה בדחיית הבקשה");
      setLoading(false);
      return;
    }

    const { error: slotError } = await supabase
      .from("slots")
      .update({ status: "open" })
      .eq("id", activeSlot.id);

    if (slotError) {
      console.error(slotError);
      alert("שגיאה בפתיחת התור מחדש");
      setLoading(false);
      return;
    }

    alert("הלקוחה נדחתה והתור נפתח מחדש");

    await loadDashboardStats(business.id);

    if (showHistory) {
      await loadHistory();
    } else {
      await loadSlotFromUrl();
    }

    setLoading(false);
  }

  async function cancelSlot(slotToCancel?: Slot) {
    const activeSlot = slotToCancel || slot;

    if (!business || !activeSlot) return;

    if (activeSlot.business_id !== business.id) {
      alert("אין לך הרשאה לבטל את התור הזה");
      return;
    }

    const confirmed = window.confirm(
      "לבטל את התור? הוא יישאר בהיסטוריה, אבל לקוחות לא יוכלו לתפוס אותו."
    );

    if (!confirmed) return;

    setLoading(true);

    const { error } = await supabase
      .from("slots")
      .update({ status: "cancelled" })
      .eq("id", activeSlot.id);

    if (error) {
      console.error(error);
      alert("שגיאה בביטול התור");
      setLoading(false);
      return;
    }

    alert("התור בוטל");

    await loadDashboardStats(business.id);

    if (showHistory) {
      await loadHistory();
    } else {
      await loadSlotFromUrl();
    }

    setLoading(false);
  }

  async function deleteSlot(slotToDelete?: Slot) {
    const activeSlot = slotToDelete || slot;

    if (!business || !activeSlot) return;

    if (activeSlot.business_id !== business.id) {
      alert("אין לך הרשאה למחוק את התור הזה");
      return;
    }

    const confirmed = window.confirm(
      "למחוק את התור מהמערכת לגמרי? הפעולה תמחק גם את כל הבקשות ולא ניתן לשחזר."
    );

    if (!confirmed) return;

    setLoading(true);

    const { error: claimsError } = await supabase
      .from("claims")
      .delete()
      .eq("slot_id", activeSlot.id);

    if (claimsError) {
      console.error(claimsError);
      alert("שגיאה במחיקת הבקשות");
      setLoading(false);
      return;
    }

    const { error: slotError } = await supabase
      .from("slots")
      .delete()
      .eq("id", activeSlot.id);

    if (slotError) {
      console.error(slotError);
      alert("שגיאה במחיקת התור");
      setLoading(false);
      return;
    }

    alert("התור נמחק מהמערכת");

    setSlot(null);
    setClaim(null);
    setClientSubmitted(false);

    await loadDashboardStats(business.id);

    if (showHistory) {
      await loadHistory();
    } else {
      resetToDashboard();
    }

    setLoading(false);
  }

  function resetToDashboard() {
    setSlot(null);
    setClaim(null);
    setHistory([]);
    setShowClientPage(false);
    setShowCreateSlot(false);
    setShowHistory(false);
    setShowEditBusiness(false);
    setShowEditSlot(false);
    setClientSubmitted(false);

    window.history.pushState({}, "", "/");

    if (business) {
      loadDashboardStats(business.id);
    }
  }

  function goToCreateSlot() {
    setShowCreateSlot(true);
    setShowHistory(false);
    setShowClientPage(false);
    setShowEditBusiness(false);
    setShowEditSlot(false);
    setSlot(null);
    setClaim(null);
    setClientSubmitted(false);
    window.history.pushState({}, "", "/");
  }

  function openSlotFromHistory(historySlot: HistoryItem) {
    const latestClaim = historySlot.claims?.[0] || null;

    setSlot(historySlot);
    setClaim(latestClaim);
    setShowHistory(false);
    setShowCreateSlot(false);
    setShowEditBusiness(false);
    setShowEditSlot(false);
    setShowClientPage(false);
    setClientSubmitted(false);

    window.history.pushState({}, "", `/?slot=${historySlot.id}`);
  }

  function statusLabel(status: string) {
    if (status === "open") return "פתוח לפרסום";
    if (status === "claimed") return "ממתין לאישור";
    if (status === "confirmed") return "נסגר בהצלחה";
    if (status === "cancelled") return "בוטל";
    if (status === "approved") return "אושרה";
    if (status === "pending") return "ממתינה";
    if (status === "rejected") return "נדחתה";
    return status;
  }

  function statusClass(status: string) {
    if (status === "open") return "status-open";
    if (status === "claimed" || status === "pending") return "status-requested";
    if (status === "confirmed" || status === "approved") return "status-confirmed";
    if (status === "cancelled" || status === "rejected") return "status-cancelled";
    return "status-open";
  }

  function buildClientToBusinessWhatsappLink() {
    if (!slot || !claim) return "";

    const targetPhone = normalizePhoneForWhatsapp(slot.business_phone);
    if (!targetPhone) return "";

    const message = `היי, ראיתי שהתפנה תור דרך תורפול ${emoji.mail}

שם: ${claim.client_name}
טלפון: ${claim.client_phone}

אני רוצה את התור:
${slot.service_name}
${emoji.calendar} תאריך: ${formatDate(slot.slot_date)}
${emoji.clock} שעה: ${formatTime(slot.slot_time)}
${slot.price ? `${emoji.money} מחיר: ${slot.price} ₪` : ""}

השארתי פרטים באתר ומחכה לאישור ${emoji.pray}`;

    return `https://wa.me/${targetPhone}?text=${encodeURIComponent(message)}`;
  }

  function buildApprovalWhatsappLink(
    claimToSend?: Claim | null,
    slotToSend?: Slot | null
  ) {
    const activeClaim = claimToSend || claim;
    const activeSlot = slotToSend || slot;

    if (!activeClaim || !activeSlot) return "";

    const targetPhone = normalizePhoneForWhatsapp(activeClaim.client_phone);
    if (!targetPhone) return "";

    const message = `היי ${activeClaim.client_name} ${emoji.heart}

התור שלך אושר ${emoji.check}

פרטי התור:
${activeSlot.service_name}
${emoji.calendar} תאריך: ${formatDate(activeSlot.slot_date)}
${emoji.clock} שעה: ${formatTime(activeSlot.slot_time)}
${activeSlot.price ? `${emoji.money} מחיר: ${activeSlot.price} ₪` : ""}

נתראה ${emoji.sparkle}`;

    return `https://wa.me/${targetPhone}?text=${encodeURIComponent(message)}`;
  }

  function buildRejectionWhatsappLink(
    claimToSend?: Claim | null,
    slotToSend?: Slot | null
  ) {
    const activeClaim = claimToSend || claim;
    const activeSlot = slotToSend || slot;

    if (!activeClaim || !activeSlot) return "";

    const targetPhone = normalizePhoneForWhatsapp(activeClaim.client_phone);
    if (!targetPhone) return "";

    const message = `היי ${activeClaim.client_name} ${emoji.heart}

תודה שהשארת פרטים.
התור הזה כבר לא מתאים או נתפס, אבל אעדכן אותך כשיתפנה תור חדש ${emoji.pray}

פרטי התור:
${activeSlot.service_name}
${emoji.calendar} תאריך: ${formatDate(activeSlot.slot_date)}
${emoji.clock} שעה: ${formatTime(activeSlot.slot_time)}`;

    return `https://wa.me/${targetPhone}?text=${encodeURIComponent(message)}`;
  }

  function buildCancellationWhatsappLink(
    claimToSend?: Claim | null,
    slotToSend?: Slot | null
  ) {
    const activeClaim = claimToSend || claim;
    const activeSlot = slotToSend || slot;

    if (!activeClaim || !activeSlot) return "";

    const targetPhone = normalizePhoneForWhatsapp(activeClaim.client_phone);
    if (!targetPhone) return "";

    const message = `היי ${activeClaim.client_name} ${emoji.heart}

לצערי התור שהתבקשת אליו בוטל.

פרטי התור:
${activeSlot.service_name}
${emoji.calendar} תאריך: ${formatDate(activeSlot.slot_date)}
${emoji.clock} שעה: ${formatTime(activeSlot.slot_time)}
${activeSlot.price ? `${emoji.money} מחיר: ${activeSlot.price} ₪` : ""}

אעדכן אותך כשיתפנה תור חדש ${emoji.pray}`;

    return `https://wa.me/${targetPhone}?text=${encodeURIComponent(message)}`;
  }

  function copyClientLink(slotToCopy?: Slot) {
    const targetSlot = slotToCopy || slot;
    if (!targetSlot) return;

    const link = `${window.location.origin}/?slot=${targetSlot.id}&view=client`;
    navigator.clipboard.writeText(link);
    alert("הלינק הועתק");
  }

  function copyWhatsappMessage(slotToCopy?: Slot) {
    const targetSlot = slotToCopy || slot;
    if (!targetSlot) return;

    const link = `${window.location.origin}/?slot=${targetSlot.id}&view=client`;

    const message = `היי אהובות ${emoji.heart}

התפנה לי תור ל-${targetSlot.service_name}
${emoji.calendar} בתאריך ${formatDate(targetSlot.slot_date)}
${emoji.clock} בשעה ${formatTime(targetSlot.slot_time)}
${targetSlot.price ? `${emoji.money} מחיר: ${targetSlot.price} ₪` : ""}

מי שרוצה יכולה להשאיר פרטים כאן:
${link}

השארת פרטים לא מאשרת את התור אוטומטית.
אני אאשר מול הלקוחה המתאימה ${emoji.pray}`;

    navigator.clipboard.writeText(message);
    alert("הודעת WhatsApp הועתקה");
  }

  function screenLabel() {
    if (authMode === "reset") return "איפוס סיסמה";
    if (isLandingPage) return "מילוי תורים שהתפנו";
    if (showHistory) return "היסטוריית תורים";
    if (showEditBusiness) return "הגדרות העסק";
    if (showCreateSlot) return "יצירת תור";
    if (showEditSlot) return "עריכת תור";
    if (slot && showClientPage) return "בקשת תור";
    if (slot && isOwnerView) return "ניהול תור";
    if (isDashboardPage) return "דשבורד";
    return "TorPool";
  }

  const clientWhatsappLink = buildClientToBusinessWhatsappLink();
  const approvalWhatsappLink = buildApprovalWhatsappLink();
  const rejectionWhatsappLink = buildRejectionWhatsappLink();
  const cancellationWhatsappLink = buildCancellationWhatsappLink();

  if (loading) {
    return (
      <div className="app-shell" dir="rtl">
        <div className="page-frame">
          <section className="glass-card loading-card">
            <div className="loader-dot" />
            <h2>טוען...</h2>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell" dir="rtl">
      <div className="page-frame">
        <header className="topbar">
          <div className="brand-box">
            <LogoMark />
            <div className="brand-copy">
              <div className="eyebrow">{screenLabel()}</div>
              <h1 className="brand-title">תורפול</h1>
              <p className="brand-subtitle">תור מתבטל? תורפול ממלאה.</p>
            </div>
          </div>

          <div className="topbar-side">
            <span className="header-chip">מילוי תורים שהתפנו דרך WhatsApp</span>
            {session && authMode !== "reset" && (
              <p className="topbar-business">
                {business?.business_name
                  ? `מחוברת לעסק: ${business.business_name}`
                  : "מחוברת למערכת"}
              </p>
            )}
          </div>
        </header>

        {authMode === "reset" && (
          <section className="hero-card glass-card hero-grid">
            <div className="hero-copy">
              <span className="section-kicker">סיסמה חדשה</span>
              <h2>הגדירי סיסמה חדשה לחשבון</h2>
              <p>בחרי סיסמה חדשה. אחרי העדכון תועברי חזרה למסך ההתחברות.</p>
            </div>

            <div className="form-card glass-card accent-card">
              <div className="card-head">
                <span className="section-kicker">איפוס סיסמה</span>
                <h3>סיסמה חדשה</h3>
              </div>

              <form className="form-grid" onSubmit={handleUpdatePassword}>
                <label className="field field-full">
                  <span>סיסמה חדשה</span>
                  <input
                    name="password"
                    type="password"
                    placeholder="לפחות 6 תווים"
                    required
                  />
                </label>

                <label className="field field-full">
                  <span>אימות סיסמה</span>
                  <input
                    name="confirmPassword"
                    type="password"
                    placeholder="הקלידי שוב את הסיסמה"
                    required
                  />
                </label>

                <div className="field-full form-actions">
                  <button className="btn btn-primary" type="submit">
                    עדכני סיסמה
                  </button>
                </div>
              </form>
            </div>
          </section>
        )}

        {authMode !== "reset" && !session && !slot && (
          <>
            <section className="hero-card glass-card hero-grid">
              <div className="hero-copy">
                <span className="section-kicker">פיילוט לעסקים ראשונים · 49 ₪</span>
                <h2>ממלאים תורים שהתפנו בלי בלגן ובלי לרדוף אחרי לקוחות</h2>
                <p>
                  תורפול עוזרת לבעלות קליניקות, קוסמטיקאיות ובעלות עסקי יופי
                  להפוך ביטול של הרגע האחרון ללינק מסודר, בקשות מסודרות, וסגירה
                  מהירה מול הלקוחה הנכונה.
                </p>

                <div className="hero-bullets">
                  <div className="mini-pill">יוצרת תור בדקה</div>
                  <div className="mini-pill">שולחת לינק מוכן ללקוחות</div>
                  <div className="mini-pill">מקבלת בקשות מסודרות</div>
                  <div className="mini-pill">סוגרת רק עם מי שמתאימה</div>
                </div>
              </div>

              <div className="form-card glass-card accent-card">
                <div className="card-head">
                  <span className="section-kicker">
                    {authMode === "login" && "כניסה למערכת"}
                    {authMode === "register" && "פתיחת חשבון"}
                    {authMode === "forgot" && "איפוס סיסמה"}
                  </span>

                  <h3>
                    {authMode === "login" && "התחברי לדשבורד שלך"}
                    {authMode === "register" && "פתחי חשבון חדש"}
                    {authMode === "forgot" && "שכחת סיסמה?"}
                  </h3>
                </div>

                {(authMode === "login" || authMode === "register") && (
                  <>
                    <form className="form-grid" onSubmit={handleAuth}>
                      <label className="field field-full">
                        <span>אימייל</span>
                        <input
                          name="email"
                          type="email"
                          placeholder="you@example.com"
                          required
                        />
                      </label>

                      <label className="field field-full">
                        <span>סיסמה</span>
                        <input
                          name="password"
                          type="password"
                          placeholder="לפחות 6 תווים"
                          required
                        />
                      </label>

                      <div className="field-full form-actions">
                        <button className="btn btn-primary" type="submit">
                          {authMode === "login" ? "התחברי" : "צרי משתמש"}
                        </button>
                      </div>
                    </form>

                    <div className="auth-links">
                      <button
                        type="button"
                        className="text-button"
                        onClick={() =>
                          setAuthMode(authMode === "login" ? "register" : "login")
                        }
                      >
                        {authMode === "login"
                          ? "אין לך משתמש? הרשמי כאן"
                          : "כבר יש לך משתמש? התחברי"}
                      </button>

                      {authMode === "login" && (
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => setAuthMode("forgot")}
                        >
                          שכחת סיסמה?
                        </button>
                      )}
                    </div>
                  </>
                )}

                {authMode === "forgot" && (
                  <>
                    <p className="form-help">
                      הכניסי את האימייל שאיתו נרשמת, ונשלח לך קישור לאיפוס
                      הסיסמה.
                    </p>

                    <form className="form-grid" onSubmit={handleForgotPassword}>
                      <label className="field field-full">
                        <span>אימייל</span>
                        <input
                          name="email"
                          type="email"
                          placeholder="you@example.com"
                          required
                        />
                      </label>

                      <div className="field-full form-actions">
                        <button className="btn btn-primary" type="submit">
                          שלחי קישור לאיפוס
                        </button>

                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => setAuthMode("login")}
                        >
                          חזרה להתחברות
                        </button>
                      </div>
                    </form>
                  </>
                )}
              </div>
            </section>

            <section className="feature-grid">
              <article className="glass-card feature-card">
                <div className="feature-icon">01</div>
                <h3>יוצרת תור שהתפנה</h3>
                <p>ממלאת טיפול, תאריך, שעה ומחיר — ומקבלת לינק מוכן.</p>
              </article>

              <article className="glass-card feature-card">
                <div className="feature-icon">02</div>
                <h3>שולחת ב-WhatsApp</h3>
                <p>מעתיקה הודעה מסודרת לרשימת תפוצה או ללקוחות רלוונטיות.</p>
              </article>

              <article className="glass-card feature-card">
                <div className="feature-icon">03</div>
                <h3>סוגרת עם הלקוחה</h3>
                <p>מקבלת בקשות, בוחרת מי מתאימה, ושולחת אישור ישירות.</p>
              </article>
            </section>
          </>
        )}

        {session && !business && !slot && authMode !== "reset" && (
          <section className="form-card glass-card">
            <div className="card-head">
              <span className="section-kicker">הקמת עסק</span>
              <h3>בואי ניצור את העסק שלך</h3>
            </div>

            <form className="form-grid" onSubmit={handleCreateBusiness}>
              <label className="field">
                <span>שם העסק</span>
                <input
                  name="businessName"
                  placeholder="לדוגמה: קליניקת נועה"
                  required
                />
              </label>

              <label className="field">
                <span>טלפון WhatsApp של העסק</span>
                <input name="phone" placeholder="0501234567" required />
              </label>

              <label className="field field-full">
                <span>אימייל לקבלת התראות</span>
                <input
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  defaultValue={user?.email || ""}
                  required
                />
              </label>

              <div className="field-full form-actions">
                <button className="btn btn-primary" type="submit">
                  צרי עסק
                </button>
              </div>
            </form>
          </section>
        )}

        {slot && showClientPage && authMode !== "reset" && (
          <>
            <section className="client-hero glass-card">
              <div className="hero-copy">
                <span className="section-kicker">בקשת תור</span>
                <h2>התפנה תור אצל {slot.business_name}</h2>
                <p>
                  השארת פרטים לא מאשרת את התור אוטומטית. בעלת העסק תחזור אלייך
                  לאישור סופי.
                </p>
              </div>

              <div className="slot-preview">
                <div className="slot-preview-row">
                  <span>טיפול</span>
                  <strong>{slot.service_name}</strong>
                </div>

                <div className="slot-preview-row">
                  <span>תאריך</span>
                  <strong>{formatDate(slot.slot_date)}</strong>
                </div>

                <div className="slot-preview-row">
                  <span>שעה</span>
                  <strong>{formatTime(slot.slot_time)}</strong>
                </div>

                {slot.price && (
                  <div className="slot-preview-row">
                    <span>מחיר</span>
                    <strong>{slot.price} ₪</strong>
                  </div>
                )}

                {slot.note && (
                  <div className="slot-preview-note">
                    <span>הערה</span>
                    <p>{slot.note}</p>
                  </div>
                )}
              </div>
            </section>

            {clientSubmitted && (
              <section className="client-card glass-card success-card">
                <h3>הבקשה נשלחה</h3>
                <p>
                  עכשיו אפשר לשלוח הודעת WhatsApp לבעלת העסק כדי שהיא תקבל את
                  הבקשה מיד.
                </p>

                {clientWhatsappLink && (
                  <div className="action-row">
                    <a
                      className="btn btn-success"
                      href={clientWhatsappLink}
                      target="_blank"
                      rel="noreferrer"
                    >
                      שלחי WhatsApp לבעלת העסק
                    </a>
                  </div>
                )}
              </section>
            )}

            {!clientSubmitted && slot.status === "cancelled" && (
              <section className="client-card glass-card danger-card">
                <h3>התור בוטל</h3>
                <p>התור הזה כבר לא זמין.</p>
              </section>
            )}

            {!clientSubmitted && slot.status === "confirmed" && (
              <section className="client-card glass-card info-card">
                <h3>התור כבר נסגר</h3>
                <p>בעלת העסק כבר סגרה את התור עם לקוחה.</p>
              </section>
            )}

            {!clientSubmitted &&
              slot.status !== "cancelled" &&
              slot.status !== "confirmed" && (
                <section className="client-card glass-card">
                  <h3>השאירי פרטים כדי לבקש את התור</h3>

                  <form className="form-grid" onSubmit={handleClaimSlot}>
                    <label className="field">
                      <span>שם מלא</span>
                      <input
                        name="clientName"
                        placeholder="לדוגמה: דנה כהן"
                        required
                      />
                    </label>

                    <label className="field">
                      <span>טלפון</span>
                      <input name="clientPhone" placeholder="0501234567" required />
                    </label>

                    <div className="field-full form-actions">
                      <button className="btn btn-primary" type="submit">
                        שלחי בקשה לתור
                      </button>
                    </div>
                  </form>
                </section>
              )}
          </>
        )}

        {isDashboardPage && business && authMode !== "reset" && (
          <>
            <section className="hero-card glass-card hero-grid dashboard-hero">
              <div className="hero-copy">
                <span className="section-kicker">דשבורד</span>
                <h2>כל תור שמתפנה יכול להפוך להכנסה שחוזרת ליומן</h2>
                <p>
                  צרי תור שהתפנה, שלחי לינק ללקוחות, קבלי בקשות מסודרות וסגרי
                  מול הלקוחה הנכונה — בלי בלגן, בלי חיפוש, ובלי הודעות שמתפספסות.
                </p>

                <div className="hero-bullets">
                  <div className="mini-pill">נסגר = התור נתפס</div>
                  <div className="mini-pill">בוטל = התור לא זמין</div>
                  <div className="mini-pill">מחיקה = הסרה מלאה</div>
                </div>
              </div>

              <div className="stats-grid">
                <div className="stat-card">
                  <strong>{approvedCount}</strong>
                  <span>תורים שנסגרו</span>
                </div>

                <div className="stat-card">
                  <strong>{approvedValue} ₪</strong>
                  <span>הכנסה שחזרה</span>
                </div>

                <div className="stat-card">
                  <strong>{pendingCount}</strong>
                  <span>ממתינים לאישור</span>
                </div>

                <div className="stat-card">
                  <strong>{cancelledCount}</strong>
                  <span>תורים שבוטלו</span>
                </div>
              </div>
            </section>

            <section className="dashboard-grid">
              <div className="form-card glass-card">
                <div className="card-head">
                  <span className="section-kicker">פעולות</span>
                  <h3>ניהול מהיר</h3>
                </div>

                <div className="action-row">
                  <button className="btn btn-primary" onClick={goToCreateSlot}>
                    התפנה לי תור
                  </button>

                  <button className="btn btn-secondary" onClick={loadHistory}>
                    היסטוריית תורים
                  </button>

                  <button
                    className="btn btn-secondary"
                    onClick={() => setShowEditBusiness(true)}
                  >
                    עריכת העסק
                  </button>

                  <button className="btn btn-danger" onClick={handleLogout}>
                    התנתקות
                  </button>
                </div>
              </div>

              <div className="form-card glass-card">
                <div className="card-head">
                  <span className="section-kicker">איך זה עובד</span>
                  <h3>4 צעדים פשוטים</h3>
                </div>

                <div className="flow-list">
                  <div className="flow-item">
                    <span className="flow-number">1</span>
                    <div>
                      <strong>פותחת תור שהתפנה</strong>
                      <p>טיפול, תאריך, שעה, מחיר והערה אם צריך.</p>
                    </div>
                  </div>

                  <div className="flow-item">
                    <span className="flow-number">2</span>
                    <div>
                      <strong>שולחת לינק ללקוחות</strong>
                      <p>המערכת מכינה לך קישור מוכן להפצה.</p>
                    </div>
                  </div>

                  <div className="flow-item">
                    <span className="flow-number">3</span>
                    <div>
                      <strong>מקבלת בקשות</strong>
                      <p>כל הלקוחות נשמרות מסודר במקום אחד.</p>
                    </div>
                  </div>

                  <div className="flow-item">
                    <span className="flow-number">4</span>
                    <div>
                      <strong>סוגרת או מבטלת</strong>
                      <p>בחירה ברורה בין סגירה, ביטול או מחיקה מלאה.</p>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </>
        )}

        {showEditBusiness && business && authMode !== "reset" && (
          <section className="form-card glass-card">
            <div className="card-head">
              <span className="section-kicker">הגדרות העסק</span>
              <h3>עריכת פרטי העסק</h3>
            </div>

            <form className="form-grid" onSubmit={handleUpdateBusiness}>
              <label className="field">
                <span>שם העסק</span>
                <input
                  name="businessName"
                  defaultValue={business.business_name}
                  required
                />
              </label>

              <label className="field">
                <span>טלפון WhatsApp</span>
                <input name="phone" defaultValue={business.phone || ""} required />
              </label>

              <label className="field field-full">
                <span>אימייל לקבלת התראות</span>
                <input
                  name="email"
                  type="email"
                  defaultValue={business.email || user?.email || ""}
                  required
                />
              </label>

              <div className="field-full form-actions">
                <button className="btn btn-primary" type="submit">
                  שמרי שינויים
                </button>

                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={resetToDashboard}
                >
                  חזרה
                </button>
              </div>
            </form>
          </section>
        )}

        {showCreateSlot && business && authMode !== "reset" && (
          <section className="form-card glass-card">
            <div className="card-head">
              <span className="section-kicker">תור חדש</span>
              <h3>יצירת תור שהתפנה</h3>
            </div>

            <form className="form-grid" onSubmit={handleCreateSlot}>
              <label className="field">
                <span>טיפול</span>
                <input
                  name="serviceName"
                  placeholder="לדוגמה: טיפול פנים"
                  required
                />
              </label>

              <label className="field">
                <span>מחיר</span>
                <input name="price" type="number" placeholder="לדוגמה: 350" />
              </label>

              <label className="field">
                <span>תאריך</span>
                <input name="date" type="date" required />
              </label>

              <label className="field">
                <span>שעה</span>
                <input name="time" type="time" required />
              </label>

              <label className="field field-full">
                <span>הערה</span>
                <textarea
                  name="note"
                  placeholder="לדוגמה: מתאים ללקוחות חדשות וקיימות"
                />
              </label>

              <div className="field-full form-actions">
                <button className="btn btn-primary" type="submit">
                  צרי תור
                </button>

                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={resetToDashboard}
                >
                  חזרה
                </button>
              </div>
            </form>
          </section>
        )}

        {showHistory && business && authMode !== "reset" && (
          <section className="section-block">
            <div className="section-head">
              <span className="section-kicker">היסטוריה</span>
              <h3>כל התורים שהתפנו</h3>
            </div>

            {history.length === 0 ? (
              <div className="glass-card">
                <div className="empty-state">
                  <h3>אין עדיין תורים</h3>
                  <p>כשתיצור תור ראשון, הוא יופיע כאן.</p>
                </div>
              </div>
            ) : (
              <div className="history-list">
                {history.map((item) => {
                  const latestClaim = item.claims?.[0] || null;
                  const approvalLink = latestClaim
                    ? buildApprovalWhatsappLink(latestClaim, item)
                    : "";
                  const rejectionLink = latestClaim
                    ? buildRejectionWhatsappLink(latestClaim, item)
                    : "";
                  const cancellationLink = latestClaim
                    ? buildCancellationWhatsappLink(latestClaim, item)
                    : "";

                  return (
                    <article className="history-card glass-card" key={item.id}>
                      <div className="history-main">
                        <div>
                          <h4>{item.service_name}</h4>
                          <p className="slot-meta-line">
                            {formatDate(item.slot_date)} · {formatTime(item.slot_time)}
                            {item.price ? ` · ${item.price} ₪` : ""}
                          </p>
                        </div>

                        <span className={`status-badge ${statusClass(item.status)}`}>
                          {statusLabel(item.status)}
                        </span>
                      </div>

                      {latestClaim ? (
                        <div className="request-box">
                          <div className="request-title">בקשת לקוחה אחרונה</div>

                          <div className="request-grid">
                            <div>
                              <span>שם</span>
                              <strong>{latestClaim.client_name}</strong>
                            </div>

                            <div>
                              <span>טלפון</span>
                              <strong>{latestClaim.client_phone}</strong>
                            </div>
                          </div>

                          <div className="request-note">
                            <span>סטטוס</span>
                            <p>{statusLabel(latestClaim.status)}</p>
                          </div>
                        </div>
                      ) : (
                        <p className="slot-meta-line">עדיין אין בקשות לתור הזה.</p>
                      )}

                      <div className="action-row">
                        <button
                          className="btn btn-secondary"
                          onClick={() => openSlotFromHistory(item)}
                        >
                          פתחי תור
                        </button>

                        <button
                          className="btn btn-secondary"
                          onClick={() => copyClientLink(item)}
                        >
                          העתיקי לינק
                        </button>

                        <button
                          className="btn btn-success"
                          onClick={() => copyWhatsappMessage(item)}
                        >
                          הודעת WhatsApp
                        </button>

                        {latestClaim &&
                          latestClaim.status !== "approved" &&
                          item.status !== "confirmed" &&
                          item.status !== "cancelled" && (
                            <button
                              className="btn btn-success"
                              onClick={() => approveClaim(latestClaim, item)}
                            >
                              סגרי עם הלקוחה
                            </button>
                          )}

                        {latestClaim &&
                          latestClaim.status !== "approved" &&
                          latestClaim.status !== "rejected" &&
                          item.status !== "confirmed" &&
                          item.status !== "cancelled" && (
                            <button
                              className="btn btn-secondary"
                              onClick={() => rejectClaim(latestClaim, item)}
                            >
                              דחי ושחררי תור
                            </button>
                          )}

                        {latestClaim &&
                          latestClaim.status !== "approved" &&
                          latestClaim.status !== "rejected" &&
                          item.status !== "confirmed" &&
                          item.status !== "cancelled" &&
                          rejectionLink && (
                            <a
                              className="btn btn-secondary"
                              href={rejectionLink}
                              target="_blank"
                              rel="noreferrer"
                            >
                              שלחי הודעת דחייה
                            </a>
                          )}

                        {latestClaim &&
                          (latestClaim.status === "approved" ||
                            item.status === "confirmed") &&
                          approvalLink &&
                          item.status !== "cancelled" && (
                            <a
                              className="btn btn-success"
                              href={approvalLink}
                              target="_blank"
                              rel="noreferrer"
                            >
                              שלחי הודעת אישור
                            </a>
                          )}

                        {item.status !== "cancelled" && (
                          <button
                            className="btn btn-warning"
                            onClick={() => cancelSlot(item)}
                          >
                            בטלי תור
                          </button>
                        )}

                        {latestClaim &&
                          item.status === "cancelled" &&
                          cancellationLink && (
                            <a
                              className="btn btn-secondary"
                              href={cancellationLink}
                              target="_blank"
                              rel="noreferrer"
                            >
                              שלחי הודעת ביטול
                            </a>
                          )}

                        <button
                          className="btn btn-danger"
                          onClick={() => deleteSlot(item)}
                        >
                          מחיקה מלאה
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            <div className="action-row">
              <button className="btn btn-primary" onClick={goToCreateSlot}>
                התפנה לי תור
              </button>

              <button className="btn btn-secondary" onClick={resetToDashboard}>
                חזרה לדשבורד
              </button>
            </div>
          </section>
        )}

        {slot && !showClientPage && !showHistory && isOwnerView && authMode !== "reset" && (
          <section className="slot-card glass-card">
            <div className="slot-card-head">
              <div>
                <span className="section-kicker">ניהול תור</span>
                <h4>{slot.service_name}</h4>
                <p className="slot-meta-line">
                  {formatDate(slot.slot_date)} · {formatTime(slot.slot_time)}
                  {slot.price ? ` · ${slot.price} ₪` : ""}
                </p>
              </div>

              <span className={`status-badge ${statusClass(slot.status)}`}>
                {statusLabel(slot.status)}
              </span>
            </div>

            {showEditSlot ? (
              <form className="form-grid" onSubmit={handleUpdateSlot}>
                <label className="field">
                  <span>טיפול</span>
                  <input
                    name="serviceName"
                    defaultValue={slot.service_name}
                    required
                  />
                </label>

                <label className="field">
                  <span>מחיר</span>
                  <input name="price" type="number" defaultValue={slot.price || ""} />
                </label>

                <label className="field">
                  <span>תאריך</span>
                  <input
                    name="date"
                    type="date"
                    defaultValue={slot.slot_date}
                    required
                  />
                </label>

                <label className="field">
                  <span>שעה</span>
                  <input
                    name="time"
                    type="time"
                    defaultValue={slot.slot_time}
                    required
                  />
                </label>

                <label className="field field-full">
                  <span>הערה</span>
                  <textarea name="note" defaultValue={slot.note || ""} />
                </label>

                <div className="field-full form-actions">
                  <button className="btn btn-primary" type="submit">
                    שמרי שינויים
                  </button>

                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowEditSlot(false)}
                  >
                    ביטול
                  </button>
                </div>
              </form>
            ) : (
              <>
                {slot.note && (
                  <div className="slot-notes">
                    <strong>הערה</strong>
                    <p>{slot.note}</p>
                  </div>
                )}

                <div className="slot-link-box">
                  <span>לינק ללקוחה</span>
                  <div className="link-row">
                    <input value={clientLink} readOnly />
                    <button
                      className="btn btn-secondary btn-small"
                      onClick={() => copyClientLink()}
                    >
                      העתקי לינק
                    </button>
                  </div>
                </div>

                {claim && (
                  <div className="request-box">
                    <div className="request-title">בקשת לקוחה</div>

                    <div className="request-grid">
                      <div>
                        <span>שם</span>
                        <strong>{claim.client_name}</strong>
                      </div>

                      <div>
                        <span>טלפון</span>
                        <strong>{claim.client_phone}</strong>
                      </div>
                    </div>

                    <div className="request-note">
                      <span>סטטוס</span>
                      <p>{statusLabel(claim.status)}</p>
                    </div>
                  </div>
                )}

                <div className="action-row">
                  <button
                    className="btn btn-success"
                    onClick={() => copyWhatsappMessage()}
                  >
                    הודעת WhatsApp לרשימת תפוצה
                  </button>

                  <button
                    className="btn btn-secondary"
                    onClick={() => setShowEditSlot(true)}
                  >
                    ערכי תור
                  </button>

                  {claim &&
                    claim.status !== "approved" &&
                    claim.status !== "rejected" &&
                    slot.status !== "confirmed" &&
                    slot.status !== "cancelled" && (
                      <button
                        className="btn btn-success"
                        onClick={() => approveClaim()}
                      >
                        סגרי עם הלקוחה
                      </button>
                    )}

                  {claim &&
                    claim.status !== "approved" &&
                    claim.status !== "rejected" &&
                    slot.status !== "confirmed" &&
                    slot.status !== "cancelled" && (
                      <button
                        className="btn btn-secondary"
                        onClick={() => rejectClaim()}
                      >
                        דחי ושחררי תור
                      </button>
                    )}

                  {claim &&
                    claim.status !== "approved" &&
                    claim.status !== "rejected" &&
                    slot.status !== "confirmed" &&
                    slot.status !== "cancelled" &&
                    rejectionWhatsappLink && (
                      <a
                        className="btn btn-secondary"
                        href={rejectionWhatsappLink}
                        target="_blank"
                        rel="noreferrer"
                      >
                        שלחי הודעת דחייה
                      </a>
                    )}

                  {claim &&
                    (claim.status === "approved" || slot.status === "confirmed") &&
                    approvalWhatsappLink &&
                    slot.status !== "cancelled" && (
                      <a
                        className="btn btn-success"
                        href={approvalWhatsappLink}
                        target="_blank"
                        rel="noreferrer"
                      >
                        שלחי הודעת אישור
                      </a>
                    )}

                  {slot.status !== "cancelled" && (
                    <button className="btn btn-warning" onClick={() => cancelSlot()}>
                      בטלי תור
                    </button>
                  )}

                  {claim && slot.status === "cancelled" && cancellationWhatsappLink && (
                    <a
                      className="btn btn-secondary"
                      href={cancellationWhatsappLink}
                      target="_blank"
                      rel="noreferrer"
                    >
                      שלחי הודעת ביטול
                    </a>
                  )}

                  <button className="btn btn-danger" onClick={() => deleteSlot()}>
                    מחיקה מלאה
                  </button>

                  <button className="btn btn-secondary" onClick={loadHistory}>
                    ראי היסטוריה
                  </button>

                  <button className="btn btn-primary" onClick={resetToDashboard}>
                    חזרה לדשבורד
                  </button>
                </div>
              </>
            )}
          </section>
        )}

        {slot && !showClientPage && !showHistory && !isOwnerView && authMode !== "reset" && (
          <section className="client-card glass-card">
            <h3>הבקשה התקבלה</h3>
            <p>בעלת העסק קיבלה את הפרטים ותחזור אלייך לאישור.</p>
          </section>
        )}
      </div>
    </div>
  );
}

export default App;