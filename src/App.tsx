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

    if (view === "client") {
      setShowClientPage(true);
    } else {
      setShowClientPage(false);
    }
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
    if (status === "open") return "🟢 פתוח לשליחה";
    if (status === "claimed") return "🟡 יש בקשה לאישור";
    if (status === "confirmed") return "✅ התור אושר";
    if (status === "approved") return "✅ אושר";
    if (status === "pending") return "🟡 ממתין לאישור";
    return status;
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

  if (loading) {
    return (
      <main style={styles.page} dir="rtl">
        <div style={styles.glowOne} />
        <div style={styles.glowTwo} />
        <div style={styles.glowThree} />

        <section style={styles.shell}>
          <div style={styles.mainCard}>
            <p style={styles.badge}>תורפול</p>
            <h1 style={styles.formTitle}>טוען...</h1>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main style={styles.page} dir="rtl">
      <div style={styles.glowOne} />
      <div style={styles.glowTwo} />
      <div style={styles.glowThree} />

      <section style={styles.shell}>
        <div style={styles.mainCard}>
          <p style={styles.badge}>תורפול · ממלאת לך תורים שהתפנו דרך WhatsApp</p>

          {slot && showClientPage && (
            <>
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
                <div style={styles.claimBox}>
                  <h2 style={styles.previewTitle}>הבקשה נשלחה ✅</h2>
                  <p>בעלת העסק קיבלה את הפרטים ותחזור אלייך לאישור.</p>
                </div>
              )}

              {clientSubmitted ? null : slot.status === "confirmed" ? (
                <div style={styles.claimBox}>
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

                  <button style={styles.button} type="submit">
                    שלחי בקשה לתור
                  </button>
                </form>
              )}
            </>
          )}

          {!slot && !session && (
            <>
              <h1 style={styles.title}>התפנה תור? מלאי אותו בקליק.</h1>

              <p style={styles.subtitle}>
                יוצרת לינק, שולחת ללקוחות ב־WhatsApp, מקבלת בקשות, ומאשרת את מי
                שמתאימה ליומן שלך.
              </p>

              <div style={styles.featureGrid}>
                <div style={styles.featureCard}>
                  <div style={styles.featureIcon}>⚡</div>
                  <h3 style={styles.featureTitle}>יוצרת תור שהתפנה</h3>
                  <p style={styles.featureText}>
                    ממלאת טיפול, שעה ומחיר — והמערכת מכינה לך לינק מוכן.
                  </p>
                </div>

                <div style={styles.featureCard}>
                  <div style={styles.featureIcon}>💬</div>
                  <h3 style={styles.featureTitle}>שולחת ב־WhatsApp</h3>
                  <p style={styles.featureText}>
                    בלחיצה אחת את מעתיקה הודעה ושולחת ללקוחות שלך.
                  </p>
                </div>

                <div style={styles.featureCard}>
                  <div style={styles.featureIcon}>✅</div>
                  <h3 style={styles.featureTitle}>מאשרת מי שמתאימה</h3>
                  <p style={styles.featureText}>
                    הלקוחה משאירה פרטים ואת מחליטה את מי לאשר.
                  </p>
                </div>
              </div>

              <div style={styles.authBox}>
                <h2 style={styles.previewTitle}>
                  {authMode === "login" ? "התחברות" : "הרשמה"}
                </h2>

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

                  <button style={styles.button} type="submit">
                    {authMode === "login" ? "התחברי" : "צרי משתמש"}
                  </button>
                </form>

                <button
                  style={styles.secondaryButton}
                  onClick={() =>
                    setAuthMode(authMode === "login" ? "register" : "login")
                  }
                >
                  {authMode === "login"
                    ? "אין לך משתמש? הרשמי כאן"
                    : "כבר יש לך משתמש? התחברי"}
                </button>
              </div>
            </>
          )}

          {session && !business && !slot && (
            <>
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

                <button style={styles.button} type="submit">
                  צרי את העסק
                </button>
              </form>

              <button style={styles.secondaryButton} onClick={handleLogout}>
                התנתקות
              </button>
            </>
          )}

          {session &&
            business &&
            !showForm &&
            !slot &&
            !showClientPage &&
            !showHistory && (
              <>
                <h1 style={styles.title}>{business.business_name}</h1>

                <p style={styles.subtitle}>מה התפנה לך היום?</p>

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
                  <strong>איך זה עובד?</strong>
                  <span> יוצרת תור שהתפנה → שולחת ב־WhatsApp → מאשרת לקוחה.</span>
                </div>

                <div style={styles.actionRow}>
                  <button style={styles.button} onClick={() => setShowForm(true)}>
                    התפנה לי תור
                  </button>

                  <button
                    style={styles.secondaryButton}
                    onClick={loadHistory}
                  >
                    ראי תורים שהתפנו
                  </button>

                  <button
                    style={styles.secondaryButton}
                    onClick={handleLogout}
                  >
                    התנתקות
                  </button>
                </div>
              </>
            )}

          {showForm && business && (
            <>
              <h1 style={styles.formTitle}>תור שהתפנה</h1>

              <p style={styles.subtitleSmall}>
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
                    style={{ ...styles.input, minHeight: "110px", resize: "vertical" }}
                  />
                </label>

                <button style={styles.button} type="submit">
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
            </>
          )}

          {showHistory && business && (
            <>
              <h1 style={styles.formTitle}>תורים שהתפנו</h1>

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
                          <h2 style={styles.previewTitle}>{item.service_name}</h2>
                          <div style={styles.statusPill}>{statusLabel(item.status)}</div>
                        </div>

                        <p style={styles.historyMeta}>
                          {item.slot_date} · {item.slot_time}
                          {item.price ? ` · ${item.price} ₪` : ""}
                        </p>

                        {latestClaim ? (
                          <div style={styles.miniClaimBox}>
                            <p>לקוחה: {latestClaim.client_name}</p>
                            <p>טלפון: {latestClaim.client_phone}</p>
                            <p>סטטוס: {statusLabel(latestClaim.status)}</p>
                          </div>
                        ) : (
                          <p style={styles.mutedText}>
                            עדיין אין בקשות לתור הזה.
                          </p>
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
                <button style={styles.button} onClick={() => setShowForm(true)}>
                  התפנה לי תור
                </button>

                <button style={styles.secondaryButton} onClick={resetToDashboard}>
                  חזרה לדשבורד
                </button>
              </div>
            </>
          )}

          {slot && !showClientPage && !showHistory && isOwnerView && (
            <>
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
                <p>{statusLabel(slot.status)}</p>
              </div>

              {claim && (
                <div style={styles.claimBox}>
                  <h2 style={styles.previewTitle}>יש בקשה לתור ✅</h2>
                  <p>שם: {claim.client_name}</p>
                  <p>טלפון: {claim.client_phone}</p>
                  <p>סטטוס: {statusLabel(claim.status)}</p>

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

                <button style={styles.button} onClick={resetToDashboard}>
                  חזרה לדשבורד
                </button>
              </div>
            </>
          )}

          {slot && !showClientPage && !showHistory && !isOwnerView && (
            <>
              <h1 style={styles.formTitle}>הבקשה התקבלה ✅</h1>

              <div style={styles.previewBox}>
                <p>בעלת העסק קיבלה את הפרטים ותחזור אלייך לאישור.</p>
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top left, #2f1236 0%, #1a0c20 30%, #0c0710 70%, #070509 100%)",
    color: "#fff8fc",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily:
      "Inter, Assistant, Arial, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    padding: "32px 16px",
    position: "relative" as const,
    overflow: "hidden" as const,
  },
  glowOne: {
    position: "absolute" as const,
    top: "-120px",
    right: "-80px",
    width: "360px",
    height: "360px",
    borderRadius: "999px",
    background: "rgba(236, 72, 153, 0.24)",
    filter: "blur(120px)",
    pointerEvents: "none" as const,
  },
  glowTwo: {
    position: "absolute" as const,
    bottom: "-140px",
    left: "-80px",
    width: "340px",
    height: "340px",
    borderRadius: "999px",
    background: "rgba(168, 85, 247, 0.18)",
    filter: "blur(120px)",
    pointerEvents: "none" as const,
  },
  glowThree: {
    position: "absolute" as const,
    top: "35%",
    left: "48%",
    width: "240px",
    height: "240px",
    borderRadius: "999px",
    background: "rgba(34, 197, 94, 0.1)",
    filter: "blur(110px)",
    pointerEvents: "none" as const,
    transform: "translate(-50%, -50%)",
  },
  shell: {
    width: "100%",
    maxWidth: "1060px",
    position: "relative" as const,
    zIndex: 1,
  },
  mainCard: {
    width: "100%",
    borderRadius: "34px",
    padding: "34px",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.09), rgba(255,255,255,0.045))",
    boxShadow:
      "0 30px 120px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)",
    backdropFilter: "blur(24px)",
    textAlign: "center" as const,
  },
  badge: {
    display: "inline-block",
    border: "1px solid rgba(244, 114, 182, 0.35)",
    background: "rgba(244, 114, 182, 0.1)",
    color: "#f9a8d4",
    borderRadius: "999px",
    padding: "12px 18px",
    marginBottom: "28px",
    fontWeight: "800",
    fontSize: "15px",
    boxShadow: "0 0 32px rgba(236, 72, 153, 0.12)",
  },
  title: {
    fontSize: "clamp(42px, 8vw, 72px)",
    lineHeight: "1.02",
    margin: 0,
    color: "#fff8fc",
    fontWeight: 900,
    letterSpacing: "-1.8px",
  },
  formTitle: {
    fontSize: "clamp(34px, 6vw, 52px)",
    lineHeight: "1.05",
    margin: "0 0 24px",
    color: "#fff8fc",
    fontWeight: 900,
    letterSpacing: "-1.3px",
  },
  subtitle: {
    fontSize: "20px",
    lineHeight: "1.8",
    color: "#d8c2cf",
    marginTop: "22px",
    marginBottom: "28px",
    maxWidth: "760px",
    marginInline: "auto",
  },
  subtitleSmall: {
    fontSize: "17px",
    lineHeight: "1.7",
    color: "#c9b1bf",
    marginTop: "-6px",
    marginBottom: "24px",
  },
  authBox: {
    marginTop: "30px",
    border: "1px solid rgba(255,255,255,0.08)",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))",
    borderRadius: "28px",
    padding: "24px",
    boxShadow:
      "0 24px 90px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.06)",
  },
  featureGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "16px",
    marginTop: "18px",
    marginBottom: "30px",
  },
  featureCard: {
    border: "1px solid rgba(255,255,255,0.08)",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.035))",
    borderRadius: "24px",
    padding: "20px",
    textAlign: "right" as const,
    boxShadow:
      "0 24px 80px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.05)",
  },
  featureIcon: {
    fontSize: "28px",
    marginBottom: "10px",
  },
  featureTitle: {
    margin: "0 0 10px",
    fontSize: "20px",
    color: "#fff3f9",
  },
  featureText: {
    margin: 0,
    fontSize: "15px",
    lineHeight: "1.7",
    color: "#d4bfcb",
  },
  form: {
    display: "grid",
    gap: "16px",
    textAlign: "right" as const,
  },
  doubleGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "16px",
  },
  label: {
    display: "grid",
    gap: "8px",
    fontSize: "15px",
    color: "#f5d9e7",
    fontWeight: 700,
  },
  input: {
    width: "100%",
    boxSizing: "border-box" as const,
    border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.055)",
    color: "#fff8fc",
    borderRadius: "18px",
    padding: "15px 16px",
    fontSize: "16px",
    outline: "none",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
  },
  button: {
    marginTop: "14px",
    background: "linear-gradient(135deg, #f472b6, #db2777)",
    color: "white",
    border: "none",
    borderRadius: "20px",
    padding: "16px 28px",
    fontSize: "19px",
    fontWeight: 900,
    cursor: "pointer",
    boxShadow:
      "0 18px 45px rgba(219,39,119,0.32), inset 0 1px 0 rgba(255,255,255,0.18)",
  },
  whatsappButton: {
    marginTop: "18px",
    marginBottom: "12px",
    background: "linear-gradient(135deg, #22c55e, #16a34a)",
    color: "white",
    border: "none",
    borderRadius: "20px",
    padding: "16px 28px",
    fontSize: "19px",
    fontWeight: 900,
    cursor: "pointer",
    display: "block",
    width: "100%",
    boxShadow:
      "0 18px 45px rgba(34,197,94,0.28), inset 0 1px 0 rgba(255,255,255,0.18)",
  },
  secondaryButton: {
    marginTop: "12px",
    background: "rgba(255,255,255,0.05)",
    color: "#f0dce7",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "18px",
    padding: "14px 22px",
    fontSize: "15px",
    cursor: "pointer",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
  },
  approveButton: {
    marginTop: "12px",
    background: "linear-gradient(135deg, #22c55e, #15803d)",
    color: "white",
    border: "none",
    borderRadius: "18px",
    padding: "14px 24px",
    fontSize: "17px",
    fontWeight: 900,
    cursor: "pointer",
  },
  previewBox: {
    border: "1px solid rgba(255,255,255,0.08)",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.075), rgba(255,255,255,0.035))",
    borderRadius: "28px",
    padding: "24px",
    marginBottom: "20px",
    textAlign: "right" as const,
    fontSize: "18px",
    color: "#f9e8f0",
    boxShadow:
      "0 22px 80px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)",
  },
  infoBox: {
    border: "1px solid rgba(244,114,182,0.22)",
    background: "rgba(244,114,182,0.08)",
    borderRadius: "22px",
    padding: "16px",
    marginBottom: "20px",
    textAlign: "right" as const,
    color: "#f4d1e2",
    fontSize: "16px",
  },
  stepBox: {
    border: "1px solid rgba(244,114,182,0.22)",
    background: "rgba(244,114,182,0.08)",
    borderRadius: "24px",
    padding: "20px",
    marginBottom: "20px",
    textAlign: "right" as const,
    color: "#f4d1e2",
    fontSize: "17px",
  },
  linkBox: {
    border: "1px solid rgba(244,114,182,0.2)",
    background: "rgba(244,114,182,0.07)",
    borderRadius: "24px",
    padding: "20px",
    marginBottom: "20px",
    textAlign: "right" as const,
  },
  linkLabel: {
    margin: "0 0 8px",
    color: "#f9a8d4",
    fontWeight: 900,
  },
  linkText: {
    direction: "ltr" as const,
    textAlign: "left" as const,
    background: "rgba(0,0,0,0.28)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "16px",
    padding: "13px",
    overflowX: "auto" as const,
    whiteSpace: "nowrap" as const,
    color: "#fff8fc",
  },
  claimBox: {
    border: "1px solid rgba(34,197,94,0.32)",
    background: "rgba(34,197,94,0.1)",
    borderRadius: "26px",
    padding: "24px",
    marginBottom: "20px",
    textAlign: "right" as const,
    fontSize: "18px",
    color: "#edfff2",
  },
  miniClaimBox: {
    border: "1px solid rgba(34,197,94,0.3)",
    background: "rgba(34,197,94,0.08)",
    borderRadius: "18px",
    padding: "12px 16px",
    marginTop: "12px",
  },
  previewTitle: {
    marginTop: 0,
    fontSize: "28px",
    color: "#fff8fc",
    letterSpacing: "-0.5px",
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "16px",
    marginTop: "28px",
    marginBottom: "18px",
  },
  statCard: {
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04))",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "26px",
    padding: "22px",
    boxShadow:
      "0 22px 75px rgba(0,0,0,0.26), inset 0 1px 0 rgba(255,255,255,0.05)",
  },
  statNumber: {
    margin: 0,
    fontSize: "32px",
    fontWeight: 900,
    color: "#f472b6",
  },
  statLabel: {
    margin: "8px 0 0",
    color: "#d8c3cf",
    fontSize: "14px",
  },
  dashboardTip: {
    marginTop: "12px",
    marginBottom: "20px",
    padding: "16px 18px",
    borderRadius: "20px",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
    color: "#ddc9d5",
    fontSize: "15px",
  },
  actionRow: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "12px",
    justifyContent: "center",
    alignItems: "center",
    marginTop: "6px",
  },
  historyList: {
    display: "grid",
    gap: "16px",
  },
  historyCard: {
    border: "1px solid rgba(255,255,255,0.08)",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.075), rgba(255,255,255,0.035))",
    borderRadius: "28px",
    padding: "24px",
    textAlign: "right" as const,
    color: "#f9e8f0",
    boxShadow:
      "0 24px 80px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)",
  },
  historyTopRow: {
    display: "flex",
    gap: "12px",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap" as const,
  },
  historyMeta: {
    color: "#d5bfcb",
    marginTop: "6px",
    marginBottom: "8px",
  },
  statusPill: {
    borderRadius: "999px",
    padding: "8px 12px",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.08)",
    color: "#fce7f3",
    fontSize: "13px",
    fontWeight: 800,
  },
  mutedText: {
    color: "#ae96a3",
  },
  buttonRow: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "10px",
    marginTop: "16px",
  },
  smallButton: {
    background: "linear-gradient(135deg, #f472b6, #db2777)",
    color: "white",
    border: "none",
    borderRadius: "14px",
    padding: "10px 16px",
    fontSize: "14px",
    fontWeight: 900,
    cursor: "pointer",
  },
  smallSecondaryButton: {
    background: "rgba(255,255,255,0.05)",
    color: "#f0dce7",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "14px",
    padding: "10px 16px",
    fontSize: "14px",
    cursor: "pointer",
  },
  smallWhatsappButton: {
    background: "linear-gradient(135deg, #22c55e, #16a34a)",
    color: "white",
    border: "none",
    borderRadius: "14px",
    padding: "10px 16px",
    fontSize: "14px",
    fontWeight: 900,
    cursor: "pointer",
  },
  smallApproveButton: {
    background: "linear-gradient(135deg, #22c55e, #15803d)",
    color: "white",
    border: "none",
    borderRadius: "14px",
    padding: "10px 16px",
    fontSize: "14px",
    fontWeight: 900,
    cursor: "pointer",
  },
};

export default App;