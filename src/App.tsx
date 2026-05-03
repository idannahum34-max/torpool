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

type AccessStatus = "checking" | "guest" | "allowed" | "denied";

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

function cleanWhatsappText(text: string) {
  return text.replace(/\uFFFD/g, "").normalize("NFC");
}

function buildWhatsappUrl(phone: string, message: string) {
  return `https://wa.me/${phone}?text=${encodeURIComponent(
    cleanWhatsappText(message)
  )}`;
}

function sortClaims(items: Claim[]) {
  return [...items].sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
    return bTime - aTime;
  });
}

function sortWaitlist(items: WaitlistEntry[]) {
  return [...items].sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
    return bTime - aTime;
  });
}

function LogoMark() {
  return (
    <div className="logo-mark" aria-label="TorPool logo">
      <span>✓</span>
    </div>
  );
}

function App() {
  const paymentWhatsappPhone = "972YOUR_PHONE_HERE";

  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [accessStatus, setAccessStatus] = useState<AccessStatus>("checking");

  const [authMode, setAuthMode] = useState<
    "login" | "register" | "forgot" | "reset"
  >("login");

  const [slot, setSlot] = useState<Slot | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [clientClaim, setClientClaim] = useState<Claim | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [waitlistEntries, setWaitlistEntries] = useState<WaitlistEntry[]>([]);
  const [waitlistBusinessId, setWaitlistBusinessId] = useState<string | null>(
    null
  );

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

  const [approvedCount, setApprovedCount] = useState(0);
  const [approvedValue, setApprovedValue] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [cancelledCount, setCancelledCount] = useState(0);
  const [activeWaitlistCount, setActiveWaitlistCount] = useState(0);

  const isOwnerView = Boolean(
    session && business && slot && slot.business_id === business.id
  );

  const isLandingPage = !session && !slot && !showWaitlistSignup;

  const isDashboardPage =
    Boolean(session) &&
    accessStatus === "allowed" &&
    Boolean(business) &&
    !slot &&
    !showClientPage &&
    !showCreateSlot &&
    !showHistory &&
    !showWaitlist &&
    !showEditBusiness &&
    !showWaitlistSignup;

  const clientLink = slot
    ? `${window.location.origin}/?slot=${slot.id}&view=client`
    : "";

  const waitlistLink = business
    ? `${window.location.origin}/?business=${business.id}&view=waitlist`
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
        checkPaidAccess().then((allowed) => {
          if (allowed) {
            loadBusiness(newSession.user.id);
          } else {
            setBusiness(null);
          }
        });
      } else {
        setBusiness(null);
        setAccessStatus("guest");
        setApprovedCount(0);
        setApprovedValue(0);
        setPendingCount(0);
        setCancelledCount(0);
        setActiveWaitlistCount(0);
      }
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  async function checkPaidAccess() {
    const { data, error } = await supabase.rpc("is_current_user_allowed");

    if (error) {
      console.error("Access check failed:", error);
      setAccessStatus("denied");
      return false;
    }

    const allowed = data === true;
    setAccessStatus(allowed ? "allowed" : "denied");

    return allowed;
  }

  async function startApp() {
    setLoading(true);

    const params = new URLSearchParams(window.location.search);
    const slotId = params.get("slot");
    const businessId = params.get("business");
    const view = params.get("view");

    if (window.location.hash.includes("type=recovery")) {
      setAuthMode("reset");
    }

    if (businessId && view === "waitlist") {
      setWaitlistBusinessId(businessId);
      setShowWaitlistSignup(true);
      setShowClientPage(false);
      setShowCreateSlot(false);
      setShowHistory(false);
      setShowWaitlist(false);
    }

    const { data } = await supabase.auth.getSession();

    setSession(data.session);
    setUser(data.session?.user ?? null);

    if (data.session?.user && !window.location.hash.includes("type=recovery")) {
      const allowed = await checkPaidAccess();

      if (allowed) {
        await loadBusiness(data.session.user.id);
      } else {
        setBusiness(null);
      }
    } else {
      setAccessStatus("guest");
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
    const { data: slotsData, error: slotsError } = await supabase
      .from("slots")
      .select("*, claims(*)")
      .eq("business_id", businessId);

    if (slotsError) {
      console.error(slotsError);
      return;
    }

    const slots = (slotsData || []) as HistoryItem[];

    const confirmed = slots.filter((item) => item.status === "confirmed");
    const cancelled = slots.filter((item) => item.status === "cancelled");

    const pendingClaims = slots.reduce((sum, item) => {
      const itemClaims = item.claims || [];
      return sum + itemClaims.filter((claim) => claim.status === "pending").length;
    }, 0);

    const value = confirmed.reduce((sum, item) => {
      const price = Number(item.price || 0);
      return sum + (Number.isNaN(price) ? 0 : price);
    }, 0);

    const { data: waitlistData, error: waitlistError } = await supabase
      .from("waitlist_entries")
      .select("id, status")
      .eq("business_id", businessId);

    if (waitlistError) {
      console.error(waitlistError);
    }

    const activeWaitlist = (waitlistData || []).filter(
      (item) => item.status === "active" || item.status === "contacted"
    );

    setApprovedCount(confirmed.length);
    setApprovedValue(value);
    setPendingCount(pendingClaims);
    setCancelledCount(cancelled.length);
    setActiveWaitlistCount(activeWaitlist.length);
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

    setClaims(sortClaims((claimsData || []) as Claim[]));
    setClientClaim(null);
    setShowClientPage(view === "client");
    setShowWaitlistSignup(false);
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

      if (data.user) {
        const allowed = await checkPaidAccess();

        if (allowed) {
          await loadBusiness(data.user.id);
        } else {
          setBusiness(null);
        }
      }
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

      if (data.user) {
        const allowed = await checkPaidAccess();

        if (allowed) {
          await loadBusiness(data.user.id);
        } else {
          setBusiness(null);
        }
      }
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
    setAccessStatus("guest");
    setAuthMode("login");

    window.history.pushState({}, "", "/");

    setLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();

    setSession(null);
    setUser(null);
    setBusiness(null);
    setAccessStatus("guest");
    setSlot(null);
    setClaims([]);
    setClientClaim(null);
    setHistory([]);
    setWaitlistEntries([]);

    setShowClientPage(false);
    setShowCreateSlot(false);
    setShowHistory(false);
    setShowWaitlist(false);
    setShowWaitlistSignup(false);
    setShowEditBusiness(false);
    setShowEditSlot(false);
    setClientSubmitted(false);
    setWaitlistSubmitted(false);

    window.history.pushState({}, "", "/");
  }

  function guardPaidAccess() {
    if (accessStatus !== "allowed") {
      alert("הגישה לפעולה הזו פתוחה למנויות פעילות בלבד.");
      return false;
    }

    return true;
  }

  async function handleCreateBusiness(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!guardPaidAccess()) return;
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
      alert("שגיאה ביצירת העסק. ייתכן שאין לחשבון הזה גישה פעילה.");
      setLoading(false);
      return;
    }

    setBusiness(data);
    await loadDashboardStats(data.id);
    setLoading(false);
  }

  async function handleUpdateBusiness(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!guardPaidAccess()) return;
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

    if (!guardPaidAccess()) return;

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
      alert("שגיאה ביצירת התור. ייתכן שאין לחשבון הזה גישה פעילה.");
      setLoading(false);
      return;
    }

    setSlot(data);
    setClaims([]);
    setClientClaim(null);
    setClientSubmitted(false);

    setShowCreateSlot(false);
    setShowHistory(false);
    setShowWaitlist(false);
    setShowClientPage(false);
    setShowEditSlot(false);

    window.history.pushState({}, "", `/?slot=${data.id}`);

    await loadDashboardStats(business.id);
    setLoading(false);
  }

  async function handleUpdateSlot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!guardPaidAccess()) return;

    if (!slot || !business || slot.business_id !== business.id) {
      alert("אין לך הרשאה לערוך את התור הזה");
      return;
    }

    if (slot.status === "confirmed") {
      alert("התור כבר נסגר. אם צריך, מחקי או בטלי אותו.");
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

    if (slot.status === "confirmed") {
      alert("התור כבר נסגר");
      return;
    }

    if (slot.status === "cancelled") {
      alert("התור כבר לא זמין");
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

    const { data, error: claimError } = await supabase
      .from("claims")
      .insert(newClaim)
      .select()
      .single();

    if (claimError) {
      console.error(claimError);
      alert("שגיאה בשליחת הבקשה. נסי שוב בעוד רגע.");
      setLoading(false);
      return;
    }

    await sendClaimEmailNotification(slot.id, clientName, clientPhone);

    const insertedClaim = data as Claim;

    setClientClaim(insertedClaim);
    setClaims((prev) => sortClaims([insertedClaim, ...prev]));
    setClientSubmitted(true);
    setShowClientPage(true);

    window.history.pushState({}, "", `/?slot=${slot.id}&view=client`);

    setLoading(false);
  }

  async function handleJoinWaitlist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!waitlistBusinessId) {
      alert("לא נמצא עסק לרשימת ההמתנה");
      return;
    }

    setLoading(true);

    const form = new FormData(event.currentTarget);

    const clientName = String(form.get("clientName") || "").trim();
    const clientPhone = String(form.get("clientPhone") || "").trim();
    const serviceInterest = String(form.get("serviceInterest") || "").trim();
    const preferredDays = String(form.get("preferredDays") || "").trim();
    const preferredTimes = String(form.get("preferredTimes") || "").trim();
    const note = String(form.get("note") || "").trim();

    if (!clientName || !clientPhone) {
      alert("צריך למלא שם וטלפון");
      setLoading(false);
      return;
    }

    const { error } = await supabase.from("waitlist_entries").insert({
      business_id: waitlistBusinessId,
      client_name: clientName,
      client_phone: clientPhone,
      service_interest: serviceInterest,
      preferred_days: preferredDays,
      preferred_times: preferredTimes,
      note,
      status: "active",
    });

    if (error) {
      console.error(error);
      alert("לא הצלחתי להצטרף לרשימת ההמתנה. נסי שוב.");
      setLoading(false);
      return;
    }

    setWaitlistSubmitted(true);
    setLoading(false);
  }

  async function loadHistory() {
    if (!guardPaidAccess()) return;
    if (!business) return;

    setLoading(true);

    setShowHistory(true);
    setShowWaitlist(false);
    setShowCreateSlot(false);
    setShowClientPage(false);
    setShowEditBusiness(false);
    setShowEditSlot(false);
    setSlot(null);
    setClaims([]);
    setClientClaim(null);
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

    const items = ((data || []) as HistoryItem[]).map((item) => ({
      ...item,
      claims: sortClaims(item.claims || []),
    }));

    setHistory(items);
    window.history.pushState({}, "", "/");

    setLoading(false);
  }

  async function loadWaitlist() {
    if (!guardPaidAccess()) return;
    if (!business) return;

    setLoading(true);

    setShowWaitlist(true);
    setShowHistory(false);
    setShowCreateSlot(false);
    setShowClientPage(false);
    setShowEditBusiness(false);
    setShowEditSlot(false);
    setSlot(null);
    setClaims([]);
    setClientClaim(null);
    setClientSubmitted(false);

    const { data, error } = await supabase
      .from("waitlist_entries")
      .select("*")
      .eq("business_id", business.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      alert("לא הצלחתי לטעון רשימת המתנה");
      setLoading(false);
      return;
    }

    setWaitlistEntries(sortWaitlist((data || []) as WaitlistEntry[]));
    window.history.pushState({}, "", "/");

    setLoading(false);
  }

  async function updateWaitlistStatus(entry: WaitlistEntry, status: string) {
    if (!guardPaidAccess()) return;
    if (!business) return;

    setLoading(true);

    const { error } = await supabase
      .from("waitlist_entries")
      .update({ status })
      .eq("id", entry.id);

    if (error) {
      console.error(error);
      alert("שגיאה בעדכון הסטטוס");
      setLoading(false);
      return;
    }

    await loadWaitlist();
    await loadDashboardStats(business.id);
    setLoading(false);
  }

  async function deleteWaitlistEntry(entry: WaitlistEntry) {
    if (!guardPaidAccess()) return;

    const confirmed = window.confirm(
      `למחוק את ${entry.client_name} מרשימת ההמתנה?`
    );

    if (!confirmed) return;

    setLoading(true);

    const { error } = await supabase
      .from("waitlist_entries")
      .delete()
      .eq("id", entry.id);

    if (error) {
      console.error(error);
      alert("שגיאה במחיקת הרשומה");
      setLoading(false);
      return;
    }

    if (business) {
      await loadDashboardStats(business.id);
    }

    await loadWaitlist();
    setLoading(false);
  }

  async function approveClaim(claimToApprove: Claim, slotToApprove?: Slot) {
    if (!guardPaidAccess()) return;

    const activeSlot = slotToApprove || slot;

    if (!business || !claimToApprove || !activeSlot) return;

    if (activeSlot.business_id !== business.id) {
      alert("אין לך הרשאה לאשר את התור הזה");
      return;
    }

    if (activeSlot.status === "cancelled") {
      alert("אי אפשר לסגור תור שבוטל");
      return;
    }

    if (activeSlot.status === "confirmed") {
      alert("התור כבר נסגר");
      return;
    }

    const confirmed = window.confirm(
      `לסגור את התור עם ${claimToApprove.client_name}? שאר הבקשות הממתינות יסומנו כנדחו.`
    );

    if (!confirmed) return;

    setLoading(true);

    const { error: claimError } = await supabase
      .from("claims")
      .update({ status: "approved" })
      .eq("id", claimToApprove.id);

    if (claimError) {
      console.error(claimError);
      alert("שגיאה באישור הבקשה");
      setLoading(false);
      return;
    }

    const { error: rejectOtherClaimsError } = await supabase
      .from("claims")
      .update({ status: "rejected" })
      .eq("slot_id", activeSlot.id)
      .neq("id", claimToApprove.id)
      .eq("status", "pending");

    if (rejectOtherClaimsError) {
      console.error(rejectOtherClaimsError);
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

  async function rejectClaim(claimToReject: Claim, slotToReject?: Slot) {
    if (!guardPaidAccess()) return;

    const activeSlot = slotToReject || slot;

    if (!business || !claimToReject || !activeSlot) return;

    if (activeSlot.business_id !== business.id) {
      alert("אין לך הרשאה לדחות את הבקשה הזאת");
      return;
    }

    if (claimToReject.status === "approved") {
      alert("אי אפשר לדחות בקשה שכבר אושרה");
      return;
    }

    const confirmed = window.confirm(
      `לדחות את הבקשה של ${claimToReject.client_name}? התור יישאר פתוח לבקשות נוספות.`
    );

    if (!confirmed) return;

    setLoading(true);

    const { error: claimError } = await supabase
      .from("claims")
      .update({ status: "rejected" })
      .eq("id", claimToReject.id);

    if (claimError) {
      console.error(claimError);
      alert("שגיאה בדחיית הבקשה");
      setLoading(false);
      return;
    }

    alert("הבקשה נדחתה. התור עדיין פתוח לבקשות נוספות.");

    await loadDashboardStats(business.id);

    if (showHistory) {
      await loadHistory();
    } else {
      await loadSlotFromUrl();
    }

    setLoading(false);
  }

  async function cancelSlot(slotToCancel?: Slot) {
    if (!guardPaidAccess()) return;

    const activeSlot = slotToCancel || slot;

    if (!business || !activeSlot) return;

    if (activeSlot.business_id !== business.id) {
      alert("אין לך הרשאה לבטל את התור הזה");
      return;
    }

    const confirmed = window.confirm(
      "לבטל את התור? הוא יישאר בהיסטוריה, אבל לקוחות לא יוכלו לבקש אותו."
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

  async function reopenSlot(slotToReopen?: Slot) {
    if (!guardPaidAccess()) return;

    const activeSlot = slotToReopen || slot;

    if (!business || !activeSlot) return;

    if (activeSlot.business_id !== business.id) {
      alert("אין לך הרשאה לפתוח את התור הזה");
      return;
    }

    const confirmed = window.confirm(
      "לפתוח את התור שוב לבקשות? בקשות קיימות יישארו כמו שהן."
    );

    if (!confirmed) return;

    setLoading(true);

    const { error } = await supabase
      .from("slots")
      .update({ status: "open" })
      .eq("id", activeSlot.id);

    if (error) {
      console.error(error);
      alert("שגיאה בפתיחת התור");
      setLoading(false);
      return;
    }

    alert("התור נפתח שוב לבקשות");

    await loadDashboardStats(business.id);

    if (showHistory) {
      await loadHistory();
    } else {
      await loadSlotFromUrl();
    }

    setLoading(false);
  }

  async function deleteSlot(slotToDelete?: Slot) {
    if (!guardPaidAccess()) return;

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
    setClaims([]);
    setClientClaim(null);
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
    setClaims([]);
    setClientClaim(null);
    setHistory([]);
    setWaitlistEntries([]);
    setShowClientPage(false);
    setShowCreateSlot(false);
    setShowHistory(false);
    setShowWaitlist(false);
    setShowEditBusiness(false);
    setShowEditSlot(false);
    setClientSubmitted(false);
    setWaitlistSubmitted(false);

    window.history.pushState({}, "", "/");

    if (business && accessStatus === "allowed") {
      loadDashboardStats(business.id);
    }
  }

  function goToCreateSlot() {
    if (!guardPaidAccess()) return;

    setShowCreateSlot(true);
    setShowHistory(false);
    setShowWaitlist(false);
    setShowClientPage(false);
    setShowEditBusiness(false);
    setShowEditSlot(false);
    setSlot(null);
    setClaims([]);
    setClientClaim(null);
    setClientSubmitted(false);
    window.history.pushState({}, "", "/");
  }

  function openSlotFromHistory(historySlot: HistoryItem) {
    setSlot(historySlot);
    setClaims(sortClaims(historySlot.claims || []));
    setClientClaim(null);
    setShowHistory(false);
    setShowWaitlist(false);
    setShowCreateSlot(false);
    setShowEditBusiness(false);
    setShowEditSlot(false);
    setShowClientPage(false);
    setClientSubmitted(false);

    window.history.pushState({}, "", `/?slot=${historySlot.id}`);
  }

  function statusLabel(status: string) {
    if (status === "open") return "פתוח לבקשות";
    if (status === "claimed") return "פתוח לבקשות";
    if (status === "confirmed") return "נסגר בהצלחה";
    if (status === "cancelled") return "בוטל";
    if (status === "approved") return "אושרה";
    if (status === "pending") return "ממתינה";
    if (status === "rejected") return "נדחתה";
    if (status === "active") return "פעילה";
    if (status === "contacted") return "נשלחה הודעה";
    if (status === "booked") return "נסגר איתה";
    if (status === "inactive") return "לא פעילה";
    return status;
  }

  function statusClass(status: string) {
    if (status === "open" || status === "claimed" || status === "active") {
      return "status-open";
    }

    if (status === "pending" || status === "contacted") {
      return "status-requested";
    }

    if (status === "confirmed" || status === "approved" || status === "booked") {
      return "status-confirmed";
    }

    if (
      status === "cancelled" ||
      status === "rejected" ||
      status === "inactive"
    ) {
      return "status-cancelled";
    }

    return "status-open";
  }

  function buildClientToBusinessWhatsappLink() {
    if (!slot || !clientClaim) return "";

    const targetPhone = normalizePhoneForWhatsapp(slot.business_phone);
    if (!targetPhone) return "";

    const message = `היי, ראיתי שהתפנה תור דרך תורפול.

שם: ${clientClaim.client_name}
טלפון: ${clientClaim.client_phone}

אני רוצה את התור:
${slot.service_name}
תאריך: ${formatDate(slot.slot_date)}
שעה: ${formatTime(slot.slot_time)}
${slot.price ? `מחיר: ${slot.price} ₪` : ""}

השארתי פרטים באתר ומחכה לאישור.`;

    return buildWhatsappUrl(targetPhone, message);
  }

  function buildApprovalWhatsappLink(
    claimToSend?: Claim | null,
    slotToSend?: Slot | null
  ) {
    const activeSlot = slotToSend || slot;

    if (!claimToSend || !activeSlot) return "";

    const targetPhone = normalizePhoneForWhatsapp(claimToSend.client_phone);
    if (!targetPhone) return "";

    const message = `היי ${claimToSend.client_name},

התור שלך אושר.

פרטי התור:
${activeSlot.service_name}
תאריך: ${formatDate(activeSlot.slot_date)}
שעה: ${formatTime(activeSlot.slot_time)}
${activeSlot.price ? `מחיר: ${activeSlot.price} ₪` : ""}

נתראה.`;

    return buildWhatsappUrl(targetPhone, message);
  }

  function buildRejectionWhatsappLink(
    claimToSend?: Claim | null,
    slotToSend?: Slot | null
  ) {
    const activeSlot = slotToSend || slot;

    if (!claimToSend || !activeSlot) return "";

    const targetPhone = normalizePhoneForWhatsapp(claimToSend.client_phone);
    if (!targetPhone) return "";

    const message = `היי ${claimToSend.client_name},

תודה שהשארת פרטים.
התור הזה כבר לא מתאים או נתפס, אבל אעדכן אותך כשיתפנה תור חדש.

פרטי התור:
${activeSlot.service_name}
תאריך: ${formatDate(activeSlot.slot_date)}
שעה: ${formatTime(activeSlot.slot_time)}`;

    return buildWhatsappUrl(targetPhone, message);
  }

  function buildCancellationWhatsappLink(
    claimToSend?: Claim | null,
    slotToSend?: Slot | null
  ) {
    const activeSlot = slotToSend || slot;

    if (!claimToSend || !activeSlot) return "";

    const targetPhone = normalizePhoneForWhatsapp(claimToSend.client_phone);
    if (!targetPhone) return "";

    const message = `היי ${claimToSend.client_name},

לצערי התור שהתבקשת אליו בוטל.

פרטי התור:
${activeSlot.service_name}
תאריך: ${formatDate(activeSlot.slot_date)}
שעה: ${formatTime(activeSlot.slot_time)}
${activeSlot.price ? `מחיר: ${activeSlot.price} ₪` : ""}

אעדכן אותך כשיתפנה תור חדש.`;

    return buildWhatsappUrl(targetPhone, message);
  }

  function buildWaitlistWhatsappLink(entry: WaitlistEntry, slotToSend?: Slot | null) {
    if (!entry) return "";

    const targetPhone = normalizePhoneForWhatsapp(entry.client_phone);
    if (!targetPhone) return "";

    const activeSlot = slotToSend || slot;

    const message = activeSlot
      ? `היי ${entry.client_name},

התפנה תור שאולי יכול להתאים לך:

${activeSlot.service_name}
תאריך: ${formatDate(activeSlot.slot_date)}
שעה: ${formatTime(activeSlot.slot_time)}
${activeSlot.price ? `מחיר: ${activeSlot.price} ₪` : ""}

אם זה מתאים לך, אפשר להשאיר בקשה כאן:
${window.location.origin}/?slot=${activeSlot.id}&view=client`
      : `היי ${entry.client_name},

ראיתי שנרשמת לרשימת ההמתנה.
כשיתפנה תור מתאים אעדכן אותך.`;

    return buildWhatsappUrl(targetPhone, message);
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

    const message = `היי אהובות 🤍

התפנה לי תור ל-${targetSlot.service_name}
בתאריך ${formatDate(targetSlot.slot_date)}
בשעה ${formatTime(targetSlot.slot_time)}
${targetSlot.price ? `מחיר: ${targetSlot.price} ₪` : ""}

מי שרוצה יכולה להשאיר פרטים כאן:
${link}

השארת פרטים לא מאשרת את התור אוטומטית.
אני אאשר מול הלקוחה המתאימה 🙏`;

    navigator.clipboard.writeText(message);
    alert("הודעת WhatsApp הועתקה");
  }

  function copyWaitlistLink() {
    if (!waitlistLink) return;

    navigator.clipboard.writeText(waitlistLink);
    alert("לינק רשימת ההמתנה הועתק");
  }

  function copyWaitlistWhatsappMessage() {
    if (!waitlistLink) return;

    const message = `היי אהובות 🤍

פתחתי רשימת המתנה לתורים שמתפנים.
מי שרוצה שאעדכן אותה כשמתפנה תור, יכולה להשאיר פרטים כאן:

${waitlistLink}

כשיתפנה תור מתאים — אעדכן לפי זמינות 🙏`;

    navigator.clipboard.writeText(message);
    alert("הודעת רשימת ההמתנה הועתקה");
  }

  function screenLabel() {
    if (authMode === "reset") return "איפוס סיסמה";
    if (showWaitlistSignup) return "רשימת המתנה";
    if (accessStatus === "denied" && session) return "גישה למנויות בלבד";
    if (isLandingPage) return "מערכת מילוי ביטולים";
    if (showHistory) return "היסטוריית תורים";
    if (showWaitlist) return "רשימת המתנה";
    if (showEditBusiness) return "הגדרות העסק";
    if (showCreateSlot) return "יצירת תור";
    if (showEditSlot) return "עריכת תור";
    if (slot && showClientPage) return "בקשת תור";
    if (slot && isOwnerView) return "ניהול תור";
    if (isDashboardPage) return "דשבורד";
    return "TorPool";
  }

  const clientWhatsappLink = buildClientToBusinessWhatsappLink();

  if (loading || (session && accessStatus === "checking")) {
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

  if (showWaitlistSignup) {
    return (
      <div className="app-shell" dir="rtl">
        <div className="page-frame">
          <header className="topbar">
            <div className="brand-box">
              <LogoMark />
              <div className="brand-copy">
                <div className="eyebrow">רשימת המתנה</div>
                <h1 className="brand-title">תורפול</h1>
                <p className="brand-subtitle">כשמתפנה תור — תהיי הראשונה לדעת.</p>
              </div>
            </div>
          </header>

          <section className="hero-card glass-card hero-grid">
            <div className="hero-copy">
              <span className="section-kicker">הצטרפות לרשימת המתנה</span>
              <h2>רוצה לדעת כשמתפנה תור?</h2>
              <p>
                השאירי פרטים, ובעלת העסק תוכל לעדכן אותך כשמתפנה תור שמתאים לך.
                ההצטרפות לא מאשרת תור אוטומטית.
              </p>

              <div className="hero-bullets">
                <div className="mini-pill">בלי לרדוף אחרי סטוריז</div>
                <div className="mini-pill">מקבלת עדכון כשמתפנה תור</div>
                <div className="mini-pill">אפשר לציין טיפול מועדף</div>
                <div className="mini-pill">בעלת העסק מאשרת סופית</div>
              </div>
            </div>

            <div className="form-card glass-card accent-card">
              {waitlistSubmitted ? (
                <>
                  <div className="card-head">
                    <span className="section-kicker">נשלח</span>
                    <h3>נכנסת לרשימת ההמתנה</h3>
                  </div>

                  <p className="form-help">
                    הפרטים נשמרו. כשיתפנה תור מתאים, בעלת העסק תוכל ליצור איתך קשר.
                  </p>
                </>
              ) : (
                <>
                  <div className="card-head">
                    <span className="section-kicker">השארת פרטים</span>
                    <h3>הצטרפי לרשימת ההמתנה</h3>
                  </div>

                  <form className="form-grid" onSubmit={handleJoinWaitlist}>
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

                    <label className="field field-full">
                      <span>איזה טיפול מעניין אותך?</span>
                      <input
                        name="serviceInterest"
                        placeholder="לדוגמה: טיפול פנים / לק ג׳ל / ריסים"
                      />
                    </label>

                    <label className="field">
                      <span>ימים שנוחים לך</span>
                      <input
                        name="preferredDays"
                        placeholder="לדוגמה: ראשון, שלישי, חמישי"
                      />
                    </label>

                    <label className="field">
                      <span>שעות שנוחות לך</span>
                      <input
                        name="preferredTimes"
                        placeholder="לדוגמה: בוקר / ערב / גמיש"
                      />
                    </label>

                    <label className="field field-full">
                      <span>הערה</span>
                      <textarea
                        name="note"
                        placeholder="כל דבר שחשוב שבעלת העסק תדע"
                      />
                    </label>

                    <div className="field-full form-actions">
                      <button className="btn btn-primary" type="submit">
                        הצטרפי לרשימת המתנה
                      </button>
                    </div>
                  </form>
                </>
              )}
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (session && authMode !== "reset" && accessStatus === "denied") {
    const paymentMessage = encodeURIComponent(
      `היי, אני רוצה להצטרף למנוי של תורפול. נרשמתי עם האימייל: ${
        user?.email || ""
      }`
    );

    const paymentWhatsappLink = `https://wa.me/${paymentWhatsappPhone}?text=${paymentMessage}`;

    return (
      <div className="app-shell" dir="rtl">
        <div className="page-frame">
          <header className="topbar">
            <div className="brand-box">
              <LogoMark />
              <div className="brand-copy">
                <div className="eyebrow">גישה למנויות בלבד</div>
                <h1 className="brand-title">תורפול</h1>
                <p className="brand-subtitle">תור שהתבטל? הופכים אותו להזדמנות.</p>
              </div>
            </div>

            <div className="topbar-side">
              <button className="btn btn-secondary btn-small" onClick={handleLogout}>
                התנתקות
              </button>
            </div>
          </header>

          <section className="hero-card glass-card hero-grid">
            <div className="hero-copy">
              <span className="section-kicker">מנוי נדרש</span>
              <h2>הגישה לתורפול פתוחה למנויות פעילות בלבד</h2>
              <p>
                החשבון שלך נוצר בהצלחה, אבל עדיין לא הופעלה לך גישה למערכת.
                כדי להשתמש בתורפול צריך להצטרף למנוי הפיילוט.
              </p>

              <div className="hero-bullets">
                <div className="mini-pill">יצירת תורים שהתפנו</div>
                <div className="mini-pill">בקשות לקוחות מסודרות</div>
                <div className="mini-pill">רשימת המתנה מוכנה</div>
                <div className="mini-pill">מעקב הכנסה שחזרה</div>
              </div>
            </div>

            <div className="form-card glass-card accent-card">
              <div className="card-head">
                <span className="section-kicker">פיילוט</span>
                <h3>מנוי לעסקים ראשונים</h3>
              </div>

              <div className="price-card">
                <strong>49 ₪</strong>
                <span>לחודש בתקופת הפיילוט</span>
              </div>

              <p className="form-help">
                אחרי התשלום, הגישה שלך תופעל לפי האימייל שאיתו נרשמת.
              </p>

              <div className="action-row">
                <a
                  className="btn btn-primary"
                  href={paymentWhatsappLink}
                  target="_blank"
                  rel="noreferrer"
                >
                  בקשת הצטרפות למנוי
                </a>

                <button className="btn btn-secondary" onClick={handleLogout}>
                  התנתקות
                </button>
              </div>
            </div>
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
              <p className="brand-subtitle">תור שהתבטל? הופכים אותו להזדמנות.</p>
            </div>
          </div>

          <div className="topbar-side">
            <span className="header-chip">
              מערכת מילוי ביטולים ורשימת המתנה לעסקים קטנים
            </span>
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
                <h2>הופכים ביטולים של הרגע האחרון לתורים סגורים</h2>
                <p>
                  תורפול מרכזת את כל הבקשות לתור שהתפנה במקום אחד,
                  עוזרת לך לבחור למי לאשר, ושומרת לך היסטוריה של הכנסה
                  שחזרה ליומן.
                </p>

                <div className="hero-bullets">
                  <div className="mini-pill">לינק אחד במקום בלגן בהודעות</div>
                  <div className="mini-pill">כל הבקשות במקום אחד</div>
                  <div className="mini-pill">רשימת המתנה מוכנה</div>
                  <div className="mini-pill">תור אחד יכול להחזיר את כל המנוי</div>
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
                <h3>לינק אחד במקום בלגן</h3>
                <p>
                  מפרסמת תור שהתפנה ושולחת לינק מסודר לסטורי, WhatsApp או רשימת תפוצה.
                </p>
              </article>

              <article className="glass-card feature-card">
                <div className="feature-icon">02</div>
                <h3>כל הבקשות במקום אחד</h3>
                <p>
                  במקום עשר הודעות פרטיות, את רואה את כל מי שרוצה את התור במסך אחד.
                </p>
              </article>

              <article className="glass-card feature-card">
                <div className="feature-icon">03</div>
                <h3>רשימת המתנה מוכנה</h3>
                <p>
                  לקוחות יכולות להירשם מראש, וכשמתפנה תור את לא מתחילה מאפס.
                </p>
              </article>
            </section>

            <section className="glass-card form-card">
              <div className="card-head">
                <span className="section-kicker">למה לא פשוט לשלוח הודעה?</span>
                <h3>כי הודעה מביאה תגובות. תורפול מביאה סדר.</h3>
              </div>

              <p className="form-help">
                במקום “אני רוצה”, “עדיין פנוי?”, “אפשר אותי?” בעשרות צ׳אטים —
                את מקבלת רשימת בקשות מסודרת לתור אחד, עם סטטוס ברור ויכולת
                לסגור מהר עם הלקוחה הנכונה.
              </p>
            </section>
          </>
        )}

        {session &&
          accessStatus === "allowed" &&
          !business &&
          !slot &&
          authMode !== "reset" && (
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
                  בעלת העסק קיבלה את הפרטים במערכת. כדי לוודא שהיא תראה את זה מיד,
                  אפשר לשלוח לה גם WhatsApp.
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
                  <p className="form-help">
                    יכול להיות שגם לקוחות נוספות יבקשו את התור. בעלת העסק תבחר למי לאשר.
                  </p>

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
                  <div className="mini-pill">פתוח = אפשר לקבל עוד בקשות</div>
                  <div className="mini-pill">נסגר = התור נתפס</div>
                  <div className="mini-pill">רשימת המתנה = ביקוש מוכן</div>
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
                  <span>בקשות שממתינות</span>
                </div>

                <div className="stat-card">
                  <strong>{activeWaitlistCount}</strong>
                  <span>ברשימת המתנה</span>
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

                  <button className="btn btn-secondary" onClick={loadWaitlist}>
                    רשימת המתנה
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
                  <span className="section-kicker">רשימת המתנה</span>
                  <h3>ביקוש מוכן לפני שהתור מתפנה</h3>
                </div>

                <p className="form-help">
                  שלחי ללקוחות לינק קבוע לרשימת המתנה. כשיתפנה תור, כבר תהיה לך
                  רשימה של לקוחות שרוצות לשמוע ממך.
                </p>

                <div className="action-row">
                  <button className="btn btn-secondary" onClick={copyWaitlistLink}>
                    העתיקי לינק רשימת המתנה
                  </button>

                  <button
                    className="btn btn-success"
                    onClick={copyWaitlistWhatsappMessage}
                  >
                    הודעת WhatsApp לרשימת המתנה
                  </button>
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

        {showWaitlist && business && authMode !== "reset" && (
          <section className="section-block">
            <div className="section-head">
              <span className="section-kicker">רשימת המתנה</span>
              <h3>לקוחות שמחכות לתור שהתפנה</h3>
            </div>

            <div className="form-card glass-card">
              <div className="card-head">
                <span className="section-kicker">הפצה</span>
                <h3>לינק קבוע להצטרפות</h3>
              </div>

              <p className="form-help">
                שלחי את הלינק הזה ללקוחות. הן יירשמו מראש, וכשיתפנה תור תוכלי
                לפנות אליהן מהר.
              </p>

              <div className="slot-link-box">
                <span>לינק רשימת המתנה</span>
                <div className="link-row">
                  <input value={waitlistLink} readOnly />
                  <button
                    className="btn btn-secondary btn-small"
                    onClick={copyWaitlistLink}
                  >
                    העתקי לינק
                  </button>
                </div>
              </div>

              <div className="action-row">
                <button
                  className="btn btn-success"
                  onClick={copyWaitlistWhatsappMessage}
                >
                  הודעת WhatsApp לרשימת המתנה
                </button>
              </div>
            </div>

            {waitlistEntries.length === 0 ? (
              <div className="glass-card">
                <div className="empty-state">
                  <h3>אין עדיין לקוחות ברשימת ההמתנה</h3>
                  <p>
                    העתיקי את ההודעה ושלחי ללקוחות. מי שתשאיר פרטים תופיע כאן.
                  </p>
                </div>
              </div>
            ) : (
              <div className="history-list">
                {waitlistEntries.map((entry) => {
                  const whatsappLink = buildWaitlistWhatsappLink(entry, slot);

                  return (
                    <article className="history-card glass-card" key={entry.id}>
                      <div className="history-main">
                        <div>
                          <h4>{entry.client_name}</h4>
                          <p className="slot-meta-line">{entry.client_phone}</p>
                        </div>

                        <span className={`status-badge ${statusClass(entry.status)}`}>
                          {statusLabel(entry.status)}
                        </span>
                      </div>

                      <div className="request-box">
                        <div className="request-title">פרטי העדפה</div>

                        <div className="request-grid">
                          <div>
                            <span>טיפול</span>
                            <strong>{entry.service_interest || "לא צוין"}</strong>
                          </div>

                          <div>
                            <span>ימים</span>
                            <strong>{entry.preferred_days || "לא צוין"}</strong>
                          </div>

                          <div>
                            <span>שעות</span>
                            <strong>{entry.preferred_times || "לא צוין"}</strong>
                          </div>
                        </div>

                        {entry.note && (
                          <div className="request-note">
                            <span>הערה</span>
                            <p>{entry.note}</p>
                          </div>
                        )}
                      </div>

                      <div className="action-row">
                        {whatsappLink && (
                          <a
                            className="btn btn-success"
                            href={whatsappLink}
                            target="_blank"
                            rel="noreferrer"
                            onClick={() => updateWaitlistStatus(entry, "contacted")}
                          >
                            שלחי WhatsApp
                          </a>
                        )}

                        {entry.status !== "booked" && (
                          <button
                            className="btn btn-secondary"
                            onClick={() => updateWaitlistStatus(entry, "booked")}
                          >
                            סומן כנסגר
                          </button>
                        )}

                        {entry.status !== "inactive" && (
                          <button
                            className="btn btn-warning"
                            onClick={() => updateWaitlistStatus(entry, "inactive")}
                          >
                            לא פעילה
                          </button>
                        )}

                        {entry.status !== "active" && (
                          <button
                            className="btn btn-secondary"
                            onClick={() => updateWaitlistStatus(entry, "active")}
                          >
                            החזרה לפעילה
                          </button>
                        )}

                        <button
                          className="btn btn-danger"
                          onClick={() => deleteWaitlistEntry(entry)}
                        >
                          מחיקה
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
                  const itemClaims = sortClaims(item.claims || []);
                  const pendingItemClaims = itemClaims.filter(
                    (itemClaim) => itemClaim.status === "pending"
                  );

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

                      {itemClaims.length > 0 ? (
                        <div className="request-box">
                          <div className="request-title">
                            בקשות לתור ({itemClaims.length})
                          </div>

                          <div className="request-list">
                            {itemClaims.map((itemClaim) => {
                              const approvalLink = buildApprovalWhatsappLink(
                                itemClaim,
                                item
                              );
                              const rejectionLink = buildRejectionWhatsappLink(
                                itemClaim,
                                item
                              );
                              const cancellationLink = buildCancellationWhatsappLink(
                                itemClaim,
                                item
                              );

                              return (
                                <div className="request-item" key={itemClaim.id}>
                                  <div className="request-grid">
                                    <div>
                                      <span>שם</span>
                                      <strong>{itemClaim.client_name}</strong>
                                    </div>

                                    <div>
                                      <span>טלפון</span>
                                      <strong>{itemClaim.client_phone}</strong>
                                    </div>

                                    <div>
                                      <span>סטטוס</span>
                                      <strong>{statusLabel(itemClaim.status)}</strong>
                                    </div>
                                  </div>

                                  <div className="action-row">
                                    {itemClaim.status === "pending" &&
                                      item.status !== "confirmed" &&
                                      item.status !== "cancelled" && (
                                        <button
                                          className="btn btn-success btn-small"
                                          onClick={() => approveClaim(itemClaim, item)}
                                        >
                                          סגרי איתה
                                        </button>
                                      )}

                                    {itemClaim.status === "pending" &&
                                      item.status !== "confirmed" &&
                                      item.status !== "cancelled" && (
                                        <button
                                          className="btn btn-secondary btn-small"
                                          onClick={() => rejectClaim(itemClaim, item)}
                                        >
                                          דחי בקשה
                                        </button>
                                      )}

                                    {itemClaim.status === "pending" &&
                                      item.status !== "confirmed" &&
                                      item.status !== "cancelled" &&
                                      rejectionLink && (
                                        <a
                                          className="btn btn-secondary btn-small"
                                          href={rejectionLink}
                                          target="_blank"
                                          rel="noreferrer"
                                        >
                                          הודעת דחייה
                                        </a>
                                      )}

                                    {itemClaim.status === "approved" &&
                                      approvalLink &&
                                      item.status !== "cancelled" && (
                                        <a
                                          className="btn btn-success btn-small"
                                          href={approvalLink}
                                          target="_blank"
                                          rel="noreferrer"
                                        >
                                          הודעת אישור
                                        </a>
                                      )}

                                    {item.status === "cancelled" && cancellationLink && (
                                      <a
                                        className="btn btn-secondary btn-small"
                                        href={cancellationLink}
                                        target="_blank"
                                        rel="noreferrer"
                                      >
                                        הודעת ביטול
                                      </a>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
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

                        {item.status === "cancelled" && (
                          <button
                            className="btn btn-secondary"
                            onClick={() => reopenSlot(item)}
                          >
                            פתחי מחדש
                          </button>
                        )}

                        {item.status !== "cancelled" && item.status !== "confirmed" && (
                          <button
                            className="btn btn-warning"
                            onClick={() => cancelSlot(item)}
                          >
                            בטלי תור
                          </button>
                        )}

                        <button
                          className="btn btn-danger"
                          onClick={() => deleteSlot(item)}
                        >
                          מחיקה מלאה
                        </button>
                      </div>

                      {pendingItemClaims.length > 1 &&
                        item.status !== "confirmed" &&
                        item.status !== "cancelled" && (
                          <p className="form-help">
                            יש כמה בקשות ממתינות. בחרי לקוחה אחת לסגירה, והשאר
                            יסומנו כנדחו אוטומטית.
                          </p>
                        )}
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

                {claims.length > 0 ? (
                  <div className="request-box">
                    <div className="request-title">בקשות לתור ({claims.length})</div>

                    <div className="request-list">
                      {claims.map((itemClaim) => {
                        const approvalLink = buildApprovalWhatsappLink(
                          itemClaim,
                          slot
                        );
                        const rejectionLink = buildRejectionWhatsappLink(
                          itemClaim,
                          slot
                        );
                        const cancellationLink = buildCancellationWhatsappLink(
                          itemClaim,
                          slot
                        );

                        return (
                          <div className="request-item" key={itemClaim.id}>
                            <div className="request-grid">
                              <div>
                                <span>שם</span>
                                <strong>{itemClaim.client_name}</strong>
                              </div>

                              <div>
                                <span>טלפון</span>
                                <strong>{itemClaim.client_phone}</strong>
                              </div>

                              <div>
                                <span>סטטוס</span>
                                <strong>{statusLabel(itemClaim.status)}</strong>
                              </div>
                            </div>

                            <div className="action-row">
                              {itemClaim.status === "pending" &&
                                slot.status !== "confirmed" &&
                                slot.status !== "cancelled" && (
                                  <button
                                    className="btn btn-success btn-small"
                                    onClick={() => approveClaim(itemClaim)}
                                  >
                                    סגרי איתה
                                  </button>
                                )}

                              {itemClaim.status === "pending" &&
                                slot.status !== "confirmed" &&
                                slot.status !== "cancelled" && (
                                  <button
                                    className="btn btn-secondary btn-small"
                                    onClick={() => rejectClaim(itemClaim)}
                                  >
                                    דחי בקשה
                                  </button>
                                )}

                              {itemClaim.status === "pending" &&
                                slot.status !== "confirmed" &&
                                slot.status !== "cancelled" &&
                                rejectionLink && (
                                  <a
                                    className="btn btn-secondary btn-small"
                                    href={rejectionLink}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    הודעת דחייה
                                  </a>
                                )}

                              {itemClaim.status === "approved" &&
                                approvalLink &&
                                slot.status !== "cancelled" && (
                                  <a
                                    className="btn btn-success btn-small"
                                    href={approvalLink}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    הודעת אישור
                                  </a>
                                )}

                              {slot.status === "cancelled" && cancellationLink && (
                                <a
                                  className="btn btn-secondary btn-small"
                                  href={cancellationLink}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  הודעת ביטול
                                </a>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="request-box">
                    <div className="request-title">אין עדיין בקשות</div>
                    <p className="form-help">
                      שלחי את הלינק ללקוחות. כל מי שתבקש את התור תופיע כאן.
                    </p>
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
                    onClick={loadWaitlist}
                  >
                    רשימת המתנה
                  </button>

                  {slot.status !== "confirmed" && slot.status !== "cancelled" && (
                    <button
                      className="btn btn-secondary"
                      onClick={() => setShowEditSlot(true)}
                    >
                      ערכי תור
                    </button>
                  )}

                  {slot.status === "cancelled" && (
                    <button className="btn btn-secondary" onClick={() => reopenSlot()}>
                      פתחי מחדש
                    </button>
                  )}

                  {slot.status !== "cancelled" && slot.status !== "confirmed" && (
                    <button className="btn btn-warning" onClick={() => cancelSlot()}>
                      בטלי תור
                    </button>
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