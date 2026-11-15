import {
  BookOpen, Brain, Scale, Package, Ship, Factory,
  GitBranch, UserCheck, Receipt, Users, Shield, Lock,
} from 'lucide-react';

export const KNOWLEDGE_SECTIONS = [
  {
    id: 'about',
    title: 'About TaxFlow',
    description: 'What TaxFlow is, why it was developed, and its main objectives',
    icon: BookOpen,
    color: 'blue',
  },
  {
    id: 'ai-monitoring',
    title: 'AI-Powered Monitoring',
    description: 'How AI analyzes data, detects anomalies, and generates risk alerts',
    icon: Brain,
    color: 'violet',
  },
  {
    id: 'compliance',
    title: 'Tax Compliance Rule (95%)',
    description: 'The proposed 95% tax compliance threshold and how it is calculated',
    icon: Scale,
    color: 'amber',
  },
  {
    id: 'stock-movement',
    title: 'Stock Movement Rule',
    description: 'The configurable stock sell-through threshold and purchasing eligibility',
    icon: Package,
    color: 'emerald',
  },
  {
    id: 'imports',
    title: 'Import Declaration & Customs',
    description: 'The complete import process from declaration to Customs verification',
    icon: Ship,
    color: 'orange',
  },
  {
    id: 'manufacturing',
    title: 'Manufacturing & Production',
    description: 'How TaxFlow monitors raw materials, production, and finished goods',
    icon: Factory,
    color: 'rose',
  },
  {
    id: 'supply-chain',
    title: 'Supply Chain & Inventory',
    description: 'Tracking goods from manufacturer through wholesaler to retailer',
    icon: GitBranch,
    color: 'teal',
  },
  {
    id: 'tin-verification',
    title: 'TIN Verification',
    description: 'Trader registration, TIN verification, and account management',
    icon: UserCheck,
    color: 'sky',
  },
  {
    id: 'tax-ebm',
    title: 'Tax Compliance & EBM',
    description: 'Purchase reconciliation, EBM integration, and tax assessments',
    icon: Receipt,
    color: 'indigo',
  },
  {
    id: 'roles',
    title: 'Administrative Roles',
    description: 'Responsibilities of each administrator type within TaxFlow',
    icon: Users,
    color: 'pink',
  },
  {
    id: 'account-management',
    title: 'Account Management',
    description: 'Trader account approval, suspension, restoration, and history',
    icon: Shield,
    color: 'cyan',
  },
  {
    id: 'security',
    title: 'Security & Audit Trail',
    description: 'RBAC, data protection, audit logs, and accountability',
    icon: Lock,
    color: 'gray',
  },
] as const;

export type KnowledgeSectionId = (typeof KNOWLEDGE_SECTIONS)[number]['id'];

export const SECTION_COLOR_MAP: Record<string, { bg: string; icon: string; border: string; badge: string }> = {
  blue:    { bg: 'bg-blue-50 dark:bg-blue-950/20',    icon: 'bg-blue-600 text-white',    border: 'border-blue-100 dark:border-blue-900',    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  violet:  { bg: 'bg-violet-50 dark:bg-violet-950/20', icon: 'bg-violet-600 text-white',  border: 'border-violet-100 dark:border-violet-900', badge: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300' },
  amber:   { bg: 'bg-amber-50 dark:bg-amber-950/20',   icon: 'bg-amber-500 text-white',   border: 'border-amber-100 dark:border-amber-900',   badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  emerald: { bg: 'bg-emerald-50 dark:bg-emerald-950/20', icon: 'bg-emerald-600 text-white', border: 'border-emerald-100 dark:border-emerald-900', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  orange:  { bg: 'bg-orange-50 dark:bg-orange-950/20', icon: 'bg-orange-500 text-white',  border: 'border-orange-100 dark:border-orange-900', badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' },
  rose:    { bg: 'bg-rose-50 dark:bg-rose-950/20',    icon: 'bg-rose-600 text-white',    border: 'border-rose-100 dark:border-rose-900',    badge: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' },
  teal:    { bg: 'bg-teal-50 dark:bg-teal-950/20',    icon: 'bg-teal-600 text-white',    border: 'border-teal-100 dark:border-teal-900',    badge: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300' },
  sky:     { bg: 'bg-sky-50 dark:bg-sky-950/20',      icon: 'bg-sky-600 text-white',     border: 'border-sky-100 dark:border-sky-900',      badge: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300' },
  indigo:  { bg: 'bg-indigo-50 dark:bg-indigo-950/20', icon: 'bg-indigo-600 text-white',  border: 'border-indigo-100 dark:border-indigo-900', badge: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' },
  pink:    { bg: 'bg-pink-50 dark:bg-pink-950/20',    icon: 'bg-pink-600 text-white',    border: 'border-pink-100 dark:border-pink-900',    badge: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300' },
  cyan:    { bg: 'bg-cyan-50 dark:bg-cyan-950/20',    icon: 'bg-cyan-600 text-white',    border: 'border-cyan-100 dark:border-cyan-900',    badge: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300' },
  gray:    { bg: 'bg-gray-50 dark:bg-gray-900/40',    icon: 'bg-gray-700 text-white',    border: 'border-gray-200 dark:border-gray-800',    badge: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
};
