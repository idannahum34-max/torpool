import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import "./App.css";

type SlotStatus = "open" | "filled" | "cancelled" | "closed";
type ClaimStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "not_selected"
  | "cancelled";

type Slot = {
  id: string;
  owner_email: string;
  title: string;
  date: string;
  time: string;
  price: number | null;
  notes: string | null;
  status: SlotStatus;
  created_at?: string;
  approved_claim_id?: string | null;
};

type Claim = {
  id: string;
  owner_email: string;
  slot_id: string;
  full_name: string;
  phone: string;
  email?: string | null;
  status: ClaimStatus;
  created_at?: string;
  slot_title?: string | null;
  slot_date?: string | null;
  slot_time?: string | null;
  slot_price?: number | null;
};

type AllowedUser = {
  email: string;
  is_active: boolean;
  note?: string | null;
};

type TabKey = "overview" | "slots" | "requests" | "history" | "settings";

const paymentWhatsappPhone = "972559998187";

const tabs: { key: TabKey; label: string }[] = [
  { key: "overview", label: "לוח בקרה" },
  { key: "slots", label: "התראות / תורים" },
  { key: "requests", label: "לקוחות" },
  { key: "history", label: "היסטוריה" },
  { key: "settings", label: "הגדרות" },
];

function formatCurrency(value?: number | null) {
  return `${value ?? 0} ₪`;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("he-IL");
}

