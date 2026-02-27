import { useState, useEffect, useRef, useCallback } from "react";

// ═══════════════════════════════════════════
// SALTY OS v2 — Source of Truth Dashboard
// BKE Logistics × Agent Zero Command Center
// ═══════════════════════════════════════════

const ACCENT = {
  cyan: "#00E5FF", cyanDark: "#00B8D4", cyanGlow: "rgba(0, 229, 255, 0.15)",
  cyanBorder: "rgba(0, 229, 255, 0.25)", amber: "#FFB300", green: "#00E676",
  red: "#FF5252", purple: "#B388FF", pink: "#FF80AB", orange: "#FFAB40",
};

const STATUS_COLORS = { backlog: "#64748b", todo: "#00E5FF", inProgress: "#FFB300", inReview: "#B388FF", done: "#00E676" };
const PRIORITY_COLORS = { critical: "#FF5252", high: "#FFAB40", medium: "#4FC3F7", low: "#00E676" };
const STATE_COLORS = { idle: "#00E5FF", running: "#00E676", disabled: "#64748b", error: "#FF5252" };
const STATE_DESC = { idle: "Ready to run", running: "Currently executing", disabled: "Paused — will not execute", error: "Failed — check logs" };

// ─── API Layer ───
const API = window.location.hostname === 'localhost' ? 'http://localhost:3001/api' : '/api';
const api = async (path, opts = {}) => {
  try {
    const res = await fetch(`${API}${path}`, {
      headers: { 'Content-Type': 'application/json', ...opts.headers },
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json();
  } catch (err) {
    console.error(`API ${path}:`, err.message);
    return null;
  }
};
const a0 = (path, body) => api(`/proxy/agent-zero/${path}`, body ? { method: 'POST', body } : {});

// ─── Data ───
const initialKanban = {
  backlog: [
    { id: "t1", title: "Research DAT API integration", desc: "Evaluate DAT load board API for automated rate pulling", agent: "Klaus", priority: "high", created: "2026-02-24" },
    { id: "t2", title: "Build carrier onboarding flow", desc: "Create automated carrier verification and onboarding pipeline", agent: "Rook", priority: "medium", created: "2026-02-23" },
  ],
  todo: [
    { id: "t3", title: "Cold email sequence v2", desc: "Revise 5-touch cold email sequence for manufacturing prospects", agent: "Vex", priority: "critical", created: "2026-02-25" },
    { id: "t4", title: "LinkedIn content calendar", desc: "Plan 30 days of LinkedIn posts for freight thought leadership", agent: "Nova", priority: "high", created: "2026-02-24" },
  ],
  inProgress: [{ id: "t5", title: "Shipper prospect list - Steel", desc: "Build list of 200 steel fabrication companies in Southeast US", agent: "Axel", priority: "critical", created: "2026-02-22" }],
  inReview: [{ id: "t6", title: "Rate calculator tool", desc: "Review automated rate calculation tool for flatbed loads", agent: "Cipher", priority: "high", created: "2026-02-20" }],
  done: [{ id: "t7", title: "Company website draft", desc: "Initial BKE Logistics website with service pages", agent: "Cipher", priority: "medium", created: "2026-02-18" }],
};

const initialAgents = [
  { id: "a1", name: "Klaus", role: "COO", dept: "Operations", status: "active", desc: "Chief Operations Officer agent. Manages all operational workflows, delegates tasks, monitors performance across all departments.", file: "klaus.md" },
  { id: "a2", name: "Axel", role: "Sales Specialist", dept: "Sales", status: "active", desc: "Handles prospecting, cold outreach, lead qualification, and pipeline management.", file: "axel.md" },
  { id: "a3", name: "Cipher", role: "Engineering Lead", dept: "Engineering", status: "active", desc: "Manages technical infrastructure, API integrations, workflow automation.", file: "cipher.md" },
  { id: "a4", name: "Nova", role: "Social Media Specialist", dept: "Social Media", status: "idle", desc: "Creates and schedules content across LinkedIn, Twitter/X. Manages brand voice.", file: "nova.md" },
  { id: "a5", name: "Vex", role: "Email Specialist", dept: "Sales", status: "active", desc: "Crafts cold email sequences, manages drip campaigns, handles deliverability.", file: "vex.md" },
  { id: "a6", name: "Rook", role: "Operations Specialist", dept: "Operations", status: "idle", desc: "Manages carrier relations, load tracking, dispatch coordination.", file: "rook.md" },
  { id: "a7", name: "Slate", role: "Contract Specialist", dept: "Operations", status: "idle", desc: "Handles rate confirmations, broker-carrier agreements, compliance docs.", file: "slate.md" },
  { id: "a8", name: "Pixel", role: "Content Creator", dept: "Social Media", status: "active", desc: "Generates video content, graphics, thumbnails for marketing channels.", file: "pixel.md" },
  { id: "a9", name: "Echo", role: "Research Analyst", dept: "Operations", status: "idle", desc: "Market research, competitor analysis, freight trend reports.", file: "echo.md" },
];

const initialCrons = [
  { id: "c1", name: "Daily Prospect Scrape", type: "scheduled", project: "Lead Generation", state: "idle", minute: "0", hour: "6", day: "*", month: "*", weekday: "*", agent: "Axel", lastRun: "2026-02-26 06:00", nextRun: "2026-02-27 06:00", desc: "Scrape Apollo.io for new manufacturing prospects" },
  { id: "c2", name: "Social Media Post", type: "scheduled", project: "Marketing", state: "running", minute: "0", hour: "9,14", day: "*", month: "*", weekday: "1-5", agent: "Nova", lastRun: "2026-02-26 09:00", nextRun: "2026-02-26 14:00", desc: "Auto-publish scheduled LinkedIn and X posts" },
  { id: "c3", name: "Market Rate Check", type: "scheduled", project: "Operations", state: "idle", minute: "0", hour: "7", day: "*", month: "*", weekday: "1-5", agent: "Echo", lastRun: "2026-02-26 07:00", nextRun: "2026-02-27 07:00", desc: "Pull latest DAT and Truckstop rate data" },
  { id: "c4", name: "Email Follow-up Sequence", type: "scheduled", project: "Lead Generation", state: "disabled", minute: "0", hour: "8", day: "*", month: "*", weekday: "1-5", agent: "Vex", lastRun: "2026-02-25 08:00", nextRun: "—", desc: "Send next touch in cold email sequences" },
  { id: "c5", name: "Weekly Freight Report", type: "scheduled", project: "Operations", state: "idle", minute: "0", hour: "16", day: "*", month: "*", weekday: "5", agent: "Echo", lastRun: "2026-02-21 16:00", nextRun: "2026-02-28 16:00", desc: "Generate PDF freight market analysis report" },
];

const initialDeliverables = [
  { id: "d1", name: "Q1 Freight Market Report", type: "pdf", agent: "Echo", created: "2026-02-21", size: "2.4 MB", color: "#FF5252" },
  { id: "d2", name: "BKE Brand Guidelines", type: "pdf", agent: "Pixel", created: "2026-02-19", size: "8.1 MB", color: "#FF5252" },
  { id: "d3", name: "Flatbed Rate Analysis", type: "pdf", agent: "Echo", created: "2026-02-24", size: "1.8 MB", color: "#FF5252" },
  { id: "d4", name: "LinkedIn Post - Week 8", type: "image", agent: "Pixel", created: "2026-02-25", size: "540 KB", color: "#00E676" },
  { id: "d5", name: "Cold Email Sequence v1", type: "doc", agent: "Vex", created: "2026-02-20", size: "45 KB", color: "#00E5FF" },
  { id: "d6", name: "Carrier Onboarding Deck", type: "pdf", agent: "Slate", created: "2026-02-18", size: "3.2 MB", color: "#FF5252" },
  { id: "d7", name: "Promo Video - Services", type: "video", agent: "Pixel", created: "2026-02-22", size: "48 MB", color: "#B388FF" },
  { id: "d8", name: "Steel Prospect List", type: "doc", agent: "Axel", created: "2026-02-25", size: "120 KB", color: "#00E5FF" },
];

const initialLogs = [
  { id: "l1", time: "2026-02-26 09:14", agent: "Nova", action: "Published LinkedIn post: '5 Things Shippers Want From Their Broker'", type: "success" },
  { id: "l2", time: "2026-02-26 08:02", agent: "Vex", action: "Email sequence paused — bounce rate exceeded 5% threshold", type: "warning" },
  { id: "l3", time: "2026-02-26 07:00", agent: "Echo", action: "Market rate check completed. Flatbed national avg: $2.45/mi (+3.2%)", type: "info" },
  { id: "l4", time: "2026-02-26 06:01", agent: "Axel", action: "Scraped 47 new manufacturing prospects from Apollo.io", type: "success" },
  { id: "l5", time: "2026-02-25 16:30", agent: "Cipher", action: "n8n workflow 'Lead Enrichment' updated — added phone validation step", type: "info" },
  { id: "l6", time: "2026-02-25 14:00", agent: "Nova", action: "Published X post: Flatbed market insights thread (8 tweets)", type: "success" },
  { id: "l7", time: "2026-02-25 11:22", agent: "Klaus", action: "Reassigned 'Rate Calculator' task from Cipher to Rook for review", type: "info" },
  { id: "l8", time: "2026-02-25 09:45", agent: "Axel", action: "Qualified 12 leads from steel fabrication prospect list", type: "success" },
  { id: "l9", time: "2026-02-25 08:00", agent: "Vex", action: "Sent 34 cold emails — Touch 2 of 5-email sequence", type: "success" },
  { id: "l10", time: "2026-02-24 17:00", agent: "Echo", action: "Error: DAT API rate limit reached. Retry scheduled for 18:00", type: "error" },
];

// ─── Icons ───
const I = {
  dashboard: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  kanban: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="12" rx="1"/><rect x="17" y="3" width="5" height="15" rx="1"/></svg>,
  agents: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 1 0-16 0"/></svg>,
  scheduler: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  deliverables: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  logs: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>,
  org: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="2" width="6" height="4" rx="1"/><rect x="2" y="10" width="6" height="4" rx="1"/><rect x="16" y="10" width="6" height="4" rx="1"/><line x1="12" y1="6" x2="12" y2="10"/><line x1="5" y1="10" x2="19" y2="10"/></svg>,
  settings: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  sun: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>,
  moon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>,
  plus: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  x: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  edit: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  trash: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
  download: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  upload: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  menu: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
  chevron: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>,
  eye: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  bolt: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  grip: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="5" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="19" r="1"/></svg>,
  github: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>,
  backup: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>,
  refresh: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>,
  check: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>,
  play: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>,
};

// ─── Styles ───
const makeS = (dark) => ({
  bg: dark ? "#0a0e17" : "#f0f4f8", bgCard: dark ? "#111827" : "#ffffff",
  bgSidebar: dark ? "#0d1220" : "#ffffff", bgInput: dark ? "#1a2332" : "#f1f5f9",
  bgModal: dark ? "rgba(0,0,0,0.8)" : "rgba(0,0,0,0.5)",
  text: dark ? "#e2e8f0" : "#1e293b", textMuted: dark ? "#64748b" : "#94a3b8", textDim: dark ? "#475569" : "#cbd5e1",
  border: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.08)",
  shadow: dark ? "0 4px 24px rgba(0,0,0,0.4)" : "0 4px 24px rgba(0,0,0,0.06)",
  shadowHover: dark ? "0 8px 40px rgba(0,0,0,0.5)" : "0 8px 40px rgba(0,0,0,0.1)",
});

// ─── Components ───
function Card({ color = ACCENT.cyan, children, style = {}, onClick, hoverable = true }) {
  const [h, setH] = useState(false);
  return (<div onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} style={{ position: "relative", borderRadius: 20, overflow: "hidden", cursor: onClick ? "pointer" : "default", transition: "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)", transform: h && hoverable ? "translateY(-4px) scale(1.01)" : "none", ...style }}>
    <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 5, background: color, borderRadius: "20px 0 0 20px", zIndex: 2 }} />
    <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "40%", background: `linear-gradient(90deg, ${color}08, transparent)`, zIndex: 1, pointerEvents: "none" }} />
    <div style={{ position: "relative", zIndex: 2 }}>{children}</div>
  </div>);
}

