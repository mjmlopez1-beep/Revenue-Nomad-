import type { OperatorRole } from "./types";

/**
 * Role catalog — mirrors the Revenue Nomad DB_Roles sheet: 28 roles under
 * 8 categories. Operators pick a specific role; the category derives from it
 * and drives signal weighting, while the slug refines detection (e.g. a
 * Content Director weights content-gap higher than a CMO).
 */
export interface RoleDef {
  slug: string;
  label: string;
}

export const ROLE_CATALOG: { category: OperatorRole; roles: RoleDef[] }[] = [
  {
    category: "Sales Leadership",
    roles: [
      { slug: "cro", label: "Chief Revenue Officer" },
      { slug: "vp_sales", label: "VP of Sales" },
      { slug: "sales_manager", label: "Sales Manager" },
    ],
  },
  {
    category: "Marketing",
    roles: [
      { slug: "cmo", label: "Chief Marketing Officer" },
      { slug: "vp_marketing", label: "VP of Marketing" },
      { slug: "product_marketing", label: "Product Marketing Manager" },
      { slug: "content_director", label: "Content Director" },
    ],
  },
  {
    category: "Revenue Operations",
    roles: [
      { slug: "vp_revops", label: "VP of Revenue Operations" },
      { slug: "revops_manager", label: "RevOps Manager" },
      { slug: "marketing_ops", label: "Marketing Operations" },
      { slug: "cs_ops", label: "CS Operations" },
      { slug: "sales_ops", label: "Sales Operations" },
      { slug: "data_analytics", label: "Data & Analytics" },
    ],
  },
  {
    category: "Sales Enablement",
    roles: [
      { slug: "vp_enablement", label: "VP of Sales Enablement" },
      { slug: "dir_enablement", label: "Director of Enablement" },
      { slug: "enablement_mgr", label: "Enablement Manager" },
      { slug: "sales_trainer", label: "Sales Trainer" },
    ],
  },
  {
    category: "Customer Success",
    roles: [
      { slug: "cco", label: "Chief Customer Officer" },
      { slug: "vp_cs", label: "VP of Customer Success" },
      { slug: "vp_growth", label: "VP of Growth" },
      { slug: "dir_cs_growth", label: "Director of CS/Growth" },
    ],
  },
  {
    category: "AI GTM",
    roles: [
      { slug: "vp_ai_gtm", label: "VP AI GTM Strategy" },
      { slug: "gtm_ai_architect", label: "GTM AI Architect" },
      { slug: "ai_gtm_engineer", label: "AI GTM Engineer" },
    ],
  },
  {
    category: "Partnerships",
    roles: [
      { slug: "vp_partnerships", label: "VP of Partnerships" },
      { slug: "partner_director", label: "Partnership Director" },
      { slug: "partner_manager", label: "Partner Manager" },
    ],
  },
  {
    category: "Sellers",
    roles: [{ slug: "ae", label: "Account Executive" }],
  },
];

export function categoryForSlug(slug: string): OperatorRole | null {
  for (const group of ROLE_CATALOG) {
    if (group.roles.some((r) => r.slug === slug)) return group.category;
  }
  return null;
}

export function labelForSlug(slug: string): string | null {
  for (const group of ROLE_CATALOG) {
    const r = group.roles.find((x) => x.slug === slug);
    if (r) return r.label;
  }
  return null;
}
