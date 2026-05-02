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

    if (slotId) {
      await loadSlotFromUrl();
      setLoading(false);
      return;
    }

    const { data } = await supabase.auth.getSession();

    setSession(data.session);
    setUser(data.session?.user ?? null);

    if (data.session?.user) {
      await loadBusiness(data.session.user.id);
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
    }

    if (view === "client") {
      setShowClientPage(true);
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
        <section style={styles.card}>
          <p style={styles.badge}>תורפול</p>
          <h1 style={styles.formTitle}>טוען...</h1>
        </section>
      </main>
    );
  }

  return (
    <main style={styles.page} dir="rtl">
      <section style={styles.card}>
        <p style={styles.badge}>תורפול · ממלאת תורים שהתפנו דרך WhatsApp</p>

        {slot && showClientPage && (
          <>
            <h1 style={styles.formTitle}>בקשת תור אצל {slot.business_name}</h1>

            <div style={styles.previewBox}>
              <h2 style={styles.previewTitle}>{slot.service_name}</h2>
              <p>📅 תאריך: {slot.slot_date}</p>
              <p>🕒 שעה: {slot.slot_time}</p>
              {slot.price && <p>💸 מחיר: {slot.price} ₪</p>}
              {slot.note && <p>הערה: {slot.note}</p>}
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
                <p>אפשר לחכות לתור הבא שמתפנה.</p>
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
              תורפול עוזרת לקוסמטיקאיות וקליניקות לשלוח לינק ללקוחות,
              לקבל בקשות, ולאשר את מי שמתאימה ליומן.
            </p>

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

              <button style={styles.button} onClick={() => setShowForm(true)}>
                התפנה לי תור
              </button>

              <button style={styles.secondaryButton} onClick={loadHistory}>
                ראי תורים שהתפנו
              </button>

              <button style={styles.secondaryButton} onClick={handleLogout}>
                התנתקות
              </button>
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

              <label style={styles.label}>
                תאריך
                <input name="date" type="date" required style={styles.input} />
              </label>

              <label style={styles.label}>
                שעה
                <input name="time" type="time" required style={styles.input} />
              </label>

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
                  style={{ ...styles.input, minHeight: "90px" }}
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
                      <h2 style={styles.previewTitle}>{item.service_name}</h2>

                      <p>
                        {item.slot_date} · {item.slot_time}
                        {item.price ? ` · ${item.price} ₪` : ""}
                      </p>

                      <p>{statusLabel(item.status)}</p>

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

            <button style={styles.button} onClick={() => setShowForm(true)}>
              התפנה לי תור
            </button>

            <button style={styles.secondaryButton} onClick={resetToDashboard}>
              חזרה לדשבורד
            </button>
          </>
        )}

        {slot && !showClientPage && !showHistory && isOwnerView && (
          <>
            <h1 style={styles.formTitle}>התור מוכן לשליחה 💌</h1>

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

            <button style={styles.secondaryButton} onClick={loadHistory}>
              ראי תורים שהתפנו
            </button>

            <button style={styles.button} onClick={resetToDashboard}>
              חזרה לדשבורד
            </button>
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
      </section>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#fff7f9",
    color: "#2b1f25",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "Arial, sans-serif",
    padding: "24px",
  },
  card: {
    width: "100%",
    maxWidth: "880px",
    textAlign: "center" as const,
  },
  badge: {
    display: "inline-block",
    border: "1px solid #f3d5df",
    background: "#fce7f3",
    color: "#9d174d",
    borderRadius: "999px",
    padding: "10px 18px",
    marginBottom: "24px",
    fontWeight: "bold",
  },
  title: {
    fontSize: "56px",
    lineHeight: "1.05",
    margin: "0",
    color: "#2b1f25",
  },
  formTitle: {
    fontSize: "42px",
    margin: "0 0 24px",
    color: "#2b1f25",
  },
  subtitle: {
    fontSize: "22px",
    lineHeight: "1.7",
    color: "#6b4d59",
    marginTop: "24px",
  },
  subtitleSmall: {
    fontSize: "18px",
    lineHeight: "1.6",
    color: "#6b4d59",
    marginTop: "-8px",
    marginBottom: "24px",
  },
  authBox: {
    marginTop: "32px",
    border: "1px solid #f3d5df",
    background: "#ffffff",
    borderRadius: "24px",
    padding: "24px",
    boxShadow: "0 20px 60px rgba(217, 70, 143, 0.08)",
  },
  form: {
    display: "grid",
    gap: "16px",
    textAlign: "right" as const,
  },
  label: {
    display: "grid",
    gap: "8px",
    fontSize: "16px",
    color: "#3f2c35",
    fontWeight: "bold",
  },
  input: {
    width: "100%",
    boxSizing: "border-box" as const,
    border: "1px solid #f3d5df",
    background: "#ffffff",
    color: "#2b1f25",
    borderRadius: "16px",
    padding: "14px 16px",
    fontSize: "16px",
    outline: "none",
  },
  button: {
    marginTop: "16px",
    background: "#d9468f",
    color: "white",
    border: "none",
    borderRadius: "20px",
    padding: "16px 28px",
    fontSize: "20px",
    fontWeight: "bold",
    cursor: "pointer",
    boxShadow: "0 12px 30px rgba(217, 70, 143, 0.25)",
  },
  whatsappButton: {
    marginTop: "16px",
    marginBottom: "12px",
    background: "#22c55e",
    color: "white",
    border: "none",
    borderRadius: "20px",
    padding: "16px 28px",
    fontSize: "20px",
    fontWeight: "bold",
    cursor: "pointer",
    display: "block",
    width: "100%",
    boxShadow: "0 12px 30px rgba(34, 197, 94, 0.22)",
  },
  secondaryButton: {
    marginTop: "12px",
    background: "#ffffff",
    color: "#6b4d59",
    border: "1px solid #f3d5df",
    borderRadius: "18px",
    padding: "14px 24px",
    fontSize: "16px",
    cursor: "pointer",
  },
  approveButton: {
    marginTop: "12px",
    background: "#16a34a",
    color: "white",
    border: "none",
    borderRadius: "18px",
    padding: "14px 24px",
    fontSize: "18px",
    fontWeight: "bold",
    cursor: "pointer",
  },
  mutedText: {
    color: "#8a6b76",
  },
  previewBox: {
    border: "1px solid #f3d5df",
    background: "#ffffff",
    borderRadius: "24px",
    padding: "24px",
    marginBottom: "20px",
    textAlign: "right" as const,
    fontSize: "18px",
    boxShadow: "0 16px 50px rgba(217, 70, 143, 0.07)",
  },
  infoBox: {
    border: "1px solid #f3d5df",
    background: "#fff0f6",
    borderRadius: "20px",
    padding: "16px",
    marginBottom: "20px",
    textAlign: "right" as const,
    color: "#6b4d59",
    fontSize: "16px",
  },
  stepBox: {
    border: "1px solid #f3d5df",
    background: "#fff0f6",
    borderRadius: "22px",
    padding: "20px",
    marginBottom: "20px",
    textAlign: "right" as const,
    color: "#6b4d59",
    fontSize: "17px",
  },
  linkBox: {
    border: "1px solid #f3d5df",
    background: "#fff0f6",
    borderRadius: "22px",
    padding: "20px",
    marginBottom: "20px",
    textAlign: "right" as const,
  },
  linkLabel: {
    margin: "0 0 8px",
    color: "#9d174d",
    fontWeight: "bold",
  },
  linkText: {
    direction: "ltr" as const,
    textAlign: "left" as const,
    background: "#ffffff",
    border: "1px solid #f3d5df",
    borderRadius: "14px",
    padding: "12px",
    overflowX: "auto" as const,
    whiteSpace: "nowrap" as const,
    color: "#2b1f25",
  },
  claimBox: {
    border: "1px solid rgba(34, 197, 94, 0.35)",
    background: "rgba(34, 197, 94, 0.1)",
    borderRadius: "24px",
    padding: "24px",
    marginBottom: "20px",
    textAlign: "right" as const,
    fontSize: "18px",
  },
  miniClaimBox: {
    border: "1px solid rgba(34, 197, 94, 0.35)",
    background: "rgba(34, 197, 94, 0.08)",
    borderRadius: "16px",
    padding: "12px 16px",
    marginTop: "12px",
  },
  previewTitle: {
    marginTop: 0,
    fontSize: "28px",
    color: "#2b1f25",
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: "14px",
    marginTop: "28px",
    marginBottom: "18px",
  },
  statCard: {
    background: "#ffffff",
    border: "1px solid #f3d5df",
    borderRadius: "22px",
    padding: "18px",
    boxShadow: "0 16px 50px rgba(217, 70, 143, 0.06)",
  },
  statNumber: {
    margin: "0",
    fontSize: "28px",
    fontWeight: "bold",
    color: "#d9468f",
  },
  statLabel: {
    margin: "8px 0 0",
    color: "#6b4d59",
    fontSize: "14px",
  },
  historyList: {
    display: "grid",
    gap: "16px",
  },
  historyCard: {
    border: "1px solid #f3d5df",
    background: "#ffffff",
    borderRadius: "24px",
    padding: "24px",
    textAlign: "right" as const,
    boxShadow: "0 16px 50px rgba(217, 70, 143, 0.07)",
  },
  buttonRow: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "10px",
    marginTop: "16px",
  },
  smallButton: {
    background: "#d9468f",
    color: "white",
    border: "none",
    borderRadius: "14px",
    padding: "10px 16px",
    fontSize: "14px",
    fontWeight: "bold",
    cursor: "pointer",
  },
  smallSecondaryButton: {
    background: "#ffffff",
    color: "#6b4d59",
    border: "1px solid #f3d5df",
    borderRadius: "14px",
    padding: "10px 16px",
    fontSize: "14px",
    cursor: "pointer",
  },
  smallWhatsappButton: {
    background: "#22c55e",
    color: "white",
    border: "none",
    borderRadius: "14px",
    padding: "10px 16px",
    fontSize: "14px",
    fontWeight: "bold",
    cursor: "pointer",
  },
  smallApproveButton: {
    background: "#16a34a",
    color: "white",
    border: "none",
    borderRadius: "14px",
    padding: "10px 16px",
    fontSize: "14px",
    fontWeight: "bold",
    cursor: "pointer",
  },
};

export default App;