function Modal({ open, onClose, title, children, s, wide }) {
  if (!open) return null;
  return (<div onClick={onClose} style={{ position: "fixed", inset: 0, background: s.bgModal, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, animation: "fadeIn 0.2s" }}>
    <div onClick={e => e.stopPropagation()} style={{ background: s.bgCard, borderRadius: 24, padding: 32, width: "100%", maxWidth: wide ? 720 : 560, maxHeight: "85vh", overflow: "auto", border: `1px solid ${s.border}`, boxShadow: s.shadowHover, animation: "slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: s.text, margin: 0, fontFamily: "'DM Sans', sans-serif" }}>{title}</h2>
        <button onClick={onClose} style={{ background: s.bgInput, border: "none", borderRadius: 12, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: s.textMuted }}>{I.x}</button>
      </div>{children}
    </div>
  </div>);
}

function Inp({ label, hint, value, onChange, s, placeholder = "", multiline, mono }) {
  const sh = { width: "100%", padding: "12px 16px", background: s.bgInput, border: `1px solid ${s.border}`, borderRadius: 14, color: s.text, fontSize: 14, fontFamily: mono ? "'JetBrains Mono', monospace" : "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box" };
  return (<div style={{ marginBottom: 16 }}>
    {label && <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: ACCENT.cyan, marginBottom: 2, fontFamily: "'DM Sans', sans-serif" }}>{label}</label>}
    {hint && <div style={{ fontSize: 11, color: s.textMuted, marginBottom: 6 }}>{hint}</div>}
    {multiline ? <textarea value={value} onChange={onChange} placeholder={placeholder} rows={4} style={{ ...sh, resize: "vertical" }} /> : <input value={value} onChange={onChange} placeholder={placeholder} style={sh} />}
  </div>);
}

function Sel({ label, hint, value, onChange, options, s }) {
  return (<div style={{ marginBottom: 16 }}>
    {label && <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: ACCENT.cyan, marginBottom: 2, fontFamily: "'DM Sans', sans-serif" }}>{label}</label>}
    {hint && <div style={{ fontSize: 11, color: s.textMuted, marginBottom: 6 }}>{hint}</div>}
    <select value={value} onChange={onChange} style={{ width: "100%", padding: "12px 16px", background: s.bgInput, border: `1px solid ${s.border}`, borderRadius: 14, color: s.text, fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: "none", appearance: "none", cursor: "pointer" }}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </div>);
}

function Btn({ children, onClick, variant = "primary", s, accent = ACCENT.cyan, style: st = {} }) {
  const [h, setH] = useState(false);
  const base = { padding: "10px 20px", borderRadius: 14, border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "all 0.3s", display: "inline-flex", alignItems: "center", gap: 8, transform: h ? "scale(1.03)" : "none" };
  const v = { primary: { background: accent, color: "#0a0e17" }, ghost: { background: "transparent", color: s?.textMuted, border: `1px solid ${s?.border}` }, danger: { background: ACCENT.red + "20", color: ACCENT.red, border: `1px solid ${ACCENT.red}30` }, success: { background: ACCENT.green + "20", color: ACCENT.green, border: `1px solid ${ACCENT.green}30` } };
  return <button onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} onClick={onClick} style={{ ...base, ...v[variant], ...st }}>{children}</button>;
}

function Badge({ text, color }) {
  return <span style={{ display: "inline-block", padding: "4px 12px", borderRadius: 10, fontSize: 11, fontWeight: 700, background: color + "18", color, textTransform: "uppercase", letterSpacing: 0.5 }}>{text}</span>;
}

function StatusDot({ status }) {
  const c = status === "active" || status === "running" ? ACCENT.green : status === "error" ? ACCENT.red : status === "disabled" ? "#64748b" : ACCENT.amber;
  return (<span style={{ position: "relative", display: "inline-block", width: 10, height: 10 }}>
    <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: c }} />
    {(status === "active" || status === "running") && <span style={{ position: "absolute", inset: -3, borderRadius: "50%", background: c, opacity: 0.3, animation: "pulse 2s ease infinite" }} />}
  </span>);
}

// ─── State Toggle (Agent Zero style) ───
function StateToggle({ value, onChange, s }) {
  const states = [{ key: "idle", label: "Idle", color: STATE_COLORS.idle }, { key: "running", label: "Running", color: STATE_COLORS.running }, { key: "disabled", label: "Disabled", color: STATE_COLORS.disabled }, { key: "error", label: "Error", color: STATE_COLORS.error }];
  return (<div style={{ marginBottom: 16 }}>
    <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: ACCENT.cyan, marginBottom: 2, fontFamily: "'DM Sans', sans-serif" }}>State</label>
    <div style={{ fontSize: 11, color: s.textMuted, marginBottom: 8 }}>Select the initial state of the task</div>
    <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
      {states.map(st => (<button key={st.key} onClick={() => onChange(st.key)} style={{ padding: "8px 16px", borderRadius: 12, border: `1px solid ${value === st.key ? st.color : s.border}`, background: value === st.key ? st.color + "20" : "transparent", color: value === st.key ? st.color : s.textMuted, fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.25s" }}>{st.label}</button>))}
    </div>
    <div style={{ fontSize: 13, color: s.text }}><strong style={{ color: STATE_COLORS[value] }}>{value.charAt(0).toUpperCase() + value.slice(1)}</strong>: {STATE_DESC[value]}</div>
  </div>);
}

// ─── Cron Fields (Agent Zero style) ───
function CronFields({ minute, hour, day, month, weekday, onChange, s }) {
  const f = [{ k: "minute", l: "Minute", v: minute }, { k: "hour", l: "Hour", v: hour }, { k: "day", l: "Day", v: day }, { k: "month", l: "Month", v: month }, { k: "weekday", l: "Weekday", v: weekday }];
  return (<div style={{ marginBottom: 16 }}>
    <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: ACCENT.cyan, marginBottom: 2 }}>Schedule</label>
    <div style={{ fontSize: 11, color: s.textMuted, marginBottom: 8 }}>Cron schedule for automated execution (minute hour day month weekday)</div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
      {f.map(x => (<div key={x.k}><div style={{ fontSize: 11, fontWeight: 600, color: s.textMuted, marginBottom: 4, textAlign: "center" }}>{x.l}</div>
        <input value={x.v} onChange={e => onChange(x.k, e.target.value)} style={{ width: "100%", padding: "10px 8px", background: s.bgInput, border: `1px solid ${s.border}`, borderRadius: 12, color: s.text, fontSize: 14, fontFamily: "'JetBrains Mono', monospace", outline: "none", textAlign: "center", boxSizing: "border-box" }} /></div>))}
    </div>
    <div style={{ marginTop: 8, padding: "8px 12px", background: s.bgInput, borderRadius: 10, fontSize: 12, color: s.textMuted, fontFamily: "'JetBrains Mono', monospace", textAlign: "center" }}>{minute} {hour} {day} {month} {weekday}</div>
  </div>);
}

// ═════════════════════════════════════════
// PAGES
// ═════════════════════════════════════════
function DashboardPage({ s, accent, kanban, crons, agents, services, a0Status, setPage }) {
  const c = { backlog: kanban.backlog.length, todo: kanban.todo.length, inProgress: kanban.inProgress.length, inReview: kanban.inReview.length, done: kanban.done.length };
  const total = Object.values(c).reduce((a, b) => a + b, 0);
  const stats = [{ l: "Total Tasks", v: total, c: ACCENT.cyan, i: I.kanban }, { l: "Cron Jobs", v: crons.filter(x => x.state !== "disabled").length, c: ACCENT.amber, i: I.scheduler }, { l: "Active Agents", v: agents.filter(a => a.status === "active").length, c: ACCENT.green, i: I.agents }, { l: "In Progress", v: c.inProgress, c: ACCENT.purple, i: I.bolt }];
  const ks = [{ l: "Backlog", n: c.backlog, c: STATUS_COLORS.backlog }, { l: "To-Do", n: c.todo, c: STATUS_COLORS.todo }, { l: "In Progress", n: c.inProgress, c: STATUS_COLORS.inProgress }, { l: "In Review", n: c.inReview, c: STATUS_COLORS.inReview }, { l: "Done", n: c.done, c: STATUS_COLORS.done }];
  const ql = [{ l: "Agents", i: I.agents, p: "agents", c: ACCENT.cyan }, { l: "Scheduler", i: I.scheduler, p: "scheduler", c: ACCENT.amber }, { l: "Deliverables", i: I.deliverables, p: "deliverables", c: ACCENT.green }, { l: "Kanban Board", i: I.kanban, p: "kanban", c: ACCENT.purple }];
  const svcList = services ? Object.entries(services).map(([name, info]) => ({ name, status: info.status || 'unknown', url: info.url || '' })) : [];
  return (<div>
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32 }}><h1 style={{ fontSize: 28, fontWeight: 800, color: s.text, margin: 0, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: -0.5 }}>Command Center</h1><Badge text="Live" color={ACCENT.green} />{a0Status?.gitinfo && <Badge text={`A0 ${a0Status.gitinfo.short_tag}`} color={ACCENT.cyan} />}</div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 28 }}>
      {stats.map((x, i) => (<Card key={i} color={x.c} style={{ background: s.bgCard, border: `1px solid ${s.border}`, boxShadow: s.shadow }}><div style={{ padding: "22px 22px 22px 24px" }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><div><div style={{ fontSize: 13, color: s.textMuted, fontWeight: 600, marginBottom: 6 }}>{x.l}</div><div style={{ fontSize: 36, fontWeight: 800, color: s.text, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: -1 }}>{x.v}</div></div><div style={{ color: x.c, opacity: 0.6 }}>{x.i}</div></div></div></Card>))}
    </div>
    {svcList.length > 0 && <Card color={ACCENT.green} style={{ background: s.bgCard, border: `1px solid ${s.border}`, boxShadow: s.shadow, marginBottom: 28 }}><div style={{ padding: "22px 22px 22px 24px" }}><div style={{ fontSize: 15, fontWeight: 700, color: s.text, marginBottom: 18 }}>Services</div><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>{svcList.map(sv => (<div key={sv.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: s.bgInput, borderRadius: 12 }}><div style={{ width: 8, height: 8, borderRadius: "50%", background: sv.status === "online" ? ACCENT.green : sv.status === "offline" ? ACCENT.red : ACCENT.amber, boxShadow: sv.status === "online" ? `0 0 8px ${ACCENT.green}60` : "none" }} /><span style={{ fontSize: 13, fontWeight: 600, color: s.text, flex: 1 }}>{sv.name}</span><span style={{ fontSize: 11, color: sv.status === "online" ? ACCENT.green : ACCENT.red, fontWeight: 600 }}>{sv.status}</span></div>))}</div></div></Card>}
    <Card color={ACCENT.cyan} style={{ background: s.bgCard, border: `1px solid ${s.border}`, boxShadow: s.shadow, marginBottom: 28 }}><div style={{ padding: "22px 22px 22px 24px" }}><div style={{ fontSize: 15, fontWeight: 700, color: s.text, marginBottom: 18 }}>Kanban Overview</div><div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>{ks.map((x, i) => (<div key={i} style={{ flex: 1, minWidth: 100, background: x.c + "10", borderRadius: 16, padding: "14px 18px", border: `1px solid ${x.c}20`, textAlign: "center" }}><div style={{ fontSize: 28, fontWeight: 800, color: x.c, fontFamily: "'Space Grotesk', sans-serif" }}>{x.n}</div><div style={{ fontSize: 12, color: s.textMuted, fontWeight: 600, marginTop: 4 }}>{x.l}</div></div>))}</div></div></Card>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>{ql.map((x, i) => (<Card key={i} color={x.c} onClick={() => setPage(x.p)} style={{ background: s.bgCard, border: `1px solid ${s.border}`, boxShadow: s.shadow }}><div style={{ padding: "20px 20px 20px 22px", display: "flex", alignItems: "center", gap: 14 }}><div style={{ color: x.c }}>{x.i}</div><span style={{ fontSize: 15, fontWeight: 700, color: s.text }}>{x.l}</span><span style={{ marginLeft: "auto", color: s.textDim }}>{I.chevron}</span></div></Card>))}</div>
  </div>);
}