function formatTime(value?: string | null) {
  if (!value) return "-";
  return value.slice(0, 5);
}

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const publicSlotId = params.get("slot");
  const view = params.get("view");

  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);

  const [authLoading, setAuthLoading] = useState(true);
  const [checkingAccess, setCheckingAccess] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);

  const [slots, setSlots] = useState<Slot[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  const [tab, setTab] = useState<TabKey>("overview");
  const [notice, setNotice] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [newSlotTitle, setNewSlotTitle] = useState("");
  const [newSlotDate, setNewSlotDate] = useState("");
  const [newSlotTime, setNewSlotTime] = useState("");
  const [newSlotPrice, setNewSlotPrice] = useState("");
  const [newSlotNotes, setNewSlotNotes] = useState("");

  const [publicSlot, setPublicSlot] = useState<Slot | null>(null);
  const [publicLoading, setPublicLoading] = useState(false);
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");

  const isPublicClientView = Boolean(publicSlotId && view === "client");

  useEffect(() => {
    const load = async () => {
      const {
        data: { session: initialSession },
      } = await supabase.auth.getSession();

      setSession(initialSession);
      setUser(initialSession?.user ?? null);
      setAuthLoading(false);
    };

    load();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!isPublicClientView || !publicSlotId) return;
    void loadPublicSlot(publicSlotId);
  }, [isPublicClientView, publicSlotId]);

  useEffect(() => {
    if (!user || isPublicClientView) return;
    void checkAccessAndLoad();
  }, [user, isPublicClientView]);

  const openSlots = useMemo(
    () => slots.filter((slot) => slot.status === "open"),
    [slots]
  );

  const pendingClaims = useMemo(
    () => claims.filter((claim) => claim.status === "pending"),
    [claims]
  );

  const approvedClaims = useMemo(
    () => claims.filter((claim) => claim.status === "approved"),
    [claims]
  );

  const historySlots = useMemo(
    () => slots.filter((slot) => slot.status !== "open"),
    [slots]
  );

  const recoveredRevenue = useMemo(() => {
    return approvedClaims.reduce((sum, claim) => sum + (claim.slot_price ?? 0), 0);
  }, [approvedClaims]);

  const paymentMessage = encodeURIComponent(
    `היי, נרשמתי לתורפול ואני רוצה להצטרף למנוי.

האימייל שאיתו נרשמתי:
${user?.email || ""}

אשמח לקבל קישור תשלום בביט או פייבוקס.

לאחר התשלום אשלח צילום אישור כדי לפתוח לי גישה.`
  );

  const paymentWhatsappLink = `https://wa.me/${paymentWhatsappPhone}?text=${paymentMessage}`;

  async function checkAccessAndLoad() {
    if (!user?.email) return;

    setCheckingAccess(true);
    try {
      const { data: accessRow, error: accessError } = await supabase
        .from("allowed_users")
        .select("*")
        .eq("email", user.email)
        .maybeSingle<AllowedUser>();

      if (accessError) throw accessError;

      const active = Boolean(accessRow?.is_active);
      setHasAccess(active);

      if (active) {
        await loadOwnerData(user.email);
      } else {
        setSlots([]);
        setClaims([]);
      }
    } catch (error) {
      console.error(error);
      showNotice("error", "לא הצלחנו לבדוק גישה למערכת.");
    } finally {
      setCheckingAccess(false);
    }
  }

  async function loadOwnerData(ownerEmail: string) {
    setDataLoading(true);
    try {
      const [{ data: slotsData, error: slotsError }, { data: claimsData, error: claimsError }] =
        await Promise.all([
          supabase
            .from("slots")
            .select("*")
            .eq("owner_email", ownerEmail)
            .order("date", { ascending: true })
            .order("time", { ascending: true }),
          supabase
            .from("claims")
            .select("*")
            .eq("owner_email", ownerEmail)
            .order("created_at", { ascending: false }),
        ]);

      if (slotsError) throw slotsError;
      if (claimsError) throw claimsError;

      setSlots((slotsData as Slot[]) ?? []);
      setClaims((claimsData as Claim[]) ?? []);
    } catch (error) {
      console.error(error);
      showNotice("error", "שגיאה בטעינת נתוני העסק.");
    } finally {
      setDataLoading(false);
    }
  }

  async function loadPublicSlot(slotId: string) {
    setPublicLoading(true);
    try {
      const { data, error } = await supabase
        .from("slots")
        .select("*")
        .eq("id", slotId)
        .maybeSingle<Slot>();

      if (error) throw error;
      setPublicSlot(data ?? null);
    } catch (error) {
      console.error(error);
      setPublicSlot(null);
      showNotice("error", "לא הצלחנו לטעון את התור.");
    } finally {
      setPublicLoading(false);
    }
  }

  function showNotice(type: "success" | "error" | "info", text: string) {
    setNotice({ type, text });
    window.setTimeout(() => {
      setNotice(null);
    }, 3000);
  }

  async function handleAuth(e: FormEvent) {
    e.preventDefault();

    try {
      if (authMode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;
        showNotice("success", "התחברת בהצלחה.");
      } else {
        const redirectTo = window.location.origin;
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectTo },
        });

        if (error) throw error;
        showNotice(
          "success",
          "ההרשמה הצליחה. אם קיבלת מייל אימות – אשרי אותו ואז התחברי."
        );
        setAuthMode("login");
      }
    } catch (error: any) {
      console.error(error);
      showNotice("error", error?.message || "שגיאה בהתחברות / הרשמה.");
    }
  }

  async function handleForgotPassword() {
    if (!email) {
      showNotice("info", "יש להזין אימייל קודם.");
      return;
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });

      if (error) throw error;
      showNotice("success", "נשלח אלייך מייל לאיפוס סיסמה.");
    } catch (error: any) {
      console.error(error);
      showNotice("error", error?.message || "לא הצלחנו לשלוח מייל איפוס.");
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setHasAccess(false);
    setSlots([]);
    setClaims([]);
    showNotice("success", "התנתקת.");
  }

  async function handleCreateSlot(e: FormEvent) {
    e.preventDefault();
    if (!user?.email) return;

    if (!newSlotTitle || !newSlotDate || !newSlotTime) {
      showNotice("info", "יש למלא טיפול, תאריך ושעה.");
      return;
    }

    try {
      const payload = {
        owner_email: user.email,
        title: newSlotTitle,
        date: newSlotDate,
        time: newSlotTime,
        price: Number(newSlotPrice || 0),
        notes: newSlotNotes || null,
        status: "open",
      };

      const { error } = await supabase.from("slots").insert(payload);
      if (error) throw error;

      setNewSlotTitle("");
      setNewSlotDate("");
      setNewSlotTime("");
      setNewSlotPrice("");
      setNewSlotNotes("");

      await loadOwnerData(user.email);
      showNotice("success", "התור נוצר בהצלחה.");
    } catch (error) {
      console.error(error);
      showNotice("error", "לא הצלחנו ליצור תור.");
    }
  }

  function buildClientLink(slot: Slot) {
    return `${window.location.origin}/?slot=${slot.id}&view=client`;
  }

  function buildWhatsappBroadcast(slot: Slot) {
    return `היי אהובות ♡

התפנה לי תור:

טיפול: ${slot.title}
תאריך: ${formatDate(slot.date)}
שעה: ${formatTime(slot.time)}
מחיר: ${formatCurrency(slot.price)}

לפרטים ותפיסת התור:
${buildClientLink(slot)}`;
  }

  async function copyBroadcastText(slot: Slot) {
    try {
      await navigator.clipboard.writeText(buildWhatsappBroadcast(slot));
      showNotice("success", "הודעת ה-WhatsApp הועתקה.");
    } catch (error) {
      console.error(error);
      showNotice("error", "לא הצלחנו להעתיק את ההודעה.");
    }
  }

  async function copyClientLink(slot: Slot) {
    try {
      await navigator.clipboard.writeText(buildClientLink(slot));
      showNotice("success", "הלינק ללקוחה הועתק.");
    } catch (error) {
      console.error(error);
      showNotice("error", "לא הצלחנו להעתיק את הלינק.");
    }
  }

  async function handleCloseSlot(slotId: string, nextStatus: SlotStatus) {
    if (!user?.email) return;

    try {
      const { error } = await supabase
        .from("slots")
        .update({ status: nextStatus })
        .eq("id", slotId);

      if (error) throw error;

      await loadOwnerData(user.email);
      showNotice(
        "success",
        nextStatus === "cancelled" ? "התור סומן כמבוטל." : "התור נסגר."
      );
    } catch (error) {
      console.error(error);
      showNotice("error", "לא הצלחנו לעדכן את התור.");
    }
  }

  async function handleDeleteSlot(slotId: string) {
    if (!user?.email) return;
    const confirmDelete = window.confirm("למחוק את התור הזה ואת כל הבקשות שלו?");
    if (!confirmDelete) return;

    try {
      const { error: claimsError } = await supabase
        .from("claims")
        .delete()
        .eq("slot_id", slotId);

      if (claimsError) throw claimsError;

      const { error: slotError } = await supabase.from("slots").delete().eq("id", slotId);
      if (slotError) throw slotError;

      await loadOwnerData(user.email);
      showNotice("success", "התור נמחק.");
    } catch (error) {
      console.error(error);
      showNotice("error", "לא הצלחנו למחוק את התור.");
    }
  }

  async function handleDeleteClaim(claimId: string) {
    if (!user?.email) return;

    const confirmDelete = window.confirm("למחוק את הבקשה הזאת?");
    if (!confirmDelete) return;

    try {
      const { error } = await supabase.from("claims").delete().eq("id", claimId);
      if (error) throw error;

      await loadOwnerData(user.email);
      showNotice("success", "הבקשה נמחקה.");
    } catch (error) {
      console.error(error);
      showNotice("error", "לא הצלחנו למחוק את הבקשה.");
    }
  }

  async function handleApproveClaim(claim: Claim) {
    if (!user?.email) return;

    try {
      const { error: claimError } = await supabase
        .from("claims")
        .update({ status: "approved" })
        .eq("id", claim.id);

      if (claimError) throw claimError;

      const { error: othersError } = await supabase
        .from("claims")
        .update({ status: "not_selected" })
        .eq("slot_id", claim.slot_id)
        .neq("id", claim.id)
        .eq("status", "pending");

      if (othersError) throw othersError;

      const { error: slotError } = await supabase
        .from("slots")
        .update({
          status: "filled",
          approved_claim_id: claim.id,
        })
        .eq("id", claim.slot_id);

      if (slotError) throw slotError;

      await loadOwnerData(user.email);
      showNotice("success", "הבקשה אושרה והתור נסגר.");
    } catch (error) {
      console.error(error);
      showNotice("error", "לא הצלחנו לאשר את הבקשה.");
    }
  }

  async function handleRejectClaim(claimId: string) {
    if (!user?.email) return;

    try {
      const { error } = await supabase
        .from("claims")
        .update({ status: "rejected" })
        .eq("id", claimId);

      if (error) throw error;

      await loadOwnerData(user.email);
      showNotice("success", "הבקשה נדחתה.");
    } catch (error) {
      console.error(error);
      showNotice("error", "לא הצלחנו לדחות את הבקשה.");
    }
  }

  async function handleSubmitPublicClaim(e: FormEvent) {
    e.preventDefault();

    if (!publicSlot) return;

    if (publicSlot.status !== "open") {
      showNotice("info", "התור כבר לא זמין.");
      return;
    }

    if (!clientName || !clientPhone) {
      showNotice("info", "יש למלא שם וטלפון.");
      return;
    }

    try {
      const payload = {
        owner_email: publicSlot.owner_email,
        slot_id: publicSlot.id,
        full_name: clientName,
        phone: clientPhone,
        email: clientEmail || null,
        status: "pending",
        slot_title: publicSlot.title,
        slot_date: publicSlot.date,
        slot_time: publicSlot.time,
        slot_price: publicSlot.price ?? 0,
      };

      const { error } = await supabase.from("claims").insert(payload);
      if (error) throw error;

      try {
        await supabase.functions.invoke("send-claim-email", {
          body: {
            ownerEmail: publicSlot.owner_email,
            claimantName: clientName,
            claimantPhone: clientPhone,
            claimantEmail: clientEmail || "",
            slotTitle: publicSlot.title,
            slotDate: publicSlot.date,
            slotTime: publicSlot.time,
            slotPrice: publicSlot.price ?? 0,
            siteUrl: window.location.origin,
          },
        });
      } catch (mailError) {
        console.error("Email function error:", mailError);
      }

      setClientName("");
      setClientPhone("");
      setClientEmail("");

      showNotice(
        "success",
        "הבקשה נשלחה בהצלחה. בעלת העסק תראה אותה במערכת."
      );
    } catch (error) {
      console.error(error);
      showNotice("error", "שגיאה בשליחת הבקשה.");
    }
  }

  function openOwnerWhatsapp(claim: Claim) {
    const cleanPhone = claim.phone.replace(/\D/g, "");
    const phone =
      cleanPhone.startsWith("0") ? `972${cleanPhone.slice(1)}` : cleanPhone;

    const message = encodeURIComponent(`היי ${claim.full_name},

קיבלתי את הבקשה שלך דרך תורפול עבור:
${claim.slot_title || "תור"}
בתאריך ${formatDate(claim.slot_date)}
בשעה ${formatTime(claim.slot_time)}.

אני יוצרת איתך קשר לגבי התור.`);

    window.open(`https://wa.me/${phone}?text=${message}`, "_blank");
  }

  function renderPublicView() {
    return (
      <div className="page page--public">
        <div className="shell">
          <div className="brandbar brandbar--public">
            <div className="brandmark">TP</div>
            <div>
              <div className="brandtitle">תורפול</div>
              <div className="brandsub">תופסים ביטולים במהירות</div>
            </div>
          </div>

          {publicLoading ? (
            <div className="hero-card centered-card">
              <p>טוען תור...</p>
            </div>
          ) : !publicSlot ? (
            <div className="hero-card centered-card">
              <h2>התור לא נמצא</h2>
              <p>יכול להיות שהוא נמחק או שהלינק כבר לא תקף.</p>
            </div>
          ) : (
            <div className="public-layout">
              <section className="hero-card public-summary">
                <span className="eyebrow">בקשת תור מהירה</span>
                <h1>{publicSlot.title}</h1>

                <div className="public-meta">
                  <div className="public-meta-item">
                    <span>תאריך</span>
                    <strong>{formatDate(publicSlot.date)}</strong>
                  </div>
                  <div className="public-meta-item">
                    <span>שעה</span>
                    <strong>{formatTime(publicSlot.time)}</strong>
                  </div>
                  <div className="public-meta-item">
                    <span>מחיר</span>
                    <strong>{formatCurrency(publicSlot.price)}</strong>
                  </div>
                </div>

                <p className="hero-description">
                  השאירי פרטים ובעלת העסק תראה את הבקשה שלך במערכת. כל עוד התור
                  לא אושר למישהי אחרת, גם את יכולה להגיש בקשה.
                </p>

                <div className="slot-status-inline">
                  מצב התור:{" "}
                  <strong>
                    {publicSlot.status === "open"
                      ? "פתוח"
                      : publicSlot.status === "filled"
                      ? "נתפס"
                      : publicSlot.status === "cancelled"
                      ? "בוטל"
                      : "סגור"}
                  </strong>
                </div>
              </section>

              <section className="glass-card public-form-card">
                <h2>השאירי פרטים</h2>
                <form className="form-grid" onSubmit={handleSubmitPublicClaim}>
                  <label className="field">
                    <span>שם מלא</span>
                    <input
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      placeholder="למשל: דנה כהן"
                    />
                  </label>

                  <label className="field">
                    <span>טלפון</span>
                    <input
                      value={clientPhone}
                      onChange={(e) => setClientPhone(e.target.value)}
                      placeholder="0501234567"
                    />
                  </label>

                  <label className="field field--full">
                    <span>אימייל (לא חובה)</span>
                    <input
                      value={clientEmail}
                      onChange={(e) => setClientEmail(e.target.value)}
                      placeholder="name@email.com"
                    />
                  </label>

                  <button className="btn btn--primary btn--full" type="submit">
                    שלחי בקשה לתפוס את התור
                  </button>
                </form>
              </section>
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderAuthView() {
    return (
      <div className="page">
        <div className="shell">
          <header className="hero-card hero-card--landing">
            <div className="hero-copy">
              <span className="eyebrow">תורפול · מלאי תורים שהתפנו</span>
              <h1>כל תור שמתפנה יכול להפוך להכנסה שחוזרת ליומן.</h1>
              <p className="hero-description">
                מערכת מעוצבת לעצמאיות שעובדות עם יומן צפוף ורוצות למלא חורים של
                הרגע האחרון בצורה מהירה, מסודרת ומקצועית.
              </p>

              <div className="hero-pills">
                <span className="pill">קישור לקוחה מוכן</span>
                <span className="pill">בקשות מרובות לכל תור</span>
                <span className="pill">אישור בלחיצה</span>
              </div>
            </div>

            <div className="auth-panel glass-card">
              <div className="auth-switch">
                <button
                  className={cn("auth-tab", authMode === "login" && "active")}
                  onClick={() => setAuthMode("login")}
                  type="button"
                >
                  התחברות
                </button>
                <button
                  className={cn("auth-tab", authMode === "signup" && "active")}
                  onClick={() => setAuthMode("signup")}
                  type="button"
                >
                  הרשמה
                </button>
              </div>

              <form onSubmit={handleAuth} className="form-grid">
                <label className="field field--full">
                  <span>אימייל</span>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    type="email"
                  />
                </label>

                <label className="field field--full">
                  <span>סיסמה</span>
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="לפחות 6 תווים"
                    type="password"
                  />
                </label>

                <button className="btn btn--primary btn--full" type="submit">
                  {authMode === "login" ? "התחברות" : "יצירת חשבון"}
                </button>
              </form>

              <button
                type="button"
                className="text-button"
                onClick={handleForgotPassword}
              >
                שכחתי סיסמה
              </button>
            </div>
          </header>
        </div>
      </div>
    );
  }

  function renderPaywall() {
    return (
      <div className="page">
        <div className="shell">
          <header className="dashboard-header">
            <div className="brandbar">
              <div className="brandmark">TP</div>
              <div>
                <div className="brandtitle">תורפול</div>
                <div className="brandsub">מערכת לניהול תורים שהתפנו</div>
              </div>
            </div>

            <button className="btn btn--ghost" onClick={handleLogout}>
              התנתקות
            </button>
          </header>

          <div className="paywall-grid">
            <section className="hero-card paywall-copy">
              <span className="eyebrow">גישה למנויים בלבד</span>
              <h1>החשבון נוצר בהצלחה. עכשיו פותחים לך גישה לעסק.</h1>
              <p className="hero-description">
                המערכת פעילה רק למנויים משלמים. לאחר תשלום מנוי ידני בביט או
                פייבוקס, נאשר את האימייל שלך ותוכלי להיכנס לממשק המלא.
              </p>

              <div className="feature-list">
                <div className="feature-item">
                  <strong>יצירת תורים שהתפנו</strong>
                  <span>בלחיצה אחת עם לינק לקוחה מוכן.</span>
                </div>
                <div className="feature-item">
                  <strong>כמה בקשות על אותו תור</strong>
                  <span>כל עוד לא אישרת לקוחה, אחרות עדיין יכולות להגיש בקשה.</span>
                </div>
                <div className="feature-item">
                  <strong>היסטוריה ודשבורד עסקי</strong>
                  <span>תמונת מצב מהירה והכנסות שחזרו ליומן.</span>
                </div>
              </div>
            </section>

            <section className="glass-card paywall-card">
              <div className="price-box">
                <span>פיילוט לעסקים ראשונים</span>
                <strong>49 ₪</strong>
                <small>לחודש</small>
              </div>

              <p className="paywall-text">
                לחצי על הכפתור, בקשי קישור תשלום ב-WhatsApp, ולאחר אישור התשלום
                הגישה תיפתח לפי האימייל שאיתו נרשמת.
              </p>

              <a
                href={paymentWhatsappLink}
                target="_blank"
                rel="noreferrer"
                className="btn btn--primary btn--full"
              >
                בקשת קישור תשלום ב-WhatsApp
              </a>

              <div className="paywall-email">
                האימייל שלך: <strong>{user?.email}</strong>
              </div>
            </section>
          </div>
        </div>
      </div>
    );
  }

  function renderOverviewTab() {
    return (
      <div className="dashboard-grid">
        <section className="hero-card hero-card--dashboard">
          <div className="hero-side">
            <div className="mini-card">
              <div className="mini-card__value">{formatCurrency(recoveredRevenue)}</div>
              <div className="mini-card__label">הכנסה שחזרה</div>
            </div>
            <div className="mini-card">
              <div className="mini-card__value">{openSlots.length}</div>
              <div className="mini-card__label">תורים פתוחים</div>
            </div>
            <div className="mini-card">
              <div className="mini-card__value">{pendingClaims.length}</div>
              <div className="mini-card__label">בקשות ממתינות</div>
            </div>
            <div className="mini-card">
              <div className="mini-card__value">{historySlots.length}</div>
              <div className="mini-card__label">היסטוריה</div>
            </div>
          </div>

          <div className="hero-main">
            <span className="eyebrow">לשבור את החור ביומן</span>
            <h1>כל תור שמתפנה יכול להפוך להכנסה שחוזרת לעסק.</h1>
            <p className="hero-description">
              צרי תור שהתפנה, העבירי אותו ללקוחות שלך, וקבלי בקשות מסודרות
              למערכת בלי בלגן, בלי לחפש שוב ושוב ב-WhatsApp ובלי לאבד הכנסה.
            </p>

            <div className="action-pills">
              <button
                className="action-pill action-pill--primary"
                onClick={() => setTab("slots")}
              >
                פתחי תור
              </button>
              <button
                className="action-pill"
                onClick={() => setTab("requests")}
              >
                בקשות ממתינות
              </button>
              <button
                className="action-pill"
                onClick={() => setTab("history")}
              >
                היסטוריית תורים
              </button>
              <button
                className="action-pill"
                onClick={() => setTab("settings")}
              >
                הגדרות
              </button>
            </div>
          </div>
        </section>

        <section className="glass-card">
          <div className="section-head">
            <h2>בקשות ממתינות עכשיו</h2>
            <span>{pendingClaims.length} פתוחות</span>
          </div>

          {pendingClaims.length === 0 ? (
            <EmptyState text="אין כרגע בקשות ממתינות." />
          ) : (
            <div className="stack-list">
              {pendingClaims.slice(0, 4).map((claim) => (
                <div key={claim.id} className="list-card">
                  <div>
                    <strong>{claim.full_name}</strong>
                    <p>
                      {claim.slot_title} · {formatDate(claim.slot_date)} ·{" "}
                      {formatTime(claim.slot_time)}
                    </p>
                  </div>
                  <div className="list-actions">
                    <button
                      className="btn btn--small btn--primary"
                      onClick={() => handleApproveClaim(claim)}
                    >
                      אישור
                    </button>
                    <button
                      className="btn btn--small btn--ghost"
                      onClick={() => openOwnerWhatsapp(claim)}
                    >
                      WhatsApp
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="glass-card">
          <div className="section-head">
            <h2>תורים פתוחים</h2>
            <span>{openSlots.length} זמינים</span>
          </div>

          {openSlots.length === 0 ? (
            <EmptyState text="אין תורים פתוחים כרגע." />
          ) : (
            <div className="stack-list">
              {openSlots.slice(0, 4).map((slot) => {
                const count = claims.filter(
                  (claim) => claim.slot_id === slot.id && claim.status === "pending"
                ).length;

                return (
                  <div key={slot.id} className="list-card">
                    <div>
                      <strong>{slot.title}</strong>
                      <p>
                        {formatDate(slot.date)} · {formatTime(slot.time)} ·{" "}
                        {formatCurrency(slot.price)}
                      </p>
                    </div>
                    <div className="slot-counter">{count} בקשות</div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    );
  }

  function renderSlotsTab() {
    return (
      <div className="dashboard-grid dashboard-grid--slots">
        <section className="glass-card">
          <div className="section-head">
            <h2>יצירת תור שהתפנה</h2>
            <span>חדש</span>
          </div>

          <form onSubmit={handleCreateSlot} className="form-grid">
            <label className="field">
              <span>טיפול</span>
              <input
                value={newSlotTitle}
                onChange={(e) => setNewSlotTitle(e.target.value)}
                placeholder="למשל: טיפול פנים"
              />
            </label>

            <label className="field">
              <span>תאריך</span>
              <input
                value={newSlotDate}
                onChange={(e) => setNewSlotDate(e.target.value)}
                type="date"
              />
            </label>

            <label className="field">
              <span>שעה</span>
              <input
                value={newSlotTime}
                onChange={(e) => setNewSlotTime(e.target.value)}
                type="time"
              />
            </label>

            <label className="field">
              <span>מחיר</span>
              <input
                value={newSlotPrice}
                onChange={(e) => setNewSlotPrice(e.target.value)}
                placeholder="350"
                type="number"
              />
            </label>

            <label className="field field--full">
              <span>הערות</span>
              <input
                value={newSlotNotes}
                onChange={(e) => setNewSlotNotes(e.target.value)}
                placeholder="הערה אופציונלית"
              />
            </label>

            <button className="btn btn--primary btn--full" type="submit">
              הוספת תור
            </button>
          </form>
        </section>

        <section className="glass-card">
          <div className="section-head">
            <h2>כל התורים הפעילים</h2>
            <span>{openSlots.length} פתוחים</span>
          </div>

          {openSlots.length === 0 ? (
            <EmptyState text="עדיין לא פתחת תור חדש." />
          ) : (
            <div className="stack-list">
              {openSlots.map((slot) => {
                const slotClaims = claims.filter((claim) => claim.slot_id === slot.id);
                const pendingCount = slotClaims.filter(
                  (claim) => claim.status === "pending"
                ).length;

                return (
                  <div key={slot.id} className="slot-card">
                    <div className="slot-card__main">
                      <div className="slot-card__head">
                        <div>
                          <h3>{slot.title}</h3>
                          <p>
                            {formatDate(slot.date)} · {formatTime(slot.time)} ·{" "}
                            {formatCurrency(slot.price)}
                          </p>
                        </div>
                        <div className="slot-badge">{pendingCount} בקשות</div>
                      </div>

                      {slot.notes ? <p className="slot-notes">{slot.notes}</p> : null}

                      <div className="slot-actions">
                        <button
                          className="btn btn--small btn--ghost"
                          onClick={() => copyClientLink(slot)}
                        >
                          העתקת לינק
                        </button>
                        <button
                          className="btn btn--small btn--ghost"
                          onClick={() => copyBroadcastText(slot)}
                        >
                          הודעת WhatsApp
                        </button>
                        <button
                          className="btn btn--small btn--danger"
                          onClick={() => handleCloseSlot(slot.id, "cancelled")}
                        >
                          ביטול
                        </button>
                        <button
                          className="btn btn--small btn--danger"
                          onClick={() => handleDeleteSlot(slot.id)}
                        >
                          מחיקה
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    );
  }

  function renderRequestsTab() {
    return (
      <section className="glass-card">
        <div className="section-head">
          <h2>בקשות לקוחות</h2>
          <span>{claims.length} בקשות</span>
        </div>

        {claims.length === 0 ? (
          <EmptyState text="עדיין לא התקבלו בקשות." />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>לקוחה</th>
                  <th>טלפון</th>
                  <th>תור</th>
                  <th>סטטוס</th>
                  <th>פעולות</th>
                </tr>
              </thead>
              <tbody>
                {claims.map((claim) => (
                  <tr key={claim.id}>
                    <td>{claim.full_name}</td>
                    <td>{claim.phone}</td>
                    <td>
                      {claim.slot_title}
                      <div className="cell-sub">
                        {formatDate(claim.slot_date)} · {formatTime(claim.slot_time)}
                      </div>
                    </td>
                    <td>
                      <span className={cn("status-chip", `status-chip--${claim.status}`)}>
                        {claim.status === "pending"
                          ? "ממתינה"
                          : claim.status === "approved"
                          ? "אושרה"
                          : claim.status === "rejected"
                          ? "נדחתה"
                          : claim.status === "not_selected"
                          ? "לא נבחרה"
                          : "בוטלה"}
                      </span>
                    </td>
                    <td>
                      <div className="table-actions">
                        {claim.status === "pending" ? (
                          <>
                            <button
                              className="btn btn--small btn--primary"
                              onClick={() => handleApproveClaim(claim)}
                            >
                              אישור
                            </button>
                            <button
                              className="btn btn--small btn--ghost"
                              onClick={() => handleRejectClaim(claim.id)}
                            >
                              דחייה
                            </button>
                          </>
                        ) : null}

                        <button
                          className="btn btn--small btn--ghost"
                          onClick={() => openOwnerWhatsapp(claim)}
                        >
                          WhatsApp
                        </button>

                        <button
                          className="btn btn--small btn--danger"
                          onClick={() => handleDeleteClaim(claim.id)}
                        >
                          מחיקה
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    );
  }

  function renderHistoryTab() {
    return (
      <section className="glass-card">
        <div className="section-head">
          <h2>היסטוריית תורים</h2>
          <span>{historySlots.length} פריטים</span>
        </div>

        {historySlots.length === 0 ? (
          <EmptyState text="אין היסטוריה עדיין." />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>תור</th>
                  <th>תאריך</th>
                  <th>מחיר</th>
                  <th>סטטוס</th>
                </tr>
              </thead>
              <tbody>
                {historySlots.map((slot) => (
                  <tr key={slot.id}>
                    <td>{slot.title}</td>
                    <td>
                      {formatDate(slot.date)} · {formatTime(slot.time)}
                    </td>
                    <td>{formatCurrency(slot.price)}</td>
                    <td>
                      <span className={cn("status-chip", `status-chip--${slot.status}`)}>
                        {slot.status === "filled"
                          ? "נסגר בהצלחה"
                          : slot.status === "cancelled"
                          ? "בוטל"
                          : "סגור"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    );
  }

  function renderSettingsTab() {
    return (
      <div className="dashboard-grid dashboard-grid--settings">
        <section className="glass-card">
          <div className="section-head">
            <h2>פרטי חשבון</h2>
          </div>

          <div className="settings-list">
            <div className="settings-row">
              <span>אימייל מחובר</span>
              <strong>{user?.email}</strong>
            </div>
            <div className="settings-row">
              <span>גישה למערכת</span>
              <strong>{hasAccess ? "פעילה" : "לא פעילה"}</strong>
            </div>
            <div className="settings-row">
              <span>מספר WhatsApp לתשלום</span>
              <strong>0559998187</strong>
            </div>
          </div>
        </section>

        <section className="glass-card">
          <div className="section-head">
            <h2>פעולות מהירות</h2>
          </div>

          <div className="settings-actions">
            <a
              className="btn btn--primary"
              href={paymentWhatsappLink}
              target="_blank"
              rel="noreferrer"
            >
              בקשת קישור תשלום
            </a>

            <button className="btn btn--ghost" onClick={handleForgotPassword}>
              שליחת איפוס סיסמה
            </button>

            <button className="btn btn--danger" onClick={handleLogout}>
              התנתקות
            </button>
          </div>
        </section>
      </div>
    );
  }

  function renderDashboard() {
    return (
      <div className="page">
        <div className="shell">
          <header className="dashboard-header">
            <div className="brandbar">
              <div className="brandmark">TP</div>
              <div>
                <div className="brandtitle">תורפול</div>
                <div className="brandsub">ניהול תורים שהתפנו</div>
              </div>
            </div>

            <nav className="top-tabs">
              {tabs.map((item) => (
                <button
                  key={item.key}
                  className={cn("top-tab", tab === item.key && "active")}
                  onClick={() => setTab(item.key)}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          </header>

          {dataLoading ? (
            <div className="glass-card centered-card">
              <p>טוען נתונים...</p>
            </div>
          ) : (
            <>
              {tab === "overview" && renderOverviewTab()}
              {tab === "slots" && renderSlotsTab()}
              {tab === "requests" && renderRequestsTab()}
              {tab === "history" && renderHistoryTab()}
              {tab === "settings" && renderSettingsTab()}
            </>
          )}
        </div>
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="page">
        <div className="shell">
          <div className="glass-card centered-card">
            <p>טוען...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {notice ? (
        <div className={cn("notice", `notice--${notice.type}`)}>{notice.text}</div>
      ) : null}

      {isPublicClientView
        ? renderPublicView()
        : !session
        ? renderAuthView()
        : checkingAccess
        ? (
          <div className="page">
            <div className="shell">
              <div className="glass-card centered-card">
                <p>בודק גישה למערכת...</p>
              </div>
            </div>
          </div>
        )
        : hasAccess
        ? renderDashboard()
        : renderPaywall()}
    </>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}