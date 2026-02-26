"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM",
  "NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA",
  "WV","WI","WY"
];

export default function NewMemberPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    street_address: "",
    street_address_2: "",
    city: "",
    state: "NJ",
    postal_code: "",
    status: "active",
    joined_at: new Date().toISOString().slice(0, 10),
  });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);

    try {
      const res = await fetch("/api/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(json?.error ?? "Save failed");
        return;
      }

      // members POST returns created row
      router.push(`/members/${json?.data?.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 720 }}>
      <Link
  href="/members"
  style={{
    display: "inline-block",
    marginBottom: 12,
    textDecoration: "none",
    padding: "6px 10px",
    border: "1px solid #ddd",
    borderRadius: 8,
  }}
>
  ← Back to Members
</Link>
      <h1>Add Member</h1>

      <form onSubmit={save} style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
          <input
            placeholder="First name"
            value={form.first_name}
            onChange={(e) => setForm({ ...form, first_name: e.target.value })}
          />
          <input
            placeholder="Last name"
            value={form.last_name}
            onChange={(e) => setForm({ ...form, last_name: e.target.value })}
          />
        </div>

        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
          <input
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <input
            placeholder="Phone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </div>

        <div style={{ fontWeight: 600, marginTop: 6 }}>Address</div>

        <input
          placeholder="Street address"
          value={form.street_address}
          onChange={(e) => setForm({ ...form, street_address: e.target.value })}
        />
        <input
          placeholder="Apt / Unit (optional)"
          value={form.street_address_2}
          onChange={(e) => setForm({ ...form, street_address_2: e.target.value })}
        />

        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1.2fr 0.8fr 0.8fr" }}>
          <input
            placeholder="City"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
          />
          <select value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })}>
            {US_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <input
            placeholder="ZIP"
            value={form.postal_code}
            onChange={(e) => setForm({ ...form, postal_code: e.target.value })}
          />
        </div>

        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Town Approval Date</div>
            <input
              type="date"
              style={{ width: "100%", padding: 8 }}
              value={form.joined_at}
              onChange={(e) => setForm({ ...form, joined_at: e.target.value })}
            />
          </div>
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="active">active</option>
            <option value="inactive">inactive</option>
          </select>
        </div>

        <button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save Member"}
        </button>
      </form>
    </main>
  );
}