function KanbanPage({ s, accent, settings, kanban, setKanban, agents }) {
  const [modal, setModal] = useState(false); const [dragOver, setDragOver] = useState(null); const [dragItem, setDragItem] = useState(null);
  const [form, setForm] = useState({ title: "", desc: "", agent: agents[0]?.name || "", priority: "medium", column: "todo" }); const [editTask, setEditTask] = useState(null);
  const baseCols = [
    { key: "backlog", defLabel: "Backlog", color: STATUS_COLORS.backlog },
    { key: "todo", defLabel: "To-Do", color: STATUS_COLORS.todo },
    { key: "inProgress", defLabel: "In Progress", color: STATUS_COLORS.inProgress },
    { key: "inReview", defLabel: "In Review", color: STATUS_COLORS.inReview },
    { key: "done", defLabel: "Done", color: STATUS_COLORS.done },
  ];
  const sc = settings?.kanbanColumns;
  let cols = baseCols.map(c => ({ key: c.key, label: c.defLabel, color: c.color }));
  if (Array.isArray(sc)) {
    cols = baseCols.map((c, i) => ({ key: c.key, label: sc[i] || c.defLabel, color: c.color }));
  } else if (sc && typeof sc === "object") {
    cols = baseCols.filter(c => sc[c.key]?.enabled !== false).map(c => ({ key: c.key, label: sc[c.key]?.label || c.defLabel, color: c.color }));
  }
    const handleDrop = (toCol) => { if (!dragItem || dragItem.fromCol === toCol) { setDragItem(null); setDragOver(null); return; } const nk = { ...kanban }; nk[dragItem.fromCol] = nk[dragItem.fromCol].filter(t => t.id !== dragItem.task.id); nk[toCol] = [...nk[toCol], dragItem.task]; setKanban(nk); setDragItem(null); setDragOver(null); const tasks = Object.entries(nk).flatMap(([status, arr]) => (arr || []).map(t => ({ ...t, status }))); api("/kanban/sync", { method: "POST", body: { tasks } }); };
    const handleCreate = () => { const nt = { id: "t" + Date.now(), ...form, created: new Date().toISOString().slice(0, 10) }; const nk = { ...kanban }; nk[form.column] = [...nk[form.column], nt]; setKanban(nk); setModal(false); setForm({ title: "", desc: "", agent: agents[0]?.name || "", priority: "medium", column: "todo" }); api("/kanban", { method: "POST", body: { id: nt.id, title: nt.title, description: nt.desc || "", status: form.column, priority: nt.priority, agent: nt.agent || "", tags: [], due_date: "" } }); };
    const saveEdit = () => { if (!editTask) return; const nk = { ...kanban }; nk[editTask.column] = nk[editTask.column].map(t => t.id === editTask.id ? { ...t, title: editTask.title, desc: editTask.desc, agent: editTask.agent, priority: editTask.priority } : t); setKanban(nk); setEditTask(null); api(`/kanban/${editTask.id}`, { method: "PUT", body: { title: editTask.title, description: editTask.desc || "", status: editTask.column, priority: editTask.priority, agent: editTask.agent || "" } }); };
  return (<div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28, flexWrap: "wrap", gap: 12 }}><h1 style={{ fontSize: 28, fontWeight: 800, color: s.text, margin: 0, fontFamily: "'Space Grotesk', sans-serif" }}>Kanban Board</h1><Btn s={s} accent={accent} onClick={() => setModal(true)}>{I.plus} Create Task</Btn></div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16, alignItems: "start" }}>
      {cols.map(col => (<div key={col.key} onDragOver={e => { e.preventDefault(); setDragOver(col.key); }} onDragLeave={() => setDragOver(null)} onDrop={() => handleDrop(col.key)} style={{ background: dragOver === col.key ? col.color + "10" : s.bgCard, borderRadius: 20, padding: 16, border: `1px solid ${dragOver === col.key ? col.color + "40" : s.border}`, boxShadow: s.shadow, transition: "all 0.3s", minHeight: 300 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, padding: "0 4px" }}><div style={{ width: 10, height: 10, borderRadius: "50%", background: col.color }} /><span style={{ fontSize: 14, fontWeight: 700, color: s.text }}>{col.label}</span><span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 700, color: s.textMuted, background: s.bgInput, borderRadius: 8, padding: "2px 10px" }}>{kanban[col.key].length}</span></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{kanban[col.key].map(task => (<div key={task.id} draggable onDragStart={() => setDragItem({ task, fromCol: col.key })} style={{ position: "relative", background: `linear-gradient(90deg, ${col.color}24 0%, ${col.color}00 70%), ${s.bgInput}`, borderRadius: 16, overflow: "hidden", border: `1px solid ${s.border}`, cursor: "grab" }}>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: PRIORITY_COLORS[task.priority] }} />
          <div style={{ padding: "14px 14px 14px 18px", position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}><span style={{ color: s.textDim }}>{I.grip}</span><span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: s.text }}>{task.title}</span></div>
            <div style={{ fontSize: 12, color: s.textMuted, marginBottom: 10, lineHeight: 1.4, paddingLeft: 20 }}>{task.desc}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 20, flexWrap: "wrap" }}><Badge text={task.priority} color={PRIORITY_COLORS[task.priority]} /><span style={{ fontSize: 11, color: s.textMuted }}>{task.agent}</span><div style={{ marginLeft: "auto", display: "flex", gap: 4 }}><button onClick={() => setEditTask({ ...task, column: col.key })} style={{ background: "none", border: "none", color: s.textMuted, cursor: "pointer", padding: 4 }}>{I.edit}</button><button onClick={() => { const nk = { ...kanban }; nk[col.key] = nk[col.key].filter(t => t.id !== task.id); setKanban(nk); api(`/kanban/${task.id}`, { method: 'DELETE' }); }} style={{ background: "none", border: "none", color: ACCENT.red, cursor: "pointer", padding: 4, opacity: 0.6 }}>{I.trash}</button></div></div>
          </div></div>))}</div>
      </div>))}
    </div>
    <Modal open={modal} onClose={() => setModal(false)} title="Create Task" s={s}>
      <Inp label="Title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} s={s} placeholder="Task title..." />
      <Inp label="Description" value={form.desc} onChange={e => setForm({ ...form, desc: e.target.value })} s={s} multiline placeholder="What needs to be done..." />
      <Sel label="Assign Agent" value={form.agent} onChange={e => setForm({ ...form, agent: e.target.value })} s={s} options={agents.map(a => ({ value: a.name, label: `${a.name} — ${a.role}` }))} />
      <Sel label="Priority" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} s={s} options={[{ value: "critical", label: "🔴 Critical" }, { value: "high", label: "🟠 High" }, { value: "medium", label: "🟡 Medium" }, { value: "low", label: "🟢 Low" }]} />
      <Sel label="Column" value={form.column} onChange={e => setForm({ ...form, column: e.target.value })} s={s} options={cols.map(c => ({ value: c.key, label: c.label }))} />
      <div style={{ display: "flex", gap: 12, marginTop: 8 }}><Btn s={s} accent={accent} onClick={handleCreate} style={{ flex: 1 }}>Create Task</Btn><Btn s={s} accent={accent} variant="ghost" onClick={() => setModal(false)}>Cancel</Btn></div>
    </Modal>
    <Modal open={!!editTask} onClose={() => setEditTask(null)} title="Edit Task" s={s}>{editTask && (<>
      <Inp label="Title" value={editTask.title} onChange={e => setEditTask({ ...editTask, title: e.target.value })} s={s} />
      <Inp label="Description" value={editTask.desc} onChange={e => setEditTask({ ...editTask, desc: e.target.value })} s={s} multiline />
      <Sel label="Assign Agent" value={editTask.agent} onChange={e => setEditTask({ ...editTask, agent: e.target.value })} s={s} options={agents.map(a => ({ value: a.name, label: `${a.name} — ${a.role}` }))} />
      <Sel label="Priority" value={editTask.priority} onChange={e => setEditTask({ ...editTask, priority: e.target.value })} s={s} options={[{ value: "critical", label: "🔴 Critical" }, { value: "high", label: "🟠 High" }, { value: "medium", label: "🟡 Medium" }, { value: "low", label: "🟢 Low" }]} />
      <div style={{ display: "flex", gap: 12, marginTop: 8 }}><Btn s={s} accent={accent} onClick={saveEdit} style={{ flex: 1 }}>Save Changes</Btn><Btn s={s} accent={accent} variant="ghost" onClick={() => setEditTask(null)}>Cancel</Btn></div>
    </>)}</Modal>
  </div>);
}

