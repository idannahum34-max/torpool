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

                  <button style={styles.secondaryButton} onClick={loadHistory}>
                    ראי תורים שהתפנו
                  </button>

                  <button style={styles.secondaryButton} onClick={handleLogout}>
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
      "radial-gradient(circle at top right, rgba(236,72,153,0.26), transparent 32%), radial-gradient(circle at bottom left, rgba(168,85,247,0.18), transparent 34%), linear-gradient(135deg, #09070b 0%, #130b14 42%, #070509 100%)",
    color: "#fff7fb",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily:
      "Inter, Assistant, Arial, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    padding: "36px 16px",
    position: "relative" as const,
    overflow: "hidden" as const,
  },
  glowOne: {
    position: "absolute" as const,
    top: "-160px",
    right: "-120px",
    width: "480px",
    height: "480px",
    borderRadius: "999px",
    background:
      "radial-gradient(circle, rgba(236,72,153,0.35), rgba(236,72,153,0.02), transparent)",
    filter: "blur(70px)",
    pointerEvents: "none" as const,
  },
  glowTwo: {
    position: "absolute" as const,
    bottom: "-180px",
    left: "-130px",
    width: "440px",
    height: "440px",
    borderRadius: "999px",
    background:
      "radial-gradient(circle, rgba(168,85,247,0.28), rgba(168,85,247,0.02), transparent)",
    filter: "blur(80px)",
    pointerEvents: "none" as const,
  },
  glowThree: {
    position: "absolute" as const,
    top: "48%",
    left: "50%",
    width: "260px",
    height: "260px",
    borderRadius: "999px",
    background:
      "radial-gradient(circle, rgba(34,197,94,0.14), rgba(34,197,94,0.015), transparent)",
    filter: "blur(90px)",
    transform: "translate(-50%, -50%)",
    pointerEvents: "none" as const,
  },
  shell: {
    width: "100%",
    maxWidth: "1120px",
    position: "relative" as const,
    zIndex: 1,
  },
  mainCard: {
    width: "100%",
    borderRadius: "42px",
    padding: "42px",
    border: "1px solid rgba(255,255,255,0.1)",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.095), rgba(255,255,255,0.045))",
    boxShadow:
      "0 40px 140px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.12)",
    backdropFilter: "blur(28px)",
    textAlign: "center" as const,
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    border: "1px solid rgba(244,114,182,0.36)",
    background:
      "linear-gradient(135deg, rgba(244,114,182,0.18), rgba(168,85,247,0.08))",
    color: "#fbcfe8",
    borderRadius: "999px",
    padding: "11px 18px",
    marginBottom: "30px",
    fontWeight: 900,
    fontSize: "15px",
    letterSpacing: "0.1px",
    boxShadow:
      "0 0 36px rgba(236,72,153,0.18), inset 0 1px 0 rgba(255,255,255,0.1)",
  },
  title: {
    fontSize: "clamp(44px, 7vw, 82px)",
    lineHeight: "0.98",
    margin: 0,
    color: "#fff9fd",
    fontWeight: 950,
    letterSpacing: "-2.4px",
    textShadow: "0 16px 55px rgba(236,72,153,0.22)",
  },
  formTitle: {
    fontSize: "clamp(36px, 5vw, 58px)",
    lineHeight: "1.02",
    margin: "0 0 26px",
    color: "#fff9fd",
    fontWeight: 950,
    letterSpacing: "-1.7px",
    textShadow: "0 14px 45px rgba(236,72,153,0.18)",
  },
  subtitle: {
    fontSize: "21px",
    lineHeight: "1.82",
    color: "#dac6d2",
    marginTop: "24px",
    marginBottom: "32px",
    maxWidth: "780px",
    marginInline: "auto",
  },
  subtitleSmall: {
    fontSize: "17px",
    lineHeight: "1.7",
    color: "#cdb6c4",
    marginTop: "-8px",
    marginBottom: "26px",
  },
  authBox: {
    marginTop: "32px",
    border: "1px solid rgba(255,255,255,0.1)",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.075), rgba(255,255,255,0.035))",
    borderRadius: "32px",
    padding: "28px",
    boxShadow:
      "0 28px 100px rgba(0,0,0,0.36), inset 0 1px 0 rgba(255,255,255,0.08)",
  },
  featureGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
    gap: "18px",
    marginTop: "22px",
    marginBottom: "34px",
  },
  featureCard: {
    border: "1px solid rgba(255,255,255,0.1)",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.075), rgba(255,255,255,0.035))",
    borderRadius: "30px",
    padding: "24px",
    textAlign: "right" as const,
    boxShadow:
      "0 26px 90px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.07)",
  },
  featureIcon: {
    width: "48px",
    height: "48px",
    borderRadius: "18px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "27px",
    marginBottom: "14px",
    background:
      "linear-gradient(135deg, rgba(244,114,182,0.24), rgba(168,85,247,0.13))",
    border: "1px solid rgba(255,255,255,0.1)",
    boxShadow: "0 14px 35px rgba(236,72,153,0.14)",
  },
  featureTitle: {
    margin: "0 0 10px",
    fontSize: "20px",
    color: "#fff5fb",
    fontWeight: 900,
  },
  featureText: {
    margin: 0,
    fontSize: "15px",
    lineHeight: "1.75",
    color: "#d1bac8",
  },
  form: {
    display: "grid",
    gap: "17px",
    textAlign: "right" as const,
  },
  doubleGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "17px",
  },
  label: {
    display: "grid",
    gap: "9px",
    fontSize: "15px",
    color: "#f7dce9",
    fontWeight: 800,
  },
  input: {
    width: "100%",
    boxSizing: "border-box" as const,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "#fff9fd",
    borderRadius: "20px",
    padding: "16px 18px",
    fontSize: "16px",
    outline: "none",
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.06), 0 14px 34px rgba(0,0,0,0.14)",
  },
  button: {
    marginTop: "15px",
    background:
      "linear-gradient(135deg, #ff7ac1 0%, #ec4899 45%, #be185d 100%)",
    color: "white",
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: "22px",
    padding: "17px 30px",
    fontSize: "19px",
    fontWeight: 950,
    cursor: "pointer",
    boxShadow:
      "0 22px 55px rgba(236,72,153,0.34), inset 0 1px 0 rgba(255,255,255,0.28)",
  },
  whatsappButton: {
    marginTop: "20px",
    marginBottom: "14px",
    background:
      "linear-gradient(135deg, #34d399 0%, #22c55e 45%, #15803d 100%)",
    color: "white",
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: "22px",
    padding: "17px 30px",
    fontSize: "19px",
    fontWeight: 950,
    cursor: "pointer",
    display: "block",
    width: "100%",
    boxShadow:
      "0 22px 55px rgba(34,197,94,0.3), inset 0 1px 0 rgba(255,255,255,0.25)",
  },
  secondaryButton: {
    marginTop: "12px",
    background: "rgba(255,255,255,0.055)",
    color: "#f4deea",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "20px",
    padding: "14px 24px",
    fontSize: "15px",
    fontWeight: 700,
    cursor: "pointer",
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.06), 0 12px 30px rgba(0,0,0,0.16)",
  },
  approveButton: {
    marginTop: "14px",
    background: "linear-gradient(135deg, #34d399, #16a34a)",
    color: "white",
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: "20px",
    padding: "15px 26px",
    fontSize: "17px",
    fontWeight: 950,
    cursor: "pointer",
  },
  previewBox: {
    border: "1px solid rgba(255,255,255,0.1)",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.085), rgba(255,255,255,0.04))",
    borderRadius: "32px",
    padding: "26px",
    marginBottom: "22px",
    textAlign: "right" as const,
    fontSize: "18px",
    color: "#faeaf2",
    boxShadow:
      "0 28px 90px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.08)",
  },
  infoBox: {
    border: "1px solid rgba(244,114,182,0.24)",
    background:
      "linear-gradient(135deg, rgba(244,114,182,0.1), rgba(168,85,247,0.055))",
    borderRadius: "24px",
    padding: "17px",
    marginBottom: "22px",
    textAlign: "right" as const,
    color: "#f6d6e6",
    fontSize: "16px",
  },
  stepBox: {
    border: "1px solid rgba(244,114,182,0.24)",
    background:
      "linear-gradient(135deg, rgba(244,114,182,0.1), rgba(168,85,247,0.055))",
    borderRadius: "26px",
    padding: "22px",
    marginBottom: "22px",
    textAlign: "right" as const,
    color: "#f6d6e6",
    fontSize: "17px",
  },
  linkBox: {
    border: "1px solid rgba(244,114,182,0.22)",
    background:
      "linear-gradient(135deg, rgba(244,114,182,0.08), rgba(168,85,247,0.045))",
    borderRadius: "26px",
    padding: "22px",
    marginBottom: "22px",
    textAlign: "right" as const,
  },
  linkLabel: {
    margin: "0 0 8px",
    color: "#f9a8d4",
    fontWeight: 950,
  },
  linkText: {
    direction: "ltr" as const,
    textAlign: "left" as const,
    background: "rgba(0,0,0,0.32)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "18px",
    padding: "14px",
    overflowX: "auto" as const,
    whiteSpace: "nowrap" as const,
    color: "#fff9fd",
  },
  claimBox: {
    border: "1px solid rgba(34,197,94,0.34)",
    background:
      "linear-gradient(135deg, rgba(34,197,94,0.13), rgba(34,197,94,0.045))",
    borderRadius: "30px",
    padding: "26px",
    marginBottom: "22px",
    textAlign: "right" as const,
    fontSize: "18px",
    color: "#edfff2",
    boxShadow: "0 22px 60px rgba(34,197,94,0.08)",
  },
  miniClaimBox: {
    border: "1px solid rgba(34,197,94,0.3)",
    background: "rgba(34,197,94,0.08)",
    borderRadius: "20px",
    padding: "13px 17px",
    marginTop: "13px",
  },
  previewTitle: {
    marginTop: 0,
    fontSize: "30px",
    color: "#fff9fd",
    letterSpacing: "-0.6px",
    fontWeight: 950,
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
    gap: "18px",
    marginTop: "30px",
    marginBottom: "22px",
  },
  statCard: {
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.085), rgba(255,255,255,0.04))",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "30px",
    padding: "24px",
    boxShadow:
      "0 26px 85px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.07)",
  },
  statNumber: {
    margin: 0,
    fontSize: "36px",
    fontWeight: 950,
    color: "#ff8ac7",
    textShadow: "0 12px 35px rgba(236,72,153,0.22)",
  },
  statLabel: {
    margin: "9px 0 0",
    color: "#d9c5d1",
    fontSize: "14px",
    fontWeight: 700,
  },
  dashboardTip: {
    marginTop: "14px",
    marginBottom: "22px",
    padding: "17px 20px",
    borderRadius: "22px",
    border: "1px solid rgba(255,255,255,0.1)",
    background:
      "linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))",
    color: "#ddc9d5",
    fontSize: "15px",
  },
  actionRow: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "12px",
    justifyContent: "center",
    alignItems: "center",
    marginTop: "8px",
  },
  historyList: {
    display: "grid",
    gap: "18px",
  },
  historyCard: {
    border: "1px solid rgba(255,255,255,0.1)",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04))",
    borderRadius: "32px",
    padding: "26px",
    textAlign: "right" as const,
    color: "#faeaf2",
    boxShadow:
      "0 28px 90px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.08)",
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
    padding: "9px 13px",
    background: "rgba(255,255,255,0.065)",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "#fce7f3",
    fontSize: "13px",
    fontWeight: 900,
  },
  mutedText: {
    color: "#b39aa8",
  },
  buttonRow: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "10px",
    marginTop: "17px",
  },
  smallButton: {
    background: "linear-gradient(135deg, #ff7ac1, #db2777)",
    color: "white",
    border: "none",
    borderRadius: "15px",
    padding: "11px 17px",
    fontSize: "14px",
    fontWeight: 950,
    cursor: "pointer",
  },
  smallSecondaryButton: {
    background: "rgba(255,255,255,0.055)",
    color: "#f0dce7",
    border: "1px solid rgba(255,255,255,0.11)",
    borderRadius: "15px",
    padding: "11px 17px",
    fontSize: "14px",
    cursor: "pointer",
  },
  smallWhatsappButton: {
    background: "linear-gradient(135deg, #34d399, #16a34a)",
    color: "white",
    border: "none",
    borderRadius: "15px",
    padding: "11px 17px",
    fontSize: "14px",
    fontWeight: 950,
    cursor: "pointer",
  },
  smallApproveButton: {
    background: "linear-gradient(135deg, #34d399, #15803d)",
    color: "white",
    border: "none",
    borderRadius: "15px",
    padding: "11px 17px",
    fontSize: "14px",
    fontWeight: 950,
    cursor: "pointer",
  },
};

export default App;