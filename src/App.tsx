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
      alert("לא הצלחתי לטעון היסטוריית ביטולים");
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
      alert("שגיאה ביצירת התור");
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
      alert("שגיאה בתפיסת התור");
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

    if (showHistory) {
      await loadHistory();
    } else {
      await loadSlotFromUrl();
    }

    setLoading(false);
  }

  function statusLabel(status: string) {
    if (status === "open") return "פתוח";
    if (status === "claimed") return "ממתין לאישור";
    if (status === "confirmed") return "אושר";
    if (status === "approved") return "אושר";
    if (status === "pending") return "ממתין";
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

    const message = `היי ❤️
התפנה תור ל-${targetSlot.service_name} אצל ${targetSlot.business_name}

📅 ${targetSlot.slot_date}
🕒 ${targetSlot.slot_time}
${targetSlot.price ? `💸 ${targetSlot.price} ₪` : ""}

מי שרוצה לתפוס את התור יכולה להיכנס כאן:
${link}

הראשונה שמשאירה פרטים נכנסת לאישור 🙌`;

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
        <p style={styles.badge}>תורפול · ממלאים ביטולים ברגע האחרון</p>

        {slot && showClientPage && (
          <>
            <h1 style={styles.formTitle}>התפנה תור אצל {slot.business_name}</h1>

            <div style={styles.previewBox}>
              <p>טיפול: {slot.service_name}</p>
              <p>תאריך: {slot.slot_date}</p>
              <p>שעה: {slot.slot_time}</p>
              {slot.price && <p>מחיר: {slot.price} ₪</p>}
              {slot.note && <p>הערה: {slot.note}</p>}
            </div>

            {clientSubmitted && (
              <div style={styles.claimBox}>
                <h2 style={styles.previewTitle}>הבקשה התקבלה ✅</h2>
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
                  אני רוצה את התור
                </button>
              </form>
            )}
          </>
        )}

        {!slot && !session && (
          <>
            <h1 style={styles.title}>התבטל תור? תמלאי אותו בקליק.</h1>

            <p style={styles.subtitle}>
              תורפול עוזרת לקוסמטיקאיות וקליניקות למלא חורים ביומן דרך לינק
              פשוט ללקוחות.
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
              <h1 style={styles.title}>שלום, {business.business_name}</h1>

              <p style={styles.subtitle}>
                צרי ביטול חדש, שלחי לינק ללקוחות, ותראי מי תפסה את התור.
              </p>

              <button style={styles.button} onClick={() => setShowForm(true)}>
                צרי ביטול חדש
              </button>

              <button style={styles.secondaryButton} onClick={loadHistory}>
                צפי בהיסטוריית ביטולים
              </button>

              <button style={styles.secondaryButton} onClick={handleLogout}>
                התנתקות
              </button>
            </>
          )}

        {showForm && business && (
          <>
            <h1 style={styles.formTitle}>יצירת ביטול חדש</h1>

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
                צרי לינק לביטול
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
            <h1 style={styles.formTitle}>היסטוריית ביטולים</h1>

            {history.length === 0 ? (
              <div style={styles.previewBox}>
                <h2 style={styles.previewTitle}>אין עדיין ביטולים</h2>
                <p>צרי ביטול ראשון כדי לראות אותו כאן.</p>
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

                      <p>סטטוס ביטול: {statusLabel(item.status)}</p>

                      {latestClaim ? (
                        <div style={styles.miniClaimBox}>
                          <p>לקוחה: {latestClaim.client_name}</p>
                          <p>טלפון: {latestClaim.client_phone}</p>
                          <p>סטטוס בקשה: {statusLabel(latestClaim.status)}</p>
                        </div>
                      ) : (
                        <p style={styles.mutedText}>
                          עדיין אין בקשות לביטול הזה.
                        </p>
                      )}

                      <div style={styles.buttonRow}>
                        <button
                          style={styles.smallButton}
                          onClick={() => openSlotFromHistory(item)}
                        >
                          פתחי ביטול
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
              צרי ביטול חדש
            </button>

            <button style={styles.secondaryButton} onClick={resetToDashboard}>
              חזרה לדשבורד
            </button>
          </>
        )}

        {slot && !showClientPage && !showHistory && isOwnerView && (
          <>
            <h1 style={styles.formTitle}>נוצר ביטול 🎉</h1>

            <div style={styles.previewBox}>
              <h2 style={styles.previewTitle}>
                התפנה תור אצל {slot.business_name}
              </h2>

              <p>טיפול: {slot.service_name}</p>
              <p>תאריך: {slot.slot_date}</p>
              <p>שעה: {slot.slot_time}</p>
              {slot.price && <p>מחיר: {slot.price} ₪</p>}
              {slot.note && <p>הערה: {slot.note}</p>}
              <p>סטטוס: {statusLabel(slot.status)}</p>
            </div>

            <div style={styles.linkBox}>
              <p style={styles.linkLabel}>לינק ללקוחה:</p>
              <p style={styles.linkText}>{clientLink}</p>

              <button
                style={styles.secondaryButton}
                onClick={() => copyClientLink()}
              >
                העתיקי לינק
              </button>
            </div>

            {claim && (
              <div style={styles.claimBox}>
                <h2 style={styles.previewTitle}>מישהי תפסה את התור ✅</h2>
                <p>שם: {claim.client_name}</p>
                <p>טלפון: {claim.client_phone}</p>
                <p>סטטוס בקשה: {statusLabel(claim.status)}</p>

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

            <button style={styles.secondaryButton} onClick={loadHistory}>
              צפי בהיסטוריית ביטולים
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
    background: "#0a0a0a",
    color: "white",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "Arial, sans-serif",
    padding: "24px",
  },
  card: {
    width: "100%",
    maxWidth: "860px",
    textAlign: "center" as const,
  },
  badge: {
    display: "inline-block",
    border: "1px solid rgba(244, 114, 182, 0.4)",
    background: "rgba(244, 114, 182, 0.12)",
    color: "#fbcfe8",
    borderRadius: "999px",
    padding: "10px 18px",
    marginBottom: "24px",
  },
  title: {
    fontSize: "56px",
    lineHeight: "1.05",
    margin: "0",
  },
  formTitle: {
    fontSize: "42px",
    margin: "0 0 24px",
  },
  subtitle: {
    fontSize: "22px",
    lineHeight: "1.7",
    color: "#d4d4d4",
    marginTop: "24px",
  },
  authBox: {
    marginTop: "32px",
    border: "1px solid #404040",
    background: "#171717",
    borderRadius: "22px",
    padding: "24px",
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
    color: "#e5e5e5",
  },
  input: {
    width: "100%",
    boxSizing: "border-box" as const,
    border: "1px solid #404040",
    background: "#171717",
    color: "white",
    borderRadius: "14px",
    padding: "14px 16px",
    fontSize: "16px",
  },
  button: {
    marginTop: "16px",
    background: "#ec4899",
    color: "white",
    border: "none",
    borderRadius: "18px",
    padding: "16px 28px",
    fontSize: "20px",
    fontWeight: "bold",
    cursor: "pointer",
  },
  whatsappButton: {
    marginTop: "16px",
    marginBottom: "12px",
    background: "#22c55e",
    color: "white",
    border: "none",
    borderRadius: "18px",
    padding: "16px 28px",
    fontSize: "20px",
    fontWeight: "bold",
    cursor: "pointer",
    display: "block",
    width: "100%",
  },
  secondaryButton: {
    marginTop: "12px",
    background: "transparent",
    color: "#d4d4d4",
    border: "1px solid #404040",
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
    color: "#a3a3a3",
  },
  previewBox: {
    border: "1px solid #404040",
    background: "#171717",
    borderRadius: "22px",
    padding: "24px",
    marginBottom: "20px",
    textAlign: "right" as const,
    fontSize: "18px",
  },
  linkBox: {
    border: "1px solid rgba(236, 72, 153, 0.5)",
    background: "rgba(236, 72, 153, 0.08)",
    borderRadius: "22px",
    padding: "20px",
    marginBottom: "20px",
    textAlign: "right" as const,
  },
  linkLabel: {
    margin: "0 0 8px",
    color: "#fbcfe8",
    fontWeight: "bold",
  },
  linkText: {
    direction: "ltr" as const,
    textAlign: "left" as const,
    background: "#0a0a0a",
    border: "1px solid #404040",
    borderRadius: "12px",
    padding: "12px",
    overflowX: "auto" as const,
    whiteSpace: "nowrap" as const,
  },
  claimBox: {
    border: "1px solid rgba(34, 197, 94, 0.5)",
    background: "rgba(34, 197, 94, 0.12)",
    borderRadius: "22px",
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
  },
  historyList: {
    display: "grid",
    gap: "16px",
  },
  historyCard: {
    border: "1px solid #404040",
    background: "#171717",
    borderRadius: "22px",
    padding: "24px",
    textAlign: "right" as const,
  },
  buttonRow: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "10px",
    marginTop: "16px",
  },
  smallButton: {
    background: "#ec4899",
    color: "white",
    border: "none",
    borderRadius: "14px",
    padding: "10px 16px",
    fontSize: "14px",
    fontWeight: "bold",
    cursor: "pointer",
  },
  smallSecondaryButton: {
    background: "transparent",
    color: "#d4d4d4",
    border: "1px solid #404040",
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