function AgentsPage({ s, accent, agents, setAgents, a0Agents }) {
  const [a0Profiles, setA0Profiles] = useState([]); const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState(null); const [editFile, setEditFile] = useState(null); const [fileContent, setFileContent] = useState('');
  const [saving, setSaving] = useState(false); const [createModal, setCreateModal] = useState(false);
  const [newAgent, setNewAgent] = useState({ key: '', label: '', role_prompt: '', context: '' });
  const [newFileModal, setNewFileModal] = useState(null); const [newFileName, setNewFileName] = useState(''); const [newFileIsFolder, setNewFileIsFolder] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Load A0 agent profiles from shared volume
  const loadProfiles = async () => {
    setLoading(true);
    const data = await api('/a0/agents');
    if (data) setA0Profiles(data);
    setLoading(false);
  };
  useEffect(() => { loadProfiles(); }, []);

  // Open a file for editing
  const openFile = async (agentKey, filePath) => {
    const data = await api(`/a0/agents/${agentKey}/file/${filePath}`);
    if (data) { setEditFile({ agent: agentKey, path: filePath, name: filePath.split('/').pop() }); setFileContent(data.content); }
  };

  // Save file
  const saveFile = async () => {
    if (!editFile) return;
    setSaving(true);
    await api(`/a0/agents/${editFile.agent}/file/${editFile.path}`, { method: 'PUT', body: { content: fileContent } });
    setSaving(false);
    // Refresh the selected agent tree
    const updated = await api(`/a0/agents/${editFile.agent}`);
    if (updated) {
      setA0Profiles(a0Profiles.map(p => p.key === editFile.agent ? { ...p, ...updated } : p));
      setSel(prev => prev?.key === editFile.agent ? { ...prev, ...updated } : prev);
    }
  };

  // Create new agent
  const createAgent = async () => {
    if (!newAgent.key.trim()) return;
    const resp = await api('/a0/agents', { method: 'POST', body: newAgent });
    if (resp?.ok) { setCreateModal(false); setNewAgent({ key: '', label: '', role_prompt: '', context: '' }); loadProfiles(); }
  };

  // Delete agent
  const deleteAgent = async (key) => {
    const resp = await api(`/a0/agents-profile/${key}`, { method: 'DELETE' });
    if (resp?.ok) { setConfirmDelete(null); setSel(null); loadProfiles(); }
  };

  // Create new file/folder inside agent
  const createFile = async (agentKey) => {
    if (!newFileName.trim()) return;
    await api(`/a0/agents/${agentKey}/file`, { method: 'POST', body: { path: newFileName, isFolder: newFileIsFolder, content: '' } });
    setNewFileModal(null); setNewFileName(''); setNewFileIsFolder(false);
    const updated = await api(`/a0/agents/${agentKey}`);
    if (updated) {
      setA0Profiles(a0Profiles.map(p => p.key === agentKey ? { ...p, ...updated } : p));
      setSel(prev => prev?.key === agentKey ? { ...prev, ...updated } : prev);
    }
  };

  // Delete a file inside agent
  const deleteFile = async (agentKey, filePath) => {
    await api(`/a0/agents/${agentKey}/file/${filePath}`, { method: 'DELETE' });
    const updated = await api(`/a0/agents/${agentKey}`);
    if (updated) {
      setA0Profiles(a0Profiles.map(p => p.key === agentKey ? { ...p, ...updated } : p));
      setSel(prev => prev?.key === agentKey ? { ...prev, ...updated } : prev);
    }
    if (editFile?.agent === agentKey && editFile?.path === filePath) setEditFile(null);
  };

  // Recursive file tree renderer
  const FileTree = ({ items, agentKey, depth = 0 }) => (
    <div style={{ paddingLeft: depth * 16 }}>
      {items.map(item => (
        <div key={item.path}>
          {item.type === 'folder' ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, color: ACCENT.amber, fontSize: 13, fontWeight: 600 }}>
                <span style={{ fontSize: 14 }}>📁</span> {item.name}
              </div>
              {item.children && <FileTree items={item.children} agentKey={agentKey} depth={depth + 1} />}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: s.text, transition: 'background 0.15s',
              background: editFile?.agent === agentKey && editFile?.path === item.path ? ACCENT.cyan + '15' : 'transparent',
            }}
              onClick={() => openFile(agentKey, item.path)}
              onMouseEnter={e => { if (!(editFile?.agent === agentKey && editFile?.path === item.path)) e.currentTarget.style.background = s.bgInput; }}
              onMouseLeave={e => { if (!(editFile?.agent === agentKey && editFile?.path === item.path)) e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{ fontSize: 14 }}>{item.name.endsWith('.json') ? '⚙️' : '📄'}</span>
              <span style={{ flex: 1 }}>{item.name}</span>
              <span style={{ fontSize: 11, color: s.textDim, fontFamily: "'JetBrains Mono'" }}>{item.size < 1024 ? item.size + ' B' : (item.size / 1024).toFixed(1) + ' KB'}</span>
              <button onClick={e => { e.stopPropagation(); deleteFile(agentKey, item.path); }} style={{ background: 'none', border: 'none', color: ACCENT.red, cursor: 'pointer', padding: 2, opacity: 0.4, fontSize: 12 }} title="Delete file">{I.trash}</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );

  const isBuiltIn = (key) => ['_example', 'agent0'].includes(key);

  return (<div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
      <div><h1 style={{ fontSize: 28, fontWeight: 800, color: s.text, margin: 0, fontFamily: "'Space Grotesk', sans-serif" }}>Agent Zero Profiles</h1><div style={{ fontSize: 13, color: s.textMuted, marginTop: 4 }}>File-based agent profiles synced with Agent Zero at <code style={{ color: ACCENT.cyan, fontFamily: "'JetBrains Mono'", fontSize: 12 }}>/a0/agents</code></div></div>
      <div style={{ display: 'flex', gap: 10 }}><Btn s={s} variant="ghost" onClick={loadProfiles}>{I.refresh} Refresh</Btn><Btn s={s} onClick={() => setCreateModal(true)}>{I.plus} New Profile</Btn></div>
    </div>

    {loading ? <div style={{ textAlign: 'center', padding: 60, color: s.textMuted }}>Loading agent profiles...</div> : (
    <div style={{ display: 'grid', gridTemplateColumns: sel ? '340px 1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, transition: 'all 0.3s' }}>

      {/* Left: Agent profile cards */}
      <div style={{ display: 'flex', flexDirection: sel ? 'column' : 'row', flexWrap: sel ? 'nowrap' : 'wrap', gap: 12, ...(sel ? { maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' } : {}) }}>
        {a0Profiles.map(p => (
          <Card key={p.key} color={sel?.key === p.key ? ACCENT.cyan : (isBuiltIn(p.key) ? ACCENT.purple : ACCENT.green)}
            style={{ background: sel?.key === p.key ? ACCENT.cyan + '08' : s.bgCard, border: `1px solid ${sel?.key === p.key ? ACCENT.cyan + '40' : s.border}`, boxShadow: s.shadow, ...(sel ? {} : { minWidth: 280 }) }}
            onClick={() => { setSel(p); setEditFile(null); }}
          >
            <div style={{ padding: '18px 20px 18px 22px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: `linear-gradient(135deg, ${isBuiltIn(p.key) ? ACCENT.purple : ACCENT.cyan}30, ${ACCENT.amber}20)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color: isBuiltIn(p.key) ? ACCENT.purple : ACCENT.cyan, fontFamily: "'Space Grotesk'" }}>{(p.label || p.key)[0].toUpperCase()}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: s.text }}>{p.label || p.key}</div>
                  <div style={{ fontSize: 12, color: s.textMuted, fontFamily: "'JetBrains Mono'" }}>{p.key}/</div>
                </div>
                {isBuiltIn(p.key) && <Badge text="built-in" color={ACCENT.purple} />}
              </div>
              {!sel && <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                {(p.tree || []).filter(f => f.type === 'file').map(f => <span key={f.name} style={{ fontSize: 11, color: s.textDim, background: s.bgInput, padding: '2px 8px', borderRadius: 6 }}>{f.name}</span>)}
                {(p.tree || []).filter(f => f.type === 'folder').map(f => <span key={f.name} style={{ fontSize: 11, color: ACCENT.amber, background: ACCENT.amber + '10', padding: '2px 8px', borderRadius: 6 }}>📁 {f.name}/</span>)}
              </div>}
            </div>
          </Card>
        ))}
      </div>

      {/* Right: Detail panel when selected */}
      {sel && (
        <div style={{ background: s.bgCard, borderRadius: 20, border: `1px solid ${s.border}`, overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 200px)' }}>
          {/* Header */}
          <div style={{ padding: '18px 24px', borderBottom: `1px solid ${s.border}`, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: s.text, fontFamily: "'Space Grotesk'" }}>{sel.label || sel.key}</div>
              <div style={{ fontSize: 12, color: s.textMuted, fontFamily: "'JetBrains Mono'" }}>/a0/agents/{sel.key}/</div>
            </div>
            <Btn s={s} variant="ghost" onClick={() => setNewFileModal(sel.key)} style={{ fontSize: 12, padding: '6px 12px' }}>{I.plus} File</Btn>
            {!isBuiltIn(sel.key) && <Btn s={s} variant="danger" onClick={() => setConfirmDelete(sel.key)} style={{ fontSize: 12, padding: '6px 12px' }}>{I.trash}</Btn>}
            <button onClick={() => { setSel(null); setEditFile(null); }} style={{ background: 'none', border: 'none', color: s.textMuted, cursor: 'pointer', fontSize: 18, padding: '4px 8px' }}>✕</button>
          </div>

          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            {/* File tree */}
            <div style={{ width: 260, borderRight: `1px solid ${s.border}`, overflowY: 'auto', padding: '12px 8px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: s.textMuted, textTransform: 'uppercase', letterSpacing: 1, padding: '4px 10px', marginBottom: 4 }}>Files</div>
              <FileTree items={sel.tree || []} agentKey={sel.key} />
            </div>

            {/* File editor */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {editFile ? (<>
                <div style={{ padding: '10px 16px', borderBottom: `1px solid ${s.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 14 }}>{editFile.name.endsWith('.json') ? '⚙️' : '📄'}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: s.text, flex: 1 }}>{editFile.path}</span>
                  <Btn s={s} onClick={saveFile} style={{ fontSize: 12, padding: '5px 14px' }}>{saving ? '...' : 'Save'}</Btn>
                </div>
                <textarea value={fileContent} onChange={e => setFileContent(e.target.value)} style={{
                  flex: 1, padding: 16, background: s.bg, border: 'none', color: s.text, fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
                  lineHeight: 1.7, resize: 'none', outline: 'none', width: '100%', boxSizing: 'border-box',
                }} />
              </>) : (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.textDim, fontSize: 14 }}>
                  <div style={{ textAlign: 'center' }}><div style={{ fontSize: 32, marginBottom: 8, opacity: 0.4 }}>📂</div>Select a file to edit</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>)}

    {/* Create Agent Modal */}
    <Modal open={createModal} onClose={() => setCreateModal(false)} title="Create Agent Profile" s={s}>
      <div style={{ fontSize: 13, color: s.textMuted, marginBottom: 16, lineHeight: 1.5 }}>Creates a new folder in <code style={{ color: ACCENT.cyan }}>/a0/agents/</code> with the standard Agent Zero structure: agent.json, _context.md, and prompt files.</div>
      <Inp label="Folder Name (key)" hint="Lowercase, no spaces. This becomes the folder name." value={newAgent.key} onChange={e => setNewAgent({ ...newAgent, key: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })} s={s} placeholder="e.g. klaus" mono />
      <Inp label="Display Name" hint="Name shown in Agent Zero UI" value={newAgent.label} onChange={e => setNewAgent({ ...newAgent, label: e.target.value })} s={s} placeholder="e.g. Klaus — COO" />
      <Inp label="Context (_context.md)" value={newAgent.context} onChange={e => setNewAgent({ ...newAgent, context: e.target.value })} s={s} multiline placeholder="Agent context information..." />
      <Inp label="Role Prompt (agent.system.main.role.md)" value={newAgent.role_prompt} onChange={e => setNewAgent({ ...newAgent, role_prompt: e.target.value })} s={s} multiline placeholder="You are Klaus, the Chief Operations Officer for BKE Logistics..." />
      <div style={{ display: 'flex', gap: 12, marginTop: 8 }}><Btn s={s} onClick={createAgent} style={{ flex: 1 }}>Create Profile</Btn><Btn s={s} variant="ghost" onClick={() => setCreateModal(false)}>Cancel</Btn></div>
    </Modal>

    {/* New File Modal */}
    <Modal open={!!newFileModal} onClose={() => setNewFileModal(null)} title="New File / Folder" s={s}>
      <Inp label="Name" hint="Path relative to agent folder (e.g. prompts/custom.md)" value={newFileName} onChange={e => setNewFileName(e.target.value)} s={s} placeholder="filename.md" mono />
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', color: s.text, fontSize: 14, cursor: 'pointer' }}>
        <input type="checkbox" checked={newFileIsFolder} onChange={e => setNewFileIsFolder(e.target.checked)} /> Create as folder
      </label>
      <div style={{ display: 'flex', gap: 12, marginTop: 8 }}><Btn s={s} onClick={() => createFile(newFileModal)} style={{ flex: 1 }}>Create</Btn><Btn s={s} variant="ghost" onClick={() => setNewFileModal(null)}>Cancel</Btn></div>
    </Modal>

    {/* Confirm Delete Modal */}
    <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Delete Agent Profile" s={s}>
      <div style={{ padding: 16, background: ACCENT.red + '10', border: `1px solid ${ACCENT.red}25`, borderRadius: 14, marginBottom: 16 }}>
        <div style={{ color: ACCENT.red, fontSize: 14, fontWeight: 700, marginBottom: 6 }}>⚠️ This will permanently delete:</div>
        <code style={{ color: s.text, fontSize: 13, fontFamily: "'JetBrains Mono'" }}>/a0/agents/{confirmDelete}/</code>
        <div style={{ color: s.textMuted, fontSize: 13, marginTop: 8 }}>This removes the agent from Agent Zero. This action cannot be undone.</div>
      </div>
      <div style={{ display: 'flex', gap: 12 }}><Btn s={s} variant="danger" onClick={() => deleteAgent(confirmDelete)}>Delete Permanently</Btn><Btn s={s} variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Btn></div>
    </Modal>
  </div>);
}

// ─── SCHEDULER (Agent Zero Style) ───
function SchedulerPage({ s, accent, crons, setCrons, agents }) {
  const [modal, setModal] = useState(false); const [editCron, setEditCron] = useState(null); const [viewCron, setViewCron] = useState(null);
  const empty = { name: "", type: "scheduled", project: "No project", state: "idle", minute: "*", hour: "*", day: "*", month: "*", weekday: "*", agent: agents[0]?.name || "", desc: "" };
  const [form, setForm] = useState(empty);
  const projOpts = [{ value: "No project", label: "No project" }, { value: "Lead Generation", label: "Lead Generation" }, { value: "Marketing", label: "Marketing" }, { value: "Operations", label: "Operations" }, { value: "Engineering", label: "Engineering" }];
  const typeOpts = [{ value: "scheduled", label: "Scheduled (Cron)" }, { value: "manual", label: "Manual Trigger" }, { value: "webhook", label: "Webhook" }, { value: "event", label: "Event-Driven" }];

  const Fields = ({ data, setData }) => (<>
    <Inp label="Task Name" hint="A unique name to identify this task" value={data.name} onChange={e => setData({ ...data, name: e.target.value })} s={s} placeholder="Enter task name" />
    <Sel label="Type" hint="Task execution method" value={data.type} onChange={e => setData({ ...data, type: e.target.value })} s={s} options={typeOpts} />
    <Sel label="Project" hint="Inherited from the active chat project." value={data.project} onChange={e => setData({ ...data, project: e.target.value })} s={s} options={projOpts} />
    <Sel label="Assign Agent" hint="Agent responsible for executing this task" value={data.agent} onChange={e => setData({ ...data, agent: e.target.value })} s={s} options={agents.map(a => ({ value: a.name, label: `${a.name} — ${a.role}` }))} />
    <StateToggle value={data.state} onChange={v => setData({ ...data, state: v })} s={s} />
    <CronFields minute={data.minute} hour={data.hour} day={data.day} month={data.month} weekday={data.weekday} onChange={(k, v) => setData({ ...data, [k]: v })} s={s} />
    <Inp label="Description" hint="What does this task do?" value={data.desc} onChange={e => setData({ ...data, desc: e.target.value })} s={s} multiline placeholder="Task description..." />
  </>);

  return (<div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}><h1 style={{ fontSize: 28, fontWeight: 800, color: s.text, margin: 0, fontFamily: "'Space Grotesk', sans-serif" }}>Task Scheduler</h1><Btn s={s} accent={accent} onClick={() => setModal(true)}>{I.plus} Create Task</Btn></div>
    <div style={{ fontSize: 13, color: s.textMuted, marginBottom: 24 }}>Manage scheduled tasks and automated processes for Agent Zero.</div>
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {crons.map(cr => (<Card key={cr.id} color={STATE_COLORS[cr.state]} style={{ background: s.bgCard, border: `1px solid ${s.border}`, boxShadow: s.shadow }} onClick={() => setViewCron(cr)}>
        <div style={{ padding: "18px 20px 18px 22px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <StatusDot status={cr.state === "idle" ? "active" : cr.state} />
          <div style={{ flex: 1, minWidth: 180 }}><div style={{ fontSize: 15, fontWeight: 700, color: s.text }}>{cr.name}</div><div style={{ fontSize: 12, color: s.textMuted, marginTop: 2 }}>{cr.desc}</div></div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}><Badge text={cr.state} color={STATE_COLORS[cr.state]} /><Badge text={cr.type} color={ACCENT.cyan} /><Badge text={cr.agent} color={ACCENT.purple} />{cr.project !== "No project" && <Badge text={cr.project} color={ACCENT.amber} />}</div>
          <code style={{ fontSize: 12, color: ACCENT.cyan, fontFamily: "'JetBrains Mono', monospace", background: accent + "10", padding: "4px 10px", borderRadius: 8, whiteSpace: "nowrap" }}>{cr.minute} {cr.hour} {cr.day} {cr.month} {cr.weekday}</code>
          <div style={{ fontSize: 11, color: s.textMuted, minWidth: 120 }}><div>Last: {cr.lastRun}</div><div>Next: {cr.nextRun}</div></div>
          <div style={{ display: "flex", gap: 4 }} onClick={e => e.stopPropagation()}>
            <button onClick={async () => { const newState = cr.state === "disabled" ? "idle" : "disabled"; setCrons(crons.map(c => c.id === cr.id ? { ...c, state: newState } : c)); await api(`/crons/${cr.id}`, { method: 'PUT', body: { ...cr, state: newState } }); }} style={{ background: s.bgInput, border: "none", borderRadius: 10, padding: "6px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600, color: cr.state === "disabled" ? ACCENT.green : ACCENT.amber }}>{cr.state === "disabled" ? "Enable" : "Disable"}</button>
            <button onClick={() => setEditCron({ ...cr })} style={{ background: "none", border: "none", color: s.textMuted, cursor: "pointer", padding: 6 }}>{I.edit}</button>
            <button onClick={async () => { setCrons(crons.filter(c => c.id !== cr.id)); await api(`/crons/${cr.id}`, { method: 'DELETE' }); }} style={{ background: "none", border: "none", color: ACCENT.red, cursor: "pointer", padding: 6, opacity: 0.6 }}>{I.trash}</button>
          </div>
        </div>
      </Card>))}
    </div>
    <Modal open={modal} onClose={() => setModal(false)} title="Create New Task" s={s} wide>
      <div style={{ borderBottom: `1px solid ${s.border}`, marginBottom: 20 }} />
      <Fields data={form} setData={setForm} />
      <div style={{ display: "flex", gap: 12, marginTop: 8, justifyContent: "flex-end" }}><Btn s={s} accent={accent} variant="ghost" onClick={() => setModal(false)}>Cancel</Btn><Btn s={s} accent={accent} onClick={async () => { const nCron = { id: "c" + Date.now(), ...form, lastRun: "—", nextRun: "Pending" }; setCrons([...crons, nCron]); setModal(false); setForm(empty); await api('/crons', { method: 'POST', body: nCron }); }}>Save</Btn></div>
    </Modal>
    <Modal open={!!editCron} onClose={() => setEditCron(null)} title="Edit Task" s={s} wide>{editCron && (<><div style={{ borderBottom: `1px solid ${s.border}`, marginBottom: 20 }} /><Fields data={editCron} setData={setEditCron} /><div style={{ display: "flex", gap: 12, marginTop: 8, justifyContent: "flex-end" }}><Btn s={s} accent={accent} variant="ghost" onClick={() => setEditCron(null)}>Cancel</Btn><Btn s={s} accent={accent} onClick={async () => { setCrons(crons.map(c => c.id === editCron.id ? editCron : c)); setEditCron(null); await api(`/crons/${editCron.id}`, { method: 'PUT', body: editCron }); }}>Save</Btn></div></>)}</Modal>
    <Modal open={!!viewCron && !editCron} onClose={() => setViewCron(null)} title={viewCron?.name || ""} s={s}>{viewCron && (<>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}><Badge text={viewCron.state} color={STATE_COLORS[viewCron.state]} /><Badge text={viewCron.type} color={ACCENT.cyan} /><Badge text={viewCron.agent} color={ACCENT.purple} />{viewCron.project !== "No project" && <Badge text={viewCron.project} color={ACCENT.amber} />}</div>
      <div style={{ padding: 16, background: s.bgInput, borderRadius: 14, marginBottom: 12 }}><div style={{ fontSize: 14, color: s.text, lineHeight: 1.6 }}>{viewCron.desc}</div></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}><div style={{ padding: 12, background: s.bgInput, borderRadius: 12 }}><div style={{ fontSize: 11, color: s.textMuted, marginBottom: 4 }}>Schedule</div><code style={{ fontSize: 14, color: ACCENT.cyan, fontFamily: "'JetBrains Mono'" }}>{viewCron.minute} {viewCron.hour} {viewCron.day} {viewCron.month} {viewCron.weekday}</code></div><div style={{ padding: 12, background: s.bgInput, borderRadius: 12 }}><div style={{ fontSize: 11, color: s.textMuted, marginBottom: 4 }}>Last Run</div><div style={{ fontSize: 14, color: s.text }}>{viewCron.lastRun}</div></div></div>
      <div style={{ display: "flex", gap: 12 }}><Btn s={s} accent={accent} onClick={() => { setEditCron({ ...viewCron }); setViewCron(null); }}>{I.edit} Edit</Btn><Btn s={s} accent={accent} variant="success" onClick={async () => { const r = await a0('message', { text: viewCron.desc || viewCron.name }); if (r?.ok) { const updated = { ...viewCron, lastRun: new Date().toLocaleString(), state: 'running' }; setCrons(crons.map(c => c.id === viewCron.id ? updated : c)); setViewCron(updated); } }}>{I.play} Run Now</Btn><Btn s={s} accent={accent} variant="danger" onClick={async () => { setCrons(crons.filter(c => c.id !== viewCron.id)); setViewCron(null); await api(`/crons/${viewCron.id}`, { method: 'DELETE' }); }}>{I.trash} Delete</Btn></div>
    </>)}</Modal>
  </div>);
}

function DeliverablesPage({ s, accent }) {
  const [items, setItems] = useState([]); const [sel, setSel] = useState(null); const [filter, setFilter] = useState("all");
  const ti = { pdf: "📄", image: "🖼️", doc: "📝", video: "🎬" };
    useEffect(() => { (async () => { const d = await api("/deliverables"); const db = Array.isArray(d?.database) ? d.database : []; const fs = Array.isArray(d?.filesystem) ? d.filesystem : []; setItems([...db, ...fs]); })(); }, []);

  const filtered = filter === "all" ? items : items.filter(i => i.type === filter);
  return (<div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28, flexWrap: "wrap", gap: 12 }}><h1 style={{ fontSize: 28, fontWeight: 800, color: s.text, margin: 0, fontFamily: "'Space Grotesk', sans-serif" }}>Deliverables</h1>
      <div style={{ display: "flex", gap: 6 }}>{["all", "pdf", "image", "doc", "video"].map(f => (<button key={f} onClick={() => setFilter(f)} style={{ padding: "8px 16px", borderRadius: 12, border: `1px solid ${filter === f ? ACCENT.cyan + "40" : s.border}`, background: filter === f ? ACCENT.cyan + "15" : s.bgCard, color: filter === f ? ACCENT.cyan : s.textMuted, fontSize: 12, fontWeight: 600, cursor: "pointer", textTransform: "capitalize", transition: "all 0.2s" }}>{f === "all" ? "All" : (ti[f] || "") + " " + f}</button>))}</div></div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
      {filtered.map(item => (<Card key={item.id} color={item.color} style={{ background: s.bgCard, border: `1px solid ${s.border}`, boxShadow: s.shadow }} onClick={() => setSel(item)}><div style={{ padding: "20px 20px 20px 22px" }}><div style={{ fontSize: 36, marginBottom: 12 }}>{ti[item.type]}</div><div style={{ fontSize: 15, fontWeight: 700, color: s.text, marginBottom: 6 }}>{item.name}</div><div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}><Badge text={item.type} color={item.color} /><span style={{ fontSize: 11, color: s.textMuted }}>{item.size}</span></div><div style={{ fontSize: 12, color: s.textMuted }}>By {item.agent} · {item.created}</div></div></Card>))}
    </div>
    <Modal open={!!sel} onClose={() => setSel(null)} title={sel?.name || ""} s={s}>{sel && (<>
      <div style={{ textAlign: "center", fontSize: 64, marginBottom: 16 }}>{ti[sel.type]}</div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 16, flexWrap: "wrap" }}><Badge text={sel.type} color={sel.color} /><Badge text={sel.size} color={s.textMuted} /><Badge text={sel.agent} color={ACCENT.purple} /></div>
      <div style={{ textAlign: "center", fontSize: 13, color: s.textMuted, marginBottom: 20 }}>Created: {sel.created}</div>
      <div style={{ background: s.bgInput, borderRadius: 16, padding: 40, textAlign: "center", marginBottom: 20, border: `1px dashed ${s.border}` }}><div style={{ fontSize: 14, color: s.textMuted }}>Preview area — connects to file system in production</div></div>
      <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}><Btn s={s}>{I.eye} View</Btn><Btn s={s} accent={accent} variant="ghost">{I.download} Download</Btn><Btn s={s} accent={accent} variant="ghost">{I.edit} Rename</Btn><Btn s={s} accent={accent} variant="danger" onClick={() => { setItems(items.filter(i => i.id !== sel.id)); setSel(null); }}>{I.trash} Delete</Btn></div>
    </>)}</Modal>
  </div>);
}

function LogsPage({ s, accent }) {
    const [logs, setLogs] = useState([]);
    useEffect(() => { (async () => { const d = await api("/activity"); if (d) setLogs(d); })(); }, []);
  const tc = { success: ACCENT.green, warning: ACCENT.amber, info: ACCENT.cyan, error: ACCENT.red };
  const tl = { success: "✓", warning: "⚠", info: "ℹ", error: "✕" };
  return (<div><h1 style={{ fontSize: 28, fontWeight: 800, color: s.text, margin: 0, fontFamily: "'Space Grotesk', sans-serif", marginBottom: 28 }}>Activity Logs</h1>
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{logs.map(log => (<Card key={log.id} color={tc[log.type]} style={{ background: s.bgCard, border: `1px solid ${s.border}`, boxShadow: s.shadow }} hoverable={false}><div style={{ padding: "16px 18px 16px 20px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}><div style={{ width: 30, height: 30, borderRadius: 10, background: tc[log.type] + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: tc[log.type], flexShrink: 0 }}>{tl[log.type]}</div><div style={{ flex: 1, minWidth: 200 }}><div style={{ fontSize: 14, color: s.text, lineHeight: 1.5 }}>{log.action}</div></div><Badge text={log.agent} color={ACCENT.purple} /><span style={{ fontSize: 12, color: s.textMuted, fontFamily: "'JetBrains Mono', monospace", minWidth: 140, textAlign: "right" }}>{log.time}</span></div></Card>))}</div>
  </div>);
}

function OrgChartPage({ s }) {
  const Node = ({ name, role, color = ACCENT.cyan, large }) => (<div style={{ background: s.bgCard, border: `1px solid ${s.border}`, borderRadius: 18, padding: large ? "18px 28px" : "12px 20px", textAlign: "center", boxShadow: s.shadow, position: "relative", minWidth: large ? 160 : 120 }}><div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, borderRadius: "18px 0 0 18px", background: color }} /><div style={{ fontSize: large ? 16 : 13, fontWeight: 800, color: s.text }}>{name}</div><div style={{ fontSize: large ? 12 : 11, color, fontWeight: 600, marginTop: 2 }}>{role}</div></div>);
  const Line = ({ h = 24 }) => <div style={{ width: 2, height: h, background: s.border, margin: "0 auto" }} />;
  return (<div><h1 style={{ fontSize: 28, fontWeight: 800, color: s.text, margin: 0, fontFamily: "'Space Grotesk', sans-serif", marginBottom: 28 }}>Organization Chart</h1>
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", overflow: "auto", padding: 20 }}>
      <Node name="Harvey" role="CEO" color={ACCENT.cyan} large /><Line h={32} />
      <Node name="Klaus" role="COO · Agent Zero" color={ACCENT.green} large /><Line h={32} />
      <div style={{ width: "100%", display: "flex", justifyContent: "center" }}><div style={{ height: 2, background: s.border, width: "75%", position: "relative" }}>{[0,25,50,75,100].map(p => <div key={p} style={{ position: "absolute", left: `${p}%`, top: 0, width: 2, height: 24, background: s.border }} />)}</div></div><div style={{ height: 24 }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16, width: "100%", maxWidth: 900 }}>
        {[{ d: "Engineering", c: ACCENT.cyan, a: [{ n: "Cipher", r: "Eng Lead" }] }, { d: "Sales", c: ACCENT.amber, a: [{ n: "Axel", r: "Sales" }, { n: "Vex", r: "Email" }] }, { d: "Operations", c: ACCENT.green, a: [{ n: "Rook", r: "Ops" }, { n: "Slate", r: "Contracts" }, { n: "Echo", r: "Research" }] }, { d: "Social Media", c: ACCENT.purple, a: [{ n: "Nova", r: "Social" }, { n: "Pixel", r: "Content" }] }].map(dept => (
          <div key={dept.d} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ background: dept.c + "15", borderRadius: 14, padding: "10px 20px", textAlign: "center", border: `1px solid ${dept.c}25`, width: "100%" }}><div style={{ fontSize: 13, fontWeight: 800, color: dept.c }}>{dept.d}</div></div><Line />
            <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>{dept.a.map(a => <Node key={a.n} name={a.n} role={a.r} color={dept.c} />)}</div>
          </div>))}
      </div>
    </div>
  </div>);
}

// ─── SETTINGS ───
function SettingsPage({ s, accent, settings, setSettings, kanban, crons, agents, setKanban, setCrons, setAgents, services }) {
  // Normalize kanbanColumns: legacy array -> object map
  useEffect(() => {
    const kc = settings?.kanbanColumns;
    if (Array.isArray(kc)) {
      const keys = ["backlog","todo","inProgress","inReview","done"];
      const obj = {};
      keys.forEach((k, i) => { obj[k] = { label: kc[i] || k, enabled: true }; });
      setSettings({ ...settings, kanbanColumns: obj });
    }
  }, []);

  const [backupStatus, setBackupStatus] = useState(null); const [updateStatus, setUpdateStatus] = useState(null); const [saveStatus, setSaveStatus] = useState(null);
  const [backups, setBackups] = useState([{ id: "b1", date: "2026-02-26 08:00", size: "24 KB", label: "Auto-backup" }, { id: "b2", date: "2026-02-25 16:00", size: "22 KB", label: "Pre-update backup" }, { id: "b3", date: "2026-02-24 08:00", size: "19 KB", label: "Auto-backup" }]);

  const saveSettings = async () => {
    setSaveStatus("saving");
    await api('/settings', { method: 'POST', body: settings });
    setSaveStatus("saved"); setTimeout(() => setSaveStatus(null), 2000);
  };

  const createBackup = async () => {
    try {
      const backup = await api("/backup", { method: "POST", body: {} });
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = backup?.timestamp ? `salty-os-backup-${backup.timestamp.replace(/[:.]/g, "-")}.json` : `salty-os-backup-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      const list = await api("/backups");
      if (Array.isArray(list)) {
        setBackups(list.map((b, i) => ({ id: b.filename || ("b"+i), date: new Date(b.created).toLocaleString(), size: (b.size/1024).toFixed(1)+" KB", label: b.filename || "Backup" })));
      }
      setBackupStatus("success");
    } catch {
      setBackupStatus("error");
    }
    setTimeout(() => setBackupStatus(null), 3000);
  };

  const handleRestore = () => {
    const input = document.createElement("input"); input.type = "file"; input.accept = ".json";
    input.onchange = (e) => {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const payload = JSON.parse(ev.target.result);
          // backend expects: { data: {...tables...} } from its own backup format
          const data = payload?.data ? payload.data : payload;
          const r = await api("/restore", { method: "POST", body: { data } });
          if (r?.restored) {
            // reload state from API
            const [dbAgents, dbCrons, dbKanban, dbSettings] = await Promise.all([ api("/agents"), api("/crons"), api("/kanban"), api("/settings") ]);
            if (dbAgents) setAgents(dbAgents);
            if (dbCrons) setCrons(dbCrons);
            if (dbKanban) { const b = dbKanban.board || dbKanban; setKanban({ backlog: b.backlog || [], todo: b.todo || [], inProgress: b.inProgress || [], inReview: b.inReview || [], done: b.done || [] }); }
            if (dbSettings?.companyName) setSettings(dbSettings);
            setBackupStatus("restored");
          } else {
            setBackupStatus("error");
          }
        } catch {
          setBackupStatus("error");
        }
        setTimeout(() => setBackupStatus(null), 3000);
      };
      reader.readAsText(file);
    };
    input.click();
  };

  return (<div><div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}><h1 style={{ fontSize: 28, fontWeight: 800, color: s.text, margin: 0, fontFamily: "'Space Grotesk', sans-serif" }}>Settings</h1><Btn s={s} accent={accent} onClick={saveSettings}>{saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "✓ Saved" : "Save Settings"}</Btn></div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 20 }}>
      <Card color={ACCENT.cyan} style={{ background: s.bgCard, border: `1px solid ${s.border}`, boxShadow: s.shadow }} hoverable={false}><div style={{ padding: "24px 24px 24px 26px" }}><div style={{ fontSize: 17, fontWeight: 700, color: s.text, marginBottom: 20 }}>Company</div><Inp label="Company Name" value={settings.companyName} onChange={e => setSettings({ ...settings, companyName: e.target.value })} s={s} /><Inp label="Company Title" value={settings.companyTitle} onChange={e => setSettings({ ...settings, companyTitle: e.target.value })} s={s} /><Inp label="Logo URL" value={settings.logoUrl} onChange={e => setSettings({ ...settings, logoUrl: e.target.value })} s={s} placeholder="https://..." /></div></Card>
        <Card color={ACCENT.purple} style={{ background: s.bgCard, border: `1px solid ${s.border}`, boxShadow: s.shadow }} hoverable={false}><div style={{ padding: "24px 24px 24px 26px" }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: s.text, marginBottom: 20 }}>Kanban Columns</div>
          {["backlog","todo","inProgress","inReview","done"].map((k) => {
            const col = (settings.kanbanColumns && typeof settings.kanbanColumns === "object") ? settings.kanbanColumns[k] : null;
            const label = col?.label || (k === "todo" ? "To-Do" : k === "inProgress" ? "In Progress" : k === "inReview" ? "In Review" : k[0].toUpperCase() + k.slice(1));
            const enabled = col?.enabled !== false;
            return (
              <div key={k} style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
                <button onClick={() => {
                  const next = { ...(settings.kanbanColumns || {}) };
                  next[k] = { label, enabled: !enabled };
                  setSettings({ ...settings, kanbanColumns: next });
                }} style={{ width: 44, padding: "8px 10px", borderRadius: 12, border: `1px solid ${enabled ? accent + "40" : s.border}`, background: enabled ? accent + "15" : s.bgInput, color: enabled ? accent : s.textMuted, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                  {enabled ? "ON" : "OFF"}
                </button>
                <input value={label} disabled={!enabled} onChange={e => {
                  const next = { ...(settings.kanbanColumns || {}) };
                  next[k] = { label: e.target.value, enabled };
                  setSettings({ ...settings, kanbanColumns: next });
                }} style={{ flex: 1, padding: "10px 14px", background: enabled ? s.bgInput : (s.bgInput + "80"), border: `1px solid ${s.border}`, borderRadius: 12, color: enabled ? s.text : s.textDim, fontSize: 14, outline: "none" }} />
              </div>
            );
          })}
          <div style={{ fontSize: 12, color: s.textMuted, marginTop: 10, lineHeight: 1.5 }}>Turn columns on/off and rename labels. Hidden columns keep their tasks in the database.</div>
        </div></Card>

      <Card color={ACCENT.amber} style={{ background: s.bgCard, border: `1px solid ${s.border}`, boxShadow: s.shadow }} hoverable={false}><div style={{ padding: "24px 24px 24px 26px" }}><div style={{ fontSize: 17, fontWeight: 700, color: s.text, marginBottom: 20 }}>Appearance</div><Inp label="Accent Color" value={settings.accentColor} onChange={e => setSettings({ ...settings, accentColor: e.target.value })} s={s} /><div style={{ display: "flex", gap: 8, marginTop: 8 }}>{["#00E5FF", "#FFB300", "#B388FF", "#00E676", "#FF5252", "#FF80AB"].map(c => (<div key={c} onClick={() => setSettings({ ...settings, accentColor: c })} style={{ width: 36, height: 36, borderRadius: 10, background: c, cursor: "pointer", border: settings.accentColor === c ? `3px solid ${s.text}` : "3px solid transparent", transition: "all 0.2s" }} />))}</div></div></Card>
      <Card color={ACCENT.green} style={{ background: s.bgCard, border: `1px solid ${s.border}`, boxShadow: s.shadow }} hoverable={false}><div style={{ padding: "24px 24px 24px 26px" }}><div style={{ fontSize: 17, fontWeight: 700, color: s.text, marginBottom: 20 }}>API Connections</div><Inp label="Agent Zero URL" value={settings.agentZeroUrl} onChange={e => setSettings({ ...settings, agentZeroUrl: e.target.value })} s={s} placeholder="http://agent-zero:5000" /><Inp label="n8n URL" value={settings.n8nUrl} onChange={e => setSettings({ ...settings, n8nUrl: e.target.value })} s={s} placeholder="http://n8n:5678" /><Inp label="Postiz URL" value={settings.postizUrl} onChange={e => setSettings({ ...settings, postizUrl: e.target.value })} s={s} placeholder="http://postiz:5000" /><Inp label="Firecrawl URL" value={settings.firecrawlUrl || ""} onChange={e => setSettings({ ...settings, firecrawlUrl: e.target.value })} s={s} placeholder="http://firecrawl:3002" /><Inp label="Gotenberg URL" value={settings.gotenbergUrl || ""} onChange={e => setSettings({ ...settings, gotenbergUrl: e.target.value })} s={s} placeholder="http://gotenberg:3000" /></div></Card>

      {/* Backup & Restore */}
      <Card color={ACCENT.cyan} style={{ background: s.bgCard, border: `1px solid ${s.border}`, boxShadow: s.shadow }} hoverable={false}><div style={{ padding: "24px 24px 24px 26px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}><span style={{ color: ACCENT.cyan }}>{I.backup}</span><div style={{ fontSize: 17, fontWeight: 700, color: s.text }}>Backup & Restore</div></div>
        {backupStatus === "success" && <div style={{ padding: "10px 16px", background: ACCENT.green + "15", border: `1px solid ${ACCENT.green}30`, borderRadius: 12, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}><span style={{ color: ACCENT.green }}>{I.check}</span><span style={{ color: ACCENT.green, fontSize: 13, fontWeight: 600 }}>Backup created and downloaded!</span></div>}
        {backupStatus === "restored" && <div style={{ padding: "10px 16px", background: accent + "15", border: `1px solid ${ACCENT.cyan}30`, borderRadius: 12, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}><span style={{ color: ACCENT.cyan }}>{I.check}</span><span style={{ color: ACCENT.cyan, fontSize: 13, fontWeight: 600 }}>Data restored successfully!</span></div>}
        {backupStatus === "error" && <div style={{ padding: "10px 16px", background: ACCENT.red + "15", border: `1px solid ${ACCENT.red}30`, borderRadius: 12, marginBottom: 16 }}><span style={{ color: ACCENT.red, fontSize: 13, fontWeight: 600 }}>Invalid backup file.</span></div>}
        <div style={{ fontSize: 13, color: s.textMuted, marginBottom: 16, lineHeight: 1.5 }}>Export all dashboard data (tasks, agents, crons, settings) as JSON. Restore from any previous backup without losing data.</div>
        <div style={{ display: "flex", gap: 12, marginBottom: 20 }}><Btn s={s} accent={accent} onClick={createBackup}>{I.download} Create Backup</Btn><Btn s={s} accent={accent} variant="ghost" onClick={handleRestore}>{I.upload} Restore Backup</Btn></div>
        <div style={{ fontSize: 13, fontWeight: 600, color: s.textMuted, marginBottom: 10 }}>Recent Backups</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{backups.map(b => (<div key={b.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: s.bgInput, borderRadius: 12, fontSize: 13 }}><span style={{ color: ACCENT.cyan }}>{I.backup}</span><span style={{ color: s.text, flex: 1 }}>{b.label}</span><span style={{ color: s.textMuted, fontFamily: "'JetBrains Mono'", fontSize: 11 }}>{b.date}</span><span style={{ color: s.textDim, fontSize: 11 }}>{b.size}</span></div>))}</div>
      </div></Card>

      {/* GitHub Updates */}
      <Card color={ACCENT.purple} style={{ background: s.bgCard, border: `1px solid ${s.border}`, boxShadow: s.shadow }} hoverable={false}><div style={{ padding: "24px 24px 24px 26px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}><span style={{ color: s.text }}>{I.github}</span><div style={{ fontSize: 17, fontWeight: 700, color: s.text }}>Updates</div></div>
        <Inp label="GitHub Repository" hint="Pull UI/UX, code, and feature updates from your repo" value={settings.githubRepo || "bke-logistics/salty-os"} onChange={e => setSettings({ ...settings, githubRepo: e.target.value })} s={s} placeholder="owner/repo" mono />
        <Inp label="Branch" value={settings.githubBranch || "main"} onChange={e => setSettings({ ...settings, githubBranch: e.target.value })} s={s} placeholder="main" mono />
        <div style={{ fontSize: 13, color: s.textMuted, marginBottom: 16, lineHeight: 1.5, padding: "12px 16px", background: s.bgInput, borderRadius: 12 }}><strong style={{ color: ACCENT.cyan }}>Safe updates:</strong> Pulling updates only replaces UI/code files. Your data (tasks, agents, crons, deliverables) is stored separately in the database/volume and will not be affected.</div>
        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          <Btn s={s} accent={accent} variant="ghost" onClick={() => { setUpdateStatus("checking"); setTimeout(() => setUpdateStatus("available"), 2000); }}>{I.refresh} {updateStatus === "checking" ? "Checking..." : "Check for Updates"}</Btn>
          {updateStatus === "available" && <Btn s={s}>{I.download} Pull Update</Btn>}
        </div>
        {updateStatus === "available" && (<div style={{ padding: "14px 16px", background: ACCENT.green + "10", border: `1px solid ${ACCENT.green}25`, borderRadius: 14, marginBottom: 12 }}><div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}><span style={{ color: ACCENT.green }}>{I.check}</span><span style={{ color: ACCENT.green, fontSize: 14, fontWeight: 700 }}>Update Available</span></div><div style={{ fontSize: 12, color: s.textMuted, lineHeight: 1.5 }}>v2.1.0 — Enhanced drag-and-drop, real-time Agent Zero WebSocket, improved mobile layout.</div></div>)}
        <div style={{ fontSize: 12, color: s.textDim, lineHeight: 1.5 }}><strong>Update process:</strong> Auto-backup → git pull → rebuild container → restart. Zero data loss.</div>
      </div></Card>
    </div>
  </div>);
}

// ═════════════════════════════════════════
// MAIN APP
// ═════════════════════════════════════════
export default function SaltyOS() {
  const [dark, setDark] = useState(true); const [page, setPage] = useState(() => { try { return localStorage.getItem("salty.page") || "dashboard"; } catch { return "dashboard"; } }); const [sidebarOpen, setSidebarOpen] = useState(true); const [time, setTime] = useState(new Date());
  const [kanban, setKanban] = useState({ backlog: [], todo: [], inProgress: [], inReview: [], done: [] }); const [agents, setAgents] = useState([]); const [crons, setCrons] = useState([]);
  const [settings, setSettings] = useState({ companyName: "BKE Logistics", companyTitle: "Freight Brokerage Operations Hub", logoUrl: "", accentColor: ACCENT.cyan, kanbanColumns: ["Backlog", "To-Do", "In Progress", "In Review", "Done"], agentZeroUrl: "http://agent-zero:5000", n8nUrl: "http://n8n:5678", postizUrl: "http://postiz:5000", firecrawlUrl: "http://firecrawl:3002", gotenbergUrl: "http://gotenberg:3000", githubRepo: "bke-logistics/salty-os", githubBranch: "main" });
  const [services, setServices] = useState({}); const [a0Agents, setA0Agents] = useState([]); const [a0Status, setA0Status] = useState(null); const [loaded, setLoaded] = useState(false);
  const [versionInfo, setVersionInfo] = useState(null);

  const s = makeS(dark);
  useEffect(() => { try { localStorage.setItem("salty.page", page); } catch {} }, [page]);
  const accent = (settings && settings.accentColor) ? settings.accentColor : ACCENT.cyan;

  // ─── Load data from API on mount ───
  useEffect(() => {
    const load = async () => {
      const [dbAgents, dbCrons, dbKanban, dbSettings, svc, a0Ag, a0Health, vInfo] = await Promise.all([
        api('/agents'), api('/crons'), api('/kanban'), api('/settings'),
        api('/services'), a0('agents', { action: 'list' }), a0('health'), api('/version'),
      ]);
        if (dbAgents) setAgents(dbAgents);
        if (dbCrons) setCrons(dbCrons);
      if (dbKanban) { const b = dbKanban.board || dbKanban; setKanban({ backlog: b.backlog || [], todo: b.todo || [], inProgress: b.inProgress || [], inReview: b.inReview || [], done: b.done || [] }); }
      if (dbSettings?.companyName) setSettings(dbSettings);
      if (svc) setServices(svc);
      if (a0Ag?.ok) setA0Agents(a0Ag.data);
      if (a0Health) setA0Status(a0Health);
      if (vInfo) setVersionInfo(vInfo);

      setLoaded(true);
    };
    load();
    const t = setInterval(() => setTime(new Date()), 1000);
    // Refresh services every 30s
    const svcTimer = setInterval(async () => {
      const svc = await api('/services');
      if (svc) setServices(svc);
    }, 30000);
    return () => { clearInterval(t); clearInterval(svcTimer); };
  }, []);
  const nav = [{ key: "dashboard", label: "Dashboard", icon: I.dashboard }, { key: "kanban", label: "Kanban", icon: I.kanban }, { key: "agents", label: "Agents", icon: I.agents }, { key: "scheduler", label: "Scheduler", icon: I.scheduler }, { key: "deliverables", label: "Deliverables", icon: I.deliverables }, { key: "logs", label: "Activity Logs", icon: I.logs }, { key: "org", label: "Org Chart", icon: I.org }, { key: "settings", label: "Settings", icon: I.settings }];
  const renderPage = () => { switch (page) { case "dashboard": return <DashboardPage s={s} accent={accent} kanban={kanban} crons={crons} agents={agents} services={services} a0Status={a0Status} setPage={setPage} />; case "kanban": return <KanbanPage s={s} accent={accent} settings={settings} kanban={kanban} setKanban={setKanban} agents={agents} />; case "agents": return <AgentsPage s={s} accent={accent} agents={agents} setAgents={setAgents} a0Agents={a0Agents} />; case "scheduler": return <SchedulerPage s={s} accent={accent} crons={crons} setCrons={setCrons} agents={agents} />; case "deliverables": return <DeliverablesPage s={s} accent={accent} />; case "logs": return <LogsPage s={s} accent={accent} />; case "org": return <OrgChartPage s={s} />; case "settings": return <SettingsPage s={s} accent={accent} settings={settings} setSettings={setSettings} kanban={kanban} crons={crons} agents={agents} setKanban={setKanban} setCrons={setCrons} setAgents={setAgents} services={services} />; default: return <DashboardPage s={s} accent={accent} kanban={kanban} crons={crons} agents={agents} services={services} a0Status={a0Status} setPage={setPage} />; } };

  return (<div style={{ display: "flex", height: "100vh", fontFamily: "'DM Sans', sans-serif", background: s.bg, color: s.text, overflow: "hidden", transition: "all 0.4s ease" }}>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Space+Grotesk:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
    <style>{`@keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes slideUp{from{opacity:0;transform:translateY(20px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}@keyframes pulse{0%,100%{opacity:.3;transform:scale(1)}50%{opacity:0;transform:scale(2)}}*{box-sizing:border-box}::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:${s.border};border-radius:3px}::selection{background:${accent}30}`}</style>
    <aside style={{ width: sidebarOpen ? 240 : 72, background: s.bgSidebar, borderRight: `1px solid ${s.border}`, display: "flex", flexDirection: "column", transition: "width 0.4s cubic-bezier(0.16, 1, 0.3, 1)", overflow: "hidden", flexShrink: 0, zIndex: 10 }}>
      <div style={{ padding: sidebarOpen ? "24px 20px" : "24px 16px", borderBottom: `1px solid ${s.border}`, display: "flex", alignItems: "center", gap: 12, minHeight: 80 }}>
        <div style={{ width: 40, height: 40, borderRadius: 14, background: `linear-gradient(135deg, ${ACCENT.cyan}, ${ACCENT.cyanDark})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 900, color: "#0a0e17", fontFamily: "'Space Grotesk'", flexShrink: 0, boxShadow: `0 4px 16px ${ACCENT.cyanGlow}` }}>S</div>
        {sidebarOpen && <div><div style={{ fontSize: 17, fontWeight: 800, color: s.text, fontFamily: "'Space Grotesk'", letterSpacing: -0.5 }}>Salty OS</div><div style={{ fontSize: 10, color: s.textMuted, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>Source of Truth</div></div>}
      </div>
      <nav style={{ flex: 1, padding: "12px 8px", display: "flex", flexDirection: "column", gap: 2 }}>{nav.map(item => { const active = page === item.key; return (<button key={item.key} onClick={() => setPage(item.key)} style={{ display: "flex", alignItems: "center", gap: 14, padding: sidebarOpen ? "11px 16px" : "11px 0", borderRadius: 14, border: "none", cursor: "pointer", width: "100%", background: active ? accent + "12" : "transparent", color: active ? accent : s.textMuted, fontSize: 14, fontWeight: active ? 700 : 500, fontFamily: "'DM Sans'", transition: "all 0.25s", justifyContent: sidebarOpen ? "flex-start" : "center", position: "relative" }}>{active && <div style={{ position: "absolute", left: 0, top: "20%", bottom: "20%", width: 3, borderRadius: 2, background: accent }} />}{item.icon}{sidebarOpen && <span>{item.label}</span>}</button>); })}</nav>
      <div style={{ padding: sidebarOpen ? "16px 20px" : "16px", borderTop: `1px solid ${s.border}` }}><div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: sidebarOpen ? "flex-start" : "center" }}><div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: sidebarOpen ? "flex-start" : "center" }}><StatusDot status="active" />{sidebarOpen && <span style={{ fontSize: 12, fontWeight: 600, color: ACCENT.green }}>Agent Zero Online</span>}</div>{sidebarOpen && <div style={{ fontSize: 11, fontWeight: 600, color: s.textMuted }}>Salty OS {versionInfo?.version ? `v${versionInfo.version}` : ""}</div>}</div></div>
    </aside>
    <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <header style={{ padding: "16px 28px", borderBottom: `1px solid ${s.border}`, display: "flex", alignItems: "center", gap: 16, background: s.bgSidebar, flexShrink: 0 }}>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ background: "none", border: "none", color: s.textMuted, cursor: "pointer", padding: 4 }}>{I.menu}</button><div style={{ flex: 1 }} />
        <div style={{ textAlign: "right" }}><div style={{ fontSize: 18, fontWeight: 700, color: s.text, fontFamily: "'Space Grotesk'", letterSpacing: -0.5, fontVariantNumeric: "tabular-nums" }}>{time.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</div><div style={{ fontSize: 11, color: s.textMuted, fontWeight: 500 }}>{time.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" })}</div></div>
        <button onClick={() => setDark(!dark)} style={{ width: 40, height: 40, borderRadius: 14, background: s.bgInput, border: `1px solid ${s.border}`, color: dark ? ACCENT.amber : ACCENT.cyan, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.3s" }}>{dark ? I.sun : I.moon}</button>
      </header>
      <div style={{ flex: 1, overflow: "auto", padding: 28 }} key={page}><div style={{ animation: "slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)" }}>{renderPage()}</div></div>
    </main>
  </div>);
}
