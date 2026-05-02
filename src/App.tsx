import { useEffect, useState } from "react";
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

function App() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 760);

  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);

  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [showForm, setShowForm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
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
    function handleResize() {
      setIsMobile(window.innerWidth < 760);
    }

    window.addEventListener("resize", handleResize);

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
      window.removeEventListener("resize", handleResize);
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

  async function handleAuth(event: React.FormEvent<HTMLFormElement>) {
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
    setClientSubmitted(false);
    setApprovedCount(0);
    setApprovedValue(0);
    setPendingCount(0);

    window.history.pushState({}, "", "/");
  }

  async function handleCreateBusiness(event: React.FormEvent<HTMLFormElement>) {
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

  async function loadHistory() {
    if (!business) return;

    setLoading(true);
    setShowHistory(true);
    setShowForm(false);
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

  async function handleCreateSlot(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!business) {
      alert("צריך ליצור עסק לפני יצירת תור");
      return;
    }

    setLoading(true);

    const form = new FormData(event.currentTarget);

    const newSlot = {
      business_id: business.id,
      business_name: business.business_name,
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
    setShowClientPage(false);
    setClientSubmitted(false);

    window.history.pushState({}, "", `/?slot=${data.id}`);

    await loadDashboardStats(business.id);
    setLoading(false);
  }

  async function handleClaimSlot(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!slot) return;

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

  function statusLabel(status: string) {
    if (status === "open") return "פתוח לשליחה";
    if (status === "claimed") return "יש בקשה לאישור";
    if (status === "confirmed") return "התור אושר";
    if (status === "approved") return "אושר";
    if (status === "pending") return "ממתין לאישור";
    return status;
  }

  function statusIcon(status: string) {
    if (status === "open") return "🟢";
    if (status === "claimed") return "🟡";
    if (status === "confirmed") return "✅";
    if (status === "approved") return "✅";
    if (status === "pending") return "🟡";
    return "•";
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
    setClientSubmitted(false);
    window.history.pushState({}, "", "/");

    if (business) {
      loadDashboardStats(business.id);
    }
  }

  const styles = createStyles(isMobile);

  if (loading) {
    return (
      <main style={styles.page} dir="rtl">
        <div style={styles.backgroundGrid} />
        <div style={styles.glowPink} />
        <div style={styles.glowPurple} />

        <section style={styles.shell}>
          <div style={styles.panel}>
            <p style={styles.badge}>תורפול</p>
            <h1 style={styles.formTitle}>טוען...</h1>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main style={styles.page} dir="rtl">
      <div style={styles.backgroundGrid} />
      <div style={styles.glowPink} />
      <div style={styles.glowPurple} />

      <section style={styles.shell}>
        <div style={styles.panel}>
          <p style={styles.badge}>תורפול · ממלאת תורים שהתפנו דרך WhatsApp</p>

          {slot && showClientPage && (
            <div style={styles.narrowLayout}>
              <h1 style={styles.formTitle}>בקשת תור אצל {slot.business_name}</h1>

              <div style={styles.previewBox}>
                <h2 style={styles.previewTitle}>{slot.service_name}</h2>
                <p>📅 תאריך: {slot.slot_date}</p>
                <p>🕒 שעה: {slot.slot_time}</p>
                {slot.price && <p>💸 מחיר: {slot.price} ₪</p>}
                {slot.note && <p>📝 הערה: {slot.note}</p>}
              </div>

              <div style={styles.infoBox}>
                השארת פרטים לא מאשרת את התור אוטומטית. בעלת העסק תחזור אלייך
                לאישור סופי.
              </div>

              {clientSubmitted && (
                <div style={styles.successBox}>
                  <h2 style={styles.previewTitle}>הבקשה נשלחה ✅</h2>
                  <p>בעלת העסק קיבלה את הפרטים ותחזור אלייך לאישור.</p>
                </div>
              )}

              {clientSubmitted ? null : slot.status === "confirmed" ? (
                <div style={styles.successBox}>
                  <h2 style={styles.previewTitle}>התור כבר נתפס ואושר ✅</h2>
                  <p>אפשר לחכות לתור הבא שיתפנה.</p>
                </div>
              ) : (
                <form onSubmit={handleClaimSlot} style={styles.form}>
                  <label style={styles.label}>
                    שם מלא
                    <input
                      name="clientName"
                      placeholder="לדוגמה: דנה כהן"
                      required
                      style={styles.input}
                    />
                  </label>

                  <label style={styles.label}>
                    טלפון
                    <input
                      name="clientPhone"
                      placeholder="לדוגמה: 0501234567"
                      required
                      style={styles.input}
                    />
                  </label>

                  <button style={styles.primaryButton} type="submit">
                    שלחי בקשה לתור
                  </button>
                </form>
              )}
            </div>
          )}

          {!slot && !session && (
            <div style={styles.landingLayout}>
              <div style={styles.heroBlock}>
                <div style={styles.kicker}>לינק אחד. הודעת WhatsApp אחת. תור שמתמלא.</div>

                <h1 style={styles.heroTitle}>
                  התפנה תור? מלאי אותו בלי לרדוף אחרי לקוחות.
                </h1>

                <p style={styles.heroText}>
                  תורפול עוזרת לקוסמטיקאיות וקליניקות להפוך חור ביומן לבקשות
                  אמיתיות מלקוחות — מהר, נקי, ובשליטה שלך.
                </p>

                <div style={styles.featureList}>
                  <div style={styles.featureItem}>
                    <span style={styles.featureIcon}>⚡</span>
                    <span>יוצרת תור שהתפנה בפחות מדקה.</span>
                  </div>

                  <div style={styles.featureItem}>
                    <span style={styles.featureIcon}>💬</span>
                    <span>מעתיקה הודעת WhatsApp מוכנה לשליחה.</span>
                  </div>

                  <div style={styles.featureItem}>
                    <span style={styles.featureIcon}>✅</span>
                    <span>מקבלת בקשות ומאשרת רק את מי שמתאימה.</span>
                  </div>
                </div>
              </div>

              <div style={styles.authCard}>
                <h2 style={styles.authTitle}>
                  {authMode === "login" ? "התחברות" : "פתיחת חשבון"}
                </h2>

                <p style={styles.authSubtitle}>
                  {authMode === "login"
                    ? "כנסי לדשבורד ותראי מה התפנה לך היום."
                    : "צרי חשבון ותתחילי למלא תורים שהתפנו."}
                </p>

                <form onSubmit={handleAuth} style={styles.form}>
                  <label style={styles.label}>
                    אימייל
                    <input
                      name="email"
                      type="email"
                      required
                      placeholder="you@example.com"
                      style={styles.input}
                    />
                  </label>

                  <label style={styles.label}>
                    סיסמה
                    <input
                      name="password"
                      type="password"
                      required
                      placeholder="לפחות 6 תווים"
                      style={styles.input}
                    />
                  </label>

                  <button style={styles.primaryButton} type="submit">
                    {authMode === "login" ? "התחברי" : "צרי משתמש"}
                  </button>
                </form>

                <button
                  style={styles.textButton}
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
            <div style={styles.narrowLayout}>
              <h1 style={styles.formTitle}>יצירת העסק שלך</h1>

              <p style={styles.subtitle}>
                זה השם שיופיע ללקוחות כשהן פותחות תור שהתפנה.
              </p>

              <form onSubmit={handleCreateBusiness} style={styles.form}>
                <label style={styles.label}>
                  שם העסק
                  <input
                    name="businessName"
                    placeholder="לדוגמה: קליניקת נועה"
                    required
                    style={styles.input}
                  />
                </label>

                <label style={styles.label}>
                  טלפון העסק
                  <input
                    name="phone"
                    placeholder="לדוגמה: 0501234567"
                    style={styles.input}
                  />
                </label>

                <button style={styles.primaryButton} type="submit">
                  צרי את העסק
                </button>
              </form>

              <button style={styles.secondaryButton} onClick={handleLogout}>
                התנתקות
              </button>
            </div>
          )}

          {session &&
            business &&
            !showForm &&
            !slot &&
            !showClientPage &&
            !showHistory && (
              <div style={styles.dashboardLayout}>
                <div style={styles.dashboardHeader}>
                  <div>
                    <p style={styles.overline}>הדשבורד שלך</p>
                    <h1 style={styles.dashboardTitle}>{business.business_name}</h1>
                    <p style={styles.dashboardSubtitle}>מה התפנה לך היום?</p>
                  </div>

                  <button style={styles.secondaryButton} onClick={handleLogout}>
                    התנתקות
                  </button>
                </div>

                <div style={styles.statsGrid}>
                  <div style={styles.statCard}>
                    <p style={styles.statNumber}>{approvedCount}</p>
                    <p style={styles.statLabel}>תורים שאושרו</p>
                  </div>

                  <div style={styles.statCard}>
                    <p style={styles.statNumber}>{approvedValue} ₪</p>
                    <p style={styles.statLabel}>חזרו ליומן</p>
                  </div>

                  <div style={styles.statCard}>
                    <p style={styles.statNumber}>{pendingCount}</p>
                    <p style={styles.statLabel}>מחכים לאישור</p>
                  </div>
                </div>

                <div style={styles.dashboardTip}>
                  <strong>הזרימה:</strong>
                  <span> יוצרת תור שהתפנה → שולחת ב־WhatsApp → מאשרת לקוחה.</span>
                </div>

                <div style={styles.actionRow}>
                  <button style={styles.primaryButton} onClick={() => setShowForm(true)}>
                    התפנה לי תור
                  </button>

                  <button style={styles.secondaryButton} onClick={loadHistory}>
                    ראי תורים שהתפנו
                  </button>
                </div>
              </div>
            )}

          {showForm && business && (
            <div style={styles.narrowLayout}>
              <h1 style={styles.formTitle}>תור שהתפנה</h1>

              <p style={styles.subtitle}>
                מלאי את הפרטים, העתיקי הודעת WhatsApp, ושלחי ללקוחות שלך.
              </p>

              <form onSubmit={handleCreateSlot} style={styles.form}>
                <label style={styles.label}>
                  שם הטיפול
                  <input
                    name="serviceName"
                    placeholder="לדוגמה: טיפול פנים"
                    required
                    style={styles.input}
                  />
                </label>

                <div style={styles.doubleGrid}>
                  <label style={styles.label}>
                    תאריך
                    <input name="date" type="date" required style={styles.input} />
                  </label>

                  <label style={styles.label}>
                    שעה
                    <input name="time" type="time" required style={styles.input} />
                  </label>
                </div>

                <label style={styles.label}>
                  מחיר
                  <input
                    name="price"
                    type="number"
                    placeholder="לדוגמה: 350"
                    style={styles.input}
                  />
                </label>

                <label style={styles.label}>
                  הערה קצרה
                  <textarea
                    name="note"
                    placeholder="לדוגמה: מתאים ללקוחות חדשות וקיימות"
                    style={{ ...styles.input, minHeight: "96px", resize: "vertical" }}
                  />
                </label>

                <button style={styles.primaryButton} type="submit">
                  צרי לינק לתור
                </button>

                <button
                  type="button"
                  style={styles.secondaryButton}
                  onClick={() => setShowForm(false)}
                >
                  חזרה
                </button>
              </form>
            </div>
          )}

          {showHistory && business && (
            <div style={styles.dashboardLayout}>
              <div style={styles.dashboardHeader}>
                <div>
                  <p style={styles.overline}>ניהול תורים</p>
                  <h1 style={styles.dashboardTitle}>תורים שהתפנו</h1>
                </div>

                <button style={styles.secondaryButton} onClick={resetToDashboard}>
                  חזרה לדשבורד
                </button>
              </div>

              {history.length === 0 ? (
                <div style={styles.previewBox}>
                  <h2 style={styles.previewTitle}>אין עדיין תורים שהתפנו</h2>
                  <p>כשתצרי תור ראשון, הוא יופיע כאן.</p>
                </div>
              ) : (
                <div style={styles.historyList}>
                  {history.map((item) => {
                    const latestClaim = item.claims?.[0];

                    return (
                      <div key={item.id} style={styles.historyCard}>
                        <div style={styles.historyTopRow}>
                          <div>
                            <h2 style={styles.previewTitle}>{item.service_name}</h2>
                            <p style={styles.historyMeta}>
                              {item.slot_date} · {item.slot_time}
                              {item.price ? ` · ${item.price} ₪` : ""}
                            </p>
                          </div>

                          <div style={styles.statusPill}>
                            {statusIcon(item.status)} {statusLabel(item.status)}
                          </div>
                        </div>

                        {latestClaim ? (
                          <div style={styles.miniClaimBox}>
                            <p>לקוחה: {latestClaim.client_name}</p>
                            <p>טלפון: {latestClaim.client_phone}</p>
                            <p>
                              סטטוס: {statusIcon(latestClaim.status)}{" "}
                              {statusLabel(latestClaim.status)}
                            </p>
                          </div>
                        ) : (
                          <p style={styles.mutedText}>עדיין אין בקשות לתור הזה.</p>
                        )}

                        <div style={styles.buttonRow}>
                          <button
                            style={styles.smallButton}
                            onClick={() => openSlotFromHistory(item)}
                          >
                            פתחי תור
                          </button>

                          <button
                            style={styles.smallSecondaryButton}
                            onClick={() => copyClientLink(item)}
                          >
                            העתיקי לינק
                          </button>

                          <button
                            style={styles.smallWhatsappButton}
                            onClick={() => copyWhatsappMessage(item)}
                          >
                            WhatsApp
                          </button>

                          {latestClaim && latestClaim.status !== "approved" && (
                            <button
                              style={styles.smallApproveButton}
                              onClick={() => approveClaim(latestClaim, item)}
                            >
                              אשרי
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div style={styles.actionRow}>
                <button style={styles.primaryButton} onClick={() => setShowForm(true)}>
                  התפנה לי תור
                </button>
              </div>
            </div>
          )}

          {slot && !showClientPage && !showHistory && isOwnerView && (
            <div style={styles.narrowLayout}>
              <h1 style={styles.formTitle}>התור שלך מוכן לשליחה 💌</h1>

              <div style={styles.stepBox}>
                <p>1. העתיקי את הודעת ה־WhatsApp</p>
                <p>2. שלחי ללקוחות או לקבוצת הלקוחות שלך</p>
                <p>3. מי שתשאיר פרטים תופיע כאן לאישור</p>
              </div>

              <div style={styles.previewBox}>
                <h2 style={styles.previewTitle}>
                  התפנה תור אצל {slot.business_name}
                </h2>

                <p>טיפול: {slot.service_name}</p>
                <p>תאריך: {slot.slot_date}</p>
                <p>שעה: {slot.slot_time}</p>
                {slot.price && <p>מחיר: {slot.price} ₪</p>}
                {slot.note && <p>הערה: {slot.note}</p>}
                <p>
                  {statusIcon(slot.status)} {statusLabel(slot.status)}
                </p>
              </div>

              {claim && (
                <div style={styles.successBox}>
                  <h2 style={styles.previewTitle}>יש בקשה לתור ✅</h2>
                  <p>שם: {claim.client_name}</p>
                  <p>טלפון: {claim.client_phone}</p>
                  <p>
                    סטטוס: {statusIcon(claim.status)} {statusLabel(claim.status)}
                  </p>

                  {claim.status !== "approved" && (
                    <button
                      style={styles.approveButton}
                      onClick={() => approveClaim()}
                    >
                      אשרי את התור
                    </button>
                  )}
                </div>
              )}

              <button
                style={styles.whatsappButton}
                onClick={() => copyWhatsappMessage()}
              >
                העתיקי הודעת WhatsApp
              </button>

              <div style={styles.linkBox}>
                <p style={styles.linkLabel}>לינק ללקוחה:</p>
                <p style={styles.linkText}>{clientLink}</p>

                <button
                  style={styles.secondaryButton}
                  onClick={() => copyClientLink()}
                >
                  העתיקי לינק בלבד
                </button>
              </div>

              <div style={styles.actionRow}>
                <button style={styles.secondaryButton} onClick={loadHistory}>
                  ראי תורים שהתפנו
                </button>

                <button style={styles.primaryButton} onClick={resetToDashboard}>
                  חזרה לדשבורד
                </button>
              </div>
            </div>
          )}

          {slot && !showClientPage && !showHistory && !isOwnerView && (
            <div style={styles.narrowLayout}>
              <h1 style={styles.formTitle}>הבקשה התקבלה ✅</h1>

              <div style={styles.previewBox}>
                <p>בעלת העסק קיבלה את הפרטים ותחזור אלייך לאישור.</p>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function createStyles(isMobile: boolean) {
  return {
    page: {
      minHeight: "100vh",
      background:
        "radial-gradient(circle at 80% 0%, rgba(236,72,153,0.24), transparent 30%), radial-gradient(circle at 8% 92%, rgba(168,85,247,0.16), transparent 32%), linear-gradient(135deg, #08070b 0%, #130b14 44%, #070509 100%)",
      color: "#fff7fb",
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "center",
      fontFamily:
        "Inter, Assistant, Arial, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      padding: isMobile ? "12px" : "24px",
      position: "relative" as const,
      overflowX: "hidden" as const,
      boxSizing: "border-box" as const,
    },
    backgroundGrid: {
      position: "absolute" as const,
      inset: 0,
      backgroundImage:
        "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)",
      backgroundSize: "42px 42px",
      maskImage:
        "radial-gradient(circle at center, rgba(0,0,0,0.72), transparent 78%)",
      pointerEvents: "none" as const,
    },
    glowPink: {
      position: "absolute" as const,
      top: "-150px",
      right: "-120px",
      width: isMobile ? "280px" : "420px",
      height: isMobile ? "280px" : "420px",
      borderRadius: "999px",
      background:
        "radial-gradient(circle, rgba(236,72,153,0.32), rgba(236,72,153,0.025), transparent)",
      filter: "blur(75px)",
      pointerEvents: "none" as const,
    },
    glowPurple: {
      position: "absolute" as const,
      bottom: "-160px",
      left: "-130px",
      width: isMobile ? "260px" : "400px",
      height: isMobile ? "260px" : "400px",
      borderRadius: "999px",
      background:
        "radial-gradient(circle, rgba(168,85,247,0.23), rgba(168,85,247,0.025), transparent)",
      filter: "blur(80px)",
      pointerEvents: "none" as const,
    },
    shell: {
      width: "100%",
      maxWidth: isMobile ? "100%" : "980px",
      position: "relative" as const,
      zIndex: 1,
      boxSizing: "border-box" as const,
    },
    panel: {
      width: "100%",
      boxSizing: "border-box" as const,
      borderRadius: isMobile ? "24px" : "32px",
      padding: isMobile ? "18px 14px" : "30px",
      border: "1px solid rgba(255,255,255,0.1)",
      background:
        "linear-gradient(180deg, rgba(255,255,255,0.085), rgba(255,255,255,0.04))",
      boxShadow:
        "0 34px 120px rgba(0,0,0,0.52), inset 0 1px 0 rgba(255,255,255,0.1)",
      backdropFilter: "blur(26px)",
      textAlign: "center" as const,
      overflow: "hidden" as const,
    },
    badge: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      maxWidth: "100%",
      boxSizing: "border-box" as const,
      border: "1px solid rgba(244,114,182,0.34)",
      background:
        "linear-gradient(135deg, rgba(244,114,182,0.16), rgba(168,85,247,0.08))",
      color: "#fbcfe8",
      borderRadius: "999px",
      padding: isMobile ? "8px 12px" : "9px 15px",
      marginBottom: isMobile ? "18px" : "24px",
      fontWeight: 900,
      fontSize: isMobile ? "12px" : "13px",
      lineHeight: "1.4",
      textAlign: "center" as const,
      whiteSpace: isMobile ? ("normal" as const) : ("nowrap" as const),
      boxShadow: "0 0 30px rgba(236,72,153,0.14)",
    },
    landingLayout: {
      display: "grid",
      gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.1fr) minmax(320px, 0.9fr)",
      gap: isMobile ? "20px" : "26px",
      alignItems: "center",
      textAlign: "right" as const,
    },
    heroBlock: {
      textAlign: isMobile ? ("center" as const) : ("right" as const),
      padding: isMobile ? "0" : "8px 4px",
    },
    kicker: {
      display: "inline-flex",
      border: "1px solid rgba(244,114,182,0.24)",
      background: "rgba(244,114,182,0.08)",
      color: "#f9a8d4",
      borderRadius: "999px",
      padding: "8px 13px",
      marginBottom: isMobile ? "14px" : "18px",
      fontSize: isMobile ? "12px" : "13px",
      fontWeight: 900,
      lineHeight: "1.4",
    },
    heroTitle: {
      margin: 0,
      color: "#fff9fd",
      fontSize: isMobile ? "36px" : "clamp(38px, 5.4vw, 64px)",
      lineHeight: "1.03",
      fontWeight: 950,
      letterSpacing: isMobile ? "-1px" : "-1.8px",
      textShadow: "0 14px 45px rgba(236,72,153,0.18)",
    },
    heroText: {
      margin: isMobile ? "14px auto 18px" : "18px 0 20px",
      color: "#dac6d2",
      fontSize: isMobile ? "15px" : "18px",
      lineHeight: "1.7",
      maxWidth: "620px",
    },
    featureList: {
      display: "grid",
      gap: "10px",
      marginTop: "18px",
      maxWidth: isMobile ? "360px" : "none",
      marginInline: isMobile ? "auto" : "0",
    },
    featureItem: {
      display: "flex",
      alignItems: "center",
      gap: "10px",
      color: "#ead8e3",
      fontSize: isMobile ? "14px" : "15px",
      lineHeight: "1.5",
      textAlign: "right" as const,
    },
    featureIcon: {
      width: "34px",
      height: "34px",
      borderRadius: "13px",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      background:
        "linear-gradient(135deg, rgba(244,114,182,0.2), rgba(168,85,247,0.1))",
      border: "1px solid rgba(255,255,255,0.1)",
      flexShrink: 0,
    },
    authCard: {
      width: "100%",
      boxSizing: "border-box" as const,
      border: "1px solid rgba(255,255,255,0.1)",
      background:
        "linear-gradient(180deg, rgba(255,255,255,0.075), rgba(255,255,255,0.035))",
      borderRadius: isMobile ? "22px" : "26px",
      padding: isMobile ? "18px" : "22px",
      boxShadow:
        "0 24px 90px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.07)",
      textAlign: "right" as const,
    },
    authTitle: {
      margin: "0 0 6px",
      fontSize: "26px",
      color: "#fff9fd",
      fontWeight: 950,
    },
    authSubtitle: {
      margin: "0 0 18px",
      color: "#cdb6c4",
      fontSize: "14px",
      lineHeight: "1.6",
    },
    narrowLayout: {
      width: "100%",
      maxWidth: "620px",
      marginInline: "auto",
      boxSizing: "border-box" as const,
    },
    dashboardLayout: {
      width: "100%",
      maxWidth: "820px",
      marginInline: "auto",
      boxSizing: "border-box" as const,
    },
    dashboardHeader: {
      display: "flex",
      flexDirection: isMobile ? ("column" as const) : ("row" as const),
      alignItems: isMobile ? "stretch" : "flex-start",
      justifyContent: "space-between",
      gap: "16px",
      marginBottom: "18px",
      textAlign: "right" as const,
    },
    overline: {
      margin: "0 0 5px",
      color: "#f9a8d4",
      fontSize: "13px",
      fontWeight: 900,
    },
    dashboardTitle: {
      margin: 0,
      color: "#fff9fd",
      fontSize: isMobile ? "34px" : "clamp(34px, 5vw, 54px)",
      lineHeight: "1",
      fontWeight: 950,
      letterSpacing: "-1.2px",
    },
    dashboardSubtitle: {
      margin: "10px 0 0",
      color: "#dac6d2",
      fontSize: "17px",
    },
    formTitle: {
      fontSize: isMobile ? "30px" : "clamp(32px, 4.8vw, 48px)",
      lineHeight: "1.05",
      margin: "0 0 20px",
      color: "#fff9fd",
      fontWeight: 950,
      letterSpacing: "-1.2px",
      textShadow: "0 12px 38px rgba(236,72,153,0.15)",
    },
    subtitle: {
      fontSize: "16px",
      lineHeight: "1.7",
      color: "#dac6d2",
      marginTop: "14px",
      marginBottom: "22px",
      maxWidth: "620px",
      marginInline: "auto",
    },
    form: {
      display: "grid",
      gap: "14px",
      textAlign: "right" as const,
    },
    doubleGrid: {
      display: "grid",
      gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(180px, 1fr))",
      gap: "14px",
    },
    label: {
      display: "grid",
      gap: "8px",
      fontSize: "14px",
      color: "#f7dce9",
      fontWeight: 800,
    },
    input: {
      width: "100%",
      boxSizing: "border-box" as const,
      border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(255,255,255,0.06)",
      color: "#fff9fd",
      borderRadius: "16px",
      padding: "13px 15px",
      fontSize: "15px",
      outline: "none",
      boxShadow:
        "inset 0 1px 0 rgba(255,255,255,0.06), 0 10px 28px rgba(0,0,0,0.12)",
    },
    primaryButton: {
      marginTop: "10px",
      background:
        "linear-gradient(135deg, #ff7ac1 0%, #ec4899 45%, #be185d 100%)",
      color: "white",
      border: "1px solid rgba(255,255,255,0.14)",
      borderRadius: "16px",
      padding: "13px 22px",
      fontSize: "16px",
      fontWeight: 950,
      cursor: "pointer",
      width: isMobile ? "100%" : "auto",
      boxShadow:
        "0 18px 45px rgba(236,72,153,0.32), inset 0 1px 0 rgba(255,255,255,0.25)",
    },
    whatsappButton: {
      marginTop: "14px",
      marginBottom: "12px",
      background:
        "linear-gradient(135deg, #34d399 0%, #22c55e 45%, #15803d 100%)",
      color: "white",
      border: "1px solid rgba(255,255,255,0.14)",
      borderRadius: "16px",
      padding: "13px 22px",
      fontSize: "16px",
      fontWeight: 950,
      cursor: "pointer",
      display: "block",
      width: "100%",
      boxShadow:
        "0 18px 45px rgba(34,197,94,0.26), inset 0 1px 0 rgba(255,255,255,0.22)",
    },
    secondaryButton: {
      marginTop: "10px",
      background: "rgba(255,255,255,0.055)",
      color: "#f4deea",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: "16px",
      padding: "11px 18px",
      fontSize: "14px",
      fontWeight: 700,
      cursor: "pointer",
      width: isMobile ? "100%" : "auto",
      boxShadow:
        "inset 0 1px 0 rgba(255,255,255,0.06), 0 10px 26px rgba(0,0,0,0.14)",
    },
    textButton: {
      width: "100%",
      marginTop: "12px",
      background: "transparent",
      border: "none",
      color: "#f9a8d4",
      fontSize: "14px",
      fontWeight: 800,
      cursor: "pointer",
    },
    approveButton: {
      marginTop: "12px",
      background: "linear-gradient(135deg, #34d399, #16a34a)",
      color: "white",
      border: "1px solid rgba(255,255,255,0.14)",
      borderRadius: "16px",
      padding: "12px 20px",
      fontSize: "15px",
      fontWeight: 950,
      cursor: "pointer",
    },
    previewBox: {
      border: "1px solid rgba(255,255,255,0.1)",
      background:
        "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04))",
      borderRadius: "22px",
      padding: "18px",
      marginBottom: "16px",
      textAlign: "right" as const,
      fontSize: "15px",
      color: "#faeaf2",
      boxShadow:
        "0 22px 75px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.07)",
    },
    infoBox: {
      border: "1px solid rgba(244,114,182,0.24)",
      background:
        "linear-gradient(135deg, rgba(244,114,182,0.1), rgba(168,85,247,0.055))",
      borderRadius: "18px",
      padding: "14px",
      marginBottom: "16px",
      textAlign: "right" as const,
      color: "#f6d6e6",
      fontSize: "14px",
      lineHeight: "1.6",
    },
    stepBox: {
      border: "1px solid rgba(244,114,182,0.24)",
      background:
        "linear-gradient(135deg, rgba(244,114,182,0.1), rgba(168,85,247,0.055))",
      borderRadius: "20px",
      padding: "16px",
      marginBottom: "16px",
      textAlign: "right" as const,
      color: "#f6d6e6",
      fontSize: "14px",
      lineHeight: "1.45",
    },
    linkBox: {
      border: "1px solid rgba(244,114,182,0.22)",
      background:
        "linear-gradient(135deg, rgba(244,114,182,0.08), rgba(168,85,247,0.045))",
      borderRadius: "20px",
      padding: "16px",
      marginBottom: "16px",
      textAlign: "right" as const,
    },
    linkLabel: {
      margin: "0 0 8px",
      color: "#f9a8d4",
      fontWeight: 950,
      fontSize: "14px",
    },
    linkText: {
      direction: "ltr" as const,
      textAlign: "left" as const,
      background: "rgba(0,0,0,0.32)",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: "14px",
      padding: "11px",
      overflowX: "auto" as const,
      whiteSpace: "nowrap" as const,
      color: "#fff9fd",
      fontSize: "13px",
    },
    successBox: {
      border: "1px solid rgba(34,197,94,0.34)",
      background:
        "linear-gradient(135deg, rgba(34,197,94,0.13), rgba(34,197,94,0.045))",
      borderRadius: "22px",
      padding: "20px",
      marginBottom: "16px",
      textAlign: "right" as const,
      fontSize: "15px",
      color: "#edfff2",
      boxShadow: "0 18px 50px rgba(34,197,94,0.07)",
    },
    miniClaimBox: {
      border: "1px solid rgba(34,197,94,0.3)",
      background: "rgba(34,197,94,0.08)",
      borderRadius: "16px",
      padding: "11px 14px",
      marginTop: "12px",
      fontSize: "14px",
    },
    previewTitle: {
      marginTop: 0,
      fontSize: "22px",
      color: "#fff9fd",
      letterSpacing: "-0.35px",
      fontWeight: 950,
    },
    statsGrid: {
      display: "grid",
      gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(155px, 1fr))",
      gap: "12px",
      marginTop: "20px",
      marginBottom: "16px",
    },
    statCard: {
      background:
        "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04))",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: "22px",
      padding: "16px",
      boxShadow:
        "0 20px 60px rgba(0,0,0,0.26), inset 0 1px 0 rgba(255,255,255,0.07)",
    },
    statNumber: {
      margin: 0,
      fontSize: "28px",
      fontWeight: 950,
      color: "#ff8ac7",
      textShadow: "0 10px 30px rgba(236,72,153,0.18)",
    },
    statLabel: {
      margin: "6px 0 0",
      color: "#d9c5d1",
      fontSize: "13px",
      fontWeight: 700,
    },
    dashboardTip: {
      marginTop: "10px",
      marginBottom: "16px",
      padding: "13px 15px",
      borderRadius: "17px",
      border: "1px solid rgba(255,255,255,0.1)",
      background:
        "linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))",
      color: "#ddc9d5",
      fontSize: "14px",
    },
    actionRow: {
      display: "flex",
      flexDirection: isMobile ? ("column" as const) : ("row" as const),
      flexWrap: "wrap" as const,
      gap: "10px",
      justifyContent: "center",
      alignItems: "stretch",
      marginTop: "8px",
    },
    historyList: {
      display: "grid",
      gap: "12px",
    },
    historyCard: {
      border: "1px solid rgba(255,255,255,0.1)",
      background:
        "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04))",
      borderRadius: "22px",
      padding: "18px",
      textAlign: "right" as const,
      color: "#faeaf2",
      boxShadow:
        "0 20px 65px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.07)",
    },
    historyTopRow: {
      display: "flex",
      flexDirection: isMobile ? ("column" as const) : ("row" as const),
      gap: "10px",
      justifyContent: "space-between",
      alignItems: isMobile ? "stretch" : "flex-start",
      flexWrap: "wrap" as const,
    },
    historyMeta: {
      color: "#d5bfcb",
      marginTop: "5px",
      marginBottom: "8px",
      fontSize: "13px",
    },
    statusPill: {
      borderRadius: "999px",
      padding: "7px 11px",
      background: "rgba(255,255,255,0.065)",
      border: "1px solid rgba(255,255,255,0.1)",
      color: "#fce7f3",
      fontSize: "12px",
      fontWeight: 900,
      alignSelf: isMobile ? "flex-start" : "auto",
    },
    mutedText: {
      color: "#b39aa8",
      fontSize: "14px",
    },
    buttonRow: {
      display: "flex",
      flexWrap: "wrap" as const,
      gap: "8px",
      marginTop: "14px",
    },
    smallButton: {
      background: "linear-gradient(135deg, #ff7ac1, #db2777)",
      color: "white",
      border: "none",
      borderRadius: "12px",
      padding: "8px 13px",
      fontSize: "13px",
      fontWeight: 950,
      cursor: "pointer",
    },
    smallSecondaryButton: {
      background: "rgba(255,255,255,0.055)",
      color: "#f0dce7",
      border: "1px solid rgba(255,255,255,0.11)",
      borderRadius: "12px",
      padding: "8px 13px",
      fontSize: "13px",
      cursor: "pointer",
    },
    smallWhatsappButton: {
      background: "linear-gradient(135deg, #34d399, #16a34a)",
      color: "white",
      border: "none",
      borderRadius: "12px",
      padding: "8px 13px",
      fontSize: "13px",
      fontWeight: 950,
      cursor: "pointer",
    },
    smallApproveButton: {
      background: "linear-gradient(135deg, #34d399, #15803d)",
      color: "white",
      border: "none",
      borderRadius: "12px",
      padding: "8px 13px",
      fontSize: "13px",
      fontWeight: 950,
      cursor: "pointer",
    },
  };
}

export default App;