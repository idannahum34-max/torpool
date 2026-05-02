import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "./lib/supabase";
import type { Session, User } from "@supabase/supabase-js";

type Business = {
  id: string;
  owner_id: string;
  business_name: string;
  phone: string | null;
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

  if (digits.startsWith("0")) {
    return `972${digits.slice(1)}`;
  }

  return digits;
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);

  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [showForm, setShowForm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showEditBusiness, setShowEditBusiness] = useState(false);
  const [showEditSlot, setShowEditSlot] = useState(false);

  const [slot, setSlot] = useState<Slot | null>(null);
  const [showClientPage, setShowClientPage] = useState(false);
  const [claim, setClaim] = useState<Claim | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [clientSubmitted, setClientSubmitted] = useState(false);

  const [approvedCount, setApprovedCount] = useState(0);
  const [approvedValue, setApprovedValue] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);

  const clientLink = slot
    ? `${window.location.origin}/?slot=${slot.id}&view=client`
    : "";

  const isOwnerView = Boolean(
    session && business && slot && slot.business_id === business.id
  );

  useEffect(() => {
    startApp();

    const { data } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);

      if (newSession?.user) {
        loadBusiness(newSession.user.id);
      } else {
        setBusiness(null);
        setApprovedCount(0);
        setApprovedValue(0);
        setPendingCount(0);
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

    const { data } = await supabase.auth.getSession();

    setSession(data.session);
    setUser(data.session?.user ?? null);

    if (data.session?.user) {
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

    const approvedSlots = slots.filter((item) => item.status === "confirmed");
    const pendingSlots = slots.filter((item) => item.status === "claimed");

    const value = approvedSlots.reduce((sum, item) => {
      const price = Number(item.price || 0);
      return sum + (Number.isNaN(price) ? 0 : price);
    }, 0);

    setApprovedCount(approvedSlots.length);
    setApprovedValue(value);
    setPendingCount(pendingSlots.length);
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
      alert("לא הצלחתי לטעון את התור");
      console.error(slotError);
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

    if (claimsData && claimsData.length > 0) {
      setClaim(claimsData[0]);
    } else {
      setClaim(null);
    }

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
        alert("נרשמת. אם Supabase מבקש אימות מייל, צריך לאשר במייל.");
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

  async function handleLogout() {
    await supabase.auth.signOut();

    setSession(null);
    setUser(null);
    setBusiness(null);
    setSlot(null);
    setClaim(null);
    setHistory([]);
    setShowHistory(false);
    setShowClientPage(false);
    setShowForm(false);
    setShowEditBusiness(false);
    setShowEditSlot(false);
    setClientSubmitted(false);
    setApprovedCount(0);
    setApprovedValue(0);
    setPendingCount(0);

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
    };

    const { data, error } = await supabase
      .from("businesses")
      .insert(newBusiness)
      .select()
      .single();

    if (error) {
      alert("שגיאה ביצירת העסק");
      console.error(error);
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
    };

    const { data, error } = await supabase
      .from("businesses")
      .update(updatedBusiness)
      .eq("id", business.id)
      .select()
      .single();

    if (error) {
      alert("שגיאה בעדכון פרטי העסק");
      console.error(error);
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

    if (business) {
      await loadDashboardStats(business.id);
    }

    setLoading(false);
  }

  async function loadHistory() {
    if (!business) return;

    setLoading(true);
    setShowHistory(true);
    setShowForm(false);
    setShowEditBusiness(false);
    setShowEditSlot(false);
    setShowClientPage(false);
    setSlot(null);
    setClaim(null);
    setClientSubmitted(false);

    const { data, error } = await supabase
      .from("slots")
      .select("*, claims(*)")
      .eq("business_id", business.id)
      .order("created_at", { ascending: false });

    if (error) {
      alert("לא הצלחתי לטעון את התורים שהתפנו");
      console.error(error);
      setLoading(false);
      return;
    }

    setHistory((data || []) as HistoryItem[]);
    window.history.pushState({}, "", "/");
    setLoading(false);
  }

  async function handleCreateSlot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!business) {
      alert("צריך ליצור עסק לפני יצירת תור");
      return;
    }

    if (!business.phone) {
      alert(
        "חסר טלפון עסק. צרי עסק עם מספר טלפון כדי שלקוחות יוכלו לשלוח WhatsApp."
      );
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
      alert("שגיאה ביצירת התור שהתפנה");
      console.error(error);
      setLoading(false);
      return;
    }

    setSlot(data);
    setClaim(null);
    setHistory([]);
    setShowHistory(false);
    setShowForm(false);
    setShowEditSlot(false);
    setShowClientPage(false);
    setClientSubmitted(false);

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
      alert("שגיאה בעדכון התור");
      console.error(error);
      setLoading(false);
      return;
    }

    setSlot(data);
    setShowEditSlot(false);

    if (business) {
      await loadDashboardStats(business.id);
    }

    setLoading(false);
  }

  async function handleClaimSlot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!slot) return;

    if (slot.status === "confirmed" || slot.status === "cancelled") {
      alert("התור כבר לא זמין");
      return;
    }

    setLoading(true);

    const form = new FormData(event.currentTarget);

    const newClaim = {
      slot_id: slot.id,
      client_name: String(form.get("clientName") || ""),
      client_phone: String(form.get("clientPhone") || ""),
      status: "pending",
    };

    const { data: claimData, error: claimError } = await supabase
      .from("claims")
      .insert(newClaim)
      .select()
      .single();

    if (claimError) {
      alert("שגיאה בשליחת הבקשה לתור");
      console.error(claimError);
      setLoading(false);
      return;
    }

    const { data: updatedSlot } = await supabase
      .from("slots")
      .update({ status: "claimed" })
      .eq("id", slot.id)
      .select()
      .single();

    if (updatedSlot) {
      setSlot(updatedSlot);
    }

    setClaim(claimData);
    setClientSubmitted(true);
    setShowClientPage(true);

    window.history.pushState({}, "", `/?slot=${slot.id}&view=client`);

    setLoading(false);
  }

  async function approveClaim(claimToApprove?: Claim, slotToApprove?: Slot) {
    const activeClaim = claimToApprove || claim;
    const activeSlot = slotToApprove || slot;

    if (!activeSlot || !activeClaim) return;

    if (
      !business ||
      !activeSlot.business_id ||
      activeSlot.business_id !== business.id
    ) {
      alert("אין לך הרשאה לאשר את התור הזה");
      return;
    }

    if (activeSlot.status === "cancelled") {
      alert("אי אפשר לאשר תור שנסגר");
      return;
    }

    setLoading(true);

    const { error: claimError } = await supabase
      .from("claims")
      .update({ status: "approved" })
      .eq("id", activeClaim.id);

    if (claimError) {
      alert("שגיאה באישור הבקשה");
      console.error(claimError);
      setLoading(false);
      return;
    }

    const { error: slotError } = await supabase
      .from("slots")
      .update({ status: "confirmed" })
      .eq("id", activeSlot.id);

    if (slotError) {
      alert("שגיאה באישור התור");
      console.error(slotError);
      setLoading(false);
      return;
    }

    alert("התור אושר ✅");

    if (business) {
      await loadDashboardStats(business.id);
    }

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

    if (!activeSlot || !activeClaim) return;

    if (
      !business ||
      !activeSlot.business_id ||
      activeSlot.business_id !== business.id
    ) {
      alert("אין לך הרשאה לדחות את הבקשה הזאת");
      return;
    }

    if (activeSlot.status === "confirmed") {
      alert("התור כבר אושר. אם צריך לבטל, השתמשי בסגירת תור ושליחת ביטול.");
      return;
    }

    const confirmed = window.confirm(
      "לסמן את הלקוחה כדחויה ולפתוח את התור שוב לקבלת בקשות?"
    );

    if (!confirmed) return;

    setLoading(true);

    const { error: claimError } = await supabase
      .from("claims")
      .update({ status: "rejected" })
      .eq("id", activeClaim.id);

    if (claimError) {
      alert("שגיאה בדחיית הבקשה");
      console.error(claimError);
      setLoading(false);
      return;
    }

    const { error: slotError } = await supabase
      .from("slots")
      .update({ status: "open" })
      .eq("id", activeSlot.id);

    if (slotError) {
      alert("שגיאה בפתיחת התור מחדש");
      console.error(slotError);
      setLoading(false);
      return;
    }

    alert("הבקשה סומנה כדחויה והתור נפתח שוב");

    if (business) {
      await loadDashboardStats(business.id);
    }

    if (showHistory) {
      await loadHistory();
    } else {
      await loadSlotFromUrl();
    }

    setLoading(false);
  }

  async function closeSlot(slotToClose?: Slot) {
    const activeSlot = slotToClose || slot;

    if (!activeSlot) return;

    if (
      !business ||
      !activeSlot.business_id ||
      activeSlot.business_id !== business.id
    ) {
      alert("אין לך הרשאה לסגור את התור הזה");
      return;
    }

    const confirmed = window.confirm(
      "לסגור את התור? הוא יישאר בהיסטוריה אבל לקוחות לא יוכלו לתפוס אותו."
    );

    if (!confirmed) return;

    setLoading(true);

    const { error } = await supabase
      .from("slots")
      .update({ status: "cancelled" })
      .eq("id", activeSlot.id);

    if (error) {
      alert("שגיאה בסגירת התור");
      console.error(error);
      setLoading(false);
      return;
    }

    alert("התור נסגר");

    if (business) {
      await loadDashboardStats(business.id);
    }

    if (showHistory) {
      await loadHistory();
    } else {
      await loadSlotFromUrl();
    }

    setLoading(false);
  }

  async function deleteSlot(slotToDelete?: Slot) {
    const activeSlot = slotToDelete || slot;

    if (!activeSlot) return;

    if (
      !business ||
      !activeSlot.business_id ||
      activeSlot.business_id !== business.id
    ) {
      alert("אין לך הרשאה למחוק את התור הזה");
      return;
    }

    const confirmed = window.confirm(
      "למחוק את התור לגמרי? הפעולה תמחק גם את כל הבקשות ולא ניתן לשחזר."
    );

    if (!confirmed) return;

    setLoading(true);

    const { error: claimsError } = await supabase
      .from("claims")
      .delete()
      .eq("slot_id", activeSlot.id);

    if (claimsError) {
      alert("שגיאה במחיקת הבקשות של התור");
      console.error(claimsError);
      setLoading(false);
      return;
    }

    const { error: slotError } = await supabase
      .from("slots")
      .delete()
      .eq("id", activeSlot.id);

    if (slotError) {
      alert("שגיאה במחיקת התור");
      console.error(slotError);
      setLoading(false);
      return;
    }

    alert("התור נמחק");

    setSlot(null);
    setClaim(null);
    setClientSubmitted(false);

    if (business) {
      await loadDashboardStats(business.id);
    }

    if (showHistory) {
      await loadHistory();
    } else {
      resetToDashboard();
    }

    setLoading(false);
  }

  function statusLabel(status: string) {
    if (status === "open") return "פתוח לשליחה";
    if (status === "claimed") return "יש בקשה לאישור";
    if (status === "confirmed") return "התור אושר";
    if (status === "approved") return "אושר";
    if (status === "pending") return "ממתין לאישור";
    if (status === "rejected") return "נדחתה";
    if (status === "cancelled") return "התור נסגר";
    return status;
  }

  function statusIcon(status: string) {
    if (status === "open") return "🟢";
    if (status === "claimed") return "🟡";
    if (status === "confirmed") return "✅";
    if (status === "approved") return "✅";
    if (status === "pending") return "🟡";
    if (status === "rejected") return "⚪";
    if (status === "cancelled") return "🔴";
    return "•";
  }

  function buildClientToBusinessWhatsappLink() {
    if (!slot || !claim) return "";

    const targetPhone = normalizePhoneForWhatsapp(slot.business_phone);

    if (!targetPhone) return "";

    const message = `היי, ראיתי שהתפנה תור דרך תורפול 💌

שם: ${claim.client_name}
טלפון: ${claim.client_phone}

אני רוצה את התור:
${slot.service_name}
${slot.slot_date}
${slot.slot_time}
${slot.price ? `${slot.price} ₪` : ""}

השארתי פרטים באתר ומחכה לאישור 🙏`;

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

    const message = `היי ${activeClaim.client_name} 🤍

התור שלך אושר ✅

פרטי התור:
${activeSlot.service_name}
תאריך: ${activeSlot.slot_date}
שעה: ${activeSlot.slot_time}
${activeSlot.price ? `מחיר: ${activeSlot.price} ₪` : ""}

נתראה 🙏`;

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

    const message = `היי ${activeClaim.client_name} 🤍

תודה שהשארת פרטים.
התור הזה כבר לא מתאים / נתפס, אבל אעדכן אותך כשיתפנה תור חדש 🙏

פרטי התור:
${activeSlot.service_name}
תאריך: ${activeSlot.slot_date}
שעה: ${activeSlot.slot_time}`;

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

    const message = `היי ${activeClaim.client_name} 🤍

לצערי התור שאושר/התבקשת אליו התבטל.

פרטי התור:
${activeSlot.service_name}
תאריך: ${activeSlot.slot_date}
שעה: ${activeSlot.slot_time}
${activeSlot.price ? `מחיר: ${activeSlot.price} ₪` : ""}

אעדכן אותך כשיתפנה תור חדש 🙏`;

    return `https://wa.me/${targetPhone}?text=${encodeURIComponent(message)}`;
  }

  function copyClientLink(slotToCopy?: Slot) {
    const targetSlot = slotToCopy || slot;
    if (!targetSlot) return;

    if (
      business &&
      targetSlot.business_id &&
      targetSlot.business_id !== business.id
    ) {
      alert("אין לך הרשאה להעתיק לינק לתור הזה");
      return;
    }

    const link = `${window.location.origin}/?slot=${targetSlot.id}&view=client`;
    navigator.clipboard.writeText(link);
    alert("הלינק לתור הועתק!");
  }

  function copyWhatsappMessage(slotToCopy?: Slot) {
    const targetSlot = slotToCopy || slot;
    if (!targetSlot) return;

    if (
      business &&
      targetSlot.business_id &&
      targetSlot.business_id !== business.id
    ) {
      alert("אין לך הרשאה להעתיק הודעה לתור הזה");
      return;
    }

    const link = `${window.location.origin}/?slot=${targetSlot.id}&view=client`;

    const message = `היי אהובות 🤍

התפנה לי תור ל-${targetSlot.service_name} בתאריך ${targetSlot.slot_date} בשעה ${targetSlot.slot_time}.
${targetSlot.price ? `מחיר: ${targetSlot.price} ₪` : ""}

מי שרוצה להיכנס במקום יכולה להשאיר פרטים כאן:
${link}

שימי לב: השארת פרטים לא מאשרת את התור אוטומטית.
אני אאשר מול הראשונה שמתאימה ליומן 🙏`;

    navigator.clipboard.writeText(message);
    alert("הודעת WhatsApp הועתקה!");
  }

  function openSlotFromHistory(historySlot: HistoryItem) {
    const latestClaim = historySlot.claims?.[0] || null;

    setSlot(historySlot);
    setClaim(latestClaim);
    setShowHistory(false);
    setShowForm(false);
    setShowEditBusiness(false);
    setShowEditSlot(false);
    setShowClientPage(false);
    setClientSubmitted(false);

    window.history.pushState({}, "", `/?slot=${historySlot.id}`);
  }

  function resetToDashboard() {
    setSlot(null);
    setClaim(null);
    setHistory([]);
    setShowHistory(false);
    setShowClientPage(false);
    setShowForm(false);
    setShowEditBusiness(false);
    setShowEditSlot(false);
    setClientSubmitted(false);
    window.history.pushState({}, "", "/");

    if (business) {
      loadDashboardStats(business.id);
    }
  }

  const clientWhatsappLink = buildClientToBusinessWhatsappLink();
  const approvalWhatsappLink = buildApprovalWhatsappLink();
  const rejectionWhatsappLink = buildRejectionWhatsappLink();
  const cancellationWhatsappLink = buildCancellationWhatsappLink();

  if (loading) {
    return (
      <main className="page" dir="rtl">
        <div className="bg-grid" />
        <div className="glow glow-pink" />
        <div className="glow glow-purple" />

        <section className="shell shell-narrow">
          <div className="panel">
            <p className="badge">תורפול</p>
            <h1 className="page-title">טוען...</h1>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="page" dir="rtl">
      <div className="bg-grid" />
      <div className="glow glow-pink" />
      <div className="glow glow-purple" />

      <section className="shell">
        <div className="panel">
          <p className="badge">תורפול · ממלאת תורים שהתפנו דרך WhatsApp</p>

          {slot && showClientPage && (
            <div className="narrow">
              <h1 className="page-title">בקשת תור אצל {slot.business_name}</h1>

              <div className="card soft-card">
                <h2>{slot.service_name}</h2>
                <p>📅 תאריך: {slot.slot_date}</p>
                <p>🕒 שעה: {slot.slot_time}</p>
                {slot.price && <p>💸 מחיר: {slot.price} ₪</p>}
                {slot.note && <p>📝 הערה: {slot.note}</p>}
              </div>

              <div className="notice">
                השארת פרטים לא מאשרת את התור אוטומטית. בעלת העסק תחזור אלייך
                לאישור סופי.
              </div>

              {clientSubmitted && (
                <div className="success-card">
                  <h2>הבקשה נשלחה ✅</h2>
                  <p>עכשיו שלחי WhatsApp לבעלת העסק כדי שהיא תקבל את הבקשה מיד.</p>

                  {clientWhatsappLink ? (
                    <a
                      className="btn btn-whatsapp"
                      href={clientWhatsappLink}
                      target="_blank"
                      rel="noreferrer"
                    >
                      שלחי WhatsApp לבעלת העסק
                    </a>
                  ) : (
                    <p className="muted">
                      אין מספר WhatsApp מחובר לעסק הזה. בעלת העסק עדיין תראה את
                      הבקשה במערכת.
                    </p>
                  )}
                </div>
              )}

              {clientSubmitted ? null : slot.status === "cancelled" ? (
                <div className="success-card">
                  <h2>התור כבר לא זמין 🔴</h2>
                  <p>אפשר לחכות לתור הבא שיתפנה.</p>
                </div>
              ) : slot.status === "confirmed" ? (
                <div className="success-card">
                  <h2>התור כבר נתפס ואושר ✅</h2>
                  <p>אפשר לחכות לתור הבא שיתפנה.</p>
                </div>
              ) : (
                <form onSubmit={handleClaimSlot} className="form">
                  <label>
                    שם מלא
                    <input name="clientName" placeholder="לדוגמה: דנה כהן" required />
                  </label>

                  <label>
                    טלפון
                    <input
                      name="clientPhone"
                      placeholder="לדוגמה: 0501234567"
                      required
                    />
                  </label>

                  <button className="btn btn-primary" type="submit">
                    שלחי בקשה לתור
                  </button>
                </form>
              )}
            </div>
          )}

          {!slot && !session && (
            <div className="landing">
              <div className="hero">
                <div className="brand-logo-card">
                  <img
                    className="brand-logo-image"
                    src="/torpool-logo.png"
                    alt="תורפול - תור מתבטל? תורפול ממלאה."
                  />
                </div>

                <div className="kicker">לינק אחד. הודעת WhatsApp אחת. תור שמתמלא.</div>

                <h1 className="hero-title">
                  התפנה תור? מלאי אותו בלי לרדוף אחרי לקוחות.
                </h1>

                <p className="hero-text">
                  תורפול עוזרת לקוסמטיקאיות וקליניקות להפוך חור ביומן לבקשות
                  אמיתיות מלקוחות — מהר, נקי, ובשליטה שלך.
                </p>

                <div className="feature-list">
                  <div className="feature-item">
                    <span>⚡</span>
                    <p>יוצרת תור שהתפנה בפחות מדקה.</p>
                  </div>

                  <div className="feature-item">
                    <span>💬</span>
                    <p>מעתיקה הודעת WhatsApp מוכנה לשליחה.</p>
                  </div>

                  <div className="feature-item">
                    <span>✅</span>
                    <p>מקבלת בקשות ומאשרת רק את מי שמתאימה.</p>
                  </div>
                </div>
              </div>

              <div className="auth-card">
                <h2>{authMode === "login" ? "התחברות" : "פתיחת חשבון"}</h2>

                <p>
                  {authMode === "login"
                    ? "כנסי לדשבורד ותראי מה התפנה לך היום."
                    : "צרי חשבון ותתחילי למלא תורים שהתפנו."}
                </p>

                <form onSubmit={handleAuth} className="form">
                  <label>
                    אימייל
                    <input
                      name="email"
                      type="email"
                      required
                      placeholder="you@example.com"
                    />
                  </label>

                  <label>
                    סיסמה
                    <input
                      name="password"
                      type="password"
                      required
                      placeholder="לפחות 6 תווים"
                    />
                  </label>

                  <button className="btn btn-primary" type="submit">
                    {authMode === "login" ? "התחברי" : "צרי משתמש"}
                  </button>
                </form>

                <button
                  className="link-button"
                  onClick={() =>
                    setAuthMode(authMode === "login" ? "register" : "login")
                  }
                >
                  {authMode === "login"
                    ? "אין לך משתמש? הרשמי כאן"
                    : "כבר יש לך משתמש? התחברי"}
                </button>
              </div>
            </div>
          )}

          {session && !business && !slot && (
            <div className="narrow">
              <h1 className="page-title">יצירת העסק שלך</h1>

              <p className="subtitle">
                זה השם והטלפון שיופיעו ללקוחות כשהן פותחות תור שהתפנה.
              </p>

              <form onSubmit={handleCreateBusiness} className="form">
                <label>
                  שם העסק
                  <input
                    name="businessName"
                    placeholder="לדוגמה: קליניקת נועה"
                    required
                  />
                </label>

                <label>
                  טלפון WhatsApp של העסק
                  <input name="phone" placeholder="לדוגמה: 0501234567" required />
                </label>

                <button className="btn btn-primary" type="submit">
                  צרי את העסק
                </button>
              </form>

              <button className="btn btn-secondary" onClick={handleLogout}>
                התנתקות
              </button>
            </div>
          )}

          {showEditBusiness && business && (
            <div className="narrow">
              <h1 className="page-title">עריכת פרטי העסק</h1>

              <form onSubmit={handleUpdateBusiness} className="form">
                <label>
                  שם העסק
                  <input
                    name="businessName"
                    defaultValue={business.business_name}
                    required
                  />
                </label>

                <label>
                  טלפון WhatsApp של העסק
                  <input name="phone" defaultValue={business.phone || ""} required />
                </label>

                <button className="btn btn-primary" type="submit">
                  שמרי שינויים
                </button>

                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowEditBusiness(false)}
                >
                  ביטול
                </button>
              </form>
            </div>
          )}

          {session &&
            business &&
            !showEditBusiness &&
            !showForm &&
            !slot &&
            !showClientPage &&
            !showHistory && (
              <div className="dashboard">
                <div className="dashboard-header">
                  <div>
                    <p className="overline">הדשבורד שלך</p>
                    <h1>{business.business_name}</h1>
                    <p>מה התפנה לך היום?</p>
                  </div>

                  <button className="btn btn-secondary" onClick={handleLogout}>
                    התנתקות
                  </button>
                </div>

                <div className="stats">
                  <div className="stat-card">
                    <strong>{approvedCount}</strong>
                    <span>תורים שאושרו</span>
                  </div>

                  <div className="stat-card">
                    <strong>{approvedValue} ₪</strong>
                    <span>חזרו ליומן</span>
                  </div>

                  <div className="stat-card">
                    <strong>{pendingCount}</strong>
                    <span>מחכים לאישור</span>
                  </div>
                </div>

                <div className="notice">
                  <strong>הזרימה:</strong>{" "}
                  יוצרת תור שהתפנה → שולחת ב־WhatsApp → מאשרת לקוחה.
                </div>

                <div className="actions">
                  <button className="btn btn-primary" onClick={() => setShowForm(true)}>
                    התפנה לי תור
                  </button>

                  <button className="btn btn-secondary" onClick={loadHistory}>
                    ראי תורים שהתפנו
                  </button>

                  <button
                    className="btn btn-secondary"
                    onClick={() => setShowEditBusiness(true)}
                  >
                    עריכת פרטי העסק
                  </button>
                </div>
              </div>
            )}

          {showForm && business && (
            <div className="narrow">
              <h1 className="page-title">תור שהתפנה</h1>

              <p className="subtitle">
                מלאי את הפרטים, העתיקי הודעת WhatsApp, ושלחי לרשימת התפוצה שלך.
              </p>

              <form onSubmit={handleCreateSlot} className="form">
                <label>
                  שם הטיפול
                  <input
                    name="serviceName"
                    placeholder="לדוגמה: טיפול פנים"
                    required
                  />
                </label>

                <div className="two-fields">
                  <label>
                    תאריך
                    <input name="date" type="date" required />
                  </label>

                  <label>
                    שעה
                    <input name="time" type="time" required />
                  </label>
                </div>

                <label>
                  מחיר
                  <input name="price" type="number" placeholder="לדוגמה: 350" />
                </label>

                <label>
                  הערה קצרה
                  <textarea
                    name="note"
                    placeholder="לדוגמה: מתאים ללקוחות חדשות וקיימות"
                  />
                </label>

                <button className="btn btn-primary" type="submit">
                  צרי לינק לתור
                </button>

                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowForm(false)}
                >
                  חזרה
                </button>
              </form>
            </div>
          )}

          {showHistory && business && (
            <div className="dashboard">
              <div className="dashboard-header">
                <div>
                  <p className="overline">ניהול תורים</p>
                  <h1>תורים שהתפנו</h1>
                </div>

                <button className="btn btn-secondary" onClick={resetToDashboard}>
                  חזרה לדשבורד
                </button>
              </div>

              {history.length === 0 ? (
                <div className="card soft-card">
                  <h2>אין עדיין תורים שהתפנו</h2>
                  <p>כשתצרי תור ראשון, הוא יופיע כאן.</p>
                </div>
              ) : (
                <div className="history-list">
                  {history.map((item) => {
                    const latestClaim = item.claims?.[0];
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
                      <div key={item.id} className="history-card">
                        <div className="history-top">
                          <div>
                            <h2>{item.service_name}</h2>
                            <p>
                              {item.slot_date} · {item.slot_time}
                              {item.price ? ` · ${item.price} ₪` : ""}
                            </p>
                          </div>

                          <span className="status-pill">
                            {statusIcon(item.status)} {statusLabel(item.status)}
                          </span>
                        </div>

                        {latestClaim ? (
                          <div className="mini-claim">
                            <p>לקוחה: {latestClaim.client_name}</p>
                            <p>טלפון: {latestClaim.client_phone}</p>
                            <p>
                              סטטוס: {statusIcon(latestClaim.status)}{" "}
                              {statusLabel(latestClaim.status)}
                            </p>
                          </div>
                        ) : (
                          <p className="muted">עדיין אין בקשות לתור הזה.</p>
                        )}

                        <div className="small-actions">
                          <button
                            className="small-btn primary-small"
                            onClick={() => openSlotFromHistory(item)}
                          >
                            פתחי תור
                          </button>

                          <button
                            className="small-btn"
                            onClick={() => copyClientLink(item)}
                          >
                            העתיקי לינק
                          </button>

                          <button
                            className="small-btn whatsapp-small"
                            onClick={() => copyWhatsappMessage(item)}
                          >
                            WhatsApp
                          </button>

                          {latestClaim &&
                            latestClaim.status !== "approved" &&
                            item.status !== "confirmed" &&
                            item.status !== "cancelled" && (
                              <button
                                className="small-btn approve-small"
                                onClick={() => approveClaim(latestClaim, item)}
                              >
                                אשרי
                              </button>
                            )}

                          {latestClaim &&
                            latestClaim.status !== "approved" &&
                            latestClaim.status !== "rejected" &&
                            item.status !== "confirmed" &&
                            item.status !== "cancelled" &&
                            rejectionLink && (
                              <a
                                className="small-btn"
                                href={rejectionLink}
                                target="_blank"
                                rel="noreferrer"
                              >
                                שלחי דחייה
                              </a>
                            )}

                          {latestClaim &&
                            latestClaim.status !== "approved" &&
                            latestClaim.status !== "rejected" &&
                            item.status !== "confirmed" &&
                            item.status !== "cancelled" && (
                              <button
                                className="small-btn"
                                onClick={() => rejectClaim(latestClaim, item)}
                              >
                                סמני כדחויה
                              </button>
                            )}

                          {latestClaim &&
                            (latestClaim.status === "approved" ||
                              item.status === "confirmed") &&
                            approvalLink &&
                            item.status !== "cancelled" && (
                              <a
                                className="small-btn whatsapp-small"
                                href={approvalLink}
                                target="_blank"
                                rel="noreferrer"
                              >
                                שלחי אישור
                              </a>
                            )}

                          {item.status !== "cancelled" && (
                            <button
                              className="small-btn"
                              onClick={() => closeSlot(item)}
                            >
                              סגרי תור
                            </button>
                          )}

                          {latestClaim && item.status === "cancelled" && cancellationLink && (
                            <a
                              className="small-btn whatsapp-small"
                              href={cancellationLink}
                              target="_blank"
                              rel="noreferrer"
                            >
                              שלחי ביטול
                            </a>
                          )}

                          <button
                            className="small-btn delete-small"
                            onClick={() => deleteSlot(item)}
                          >
                            מחקי
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="actions">
                <button className="btn btn-primary" onClick={() => setShowForm(true)}>
                  התפנה לי תור
                </button>
              </div>
            </div>
          )}

          {slot && !showClientPage && !showHistory && isOwnerView && (
            <div className="narrow">
              <h1 className="page-title">התור שלך מוכן לשליחה 💌</h1>

              <div className="notice">
                <p>1. העתיקי את הודעת ה־WhatsApp</p>
                <p>2. שלחי לרשימת התפוצה / קבוצה קיימת שלך</p>
                <p>3. מי שתשאיר פרטים תופיע כאן לאישור</p>
              </div>

              {showEditSlot ? (
                <form onSubmit={handleUpdateSlot} className="form">
                  <label>
                    שם הטיפול
                    <input name="serviceName" defaultValue={slot.service_name} required />
                  </label>

                  <div className="two-fields">
                    <label>
                      תאריך
                      <input name="date" type="date" defaultValue={slot.slot_date} required />
                    </label>

                    <label>
                      שעה
                      <input name="time" type="time" defaultValue={slot.slot_time} required />
                    </label>
                  </div>

                  <label>
                    מחיר
                    <input name="price" type="number" defaultValue={slot.price || ""} />
                  </label>

                  <label>
                    הערה קצרה
                    <textarea name="note" defaultValue={slot.note || ""} />
                  </label>

                  <button className="btn btn-primary" type="submit">
                    שמרי שינויים בתור
                  </button>

                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowEditSlot(false)}
                  >
                    ביטול
                  </button>
                </form>
              ) : (
                <div className="card soft-card">
                  <h2>התפנה תור אצל {slot.business_name}</h2>
                  <p>טיפול: {slot.service_name}</p>
                  <p>תאריך: {slot.slot_date}</p>
                  <p>שעה: {slot.slot_time}</p>
                  {slot.price && <p>מחיר: {slot.price} ₪</p>}
                  {slot.note && <p>הערה: {slot.note}</p>}
                  <p>
                    {statusIcon(slot.status)} {statusLabel(slot.status)}
                  </p>
                </div>
              )}

              {claim && (
                <div className="success-card">
                  <h2>יש בקשה לתור ✅</h2>
                  <p>שם: {claim.client_name}</p>
                  <p>טלפון: {claim.client_phone}</p>
                  <p>
                    סטטוס: {statusIcon(claim.status)} {statusLabel(claim.status)}
                  </p>

                  {claim.status !== "approved" &&
                    claim.status !== "rejected" &&
                    slot.status !== "confirmed" &&
                    slot.status !== "cancelled" && (
                      <button className="btn btn-approve" onClick={() => approveClaim()}>
                        אשרי את התור
                      </button>
                    )}

                  {claim.status !== "approved" &&
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
                        שלחי דחייה ללקוחה ב־WhatsApp
                      </a>
                    )}

                  {claim.status !== "approved" &&
                    claim.status !== "rejected" &&
                    slot.status !== "confirmed" &&
                    slot.status !== "cancelled" && (
                      <button className="btn btn-secondary" onClick={() => rejectClaim()}>
                        סמני כדחויה ופתחי את התור שוב
                      </button>
                    )}

                  {(claim.status === "approved" || slot.status === "confirmed") &&
                    approvalWhatsappLink &&
                    slot.status !== "cancelled" && (
                      <a
                        className="btn btn-whatsapp"
                        href={approvalWhatsappLink}
                        target="_blank"
                        rel="noreferrer"
                      >
                        שלחי אישור ללקוחה ב־WhatsApp
                      </a>
                    )}

                  {slot.status === "cancelled" && cancellationWhatsappLink && (
                    <a
                      className="btn btn-whatsapp"
                      href={cancellationWhatsappLink}
                      target="_blank"
                      rel="noreferrer"
                    >
                      שלחי ביטול ללקוחה ב־WhatsApp
                    </a>
                  )}
                </div>
              )}

              <button className="btn btn-whatsapp" onClick={() => copyWhatsappMessage()}>
                העתיקי הודעת WhatsApp לרשימת תפוצה
              </button>

              <button
                className="btn btn-secondary"
                onClick={() => setShowEditSlot(!showEditSlot)}
              >
                {showEditSlot ? "סגרי עריכה" : "ערכי את התור"}
              </button>

              {slot.status !== "cancelled" && (
                <button className="btn btn-secondary" onClick={() => closeSlot()}>
                  סגרי את התור
                </button>
              )}

              <button className="btn btn-danger" onClick={() => deleteSlot()}>
                מחקי את התור
              </button>

              <div className="link-box">
                <p>לינק ללקוחה:</p>
                <div className="link-text">{clientLink}</div>

                <button className="btn btn-secondary" onClick={() => copyClientLink()}>
                  העתיקי לינק בלבד
                </button>
              </div>

              <div className="actions">
                <button className="btn btn-secondary" onClick={loadHistory}>
                  ראי תורים שהתפנו
                </button>

                <button className="btn btn-primary" onClick={resetToDashboard}>
                  חזרה לדשבורד
                </button>
              </div>
            </div>
          )}

          {slot && !showClientPage && !showHistory && !isOwnerView && (
            <div className="narrow">
              <h1 className="page-title">הבקשה התקבלה ✅</h1>

              <div className="card soft-card">
                <p>בעלת העסק קיבלה את הפרטים ותחזור אלייך לאישור.</p>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

export default App;