import { NextResponse } from "next/server";
import { getPersona } from "../../../src/sillage";

// Pull the workspace persona from Sillage and shape it into an ICP string for onboarding prefill.
// Answers "if we already have personas from Sillage, don't make the user retype them."
export const runtime = "nodejs";

export async function GET() {
  if (!process.env.SILLAGE_API_KEY) return NextResponse.json({ error: "Sillage not connected" }, { status: 400 });
  try {
    const p = await getPersona();
    const d = p?.data ?? p ?? {};
    const arr = (v: any) => (Array.isArray(v) ? v : v ? [v] : []);
    const parts: string[] = [];
    if (arr(d.job_title).length) parts.push(`Titles: ${arr(d.job_title).join(", ")}`);
    if (arr(d.seniority).length) parts.push(`Seniority: ${arr(d.seniority).join(", ")}`);
    if (arr(d.industry).length) parts.push(`Industries: ${arr(d.industry).join(", ")}`);
    if (arr(d.headcount).length) parts.push(`Headcount: ${arr(d.headcount).map((h: any) => (typeof h === "object" ? `${h.min}-${h.max}` : h)).join(", ")}`);
    if (arr(d.location).length) parts.push(`Locations: ${arr(d.location).join(", ")}`);
    if (arr(d.exclude_job_title).length) parts.push(`Exclude: ${arr(d.exclude_job_title).join(", ")}`);
    if (d.additional_info) parts.push(d.additional_info);
    return NextResponse.json({ icp: parts.join(" · "), raw: d });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
