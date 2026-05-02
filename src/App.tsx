import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

type Slot = {
  id: string;
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
  const [showForm, setShowForm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [showClientPage, setShowClientPage] = useState(false);
  const [claim, setClaim] = useState<Claim | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  const clientLink = slot
    ? `${window.location.origin}/?slot=${slot.id}&view=client`
    : "";

  useEffect(() => {
    loadFromUrl();
  }, []);

  async function loadFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const slotId = params.get("slot");
    const view = params.get("view");

    if (!slotId) return;

    setLoading(true);

    const { data: slotData, error: slotError } = await supabase
      .from("slots")
      .select("*")
      .eq("id", slotId)
      .single();

    if (slotError) {
      alert("לא הצלחתי לטעון את התור");
      console.error(slotError);
      setLoading(false);
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

    setLoading(false);
  }

  async function loadHistory() {
    setLoading(true);
    setShowHistory(true);
    setShowForm(false);
    setShowClientPage(false);
    setSlot(null);
    setClaim(null);

    const { data, error } = await supabase
      .from("slots")
      .select("*, claims(*)")
      .order("created_at", { ascending: false });

    if (error) {
      alert("לא הצלחתי לטעון היסטוריית תורים");
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
    setLoading(true);

    const form = new FormData(event.currentTarget);

    const newSlot = {
      business_name: String(form.get("businessName") || ""),
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
    setShowClientPage(false);

    window.history.pushState({}, "", `/?slot=${slot.id}`);

    setLoading(false);
  }

  async function approveClaim(claimToApprove?: Claim, slotToApprove?: Slot) {
    const activeClaim = claimToApprove || claim;
    const activeSlot = slotToApprove || slot;

    if (!activeSlot || !activeClaim) return;

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
      await loadFromUrl();
    }

    setLoading(false);
  }

  function copyClientLink(slotToCopy?: Slot) {
    const targetSlot = slotToCopy || slot;
    if (!targetSlot) return;

    const link = `${window.location.origin}/?slot=${targetSlot.id}&view=client`;
    navigator.clipboard.writeText(link);
    alert("הלינק לתור הועתק!");
  }

  function copyWhatsappMessage(slotToCopy?: Slot) {
    const targetSlot = slotToCopy || slot;
    if (!targetSlot) return;

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

    window.history.pushState({}, "", `/?slot=${historySlot.id}`);
  }

  function resetToHome() {
    setSlot(null);
    setClaim(null);
    setHistory([]);
    setShowHistory(false);
    setShowClientPage(false);
    setShowForm(false);
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

        {!showForm && !slot && !showClientPage && !showHistory && (
          <>
            <h1 style={styles.title}>התבטל תור? תמלאי אותו בקליק.</h1>

            <p style={styles.subtitle}>
              תורפול עוזרת לקוסמטיקאיות וקליניקות למלא חורים ביומן בלי לרדוף
              אחרי לקוחות ב-WhatsApp.
            </p>

            <button style={styles.button} onClick={() => setShowForm(true)}>
              צרי תור פנוי ראשון
            </button>

            <button style={styles.secondaryButton} onClick={loadHistory}>
              צפי בהיסטוריית תורים
            </button>

            <p style={styles.smallText}>
              7 ימים חינם. אם זה לא מילא לך לפחות תור אחד — אל תשלמי.
            </p>
          </>
        )}

        {showForm && (
          <>
            <h1 style={styles.formTitle}>יצירת תור פנוי</h1>

            <form onSubmit={handleCreateSlot} style={styles.form}>
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

        {showHistory && (
          <>
            <h1 style={styles.formTitle}>היסטוריית תורים</h1>

            {history.length === 0 ? (
              <div style={styles.previewBox}>
                <h2 style={styles.previewTitle}>אין עדיין תורים</h2>
                <p>צרי תור ראשון כדי לראות אותו כאן.</p>
              </div>
            ) : (
              <div style={styles.historyList}>
                {history.map((item) => {
                  const latestClaim = item.claims?.[0];

                  return (
                    <div key={item.id} style={styles.historyCard}>
                      <h2 style={styles.previewTitle}>
                        {item.business_name} · {item.service_name}
                      </h2>

                      <p>
                        {item.slot_date} · {item.slot_time}
                        {item.price ? ` · ${item.price} ₪` : ""}
                      </p>

                      <p>סטטוס תור: {item.status}</p>

                      {latestClaim ? (
                        <div style={styles.miniClaimBox}>
                          <p>לקוחה: {latestClaim.client_name}</p>
                          <p>טלפון: {latestClaim.client_phone}</p>
                          <p>סטטוס בקשה: {latestClaim.status}</p>
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

            <button style={styles.button} onClick={() => setShowForm(true)}>
              צרי תור חדש
            </button>

            <button style={styles.secondaryButton} onClick={resetToHome}>
              חזרה למסך הראשי
            </button>
          </>
        )}

        {slot && !showClientPage && !showHistory && (
          <>
            <h1 style={styles.formTitle}>נוצר תור פנוי 🎉</h1>

            <div style={styles.previewBox}>
              <h2 style={styles.previewTitle}>
                התפנה תור אצל {slot.business_name}
              </h2>

              <p>טיפול: {slot.service_name}</p>
              <p>תאריך: {slot.slot_date}</p>
              <p>שעה: {slot.slot_time}</p>
              {slot.price && <p>מחיר: {slot.price} ₪</p>}
              {slot.note && <p>הערה: {slot.note}</p>}
              <p>סטטוס: {slot.status}</p>
            </div>

            <div style={styles.linkBox}>
              <p style={styles.linkLabel}>לינק אמיתי לתור:</p>
              <p style={styles.linkText}>{clientLink}</p>

              <button style={styles.secondaryButton} onClick={() => copyClientLink()}>
                העתיקי לינק לתור
              </button>
            </div>

            {claim && (
              <div style={styles.claimBox}>
                <h2 style={styles.previewTitle}>מישהי תפסה את התור ✅</h2>
                <p>שם: {claim.client_name}</p>
                <p>טלפון: {claim.client_phone}</p>
                <p>סטטוס בקשה: {claim.status}</p>

                {claim.status !== "approved" && (
                  <button style={styles.approveButton} onClick={() => approveClaim()}>
                    אשרי את התור
                  </button>
                )}
              </div>
            )}

            <button style={styles.whatsappButton} onClick={() => copyWhatsappMessage()}>
              העתיקי הודעת WhatsApp
            </button>

            <button
              style={styles.secondaryButton}
              onClick={() => {
                setShowClientPage(true);
                window.history.pushState({}, "", `/?slot=${slot.id}&view=client`);
              }}
            >
              פתחי תצוגת לקוחה
            </button>

            <button style={styles.secondaryButton} onClick={loadHistory}>
              צפי בהיסטוריית תורים
            </button>

            <button style={styles.button} onClick={resetToHome}>
              צרי תור נוסף
            </button>
          </>
        )}

        {slot && showClientPage && !showHistory && (
          <>
            <h1 style={styles.formTitle}>התפנה תור אצל {slot.business_name}</h1>

            <div style={styles.previewBox}>
              <p>טיפול: {slot.service_name}</p>
              <p>תאריך: {slot.slot_date}</p>
              <p>שעה: {slot.slot_time}</p>
              {slot.price && <p>מחיר: {slot.price} ₪</p>}
              {slot.note && <p>הערה: {slot.note}</p>}
            </div>

            {slot.status === "confirmed" ? (
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

            <button
              type="button"
              style={styles.secondaryButton}
              onClick={() => {
                setShowClientPage(false);
                window.history.pushState({}, "", `/?slot=${slot.id}`);
              }}
            >
              חזרה לבעלת העסק
            </button>
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
    fontSize: "64px",
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
  smallText: {
    marginTop: "24px",
    color: "#a3a3a3",
    fontSize: "14px",
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